"use client";

import { useState } from "react";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { useAIProvider } from "@/lib/hooks/useAIProvider";

export default function AIProviderSetup() {
	const { provider, apiKey, isConfigured, hydrated, setProvider, clear } = useAIProvider();
	const [selected, setSelected] = useState<AIProviderId>(provider ?? "openai");
	const [key, setKey] = useState(apiKey ?? "");
	const [open, setOpen] = useState(!isConfigured);

	if (!hydrated) return null;

	const config = AI_PROVIDERS[selected];
	const canSave = key.trim().length > 8;

	const handleSave = () => {
		setProvider(selected, key.trim());
		setOpen(false);
	};

	if (!open && isConfigured) {
		return (
			<div className="ai-setup-summary">
				<span>
					AI fixes: <strong>{AI_PROVIDERS[provider!].label}</strong>
				</span>
				<button type="button" className="link-btn" onClick={() => setOpen(true)}>
					change
				</button>
				<button type="button" className="link-btn" onClick={clear}>
					disconnect
				</button>
			</div>
		);
	}

	return (
		<div className="ai-setup-card">
			<div className="ai-setup-row">
				<label htmlFor="ai-provider-select">AI provider</label>
				<select
					id="ai-provider-select"
					value={selected}
					onChange={(e) => setSelected(e.target.value as AIProviderId)}
				>
					{Object.values(AI_PROVIDERS).map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</div>

			<div className="ai-setup-row">
				<label htmlFor="ai-key-input">API key</label>
				<input
					id="ai-key-input"
					type="password"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					placeholder={`${config.keyPrefix}...`}
					autoComplete="off"
				/>
			</div>
			<p className="ai-setup-hint">
				Stored only in this browser tab&apos;s session storage. Sent directly to {config.label}{" "}
				per request — never saved on our servers.
			</p>

			<button type="button" className="apply-btn" disabled={!canSave} onClick={handleSave}>
				Save &amp; enable AI fixes
			</button>
		</div>
	);
}
