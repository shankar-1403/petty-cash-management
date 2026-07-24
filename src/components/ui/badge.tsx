import { cva, type VariantProps } from 'class-variance-authority'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const badgeVariants = cva(
  'inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
        info: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
        success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        danger: 'bg-red-500/15 text-red-600 dark:text-red-400',
        outline: 'border border-[var(--color-border)] text-[var(--color-muted-foreground)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
