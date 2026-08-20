import type { Metadata } from "next";
import { TOOLS } from "@/lib/toolsRegistry";
import ToolsIndexClient from "./_components/ToolsIndexClient";

export const metadata: Metadata = {
	title: `${TOOLS.length} Free SEO & AI-Visibility Tools — No Signup | OptiQra`,
	description: `${TOOLS.length} free, individual SEO, performance, accessibility, security, and AI-visibility tools — meta tag checkers and generators, robots.txt and sitemap tools, schema generators, Core Web Vitals, GEO/AEO checkers, and more. No signup, free forever, open source.`,
	alternates: { canonical: "https://optiqra.vercel.app/tools" },
};

export default function ToolsIndexPage() {
	return <ToolsIndexClient />;
}
