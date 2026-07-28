import { v4 as uuid } from 'uuid'
import { get, onValue, push, ref, set, update } from 'firebase/database'
import { db } from '@/lib/firebase'
import { uploadInvoiceFile } from '@/lib/storage'
import { notifyRoles } from '@/lib/notifications'
import type { UserRole } from '@/lib/role'
import {
  APPROVAL_THRESHOLD,
  LOW_AMOUNT_ASSIGNEE_NAME,
  type CashRequest,
  type CashStatus,
  type PaymentInstallment,
  type PaymentPlanType,
  type TimelineEvent,
} from '@/types'
import { formatCurrency } from '@/lib/utils'

function timelineEvent(
  by: string,
  byName: string,
  action: string,
  message: string,
): TimelineEvent {
  return { at: Date.now(), by, byName, action, message }
}

async function findUserByDisplayName(
  displayName: string,
): Promise<{ uid: string; displayName: string } | null> {
  const snap = await get(ref(db, 'users'))
  if (!snap.exists()) return null
  const val = snap.val() as Record<string, { displayName?: string }>
  const target = displayName.trim().toLowerCase()
  for (const [uid, user] of Object.entries(val)) {
    if (String(user.displayName ?? '').trim().toLowerCase() === target) {
      return { uid, displayName: String(user.displayName) }
    }
  }
  return null
}

function parseRequest(id: string, raw: Record<string, unknown>): CashRequest {
  return {
    id,
    subject: String(raw.subject ?? ''),
    amount: Number(raw.amount ?? 0),
    hasInvoice: Boolean(raw.hasInvoice),
    invoiceUrl: raw.invoiceUrl ? String(raw.invoiceUrl) : undefined,
    category: String(raw.category ?? ''),
    notes: raw.notes ? String(raw.notes) : undefined,
    requestDate: Number(raw.requestDate ?? raw.createdAt ?? 0),
    expectedPaymentDate: String(raw.expectedPaymentDate ?? ''),
    assignedTo: raw.assignedTo ? String(raw.assignedTo) : undefined,
    assignedToName: raw.assignedToName ? String(raw.assignedToName) : undefined,
    status: raw.status as CashStatus,
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? raw.createdAt ?? 0),
    approvals: (raw.approvals as CashRequest['approvals']) ?? undefined,
    rejection: (raw.rejection as CashRequest['rejection']) ?? undefined,
    paymentPlan: (raw.paymentPlan as CashRequest['paymentPlan']) ?? undefined,
    timeline: Array.isArray(raw.timeline) ? (raw.timeline as TimelineEvent[]) : [],
  }
}

export async function uploadInvoice(file: File, requestId: string): Promise<string> {
  return uploadInvoiceFile(file, requestId)
}

export async function createCashRequest(input: {
  subject: string
  amount: number
  hasInvoice: boolean
  invoiceFile?: File | null
  category: string
  requestDate: number
  expectedPaymentDate: string
  notes?: string
  createdBy: string
  createdByName: string
}): Promise<string> {
  const newRef = push(ref(db, 'cashRequests'))
  const id = newRef.key
  if (!id) throw new Error('Could not create request id')

  let invoiceUrl: string | undefined
  if (input.hasInvoice && input.invoiceFile) {
    invoiceUrl = await uploadInvoice(input.invoiceFile, id)
  }

  const amount = Number(input.amount)
  let assignedTo: string | undefined
  let assignedToName: string | undefined
  let assignNote = ''

  if (amount < APPROVAL_THRESHOLD) {
    assignedToName = LOW_AMOUNT_ASSIGNEE_NAME
    const matched = await findUserByDisplayName(LOW_AMOUNT_ASSIGNEE_NAME)
    if (matched) assignedTo = matched.uid
    assignNote = ` Assigned to ${LOW_AMOUNT_ASSIGNEE_NAME} (amount < ₹${APPROVAL_THRESHOLD}).`
  }

  const now = Date.now()
  const request: Record<string, unknown> = {
    subject: input.subject.trim(),
    amount,
    hasInvoice: Boolean(input.hasInvoice),
    category: input.category.trim(),
    requestDate: input.requestDate,
    expectedPaymentDate: input.expectedPaymentDate,
    status: 'pending_hr',
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
    timeline: [
      timelineEvent(
        input.createdBy,
        input.createdByName,
        'created',
        `Request raised${input.hasInvoice ? ' with invoice' : ' without invoice'}.${assignNote}`,
      ),
    ],
  }

  if (invoiceUrl) request.invoiceUrl = invoiceUrl
  if (input.notes?.trim()) request.notes = input.notes.trim()
  if (assignedTo) request.assignedTo = assignedTo
  if (assignedToName) request.assignedToName = assignedToName

  await set(newRef, request)

  const extra = assignedTo ? [assignedTo] : []
  await notifyRoles(
    ['hr', 'it'],
    {
      title: 'New payment request',
      body: `${input.createdByName} raised “${input.subject.trim()}” for ${formatCurrency(amount)}${assignedToName ? ` · assigned to ${assignedToName}` : ''}.`,
      type: 'cash_new',
      link: `/cash/${id}`,
      requestId: id,
    },
    extra,
  ).catch((err) => console.error('Failed to create notifications', err))

  return id
}

