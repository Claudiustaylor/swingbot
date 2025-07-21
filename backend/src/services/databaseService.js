const Database = require('../config/database');

class DatabaseService {
  constructor() {
    this.db = new Database();
  }

  async initialize() {
    await this.db.initialize();
  }

  // Trade Operations
  async createTrade(tradeData) {
    const {
      order_id,
      symbol,
      side,
      type,
      quantity,
      price,
      strategy,
      stop_loss,
      take_profit
    } = tradeData;

    const sql = `
      INSERT INTO trades (
        order_id, symbol, side, type, quantity, price, 
        strategy, stop_loss, take_profit, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const params = [
      order_id,
      symbol.toUpperCase(),
      side.toLowerCase(),
      type.toLowerCase(),
      quantity,
      price,
      strategy,
      stop_loss,
      take_profit
    ];

    try {
      const result = await this.db.run(sql, params);
      return { id: result.id, order_id, ...tradeData };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Trade with order_id ${order_id} already exists`);
      }
      throw error;
    }
  }

  async updateTrade(orderId, updates) {
    const allowedFields = [
      'filled_quantity', 'filled_price', 'status', 
      'stop_loss', 'take_profit', 'filled_at'
    ];
    
    const updateFields = [];
    const params = [];

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field)) {
        updateFields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(orderId);

    const sql = `
      UPDATE trades 
      SET ${updateFields.join(', ')} 
      WHERE order_id = ?
    `;

    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      throw new Error(`Trade with order_id ${orderId} not found`);
    }

    return this.getTradeByOrderId(orderId);
  }

  async getTradeByOrderId(orderId) {
    const sql = 'SELECT * FROM trades WHERE order_id = ?';
    const trades = await this.db.query(sql, [orderId]);
    return trades[0] || null;
  }

  async getTradesBySymbol(symbol, limit = 100) {
    const sql = `
      SELECT * FROM trades 
      WHERE symbol = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    return this.db.query(sql, [symbol.toUpperCase(), limit]);
  }

  async getTradesByStatus(status, limit = 100) {
    const sql = `
      SELECT * FROM trades 
      WHERE status = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    return this.db.query(sql, [status.toLowerCase(), limit]);
  }

  async getAllTrades(limit = 100, offset = 0) {
    const sql = `
      SELECT * FROM trades 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    return this.db.query(sql, [limit, offset]);
  }

  // Position Operations
  async createPosition(positionData) {
    const {
      symbol,
      side,
      quantity,
      entry_price,
      stop_loss,
      take_profit,
      trailing_stop
    } = positionData;

    const sql = `
      INSERT INTO positions (
        symbol, side, quantity, entry_price, current_price,
        stop_loss, take_profit, trailing_stop, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `;

    const params = [
      symbol.toUpperCase(),
      side.toLowerCase(),
      quantity,
      entry_price,
      entry_price, // current_price starts as entry_price
      stop_loss,
      take_profit,
      trailing_stop
    ];

    const result = await this.db.run(sql, params);
    return { id: result.id, ...positionData, status: 'open' };
  }

  async updatePosition(positionId, updates) {
    const allowedFields = [
      'quantity', 'current_price', 'unrealized_pnl', 'realized_pnl',
      'stop_loss', 'take_profit', 'trailing_stop', 'status', 'closed_at'
    ];
    
    const updateFields = [];
    const params = [];

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field)) {
        updateFields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(positionId);

    const sql = `
      UPDATE positions 
      SET ${updateFields.join(', ')} 
      WHERE id = ?
    `;

    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      throw new Error(`Position with id ${positionId} not found`);
    }

    return this.getPositionById(positionId);
  }

  async getPositionById(positionId) {
    const sql = 'SELECT * FROM positions WHERE id = ?';
    const positions = await this.db.query(sql, [positionId]);
    return positions[0] || null;
  }

  async getOpenPositions() {
    const sql = `
      SELECT * FROM positions 
      WHERE status = 'open' 
      ORDER BY created_at DESC
    `;
    return this.db.query(sql);
  }

  async getPositionsBySymbol(symbol) {
    const sql = `
      SELECT * FROM positions 
      WHERE symbol = ? 
      ORDER BY created_at DESC
    `;
    return this.db.query(sql, [symbol.toUpperCase()]);
  }

  async closePosition(positionId, closingPrice, realizedPnl) {
    const updates = {
      status: 'closed',
      current_price: closingPrice,
      realized_pnl: realizedPnl,
      closed_at: new Date().toISOString()
    };

    return this.updatePosition(positionId, updates);
  }

  // Price Data Operations
  async savePriceData(symbol, priceData) {
    const { timestamp, open, high, low, close, volume } = priceData;

    const sql = `
      INSERT OR REPLACE INTO price_data 
      (symbol, timestamp, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      symbol.toUpperCase(),
      timestamp,
      open,
      high,
      low,
      close,
      volume
    ];

    return this.db.run(sql, params);
  }

  async getPriceData(symbol, limit = 100) {
    const sql = `
      SELECT * FROM price_data 
      WHERE symbol = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    return this.db.query(sql, [symbol.toUpperCase(), limit]);
  }

  async getLatestPrice(symbol) {
    const sql = `
      SELECT * FROM price_data 
      WHERE symbol = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    const result = await this.db.query(sql, [symbol.toUpperCase()]);
    return result[0] || null;
  }

  // Indicator Operations
  async saveIndicator(symbol, indicatorData) {
    const { timestamp, indicator_type, value, metadata } = indicatorData;

    const sql = `
      INSERT OR REPLACE INTO indicators 
      (symbol, timestamp, indicator_type, value, metadata)
      VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      symbol.toUpperCase(),
      timestamp,
      indicator_type.toLowerCase(),
      value,
      metadata ? JSON.stringify(metadata) : null
    ];

    return this.db.run(sql, params);
  }

  async getIndicators(symbol, indicatorType, limit = 100) {
    const sql = `
      SELECT * FROM indicators 
      WHERE symbol = ? AND indicator_type = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    return this.db.query(sql, [symbol.toUpperCase(), indicatorType.toLowerCase(), limit]);
  }

  async getLatestIndicator(symbol, indicatorType) {
    const sql = `
      SELECT * FROM indicators 
      WHERE symbol = ? AND indicator_type = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    const result = await this.db.query(sql, [
      symbol.toUpperCase(), 
      indicatorType.toLowerCase()
    ]);
    return result[0] || null;
  }

  // Analytics and Reporting
  async getTradingStats(symbol = null, days = 30) {
    const dateFilter = `datetime('now', '-${days} days')`;
    const symbolFilter = symbol ? 'AND symbol = ?' : '';
    const params = symbol ? [symbol.toUpperCase()] : [];

    const sql = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN status = 'filled' THEN 1 END) as filled_trades,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_trades,
        COUNT(CASE WHEN side = 'buy' THEN 1 END) as buy_trades,
        COUNT(CASE WHEN side = 'sell' THEN 1 END) as sell_trades,
        AVG(CASE WHEN status = 'filled' THEN filled_price END) as avg_fill_price,
        SUM(CASE WHEN status = 'filled' THEN filled_quantity END) as total_volume
      FROM trades 
      WHERE created_at >= ${dateFilter} ${symbolFilter}
    `;

    const result = await this.db.query(sql, params);
    return result[0];
  }

  async getPositionStats(symbol = null) {
    const symbolFilter = symbol ? 'WHERE symbol = ?' : '';
    const params = symbol ? [symbol.toUpperCase()] : [];

    const sql = `
      SELECT 
        COUNT(*) as total_positions,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_positions,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_positions,
        SUM(CASE WHEN status = 'closed' THEN realized_pnl ELSE 0 END) as total_realized_pnl,
        SUM(CASE WHEN status = 'open' THEN unrealized_pnl ELSE 0 END) as total_unrealized_pnl,
        AVG(CASE WHEN status = 'closed' THEN realized_pnl END) as avg_realized_pnl
      FROM positions 
      ${symbolFilter}
    `;

    const result = await this.db.query(sql, params);
    return result[0];
  }

  // Cleanup Operations
  async cleanupOldData(days = 90) {
    const dateFilter = `datetime('now', '-${days} days')`;
    
    const queries = [
      `DELETE FROM price_data WHERE timestamp < ${dateFilter}`,
      `DELETE FROM indicators WHERE created_at < ${dateFilter}`,
      `DELETE FROM trades WHERE created_at < ${dateFilter} AND status IN ('filled', 'cancelled')`,
      `DELETE FROM positions WHERE closed_at < ${dateFilter} AND status = 'closed'`
    ];

    const results = [];
    for (const query of queries) {
      const result = await this.db.run(query);
      results.push(result.changes);
    }

    return {
      price_data_deleted: results[0],
      indicators_deleted: results[1],
      trades_deleted: results[2],
      positions_deleted: results[3]
    };
  }

  async close() {
    await this.db.close();
  }
}

module.exports = DatabaseService;

