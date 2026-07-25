import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Banknote,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
} from 'lucide-react'
import { ROLES, ROLE_LABELS } from '@/lib/role'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function Layout() {
  const { profile, logout } = useAuth()
  console.log(profile)
  const [open, setOpen] = useState(false)
  const role = String(profile?.role ?? '').trim().toLowerCase()
  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/5 bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <p className="text-lg font-semibold tracking-tight text-white">PettyCash</p>
            <p className="text-xs text-slate-400">Enterprise cash control</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {role === ROLES.ADMIN &&
            <NavLink to={'/admin-dashboard'} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white ${
                  isActive ? 'bg-blue-500/20 text-white shadow-inner' : ''
                }`
              }
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>
          }
        </nav>

        <div className="border-t border-white/5 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-300">
              {(profile?.displayName || profile?.email || 'U').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {profile?.displayName || profile?.email || 'User'}
              </p>
              {profile?.role && (
                <Badge variant="outline" className="mt-1 border-white/20 text-slate-300">
                  {profile.role}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-300 hover:bg-white/5 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-background)_80%,transparent)] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {profile?.displayName || 'Workspace'}
              </p>
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                {profile?.email}
              </p>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
