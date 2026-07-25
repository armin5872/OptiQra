"use client";

// Save this file as components/CrawlTree.tsx in the project (it's flattened here
// alongside the rest of the uploaded files). Imported from page.tsx as
// `@/components/CrawlTree`.

import { useEffect, useMemo, useRef, useState } from "react";
import SiteCloneViewer from "./SiteCloneViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
		<div className="mb-8 flex flex-col gap-3.5">
			<div className="flex flex-col gap-1.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<h3 className="m-0 text-base font-semibold">{title}</h3>
					<div className="flex items-center gap-1.5 text-xs text-ink-soft">
						<span>{pages.length} pages mapped</span>
						{collapsedCount > 0 && (
							<span className="text-ink-soft/70">
								· {collapsedCount} collapsed for speed
							</span>
						)}
					</div>
				</div>
				<p className="m-0 max-w-[64ch] font-(family-name:--font-readable) text-[12.5px] text-ink-soft">
					Hover a page for its overall score, hover a category for the details,
					click a page to open its full report, or use <code className="rounded bg-surface-2 px-1 py-0.5 font-(family-name:--font-mono)">+/−</code> on a
					branch to expand or collapse it.
				</p>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3.5 text-xs text-ink-soft">
					<span className="flex items-center gap-1.5">
						<i className="inline-block size-2 rounded-full bg-good not-italic" /> 80–100
					</span>
					<span className="flex items-center gap-1.5">
						<i className="inline-block size-2 rounded-full bg-warn not-italic" /> 60–79
					</span>
					<span className="flex items-center gap-1.5">
						<i className="inline-block size-2 rounded-full bg-critical not-italic" /> below 60
					</span>
				</div>

				<div className="flex items-center gap-1 rounded-(--radius) border border-line bg-card p-1">
					<button
						type="button"
						className="flex size-6 items-center justify-center rounded text-ink-soft hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
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
						className="min-w-12 rounded px-1 text-xs text-ink-soft hover:bg-secondary"
						onClick={() => setZoom(1)}
					>
						{Math.round(zoom * 100)}%
					</button>
					<button
						type="button"
						className="flex size-6 items-center justify-center rounded text-ink-soft hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
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

			<div className="max-h-[520px] overflow-auto rounded-(--radius) border border-line bg-card">
				<div
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
					className="crawl-tooltip absolute z-[1000] w-64 rounded-(--radius) border border-line bg-card p-3 text-xs shadow-md"
					style={{ left: hover!.x, top: hover!.y }}
					onMouseEnter={clearCloseTimer}
					onMouseLeave={scheduleClose}
				>
					<div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
						<span className="truncate font-(family-name:--font-mono) text-[11px] text-ink-soft">
							{pathOf(hoveredNode.url)}
						</span>
						<span
							className={cn(
								"shrink-0 font-(family-name:--font-cond) text-base font-bold",
								scoreBand(hoveredNode.score) === "good" && "text-good",
								scoreBand(hoveredNode.score) === "warn" && "text-warn",
								scoreBand(hoveredNode.score) === "critical" && "text-critical",
							)}
						>
							{hoveredNode.score}
						</span>
					</div>
					<div className="flex flex-col gap-0.5">
						{CATEGORY_ORDER.filter((k) => hoveredNode.categories[k]).map(
							(k) => {
								const cat = hoveredNode.categories[k];
								const open = hoverCat === k;
								return (
									<div key={k}>
										<div
											className={cn(
												"flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 text-ink-soft",
												open && "bg-secondary text-ink",
											)}
											onMouseEnter={() => setHoverCat(k)}
										>
											<span>{cat.label}</span>
											<span
												className={cn(
													"font-semibold",
													scoreBand(cat.score) === "good" && "text-good",
													scoreBand(cat.score) === "warn" && "text-warn",
													scoreBand(cat.score) === "critical" && "text-critical",
												)}
											>
												{cat.score}
											</span>
										</div>
										{open && (
											<div className="mb-1 flex flex-col gap-1 rounded bg-surface-2 px-2 py-1.5">
												{cat.issues.length === 0 ?
													<p className="m-0 text-ink-soft italic">
														No issues found here.
													</p>
												:	<>
														<ul className="m-0 flex list-none flex-col gap-1 p-0">
															{[...cat.issues]
																.sort((a, b) => b.weight - a.weight)
																.slice(0, 3)
																.map((iss) => (
																	<li key={iss.id} className="flex items-center gap-1.5">
																		<span
																			className={cn(
																				"size-1.5 shrink-0 rounded-full",
																				iss.severity === "critical" ? "bg-sev-critical"
																				: iss.severity === "high" ? "bg-sev-high"
																				: iss.severity === "medium" ? "bg-sev-medium"
																				: iss.severity === "low" ? "bg-sev-low"
																				:	"border border-sev-info-border bg-sev-info",
																			)}
																		/>
																		{iss.title}
																	</li>
																))}
														</ul>
														{cat.issues.length > 3 && (
															<p className="m-0 text-ink-soft">
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
						className="mt-2 w-full rounded-md bg-brand py-1.5 text-center text-xs font-medium text-white hover:bg-brand-hover"
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
					className="crawl-modal-overlay fixed inset-0 z-[1100] bg-black/50"
					onClick={() => setSelectedUrl(null)}
					role="presentation"
				>
					<div
						className="crawl-modal fixed top-1/2 left-1/2 z-[1101] flex max-h-[85vh] w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-card shadow-lg"
						role="dialog"
						aria-modal="true"
						aria-label={`Report for ${selectedNode.url}`}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							className={cn(
								"crawl-modal-band h-1.5 w-full shrink-0",
								scoreBand(selectedNode.score) === "good" && "bg-good",
								scoreBand(selectedNode.score) === "warn" && "bg-warn",
								scoreBand(selectedNode.score) === "critical" && "bg-critical",
							)}
						/>
						<div className="flex flex-none items-start justify-between gap-4 border-b border-line px-6 py-5">
							<div className="flex flex-col items-start gap-2">
								<p className="m-0 text-xs tracking-[0.06em] text-ink-soft uppercase">
									Page report
								</p>
								<a
									className="truncate text-sm font-medium text-brand underline-offset-2 hover:underline"
									href={selectedNode.url}
									target="_blank"
									rel="noopener noreferrer"
								>
									{selectedNode.url}
								</a>
								<SiteCloneViewer
									url={selectedNode.url}
									label="🔍 View this page highlighted"
									className="mt-1 text-xs"
								/>
							</div>
							<button
								type="button"
								className="flex size-7 shrink-0 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-secondary hover:text-ink"
								onClick={() => setSelectedUrl(null)}
								aria-label="Close"
							>
								×
							</button>
						</div>

						<div className="flex flex-none items-baseline gap-2 border-b border-line px-6 py-4">
							<span
								className={cn(
									"font-(family-name:--font-cond) text-3xl font-bold",
									scoreBand(selectedNode.score) === "good" && "text-good",
									scoreBand(selectedNode.score) === "warn" && "text-warn",
									scoreBand(selectedNode.score) === "critical" && "text-critical",
								)}
							>
								{selectedNode.score}
							</span>
							<span className="text-sm text-ink-soft">/100 on this page</span>
						</div>

						<div className="flex-1 overflow-y-auto px-6 py-5">
							<div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
								{CATEGORY_ORDER.filter((k) => selectedNode.categories[k]).map(
									(k) => {
										const cat = selectedNode.categories[k];
										const open = modalOpenCat === k;
										const colorClass =
											cat.score >= 80 ? "good"
											: cat.score >= 60 ? "warn"
											: "critical";
										return (
											<Card
												key={k}
												className={cn(
													"cursor-pointer gap-1.5 p-3.5 shadow-none",
													open && "border-brand",
												)}
												onClick={() => setModalOpenCat(open ? null : k)}
											>
												<div className="flex items-center justify-between gap-2">
													<div className="text-xs font-semibold">{cat.label}</div>
													<div
														className={cn(
															"text-sm font-bold",
															colorClass === "good" && "text-good",
															colorClass === "warn" && "text-warn",
															colorClass === "critical" && "text-critical",
														)}
													>
														{cat.score}
													</div>
												</div>
												<div className="text-[11px] text-ink-soft">
													{cat.issues.length} issue
													{cat.issues.length === 1 ? "" : "s"}
												</div>
												<div className="h-1 overflow-hidden rounded-full bg-secondary">
													<div
														className={cn(
															"h-full rounded-full",
															colorClass === "good" && "bg-good",
															colorClass === "warn" && "bg-warn",
															colorClass === "critical" && "bg-critical",
														)}
														style={{ width: `${cat.score}%` }}
													/>
												</div>
											</Card>
										);
									},
								)}
							</div>

							<div className="flex flex-col gap-3">
								{CATEGORY_ORDER.filter(
									(k) => selectedNode.categories[k] && modalOpenCat === k,
								).map((k) => {
									const cat = selectedNode.categories[k];
									return (
										<div key={k} className="flex flex-col gap-3">
											{cat.issues.length === 0 && (
												<p className="text-sm text-ink-soft italic">
													No issues found in {cat.label.toLowerCase()} on this
													page.
												</p>
											)}
											{cat.issues.map((iss) => (
												<div
													key={iss.id}
													className="flex items-start gap-3 rounded-(--radius) border border-line bg-surface-2 p-4"
												>
													<span
														className={cn(
															"mt-1 size-2 shrink-0 rounded-full",
															iss.severity === "critical" ? "bg-sev-critical"
															: iss.severity === "high" ? "bg-sev-high"
															: iss.severity === "medium" ? "bg-sev-medium"
															: iss.severity === "low" ? "bg-sev-low"
															:	"border border-sev-info-border bg-sev-info",
														)}
													/>
													<div className="flex flex-1 flex-col gap-1">
														<Badge
															variant={`sev-${iss.severity}` as never}
															className="self-start capitalize"
														>
															{iss.severity}
														</Badge>
														<div className="text-sm font-semibold text-ink">
															{iss.title}
														</div>
														<div className="text-sm text-ink-soft">{iss.detail}</div>
														{iss.fix && (
															<div className="text-sm text-ink-soft italic">
																Fix: {iss.fix}
															</div>
														)}
													</div>
												</div>
											))}
										</div>
									);
								})}
								{!modalOpenCat && (
									<p className="text-sm text-ink-soft italic">
										Click a category above to see its findings for this page.
									</p>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
