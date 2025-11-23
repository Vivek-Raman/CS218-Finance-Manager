import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, Tag, BarChart3 } from "lucide-react"
import { useNavigate } from "react-router-dom"

export function Dashboard() {
  const navigate = useNavigate()

  const handleIngestCSV = () => {
    navigate("/ingest")
  }

  const handleCategorizeExpenses = () => {
    navigate("/categorize")
  }

  const handleVisualizeData = () => {
    // TODO: Implement data visualization
    console.log("Visualize data clicked")
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Finance Manager</h1>
          <p className="text-muted-foreground mt-2">
            Manage your finances with ease
          </p>
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

          <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-105">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Tag className="h-6 w-6 text-primary" />
                <CardTitle>Categorize Expenses</CardTitle>
              </div>
              <CardDescription>
                Organize and categorize your expenses for better tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleCategorizeExpenses} className="w-full">
                Categorize
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-105">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                <CardTitle>Visualize Data</CardTitle>
              </div>
              <CardDescription>
                View charts and insights from your financial data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleVisualizeData} className="w-full">
                View Charts
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

