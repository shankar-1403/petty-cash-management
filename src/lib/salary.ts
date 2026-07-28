import { v4 as uuid } from 'uuid'
import { get, onValue, push, ref, set, update } from 'firebase/database'
import { db } from '@/lib/firebase'
import { createPasswordSalt, hashPassword } from '@/lib/crypto-file'
import { createNotificationForUsers, notifyRoles } from '@/lib/notifications'
import { uploadSalarySheetFile } from '@/lib/storage'
import {
  HR_HEAD_UID,
  type SalaryRow,
  type SalarySheet,
  type SalaryStatus,
  type TimelineEvent,
} from '@/types'

function timelineEvent(
  by: string,
  byName: string,
  action: string,
  message: string,
): TimelineEvent {
  return { at: Date.now(), by, byName, action, message }
}

export function isHrHead(uid: string | null | undefined): boolean {
  return Boolean(uid && uid === HR_HEAD_UID)
}

function parseSheet(id: string, raw: Record<string, unknown>): SalarySheet {
  const rowsRaw = raw.rows
  let rows: SalaryRow[] = []
  if (Array.isArray(rowsRaw)) {
    rows = rowsRaw as SalaryRow[]
  } else if (rowsRaw && typeof rowsRaw === 'object') {
    rows = Object.values(rowsRaw as Record<string, SalaryRow>)
  }

  return {
    id,
    title: String(raw.title ?? ''),
    period: String(raw.period ?? ''),
    rows,
    fileUrl: raw.fileUrl ? String(raw.fileUrl) : undefined,
    filePath: raw.filePath ? String(raw.filePath) : undefined,
    fileName: raw.fileName ? String(raw.fileName) : undefined,
    fileProtected: Boolean(raw.fileProtected),
    filePasswordSaltB64: raw.filePasswordSaltB64 ? String(raw.filePasswordSaltB64) : undefined,
    filePasswordHashB64: raw.filePasswordHashB64 ? String(raw.filePasswordHashB64) : undefined,
    fileSaltB64: raw.fileSaltB64 ? String(raw.fileSaltB64) : undefined,
    fileIvB64: raw.fileIvB64 ? String(raw.fileIvB64) : undefined,
    status: raw.status as SalaryStatus,
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? raw.createdAt ?? 0),
    sharedAt: raw.sharedAt ? Number(raw.sharedAt) : undefined,
    sharedWithHrHeadAt: raw.sharedWithHrHeadAt ? Number(raw.sharedWithHrHeadAt) : undefined,
    approvals: (raw.approvals as SalarySheet['approvals']) ?? undefined,
    rejection: (raw.rejection as SalarySheet['rejection']) ?? undefined,
    timeline: Array.isArray(raw.timeline) ? (raw.timeline as TimelineEvent[]) : [],
  }
}

export function subscribeSalarySheets(callback: (sheets: SalarySheet[]) => void): () => void {
  return onValue(ref(db, 'salarySheets'), (snap) => {
    if (!snap.exists()) {
      callback([])
      return
    }
    const val = snap.val() as Record<string, Record<string, unknown>>
    const list = Object.entries(val)
      .map(([id, raw]) => parseSheet(id, raw))
      .sort((a, b) => b.createdAt - a.createdAt)
    callback(list)
  })
}

export async function getSalarySheet(id: string): Promise<SalarySheet | null> {
  const snap = await get(ref(db, `salarySheets/${id}`))
  if (!snap.exists()) return null
  return parseSheet(id, snap.val() as Record<string, unknown>)
}

