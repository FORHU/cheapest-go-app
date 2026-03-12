import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20",
  {
    variants: {
      variant: {
        default: "bg-blue-600/10 text-blue-600 border-blue-600/20",
        secondary: "bg-slate-100 text-slate-900 border-slate-200 dark:bg-white/10 dark:text-white dark:border-white/10",
        destructive: "bg-rose-500/10 text-rose-500 border-rose-500/20",
        outline: "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-400",
        success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        ghost: "border-transparent bg-transparent",
      },
      size: {
        default: "px-2.5 py-0.5 text-[10px] uppercase tracking-wider",
        sm: "px-2 py-0 text-[10px] uppercase tracking-wider",
        lg: "px-3 py-1 text-xs uppercase tracking-widest",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({
  className,
  variant,
  size,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
