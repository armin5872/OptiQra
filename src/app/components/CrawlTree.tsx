"use client";

// Save this file as components/CrawlTree.tsx in the project (it's flattened here
// alongside the rest of the uploaded files). Imported from page.tsx as
// `@/components/CrawlTree`.

import { useEffect, useMemo, useRef, useState } from "react";

export type Issue = {
	id: string;
	title: string;
	detail: string;
	fix?: string;
	weight: number;
	severity: "critical" | "high" | "medium" | "low" | "informational" | "good";
	resolved: boolean;
};

/** One crawled page's own score + category breakdown, as produced by the
 *  `/api/analyze` site-scan stream (see route.ts's `pages` field). */
export type PageNode = {
	url: string;
	parentUrl?: string;
	depth: number;
	score: number;
	categories: Record<
		string,
		{ label: string; score: number; issues: Issue[]; passed: Issue[] }
	>;
};

type TreeNode = PageNode & {
	children: TreeNode[];
	x: number;
	y: number;
};

const CATEGORY_ORDER = ["seo", "speed", "a11y", "conversions"];
const NODE_GAP_X = 60;
const LEVEL_GAP_Y = 100;
const SIDE_PAD = 34;
const TOP_PAD = 34;

function scoreBand(score: number): "good" | "warn" | "critical" {
	return (
		score >= 80 ? "good"
		: score >= 60 ? "warn"
		: "critical"
	);
}

function pathOf(url: string): string {
	try {
		const u = new URL(url);
		const p = u.pathname.length > 1 ? u.pathname.replace(/\/$/, "") : "/";
		return p + u.search;
	} catch {
		return url;
	}
}

function buildTree(pages: PageNode[]): TreeNode | null {
	if (pages.length === 0) return null;
	const map = new Map<string, TreeNode>();
	for (const p of pages) map.set(p.url, { ...p, children: [], x: 0, y: 0 });

	let root: TreeNode | null = null;
	for (const node of map.values()) {
		if (!node.parentUrl) {
			if (!root) root = node;
			continue;
		}
		const parent = map.get(node.parentUrl);
		if (parent && parent !== node) parent.children.push(node);
	}
	if (!root) {
		root = [...map.values()].sort((a, b) => a.depth - b.depth)[0] ?? null;
	}
	if (root) {
		const rootRef = root;
		for (const node of map.values()) {
			if (node === rootRef) continue;
			const parentOk = node.parentUrl && map.has(node.parentUrl);
			if (!parentOk && !rootRef.children.includes(node))
				rootRef.children.push(node);
		}
	}
	return root;
}

function layoutTree(root: TreeNode): { maxX: number; maxY: number } {
	let cursor = 0;
	let maxY = 0;
	function place(node: TreeNode, depth: number) {
		node.y = depth;
		maxY = Math.max(maxY, depth);
		if (node.children.length === 0) {
			node.x = cursor;
			cursor += 1;
			return;
		}
		node.children.forEach((c) => place(c, depth + 1));
		const first = node.children[0].x;
		const last = node.children[node.children.length - 1].x;
		node.x = (first + last) / 2;
	}
	place(root, 0);
	return { maxX: Math.max(0, cursor - 1), maxY };
}

function flattenTree(root: TreeNode): TreeNode[] {
	const out: TreeNode[] = [];
	(function walk(n: TreeNode) {
		out.push(n);
		n.children.forEach(walk);
	})(root);
	return out;
}

