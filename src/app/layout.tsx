import {
	IBM_Plex_Sans,
	IBM_Plex_Sans_Condensed,
	IBM_Plex_Mono,
	Lexend,
} from "next/font/google";
import Script from "next/script";
import PWARegister from "./components/PWARegister";
import AppearanceEffects from "./components/AppearanceEffects";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-plex-sans",
});

const plexCondensed = IBM_Plex_Sans_Condensed({
	subsets: ["latin"],
	weight: ["500", "600", "700"],
	variable: "--font-plex-cond",
});

const plexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-plex-mono",
});

// Used specifically for issue title/detail/fix text in the report — Lexend
// is tuned for reading proficiency, so long diagnostic copy stays easy to
// scan even at smaller sizes.
const readable = Lexend({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-readable",
});

import type { Viewport } from "next";

export const viewport: Viewport = {
	themeColor: "#0b0f14",
	width: "device-width",
	initialScale: 1,
};

export const metadata = {
	title: "OptiQra Site Vitals — Website diagnostic scan",
	description:
		"A powerful, open-source diagnostic tool for analyzing and improving website health across multiple dimensions.",
	alternates: {
		canonical: 'https://optiqra.vercel.app/',
	},
	keywords: [
		"website",
		"diagnostic",
		"performance",
		"seo",
		"aeo",
		"geo",
		"health",
		"analyzer",
		"open-source",
		"accessibility",
		"conversion",
		"audit",
		"crawler",
		"ai",
		"optigra",
	],
	authors: [{ name: "ArminNX", url: "https://optiqra.vercel.app/" }],
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "OptiQra",
	},
	icons: {
		icon: [
			{ url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
			{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
		],
		apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
	},
	verification: {
		google: "9nEQzTfKfm86Xd3dosIFdH--YQMNQXs_hbFjYEI8DXg",
	},
	openGraph: {
		title: "OptiQra Site Vitals — Website diagnostic scan",
		description:
			"A powerful, open-source diagnostic tool for analyzing and improving website health across multiple dimensions.",
		url: "https://optiqra.vercel.app/",
		siteName: "OptiQra Site Vitals",
		images: [
			{
				url: "https://optiqra.vercel.app/optigra.png",
				width: 1200,
				height: 630,
			},
		],
		locale: "en_US",
		type: "website",
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body
				className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable} ${readable.variable} font-sans`}
			>
				{/* Applies the saved theme/accent/density from the settings cookie
				    mirror (see settingsStore.ts) before first paint, so switching
				    themes in Settings never causes a flash of the old theme on
				    reload. Falls back to all defaults if the cookie isn't set yet
				    (first-ever visit). */}
				<Script id="theme-init" strategy="beforeInteractive">
					{`
						(function () {
							try {
								var match = document.cookie.split("; ").find(function (row) {
									return row.indexOf("optiqra_settings_mirror=") === 0;
								});
								var a = match ? JSON.parse(decodeURIComponent(match.split("=").slice(1).join("="))) : {};
								var theme = a.theme || "system";
								var resolved = theme === "system"
									? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
									: theme;
								var root = document.documentElement;
								root.setAttribute("data-theme", resolved);
								root.setAttribute("data-density", a.density || "comfortable");
								root.setAttribute("data-font-scale", a.fontScale || "default");
								if (a.reduceMotion) root.classList.add("reduce-motion");
								var accent = a.accentColor || "#6505ff";
								root.style.setProperty("--accent", accent);
								root.style.setProperty("--accent-hover", "color-mix(in srgb, " + accent + " 85%, black)");
								root.style.setProperty("--accent-soft", resolved === "dark"
									? "color-mix(in srgb, " + accent + " 22%, black)"
									: "color-mix(in srgb, " + accent + " 14%, white)");

								// Layout — corner radius, content width, motion speed.
								root.style.setProperty("--radius", (a.cornerRadius != null ? a.cornerRadius : 10) + "px");
								root.style.setProperty("--max-width", (a.contentWidth != null ? a.contentWidth : 960) + "px");
								root.setAttribute("data-motion-speed", a.motionSpeed || "normal");

								// Typography — custom font family + letter spacing.
								if (a.fontFamily === "custom" && a.customFontFamily) {
									root.setAttribute("data-custom-font", "1");
									root.style.setProperty("--custom-font", a.customFontFamily);
								}
								if (a.letterSpacing) {
									root.setAttribute("data-letter-spacing", "1");
									root.style.setProperty("--letter-spacing", a.letterSpacing + "px");
								}
							} catch (e) {
								// Cookie missing/corrupt — defaults from globals.css already apply.
							}
						})();
					`}
				</Script>

				{/* Google Analytics */}
				<Script
					src="https://www.googletagmanager.com/gtag/js?id=G-MTPEEM6L09"
					strategy="afterInteractive"
				/>
				<Script id="google-analytics" strategy="afterInteractive">
					{`
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'G-MTPEEM6L09');
					`}
				</Script>

				<AppearanceEffects />

				{children}

				<PWARegister />

				<footer className="site-footer">
					<span>Made by</span>{" "}
					<a
						href="https://github.com/armin5872/OptiQra"
						target="_blank"
						rel="noopener noreferrer"
					>
						ArminNX and the community
					</a>
				</footer>
			</body>
		</html>
	);
}
