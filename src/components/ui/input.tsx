import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"flex h-9 w-full min-w-0 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
				"focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
				"aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
