const axios = require('axios');
const logger = require('../utils/logger');

class HistoricalDataService {
  constructor() {
    this.coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';
    this.binanceBaseUrl = 'https://api.binance.com/api/v3';
    this.requestDelay = 1000; // 1 second delay between requests to avoid rate limiting
  }

  // Delay function to avoid rate limiting
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get list of top cryptocurrencies by market cap
  async getTopCryptocurrencies(limit = 50) {
    try {
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: limit,
          page: 1,
          sparkline: false
        }
      });

      return response.data.map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        market_cap: coin.market_cap,
        current_price: coin.current_price,
        price_change_24h: coin.price_change_percentage_24h,
        market_cap_rank: coin.market_cap_rank
      }));
    } catch (error) {
      logger.error('Error fetching top cryptocurrencies:', error);
      throw error;
    }
  }

  // Get historical price data for a specific coin (up to 10 years)
  async getHistoricalPriceData(coinId, days = 3650) { // 10 years = ~3650 days
    try {
      logger.info(`Fetching ${days} days of historical data for ${coinId}`);
      
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days,
          interval: 'daily'
        }
      });

      const { prices, market_caps, total_volumes } = response.data;
      
      // Transform data into a more usable format
      const historicalData = prices.map((price, index) => ({
        timestamp: new Date(price[0]).toISOString(),
        date: new Date(price[0]).toISOString().split('T')[0],
        price: price[1],
        market_cap: market_caps[index] ? market_caps[index][1] : null,
        volume: total_volumes[index] ? total_volumes[index][1] : null
      }));

      logger.info(`Retrieved ${historicalData.length} data points for ${coinId}`);
      return historicalData;
    } catch (error) {
      logger.error(`Error fetching historical data for ${coinId}:`, error);
      throw error;
    }
  }

  // Calculate swing trading metrics for a coin
  calculateSwingTradingMetrics(priceData) {
    if (!priceData || priceData.length < 30) {
      throw new Error('Insufficient data for swing trading analysis');
    }

    const prices = priceData.map(d => d.price);
    const volumes = priceData.map(d => d.volume || 0);
    
    // Calculate basic statistics
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    // Calculate volatility (standard deviation)
    const variance = prices.reduce((acc, price) => acc + Math.pow(price - avgPrice, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance);
    const volatilityPercent = (volatility / avgPrice) * 100;
    
    // Calculate returns for swing trading analysis
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(dailyReturn);
    }
    
    // Calculate swing trading opportunities (price swings > 5%)
    const swingOpportunities = this.identifySwingOpportunities(priceData, 0.05); // 5% threshold
    
    // Calculate win rate and average returns
    const positiveSwings = swingOpportunities.filter(swing => swing.return > 0);
    const winRate = (positiveSwings.length / swingOpportunities.length) * 100;
    const avgReturn = swingOpportunities.reduce((acc, swing) => acc + swing.return, 0) / swingOpportunities.length;
    
    // Calculate maximum drawdown
    const maxDrawdown = this.calculateMaxDrawdown(prices);
    
    // Calculate Sharpe ratio (simplified)
    const avgDailyReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const returnVolatility = Math.sqrt(returns.reduce((acc, ret) => acc + Math.pow(ret - avgDailyReturn, 2), 0) / returns.length);
    const sharpeRatio = returnVolatility > 0 ? (avgDailyReturn / returnVolatility) * Math.sqrt(365) : 0;
    
    // Calculate profitability score (custom metric)
    const profitabilityScore = this.calculateProfitabilityScore({
      winRate,
      avgReturn,
      volatilityPercent,
      maxDrawdown,
      sharpeRatio,
      swingCount: swingOpportunities.length
    });

    return {
      symbol: priceData[0]?.symbol || 'UNKNOWN',
      dataPoints: priceData.length,
      timeRange: {
        start: priceData[0]?.date,
        end: priceData[priceData.length - 1]?.date
      },
      priceStats: {
        min: minPrice,
        max: maxPrice,
        average: avgPrice,
        volatility: volatilityPercent
      },
      swingTrading: {
        opportunities: swingOpportunities.length,
        winRate: winRate,
        avgReturn: avgReturn * 100, // Convert to percentage
        maxDrawdown: maxDrawdown * 100,
        sharpeRatio: sharpeRatio
      },
      profitabilityScore: profitabilityScore,
      volume: {
        average: avgVolume,
        total: volumes.reduce((a, b) => a + b, 0)
      }
    };
  }

  // Identify swing trading opportunities
  identifySwingOpportunities(priceData, threshold = 0.05) {
    const opportunities = [];
    let inPosition = false;
    let entryPrice = 0;
    let entryDate = '';
    
    for (let i = 1; i < priceData.length - 1; i++) {
      const currentPrice = priceData[i].price;
      const prevPrice = priceData[i - 1].price;
      const nextPrice = priceData[i + 1].price;
      
      // Look for local minima (potential buy signals)
      if (!inPosition && prevPrice > currentPrice && nextPrice > currentPrice) {
        // Additional confirmation: check if it's a significant dip
        const recentHigh = Math.max(...priceData.slice(Math.max(0, i - 10), i).map(d => d.price));
        const dipPercent = (recentHigh - currentPrice) / recentHigh;
        
        if (dipPercent >= threshold) {
          inPosition = true;
          entryPrice = currentPrice;
          entryDate = priceData[i].date;
        }
      }
      
      // Look for local maxima (potential sell signals)
      if (inPosition && prevPrice < currentPrice && nextPrice < currentPrice) {
        const gainPercent = (currentPrice - entryPrice) / entryPrice;
        
        // Only count as opportunity if gain/loss is significant
        if (Math.abs(gainPercent) >= threshold * 0.5) { // 2.5% minimum
          opportunities.push({
            entryDate: entryDate,
            exitDate: priceData[i].date,
            entryPrice: entryPrice,
            exitPrice: currentPrice,
            return: gainPercent,
            holdingDays: i - priceData.findIndex(d => d.date === entryDate)
          });
        }
        
        inPosition = false;
      }
    }
    
    return opportunities;
  }

  // Calculate maximum drawdown
  calculateMaxDrawdown(prices) {
    let maxDrawdown = 0;
    let peak = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > peak) {
        peak = prices[i];
      }
      
      const drawdown = (peak - prices[i]) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  // Calculate custom profitability score for ranking coins
  calculateProfitabilityScore(metrics) {
    const {
      winRate,
      avgReturn,
      volatilityPercent,
      maxDrawdown,
      sharpeRatio,
      swingCount
    } = metrics;
    
    // Normalize metrics (0-100 scale)
    const normalizedWinRate = Math.min(winRate, 100);
    const normalizedReturn = Math.max(0, Math.min(avgReturn * 100 + 50, 100)); // Center around 50
    const normalizedVolatility = Math.max(0, 100 - volatilityPercent); // Lower volatility = higher score
    const normalizedDrawdown = Math.max(0, 100 - (maxDrawdown * 100)); // Lower drawdown = higher score
    const normalizedSharpe = Math.max(0, Math.min((sharpeRatio + 1) * 25, 100)); // Center around 25
    const normalizedOpportunities = Math.min((swingCount / 50) * 100, 100); // More opportunities = higher score
    
    // Weighted score calculation
    const weights = {
      winRate: 0.25,
      avgReturn: 0.25,
      volatility: 0.15,
      drawdown: 0.15,
      sharpe: 0.10,
      opportunities: 0.10
    };
    
    const score = (
      normalizedWinRate * weights.winRate +
      normalizedReturn * weights.avgReturn +
      normalizedVolatility * weights.volatility +
      normalizedDrawdown * weights.drawdown +
      normalizedSharpe * weights.sharpe +
      normalizedOpportunities * weights.opportunities
    );
    
    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  // Analyze multiple coins and return top performers
  async analyzeTopCoinsForSwingTrading(coinLimit = 20, analysisYears = 3) {
    try {
      logger.info(`Starting analysis of top ${coinLimit} coins for swing trading`);
      
      // Get top coins by market cap
      const topCoins = await this.getTopCryptocurrencies(coinLimit);
      const analysisResults = [];
      
      for (const coin of topCoins) {
        try {
          logger.info(`Analyzing ${coin.name} (${coin.symbol})`);
          
          // Get historical data
          const days = analysisYears * 365;
          const historicalData = await this.getHistoricalPriceData(coin.id, days);
          
          // Add symbol to historical data
          const dataWithSymbol = historicalData.map(d => ({ ...d, symbol: coin.symbol }));
          
          // Calculate swing trading metrics
          const metrics = this.calculateSwingTradingMetrics(dataWithSymbol);
          
          analysisResults.push({
            ...coin,
            analysis: metrics,
            recommendation: this.generateRecommendation(metrics)
          });
          
          // Delay to avoid rate limiting
          await this.delay(this.requestDelay);
          
        } catch (error) {
          logger.error(`Error analyzing ${coin.name}:`, error);
          // Continue with other coins
        }
      }
      
      // Sort by profitability score
      analysisResults.sort((a, b) => b.analysis.profitabilityScore - a.analysis.profitabilityScore);
      
      logger.info(`Analysis complete. Analyzed ${analysisResults.length} coins`);
      return analysisResults;
      
    } catch (error) {
      logger.error('Error in swing trading analysis:', error);
      throw error;
    }
  }

  // Generate trading recommendation based on metrics
  generateRecommendation(metrics) {
    const score = metrics.profitabilityScore;
    const winRate = metrics.swingTrading.winRate;
    const avgReturn = metrics.swingTrading.avgReturn;
    
    let recommendation = 'Hold';
    let confidence = 'Low';
    let riskLevel = 'High';
    
    if (score >= 75 && winRate >= 65 && avgReturn >= 5) {
      recommendation = 'Strong Buy';
      confidence = 'High';
      riskLevel = metrics.priceStats.volatility > 50 ? 'Medium-High' : 'Medium';
    } else if (score >= 60 && winRate >= 55 && avgReturn >= 3) {
      recommendation = 'Buy';
      confidence = 'Medium';
      riskLevel = metrics.priceStats.volatility > 40 ? 'Medium-High' : 'Medium';
    } else if (score >= 45 && winRate >= 45) {
      recommendation = 'Hold';
      confidence = 'Medium';
      riskLevel = metrics.priceStats.volatility > 60 ? 'High' : 'Medium-High';
    } else {
      recommendation = 'Avoid';
      confidence = 'Low';
      riskLevel = 'High';
    }
    
    return {
      action: recommendation,
      confidence: confidence,
      riskLevel: riskLevel,
      reasoning: this.generateReasoningText(metrics, recommendation)
    };
  }

  // Generate reasoning text for recommendation
  generateReasoningText(metrics, recommendation) {
    const { swingTrading, priceStats, profitabilityScore } = metrics;
    
    let reasoning = `Profitability score: ${profitabilityScore}/100. `;
    reasoning += `Win rate: ${swingTrading.winRate.toFixed(1)}%, `;
    reasoning += `Average return: ${swingTrading.avgReturn.toFixed(1)}%, `;
    reasoning += `Volatility: ${priceStats.volatility.toFixed(1)}%. `;
    
    if (recommendation === 'Strong Buy') {
      reasoning += 'Excellent swing trading metrics with high win rate and good returns.';
    } else if (recommendation === 'Buy') {
      reasoning += 'Good swing trading potential with acceptable risk-reward ratio.';
    } else if (recommendation === 'Hold') {
      reasoning += 'Moderate swing trading potential, suitable for experienced traders.';
    } else {
      reasoning += 'Poor swing trading metrics, high risk with low probability of success.';
    }
    
    return reasoning;
  }

  // Get top 5 coins for swing trading
  async getTop5SwingTradingCoins() {
    try {
      const analysisResults = await this.analyzeTopCoinsForSwingTrading(25, 3); // Analyze top 25 coins over 3 years
      const top5 = analysisResults.slice(0, 5);
      
      return top5.map((coin, index) => ({
        rank: index + 1,
        symbol: coin.symbol,
        name: coin.name,
        currentPrice: coin.current_price,
        profitabilityScore: coin.analysis.profitabilityScore,
        winRate: coin.analysis.swingTrading.winRate,
        avgReturn: coin.analysis.swingTrading.avgReturn,
        volatility: coin.analysis.priceStats.volatility,
        maxDrawdown: coin.analysis.swingTrading.maxDrawdown,
        opportunities: coin.analysis.swingTrading.opportunities,
        recommendation: coin.recommendation.action,
        confidence: coin.recommendation.confidence,
        riskLevel: coin.recommendation.riskLevel,
        reasoning: coin.recommendation.reasoning,
        lastUpdated: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('Error getting top 5 swing trading coins:', error);
      throw error;
    }
  }
}

module.exports = HistoricalDataService;

