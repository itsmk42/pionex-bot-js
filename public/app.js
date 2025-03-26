// Connect to server
const socket = io();

// DOM elements
const botStatus = document.getElementById('bot-status');
const startBotBtn = document.getElementById('start-bot');
const stopBotBtn = document.getElementById('stop-bot');
const totalProfit = document.getElementById('total-profit');
const winRate = document.getElementById('win-rate');
const totalTrades = document.getElementById('total-trades');
const tradingPairs = document.getElementById('trading-pairs');
const maxAmount = document.getElementById('max-amount');
const riskPerTrade = document.getElementById('risk-per-trade');
const marketPrice = document.getElementById('market-price');
const activeTrades = document.getElementById('active-trades-table');
const activeTradesFull = document.getElementById('active-trades-full-table');
const tradeHistory = document.getElementById('trade-history-table');
const logEntries = document.getElementById('log-entries');
const settingsForm = document.getElementById('settings-form');

// Real trading controls
const realTradingToggle = document.getElementById('real-trading-toggle');
const realTradingConfirmation = document.getElementById('real-trading-confirmation');
const realTradingConfirmCheck = document.getElementById('real-trading-confirm-check');
const confirmRealTradingBtn = document.getElementById('confirm-real-trading-btn');

// Navigation
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section-content');

navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Remove active class from all links
        navLinks.forEach(link => link.classList.remove('active'));
        
        // Add active class to clicked link
        this.classList.add('active');
        
        // Hide all sections
        sections.forEach(section => section.classList.add('d-none'));
        
        // Show the selected section
        const targetId = this.getAttribute('href');
        document.querySelector(targetId).classList.remove('d-none');
    });
});

// Start/stop bot
startBotBtn.addEventListener('click', () => {
    fetch('/api/control', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'start' })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            botStatus.textContent = 'Running';
            botStatus.classList.add('running');
            startBotBtn.disabled = true;
            stopBotBtn.disabled = false;
        }
    });
});

stopBotBtn.addEventListener('click', () => {
    fetch('/api/control', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'stop' })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            botStatus.textContent = 'Stopped';
            botStatus.classList.remove('running');
            startBotBtn.disabled = false;
            stopBotBtn.disabled = true;
        }
    });
});

// Toggle real trading confirmation section
realTradingToggle.addEventListener('change', function() {
    if (this.checked) {
        realTradingConfirmation.classList.remove('d-none');
    } else {
        realTradingConfirmation.classList.add('d-none');
        // Disable real trading on server
        fetch('/api/real-trading', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enable: false })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addLogEntry({
                    timestamp: new Date().toISOString(),
                    message: data.message,
                    type: 'info'
                });
            }
        });
    }
});

// Enable confirm button when checkbox is checked
realTradingConfirmCheck.addEventListener('change', function() {
    confirmRealTradingBtn.disabled = !this.checked;
});

// Handle real trading confirmation
confirmRealTradingBtn.addEventListener('click', function() {
    if (confirm("FINAL WARNING: This will use REAL FUNDS for trading. Continue?")) {
        fetch('/api/real-trading', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enable: true, confirm: true })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addLogEntry({
                    timestamp: new Date().toISOString(),
                    message: '⚠️ ' + data.message,
                    type: 'error' // Use error styling to make it stand out
                });
                
                // Update UI to show real trading mode
                const tradingModeLabel = document.createElement('span');
                tradingModeLabel.className = 'badge bg-danger ms-2';
                tradingModeLabel.textContent = 'REAL TRADING';
                botStatus.appendChild(tradingModeLabel);
            }
        });
    }
});

// Settings form
settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const config = {
        tradingPairs: document.getElementById('trading-pairs-input').value.split(',').map(p => p.trim()),
        maxAmount: document.getElementById('max-amount-input').value === 'null' ? null : parseFloat(document.getElementById('max-amount-input').value),
        riskPerTrade: parseFloat(document.getElementById('risk-per-trade-input').value),
        takeProfitPercent: parseFloat(document.getElementById('take-profit-input').value),
        stopLossPercent: parseFloat(document.getElementById('stop-loss-input').value),
        leverage: parseInt(document.getElementById('leverage-input').value)
    };
    
    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Settings updated successfully');
            loadBotStatus();
        }
    });
});

