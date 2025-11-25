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
import { ArrowLeft, Upload, FileText, X, CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { authenticatedFetch } from "@/lib/utils"
import { toast } from "sonner"

interface FieldMapping {
  summary: string
  amount: string
  timestamp: string
  category?: string
}

interface FileData {
  id: string
  file: File
  headers: string[]
  data: any[]
  fieldMapping: FieldMapping
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

const HEADER_MAPPINGS = {
  summary: ['Description', 'Summary', 'Note', 'Detail'],
  amount: ['Amount', 'Value', 'Price'],
  timestamp: ['Trans. Date', 'Date', 'Time', 'Timestamp'],
  category: ['Category']
}

export function IngestCSV() {
  const navigate = useNavigate()
  const [files, setFiles] = useState<FileData[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const countNonEmptyRows = (data: any[], headers: string[]): number => {
    return data.filter((row) => {
      return headers.some((header) => {
        const value = row[header];
        return value !== undefined && value !== null && String(value).trim() !== '';
      });
    }).length;
  }

  const autoMatchHeaders = (csvHeaders: string[]): FieldMapping => {
    const mapping: FieldMapping = {
      summary: "",
      amount: "",
      timestamp: "",
      category: "",
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
    mapping.category = findMatchingHeader(HEADER_MAPPINGS.category)

    return mapping
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    if (selectedFiles.length === 0) return

    const maxFileSize = 9 * 1024 * 1024 // 9 MB
    const validFiles: File[] = []
    const invalidFiles: string[] = []

    selectedFiles.forEach((file) => {
      // Check file size
      if (file.size > maxFileSize) {
        invalidFiles.push(`${file.name}: File size exceeds ${(maxFileSize / 1024 / 1024).toFixed(0)} MB`)
        return
      }
      
      // Check if file is CSV
      const isCSV = file.name.endsWith('.csv') || 
                    file.type === 'text/csv' || 
                    file.type === 'application/vnd.ms-excel' ||
                    file.type === 'text/plain'
      
      if (isCSV) {
        validFiles.push(file)
      } else {
        invalidFiles.push(`${file.name}: Not a valid CSV file`)
      }
    })

    if (invalidFiles.length > 0) {
      toast.error(`Some files were skipped:\n${invalidFiles.join('\n')}`)
    }

    // Parse each valid file
    validFiles.forEach((file) => {
      parseCSV(file)
    })

    // Reset input to allow selecting the same files again
    event.target.value = ''
  }

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0] as object)
          const autoMatched = autoMatchHeaders(headers)
          
          const fileData: FileData = {
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            headers,
            data: results.data as any[],
            fieldMapping: autoMatched,
            status: 'pending',
          }
          
          setFiles((prev) => [...prev, fileData])
        } else {
          toast.error(`File ${file.name} has no valid data rows`)
        }
      },
      error: (error) => {
        console.error("Error parsing CSV:", error)
        toast.error(`Error parsing ${file.name}: ${error.message}`)
      },
    })
  }

  const handleMappingChange = (fileId: string, field: keyof FieldMapping, value: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              fieldMapping: {
                ...f.fieldMapping,
                [field]: value,
              },
            }
          : f
      )
    )
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const handleSubmit = async (fileId?: string) => {
    const filesToSubmit = fileId 
      ? files.filter(f => f.id === fileId)
      : files.filter(f => f.status === 'pending')

    if (filesToSubmit.length === 0) {
      toast.error("No files to upload")
      return
    }

    // Validate all files have required mappings
    const invalidFiles = filesToSubmit.filter(
      (f) => !f.fieldMapping.summary || !f.fieldMapping.amount || !f.fieldMapping.timestamp
    )

    if (invalidFiles.length > 0) {
      toast.error(`Please map all required fields (summary, amount, timestamp) for: ${invalidFiles.map(f => f.file.name).join(', ')}`)
      return
    }

    setIsSubmitting(true)
    const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
    const endpoint = `${apiUrl}/api/ingest`

    // Submit each file separately
    for (const fileData of filesToSubmit) {
      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileData.id ? { ...f, status: 'uploading' as const } : f
        )
      )

      try {
        const formData = new FormData()
        formData.append('csvFile', fileData.file)
        formData.append('fieldMapping', JSON.stringify(fileData.fieldMapping))

        const response = await authenticatedFetch(endpoint, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
        }

        await response.json()
        
        // Update status to success
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileData.id
              ? { ...f, status: 'success' as const }
              : f
          )
        )
        
        toast.success(`${fileData.file.name} uploaded successfully!`)
      } catch (error: any) {
        console.error(`Error uploading ${fileData.file.name}:`, error)
        
        // Update status to error
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileData.id
              ? { ...f, status: 'error' as const, error: error.message || 'Upload failed' }
              : f
          )
        )
        
        toast.error(`Failed to upload ${fileData.file.name}: ${error.message || 'Unknown error'}`)
      }
    }

    setIsSubmitting(false)
  }

  const handleSubmitAll = async () => {
    await handleSubmit()
  }

  const getSelectOptions = (headers: string[]) => {
    return headers
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
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
              Upload and map multiple CSV files to import expenses
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Select CSV Files
            </CardTitle>
            <CardDescription>
              Choose one or more CSV files containing your expense data
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
                multiple
              />
              <label htmlFor="csv-file-input">
                <Button asChild variant="outline">
                  <span>
                    <FileText className="h-4 w-4 mr-2" />
                    Choose Files
                  </span>
                </Button>
              </label>
              {files.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {files.length > 0 && (
          <div className="space-y-6 mb-6">
            {files.map((fileData) => (
              <Card key={fileData.id} className={fileData.status === 'success' ? 'border-green-500' : fileData.status === 'error' ? 'border-red-500' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5" />
                      <div>
                        <CardTitle className="text-lg">{fileData.file.name}</CardTitle>
                        <CardDescription>
                          {countNonEmptyRows(fileData.data, fileData.headers)} rows • {(fileData.file.size / 1024).toFixed(2)} KB
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {fileData.status === 'uploading' && (
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      )}
                      {fileData.status === 'success' && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      {fileData.status === 'error' && (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      {fileData.status !== 'uploading' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(fileData.id)}
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {fileData.status === 'error' && fileData.error && (
                    <p className="text-sm text-red-500 mt-2">{fileData.error}</p>
                  )}
                </CardHeader>

                {fileData.status === 'pending' && (
                  <>
                    <CardContent>
                      <div className="mb-6">
                        <h3 className="text-sm font-medium mb-3">CSV Preview</h3>
                        <div className="border rounded-lg overflow-auto max-h-64">
                          {(() => {
                            const nonEmptyRows = fileData.data.filter((row) => {
                              return fileData.headers.some((header) => {
                                const value = row[header];
                                return value !== undefined && value !== null && String(value).trim() !== '';
                              });
                            });
                            const previewRows = nonEmptyRows.slice(0, 10);
                            const nonEmptyRowCount = nonEmptyRows.length;
                            
                            return (
                              <Table>
                                <TableCaption>
                                  {nonEmptyRowCount > previewRows.length
                                    ? `Showing first ${previewRows.length} of ${nonEmptyRowCount} rows`
                                    : `Total ${nonEmptyRowCount} rows`}
                                </TableCaption>
                                <TableHeader>
                                  <TableRow>
                                    {fileData.headers.map((header) => (
                                      <TableHead key={header}>{header}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {previewRows.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                  {fileData.headers.map((header) => (
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
                            );
                          })()}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-medium">Field Mapping</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Summary</label>
                            <Select
                              value={fileData.fieldMapping.summary}
                              onValueChange={(value) => handleMappingChange(fileData.id, "summary", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select CSV column" />
                              </SelectTrigger>
                              <SelectContent>
                                {getSelectOptions(fileData.headers).map((option) => (
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
                              value={fileData.fieldMapping.amount}
                              onValueChange={(value) => handleMappingChange(fileData.id, "amount", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select CSV column" />
                              </SelectTrigger>
                              <SelectContent>
                                {getSelectOptions(fileData.headers).map((option) => (
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
                              value={fileData.fieldMapping.timestamp}
                              onValueChange={(value) => handleMappingChange(fileData.id, "timestamp", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select CSV column" />
                              </SelectTrigger>
                              <SelectContent>
                                {getSelectOptions(fileData.headers).map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Category <span className="text-muted-foreground text-xs">(optional)</span>
                            </label>
                            <Select
                              value={fileData.fieldMapping.category === "" ? "__none__" : (fileData.fieldMapping.category || undefined)}
                              onValueChange={(value) => handleMappingChange(fileData.id, "category", value === "__none__" ? "" : value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select CSV column" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None (leave empty)</SelectItem>
                                {getSelectOptions(fileData.headers).map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardContent className="pt-0">
                      <div className="flex justify-end">
                        <Button 
                          onClick={() => handleSubmit(fileData.id)} 
                          disabled={isSubmitting || !fileData.fieldMapping.summary || !fileData.fieldMapping.amount || !fileData.fieldMapping.timestamp}
                        >
                          {isSubmitting ? "Uploading..." : "Upload This File"}
                        </Button>
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate("/")} disabled={isSubmitting}>
              {files.every(f => f.status === 'success') ? "Done" : "Cancel"}
            </Button>
            {files.some(f => f.status === 'pending') && (
              <Button onClick={handleSubmitAll} disabled={isSubmitting}>
                {isSubmitting ? "Uploading..." : `Upload All (${files.filter(f => f.status === 'pending').length})`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

