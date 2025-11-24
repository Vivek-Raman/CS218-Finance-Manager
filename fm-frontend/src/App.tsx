import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { Dashboard } from "@/components/Dashboard"
import { CategorizeExpenses } from "@/pages/CategorizeExpenses"
import { IngestCSV } from "@/pages/IngestCSV"
import { Login } from "@/components/Login"

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Callback Route Component
function AuthCallback() {
  const { isLoading, isAuthenticated } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlError = urlParams.get('error');
    const errorDesc = urlParams.get('error_description');
    
    if (urlError) {
      const errorMessage = errorDesc 
        ? `${urlError}: ${decodeURIComponent(errorDesc)}`
        : urlError;
      setError(errorMessage);
      sessionStorage.removeItem('auth_error');
      return;
    }

    if (isLoading) {
      return;
    }

    if (isAuthenticated) {
      return;
    }

    const hasCode = urlParams.has('code');
    if (hasCode) {
      const storedError = sessionStorage.getItem('auth_error');
      if (storedError) {
        setError(storedError);
        sessionStorage.removeItem('auth_error');
      } else {
        const hasToken = sessionStorage.getItem('cognito_access_token');
        if (!hasToken) {
          setError('Authentication failed. Please try again.');
        }
      }
    }
  }, [isLoading, isAuthenticated])

  if (!isLoading && isAuthenticated && !error) {
    return <Navigate to="/" replace />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4 text-destructive">Authentication Error</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <a 
            href="/login" 
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Return to Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categorize"
        element={
          <ProtectedRoute>
            <CategorizeExpenses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ingest"
        element={
          <ProtectedRoute>
            <IngestCSV />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
