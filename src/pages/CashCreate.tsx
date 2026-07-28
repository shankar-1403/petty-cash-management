import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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
import { useAuth } from '@/context/AuthContext'
import { createCashRequest } from '@/lib/cash'
import { canCreateCash } from '@/lib/role'
import {
  APPROVAL_THRESHOLD,
  CASH_CATEGORIES,
  LOW_AMOUNT_ASSIGNEE_NAME,
} from '@/types'

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CashCreatePage() {
  const { user, profile, role } = useAuth()
  const navigate = useNavigate()
  const [requestDate, setRequestDate] = useState(() => toDatetimeLocalValue(Date.now()))
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [invoiceChoice, setInvoiceChoice] = useState<'yes' | 'no'>('no')
  const [amount, setAmount] = useState('')
  const [expectedPaymentDate, setExpectedPaymentDate] = useState('')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  if (!canCreateCash(role)) {
    return <Navigate to="/cash" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return

    if (!requestDate) {
      toast.error('Date (timestamp) is required')
      return
    }
    if (!subject.trim()) {
      toast.error('Subject is required')
      return
    }
    if (!category) {
      toast.error('Select a category')
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
    if (invoiceChoice === 'yes' && !invoiceFile) {
      toast.error('Attach an invoice file or select Invoice: No')
      return
    }

    const requestDateMs = new Date(requestDate).getTime()
    if (Number.isNaN(requestDateMs)) {
      toast.error('Enter a valid date/time')
      return
    }

    setSubmitting(true)
    try {
      const id = await createCashRequest({
        subject,
        amount: amountValue,
        hasInvoice: invoiceChoice === 'yes',
        invoiceFile: invoiceChoice === 'yes' ? invoiceFile : null,
        category,
        requestDate: requestDateMs,
        expectedPaymentDate,
        createdBy: user.uid,
        createdByName: profile.displayName || profile.email,
      })
      toast.success(
        mapsToPuja
          ? `Request raised and mapped to ${LOW_AMOUNT_ASSIGNEE_NAME}`
          : 'Payment request raised',
      )
      navigate(`/cash/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/cash"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cash
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Raise payment</CardTitle>
          <CardDescription>
            Admin cash request — with or without invoice. Sends to HR for approval.
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
                placeholder="e.g. Office supplies"
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

            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? 'Submitting…' : 'Submit request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
