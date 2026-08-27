import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-semibold transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-grey-400 disabled:opacity-100 outline-none focus-visible:[box-shadow:var(--focus-ring)] focus-visible:border-violet-500 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // ראשי — violet-500 מלא, לבן. כפתור סגול אחד לכל מסך.
        default: "bg-violet-500 text-white hover:bg-violet-600",
        // הרסני — לבן, border אדום, טקסט אדום.
        destructive: "border border-danger-border bg-surface text-danger hover:bg-danger-bg",
        // משני — לבן, border strong, hover subtle.
        outline: "border border-border-strong bg-surface hover:bg-subtle",
        secondary: "border border-border-strong bg-surface hover:bg-subtle",
        // ghost — טקסט violet, hover violet-50.
        ghost: "text-violet-600 hover:bg-violet-50",
        link: "text-violet-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-4 md:h-10",
        sm: "h-8 rounded-field px-3 text-[13px]",
        lg: "h-12 px-8",
        icon: "size-12 md:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
