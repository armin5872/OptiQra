"use client";

// A second, more cinematic 3D crawl tree view, built alongside CrawlTree3D.tsx.
// Where CrawlTree3D lays pages out on flat concentric rings, this one twists
// each ring into a spiral arm — like a little galaxy — and adds the visual
// flourishes that make it feel alive: an additive glow behind every node, a
// drifting starfield backdrop, and small light "crawler" pulses that
// continuously travel out along each edge from parent to child, as a
// stand-in for the crawl bot actually walking the site graph.
//
// Same data shape and mount pattern as CrawlTree3D.tsx (vanilla three.js,
// OrbitControls, refs for live-updating data) so it can sit right next to it
// as a selectable view rather than a replacement.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PageNode } from "./CrawlTree";

type Positioned = PageNode & {
	px: number;
	py: number;
	pz: number;
	depth: number;
	parentPx: number;
	parentPy: number;
	parentPz: number;
	phase: number;
};

const RING_GAP = 3.2;
const TWIST_PER_DEPTH = 0.62; // radians each successive ring winds further, for the spiral-arm look
const HEIGHT_SCALE = 2.6;
const BASE_HEIGHT = -1.1;
const PULSE_SPEED = 0.35; // fraction of an edge traveled per second

function scoreColor(score: number): number {
	if (score >= 80) return 0x39d98a;
	if (score >= 60) return 0xf0b93f;
	return 0xef5a63;
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

/** Deterministic 0..1 hash of a string, used to stagger each edge's crawler
 *  pulse so they don't all travel in lockstep. */
function hash01(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return (h % 1000) / 1000;
}

/** Same parent/child resolution as CrawlTree3D's radial layout, but each ring
 *  is rotated by an extra depth-dependent twist so branches spiral outward
 *  instead of sitting on flat concentric circles. */
function layoutGalaxy(pages: PageNode[]): Positioned[] {
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
	for (const p of pages) {
		if (p === root) continue;
		const hasParent = p.parentUrl && byUrl.has(p.parentUrl);
		if (!hasParent) {
			const kids = children.get(root.url) ?? [];
			if (!kids.includes(p)) kids.push(p);
			children.set(root.url, kids);
		}
	}

	type Placed = { px: number; py: number; pz: number };
	const out: Positioned[] = [];

	function place(node: PageNode, angleStart: number, angleEnd: number, depth: number, parent: Placed | null) {
		const angle = (angleStart + angleEnd) / 2 + depth * TWIST_PER_DEPTH;
		const radius = depth * RING_GAP;
		const px = Math.sin(angle) * radius;
		const pz = Math.cos(angle) * radius;
		const py = BASE_HEIGHT + (node.score / 100) * HEIGHT_SCALE;
		const placed: Placed = { px, py, pz };
		out.push({
			...node,
			px,
			py,
			pz,
			depth,
			parentPx: parent ? parent.px : px,
			parentPy: parent ? parent.py : py,
			parentPz: parent ? parent.pz : pz,
			phase: hash01(node.url),
		});

		const kids = (children.get(node.url) ?? []).slice().sort((a, b) => a.url.localeCompare(b.url));
		if (kids.length === 0) return;
		const span = angleEnd - angleStart;
		const step = span / kids.length;
		kids.forEach((k, i) => place(k, angleStart + i * step, angleStart + (i + 1) * step, depth + 1, placed));
	}
	place(root, 0, Math.PI * 2, 0, null);
	return out;
}

/** A small radial-gradient PNG baked onto a canvas, used as a sprite texture
 *  for the soft additive glow behind each node and for the star field —
 *  cheaper than a real bloom post-process pass for this scale of scene. */
function makeGlowTexture(): THREE.Texture {
	const size = 128;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d")!;
	const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(0.4, "rgba(255,255,255,0.55)");
	gradient.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.CanvasTexture(canvas);
	tex.needsUpdate = true;
	return tex;
}

export default function CrawlTree3DGalaxy({
	pages,
	title = "Galaxy crawl tree",
}: {
	pages: PageNode[];
	title?: string;
}) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const [selected, setSelected] = useState<PageNode | null>(null);
	const [autoRotate, setAutoRotate] = useState(true);
	const [warp, setWarp] = useState(false);
	const positioned = useMemo(() => layoutGalaxy(pages), [pages]);

	const positionedRef = useRef(positioned);
	const autoRotateRef = useRef(autoRotate);
	const warpRef = useRef(warp);
	const onPickRef = useRef<(url: string | null) => void>(() => {});

	useEffect(() => {
		positionedRef.current = positioned;
	}, [positioned]);
	useEffect(() => {
		autoRotateRef.current = autoRotate;
	}, [autoRotate]);
	useEffect(() => {
		warpRef.current = warp;
	}, [warp]);
	useEffect(() => {
		onPickRef.current = (url) => setSelected(pages.find((p) => p.url === url) ?? null);
	}, [pages]);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;

		const scene = new THREE.Scene();
		scene.background = null;
		scene.fog = new THREE.FogExp2(0x0a0e1a, 0.018);

		const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 800);
		camera.position.set(10, 9, 12);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		mount.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.minDistance = 3;
		controls.maxDistance = 90;
		controls.autoRotate = autoRotateRef.current;
		controls.autoRotateSpeed = 0.7;

		scene.add(new THREE.AmbientLight(0x6f7bff, 0.55));
		const key = new THREE.DirectionalLight(0xffffff, 0.7);
		key.position.set(6, 12, 4);
		scene.add(key);
		const rim = new THREE.PointLight(0x6a8cff, 1.1, 60);
		rim.position.set(-8, 4, -8);
		scene.add(rim);

		const glowTex = makeGlowTexture();

		// Drifting star field backdrop — purely decorative, rotates slowly and
		// independently of the tree itself so the scene never feels static.
		const starGroup = new THREE.Group();
		scene.add(starGroup);
		{
			const STAR_COUNT = 900;
			const positions = new Float32Array(STAR_COUNT * 3);
			for (let i = 0; i < STAR_COUNT; i++) {
				const r = 40 + Math.random() * 140;
				const theta = Math.random() * Math.PI * 2;
				const phi = Math.acos(2 * Math.random() - 1);
				positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
				positions[i * 3 + 1] = r * Math.cos(phi) * 0.4;
				positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
			}
			const starGeo = new THREE.BufferGeometry();
			starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
			const starMat = new THREE.PointsMaterial({
				size: 1.4,
				map: glowTex,
				transparent: true,
				opacity: 0.55,
				depthWrite: false,
				color: 0xaebbff,
				blending: THREE.AdditiveBlending,
			});
			starGroup.add(new THREE.Points(starGeo, starMat));
		}

		// Faint spiral guide rings on the ground plane, one per depth level
		// currently present, rebuilt only when the deepest ring changes.
		const ringGroup = new THREE.Group();
		scene.add(ringGroup);
		let ringsBuiltForDepth = -1;

		const nodeGroup = new THREE.Group();
		scene.add(nodeGroup);
		const glowGroup = new THREE.Group();
		scene.add(glowGroup);
		const edgeGroup = new THREE.Group();
		scene.add(edgeGroup);
		const pulseGroup = new THREE.Group();
		scene.add(pulseGroup);

		const nodeMeshes = new Map<string, THREE.Mesh>();
		const glowSprites = new Map<string, THREE.Sprite>();
		const edgeLines = new Map<string, THREE.Line>();
		const pulseMeshes = new Map<string, THREE.Mesh>();
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

		function disposeAndRemove(group: THREE.Group, obj: THREE.Mesh | THREE.Line) {
			group.remove(obj);
			obj.geometry.dispose();
			const mat = obj.material;
			if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
			else mat.dispose();
		}

		function syncScene() {
			const data = positionedRef.current;
			const seenUrls = new Set(data.map((d) => d.url));
			const byUrl = new Map(data.map((d) => [d.url, d]));
			const maxDepth = data.reduce((m, d) => Math.max(m, d.depth), 0);

			for (const [url, mesh] of nodeMeshes) {
				if (!seenUrls.has(url)) {
					disposeAndRemove(nodeGroup, mesh);
					nodeMeshes.delete(url);
					growStart.delete(url);
				}
			}
			for (const [url, sprite] of glowSprites) {
				if (!seenUrls.has(url)) {
					glowGroup.remove(sprite);
					(sprite.material as THREE.SpriteMaterial).dispose();
					glowSprites.delete(url);
				}
			}
			for (const [url, line] of edgeLines) {
				if (!seenUrls.has(url)) {
					disposeAndRemove(edgeGroup, line);
					edgeLines.delete(url);
				}
			}
			for (const [url, pulse] of pulseMeshes) {
				if (!seenUrls.has(url)) {
					disposeAndRemove(pulseGroup, pulse);
					pulseMeshes.delete(url);
				}
			}

			if (maxDepth !== ringsBuiltForDepth) {
				for (const child of ringGroup.children) {
					const mesh = child as THREE.Mesh;
					mesh.geometry.dispose();
					(mesh.material as THREE.Material).dispose();
				}
				ringGroup.clear();
				for (let d = 1; d <= maxDepth; d++) {
					const geo = new THREE.RingGeometry(d * RING_GAP - 0.012, d * RING_GAP + 0.012, 96);
					const mat = new THREE.MeshBasicMaterial({
						color: 0x5c6ad6,
						transparent: true,
						opacity: 0.16,
						side: THREE.DoubleSide,
					});
					const ring = new THREE.Mesh(geo, mat);
					ring.rotation.x = -Math.PI / 2;
					ring.position.y = BASE_HEIGHT;
					ringGroup.add(ring);
				}
				ringsBuiltForDepth = maxDepth;
			}

			const t = clock.getElapsedTime();

			for (const node of data) {
				const isRoot = node.depth === 0;
				const radius = isRoot ? 0.34 : 0.19;

				let mesh = nodeMeshes.get(node.url);
				if (!mesh) {
					const geo = new THREE.SphereGeometry(radius, 22, 16);
					const mat = new THREE.MeshStandardMaterial({
						color: scoreColor(node.score),
						emissive: new THREE.Color(scoreColor(node.score)),
						emissiveIntensity: 0.55,
						roughness: 0.35,
						metalness: 0.2,
					});
					mesh = new THREE.Mesh(geo, mat);
					mesh.userData.url = node.url;
					nodeGroup.add(mesh);
					nodeMeshes.set(node.url, mesh);
					growStart.set(node.url, t);
				} else {
					const mat = mesh.material as THREE.MeshStandardMaterial;
					mat.color.setHex(scoreColor(node.score));
					mat.emissive.setHex(scoreColor(node.score));
				}

				// Gentle continuous bob so the whole tree feels alive even when
				// nothing new is streaming in — amplitude/phase vary per node so
				// it doesn't read as one uniform pulse.
				const bob = Math.sin(t * 0.9 + node.phase * Math.PI * 2) * 0.06;
				mesh.position.set(node.px, node.py + bob, node.pz);

				const started = growStart.get(node.url) ?? 0;
				const growT = Math.min(1, (t - started) / 0.5);
				const eased = 1 - Math.pow(1 - growT, 3);
				const isHovered = hoveredUrl === node.url;
				mesh.scale.setScalar((0.1 + eased * 0.9) * (isHovered ? 1.4 : 1));

				let glow = glowSprites.get(node.url);
				if (!glow) {
					const glowMat = new THREE.SpriteMaterial({
						map: glowTex,
						color: scoreColor(node.score),
						transparent: true,
						opacity: 0.55,
						depthWrite: false,
						blending: THREE.AdditiveBlending,
					});
					glow = new THREE.Sprite(glowMat);
					glowGroup.add(glow);
					glowSprites.set(node.url, glow);
				} else {
					(glow.material as THREE.SpriteMaterial).color.setHex(scoreColor(node.score));
				}
				const glowScale = (isRoot ? 1.6 : 1) * (0.6 + eased * 1.1) * (isHovered ? 1.5 : 1);
				glow.scale.setScalar(glowScale);
				glow.position.copy(mesh.position);

				if (node.parentUrl && byUrl.has(node.parentUrl)) {
					const parent = byUrl.get(node.parentUrl)!;
					let line = edgeLines.get(node.url);
					const positions = new Float32Array([parent.px, parent.py, parent.pz, node.px, node.py, node.pz]);
					if (!line) {
						const geo = new THREE.BufferGeometry();
						geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
						const mat = new THREE.LineBasicMaterial({
							color: 0x8fb0ff,
							transparent: true,
							opacity: 0.4,
						});
						line = new THREE.Line(geo, mat);
						edgeGroup.add(line);
						edgeLines.set(node.url, line);
					} else {
						const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
						attr.set(positions);
						attr.needsUpdate = true;
					}
					// Subtle opacity shimmer so even idle edges read as "live wires".
					(line.material as THREE.LineBasicMaterial).opacity = 0.28 + Math.sin(t * 1.3 + node.phase * 6) * 0.12;

					// The traveling "crawler" pulse: a small bright sphere lerping
					// from parent to child on a loop, standing in for the bot
					// walking the link graph. Each edge gets its own phase offset
					// (derived from the URL hash) so they don't all move in sync.
					let pulse = pulseMeshes.get(node.url);
					if (!pulse) {
						const geo = new THREE.SphereGeometry(0.055, 10, 8);
						const mat = new THREE.MeshBasicMaterial({
							color: 0xffffff,
							transparent: true,
							opacity: 0.9,
						});
						pulse = new THREE.Mesh(geo, mat);
						pulseGroup.add(pulse);
						pulseMeshes.set(node.url, pulse);
					}
					const speed = warpRef.current ? PULSE_SPEED * 4 : PULSE_SPEED;
					const progress = (t * speed + node.phase) % 1;
					pulse.position.set(
						parent.px + (node.px - parent.px) * progress,
						parent.py + (node.py - parent.py) * progress + bob,
						parent.pz + (node.pz - parent.pz) * progress,
					);
					(pulse.material as THREE.MeshBasicMaterial).color.setHex(scoreColor(node.score));
				} else {
					const pulse = pulseMeshes.get(node.url);
					if (pulse) {
						disposeAndRemove(pulseGroup, pulse);
						pulseMeshes.delete(node.url);
					}
					const line = edgeLines.get(node.url);
					if (line) {
						disposeAndRemove(edgeGroup, line);
						edgeLines.delete(node.url);
					}
				}
			}
		}

		function animate() {
			raf = requestAnimationFrame(animate);
			syncScene();

			starGroup.rotation.y += 0.0006 * (warpRef.current ? 6 : 1);

			raycaster.setFromCamera(pointer, camera);
			const hit = raycaster.intersectObjects([...nodeMeshes.values()])[0];
			hoveredUrl = hit ? (hit.object.userData.url as string) : null;
			renderer.domElement.style.cursor = hoveredUrl ? "pointer" : "grab";

			controls.autoRotate = autoRotateRef.current;
			controls.autoRotateSpeed = warpRef.current ? 2.6 : 0.7;
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
			glowTex.dispose();
			for (const mesh of nodeMeshes.values()) {
				mesh.geometry.dispose();
				(mesh.material as THREE.Material).dispose();
			}
			for (const sprite of glowSprites.values()) {
				(sprite.material as THREE.Material).dispose();
			}
			for (const line of edgeLines.values()) {
				line.geometry.dispose();
				(line.material as THREE.Material).dispose();
			}
			for (const pulse of pulseMeshes.values()) {
				pulse.geometry.dispose();
				(pulse.material as THREE.Material).dispose();
			}
			for (const child of ringGroup.children) {
				const mesh = child as THREE.Mesh;
				mesh.geometry.dispose();
				(mesh.material as THREE.Material).dispose();
			}
			for (const child of starGroup.children) {
				const pts = child as THREE.Points;
				pts.geometry.dispose();
				(pts.material as THREE.Material).dispose();
			}
			nodeGroup.clear();
			glowGroup.clear();
			edgeGroup.clear();
			pulseGroup.clear();
			ringGroup.clear();
			starGroup.clear();
			renderer.dispose();
			if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
		};
		// Scene is created once; live data flows in via the refs above.
	}, []);

	if (pages.length === 0) return null;

	return (
		<div className="crawl-tree-3d-section crawl-tree-galaxy-section">
			<div className="crawl-tree-head">
				<div className="crawl-tree-head-row">
					<h3>{title}</h3>
					<div className="crawl-tree-stats">
						<span>{pages.length} pages mapped</span>
					</div>
				</div>
				<p className="crawl-tree-hint">
					Drag to orbit, scroll to zoom, click a node for details. Pages spiral
					outward by link depth, height still tracks score, and the small
					bright pulses show the crawl actually walking each link.
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
				<div className="crawl-tree-galaxy-btns">
					<button
						type="button"
						className={`crawl-tree-3d-rotate-btn ${warp ? "active" : ""}`}
						onClick={() => setWarp((v) => !v)}
					>
						{warp ? "🌠 Warp on" : "✨ Warp speed"}
					</button>
					<button
						type="button"
						className={`crawl-tree-3d-rotate-btn ${autoRotate ? "active" : ""}`}
						onClick={() => setAutoRotate((v) => !v)}
					>
						{autoRotate ? "⏸ Stop rotation" : "▶ Auto-rotate"}
					</button>
				</div>
			</div>

			<div className="crawl-tree-3d-canvas crawl-tree-galaxy-canvas" ref={mountRef} />

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
