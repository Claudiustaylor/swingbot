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

// GET /api/positions - Get all positions
router.get('/', async (req, res) => {
  try {
    const { symbol, status = 'open' } = req.query;
    
    let positions;
    if (symbol) {
      positions = await dbService.getPositionsBySymbol(symbol);
    } else if (status === 'open') {
      positions = await dbService.getOpenPositions();
    } else {
      // Get all positions (would need to implement this method)
      positions = await dbService.getOpenPositions();
    }
    
    res.json({ positions });
    
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/positions/:id - Get specific position
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const position = await dbService.getPositionById(parseInt(id));
    
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }
    
    res.json({ position });
    
  } catch (error) {
    logger.error('Error fetching position:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/positions - Create new position
router.post('/', async (req, res) => {
  try {
    const {
      symbol,
      side,
      quantity,
      entry_price,
      stop_loss,
      take_profit,
      trailing_stop
    } = req.body;

    // Validate required fields
    if (!symbol || !side || !quantity || !entry_price) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, side, quantity, entry_price'
      });
    }

    // Validate side
    if (!['long', 'short'].includes(side.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid side: must be long or short'
      });
    }

    const positionData = {
      symbol: symbol.toUpperCase(),
      side: side.toLowerCase(),
      quantity: parseFloat(quantity),
      entry_price: parseFloat(entry_price),
      stop_loss: stop_loss ? parseFloat(stop_loss) : null,
      take_profit: take_profit ? parseFloat(take_profit) : null,
      trailing_stop: trailing_stop ? parseFloat(trailing_stop) : null
    };

    const position = await dbService.createPosition(positionData);
    
    logger.info('Position created:', position);
    
    res.status(201).json({ position });
    
  } catch (error) {
    logger.error('Error creating position:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/positions/:id - Update position
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate allowed update fields
    const allowedFields = [
      'quantity', 'current_price', 'unrealized_pnl', 'realized_pnl',
      'stop_loss', 'take_profit', 'trailing_stop', 'status', 'closed_at'
    ];
    
    const invalidFields = Object.keys(updates).filter(
      field => !allowedFields.includes(field)
    );
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: `Invalid fields: ${invalidFields.join(', ')}`
      });
    }

    const updatedPosition = await dbService.updatePosition(parseInt(id), updates);
    
    logger.info('Position updated:', updatedPosition);
    
    res.json({ position: updatedPosition });
    
  } catch (error) {
    logger.error('Error updating position:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /api/positions/:id/close - Close position
router.post('/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { closing_price, realized_pnl } = req.body;

    if (!closing_price) {
      return res.status(400).json({
        error: 'closing_price is required'
      });
    }

    const position = await dbService.getPositionById(parseInt(id));
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    if (position.status === 'closed') {
      return res.status(400).json({ error: 'Position already closed' });
    }

    // Calculate realized PnL if not provided
    let calculatedPnl = realized_pnl;
    if (!calculatedPnl) {
      const priceDiff = parseFloat(closing_price) - position.entry_price;
      calculatedPnl = position.side === 'long' 
        ? priceDiff * position.quantity
        : -priceDiff * position.quantity;
    }

    const closedPosition = await dbService.closePosition(
      parseInt(id),
      parseFloat(closing_price),
      calculatedPnl
    );
    
    logger.info('Position closed:', closedPosition);
    
    res.json({ position: closedPosition });
    
  } catch (error) {
    logger.error('Error closing position:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/positions/stats - Get position statistics
router.get('/stats', async (req, res) => {
  try {
    const { symbol } = req.query;
    
    const stats = await dbService.getPositionStats(symbol);
    
    res.json({ stats });
    
  } catch (error) {
    logger.error('Error fetching position stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/positions/update-prices - Update current prices for open positions
router.post('/update-prices', async (req, res) => {
  try {
    const { prices } = req.body; // { symbol: price, ... }
    
    if (!prices || typeof prices !== 'object') {
      return res.status(400).json({
        error: 'prices object is required'
      });
    }

    const openPositions = await dbService.getOpenPositions();
    let updatedCount = 0;

    for (const position of openPositions) {
      const currentPrice = prices[position.symbol];
      if (currentPrice) {
        // Calculate unrealized PnL
        const priceDiff = currentPrice - position.entry_price;
        const unrealizedPnl = position.side === 'long' 
          ? priceDiff * position.quantity
          : -priceDiff * position.quantity;

        await dbService.updatePosition(position.id, {
          current_price: currentPrice,
          unrealized_pnl: unrealizedPnl
        });
        
        updatedCount++;
      }
    }
    
    res.json({
      message: 'Prices updated',
      updated: updatedCount,
      total: openPositions.length
    });
    
  } catch (error) {
    logger.error('Error updating position prices:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

