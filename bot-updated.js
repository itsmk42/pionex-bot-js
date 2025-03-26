// Pionex AI Trading Bot with GUI Support
const axios = require('axios');
const crypto = require('crypto');

class PionexTradingBot {
    constructor(config) {
        // API credentials
        this.apiKey = config.apiKey;
        this.secretKey = config.secretKey;
        
        // Working API endpoint discovered by diagnostic script
        this.baseUrl = 'https://api.pionex.com/api/v1';
        
        // Trading configuration
        this.tradingPairs = config.tradingPairs || ['BTC_USDT']; // Using underscore format
        this.maxAmount = config.maxAmount || 1000; // Default max USDT to use
        this.riskPerTrade = config.riskPerTrade || 0.05; // 5% risk per trade
        this.takeProfitPercent = config.takeProfitPercent || 0.05; // 5% take profit
        this.stopLossPercent = config.stopLossPercent || 0.02; // 2% stop loss
        this.leverage = config.leverage || 10; // Default leverage for futures
        
        // AI parameters for aggressive trading
        this.shortTermEMA = 9;  // Short EMA period
        this.mediumTermEMA = 21; // Medium EMA period
        this.rsiPeriod = 14;     // RSI period
        this.rsiOverbought = 70; // RSI overbought threshold
        this.rsiOversold = 30;   // RSI oversold threshold
        this.bollingerPeriod = 20; // Bollinger Bands period
        this.bollingerStdDev = 2;  // Standard deviations for Bollinger Bands
        
        // Bot state
        this.marketData = {};
        this.activeTrades = {};
        this.tradeHistory = [];
        this.logs = [];
        this.isRunning = false;
        this.tradingInterval = null;
        
        // Socket.io instance for real-time updates
        this.io = config.io;
    }
    
    // Log with timestamp
    log(message, isError = false) {
        const timestamp = new Date().toISOString();
        const fullMessage = `${timestamp} - ${message}`;
        const logEntry = {
            timestamp,
            message,
            type: isError ? 'error' : 'info'
        };
        
        // Store in log history
        this.logs.push(logEntry);
        
        // Keep logs limited to prevent memory issues
        if (this.logs.length > 1000) {
            this.logs.shift();
        }
        
        // Send to console
        if (isError) {
            console.error(fullMessage);
        } else {
            console.log(fullMessage);
        }
        
        // Send to connected clients via socket.io
        if (this.io) {
            this.io.emit('log', logEntry);
        }
    }
    
    // Generate signature for API authentication
    generateSignature(timestamp, method, requestPath, queryString = '', requestBody = '') {
        const message = timestamp + method + requestPath + queryString + requestBody;
        return crypto.createHmac('sha256', this.secretKey).update(message).digest('hex');
    }
    
    // Make API request to Pionex
    async makeRequest(method, endpoint, params = {}, data = {}) {
        const timestamp = Date.now().toString();
        const queryString = new URLSearchParams(params).toString();
        const requestPath = endpoint;
        const url = `${this.baseUrl}${requestPath}${queryString ? '?' + queryString : ''}`;
        
        this.log(`Making ${method} request to: ${url}`);
        
        const signature = this.generateSignature(
            timestamp, 
            method.toUpperCase(), 
            requestPath, 
            queryString, 
            method.toUpperCase() === 'POST' ? JSON.stringify(data) : ''
        );
        
        try {
            const response = await axios({
                method: method,
                url: url,
                headers: {
                    'API-KEY': this.apiKey,
                    'API-TIMESTAMP': timestamp,
                    'API-SIGNATURE': signature,
                    'Content-Type': 'application/json'
                },
                data: method.toUpperCase() === 'POST' ? data : undefined
            });
            
            return response.data;
        } catch (error) {
            this.log(`API Request Error: ${error.message}`, true);
            if (error.response) {
                this.log(`Response: ${JSON.stringify(error.response.data)}`, true);
            }
            throw error;
        }
    }
    
