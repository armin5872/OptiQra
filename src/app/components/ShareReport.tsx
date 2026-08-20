"use client";

// Save this file as components/ShareReport.tsx (flattened here alongside the
// rest of the uploaded files). Imported from page.tsx as
// `@/components/ShareReport`.
//
// Renders a "Share report" button with a dropdown of share targets (email,
// SMS/MMS, WhatsApp, LinkedIn, X/Twitter, Facebook, Instagram, plus native
// share + copy-link). No extra dependencies required — every target is a
// plain URL scheme or the browser's native Web Share API.

import { useEffect, useRef, useState } from "react";

export const SITE_URL = "https://optiqra.vercel.app";

type ShareTarget =
	| "native"
	| "email"
	| "sms"
	| "whatsapp"
	| "linkedin"
	| "twitter"
	| "facebook"
	| "instagram"
	| "copy";

function defaultBuildMessage(siteUrl: string, score: number, name?: string) {
	const greeting = name?.trim() ? `Hi ${name.trim()}! ` : "";
	return `${greeting}I just scanned ${siteUrl} with OptiQra and scored ${score}/100 on my SEO report. It's a really cool (and free) tool — you should go check it out: ${SITE_URL}`;
}

function Icon({ children }: { children: React.ReactNode }) {
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
			{children}
		</svg>
	);
}

const ICONS: Record<ShareTarget, React.ReactNode> = {
	native: (
		<Icon>
			<path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 1 0-3-3c0 .24.04.47.09.7L7.04 9.81A2.99 2.99 0 0 0 5 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a2.92 2.92 0 1 0 3.92-2.92z" />
		</Icon>
	),
	email: (
		<Icon>
			<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5Z" />
		</Icon>
	),
	sms: (
		<Icon>
			<path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
		</Icon>
	),
	whatsapp: (
		<Icon>
			<path d="M12.04 2a9.94 9.94 0 0 0-8.6 14.94L2 22l5.2-1.36A9.94 9.94 0 1 0 12.04 2Zm0 18.06a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.08.81.82-3-.19-.31a8.12 8.12 0 1 1 6.88 3.81Zm4.46-6.07c-.24-.12-1.43-.71-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.44-1.35-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.4-.14 0-.3-.02-.46-.02-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.43-.58 1.63-1.15.2-.56.2-1.04.14-1.15-.06-.1-.22-.16-.46-.28Z" />
		</Icon>
	),
	linkedin: (
		<Icon>
			<path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
		</Icon>
	),
	twitter: (
		<Icon>
			<path d="M18.9 2H22l-7.4 8.46L23 22h-6.8l-5.3-6.94L4.8 22H1.6l7.9-9.03L1 2h6.9l4.8 6.35L18.9 2Zm-1.2 18.2h1.7L7.4 3.7H5.6L17.7 20.2Z" />
		</Icon>
	),
	facebook: (
		<Icon>
			<path d="M13.5 21.9v-8.1h2.7l.4-3.2h-3.1V8.5c0-.9.25-1.55 1.6-1.55h1.7V4.1c-.3-.04-1.3-.13-2.5-.13-2.45 0-4.1 1.5-4.1 4.25v2.4H7.5v3.2h2.7v8.1h3.3Z" />
		</Icon>
	),
	instagram: (
		<Icon>
			<path d="M12 2c2.72 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.9 1.11 1.15 1.77.25.64.42 1.37.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.64.25-1.37.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.37-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77.55-.55 1.11-.9 1.77-1.15.64-.25 1.37-.42 2.43-.47C8.94 2.01 9.28 2 12 2Zm0 1.8c-2.67 0-2.99.01-4.04.06-.87.04-1.34.18-1.65.3-.42.16-.71.35-1.02.66-.31.31-.5.6-.66 1.02-.12.31-.26.78-.3 1.65-.05 1.05-.06 1.37-.06 4.04s.01 2.99.06 4.04c.04.87.18 1.34.3 1.65.16.42.35.71.66 1.02.31.31.6.5 1.02.66.31.12.78.26 1.65.3 1.05.05 1.37.06 4.04.06s2.99-.01 4.04-.06c.87-.04 1.34-.18 1.65-.3.42-.16.71-.35 1.02-.66.31-.31.5-.6.66-1.02.12-.31.26-.78.3-1.65.05-1.05.06-1.37.06-4.04s-.01-2.99-.06-4.04c-.04-.87-.18-1.34-.3-1.65a2.75 2.75 0 0 0-.66-1.02 2.75 2.75 0 0 0-1.02-.66c-.31-.12-.78-.26-1.65-.3-1.05-.05-1.37-.06-4.04-.06Zm0 3.5a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4Zm0 1.8a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Zm5.88-2a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0Z" />
		</Icon>
	),
	copy: (
		<Icon>
			<path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z" />
		</Icon>
	),
};

