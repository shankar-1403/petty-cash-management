import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { onValueWritten } from 'firebase-functions/v2/database'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import nodemailer from 'nodemailer'

initializeApp({
  databaseURL: 'https://petty-cash-management-6650a-default-rtdb.asia-southeast1.firebasedatabase.app',
})

const M365_EMAIL = defineSecret('M365_EMAIL')
const M365_PASSWORD = defineSecret('M365_PASSWORD')

const APPROVAL_THRESHOLD = 2000
const APP_URL = 'https://kubera.pcred.org'
const REGION = 'asia-southeast1'
const DB_INSTANCE = 'petty-cash-management-6650a-default-rtdb'

// ── Types ────────────────────────────────────────────────────────────────────

interface UserRecord {
  email?: string
  displayName?: string
  role?: string
}

interface PaymentInstallment {
  id: string
  amount: number
  dueDate: string
  status: 'pending' | 'paid'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getUsersByRole(role: string): Promise<{ email: string; displayName: string }[]> {
  const snapshot = await getDatabase().ref('users').get()
  if (!snapshot.exists()) return []

  const result: { email: string; displayName: string }[] = []
  snapshot.forEach((child) => {
    const data = child.val() as UserRecord
    if (data.role === role && data.email) {
      result.push({ email: data.email, displayName: data.displayName || data.email })
    }
  })
  return result
}

async function sendEmails(
  recipients: { email: string; displayName: string }[],
  subject: string,
  html: string,
): Promise<void> {
  if (!recipients.length) return

  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: M365_EMAIL.value(),
      pass: M365_PASSWORD.value(),
    },
  })

  const from = `"Petty Cash System" <${M365_EMAIL.value()}>`

  await Promise.all(
    recipients.map((r) =>
      transporter.sendMail({ from, to: r.email, subject, html }).catch((err) => {
        console.error(`Failed to send email to ${r.email}:`, err)
      }),
    ),
  )
}

