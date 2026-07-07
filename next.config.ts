import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	// Optimize for production and Docker
	output: process.env.DOCKER_BUILD ? "standalone" : undefined,
	compress: true,
	poweredByHeader: false,
	reactStrictMode: true,

	// Security headers
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
				],
			},
		];
	},
};

export default nextConfig;
