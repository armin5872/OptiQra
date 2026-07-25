import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary text-primary-foreground",
				secondary: "border-transparent bg-secondary text-secondary-foreground",
				destructive: "border-transparent bg-destructive text-white",
				outline: "text-foreground border-border",
				good: "border-transparent bg-good-bg text-good",
				warn: "border-transparent bg-warn-bg text-warn",
				critical: "border-transparent bg-critical-bg text-critical",
				"sev-critical": "border-transparent bg-sev-critical-bg text-sev-critical",
				"sev-high": "border-transparent bg-sev-high-bg text-sev-high",
				"sev-medium": "border-transparent bg-sev-medium-bg text-sev-medium",
				"sev-low": "border-transparent bg-sev-low-bg text-sev-low",
				"sev-informational":
					"border-sev-info-border bg-sev-info-bg text-ink-soft",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";
	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
