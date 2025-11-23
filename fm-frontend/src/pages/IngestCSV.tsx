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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Upload, FileText } from "lucide-react"
import { useNavigate } from "react-router-dom"

interface FieldMapping {
  summary: string
  amount: string
  timestamp: string
}

const HEADER_MAPPINGS = {
  summary: ['Description', 'Summary', 'Note', 'Detail'],
  amount: ['Amount', 'Value', 'Price'],
  timestamp: ['Trans. Date', 'Date', 'Time', 'Timestamp']
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

  const autoMatchHeaders = (csvHeaders: string[]): FieldMapping => {
    const mapping: FieldMapping = {
      summary: "",
      amount: "",
      timestamp: "",
    }

    // Helper function to find matching header (case-insensitive)
    const findMatchingHeader = (validHeaders: string[]): string => {
      for (const validHeader of validHeaders) {
        const found = csvHeaders.find(
          (header) => header.toLowerCase() === validHeader.toLowerCase()
        )
        if (found) {
          return found // Return the actual CSV header (preserving original case)
        }
      }
      return ""
    }

    mapping.summary = findMatchingHeader(HEADER_MAPPINGS.summary)
    mapping.amount = findMatchingHeader(HEADER_MAPPINGS.amount)
    mapping.timestamp = findMatchingHeader(HEADER_MAPPINGS.timestamp)

    return mapping
  }

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
          
          // Auto-match headers
          const autoMatched = autoMatchHeaders(headers)
          setFieldMapping(autoMatched)
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

      await response.json()
      
      // Reset form
      setCsvFile(null)
      setCsvHeaders([])
      setCsvData([])
      setFieldMapping({
        summary: "",
        amount: "",
        timestamp: "",
      })
      
      // Navigate back to dashboard
      navigate("/")
    } catch (error) {
      console.error("Error uploading CSV:", error)
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
                <CardTitle>CSV Preview</CardTitle>
                <CardDescription>
                  Preview of your CSV data (showing first {Math.min(10, csvData.length)} rows)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableCaption>
                    {csvData.length > 10 
                      ? `Showing first 10 of ${csvData.length} rows` 
                      : `Total ${csvData.length} rows`}
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      {csvHeaders.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 10).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {csvHeaders.map((header) => (
                          <TableCell key={header}>
                            {row[header] !== undefined && row[header] !== null
                              ? String(row[header])
                              : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

