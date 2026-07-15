"use client";

import { useEffect, useRef } from "react";
import { useSettings } from "@/lib/hooks/useSettings";
import { applyCustomCSS, runCustomJS } from "@/lib/customCode";
import type { OptiqraSettings } from "@/lib/settingsStore";

/** Mirrors the current appearance/layout/typography settings onto <html> as
 *  data-attributes and CSS variable overrides. Pairs with the inline
 *  `theme-init` script in layout.tsx, which does the same thing
 *  synchronously from the cookie mirror before first paint (so there's no
 *  flash), then this component takes over for anything that changes during
 *  the session — including a live "system" theme switch.
 *
 *  Also applies the "Advanced" tab's custom CSS/JS. Custom CSS is safe to
 *  re-apply on every change (it's just a <style> tag). Custom JS is NOT
 *  re-run on every keystroke — see customCode.ts — it only runs once here,
 *  on initial load, if it was already saved and explicitly acknowledged in
 *  a previous session. Anything typed after that only runs when the user
 *  clicks "Run code" in the settings panel itself. */
export default function AppearanceEffects() {
	const { settings, hydrated } = useSettings();
	const ranSavedJSOnce = useRef(false);

	useEffect(() => {
		if (!hydrated) return;
		applyAppearance(settings.appearance, settings.layout, settings.typography);

		if (settings.appearance.theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () =>
			applyAppearance(settings.appearance, settings.layout, settings.typography);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [hydrated, settings.appearance, settings.layout, settings.typography]);

	useEffect(() => {
		if (!hydrated) return;
		applyCustomCSS(settings.advanced.customCSS);
	}, [hydrated, settings.advanced.customCSS]);

	useEffect(() => {
		if (!hydrated || ranSavedJSOnce.current) return;
		ranSavedJSOnce.current = true;
		if (settings.advanced.customJSEnabled && settings.advanced.acknowledgedCodeRisk) {
			runCustomJS(settings.advanced.customJS);
		}
	}, [hydrated, settings.advanced]);

	return null;
}

function applyAppearance(
	appearance: OptiqraSettings["appearance"],
	layout: OptiqraSettings["layout"],
	typography: OptiqraSettings["typography"],
) {
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

	// Layout — corner radius, content width, motion speed. These apply
	// instantly and app-wide because --radius / --max-width / data-motion-speed
	// are already threaded through globals.css.
	root.style.setProperty("--radius", `${layout.cornerRadius}px`);
	root.style.setProperty("--max-width", `${layout.contentWidth}px`);
	root.setAttribute("data-motion-speed", layout.motionSpeed);

	// Typography — optional custom font family + letter spacing.
	if (typography.fontFamily === "custom" && typography.customFontFamily.trim()) {
		root.setAttribute("data-custom-font", "1");
		root.style.setProperty("--custom-font", typography.customFontFamily);
	} else {
		root.removeAttribute("data-custom-font");
		root.style.removeProperty("--custom-font");
	}
	if (typography.letterSpacing) {
		root.setAttribute("data-letter-spacing", "1");
		root.style.setProperty("--letter-spacing", `${typography.letterSpacing}px`);
	} else {
		root.removeAttribute("data-letter-spacing");
		root.style.removeProperty("--letter-spacing");
	}
}
