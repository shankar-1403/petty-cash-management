import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import { LoginPage } from '@/pages/login'
import AdminDashboard from '@/pages/AdminDashboard'
import DashboardPage from '@/pages/Dashboard'
import CashListPage from '@/pages/CashList'
import CashCreatePage from '@/pages/CashCreate'
import CashDetailPage from '@/pages/CashDetail'
import CashEditPage from '@/pages/CashEdit'
import TrackingPage from '@/pages/Tracking'
import SalaryListPage from '@/pages/SalaryList'
import SalaryCreatePage from '@/pages/SalaryCreate'
import SalaryDetailPage from '@/pages/SalaryDetail'
import UsersRolesPage from '@/pages/UsersRoles'
import NotificationsPage from '@/pages/Notifications'
import SettingsPage from '@/pages/Settings'
import MonthlyBalancePage from '@/pages/MonthlyBalance'
import { ALL_ROLES, ROLES } from '@/lib/role'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" closeButton />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute roles={[...ALL_ROLES]} />}>
            <Route element={<Layout />}>
              <Route
                path="/admin-dashboard"
                element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.IT]} />}
              >
                <Route index element={<AdminDashboard />} />
              </Route>

              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/monthly-balance"
                element={<ProtectedRoute roles={[ROLES.HR, ROLES.IT]} />}
              >
                <Route index element={<MonthlyBalancePage />} />
              </Route>
              <Route path="/cash" element={<ProtectedRoute permission="cash" />}>
                <Route index element={<CashListPage />} />
              </Route>
              <Route path="/cash/new" element={<ProtectedRoute permission="cash" roles={[ROLES.ADMIN, ROLES.IT]} />}>
                <Route index element={<CashCreatePage />} />
              </Route>
              <Route
                path="/cash/:id/edit"
                element={<ProtectedRoute permission="cash" roles={[ROLES.ADMIN, ROLES.IT]} />}
              >
                <Route index element={<CashEditPage />} />
              </Route>
              <Route path="/cash/:id" element={<ProtectedRoute permission="cash" />}>
                <Route index element={<CashDetailPage />} />
              </Route>

              <Route
                path="/tracking"
                element={
                  <ProtectedRoute
                    permission="tracking"
                    roles={[ROLES.ADMIN, ROLES.HR, ROLES.MANAGEMENT, ROLES.IT]}
                  />
                }
              >
                <Route index element={<TrackingPage />} />
              </Route>

              <Route
                path="/salary"
                element={
                  <ProtectedRoute
                    permission="salary"
                    roles={[ROLES.HR, ROLES.MANAGEMENT, ROLES.FINANCE, ROLES.IT]}
                  />
                }
              >
                <Route index element={<SalaryListPage />} />
              </Route>
              <Route
                path="/salary/new"
                element={<ProtectedRoute permission="salary" roles={[ROLES.HR, ROLES.IT]} />}
              >
                <Route index element={<SalaryCreatePage />} />
              </Route>
              <Route
                path="/salary/:id"
                element={
                  <ProtectedRoute
                    permission="salary"
                    roles={[ROLES.HR, ROLES.MANAGEMENT, ROLES.FINANCE, ROLES.IT]}
                  />
                }
              >
                <Route index element={<SalaryDetailPage />} />
              </Route>

              <Route
                path="/admin/users"
                element={<ProtectedRoute permission="users" roles={[ROLES.IT]} />}
              >
                <Route index element={<UsersRolesPage />} />
              </Route>

              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
