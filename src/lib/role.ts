import type { UserPermissions } from '@/types'

export const ROLES = {
  ADMIN: 'admin',
  HR: 'hr',
  MANAGEMENT: 'management',
  FINANCE: 'finance',
  IT: 'it',
} as const

export type UserRole = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  management: 'Management',
  finance: 'Finance',
  it: 'IT',
}

export const ALL_ROLES: UserRole[] = [
  ROLES.ADMIN,
  ROLES.HR,
  ROLES.MANAGEMENT,
  ROLES.FINANCE,
  ROLES.IT,
]

export type AppModule = 'cash' | 'salary'
export type PermissionKey = keyof UserPermissions

export function normalizeRole(role: unknown): UserRole | null {
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

export function getHomePath(role: UserRole | null | undefined): string {
  switch (role) {
    case 'admin':
      return '/admin-dashboard'
    case 'hr':
    case 'management':
    case 'finance':
    case 'it':
      return '/dashboard'
    default:
      return '/login'
  }
}

export function canAccessModule(module: AppModule, role: UserRole | null | undefined): boolean {
  if (!role) return false
  if (module === 'cash') return true
  // Salary: HR, Management, Finance, IT only
  return role === 'hr' || role === 'management' || role === 'finance' || role === 'it'
}

export function canCreateCash(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'it'
}

export function canEditCash(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'it'
}

export function canApproveHr(role: UserRole | null | undefined): boolean {
  return role === 'hr' || role === 'it'
}

export function canApproveManagement(role: UserRole | null | undefined): boolean {
  return role === 'management' || role === 'it'
}

export function canSettleFinance(role: UserRole | null | undefined): boolean {
  return role === 'finance' || role === 'it'
}

export function canViewTracking(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'hr' || role === 'management' || role === 'it'
}

export function canManageUsers(role: UserRole | null | undefined): boolean {
  return role === 'it'
}

export function canAccessSalary(role: UserRole | null | undefined): boolean {
  return canAccessModule('salary', role)
}

/** Role-based defaults when a user has no explicit permissions object. */
export function roleDefaultPermission(role: UserRole, key: PermissionKey): boolean {
  switch (key) {
    case 'cash':
      return true
    case 'salary':
      return canAccessSalary(role)
    case 'tracking':
      return canViewTracking(role)
    case 'users':
      return canManageUsers(role)
    default:
      return false
  }
}

/**
 * Module access for nav/routes.
 * If `permissions` is set on the profile, only explicitly `true` flags are allowed.
 * Otherwise fall back to role defaults.
 */
export function hasPermission(
  profile: { role: UserRole; permissions?: UserPermissions } | null | undefined,
  key: PermissionKey,
): boolean {
  if (!profile?.role) return false
  if (profile.permissions != null) {
    return profile.permissions[key] === true
  }
  return roleDefaultPermission(profile.role, key)
}

export function roleLabel(role: string | null | undefined): string {
  const normalized = normalizeRole(role)
  return normalized ? ROLE_LABELS[normalized] : String(role ?? '—')
}
