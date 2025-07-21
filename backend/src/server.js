require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');

const DatabaseService = require('./services/databaseService');
const HistoricalDataService = require('./services/historicalDataService');
const CopyTradingService = require('./services/copyTradingService');
const logger = require('./utils/logger');

console.log('Starting Swing Trading Bot Server...');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';

// Initialize services
let dbService;
let historicalDataService;
let copyTradingService;
const wsClients = new Set();

// Middleware setup
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    database: dbService ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Basic trading endpoints
app.get('/api/coins/top5', async (req, res) => {
  try {
    logger.info('Fetching top 5 swing trading coins...');
    
    // Get real analysis from historical data service
    const top5Coins = await historicalDataService.getTop5SwingTradingCoins();
    
    res.json({ 
      coins: top5Coins,
      lastUpdated: new Date().toISOString(),
      analysisType: 'swing_trading_3y_historical',
      disclaimer: 'This analysis is based on historical data and does not guarantee future performance. Please do your own research before making investment decisions.'
    });
  } catch (error) {
    logger.error('Error fetching top 5 coins:', error);
    
    // Fallback to mock data if analysis fails
    const mockTop5Coins = [
      {
        rank: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        currentPrice: 45000,
        profitabilityScore: 78.5,
        winRate: 68.5,
        avgReturn: 8.3,
        volatility: 45.2,
        maxDrawdown: 22.1,
        opportunities: 45,
        recommendation: 'Strong Buy',
        confidence: 'High',
        riskLevel: 'Medium',
        reasoning: 'Strong historical performance with good risk-adjusted returns.',
        lastUpdated: new Date().toISOString()
      },
      {
        rank: 2,
        symbol: 'ETH',
        name: 'Ethereum',
        currentPrice: 3000,
        profitabilityScore: 75.2,
        winRate: 65.2,
        avgReturn: 7.1,
        volatility: 52.8,
        maxDrawdown: 28.5,
        opportunities: 42,
        recommendation: 'Buy',
        confidence: 'Medium',
        riskLevel: 'Medium-High',
        reasoning: 'Good swing trading potential with higher volatility.',
        lastUpdated: new Date().toISOString()
      },
      {
        rank: 3,
        symbol: 'ADA',
        name: 'Cardano',
        currentPrice: 0.5,
        profitabilityScore: 72.8,
        winRate: 72.1,
        avgReturn: 9.8,
        volatility: 58.3,
        maxDrawdown: 35.2,
        opportunities: 38,
        recommendation: 'Buy',
        confidence: 'Medium',
        riskLevel: 'High',
        reasoning: 'High win rate but increased volatility requires careful timing.',
        lastUpdated: new Date().toISOString()
      },
      {
        rank: 4,
        symbol: 'DOT',
        name: 'Polkadot',
        currentPrice: 7.5,
        profitabilityScore: 68.3,
        winRate: 63.8,
        avgReturn: 6.9,
        volatility: 48.7,
        maxDrawdown: 31.8,
        opportunities: 35,
        recommendation: 'Hold',
        confidence: 'Medium',
        riskLevel: 'Medium-High',
        reasoning: 'Moderate performance with acceptable risk levels.',
        lastUpdated: new Date().toISOString()
      },
      {
        rank: 5,
        symbol: 'LINK',
        name: 'Chainlink',
        currentPrice: 15.2,
        profitabilityScore: 65.7,
        winRate: 61.4,
        avgReturn: 5.8,
        volatility: 44.1,
        maxDrawdown: 28.9,
        opportunities: 32,
        recommendation: 'Hold',
        confidence: 'Low',
        riskLevel: 'Medium',
        reasoning: 'Conservative choice with lower but more stable returns.',
        lastUpdated: new Date().toISOString()
      }
    ];
    
    res.json({ 
      coins: mockTop5Coins,
      lastUpdated: new Date().toISOString(),
      analysisType: 'fallback_mock_data',
      error: 'Historical analysis temporarily unavailable, showing sample data',
      disclaimer: 'This is sample data for demonstration purposes only.'
    });
  }
});

