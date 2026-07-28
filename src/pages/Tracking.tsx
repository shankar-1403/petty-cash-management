import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { subscribeCashRequests, waitingOnLabel } from '@/lib/cash'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { CASH_STATUS_LABELS, type CashRequest, type CashStatus } from '@/types'

const PENDING: CashStatus[] = [
  'pending_hr',
  'pending_management',
  'pending_finance',
  'partially_paid',
]

export default function TrackingPage() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<CashRequest[] | null>(null)
  const [filter, setFilter] = useState<
    'all' | 'pending_hr' | 'pending_management' | 'pending_finance'
  >('all')

  useEffect(() => subscribeCashRequests(setRequests), [])

  const filtered = useMemo(() => {
    if (!requests) return []
    const pending = requests.filter((r) => PENDING.includes(r.status))
    if (filter === 'all') return pending
    if (filter === 'pending_finance') {
      return pending.filter((r) => r.status === 'pending_finance' || r.status === 'partially_paid')
    }
    return pending.filter((r) => r.status === filter)
  }, [requests, filter])

  const columns = useMemo<ColumnDef<CashRequest>[]>(
    () => [
      {
        accessorKey: 'subject',
        header: 'Subject',
        cell: ({ row }) => <span className="font-medium">{row.original.subject}</span>,
      },
      {
        id: 'waiting',
        header: 'Waiting on',
        cell: ({ row }) => {
          const req = row.original
          let detail = waitingOnLabel(req)
          if (!req.approvals?.hr && req.status === 'pending_hr') detail += ' · HR has not approved'
          if (req.status === 'pending_management' && !req.approvals?.management) {
            detail += ' · Management has not approved'
          }
          return <span className="text-[var(--color-muted-foreground)]">{detail}</span>
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-semibold">{formatCurrency(row.original.amount)}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline">{CASH_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          See which requests are waiting on HR, Management, or Finance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All pending'],
            ['pending_hr', 'Waiting on HR'],
            ['pending_management', 'Waiting on Management'],
            ['pending_finance', 'Waiting on Finance'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-xl px-3 py-1.5 text-sm transition ${
              filter === value
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'bg-[var(--color-muted)] text-[var(--color-foreground)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>{filtered.length} request(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            loading={requests === null}
            emptyMessage="Nothing pending in this view."
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/cash/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
