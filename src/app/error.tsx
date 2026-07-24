"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error, {
			tags: {
				context: "global-error-boundary",
			},
			contexts: {
				error: {
					digest: error.digest,
				},
			},
		});
	}, [error]);

	return (
		<html>
			<body
				style={{
					fontFamily: "system-ui, -apple-system, sans-serif",
					background: "#f5f5f5",
					margin: 0,
					padding: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "1.5rem",
						padding: "2rem",
						maxWidth: "600px",
						margin: "4rem auto",
						background: "white",
						borderRadius: "8px",
						boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
					}}
				>
					<div>
						<h1
							style={{
								margin: 0,
								fontSize: "1.75rem",
								color: "#d32f2f",
								fontWeight: "600",
							}}
						>
							Something went wrong
						</h1>
						<p
							style={{
								margin: "0.5rem 0 0 0",
								color: "#666",
								fontSize: "0.95rem",
							}}
						>
							An unexpected error occurred. Our team has been notified and will investigate.
						</p>
					</div>

					{error.message && (
						<details
							style={{
								padding: "1rem",
								background: "#f9f9f9",
								border: "1px solid #ddd",
								borderRadius: "4px",
								cursor: "pointer",
							}}
						>
							<summary style={{ fontWeight: "500", color: "#333" }}>
								Error details
							</summary>
							<pre
								style={{
									margin: "0.75rem 0 0 0",
									overflow: "auto",
									color: "#666",
									fontSize: "0.85rem",
									fontFamily: "monospace",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
								}}
							>
								{error.message}
							</pre>
						</details>
					)}

					{error.digest && (
						<p
							style={{
								margin: 0,
								fontSize: "0.85rem",
								color: "#999",
								fontFamily: "monospace",
							}}
						>
							Error ID: {error.digest}
						</p>
					)}

					<button
						onClick={() => reset()}
						style={{
							padding: "0.75rem 1.5rem",
							backgroundColor: "#6505ff",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
							fontSize: "1rem",
							fontWeight: "500",
							transition: "background-color 0.2s",
						}}
						onMouseEnter={(e) => {
							(e.target as HTMLButtonElement).style.backgroundColor =
								"#5003e6";
						}}
						onMouseLeave={(e) => {
							(e.target as HTMLButtonElement).style.backgroundColor =
								"#6505ff";
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
