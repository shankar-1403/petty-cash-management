import { v4 as uuid } from 'uuid'
import { get, onValue, push, ref, set, update } from 'firebase/database'
import { db } from '@/lib/firebase'
import { createPasswordSalt, hashPassword } from '@/lib/crypto-file'
import { createNotificationForUsers, notifyRoles } from '@/lib/notifications'
import { uploadSalarySheetFile } from '@/lib/storage'
import { findUidsByManagementLevel } from '@/lib/users'
import { hasPermission, type UserRole } from '@/lib/role'
import {
  MANAGEMENT_LEVEL_LABELS,
  type ManagementLevel,
  type SalaryRow,
  type SalarySheet,
  type SalaryStatus,
  type TimelineEvent,
  type UserPermissions,
} from '@/types'

type Actor = { uid: string; name: string }
type ActorProfile = {
  role: UserRole
  permissions?: UserPermissions
  managementLevel?: ManagementLevel
}

function timelineEvent(
  by: string,
  byName: string,
  action: string,
  message: string,
): TimelineEvent {
  return { at: Date.now(), by, byName, action, message }
}

/** Management approval chain: Lower → Higher → Head → Finance */
const STAGE_BY_LEVEL: Record<ManagementLevel, SalaryStatus> = {
  lower: 'pending_mgmt_lower',
  higher: 'pending_mgmt_higher',
  head: 'pending_mgmt_head',
}

const NEXT_LEVEL: Record<ManagementLevel, ManagementLevel | null> = {
  lower: 'higher',
  higher: 'head',
  head: null,
}

export function salaryStageLevel(status: SalaryStatus): ManagementLevel | null {
  if (status === 'pending_mgmt_lower') return 'lower'
  if (status === 'pending_mgmt_higher') return 'higher'
  if (status === 'pending_mgmt_head') return 'head'
  return null
}

/** Statuses from before the management sub-levels existed restart at the lower level. */
function normalizeSalaryStatus(raw: unknown): SalaryStatus {
  const value = String(raw ?? '')
  if (value === 'pending_hr_head' || value === 'hr_head_approved' || value === 'shared_management') {
    return 'pending_mgmt_lower'
  }
  return value as SalaryStatus
}

/** IT can act at any level; Management users only at their assigned level. */
export function canActOnSalaryStage(
  profile: ActorProfile | null | undefined,
  status: SalaryStatus,
): boolean {
  const level = salaryStageLevel(status)
  if (!profile || !level) return false
  if (profile.role === 'it') return true
  return profile.role === 'management' && profile.managementLevel === level
}

const LEVEL_ORDER: ManagementLevel[] = ['lower', 'higher', 'head']

/** Level that rejected the sheet (stored on newer rejections, else read from the timeline). */
export function salaryRejectedLevel(sheet: SalarySheet): ManagementLevel | null {
  if (sheet.status !== 'rejected') return null
  if (sheet.rejection?.level) return sheet.rejection.level
  for (let i = sheet.timeline.length - 1; i >= 0; i -= 1) {
    const match = /^mgmt_(lower|higher|head)_rejected$/.exec(sheet.timeline[i].action)
    if (match) return match[1] as ManagementLevel
  }
  return null
}

/** Which sheets a user may see in lists/dashboards. */
export function canViewSalarySheet(
  profile: ActorProfile | null | undefined,
  sheet: SalarySheet,
): boolean {
  if (!profile) return false
  if (profile.role === 'hr' || profile.role === 'it') return true
  if (!hasPermission(profile, 'salary')) return false

  const done = sheet.status === 'pending_finance' || sheet.status === 'approved'
  if (profile.role === 'management') {
    if (done) return true
    const stage = salaryStageLevel(sheet.status)
    if (!stage) return false
    if (!profile.managementLevel) return true
    return LEVEL_ORDER.indexOf(stage) >= LEVEL_ORDER.indexOf(profile.managementLevel)
  }
  return done
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
    status: normalizeSalaryStatus(raw.status),
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? raw.createdAt ?? 0),
    sharedAt: raw.sharedAt ? Number(raw.sharedAt) : undefined,
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
  actor: Actor,
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

async function notifyLevel(
  level: ManagementLevel,
  sheet: SalarySheet,
  title: string,
  body: string,
): Promise<void> {
  const uids = await findUidsByManagementLevel(level).catch(() => [])
  const payload = {
    title,
    body,
    type: 'salary_shared' as const,
    link: `/salary/${sheet.id}`,
    requestId: sheet.id,
  }
  await Promise.all([createNotificationForUsers(uids, payload), notifyRoles(['it'], payload)])
}

