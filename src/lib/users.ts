import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { get, onValue, ref, set } from 'firebase/database'
import { auth, db } from '@/lib/firebase'
import type { UserRole } from '@/lib/role'
import { normalizeRole } from '@/lib/role'
import type { AppUserProfile, UserPermissions } from '@/types'

function parseUser(uid: string, raw: Record<string, unknown>): AppUserProfile | null {
  const role = normalizeRole(raw.role)
  if (!role) return null
  return {
    uid,
    email: String(raw.email ?? ''),
    displayName: String(raw.displayName ?? raw.email ?? 'User'),
    role,
    permissions: (raw.permissions as UserPermissions | undefined) ?? undefined,
    createdAt: Number(raw.createdAt ?? 0),
  }
}

export function subscribeUsers(callback: (users: AppUserProfile[]) => void): () => void {
  return onValue(ref(db, 'users'), (snap) => {
    if (!snap.exists()) {
      callback([])
      return
    }
    const val = snap.val() as Record<string, Record<string, unknown>>
    const list = Object.entries(val)
      .map(([uid, raw]) => parseUser(uid, raw))
      .filter((u): u is AppUserProfile => Boolean(u))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    callback(list)
  })
}

function sanitizePermissions(perms?: UserPermissions | null): UserPermissions | null {
  if (!perms) return null
  const next: UserPermissions = {}
  if (perms.cash === true) next.cash = true
  if (perms.salary === true) next.salary = true
  if (perms.tracking === true) next.tracking = true
  if (perms.users === true) next.users = true
  return Object.keys(next).length ? next : null
}

export async function updateUserProfile(
  uid: string,
  input: {
    displayName: string
    role: UserRole
    permissions?: UserPermissions
  },
): Promise<void> {
  const name = input.displayName.trim()
  if (!name) throw new Error('Display name is required')

  const snap = await get(ref(db, `users/${uid}`))
  if (!snap.exists()) throw new Error('User profile not found')

  const current = snap.val() as Record<string, unknown>
  const permissions = sanitizePermissions(input.permissions)

  // Full set so Firebase `.validate` rules (email/displayName/role/createdAt) always pass
  const payload: Record<string, unknown> = {
    email: String(current.email ?? ''),
    displayName: name,
    role: input.role,
    createdAt: Number(current.createdAt ?? Date.now()),
  }
  if (permissions) payload.permissions = permissions

  await set(ref(db, `users/${uid}`), payload)
}

/** @deprecated Use updateUserProfile */
export async function updateUserRoleAndPermissions(
  uid: string,
  role: UserRole,
  permissions?: UserPermissions,
  displayName?: string,
): Promise<void> {
  await updateUserProfile(uid, {
    role,
    permissions,
    displayName: displayName?.trim() || 'User',
  })
}


/** Creates Auth user + RTDB profile. Temporarily signs in as new user, then restores IT session. */
export async function createDepartmentUser(input: {
  email: string
  password: string
  displayName: string
  role: UserRole
  permissions?: UserPermissions
  itEmail: string
  itPassword: string
}): Promise<string> {
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password)
  const uid = cred.user.uid

  const permissions = sanitizePermissions(input.permissions)
  await set(ref(db, `users/${uid}`), {
    email: input.email.trim(),
    displayName: input.displayName.trim() || input.email.split('@')[0],
    role: input.role,
    createdAt: Date.now(),
    ...(permissions ? { permissions } : {}),
  })

  await signOut(auth)
  await signInWithEmailAndPassword(auth, input.itEmail, input.itPassword)
  return uid
}

export async function getUserProfile(uid: string): Promise<AppUserProfile | null> {
  const snap = await get(ref(db, `users/${uid}`))
  if (!snap.exists()) return null
  return parseUser(uid, snap.val() as Record<string, unknown>)
}
