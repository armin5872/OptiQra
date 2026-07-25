"use client";

import { useState } from "react";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
	const canSave = key.trim().length > 8 && effectiveModel.length > 0;

	const handleProviderChange = (id: AIProviderId) => {
		setSelected(id);
		setSelectedModel(AI_PROVIDERS[id].defaultModel);
		setUseCustomModel(false);
		setCustomModel("");
		setTest({ status: "idle" });
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
			<div className="mt-[-2px] mb-5 flex items-center gap-2.5 font-(family-name:--font-sans) text-[13px] text-ink-soft">
				<span>
					AI fixes: <strong className="text-ink">{AI_PROVIDERS[provider].label}</strong>
					<Badge variant="secondary" className="ml-2 font-(family-name:--font-mono) text-[11px]">
						{model}
					</Badge>
				</span>
				<button
					type="button"
					className="text-brand underline-offset-2 hover:underline"
					onClick={() => setOpen(true)}
				>
					change
				</button>
				<button
					type="button"
					className="text-brand underline-offset-2 hover:underline"
					onClick={clear}
				>
					disconnect
				</button>
			</div>
		);
	}

	return (
		<Card className="mb-6 gap-3 border-t-2 border-t-brand p-5">
			<CardContent className="flex flex-col gap-3 p-0">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ai-provider-select" className="text-xs text-ink-soft">
						AI provider
					</Label>
					<Select value={selected} onValueChange={(v) => handleProviderChange(v as AIProviderId)}>
						<SelectTrigger id="ai-provider-select" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.values(AI_PROVIDERS).map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ai-model-select" className="text-xs text-ink-soft">
						Model
					</Label>
					{!useCustomModel ? (
						<Select
							value={selectedModel}
							onValueChange={(v) => {
								if (v === "__custom__") {
									setUseCustomModel(true);
								} else {
									setSelectedModel(v);
								}
								setTest({ status: "idle" });
							}}
						>
							<SelectTrigger id="ai-model-select" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{config.models.map((m) => (
									<SelectItem key={m} value={m}>
										{m}
									</SelectItem>
								))}
								{config.allowCustomModel && (
									<SelectItem value="__custom__">Custom model id…</SelectItem>
								)}
							</SelectContent>
						</Select>
					) : (
						<div className="flex items-center gap-2">
							<Input
								type="text"
								value={customModel}
								onChange={(e) => {
									setCustomModel(e.target.value);
									setTest({ status: "idle" });
								}}
								placeholder="e.g. anthropic/claude-opus-4.5"
								autoComplete="off"
								className="font-(family-name:--font-mono)"
							/>
							<button
								type="button"
								className="shrink-0 text-sm text-brand underline-offset-2 hover:underline"
								onClick={() => {
									setUseCustomModel(false);
									setCustomModel("");
								}}
							>
								use preset instead
							</button>
						</div>
					)}
					{config.hint && (
						<p className="font-(family-name:--font-readable) text-xs text-ink-soft">
							{config.hint}
						</p>
					)}
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ai-key-input" className="text-xs text-ink-soft">
						API key
					</Label>
					<Input
						id="ai-key-input"
						type="password"
						value={key}
						onChange={(e) => {
							setKey(e.target.value);
							setTest({ status: "idle" });
						}}
						placeholder={config.keyPrefix ? `${config.keyPrefix}...` : "paste key…"}
						autoComplete="off"
						className="font-(family-name:--font-mono)"
					/>
				</div>
				<p className="font-(family-name:--font-readable) text-xs leading-relaxed text-ink-soft">
					Stored only in this browser tab&apos;s session storage. Sent directly to {config.label} per request —
					never saved on our servers.{" "}
					<a href={config.keyUrl} target="_blank" rel="noreferrer" className="text-brand underline">
						Get a {config.label} key ↗
					</a>
				</p>

				<div className="flex items-center justify-between gap-2.5">
					<button
						type="button"
						className="text-sm text-brand underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50"
						disabled={!canSave || test.status === "testing"}
						onClick={handleTest}
					>
						{test.status === "testing" ? "Testing…" : "Test connection"}
					</button>
					<Button type="button" variant="brand" size="sm" disabled={!canSave} onClick={handleSave}>
						Save &amp; enable AI fixes
					</Button>
				</div>

				{test.status === "ok" && (
					<p className={cn("mt-[-2px] text-[12.5px]", "text-good")}>
						Key works — connected to {config.label}.
					</p>
				)}
				{test.status === "error" && (
					<p className="mt-[-2px] text-[12.5px] text-critical">{test.message}</p>
				)}
			</CardContent>
		</Card>
	);
}