function formatAmount(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function requestLink(id: string): string {
  return `${APP_URL}/cash/${id}`
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeInstallments(raw: unknown): PaymentInstallment[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as PaymentInstallment[]
  if (typeof raw === 'object') return Object.values(raw as Record<string, PaymentInstallment>)
  return []
}

// ── Email templates ──────────────────────────────────────────────────────────

function approvalEmailHtml(
  heading: string,
  rows: { label: string; value: string }[],
  linkHref: string,
  linkText: string,
): string {
  const tableRows = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#374151;white-space:nowrap">${r.label}</td>
        <td style="padding:8px 12px;color:#111827">${r.value}</td>
      </tr>`,
    )
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f9fafb;padding:32px 16px">
      <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <h2 style="margin:0 0 20px;font-size:18px;color:#111827">${heading}</h2>
        <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          ${tableRows}
        </table>
        <div style="margin-top:24px">
          <a href="${linkHref}"
             style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;
                    text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
            ${linkText}
          </a>
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">
        Petty Cash Management System
      </p>
    </div>`
}

function dueReminderHtml(
  heading: string,
  accentColor: string,
  items: { subject: string; amount: number; dueDate: string; link: string }[],
): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">
          <a href="${item.link}" style="color:#3b82f6;text-decoration:none;font-weight:600">${item.subject}</a>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${formatAmount(item.amount)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${item.dueDate}</td>
      </tr>`,
    )
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#f9fafb;padding:32px 16px">
      <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:4px;height:32px;background:${accentColor};border-radius:2px"></div>
          <h2 style="margin:0;font-size:18px;color:#111827">${heading}</h2>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151">Subject</th>
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151">Amount</th>
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151">Due Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:20px;font-size:13px;color:#6b7280">
          Please log in to settle these payments.
        </p>
        <a href="${APP_URL}/cash"
           style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;
                  text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
          Open Cash Management
        </a>
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">
        Petty Cash Management System
      </p>
    </div>`
}

// ── Function 1: Approval flow email notifications ─────────────────────────────

export const onCashRequestWritten = onValueWritten(
  {
    ref: '/cashRequests/{id}',
    region: REGION,
    instance: DB_INSTANCE,
    secrets: [M365_EMAIL, M365_PASSWORD],
  },
  async (event) => {
    const before = event.data.before.val() as Record<string, unknown> | null
    const after = event.data.after.val() as Record<string, unknown> | null

    if (!after) return

    const id = event.params.id
    const status = String(after.status ?? '')
    const prevStatus = before ? String(before.status ?? '') : null
    const amount = Number(after.amount ?? 0)
    const subject = String(after.subject ?? '')
    const createdByName = String(after.createdByName ?? '')
    const link = requestLink(id)

    const infoRows = [
      { label: 'Subject', value: subject },
      { label: 'Amount', value: formatAmount(amount) },
      { label: 'Raised by', value: createdByName },
    ]

    // New request created → notify HR
    if (!before && status === 'pending_hr') {
      const hrUsers = await getUsersByRole('hr')
      await sendEmails(
        hrUsers,
        `New Payment Request: ${subject}`,
        approvalEmailHtml('New payment request awaiting your approval', infoRows, link, 'Review Request'),
      )
      return
    }

    if (!prevStatus) return

    // HR approved, amount ≤ threshold → Finance
    if (prevStatus === 'pending_hr' && status === 'pending_finance' && amount <= APPROVAL_THRESHOLD) {
      const financeUsers = await getUsersByRole('finance')
      await sendEmails(
        financeUsers,
        `Payment Request Ready for Settlement: ${subject}`,
        approvalEmailHtml('A payment request is ready for settlement', infoRows, link, 'Settle Payment'),
      )
      return
    }

    // HR approved, amount > threshold → Management
    if (prevStatus === 'pending_hr' && status === 'pending_management') {
      const mgmtUsers = await getUsersByRole('management')
      await sendEmails(
        mgmtUsers,
        `Payment Request Awaiting Your Approval: ${subject}`,
        approvalEmailHtml('A payment request approved by HR requires your approval', infoRows, link, 'Review Request'),
      )
      return
    }

    // Management approved → Finance
    if (prevStatus === 'pending_management' && status === 'pending_finance') {
      const financeUsers = await getUsersByRole('finance')
      await sendEmails(
        financeUsers,
        `Payment Request Approved by Management: ${subject}`,
        approvalEmailHtml('A payment request approved by Management is ready for settlement', infoRows, link, 'Settle Payment'),
      )
      return
    }
  },
)

// ── Function 2: Daily due payment reminders at 12pm IST ──────────────────────

export const sendDuePaymentReminders = onSchedule(
  {
    schedule: '0 12 * * *',
    timeZone: 'Asia/Kolkata',
    region: REGION,
    secrets: [M365_EMAIL, M365_PASSWORD],
  },
  async () => {
    const snapshot = await getDatabase().ref('cashRequests').get()
    if (!snapshot.exists()) return

    const now = new Date()
    const todayStr = formatDate(now)
    const tomorrowStr = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))

    const financeUsers = await getUsersByRole('finance')
    if (!financeUsers.length) {
      console.log('No finance users found, skipping due reminders.')
      return
    }

    const requests = snapshot.val() as Record<string, Record<string, unknown>>

    const dueToday: { subject: string; amount: number; dueDate: string; link: string }[] = []
    const dueTomorrow: { subject: string; amount: number; dueDate: string; link: string }[] = []

    for (const [id, raw] of Object.entries(requests)) {
      const status = String(raw.status ?? '')
      if (status !== 'pending_finance' && status !== 'partially_paid') continue

      const plan = raw.paymentPlan as { installments: unknown } | undefined
      if (!plan) continue

      const installments = normalizeInstallments(plan.installments)
      const subject = String(raw.subject ?? '')
      const link = requestLink(id)

      for (const inst of installments) {
        if (inst.status === 'paid') continue
        const entry = { subject, amount: Number(inst.amount), dueDate: inst.dueDate, link }
        if (inst.dueDate === todayStr) dueToday.push(entry)
        else if (inst.dueDate === tomorrowStr) dueTomorrow.push(entry)
      }
    }

    if (dueToday.length > 0) {
      console.log(`Sending due-today reminder: ${dueToday.length} payment(s)`)
      await sendEmails(
        financeUsers,
        `⚠️ ${dueToday.length} Payment${dueToday.length > 1 ? 's' : ''} Due Today — ${todayStr}`,
        dueReminderHtml(
          `${dueToday.length} Payment${dueToday.length > 1 ? 's' : ''} Due Today`,
          '#ef4444',
          dueToday,
        ),
      )
    }

    if (dueTomorrow.length > 0) {
      console.log(`Sending due-tomorrow reminder: ${dueTomorrow.length} payment(s)`)
      await sendEmails(
        financeUsers,
        `📅 ${dueTomorrow.length} Payment${dueTomorrow.length > 1 ? 's' : ''} Due Tomorrow — ${tomorrowStr}`,
        dueReminderHtml(
          `${dueTomorrow.length} Payment${dueTomorrow.length > 1 ? 's' : ''} Due Tomorrow`,
          '#f59e0b',
          dueTomorrow,
        ),
      )
    }

    if (!dueToday.length && !dueTomorrow.length) {
      console.log('No due payments found for today or tomorrow.')
    }
  },
)
