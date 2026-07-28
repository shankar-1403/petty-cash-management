import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { canAccessModule, getHomePath } from '@/lib/role'
import logo from "../assets/pcred-logo.png"

export function LoginPage() {
  const { user, role, loading, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const moduleParam = params.get('module') === 'salary' ? 'salary' : 'cash'
  const moduleName = moduleParam === 'salary' ? 'Salary' : 'Cash Management'
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  if (!loading && user && role) {
    if (moduleParam === 'salary' && !canAccessModule('salary', role)) {
      return <Navigate to={getHomePath(role)} replace />
    }
    const dest =
      moduleParam === 'salary' && canAccessModule('salary', role)
        ? '/salary'
        : getHomePath(role)
    return <Navigate to={dest} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const profile = await login(email.trim(), password)
      if (moduleParam === 'salary' && !canAccessModule('salary', profile.role)) {
        toast.error('Salary module is only for HR, Management, Finance, and IT')
        navigate(getHomePath(profile.role), { replace: true })
        return
      }
      if (moduleParam === 'salary') {
        navigate('/salary', { replace: true })
      } else {
        navigate(getHomePath(profile.role), { replace: true })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(14,165,233,0.12),_transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:48px_48px] dark:opacity-20" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to modules
          </Link>
        </div>

        <div className="mb-8 text-center">
          <div className='flex justify-center'>
            <img src={logo} alt="Pcred Logo" className='h-16'/>
          </div>
          <p className="mt-3 text-[var(--color-muted-foreground)]">
            Sign in to continue to{' '}
            <span className="font-medium text-[var(--color-foreground)]">{moduleName}</span>
          </p>
        </div>

        <Card className="glass border-[var(--color-border)]/80">
          <CardHeader>
            <CardTitle>User login</CardTitle>
            <CardDescription>Sign in with your Firebase account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
