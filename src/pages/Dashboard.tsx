import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileStack,
  Clock3,
  CheckCircle2,
  Wallet,
  CircleDollarSign,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/context/AuthContext'
import { subscribeCashRequests } from '@/lib/cash'
import { ROLE_LABELS } from '@/lib/role'
import { formatCurrency } from '@/lib/utils'
import { CASH_STATUS_LABELS, type CashRequest } from '@/types'

export default function DashboardPage() {
  const { profile, role } = useAuth()
  const [requests, setRequests] = useState<CashRequest[]>([])

  useEffect(() => subscribeCashRequests(setRequests), [])

  const stats = useMemo(() => {
    const pendingHr = requests.filter((r) => r.status === 'pending_hr').length
    const pendingMgmt = requests.filter((r) => r.status === 'pending_management').length
    const pendingFin = requests.filter(
      (r) => r.status === 'pending_finance' || r.status === 'partially_paid',
    ).length
    const paid = requests.filter((r) => r.status === 'paid').length
    const expense = requests
      .filter((r) => r.status === 'paid' || r.status === 'partially_paid')
      .reduce((sum, r) => {
        const paidAmount =
          r.paymentPlan?.installments
            .filter((i) => i.status === 'paid')
            .reduce((s, i) => s + i.amount, 0) ?? (r.status === 'paid' ? r.amount : 0)
        return sum + paidAmount
      }, 0)

    return [
      { title: 'Total requests', value: String(requests.length), icon: FileStack },
      { title: 'Pending HR', value: String(pendingHr), icon: Clock3 },
      { title: 'Pending Management', value: String(pendingMgmt), icon: Clock3 },
      { title: 'Pending Finance', value: String(pendingFin), icon: Wallet },
      { title: 'Paid', value: String(paid), icon: CheckCircle2 },
      { title: 'Settled amount', value: formatCurrency(expense), icon: CircleDollarSign },
    ]
  }, [requests])

  const recent = requests.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Welcome back, {profile?.displayName || profile?.email || 'User'}
          {role ? ` · ${ROLE_LABELS[role]}` : ''}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <Card key={item.title}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div>
                <p className="text-sm text-[var(--color-muted-foreground)]">{item.title}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-muted)] p-2.5 text-blue-600 dark:text-blue-400">
                <item.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>Latest cash workflow activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">No requests yet.</p>
          )}
          {recent.map((req) => (
            <Link
              key={req.id}
              to={`/cash/${req.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{req.subject}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">{req.createdByName}</p>
              </div>
              <Badge variant="outline">{CASH_STATUS_LABELS[req.status]}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
