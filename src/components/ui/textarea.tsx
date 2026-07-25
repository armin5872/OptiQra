import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex min-h-16 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
				"focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
