// Pionex AI Trading Bot for Aggressive Short-term Futures Trading
// Trading pairs: BTC/USDT, ETH/USDT, XRP/USDT, HBAR/USDT

const axios = require('axios');
const crypto = require('crypto');

class PionexTradingBot {
    constructor(config) {
        // API credentials
        this.apiKey = config.apiKey;
        this.secretKey = config.secretKey;
        this.baseUrl = 'https://api.pionex.com';
        
        // Trading configuration
        this.tradingPairs = config.tradingPairs || ['BTC/USDT', 'ETH/USDT', 'XRP/USDT', 'HBAR/USDT'];
        this.maxAmount = config.maxAmount || 1000; // Default max USDT to use
        this.riskPerTrade = config.riskPerTrade || 0.02; // 2% risk per trade
        this.takeProfitPercent = config.takeProfitPercent || 0.03; // 3% take profit
        this.stopLossPercent = config.stopLossPercent || 0.015; // 1.5% stop loss
        this.leverage = config.leverage || 5; // Default leverage for futures
        
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
        const requestPath = `/api/v1${endpoint}`;
        const url = `${this.baseUrl}${requestPath}${queryString ? '?' + queryString : ''}`;
        
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
            console.error(`API Request Error: ${error.message}`);
            if (error.response) {
                console.error(`Response: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
    
    // Initialize the bot
    async initialize() {
        console.log('Initializing PionexTradingBot...');
        
        // Set leverage for each trading pair
        for (const pair of this.tradingPairs) {
            const symbol = pair.replace('/', '');
            try {
                await this.setLeverage(symbol, this.leverage);
                console.log(`Set leverage to ${this.leverage}x for ${pair}`);
            } catch (error) {
                console.error(`Failed to set leverage for ${pair}: ${error.message}`);
            }
        }
        
        // Load initial market data
        await this.updateMarketData();
        
        console.log('PionexTradingBot initialized successfully!');
    }
    
    // Set leverage for a specific trading pair
    async setLeverage(symbol, leverage) {
        return await this.makeRequest('POST', '/future/leverage', {}, {
            symbol: symbol,
            leverage: leverage
        });
    }
    
    // Update market data for all trading pairs
    async updateMarketData() {
        for (const pair of this.tradingPairs) {
            const symbol = pair.replace('/', '');
            try {
                // Get kline (candlestick) data
                const klineData = await this.makeRequest('GET', '/market/kline', {
                    symbol: symbol,
                    interval: '15m', // 15 minute intervals for short-term trading
                    limit: 100 // Get enough data for indicators
                });
                
                // Calculate technical indicators
                const indicators = this.calculateIndicators(klineData);
                
                // Get current ticker price
                const tickerData = await this.makeRequest('GET', '/market/ticker', {
                    symbol: symbol
                });
                
                this.marketData[pair] = {
                    price: parseFloat(tickerData.last),
                    indicators: indicators,
                    lastUpdated: Date.now()
                };
                
                console.log(`Updated market data for ${pair}: Price ${tickerData.last}`);
            } catch (error) {
                console.error(`Failed to update market data for ${pair}: ${error.message}`);
            }
        }
    }
    
    // Calculate technical indicators from kline data
    calculateIndicators(klineData) {
        const closes = klineData.map(candle => parseFloat(candle[4]));
        const highs = klineData.map(candle => parseFloat(candle[2]));
        const lows = klineData.map(candle => parseFloat(candle[3]));
        
        // Calculate EMAs
        const shortEMA = this.calculateEMA(closes, this.shortTermEMA);
        const mediumEMA = this.calculateEMA(closes, this.mediumTermEMA);
        
        // Calculate RSI
        const rsi = this.calculateRSI(closes, this.rsiPeriod);
        
        // Calculate Bollinger Bands
        const bollingerBands = this.calculateBollingerBands(closes, this.bollingerPeriod, this.bollingerStdDev);
        
        // Calculate MACD for trend confirmation
        const macd = this.calculateMACD(closes);
        
        return {
            shortEMA,
            mediumEMA,
            rsi,
            bollingerBands,
            macd
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
    
    // Calculate MACD (Moving Average Convergence Divergence)
    calculateMACD(prices) {
        const fastEMA = this.calculateEMA(prices, 12);
        const slowEMA = this.calculateEMA(prices, 26);
        const macdLine = fastEMA - slowEMA;
        const signalLine = this.calculateEMA([...new Array(prices.length - 9).fill(0), macdLine], 9);
        const histogram = macdLine - signalLine;
        
        return {
            macdLine,
            signalLine,
            histogram
        };
    }
    
    // Analyze market data and generate trading signals
    analyzeMarket(pair) {
        const data = this.marketData[pair];
        if (!data) return null;
        
        const indicators = data.indicators;
        const price = data.price;
        
        // Aggressive short-term trading strategy
        let signal = null;
        
        // EMA crossover strategy
        const emaCrossover = indicators.shortEMA > indicators.mediumEMA;
        
        // RSI strategy
        const rsiOversold = indicators.rsi < this.rsiOversold;
        const rsiOverbought = indicators.rsi > this.rsiOverbought;
        
        // Bollinger Bands strategy
        const priceAtLowerBand = price <= indicators.bollingerBands.lower;
        const priceAtUpperBand = price >= indicators.bollingerBands.upper;
        
        // MACD momentum
        const macdPositive = indicators.macd.histogram > 0;
        
        // Generate signal based on combined indicators for aggressive trading
        if (emaCrossover && (rsiOversold || priceAtLowerBand) && macdPositive) {
            signal = {
                action: 'BUY',
                confidence: this.calculateConfidence('BUY', indicators),
                reason: 'EMA crossover with oversold conditions and positive momentum'
            };
        } else if (!emaCrossover && (rsiOverbought || priceAtUpperBand) && !macdPositive) {
            signal = {
                action: 'SELL',
                confidence: this.calculateConfidence('SELL', indicators),
                reason: 'EMA bearish with overbought conditions and negative momentum'
            };
        }
        
        return signal;
    }
    
    // Calculate confidence level of a signal (0-1)
    calculateConfidence(action, indicators) {
        let confidence = 0;
        
        if (action === 'BUY') {
            // RSI component (lower RSI = higher confidence for buying)
            const rsiComponent = Math.max(0, (this.rsiOversold - indicators.rsi) / this.rsiOversold) * 0.3;
            
            // Bollinger component (closer to lower band = higher confidence)
            const priceDistance = (indicators.bollingerBands.middle - indicators.price) / 
                                 (indicators.bollingerBands.middle - indicators.bollingerBands.lower);
            const bollingerComponent = Math.max(0, Math.min(1, priceDistance)) * 0.3;
            
            // MACD component (stronger histogram = higher confidence)
            const macdComponent = Math.min(1, Math.max(0, indicators.macd.histogram / 2)) * 0.4;
            
            confidence = rsiComponent + bollingerComponent + macdComponent;
        } else {
            // RSI component (higher RSI = higher confidence for selling)
            const rsiComponent = Math.max(0, (indicators.rsi - this.rsiOverbought) / (100 - this.rsiOverbought)) * 0.3;
            
            // Bollinger component (closer to upper band = higher confidence)
            const priceDistance = (indicators.price - indicators.bollingerBands.middle) / 
                                 (indicators.bollingerBands.upper - indicators.bollingerBands.middle);
            const bollingerComponent = Math.max(0, Math.min(1, priceDistance)) * 0.3;
            
            // MACD component (stronger negative histogram = higher confidence)
            const macdComponent = Math.min(1, Math.max(0, -indicators.macd.histogram / 2)) * 0.4;
            
            confidence = rsiComponent + bollingerComponent + macdComponent;
        }
        
        return Math.min(1, Math.max(0, confidence));
    }
    
    // Calculate position size based on risk management
    calculatePositionSize(pair, entryPrice, stopLossPrice) {
        const riskAmount = this.maxAmount * this.riskPerTrade;
        const priceDifference = Math.abs(entryPrice - stopLossPrice);
        const riskPercentage = priceDifference / entryPrice;
        
        // Calculate position size with leverage
        let positionSize = (riskAmount / riskPercentage) * this.leverage;
        
        // Ensure we don't exceed max amount
        positionSize = Math.min(positionSize, this.maxAmount * this.leverage);
        
        return positionSize;
    }
    
    // Open a new position
    async openPosition(pair, action, entryPrice, confidence) {
        const symbol = pair.replace('/', '');
        const side = action === 'BUY' ? 'LONG' : 'SHORT';
        
        // Calculate stop loss and take profit levels
        const stopLossMultiplier = side === 'LONG' ? (1 - this.stopLossPercent) : (1 + this.stopLossPercent);
        const takeProfitMultiplier = side === 'LONG' ? (1 + this.takeProfitPercent) : (1 - this.takeProfitPercent);
        
        const stopLossPrice = entryPrice * stopLossMultiplier;
        const takeProfitPrice = entryPrice * takeProfitMultiplier;
        
        // Calculate position size
        const positionSize = this.calculatePositionSize(pair, entryPrice, stopLossPrice);
        const quantity = positionSize / entryPrice;
        
        try {
            // Open futures position
            const orderResult = await this.makeRequest('POST', '/future/order', {}, {
                symbol: symbol,
                side: side,
                type: 'MARKET',
                quantity: quantity.toFixed(8),
                reduceOnly: false
            });
            
            if (orderResult && orderResult.orderId) {
                // Set stop loss
                await this.makeRequest('POST', '/future/order', {}, {
                    symbol: symbol,
                    side: side === 'LONG' ? 'SHORT' : 'LONG',
                    type: 'STOP_MARKET',
                    stopPrice: stopLossPrice.toFixed(8),
                    quantity: quantity.toFixed(8),
                    reduceOnly: true
                });
                
                // Set take profit
                await this.makeRequest('POST', '/future/order', {}, {
                    symbol: symbol,
                    side: side === 'LONG' ? 'SHORT' : 'LONG',
                    type: 'TAKE_PROFIT_MARKET',
                    stopPrice: takeProfitPrice.toFixed(8),
                    quantity: quantity.toFixed(8),
                    reduceOnly: true
                });
                
                // Record trade
                const trade = {
                    id: orderResult.orderId,
                    pair: pair,
                    side: side,
                    entryPrice: entryPrice,
                    quantity: quantity,
                    stopLoss: stopLossPrice,
                    takeProfit: takeProfitPrice,
                    openTime: Date.now(),
                    confidence: confidence,
                    status: 'OPEN'
                };
                
                this.activeTrades[orderResult.orderId] = trade;
                console.log(`Opened ${side} position for ${pair} at ${entryPrice}. Quantity: ${quantity}`);
                return trade;
            }
        } catch (error) {
            console.error(`Failed to open position for ${pair}: ${error.message}`);
            throw error;
        }
    }
    
    // Check status of active trades
    async checkActiveTrades() {
        for (const tradeId in this.activeTrades) {
            const trade = this.activeTrades[tradeId];
            
            try {
                const orderStatus = await this.makeRequest('GET', '/future/order', {
                    symbol: trade.pair.replace('/', ''),
                    orderId: tradeId
                });
                
                if (orderStatus.status === 'FILLED') {
                    // Check if stop loss or take profit was hit
                    if (orderStatus.side !== trade.side) {
                        // Position was closed
                        trade.closePrice = parseFloat(orderStatus.avgPrice);
                        trade.closeTime = Date.now();
                        trade.profit = trade.side === 'LONG' 
                            ? (trade.closePrice - trade.entryPrice) * trade.quantity * this.leverage
                            : (trade.entryPrice - trade.closePrice) * trade.quantity * this.leverage;
                        trade.status = 'CLOSED';
                        
                        // Move to trade history
                        this.tradeHistory.push(trade);
                        delete this.activeTrades[tradeId];
                        
                        console.log(`Closed ${trade.side} position for ${trade.pair}. Profit: ${trade.profit.toFixed(2)} USDT`);
                    }
                }
            } catch (error) {
                console.error(`Failed to check trade status for ${tradeId}: ${error.message}`);
            }
        }
    }
    
    // Run the trading bot
    async run() {
        try {
            console.log('Starting trading bot...');
            await this.initialize();
            
            // Main trading loop
            setInterval(async () => {
                try {
                    // Update market data
                    await this.updateMarketData();
                    
                    // Check active trades
                    await this.checkActiveTrades();
                    
                    // Generate and execute trading signals
                    for (const pair of this.tradingPairs) {
                        // Skip pairs that already have active trades
                        const hasActiveTrade = Object.values(this.activeTrades).some(trade => trade.pair === pair);
                        if (hasActiveTrade) continue;
                        
                        // Analyze market and get signal
                        const signal = this.analyzeMarket(pair);
                        
                        // Execute trades based on signals with high confidence
                        if (signal && signal.confidence > 0.7) {
                            const price = this.marketData[pair].price;
                            await this.openPosition(pair, signal.action, price, signal.confidence);
                        }
                    }
                } catch (error) {
                    console.error(`Error in trading loop: ${error.message}`);
                }
            }, 60000); // Run every minute for aggressive trading
            
        } catch (error) {
            console.error(`Bot initialization error: ${error.message}`);
        }
    }
    
    // Get bot status and performance metrics
    getStatus() {
        const totalTrades = this.tradeHistory.length;
        const winningTrades = this.tradeHistory.filter(trade => trade.profit > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        
        const totalProfit = this.tradeHistory.reduce((sum, trade) => sum + trade.profit, 0);
        const activeTrades = Object.values(this.activeTrades).length;
        
        return {
            activeTrades,
            totalTrades,
            winningTrades,
            winRate: winRate.toFixed(2) + '%',
            totalProfit: totalProfit.toFixed(2) + ' USDT',
            tradingPairs: this.tradingPairs,
            maxAmount: this.maxAmount,
            leverage: this.leverage
        };
    }
    
    // Update bot configuration
    updateConfig(newConfig) {
        if (newConfig.maxAmount) this.maxAmount = newConfig.maxAmount;
        if (newConfig.riskPerTrade) this.riskPerTrade = newConfig.riskPerTrade;
        if (newConfig.takeProfitPercent) this.takeProfitPercent = newConfig.takeProfitPercent;
        if (newConfig.stopLossPercent) this.stopLossPercent = newConfig.stopLossPercent;
        if (newConfig.leverage) {
            this.leverage = newConfig.leverage;
            // Update leverage for all trading pairs
            for (const pair of this.tradingPairs) {
                this.setLeverage(pair.replace('/', ''), this.leverage).catch(error => {
                    console.error(`Failed to update leverage for ${pair}: ${error.message}`);
                });
            }
        }
        
        console.log('Bot configuration updated:', {
            maxAmount: this.maxAmount,
            riskPerTrade: this.riskPerTrade,
            takeProfitPercent: this.takeProfitPercent,
            stopLossPercent: this.stopLossPercent,
            leverage: this.leverage
        });
    }
}

// Usage example
const bot = new PionexTradingBot({
    apiKey: 'YOUR_API_KEY',
    secretKey: 'YOUR_SECRET_KEY',
    tradingPairs: ['BTC/USDT', 'ETH/USDT', 'XRP/USDT', 'HBAR/USDT'],
    maxAmount: 1000, // Maximum USDT to use
    riskPerTrade: 0.02, // 2% risk per trade
    takeProfitPercent: 0.03, // 3% take profit
    stopLossPercent: 0.015, // 1.5% stop loss
    leverage: 5 // 5x leverage
});

// Start the bot
bot.run().catch(error => {
    console.error(`Failed to start bot: ${error.message}`);
});