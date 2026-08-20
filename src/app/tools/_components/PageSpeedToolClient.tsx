"use client";

import { useState } from "react";
import PageSpeedSetup from "@/app/components/PageSpeedSetup";
import CoreWebVitalsPanel from "@/app/components/CoreWebVitalsPanel";
import ShareReport from "@/app/components/ShareReport";
import GetBadge from "@/app/components/GetBadge";
import { pagespeedShareCopy, toolBadgeIntro } from "@/lib/shareMessages";

export default function PageSpeedToolClient() {
	const [url, setUrl] = useState("");
	const [submittedUrl, setSubmittedUrl] = useState("");

	const go = () => {
		if (!url.trim()) return;
		const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
		setSubmittedUrl(normalized);
	};

	return (
		<div className="tool-panel">
			<PageSpeedSetup />
			<div className="tool-input-row" style={{ marginTop: 16 }}>
				<input
					className="tool-url-input"
					type="text"
					inputMode="url"
					placeholder="https://example.com"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && go()}
				/>
				<button type="button" className="tool-run-btn" onClick={go} disabled={!url.trim()}>
					Set URL
				</button>
			</div>
			{submittedUrl && (
				<div style={{ marginTop: 16 }}>
					<CoreWebVitalsPanel key={submittedUrl} url={submittedUrl} />
					<div className="tool-share-bar">
						<ShareReport
							{...pagespeedShareCopy({ url: submittedUrl })}
							buttonLabel="Share result"
							shareTitle="My Core Web Vitals result"
						/>
						<GetBadge intro={toolBadgeIntro("Core Web Vitals Checker")} />
					</div>
				</div>
			)}
		</div>
	);
}