    // Initialize the bot
    async initialize() {
        this.log('Initializing PionexTradingBot...');
        
        // Test connection to the API
        try {
            const tickers = await this.makeRequest('GET', '/market/tickers');
            this.log(`Successfully connected to Pionex API. Found ${tickers.data?.tickers?.length || 0} tickers.`);
            
            // Convert trading pairs to the correct format (using underscore)
            this.tradingPairs = this.tradingPairs.map(pair => {
                if (pair.includes('/')) {
                    return pair.replace('/', '_');
                }
                return pair;
            });
            
            // Get account balance if maxAmount is not set
            if (this.maxAmount === null || this.maxAmount === undefined) {
                try {
                    // Try to find the account assets endpoint
                    const accountEndpoints = ['/account/assets', '/account/balance', '/user/assets'];
                    let accountInfo = null;
                    
                    for (const endpoint of accountEndpoints) {
                        try {
                            this.log(`Trying account endpoint: ${endpoint}`);
                            accountInfo = await this.makeRequest('GET', endpoint);
                            
                            if (accountInfo && (accountInfo.result === true || accountInfo.data)) {
                                this.log(`Found working account endpoint: ${endpoint}`);
                                break;
                            }
                        } catch (error) {
                            this.log(`Endpoint ${endpoint} failed: ${error.message}`, true);
                        }
                    }
                    
                    if (accountInfo) {
                        this.log(`Account info: ${JSON.stringify(accountInfo).slice(0, 200)}...`);
                        
                        // Parse the account info based on its structure
                        let usdtBalance = null;
                        
                        if (accountInfo.data?.assets) {
                            usdtBalance = accountInfo.data.assets.find(asset => asset.currency === 'USDT');
                        } else if (accountInfo.data?.balances) {
                            usdtBalance = accountInfo.data.balances.find(asset => asset.asset === 'USDT');
                        } else if (Array.isArray(accountInfo.data)) {
                            usdtBalance = accountInfo.data.find(asset => 
                                asset.asset === 'USDT' || asset.currency === 'USDT');
                        }
                        
                        if (usdtBalance) {
                            // Extract balance, handling different property names
                            const freeBalance = parseFloat(
                                usdtBalance.free || 
                                usdtBalance.available || 
                                usdtBalance.balance || 
                                0
                            );
                            
                            this.maxAmount = freeBalance * 0.5; // 50% of wallet
                            this.log(`Setting maxAmount to 50% of wallet: ${this.maxAmount} USDT`);
                        } else {
                            this.log('Could not find USDT balance, defaulting to 1000 USDT', true);
                            this.maxAmount = 1000;
                        }
                    }
                } catch (error) {
                    this.log(`Failed to get account balance: ${error.message}`, true);
                    this.log('Defaulting to 1000 USDT max amount', true);
                    this.maxAmount = 1000;
                }
            }
        } catch (error) {
            this.log(`API connection test failed: ${error.message}`, true);
            throw new Error('Failed to connect to Pionex API. Please check your API credentials and network connection.');
        }
        
        this.log('PionexTradingBot initialized with maxAmount: ' + this.maxAmount);
        this.log(`Trading pairs: ${this.tradingPairs.join(', ')}`);
    }
    
    // Get market data for a specific pair
    async getMarketData(symbol) {
        try {
            // Fetch ticker data
            const tickerData = await this.makeRequest('GET', '/market/tickers', { symbol });
            if (!tickerData.result || !tickerData.data) {
                throw new Error(`Invalid ticker data for ${symbol}`);
            }
            
            // Find the specific ticker
            const ticker = tickerData.data.tickers.find(t => t.symbol === symbol);
            if (!ticker) {
                throw new Error(`No ticker found for ${symbol}`);
            }
            
            // Fetch kline data for technical indicators
            const klineData = await this.makeRequest('GET', '/market/klines', {
                symbol,
                interval: '15m',
                limit: 100
            });
            
            // Parse price data
            const currentPrice = parseFloat(ticker.close);
            
            return {
                symbol,
                price: currentPrice,
                klineData: klineData.data || [],
                timestamp: Date.now()
            };
        } catch (error) {
            this.log(`Failed to get market data for ${symbol}: ${error.message}`, true);
            throw error;
        }
    }
    
