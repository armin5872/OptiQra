"use client";

import { useState, type ReactNode } from "react";

/**
 * Minimal, dependency-free renderer for the constrained markdown subset our
 * AI prompts are instructed to produce: ## / ### headings, **bold**,
 * `inline code`, - / * / 1. lists, and ```fenced code blocks```.
 *
 * Deliberately not a full CommonMark implementation — just enough structure
 * to turn a streamed AI response into something readable instead of a wall
 * of raw text with literal asterisks and hashes in it.
 */

type Block =
	| { type: "heading"; level: number; text: string }
	| { type: "list"; ordered: boolean; items: string[] }
	| { type: "code"; lang: string; code: string }
	| { type: "paragraph"; text: string };

function parseBlocks(md: string): Block[] {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (!line.trim()) {
			i++;
			continue;
		}

		const fence = line.match(/^```\s*([\w+-]*)\s*$/);
		if (fence) {
			const lang = fence[1] || "";
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !/^```\s*$/.test(lines[i])) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing fence (or run off the end while streaming)
			blocks.push({ type: "code", lang, code: codeLines.join("\n") });
			continue;
		}

		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		if (heading) {
			blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
			i++;
			continue;
		}

		// Legacy fallback: a short, standalone, ALL-CAPS line (e.g. "OVERVIEW")
		// is treated as a section heading too, in case older plain-text output
		// is ever encountered.
		const trimmed = line.trim();
		if (
			trimmed.length > 2 &&
			trimmed.length < 40 &&
			trimmed === trimmed.toUpperCase() &&
			/[A-Z]/.test(trimmed) &&
			!/[a-z]/.test(trimmed) &&
			!/^[-*]/.test(trimmed)
		) {
			blocks.push({ type: "heading", level: 3, text: trimmed });
			i++;
			continue;
		}

		if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
			const ordered = /^\d+\.\s+/.test(line);
			const items: string[] = [];
			while (i < lines.length && (/^[-*]\s+/.test(lines[i]) || /^\d+\.\s+/.test(lines[i]))) {
				items.push(lines[i].replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
				i++;
			}
			blocks.push({ type: "list", ordered, items });
			continue;
		}

		const paraLines: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() &&
			!/^```/.test(lines[i]) &&
			!/^#{1,4}\s/.test(lines[i]) &&
			!/^[-*]\s+/.test(lines[i]) &&
			!/^\d+\.\s+/.test(lines[i])
		) {
			paraLines.push(lines[i]);
			i++;
		}
		blocks.push({ type: "paragraph", text: paraLines.join(" ") });
	}

	return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	let idx = 0;

	while ((match = regex.exec(text))) {
		if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
		const token = match[0];
		if (token.startsWith("**")) {
			nodes.push(<strong key={`${keyPrefix}-${idx++}`}>{token.slice(2, -2)}</strong>);
		} else {
			nodes.push(
				<code key={`${keyPrefix}-${idx++}`} className="md-inline-code">
					{token.slice(1, -1)}
				</code>,
			);
		}
		lastIndex = match.index + token.length;
	}
	if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
	return nodes;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard API unavailable — silently ignore
		}
	};

	return (
		<div className="md-code-block">
			<div className="md-code-head">
				<span className="md-code-lang">{lang || "snippet"}</span>
				<button type="button" className="md-code-copy" onClick={handleCopy}>
					{copied ? "copied!" : "copy"}
				</button>
			</div>
			<pre className="md-code-pre">
				<code>{code}</code>
			</pre>
		</div>
	);
}

export default function MarkdownLite({ text }: { text: string }) {
	const blocks = parseBlocks(text);

	return (
		<div className="md-body">
			{blocks.map((block, i) => {
				if (block.type === "heading") {
					const visualLevel = Math.min(block.level + 2, 5); // md h1/h2 -> visual h3, deeper nested down
					const className = `md-heading md-heading-${visualLevel}`;
					switch (visualLevel) {
						case 3:
							return (
								<h3 key={i} className={className}>
									{renderInline(block.text, `h${i}`)}
								</h3>
							);
						case 4:
							return (
								<h4 key={i} className={className}>
									{renderInline(block.text, `h${i}`)}
								</h4>
							);
						default:
							return (
								<h5 key={i} className={className}>
									{renderInline(block.text, `h${i}`)}
								</h5>
							);
					}
				}

				if (block.type === "list") {
					const items = block.items.map((item, j) => (
						<li key={j}>{renderInline(item, `l${i}-${j}`)}</li>
					));
					return block.ordered ? (
						<ol key={i} className="md-list">
							{items}
						</ol>
					) : (
						<ul key={i} className="md-list">
							{items}
						</ul>
					);
				}

				if (block.type === "code") {
					return <CodeBlock key={i} lang={block.lang} code={block.code} />;
				}

				return (
					<p key={i} className="md-paragraph">
						{renderInline(block.text, `p${i}`)}
					</p>
				);
			})}
		</div>
	);
}