export async function updateCashRequest(
  id: string,
  input: {
    subject: string
    amount: number
    hasInvoice: boolean
    invoiceFile?: File | null
    clearInvoiceFile?: boolean
    category: string
    requestDate: number
    expectedPaymentDate: string
    notes?: string
    actorUid: string
    actorName: string
  },
): Promise<void> {
  const current = await getCashRequest(id)
  if (!current) throw new Error('Request not found')
  if (current.status !== 'pending_hr' && current.status !== 'rejected') {
    throw new Error('Only pending HR or rejected requests can be edited')
  }

  const amount = Number(input.amount)
  let assignedTo: string | null = null
  let assignedToName: string | null = null
  let assignNote = ''

  if (amount < APPROVAL_THRESHOLD) {
    assignedToName = LOW_AMOUNT_ASSIGNEE_NAME
    const matched = await findUserByDisplayName(LOW_AMOUNT_ASSIGNEE_NAME)
    if (matched) assignedTo = matched.uid
    assignNote = ` Mapped to ${LOW_AMOUNT_ASSIGNEE_NAME}.`
  }

  let invoiceUrl: string | null = current.invoiceUrl ?? null
  if (input.hasInvoice && input.invoiceFile) {
    invoiceUrl = await uploadInvoice(input.invoiceFile, id)
  } else if (!input.hasInvoice || input.clearInvoiceFile) {
    invoiceUrl = null
  }

  const updates: Record<string, unknown> = {
    subject: input.subject.trim(),
    amount,
    hasInvoice: Boolean(input.hasInvoice),
    category: input.category.trim(),
    requestDate: input.requestDate,
    expectedPaymentDate: input.expectedPaymentDate,
    notes: input.notes?.trim() || null,
    invoiceUrl,
    assignedTo,
    assignedToName,
    status: 'pending_hr',
    updatedAt: Date.now(),
    rejection: null,
    timeline: [
      ...current.timeline,
      timelineEvent(
        input.actorUid,
        input.actorName,
        'updated',
        `Request updated by Admin.${assignNote}`,
      ),
    ],
  }

  await update(ref(db, `cashRequests/${id}`), updates)

  const extra = assignedTo ? [assignedTo] : []
  await notifyRoles(
    ['hr', 'it'],
    {
      title: 'Payment request updated',
      body: `${input.actorName} updated “${input.subject.trim()}” (${formatCurrency(amount)}).`,
      type: 'cash_updated',
      link: `/cash/${id}`,
      requestId: id,
    },
    extra,
  ).catch((err) => console.error('Failed to create notifications', err))
}

export async function getCashRequest(id: string): Promise<CashRequest | null> {
  const snap = await get(ref(db, `cashRequests/${id}`))
  if (!snap.exists()) return null
  return parseRequest(id, snap.val() as Record<string, unknown>)
}

export function subscribeCashRequests(
  callback: (requests: CashRequest[]) => void,
): () => void {
  const requestsRef = ref(db, 'cashRequests')
  return onValue(requestsRef, (snap) => {
    if (!snap.exists()) {
      callback([])
      return
    }
    const val = snap.val() as Record<string, Record<string, unknown>>
    const list = Object.entries(val)
      .map(([id, raw]) => parseRequest(id, raw))
      .sort((a, b) => b.createdAt - a.createdAt)
    callback(list)
  })
}

