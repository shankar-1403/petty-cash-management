import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable, TableActions } from '@/components/ui/data-table'
import { useAuth } from '@/context/AuthContext'
import { ALL_ROLES, ROLE_LABELS, type UserRole } from '@/lib/role'
import { createDepartmentUser, subscribeUsers, updateUserProfile } from '@/lib/users'
import type { AppUserProfile, UserPermissions } from '@/types'

export default function UsersRolesPage() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<AppUserProfile[] | null>(null)
  const [editUser, setEditUser] = useState<AppUserProfile | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('hr')
  const [perms, setPerms] = useState<UserPermissions>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('hr')
  const [itPassword, setItPassword] = useState('')

  useEffect(() => subscribeUsers(setUsers), [])

  function openEdit(user: AppUserProfile) {
    setEditUser(user)
    setEditDisplayName(user.displayName || '')
    setEditRole(user.role)
    setPerms(user.permissions ?? {})
  }

  async function saveEdit() {
    if (!editUser) return
    if (!editDisplayName.trim()) {
      toast.error('Display name is required')
      return
    }
    setBusy(true)
    try {
      await updateUserProfile(editUser.uid, {
        displayName: editDisplayName,
        role: editRole,
        permissions: perms,
      })
      toast.success('User updated')
      setEditUser(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.email) return
    if (!itPassword) {
      toast.error('Enter your IT password to restore session after creating the user')
      return
    }
    setBusy(true)
    try {
      await createDepartmentUser({
        email,
        password,
        displayName,
        role: newRole,
        permissions: {
          cash: true,
          salary: newRole !== 'admin',
          tracking:
            newRole === 'admin' ||
            newRole === 'hr' ||
            newRole === 'management' ||
            newRole === 'it',
          users: newRole === 'it',
        },
        itEmail: profile.email,
        itPassword,
      })
      toast.success('User created')
      setCreateOpen(false)
      setEmail('')
      setPassword('')
      setDisplayName('')
      setItPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo<ColumnDef<AppUserProfile>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium">{row.original.displayName}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="text-[var(--color-muted-foreground)]">{row.original.email}</span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Badge variant="outline">{ROLE_LABELS[row.original.role]}</Badge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <TableActions>
            <Button size="sm" variant="outline" onClick={() => openEdit(row.original)}>
              Edit
            </Button>
          </TableActions>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & Roles</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            IT can edit display names, roles, and module permissions for every department.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create user</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>Firebase Auth users with RTDB profiles</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={users ?? []}
            loading={users === null}
            emptyMessage="No users yet."
            getRowId={(row) => row.uid}
          />
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editUser)}
        onOpenChange={(open) => !open && setEditUser(null)}
      >
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const el = document.getElementById('edit-display-name') as HTMLInputElement | null
            if (!el) return
            el.focus()
            const len = el.value.length
            el.setSelectionRange(len, len)
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Display name</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Full name"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(
              [
                ['cash', 'Cash module'],
                ['salary', 'Salary module'],
                ['tracking', 'Tracking'],
                ['users', 'Users & roles'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(perms[key])}
                  onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                {label}
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void saveEdit()}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create department user</DialogTitle>
            <DialogDescription>
              Creates Firebase Auth credentials and a users/&#123;uid&#125; profile. You will be signed
              back in as IT.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Your IT password (to restore session)</Label>
              <Input
                type="password"
                value={itPassword}
                onChange={(e) => setItPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
