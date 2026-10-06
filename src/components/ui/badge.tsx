import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular', {
  variants: {
    variant: {
      default: 'bg-accent text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      outline: 'border text-muted-foreground',
      positive: 'bg-positive-soft text-positive',
      negative: 'bg-negative-soft text-negative',
      warning: 'bg-warning-soft text-warning',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
