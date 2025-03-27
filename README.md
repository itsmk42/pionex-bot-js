# Pionex Trading Bot

An automated cryptocurrency trading bot for the Pionex exchange with a web-based dashboard.

## Features

- Automated trading using technical indicators (EMA, RSI, Bollinger Bands)
- Real-time market data analysis
- Web-based dashboard for monitoring trades and performance
- Configurable trading parameters (risk, take profit, stop loss)
- Simulation mode for testing strategies without risking real funds
- Optional real trading capability

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm
- Pionex API credentials

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/pionex-trading-bot.git
   cd pionex-trading-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your configuration:
   ```
   PIONEX_API_KEY=your_api_key_here
   PIONEX_SECRET_KEY=your_secret_key_here
   MAX_AMOUNT=100
   RISK_PER_TRADE=0.05
   TAKE_PROFIT_PERCENT=0.05
   STOP_LOSS_PERCENT=0.02
   LEVERAGE=10
   TRADING_PAIRS=BTC/USDT
   PORT=3001
   ```

4. Start the trading bot:
   ```
   node server.js
   ```

5. Access the dashboard at http://localhost:3001

## Configuration

- `MAX_AMOUNT`: Maximum trading capital (in USDT)
- `RISK_PER_TRADE`: Percentage of capital to risk per trade (0.05 = 5%)
- `TAKE_PROFIT_PERCENT`: Target profit percentage (0.05 = 5%)
- `STOP_LOSS_PERCENT`: Stop loss percentage (0.02 = 2%)
- `LEVERAGE`: Futures leverage multiplier (e.g., 10x)
- `TRADING_PAIRS`: Comma-separated list of trading pairs (e.g., "BTC/USDT,ETH/USDT")

## Dashboard Features

### Overview
- Real-time profit/loss tracking
- Win rate statistics
- Active trade monitoring

### Trade Management
- View open positions
- Historical trade performance
- Trade entry and exit points

### Settings
- Adjust risk parameters
- Configure trading pairs
- Set leverage and position sizing

### Real Trading Mode
- Toggle between simulation and real trading
- Additional safety confirmations for real trading
- Visual indicators when real trading is active

## Technical Strategy

The bot uses a combination of technical indicators to identify trading opportunities:

1. **EMA Crossover**: Combines 9-period and 21-period EMAs to identify trends
2. **RSI**: Identifies overbought (>70) and oversold (<30) conditions
3. **Bollinger Bands**: Measures volatility and potential reversal points

Trades are executed when multiple indicators align, with positions sized according to predefined risk parameters.

## Deployment

The bot can be deployed on:
- Local machines
- Cloud servers (Google Cloud, AWS, etc.)
- Android devices using Termux

## Security

- Never share your `.env` file or API keys
- The bot runs in simulation mode by default for safety
- Enable real trading mode only after thorough testing

## Disclaimer

This software is for educational purposes only. Use at your own risk. Cryptocurrency trading involves significant risk of loss and is not suitable for all investors.

## License

This project is licensed under the MIT License.
