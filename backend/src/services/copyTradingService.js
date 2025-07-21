const logger = require('../utils/logger');

class CopyTradingService {
  constructor(historicalDataService, dbService) {
    this.historicalDataService = historicalDataService;
    this.dbService = dbService;
    this.activeSignals = new Map();
    this.signalHistory = [];
  }

  // Generate copy trading signals based on historical analysis
  async generateCopyTradingSignals() {
    try {
      logger.info('Generating copy trading signals...');
      
      // Get top performing coins
      const topCoins = await this.historicalDataService.getTop5SwingTradingCoins();
      const signals = [];
      
      for (const coin of topCoins) {
        const signal = await this.createTradingSignal(coin);
        if (signal) {
          signals.push(signal);
          this.activeSignals.set(coin.symbol, signal);
        }
      }
      
      // Store signals in history
      this.signalHistory.push({
        timestamp: new Date().toISOString(),
        signals: signals,
        totalSignals: signals.length
      });
      
      // Keep only last 100 signal generations
      if (this.signalHistory.length > 100) {
        this.signalHistory = this.signalHistory.slice(-100);
      }
      
      logger.info(`Generated ${signals.length} copy trading signals`);
      return signals;
      
    } catch (error) {
      logger.error('Error generating copy trading signals:', error);
      throw error;
    }
  }

  // Create individual trading signal for a coin
  async createTradingSignal(coin) {
    try {
      // Only generate signals for Strong Buy and Buy recommendations
      if (!['Strong Buy', 'Buy'].includes(coin.recommendation)) {
        return null;
      }

      // Calculate entry and exit points based on historical data
      const currentPrice = coin.currentPrice;
      const volatility = coin.volatility / 100;
      
      // Entry strategy: Current price with small buffer
      const entryPrice = currentPrice * (1 - (volatility * 0.1)); // 10% of volatility as buffer
      
      // Stop loss: Based on max drawdown but more conservative
      const stopLossPercent = Math.min(coin.maxDrawdown * 0.7, 15); // Max 15% stop loss
      const stopLoss = entryPrice * (1 - stopLossPercent / 100);
      
      // Take profit: Based on average return but more conservative
      const takeProfitPercent = Math.min(coin.avgReturn * 0.8, 25); // Max 25% take profit
      const takeProfit = entryPrice * (1 + takeProfitPercent / 100);
      
      // Risk-reward ratio
      const riskReward = takeProfitPercent / stopLossPercent;
      
      // Position sizing based on risk level
      const positionSize = this.calculatePositionSize(coin.riskLevel, coin.confidence);
      
      // Signal strength based on multiple factors
      const signalStrength = this.calculateSignalStrength(coin);
      
      const signal = {
        id: `${coin.symbol}_${Date.now()}`,
        symbol: coin.symbol,
        name: coin.name,
        type: 'SWING_TRADE',
        action: 'BUY',
        signalStrength: signalStrength,
        confidence: coin.confidence,
        
        // Price levels
        currentPrice: currentPrice,
        entryPrice: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        
        // Risk management
        riskReward: riskReward,
        positionSize: positionSize,
        maxRisk: stopLossPercent,
        expectedReturn: takeProfitPercent,
        
        // Timing
        timeframe: 'SWING', // 3-30 days typical holding period
        urgency: this.calculateUrgency(coin),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        
        // Analysis data
        profitabilityScore: coin.profitabilityScore,
        winRate: coin.winRate,
        volatility: coin.volatility,
        opportunities: coin.opportunities,
        
        // Copy trading specific
        pionexStrategy: this.generatePionexStrategy(coin, entryPrice, stopLoss, takeProfit),
        copyTradingInstructions: this.generateCopyTradingInstructions(coin, entryPrice, stopLoss, takeProfit, positionSize),
        
        // Metadata
        createdAt: new Date().toISOString(),
        source: 'historical_analysis',
        version: '1.0'
      };
      
      return signal;
      
    } catch (error) {
      logger.error(`Error creating trading signal for ${coin.symbol}:`, error);
      return null;
    }
  }

  // Calculate position size based on risk level and confidence
  calculatePositionSize(riskLevel, confidence) {
    let baseSize = 0.05; // 5% of portfolio as base
    
    // Adjust based on confidence
    const confidenceMultiplier = {
      'High': 1.5,
      'Medium': 1.0,
      'Low': 0.5
    };
    
    // Adjust based on risk level
    const riskMultiplier = {
      'Low': 1.5,
      'Medium': 1.0,
      'Medium-High': 0.7,
      'High': 0.5
    };
    
    const adjustedSize = baseSize * 
      (confidenceMultiplier[confidence] || 1.0) * 
      (riskMultiplier[riskLevel] || 1.0);
    
    // Cap at 10% of portfolio
    return Math.min(adjustedSize, 0.10);
  }

  // Calculate signal strength (0-100)
  calculateSignalStrength(coin) {
    let strength = 0;
    
    // Base strength from profitability score
    strength += coin.profitabilityScore * 0.4;
    
    // Win rate contribution
    strength += (coin.winRate / 100) * 30;
    
    // Average return contribution (normalized)
    const normalizedReturn = Math.min(coin.avgReturn / 20, 1); // Cap at 20%
    strength += normalizedReturn * 20;
    
    // Confidence boost
    const confidenceBoost = {
      'High': 10,
      'Medium': 5,
      'Low': 0
    };
    strength += confidenceBoost[coin.confidence] || 0;
    
    // Recommendation boost
    const recommendationBoost = {
      'Strong Buy': 10,
      'Buy': 5,
      'Hold': 0,
      'Avoid': -20
    };
    strength += recommendationBoost[coin.recommendation] || 0;
    
    return Math.max(0, Math.min(100, Math.round(strength)));
  }

