"use client";

import { useEffect, useState } from "react";
import {
	getLastStorageFailure,
	subscribeToStorageFailures,
	clearStorageFailure,
	type StorageFailure,
} from "@/lib/storageHealth";
import { clearScans } from "@/lib/scanStore";
import { clearScanCookies } from "@/lib/scanCookies";

/**
 * Every store (settings, AI provider key, PageSpeed key, scan history,
 * custom rules, schedules) reports failures here via storageHealth.ts
 * instead of swallowing them. This banner is the one place that surfaces
 * it — so instead of "my settings silently reverted to default", the
 * person sees "your browser couldn't save that, here's likely why" and,
 * for the most common cause (storage quota), a one-click fix.
 */
export default function StorageWarningBanner() {
	const [failure, setFailure] = useState<StorageFailure | null>(() => getLastStorageFailure());
	const [dismissed, setDismissed] = useState(false);
	const [freeing, setFreeing] = useState(false);
	const [freed, setFreed] = useState(false);

	useEffect(() => {
		return subscribeToStorageFailures(() => {
			setFailure(getLastStorageFailure());
			setDismissed(false);
			setFreed(false);
		});
	}, []);

	if (!failure || dismissed) return null;

	async function freeUpSpace() {
		setFreeing(true);
		try {
			await clearScans();
			clearScanCookies();
			clearStorageFailure();
			setFreed(true);
		} catch (err) {
			console.error("[storage] couldn't clear scan history to free space:", err);
		} finally {
			setFreeing(false);
		}
	}

	return (
		<div className="storage-warning-banner" role="alert">
			<div className="storage-warning-banner-text">
				<span className="storage-warning-banner-icon" aria-hidden>
					⚠️
				</span>
				<div>
					<p className="storage-warning-banner-title">
						{failure.likelyQuotaExceeded
							? "Your browser's local storage is full"
							: "Your browser blocked local storage"}
					</p>
					<p className="storage-warning-banner-sub">
						{failure.likelyQuotaExceeded ?
							"New scans, settings changes, and API keys can't be saved right now. Clearing old scan history usually fixes this."
						:	"Settings, API keys, and scan history won't persist across reloads. This is common in private/incognito windows or when a browser setting blocks site storage."
						}
					</p>
				</div>
			</div>
			<div className="storage-warning-banner-actions">
				{failure.likelyQuotaExceeded && (
					<button
						type="button"
						className="apply-btn"
						onClick={freeUpSpace}
						disabled={freeing || freed}
					>
						{freed ? "Space freed ✓"
						: freeing ? "Clearing…"
						: "Clear old scan history"}
					</button>
				)}
				<button
					type="button"
					className="storage-warning-dismiss"
					onClick={() => setDismissed(true)}
					aria-label="Dismiss"
				>
					✕
				</button>
			</div>
		</div>
	);
}
