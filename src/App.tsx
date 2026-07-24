import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { WelcomePage } from '@/pages/welcome'
import { LoginPage } from '@/pages/login'
import { AuthProvider } from './context/AuthContext'
import AdminDashboard from './pages/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" closeButton />
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