/** HR sends the sheet to Lower Management (first approval level). */
export async function shareSalaryWithManagement(id: string, actor: Actor): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  if (current.status === 'rejected') {
    throw new Error('A rejected sheet cannot be re-sent. Upload a new sheet instead.')
  }
  if (current.status !== 'draft') {
    throw new Error('Sheet cannot be sent to Management in its current status')
  }
  if (!current.fileUrl && !current.rows.length) {
    throw new Error('Upload a salary sheet file (or add rows) before sharing')
  }

  const now = Date.now()
  await update(ref(db, `salarySheets/${id}`), {
    status: STAGE_BY_LEVEL.lower,
    sharedAt: now,
    updatedAt: now,
    rejection: null,
    approvals: null,
    timeline: [
      ...current.timeline,
      timelineEvent(
        actor.uid,
        actor.name,
        'shared',
        `Sent to ${MANAGEMENT_LEVEL_LABELS.lower} for approval`,
      ),
    ],
  })

  await notifyLevel(
    'lower',
    current,
    'Salary sheet awaiting your approval',
    `${actor.name} sent “${current.title}” (${current.period}) for ${MANAGEMENT_LEVEL_LABELS.lower} approval.`,
  ).catch((err) => console.error('Failed to create notifications', err))
}

/** Approve at the current management level; moves to the next level, or to Finance after Head. */
export async function approveSalaryAtLevel(
  id: string,
  actor: Actor,
  actorProfile: ActorProfile,
  note?: string,
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  const level = salaryStageLevel(current.status)
  if (!level) throw new Error('Sheet is not awaiting Management approval')
  if (!canActOnSalaryStage(actorProfile, current.status)) {
    throw new Error(`Only ${MANAGEMENT_LEVEL_LABELS[level]} can approve at this step`)
  }

  const next = NEXT_LEVEL[level]
  const nextStatus: SalaryStatus = next ? STAGE_BY_LEVEL[next] : 'pending_finance'
  const nextLabel = next ? MANAGEMENT_LEVEL_LABELS[next] : 'Finance'

  await update(ref(db, `salarySheets/${id}`), {
    status: nextStatus,
    updatedAt: Date.now(),
    [`approvals/${level}`]: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      note: note || null,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(
        actor.uid,
        actor.name,
        `mgmt_${level}_approved`,
        `Approved by ${MANAGEMENT_LEVEL_LABELS[level]} — sent to ${nextLabel}`,
      ),
    ],
  })

  const body = `${actor.name} (${MANAGEMENT_LEVEL_LABELS[level]}) approved “${current.title}” (${current.period}).`
  const notify = next
    ? notifyLevel(next, current, 'Salary sheet awaiting your approval', `${body} It now needs ${nextLabel} approval.`)
    : notifyRoles(['finance', 'it', 'hr'], {
        title: 'Salary sheet approved by Head Management',
        body: `${body} It is ready for Finance.`,
        type: 'salary_shared',
        link: `/salary/${id}`,
        requestId: id,
      })
  await notify.catch((err) => console.error('Failed to create notifications', err))
}

/** Reject at any management level; the sheet goes back to HR. */
export async function rejectSalaryAtLevel(
  id: string,
  actor: Actor,
  actorProfile: ActorProfile,
  reason: string,
): Promise<void> {
  const current = await getSalarySheet(id)
  if (!current) throw new Error('Sheet not found')
  const level = salaryStageLevel(current.status)
  if (!level) throw new Error('Sheet is not awaiting Management approval')
  if (!canActOnSalaryStage(actorProfile, current.status)) {
    throw new Error(`Only ${MANAGEMENT_LEVEL_LABELS[level]} can reject at this step`)
  }

  await update(ref(db, `salarySheets/${id}`), {
    status: 'rejected',
    updatedAt: Date.now(),
    rejection: {
      by: actor.uid,
      byName: actor.name,
      at: Date.now(),
      reason,
      level,
    },
    timeline: [
      ...current.timeline,
      timelineEvent(
        actor.uid,
        actor.name,
        `mgmt_${level}_rejected`,
        `Rejected by ${MANAGEMENT_LEVEL_LABELS[level]}: ${reason}`,
      ),
    ],
  })

  const payload = {
    title: `Salary sheet rejected by ${MANAGEMENT_LEVEL_LABELS[level]}`,
    body: `${actor.name} rejected “${current.title}”: ${reason}`,
    type: 'salary_shared' as const,
    link: `/salary/${id}`,
    requestId: id,
  }
  await notifyRoles(['hr', 'it'], payload, [current.createdBy].filter(Boolean)).catch((err) =>
    console.error('Failed to create notifications', err),
  )
}

export async function financeApproveSalary(id: string, actor: Actor): Promise<void> {
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
