import { useState, useEffect } from 'react'
import './App.css'
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Progress } from './components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'

function App() {
  const [topCoins, setTopCoins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Fetch top 5 coins data
  useEffect(() => {
    const fetchTopCoins = async () => {
      try {
        setLoading(true)
        const response = await fetch('http://localhost:3001/api/coins/top5')
        const data = await response.json()
        
        if (response.ok) {
          setTopCoins(data.coins)
          setLastUpdated(data.lastUpdated)
          setError(null)
        } else {
          throw new Error(data.error || 'Failed to fetch data')
        }
      } catch (err) {
        setError(err.message)
        console.error('Error fetching top coins:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTopCoins()
    
    // Refresh data every 5 minutes
    const interval = setInterval(fetchTopCoins, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'Strong Buy': return 'bg-green-500'
      case 'Buy': return 'bg-blue-500'
      case 'Hold': return 'bg-yellow-500'
      case 'Avoid': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'Low': return 'text-green-600'
      case 'Medium': return 'text-yellow-600'
      case 'Medium-High': return 'text-orange-600'
      case 'High': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(value)
  }

  const formatPercentage = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mb-4"></div>
          <p className="text-white text-xl">Analyzing market data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Swing Trading Bot</h1>
                <p className="text-gray-300">Crypto Analysis Dashboard</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Last Updated</p>
              <p className="text-white font-medium">
                {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <Card className="mb-6 border-red-500/50 bg-red-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-200">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Total Coins Analyzed</CardTitle>
              <Activity className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{topCoins.length}</div>
              <p className="text-xs text-gray-400">Top performing coins</p>
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Avg Win Rate</CardTitle>
              <Target className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {topCoins.length > 0 ? 
                  `${(topCoins.reduce((acc, coin) => acc + coin.winRate, 0) / topCoins.length).toFixed(1)}%` 
                  : '0%'
                }
              </div>
              <p className="text-xs text-gray-400">Across top 5 coins</p>
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Avg Return</CardTitle>
              <DollarSign className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {topCoins.length > 0 ? 
                  formatPercentage(topCoins.reduce((acc, coin) => acc + coin.avgReturn, 0) / topCoins.length)
                  : '+0.00%'
                }
              </div>
              <p className="text-xs text-gray-400">Per swing trade</p>
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Strong Buy Signals</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {topCoins.filter(coin => coin.recommendation === 'Strong Buy').length}
              </div>
              <p className="text-xs text-gray-400">High confidence trades</p>
            </CardContent>
          </Card>
        </div>

        {/* Top 5 Coins */}
        <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl text-white flex items-center space-x-2">
              <TrendingUp className="h-6 w-6 text-blue-400" />
              <span>Top 5 Swing Trading Opportunities</span>
            </CardTitle>
            <CardDescription className="text-gray-400">
              Based on 3-year historical analysis with profitability scoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {topCoins.map((coin, index) => (
                <div key={coin.symbol} className="p-6 rounded-lg bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-white/10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold text-lg">
                        #{coin.rank}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{coin.name}</h3>
                        <p className="text-gray-400">{coin.symbol}</p>
                        <p className="text-sm text-gray-500">{formatCurrency(coin.currentPrice)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={`${getRecommendationColor(coin.recommendation)} text-white mb-2`}>
                        {coin.recommendation}
                      </Badge>
                      <p className="text-sm text-gray-400">Confidence: {coin.confidence}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-400">Profitability Score</p>
                      <div className="flex items-center space-x-2">
                        <Progress value={coin.profitabilityScore} className="flex-1" />
                        <span className="text-white font-medium">{coin.profitabilityScore}/100</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Win Rate</p>
                      <p className="text-lg font-semibold text-green-400">{coin.winRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Avg Return</p>
                      <p className={`text-lg font-semibold ${coin.avgReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercentage(coin.avgReturn)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Risk Level</p>
                      <p className={`text-lg font-semibold ${getRiskColor(coin.riskLevel)}`}>
                        {coin.riskLevel}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-400">Volatility</p>
                      <p className="text-white">{coin.volatility.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Max Drawdown</p>
                      <p className="text-red-400">{coin.maxDrawdown.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Opportunities</p>
                      <p className="text-blue-400">{coin.opportunities} trades</p>
                    </div>
                  </div>

                  <div className="p-3 bg-black/30 rounded-lg">
                    <p className="text-sm text-gray-300">{coin.reasoning}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Card className="mt-8 bg-yellow-500/10 border-yellow-500/50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-yellow-200 mb-2">Investment Disclaimer</h4>
                <p className="text-sm text-yellow-100">
                  This analysis is based on historical data and does not guarantee future performance. 
                  Cryptocurrency trading involves substantial risk and may result in significant losses. 
                  Please conduct your own research and consider your risk tolerance before making any investment decisions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default App

