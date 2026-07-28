"use client";

import { useState } from "react";
import { usePageSpeedKey } from "@/lib/hooks/usePageSpeedKey";
import { PSI_KEY_INFO_URL } from "@/lib/pagespeed";

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

// Used only to verify a key/quota works — cheap, always-up, and not the
// site the person is actually trying to audit.
const TEST_URL = "https://www.google.com";

export default function PageSpeedSetup() {
	const { apiKey, strategy, isConfigured, hydrated, setApiKey, setStrategy, clear } = usePageSpeedKey();
	const [key, setKey] = useState(apiKey ?? "");
	const [open, setOpen] = useState(!isConfigured);
	const [test, setTest] = useState<TestState>({ status: "idle" });

	if (!hydrated) return null;

	const canSave = key.trim().length > 10;

	const handleTest = async () => {
		if (!canSave) return;
		setTest({ status: "testing" });
		try {
			const res = await fetch("/api/pagespeed", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: TEST_URL, apiKey: key.trim(), strategy }),
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
		setApiKey(key.trim());
		setOpen(false);
	};

	if (!open && isConfigured) {
		return (
			<div className="ai-setup-summary">
				<span>
					PageSpeed Insights: <strong>connected</strong>
					<span className="ai-setup-model-tag">{strategy}</span>
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
				<label htmlFor="psi-key-input">PageSpeed Insights API key</label>
				<input
					id="psi-key-input"
					type="password"
					value={key}
					onChange={(e) => {
						setKey(e.target.value);
						setTest({ status: "idle" });
					}}
					placeholder="paste key…"
					autoComplete="off"
				/>
			</div>

			<div className="ai-setup-row">
				<label htmlFor="psi-strategy-select">Test as</label>
				<select
					id="psi-strategy-select"
					value={strategy}
					onChange={(e) => setStrategy(e.target.value === "desktop" ? "desktop" : "mobile")}
				>
					<option value="mobile">Mobile</option>
					<option value="desktop">Desktop</option>
				</select>
			</div>

			<p className="ai-setup-hint">
				Saved in this browser only (IndexedDB), so you won&apos;t need to re-enter it next time. Sent directly to Google&apos;s PageSpeed
				Insights API per request — never saved on our servers.{" "}
				<a href={PSI_KEY_INFO_URL} target="_blank" rel="noreferrer">
					Get a free API key ↗
				</a>
			</p>

			<div className="ai-setup-actions">
				<button type="button" className="link-btn" disabled={!canSave || test.status === "testing"} onClick={handleTest}>
					{test.status === "testing" ? "Testing… (can take up to 15s)" : "Test connection"}
				</button>
				<button type="button" className="apply-btn" disabled={!canSave} onClick={handleSave}>
					Save &amp; enable Core Web Vitals
				</button>
			</div>

			{test.status === "ok" && <p className="ai-setup-test ok">Key works — connected to PageSpeed Insights.</p>}
			{test.status === "error" && <p className="ai-setup-test error">{test.message}</p>}
		</div>
	);
}
