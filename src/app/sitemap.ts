import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/toolsRegistry";

const BASE_URL = "https://optiqra.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();

	return [
		{
			url: `${BASE_URL}/`,
			lastModified: now,
			changeFrequency: "daily",
			priority: 1.0,
		},
		{
			url: `${BASE_URL}/tools`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		...TOOLS.map((tool) => ({
			url: `${BASE_URL}/tools/${tool.slug}`,
			lastModified: now,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		})),
	];
}
