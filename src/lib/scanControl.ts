// lib/scanControl.ts
// Lightweight in-memory registry that lets the `/api/analyze/stop` endpoint
// signal a still-running site crawl (streaming via `/api/analyze`) to stop
// dispatching new page fetches and wrap up with whatever it already has,
// without tearing down the NDJSON connection the way aborting the fetch
// would. Single-process only — fine for this app's deployment model, same
// assumption the rest of the in-memory stores (scanStore, scheduleStore)
// already make.

export interface ScanControl {
	stopRequested: boolean;
}

const scans = new Map<string, ScanControl>();

export function registerScan(id: string): ScanControl {
	const control: ScanControl = { stopRequested: false };
	scans.set(id, control);
	return control;
}

export function requestStop(id: string): boolean {
	const control = scans.get(id);
	if (!control) return false;
	control.stopRequested = true;
	return true;
}

export function getScanControl(id: string): ScanControl | undefined {
	return scans.get(id);
}

export function unregisterScan(id: string): void {
	scans.delete(id);
}
