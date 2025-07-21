const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');
const PionexClient = require('../pionexClient');
const logger = require('../../utils/logger');

let dbService;
let pionexClient;

// Middleware to initialize services
router.use(async (req, res, next) => {
  if (!dbService) {
    dbService = new DatabaseService();
    try {
      await dbService.initialize();
    } catch (error) {
      logger.error('Failed to initialize database service:', error);
      return res.status(500).json({ error: 'Database service unavailable' });
    }
  }
  
  if (!pionexClient && process.env.PIONEX_API_KEY && process.env.PIONEX_SECRET_KEY) {
    pionexClient = new PionexClient(
      process.env.PIONEX_API_KEY,
      process.env.PIONEX_SECRET_KEY
    );
  }
  
  next();
});

// GET /api/market/ticker/:symbol - Get current ticker data
router.get('/ticker/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (pionexClient) {
      // Get live data from exchange
      const ticker = await pionexClient.getTicker(symbol);
      
      // Save to database for historical tracking
      if (ticker && ticker.price) {
        await dbService.savePriceData(symbol, {
          timestamp: new Date().toISOString(),
          open: ticker.openPrice || ticker.price,
          high: ticker.highPrice || ticker.price,
          low: ticker.lowPrice || ticker.price,
          close: ticker.price,
          volume: ticker.volume || 0
        });
      }
      
      res.json({ ticker, source: 'live' });
    } else {
      // Demo mode - return mock data or last known price
      const lastPrice = await dbService.getLatestPrice(symbol);
      
      if (lastPrice) {
        res.json({ 
          ticker: {
            symbol,
            price: lastPrice.close,
            timestamp: lastPrice.timestamp
          },
          source: 'database'
        });
      } else {
        res.json({
          ticker: {
            symbol,
            price: 50000 + Math.random() * 1000, // Mock price
            timestamp: new Date().toISOString()
          },
          source: 'mock'
        });
      }
    }
    
  } catch (error) {
    logger.error('Error fetching ticker:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/klines/:symbol - Get candlestick data
router.get('/klines/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '1h', limit = 100 } = req.query;
    
    if (pionexClient) {
      // Get live data from exchange
      const klines = await pionexClient.getKlines(symbol, interval, parseInt(limit));
      
      // Save to database
      if (klines && Array.isArray(klines)) {
        for (const kline of klines) {
          try {
            await dbService.savePriceData(symbol, {
              timestamp: new Date(kline[0]).toISOString(), // Open time
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            });
          } catch (error) {
            // Ignore duplicate entries
            if (!error.message.includes('UNIQUE constraint failed')) {
              logger.error('Error saving kline data:', error);
            }
          }
        }
      }
      
      res.json({ klines, source: 'live' });
    } else {
      // Demo mode - return data from database
      const priceData = await dbService.getPriceData(symbol, parseInt(limit));
      
      // Convert to kline format
      const klines = priceData.map(data => [
        new Date(data.timestamp).getTime(),
        data.open.toString(),
        data.high.toString(),
        data.low.toString(),
        data.close.toString(),
        data.volume.toString()
      ]);
      
      res.json({ klines, source: 'database' });
    }
    
  } catch (error) {
    logger.error('Error fetching klines:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/symbols - Get available trading symbols
router.get('/symbols', async (req, res) => {
  try {
    if (pionexClient) {
      const exchangeInfo = await pionexClient.getExchangeInfo();
      res.json({ symbols: exchangeInfo.symbols || [], source: 'live' });
    } else {
      // Demo mode - return common symbols
      const symbols = [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', status: 'TRADING' }
      ];
      res.json({ symbols, source: 'mock' });
    }
    
  } catch (error) {
    logger.error('Error fetching symbols:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/price-history/:symbol - Get historical price data from database
router.get('/price-history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 100, from, to } = req.query;
    
    let priceData;
    
    if (from || to) {
      // Custom date range query (would need to implement this)
      priceData = await dbService.getPriceData(symbol, parseInt(limit));
    } else {
      priceData = await dbService.getPriceData(symbol, parseInt(limit));
    }
    
    res.json({ 
      priceData: priceData.reverse(), // Return in chronological order
      symbol,
      count: priceData.length
    });
    
  } catch (error) {
    logger.error('Error fetching price history:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/market/save-price - Manually save price data
router.post('/save-price', async (req, res) => {
  try {
    const { symbol, priceData } = req.body;
    
    if (!symbol || !priceData) {
      return res.status(400).json({
        error: 'symbol and priceData are required'
      });
    }

    const { timestamp, open, high, low, close, volume } = priceData;
    
    if (!timestamp || !open || !high || !low || !close) {
      return res.status(400).json({
        error: 'priceData must include timestamp, open, high, low, close'
      });
    }

    await dbService.savePriceData(symbol, {
      timestamp,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: volume ? parseFloat(volume) : 0
    });
    
    res.json({ message: 'Price data saved successfully' });
    
  } catch (error) {
    logger.error('Error saving price data:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/server-time - Get server time
router.get('/server-time', async (req, res) => {
  try {
    let serverTime;
    
    if (pionexClient) {
      const timeData = await pionexClient.getServerTime();
      serverTime = timeData.serverTime || Date.now();
    } else {
      serverTime = Date.now();
    }
    
    res.json({
      serverTime,
      localTime: Date.now(),
      iso: new Date(serverTime).toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching server time:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/status - Get market status
router.get('/status', async (req, res) => {
  try {
    const status = {
      exchange: pionexClient ? 'connected' : 'demo',
      database: 'connected',
      timestamp: new Date().toISOString()
    };
    
    if (pionexClient) {
      try {
        await pionexClient.getServerTime();
        status.exchangeLatency = 'normal';
      } catch (error) {
        status.exchange = 'error';
        status.exchangeError = error.message;
      }
    }
    
    res.json({ status });
    
  } catch (error) {
    logger.error('Error checking market status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