    // Calculate technical indicators
    calculateIndicators(klineData) {
        if (!klineData || klineData.length === 0) {
            return null;
        }
        
        // Extract price data from klines (format may vary, adjust as needed)
        const closes = klineData.map(candle => {
            // Handle different kline formats
            if (Array.isArray(candle)) {
                return parseFloat(candle[4]); // Assuming [time, open, high, low, close, volume]
            } else if (candle.close) {
                return parseFloat(candle.close);
            }
            return 0;
        }).filter(price => price > 0);
        
        if (closes.length < this.rsiPeriod) {
            return null; // Not enough data
        }
        
        // Calculate EMAs
        const shortEMA = this.calculateEMA(closes, this.shortTermEMA);
        const mediumEMA = this.calculateEMA(closes, this.mediumTermEMA);
        
        // Calculate RSI
        const rsi = this.calculateRSI(closes, this.rsiPeriod);
        
        // Calculate Bollinger Bands
        const bollingerBands = this.calculateBollingerBands(closes, this.bollingerPeriod, this.bollingerStdDev);
        
        return {
            shortEMA,
            mediumEMA,
            rsi,
            bollingerBands,
            lastPrice: closes[closes.length - 1]
        };
    }
    
    // Calculate Exponential Moving Average
    calculateEMA(prices, period) {
        const k = 2 / (period + 1);
        let ema = prices.slice(0, period).reduce((total, price) => total + price, 0) / period;
        
        for (let i = period; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        
        return ema;
    }
    
    // Calculate Relative Strength Index
    calculateRSI(prices, period) {
        let gains = 0;
        let losses = 0;
        
        // Calculate initial average gain and loss
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change >= 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        // Calculate RSI using smoothed averages
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
            avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
        }
        
        if (avgLoss === 0) {
            return 100;
        }
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    
    // Calculate Bollinger Bands
    calculateBollingerBands(prices, period, stdDev) {
        // Calculate SMA (middle band)
        const sma = prices.slice(-period).reduce((total, price) => total + price, 0) / period;
        
        // Calculate standard deviation
        const squaredDifferences = prices.slice(-period).map(price => Math.pow(price - sma, 2));
        const variance = squaredDifferences.reduce((total, diff) => total + diff, 0) / period;
        const standardDeviation = Math.sqrt(variance);
        
        // Calculate upper and lower bands
        const upperBand = sma + (standardDeviation * stdDev);
        const lowerBand = sma - (standardDeviation * stdDev);
        
        return {
            middle: sma,
            upper: upperBand,
            lower: lowerBand
        };
    }
    
    // Analyze market data and generate trading signals
    analyzeMarket(symbol, marketData, indicators) {
        if (!indicators) {
            return null;
        }
        
        // Get current price
        const price = marketData.price;
        
        // Determine trend direction
        const emaCrossover = indicators.shortEMA > indicators.mediumEMA;
        
        // Check RSI conditions
        const rsiOversold = indicators.rsi < this.rsiOversold;
        const rsiOverbought = indicators.rsi > this.rsiOverbought;
        
        // Check Bollinger Band conditions
        const priceAtLowerBand = price <= indicators.bollingerBands.lower * 1.02; // Within 2% of lower band
        const priceAtUpperBand = price >= indicators.bollingerBands.upper * 0.98; // Within 2% of upper band
        
        // Generate trading signal
        if (emaCrossover && (rsiOversold || priceAtLowerBand)) {
            return {
                symbol,
                action: 'BUY',
                price,
                confidence: (rsiOversold ? 0.7 : 0.5) + (priceAtLowerBand ? 0.3 : 0),
                reason: `EMA crossover (${indicators.shortEMA.toFixed(2)} > ${indicators.mediumEMA.toFixed(2)})` +
                       (rsiOversold ? `, RSI oversold (${indicators.rsi.toFixed(2)})` : '') +
                       (priceAtLowerBand ? ', price at lower Bollinger Band' : '')
            };
        } else if (!emaCrossover && (rsiOverbought || priceAtUpperBand)) {
            return {
                symbol,
                action: 'SELL',
                price,
                confidence: (rsiOverbought ? 0.7 : 0.5) + (priceAtUpperBand ? 0.3 : 0),
                reason: `EMA bearish (${indicators.shortEMA.toFixed(2)} < ${indicators.mediumEMA.toFixed(2)})` +
                       (rsiOverbought ? `, RSI overbought (${indicators.rsi.toFixed(2)})` : '') +
                       (priceAtUpperBand ? ', price at upper Bollinger Band' : '')
            };
        }
        
        return null; // No signal
    }
    
    // Calculate position size based on risk
    calculatePositionSize(entryPrice, stopLossPrice) {
        const riskAmount = this.maxAmount * this.riskPerTrade;
        const priceDifference = Math.abs(entryPrice - stopLossPrice);
        const riskPercentage = priceDifference / entryPrice;
        
        // Calculate position size with leverage
        let positionSize = (riskAmount / riskPercentage) * this.leverage;
        
        // Ensure we don't exceed max amount
        positionSize = Math.min(positionSize, this.maxAmount * this.leverage);
        
        return positionSize;
    }
    
    // Determine if we can place a trade
    canPlaceTrade(symbol, action) {
        // Check if we already have an active trade for this symbol
        const hasActiveTrade = Object.values(this.activeTrades).some(
            trade => trade.symbol === symbol
        );
        
        if (hasActiveTrade) {
            this.log(`Already have an active trade for ${symbol}, skipping`);
            return false;
        }
        
        return true;
    }
    
    // Execute trade in simulation mode
    async simulateTrade(signal) {
        if (!signal || signal.confidence < 0.7) {
            return null; // Ignore low confidence signals
        }
        
        const { symbol, action, price } = signal;
        
        if (!this.canPlaceTrade(symbol, action)) {
            return null;
        }
        
        // Calculate stop loss and take profit levels
        const stopLossMultiplier = action === 'BUY' ? (1 - this.stopLossPercent) : (1 + this.stopLossPercent);
        const takeProfitMultiplier = action === 'BUY' ? (1 + this.takeProfitPercent) : (1 - this.takeProfitPercent);
        
        const stopLossPrice = price * stopLossMultiplier;
        const takeProfitPrice = price * takeProfitMultiplier;
        
        // Calculate position size
        const positionSize = this.calculatePositionSize(price, stopLossPrice);
        const quantity = positionSize / price;
        
        // Record simulated trade
        const tradeId = `sim-${Date.now()}`;
        const trade = {
            id: tradeId,
            symbol,
            action,
            entryPrice: price,
            stopLoss: stopLossPrice,
            takeProfit: takeProfitPrice,
            quantity,
            positionSize,
            entryTime: Date.now(),
            status: 'OPEN',
            isSimulated: true
        };
        
        this.activeTrades[tradeId] = trade;
        
        this.log(`[SIMULATION] Executed ${action} for ${symbol} at ${price}`);
        this.log(`[SIMULATION] Position size: ${positionSize.toFixed(2)} USDT, Quantity: ${quantity.toFixed(6)}`);
        this.log(`[SIMULATION] Stop loss: ${stopLossPrice.toFixed(2)}, Take profit: ${takeProfitPrice.toFixed(2)}`);
        
        // Emit trade event to GUI
        if (this.io) {
            this.io.emit('trade', { type: 'new', trade });
            this.io.emit('activeTrades', Object.values(this.activeTrades));
        }
        
        return trade;
    }
    
    // Check active trades and update their status
    async checkActiveTrades() {
        for (const tradeId in this.activeTrades) {
            const trade = this.activeTrades[tradeId];
            
            if (trade.status !== 'OPEN') continue;
            
            try {
                // Get current price
                const marketData = await this.getMarketData(trade.symbol);
                const currentPrice = marketData.price;
                
                // Check if stop loss or take profit hit
                if (trade.action === 'BUY') {
                    if (currentPrice <= trade.stopLoss) {
                        // Stop loss hit
                        trade.closePrice = trade.stopLoss;
                        trade.closeTime = Date.now();
                        trade.profit = (trade.closePrice - trade.entryPrice) * trade.quantity * this.leverage;
                        trade.status = 'CLOSED';
                        trade.result = 'STOP_LOSS';
                        
                        this.log(`[SIMULATION] Stop loss hit for ${trade.symbol} BUY at ${trade.stopLoss}`);
                        this.log(`[SIMULATION] Loss: ${trade.profit.toFixed(2)} USDT`);
                        
                        // Move to history
                        this.tradeHistory.push({...trade});
                        delete this.activeTrades[tradeId];
                        
                        // Emit trade update to GUI
                        if (this.io) {
                            this.io.emit('trade', { type: 'close', trade });
                            this.io.emit('activeTrades', Object.values(this.activeTrades));
                            this.io.emit('tradeHistory', this.tradeHistory);
                        }
                        
                    } else if (currentPrice >= trade.takeProfit) {
                        // Take profit hit
                        trade.closePrice = trade.takeProfit;
                        trade.closeTime = Date.now();
                        trade.profit = (trade.closePrice - trade.entryPrice) * trade.quantity * this.leverage;
                        trade.status = 'CLOSED';
                        trade.result = 'TAKE_PROFIT';
                        
                        this.log(`[SIMULATION] Take profit hit for ${trade.symbol} BUY at ${trade.takeProfit}`);
                        this.log(`[SIMULATION] Profit: ${trade.profit.toFixed(2)} USDT`);
                        
                        // Move to history
                        this.tradeHistory.push({...trade});
                        delete this.activeTrades[tradeId];
                        
                        // Emit trade update to GUI
                        if (this.io) {
                            this.io.emit('trade', { type: 'close', trade });
                            this.io.emit('activeTrades', Object.values(this.activeTrades));
                            this.io.emit('tradeHistory', this.tradeHistory);
                        }
                    }
                // Continuing from where the code was cut off:

                } else { // SELL
                    if (currentPrice >= trade.stopLoss) {
                        // Stop loss hit
                        trade.closePrice = trade.stopLoss;
                        trade.closeTime = Date.now();
                        trade.profit = (trade.entryPrice - trade.closePrice) * trade.quantity * this.leverage;
                        trade.status = 'CLOSED';
                        trade.result = 'STOP_LOSS';
                        
                        this.log(`[SIMULATION] Stop loss hit for ${trade.symbol} SELL at ${trade.stopLoss}`);
                        this.log(`[SIMULATION] Loss: ${trade.profit.toFixed(2)} USDT`);
                        
                        // Move to history
                        this.tradeHistory.push({...trade});
                        delete this.activeTrades[tradeId];
                        
                        // Emit trade update to GUI
                        if (this.io) {
                            this.io.emit('trade', { type: 'close', trade });
                            this.io.emit('activeTrades', Object.values(this.activeTrades));
                            this.io.emit('tradeHistory', this.tradeHistory);
                        }
                        
                    } else if (currentPrice <= trade.takeProfit) {
                        // Take profit hit
                        trade.closePrice = trade.takeProfit;
                        trade.closeTime = Date.now();
                        trade.profit = (trade.entryPrice - trade.closePrice) * trade.quantity * this.leverage;
                        trade.status = 'CLOSED';
                        trade.result = 'TAKE_PROFIT';
                        
                        this.log(`[SIMULATION] Take profit hit for ${trade.symbol} SELL at ${trade.takeProfit}`);
                        this.log(`[SIMULATION] Profit: ${trade.profit.toFixed(2)} USDT`);
                        
                        // Move to history
                        this.tradeHistory.push({...trade});
                        delete this.activeTrades[tradeId];
                        
                        // Emit trade update to GUI
                        if (this.io) {
                            this.io.emit('trade', { type: 'close', trade });
                            this.io.emit('activeTrades', Object.values(this.activeTrades));
                            this.io.emit('tradeHistory', this.tradeHistory);
                        }
                    }
                }
                
                // Update unrealized profit/loss for active trade
                if (trade.status === 'OPEN') {
                    trade.currentPrice = currentPrice;
                    
                    if (trade.action === 'BUY') {
                        trade.unrealizedPnL = (currentPrice - trade.entryPrice) * trade.quantity * this.leverage;
                    } else { // SELL
                        trade.unrealizedPnL = (trade.entryPrice - currentPrice) * trade.quantity * this.leverage;
                    }
                    
                    trade.unrealizedPnLPercent = (trade.unrealizedPnL / trade.positionSize) * 100;
                    
                    // Emit trade update to GUI
                    if (this.io) {
                        this.io.emit('tradeUpdate', trade);
                    }
                }
            } catch (error) {
                this.log(`Error checking trade ${tradeId}: ${error.message}`, true);
            }
        }
    }
    
    // Execute a single trading cycle
    async executeTradingCycle() {
        try {
            // Check active trades first
            await this.checkActiveTrades();
            
            // Process each trading pair
            for (const symbol of this.tradingPairs) {
                try {
                    // Get market data
                    const marketData = await this.getMarketData(symbol);
                    this.marketData[symbol] = marketData;
                    
                    // Calculate indicators
                    const indicators = this.calculateIndicators(marketData.klineData);
                    
                    if (indicators) {
                        // Analyze market and get trading signal
                        const signal = this.analyzeMarket(symbol, marketData, indicators);
                        
                        if (signal) {
                            this.log(`Signal generated for ${symbol}: ${signal.action} (Confidence: ${signal.confidence.toFixed(2)})`);
                            this.log(`Reason: ${signal.reason}`);
                            
                            // Execute trade (simulation or real)
                            await this.simulateTrade(signal);
                        }
                    }
                } catch (error) {
                    this.log(`Error processing ${symbol}: ${error.message}`, true);
                }
            }
            
            // Emit updated market data to GUI
            if (this.io) {
                this.io.emit('marketData', this.marketData);
            }
        } catch (error) {
            this.log(`Error in trading cycle: ${error.message}`, true);
        }
    }
    
    // Start bot
    start() {
        if (this.isRunning) {
            this.log('Bot is already running');
            return;
        }
        
        this.log('Starting PionexTradingBot...');
        this.isRunning = true;
        
        // Initial trading cycle
        this.executeTradingCycle()
            .then(() => {
                this.log('Initial trading cycle completed');
                
                // Set interval for continuous trading (every 1 minute)
                this.tradingInterval = setInterval(() => {
                    this.executeTradingCycle();
                }, 60000);
            })
            .catch(error => {
                this.log(`Error starting bot: ${error.message}`, true);
                this.isRunning = false;
            });
            
        // Emit bot status to GUI
        if (this.io) {
            this.io.emit('botStatus', { status: 'running' });
        }
    }
    
    // Stop bot
    stop() {
        if (!this.isRunning) {
            this.log('Bot is not running');
            return;
        }
        
        this.log('Stopping PionexTradingBot...');
        
        if (this.tradingInterval) {
            clearInterval(this.tradingInterval);
            this.tradingInterval = null;
        }
        
        this.isRunning = false;
        
        // Emit bot status to GUI
        if (this.io) {
            this.io.emit('botStatus', { status: 'stopped' });
        }
    }
    
    // Get bot status and stats
    getStatus() {
        const totalTrades = this.tradeHistory.length;
        
        let totalProfit = 0;
        let profitableTrades = 0;
        
        for (const trade of this.tradeHistory) {
            totalProfit += trade.profit || 0;
            if ((trade.profit || 0) > 0) {
                profitableTrades++;
            }
        }
        
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
        
        return {
            isRunning: this.isRunning,
            tradingPairs: this.tradingPairs,
            activeTrades: Object.values(this.activeTrades),
            tradeHistory: this.tradeHistory,
            totalTrades,
            profitableTrades,
            unprofitableTrades: totalTrades - profitableTrades,
            winRate,
            totalProfit,
            maxAmount: this.maxAmount,
            botConfig: {
                riskPerTrade: this.riskPerTrade,
                takeProfitPercent: this.takeProfitPercent,
                stopLossPercent: this.stopLossPercent,
                leverage: this.leverage,
                shortTermEMA: this.shortTermEMA,
                mediumTermEMA: this.mediumTermEMA,
                rsiPeriod: this.rsiPeriod,
                rsiOverbought: this.rsiOverbought,
                rsiOversold: this.rsiOversold,
                bollingerPeriod: this.bollingerPeriod,
                bollingerStdDev: this.bollingerStdDev
            }
        };
    }
    
    // Update bot configuration
    updateConfig(newConfig) {
        // Update trading pairs if provided
        if (newConfig.tradingPairs) {
            this.tradingPairs = newConfig.tradingPairs.map(pair => {
                if (pair.includes('/')) {
                    return pair.replace('/', '_');
                }
                return pair;
            });
        }
        
        // Update risk parameters
        if (newConfig.maxAmount !== undefined) this.maxAmount = newConfig.maxAmount;
        if (newConfig.riskPerTrade !== undefined) this.riskPerTrade = newConfig.riskPerTrade;
        if (newConfig.takeProfitPercent !== undefined) this.takeProfitPercent = newConfig.takeProfitPercent;
        if (newConfig.stopLossPercent !== undefined) this.stopLossPercent = newConfig.stopLossPercent;
        if (newConfig.leverage !== undefined) this.leverage = newConfig.leverage;
        
        // Update technical indicator parameters
        if (newConfig.shortTermEMA !== undefined) this.shortTermEMA = newConfig.shortTermEMA;
        if (newConfig.mediumTermEMA !== undefined) this.mediumTermEMA = newConfig.mediumTermEMA;
        if (newConfig.rsiPeriod !== undefined) this.rsiPeriod = newConfig.rsiPeriod;
        if (newConfig.rsiOverbought !== undefined) this.rsiOverbought = newConfig.rsiOverbought;
        if (newConfig.rsiOversold !== undefined) this.rsiOversold = newConfig.rsiOversold;
        if (newConfig.bollingerPeriod !== undefined) this.bollingerPeriod = newConfig.bollingerPeriod;
        if (newConfig.bollingerStdDev !== undefined) this.bollingerStdDev = newConfig.bollingerStdDev;
        
        this.log('Bot configuration updated');
        
        // Emit updated status to GUI
        if (this.io) {
            this.io.emit('botConfig', this.getStatus().botConfig);
        }
    }
    
    // Reset bot - clear active trades and history
    reset() {
        this.stop();
        this.activeTrades = {};
        this.tradeHistory = [];
        this.logs = [];
        
        this.log('Bot reset completed');
        
        // Emit reset to GUI
        if (this.io) {
            this.io.emit('botReset');
            this.io.emit('activeTrades', []);
            this.io.emit('tradeHistory', []);
            this.io.emit('logs', []);
        }
    }
    
    // Get trading pair market data with indicators
    async getPairAnalysis(symbol) {
        try {
            const marketData = await this.getMarketData(symbol);
            const indicators = this.calculateIndicators(marketData.klineData);
            
            if (!indicators) {
                throw new Error('Not enough data to calculate indicators');
            }
            
            return {
                symbol,
                price: marketData.price,
                indicators: {
                    shortEMA: indicators.shortEMA,
                    mediumEMA: indicators.mediumEMA,
                    rsi: indicators.rsi,
                    bollingerBands: indicators.bollingerBands
                },
                timestamp: Date.now()
            };
        } catch (error) {
            this.log(`Error analyzing ${symbol}: ${error.message}`, true);
            throw error;
        }
    }
    
    // Get recent logs
    getLogs(limit = 100) {
        return this.logs.slice(-limit);
    }
}

module.exports = PionexTradingBot;

// Create Express server and Socket.io for GUI
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Create bot instance
const botConfig = {
    apiKey: process.env.PIONEX_API_KEY,
    secretKey: process.env.PIONEX_SECRET_KEY,
    tradingPairs: (process.env.TRADING_PAIRS || 'BTC_USDT,ETH_USDT').split(','),
    maxAmount: parseFloat(process.env.MAX_AMOUNT || '1000'),
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE || '0.05'),
    takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || '0.05'),
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '0.02'),
    leverage: parseFloat(process.env.LEVERAGE || '10'),
    io: io
};

