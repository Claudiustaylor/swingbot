require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');

const DatabaseService = require('./services/databaseService');
const PionexClient = require('./api/pionexClient');
const logger = require('./utils/logger');

class TradingServer {
  constructor() {
    console.log('Initializing TradingServer...');
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    
    this.port = process.env.PORT || 3001;
    this.host = process.env.HOST || '0.0.0.0';
    
    // Services
    this.dbService = new DatabaseService();
    this.pionexClient = null;
    
    // WebSocket clients
    this.wsClients = new Set();
    
    console.log('Setting up middleware...');
    this.setupMiddleware();
    console.log('Setting up routes...');
    this.setupRoutes();
    console.log('Setting up WebSocket...');
    this.setupWebSocket();
    console.log('Setting up error handling...');
    this.setupErrorHandling();
    console.log('TradingServer initialized successfully');
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: message => logger.info(message.trim()) }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/trades', require('./api/routes/trades'));
    this.app.use('/api/positions', require('./api/routes/positions'));
    this.app.use('/api/market', require('./api/routes/market'));
    this.app.use('/api/indicators', require('./api/routes/indicators'));

    // Catch-all route
    this.app.get('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      ws.clientId = clientId;
      this.wsClients.add(ws);

      logger.info(`WebSocket client connected: ${clientId}`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        data: {
          clientId,
          message: 'Connected to Trading System WebSocket',
          timestamp: new Date().toISOString()
        }
      }));

      // Handle incoming messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          logger.error(`WebSocket message parsing error: ${error.message}`);
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Invalid JSON message' }
          }));
        }
      });

      // Handle client disconnect
      ws.on('close', (code, reason) => {
        this.wsClients.delete(ws);
        logger.info(`WebSocket client disconnected: ${clientId} (${code})`);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}: ${error.message}`);
        this.wsClients.delete(ws);
      });
    });
  }

  handleWebSocketMessage(ws, message) {
    const { type, data } = message;

    switch (type) {
      case 'subscribe':
        this.handleSubscription(ws, data);
        break;
      case 'unsubscribe':
        this.handleUnsubscription(ws, data);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: `Unknown message type: ${type}` }
        }));
    }
  }

  handleSubscription(ws, data) {
    const { channel, symbol } = data;
    
    if (!ws.subscriptions) {
      ws.subscriptions = new Set();
    }

    const subscription = `${channel}:${symbol}`;
    ws.subscriptions.add(subscription);

    logger.info(`Client ${ws.clientId} subscribed to ${subscription}`);

    ws.send(JSON.stringify({
      type: 'subscribed',
      data: { channel, symbol, subscription }
    }));
  }

  handleUnsubscription(ws, data) {
    const { channel, symbol } = data;
    
    if (ws.subscriptions) {
      const subscription = `${channel}:${symbol}`;
      ws.subscriptions.delete(subscription);

      logger.info(`Client ${ws.clientId} unsubscribed from ${subscription}`);

      ws.send(JSON.stringify({
        type: 'unsubscribed',
        data: { channel, symbol, subscription }
      }));
    }
  }

  broadcastToSubscribers(channel, symbol, data) {
    const subscription = `${channel}:${symbol}`;
    
    this.wsClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN && 
          ws.subscriptions && 
          ws.subscriptions.has(subscription)) {
        ws.send(JSON.stringify({
          type: 'data',
          channel,
          symbol,
          data,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error(`Request ${req.id} error: ${error.message}`, {
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: req.body
      });

      res.status(error.status || 500).json({
        error: error.message || 'Internal server error',
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  async initializePionexClient() {
    const apiKey = process.env.PIONEX_API_KEY;
    const secretKey = process.env.PIONEX_SECRET_KEY;

    if (!apiKey || !secretKey) {
      logger.warn('Pionex API credentials not provided, running in demo mode');
      return;
    }

    try {
      this.pionexClient = new PionexClient(apiKey, secretKey);
      
      // Set up event listeners
      this.pionexClient.on('ticker', (data) => {
        this.broadcastToSubscribers('ticker', data.symbol, data.data);
      });

      this.pionexClient.on('kline', (data) => {
        this.broadcastToSubscribers('kline', data.symbol, data.data);
      });

      this.pionexClient.on('orderUpdate', (data) => {
        this.broadcastToSubscribers('orders', 'all', data);
      });

      // Test connection
      await this.pionexClient.getServerTime();
      logger.info('Pionex API client initialized successfully');

      // Connect WebSocket
      this.pionexClient.connectWebSocket();
      
    } catch (error) {
      logger.error(`Failed to initialize Pionex client: ${error.message}`);
    }
  }

  async start() {
    try {
      console.log('Starting TradingServer...');
      
      // Initialize database
      console.log('Initializing database...');
      await this.dbService.initialize();
      logger.info('Database initialized successfully');

      // Initialize Pionex client
      console.log('Initializing Pionex client...');
      await this.initializePionexClient();

      // Start server
      console.log('Starting HTTP server...');
      this.server.listen(this.port, this.host, () => {
        logger.info(`Trading server started on ${this.host}:${this.port}`);
        logger.info(`WebSocket server ready for connections`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Server running at http://${this.host}:${this.port}`);
      });

    } catch (error) {
      console.error(`Failed to start server: ${error.message}`);
      logger.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
  }

  async shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Close WebSocket connections
    this.wsClients.forEach(ws => {
      ws.close(1000, 'Server shutting down');
    });

    // Close Pionex WebSocket
    if (this.pionexClient) {
      this.pionexClient.disconnectWebSocket();
    }

    // Close database connection
    if (this.dbService) {
      await this.dbService.close();
    }

    // Close HTTP server
    this.server.close(() => {
      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new TradingServer();
  server.start();
}

module.exports = TradingServer;

