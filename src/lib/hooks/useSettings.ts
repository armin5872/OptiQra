"use client";

import { useCallback, useEffect, useState } from "react";
import {
	DEFAULT_SETTINGS,
	getSettings,
	saveSettings,
	resetSettings,
	type OptiqraSettings,
} from "@/lib/settingsStore";

/**
 * Shared, module-level settings store.
 *
 * IMPORTANT: useSettings() is called from several independent components —
 * SettingsPanel, AppearanceEffects, ReportDownload, page.tsx. If this hook
 * just did local `useState(DEFAULT_SETTINGS)` in each of them (as it used
 * to), every one of those would hold its OWN separate copy: SettingsPanel
 * calling update() would change SettingsPanel's local state and persist to
 * IndexedDB, but AppearanceEffects — the component that actually applies
 * settings to the DOM — would never find out, since nothing tells it to
 * re-render. That's the bug this file exists to fix: one shared value with
 * a subscriber list, so every component using this hook re-renders the
 * instant ANY of them calls update()/replaceAll()/reset(), regardless of
 * where that call came from.
 */

type Listener = () => void;

let sharedSettings: OptiqraSettings = DEFAULT_SETTINGS;
let sharedHydrated = false;
let hydrationStarted = false;
const listeners = new Set<Listener>();

function notify() {
	for (const listener of listeners) listener();
}

function ensureHydrated() {
	if (hydrationStarted) return;
	hydrationStarted = true;
	getSettings().then((s) => {
		sharedSettings = s;
		sharedHydrated = true;
		notify();
	});
}

/** Deep-ish partial updater: pass just the slice you're changing, e.g.
 *  update("appearance", { theme: "dark" }) — everything else is preserved.
 *  Every component using useSettings() re-renders immediately, no matter
 *  which component called update(). */
export function useSettings() {
	const [, forceRender] = useState(0);

	useEffect(() => {
		const listener: Listener = () => forceRender((n) => n + 1);
		listeners.add(listener);
		ensureHydrated();
		return () => {
			listeners.delete(listener);
		};
	}, []);

	const update = useCallback(
		<K extends keyof OptiqraSettings>(section: K, patch: Partial<OptiqraSettings[K]>) => {
			sharedSettings = {
				...sharedSettings,
				[section]: { ...sharedSettings[section], ...patch },
			};
			saveSettings(sharedSettings);
			notify();
		},
		[],
	);

	const replaceAll = useCallback((next: OptiqraSettings) => {
		sharedSettings = next;
		saveSettings(next);
		notify();
	}, []);

	const reset = useCallback(async () => {
		const defaults = await resetSettings();
		sharedSettings = defaults;
		notify();
	}, []);

	return { settings: sharedSettings, hydrated: sharedHydrated, update, replaceAll, reset };
}
