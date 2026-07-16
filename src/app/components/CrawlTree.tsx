"use client";

// Save this file as components/CrawlTree.tsx in the project (it's flattened here
// alongside the rest of the uploaded files). Imported from page.tsx as
// `@/components/CrawlTree`.

import { useEffect, useMemo, useRef, useState } from "react";
import SiteCloneViewer from "./SiteCloneViewer";

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

const CATEGORY_ORDER = ["seo", "aeo", "geo", "speed", "a11y", "conversions"];
const NODE_GAP_X = 72;
const LEVEL_GAP_Y = 116;
const SIDE_PAD = 44;
const TOP_PAD = 44;

// Trees bigger than this auto-collapse deep branches on first appearance so
// a 1,000-page "Full Crawl" doesn't render a thousand DOM nodes + tooltips
// up front. Users can still expand anything with one click.
const AUTO_COLLAPSE_THRESHOLD = 60;
const AUTO_COLLAPSE_DEPTH = 2;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

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

/** Total descendant count per node, computed once against the *full* tree
 *  (independent of collapse state) so a collapsed node can show "+N pages". */
function countDescendants(root: TreeNode): Map<string, number> {
	const counts = new Map<string, number>();
	function walk(node: TreeNode): number {
		let total = 0;
		for (const c of node.children) total += 1 + walk(c);
		counts.set(node.url, total);
		return total;
	}
	walk(root);
	return counts;
}

type Edge = { parent: TreeNode; child: TreeNode };

/** Lays out only the nodes currently visible (i.e. not hidden behind a
 *  collapsed ancestor), assigning x/y in place and returning render order
 *  plus the edges that should actually be drawn. */
function layoutVisible(
	root: TreeNode,
	collapsed: Set<string>,
): { nodes: TreeNode[]; edges: Edge[]; maxX: number; maxY: number } {
	let cursor = 0;
	let maxY = 0;
	const nodes: TreeNode[] = [];
	const edges: Edge[] = [];

	function place(node: TreeNode, depth: number) {
		node.y = depth;
		maxY = Math.max(maxY, depth);
		nodes.push(node);

		const isCollapsed = collapsed.has(node.url) && node.children.length > 0;
		if (node.children.length === 0 || isCollapsed) {
			node.x = cursor;
			cursor += 1;
			return;
		}
		node.children.forEach((c) => {
			edges.push({ parent: node, child: c });
			place(c, depth + 1);
		});
		const first = node.children[0].x;
		const last = node.children[node.children.length - 1].x;
		node.x = (first + last) / 2;
	}

	place(root, 0);
	return { nodes, edges, maxX: Math.max(0, cursor - 1), maxY };
}