export async function hrApproveRequest(
  id: string,
  actor: { uid: string; name: string },
  note?: string,
): Promise<void> {
  const current = await getCashRequest(id)
  if (!current) throw new Error('Request not found')
  if (current.status !== 'pending_hr') throw new Error('Request is not pending HR approval')

  const nextStatus: CashStatus =
    current.amount <= APPROVAL_THRESHOLD ? 'pending_finance' : 'pending_management'

  const message =
    nextStatus === 'pending_finance'
      ? `HR approved (≤ ₹${APPROVAL_THRESHOLD}). Sent to Finance.`
      : `HR approved (> ₹${APPROVAL_THRESHOLD}). Sent to Management.`

  const updates = {
    status: nextStatus,
    updatedAt: Date.now(),
    [`approvals/hr`]: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      note: note || null,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'hr_approved', message),
    ],
  }

  await update(ref(db, `cashRequests/${id}`), updates)

  const notifyTarget: UserRole[] =
    nextStatus === 'pending_finance' ? ['finance', 'it'] : ['management', 'it']
  await notifyRoles(notifyTarget, {
    title: 'Request approved by HR',
    body: `${actor.name} approved “${current.subject}” (${formatCurrency(current.amount)}). ${message}`,
    type: 'cash_hr_approved',
    link: `/cash/${id}`,
    requestId: id,
  }).catch((err) => console.error('Failed to create notifications', err))
}

export async function hrRejectRequest(
  id: string,
  actor: { uid: string; name: string },
  reason: string,
): Promise<void> {
  const current = await getCashRequest(id)
  if (!current) throw new Error('Request not found')
  if (current.status !== 'pending_hr') throw new Error('Request is not pending HR approval')

  await update(ref(db, `cashRequests/${id}`), {
    status: 'rejected',
    updatedAt: Date.now(),
    rejection: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      reason,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'hr_rejected', `Rejected by HR: ${reason}`),
    ],
  })

  const extra = [current.createdBy, current.assignedTo].filter(Boolean) as string[]
  await notifyRoles(
    ['admin', 'it'],
    {
      title: 'Request rejected by HR',
      body: `${actor.name} rejected “${current.subject}”: ${reason}`,
      type: 'cash_rejected',
      link: `/cash/${id}`,
      requestId: id,
    },
    extra,
  ).catch((err) => console.error('Failed to create notifications', err))
}

function splitEqualAmounts(total: number): [number, number] {
  const first = Math.round((total / 2) * 100) / 100
  const second = Math.round((total - first) * 100) / 100
  return [first, second]
}

export async function managementApproveWithPlan(
  id: string,
  actor: { uid: string; name: string },
  plan: {
    type: PaymentPlanType
    installments: { amount: number; dueDate: string }[]
  },
  note?: string,
): Promise<void> {
  const current = await getCashRequest(id)
  if (!current) throw new Error('Request not found')
  if (current.status !== 'pending_management') {
    throw new Error('Request is not pending Management approval')
  }

  if (plan.type === 'split_equal' && plan.installments.length !== 2) {
    throw new Error('Split equally requires exactly 2 payment dates')
  }
  if (plan.type === 'full' && plan.installments.length !== 1) {
    throw new Error('Full payment requires one installment')
  }
  if (plan.type === 'manual' && plan.installments.length < 2) {
    throw new Error('Manual splitting requires at least 2 parts')
  }

  let amounts = plan.installments.map((i) => Number(i.amount))
  if (plan.type === 'split_equal') {
    amounts = splitEqualAmounts(current.amount)
  }

  const sum = amounts.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - current.amount) > 0.05) {
    throw new Error(`Installment amounts must total ${current.amount}`)
  }

  const installments: PaymentInstallment[] = plan.installments.map((row, index) => ({
    id: uuid(),
    amount: amounts[index],
    dueDate: row.dueDate,
    status: 'pending',
  }))

  await update(ref(db, `cashRequests/${id}`), {
    status: 'pending_finance',
    updatedAt: Date.now(),
    [`approvals/management`]: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      note: note || null,
    },
    paymentPlan: {
      type: plan.type,
      installments,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(
        actor.uid,
        actor.name,
        'management_approved',
        `Management approved with ${plan.type.replace('_', ' ')} payment plan`,
      ),
    ],
  })

  await notifyRoles(['finance', 'it'], {
    title: 'Request approved by Management',
    body: `${actor.name} approved “${current.subject}” with a ${plan.type.replace('_', ' ')} plan.`,
    type: 'cash_management_approved',
    link: `/cash/${id}`,
    requestId: id,
  }).catch((err) => console.error('Failed to create notifications', err))
}

