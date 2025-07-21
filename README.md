# Trading System

A comprehensive swing trading system with Pionex API integration, featuring real-time data processing, technical indicators, and a responsive web dashboard.

## Project Structure

```
trading-system/
├── backend/                 # Node.js backend server
│   ├── src/
│   │   ├── api/            # REST API routes
│   │   ├── config/         # Configuration files
│   │   ├── database/       # Database models and operations
│   │   ├── indicators/     # Technical indicators (RSI, MACD, etc.)
│   │   ├── services/       # Business logic services
│   │   ├── utils/          # Utility functions
│   │   └── websocket/      # WebSocket handlers
│   ├── data/               # SQLite database files
│   ├── logs/               # Application logs
│   └── tests/              # Backend tests
├── frontend/               # React frontend dashboard
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility libraries
│   │   └── assets/         # Static assets
│   └── public/             # Public assets
└── docs/                   # Documentation
```

## Features

- **Real-time Trading**: Integration with Pionex API for live trading
- **Technical Indicators**: RSI, MACD, Bollinger Bands, ATR
- **Swing Trading Strategy**: Automated buy/sell signals
- **Risk Management**: Trailing stops and position sizing
- **Web Dashboard**: Real-time charts and trade monitoring
- **WebSocket Updates**: Live price feeds and notifications

## Prerequisites

- Node.js v20.0.0 or higher
- Python 3.11 (for additional analysis tools)
- Git

## Quick Start

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy the environment file and configure your API keys:
   ```bash
   cp .env.example .env
   # Edit .env with your Pionex API credentials
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Start the development server:
   ```bash
   pnpm run dev --host
   ```

## Environment Variables

### Backend (.env)

- `PIONEX_API_KEY`: Your Pionex API key
- `PIONEX_SECRET_KEY`: Your Pionex secret key
- `DATABASE_PATH`: Path to SQLite database file
- `PORT`: Server port (default: 3001)

### Frontend (.env)

- `VITE_API_BASE_URL`: Backend API URL
- `VITE_WS_URL`: WebSocket server URL
- `VITE_DEFAULT_SYMBOL`: Default trading pair

## Development

### Running Tests

Backend:
```bash
cd backend && npm test
```

Frontend:
```bash
cd frontend && pnpm test
```

### Code Quality

The project uses ESLint for code linting and Husky for pre-commit hooks.

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Deployment

### Docker

Build and run with Docker Compose:

```bash
docker-compose up --build
```

### Production

1. Build the frontend:
   ```bash
   cd frontend && pnpm run build
   ```

2. Start the backend in production mode:
   ```bash
   cd backend && NODE_ENV=production npm start
   ```

## API Documentation

The backend provides REST API endpoints for:

- `/api/trades` - Trade management
- `/api/indicators` - Technical indicator calculations
- `/api/positions` - Position monitoring
- `/health` - Health check endpoint

WebSocket endpoints:
- `/ws/prices` - Real-time price updates
- `/ws/alerts` - Trading alerts and notifications

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions and support, please refer to the documentation or create an issue in the repository.

