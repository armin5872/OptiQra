"use client";

// Experimental feature: a 3D radial rendering of the crawl tree, built with
// three.js. Pages fan out from the root in concentric rings — one ring per
// link depth — with each node's height (Y) driven by its audit score, so a
// healthy section of the site reads as a "raised plateau" and a struggling
// one visibly sinks. New nodes pop in with a small scale-up animation as
// they stream in from the live crawl, so this doubles as both the finished
// report's 3D view and the live-scan visualization.
//
// Deliberately hand-rolled with vanilla three.js (no react-three-fiber) to
// match the rest of this codebase's "no extra framework glue" style — see
// CrawlTree.tsx for the equivalent 2D/SVG version this mirrors.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PageNode } from "./CrawlTree";

type Positioned = PageNode & {
	px: number;
	py: number;
	pz: number;
	depth: number;
};

const RING_GAP = 3.6;
const HEIGHT_SCALE = 2.4;
const BASE_HEIGHT = -1.2;

function scoreColor(score: number): number {
	if (score >= 80) return 0x2fbf82;
	if (score >= 60) return 0xe0a935;
	return 0xe0554c;
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

/** Lays every page out radially: depth 0 (root) at the center, depth N on a
 *  ring of radius N * RING_GAP, with siblings spread evenly across the arc
 *  inherited from their parent's angular slice — so branches stay visually
 *  grouped instead of scattering randomly around the ring. */
function layoutRadial(pages: PageNode[]): Positioned[] {
	if (pages.length === 0) return [];
	const byUrl = new Map(pages.map((p) => [p.url, p]));
	const children = new Map<string, PageNode[]>();
	let root: PageNode | null = null;

	for (const p of pages) {
		if (!p.parentUrl || !byUrl.has(p.parentUrl)) {
			if (!root || p.depth < root.depth) root = p;
			continue;
		}
		if (!children.has(p.parentUrl)) children.set(p.parentUrl, []);
		children.get(p.parentUrl)!.push(p);
	}
	if (!root) root = pages[0];
	// Anything else with no resolvable parent (orphaned by out-of-order
	// streaming) still needs a home — hang it off the root so it's visible
	// rather than silently dropped.
	for (const p of pages) {
		if (p === root) continue;
		const hasParent = p.parentUrl && byUrl.has(p.parentUrl);
		if (!hasParent) {
			const kids = children.get(root.url) ?? [];
			if (!kids.includes(p)) kids.push(p);
			children.set(root.url, kids);
		}
	}

	const out: Positioned[] = [];
	function place(node: PageNode, angleStart: number, angleEnd: number, depth: number) {
		const angle = (angleStart + angleEnd) / 2;
		const radius = depth * RING_GAP;
		const px = Math.sin(angle) * radius;
		const pz = Math.cos(angle) * radius;
		const py = BASE_HEIGHT + (node.score / 100) * HEIGHT_SCALE;
		out.push({ ...node, px, py, pz, depth });

		const kids = (children.get(node.url) ?? []).slice().sort((a, b) => a.url.localeCompare(b.url));
		if (kids.length === 0) return;
		const span = angleEnd - angleStart;
		const step = span / kids.length;
		kids.forEach((k, i) => place(k, angleStart + i * step, angleStart + (i + 1) * step, depth + 1));
	}
	place(root, 0, Math.PI * 2, 0);
	return out;
}

export default function CrawlTree3D({
	pages,
	title = "3D crawl tree",
}: {
	pages: PageNode[];
	title?: string;
}) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const [selected, setSelected] = useState<PageNode | null>(null);
	const [autoRotate, setAutoRotate] = useState(true);
	const positioned = useMemo(() => layoutRadial(pages), [pages]);

	// Refs so the animation loop (set up once) can always see the latest
	// data/selection without re-creating the whole scene on every update.
	// Kept in sync via effects rather than during render, since mutating a
	// ref's `.current` while rendering is unsafe.
	const positionedRef = useRef(positioned);
	const autoRotateRef = useRef(autoRotate);
	const onPickRef = useRef<(url: string | null) => void>(() => {});

	useEffect(() => {
		positionedRef.current = positioned;
	}, [positioned]);
	useEffect(() => {
		autoRotateRef.current = autoRotate;
	}, [autoRotate]);
	useEffect(() => {
		onPickRef.current = (url) => setSelected(pages.find((p) => p.url === url) ?? null);
	}, [pages]);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;

		const scene = new THREE.Scene();
		scene.background = null;

		const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
		camera.position.set(9, 8, 9);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		mount.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.minDistance = 3;
		controls.maxDistance = 60;
		controls.autoRotate = autoRotateRef.current;
		controls.autoRotateSpeed = 0.9;

		scene.add(new THREE.AmbientLight(0xffffff, 0.85));
		const key = new THREE.DirectionalLight(0xffffff, 0.9);
		key.position.set(6, 10, 4);
		scene.add(key);

		// Faint concentric ground rings, one per depth level already seen,
		// purely as a visual reference grid — regenerated below as data grows.
		const ringGroup = new THREE.Group();
		scene.add(ringGroup);

		const nodeGroup = new THREE.Group();
		scene.add(nodeGroup);
		const edgeGroup = new THREE.Group();
		scene.add(edgeGroup);

		const nodeMeshes = new Map<string, THREE.Mesh>();
		const growStart = new Map<string, number>();

		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		let hoveredUrl: string | null = null;

		function resize() {
			if (!mount) return;
			const w = mount.clientWidth || 1;
			const h = mount.clientHeight || 1;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		}
		resize();
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(mount);

		function onPointerMove(e: PointerEvent) {
			const rect = renderer.domElement.getBoundingClientRect();
			pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		}
		function onClick() {
			raycaster.setFromCamera(pointer, camera);
			const hit = raycaster.intersectObjects([...nodeMeshes.values()])[0];
			onPickRef.current(hit ? (hit.object.userData.url as string) : null);
		}
		renderer.domElement.addEventListener("pointermove", onPointerMove);
		renderer.domElement.addEventListener("click", onClick);

		let raf = 0;
		const clock = new THREE.Clock();

		function syncScene() {
			const data = positionedRef.current;
			const seenUrls = new Set(data.map((d) => d.url));

			// Remove meshes for nodes no longer present (shouldn't normally
			// happen mid-crawl, but keeps things correct if pages ever gets
			// reset between scans reusing the same mounted component).
			for (const [url, mesh] of nodeMeshes) {
				if (!seenUrls.has(url)) {
					nodeGroup.remove(mesh);
					mesh.geometry.dispose();
					(mesh.material as THREE.Material).dispose();
					nodeMeshes.delete(url);
					growStart.delete(url);
				}
			}

			edgeGroup.clear();
			const byUrl = new Map(data.map((d) => [d.url, d]));
			const maxDepth = data.reduce((m, d) => Math.max(m, d.depth), 0);

			ringGroup.clear();
			for (let d = 1; d <= maxDepth; d++) {
				const geo = new THREE.RingGeometry(d * RING_GAP - 0.02, d * RING_GAP + 0.02, 64);
				const mat = new THREE.MeshBasicMaterial({
					color: 0x9fb3ab,
					transparent: true,
					opacity: 0.16,
					side: THREE.DoubleSide,
				});
				const ring = new THREE.Mesh(geo, mat);
				ring.rotation.x = -Math.PI / 2;
				ring.position.y = BASE_HEIGHT;
				ringGroup.add(ring);
			}

			for (const node of data) {
				let mesh = nodeMeshes.get(node.url);
				const isRoot = node.depth === 0;
				const radius = isRoot ? 0.32 : 0.18;
				if (!mesh) {
					const geo = new THREE.SphereGeometry(radius, 20, 16);
					const mat = new THREE.MeshStandardMaterial({
						color: scoreColor(node.score),
						roughness: 0.45,
						metalness: 0.1,
					});
					mesh = new THREE.Mesh(geo, mat);
					mesh.userData.url = node.url;
					nodeGroup.add(mesh);
					nodeMeshes.set(node.url, mesh);
					growStart.set(node.url, clock.getElapsedTime());
				} else {
					(mesh.material as THREE.MeshStandardMaterial).color.setHex(scoreColor(node.score));
				}
				mesh.position.set(node.px, node.py, node.pz);

				// Pop-in grow animation for the first ~450ms after a node appears.
				const started = growStart.get(node.url) ?? 0;
				const t = Math.min(1, (clock.getElapsedTime() - started) / 0.45);
				const eased = 1 - Math.pow(1 - t, 3);
				const s = 0.15 + eased * 0.85;
				mesh.scale.setScalar(s);

				const isHovered = hoveredUrl === node.url;
				mesh.scale.multiplyScalar(isHovered ? 1.35 : 1);

				// A thin vertical "stem" from the ground ring up to each node
				// makes the score-as-height encoding readable at a glance.
				if (node.py > BASE_HEIGHT + 0.02) {
					const stemGeo = new THREE.CylinderGeometry(0.01, 0.01, node.py - BASE_HEIGHT, 6);
					const stemMat = new THREE.MeshBasicMaterial({
						color: scoreColor(node.score),
						transparent: true,
						opacity: 0.35,
					});
					const stem = new THREE.Mesh(stemGeo, stemMat);
					stem.position.set(node.px, BASE_HEIGHT + (node.py - BASE_HEIGHT) / 2, node.pz);
					edgeGroup.add(stem);
				}

				if (node.parentUrl && byUrl.has(node.parentUrl)) {
					const parent = byUrl.get(node.parentUrl)!;
					const points = [
						new THREE.Vector3(parent.px, parent.py, parent.pz),
						new THREE.Vector3(node.px, node.py, node.pz),
					];
					const geo = new THREE.BufferGeometry().setFromPoints(points);
					const mat = new THREE.LineBasicMaterial({ color: 0x8fa79d, transparent: true, opacity: 0.55 });
					edgeGroup.add(new THREE.Line(geo, mat));
				}
			}
		}

		function animate() {
			raf = requestAnimationFrame(animate);
			syncScene();

			raycaster.setFromCamera(pointer, camera);
			const hit = raycaster.intersectObjects([...nodeMeshes.values()])[0];
			hoveredUrl = hit ? (hit.object.userData.url as string) : null;
			renderer.domElement.style.cursor = hoveredUrl ? "pointer" : "grab";

			controls.autoRotate = autoRotateRef.current;
			controls.update();
			renderer.render(scene, camera);
		}
		animate();

		return () => {
			cancelAnimationFrame(raf);
			resizeObserver.disconnect();
			renderer.domElement.removeEventListener("pointermove", onPointerMove);
			renderer.domElement.removeEventListener("click", onClick);
			controls.dispose();
			for (const mesh of nodeMeshes.values()) {
				mesh.geometry.dispose();
				(mesh.material as THREE.Material).dispose();
			}
			nodeGroup.clear();
			edgeGroup.clear();
			ringGroup.clear();
			renderer.dispose();
			if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
		};
		// Scene is created once; live data flows in via the refs above so it
		// doesn't need to be a dependency here.
	}, []);

	if (pages.length === 0) return null;

	return (
		<div className="crawl-tree-3d-section">
			<div className="crawl-tree-head">
				<div className="crawl-tree-head-row">
					<h3>{title}</h3>
					<div className="crawl-tree-stats">
						<span>{pages.length} pages mapped</span>
					</div>
				</div>
				<p className="crawl-tree-hint">
					Drag to orbit, scroll to zoom, click a node for details. Height
					reflects that page&apos;s score — the terrain rises where the site
					is healthy and dips where it isn&apos;t.
				</p>
			</div>

			<div className="crawl-tree-3d-toolbar">
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
				<button
					type="button"
					className={`crawl-tree-3d-rotate-btn ${autoRotate ? "active" : ""}`}
					onClick={() => setAutoRotate((v) => !v)}
				>
					{autoRotate ? "⏸ Stop rotation" : "▶ Auto-rotate"}
				</button>
			</div>

			<div className="crawl-tree-3d-canvas" ref={mountRef} />

			{selected && (
				<div className="crawl-tree-3d-panel" role="dialog" aria-label={selected.url}>
					<button
						type="button"
						className="crawl-tree-3d-panel-close"
						onClick={() => setSelected(null)}
						aria-label="Close"
					>
						×
					</button>
					<p className="crawl-tree-3d-panel-path">{pathOf(selected.url)}</p>
					<p className="crawl-tree-3d-panel-score">
						Score: <strong>{selected.score}</strong> / 100
					</p>
					<ul className="crawl-tree-3d-panel-cats">
						{Object.entries(selected.categories).map(([key, cat]) => (
							<li key={key}>
								<span>{cat.label}</span>
								<span>{cat.score}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