export async function managementRejectRequest(
  id: string,
  actor: { uid: string; name: string },
  reason: string,
): Promise<void> {
  const current = await getCashRequest(id)
  if (!current) throw new Error('Request not found')
  if (current.status !== 'pending_management') {
    throw new Error('Request is not pending Management approval')
  }

  await update(ref(db, `cashRequests/${id}`), {
    status: 'rejected',
    updatedAt: Date.now(),
    rejection: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      reason,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'management_rejected', `Rejected by Management: ${reason}`),
    ],
  })

  const extra = [current.createdBy, current.assignedTo].filter(Boolean) as string[]
  await notifyRoles(
    ['hr', 'admin', 'it'],
    {
      title: 'Request rejected by Management',
      body: `${actor.name} rejected “${current.subject}”: ${reason}`,
      type: 'cash_rejected',
      link: `/cash/${id}`,
      requestId: id,
    },
    extra,
  ).catch((err) => console.error('Failed to create notifications', err))
}

export async function markInstallmentPaid(
  requestId: string,
  installmentId: string,
  actor: { uid: string; name: string },
): Promise<void> {
  const current = await getCashRequest(requestId)
  if (!current) throw new Error('Request not found')
  if (!current.paymentPlan) {
    // HR direct-to-finance path: create a single full installment on the fly if missing
    if (current.status !== 'pending_finance') {
      throw new Error('Request is not awaiting finance settlement')
    }
    const installment: PaymentInstallment = {
      id: uuid(),
      amount: current.amount,
      dueDate: new Date().toISOString().slice(0, 10),
      status: 'paid',
      paidAt: Date.now(),
      paidBy: actor.uid,
      paidByName: actor.name,
    }
    await update(ref(db, `cashRequests/${requestId}`), {
      status: 'paid',
      updatedAt: Date.now(),
      paymentPlan: { type: 'full', installments: [installment] },
      timeline: [
        ...current.timeline,
        timelineEvent(actor.uid, actor.name, 'finance_paid', 'Marked as paid by Finance'),
      ],
    })
    const extra = [current.createdBy, current.assignedTo].filter(Boolean) as string[]
    await notifyRoles(
      ['admin', 'hr', 'it'],
      {
        title: 'Payment completed',
        body: `${actor.name} marked “${current.subject}” as paid.`,
        type: 'cash_paid',
        link: `/cash/${requestId}`,
        requestId: requestId,
      },
      extra,
    ).catch((err) => console.error('Failed to create notifications', err))
    return
  }

  if (
    current.status !== 'pending_finance' &&
    current.status !== 'partially_paid'
  ) {
    throw new Error('Request is not awaiting finance settlement')
  }

  const installments = current.paymentPlan.installments.map((inst) => {
    if (inst.id !== installmentId) return inst
    return {
      ...inst,
      status: 'paid' as const,
      paidAt: Date.now(),
      paidBy: actor.uid,
      paidByName: actor.name,
    }
  })

  const allPaid = installments.every((i) => i.status === 'paid')
  const anyPaid = installments.some((i) => i.status === 'paid')
  const status: CashStatus = allPaid ? 'paid' : anyPaid ? 'partially_paid' : current.status

  await update(ref(db, `cashRequests/${requestId}`), {
    status,
    updatedAt: Date.now(),
    paymentPlan: { ...current.paymentPlan, installments },
    timeline: [
      ...current.timeline,
      timelineEvent(
        actor.uid,
        actor.name,
        'finance_paid',
        allPaid ? 'All installments paid' : 'Installment marked paid',
      ),
    ],
  })

  if (allPaid) {
    const extra = [current.createdBy, current.assignedTo].filter(Boolean) as string[]
    await notifyRoles(
      ['admin', 'hr', 'it'],
      {
        title: 'Payment completed',
        body: `${actor.name} marked “${current.subject}” as fully paid.`,
        type: 'cash_paid',
        link: `/cash/${requestId}`,
        requestId: requestId,
      },
      extra,
    ).catch((err) => console.error('Failed to create notifications', err))
  }
}

export function waitingOnLabel(request: CashRequest): string {
  switch (request.status) {
    case 'pending_hr':
      return 'Waiting on HR'
    case 'pending_management':
      return 'Waiting on Management'
    case 'pending_finance':
    case 'partially_paid':
      return 'Waiting on Finance'
    case 'rejected':
      return 'Rejected'
    case 'paid':
      return 'Completed'
    default:
      return request.status
  }
}

export { splitEqualAmounts }
