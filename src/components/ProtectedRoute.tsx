import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getHomePath, hasPermission, type PermissionKey, type UserRole } from '@/lib/role'

export default function ProtectedRoute({
  roles,
  permission,
}: {
  roles?: UserRole[]
  permission?: PermissionKey
}) {
  const { user, profile, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    )
  }

  if (!user || !profile || !role) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles && !roles.includes(role)) {
    return <Navigate to={getHomePath(role)} replace />
  }

  if (permission && !hasPermission(profile, permission)) {
    return <Navigate to={getHomePath(role)} replace />
  }

  return <Outlet />
}
