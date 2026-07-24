import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams()
  const moduleName = params.get('module') === 'salary' ? 'Salary' : 'Cash Management'
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e:any) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/dashboard')
    } catch (err:any) {
      setError(err.message ?? 'Sign in failed')
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
          <p className="text-4xl font-semibold tracking-tight">PettyCash</p>
          <p className="mt-3 text-[var(--color-muted-foreground)]">
            Sign in to continue to{' '}
            <span className="font-medium text-[var(--color-foreground)]">{moduleName}</span>
          </p>
        </div>

        <Card className="glass border-[var(--color-border)]/80">
          <CardHeader>
            <CardTitle>User login</CardTitle>
            <CardDescription>Connect Firebase Auth when ready.</CardDescription>
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
              <Button className="w-full" disabled={submitting}>{submitting ? "Signing in" : "Sign in"}</Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
