import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import {
  getCashRequest,
  hrApproveRequest,
  hrRejectRequest,
  managementApproveWithPlan,
  managementRejectRequest,
  markInstallmentPaid,
  splitEqualAmounts,
  waitingOnLabel,
} from '@/lib/cash'
import {
  canApproveHr,
  canApproveManagement,
  canEditCash,
  canSettleFinance,
} from '@/lib/role'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import {
  APPROVAL_THRESHOLD,
  CASH_STATUS_LABELS,
  type CashRequest,
  type PaymentPlanType,
} from '@/types'

export default function CashDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, role } = useAuth()
  const [request, setRequest] = useState<CashRequest | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectTarget, setRejectTarget] = useState<'hr' | 'management'>('hr')
  const [planOpen, setPlanOpen] = useState(false)
  const [planType, setPlanType] = useState<PaymentPlanType>('full')
  const [partsInput, setPartsInput] = useState('2')
  const [dates, setDates] = useState<string[]>([''])
  const [amounts, setAmounts] = useState<string[]>([''])
  const [note, setNote] = useState('')

  async function reload() {
    if (!id) return
    const data = await getCashRequest(id)
    setRequest(data)
  }

  useEffect(() => {
    void reload()
  }, [id])

  useEffect(() => {
    if (!request) return
    if (planType === 'full') {
      setDates([''])
      setAmounts([String(request.amount)])
    } else if (planType === 'split_equal') {
      const [a, b] = splitEqualAmounts(request.amount)
      setDates(['', ''])
      setAmounts([String(a), String(b)])
    } else {
      const parsed = Number.parseInt(partsInput, 10)
      if (!Number.isFinite(parsed) || parsed < 1) return
      const n = Math.min(12, parsed)
      setDates((prev) => {
        if (prev.length === n) return prev
        return Array.from({ length: n }, (_, i) => prev[i] ?? '')
      })
      setAmounts((prev) => {
        if (prev.length === n) return prev
        return Array.from({ length: n }, (_, i) => prev[i] ?? '')
      })
    }
  }, [planType, partsInput, request?.amount])

  const actor = useMemo(() => {
    if (!user || !profile) return null
    return { uid: user.uid, name: profile.displayName || profile.email }
  }, [user, profile])

  if (request === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <p>Request not found.</p>
        <Button asChild variant="outline">
          <Link to="/cash">Back</Link>
        </Button>
      </div>
    )
  }

  async function onHrApprove() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await hrApproveRequest(id, actor, note || undefined)
      toast.success('Approved by HR')
      setNote('')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  async function onReject() {
    if (!actor || !id || !rejectReason.trim()) {
      toast.error('Enter a reason')
      return
    }
    setBusy(true)
    try {
      if (rejectTarget === 'hr') await hrRejectRequest(id, actor, rejectReason.trim())
      else await managementRejectRequest(id, actor, rejectReason.trim())
      toast.success('Request rejected')
      setRejectOpen(false)
      setRejectReason('')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setBusy(false)
    }
  }

  async function onManagementSavePlan() {
    if (!actor || !id || !request) return

    if (planType === 'manual') {
      const parsed = Number.parseInt(partsInput, 10)
      if (!Number.isFinite(parsed) || partsInput.trim() === '') {
        toast.error('Enter how many parts to split into')
        return
      }
      if (parsed < 2) {
        toast.error('Manual splitting needs at least 2 parts')
        return
      }
      if (parsed > 12) {
        toast.error('Maximum 12 parts allowed')
        return
      }
    }

    const installments = dates.map((dueDate, i) => ({
      dueDate,
      amount: Number(amounts[i]),
    }))

    if (installments.some((i) => !i.dueDate)) {
      toast.error('All payment dates are required')
      return
    }

    setBusy(true)
    try {
      await managementApproveWithPlan(
        id,
        actor,
        { type: planType, installments },
        note || undefined,
      )
      toast.success('Approved and sent to Finance')
      setPlanOpen(false)
      setNote('')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onMarkPaid(installmentId: string) {
    if (!actor || !id) return
    setBusy(true)
    try {
      await markInstallmentPaid(id, installmentId, actor)
      toast.success('Marked paid')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const showHrActions = canApproveHr(role) && request.status === 'pending_hr'
  const showMgmtActions =
    canApproveManagement(role) && request.status === 'pending_management'
  const showFinance =
    canSettleFinance(role) &&
    (request.status === 'pending_finance' || request.status === 'partially_paid')

  return (
    <div className="space-y-6">
      <Link
        to="/cash"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cash
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{request.subject}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {waitingOnLabel(request)} · Raised by {request.createdByName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CASH_STATUS_LABELS[request.status]}</Badge>
          {canEditCash(role) &&
            (request.status === 'pending_hr' || request.status === 'rejected') && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/cash/${request.id}/edit`}>Edit</Link>
              </Button>
            )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Date (Timestamp)</p>
              <p className="text-sm">{formatDateTime(request.requestDate || request.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Expected payment date</p>
              <p className="text-sm">{formatDate(request.expectedPaymentDate)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Amount</p>
              <p className="text-lg font-semibold">{formatCurrency(request.amount)}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Threshold ₹{APPROVAL_THRESHOLD.toLocaleString('en-IN')} —{' '}
                {request.amount <= APPROVAL_THRESHOLD
                  ? 'HR final (no Management)'
                  : 'Requires Management'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Invoice</p>
              <p className="text-sm">
                {request.hasInvoice
                  ? request.invoiceUrl
                    ? (
                        <a
                          href={request.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--color-primary)] underline"
                        >
                          View invoice
                        </a>
                      )
                    : 'Yes'
                  : 'No'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Category</p>
              <p className="text-sm">{request.category || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Assigned to</p>
              <p className="text-sm">{request.assignedToName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Raised by</p>
              <p className="text-sm">{request.createdByName}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Submitted</p>
              <p className="text-sm">{formatDateTime(request.createdAt)}</p>
            </div>
            {request.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs text-[var(--color-muted-foreground)]">Notes</p>
                <p className="text-sm">{request.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
            <CardDescription>Who has acted so far</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">HR</p>
              <p className="text-[var(--color-muted-foreground)]">
                {request.approvals?.hr
                  ? `${request.approvals.hr.byName} · ${formatDateTime(request.approvals.hr.at)}`
                  : request.status === 'pending_hr'
                    ? 'Not approved yet'
                    : '—'}
              </p>
            </div>
            <div>
              <p className="font-medium">Management</p>
              <p className="text-[var(--color-muted-foreground)]">
                {request.approvals?.management
                  ? `${request.approvals.management.byName} · ${formatDateTime(request.approvals.management.at)}`
                  : request.status === 'pending_management'
                    ? 'Not approved yet'
                    : request.amount <= APPROVAL_THRESHOLD && request.approvals?.hr
                      ? 'Not required (≤ threshold)'
                      : '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(showHrActions || showMgmtActions || showFinance) && (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showHrActions && (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void onHrApprove()}>
                  Approve (HR)
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setRejectTarget('hr')
                    setRejectOpen(true)
                  }}
                >
                  Reject
                </Button>
              </div>
            )}

            {showMgmtActions && (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => setPlanOpen(true)}>
                  Approve & set payment plan
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setRejectTarget('management')
                    setRejectOpen(true)
                  }}
                >
                  Reject
                </Button>
              </div>
            )}

            {showFinance && (
              <div className="space-y-3">
                {!request.paymentPlan && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Full amount</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        No plan set (HR direct path) · {formatCurrency(request.amount)}
                      </p>
                    </div>
                    <Button size="sm" disabled={busy} onClick={() => void onMarkPaid('__full__')}>
                      Mark paid
                    </Button>
                  </div>
                )}
                {request.paymentPlan?.installments.map((inst, index) => (
                  <div
                    key={inst.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        Part {index + 1} · {formatCurrency(inst.amount)}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Due {formatDate(inst.dueDate)} · {inst.status}
                      </p>
                    </div>
                    {inst.status === 'pending' && (
                      <Button size="sm" disabled={busy} onClick={() => void onMarkPaid(inst.id)}>
                        Mark paid
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {request.paymentPlan && !showFinance && (
        <Card>
          <CardHeader>
            <CardTitle>Payment plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm capitalize text-[var(--color-muted-foreground)]">
              Type: {request.paymentPlan.type.replace('_', ' ')}
            </p>
            {request.paymentPlan.installments.map((inst, index) => (
              <div
                key={inst.id}
                className="flex justify-between rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <span>
                  Part {index + 1} · Due {formatDate(inst.dueDate)}
                </span>
                <span>
                  {formatCurrency(inst.amount)} · {inst.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...request.timeline].reverse().map((event, i) => (
            <div key={`${event.at}-${i}`} className="border-l-2 border-[var(--color-border)] pl-3">
              <p className="text-sm font-medium">{event.message}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {event.byName} · {formatDateTime(event.at)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>Provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void onReject()}>
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment plan</DialogTitle>
            <DialogDescription>
              Choose how Finance should pay {formatCurrency(request.amount)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment type</Label>
              <Select
                value={planType}
                onValueChange={(v) => setPlanType(v as PaymentPlanType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full payment</SelectItem>
                  <SelectItem value="split_equal">Split equally (2 dates)</SelectItem>
                  <SelectItem value="manual">Manual splitting</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {planType === 'manual' && (
              <div className="space-y-2">
                <Label htmlFor="parts">Number of parts</Label>
                <Input
                  id="parts"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 3"
                  value={partsInput}
                  onChange={(e) => {
                    const raw = e.target.value
                    // Allow empty while typing; only digits
                    if (raw === '' || /^\d{1,2}$/.test(raw)) {
                      setPartsInput(raw)
                    }
                  }}
                />
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Type how many parts (1–12). You can clear and re-enter freely.
                </p>
              </div>
            )}

            {dates.map((date, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-[var(--color-border)] p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Part {index + 1} date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      const next = [...dates]
                      next[index] = e.target.value
                      setDates(next)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amounts[index] ?? ''}
                    disabled={planType === 'split_equal' || planType === 'full'}
                    onChange={(e) => {
                      const next = [...amounts]
                      next[index] = e.target.value
                      setAmounts(next)
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPlanOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void onManagementSavePlan()}>
                Save & send to Finance
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
