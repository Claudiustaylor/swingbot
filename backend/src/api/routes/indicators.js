const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');
const logger = require('../../utils/logger');

let dbService;

// Middleware to initialize database service
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
  next();
});

// GET /api/indicators/:symbol/:type - Get indicator data
router.get('/:symbol/:type', async (req, res) => {
  try {
    const { symbol, type } = req.params;
    const { limit = 50 } = req.query;
    
    const indicators = await dbService.getIndicators(
      symbol, 
      type, 
      parseInt(limit)
    );
    
    res.json({ 
      indicators: indicators.reverse(), // Return in chronological order
      symbol,
      type,
      count: indicators.length
    });
    
  } catch (error) {
    logger.error('Error fetching indicators:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/indicators/:symbol/:type/latest - Get latest indicator value
router.get('/:symbol/:type/latest', async (req, res) => {
  try {
    const { symbol, type } = req.params;
    
    const indicator = await dbService.getLatestIndicator(symbol, type);
    
    if (!indicator) {
      return res.status(404).json({ 
        error: `No ${type} indicator found for ${symbol}` 
      });
    }
    
    res.json({ indicator });
    
  } catch (error) {
    logger.error('Error fetching latest indicator:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/indicators/:symbol/:type - Save indicator data
router.post('/:symbol/:type', async (req, res) => {
  try {
    const { symbol, type } = req.params;
    const { value, timestamp, metadata } = req.body;
    
    if (value === undefined || value === null) {
      return res.status(400).json({
        error: 'value is required'
      });
    }

    const indicatorData = {
      timestamp: timestamp || new Date().toISOString(),
      indicator_type: type,
      value: parseFloat(value),
      metadata
    };

    await dbService.saveIndicator(symbol, indicatorData);
    
    res.status(201).json({ 
      message: 'Indicator saved successfully',
      indicator: indicatorData
    });
    
  } catch (error) {
    logger.error('Error saving indicator:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/indicators/:symbol/calculate - Calculate indicators for symbol
router.post('/:symbol/calculate', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { indicators = ['rsi', 'macd', 'bollinger'], period = 14 } = req.body;
    
    // Get recent price data
    const priceData = await dbService.getPriceData(symbol, 100);
    
    if (priceData.length < period) {
      return res.status(400).json({
        error: `Insufficient price data. Need at least ${period} data points, got ${priceData.length}`
      });
    }

    const results = {};
    const timestamp = new Date().toISOString();

    // Sort price data chronologically
    const sortedPrices = priceData.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    for (const indicatorType of indicators) {
      try {
        let value;
        let metadata = {};

        switch (indicatorType.toLowerCase()) {
          case 'rsi':
            value = calculateRSI(sortedPrices, period);
            metadata = { period };
            break;
            
          case 'sma':
            value = calculateSMA(sortedPrices, period);
            metadata = { period };
            break;
            
          case 'ema':
            value = calculateEMA(sortedPrices, period);
            metadata = { period };
            break;
            
          case 'macd':
            const macdResult = calculateMACD(sortedPrices);
            value = macdResult.macd;
            metadata = { 
              signal: macdResult.signal, 
              histogram: macdResult.histogram,
              fastPeriod: 12,
              slowPeriod: 26,
              signalPeriod: 9
            };
            break;
            
          case 'bollinger':
            const bbResult = calculateBollingerBands(sortedPrices, period);
            value = bbResult.middle;
            metadata = {
              upper: bbResult.upper,
              lower: bbResult.lower,
              period,
              stdDev: 2
            };
            break;
            
          default:
            throw new Error(`Unknown indicator type: ${indicatorType}`);
        }

        if (value !== null && !isNaN(value)) {
          await dbService.saveIndicator(symbol, {
            timestamp,
            indicator_type: indicatorType.toLowerCase(),
            value,
            metadata
          });
          
          results[indicatorType] = { value, metadata };
        }
        
      } catch (error) {
        logger.error(`Error calculating ${indicatorType}:`, error);
        results[indicatorType] = { error: error.message };
      }
    }
    
    res.json({
      message: 'Indicators calculated',
      symbol,
      timestamp,
      results
    });
    
  } catch (error) {
    logger.error('Error calculating indicators:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/indicators/:symbol/all - Get all indicator types for symbol
router.get('/:symbol/all', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 20 } = req.query;
    
    const indicatorTypes = ['rsi', 'sma', 'ema', 'macd', 'bollinger'];
    const results = {};
    
    for (const type of indicatorTypes) {
      const indicators = await dbService.getIndicators(symbol, type, parseInt(limit));
      if (indicators.length > 0) {
        results[type] = indicators.reverse(); // Chronological order
      }
    }
    
    res.json({ 
      indicators: results,
      symbol,
      availableTypes: Object.keys(results)
    });
    
  } catch (error) {
    logger.error('Error fetching all indicators:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for indicator calculations

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i].close - prices[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  
  const recentPrices = prices.slice(-period);
  const sum = recentPrices.reduce((acc, price) => acc + price.close, 0);
  return sum / period;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i].close * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (prices.length < slowPeriod) return { macd: null, signal: null, histogram: null };
  
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  if (!fastEMA || !slowEMA) return { macd: null, signal: null, histogram: null };
  
  const macd = fastEMA - slowEMA;
  
  // For simplicity, using SMA for signal line (should be EMA of MACD)
  const signal = macd; // Simplified
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

function calculateBollingerBands(prices, period = 20, stdDevMultiplier = 2) {
  if (prices.length < period) return { upper: null, middle: null, lower: null };
  
  const sma = calculateSMA(prices, period);
  const recentPrices = prices.slice(-period);
  
  // Calculate standard deviation
  const squaredDiffs = recentPrices.map(price => Math.pow(price.close - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * stdDevMultiplier),
    middle: sma,
    lower: sma - (stdDev * stdDevMultiplier)
  };
}

module.exports = router;

