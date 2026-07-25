"use client";

import { useState } from "react";
import { buildRobotsTxt, buildSitemapXml } from "@/lib/generateCrawlFiles";
import { downloadText } from "@/lib/reportExport/download";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
		<div className="flex items-start gap-3 rounded-(--radius) border border-warn/30 bg-warn-bg p-4">
			<span className="text-xl" aria-hidden="true">
				{copy.icon}
			</span>
			<div className="flex flex-1 flex-col gap-2">
				<div className="text-sm font-semibold text-ink">{copy.title}</div>
				<div className="text-sm text-ink-soft">{copy.detail}</div>
				<div className="flex flex-wrap items-center gap-3">
					<Button
						type="button"
						size="sm"
						variant={generated ? "secondary" : "brand"}
						onClick={handleGenerate}
					>
						{generated ? "Downloaded ✓ Generate again" : copy.action}
					</Button>
					{generated && (
						<span className="text-xs text-ink-soft">
							Upload it to your site root as {copy.path}
						</span>
					)}
				</div>
			</div>
			<button
				type="button"
				className={cn(
					"flex size-6 shrink-0 items-center justify-center rounded text-ink-soft hover:bg-secondary hover:text-ink",
				)}
				aria-label={`Dismiss ${kind} suggestion`}
				onClick={() => setDismissed(true)}
			>
				✕
			</button>
		</div>
	);
}

