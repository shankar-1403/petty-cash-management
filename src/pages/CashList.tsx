import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, TableActions } from '@/components/ui/data-table'
import { useAuth } from '@/context/AuthContext'
import { canCreateCash, canEditCash } from '@/lib/role'
import { subscribeCashRequests } from '@/lib/cash'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { CASH_STATUS_LABELS, type CashRequest } from '@/types'

export default function CashListPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState<CashRequest[] | null>(null)
  const allowEdit = canEditCash(role)

  useEffect(() => subscribeCashRequests(setRequests), [])

  const columns = useMemo<ColumnDef<CashRequest>[]>(
    () => [
      {
        accessorKey: 'requestDate',
        header: 'Date',
        cell: ({ row }) => formatDateTime(row.original.requestDate || row.original.createdAt),
      },
      {
        accessorKey: 'subject',
        header: 'Subject',
        cell: ({ row }) => <span className="font-medium">{row.original.subject}</span>,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => row.original.category || '—',
      },
      {
        id: 'invoice',
        header: 'Invoice',
        cell: ({ row }) => (row.original.hasInvoice ? 'Yes' : 'No'),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-semibold">{formatCurrency(row.original.amount)}</span>
        ),
      },
      {
        accessorKey: 'expectedPaymentDate',
        header: 'Expected payment',
        cell: ({ row }) => formatDate(row.original.expectedPaymentDate),
      },
      {
        accessorKey: 'assignedToName',
        header: 'Assigned to',
        cell: ({ row }) => row.original.assignedToName || '—',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline">{CASH_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      ...(allowEdit
        ? [
            {
              id: 'actions',
              header: 'Actions',
              cell: ({ row }: { row: { original: CashRequest } }) => {
                const editable =
                  row.original.status === 'pending_hr' || row.original.status === 'rejected'
                if (!editable) return null
                return (
                  <TableActions>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/cash/${row.original.id}/edit`)}
                    >
                      Edit
                    </Button>
                  </TableActions>
                )
              },
            } as ColumnDef<CashRequest>,
          ]
        : []),
    ],
    [allowEdit, navigate],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash Management</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Payment requests, approvals, and settlements.
          </p>
        </div>
        {canCreateCash(role) && (
          <Button asChild>
            <Link to="/cash/new">
              <Plus className="h-4 w-4" />
              Raise payment
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>All cash payment requests in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={requests ?? []}
            loading={requests === null}
            emptyMessage="No requests yet."
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/cash/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
