"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { getAIProviderState, saveAIProviderState, type AIProviderStoredState } from "@/lib/aiProviderStore";

// useAIProvider() is called independently by several components at once
// (AIProviderSetup, AIFixButton, AISiteInsights, ProjectUploadPanel, ...).
// Each keeps its own local state loaded from IndexedDB on mount, so without
// this event, saving a key in one already-mounted component (e.g. the setup
// panel) never reaches the others (e.g. an insights/fix button that was
// already on screen) — they'd keep reporting isConfigured=false until the
// whole page remounted. This custom event lets every instance re-sync the
// moment any one of them writes to storage.
const AI_PROVIDER_CHANGE_EVENT = "optiqra-ai-provider-change";

interface AIProviderState {
	provider: AIProviderId | null;
	apiKey: string;
	model: string;
}

function toState(stored: AIProviderStoredState): AIProviderState {
	const provider = stored.provider;
	const apiKey = provider ? (stored.apiKeys[provider] ?? "") : "";
	const model = provider ? stored.models[provider] || AI_PROVIDERS[provider].defaultModel : "";
	return { provider, apiKey, model };
}

export function useAIProvider() {
	const [state, setState] = useState<AIProviderState>({ provider: null, apiKey: "", model: "" });
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			const stored = await getAIProviderState();
			if (cancelled) return;
			setState(toState(stored));
			setHydrated(true);
		};
		load();

		// Re-sync when ANY useAIProvider() instance (this tab) saves/clears.
		const resync = () => load();
		window.addEventListener(AI_PROVIDER_CHANGE_EVENT, resync);
		return () => {
			cancelled = true;
			window.removeEventListener(AI_PROVIDER_CHANGE_EVENT, resync);
		};
	}, []);

	const setProvider = useCallback(async (provider: AIProviderId, apiKey: string, model?: string) => {
		const stored = await getAIProviderState();
		const resolvedModel = model || stored.models[provider] || AI_PROVIDERS[provider].defaultModel;
		const next: AIProviderStoredState = {
			provider,
			apiKeys: { ...stored.apiKeys, [provider]: apiKey },
			models: { ...stored.models, [provider]: resolvedModel },
		};
		await saveAIProviderState(next);
		setState({ provider, apiKey, model: resolvedModel });
		window.dispatchEvent(new Event(AI_PROVIDER_CHANGE_EVENT));
	}, []);

	const setModel = useCallback(async (model: string) => {
		const stored = await getAIProviderState();
		if (!stored.provider) return;
		const next: AIProviderStoredState = {
			...stored,
			models: { ...stored.models, [stored.provider]: model },
		};
		await saveAIProviderState(next);
		setState((prev) => ({ ...prev, model }));
		window.dispatchEvent(new Event(AI_PROVIDER_CHANGE_EVENT));
	}, []);

	const clear = useCallback(async () => {
		const stored = await getAIProviderState();
		if (stored.provider) {
			const apiKeys = { ...stored.apiKeys };
			const models = { ...stored.models };
			delete apiKeys[stored.provider];
			delete models[stored.provider];
			await saveAIProviderState({ provider: null, apiKeys, models });
		} else {
			await saveAIProviderState({ provider: null, apiKeys: {}, models: {} });
		}
		setState({ provider: null, apiKey: "", model: "" });
		window.dispatchEvent(new Event(AI_PROVIDER_CHANGE_EVENT));
	}, []);

	const isConfigured = hydrated && !!state.provider && !!state.apiKey;

	return { ...state, isConfigured, hydrated, setProvider, setModel, clear };
}