// Load bot status
function loadBotStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            // Update status indicator
            botStatus.textContent = data.status === 'running' ? 'Running' : 'Stopped';
            botStatus.classList.toggle('running', data.status === 'running');
            startBotBtn.disabled = data.status === 'running';
            stopBotBtn.disabled = data.status !== 'running';
            
            // Show real trading status if enabled
            if (data.isRealTrading) {
                realTradingToggle.checked = true;
                realTradingConfirmation.classList.remove('d-none');
                
                if (data.confirmRealTrading) {
                    realTradingConfirmCheck.checked = true;
                    confirmRealTradingBtn.disabled = false;
                    
                    // Add real trading badge if not already present
                    if (!document.querySelector('.badge.bg-danger')) {
                        const tradingModeLabel = document.createElement('span');
                        tradingModeLabel.className = 'badge bg-danger ms-2';
                        tradingModeLabel.textContent = 'REAL TRADING';
                        botStatus.appendChild(tradingModeLabel);
                    }
                }
            }
            
            // Update config display
            tradingPairs.textContent = data.config.tradingPairs.join(', ');
            maxAmount.textContent = data.config.maxAmount === null ? 'Auto (50% of wallet)' : `${data.config.maxAmount} USDT`;
            riskPerTrade.textContent = `${data.config.riskPerTrade * 100}%`;
            
            // Set form values
            document.getElementById('trading-pairs-input').value = data.config.tradingPairs.join(', ');
            document.getElementById('max-amount-input').value = data.config.maxAmount === null ? 'null' : data.config.maxAmount;
            document.getElementById('risk-per-trade-input').value = data.config.riskPerTrade;
            document.getElementById('take-profit-input').value = data.config.takeProfitPercent;
            document.getElementById('stop-loss-input').value = data.config.stopLossPercent;
            document.getElementById('leverage-input').value = data.config.leverage;
            
            // Update performance metrics
            updatePerformanceMetrics(data.performance);
            
            // Update active trades table
            updateActiveTradesTable(data.activeTrades);
        });
}

// Load trade history
function loadTradeHistory() {
    fetch('/api/history')
        .then(response => response.json())
        .then(data => {
            updateTradeHistoryTable(data);
        });
}

// Load logs
function loadLogs() {
    fetch('/api/logs')
        .then(response => response.json())
        .then(data => {
            logEntries.innerHTML = '';
            data.forEach(log => {
                addLogEntry(log);
            });
            // Scroll to bottom
            logEntries.scrollTop = logEntries.scrollHeight;
        });
}

// Update market data
function loadMarketData() {
    // Get first trading pair from config
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            if (data.config.tradingPairs && data.config.tradingPairs.length > 0) {
                const symbol = data.config.tradingPairs[0];
                
                fetch(`/api/market/${symbol}`)
                    .then(response => response.json())
                    .then(marketData => {
                        const label = symbol.replace('_', '/');
                        const price = marketData.price.toFixed(2);
                        const date = new Date(marketData.timestamp);
                        
                        document.querySelector('#market-price .price-label').textContent = label;
                        document.querySelector('#market-price .current-price').textContent = `${price} USDT`;
                        document.querySelector('#market-price .price-updated').textContent = `Updated: ${date.toLocaleTimeString()}`;
                    });
            }
        });
}

// Update performance metrics
function updatePerformanceMetrics(performance) {
    const profitFormatted = performance.totalProfit.toFixed(2);
    const winRateFormatted = performance.totalTrades > 0 
        ? ((performance.winningTrades / performance.totalTrades) * 100).toFixed(2)
        : '0.00';
    
    totalProfit.textContent = `${profitFormatted} USDT`;
    totalProfit.classList.toggle('profit-positive', performance.totalProfit > 0);
    totalProfit.classList.toggle('profit-negative', performance.totalProfit < 0);
    
    winRate.textContent = `${winRateFormatted}%`;
    totalTrades.textContent = performance.totalTrades;
}

