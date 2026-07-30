import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileStack,
  Clock3,
  CheckCircle2,
  Wallet,
  CircleDollarSign,
  PiggyBank,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { subscribeCashRequests } from '@/lib/cash'
import {
  currentYearMonth,
  formatYearMonthLabel,
  subscribeAllMonthlyCredits,
  summarizeMonthWithCarry,
} from '@/lib/balance'
import { canApproveHr, canApproveManagement, hasPermission, ROLE_LABELS } from '@/lib/role'
import { subscribeSalarySheets } from '@/lib/salary'
import { formatCurrency } from '@/lib/utils'
import {
  CASH_STATUS_LABELS,
  SALARY_STATUS_LABELS,
  type CashRequest,
  type SalarySheet,
} from '@/types'

export default function DashboardPage() {
  const { profile, role } = useAuth()
  const [requests, setRequests] = useState<CashRequest[]>([])
  const [sheets, setSheets] = useState<SalarySheet[]>([])
  const [creditsByMonth, setCreditsByMonth] = useState<Record<string, number>>({})
  const yearMonth = currentYearMonth()
  const showBalance = canApproveHr(role)
  const hasCash = hasPermission(profile, 'cash')
  const hasSalary = hasPermission(profile, 'salary')

  useEffect(() => {
    if (!hasCash) return
    return subscribeCashRequests(setRequests)
  }, [hasCash])

  useEffect(() => {
    if (!hasSalary) return
    return subscribeSalarySheets(setSheets)
  }, [hasSalary])

  useEffect(() => {
    if (!showBalance) return
    return subscribeAllMonthlyCredits(setCreditsByMonth)
  }, [showBalance])

  const summary = useMemo(
    () =>
      showBalance
        ? summarizeMonthWithCarry(yearMonth, creditsByMonth, requests)
        : null,
    [showBalance, yearMonth, creditsByMonth, requests],
  )

  const cashStats = useMemo(() => {
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

    const items = [
      { title: 'Total requests', value: String(requests.length), icon: FileStack },
      { title: 'Pending HR', value: String(pendingHr), icon: Clock3 },
      { title: 'Pending Management', value: String(pendingMgmt), icon: Clock3 },
      { title: 'Pending Finance', value: String(pendingFin), icon: Wallet },
      { title: 'Paid', value: String(paid), icon: CheckCircle2 },
      { title: 'Settled amount (all time)', value: formatCurrency(expense), icon: CircleDollarSign },
    ]

    if (showBalance && summary) {
      items.unshift(
        {
          title: `${formatYearMonthLabel(yearMonth)} remaining`,
          value: formatCurrency(summary.remaining),
          icon: PiggyBank,
        },
        {
          title: 'Brought forward',
          value: formatCurrency(summary.carryIn),
          icon: PiggyBank,
        },
        {
          title: 'Paid this month',
          value: formatCurrency(summary.spent),
          icon: CircleDollarSign,
        },
      )
    }

    return items
  }, [requests, showBalance, yearMonth, summary])

  const visibleSheets = useMemo(() => {
    return sheets.filter((sheet) => {
      if (canApproveHr(role) || role === 'it') return true
      if (canApproveManagement(role)) {
        return (
          sheet.status === 'shared_management' ||
          sheet.status === 'pending_finance' ||
          sheet.status === 'approved'
        )
      }
      return sheet.status === 'pending_finance' || sheet.status === 'approved'
    })
  }, [sheets, role])

  const salaryStats = useMemo(() => {
    const total = visibleSheets.length
    const pending = visibleSheets.filter(
      (s) => s.status !== 'approved' && s.status !== 'rejected',
    ).length
    const approved = visibleSheets.filter((s) => s.status === 'approved').length
    return [
      { title: 'Total salary sheets', value: String(total), icon: FileStack },
      { title: 'Pending', value: String(pending), icon: Clock3 },
      { title: 'Approved', value: String(approved), icon: CheckCircle2 },
    ]
  }, [visibleSheets])

  const recentCash = requests.slice(0, 5)
  const recentSalary = visibleSheets.slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Welcome back, {profile?.displayName || profile?.email || 'User'}
            {role ? ` · ${ROLE_LABELS[role]}` : ''}.
          </p>
        </div>
        {showBalance && (
          <Button asChild variant="outline" size="sm">
            <Link to="/monthly-balance">Manage monthly balance</Link>
          </Button>
        )}
      </div>

      {hasCash && (
        <>
          {hasSalary && (
            <h2 className="text-base font-semibold">Petty Cash</h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cashStats.map((item) => (
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
              {recentCash.length === 0 && (
                <p className="text-sm text-[var(--color-muted-foreground)]">No requests yet.</p>
              )}
              {recentCash.map((req) => (
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
        </>
      )}

      {hasSalary && (
        <>
          {hasCash && (
            <h2 className="text-base font-semibold">Salary</h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {salaryStats.map((item) => (
              <Card key={item.title}>
                <CardContent className="flex items-start justify-between gap-3 p-5">
                  <div>
                    <p className="text-sm text-[var(--color-muted-foreground)]">{item.title}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-muted)] p-2.5 text-green-600 dark:text-green-400">
                    <item.icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent salary sheets</CardTitle>
              <CardDescription>Latest salary workflow activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentSalary.length === 0 && (
                <p className="text-sm text-[var(--color-muted-foreground)]">No salary sheets yet.</p>
              )}
              {recentSalary.map((sheet) => (
                <Link
                  key={sheet.id}
                  to={`/salary/${sheet.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">{sheet.title}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">{sheet.period}</p>
                  </div>
                  <Badge variant="outline">{SALARY_STATUS_LABELS[sheet.status]}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
