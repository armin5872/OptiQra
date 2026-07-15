import { NextRequest, NextResponse } from "next/server";
import { requestStop } from "@/lib/scanControl";

export const runtime = "nodejs";

// Soft-stops an in-progress site crawl: the crawler finishes whatever pages
// are already in flight, then immediately wraps up and streams back a report
// built from the pages it managed to scan, instead of erroring out or losing
// the work. This is deliberately a *separate* request from the streaming
// `/api/analyze` call — aborting that connection directly would kill the
// crawl before it gets a chance to send anything back.
export async function POST(req: NextRequest) {
	let scanId: unknown;
	try {
		({ scanId } = await req.json());
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	if (!scanId || typeof scanId !== "string") {
		return NextResponse.json({ error: "scanId is required" }, { status: 400 });
	}

	const found = requestStop(scanId);
	return NextResponse.json({ ok: found });
}