// Update active trades table
function updateActiveTradesTable(trades) {
    if (!trades || trades.length === 0) {
        activeTrades.innerHTML = '<tr><td colspan="7" class="text-center">No active trades</td></tr>';
        activeTradesFull.innerHTML = '<tr><td colspan="9" class="text-center">No active trades</td></tr>';
        return;
    }
    
    let tableHtml = '';
    let fullTableHtml = '';
    
    trades.forEach(trade => {
        tableHtml += `
            <tr>
                <td>${trade.symbol.replace('_', '/')}</td>
                <td>${trade.action}</td>
                <td>${parseFloat(trade.entryPrice).toFixed(2)}</td>
                <td>${parseFloat(trade.stopLoss).toFixed(2)}</td>
                <td>${parseFloat(trade.takeProfit).toFixed(2)}</td>
                <td>${parseFloat(trade.positionSize).toFixed(2)} USDT</td>
                <td>${trade.status}${trade.isSimulated ? '' : ' <span class="badge bg-danger">REAL</span>'}</td>
            </tr>
        `;
        
        fullTableHtml += `
            <tr>
                <td>${trade.symbol.replace('_', '/')}</td>
                <td>${trade.action}</td>
                <td>${parseFloat(trade.entryPrice).toFixed(2)}</td>
                <td>-</td>
                <td>${parseFloat(trade.stopLoss).toFixed(2)}</td>
                <td>${parseFloat(trade.takeProfit).toFixed(2)}</td>
                <td>${parseFloat(trade.positionSize).toFixed(2)} USDT</td>
                <td>-</td>
                <td>${trade.status}${trade.isSimulated ? '' : ' <span class="badge bg-danger">REAL</span>'}</td>
            </tr>
        `;
    });
    
    activeTrades.innerHTML = tableHtml;
    activeTradesFull.innerHTML = fullTableHtml;
}

// Update trade history table
function updateTradeHistoryTable(trades) {
    if (!trades || trades.length === 0) {
        tradeHistory.innerHTML = '<tr><td colspan="8" class="text-center">No trade history</td></tr>';
        return;
    }
    
    let tableHtml = '';
    
    trades.forEach(trade => {
        const profit = parseFloat(trade.profit).toFixed(2);
        const profitClass = trade.profit > 0 ? 'profit-positive' : 'profit-negative';
        
        const entryDate = new Date(trade.entryTime);
        const closeDate = trade.closeTime ? new Date(trade.closeTime) : null;
        
        tableHtml += `
            <tr>
                <td>${trade.symbol.replace('_', '/')}</td>
                <td>${trade.action}</td>
                <td>${parseFloat(trade.entryPrice).toFixed(2)}</td>
                <td>${trade.closePrice ? parseFloat(trade.closePrice).toFixed(2) : '-'}</td>
                <td class="${profitClass}">${profit} USDT</td>
                <td>${trade.result || '-'}${trade.isSimulated ? '' : ' <span class="badge bg-danger">REAL</span>'}</td>
                <td>${entryDate.toLocaleString()}</td>
                <td>${closeDate ? closeDate.toLocaleString() : '-'}</td>
            </tr>
        `;
    });
    
    tradeHistory.innerHTML = tableHtml;
}

// Add log entry
function addLogEntry(log) {
    const logDiv = document.createElement('div');
    logDiv.className = `log-entry ${log.type === 'error' ? 'error' : ''}`;
    
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date(log.timestamp).toLocaleTimeString();
    
    const message = document.createElement('span');
    message.className = 'message';
    message.textContent = log.message;
    
    logDiv.appendChild(timestamp);
    logDiv.appendChild(message);
    logEntries.appendChild(logDiv);
    
    // Scroll to bottom
    logEntries.scrollTop = logEntries.scrollHeight;
}

// Socket events
socket.on('log', (log) => {
    addLogEntry(log);
});

socket.on('status', (data) => {
    botStatus.textContent = data.status === 'running' ? 'Running' : 'Stopped';
    botStatus.classList.toggle('running', data.status === 'running');
    startBotBtn.disabled = data.status === 'running';
    stopBotBtn.disabled = data.status !== 'running';
    
    updatePerformanceMetrics(data.performance);
    updateActiveTradesTable(data.activeTrades);
});

socket.on('logs', (logs) => {
    logEntries.innerHTML = '';
    logs.forEach(log => {
        addLogEntry(log);
    });
    // Scroll to bottom
    logEntries.scrollTop = logEntries.scrollHeight;
});

socket.on('trade', (data) => {
    // Load fresh data
    loadBotStatus();
    loadTradeHistory();
});

socket.on('activeTrades', (trades) => {
    updateActiveTradesTable(trades);
});

socket.on('tradeHistory', (trades) => {
    updateTradeHistoryTable(trades);
});

// Initial load
window.addEventListener('load', () => {
    loadBotStatus();
    loadTradeHistory();
    loadLogs();
    loadMarketData();
    
    // Refresh market data every 30 seconds
    setInterval(loadMarketData, 30000);
});