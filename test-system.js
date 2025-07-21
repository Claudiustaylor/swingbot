#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testSystem() {
  console.log('🧪 Testing Swing Trading Bot System...\n');
  
  const tests = [
    {
      name: 'Health Check',
      url: `${BASE_URL}/health`,
      method: 'GET'
    },
    {
      name: 'Top 5 Coins',
      url: `${BASE_URL}/api/coins/top5`,
      method: 'GET'
    },
    {
      name: 'Copy Trading Signals',
      url: `${BASE_URL}/api/copy-signals`,
      method: 'GET'
    },
    {
      name: 'Generate Signals',
      url: `${BASE_URL}/api/copy-signals/generate`,
      method: 'POST'
    },
    {
      name: 'Strategy Optimization',
      url: `${BASE_URL}/api/strategies/optimize`,
      method: 'GET'
    },
    {
      name: 'Performance Analytics',
      url: `${BASE_URL}/api/analytics/performance`,
      method: 'GET'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const response = await axios({
        method: test.method,
        url: test.url,
        timeout: 5000
      });
      
      if (response.status === 200) {
        console.log(`✅ ${test.name}: PASSED (${response.status})`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED (${response.status})`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: FAILED (${error.message})`);
      failed++;
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! System is ready for deployment.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the server status.');
  }
}

// Run tests
testSystem().catch(console.error);

