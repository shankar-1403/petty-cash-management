import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth'
import { get, onValue, ref, set } from 'firebase/database'
import { auth, db } from '@/lib/firebase'
import { normalizeRole, type UserRole } from '@/lib/role'
import type { AppUserProfile, UserPermissions } from '@/types'

type ProfileIssue =
  | 'missing_profile'
  | 'missing_role'
  | 'permission_denied'
  | 'read_error'
  | null

interface SessionRecord {
  uid: string
  startMs: number
}

interface AuthContextType {
  user: User | null
  profile: AppUserProfile | null
  role: UserRole | null
  profileIssue: ProfileIssue
  loading: boolean
  login: (email: string, password: string) => Promise<AppUserProfile>
  logout: () => Promise<void>
  register: (
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
    permissions?: UserPermissions,
  ) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  refreshProfile: () => Promise<AppUserProfile | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000
const SESSION_STORAGE_KEY = 'petty_management'

function readSessionRecord(): SessionRecord | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw) as SessionRecord
    if (obj && typeof obj.uid === 'string' && typeof obj.startMs === 'number') {
      return obj
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeSessionRecord(uid: string, startMs: number): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ uid, startMs }))
}

function clearSessionRecord(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

function mapAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.'
    default:
      return error instanceof Error ? error.message : 'Sign in failed'
  }
}

