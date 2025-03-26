// server.js - Express server for the trading bot GUI
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Initialize trading bot (modified version that communicates with the GUI)
const PionexTradingBot = require('./bot-with-gui');

// Create the trading bot instance
const bot = new PionexTradingBot({
    apiKey: process.env.PIONEX_API_KEY,
    secretKey: process.env.PIONEX_SECRET_KEY,
    tradingPairs: process.env.TRADING_PAIRS ? process.env.TRADING_PAIRS.split(',').map(pair => pair.trim().replace('/', '_')) : ['BTC_USDT'],
    maxAmount: process.env.MAX_AMOUNT === 'null' ? null : Number(process.env.MAX_AMOUNT) || 1000,
    riskPerTrade: Number(process.env.RISK_PER_TRADE) || 0.05,
    takeProfitPercent: Number(process.env.TAKE_PROFIT_PERCENT) || 0.05,
    stopLossPercent: Number(process.env.STOP_LOSS_PERCENT) || 0.02,
    leverage: Number(process.env.LEVERAGE) || 10,
    // Pass the socket.io instance to the bot
    io: io
});

// Initialize the bot
bot.initialize().then(() => {
    console.log("Bot initialized successfully");
}).catch(err => {
    console.error("Bot initialization error:", err.message);
});

// Bot status and control endpoints
app.get('/api/status', (req, res) => {
    res.json({
        status: bot.isRunning ? 'running' : 'stopped',
        isRealTrading: bot.isRealTrading || false,
        confirmRealTrading: bot.confirmRealTrading || false,
        config: {
            tradingPairs: bot.tradingPairs,
            maxAmount: bot.maxAmount,
            riskPerTrade: bot.riskPerTrade,
            takeProfitPercent: bot.takeProfitPercent,
            stopLossPercent: bot.stopLossPercent,
            leverage: bot.leverage
        },
        activeTrades: Object.values(bot.activeTrades),
        performance: {
            totalTrades: bot.tradeHistory.length,
            winningTrades: bot.tradeHistory.filter(t => t.profit > 0).length,
            totalProfit: bot.tradeHistory.reduce((sum, t) => sum + t.profit, 0)
        }
    });
});

// Update bot configuration
app.post('/api/config', (req, res) => {
    const config = req.body;
    
    // Update bot configuration
    if (config.tradingPairs) bot.tradingPairs = config.tradingPairs.map(pair => pair.replace('/', '_'));
    if (config.maxAmount !== undefined) bot.maxAmount = config.maxAmount;
    if (config.riskPerTrade !== undefined) bot.riskPerTrade = config.riskPerTrade;
    if (config.takeProfitPercent !== undefined) bot.takeProfitPercent = config.takeProfitPercent;
    if (config.stopLossPercent !== undefined) bot.stopLossPercent = config.stopLossPercent;
    if (config.leverage !== undefined) bot.leverage = config.leverage;
    
    // Save configuration to .env file
    updateEnvFile({
        TRADING_PAIRS: config.tradingPairs ? config.tradingPairs.join(',') : undefined,
        MAX_AMOUNT: config.maxAmount !== undefined ? config.maxAmount : undefined,
        RISK_PER_TRADE: config.riskPerTrade !== undefined ? config.riskPerTrade : undefined,
        TAKE_PROFIT_PERCENT: config.takeProfitPercent !== undefined ? config.takeProfitPercent : undefined,
        STOP_LOSS_PERCENT: config.stopLossPercent !== undefined ? config.stopLossPercent : undefined,
        LEVERAGE: config.leverage !== undefined ? config.leverage : undefined
    });
    
    res.json({ success: true, message: 'Configuration updated' });
});

// Add a real trading confirmation endpoint
app.post('/api/real-trading', (req, res) => {
    const { enable, confirm } = req.body;
    
    if (enable === true) {
        // Enable real trading mode
        bot.isRealTrading = true;
        bot.confirmRealTrading = confirm === true;
        
        if (confirm === true) {
            bot.log('⚠️ REAL TRADING CONFIRMED - Using actual funds for trades', true);
        } else {
            bot.log('Real trading mode enabled but not confirmed yet', true);
        }
        
        res.json({ 
            success: true, 
            message: confirm ? 'Real trading enabled and confirmed' : 'Real trading enabled but requires confirmation'
        });
    } else {
        // Disable real trading mode
        bot.isRealTrading = false;
        bot.confirmRealTrading = false;
        bot.log('Returned to simulation mode - No real funds will be used');
        
        res.json({ success: true, message: 'Real trading disabled, using simulation mode' });
    }
});

// Start/stop the bot
app.post('/api/control', (req, res) => {
    const { action } = req.body;
    
    if (action === 'start' && !bot.isRunning) {
        if (bot.isRealTrading && bot.confirmRealTrading) {
            // Start with real trading
            bot.runRealTrading()
                .then(() => res.json({ success: true, message: 'Bot started with REAL trading' }))
                .catch(error => res.status(500).json({ success: false, message: error.message }));
        } else {
            // Start with simulation
            bot.runSimulation()
                .then(() => {
                    bot.isRunning = true;
                    res.json({ success: true, message: 'Bot started in simulation mode' });
                })
                .catch(error => res.status(500).json({ success: false, message: error.message }));
        }
    } else if (action === 'stop' && bot.isRunning) {
        // Stop the bot
        if (bot.tradingInterval) {
            clearInterval(bot.tradingInterval);
            bot.tradingInterval = null;
        }
        bot.isRunning = false;
        res.json({ success: true, message: 'Bot stopped' });
    } else {
        res.status(400).json({ 
            success: false, 
            message: action === 'start' ? 'Bot is already running' : 'Bot is already stopped' 
        });
    }
});

// Get trade history
app.get('/api/history', (req, res) => {
    res.json(bot.tradeHistory);
});

// Get logs
app.get('/api/logs', (req, res) => {
    // Return the last 100 log entries
    res.json(bot.logs.slice(-100));
});

// Get market data
app.get('/api/market/:symbol', async (req, res) => {
    const { symbol } = req.params;
    
    try {
        const marketData = await bot.getMarketData(symbol);
        const indicators = bot.calculateIndicators(marketData.klineData);
        
        res.json({
            symbol,
            price: marketData.price,
            timestamp: marketData.timestamp,
            indicators
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Function to update the .env file
function updateEnvFile(updates) {
    try {
        // Read current .env file
        let envContent = fs.readFileSync('.env', 'utf8');
        
        // Update each value
        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) continue;
            
            // Check if the key already exists in the file
            const regex = new RegExp(`^${key}=.*$`, 'm');
            
            if (regex.test(envContent)) {
                // Update existing key
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                // Add new key
                envContent += `\n${key}=${value}`;
            }
        }
        
        // Write updated content back to .env
        fs.writeFileSync('.env', envContent);
        
        console.log('Updated .env file with new configuration');
    } catch (error) {
        console.error('Error updating .env file:', error);
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Send initial data
    socket.emit('status', {
        status: bot.isRunning ? 'running' : 'stopped',
        activeTrades: Object.values(bot.activeTrades),
        performance: {
            totalTrades: bot.tradeHistory.length,
            winningTrades: bot.tradeHistory.filter(t => t.profit > 0).length,
            totalProfit: bot.tradeHistory.reduce((sum, t) => sum + t.profit, 0)
        }
    });
    
    // Send last 50 logs
    socket.emit('logs', bot.logs.slice(-50));
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Trading Bot GUI server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to access the dashboard`);
});