import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Dashboard } from "@/components/Dashboard"
import { CategorizeExpenses } from "@/pages/CategorizeExpenses"
import { IngestCSV } from "@/pages/IngestCSV"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/categorize" element={<CategorizeExpenses />} />
        <Route path="/ingest" element={<IngestCSV />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