function profileIssueMessage(issue: ProfileIssue): string {
  switch (issue) {
    case 'missing_profile':
      return 'User profile not found in database. Contact IT/Admin.'
    case 'missing_role':
      return 'Your account has no role assigned. Contact IT.'
    case 'permission_denied':
      return 'Permission denied while reading user profile.'
    case 'read_error':
      return 'Could not load user profile. Try again.'
    default:
      return 'Unable to load user profile or role.'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppUserProfile | null>(null)
  const [profileIssue, setProfileIssue] = useState<ProfileIssue>(null)
  const [loading, setLoading] = useState(true)
  const profileIssueRef = useRef<ProfileIssue>(null)

  const setIssue = useCallback((issue: ProfileIssue) => {
    profileIssueRef.current = issue
    setProfileIssue(issue)
  }, [])

  const loadProfile = useCallback(
    async (uid: string): Promise<AppUserProfile | null> => {
      setIssue(null)
      try {
        const snap = await get(ref(db, `users/${uid}`))
        if (!snap.exists()) {
          setProfile(null)
          setIssue('missing_profile')
          return null
        }

        const data = snap.val() as Record<string, unknown>
        const role = normalizeRole(data.role)
        if (!role) {
          setProfile(null)
          setIssue('missing_role')
          return null
        }

        const merged: AppUserProfile = {
          ...data,
          uid,
          email: String(data.email ?? ''),
          displayName: String(data.displayName ?? data.email ?? 'User'),
          role,
          createdAt: Number(data.createdAt ?? Date.now()),
          permissions: (data.permissions as UserPermissions | undefined) ?? undefined,
        }

        setProfile(merged)
        setIssue(null)
        return merged
      } catch (e: unknown) {
        console.error(e)
        setProfile(null)
        const message = e instanceof Error ? e.message : String(e)
        const denied =
          (e as { code?: string })?.code === 'PERMISSION_DENIED' ||
          message.includes('Permission denied')
        setIssue(denied ? 'permission_denied' : 'read_error')
        return null
      }
    },
    [setIssue],
  )

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null)
          setProfile(null)
          setIssue(null)
          return
        }

        setUser(firebaseUser)
        const loaded = await loadProfile(firebaseUser.uid)
        if (!loaded) {
          clearSessionRecord()
          await signOut(auth)
          setUser(null)
          setProfile(null)
        }
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [loadProfile, setIssue])

  // Keep profile (role/permissions) in sync so sidebar updates without re-login
  useEffect(() => {
    if (!user) return
    const uid = user.uid
    return onValue(
      ref(db, `users/${uid}`),
      (snap) => {
        if (!snap.exists()) {
          setProfile(null)
          setIssue('missing_profile')
          return
        }
        const data = snap.val() as Record<string, unknown>
        const nextRole = normalizeRole(data.role)
        if (!nextRole) {
          setProfile(null)
          setIssue('missing_role')
          return
        }
        setProfile({
          ...data,
          uid,
          email: String(data.email ?? ''),
          displayName: String(data.displayName ?? data.email ?? 'User'),
          role: nextRole,
          createdAt: Number(data.createdAt ?? Date.now()),
          permissions: (data.permissions as UserPermissions | undefined) ?? undefined,
        })
        setIssue(null)
      },
      () => {
        setIssue('read_error')
      },
    )
  }, [user, setIssue])

  useEffect(() => {
    if (!user) return
    const uid = user.uid
    let record = readSessionRecord()
    if (!record || record.uid !== uid) {
      record = { uid, startMs: Date.now() }
      writeSessionRecord(uid, record.startMs)
    }

    const signOutIfExpired = () => {
      const current = readSessionRecord()
      if (!current || current.uid !== uid) return
      if (Date.now() - current.startMs >= SESSION_DURATION_MS) {
        clearSessionRecord()
        void signOut(auth)
      }
    }

    const elapsed = Date.now() - record.startMs
    if (elapsed >= SESSION_DURATION_MS) {
      clearSessionRecord()
      void signOut(auth)
      return
    }

    const timeout = setTimeout(signOutIfExpired, SESSION_DURATION_MS - elapsed)
    const interval = setInterval(signOutIfExpired, 60_000)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [user])

  const login = useCallback(
    async (email: string, password: string): Promise<AppUserProfile> => {
      const trimmedEmail = email.trim()
      if (!trimmedEmail.includes('@')) {
        throw new Error('Enter a valid email address.')
      }

      try {
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password)
        setUser(cred.user)
        writeSessionRecord(cred.user.uid, Date.now())
        const loaded = await loadProfile(cred.user.uid)
        setLoading(false)

        if (!loaded) {
          const issue = profileIssueRef.current
          await signOut(auth)
          setUser(null)
          setProfile(null)
          clearSessionRecord()
          throw new Error(profileIssueMessage(issue))
        }

        return loaded
      } catch (error) {
        if (
          error instanceof Error &&
          !('code' in error && typeof (error as { code?: string }).code === 'string')
        ) {
          throw error
        }
        throw new Error(mapAuthError(error))
      }
    },
    [loadProfile],
  )

  const logout = useCallback(async () => {
    clearSessionRecord()
    await signOut(auth)
    setUser(null)
    setProfile(null)
    setIssue(null)
    setLoading(false)
  }, [setIssue])

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: UserRole,
      permissions?: UserPermissions,
    ) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await set(ref(db, `users/${cred.user.uid}`), {
        email: email.trim(),
        displayName: displayName || email.split('@')[0],
        role,
        permissions: permissions ?? null,
        createdAt: Date.now(),
      })
      setUser(cred.user)
      writeSessionRecord(cred.user.uid, Date.now())
      await loadProfile(cred.user.uid)
      setLoading(false)
    },
    [loadProfile],
  )

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser?.email) {
      throw new Error('You must be signed in to change your password.')
    }
    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters.')
    }
    if (currentPassword === newPassword) {
      throw new Error('New password must be different from the current password.')
    }

    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword)
      await reauthenticateWithCredential(firebaseUser, credential)
      await updatePassword(firebaseUser, newPassword)
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        throw new Error('Current password is incorrect.')
      }
      if (code === 'auth/weak-password') {
        throw new Error('New password is too weak. Use at least 6 characters.')
      }
      if (code === 'auth/requires-recent-login') {
        throw new Error('Please sign out and sign in again, then change your password.')
      }
      throw new Error(error instanceof Error ? error.message : 'Failed to update password')
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return null
    return loadProfile(user.uid)
  }, [user, loadProfile])

  const role = profile?.role ?? null

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      role,
      profileIssue,
      loading,
      login,
      logout,
      register,
      changePassword,
      refreshProfile,
    }),
    [user, profile, role, profileIssue, loading, login, logout, register, changePassword, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
