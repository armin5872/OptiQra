"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";

const PROVIDER_KEY = "optiqra_ai_provider";
const API_KEY_PREFIX = "optiqra_ai_key_"; // + providerId, kept separate per provider so switching doesn't clobber keys
const MODEL_KEY_PREFIX = "optiqra_ai_model_"; // + providerId, so each provider remembers its own last-used model

// useAIProvider() is called independently by several components at once
// (AIProviderSetup, AIFixButton, AISiteInsights, ProjectUploadPanel, ...).
// Each keeps its own local state seeded from sessionStorage on mount, so
// without this event, saving a key in one already-mounted component (e.g.
// the setup panel) never reaches the others (e.g. an insights/fix button
// that was already on screen) — they'd keep reporting isConfigured=false
// until the whole page remounted. This custom event lets every instance
// re-sync the moment any one of them writes to storage.
const AI_PROVIDER_CHANGE_EVENT = "optiqra-ai-provider-change";

interface AIProviderState {
	provider: AIProviderId | null;
	apiKey: string;
	model: string;
}

function readState(): AIProviderState {
	if (typeof window === "undefined") return { provider: null, apiKey: "", model: "" };

	const provider = sessionStorage.getItem(PROVIDER_KEY) as AIProviderId | null;
	const apiKey = provider ? (sessionStorage.getItem(API_KEY_PREFIX + provider) ?? "") : "";
	const storedModel = provider ? sessionStorage.getItem(MODEL_KEY_PREFIX + provider) : null;
	const model = provider ? storedModel || AI_PROVIDERS[provider].defaultModel : "";

	return { provider, apiKey, model };
}

export function useAIProvider() {
	const [state, setState] = useState<AIProviderState>({ provider: null, apiKey: "", model: "" });
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		setState(readState());
		setHydrated(true);

		// Re-sync when ANY useAIProvider() instance (this tab) saves/clears,
		// and when another tab changes sessionStorage-backed... actually storage
		// events don't fire for sessionStorage across tabs, but we still listen
		// for completeness / future-proofing if this ever moves to localStorage.
		const resync = () => setState(readState());
		window.addEventListener(AI_PROVIDER_CHANGE_EVENT, resync);
		window.addEventListener("storage", resync);
		return () => {
			window.removeEventListener(AI_PROVIDER_CHANGE_EVENT, resync);
			window.removeEventListener("storage", resync);
		};
	}, []);

	const setProvider = useCallback((provider: AIProviderId, apiKey: string, model?: string) => {
		const resolvedModel = model || sessionStorage.getItem(MODEL_KEY_PREFIX + provider) || AI_PROVIDERS[provider].defaultModel;
		sessionStorage.setItem(PROVIDER_KEY, provider);
		sessionStorage.setItem(API_KEY_PREFIX + provider, apiKey);
		sessionStorage.setItem(MODEL_KEY_PREFIX + provider, resolvedModel);
		setState({ provider, apiKey, model: resolvedModel });
		window.dispatchEvent(new Event(AI_PROVIDER_CHANGE_EVENT));
	}, []);

	const setModel = useCallback((model: string) => {
		setState((prev) => {
			if (!prev.provider) return prev;
			sessionStorage.setItem(MODEL_KEY_PREFIX + prev.provider, model);
			return { ...prev, model };
		});
		window.dispatchEvent(new Event(AI_PROVIDER_CHANGE_EVENT));
	}, []);

	const clear = useCallback(() => {
		if (state.provider) {
			sessionStorage.removeItem(API_KEY_PREFIX + state.provider);
			sessionStorage.removeItem(MODEL_KEY_PREFIX + state.provider);
		}
		sessionStorage.removeItem(PROVIDER_KEY);
		setState({ provider: null, apiKey: "", model: "" });
		window.dispatchEvent(new Event(AI_PROVIDER_CHANGE_EVENT));
	}, [state.provider]);

	const isConfigured = hydrated && !!state.provider && !!state.apiKey;

	return { ...state, isConfigured, hydrated, setProvider, setModel, clear };
}
