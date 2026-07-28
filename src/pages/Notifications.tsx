import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeUserNotifications,
  type AppNotification,
} from '@/lib/notifications'
import { formatDateTime } from '@/lib/utils'

export default function NotificationsPage() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setItems([])
      return
    }
    return subscribeUserNotifications(user.uid, role, setItems)
  }, [user, role])

  const unreadCount = useMemo(
    () => (items ?? []).filter((n) => !n.read).length,
    [items],
  )

  async function onOpen(item: AppNotification) {
    if (!user) return
    if (!item.read) {
      try {
        await markNotificationRead(user.uid, item.id)
      } catch (err) {
        console.error(err)
      }
    }
    if (item.link) navigate(item.link)
  }

  async function onMarkAll() {
    if (!user) return
    setBusy(true)
    try {
      await markAllNotificationsRead(user.uid, items ?? [])
      toast.success('All notifications marked as read')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Alerts when new payment requests and updates arrive.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void onMarkAll()}>
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Inbox
          </CardTitle>
          <CardDescription>
            {items === null
              ? 'Loading…'
              : unreadCount > 0
                ? `${unreadCount} unread`
                : 'All caught up'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items === null && (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          )}
          {items && items.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              No notifications yet. New cash requests will appear here for HR.
            </p>
          )}
          {items?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void onOpen(item)}
              className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition hover:bg-[var(--color-muted)]/40 ${
                item.read
                  ? 'border-[var(--color-border)]'
                  : 'border-blue-500/30 bg-blue-500/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{item.title}</p>
                {!item.read && <Badge variant="info">New</Badge>}
              </div>
              <p className="text-sm text-[var(--color-muted-foreground)]">{item.body}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {formatDateTime(item.createdAt)}
                {item.link ? (
                  <>
                    {' · '}
                    <Link
                      to={item.link}
                      className="underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open
                    </Link>
                  </>
                ) : null}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
