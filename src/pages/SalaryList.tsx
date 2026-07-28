import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { useAuth } from '@/context/AuthContext'
import { canApproveHr, canApproveManagement } from '@/lib/role'
import { subscribeSalarySheets } from '@/lib/salary'
import { formatDateTime } from '@/lib/utils'
import { SALARY_STATUS_LABELS, type SalarySheet } from '@/types'

export default function SalaryListPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [sheets, setSheets] = useState<SalarySheet[] | null>(null)
  const canCreate = canApproveHr(role)

  useEffect(() => subscribeSalarySheets(setSheets), [])

  const visible = useMemo(() => {
    return (sheets ?? []).filter((sheet) => {
      if (canApproveHr(role) || role === 'it') return true
      if (canApproveManagement(role)) return sheet.status !== 'draft'
      return sheet.status === 'pending_finance' || sheet.status === 'approved'
    })
  }, [sheets, role])

  const columns = useMemo<ColumnDef<SalarySheet>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'period',
        header: 'Period',
      },
      {
        accessorKey: 'createdByName',
        header: 'Created by',
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: 'file',
        header: 'Sheet file',
        cell: ({ row }) =>
          row.original.fileName ? (
            <span className="text-sm">{row.original.fileName}</span>
          ) : (
            '—'
          ),
      },
      {
        id: 'protected',
        header: 'Protected',
        cell: ({ row }) => (row.original.fileProtected ? 'Yes' : 'No'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline">{SALARY_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Salary</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            HR uploads a password-protected sheet, then shares it with Management and Finance.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/salary/new">
              <Plus className="h-4 w-4" />
              Upload sheet
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary sheets</CardTitle>
          <CardDescription>Visible according to your role</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={visible}
            loading={sheets === null}
            emptyMessage="No salary sheets yet."
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/salary/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
