import {
	IBM_Plex_Sans,
	IBM_Plex_Sans_Condensed,
	IBM_Plex_Mono,
	Lexend,
} from "next/font/google";
import Script from "next/script";
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

export const metadata = {
	title: "OptiQra Site Vitals — Website diagnostic scan",
	description:
		"A powerful, open-source diagnostic tool for analyzing and improving website health across multiple dimensions.",
	keywords: [
		"website",
		"diagnostic",
		"performance",
		"seo",
		"health",
		"analyzer",
		"open-source",
		"accessibility",
		"conversion",
		"audit",
	],
	authors: [{ name: "ArminNX", url: "https://optiqra.vercel.app/" }],
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

				{children}

				<footer className="site-footer">
					<span>Made by</span>{" "}
					<a
						href="https://github.com/armin5872"
						target="_blank"
						rel="noopener noreferrer"
					>
						ArminNX
					</a>
					<span>and the community</span>
				</footer>
			</body>
		</html>
	);
}
