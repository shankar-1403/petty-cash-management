import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Banknote,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  Route,
  Moon,
  Sun,
  PiggyBank,
} from 'lucide-react'
import {
  ROLES,
  canApproveHr,
  hasPermission,
} from '@/lib/role'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { subscribeUserNotifications } from '@/lib/notifications'
import { processFinanceDueReminders } from '@/lib/due-reminders'
import { useThemeStore } from '@/lib/theme'
import type { AppUserProfile } from '@/types'
import logo from "../assets/pcred-logo.webp"

function linkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white ${
    isActive ? 'bg-blue-500/20 text-white shadow-inner' : ''
  }`
}

function NavItem({
  to,
  end,
  icon: Icon,
  label,
  onClick,
}: {
  to: string
  end?: boolean
  icon: typeof LayoutDashboard
  label: string
  onClick: () => void
}) {
  return (
    <NavLink to={to} end={end} className={linkClass} onClick={onClick}>
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
    </NavLink>
  )
}

function linksForProfile(profile: AppUserProfile) {
  const role = profile.role
  const dash =
    role === ROLES.ADMIN
      ? { to: '/admin-dashboard', label: 'Dashboard' }
      : { to: '/dashboard', label: 'Dashboard' }

  const items: {
    to: string
    label: string
    icon: typeof LayoutDashboard
    end?: boolean
  }[] = [{ to: dash.to, label: dash.label, icon: LayoutDashboard, end: true }]

  if (hasPermission(profile, 'cash')) {
    items.push({ to: '/cash', label: 'Cash Management', icon: Wallet })
  }
  if (canApproveHr(role)) {
    items.push({ to: '/monthly-balance', label: 'Monthly Balance', icon: PiggyBank })
  }
  if (hasPermission(profile, 'salary')) {
    items.push({ to: '/salary', label: 'Salary', icon: Banknote })
  }
  if (hasPermission(profile, 'tracking')) {
    items.push({ to: '/tracking', label: 'Tracking', icon: Route })
  }
  if (hasPermission(profile, 'users')) {
    items.push({ to: '/admin/users', label: 'Users & Roles', icon: Users })
  }

  items.push({ to: '/settings', label: 'Settings', icon: Settings })

  return items
}

export default function Layout() {
  const { user, profile, role, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  useEffect(() => {
    if (!user) {
      setUnread(0)
      return
    }
    return subscribeUserNotifications(user.uid, role, (items) => {
      setUnread(items.filter((n) => !n.read).length)
    })
  }, [user, role])

  useEffect(() => {
    if (!user) return
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const key = `dueRemindersRan:${today}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
    void processFinanceDueReminders().catch((err) =>
      console.error('Failed to process due payment reminders', err),
    )
  }, [user])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const closeMenu = () => setOpen(false)
  const nav = profile ? linksForProfile(profile) : []

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
          onClick={closeMenu}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/5 bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <img src={logo} alt="Pcred Logo" className='h-9'/>
          </div>
          <button type="button" className="rounded-lg p-1 lg:hidden" onClick={closeMenu}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              end={item.end}
              icon={item.icon}
              label={item.label}
              onClick={closeMenu}
            />
          ))}
        </nav>

        <div className="border-t border-white/5 px-4 py-2">
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
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.displayName || 'Workspace'}</p>
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">{profile?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </Button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
