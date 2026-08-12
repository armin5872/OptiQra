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
	CUSTOM_INTERVAL_UNITS,
	WEEKDAY_LABELS,
	CUSTOM_INTERVAL_MIN_MINUTES,
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
	const [customValue, setCustomValue] = useState(6);
	const [customUnit, setCustomUnit] = useState<(typeof CUSTOM_INTERVAL_UNITS)[number]["id"]>("hours");
	const [useTimeOfDay, setUseTimeOfDay] = useState(false);
	const [timeOfDay, setTimeOfDay] = useState("09:00");
	const [selectedDays, setSelectedDays] = useState<number[]>([]);
	const [compareWithPrevious, setCompareWithPrevious] = useState(true);
	const [notify, setNotify] = useState(true);
	const [predictiveAlerts, setPredictiveAlerts] = useState(true);
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState("");

	useEffect(() => {
		setTargetUrl(url ?? "");
		setTargetMode(mode ?? "single");
	}, [url, mode]);

	const showsTimeOfDay =
		frequency === "daily" ||
		frequency === "weekly" ||
		frequency === "monthly" ||
		frequency === "yearly" ||
		(frequency === "custom" && (customUnit === "days" || customUnit === "weeks"));
	const showsDaysOfWeek = frequency === "weekly" || (frequency === "custom" && customUnit === "weeks");

	const toggleDay = (day: number) => {
		setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
	};

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

		// A periodicsync-triggered run inside the service worker has no
		// `window` to dispatch to, so it posts a message to open tabs instead
		// (see the `finally` block in scheduler.ts's runSchedule).
		const onSWMessage = (e: MessageEvent) => {
			if (e.data?.type === "optiqra:schedules-updated") refresh();
		};
		navigator.serviceWorker?.addEventListener("message", onSWMessage);

		return () => {
			window.removeEventListener("optiqra:schedules-updated", onUpdate);
			navigator.serviceWorker?.removeEventListener("message", onSWMessage);
		};
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
		if (frequency === "custom" && (!customValue || customValue < 1)) {
			setFormError("Enter a custom interval greater than 0.");
			return;
		}
		setSaving(true);
		try {
			const now = Date.now();
			const unitMinutes = CUSTOM_INTERVAL_UNITS.find((u) => u.id === customUnit)?.minutes ?? 60;
			const customIntervalMinutes =
				frequency === "custom"
					? Math.max(CUSTOM_INTERVAL_MIN_MINUTES, Math.round(customValue * unitMinutes))
					: undefined;
			const schedule: ScanSchedule = {
				id: crypto.randomUUID(),
				url: formattedUrl,
				mode: targetMode,
				maxPages: targetMode === "site" ? maxPages ?? 50 : undefined,
				frequency,
				customIntervalMinutes,
				timeOfDay: showsTimeOfDay && useTimeOfDay ? timeOfDay : undefined,
				daysOfWeek: showsDaysOfWeek && selectedDays.length > 0 ? selectedDays : undefined,
				compareWithPrevious,
				notify,
				predictiveAlerts,
				enabled: true,
				createdAt: now,
				nextRunAt: computeNextRun(
					{
						frequency,
						customIntervalMinutes,
						timeOfDay: showsTimeOfDay && useTimeOfDay ? timeOfDay : undefined,
						daysOfWeek: showsDaysOfWeek && selectedDays.length > 0 ? selectedDays : undefined,
					},
					now,
				),
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

	const handleApplySuggestedFrequency = async (schedule: ScanSchedule) => {
		const suggested = schedule.lastResult?.suggestedFrequency;
		if (!suggested) return;
		const now = Date.now();
		await updateSchedule(schedule.id, {
			frequency: suggested,
			nextRunAt: computeNextRun(suggested, now),
		});
		refresh();
	};

	const trendBadge = (schedule: ScanSchedule) => {
		const r = schedule.lastResult;
		if (!r || !r.ok || !r.trendDirection) return null;
		const arrow = r.trendDirection === "up" ? "↗" : r.trendDirection === "down" ? "↘" : "→";
		const tone =
			r.trendDirection === "down" ? "schedule-badge-bad" : r.trendDirection === "up" ? "schedule-badge-good" : "schedule-badge-neutral";
		return (
			<span
				className={`schedule-badge ${tone}`}
				title={`Projected ~${r.predictedScore14d}/100 in two weeks if this trend holds`}
			>
				{arrow} trend · ~{r.predictedScore14d}/100 in 14d
				{r.chronicIssueCount ? ` · ${r.chronicIssueCount} recurring issue${r.chronicIssueCount === 1 ? "" : "s"}` : ""}
			</span>
		);
	};

	const frequencyLabel = (f: ScanFrequency) =>
		FREQUENCY_OPTIONS.find((o) => o.id === f)?.label ?? f;

	/** Human-readable cadence for a saved schedule — e.g. "Every 6 hours",
	 *  "Weekly, Mon + Thu at 09:00", "Monthly at 03:00". Falls back to the
	 *  plain frequency label when no custom interval/time/days were set. */
	const describeSchedule = (s: ScanSchedule) => {
		let base: string;
		if (s.frequency === "custom" && s.customIntervalMinutes) {
			const m = s.customIntervalMinutes;
			if (m % (60 * 24 * 7) === 0 && m >= 60 * 24 * 7) base = `Every ${m / (60 * 24 * 7)} week${m / (60 * 24 * 7) === 1 ? "" : "s"}`;
			else if (m % (60 * 24) === 0 && m >= 60 * 24) base = `Every ${m / (60 * 24)} day${m / (60 * 24) === 1 ? "" : "s"}`;
			else if (m % 60 === 0) base = `Every ${m / 60} hour${m / 60 === 1 ? "" : "s"}`;
			else base = `Every ${m} min`;
		} else {
			base = frequencyLabel(s.frequency);
		}
		if (s.daysOfWeek && s.daysOfWeek.length > 0) {
			base += ` (${s.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(", ")})`;
		}
		if (s.timeOfDay) base += ` at ${s.timeOfDay}`;
		return base;
	};

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

						{frequency === "custom" && (
							<div className="schedule-custom-interval-row">
								<span>Every</span>
								<input
									type="number"
									min={customUnit === "minutes" ? CUSTOM_INTERVAL_MIN_MINUTES : 1}
									value={customValue}
									onChange={(e) => setCustomValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
									className="schedule-custom-interval-value"
									aria-label="Custom interval amount"
								/>
								<select
									value={customUnit}
									onChange={(e) => setCustomUnit(e.target.value as typeof customUnit)}
									aria-label="Custom interval unit"
								>
									{CUSTOM_INTERVAL_UNITS.map((u) => (
										<option key={u.id} value={u.id}>
											{u.label}
										</option>
									))}
								</select>
							</div>
						)}

						{showsDaysOfWeek && (
							<div className="schedule-weekday-picker" role="group" aria-label="Days to run on">
								{WEEKDAY_LABELS.map((label, i) => (
									<button
										type="button"
										key={label}
										className={selectedDays.includes(i) ? "active" : ""}
										onClick={() => toggleDay(i)}
									>
										{label}
									</button>
								))}
								<p className="schedule-note">
									{selectedDays.length === 0
										? "No specific days picked — runs on the same weekday it was created."
										: `Runs on: ${selectedDays.map((d) => WEEKDAY_LABELS[d]).join(", ")}.`}
								</p>
							</div>
						)}

						{showsTimeOfDay && (
							<label className="schedule-checkbox-row">
								<input
									type="checkbox"
									checked={useTimeOfDay}
									onChange={(e) => setUseTimeOfDay(e.target.checked)}
								/>
								Run at a specific time
								{useTimeOfDay && (
									<input
										type="time"
										value={timeOfDay}
										onChange={(e) => setTimeOfDay(e.target.value)}
										className="schedule-time-input"
										aria-label="Time of day to run"
									/>
								)}
							</label>
						)}

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

						<label className="schedule-checkbox-row">
							<input
								type="checkbox"
								checked={predictiveAlerts}
								onChange={(e) => setPredictiveAlerts(e.target.checked)}
							/>
							Predictive alerts — heads-up notification if the score trend is
							declining or an issue keeps recurring, separate from the per-run summary
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
												{s.mode === "site" ? "Whole site" : "Single page"} · {describeSchedule(s)}
												{" · "}
												{s.enabled ?
													`next: ${new Date(s.nextRunAt).toLocaleString()}`
												:	"paused"}
											</span>
											<div className="schedule-item-result">
												{resultBadge(s)}
												{trendBadge(s)}
											</div>
											{s.lastResult?.suggestedFrequency && (
												<p className="schedule-note schedule-note-suggestion">
													{s.lastResult.suggestedFrequencyReason}{" "}
													<button type="button" className="link-btn" onClick={() => handleApplySuggestedFrequency(s)}>
														Switch to {frequencyLabel(s.lastResult.suggestedFrequency)}
													</button>
												</p>
											)}
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
