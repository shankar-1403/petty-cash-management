import type { UserRole } from '@/lib/role'

export type AppModule = 'cash' | 'salary'

export type CashStatus =
  | 'pending_hr'
  | 'pending_management'
  | 'pending_finance'
  | 'rejected'
  | 'partially_paid'
  | 'paid'

export type PaymentPlanType = 'full' | 'split_equal' | 'manual'

export type InstallmentStatus = 'pending' | 'paid'

export interface TimelineEvent {
  at: number
  by: string
  byName: string
  action: string
  message: string
}

export interface ApprovalRecord {
  by: string
  byName: string
  at: number
  note?: string
}

export interface PaymentInstallment {
  id: string
  amount: number
  dueDate: string
  status: InstallmentStatus
  paidAt?: number
  paidBy?: string
  paidByName?: string
}

export interface PaymentPlan {
  type: PaymentPlanType
  installments: PaymentInstallment[]
}

export interface CashRequest {
  id: string
  subject: string
  amount: number
  hasInvoice: boolean
  invoiceUrl?: string
  category: string
  notes?: string
  /** Request date/time chosen by Admin (ms) */
  requestDate: number
  /** Expected payment date YYYY-MM-DD */
  expectedPaymentDate: string
  /** Auto-assigned when amount < threshold (e.g. Puja Sharma) */
  assignedTo?: string
  assignedToName?: string
  status: CashStatus
  createdBy: string
  createdByName: string
  createdAt: number
  updatedAt: number
  approvals?: {
    hr?: ApprovalRecord
    management?: ApprovalRecord
  }
  rejection?: ApprovalRecord & { reason?: string }
  paymentPlan?: PaymentPlan
  timeline: TimelineEvent[]
}


export type SalaryStatus =
  | 'draft'
  | 'shared_management'
  | 'pending_finance'
  | 'approved'
  | 'rejected'

export interface SalaryRow {
  id: string
  employeeName: string
  department?: string
  amount: number
  notes?: string
}

export interface SalarySheet {
  id: string
  title: string
  period: string
  rows: SalaryRow[]
  /** Uploaded spreadsheet file (password-encrypted in Storage) */
  fileUrl?: string
  /** Storage object path — preferred for SDK download */
  filePath?: string
  fileName?: string
  fileProtected?: boolean
  /** Password gate (preferred) — hash verified before download link opens */
  filePasswordSaltB64?: string
  filePasswordHashB64?: string
  /** Legacy encrypted uploads */
  fileSaltB64?: string
  fileIvB64?: string
  status: SalaryStatus
  createdBy: string
  createdByName: string
  createdAt: number
  updatedAt: number
  sharedAt?: number
  approvals?: {
    management?: ApprovalRecord
  }
  rejection?: ApprovalRecord & { reason?: string }
  timeline: TimelineEvent[]
}


export interface UserPermissions {
  cash?: boolean
  salary?: boolean
  tracking?: boolean
  users?: boolean
}

export interface AppUserProfile {
  uid: string
  email: string
  displayName: string
  role: UserRole
  permissions?: UserPermissions
  createdAt: number
  [key: string]: unknown
}

export const APPROVAL_THRESHOLD = 2000

/** Amounts below this are auto-mapped to this HR assignee */
export const LOW_AMOUNT_ASSIGNEE_NAME = 'Puja Sharma'

export const CASH_CATEGORIES = [
  'Stationery',
  'Travel',
  'Food & Refreshments',
  'Utilities',
  'Maintenance',
  'Office Supplies',
  'Vendor Payment',
  'Petty Cash Reimbursement',
  'Miscellaneous',
] as const

export const CASH_STATUS_LABELS: Record<CashStatus, string> = {
  pending_hr: 'Pending HR',
  pending_management: 'Pending Management',
  pending_finance: 'Pending Finance',
  rejected: 'Rejected',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
}

export const SALARY_STATUS_LABELS: Record<SalaryStatus, string> = {
  draft: 'Draft (HR)',
  shared_management: 'Shared with Management',
  pending_finance: 'Pending Finance',
  approved: 'Approved',
  rejected: 'Rejected',
}
