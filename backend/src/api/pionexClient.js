const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');
const EventEmitter = require('events');

class PionexClient extends EventEmitter {
  constructor(apiKey, secretKey, options = {}) {
    super();
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.baseURL = options.baseURL || process.env.PIONEX_BASE_URL || 'https://api.pionex.com';
    this.wsURL = options.wsURL || process.env.PIONEX_WS_URL || 'wss://ws.pionex.com';
    
    // Retry configuration
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.rateLimitDelay = options.rateLimitDelay || 100;
    
    // WebSocket connection
    this.ws = null;
    this.wsReconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 5000;
    
    // Initialize axios instance
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: options.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TradingSystem/1.0.0'
      }
    });
    
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor for authentication
    this.httpClient.interceptors.request.use(
      (config) => {
        if (config.requiresAuth !== false) {
          const timestamp = Date.now();
          const signature = this.generateSignature(config.method, config.url, config.data, timestamp);
          
          config.headers['PIONEX-KEY'] = this.apiKey;
          config.headers['PIONEX-SIGNATURE'] = signature;
          config.headers['PIONEX-TIMESTAMP'] = timestamp;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        const customError = this.handleHttpError(error);
        return Promise.reject(customError);
      }
    );
  }

  generateSignature(method, url, data, timestamp) {
    const message = `${method.toUpperCase()}${url}${data ? JSON.stringify(data) : ''}${timestamp}`;
    return crypto.createHmac('sha256', this.secretKey).update(message).digest('hex');
  }

  handleHttpError(error) {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      return new Error(`Pionex API Error (${status}): ${data.message || data.error || 'Unknown error'}`);
    } else if (error.request) {
      // Request was made but no response received
      return new Error('Pionex API Error: No response received from server');
    } else {
      // Something else happened
      return new Error(`Pionex API Error: ${error.message}`);
    }
  }

  async makeRequest(method, endpoint, data = null, options = {}) {
    const requestConfig = {
      method,
      url: endpoint,
      data,
      ...options
    };

    return this.executeWithRetry(() => this.httpClient(requestConfig));
  }

  async executeWithRetry(requestFn, attempt = 1) {
    try {
      const response = await requestFn();
      return response.data;
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Check if error is retryable
      if (this.isRetryableError(error)) {
        const delay = this.retryDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        console.warn(`Request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms:`, error.message);
        
        await this.sleep(delay);
        return this.executeWithRetry(requestFn, attempt + 1);
      }

      throw error;
    }
  }

  isRetryableError(error) {
    // Retry on network errors, timeouts, and certain HTTP status codes
    if (!error.response) return true; // Network error
    
    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors or rate limiting
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // REST API Methods
  async getServerTime() {
    return this.makeRequest('GET', '/v1/common/timestamp', null, { requiresAuth: false });
  }

  async getExchangeInfo() {
    return this.makeRequest('GET', '/v1/common/symbols', null, { requiresAuth: false });
  }

  async getTicker(symbol) {
    return this.makeRequest('GET', '/v1/market/ticker', null, { 
      params: { symbol },
      requiresAuth: false 
    });
  }

  async getKlines(symbol, interval, limit = 500) {
    return this.makeRequest('GET', '/v1/market/klines', null, {
      params: { symbol, interval, limit },
      requiresAuth: false
    });
  }

  async getAccountInfo() {
    return this.makeRequest('GET', '/v1/account/balances');
  }

  async getOpenOrders(symbol = null) {
    const params = symbol ? { symbol } : {};
    return this.makeRequest('GET', '/v1/trade/orders', null, { params });
  }

  async getOrderHistory(symbol = null, limit = 100) {
    const params = { limit };
    if (symbol) params.symbol = symbol;
    return this.makeRequest('GET', '/v1/trade/orders/history', null, { params });
  }

  async placeOrder(symbol, side, type, quantity, price = null, options = {}) {
    const orderData = {
      symbol,
      side,
      type,
      quantity,
      ...options
    };

    if (price && (type === 'limit' || type === 'stop_limit')) {
      orderData.price = price;
    }

    return this.makeRequest('POST', '/v1/trade/orders', orderData);
  }

  async cancelOrder(orderId, symbol) {
    return this.makeRequest('DELETE', `/v1/trade/orders/${orderId}`, { symbol });
  }

  async cancelAllOrders(symbol = null) {
    const data = symbol ? { symbol } : {};
    return this.makeRequest('DELETE', '/v1/trade/orders', data);
  }

  // WebSocket Methods
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    console.log('Connecting to Pionex WebSocket...');
    this.ws = new WebSocket(this.wsURL);

    this.ws.on('open', () => {
      console.log('WebSocket connected successfully');
      this.wsReconnectAttempts = 0;
      this.emit('wsConnected');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('wsError', error);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      this.emit('wsDisconnected', { code, reason });
      this.handleWebSocketReconnect();
    });
  }

  handleWebSocketMessage(message) {
    const { event, data, symbol } = message;

    switch (event) {
      case 'ticker':
        this.emit('ticker', { symbol, data });
        break;
      case 'kline':
        this.emit('kline', { symbol, data });
        break;
      case 'orderUpdate':
        this.emit('orderUpdate', data);
        break;
      case 'balanceUpdate':
        this.emit('balanceUpdate', data);
        break;
      default:
        this.emit('message', message);
    }
  }

  handleWebSocketReconnect() {
    if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max WebSocket reconnection attempts reached');
      this.emit('wsReconnectFailed');
      return;
    }

    this.wsReconnectAttempts++;
    const delay = this.reconnectDelay * this.wsReconnectAttempts;
    
    console.log(`Attempting WebSocket reconnection ${this.wsReconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  subscribeToTicker(symbol) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      method: 'SUBSCRIBE',
      params: [`${symbol.toLowerCase()}@ticker`],
      id: Date.now()
    };

    this.ws.send(JSON.stringify(message));
  }

  subscribeToKlines(symbol, interval) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      method: 'SUBSCRIBE',
      params: [`${symbol.toLowerCase()}@kline_${interval}`],
      id: Date.now()
    };

    this.ws.send(JSON.stringify(message));
  }

  unsubscribe(streams) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      method: 'UNSUBSCRIBE',
      params: Array.isArray(streams) ? streams : [streams],
      id: Date.now()
    };

    this.ws.send(JSON.stringify(message));
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Utility Methods
  validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol: must be a non-empty string');
    }
    return symbol.toUpperCase();
  }

  validateSide(side) {
    const validSides = ['buy', 'sell'];
    if (!validSides.includes(side.toLowerCase())) {
      throw new Error(`Invalid side: must be one of ${validSides.join(', ')}`);
    }
    return side.toLowerCase();
  }

  validateOrderType(type) {
    const validTypes = ['market', 'limit', 'stop', 'stop_limit'];
    if (!validTypes.includes(type.toLowerCase())) {
      throw new Error(`Invalid order type: must be one of ${validTypes.join(', ')}`);
    }
    return type.toLowerCase();
  }

  formatPrice(price, precision = 8) {
    return parseFloat(parseFloat(price).toFixed(precision));
  }

  formatQuantity(quantity, precision = 8) {
    return parseFloat(parseFloat(quantity).toFixed(precision));
  }
}

module.exports = PionexClient;