export async function createSalarySheet(input: {
  title: string
  period: string
  rows?: Omit<SalaryRow, 'id'>[]
  sheetFile: File
  filePassword: string
  createdBy: string
  createdByName: string
}): Promise<string> {
  if (!input.filePassword || input.filePassword.length < 4) {
    throw new Error('Password must be at least 4 characters')
  }

  const newRef = push(ref(db, 'salarySheets'))
  const id = newRef.key
  if (!id) throw new Error('Could not create sheet id')

  const passwordSaltB64 = createPasswordSalt()
  const passwordHashB64 = await hashPassword(input.filePassword, passwordSaltB64)
  const uploaded = await uploadSalarySheetFile(input.sheetFile, id, input.sheetFile.name)

  const now = Date.now()
  const rows: SalaryRow[] = (input.rows ?? [])
    .filter((r) => r.employeeName.trim())
    .map((r) => {
      const row: SalaryRow = {
        id: uuid(),
        employeeName: r.employeeName.trim(),
        amount: Number(r.amount),
      }
      if (r.department?.trim()) row.department = r.department.trim()
      if (r.notes?.trim()) row.notes = r.notes.trim()
      return row
    })

  const sheet: Record<string, unknown> = {
    title: input.title.trim(),
    period: input.period.trim(),
    rows,
    fileUrl: uploaded.url,
    filePath: uploaded.path,
    fileName: input.sheetFile.name,
    fileProtected: true,
    filePasswordSaltB64: passwordSaltB64,
    filePasswordHashB64: passwordHashB64,
    status: 'draft',
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
    timeline: [
      timelineEvent(
        input.createdBy,
        input.createdByName,
        'created',
        `Salary sheet uploaded with password protection (${input.sheetFile.name})`,
      ),
    ],
  }

  await set(newRef, sheet)
  return id
}

export async function updateSalarySheetDraft(
  id: string,
  input: { title: string; period: string; rows: SalaryRow[] },
  actor: { uid: string; name: string },
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'draft' && current.status !== 'rejected') {
    throw new Error('Only draft/rejected sheets can be edited')
  }

  await update(ref(db, `salarySheets/${id}`), {
    title: input.title.trim(),
    period: input.period.trim(),
    rows: input.rows,
    status: 'draft',
    updatedAt: Date.now(),
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'updated', 'Sheet updated'),
    ],
  })
}

/** HR sends sheet to HR Head for review */
export async function shareSalaryWithHrHead(
  id: string,
  actor: { uid: string; name: string },
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'draft' && current.status !== 'rejected') {
    throw new Error('Sheet cannot be sent to HR Head in its current status')
  }
  if (!current.fileUrl && !current.rows.length) {
    throw new Error('Upload a salary sheet file (or add rows) before sharing')
  }

  const now = Date.now()
  await update(ref(db, `salarySheets/${id}`), {
    status: 'pending_hr_head',
    sharedWithHrHeadAt: now,
    updatedAt: now,
    rejection: null,
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'shared_hr_head', 'Sent to HR Head for review'),
    ],
  })

  await Promise.all([
    createNotificationForUsers([HR_HEAD_UID], {
      title: 'Salary sheet awaiting HR Head review',
      body: `${actor.name} sent “${current.title}” (${current.period}) for your approval.`,
      type: 'salary_shared',
      link: `/salary/${id}`,
      requestId: id,
    }),
    notifyRoles(['it'], {
      title: 'Salary sheet sent to HR Head',
      body: `${actor.name} sent “${current.title}” (${current.period}) to HR Head.`,
      type: 'salary_shared',
      link: `/salary/${id}`,
      requestId: id,
    }),
  ]).catch((err) => console.error('Failed to create notifications', err))
}

/** HR Head approves the sheet (then can send to Management) */
export async function hrHeadApproveSalary(
  id: string,
  actor: { uid: string; name: string },
  options?: { allowItOverride?: boolean; note?: string },
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'pending_hr_head') {
    throw new Error('Sheet is not awaiting HR Head approval')
  }
  if (!isHrHead(actor.uid) && !options?.allowItOverride) {
    throw new Error('Only HR Head can approve at this step')
  }

  await update(ref(db, `salarySheets/${id}`), {
    status: 'hr_head_approved',
    updatedAt: Date.now(),
    [`approvals/hrHead`]: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      note: options?.note || null,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'hr_head_approved', 'Approved by HR Head'),
    ],
  })

  await Promise.all([
    createNotificationForUsers([current.createdBy].filter(Boolean), {
      title: 'Salary sheet approved by HR Head',
      body: `${actor.name} approved “${current.title}” (${current.period}). It can now be sent to Management.`,
      type: 'salary_shared',
      link: `/salary/${id}`,
      requestId: id,
    }),
    notifyRoles(['it'], {
      title: 'Salary sheet approved by HR Head',
      body: `${actor.name} approved “${current.title}” (${current.period}).`,
      type: 'salary_shared',
      link: `/salary/${id}`,
      requestId: id,
    }),
  ]).catch((err) => console.error('Failed to create notifications', err))
}

