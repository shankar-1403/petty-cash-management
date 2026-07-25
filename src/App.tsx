import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { WelcomePage } from '@/pages/welcome'
import { LoginPage } from '@/pages/login'
import { AuthProvider } from './context/AuthContext'
import AdminDashboard from './pages/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import { ROLES } from './lib/role'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" closeButton />
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute roles={[ROLES.ADMIN,ROLES.HR,ROLES.MANAGEMENT,ROLES.ACCOUNTS]}><Layout/></ProtectedRoute>}>
            <Route path='/admin-dashboard' element={<ProtectedRoute roles={[ROLES.ADMIN]}><AdminDashboard/></ProtectedRoute>}/>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
