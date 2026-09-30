import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Download, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { canApproveHr, canSettleFinance } from '@/lib/role'
import {
  approveSalaryAtLevel,
  canActOnSalaryStage,
  financeApproveSalary,
  getSalarySheet,
  rejectSalaryAtLevel,
  salaryRejectedLevel,
  salaryStageLevel,
  shareSalaryWithManagement,
} from '@/lib/salary'
import {
  decryptBlobWithPassword,
  downloadBlob,
  openDownloadUrl,
  verifySheetPassword,
} from '@/lib/crypto-file'
import { downloadStorageBlob, getSalaryDownloadUrl } from '@/lib/storage'
import { formatDateTime } from '@/lib/utils'
import {
  MANAGEMENT_LEVEL_LABELS,
  MANAGEMENT_LEVELS,
  SALARY_STATUS_LABELS,
  type SalarySheet,
} from '@/types'

export default function SalaryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, role } = useAuth()
  const [sheet, setSheet] = useState<SalarySheet | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [downloadPassword, setDownloadPassword] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState('')

  async function reload() {
    if (!id) return
    setSheet(await getSalarySheet(id))
  }

  useEffect(() => {
    void reload()
  }, [id])

  const actor = useMemo(() => {
    if (!user || !profile) return null
    return { uid: user.uid, name: profile.displayName || profile.email }
  }, [user, profile])

  if (sheet === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="space-y-4">
        <p>Sheet not found.</p>
        <Button asChild variant="outline">
          <Link to="/salary">Back</Link>
        </Button>
      </div>
    )
  }

  const stageLevel = salaryStageLevel(sheet.status)
  const stageLabel = stageLevel ? MANAGEMENT_LEVEL_LABELS[stageLevel] : ''
  const rejectedLevel = salaryRejectedLevel(sheet)
  const showHrSend = canApproveHr(role) && sheet.status === 'draft'
  const showMgmt = canActOnSalaryStage(profile, sheet.status)
  const showFinance = canSettleFinance(role) && sheet.status === 'pending_finance'
  const showActions = showHrSend || showMgmt || showFinance

  async function onSendToManagement() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await shareSalaryWithManagement(id, actor)
      toast.success(`Sent to ${MANAGEMENT_LEVEL_LABELS.lower}`)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  async function onMgmtApprove() {
    if (!actor || !id || !profile) return
    setBusy(true)
    try {
      await approveSalaryAtLevel(id, actor, profile)
      toast.success(
        stageLevel === 'head' ? 'Approved — sent to Finance' : 'Approved — sent to the next level',
      )
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  async function onReject() {
    if (!actor || !id || !profile || !reason.trim()) {
      toast.error('Enter a reason')
      return
    }
    setBusy(true)
    try {
      await rejectSalaryAtLevel(id, actor, profile, reason.trim())
      toast.success('Rejected — sent back to HR')
      setRejectOpen(false)
      setReason('')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setBusy(false)
    }
  }

  async function onFinance() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await financeApproveSalary(id, actor)
      toast.success('Finance approved salary sheet')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDownloadProtected() {
    const current = sheet
    if (!current) return
    if (!downloadPassword) {
      toast.error('Enter the sheet password')
      return
    }
    if (!current.filePath && !current.fileUrl) {
      toast.error('File not found in storage')
      return
    }

    setDownloading(true)
    setDownloadStatus('Checking password…')
    try {
      if (current.filePasswordSaltB64 && current.filePasswordHashB64) {
        const ok = await verifySheetPassword(
          downloadPassword,
          current.filePasswordSaltB64,
          current.filePasswordHashB64,
        )
        if (!ok) throw new Error('Incorrect password')

        setDownloadStatus('Opening download…')
        const url = await getSalaryDownloadUrl(current.filePath || current.fileUrl!)
        openDownloadUrl(url, current.fileName || 'salary-sheet')
        toast.success('Download started')
        return
      }

      if (current.fileSaltB64 && current.fileIvB64) {
        setDownloadStatus('Downloading encrypted file…')
        const encrypted = await downloadStorageBlob(current.filePath || current.fileUrl!)
        setDownloadStatus('Decrypting…')
        const plain = await decryptBlobWithPassword(
          encrypted,
          downloadPassword,
          current.fileSaltB64,
          current.fileIvB64,
        )
        downloadBlob(plain, current.fileName || 'salary-sheet')
        toast.success('Sheet decrypted and downloaded')
        return
      }

      throw new Error('This sheet has no password metadata. Re-upload it from HR.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      toast.error(message)
    } finally {
      setDownloading(false)
      setDownloadStatus('')
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/salary"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to salary
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{sheet.title}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {sheet.period} · {sheet.createdByName}
          </p>
        </div>
        <Badge variant="outline">{SALARY_STATUS_LABELS[sheet.status]}</Badge>
      </div>

      {sheet.fileUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Password-protected sheet
            </CardTitle>
            <CardDescription>
              {sheet.fileName || 'Uploaded file'} — enter the password set by HR to decrypt and
              download.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="downloadPassword">Sheet password</Label>
              <Input
                id="downloadPassword"
                type="password"
                autoComplete="off"
                value={downloadPassword}
                onChange={(e) => setDownloadPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
            <Button
              type="button"
              disabled={downloading}
              onClick={() => void onDownloadProtected()}
            >
              <Download className="h-4 w-4" />
              {downloading ? downloadStatus || 'Working…' : 'Download'}
            </Button>
          </CardContent>
        </Card>
      )}

      {sheet.status === 'rejected' && sheet.rejection && (
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle>Rejected</CardTitle>
            <CardDescription>
              By {sheet.rejection.byName}
              {rejectedLevel ? ` (${MANAGEMENT_LEVEL_LABELS[rejectedLevel]})` : ''} ·{' '}
              {formatDateTime(sheet.rejection.at)}. This sheet cannot
              be re-sent — upload a new sheet instead.
            </CardDescription>
          </CardHeader>
          {sheet.rejection.reason && (
            <CardContent>
              <p className="text-sm">{sheet.rejection.reason}</p>
            </CardContent>
          )}
        </Card>
      )}

      {showActions && (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>
              Flow: HR → Lower Management → Higher Management → Head Management → Finance
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {showHrSend && (
              <Button disabled={busy} onClick={() => void onSendToManagement()}>
                Send to {MANAGEMENT_LEVEL_LABELS.lower}
              </Button>
            )}
            {showMgmt && (
              <>
                <Button disabled={busy} onClick={() => void onMgmtApprove()}>
                  Approve ({stageLabel})
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => setRejectOpen(true)}>
                  Reject ({stageLabel})
                </Button>
              </>
            )}
            {showFinance && (
              <Button disabled={busy} onClick={() => void onFinance()}>
                Mark approved (Finance)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Management approvals</CardTitle>
          <CardDescription>
            {stageLevel
              ? `Waiting on ${stageLabel}`
              : sheet.status === 'rejected'
                ? rejectedLevel
                  ? `Rejected by ${MANAGEMENT_LEVEL_LABELS[rejectedLevel]} (${sheet.rejection?.byName ?? '—'})`
                  : `Rejected${sheet.rejection?.byName ? ` by ${sheet.rejection.byName}` : ''}`
                : sheet.status === 'pending_finance' || sheet.status === 'approved'
                  ? 'All management levels approved'
                  : 'Not yet sent to Management'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {MANAGEMENT_LEVELS.map((level) => {
            const approval = sheet.approvals?.[level]
            const rejected = rejectedLevel === level ? sheet.rejection : undefined
            const current = stageLevel === level
            return (
              <div
                key={level}
                className={`rounded-xl border px-3 py-2.5 ${
                  rejected
                    ? 'border-red-500/50 bg-red-500/10'
                    : current
                      ? 'border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_8%,transparent)]'
                      : 'border-[var(--color-border)]'
                }`}
              >
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {MANAGEMENT_LEVEL_LABELS[level]}
                </p>
                <p className={`text-sm font-medium ${rejected ? 'text-red-500' : ''}`}>
                  {rejected
                    ? `Rejected by ${rejected.byName}`
                    : approval
                      ? `Approved by ${approval.byName}`
                      : current
                        ? 'Pending'
                        : '—'}
                </p>
                {(rejected || approval) && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {formatDateTime((rejected ?? approval)!.at)}
                  </p>
                )}
                {rejected?.reason && (
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    Reason: {rejected.reason}
                  </p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...sheet.timeline].reverse().map((event, i) => (
            <div key={`${event.at}-${i}`} className="border-l-2 border-[var(--color-border)] pl-3">
              <p className="text-sm font-medium">{event.message}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {event.byName} · {formatDateTime(event.at)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject salary sheet</DialogTitle>
            <DialogDescription>The sheet goes back to HR and cannot be re-sent; HR will need to upload a new sheet.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void onReject()}>
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
