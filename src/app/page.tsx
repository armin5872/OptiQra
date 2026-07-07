"use client";

import { useState, useEffect } from "react";

type ScanState = "hero" | "scanning" | "report";
type Category = {
	label: string;
	score: number;
	issues: any[];
	passed: any[];
	source: string;
};

export default function Home() {
	const [viewState, setViewState] = useState<ScanState>("hero");
	const [url, setUrl] = useState("");
	const [errorMsg, setErrorMsg] = useState("");
	const [activeStep, setActiveStep] = useState(0);
	const [reportData, setReportData] = useState<{
		url: string;
		categories: Record<string, Category>;
		lighthouseAvailable: boolean;
	} | null>(null);
	const [openPanel, setOpenPanel] = useState<string | null>(null);

	// Scanning animation logic
	useEffect(() => {
		let timeout: NodeJS.Timeout;
		if (viewState === "scanning") {
			const tick = (step: number) => {
				setActiveStep(step);
				if (step < 6) {
					timeout = setTimeout(() => tick(step + 1), 480);
				}
			};
			tick(0);
		}
		return () => clearTimeout(timeout);
	}, [viewState]);

	const runScan = async (e: React.FormEvent) => {
		e.preventDefault();
		setErrorMsg("");
		if (!url) return;

		const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
		setUrl(formattedUrl);
		setViewState("scanning");

		try {
			const res = await fetch("/api/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: formattedUrl }),
			});
			const data = await res.json();

			if (!res.ok)
				throw new Error(
					data.error || "Something went wrong running that scan.",
				);

			setReportData(data);
			setTimeout(() => setViewState("report"), 350);
		} catch (err: any) {
			setErrorMsg(err.message);
			setViewState("hero");
		}
	};

	const applyFix = (catKey: string, issueIdx: number) => {
		if (!reportData) return;
		const newData = { ...reportData };
		const issue = newData.categories[catKey].issues[issueIdx];
		if (!issue.resolved) {
			issue.resolved = true;
			newData.categories[catKey].score = Math.min(
				97,
				newData.categories[catKey].score + issue.weight,
			);
			setReportData(newData);
		}
	};

	const fixAll = () => {
		if (!reportData) return;
		const newData = { ...reportData };
		Object.keys(newData.categories).forEach((key) => {
			newData.categories[key].issues.forEach((iss) => (iss.resolved = true));
		});
		setReportData(newData);
	};

	const computeOverall = () => {
		if (!reportData) return 0;
		const keys = Object.keys(reportData.categories);
		const sum = keys.reduce((a, k) => a + reportData.categories[k].score, 0);
		return Math.round(sum / keys.length);
	};
	const scoreColorClass = (score: number) =>
		score >= 80 ? "score-good"
		: score >= 60 ? "score-warn"
		: "score-critical";

	const progressClass = (score: number) => {
		const bucket = Math.min(100, Math.max(0, Math.round(score / 10) * 10));
		return `progress-${bucket}`;
	};
	const overall = computeOverall();
	const allResolved =
		reportData ?
			Object.values(reportData.categories).every((c) =>
				c.issues.every((i) => i.resolved),
			)
		:	false;

	return (
		<div className="wrap">
			<header>
				<div className="brand">
					<span className="brand-mark">
						<svg width="14" height="14" viewBox="0 0 14 14">
							<path
								d="M1 7 L4 7 L5.5 2 L8 12 L9.5 7 L13 7"
								stroke="#fff"
								strokeWidth="1.4"
								fill="none"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					Site Vitals
				</div>
			</header>

			{viewState === "hero" && (
				<section className="hero">
					<p className="eyebrow">Diagnostic scan</p>
					<h1>Find out what's actually wrong with your website.</h1>
					<p className="sub">
						Paste a URL. We check your SEO, speed, accessibility, and conversion
						paths — then show you exactly what to fix.
					</p>
					<form className="intake" onSubmit={runScan}>
						<input
							type="text"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://yoursite.com"
							required
							aria-label="Website URL"
						/>
						<button type="submit">Run diagnostic →</button>
					</form>
					{errorMsg && (
						<p className="demo-note error-note show" role="alert">
							{errorMsg}
						</p>
					)}
				</section>
			)}

			{viewState === "scanning" && (
				<section className="scan active">
					<p className="scan-url">{url}</p>
					<p className="scan-title">Running diagnostic…</p>
					<ul className="steps">
						{[
							"Reading page structure",
							"Checking meta tags & schema",
							"Analyzing robots.txt & sitemaps",
							"Scanning security headers",
							"Measuring load & paint timing",
							"Auditing color contrast & ARIA",
							"Compiling full report",
						].map((stepText, i) => (
							<li
								key={i}
								className={`${
									activeStep === i ? "active"
									: activeStep > i ? "done"
									: ""
								}`}
							>
								<span className="dot"></span> {stepText}
							</li>
						))}
					</ul>
				</section>
			)}

			{viewState === "report" && reportData && (
				<section className="report active">
					<p className="report-url">{reportData.url}</p>
					<div className="report-top">
						<h2>Diagnostic report</h2>
						<button className="fix-all" onClick={fixAll} disabled={allResolved}>
							Mark everything resolved
						</button>
					</div>

					<div className="overall">
						<div
							className="score"
							style={{
								color:
									overall >= 80 ? "var(--good)"
									: overall >= 60 ? "var(--warn)"
									: "var(--critical)",
							}}
						>
							{overall}
							<span>/100</span>
						</div>
						<div className="meta">
							<div className="label">Overall vitals</div>
						</div>
					</div>

					<div className="cards">
						{Object.entries(reportData.categories).map(([key, cat]) => {
							const openIssues = cat.issues.filter((i) => !i.resolved).length;
							const color =
								cat.score >= 80 ? "var(--good)"
								: cat.score >= 60 ? "var(--warn)"
								: "var(--critical)";
							return (
								<div
									key={key}
									className="card"
									onClick={() => setOpenPanel(openPanel === key ? null : key)}
								>
									<div className="card-head">
										<div className="card-name">{cat.label}</div>
										<div className="card-score" style={{ color }}>
											{cat.score}
										</div>
									</div>
									<div className="card-count">
										{openIssues} open issue{openIssues === 1 ? "" : "s"}
									</div>
									<div className="card-bar">
										<div
											style={{ width: `${cat.score}%`, background: color }}
										></div>
									</div>
									<div className="card-source">
										{cat.source === "lighthouse" ?
											"Google Lighthouse"
										:	"Live HTML scan"}
									</div>
								</div>
							);
						})}
					</div>

					<div id="panels-container">
						{Object.entries(reportData.categories).map(([key, cat]) => (
							<div
								key={key}
								className={`panel ${openPanel === key ? "open" : ""}`}
							>
								{cat.issues.map((iss, idx) => (
									<div
										key={idx}
										className={`finding ${iss.resolved ? "resolved" : ""}`}
									>
										<span
											className={`sev-dot ${iss.resolved ? "sev-good" : `sev-${iss.severity}`}`}
										></span>
										<div className="finding-body">
											<div className="finding-title">{iss.title}</div>
											<div className="finding-detail">{iss.detail}</div>
											<div className="finding-fix">Fix: {iss.fix}</div>
										</div>
										<button
											className={`apply-btn ${iss.resolved ? "done" : ""}`}
											onClick={() => applyFix(key, idx)}
											disabled={iss.resolved}
										>
											{iss.resolved ? "Resolved" : "Mark resolved"}
										</button>
									</div>
								))}
							</div>
						))}
					</div>

					<div className="again">
						<button
							onClick={() => {
								setViewState("hero");
								setUrl("");
							}}
						>
							Run another scan
						</button>
					</div>
				</section>
			)}
		</div>
	);
}
