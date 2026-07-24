import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, ArrowRight } from 'lucide-react'

export function WelcomePage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.2),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(5,150,105,0.12),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:48px_48px] dark:opacity-20" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-3xl text-center"
      >
        <p className="text-4xl font-semibold tracking-tight sm:text-5xl">PettyCash</p>
        <p className="mx-auto mt-3 max-w-lg text-[var(--color-muted-foreground)]">
          Choose a workspace to continue. You&apos;ll sign in on the next step.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link to={'/login?module=cash'} className={`group rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-left shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition hover:shadow-xl`}
          >
            <div className={`mb-4 inline-flex rounded-2xl p-3`}><Wallet className="h-6 w-6" /></div>
            <h2 className="text-xl font-semibold tracking-tight">Cash Management</h2>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">Requests, approvals, payment schedules, and finance settlements.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)]">
              Continue
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link to={'/login?module=salary'} className={`group rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-left shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition hover:shadow-xl`}
          >
            <div className={`mb-4 inline-flex rounded-2xl p-3`}><Wallet className="h-6 w-6" /></div>
            <h2 className="text-xl font-semibold tracking-tight">Salary</h2>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">Requests, approvals, payment schedules, and finance settlements.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)]">
              Continue
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}