// Trading signals endpoint
app.get('/api/signals/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // Mock signal data
    const signal = {
      symbol,
      signal: 'BUY',
      confidence: 85.2,
      entry: 45250.00,
      stopLoss: 43500.00,
      takeProfit: 48000.00,
      riskReward: 1.57,
      timestamp: new Date().toISOString(),
      indicators: {
        rsi: 35.2,
        macd: 'bullish_crossover',
        bollinger: 'lower_band_touch',
        volume: 'above_average'
      }
    };
    
    res.json({ signal });
  } catch (error) {
    logger.error('Error fetching trading signal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Copy trading signals endpoints
app.get('/api/copy-signals', async (req, res) => {
  try {
    logger.info('Fetching active copy trading signals...');
    
    const activeSignals = copyTradingService.getActiveSignals();
    
    res.json({
      signals: activeSignals,
      count: activeSignals.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching copy trading signals:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/copy-signals/generate', async (req, res) => {
  try {
    logger.info('Generating new copy trading signals...');
    
    const signals = await copyTradingService.generateCopyTradingSignals();
    
    res.json({
      signals: signals,
      count: signals.length,
      generated: new Date().toISOString(),
      message: 'New copy trading signals generated successfully'
    });
  } catch (error) {
    logger.error('Error generating copy trading signals:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/copy-signals/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    logger.info(`Fetching copy trading signal for ${symbol}...`);
    
    const signal = copyTradingService.getSignalBySymbol(symbol);
    
    if (!signal) {
      return res.status(404).json({ 
        error: 'Signal not found',
        symbol: symbol.toUpperCase(),
        message: 'No active copy trading signal found for this symbol'
      });
    }
    
    res.json({ signal });
  } catch (error) {
    logger.error(`Error fetching copy trading signal for ${req.params.symbol}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/strategies/optimize', async (req, res) => {
  try {
    logger.info('Fetching strategy optimizations...');
    
    const optimizations = await copyTradingService.optimizeStrategies();
    
    res.json({
      optimizations: optimizations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching strategy optimizations:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/performance', async (req, res) => {
  try {
    logger.info('Fetching performance analytics...');
    
    const analytics = copyTradingService.getPerformanceAnalytics();
    
    res.json({
      analytics: analytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching performance analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket setup
wss.on('connection', (ws) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  ws.clientId = clientId;
  wsClients.add(ws);
  
  console.log(`WebSocket client connected: ${clientId}`);
  
  ws.send(JSON.stringify({
    type: 'connection',
    data: {
      clientId,
      message: 'Connected to Swing Trading Bot',
      timestamp: new Date().toISOString()
    }
  }));
  
  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`WebSocket client disconnected: ${clientId}`);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    wsClients.delete(ws);
  });
});

// Broadcast function for real-time updates
function broadcastUpdate(type, data) {
  const message = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString()
  });
  
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Error handling
app.use((error, req, res, next) => {
  logger.error('Request error:', error);
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Initialize and start server
async function startServer() {
  try {
    console.log('Initializing database...');
    dbService = new DatabaseService();
    await dbService.initialize();
    console.log('Database initialized successfully');
    
    console.log('Initializing historical data service...');
    historicalDataService = new HistoricalDataService();
    console.log('Historical data service initialized successfully');
    
    console.log('Initializing copy trading service...');
    copyTradingService = new CopyTradingService(historicalDataService, dbService);
    console.log('Copy trading service initialized successfully');
    
    server.listen(port, host, () => {
      console.log(`🚀 Swing Trading Bot Server running on ${host}:${port}`);
      console.log(`📊 Dashboard: http://${host}:${port}/health`);
      console.log(`🔌 WebSocket ready for connections`);
      console.log(`📈 Top 5 coins: http://${host}:${port}/api/coins/top5`);
      
      // Send periodic updates
      setInterval(() => {
        broadcastUpdate('price_update', {
          BTC: 45000 + Math.random() * 1000,
          ETH: 3000 + Math.random() * 100,
          ADA: 0.5 + Math.random() * 0.1
        });
      }, 5000);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();

