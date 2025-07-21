const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');
const PionexClient = require('../pionexClient');
const logger = require('../../utils/logger');

// Initialize services (these will be injected by the main server)
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

// GET /api/trades - Get all trades with pagination
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, symbol, status } = req.query;
    
    let trades;
    if (symbol) {
      trades = await dbService.getTradesBySymbol(symbol, parseInt(limit));
    } else if (status) {
      trades = await dbService.getTradesByStatus(status, parseInt(limit));
    } else {
      trades = await dbService.getAllTrades(parseInt(limit), parseInt(offset));
    }
    
    res.json({
      trades,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: trades.length
      }
    });
    
  } catch (error) {
    logger.error('Error fetching trades:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trades/:orderId - Get specific trade by order ID
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const trade = await dbService.getTradeByOrderId(orderId);
    
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    res.json({ trade });
    
  } catch (error) {
    logger.error('Error fetching trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/trades - Create a new trade (place order)
router.post('/', async (req, res) => {
  try {
    const {
      symbol,
      side,
      type,
      quantity,
      price,
      strategy,
      stop_loss,
      take_profit
    } = req.body;

    // Validate required fields
    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, side, type, quantity'
      });
    }

    // Validate side
    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid side: must be buy or sell'
      });
    }

    // Validate type
    if (!['market', 'limit', 'stop'].includes(type.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid type: must be market, limit, or stop'
      });
    }

    // Validate price for limit orders
    if (type.toLowerCase() === 'limit' && !price) {
      return res.status(400).json({
        error: 'Price is required for limit orders'
      });
    }

    let orderResult;
    let orderId;

    // Place order with Pionex if client is available
    if (pionexClient) {
      try {
        orderResult = await pionexClient.placeOrder(
          symbol,
          side,
          type,
          quantity,
          price,
          { stop_loss, take_profit }
        );
        orderId = orderResult.orderId || orderResult.id;
      } catch (error) {
        logger.error('Error placing order with Pionex:', error);
        return res.status(400).json({
          error: `Failed to place order: ${error.message}`
        });
      }
    } else {
      // Demo mode - generate fake order ID
      orderId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.warn('Running in demo mode - order not placed with exchange');
    }

    // Save trade to database
    const tradeData = {
      order_id: orderId,
      symbol: symbol.toUpperCase(),
      side: side.toLowerCase(),
      type: type.toLowerCase(),
      quantity: parseFloat(quantity),
      price: price ? parseFloat(price) : null,
      strategy,
      stop_loss: stop_loss ? parseFloat(stop_loss) : null,
      take_profit: take_profit ? parseFloat(take_profit) : null
    };

    const trade = await dbService.createTrade(tradeData);
    
    logger.logTrade('created', trade);
    
    res.status(201).json({
      trade,
      orderResult: pionexClient ? orderResult : { demo: true, orderId }
    });
    
  } catch (error) {
    logger.error('Error creating trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/trades/:orderId - Update trade status
router.put('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;

    // Validate allowed update fields
    const allowedFields = [
      'filled_quantity', 'filled_price', 'status', 
      'stop_loss', 'take_profit', 'filled_at'
    ];
    
    const invalidFields = Object.keys(updates).filter(
      field => !allowedFields.includes(field)
    );
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: `Invalid fields: ${invalidFields.join(', ')}`
      });
    }

    const updatedTrade = await dbService.updateTrade(orderId, updates);
    
    logger.logTrade('updated', updatedTrade, { updates });
    
    res.json({ trade: updatedTrade });
    
  } catch (error) {
    logger.error('Error updating trade:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE /api/trades/:orderId - Cancel trade
router.delete('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Get trade details
    const trade = await dbService.getTradeByOrderId(orderId);
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    // Check if trade can be cancelled
    if (trade.status === 'filled') {
      return res.status(400).json({ error: 'Cannot cancel filled trade' });
    }
    
    if (trade.status === 'cancelled') {
      return res.status(400).json({ error: 'Trade already cancelled' });
    }

    // Cancel order with Pionex if client is available
    if (pionexClient && !orderId.startsWith('demo_')) {
      try {
        await pionexClient.cancelOrder(orderId, trade.symbol);
      } catch (error) {
        logger.error('Error cancelling order with Pionex:', error);
        // Continue with local cancellation even if exchange cancellation fails
      }
    }

    // Update trade status to cancelled
    const updatedTrade = await dbService.updateTrade(orderId, {
      status: 'cancelled'
    });
    
    logger.logTrade('cancelled', updatedTrade);
    
    res.json({ trade: updatedTrade });
    
  } catch (error) {
    logger.error('Error cancelling trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trades/stats - Get trading statistics
router.get('/stats', async (req, res) => {
  try {
    const { symbol, days = 30 } = req.query;
    
    const stats = await dbService.getTradingStats(symbol, parseInt(days));
    
    res.json({ stats, period: `${days} days` });
    
  } catch (error) {
    logger.error('Error fetching trading stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/trades/sync - Sync trades with exchange
router.post('/sync', async (req, res) => {
  try {
    if (!pionexClient) {
      return res.status(400).json({
        error: 'Pionex client not available - running in demo mode'
      });
    }

    const { symbol } = req.body;
    
    // Get recent orders from exchange
    const exchangeOrders = await pionexClient.getOrderHistory(symbol, 100);
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const order of exchangeOrders) {
      try {
        // Check if trade already exists
        const existingTrade = await dbService.getTradeByOrderId(order.orderId);
        
        if (existingTrade) {
          // Update existing trade if status changed
          if (existingTrade.status !== order.status) {
            await dbService.updateTrade(order.orderId, {
              status: order.status,
              filled_quantity: order.executedQty,
              filled_price: order.price,
              filled_at: order.updateTime ? new Date(order.updateTime).toISOString() : null
            });
            syncedCount++;
          }
        } else {
          // Create new trade record
          const tradeData = {
            order_id: order.orderId,
            symbol: order.symbol,
            side: order.side.toLowerCase(),
            type: order.type.toLowerCase(),
            quantity: parseFloat(order.origQty),
            price: parseFloat(order.price),
            filled_quantity: parseFloat(order.executedQty),
            filled_price: parseFloat(order.price),
            status: order.status.toLowerCase()
          };
          
          await dbService.createTrade(tradeData);
          syncedCount++;
        }
      } catch (error) {
        logger.error(`Error syncing order ${order.orderId}:`, error);
        errorCount++;
      }
    }
    
    res.json({
      message: 'Sync completed',
      synced: syncedCount,
      errors: errorCount,
      total: exchangeOrders.length
    });
    
  } catch (error) {
    logger.error('Error syncing trades:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

