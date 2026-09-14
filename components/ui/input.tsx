import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full rounded-field border border-border-strong bg-surface px-3 py-2 text-[14.5px] transition-colors placeholder:text-text-muted focus-visible:outline-none focus-visible:border-violet-500 focus-visible:[box-shadow:var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-subtle disabled:text-grey-400 aria-invalid:border-danger md:h-10",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
