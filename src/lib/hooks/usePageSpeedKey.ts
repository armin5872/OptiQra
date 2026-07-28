"use client";

import { useCallback, useEffect, useState } from "react";
import type { PageSpeedStrategy } from "@/lib/pagespeed";
import { getPageSpeedState, savePageSpeedState, type PageSpeedStoredState } from "@/lib/pagespeedKeyStore";

const CHANGE_EVENT = "optiqra-pagespeed-key-change";

interface PageSpeedKeyState {
	apiKey: string;
	strategy: PageSpeedStrategy;
}

/** Mirrors useAIProvider.ts's storage pattern for the user's own PageSpeed
 *  Insights API key: persisted in its own IndexedDB store (see
 *  pagespeedKeyStore.ts), synced across every mounted component that reads
 *  it via a custom event. */
export function usePageSpeedKey() {
	const [state, setState] = useState<PageSpeedKeyState>({ apiKey: "", strategy: "mobile" });
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			const stored = await getPageSpeedState();
			if (cancelled) return;
			setState(stored);
			setHydrated(true);
		};
		load();

		const resync = () => load();
		window.addEventListener(CHANGE_EVENT, resync);
		return () => {
			cancelled = true;
			window.removeEventListener(CHANGE_EVENT, resync);
		};
	}, []);

	const setApiKey = useCallback(async (apiKey: string) => {
		const stored = await getPageSpeedState();
		const next: PageSpeedStoredState = { ...stored, apiKey };
		await savePageSpeedState(next);
		setState((prev) => ({ ...prev, apiKey }));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const setStrategy = useCallback(async (strategy: PageSpeedStrategy) => {
		const stored = await getPageSpeedState();
		const next: PageSpeedStoredState = { ...stored, strategy };
		await savePageSpeedState(next);
		setState((prev) => ({ ...prev, strategy }));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const clear = useCallback(async () => {
		const stored = await getPageSpeedState();
		await savePageSpeedState({ ...stored, apiKey: "" });
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
