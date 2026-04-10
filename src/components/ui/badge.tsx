import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-ben-600 text-white',
        secondary:   'border-transparent bg-ben-800 text-ben-300',
        destructive: 'border-transparent bg-red-700 text-white',
        outline:     'border-ben-700 text-white',
        success:     'border-emerald-600/40 bg-emerald-600/20 text-emerald-400',
        warning:     'border-amber-600/40 bg-amber-600/20 text-amber-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
