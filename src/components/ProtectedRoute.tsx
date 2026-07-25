import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute(children:any,roles:any) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user && !roles ) return <Navigate to="/" replace state={{ from: location }} />

  return children
}