const bot = new PionexTradingBot(botConfig);

// Initialize bot on startup
bot.initialize()
    .then(() => {
        console.log('Bot initialized successfully');
    })
    .catch(error => {
        console.error('Bot initialization failed:', error.message);
    });

// Socket.io event handling
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send initial data to client
    socket.emit('botStatus', { status: bot.isRunning ? 'running' : 'stopped' });
    socket.emit('botConfig', bot.getStatus().botConfig);
    socket.emit('activeTrades', Object.values(bot.activeTrades));
    socket.emit('tradeHistory', bot.tradeHistory);
    socket.emit('logs', bot.getLogs());
    socket.emit('marketData', bot.marketData);
    
    // Handle client commands
    socket.on('startBot', () => {
        bot.start();
    });
    
    socket.on('stopBot', () => {
        bot.stop();
    });
    
    socket.on('resetBot', () => {
        bot.reset();
    });
    
    socket.on('updateConfig', (newConfig) => {
        bot.updateConfig(newConfig);
    });
    
    socket.on('requestPairAnalysis', async (symbol) => {
        try {
            const analysis = await bot.getPairAnalysis(symbol);
            socket.emit('pairAnalysis', analysis);
        } catch (error) {
            socket.emit('error', { message: `Error analyzing ${symbol}: ${error.message}` });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// API routes
app.get('/api/status', (req, res) => {
    res.json(bot.getStatus());
});

app.post('/api/start', (req, res) => {
    bot.start();
    res.json({ success: true, message: 'Bot started' });
});

app.post('/api/stop', (req, res) => {
    bot.stop();
    res.json({ success: true, message: 'Bot stopped' });
});

app.post('/api/reset', (req, res) => {
    bot.reset();
    res.json({ success: true, message: 'Bot reset' });
});

app.post('/api/config', (req, res) => {
    bot.updateConfig(req.body);
    res.json({ success: true, message: 'Configuration updated' });
});

app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(bot.getLogs(limit));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});