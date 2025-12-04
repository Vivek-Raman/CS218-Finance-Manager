import { useState, useEffect, useRef } from "react"
import TinderCard from "react-tinder-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { authenticatedFetch } from "@/lib/utils"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Expense {
  id: string
  description: string
  amount: number
  date: string
  aiCategorySuggestion?: string
}

// Available categories
const categories = [
  "Food & Dining",
  "Office & Business",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Transportation",
  "Healthcare",
  "Education",
  "Travel",
  "Other",
]

// Format date as "dd MMM yyyy hh:mm XXX" where XXX is timezone abbreviation like PST, PDT
// If time is 00:00 or not specified, omit time and timezone
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  const day = date.getDate().toString().padStart(2, '0')
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  
  // If time is 00:00 or not specified, return only date
  if (hours === 0 && minutes === 0) {
    return `${day} ${month} ${year}`
  }
  
  // Get timezone abbreviation (e.g., PST, PDT, EST, EDT)
  const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
  })
  const parts = timezoneFormatter.formatToParts(date)
  const timezone = parts.find(part => part.type === 'timeZoneName')?.value || ''
  
  const hoursStr = hours.toString().padStart(2, '0')
  const minutesStr = minutes.toString().padStart(2, '0')
  
  return `${day} ${month} ${year} ${hoursStr}:${minutesStr} ${timezone}`
}

