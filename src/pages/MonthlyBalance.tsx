import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PiggyBank, Plus, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/context/AuthContext'
import { canApproveHr } from '@/lib/role'
import { subscribeCashRequests } from '@/lib/cash'
import {
  addMonthlyBalance,
  buildYearMonth,
  currentYearMonth,
  formatYearMonthLabel,
  MONTH_OPTIONS,
  parseYearMonthParts,
  paymentsDoneInMonth,
  subscribeAllMonthlyCredits,
  subscribeBalanceFilterYears,
  subscribeMonthlyBalance,
  summarizeMonthWithCarry,
  type MonthlyBalance,
} from '@/lib/balance'
import { downloadPettyCashExpenseReport } from '@/lib/petty-cash-report'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { CashRequest } from '@/types'

export default function MonthlyBalancePage() {
  const { user, profile, role } = useAuth()
  const initial = parseYearMonthParts(currentYearMonth())
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [yearOptions, setYearOptions] = useState<number[]>([Number(initial.year)])
  const [balance, setBalance] = useState<MonthlyBalance | null>(null)
  const [creditsByMonth, setCreditsByMonth] = useState<Record<string, number>>({})
  const [requests, setRequests] = useState<CashRequest[]>([])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const yearMonth = useMemo(() => buildYearMonth(year, month), [year, month])

  useEffect(() => subscribeBalanceFilterYears(setYearOptions), [])
  useEffect(() => subscribeAllMonthlyCredits(setCreditsByMonth), [])
  useEffect(() => subscribeMonthlyBalance(yearMonth, setBalance), [yearMonth])
  useEffect(() => subscribeCashRequests(setRequests), [])

  // Keep selected year in the options list if it somehow falls outside the window
  useEffect(() => {
    const y = Number(year)
    if (!Number.isFinite(y)) return
    setYearOptions((prev) => {
      if (prev.includes(y)) return prev
      return [...prev, y].sort((a, b) => b - a)
    })
  }, [year])

  // Also include years found on payment dates
  useEffect(() => {
    const fromPayments = new Set<number>()
    for (const request of requests) {
      for (const inst of request.paymentPlan?.installments ?? []) {
        if (inst.status !== 'paid' || !inst.paidAt) continue
        fromPayments.add(new Date(inst.paidAt).getFullYear())
      }
    }
    if (fromPayments.size === 0) return
    setYearOptions((prev) =>
      [...new Set([...prev, ...fromPayments])].sort((a, b) => b - a),
    )
  }, [requests])

  const monthPayments = useMemo(
    () => paymentsDoneInMonth(requests, yearMonth),
    [requests, yearMonth],
  )
  const summary = useMemo(
    () => summarizeMonthWithCarry(yearMonth, creditsByMonth, requests),
    [yearMonth, creditsByMonth, requests],
  )

  if (!canApproveHr(role)) {
    return <Navigate to="/dashboard" replace />
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setBusy(true)
    try {
      await addMonthlyBalance({
        yearMonth,
        amount: value,
        note,
        actor: { uid: user.uid, name: profile.displayName || profile.email },
      })
      setAmount('')
      setNote('')
      toast.success(
        `Added ${formatCurrency(value)} to ${formatYearMonthLabel(yearMonth)} (on top of brought-forward balance)`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add balance')
    } finally {
      setBusy(false)
    }
  }

  function onExportReport() {
    try {
      downloadPettyCashExpenseReport({
        yearMonth,
        creditsByMonth,
        monthBalance: balance,
        requests,
      })
      toast.success(`Exported report for ${formatYearMonthLabel(yearMonth)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monthly Balance</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Previous month remaining carries forward. New adds stack on top, then payments reduce it.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-emerald-600/40 bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/25 dark:text-emerald-300"
            onClick={onExportReport}
          >
            <Download className="h-4 w-4" />
            Export Report
          </Button>
          <div className="w-32">
            <Label className="mb-1.5 block text-xs">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="mb-1.5 block text-xs">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-muted-foreground)]">Brought forward</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {formatCurrency(summary.carryIn)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-muted-foreground)]">Added this month</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {formatCurrency(summary.added)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-muted-foreground)]">Paid this month</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {formatCurrency(summary.spent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-muted-foreground)]">Remaining</p>
            <p
              className={`mt-2 text-2xl font-semibold tracking-tight ${summary.remaining < 0 ? 'text-red-600' : ''
                }`}
            >
              {formatCurrency(summary.remaining)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Available {formatCurrency(summary.available)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add balance
          </CardTitle>
          <CardDescription>
            Adds to {formatYearMonthLabel(yearMonth)} on top of brought-forward{' '}
            {formatCurrency(summary.carryIn)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => void onAdd(e)}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="balanceAmount">Amount (₹)</Label>
              <Input
                id="balanceAmount"
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 50000"
                required
              />
            </div>
            <div className="flex-[2] space-y-2">
              <Label htmlFor="balanceNote">Note (optional)</Label>
              <Input
                id="balanceNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. July float from accounts"
              />
            </div>
            <Button type="submit" disabled={busy}>
              <PiggyBank className="h-4 w-4" />
              {busy ? 'Saving…' : 'Add balance'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
            <CardDescription>Amounts added by HR</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(balance?.credits.length ?? 0) === 0 && (
              <p className="text-sm text-[var(--color-muted-foreground)]">No credits yet.</p>
            )}
            {balance?.credits.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-emerald-600 dark:text-emerald-400">
                    + {formatCurrency(c.amount)}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {c.byName}
                    {c.note ? ` · ${c.note}` : ''}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {formatDateTime(c.at)}
                  </p>
                </div>
                <Badge variant="success">Credit</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments done this month</CardTitle>
            <CardDescription>
              Deducted only after Finance marks an installment paid (by payment date)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthPayments.length === 0 && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No payments completed in {formatYearMonthLabel(yearMonth)} yet.
              </p>
            )}
            {monthPayments.map((d) => (
              <Link
                key={`${d.requestId}_${d.installmentId}`}
                to={`/cash/${d.requestId}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm hover:bg-[var(--color-muted)]/40"
              >
                <div>
                  <p className="font-medium text-red-600 dark:text-red-400">
                    − {formatCurrency(d.amount)}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{d.subject}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {d.paidByName || 'Finance'} · {formatDateTime(d.paidAt)}
                  </p>
                </div>
                <Badge variant="danger">Paid</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
