"use client";

import { useState } from "react";
import { buildRobotsTxt, buildSitemapXml } from "@/lib/generateCrawlFiles";
import { downloadText } from "@/lib/reportExport/download";

interface Props {
	kind: "sitemap" | "robots";
	siteUrl: string;
	pagesScanned?: string[];
}

const COPY = {
	sitemap: {
		icon: "🗺️",
		title: "Your site doesn't seem to have a sitemap",
		detail:
			"We couldn't find an XML sitemap. We can generate one from the pages we just scanned.",
		action: "Generate sitemap.xml",
		filename: "sitemap.xml",
		mime: "application/xml",
		path: "/sitemap.xml",
	},
	robots: {
		icon: "🤖",
		title: "Your site doesn't seem to have a robots.txt",
		detail:
			"No robots.txt was found at the site root. We can generate a sensible default.",
		action: "Generate robots.txt",
		filename: "robots.txt",
		mime: "text/plain",
		path: "/robots.txt",
	},
} as const;

export default function MissingFileBanner({ kind, siteUrl, pagesScanned }: Props) {
	const [dismissed, setDismissed] = useState(false);
	const [generated, setGenerated] = useState(false);
	const copy = COPY[kind];

	if (dismissed) return null;

	const handleGenerate = () => {
		const content =
			kind === "sitemap" ? buildSitemapXml(siteUrl, pagesScanned) : buildRobotsTxt(siteUrl);
		downloadText(content, copy.filename, copy.mime);
		setGenerated(true);
	};

	return (
		<div className="missing-file-banner">
			<span className="missing-file-banner-icon" aria-hidden="true">
				{copy.icon}
			</span>
			<div className="missing-file-banner-body">
				<div className="missing-file-banner-title">{copy.title}</div>
				<div className="missing-file-banner-detail">{copy.detail}</div>
				<div className="missing-file-banner-actions">
					<button
						type="button"
						className={`missing-file-banner-generate${generated ? " done" : ""}`}
						onClick={handleGenerate}
					>
						{generated ? "Downloaded ✓ Generate again" : copy.action}
					</button>
					{generated && (
						<span className="missing-file-banner-hint">
							Upload it to your site root as {copy.path}
						</span>
					)}
				</div>
			</div>
			<button
				type="button"
				className="missing-file-banner-dismiss"
				aria-label={`Dismiss ${kind} suggestion`}
				onClick={() => setDismissed(true)}
			>
				✕
			</button>
		</div>
	);
}
