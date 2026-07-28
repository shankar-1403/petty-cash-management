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
import {
  canApproveHr,
  canApproveManagement,
  canSettleFinance,
} from '@/lib/role'
import {
  financeApproveSalary,
  getSalarySheet,
  hrHeadApproveSalary,
  hrHeadRejectSalary,
  isHrHead,
  managementApproveSalary,
  managementRejectSalary,
  shareSalaryWithHrHead,
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
import { SALARY_STATUS_LABELS, type SalarySheet } from '@/types'

export default function SalaryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, role } = useAuth()
  const [sheet, setSheet] = useState<SalarySheet | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<'hr_head' | 'management'>('management')
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

  const itOverride = role === 'it'
  const canActAsHrHead = Boolean(user && (isHrHead(user.uid) || itOverride))

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

  const showHrSendToHead =
    canApproveHr(role) && (sheet.status === 'draft' || sheet.status === 'rejected')
  const showHrHeadApprove = canActAsHrHead && sheet.status === 'pending_hr_head'
  const showHrHeadSend = canActAsHrHead && sheet.status === 'hr_head_approved'
  const showHrHeadReject =
    canActAsHrHead && (sheet.status === 'pending_hr_head' || sheet.status === 'hr_head_approved')
  const showMgmt = canApproveManagement(role) && sheet.status === 'shared_management'
  const showFinance = canSettleFinance(role) && sheet.status === 'pending_finance'
  const showActions =
    showHrSendToHead ||
    showHrHeadApprove ||
    showHrHeadSend ||
    showHrHeadReject ||
    showMgmt ||
    showFinance

  async function onSendToHrHead() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await shareSalaryWithHrHead(id, actor)
      toast.success('Sent to HR Head')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  async function onHrHeadApprove() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await hrHeadApproveSalary(id, actor, { allowItOverride: itOverride })
      toast.success('Approved by HR Head')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSendToManagement() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await shareSalaryWithManagement(id, actor, { allowItOverride: itOverride })
      toast.success('Sent to Management')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Share failed')
    } finally {
      setBusy(false)
    }
  }

  async function onMgmtApprove() {
    if (!actor || !id) return
    setBusy(true)
    try {
      await managementApproveSalary(id, actor)
      toast.success('Approved — sent to Finance')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  async function onReject() {
    if (!actor || !id || !reason.trim()) {
      toast.error('Enter a reason')
      return
    }
    setBusy(true)
    try {
      if (rejectTarget === 'hr_head') {
        await hrHeadRejectSalary(id, actor, reason.trim(), { allowItOverride: itOverride })
      } else {
        await managementRejectSalary(id, actor, reason.trim())
      }
      toast.success('Rejected')
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

      {showActions && (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>
              Flow: HR → HR Head → Management → Finance
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {showHrSendToHead && (
              <Button disabled={busy} onClick={() => void onSendToHrHead()}>
                Send to HR Head
              </Button>
            )}
            {showHrHeadApprove && (
              <Button disabled={busy} onClick={() => void onHrHeadApprove()}>
                Approve (HR Head)
              </Button>
            )}
            {showHrHeadSend && (
              <Button disabled={busy} onClick={() => void onSendToManagement()}>
                Send to Management
              </Button>
            )}
            {showHrHeadReject && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setRejectTarget('hr_head')
                  setRejectOpen(true)
                }}
              >
                Reject (HR Head)
              </Button>
            )}
            {showMgmt && (
              <>
                <Button disabled={busy} onClick={() => void onMgmtApprove()}>
                  Approve (Management)
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setRejectTarget('management')
                    setRejectOpen(true)
                  }}
                >
                  Reject
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
            <DialogDescription>HR can edit and re-send after rejection.</DialogDescription>
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
