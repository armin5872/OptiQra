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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from "@/components/ui/dialog";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
		refresh();
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
		if (!r) return <Badge variant="secondary">Not run yet</Badge>;
		if (!r.ok)
			return (
				<Badge variant="critical" title={r.error}>
					Last run failed
				</Badge>
			);
		if (r.scoreDelta === undefined)
			return <Badge variant="secondary">Scored {r.overallScore}/100</Badge>;
		if (r.scoreDelta === 0 && !r.newIssueCount && !r.resolvedIssueCount)
			return <Badge variant="secondary">No change</Badge>;
		return (
			<Badge variant={r.scoreDelta >= 0 ? "good" : "critical"}>
				{r.scoreDelta > 0 ? "+" : ""}
				{r.scoreDelta} score
				{r.newIssueCount ? ` · ${r.newIssueCount} new issue${r.newIssueCount === 1 ? "" : "s"}` : ""}
				{r.resolvedIssueCount ? ` · ${r.resolvedIssueCount} resolved` : ""}
			</Badge>
		);
	};

	return (
		<>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="dialog"
				aria-expanded={open}
				className="gap-1.5"
			>
				<Clock className="size-3.5" />
				{url ? "Schedule this scan" : "Scheduled scans"}
				{schedules.some((s) => s.enabled) && (
					<Badge variant="secondary" className="ml-0.5">
						{schedules.filter((s) => s.enabled).length}
					</Badge>
				)}
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-lg" aria-label="Periodic scans">
					<DialogHeader>
						<DialogTitle>Scheduled scans</DialogTitle>
					</DialogHeader>
					<DialogBody className="flex flex-col gap-5">
						<div className="flex flex-col gap-3">
							<p className="text-sm font-semibold text-ink">New periodic scan</p>
							{!url && (
								<Input
									type="text"
									value={targetUrl}
									onChange={(e) => setTargetUrl(e.target.value)}
									placeholder="https://yoursite.com"
									aria-label="Website URL to schedule"
								/>
							)}
							{url && (
								<p className="truncate font-(family-name:--font-mono) text-sm text-ink-soft">
									{url}
								</p>
							)}

							{!mode && (
								<Tabs
									value={targetMode}
									onValueChange={(v) => setTargetMode(v as "single" | "site")}
								>
									<TabsList aria-label="Scan mode">
										<TabsTrigger value="single">Single page</TabsTrigger>
										<TabsTrigger value="site">Whole site</TabsTrigger>
									</TabsList>
								</Tabs>
							)}

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="schedule-frequency" className="text-xs text-ink-soft">
									Run
								</Label>
								<Select
									value={frequency}
									onValueChange={(v) => setFrequency(v as ScanFrequency)}
								>
									<SelectTrigger id="schedule-frequency" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{FREQUENCY_OPTIONS.map((f) => (
											<SelectItem key={f.id} value={f.id}>
												{f.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<label className="flex items-center gap-2.5 text-sm text-ink-soft">
								<Switch
									checked={compareWithPrevious}
									onCheckedChange={setCompareWithPrevious}
								/>
								Compare against the previous scan each time
							</label>

							<label className="flex items-center gap-2.5 text-sm text-ink-soft">
								<Switch checked={notify} onCheckedChange={setNotify} />
								Notify me when a scan finishes
							</label>

							{notify && permission === "denied" && (
								<p className="text-xs text-warn">
									Notifications are blocked in this browser — enable them in your browser's site
									settings to get alerts.
								</p>
							)}
							{notify && permission === "default" && (
								<button
									type="button"
									className="self-start text-sm text-brand underline-offset-2 hover:underline"
									onClick={enableNotifications}
								>
									Enable browser notifications
								</button>
							)}

							{formError && <p className="text-xs text-critical">{formError}</p>}

							<Button
								type="button"
								variant="brand"
								onClick={createSchedule}
								disabled={saving}
							>
								{saving ? "Saving…" : "Create schedule"}
							</Button>

							<p className="text-xs text-ink-soft">
								Runs in the background while OptiQra is open in a tab (or installed as an app) —
								no need to keep this page in view.
							</p>
						</div>

						{loaded && schedules.length > 0 && (
							<>
								<Separator />
								<div className="flex flex-col gap-3">
									<p className="text-sm font-semibold text-ink">Active schedules</p>
									<ul className="flex flex-col gap-2">
										{schedules.map((s) => (
											<li
												key={s.id}
												className={cn(
													"flex items-start justify-between gap-3 rounded-(--radius) border border-line bg-card p-3",
													!s.enabled && "opacity-60",
												)}
											>
												<div className="flex min-w-0 flex-col gap-1">
													<span className="truncate text-sm font-medium text-ink">
														{s.url}
													</span>
													<span className="text-xs text-ink-soft">
														{s.mode === "site" ? "Whole site" : "Single page"} · {frequencyLabel(s.frequency)}
														{" · "}
														{s.enabled ?
															`next: ${new Date(s.nextRunAt).toLocaleString()}`
														:	"paused"}
													</span>
													<div>{resultBadge(s)}</div>
												</div>
												<div className="flex shrink-0 items-center gap-1.5">
													<button
														type="button"
														className="text-xs text-brand underline-offset-2 hover:underline"
														onClick={() => runNow(s)}
														title="Run now"
													>
														Run now
													</button>
													<button
														type="button"
														className="text-xs text-brand underline-offset-2 hover:underline"
														onClick={() => toggleEnabled(s)}
													>
														{s.enabled ? "Pause" : "Resume"}
													</button>
													<button
														type="button"
														className="flex size-5 items-center justify-center rounded text-ink-soft hover:bg-secondary hover:text-critical"
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
							</>
						)}
					</DialogBody>
				</DialogContent>
			</Dialog>
		</>
	);
}
