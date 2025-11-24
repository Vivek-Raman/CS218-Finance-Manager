import { useState, useEffect } from "react"
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
  const [lastDirection, setLastDirection] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [swipeCategories, setSwipeCategories] = useState<Record<string, string>>({
    left: "Food & Dining",
    right: "Office & Business",
    up: "Utilities",
    down: "Entertainment",
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)

  // Fetch expenses from API
  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
        const endpoint = `${apiUrl}/api/expenses?uncategorized=true`
        
        const response = await authenticatedFetch(endpoint, {
          method: 'GET',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        const backendExpenses = result.data || []
        
        // Transform backend data structure to frontend format
        const uncategorizedExpenses = backendExpenses.map((exp: any) => ({
          id: exp.id,
          description: exp.summary || '',
          amount: exp.amount || 0,
          date: exp.timestamp || '',
        }))
        
        setExpenses(uncategorizedExpenses)
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
    setLastDirection(direction)
    
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
    } catch (err) {
      console.error("Error updating expense category:", err)
      // Don't throw - allow UI to continue even if update fails
      // In a production app, you might want to show a toast notification
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

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category)
  }

  const handleSwipeCategoryChange = (direction: string, category: string) => {
    setSwipeCategories((prev) => ({
      ...prev,
      [direction]: category,
    }))
  }

  const handleCardLeftScreen = (expenseId: string) => {
    console.log(`Card ${expenseId} left the screen`)
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

        {lastDirection && (
          <div className="mb-4 p-3 bg-muted rounded-md text-sm">
            Last swipe: <strong>{lastDirection}</strong> → {swipeCategories[lastDirection]}
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
        ) : expenses.length === 0 ? (
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
        ) : (
          <div className="relative h-[600px] w-full select-none">
            {expenses.map((expense, index) => (
              <div
                key={expense.id}
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
                  <Card className="h-[500px] flex flex-col shadow-lg cursor-grab active:cursor-grabbing select-none">
                  <CardHeader>
                    <CardTitle className="text-2xl">{expense.description}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center items-center">
                    <div className="text-5xl font-bold mb-4">
                      ${expense.amount.toFixed(2)}
                    </div>
                    <div className="text-muted-foreground mb-8">
                      {formatDate(expense.date)}
                    </div>
                    <div className="w-full max-w-md mb-8">
                      <label className="text-sm text-muted-foreground mb-2 block text-center">
                        Select Category
                      </label>
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
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Left</div>
                        <div className="font-semibold">{swipeCategories.left}</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Right</div>
                        <div className="font-semibold">{swipeCategories.right}</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Up</div>
                        <div className="font-semibold">{swipeCategories.up}</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Down</div>
                        <div className="font-semibold">{swipeCategories.down}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TinderCard>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {expenses.length} expense{expenses.length !== 1 ? "s" : ""} remaining
        </div>
      </div>
    </div>
  )
}

