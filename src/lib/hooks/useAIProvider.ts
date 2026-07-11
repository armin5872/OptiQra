"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";

const PROVIDER_KEY = "optiqra_ai_provider";
const API_KEY_PREFIX = "optiqra_ai_key_"; // + providerId, kept separate per provider so switching doesn't clobber keys

interface AIProviderState {
	provider: AIProviderId | null;
	apiKey: string;
	model: string;
}

function readState(): AIProviderState {
	if (typeof window === "undefined") return { provider: null, apiKey: "", model: "" };

	const provider = sessionStorage.getItem(PROVIDER_KEY) as AIProviderId | null;
	const apiKey = provider ? (sessionStorage.getItem(API_KEY_PREFIX + provider) ?? "") : "";
	const model = provider ? AI_PROVIDERS[provider].defaultModel : "";

	return { provider, apiKey, model };
}

export function useAIProvider() {
	const [state, setState] = useState<AIProviderState>({ provider: null, apiKey: "", model: "" });
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		setState(readState());
		setHydrated(true);
	}, []);

	const setProvider = useCallback((provider: AIProviderId, apiKey: string) => {
		sessionStorage.setItem(PROVIDER_KEY, provider);
		sessionStorage.setItem(API_KEY_PREFIX + provider, apiKey);
		setState({ provider, apiKey, model: AI_PROVIDERS[provider].defaultModel });
	}, []);

	const clear = useCallback(() => {
		if (state.provider) sessionStorage.removeItem(API_KEY_PREFIX + state.provider);
		sessionStorage.removeItem(PROVIDER_KEY);
		setState({ provider: null, apiKey: "", model: "" });
	}, [state.provider]);

	const isConfigured = hydrated && !!state.provider && !!state.apiKey;

	return { ...state, isConfigured, hydrated, setProvider, clear };
}
