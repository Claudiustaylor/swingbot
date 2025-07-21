const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { service: 'trading-system' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Trading-specific log file
    new winston.transports.File({
      filename: path.join(logsDir, 'trading.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create specialized loggers for different components
const createComponentLogger = (component) => {
  return {
    debug: (message, meta = {}) => logger.debug(message, { component, ...meta }),
    info: (message, meta = {}) => logger.info(message, { component, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { component, ...meta }),
    error: (message, meta = {}) => logger.error(message, { component, ...meta })
  };
};

// Export specialized loggers
module.exports = logger;
module.exports.trading = createComponentLogger('trading');
module.exports.api = createComponentLogger('api');
module.exports.database = createComponentLogger('database');
module.exports.websocket = createComponentLogger('websocket');
module.exports.pionex = createComponentLogger('pionex');

// Helper function to log trade events
module.exports.logTrade = (action, tradeData, meta = {}) => {
  logger.info(`Trade ${action}`, {
    component: 'trading',
    action,
    trade: tradeData,
    ...meta
  });
};

// Helper function to log API requests
module.exports.logApiRequest = (method, endpoint, duration, status, meta = {}) => {
  const level = status >= 400 ? 'error' : 'info';
  logger[level](`API ${method} ${endpoint}`, {
    component: 'api',
    method,
    endpoint,
    duration,
    status,
    ...meta
  });
};

// Helper function to log WebSocket events
module.exports.logWebSocket = (event, clientId, data = {}) => {
  logger.info(`WebSocket ${event}`, {
    component: 'websocket',
    event,
    clientId,
    ...data
  });
};

