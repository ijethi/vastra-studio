import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[var(--ease-out-soft)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover shadow-[0_8px_20px_-10px_var(--accent)]",
        secondary: "bg-surface text-ink border border-line-strong hover:border-ink/40",
        night: "bg-night text-night-ink hover:bg-night-2",
        ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
        danger: "bg-danger-soft text-danger hover:brightness-95 border border-transparent",
        link: "text-accent underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-13 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp ref={ref} type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { buttonVariants };