export function CategorizeExpenses() {
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false)
  const [pendingExpense, setPendingExpense] = useState<Expense | null>(null)
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [swipedCount, setSwipedCount] = useState<number>(0)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const overlayContentRef = useRef<HTMLDivElement | null>(null)
  const currentDirectionRef = useRef<string | null>(null)

  // Fetch expenses from API
  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        const endpoint = `${apiUrl}/api/expenses?categorized=false&limit=50`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        const backendExpenses = result.data || []
        
        const uncategorizedExpenses = backendExpenses.map((exp: any) => ({
          id: exp.id,
          description: exp.summary || '',
          amount: exp.amount || 0,
          date: exp.timestamp || '',
          aiCategorySuggestion: exp.aiCategorySuggestion,
        }))
        
        setExpenses(uncategorizedExpenses)
        setLastEvaluatedKey(result.lastEvaluatedKey || null)
        // Set total count only on initial load (when it's provided)
        if (result.totalCount !== null && result.totalCount !== undefined) {
          setTotalCount(result.totalCount)
        }
      } catch (err) {
        console.error("Error fetching expenses:", err)
        setError(err instanceof Error ? err.message : 'Failed to fetch expenses')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchExpenses()
  }, [])

  const handleSwipe = (direction: string, expense: Expense) => {
    // Clear swipe direction indicator immediately when swipe completes
    updateOverlay(null, null)
    currentDirectionRef.current = null
    
    switch (direction) {
      case "left":
        handleSwipeLeft(expense)
        break
      case "right":
        handleSwipeRight(expense)
        break
      default:
        break
    }
  }

  const updateExpenseCategory = async (expenseId: string, category: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
      const endpoint = `${apiUrl}/api/expenses`
      
      const response = await authenticatedFetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: expenseId,
          category: category,
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('Expense categorized successfully', result)
      toast.success("Expense categorized successfully")
    } catch (err) {
      console.error("Error updating expense category:", err)
      toast.error("Failed to categorize expense")
      throw err
    }
  }

  const handleSwipeLeft = async (expense: Expense) => {
    // Check if expense has AI category suggestion
    if (!expense.aiCategorySuggestion) {
      toast.error("No automatic category suggestion available. Swipe right to choose manually.")
      return
    }

    try {
      // Confirm the AI suggestion
      await updateExpenseCategory(expense.id, expense.aiCategorySuggestion)

      // Remove the swiped expense from the list after successful API call
      setExpenses((prevExpenses) =>
        prevExpenses.filter((e) => e.id !== expense.id)
      )

      // Increment swiped count
      setSwipedCount((prev) => prev + 1)
    } catch (err) {
      // Error already handled in updateExpenseCategory with toast
      // Don't remove card if API call failed
    }
  }

  const handleSwipeRight = (expense: Expense) => {
    // Store expense and open modal for category selection
    setPendingExpense(expense)
    setIsCategoryModalOpen(true)

    // Remove the card from state immediately (TinderCard already removed it from DOM)
    setExpenses((prevExpenses) =>
      prevExpenses.filter((e) => e.id !== expense.id)
    )

    // Increment swiped count
    setSwipedCount((prev) => prev + 1)
  }

  const handleCategorySelect = async (category: string) => {
    if (!pendingExpense) {
      return
    }

    try {
      // Update the expense category via API
      await updateExpenseCategory(pendingExpense.id, category)

      // Close modal and reset pending expense
      setIsCategoryModalOpen(false)
      setPendingExpense(null)
    } catch (err) {
      // Error already handled in updateExpenseCategory with toast
      // Keep modal open so user can try again
      // Card is already removed from state, so if API fails, user can still select category
    }
  }

  const handleCardLeftScreen = (expenseId: string) => {
    console.log(`Card ${expenseId} left the screen`)
    // Hide overlay by directly manipulating DOM
    if (overlayRef.current) {
      overlayRef.current.style.display = 'none'
    }
    currentDirectionRef.current = null
  }

  // Update overlay directly without React re-renders
  const updateOverlay = (direction: string | null, category: string | null) => {
    if (!overlayRef.current || !overlayContentRef.current) return
    
    if (direction && category) {
      overlayContentRef.current.textContent = category
      overlayRef.current.style.display = 'block'
    } else {
      overlayRef.current.style.display = 'none'
    }
  }

  // Track swipe direction in real-time by monitoring the top card's transform
  // Update overlay directly via DOM to avoid React re-renders that interrupt drag
  useEffect(() => {
    if (expenses.length === 0) {
      updateOverlay(null, null)
      currentDirectionRef.current = null
      return
    }

    const topCardId = expenses[0].id
    let animationFrameId: number | null = null
    let lastDirection: string | null = null

    const checkSwipeDirection = () => {
      try {
        // Find the TinderCard wrapper element (it's a direct child of our wrapper div)
        const wrapperDiv = cardRefs.current[topCardId]
        if (!wrapperDiv || !wrapperDiv.isConnected) {
          if (lastDirection !== null) {
            updateOverlay(null, null)
            lastDirection = null
            currentDirectionRef.current = null
          }
          return
        }

        // TinderCard creates a wrapper div as the first child, check it and its children
        const tinderCardElement = wrapperDiv.firstElementChild as HTMLElement
        if (!tinderCardElement || !tinderCardElement.isConnected) {
          if (lastDirection !== null) {
            updateOverlay(null, null)
            lastDirection = null
            currentDirectionRef.current = null
          }
          return
        }

        // Get computed style to check transform
        const transform = window.getComputedStyle(tinderCardElement).transform
        if (!transform || transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)') {
          if (lastDirection !== null) {
            updateOverlay(null, null)
            lastDirection = null
            currentDirectionRef.current = null
          }
          return
        }

        // Parse matrix transform: matrix(a, b, c, d, tx, ty)
        // tx is x translation, ty is y translation
        const matrixMatch = transform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/)
        if (!matrixMatch) {
          if (lastDirection !== null) {
            updateOverlay(null, null)
            lastDirection = null
            currentDirectionRef.current = null
          }
          return
        }

        const tx = parseFloat(matrixMatch[5]) || 0
        const ty = parseFloat(matrixMatch[6]) || 0

        // Deadzone threshold - overlay only shows after swiping this distance
        const overlayThreshold = 80
        // Minimum threshold for detecting swipe direction
        const directionThreshold = 30
        
        let newDirection: string | null = null
        
        // Check if we've swiped far enough to show overlay
        const swipeDistance = Math.sqrt(tx * tx + ty * ty)
        if (swipeDistance < overlayThreshold) {
          // Not far enough, don't show overlay
          if (lastDirection !== null) {
            updateOverlay(null, null)
            lastDirection = null
            currentDirectionRef.current = null
          }
          return
        }
        
        // Determine direction based on position (only left/right)
        if (Math.abs(tx) > Math.abs(ty)) {
          if (tx < -directionThreshold) {
            newDirection = 'left'
          } else if (tx > directionThreshold) {
            newDirection = 'right'
          }
        }

        // Only update overlay if direction changed - direct DOM manipulation, no React re-render
        if (newDirection !== lastDirection) {
          if (newDirection === 'left') {
            // Show AI suggestion if available, otherwise show "Confirm"
            const topExpense = expenses.find(e => e.id === topCardId)
            const overlayText = topExpense?.aiCategorySuggestion || 'Confirm'
            updateOverlay(newDirection, overlayText)
          } else if (newDirection === 'right') {
            updateOverlay(newDirection, 'Choose Category')
          } else {
            updateOverlay(null, null)
          }
          lastDirection = newDirection
          currentDirectionRef.current = newDirection
        }
      } catch (error) {
        // Silently handle errors to prevent crashes
        console.debug('Error checking swipe direction:', error)
        if (lastDirection !== null) {
          updateOverlay(null, null)
          lastDirection = null
          currentDirectionRef.current = null
        }
      }
    }

    const loop = () => {
      checkSwipeDirection()
      animationFrameId = requestAnimationFrame(loop)
    }

    animationFrameId = requestAnimationFrame(loop)

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [expenses])

  const loadMoreExpenses = async () => {
    if (!lastEvaluatedKey || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setError(null)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
      const endpoint = `${apiUrl}/api/expenses?categorized=false&limit=50&lastEvaluatedKey=${encodeURIComponent(lastEvaluatedKey)}`

      const response = await authenticatedFetch(endpoint, {
        method: 'GET',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      const backendExpenses = result.data || []

      const newExpenses = backendExpenses.map((exp: any) => ({
        id: exp.id,
        description: exp.summary || '',
        amount: exp.amount || 0,
        date: exp.timestamp || '',
        aiCategorySuggestion: exp.aiCategorySuggestion,
      }))

      setExpenses((prevExpenses) => {
        const combined = [...prevExpenses, ...newExpenses];
        combined.sort((a, b) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          return dateB.localeCompare(dateA);
        });
        return combined;
      })
      setLastEvaluatedKey(result.lastEvaluatedKey || null)
    } catch (err) {
      console.error("Error loading more expenses:", err)
      setError(err instanceof Error ? err.message : 'Failed to load more expenses')
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight">Categorize Expenses</h1>
            <p className="text-muted-foreground mt-2">
              Swipe to categorize your expenses
              {totalCount !== null ? (
                <> • {totalCount - swipedCount} expense{totalCount - swipedCount !== 1 ? "s" : ""} remaining</>
              ) : expenses.length > 0 ? (
                <> • {expenses.length} expense{expenses.length !== 1 ? "s" : ""} remaining</>
              ) : null}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            Error: {error}
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Loading Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Fetching expenses from the database...
              </p>
            </CardContent>
          </Card>
        ) : expenses.length === 0 && !lastEvaluatedKey ? (
          <Card>
            <CardHeader>
              <CardTitle>All Done!</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                {error 
                  ? "Failed to load expenses. Please try again later."
                  : "You've categorized all expenses."}
              </p>
              <Button onClick={() => navigate("/")}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : expenses.length === 0 && lastEvaluatedKey ? (
          <div className="text-center">
            <Card>
              <CardHeader>
                <CardTitle>Ready to Categorize</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Click below to load expenses for categorization.
                </p>
                <Button
                  onClick={loadMoreExpenses}
                  disabled={isLoadingMore}
                  size="lg"
                >
                  {isLoadingMore ? "Loading..." : "Load Expenses"}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="relative">
            {/* Swipe indicator overlay - positioned above card container, updated via DOM to avoid React re-renders */}
            <div 
              ref={overlayRef}
              className="absolute -top-16 left-1/2 -translate-x-1/2 z-[100]" 
              style={{ 
                display: 'none',
                pointerEvents: 'none',
                touchAction: 'none',
                willChange: 'opacity',
                userSelect: 'none'
              }}
            >
              <div 
                ref={overlayContentRef}
                className="bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-lg text-lg font-semibold"
              >
              </div>
            </div>
            <div className="relative h-[600px] w-full select-none">
              {expenses.map((expense, index) => (
              <div
                key={expense.id}
                ref={(el) => {
                  if (index === 0) {
                    cardRefs.current[expense.id] = el
                  }
                }}
                className="absolute w-full select-none"
                style={{
                  zIndex: expenses.length - index,
                }}
              >
                <TinderCard
                  onSwipe={(dir) => handleSwipe(dir, expense)}
                  onCardLeftScreen={() => handleCardLeftScreen(expense.id)}
                    preventSwipe={['up', 'down']}
                  className="w-full select-none"
                >
                  <Card className={`h-[500px] flex flex-col cursor-grab active:cursor-grabbing select-none ${
                    index === 0 ? 'shadow-lg' : index === 1 ? 'shadow-md' : index === 2 ? 'shadow-sm' : 'shadow-none'
                  }`}>
                  <CardHeader className="pb-6">
                    <CardTitle className="text-2xl">{expense.description}</CardTitle>
                    <div className="mt-3 flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">
                        Swipe → to assign a category
                      </span>
                      {expense.aiCategorySuggestion && (
                        <span className="text-sm text-muted-foreground">
                          Swipe ← to confirm generated category
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center items-center pb-6">
                    <div className="text-5xl font-bold mb-4">
                      ${expense.amount.toFixed(2)}
                    </div>
                    <div className="text-muted-foreground mb-8">
                      {formatDate(expense.date)}
                    </div>
                    {expense.aiCategorySuggestion && (
                      <div className="mt-4 px-6 py-3 rounded-lg bg-primary/10 border-2 border-primary/20">
                        <div className="text-2xl font-bold text-primary text-center">
                          {expense.aiCategorySuggestion}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TinderCard>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Selection Modal */}
      <Dialog
        open={isCategoryModalOpen}
        onOpenChange={(open) => {
          setIsCategoryModalOpen(open)
          if (!open) {
            // Reset pending expense when modal is closed without selection
            setPendingExpense(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Category</DialogTitle>
          </DialogHeader>
          {pendingExpense && (
            <div className="mb-4 p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">{pendingExpense.description}</p>
              <p className="text-sm text-muted-foreground">${pendingExpense.amount.toFixed(2)}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {categories.map((category) => (
              <Button
                key={category}
                variant="outline"
                className="h-auto py-4 text-left justify-start"
                onClick={() => handleCategorySelect(category)}
              >
                {category}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

