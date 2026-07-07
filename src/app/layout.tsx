import {
	IBM_Plex_Sans,
	IBM_Plex_Sans_Condensed,
	IBM_Plex_Mono,
} from "next/font/google";
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
	authors: [{ name: "ArminNX", url: "https://optiqra.com" }],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body
				className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable} font-sans`}
			>
				{children}
				<hr />
				made by{" "}
				<a
					href="https://github.com/armin5872"
					target="_blank"
					rel="noopener noreferrer"
				>
					ArminNX
				</a>
			</body>
		</html>
	);
}
