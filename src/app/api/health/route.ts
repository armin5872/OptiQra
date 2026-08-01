import { NextResponse } from "next/server";

// Used by server/index.ts (the Tauri sidecar entrypoint) to detect when
// this Next server is actually accepting requests before it starts the
// scheduler daemon — starting the daemon too early would mean the first
// due schedule's /api/analyze call fails before the server has bound to
// its port. Nothing web-app-specific happens here.
export async function GET() {
	return NextResponse.json({ ok: true });
}