export default function CrawlTree({
	pages,
	title = "Crawl tree",
}: {
	pages: PageNode[];
	title?: string;
}) {
	const root = useMemo(() => buildTree(pages), [pages]);
	const descendantCounts = useMemo(
		() => (root ? countDescendants(root) : new Map<string, number>()),
		[root],
	);

	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const autoCollapsedRef = useRef<Set<string>>(new Set());

	// Auto-collapse deep branches the first time they appear (handles both
	// the initial render of a big finished crawl and pages streaming in
	// live), without ever re-collapsing something the user has expanded.
	useEffect(() => {
		if (!root || pages.length <= AUTO_COLLAPSE_THRESHOLD) return;
		const toCollapse: string[] = [];
		(function walk(node: TreeNode, depth: number) {
			if (
				depth >= AUTO_COLLAPSE_DEPTH &&
				node.children.length > 0 &&
				!autoCollapsedRef.current.has(node.url)
			) {
				toCollapse.push(node.url);
				autoCollapsedRef.current.add(node.url);
			}
			node.children.forEach((c) => walk(c, depth + 1));
		})(root, 0);
		if (toCollapse.length > 0) {
			setCollapsed((prev) => {
				const next = new Set(prev);
				toCollapse.forEach((u) => next.add(u));
				return next;
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [root, pages.length]);

	const { nodes, edges, width, height } = useMemo(() => {
		if (!root)
			return {
				nodes: [] as TreeNode[],
				edges: [] as Edge[],
				width: 0,
				height: 0,
			};
		const { nodes: n, edges: e, maxX, maxY } = layoutVisible(root, collapsed);
		return {
			nodes: n,
			edges: e,
			width: SIDE_PAD * 2 + maxX * NODE_GAP_X,
			height: TOP_PAD * 2 + maxY * LEVEL_GAP_Y,
		};
	}, [root, collapsed]);

	const [hover, setHover] = useState<{
		url: string;
		x: number;
		y: number;
	} | null>(null);
	const [hoverCat, setHoverCat] = useState<string | null>(null);
	const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
	const [modalOpenCat, setModalOpenCat] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
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

	const toggleCollapse = (url: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(url)) next.delete(url);
			else next.add(url);
			return next;
		});
	};

	useEffect(() => {
		function onEsc(e: KeyboardEvent) {
			if (e.key === "Escape") setSelectedUrl(null);
		}
		window.addEventListener("keydown", onEsc);
		return () => window.removeEventListener("keydown", onEsc);
	}, []);

	if (!root) return null;

	const collapsedCount = pages.length - nodes.length;
	const canvasW = Math.max(width, 200);
	const canvasH = Math.max(height, 120);

	return (
		<div className="crawl-tree-section">
			<div className="crawl-tree-head">
				<div className="crawl-tree-head-row">
					<h3>{title}</h3>
					<div className="crawl-tree-stats">
						<span>{pages.length} pages mapped</span>
						{collapsedCount > 0 && (
							<span className="crawl-tree-stats-dim">
								· {collapsedCount} collapsed for speed
							</span>
						)}
					</div>
				</div>
				<p className="crawl-tree-hint">
					Hover a page for its overall score, hover a category for the details,
					click a page to open its full report, or use <code>+/−</code> on a
					branch to expand or collapse it.
				</p>
			</div>

			<div className="crawl-tree-toolbar">
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

				<div className="crawl-tree-zoom">
					<button
						type="button"
						className="crawl-tree-zoom-btn"
						onClick={() =>
							setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
						}
						aria-label="Zoom out"
						disabled={zoom <= ZOOM_MIN}
					>
						−
					</button>
					<button
						type="button"
						className="crawl-tree-zoom-reset"
						onClick={() => setZoom(1)}
					>
						{Math.round(zoom * 100)}%
					</button>
					<button
						type="button"
						className="crawl-tree-zoom-btn"
						onClick={() =>
							setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
						}
						aria-label="Zoom in"
						disabled={zoom >= ZOOM_MAX}
					>
						+
					</button>
				</div>
			</div>

			<div className="crawl-tree-scroll">
				<div
					className="crawl-tree-canvas-spacer"
					style={{ width: canvasW * zoom, height: canvasH * zoom }}
				>
					<div
						className="crawl-tree-canvas"
						style={{
							width: canvasW,
							height: canvasH,
							transform: `scale(${zoom})`,
						}}
					>
						<svg className="crawl-tree-edges" width={canvasW} height={canvasH}>
							{edges.map(({ parent: n, child: c }, i) => {
								const x1 = SIDE_PAD + n.x * NODE_GAP_X;
								const y1 = TOP_PAD + n.y * LEVEL_GAP_Y;
								const x2 = SIDE_PAD + c.x * NODE_GAP_X;
								const y2 = TOP_PAD + c.y * LEVEL_GAP_Y;
								const midY = (y1 + y2) / 2;
								return (
									<path
										key={n.url + "->" + c.url}
										pathLength={1}
										d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
										className={`crawl-edge ${scoreBand(c.score)}`}
										style={{ animationDelay: `${Math.min(i * 12, 400)}ms` }}
									/>
								);
							})}
						</svg>

						{nodes.map((n, i) => {
							const px = SIDE_PAD + n.x * NODE_GAP_X;
							const py = TOP_PAD + n.y * LEVEL_GAP_Y;
							const band = scoreBand(n.score);
							const isRoot = n === root;
							const hasChildren = n.children.length > 0;
							const isCollapsed = collapsed.has(n.url);
							const hidden = descendantCounts.get(n.url) ?? 0;
							return (
								<div
									key={n.url}
									className="crawl-node-pos"
									style={{
										left: px,
										top: py,
										animationDelay: `${Math.min(i * 14, 500)}ms`,
									}}
								>
									<button
										type="button"
										className={`crawl-node ${band} ${isRoot ? "root" : ""} ${hover?.url === n.url ? "hovered" : ""}`}
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
									{hasChildren && (
										<button
											type="button"
											className={`crawl-node-toggle ${isCollapsed ? "closed" : ""}`}
											onClick={(e) => {
												e.stopPropagation();
												toggleCollapse(n.url);
											}}
											aria-label={
												isCollapsed ?
													`Expand ${hidden} hidden pages`
												:	"Collapse this branch"
											}
										>
											{isCollapsed ? `+${hidden}` : "–"}
										</button>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{hoveredNode && (
				<div
					className="crawl-tooltip"
					style={{ left: hover!.x, top: hover!.y }}
					onMouseEnter={clearCloseTimer}
					onMouseLeave={scheduleClose}
				>
					<div className={`crawl-tooltip-head ${scoreBand(hoveredNode.score)}`}>
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
						<div
							className={`crawl-modal-band ${scoreBand(selectedNode.score)}`}
						/>
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
								<SiteCloneViewer
									url={selectedNode.url}
									label="🔍 View this page highlighted"
									className="clone-view-btn clone-view-btn-inline"
								/>
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
											className={`card ${open ? "active" : ""}`}
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
													<span
														className={`sev-badge sev-badge-${iss.severity}`}
													>
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
