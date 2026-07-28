import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { canApproveHr } from '@/lib/role'
import { createSalarySheet, shareSalaryWithHrHead } from '@/lib/salary'

export default function SalaryCreatePage() {
  const { user, profile, role } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [period, setPeriod] = useState('')
  const [sheetFile, setSheetFile] = useState<File | null>(null)
  const [filePassword, setFilePassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!canApproveHr(role)) {
    return <Navigate to="/salary" replace />
  }

  async function uploadSheet(sendToHrHead: boolean) {
    if (!user || !profile) return

    if (!title.trim() || !period.trim()) {
      toast.error('Title and period are required')
      return
    }
    if (!sheetFile) {
      toast.error('Upload a salary sheet file')
      return
    }
    if (filePassword.length < 4) {
      toast.error('Sheet password must be at least 4 characters')
      return
    }
    if (filePassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      const id = await createSalarySheet({
        title,
        period,
        sheetFile,
        filePassword,
        createdBy: user.uid,
        createdByName: profile.displayName || profile.email,
      })

      if (sendToHrHead) {
        await shareSalaryWithHrHead(id, {
          uid: user.uid,
          name: profile.displayName || profile.email,
        })
        toast.success('Uploaded and sent to HR Head')
      } else {
        toast.success('Salary sheet saved as draft')
      }
      navigate(`/salary/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload sheet')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/salary"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to salary
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload salary sheet
          </CardTitle>
          <CardDescription>
            Upload an Excel/CSV/PDF sheet and set a password. Then send it to HR Head for approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void uploadSheet(true)
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. March payroll"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Period</Label>
                <Input
                  id="period"
                  placeholder="e.g. March 2026"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sheetFile">Salary sheet file</Label>
              <Input
                id="sheetFile"
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
                onChange={(e) => setSheetFile(e.target.files?.[0] ?? null)}
                required
              />
              {sheetFile ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {sheetFile.name} · {(sheetFile.size / 1024).toFixed(1)} KB
                </p>
              ) : (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Accepted: .xlsx, .xls, .csv, .pdf
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="filePassword">Sheet password</Label>
                <Input
                  id="filePassword"
                  type="password"
                  autoComplete="new-password"
                  value={filePassword}
                  onChange={(e) => setFilePassword(e.target.value)}
                  placeholder="Min 4 characters"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Share this password securely with reviewers so they can download the sheet.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Uploading…' : 'Upload & send to HR Head'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void uploadSheet(false)}
              >
                Save as draft
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