export async function hrHeadRejectSalary(
  id: string,
  actor: { uid: string; name: string },
  reason: string,
  options?: { allowItOverride?: boolean },
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'pending_hr_head' && current.status !== 'hr_head_approved') {
    throw new Error('Sheet cannot be rejected by HR Head in its current status')
  }
  if (!isHrHead(actor.uid) && !options?.allowItOverride) {
    throw new Error('Only HR Head can reject at this step')
  }

  await update(ref(db, `salarySheets/${id}`), {
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
      timelineEvent(actor.uid, actor.name, 'hr_head_rejected', `Rejected by HR Head: ${reason}`),
    ],
  })

  await createNotificationForUsers([current.createdBy].filter(Boolean), {
    title: 'Salary sheet rejected by HR Head',
    body: `${actor.name} rejected “${current.title}”: ${reason}`,
    type: 'salary_shared',
    link: `/salary/${id}`,
    requestId: id,
  }).catch((err) => console.error('Failed to create notifications', err))
}

/** HR Head sends approved sheet to Management */
export async function shareSalaryWithManagement(
  id: string,
  actor: { uid: string; name: string },
  options?: { allowItOverride?: boolean },
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'hr_head_approved') {
    throw new Error('Sheet must be approved by HR Head before sending to Management')
  }
  if (!isHrHead(actor.uid) && !options?.allowItOverride) {
    throw new Error('Only HR Head can send the sheet to Management')
  }
  if (!current.fileUrl && !current.rows.length) {
    throw new Error('Upload a salary sheet file (or add rows) before sharing')
  }

  const now = Date.now()
  await update(ref(db, `salarySheets/${id}`), {
    status: 'shared_management',
    sharedAt: now,
    updatedAt: now,
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'shared', 'Sent to Management by HR Head'),
    ],
  })

  await notifyRoles(['management', 'it'], {
    title: 'Salary sheet shared with Management',
    body: `${actor.name} sent “${current.title}” (${current.period}) for Management review.`,
    type: 'salary_shared',
    link: `/salary/${id}`,
    requestId: id,
  }).catch((err) => console.error('Failed to create notifications', err))
}

export async function managementApproveSalary(
  id: string,
  actor: { uid: string; name: string },
  note?: string,
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'shared_management') {
    throw new Error('Sheet is not awaiting Management approval')
  }

  await update(ref(db, `salarySheets/${id}`), {
    status: 'pending_finance',
    updatedAt: Date.now(),
    [`approvals/management`]: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      note: note || null,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'management_approved', 'Approved and sent to Finance'),
    ],
  })

  await notifyRoles(['finance', 'it', 'hr'], {
    title: 'Salary sheet approved by Management',
    body: `${actor.name} approved “${current.title}” (${current.period}).`,
    type: 'salary_shared',
    link: `/salary/${id}`,
    requestId: id,
  }).catch((err) => console.error('Failed to create notifications', err))
}

export async function managementRejectSalary(
  id: string,
  actor: { uid: string; name: string },
  reason: string,
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'shared_management') {
    throw new Error('Sheet is not awaiting Management approval')
  }

  await update(ref(db, `salarySheets/${id}`), {
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
      timelineEvent(actor.uid, actor.name, 'management_rejected', `Rejected: ${reason}`),
    ],
  })
}

export async function financeApproveSalary(
  id: string,
  actor: { uid: string; name: string },
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status !== 'pending_finance') {
    throw new Error('Sheet is not awaiting Finance')
  }

  await update(ref(db, `salarySheets/${id}`), {
    status: 'approved',
    updatedAt: Date.now(),
    timeline: [
      ...current.timeline,
      timelineEvent(actor.uid, actor.name, 'finance_approved', 'Finance marked salary sheet as approved'),
    ],
  })
}

export function salaryTotal(sheet: SalarySheet): number {
  return sheet.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
}
