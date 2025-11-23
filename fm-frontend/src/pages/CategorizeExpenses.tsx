import { useState } from "react"
import TinderCard from "react-tinder-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"

interface Expense {
  id: number
  description: string
  amount: number
  date: string
}

// Mock expenses data - in a real app, this would come from your data store
const mockExpenses: Expense[] = [
  { id: 1, description: "Lunch at Cafe", amount: 15.50, date: "2024-01-15" },
  { id: 2, description: "Office Supplies", amount: 45.00, date: "2024-01-14" },
  { id: 3, description: "Netflix Subscription", amount: 15.99, date: "2024-01-13" },
  { id: 4, description: "Electricity Bill", amount: 120.00, date: "2024-01-12" },
  { id: 5, description: "Grocery Shopping", amount: 85.30, date: "2024-01-11" },
]

export function CategorizeExpenses() {
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<Expense[]>(mockExpenses)
  const [lastDirection, setLastDirection] = useState<string>("")

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

  const handleSwipeLeft = (expense: Expense) => {
    // Categorize as "Food & Dining"
    console.log(`Categorized "${expense.description}" as Food & Dining (swiped left)`)
    // TODO: Save to backend/state management
  }

  const handleSwipeRight = (expense: Expense) => {
    // Categorize as "Office & Business"
    console.log(`Categorized "${expense.description}" as Office & Business (swiped right)`)
    // TODO: Save to backend/state management
  }

  const handleSwipeUp = (expense: Expense) => {
    // Categorize as "Utilities"
    console.log(`Categorized "${expense.description}" as Utilities (swiped up)`)
    // TODO: Save to backend/state management
  }

  const handleSwipeDown = (expense: Expense) => {
    // Categorize as "Entertainment"
    console.log(`Categorized "${expense.description}" as Entertainment (swiped down)`)
    // TODO: Save to backend/state management
  }

  const handleCardLeftScreen = (expenseId: number) => {
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
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Categorize Expenses</h1>
            <p className="text-muted-foreground mt-2">
              Swipe to categorize your expenses
            </p>
          </div>
        </div>

        {lastDirection && (
          <div className="mb-4 p-3 bg-muted rounded-md text-sm">
            Last swipe: <strong>{lastDirection}</strong>
          </div>
        )}

        {expenses.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>All Done!</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                You've categorized all expenses.
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
                      {new Date(expense.date).toLocaleDateString()}
                    </div>
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Left</div>
                        <div className="font-semibold">Food & Dining</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Right</div>
                        <div className="font-semibold">Office & Business</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Up</div>
                        <div className="font-semibold">Utilities</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Swipe Down</div>
                        <div className="font-semibold">Entertainment</div>
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

