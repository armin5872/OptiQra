"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Catches errors thrown anywhere in the root layout/page tree that aren't
 *  already caught by a more specific error boundary, reports them to
 *  Sentry, and shows a minimal fallback (this replaces the entire <html>,
 *  so it can't rely on globals.css or any other app chrome). */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					display: "flex",
					minHeight: "100vh",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "12px",
					fontFamily: "system-ui, sans-serif",
					background: "#0b0f14",
					color: "#f2f2f2",
					textAlign: "center",
					padding: "24px",
				}}
			>
				<h1 style={{ fontSize: "1.4rem", margin: 0 }}>Something went wrong</h1>
				<p style={{ opacity: 0.8, margin: 0, maxWidth: 420 }}>
					OptiQra hit an unexpected error. It&apos;s been reported automatically — try
					reloading the page.
				</p>
				<button
					type="button"
					onClick={() => reset()}
					style={{
						marginTop: "8px",
						padding: "8px 16px",
						borderRadius: "8px",
						border: "1px solid #444",
						background: "#1a1f26",
						color: "#f2f2f2",
						cursor: "pointer",
					}}
				>
					Try again
				</button>
			</body>
		</html>
	);
}
