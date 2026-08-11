import type { CashRequest } from '@/types'
import {
  formatYearMonthLabel,
  paymentsDoneInMonth,
  summarizeMonthWithCarry,
  type BalanceCredit,
  type MonthlyBalance,
} from '@/lib/balance'
import { downloadCsv, formatAmountForCsv } from '../lib/csv'

export type PettyCashLedgerRow = {
  date: string
  particulars: string
  debit: string
  credit: string
  balance: string
  narration: string
  billStatus: string
}

function formatLedgerDate(ms: number): string {
  const d = new Date(ms)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

function monthStartMs(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1).getTime()
}

/**
 * Builds the PCRED VENTURE petty-cash expense ledger for a month,
 * matching: Date | Particulars | Debit | Credit | Balance | Narration | Bill Status
 */
export function buildPettyCashExpenseLedger(input: {
  yearMonth: string
  creditsByMonth: Record<string, number>
  monthBalance: MonthlyBalance | null
  requests: CashRequest[]
}): { title: string; rows: PettyCashLedgerRow[] } {
  const { yearMonth, creditsByMonth, monthBalance, requests } = input
  const summary = summarizeMonthWithCarry(yearMonth, creditsByMonth, requests)
  const title = `PCRED VENTURE - PETTY CASH EXPENSES - ${formatYearMonthLabel(yearMonth)}`

  const requestById = new Map(requests.map((r) => [r.id, r]))
  const payments = paymentsDoneInMonth(requests, yearMonth)
  const credits: BalanceCredit[] = monthBalance?.credits ?? []

  type Event =
    | {
        at: number
        kind: 'credit'
        amount: number
        particulars: string
        narration: string
        billStatus: string
      }
    | {
        at: number
        kind: 'debit'
        amount: number
        particulars: string
        narration: string
        billStatus: string
      }

  const events: Event[] = []

  for (const credit of credits) {
    events.push({
      at: credit.at || monthStartMs(yearMonth),
      kind: 'credit',
      amount: Number(credit.amount || 0),
      particulars: 'Cash Received / Float Added',
      narration: [credit.note, credit.byName ? `Added by ${credit.byName}` : '']
        .filter(Boolean)
        .join(' · '),
      billStatus: '—',
    })
  }

  for (const payment of payments) {
    const request = requestById.get(payment.requestId)
    const particulars = request?.subject || payment.subject || 'Payment'
    const narrationParts = [
      request?.category,
      request?.notes,
      payment.paidByName ? `Paid by ${payment.paidByName}` : '',
    ].filter(Boolean)

    events.push({
      at: payment.paidAt,
      kind: 'debit',
      amount: Number(payment.amount || 0),
      particulars,
      narration: narrationParts.join(' · '),
      billStatus: request?.hasInvoice ? 'With Bill' : 'Without Bill',
    })
  }

  events.sort((a, b) => a.at - b.at || (a.kind === 'credit' ? -1 : 1))

  const rows: PettyCashLedgerRow[] = []
  let running = 0

  // Opening / brought-forward row
  if (summary.carryIn !== 0 || events.length > 0 || summary.added !== 0) {
    running = summary.carryIn
    rows.push({
      date: formatLedgerDate(monthStartMs(yearMonth)),
      particulars: 'Opening Balance',
      debit: summary.carryIn < 0 ? formatAmountForCsv(Math.abs(summary.carryIn)) : '',
      credit: summary.carryIn > 0 ? formatAmountForCsv(summary.carryIn) : '',
      balance: formatAmountForCsv(running),
      narration: 'Brought forward from previous month',
      billStatus: '—',
    })
  }

  for (const event of events) {
    if (event.kind === 'credit') {
      running += event.amount
      rows.push({
        date: formatLedgerDate(event.at),
        particulars: event.particulars,
        debit: '',
        credit: formatAmountForCsv(event.amount),
        balance: formatAmountForCsv(running),
        narration: event.narration,
        billStatus: event.billStatus,
      })
    } else {
      running -= event.amount
      rows.push({
        date: formatLedgerDate(event.at),
        particulars: event.particulars,
        debit: formatAmountForCsv(event.amount),
        credit: '',
        balance: formatAmountForCsv(running),
        narration: event.narration,
        billStatus: event.billStatus,
      })
    }
  }

  return { title, rows }
}

export function downloadPettyCashExpenseReport(input: {
  yearMonth: string
  creditsByMonth: Record<string, number>
  monthBalance: MonthlyBalance | null
  requests: CashRequest[]
}): void {
  const { title, rows } = buildPettyCashExpenseLedger(input)

  const monthLabel = formatYearMonthLabel(input.yearMonth).replace(/\s+/g, '_')

  const headers = [
    'Date',
    'Particulars',
    'Debit',
    'Credit',
    'Balance',
    'Narration',
    'Bill Status',
  ]

  const csvRows = [
    [title, '', '', '', '', '', ''],
    headers,
    ...rows.map((r) => [
      r.date,
      r.particulars,
      r.debit,
      r.credit,
      r.balance,
      r.narration,
      r.billStatus,
    ]),
  ]

  downloadCsv(
    `Kubera_${monthLabel}.csv`,
    [],
    csvRows,
  )
}