export default function ShareReport({
	siteUrl,
	overallScore,
	subject,
	buildMessage,
	buttonLabel = "Share report",
	shareTitle = "My OptiQra SEO report",
}: {
	/** Legacy/simple usage: pass a site URL + score and a default message is built. */
	siteUrl?: string;
	overallScore?: number;
	/** Email subject line. Falls back to a generic OptiQra subject if omitted. */
	subject?: string;
	/** Full control over the shareable message text — lets each tool/page send
	 *  something specific to what it actually did, instead of one canned line
	 *  reused everywhere. Receives the optional "your name" the person typed in. */
	buildMessage?: (name?: string) => string;
	/** Button + menu copy, so this reads right in different contexts (e.g. a
	 *  single-tool result vs. the full site report). */
	buttonLabel?: string;
	shareTitle?: string;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [copied, setCopied] = useState(false);
	const [canNativeShare] = useState(
		() => typeof navigator !== "undefined" && typeof navigator.share === "function",
	);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const message = buildMessage
		? buildMessage(name)
		: defaultBuildMessage(siteUrl || SITE_URL, overallScore ?? 0, name);
	const emailSubject = subject || (typeof overallScore === "number" ? `My OptiQra SEO report — scored ${overallScore}/100` : "Check out OptiQra");

	const handleShare = async (target: ShareTarget) => {
		const encoded = encodeURIComponent(message);
		const encodedUrl = encodeURIComponent(SITE_URL);

		switch (target) {
			case "native": {
				try {
					await navigator.share({ title: shareTitle, text: message, url: SITE_URL });
					setOpen(false);
				} catch {
					// user cancelled the native share sheet — no-op
				}
				return;
			}
			case "email": {
				const encodedSubject = encodeURIComponent(emailSubject);
				window.open(`mailto:?subject=${encodedSubject}&body=${encoded}`, "_blank");
				break;
			}
			case "sms": {
				window.open(`sms:?&body=${encoded}`, "_blank");
				break;
			}
			case "whatsapp": {
				window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
				break;
			}
			case "linkedin": {
				window.open(
					`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
					"_blank",
					"noopener,noreferrer",
				);
				break;
			}
			case "twitter": {
				window.open(
					`https://twitter.com/intent/tweet?text=${encoded}`,
					"_blank",
					"noopener,noreferrer",
				);
				break;
			}
			case "facebook": {
				window.open(
					`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encoded}`,
					"_blank",
					"noopener,noreferrer",
				);
				break;
			}
			case "instagram": {
				// Instagram has no web share/intent API — copy the message so it can
				// be pasted into a DM, story, or bio link instead.
				try {
					await navigator.clipboard.writeText(message);
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				} catch {
					// clipboard unavailable — silently ignore
				}
				return;
			}
			case "copy": {
				try {
					await navigator.clipboard.writeText(message);
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				} catch {
					// clipboard unavailable — silently ignore
				}
				return;
			}
		}
		setOpen(false);
	};

	const items: { id: ShareTarget; label: string; hint: string }[] = [
		...(canNativeShare
			? [{ id: "native" as ShareTarget, label: "Share…", hint: "Use your device's share sheet" }]
			: []),
		{ id: "email", label: "Email", hint: "Open in your mail app" },
		{ id: "sms", label: "SMS / MMS", hint: "Open in Messages" },
		{ id: "whatsapp", label: "WhatsApp", hint: "Share to a chat" },
		{ id: "linkedin", label: "LinkedIn", hint: "Post to your feed" },
		{ id: "twitter", label: "X (Twitter)", hint: "Post a tweet" },
		{ id: "facebook", label: "Facebook", hint: "Share to your feed" },
		{ id: "instagram", label: "Instagram", hint: "Copies text to paste in DM/story" },
		{ id: "copy", label: copied ? "Copied!" : "Copy message", hint: "Copy text to clipboard" },
	];

	return (
		<div className="report-download share-report" ref={menuRef}>
			<button
				className="report-download-btn share-report-btn"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				{buttonLabel}
				<span className="report-download-caret">{open ? "▲" : "▼"}</span>
			</button>

			{open && (
				<div className="report-download-menu share-report-menu" role="menu">
					<div className="share-report-name">
						<label htmlFor="share-report-name-input">Your name (optional)</label>
						<input
							id="share-report-name-input"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Alex"
							maxLength={40}
						/>
					</div>
					{items.map((it) => (
						<button
							key={it.id}
							role="menuitem"
							className="report-download-item share-report-item"
							onClick={() => handleShare(it.id)}
						>
							<span className="share-report-item-icon">{ICONS[it.id]}</span>
							<span className="share-report-item-text">
								<span className="report-download-item-label">{it.label}</span>
								<span className="report-download-item-hint">{it.hint}</span>
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
