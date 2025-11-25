import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Upload, LogOut, AlertCircle, ChevronLeft, ChevronRight, BarChart3, RefreshCw, TrendingUp } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useEffect, useState } from "react"
import { authenticatedFetch, formatDate } from "@/lib/utils"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

interface Expense {
  id: string
  summary: string
  amount: number
  timestamp: string
  category?: string
  categorizedAt?: string
}

interface AnalysisData {
  categoryBreakdown: Record<string, number>
  totalAmount: number
  expenseCount: number
  lastUpdated: string
}

interface MonthlyTrendData {
  monthlyTrend: Record<string, Record<string, number>>
  lastUpdated: string
}

export function Dashboard() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [uncategorizedCount, setUncategorizedCount] = useState<number>(0)
  const [isLoadingCount, setIsLoadingCount] = useState<boolean>(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoadingExpenses, setIsLoadingExpenses] = useState<boolean>(true)
  const [expensesError, setExpensesError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [itemsPerPage, setItemsPerPage] = useState<number>(5)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  // Store cursors for each page to support bidirectional navigation with DynamoDB
  // pageCursors[n] stores the cursor needed to fetch page n+1
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({})
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(true)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [allTimeAnalysisData, setAllTimeAnalysisData] = useState<AnalysisData | null>(null)
  const [isLoadingAllTimeAnalysis, setIsLoadingAllTimeAnalysis] = useState<boolean>(true)
  const [allTimeAnalysisError, setAllTimeAnalysisError] = useState<string | null>(null)
  const [isRefreshingAnalytics, setIsRefreshingAnalytics] = useState<boolean>(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshSuccess, setRefreshSuccess] = useState<string | null>(null)
  const [monthlyTrendData, setMonthlyTrendData] = useState<MonthlyTrendData | null>(null)
  const [isLoadingMonthlyTrend, setIsLoadingMonthlyTrend] = useState<boolean>(true)
  const [monthlyTrendError, setMonthlyTrendError] = useState<string | null>(null)

  // Fetch uncategorized expenses count
  useEffect(() => {
    const fetchUncategorizedCount = async () => {
      setIsLoadingCount(true)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        const endpoint = `${apiUrl}/api/expenses?categorized=false&limit=5`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          console.error('Failed to fetch uncategorized expenses count')
          setUncategorizedCount(0)
          return
        }
        
        const result = await response.json()
        // Use totalCount from API response instead of counting items
        setUncategorizedCount(result.totalCount || 0)
      } catch (err) {
        console.error("Error fetching uncategorized expenses count:", err)
        setUncategorizedCount(0)
      } finally {
        setIsLoadingCount(false)
      }
    }

    fetchUncategorizedCount()
  }, [])

  // Fetch analysis data
  useEffect(() => {
    const fetchAnalysis = async () => {
      setIsLoadingAnalysis(true)
      setAnalysisError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        const endpoint = `${apiUrl}/api/expenses/analysis`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        if (result.data) {
          setAnalysisData(result.data)
        } else {
          setAnalysisData(null)
        }
      } catch (err) {
        console.error("Error fetching analysis:", err)
        setAnalysisError(err instanceof Error ? err.message : 'Failed to fetch analysis')
        setAnalysisData(null)
      } finally {
        setIsLoadingAnalysis(false)
      }
    }

    fetchAnalysis()
  }, [])

  // Fetch all-time analysis data
  useEffect(() => {
    const fetchAllTimeAnalysis = async () => {
      setIsLoadingAllTimeAnalysis(true)
      setAllTimeAnalysisError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        const endpoint = `${apiUrl}/api/expenses/analysis/all-time`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        if (result.data) {
          setAllTimeAnalysisData(result.data)
        } else {
          setAllTimeAnalysisData(null)
        }
      } catch (err) {
        console.error("Error fetching all-time analysis:", err)
        setAllTimeAnalysisError(err instanceof Error ? err.message : 'Failed to fetch all-time analysis')
        setAllTimeAnalysisData(null)
      } finally {
        setIsLoadingAllTimeAnalysis(false)
      }
    }

    fetchAllTimeAnalysis()
  }, [])

  // Fetch monthly trend data
  useEffect(() => {
    const fetchMonthlyTrend = async () => {
      setIsLoadingMonthlyTrend(true)
      setMonthlyTrendError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        const endpoint = `${apiUrl}/api/expenses/analysis/monthly-trend`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        if (result.data) {
          setMonthlyTrendData(result.data)
        } else {
          setMonthlyTrendData(null)
        }
      } catch (err) {
        console.error("Error fetching monthly trend:", err)
        setMonthlyTrendError(err instanceof Error ? err.message : 'Failed to fetch monthly trend')
        setMonthlyTrendData(null)
      } finally {
        setIsLoadingMonthlyTrend(false)
      }
    }

    fetchMonthlyTrend()
  }, [])

  // Fetch categorized expenses from API - only fetch current page
  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoadingExpenses(true)
      setExpensesError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        
        // Build query parameters
        const params = new URLSearchParams({
          categorized: 'true',
          limit: Math.min(itemsPerPage, 50).toString(),
        })
        
        // Add lastEvaluatedKey if we're not on page 1
        // Use the cursor stored for the previous page
        const cursorForPage = currentPage > 1 ? pageCursors[currentPage - 1] : null
        if (cursorForPage) {
          params.append('lastEvaluatedKey', cursorForPage)
        }
        
        const endpoint = `${apiUrl}/api/expenses?${params.toString()}`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        const backendExpenses = result.data || []
        
        // Backend returns expenses in descending order (newest first), no need to sort
        setExpenses(backendExpenses)
        const newCursor = result.lastEvaluatedKey || null
        
        // Store cursor for current page to enable forward navigation
        // This cursor is used to fetch the next page
        setPageCursors(prev => ({
          ...prev,
          [currentPage]: newCursor
        }))
        
        // Update total count if provided
        if (result.totalCount !== undefined && result.totalCount !== null) {
          setTotalCount(result.totalCount)
        }
      } catch (err) {
        console.error("Error fetching expenses:", err)
        setExpensesError(err instanceof Error ? err.message : 'Failed to fetch expenses')
      } finally {
        setIsLoadingExpenses(false)
      }
    }
    
    fetchExpenses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage])

  const handleIngestCSV = () => {
    navigate("/ingest")
  }

  const handleCategorizeExpenses = () => {
    navigate("/categorize")
  }

  const handleLogout = () => {
    signOut()
  }

  // Calculate pagination
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + expenses.length
  const totalPages = totalCount !== null ? Math.ceil(totalCount / itemsPerPage) : null
  const hasMorePages = totalPages !== null ? currentPage < totalPages : false

  // Reset to page 1 when page size changes
  useEffect(() => {
    setCurrentPage(1)
    setPageCursors({}) // Clear all page cursors when page size changes
    setTotalCount(null) // Reset count when page size changes
  }, [itemsPerPage])

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1
      setCurrentPage(newPage)
      // Cursor for previous page is already stored in pageCursors
    }
  }

  const handleNextPage = () => {
    if (hasMorePages && expenses.length > 0) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePageSizeChange = (value: string) => {
    const newValue = Math.min(Number(value), 50)
    setItemsPerPage(newValue)
  }

  // Transform monthly trend data for chart
  const transformMonthlyTrendData = () => {
    if (!monthlyTrendData?.monthlyTrend) return []
    
    const monthlyTrend = monthlyTrendData.monthlyTrend
    const months = Object.keys(monthlyTrend).sort()
    const allCategories = new Set<string>()
    
    // Collect all unique categories
    months.forEach(month => {
      Object.keys(monthlyTrend[month]).forEach(category => {
        allCategories.add(category)
      })
    })
    
    // Transform to chart data format
    return months.map(month => {
      const dataPoint: Record<string, string | number> = { month }
      allCategories.forEach(category => {
        dataPoint[category] = monthlyTrend[month][category] || 0
      })
      return dataPoint
    })
  }

  const chartData = transformMonthlyTrendData()
  const chartCategories = chartData.length > 0 
    ? Object.keys(chartData[0]).filter(key => key !== 'month')
    : []
  
  // Generate colors for categories
  const categoryColors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', 
    '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#888888'
  ]

  // Refresh analytics handler
  const handleRefreshAnalytics = async () => {
    setIsRefreshingAnalytics(true)
    setRefreshError(null)
    setRefreshSuccess(null)
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
      const endpoint = `${apiUrl}/api/expenses/analysis/refresh`
      
      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      setRefreshSuccess(`Analytics refreshed successfully! Processed: ${result.data?.processed || 0}, Successful: ${result.data?.successful || 0}`)
      
      // Refetch both analysis endpoints after successful refresh
      const fetchAnalysis = async () => {
        setIsLoadingAnalysis(true)
        setAnalysisError(null)
        
        try {
          const analysisEndpoint = `${apiUrl}/api/expenses/analysis`
          const analysisResponse = await authenticatedFetch(analysisEndpoint, {
            method: 'GET',
          })
          
          if (analysisResponse.ok) {
            const analysisResult = await analysisResponse.json()
            if (analysisResult.data) {
              setAnalysisData(analysisResult.data)
            }
          }
        } catch (err) {
          console.error("Error refetching analysis:", err)
        } finally {
          setIsLoadingAnalysis(false)
        }
      }

      const fetchAllTimeAnalysis = async () => {
        setIsLoadingAllTimeAnalysis(true)
        setAllTimeAnalysisError(null)
        
        try {
          const allTimeEndpoint = `${apiUrl}/api/expenses/analysis/all-time`
          const allTimeResponse = await authenticatedFetch(allTimeEndpoint, {
            method: 'GET',
          })
          
          if (allTimeResponse.ok) {
            const allTimeResult = await allTimeResponse.json()
            if (allTimeResult.data) {
              setAllTimeAnalysisData(allTimeResult.data)
            }
          }
        } catch (err) {
          console.error("Error refetching all-time analysis:", err)
        } finally {
          setIsLoadingAllTimeAnalysis(false)
        }
      }

      const fetchMonthlyTrend = async () => {
        setIsLoadingMonthlyTrend(true)
        setMonthlyTrendError(null)
        
        try {
          const monthlyTrendEndpoint = `${apiUrl}/api/expenses/analysis/monthly-trend`
          const monthlyTrendResponse = await authenticatedFetch(monthlyTrendEndpoint, {
            method: 'GET',
          })
          
          if (monthlyTrendResponse.ok) {
            const monthlyTrendResult = await monthlyTrendResponse.json()
            if (monthlyTrendResult.data) {
              setMonthlyTrendData(monthlyTrendResult.data)
            }
          }
        } catch (err) {
          console.error("Error refetching monthly trend:", err)
        } finally {
          setIsLoadingMonthlyTrend(false)
        }
      }

      // Refetch all analyses in parallel
      await Promise.all([fetchAnalysis(), fetchAllTimeAnalysis(), fetchMonthlyTrend()])
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setRefreshSuccess(null)
      }, 5000)
    } catch (err) {
      console.error("Error refreshing analytics:", err)
      setRefreshError(err instanceof Error ? err.message : 'Failed to refresh analytics')
    } finally {
      setIsRefreshingAnalytics(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Finance Manager</h1>
            <p className="text-muted-foreground mt-2">
              Manage your finances with ease
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline" className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-105">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Upload className="h-6 w-6 text-primary" />
                <CardTitle>Ingest CSV</CardTitle>
              </div>
              <CardDescription>
                Upload and import your financial data from CSV files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleIngestCSV} className="w-full">
                Upload CSV
              </Button>
            </CardContent>
          </Card>

          {!isLoadingCount && uncategorizedCount > 0 && (
            <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-105 border-orange-200 dark:border-orange-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  <CardTitle>Uncategorized Expenses</CardTitle>
                </div>
                <CardDescription>
                  You have expenses waiting to be categorized
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleCategorizeExpenses} className="w-full">
                  Categorize Now
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="transition-all hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-6 w-6 text-primary" />
                <CardTitle>Refresh Analytics</CardTitle>
              </div>
              <CardDescription>
                Manually trigger analytics recalculation for all expenses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={handleRefreshAnalytics} 
                className="w-full"
                disabled={isRefreshingAnalytics}
              >
                {isRefreshingAnalytics ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Analytics
                  </>
                )}
              </Button>
              {refreshError && (
                <div className="p-2 bg-destructive/10 text-destructive rounded-md text-sm">
                  {refreshError}
                </div>
              )}
              {refreshSuccess && (
                <div className="p-2 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md text-sm">
                  {refreshSuccess}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Analysis Cards */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Monthly Trend Chart Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                <CardTitle>Category-wise Monthly Trend</CardTitle>
              </div>
              <CardDescription>
                Track your expenses by category over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMonthlyTrend ? (
                <div className="space-y-4">
                  <Skeleton className="h-[400px] w-full" />
                </div>
              ) : monthlyTrendError ? (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  Error: {monthlyTrendError}
                </div>
              ) : !monthlyTrendData || chartData.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No monthly trend data available. Upload and categorize some expenses to see trends.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                      />
                      <Tooltip 
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        labelStyle={{ color: '#000' }}
                      />
                      <Legend />
                      {chartCategories.map((category, index) => (
                        <Line
                          key={category}
                          type="monotone"
                          dataKey={category}
                          stroke={categoryColors[index % categoryColors.length]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  {monthlyTrendData.lastUpdated && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Last updated: {formatDate(monthlyTrendData.lastUpdated)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          {/* Month to Date Analysis Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                <CardTitle>Expenses by Category - Month to Date</CardTitle>
              </div>
              <CardDescription>
                Breakdown of your expenses by category for the current month
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAnalysis ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : analysisError ? (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  Error: {analysisError}
                </div>
              ) : !analysisData ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No analysis data available for the current month. Upload and categorize some expenses to see analytics.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Expenses</p>
                      <p className="text-2xl font-bold">${analysisData.totalAmount.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Expense Count</p>
                      <p className="text-2xl font-bold">{analysisData.expenseCount}</p>
                    </div>
                  </div>
                  
                  {Object.keys(analysisData.categoryBreakdown).length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm mb-3">Category Breakdown</h3>
                      {Object.entries(analysisData.categoryBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([category, amount]) => {
                          const percentage = analysisData.totalAmount > 0 
                            ? ((amount / analysisData.totalAmount) * 100).toFixed(1)
                            : '0'
                          return (
                            <div key={category} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{category}</span>
                                <span className="text-muted-foreground">
                                  ${amount.toFixed(2)} ({percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No categorized expenses found
                    </div>
                  )}
                  
                  {analysisData.lastUpdated && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Last updated: {formatDate(analysisData.lastUpdated)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All-Time Analysis Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                <CardTitle>Expenses by Category - All-Time</CardTitle>
              </div>
              <CardDescription>
                Breakdown of all your expenses by category across all time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAllTimeAnalysis ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : allTimeAnalysisError ? (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  Error: {allTimeAnalysisError}
                </div>
              ) : !allTimeAnalysisData ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No all-time analysis data available. Upload and categorize some expenses to see analytics.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Expenses</p>
                      <p className="text-2xl font-bold">${allTimeAnalysisData.totalAmount.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Expense Count</p>
                      <p className="text-2xl font-bold">{allTimeAnalysisData.expenseCount}</p>
                    </div>
                  </div>
                  
                  {Object.keys(allTimeAnalysisData.categoryBreakdown).length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm mb-3">Category Breakdown</h3>
                      {Object.entries(allTimeAnalysisData.categoryBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([category, amount]) => {
                          const percentage = allTimeAnalysisData.totalAmount > 0 
                            ? ((amount / allTimeAnalysisData.totalAmount) * 100).toFixed(1)
                            : '0'
                          return (
                            <div key={category} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{category}</span>
                                <span className="text-muted-foreground">
                                  ${amount.toFixed(2)} ({percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No categorized expenses found
                    </div>
                  )}
                  
                  {allTimeAnalysisData.lastUpdated && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Last updated: {formatDate(allTimeAnalysisData.lastUpdated)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expenses Table Card */}
        <div className="mt-8">
          <Card className="md:col-span-1 lg:col-span-2">
            <CardHeader>
              <CardTitle>Expenses Table</CardTitle>
            </CardHeader>
            <CardContent>
              {expensesError && (
                <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  Error: {expensesError}
                </div>
              )}

              {isLoadingExpenses ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: itemsPerPage }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-48" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Skeleton className="h-4 w-16 ml-auto" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No categorized expenses found. Categorize some expenses first.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Summary</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Category</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense: Expense) => (
                          <TableRow key={expense.id}>
                            <TableCell>{formatDate(expense.timestamp)}</TableCell>
                            <TableCell>{expense.summary}</TableCell>
                            <TableCell className="text-right font-medium">
                              ${expense.amount.toFixed(2)}
                            </TableCell>
                            <TableCell>{expense.category || 'N/A'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {expenses.length > 0 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-muted-foreground">
                          Showing {startIndex + 1} to {endIndex} {totalCount !== null ? `of ${totalCount}` : ''} expenses
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Rows per page:</span>
                          <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                            <SelectTrigger className="w-[70px] h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {(currentPage > 1 || hasMorePages) && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <div className="text-sm text-muted-foreground">
                            Page {currentPage}{totalPages !== null ? ` of ${totalPages}` : ''}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={!hasMorePages || expenses.length === 0}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

