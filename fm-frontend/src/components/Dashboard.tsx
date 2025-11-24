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
import { Upload, LogOut, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useEffect, useState } from "react"
import { authenticatedFetch, formatDate } from "@/lib/utils"

interface Expense {
  id: string
  summary: string
  amount: number
  timestamp: string
  category?: string
  categorizedAt?: string
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
  // lastEvaluatedKey is DynamoDB's cursor for pagination - required for efficient server-side pagination
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState<string | null>(null)

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
        // Use the current lastEvaluatedKey value (from previous page fetch)
        if (currentPage > 1 && lastEvaluatedKey) {
          params.append('lastEvaluatedKey', lastEvaluatedKey)
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
        
        // Sort by timestamp descending (newest first)
        const sortedExpenses = backendExpenses.sort((a: Expense, b: Expense) => {
          const dateA = new Date(a.timestamp).getTime()
          const dateB = new Date(b.timestamp).getTime()
          return dateB - dateA
        })
        
        setExpenses(sortedExpenses)
        setLastEvaluatedKey(result.lastEvaluatedKey || null)
        
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
    setLastEvaluatedKey(null)
    setTotalCount(null) // Reset count when page size changes
  }, [itemsPerPage])

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1
      setCurrentPage(newPage)
      // Reset lastEvaluatedKey when going back to page 1
      if (newPage === 1) {
        setLastEvaluatedKey(null)
      }
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

