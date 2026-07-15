"use client";

import { useCallback, useEffect, useState } from "react";
import {
	DEFAULT_SETTINGS,
	getSettings,
	saveSettings,
	resetSettings,
	type OptiqraSettings,
} from "@/lib/settingsStore";

/** Deep-ish partial updater: pass just the slice you're changing, e.g.
 *  update("appearance", { theme: "dark" }) — everything else is preserved. */
export function useSettings() {
	const [settings, setSettings] = useState<OptiqraSettings>(DEFAULT_SETTINGS);
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let cancelled = false;
		getSettings().then((s) => {
			if (!cancelled) {
				setSettings(s);
				setHydrated(true);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const update = useCallback(
		<K extends keyof OptiqraSettings>(section: K, patch: Partial<OptiqraSettings[K]>) => {
			setSettings((prev) => {
				const next: OptiqraSettings = {
					...prev,
					[section]: { ...prev[section], ...patch },
				};
				saveSettings(next);
				return next;
			});
		},
		[],
	);

	const replaceAll = useCallback((next: OptiqraSettings) => {
		setSettings(next);
		saveSettings(next);
	}, []);

	const reset = useCallback(async () => {
		const defaults = await resetSettings();
		setSettings(defaults);
	}, []);

	return { settings, hydrated, update, replaceAll, reset };
}
