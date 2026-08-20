import { notFound } from "next/navigation";
import { TOOLS, getTool } from "@/lib/toolsRegistry";
import ToolShell from "../_components/ToolShell";
import AuditToolClient from "../_components/AuditToolClient";
import GeneratorToolClient from "../_components/GeneratorToolClient";
import PageSpeedToolClient from "../_components/PageSpeedToolClient";
import AiToolClient from "../_components/AiToolClient";

export function generateStaticParams() {
	return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const tool = getTool(slug);
	if (!tool) return {};
	const url = `https://optiqra.vercel.app/tools/${tool.slug}`;
	const title = `${tool.name} — Free, No Signup | OptiQra`;
	return {
		title,
		description: tool.description,
		alternates: { canonical: url },
		category: tool.category,
		keywords: [tool.name, tool.shortName, tool.category, "SEO tool", "free SEO tool", "OptiQra"],
		robots: { index: true, follow: true },
		openGraph: {
			title,
			description: tool.tagline,
			url,
			siteName: "OptiQra",
			type: "website",
		},
		twitter: {
			card: "summary",
			title,
			description: tool.tagline,
		},
	};
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const tool = getTool(slug);
	if (!tool) notFound();

	const url = `https://optiqra.vercel.app/tools/${tool.slug}`;
	const jsonLd = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "SoftwareApplication",
				name: tool.name,
				url,
				description: tool.description,
				applicationCategory: "SEO Application",
				operatingSystem: "Any (web-based)",
				offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
				isPartOf: {
					"@type": "WebApplication",
					name: "OptiQra",
					url: "https://optiqra.vercel.app/",
				},
			},
			{
				"@type": "BreadcrumbList",
				itemListElement: [
					{ "@type": "ListItem", position: 1, name: "OptiQra", item: "https://optiqra.vercel.app/" },
					{ "@type": "ListItem", position: 2, name: "Tools", item: "https://optiqra.vercel.app/tools" },
					{ "@type": "ListItem", position: 3, name: tool.shortName, item: url },
				],
			},
		],
	};

	return (
		<ToolShell tool={tool}>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

			{tool.byok && (
				<div className="tool-byok-note">
					🔑 Bring your own API key — {tool.byok === "ai" ? "sent directly to the AI provider you choose" : "sent directly to Google PageSpeed Insights"}. OptiQra&apos;s servers never see or store it.
				</div>
			)}

			<p className="tool-description">{tool.description}</p>

			{tool.engine === "audit" && <AuditToolClient tool={tool} />}
			{tool.engine === "generator" && <GeneratorToolClient tool={tool} />}
			{tool.engine === "pagespeed" && <PageSpeedToolClient />}
			{tool.engine === "ai" && <AiToolClient tool={tool} />}
		</ToolShell>
	);
}