  // Calculate urgency level
  calculateUrgency(coin) {
    if (coin.recommendation === 'Strong Buy' && coin.confidence === 'High') {
      return 'HIGH';
    } else if (coin.recommendation === 'Strong Buy' || coin.confidence === 'High') {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  // Generate Pionex-specific strategy
  generatePionexStrategy(coin, entryPrice, stopLoss, takeProfit) {
    return {
      platform: 'Pionex',
      botType: 'Grid Trading Bot',
      configuration: {
        pair: `${coin.symbol}/USDT`,
        lowerPrice: stopLoss,
        upperPrice: takeProfit,
        gridNumber: 10, // 10 grids for swing trading
        investment: 'CALCULATED_BY_POSITION_SIZE',
        mode: 'Arithmetic'
      },
      alternativeStrategy: {
        botType: 'DCA Bot',
        configuration: {
          pair: `${coin.symbol}/USDT`,
          firstOrderAmount: 'CALCULATED_BY_POSITION_SIZE',
          safetyOrderAmount: 'CALCULATED_BY_POSITION_SIZE * 0.5',
          maxSafetyOrders: 3,
          priceDeviation: 2.5,
          safetyOrderStepScale: 1.2,
          takeProfit: (takeProfit - entryPrice) / entryPrice * 100
        }
      }
    };
  }

  // Generate copy trading instructions
  generateCopyTradingInstructions(coin, entryPrice, stopLoss, takeProfit, positionSize) {
    const instructions = {
      setup: [
        `Open Pionex app and navigate to Trading Bots`,
        `Select Grid Trading Bot or DCA Bot`,
        `Choose ${coin.symbol}/USDT trading pair`,
        `Set investment amount to ${(positionSize * 100).toFixed(1)}% of your portfolio`
      ],
      gridBotSettings: [
        `Lower Price: $${stopLoss.toFixed(6)}`,
        `Upper Price: $${takeProfit.toFixed(6)}`,
        `Grid Number: 10`,
        `Mode: Arithmetic`,
        `Investment: Calculate based on your risk tolerance`
      ],
      dcaBotSettings: [
        `First Order: Calculate based on position size`,
        `Safety Orders: 3 maximum`,
        `Price Deviation: 2.5%`,
        `Safety Order Step Scale: 1.2`,
        `Take Profit: ${((takeProfit - entryPrice) / entryPrice * 100).toFixed(2)}%`
      ],
      riskManagement: [
        `Maximum risk per trade: ${((entryPrice - stopLoss) / entryPrice * 100).toFixed(2)}%`,
        `Expected return: ${((takeProfit - entryPrice) / entryPrice * 100).toFixed(2)}%`,
        `Risk-reward ratio: 1:${((takeProfit - entryPrice) / (entryPrice - stopLoss)).toFixed(2)}`,
        `Monitor position daily and adjust if market conditions change significantly`
      ],
      exitStrategy: [
        `Take profit automatically at $${takeProfit.toFixed(6)}`,
        `Stop loss if price falls below $${stopLoss.toFixed(6)}`,
        `Consider partial profit taking at 50% of target`,
        `Review position if holding period exceeds 30 days`
      ]
    };
    
    return instructions;
  }

  // Get active signals
  getActiveSignals() {
    const now = new Date();
    const activeSignals = [];
    
    for (const [symbol, signal] of this.activeSignals.entries()) {
      if (new Date(signal.validUntil) > now) {
        activeSignals.push(signal);
      } else {
        // Remove expired signals
        this.activeSignals.delete(symbol);
      }
    }
    
    return activeSignals.sort((a, b) => b.signalStrength - a.signalStrength);
  }

  // Get signal by symbol
  getSignalBySymbol(symbol) {
    return this.activeSignals.get(symbol.toUpperCase());
  }

  // Get signal history
  getSignalHistory(limit = 10) {
    return this.signalHistory.slice(-limit).reverse();
  }

  // Strategy optimization based on performance
  async optimizeStrategies() {
    try {
      logger.info('Optimizing trading strategies...');
      
      // This would analyze past signal performance and adjust parameters
      // For now, return optimization recommendations
      
      const optimizations = {
        positionSizing: {
          recommendation: 'Reduce position size for high volatility coins by 20%',
          impact: 'Lower risk, potentially lower returns'
        },
        entryTiming: {
          recommendation: 'Wait for 2-3% pullback before entry on strong buy signals',
          impact: 'Better entry prices, higher success rate'
        },
        stopLoss: {
          recommendation: 'Use trailing stop loss for coins with >70% win rate',
          impact: 'Capture more upside while protecting profits'
        },
        takeProfit: {
          recommendation: 'Scale out profits at 50% and 100% targets',
          impact: 'Reduce risk while maintaining upside potential'
        }
      };
      
      return optimizations;
      
    } catch (error) {
      logger.error('Error optimizing strategies:', error);
      throw error;
    }
  }

  // Performance analytics
  getPerformanceAnalytics() {
    const totalSignals = this.signalHistory.reduce((acc, entry) => acc + entry.totalSignals, 0);
    const avgSignalsPerDay = this.signalHistory.length > 0 ? totalSignals / this.signalHistory.length : 0;
    
    const activeCount = this.getActiveSignals().length;
    const highStrengthSignals = this.getActiveSignals().filter(s => s.signalStrength >= 80).length;
    
    return {
      totalSignalsGenerated: totalSignals,
      averageSignalsPerGeneration: avgSignalsPerDay,
      currentActiveSignals: activeCount,
      highStrengthSignals: highStrengthSignals,
      signalGenerations: this.signalHistory.length,
      lastGeneration: this.signalHistory.length > 0 ? this.signalHistory[this.signalHistory.length - 1].timestamp : null
    };
  }
}

module.exports = CopyTradingService;

