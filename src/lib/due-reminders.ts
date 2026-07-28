import { get, ref, set } from 'firebase/database'
import { db } from '@/lib/firebase'
import { notifyRoles } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'

type ReminderKind = 'day_before' | 'on_due'

function localYmd(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return localYmd(dt)
}

function formatDueLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

async function alreadySent(
  requestId: string,
  installmentId: string,
  kind: ReminderKind,
): Promise<boolean> {
  const snap = await get(ref(db, `dueReminders/${requestId}/${installmentId}/${kind}`))
  return snap.exists()
}

async function markSent(
  requestId: string,
  installmentId: string,
  kind: ReminderKind,
): Promise<void> {
  await set(ref(db, `dueReminders/${requestId}/${installmentId}/${kind}`), {
    at: Date.now(),
    date: localYmd(),
  })
}

async function sendReminder(input: {
  requestId: string
  installmentId: string
  kind: ReminderKind
  subject: string
  amount: number
  dueDate: string
}): Promise<void> {
  if (await alreadySent(input.requestId, input.installmentId, input.kind)) return

  const dueLabel = formatDueLabel(input.dueDate)
  const isDayBefore = input.kind === 'day_before'

  await notifyRoles(['finance', 'it'], {
    title: isDayBefore ? 'Payment due tomorrow' : 'Payment due today',
    body: isDayBefore
      ? `“${input.subject}” (${formatCurrency(input.amount)}) is due tomorrow (${dueLabel}).`
      : `“${input.subject}” (${formatCurrency(input.amount)}) is due today (${dueLabel}).`,
    type: isDayBefore ? 'cash_due_tomorrow' : 'cash_due_today',
    link: `/cash/${input.requestId}`,
    requestId: input.requestId,
  })

  await markSent(input.requestId, input.installmentId, input.kind)
}

/**
 * Creates Finance notifications for unpaid installments due tomorrow or today.
 * Safe to call on app load — skips installments already reminded.
 */
export async function processFinanceDueReminders(): Promise<void> {
  const today = localYmd()
  const tomorrow = addDaysYmd(today, 1)

  const snap = await get(ref(db, 'cashRequests'))
  if (!snap.exists()) return

  const requests = snap.val() as Record<
    string,
    {
      subject?: string
      amount?: number
      status?: string
      expectedPaymentDate?: string
      paymentPlan?: {
        installments?: Array<{
          id?: string
          amount?: number
          dueDate?: string
          status?: string
        }>
      }
    }
  >

  const tasks: Promise<void>[] = []

  for (const [requestId, raw] of Object.entries(requests)) {
    const status = String(raw.status ?? '')
    if (status !== 'pending_finance' && status !== 'partially_paid') continue

    const subject = String(raw.subject ?? 'Payment request')
    const installments = raw.paymentPlan?.installments

    if (Array.isArray(installments) && installments.length > 0) {
      for (const inst of installments) {
        if (String(inst.status ?? 'pending') === 'paid') continue
        const dueDate = String(inst.dueDate ?? '').slice(0, 10)
        if (!dueDate) continue
        const installmentId = String(inst.id ?? dueDate)
        const amount = Number(inst.amount ?? raw.amount ?? 0)

        if (dueDate === tomorrow) {
          tasks.push(
            sendReminder({
              requestId,
              installmentId,
              kind: 'day_before',
              subject,
              amount,
              dueDate,
            }),
          )
        } else if (dueDate === today) {
          tasks.push(
            sendReminder({
              requestId,
              installmentId,
              kind: 'on_due',
              subject,
              amount,
              dueDate,
            }),
          )
        }
      }
      continue
    }

    // HR direct-to-finance path (no plan yet) — use expected payment date
    const dueDate = String(raw.expectedPaymentDate ?? '').slice(0, 10)
    if (!dueDate) continue
    const amount = Number(raw.amount ?? 0)
    const installmentId = 'expected'

    if (dueDate === tomorrow) {
      tasks.push(
        sendReminder({
          requestId,
          installmentId,
          kind: 'day_before',
          subject,
          amount,
          dueDate,
        }),
      )
    } else if (dueDate === today) {
      tasks.push(
        sendReminder({
          requestId,
          installmentId,
          kind: 'on_due',
          subject,
          amount,
          dueDate,
        }),
      )
    }
  }

  await Promise.allSettled(tasks)
}
