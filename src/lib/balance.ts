import { get, onValue, push, ref, runTransaction, update } from 'firebase/database'
import { db } from '@/lib/firebase'
import type { CashRequest } from '@/types'

export type BalanceCredit = {
  id: string
  amount: number
  note?: string
  by: string
  byName: string
  at: number
}

export type BalanceDebit = {
  id: string
  amount: number
  requestId: string
  installmentId?: string
  subject: string
  by: string
  byName: string
  at: number
}

export type MonthPayment = {
  requestId: string
  installmentId: string
  subject: string
  amount: number
  paidAt: number
  paidByName?: string
}

export type MonthlyBalance = {
  yearMonth: string
  credited: number
  /** Stored ledger spent (audit). Prefer paymentsDoneInMonth for display. */
  spent: number
  remaining: number
  credits: BalanceCredit[]
  debits: BalanceDebit[]
  updatedAt: number
}

export function currentYearMonth(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function yearMonthFromTimestamp(ms: number): string {
  return currentYearMonth(new Date(ms))
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  if (!y || !m) return yearMonth
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Payments actually completed in a calendar month (by paidAt).
 * Source of truth for monthly spent / remaining.
 */
export function paymentsDoneInMonth(
  requests: CashRequest[],
  yearMonth: string,
): MonthPayment[] {
  const out: MonthPayment[] = []

  for (const request of requests) {
    const installments = request.paymentPlan?.installments
    if (!installments?.length) continue

    for (const inst of installments) {
      if (inst.status !== 'paid' || !inst.paidAt) continue
      if (yearMonthFromTimestamp(inst.paidAt) !== yearMonth) continue
      out.push({
        requestId: request.id,
        installmentId: inst.id,
        subject: request.subject,
        amount: Number(inst.amount || 0),
        paidAt: inst.paidAt,
        paidByName: inst.paidByName,
      })
    }
  }

  return out.sort((a, b) => b.paidAt - a.paidAt)
}

export function monthSpentFromPayments(payments: MonthPayment[]): number {
  return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
}

export function monthRemaining(credited: number, spent: number): number {
  return Number(credited || 0) - Number(spent || 0)
}

export function previousYearMonth(yearMonth: string): string {
  const { year, month } = parseYearMonthParts(yearMonth)
  const d = new Date(Number(year), Number(month) - 2, 1)
  return currentYearMonth(d)
}

export type MonthBalanceSummary = {
  yearMonth: string
  /** Remaining brought forward from previous month */
  carryIn: number
  /** Amount HR added in this month */
  added: number
  /** Payments marked paid in this month */
  spent: number
  /** carryIn + added */
  available: number
  /** carryIn + added − spent */
  remaining: number
}

/**
 * Walk prior months so leftover balance carries into the next month.
 * Remaining(month) = previousRemaining + addedThisMonth − paidThisMonth
 */
export function summarizeMonthWithCarry(
  yearMonth: string,
  creditsByMonth: Record<string, number>,
  requests: CashRequest[],
  lookbackMonths = 36,
): MonthBalanceSummary {
  const chain: string[] = []
  let cursor = yearMonth
  for (let i = 0; i < lookbackMonths; i++) {
    chain.unshift(cursor)
    cursor = previousYearMonth(cursor)
  }

  let carry = 0
  let summary: MonthBalanceSummary = {
    yearMonth,
    carryIn: 0,
    added: Number(creditsByMonth[yearMonth] ?? 0),
    spent: monthSpentFromPayments(paymentsDoneInMonth(requests, yearMonth)),
    available: Number(creditsByMonth[yearMonth] ?? 0),
    remaining: 0,
  }

  for (const ym of chain) {
    const added = Number(creditsByMonth[ym] ?? 0)
    const spent = monthSpentFromPayments(paymentsDoneInMonth(requests, ym))
    const carryIn = carry
    const remaining = carryIn + added - spent
    if (ym === yearMonth) {
      summary = {
        yearMonth: ym,
        carryIn,
        added,
        spent,
        available: carryIn + added,
        remaining,
      }
    }
    carry = remaining
  }

  return summary
}

/** Map of yearMonth → HR credited total for carry-forward math */
export function subscribeAllMonthlyCredits(
  callback: (creditsByMonth: Record<string, number>) => void,
): () => void {
  return onValue(ref(db, 'monthlyBalances'), (snap) => {
    const map: Record<string, number> = {}
    if (snap.exists()) {
      const val = snap.val() as Record<string, Record<string, unknown>>
      for (const [ym, raw] of Object.entries(val)) {
        map[ym] = parseMonth(ym, raw).credited
      }
    }
    callback(map)
  })
}

function parseMonth(yearMonth: string, raw: Record<string, unknown> | null): MonthlyBalance {
  const creditsRaw = (raw?.credits as Record<string, Record<string, unknown>> | undefined) ?? {}
  const debitsRaw = (raw?.debits as Record<string, Record<string, unknown>> | undefined) ?? {}

  const credits: BalanceCredit[] = Object.entries(creditsRaw)
    .map(([id, c]) => ({
      id,
      amount: Number(c.amount ?? 0),
      note: c.note ? String(c.note) : undefined,
      by: String(c.by ?? ''),
      byName: String(c.byName ?? ''),
      at: Number(c.at ?? 0),
    }))
    .sort((a, b) => b.at - a.at)

  const debits: BalanceDebit[] = Object.entries(debitsRaw)
    .map(([id, d]) => ({
      id,
      amount: Number(d.amount ?? 0),
      requestId: String(d.requestId ?? ''),
      installmentId: d.installmentId ? String(d.installmentId) : undefined,
      subject: String(d.subject ?? ''),
      by: String(d.by ?? ''),
      byName: String(d.byName ?? ''),
      at: Number(d.at ?? 0),
    }))
    .sort((a, b) => b.at - a.at)

  const credited =
    raw?.credited != null
      ? Number(raw.credited)
      : credits.reduce((s, c) => s + c.amount, 0)
  const spent =
    raw?.spent != null ? Number(raw.spent) : debits.reduce((s, d) => s + d.amount, 0)

  return {
    yearMonth,
    credited,
    spent,
    remaining: credited - spent,
    credits,
    debits,
    updatedAt: Number(raw?.updatedAt ?? 0),
  }
}

export function subscribeMonthlyBalance(
  yearMonth: string,
  callback: (balance: MonthlyBalance) => void,
): () => void {
  return onValue(ref(db, `monthlyBalances/${yearMonth}`), (snap) => {
    if (!snap.exists()) {
      callback(parseMonth(yearMonth, null))
      return
    }
    callback(parseMonth(yearMonth, snap.val() as Record<string, unknown>))
  })
}

export async function getMonthlyBalance(yearMonth: string): Promise<MonthlyBalance> {
  const snap = await get(ref(db, `monthlyBalances/${yearMonth}`))
  if (!snap.exists()) return parseMonth(yearMonth, null)
  return parseMonth(yearMonth, snap.val() as Record<string, unknown>)
}

/** HR adds funds to the selected month's petty-cash balance */
export async function addMonthlyBalance(input: {
  yearMonth: string
  amount: number
  note?: string
  actor: { uid: string; name: string }
}): Promise<void> {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid amount greater than 0')
  }

  const monthRef = ref(db, `monthlyBalances/${input.yearMonth}`)
  const creditRef = push(ref(db, `monthlyBalances/${input.yearMonth}/credits`))
  const creditId = creditRef.key
  if (!creditId) throw new Error('Could not create credit entry')

  await runTransaction(monthRef, (current) => {
    const base = (current as Record<string, unknown> | null) ?? {}
    const credited = Number(base.credited ?? 0) + amount
    const spent = Number(base.spent ?? 0)
    const credits = {
      ...((base.credits as Record<string, unknown>) ?? {}),
      [creditId]: {
        amount,
        note: input.note?.trim() || null,
        by: input.actor.uid,
        byName: input.actor.name,
        at: Date.now(),
      },
    }
    return {
      ...base,
      yearMonth: input.yearMonth,
      credited,
      spent,
      remaining: credited - spent,
      credits,
      updatedAt: Date.now(),
    }
  })
}

/**
 * Record a debit in the month the payment was completed (paidAt).
 * Idempotent per requestId+installmentId for that month.
 */
export async function deductMonthlyBalance(input: {
  amount: number
  requestId: string
  installmentId: string
  subject: string
  actor: { uid: string; name: string }
  paidAt?: number
  yearMonth?: string
}): Promise<void> {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return

  const paidAt = input.paidAt ?? Date.now()
  const yearMonth = input.yearMonth || yearMonthFromTimestamp(paidAt)
  const debitKey = `${input.requestId}_${input.installmentId}`
  const monthRef = ref(db, `monthlyBalances/${yearMonth}`)

  await runTransaction(monthRef, (current) => {
    const base = (current as Record<string, unknown> | null) ?? {}
    const debits = {
      ...((base.debits as Record<string, unknown>) ?? {}),
    }
    if (debits[debitKey]) {
      return base
    }

    const credited = Number(base.credited ?? 0)
    const spent = Number(base.spent ?? 0) + amount
    debits[debitKey] = {
      amount,
      requestId: input.requestId,
      installmentId: input.installmentId,
      subject: input.subject,
      by: input.actor.uid,
      byName: input.actor.name,
      at: paidAt,
    }

    return {
      ...base,
      yearMonth,
      credited,
      spent,
      remaining: credited - spent,
      debits,
      updatedAt: Date.now(),
    }
  })
}

export function listRecentYearMonths(count = 6): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(currentYearMonth(d))
  }
  return months
}

