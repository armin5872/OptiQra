"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const values = React.useMemo(
		() =>
			Array.isArray(value) ? value
			: Array.isArray(defaultValue) ? defaultValue
			: [min, max],
		[value, defaultValue, min, max],
	);

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
				<SliderPrimitive.Range className="absolute h-full bg-brand" />
			</SliderPrimitive.Track>
			{Array.from({ length: values.length }, (_, i) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					key={i}
					className="block size-4 shrink-0 rounded-full border-2 border-brand bg-white shadow-sm outline-none transition-[color,box-shadow] focus-visible:ring-4 focus-visible:ring-brand/25 disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
