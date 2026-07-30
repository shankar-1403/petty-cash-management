import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { onValueWritten } from 'firebase-functions/v2/database'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import * as nodemailer from 'nodemailer'

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
  permissions?: {
    cash?: boolean
    salary?: boolean
    tracking?: boolean
    users?: boolean
  }
}

interface PaymentInstallment {
  id: string
  amount: number
  dueDate: string
  status: 'pending' | 'paid'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRole(role: unknown): string | null {
  const value = String(role ?? '')
    .trim()
    .toLowerCase()
  if (value === 'admin') return 'admin'
  if (value === 'hr') return 'hr'
  if (value === 'management' || value === 'manager') return 'management'
  if (value === 'finance' || value === 'accounts' || value === 'account') return 'finance'
  if (value === 'it') return 'it'
  return null
}

/** Match frontend: missing permissions → role defaults; explicit object → only true flags. */
function userHasPermission(
  data: UserRecord,
  permission: keyof NonNullable<UserRecord['permissions']>,
): boolean {
  const role = normalizeRole(data.role)
  if (!role) return false

  if (data.permissions != null && typeof data.permissions === 'object') {
    return data.permissions[permission] === true
  }

  // Role defaults (same as src/lib/role.ts)
  switch (permission) {
    case 'cash':
      return true
    case 'salary':
      return role === 'hr' || role === 'management' || role === 'finance' || role === 'it'
    case 'tracking':
      return role === 'admin' || role === 'hr' || role === 'management' || role === 'it'
    case 'users':
      return role === 'it'
    default:
      return false
  }
}

async function getUsersByRole(
  role: string,
  permission: keyof NonNullable<UserRecord['permissions']>,
): Promise<{ email: string; displayName: string }[]> {
  const snapshot = await getDatabase().ref('users').get()
  if (!snapshot.exists()) {
    console.log(`getUsersByRole(${role}): no users node`)
    return []
  }

  const wanted = normalizeRole(role)
  const result: { email: string; displayName: string }[] = []
  let matchedRole = 0
  let skippedNoEmail = 0
  let skippedPermission = 0

  snapshot.forEach((child) => {
    const data = child.val() as UserRecord
    if (normalizeRole(data.role) !== wanted) return
    matchedRole += 1
    if (!data.email) {
      skippedNoEmail += 1
      return
    }
    if (!userHasPermission(data, permission)) {
      skippedPermission += 1
      return
    }
    result.push({ email: data.email, displayName: data.displayName || data.email })
  })

  console.log(
    `getUsersByRole(${role}, ${permission}): matchedRole=${matchedRole} recipients=${result.length} skippedNoEmail=${skippedNoEmail} skippedPermission=${skippedPermission}`,
  )
  return result
}

/** Deduplicate recipients by email (case-insensitive). */
function uniqueRecipients(
  lists: { email: string; displayName: string }[][],
): { email: string; displayName: string }[] {
  const seen = new Set<string>()
  const out: { email: string; displayName: string }[] = []
  for (const list of lists) {
    for (const r of list) {
      const key = r.email.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(r)
    }
  }
  return out
}

async function sendEmails(
  recipients: { email: string; displayName: string }[],
  subject: string,
  html: string,
): Promise<void> {
  if (!recipients.length) {
    console.log('sendEmails: no recipients, skipping.')
    return
  }

  const emailUser = M365_EMAIL.value()
  const emailPass = M365_PASSWORD.value()

  if (!emailUser || !emailPass) {
    console.error('sendEmails: M365 credentials are empty — secrets may not be set or function not redeployed after setting them.')
    return
  }

  console.log(`[sendEmails] sending "${subject}" to [${recipients.map((r) => r.email).join(', ')}]`)

  const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  })

  const from = `"Kubera" <${emailUser}>`

  await Promise.all(
    recipients.map(async (r) => {
      try {
        await transporter.sendMail({ from, to: r.email, subject, html })
        console.log(`sendEmails: ✓ sent to ${r.email}`)
      } catch (err) {
        console.error(`sendEmails: ✗ failed to send to ${r.email}:`, err)
      }
    }),
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

    console.log(`onCashRequestWritten: id=${id} prevStatus=${prevStatus ?? 'null'} status=${status}`)
    const amount = Number(after.amount ?? 0)
    const subject = String(after.subject ?? '')
    const createdByName = String(after.createdByName ?? '')
    const link = requestLink(id)

    const infoRows = [
      { label: 'Subject', value: subject },
      { label: 'Amount', value: formatAmount(amount) },
      { label: 'Raised by', value: createdByName },
    ]

    // New request created → notify HR (+ IT)
    if (!before && status === 'pending_hr') {
      const recipients = uniqueRecipients([
        await getUsersByRole('hr', 'cash'),
        await getUsersByRole('it', 'cash'),
      ])
      await sendEmails(
        recipients,
        `New Payment Request: ${subject}`,
        approvalEmailHtml('New payment request awaiting your approval', infoRows, link, 'Review Request'),
      )
      return
    }

    if (!prevStatus) return

    // HR approved, amount ≤ threshold → Finance
    if (prevStatus === 'pending_hr' && status === 'pending_finance' && amount <= APPROVAL_THRESHOLD) {
      const recipients = uniqueRecipients([
        await getUsersByRole('finance', 'cash'),
        await getUsersByRole('it', 'cash'),
      ])
      await sendEmails(
        recipients,
        `Payment Request Ready for Settlement: ${subject}`,
        approvalEmailHtml('A payment request is ready for settlement', infoRows, link, 'Settle Payment'),
      )
      return
    }

    // HR approved, amount > threshold → Management
    if (prevStatus === 'pending_hr' && status === 'pending_management') {
      const recipients = uniqueRecipients([
        await getUsersByRole('management', 'cash'),
        await getUsersByRole('it', 'cash'),
      ])
      await sendEmails(
        recipients,
        `Payment Request Awaiting Your Approval: ${subject}`,
        approvalEmailHtml('A payment request approved by HR requires your approval', infoRows, link, 'Review Request'),
      )
      return
    }

    // Management approved → Finance
    if (prevStatus === 'pending_management' && status === 'pending_finance') {
      const recipients = uniqueRecipients([
        await getUsersByRole('finance', 'cash'),
        await getUsersByRole('it', 'cash'),
      ])
      await sendEmails(
        recipients,
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

    const financeUsers = uniqueRecipients([
      await getUsersByRole('finance', 'cash'),
      await getUsersByRole('it', 'cash'),
    ])
    if (!financeUsers.length) {
      console.log('No finance/IT users found, skipping due reminders.')
      return
    }

    const requests = snapshot.val() as Record<string, Record<string, unknown>>

    const dueToday: { subject: string; amount: number; dueDate: string; link: string }[] = []
    const dueTomorrow: { subject: string; amount: number; dueDate: string; link: string }[] = []

    for (const [id, raw] of Object.entries(requests)) {
      const status = String(raw.status ?? '')
      if (status !== 'pending_finance' && status !== 'partially_paid') continue

      const subject = String(raw.subject ?? '')
      const link = requestLink(id)
      const plan = raw.paymentPlan as { installments: unknown } | undefined

      if (!plan) {
        // HR direct-to-finance path — use expected payment date
        const dueDate = String(raw.expectedPaymentDate ?? '').slice(0, 10)
        if (!dueDate) continue
        const entry = {
          subject,
          amount: Number(raw.amount ?? 0),
          dueDate,
          link,
        }
        if (dueDate === todayStr) dueToday.push(entry)
        else if (dueDate === tomorrowStr) dueTomorrow.push(entry)
        continue
      }

      const installments = normalizeInstallments(plan.installments)

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
