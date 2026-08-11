"use client";

import { useState } from "react";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { useAIProvider } from "@/lib/hooks/useAIProvider";

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

export default function AIProviderSetup() {
	const { provider, apiKey, model, isConfigured, hydrated, setProvider, clear } = useAIProvider();
	const [selected, setSelected] = useState<AIProviderId>(provider ?? "openai");
	const [key, setKey] = useState(apiKey ?? "");
	const [selectedModel, setSelectedModel] = useState(model || AI_PROVIDERS[provider ?? "openai"].defaultModel);
	const [customModel, setCustomModel] = useState("");
	const [useCustomModel, setUseCustomModel] = useState(false);
	const [open, setOpen] = useState(!isConfigured);
	const [test, setTest] = useState<TestState>({ status: "idle" });

	if (!hydrated) return null;

	const config = AI_PROVIDERS[selected];
	const effectiveModel = useCustomModel ? customModel.trim() : selectedModel;
	// Local providers store a server URL in the same slot instead of a secret,
	// so the ">8 chars, looks like a key" check doesn't apply — just require
	// something non-empty (the field is pre-filled with a sane default anyway).
	const canSave = config.localOnly ? key.trim().length > 0 && effectiveModel.length > 0 : key.trim().length > 8 && effectiveModel.length > 0;

	const handleProviderChange = (id: AIProviderId) => {
		setSelected(id);
		setSelectedModel(AI_PROVIDERS[id].defaultModel);
		setUseCustomModel(false);
		setCustomModel("");
		setTest({ status: "idle" });
		if (AI_PROVIDERS[id].localOnly && !key.trim()) {
			setKey("http://127.0.0.1:11434");
		}
	};

	const handleTest = async () => {
		if (!canSave) return;
		setTest({ status: "testing" });
		try {
			const res = await fetch("/api/ai-test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: selected, apiKey: key.trim(), model: effectiveModel }),
			});
			const json = await res.json();
			if (json.ok) {
				setTest({ status: "ok" });
			} else {
				setTest({ status: "error", message: json.message ?? "Key check failed" });
			}
		} catch {
			setTest({ status: "error", message: "Couldn't reach the test endpoint" });
		}
	};

	const handleSave = () => {
		setProvider(selected, key.trim(), effectiveModel);
		setOpen(false);
	};

	if (!open && isConfigured && provider) {
		return (
			<div className="ai-setup-summary">
				<span>
					AI fixes: <strong>{AI_PROVIDERS[provider].label}</strong>
					<span className="ai-setup-model-tag">{model}</span>
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
					onChange={(e) => handleProviderChange(e.target.value as AIProviderId)}
				>
					{Object.values(AI_PROVIDERS).map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</div>

			<div className="ai-setup-row">
				<label htmlFor="ai-model-select">Model</label>
				{!useCustomModel ? (
					<select
						id="ai-model-select"
						value={selectedModel}
						onChange={(e) => {
							if (e.target.value === "__custom__") {
								setUseCustomModel(true);
							} else {
								setSelectedModel(e.target.value);
							}
							setTest({ status: "idle" });
						}}
					>
						{config.models.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
						{config.allowCustomModel && <option value="__custom__">Custom model id…</option>}
					</select>
				) : (
					<div className="ai-setup-custom-model">
						<input
							type="text"
							value={customModel}
							onChange={(e) => {
								setCustomModel(e.target.value);
								setTest({ status: "idle" });
							}}
							placeholder="e.g. anthropic/claude-opus-4.5"
							autoComplete="off"
						/>
						<button
							type="button"
							className="link-btn"
							onClick={() => {
								setUseCustomModel(false);
								setCustomModel("");
							}}
						>
							use preset instead
						</button>
					</div>
				)}
				{config.hint && <p className="ai-setup-hint">{config.hint}</p>}
			</div>

			<div className="ai-setup-row">
				<label htmlFor="ai-key-input">{config.localOnly ? "Ollama server URL" : "API key"}</label>
				<input
					id="ai-key-input"
					type={config.localOnly ? "text" : "password"}
					value={key}
					onChange={(e) => {
						setKey(e.target.value);
						setTest({ status: "idle" });
					}}
					placeholder={config.localOnly ? "http://127.0.0.1:11434" : config.keyPrefix ? `${config.keyPrefix}...` : "paste key…"}
					autoComplete="off"
				/>
			</div>
			{config.localOnly ? (
				<p className="ai-setup-hint">
					Nothing leaves this device — requests go straight from OptiQra Desktop to your local Ollama
					server. Only reachable inside the desktop app; the hosted web version has no way to reach
					`localhost` on your machine.{" "}
					<a href={config.keyUrl} target="_blank" rel="noreferrer">
						Install Ollama ↗
					</a>
				</p>
			) : (
				<p className="ai-setup-hint">
					Saved in this browser only (IndexedDB), so you won&apos;t need to re-enter it next time. Sent directly
					to {config.label} per request — never saved on our servers.{" "}
					<a href={config.keyUrl} target="_blank" rel="noreferrer">
						Get a {config.label} key ↗
					</a>
				</p>
			)}

			<div className="ai-setup-actions">
				<button type="button" className="link-btn" disabled={!canSave || test.status === "testing"} onClick={handleTest}>
					{test.status === "testing" ? "Testing…" : "Test connection"}
				</button>
				<button type="button" className="apply-btn" disabled={!canSave} onClick={handleSave}>
					Save &amp; enable AI fixes
				</button>
			</div>

			{test.status === "ok" && <p className="ai-setup-test ok">Key works — connected to {config.label}.</p>}
			{test.status === "error" && <p className="ai-setup-test error">{test.message}</p>}
		</div>
	);
}
