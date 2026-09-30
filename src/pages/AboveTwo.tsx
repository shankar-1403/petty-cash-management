import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, TableActions } from '@/components/ui/data-table'
import { useAuth } from '@/context/AuthContext'
import { subscribeCashRequests } from '@/lib/cash'
import { canApproveAboveTwo } from '@/lib/role'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { APPROVAL_THRESHOLD, CASH_STATUS_LABELS, type CashRequest } from '@/types'

type Filter = 'pending' | 'approved' | 'all'

export default function AboveTwoPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState<CashRequest[] | null>(null)
  const [filter, setFilter] = useState<Filter>('pending')
  const canApprove = canApproveAboveTwo(profile)

  useEffect(() => subscribeCashRequests(setRequests), [])

  const aboveTwo = useMemo(
    () => (requests ?? []).filter((r) => r.amount > APPROVAL_THRESHOLD),
    [requests],
  )

  const counts = useMemo(
    () => ({
      pending: aboveTwo.filter((r) => r.status === 'pending_management').length,
      approved: aboveTwo.filter((r) => Boolean(r.approvals?.management)).length,
      all: aboveTwo.length,
    }),
    [aboveTwo],
  )

  const rows = useMemo(() => {
    if (filter === 'pending') return aboveTwo.filter((r) => r.status === 'pending_management')
    if (filter === 'approved') return aboveTwo.filter((r) => Boolean(r.approvals?.management))
    return aboveTwo
  }, [aboveTwo, filter])

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
        accessorKey: 'companyName',
        header: 'Company',
        cell: ({ row }) => row.original.companyName || '—',
      },
      {
        accessorKey: 'createdByName',
        header: 'Raised by',
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
        id: 'hr',
        header: 'HR approved by',
        cell: ({ row }) => row.original.approvals?.hr?.byName || '—',
      },
      {
        id: 'management',
        header: 'Approved by',
        cell: ({ row }) => row.original.approvals?.management?.byName || '—',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline">{CASH_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <TableActions>
            <Button
              size="sm"
              variant={canApprove && row.original.status === 'pending_management' ? 'default' : 'outline'}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/cash/${row.original.id}`)
              }}
            >
              {canApprove && row.original.status === 'pending_management' ? 'Review & approve' : 'View'}
            </Button>
          </TableActions>
        ),
      },
    ],
    [canApprove, navigate],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Above ₹2k approvals</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Requests above ₹{APPROVAL_THRESHOLD.toLocaleString('en-IN')} approved by HR wait here for
          Management-level approval. Approving sets the payment plan and sends the request to Finance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pending', 'Pending approval'],
            ['approved', 'Approved'],
            ['all', 'All above ₹2k'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            onClick={() => setFilter(key)}
          >
            {label} ({counts[key]})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filter === 'pending' ? 'Waiting for approval' : filter === 'approved' ? 'Approved' : 'All requests'}
          </CardTitle>
          <CardDescription>Click a row to open the request.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            loading={requests === null}
            emptyMessage={filter === 'pending' ? 'Nothing waiting for approval.' : 'No requests.'}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/cash/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
