"use client";

import { useCallback, useEffect, useState } from "react";
import type { PageSpeedStrategy } from "@/lib/pagespeed";

// Deliberately sessionStorage, not settingsStore/IndexedDB: settingsStore's
// contents get written straight into the downloadable "export settings"
// JSON file (see SettingsPanel's exportSettingsAsJSON), so a secret key
// living there would end up inside that file. This mirrors the exact same
// choice useAIProvider.ts already made for AI provider keys.
const KEY_STORAGE_KEY = "optiqra_pagespeed_key";
const STRATEGY_STORAGE_KEY = "optiqra_pagespeed_strategy";
const CHANGE_EVENT = "optiqra-pagespeed-key-change";

interface PageSpeedKeyState {
	apiKey: string;
	strategy: PageSpeedStrategy;
}

function readState(): PageSpeedKeyState {
	if (typeof window === "undefined") return { apiKey: "", strategy: "mobile" };
	const apiKey = sessionStorage.getItem(KEY_STORAGE_KEY) ?? "";
	const storedStrategy = sessionStorage.getItem(STRATEGY_STORAGE_KEY);
	const strategy: PageSpeedStrategy = storedStrategy === "desktop" ? "desktop" : "mobile";
	return { apiKey, strategy };
}

/** Mirrors useAIProvider.ts's storage pattern for the user's own PageSpeed
 *  Insights API key: sessionStorage only (this tab, this session), synced
 *  across every mounted component that reads it via a custom event. */
export function usePageSpeedKey() {
	const [state, setState] = useState<PageSpeedKeyState>({ apiKey: "", strategy: "mobile" });
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		setState(readState());
		setHydrated(true);

		const resync = () => setState(readState());
		window.addEventListener(CHANGE_EVENT, resync);
		window.addEventListener("storage", resync);
		return () => {
			window.removeEventListener(CHANGE_EVENT, resync);
			window.removeEventListener("storage", resync);
		};
	}, []);

	const setApiKey = useCallback((apiKey: string) => {
		if (apiKey) sessionStorage.setItem(KEY_STORAGE_KEY, apiKey);
		else sessionStorage.removeItem(KEY_STORAGE_KEY);
		setState((prev) => ({ ...prev, apiKey }));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const setStrategy = useCallback((strategy: PageSpeedStrategy) => {
		sessionStorage.setItem(STRATEGY_STORAGE_KEY, strategy);
		setState((prev) => ({ ...prev, strategy }));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const clear = useCallback(() => {
		sessionStorage.removeItem(KEY_STORAGE_KEY);
		setState((prev) => ({ ...prev, apiKey: "" }));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	return {
		...state,
		isConfigured: hydrated && !!state.apiKey,
		hydrated,
		setApiKey,
		setStrategy,
		clear,
	};
}
