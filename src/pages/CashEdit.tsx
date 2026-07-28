import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { getCashRequest, updateCashRequest } from '@/lib/cash'
import { canEditCash } from '@/lib/role'
import {
  APPROVAL_THRESHOLD,
  CASH_CATEGORIES,
  LOW_AMOUNT_ASSIGNEE_NAME,
  type CashRequest,
} from '@/types'

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CashEditPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, role } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState<CashRequest | null>(null)
  const [requestDate, setRequestDate] = useState('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [invoiceChoice, setInvoiceChoice] = useState<'yes' | 'no'>('no')
  const [amount, setAmount] = useState('')
  const [expectedPaymentDate, setExpectedPaymentDate] = useState('')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const data = await getCashRequest(id)
      setExisting(data)
      if (data) {
        setRequestDate(toDatetimeLocalValue(data.requestDate || data.createdAt))
        setSubject(data.subject)
        setCategory(data.category || '')
        setInvoiceChoice(data.hasInvoice ? 'yes' : 'no')
        setAmount(String(data.amount))
        setExpectedPaymentDate(data.expectedPaymentDate || '')
      }
      setLoading(false)
    })()
  }, [id])

  const amountValue = Number(amount)
  const mapsToPuja =
    Number.isFinite(amountValue) && amountValue > 0 && amountValue < APPROVAL_THRESHOLD

  const assigneeHint = useMemo(() => {
    if (!amount) return null
    if (mapsToPuja) {
      return `Amount is under ₹${APPROVAL_THRESHOLD.toLocaleString('en-IN')} — will be mapped to ${LOW_AMOUNT_ASSIGNEE_NAME}.`
    }
    if (Number.isFinite(amountValue) && amountValue >= APPROVAL_THRESHOLD) {
      return `Amount is ₹${APPROVAL_THRESHOLD.toLocaleString('en-IN')} or more — goes through HR then Management.`
    }
    return null
  }, [amount, amountValue, mapsToPuja])

  if (!canEditCash(role)) {
    return <Navigate to="/cash" replace />
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!existing) {
    return (
      <div className="space-y-4">
        <p>Request not found.</p>
        <Button asChild variant="outline">
          <Link to="/cash">Back</Link>
        </Button>
      </div>
    )
  }

  if (existing.status !== 'pending_hr' && existing.status !== 'rejected') {
    return (
      <div className="space-y-4">
        <p>This request can no longer be edited (already in approval/payment flow).</p>
        <Button asChild variant="outline">
          <Link to={`/cash/${existing.id}`}>View request</Link>
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile || !id) return

    if (!requestDate || !subject.trim() || !category) {
      toast.error('Date, subject, and category are required')
      return
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!expectedPaymentDate) {
      toast.error('Expected payment date is required')
      return
    }
    if (invoiceChoice === 'yes' && !invoiceFile && !existing?.invoiceUrl) {
      toast.error('Attach an invoice file or keep the existing one')
      return
    }

    const requestDateMs = new Date(requestDate).getTime()
    if (Number.isNaN(requestDateMs)) {
      toast.error('Enter a valid date/time')
      return
    }

    setSubmitting(true)
    try {
      await updateCashRequest(id, {
        subject,
        amount: amountValue,
        hasInvoice: invoiceChoice === 'yes',
        invoiceFile: invoiceChoice === 'yes' ? invoiceFile : null,
        clearInvoiceFile: invoiceChoice === 'no',
        category,
        requestDate: requestDateMs,
        expectedPaymentDate,
        actorUid: user.uid,
        actorName: profile.displayName || profile.email,
      })
      toast.success('Payment request updated')
      navigate(`/cash/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to={`/cash/${existing.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to request
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit payment</CardTitle>
          <CardDescription>
            Update this raised request. Saving keeps it with HR for approval
            {existing.status === 'rejected' ? ' (rejected requests return to pending HR)' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="requestDate">Date (Timestamp)</Label>
              <Input
                id="requestDate"
                type="datetime-local"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Categories</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CASH_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Invoice (Yes/No)</Label>
              <Select
                value={invoiceChoice}
                onValueChange={(v) => {
                  const next = v as 'yes' | 'no'
                  setInvoiceChoice(next)
                  if (next === 'no') setInvoiceFile(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {invoiceChoice === 'yes' && (
              <div className="space-y-2">
                <Label htmlFor="invoice">Invoice file</Label>
                {existing.invoiceUrl && !invoiceFile && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Current file kept unless you upload a replacement.{' '}
                    <a
                      href={existing.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      View current
                    </a>
                  </p>
                )}
                <Input
                  id="invoice"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              {assigneeHint && (
                <p className="text-xs text-[var(--color-muted-foreground)]">{assigneeHint}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedPaymentDate">Expected Payment date</Label>
              <Input
                id="expectedPaymentDate"
                type="date"
                value={expectedPaymentDate}
                onChange={(e) => setExpectedPaymentDate(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to={`/cash/${existing.id}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
