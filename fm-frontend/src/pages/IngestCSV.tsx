import { useState } from "react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Upload, FileText } from "lucide-react"
import { useNavigate } from "react-router-dom"

interface FieldMapping {
  summary: string
  amount: string
  timestamp: string
}

export function IngestCSV() {
  const navigate = useNavigate()
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvData, setCsvData] = useState<any[]>([])
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    summary: "",
    amount: "",
    timestamp: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Check if file is CSV by extension or MIME type
      const isCSV = file.name.endsWith('.csv') || 
                    file.type === 'text/csv' || 
                    file.type === 'application/vnd.ms-excel' ||
                    file.type === 'text/plain'
      
      if (isCSV) {
        setCsvFile(file)
        parseCSV(file)
      } else {
        alert("Please select a valid CSV file")
      }
    }
  }

  const parseCSV = (file: File) => {
    // Parse CSV for display
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0] as object)
          setCsvHeaders(headers)
          setCsvData(results.data as any[])
        }
      },
      error: (error) => {
        console.error("Error parsing CSV:", error)
        alert("Error parsing CSV file. Please check the file format.")
      },
    })
  }

  const handleMappingChange = (field: keyof FieldMapping, value: string) => {
    setFieldMapping((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async () => {
    // Validate that all required fields are mapped
    if (!fieldMapping.summary || !fieldMapping.amount || !fieldMapping.timestamp) {
      alert("Please map all required fields: summary, amount, and timestamp")
      return
    }

    if (!csvFile) {
      alert("Please select a CSV file")
      return
    }

    if (csvData.length === 0) {
      alert("No CSV data to upload")
      return
    }

    setIsSubmitting(true)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
      const endpoint = `${apiUrl}/api/ingest`

      // Create FormData to send file
      const formData = new FormData()
      formData.append('csvFile', csvFile)
      formData.append('rows', JSON.stringify(csvData))
      formData.append('fieldMapping', JSON.stringify(fieldMapping))

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      alert(`Successfully enqueued ${result.rowsEnqueued} expenses for processing. They will be processed asynchronously.`)
      
      // Reset form
      setCsvFile(null)
      setCsvHeaders([])
      setCsvData([])
      setFieldMapping({
        summary: "",
        amount: "",
        timestamp: "",
      })
    } catch (error) {
      console.error("Error uploading CSV:", error)
      alert(`Failed to upload CSV: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getSelectOptions = () => {
    return csvHeaders
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Ingest CSV</h1>
            <p className="text-muted-foreground mt-2">
              Upload and map your CSV file to import expenses
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Select CSV File
            </CardTitle>
            <CardDescription>
              Choose a CSV file containing your expense data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input">
                <Button asChild variant="outline">
                  <span>
                    <FileText className="h-4 w-4 mr-2" />
                    Choose File
                  </span>
                </Button>
              </label>
              {csvFile && (
                <span className="text-sm text-muted-foreground">
                  {csvFile.name}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {csvHeaders.length > 0 && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>CSV Headers</CardTitle>
                <CardDescription>
                  Detected columns in your CSV file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {csvHeaders.map((header, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-muted rounded-md text-sm font-mono"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Field Mapping</CardTitle>
                <CardDescription>
                  Map CSV columns to database fields
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Summary</label>
                  <Select
                    value={fieldMapping.summary}
                    onValueChange={(value) => handleMappingChange("summary", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSV column for summary" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSelectOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <Select
                    value={fieldMapping.amount}
                    onValueChange={(value) => handleMappingChange("amount", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSV column for amount" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSelectOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Timestamp</label>
                  <Select
                    value={fieldMapping.timestamp}
                    onValueChange={(value) => handleMappingChange("timestamp", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSV column for timestamp" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSelectOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => navigate("/")} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Uploading..." : "Import Expenses"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