export const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

export function buildYearMonth(year: number | string, month: string): string {
  const y = String(year)
  const m = month.padStart(2, '0')
  return `${y}-${m}`
}

export function parseYearMonthParts(yearMonth: string): { year: string; month: string } {
  const [year = String(new Date().getFullYear()), month = '01'] = yearMonth.split('-')
  return { year, month: month.padStart(2, '0') }
}

/** Years available in the filter: window around today + years present in stored balances. */
export function subscribeBalanceFilterYears(callback: (years: number[]) => void): () => void {
  return onValue(ref(db, 'monthlyBalances'), (snap) => {
    const years = new Set<number>()
    const now = new Date().getFullYear()
    for (let y = now - 7; y <= now + 2; y++) years.add(y)

    if (snap.exists()) {
      for (const key of Object.keys(snap.val() as Record<string, unknown>)) {
        const y = Number(String(key).slice(0, 4))
        if (Number.isFinite(y) && y >= 2000 && y <= 2100) years.add(y)
      }
    }

    callback([...years].sort((a, b) => b - a))
  })
}

export async function ensureMonthlyBalance(yearMonth: string): Promise<void> {
  const snap = await get(ref(db, `monthlyBalances/${yearMonth}`))
  if (snap.exists()) return
  await update(ref(db, `monthlyBalances/${yearMonth}`), {
    yearMonth,
    credited: 0,
    spent: 0,
    remaining: 0,
    updatedAt: Date.now(),
  })
}