export default function CrawlTree({
	pages,
	title = "Crawl tree",
}: {
	pages: PageNode[];
	title?: string;
}) {
	const { root, nodes, width, height } = useMemo(() => {
		const r = buildTree(pages);
		if (!r) return { root: null, nodes: [] as TreeNode[], width: 0, height: 0 };
		const { maxX, maxY } = layoutTree(r);
		return {
			root: r,
			nodes: flattenTree(r),
			width: SIDE_PAD * 2 + maxX * NODE_GAP_X,
			height: TOP_PAD * 2 + maxY * LEVEL_GAP_Y,
		};
	}, [pages]);

	const [hover, setHover] = useState<{
		url: string;
		x: number;
		y: number;
	} | null>(null);
	const [hoverCat, setHoverCat] = useState<string | null>(null);
	const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
	const [modalOpenCat, setModalOpenCat] = useState<string | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const nodeByUrl = useMemo(() => {
		const m = new Map<string, TreeNode>();
		nodes.forEach((n) => m.set(n.url, n));
		return m;
	}, [nodes]);

	const hoveredNode = hover ? (nodeByUrl.get(hover.url) ?? null) : null;
	const selectedNode =
		selectedUrl ? (nodeByUrl.get(selectedUrl) ?? null) : null;

	const clearCloseTimer = () => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
	};

	const scheduleClose = () => {
		clearCloseTimer();
		closeTimer.current = setTimeout(() => {
			setHover(null);
			setHoverCat(null);
		}, 140);
	};

	const openHover = (node: TreeNode, el: HTMLElement) => {
		clearCloseTimer();
		const rect = el.getBoundingClientRect();
		setHover({
			url: node.url,
			x: rect.left + rect.width / 2,
			y: rect.bottom + 6,
		});
		setHoverCat(null);
	};

	useEffect(() => {
		function onEsc(e: KeyboardEvent) {
			if (e.key === "Escape") setSelectedUrl(null);
		}
		window.addEventListener("keydown", onEsc);
		return () => window.removeEventListener("keydown", onEsc);
	}, []);

	if (!root) return null;

	return (
		<div className="crawl-tree-section">
			<div className="crawl-tree-head">
				<h3>{title}</h3>
				<p className="crawl-tree-hint">
					Hover a page for its overall score, hover a category for the details,
					or click a page to open its full report.
				</p>
			</div>

			<div className="crawl-tree-legend">
				<span>
					<i className="dot good" /> 80–100
				</span>
				<span>
					<i className="dot warn" /> 60–79
				</span>
				<span>
					<i className="dot critical" /> below 60
				</span>
			</div>

			<div className="crawl-tree-scroll">
				<div
					className="crawl-tree-canvas"
					style={{ width: Math.max(width, 200), height: Math.max(height, 120) }}
				>
					<svg
						className="crawl-tree-edges"
						width={Math.max(width, 200)}
						height={Math.max(height, 120)}
					>
						{nodes.map((n) =>
							n.children.map((c) => {
								const x1 = SIDE_PAD + n.x * NODE_GAP_X;
								const y1 = TOP_PAD + n.y * LEVEL_GAP_Y;
								const x2 = SIDE_PAD + c.x * NODE_GAP_X;
								const y2 = TOP_PAD + c.y * LEVEL_GAP_Y;
								const midY = (y1 + y2) / 2;
								return (
									<path
										key={n.url + "->" + c.url}
										d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
										className="crawl-edge"
									/>
								);
							}),
						)}
					</svg>

					{nodes.map((n) => {
						const px = SIDE_PAD + n.x * NODE_GAP_X;
						const py = TOP_PAD + n.y * LEVEL_GAP_Y;
						const band = scoreBand(n.score);
						const isRoot = n === root;
						return (
							<button
								key={n.url}
								type="button"
								className={`crawl-node ${band} ${isRoot ? "root" : ""} ${hover?.url === n.url ? "hovered" : ""}`}
								style={{ left: px, top: py }}
								onMouseEnter={(e) => openHover(n, e.currentTarget)}
								onMouseLeave={scheduleClose}
								onFocus={(e) => openHover(n, e.currentTarget)}
								onBlur={scheduleClose}
								onClick={() => {
									setSelectedUrl(n.url);
									setModalOpenCat(null);
								}}
								title={n.url}
								aria-label={`${pathOf(n.url)} — score ${n.score} of 100`}
							>
								<span className="crawl-node-dot" />
								<span className="crawl-node-label">
									{isRoot ? "/" : pathOf(n.url)}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{hoveredNode && (
				<div
					className="crawl-tooltip"
					style={{ left: hover!.x, top: hover!.y }}
					onMouseEnter={clearCloseTimer}
					onMouseLeave={scheduleClose}
				>
					<div className="crawl-tooltip-head">
						<span className="crawl-tooltip-path">
							{pathOf(hoveredNode.url)}
						</span>
						<span
							className={`crawl-tooltip-score ${scoreBand(hoveredNode.score)}`}
						>
							{hoveredNode.score}
						</span>
					</div>
					<div className="crawl-tooltip-cats">
						{CATEGORY_ORDER.filter((k) => hoveredNode.categories[k]).map(
							(k) => {
								const cat = hoveredNode.categories[k];
								const open = hoverCat === k;
								return (
									<div key={k}>
										<div
											className={`crawl-tooltip-cat-row ${open ? "open" : ""}`}
											onMouseEnter={() => setHoverCat(k)}
										>
											<span>{cat.label}</span>
											<span
												className={`crawl-tooltip-cat-score ${scoreBand(cat.score)}`}
											>
												{cat.score}
											</span>
										</div>
										{open && (
											<div className="crawl-tooltip-detail">
												{cat.issues.length === 0 ?
													<p className="crawl-tooltip-clean">
														No issues found here.
													</p>
												:	<>
														<ul>
															{[...cat.issues]
																.sort((a, b) => b.weight - a.weight)
																.slice(0, 3)
																.map((iss) => (
																	<li key={iss.id}>
																		<span
																			className={`sev-dot sev-${iss.severity}`}
																		/>
																		{iss.title}
																	</li>
																))}
														</ul>
														{cat.issues.length > 3 && (
															<p className="crawl-tooltip-more">
																+{cat.issues.length - 3} more in the full report
															</p>
														)}
													</>
												}
											</div>
										)}
									</div>
								);
							},
						)}
					</div>
					<button
						type="button"
						className="crawl-tooltip-full-btn"
						onClick={() => {
							setSelectedUrl(hoveredNode.url);
							setHover(null);
							setModalOpenCat(null);
						}}
					>
						View full page report →
					</button>
				</div>
			)}

			{selectedNode && (
				<div
					className="crawl-modal-overlay"
					onClick={() => setSelectedUrl(null)}
					role="presentation"
				>
					<div
						className="crawl-modal"
						role="dialog"
						aria-modal="true"
						aria-label={`Report for ${selectedNode.url}`}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="crawl-modal-head">
							<div>
								<p className="crawl-modal-eyebrow">Page report</p>
								<a
									className="crawl-modal-url"
									href={selectedNode.url}
									target="_blank"
									rel="noopener noreferrer"
								>
									{selectedNode.url}
								</a>
							</div>
							<button
								type="button"
								className="crawl-modal-close"
								onClick={() => setSelectedUrl(null)}
								aria-label="Close"
							>
								×
							</button>
						</div>

						<div className="crawl-modal-score">
							<span
								className={`crawl-modal-score-num ${scoreBand(selectedNode.score)}`}
							>
								{selectedNode.score}
							</span>
							<span className="crawl-modal-score-label">/100 on this page</span>
						</div>

						<div className="cards crawl-modal-cards">
							{CATEGORY_ORDER.filter((k) => selectedNode.categories[k]).map(
								(k) => {
									const cat = selectedNode.categories[k];
									const open = modalOpenCat === k;
									return (
										<div
											key={k}
											className="card"
											onClick={() => setModalOpenCat(open ? null : k)}
										>
											<div className="card-head">
												<div className="card-name">{cat.label}</div>
												<div
													className="card-score"
													style={{
														color:
															cat.score >= 80 ? "var(--good)"
															: cat.score >= 60 ? "var(--warn)"
															: "var(--critical)",
													}}
												>
													{cat.score}
												</div>
											</div>
											<div className="card-count">
												{cat.issues.length} issue
												{cat.issues.length === 1 ? "" : "s"}
											</div>
											<div className="card-bar">
												<div
													style={{
														width: `${cat.score}%`,
														background:
															cat.score >= 80 ? "var(--good)"
															: cat.score >= 60 ? "var(--warn)"
															: "var(--critical)",
													}}
												/>
											</div>
										</div>
									);
								},
							)}
						</div>

						<div className="crawl-modal-panels">
							{CATEGORY_ORDER.filter(
								(k) => selectedNode.categories[k] && modalOpenCat === k,
							).map((k) => {
								const cat = selectedNode.categories[k];
								return (
									<div key={k} className="panel open">
										{cat.issues.length === 0 && (
											<p className="crawl-tooltip-clean">
												No issues found in {cat.label.toLowerCase()} on this
												page.
											</p>
										)}
										{cat.issues.map((iss) => (
											<div key={iss.id} className="finding">
												<span className={`sev-dot sev-${iss.severity}`} />
												<div className="finding-body">
													<span className={`sev-badge sev-badge-${iss.severity}`}>
														{iss.severity}
													</span>
													<div className="finding-title">{iss.title}</div>
													<div className="finding-detail">{iss.detail}</div>
													{iss.fix && (
														<div className="finding-fix">Fix: {iss.fix}</div>
													)}
												</div>
											</div>
										))}
									</div>
								);
							})}
							{!modalOpenCat && (
								<p className="crawl-modal-hint">
									Click a category above to see its findings for this page.
								</p>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
