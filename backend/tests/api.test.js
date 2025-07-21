const request = require('supertest');
const express = require('express');

// Mock app for testing
const app = express();

describe('Trading System API Tests', () => {
  
  describe('Health Check', () => {
    test('GET /health should return 200', async () => {
      const response = await request('http://localhost:3001')
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Top 5 Coins API', () => {
    test('GET /api/coins/top5 should return coin data', async () => {
      const response = await request('http://localhost:3001')
        .get('/api/coins/top5')
        .expect(200);
      
      expect(response.body).toHaveProperty('coins');
      expect(response.body).toHaveProperty('lastUpdated');
      expect(Array.isArray(response.body.coins)).toBe(true);
      expect(response.body.coins.length).toBeLessThanOrEqual(5);
    });

    test('Each coin should have required properties', async () => {
      const response = await request('http://localhost:3001')
        .get('/api/coins/top5')
        .expect(200);
      
      if (response.body.coins.length > 0) {
        const coin = response.body.coins[0];
        expect(coin).toHaveProperty('symbol');
        expect(coin).toHaveProperty('name');
        expect(coin).toHaveProperty('profitabilityScore');
        expect(coin).toHaveProperty('winRate');
        expect(coin).toHaveProperty('avgReturn');
        expect(coin).toHaveProperty('recommendation');
      }
    });
  });

  describe('Copy Trading Signals API', () => {
    test('GET /api/copy-signals should return signals array', async () => {
      const response = await request('http://localhost:3001')
        .get('/api/copy-signals')
        .expect(200);
      
      expect(response.body).toHaveProperty('signals');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('lastUpdated');
      expect(Array.isArray(response.body.signals)).toBe(true);
    });

    test('POST /api/copy-signals/generate should generate signals', async () => {
      const response = await request('http://localhost:3001')
        .post('/api/copy-signals/generate')
        .expect(200);
      
      expect(response.body).toHaveProperty('signals');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('generated');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Strategy Optimization API', () => {
    test('GET /api/strategies/optimize should return optimizations', async () => {
      const response = await request('http://localhost:3001')
        .get('/api/strategies/optimize')
        .expect(200);
      
      expect(response.body).toHaveProperty('optimizations');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Performance Analytics API', () => {
    test('GET /api/analytics/performance should return analytics', async () => {
      const response = await request('http://localhost:3001')
        .get('/api/analytics/performance')
        .expect(200);
      
      expect(response.body).toHaveProperty('analytics');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

});

// Integration tests
describe('Integration Tests', () => {
  
  test('Full workflow: Generate signals and retrieve them', async () => {
    // Generate signals
    const generateResponse = await request('http://localhost:3001')
      .post('/api/copy-signals/generate')
      .expect(200);
    
    expect(generateResponse.body.count).toBeGreaterThanOrEqual(0);
    
    // Retrieve active signals
    const signalsResponse = await request('http://localhost:3001')
      .get('/api/copy-signals')
      .expect(200);
    
    expect(signalsResponse.body.signals).toBeDefined();
  });

  test('Dashboard data consistency', async () => {
    const coinsResponse = await request('http://localhost:3001')
      .get('/api/coins/top5')
      .expect(200);
    
    const analyticsResponse = await request('http://localhost:3001')
      .get('/api/analytics/performance')
      .expect(200);
    
    // Both endpoints should return valid data
    expect(coinsResponse.body.coins).toBeDefined();
    expect(analyticsResponse.body.analytics).toBeDefined();
  });

});

// Error handling tests
describe('Error Handling', () => {
  
  test('GET /api/copy-signals/nonexistent should return 404', async () => {
    await request('http://localhost:3001')
      .get('/api/copy-signals/NONEXISTENT')
      .expect(404);
  });

  test('Invalid endpoints should return 404', async () => {
    await request('http://localhost:3001')
      .get('/api/invalid-endpoint')
      .expect(404);
  });

});

