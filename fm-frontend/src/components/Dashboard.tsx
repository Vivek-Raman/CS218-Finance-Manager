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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Upload, LogOut, AlertCircle, ChevronLeft, ChevronRight, BarChart3, RefreshCw, TrendingUp, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useEffect, useState } from "react"
import { authenticatedFetch, formatDate } from "@/lib/utils"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { toast } from "sonner"

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
  const { signOut, user } = useAuth()
  const [uncategorizedCount, setUncategorizedCount] = useState<number>(0)
  const [isLoadingCount, setIsLoadingCount] = useState<boolean>(true)
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]) // All expenses from API
  const [isLoadingExpenses, setIsLoadingExpenses] = useState<boolean>(true)
  const [expensesError, setExpensesError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [itemsPerPage, setItemsPerPage] = useState<number>(5)
  
  // Calculate paginated expenses from allExpenses
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const expenses = allExpenses.slice(startIndex, endIndex)
  const totalCount = allExpenses.length
  const totalPages = Math.ceil(totalCount / itemsPerPage)
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
  const [isFlushDialogOpen, setIsFlushDialogOpen] = useState<boolean>(false)
  const [isFlushing, setIsFlushing] = useState<boolean>(false)

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

  // Fetch ALL categorized expenses from API - pagination handled client-side
  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoadingExpenses(true)
      setExpensesError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        
        // Build query parameters - no pagination params needed
        const params = new URLSearchParams({
          categorized: 'true',
        })
        
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
        
        // Backend returns all expenses in descending order (newest first)
        setAllExpenses(backendExpenses)
      } catch (err) {
        console.error("Error fetching expenses:", err)
        setExpensesError(err instanceof Error ? err.message : 'Failed to fetch expenses')
      } finally {
        setIsLoadingExpenses(false)
      }
    }
    
    fetchExpenses()
  }, [])

  const handleIngestCSV = () => {
    navigate("/ingest")
  }

  const handleCategorizeExpenses = () => {
    navigate("/categorize")
  }

  const handleLogout = () => {
    signOut()
  }

  // Reset to page 1 when page size changes
  useEffect(() => {
    setCurrentPage(1)
  }, [itemsPerPage])

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
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
  const handleRefreshAnalytics = () => {
    setIsRefreshingAnalytics(true)
    setRefreshError(null)
    setRefreshSuccess(null)
    
    const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
    const endpoint = `${apiUrl}/api/expenses/analysis/refresh`
    
    // Fire and forget - don't await the API call
    authenticatedFetch(endpoint, {
      method: 'POST',
    }).catch((err) => {
      console.error("Error refreshing analytics:", err)
    })
    
    // Pretend to load for 1s, then show success toast
    setTimeout(() => {
      setIsRefreshingAnalytics(false)
      toast.success("Analytics refresh initiated successfully!")
      
      // Wait 3s more, then reload the page
      setTimeout(() => {
        window.location.reload()
      }, 3000)
    }, 1000)
  }

  // Flush expenses handler
  const handleFlushExpenses = async () => {
    setIsFlushing(true)
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
      const endpoint = `${apiUrl}/api/expenses/flush`
      
      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      toast.success(`Successfully flushed ${result.data?.expensesDeleted || 0} expenses and ${result.data?.analyticsDeleted || 0} analytics`)
      
      setIsFlushDialogOpen(false)
      
      // Reload the page after a short delay to refresh all data
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      console.error("Error flushing expenses:", err)
      toast.error(err instanceof Error ? err.message : 'Failed to flush expenses and analytics')
    } finally {
      setIsFlushing(false)
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
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted-foreground">
                {user.username || user.name || user.email || 'User'}
              </span>
            )}
            <Button onClick={handleLogout} variant="outline" className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
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
                <CardTitle>Analyze Expenditure</CardTitle>
              </div>
              <CardDescription>
                Analyze and recalculate expenditure analytics for all expenses
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
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Analyze Expenditure
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
                      margin={{ top: 10, right: 50, left: 30, bottom: 80 }}
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
                        width={60}
                      />
                      <Tooltip 
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        labelStyle={{ color: '#000' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
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
                          Showing {startIndex + 1} to {Math.min(endIndex, totalCount)} of {totalCount} expenses
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
                      {totalPages > 1 && (
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
                            Page {currentPage} of {totalPages}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={currentPage >= totalPages}
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

        {/* Flush Expenses Button */}
        <div className="mt-8 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => setIsFlushDialogOpen(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Flush All Expenses and Analytics
          </Button>
        </div>

        {/* Flush Confirmation Dialog */}
        <Dialog open={isFlushDialogOpen} onOpenChange={setIsFlushDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Flush All Expenses and Analytics</DialogTitle>
              <DialogDescription>
                This action will permanently delete all expenses and analytics data for your account. 
                This cannot be undone. Are you sure you want to continue?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFlushDialogOpen(false)}
                disabled={isFlushing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleFlushExpenses}
                disabled={isFlushing}
              >
                {isFlushing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Flushing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Flush All Data
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

