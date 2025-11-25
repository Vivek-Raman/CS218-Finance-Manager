import { useState, useEffect, useRef } from "react"
import TinderCard from "react-tinder-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Settings } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { authenticatedFetch } from "@/lib/utils"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface Expense {
  id: string
  description: string
  amount: number
  date: string
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
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [swipeCategories, setSwipeCategories] = useState<Record<string, string>>({
    left: "Food & Dining",
    right: "Office & Business",
    up: "Utilities",
    down: "Entertainment",
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
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
      case "up":
        handleSwipeUp(expense)
        break
      case "down":
        handleSwipeDown(expense)
        break
      default:
        break
    }

    // Remove the swiped expense from the list
    setExpenses((prevExpenses) =>
      prevExpenses.filter((e) => e.id !== expense.id)
    )
    
    // Increment swiped count
    setSwipedCount((prev) => prev + 1)
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
    const category = swipeCategories.left
    console.log(`Categorized "${expense.description}" as ${category} (swiped left)`)
    await updateExpenseCategory(expense.id, category)
  }

  const handleSwipeRight = async (expense: Expense) => {
    const category = swipeCategories.right
    console.log(`Categorized "${expense.description}" as ${category} (swiped right)`)
    await updateExpenseCategory(expense.id, category)
  }

  const handleSwipeUp = async (expense: Expense) => {
    const category = swipeCategories.up
    console.log(`Categorized "${expense.description}" as ${category} (swiped up)`)
    await updateExpenseCategory(expense.id, category)
  }

  const handleSwipeDown = async (expense: Expense) => {
    const category = swipeCategories.down
    console.log(`Categorized "${expense.description}" as ${category} (swiped down)`)
    await updateExpenseCategory(expense.id, category)
  }

  const handleCategorySelect = async (category: string) => {
    if (expenses.length === 0) {
      return
    }

    // Get the top card (first expense in the stack)
    const topExpense = expenses[0]
    
    try {
      // Update the expense category via API
      await updateExpenseCategory(topExpense.id, category)
      
      // Wait 1 second before removing the card
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Remove the card from the stack
      setExpenses((prevExpenses) =>
        prevExpenses.filter((e) => e.id !== topExpense.id)
      )
      
      // Reset selected category
      setSelectedCategory("")
      
      // Increment swiped count
      setSwipedCount((prev) => prev + 1)
    } catch (err) {
      // Error already handled in updateExpenseCategory with toast
      // Don't remove card if API call failed
    }
  }

  const handleSwipeCategoryChange = (direction: string, category: string) => {
    setSwipeCategories((prev) => ({
      ...prev,
      [direction]: category,
    }))
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
        
        // Determine direction based on position
        if (Math.abs(tx) > Math.abs(ty)) {
          if (tx < -directionThreshold) {
            newDirection = 'left'
          } else if (tx > directionThreshold) {
            newDirection = 'right'
          }
        } else {
          if (ty < -directionThreshold) {
            newDirection = 'up'
          } else if (ty > directionThreshold) {
            newDirection = 'down'
          }
        }

        // Only update overlay if direction changed - direct DOM manipulation, no React re-render
        if (newDirection !== lastDirection) {
          if (newDirection) {
            updateOverlay(newDirection, swipeCategories[newDirection])
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
  }, [expenses, swipeCategories])

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
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure Swipe Categories</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-4 w-full max-w-md mx-auto">
                {/* Row 1: Top */}
                <div></div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block text-center">Swipe Up</label>
                  <Select
                    value={swipeCategories.up}
                    onValueChange={(value) => handleSwipeCategoryChange("up", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div></div>
                
                {/* Row 2: Middle */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block text-center">Swipe Left</label>
                  <Select
                    value={swipeCategories.left}
                    onValueChange={(value) => handleSwipeCategoryChange("left", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div></div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block text-center">Swipe Right</label>
                  <Select
                    value={swipeCategories.right}
                    onValueChange={(value) => handleSwipeCategoryChange("right", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Row 3: Bottom */}
                <div></div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block text-center">Swipe Down</label>
                  <Select
                    value={swipeCategories.down}
                    onValueChange={(value) => handleSwipeCategoryChange("down", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div></div>
              </div>
            </DialogContent>
          </Dialog>
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
                  preventSwipe={[]}
                  className="w-full select-none"
                >
                  <Card className={`h-[500px] flex flex-col cursor-grab active:cursor-grabbing select-none ${
                    index === 0 ? 'shadow-lg' : index === 1 ? 'shadow-md' : index === 2 ? 'shadow-sm' : 'shadow-none'
                  }`}>
                  <CardHeader className="pb-6">
                    <CardTitle className="text-2xl">{expense.description}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center items-center pb-6">
                    <div className="text-5xl font-bold mb-4">
                      ${expense.amount.toFixed(2)}
                    </div>
                    <div className="text-muted-foreground mb-8">
                      {formatDate(expense.date)}
                    </div>
                    <div className="w-full max-w-md mb-8">
                      <Select
                        value={selectedCategory}
                        onValueChange={handleCategorySelect}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TinderCard>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

