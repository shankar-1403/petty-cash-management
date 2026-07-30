import { onValue, push, ref, set, update } from 'firebase/database'
import { db } from '@/lib/firebase'
import type { UserRole } from '@/lib/role'
import type { UserPermissions } from '@/types'

export type NotificationType =
  | 'cash_new'
  | 'cash_updated'
  | 'cash_hr_approved'
  | 'cash_management_approved'
  | 'cash_rejected'
  | 'cash_paid'
  | 'cash_due_tomorrow'
  | 'cash_due_today'
  | 'salary_shared'
  | 'general'

export interface AppNotification {
  id: string
  title: string
  body: string
  type: NotificationType
  link?: string
  requestId?: string
  createdAt: number
  read: boolean
}

type NotifPayload = {
  title: string
  body: string
  type: NotificationType
  link?: string
  requestId?: string
}

function parseNotification(
  id: string,
  raw: Record<string, unknown>,
  read: boolean,
): AppNotification {
  return {
    id,
    title: String(raw.title ?? 'Notification'),
    body: String(raw.body ?? ''),
    type: (raw.type as NotificationType) ?? 'general',
    link: raw.link ? String(raw.link) : undefined,
    requestId: raw.requestId ? String(raw.requestId) : undefined,
    createdAt: Number(raw.createdAt ?? 0),
    read,
  }
}

function notificationAllowed(type: NotificationType, permissions?: UserPermissions): boolean {
  if (!permissions) return true
  if (type.startsWith('cash_')) return permissions.cash === true
  if (type === 'salary_shared') return permissions.salary === true
  return true
}

function buildData(payload: NotifPayload, now: number): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: payload.title,
    body: payload.body,
    type: payload.type,
    createdAt: now,
  }
  if (payload.link) data.link = payload.link
  if (payload.requestId) data.requestId = payload.requestId
  return data
}

/** Role inbox — any authenticated actor can write; recipients subscribe by their role. */
async function writeRoleNotifications(roles: UserRole[], payload: NotifPayload): Promise<void> {
  const uniqueRoles = [...new Set(roles)]
  if (!uniqueRoles.length) return
  const now = Date.now()
  const data = buildData(payload, now)
  await Promise.all(
    uniqueRoles.map(async (role) => {
      const notifRef = push(ref(db, `inbox/roles/${role}`))
      await set(notifRef, data)
    }),
  )
}

/** Direct user inbox (assignees). */
async function writeUserNotifications(uids: string[], payload: NotifPayload): Promise<void> {
  const unique = [...new Set(uids.filter(Boolean))]
  if (!unique.length) return
  const now = Date.now()
  const data = buildData(payload, now)
  await Promise.all(
    unique.map(async (uid) => {
      const notifRef = push(ref(db, `inbox/users/${uid}`))
      await set(notifRef, data)
    }),
  )
}

export async function createNotificationForUsers(
  uids: string[],
  payload: NotifPayload,
): Promise<void> {
  await writeUserNotifications(uids, payload)
}

export async function notifyRoles(
  roles: UserRole[],
  payload: NotifPayload,
  extraUids: string[] = [],
): Promise<void> {
  await Promise.all([
    writeRoleNotifications(roles, payload),
    writeUserNotifications(extraUids, payload),
  ])
}

function mergeInbox(
  roleRaw: Record<string, Record<string, unknown>> | null,
  userRaw: Record<string, Record<string, unknown>> | null,
  legacyRaw: Record<string, Record<string, unknown>> | null,
  reads: Record<string, boolean>,
): AppNotification[] {
  const list: AppNotification[] = []

  if (roleRaw) {
    for (const [id, raw] of Object.entries(roleRaw)) {
      const key = `role_${id}`
      list.push(parseNotification(key, raw, Boolean(reads[key])))
    }
  }
  if (userRaw) {
    for (const [id, raw] of Object.entries(userRaw)) {
      const key = `user_${id}`
      list.push(parseNotification(key, raw, Boolean(reads[key])))
    }
  }
  // Legacy path from earlier implementation
  if (legacyRaw) {
    for (const [id, raw] of Object.entries(legacyRaw)) {
      const key = `legacy_${id}`
      const alreadyRead = Boolean(raw.read) || Boolean(reads[key])
      list.push(parseNotification(key, raw, alreadyRead))
    }
  }

  return list.sort((a, b) => b.createdAt - a.createdAt)
}

export function subscribeUserNotifications(
  uid: string,
  role: UserRole | null | undefined,
  callback: (items: AppNotification[]) => void,
  permissions?: UserPermissions,
): () => void {
  let roleRaw: Record<string, Record<string, unknown>> | null = null
  let userRaw: Record<string, Record<string, unknown>> | null = null
  let legacyRaw: Record<string, Record<string, unknown>> | null = null
  let reads: Record<string, boolean> = {}

  const emit = () =>
    callback(
      mergeInbox(roleRaw, userRaw, legacyRaw, reads).filter((n) =>
        notificationAllowed(n.type, permissions),
      ),
    )

  const unsubs: Array<() => void> = []

  if (role) {
    unsubs.push(
      onValue(
        ref(db, `inbox/roles/${role}`),
        (snap) => {
          roleRaw = snap.exists()
            ? (snap.val() as Record<string, Record<string, unknown>>)
            : null
          emit()
        },
        () => {
          roleRaw = null
          emit()
        },
      ),
    )
  } else {
    roleRaw = null
  }

  unsubs.push(
    onValue(
      ref(db, `inbox/users/${uid}`),
      (snap) => {
        userRaw = snap.exists()
          ? (snap.val() as Record<string, Record<string, unknown>>)
          : null
        emit()
      },
      () => {
        userRaw = null
        emit()
      },
    ),
  )

  unsubs.push(
    onValue(
      ref(db, `notifications/${uid}`),
      (snap) => {
        legacyRaw = snap.exists()
          ? (snap.val() as Record<string, Record<string, unknown>>)
          : null
        emit()
      },
      () => {
        legacyRaw = null
        emit()
      },
    ),
  )

  unsubs.push(
    onValue(
      ref(db, `inboxReads/${uid}`),
      (snap) => {
        reads = snap.exists() ? (snap.val() as Record<string, boolean>) : {}
        emit()
      },
      () => {
        reads = {}
        emit()
      },
    ),
  )

  // Initial empty emit so UI leaves loading state if listeners are slow
  emit()

  return () => {
    unsubs.forEach((u) => u())
  }
}

export async function markNotificationRead(uid: string, notificationId: string): Promise<void> {
  if (notificationId.startsWith('legacy_')) {
    const legacyId = notificationId.slice('legacy_'.length)
    await update(ref(db, `notifications/${uid}/${legacyId}`), { read: true })
    return
  }
  await set(ref(db, `inboxReads/${uid}/${notificationId}`), true)
}

export async function markAllNotificationsRead(
  uid: string,
  items: AppNotification[],
): Promise<void> {
  const updates: Record<string, boolean | true> = {}
  const legacyUpdates: Record<string, boolean> = {}

  for (const item of items) {
    if (item.read) continue
    if (item.id.startsWith('legacy_')) {
      legacyUpdates[`${item.id.slice('legacy_'.length)}/read`] = true
    } else {
      updates[item.id] = true
    }
  }

  const tasks: Promise<unknown>[] = []
  if (Object.keys(updates).length) {
    tasks.push(update(ref(db, `inboxReads/${uid}`), updates))
  }
  if (Object.keys(legacyUpdates).length) {
    tasks.push(update(ref(db, `notifications/${uid}`), legacyUpdates))
  }
  if (tasks.length) await Promise.all(tasks)
}
