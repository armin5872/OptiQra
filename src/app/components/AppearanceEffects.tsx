"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/hooks/useSettings";

/** Mirrors the current appearance settings onto <html> as data-attributes and
 *  CSS variable overrides. Pairs with the inline `theme-init` script in
 *  layout.tsx, which does the same thing synchronously from the cookie
 *  mirror before first paint (so there's no flash), then this component
 *  takes over for anything that changes during the session — including a
 *  live "system" theme switch. */
export default function AppearanceEffects() {
	const { settings, hydrated } = useSettings();

	useEffect(() => {
		if (!hydrated) return;
		applyAppearance(settings.appearance);

		if (settings.appearance.theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyAppearance(settings.appearance);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [hydrated, settings.appearance]);

	return null;
}

function applyAppearance(appearance: {
	theme: "system" | "light" | "dark";
	accentColor: string;
	density: "comfortable" | "compact";
	reduceMotion: boolean;
	fontScale: "small" | "default" | "large";
}) {
	const root = document.documentElement;
	const resolvedTheme =
		appearance.theme === "system" ?
			(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
		:	appearance.theme;

	root.setAttribute("data-theme", resolvedTheme);
	root.setAttribute("data-density", appearance.density);
	root.setAttribute("data-font-scale", appearance.fontScale);
	root.classList.toggle("reduce-motion", appearance.reduceMotion);
	root.style.setProperty("--accent", appearance.accentColor);
	root.style.setProperty(
		"--accent-hover",
		`color-mix(in srgb, ${appearance.accentColor} 85%, black)`,
	);
	root.style.setProperty(
		"--accent-soft",
		resolvedTheme === "dark" ?
			`color-mix(in srgb, ${appearance.accentColor} 22%, black)`
		:	`color-mix(in srgb, ${appearance.accentColor} 14%, white)`,
	);
}
