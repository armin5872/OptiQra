"use client";

import { useEffect, useRef, useState } from "react";
import {
	getAllSchedules,
	saveSchedule,
	deleteSchedule as deleteStoredSchedule,
	updateSchedule,
	type ScanSchedule,
	type ScanFrequency,
} from "@/lib/scheduleStore";
import {
	FREQUENCY_OPTIONS,
	computeNextRun,
	startScheduler,
	runDueSchedules,
} from "@/lib/scheduler";
import {
	getNotificationPermission,
	requestNotificationPermission,
	type NotificationPermissionState,
} from "@/lib/notifications";

type Props = {
	/** Pre-fills the "new schedule" form with the scan currently on screen.
	 * Omit to show a general-purpose manager where the user picks a URL. */
	url?: string;
	mode?: "single" | "site";
	maxPages?: number;
};

export default function ScheduleManager({ url, mode, maxPages }: Props) {
	const [open, setOpen] = useState(false);
	const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [permission, setPermission] = useState<NotificationPermissionState>("default");
	const panelRef = useRef<HTMLDivElement>(null);

	const [targetUrl, setTargetUrl] = useState(url ?? "");
	const [targetMode, setTargetMode] = useState<"single" | "site">(mode ?? "single");
	const [frequency, setFrequency] = useState<ScanFrequency>("weekly");
	const [compareWithPrevious, setCompareWithPrevious] = useState(true);
	const [notify, setNotify] = useState(true);
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState("");

	useEffect(() => {
		setTargetUrl(url ?? "");
		setTargetMode(mode ?? "single");
	}, [url, mode]);

	const refresh = () => {
		getAllSchedules()
			.then(setSchedules)
			.catch(() => setSchedules([]))
			.finally(() => setLoaded(true));
	};

	useEffect(() => {
		// The checker only needs to be started once app-wide, but calling it
		// again is a no-op, so it's cheapest to just do it wherever the
		// schedule UI first mounts.
		startScheduler();
		setPermission(getNotificationPermission());
		refresh();

		const onUpdate = () => refresh();
		window.addEventListener("optiqra:schedules-updated", onUpdate);
		return () => window.removeEventListener("optiqra:schedules-updated", onUpdate);
	}, []);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		refresh();
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const enableNotifications = async () => {
		const result = await requestNotificationPermission();
		setPermission(result);
	};

	const createSchedule = async () => {
		setFormError("");
		const formattedUrl =
			targetUrl && !/^https?:\/\//i.test(targetUrl) ? `https://${targetUrl}` : targetUrl;
		if (!formattedUrl) {
			setFormError("Enter a URL to schedule.");
			return;
		}
		setSaving(true);
		try {
			const now = Date.now();
			const schedule: ScanSchedule = {
				id: crypto.randomUUID(),
				url: formattedUrl,
				mode: targetMode,
				maxPages: targetMode === "site" ? maxPages ?? 50 : undefined,
				frequency,
				compareWithPrevious,
				notify,
				enabled: true,
				createdAt: now,
				nextRunAt: computeNextRun(frequency, now),
			};
			await saveSchedule(schedule);
			if (notify && permission === "default") await enableNotifications();
			refresh();
		} catch (err) {
			console.warn("Couldn't save schedule:", err);
			setFormError("Couldn't save that schedule — try again.");
		} finally {
			setSaving(false);
		}
	};

	const toggleEnabled = async (schedule: ScanSchedule) => {
		await updateSchedule(schedule.id, { enabled: !schedule.enabled });
		refresh();
	};

	const removeSchedule = async (id: string) => {
		await deleteStoredSchedule(id);
		refresh();
	};

	const runNow = async (schedule: ScanSchedule) => {
		await updateSchedule(schedule.id, { nextRunAt: Date.now() });
		refresh();
		runDueSchedules().catch(() => {});
	};

	const frequencyLabel = (f: ScanFrequency) =>
		FREQUENCY_OPTIONS.find((o) => o.id === f)?.label ?? f;

	const resultBadge = (schedule: ScanSchedule) => {
		const r = schedule.lastResult;
		if (!r) return <span className="schedule-badge schedule-badge-pending">Not run yet</span>;
		if (!r.ok)
			return (
				<span className="schedule-badge schedule-badge-error" title={r.error}>
					Last run failed
				</span>
			);
		if (r.scoreDelta === undefined)
			return <span className="schedule-badge">Scored {r.overallScore}/100</span>;
		if (r.scoreDelta === 0 && !r.newIssueCount && !r.resolvedIssueCount)
			return <span className="schedule-badge schedule-badge-neutral">No change</span>;
		return (
			<span
				className={`schedule-badge ${r.scoreDelta >= 0 ? "schedule-badge-good" : "schedule-badge-bad"}`}
			>
				{r.scoreDelta > 0 ? "+" : ""}
				{r.scoreDelta} score
				{r.newIssueCount ? ` · ${r.newIssueCount} new issue${r.newIssueCount === 1 ? "" : "s"}` : ""}
				{r.resolvedIssueCount ? ` · ${r.resolvedIssueCount} resolved` : ""}
			</span>
		);
	};

	return (
		<div className="schedule-manager" ref={panelRef}>
			<button
				type="button"
				className="schedule-manager-btn"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="dialog"
				aria-expanded={open}
			>
				⏱ {url ? "Schedule this scan" : "Scheduled scans"}
				{schedules.some((s) => s.enabled) && (
					<span className="schedule-manager-count">
						{schedules.filter((s) => s.enabled).length}
					</span>
				)}
			</button>

			{open && (
				<div className="schedule-panel" role="dialog" aria-label="Periodic scans">
					<div className="schedule-panel-section">
						<p className="schedule-panel-title">New periodic scan</p>
						{!url && (
							<input
								type="text"
								className="schedule-url-input"
								value={targetUrl}
								onChange={(e) => setTargetUrl(e.target.value)}
								placeholder="https://yoursite.com"
								aria-label="Website URL to schedule"
							/>
						)}
						{url && <p className="schedule-panel-url">{url}</p>}

						{!mode && (
							<div className="schedule-mode-toggle" role="radiogroup" aria-label="Scan mode">
								<button
									type="button"
									className={targetMode === "single" ? "active" : ""}
									onClick={() => setTargetMode("single")}
								>
									Single page
								</button>
								<button
									type="button"
									className={targetMode === "site" ? "active" : ""}
									onClick={() => setTargetMode("site")}
								>
									Whole site
								</button>
							</div>
						)}

						<label className="schedule-field-label" htmlFor="schedule-frequency">
							Run
						</label>
						<select
							id="schedule-frequency"
							value={frequency}
							onChange={(e) => setFrequency(e.target.value as ScanFrequency)}
							className="schedule-frequency-select"
						>
							{FREQUENCY_OPTIONS.map((f) => (
								<option key={f.id} value={f.id}>
									{f.label}
								</option>
							))}
						</select>

						<label className="schedule-checkbox-row">
							<input
								type="checkbox"
								checked={compareWithPrevious}
								onChange={(e) => setCompareWithPrevious(e.target.checked)}
							/>
							Compare against the previous scan each time
						</label>

						<label className="schedule-checkbox-row">
							<input
								type="checkbox"
								checked={notify}
								onChange={(e) => setNotify(e.target.checked)}
							/>
							Notify me when a scan finishes
						</label>

						{notify && permission === "denied" && (
							<p className="schedule-note schedule-note-warn">
								Notifications are blocked in this browser — enable them in your browser's site
								settings to get alerts.
							</p>
						)}
						{notify && permission === "default" && (
							<button type="button" className="schedule-enable-notif" onClick={enableNotifications}>
								Enable browser notifications
							</button>
						)}

						{formError && <p className="schedule-note schedule-note-error">{formError}</p>}

						<button
							type="button"
							className="schedule-create-btn"
							onClick={createSchedule}
							disabled={saving}
						>
							{saving ? "Saving…" : "Create schedule"}
						</button>

						<p className="schedule-note">
							Runs in the background while OptiQra is open in a tab (or installed as an app) —
							no need to keep this page in view.
						</p>
					</div>

					{loaded && schedules.length > 0 && (
						<div className="schedule-panel-section schedule-list-section">
							<p className="schedule-panel-title">Active schedules</p>
							<ul className="schedule-list">
								{schedules.map((s) => (
									<li key={s.id} className={`schedule-item ${s.enabled ? "" : "schedule-item-paused"}`}>
										<div className="schedule-item-main">
											<span className="schedule-item-url">{s.url}</span>
											<span className="schedule-item-meta">
												{s.mode === "site" ? "Whole site" : "Single page"} · {frequencyLabel(s.frequency)}
												{" · "}
												{s.enabled ?
													`next: ${new Date(s.nextRunAt).toLocaleString()}`
												:	"paused"}
											</span>
											<div className="schedule-item-result">{resultBadge(s)}</div>
										</div>
										<div className="schedule-item-actions">
											<button type="button" onClick={() => runNow(s)} title="Run now">
												Run now
											</button>
											<button type="button" onClick={() => toggleEnabled(s)}>
												{s.enabled ? "Pause" : "Resume"}
											</button>
											<button
												type="button"
												className="schedule-item-delete"
												onClick={() => removeSchedule(s.id)}
												aria-label={`Delete schedule for ${s.url}`}
											>
												×
											</button>
										</div>
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
