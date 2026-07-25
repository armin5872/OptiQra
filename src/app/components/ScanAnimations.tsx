"use client";

// Experimental feature: alternate visualizations for the "Crawling the
// site…" screen, swapped in for the default CSS page-flip animation
// (`.crawl-scanner` in globals.css / page.tsx). Three styles:
//
//  - NetworkPulse3D: a three.js particle field with a ripple pulse fired
//    from the center every time a new page finishes scanning.
//  - RadarSweep: a pure-SVG/CSS radar sweep, with a blip lighting up for
//    each newly scanned page at a position derived from its URL.
//  - MatrixRain: a canvas 2D "digital rain" background using the actual
//    crawled URL paths as falling glyphs instead of random characters.
//
// All three only need `scanned` (a monotonically increasing count) and
// optionally `currentUrl` to animate — they don't need the full PageNode
// list, so they work equally well as a lightweight decorative loop.

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type ScanAnimationStyle = "classic" | "network" | "radar" | "matrix";

export const SCAN_ANIMATION_OPTIONS: { id: ScanAnimationStyle; label: string; icon: string }[] = [
	{ id: "classic", label: "Classic", icon: "📄" },
	{ id: "network", label: "Network pulse (3D)", icon: "🕸️" },
	{ id: "radar", label: "Radar sweep", icon: "📡" },
	{ id: "matrix", label: "Digital rain", icon: "🌧️" },
];

/** Small pill row so the scanning screen can let people flip between
 *  animation styles without touching global settings/i18n — this is
 *  intentionally a lightweight, local-only control. */
export function ScanAnimationPicker({
	value,
	onChange,
}: {
	value: ScanAnimationStyle;
	onChange: (v: ScanAnimationStyle) => void;
}) {
	return (
		<div className="scan-anim-picker" role="radiogroup" aria-label="Scan animation style">
			{SCAN_ANIMATION_OPTIONS.map((opt) => (
				<button
					key={opt.id}
					type="button"
					role="radio"
					aria-checked={value === opt.id}
					className={`scan-anim-pill ${value === opt.id ? "active" : ""}`}
					onClick={() => onChange(opt.id)}
				>
					<span aria-hidden="true">{opt.icon}</span> {opt.label}
				</button>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Network pulse (three.js)                                            */
/* ------------------------------------------------------------------ */

export function NetworkPulse3D({ scanned }: { scanned: number }) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const scannedRef = useRef(scanned);
	const pulseQueueRef = useRef(0);

	useEffect(() => {
		if (scanned > scannedRef.current) pulseQueueRef.current += scanned - scannedRef.current;
		scannedRef.current = scanned;
	}, [scanned]);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
		camera.position.set(0, 0, 9);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		mount.appendChild(renderer.domElement);

		const COUNT = 90;
		const positions = new Float32Array(COUNT * 3);
		const velocities: THREE.Vector3[] = [];
		for (let i = 0; i < COUNT; i++) {
			const r = 4 + Math.random() * 2.5;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
			positions[i * 3 + 2] = r * Math.cos(phi);
			velocities.push(new THREE.Vector3((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004));
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		const mat = new THREE.PointsMaterial({ color: 0x6505ff, size: 0.09, transparent: true, opacity: 0.85 });
		const points = new THREE.Points(geo, mat);
		scene.add(points);

		// Sparse connecting lines between nearby points, rebuilt each frame
		// from a capped number of nearest pairs (cheap enough at this scale).
		const lineGeo = new THREE.BufferGeometry();
		const lineMat = new THREE.LineBasicMaterial({ color: 0x8fa79d, transparent: true, opacity: 0.25 });
		const lines = new THREE.LineSegments(lineGeo, lineMat);
		scene.add(lines);

		type Pulse = { mesh: THREE.Mesh; start: number };
		const pulses: Pulse[] = [];
		const clock = new THREE.Clock();

		function resize() {
			if (!mount) return;
			const w = mount.clientWidth || 1;
			const h = mount.clientHeight || 1;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		}
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(mount);

		let raf = 0;
		function animate() {
			raf = requestAnimationFrame(animate);
			const pos = geo.attributes.position as THREE.BufferAttribute;
			for (let i = 0; i < COUNT; i++) {
				let x = pos.getX(i) + velocities[i].x;
				let y = pos.getY(i) + velocities[i].y;
				let z = pos.getZ(i) + velocities[i].z;
				const dist = Math.hypot(x, y, z);
				if (dist > 6.8 || dist < 3.2) {
					velocities[i].multiplyScalar(-1);
					x += velocities[i].x * 2;
					y += velocities[i].y * 2;
					z += velocities[i].z * 2;
				}
				pos.setXYZ(i, x, y, z);
			}
			pos.needsUpdate = true;

			// Rebuild sparse links: connect each point to its nearest 2
			// neighbors within range — gives a "network" look without O(n^2)
			// blowing up since COUNT is small.
			const linePositions: number[] = [];
			for (let i = 0; i < COUNT; i++) {
				const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
				let best = -1, bestD = Infinity;
				for (let j = 0; j < COUNT; j++) {
					if (i === j) continue;
					const d = (pos.getX(j) - ax) ** 2 + (pos.getY(j) - ay) ** 2 + (pos.getZ(j) - az) ** 2;
					if (d < bestD) { bestD = d; best = j; }
				}
				if (best >= 0 && bestD < 2.4) {
					linePositions.push(ax, ay, az, pos.getX(best), pos.getY(best), pos.getZ(best));
				}
			}
			lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));

			points.rotation.y += 0.0015;
			lines.rotation.y += 0.0015;

			// Fire queued pulses (one ripple ring per newly-scanned page,
			// throttled so a burst of progress events doesn't spam dozens at
			// once — one every ~120ms is plenty to read as "activity").
			if (pulseQueueRef.current > 0 && clock.getElapsedTime() % 1 < 0.02) {
				pulseQueueRef.current -= 1;
			}
			if (pulseQueueRef.current > 0 && pulses.length < 6 && Math.random() < 0.15) {
				const ringGeo = new THREE.RingGeometry(0.05, 0.14, 32);
				const ringMat = new THREE.MeshBasicMaterial({ color: 0x2fbf82, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
				const mesh = new THREE.Mesh(ringGeo, ringMat);
				mesh.lookAt(camera.position);
				scene.add(mesh);
				pulses.push({ mesh, start: clock.getElapsedTime() });
				pulseQueueRef.current -= 1;
			}
			for (let i = pulses.length - 1; i >= 0; i--) {
				const p = pulses[i];
				const t = clock.getElapsedTime() - p.start;
				if (t > 1.4) {
					scene.remove(p.mesh);
					p.mesh.geometry.dispose();
					(p.mesh.material as THREE.Material).dispose();
					pulses.splice(i, 1);
					continue;
				}
				const scale = 1 + t * 7;
				p.mesh.scale.setScalar(scale);
				(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 0.7);
			}

			renderer.render(scene, camera);
		}
		animate();

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			geo.dispose();
			mat.dispose();
			lineGeo.dispose();
			lineMat.dispose();
			for (const p of pulses) {
				p.mesh.geometry.dispose();
				(p.mesh.material as THREE.Material).dispose();
			}
			renderer.dispose();
			if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
		};
	}, []);

	return <div className="scan-anim-network" ref={mountRef} />;
}

/* ------------------------------------------------------------------ */
/* Radar sweep (SVG/CSS)                                               */
/* ------------------------------------------------------------------ */

export function RadarSweep({ scanned, currentUrl }: { scanned: number; currentUrl?: string }) {
	const blipsRef = useRef<{ id: number; x: number; y: number }[]>([]);
	const lastScanned = useRef(scanned);
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (scanned <= lastScanned.current) return;
		lastScanned.current = scanned;
		const seed = currentUrl ? Array.from(currentUrl).reduce((a, c) => a + c.charCodeAt(0), 0) : scanned * 37;
		const angle = (seed % 360) * (Math.PI / 180);
		const radius = 18 + (seed % 70);
		const x = 50 + Math.cos(angle) * (radius / 100) * 46;
		const y = 50 + Math.sin(angle) * (radius / 100) * 46;
		const el = containerRef.current;
		const id = Date.now() + Math.random();
		blipsRef.current = [...blipsRef.current.slice(-24), { id, x, y }];
		if (el) {
			const span = document.createElement("span");
			span.className = "scan-anim-radar-blip";
			span.style.left = `${x}%`;
			span.style.top = `${y}%`;
			el.appendChild(span);
			setTimeout(() => span.remove(), 2200);
		}
	}, [scanned, currentUrl]);

	return (
		<div className="scan-anim-radar">
			<div className="scan-anim-radar-rings">
				<span /> <span /> <span /> <span />
			</div>
			<div className="scan-anim-radar-crosshair" />
			<div className="scan-anim-radar-sweep" />
			<div className="scan-anim-radar-blips" ref={containerRef} />
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Digital rain (canvas 2D)                                            */
/* ------------------------------------------------------------------ */

export function MatrixRain({ currentUrl }: { currentUrl?: string }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glyphPoolRef = useRef<string[]>(["/", "*", "0", "1", "#", "?", "&", "="]);

	useEffect(() => {
		if (!currentUrl) return;
		try {
			const path = new URL(currentUrl).pathname;
			const parts = path.split(/[/\-_.]/).filter(Boolean);
			if (parts.length) {
				glyphPoolRef.current = Array.from(new Set([...glyphPoolRef.current, ...parts.join("").slice(0, 40).split("")])).slice(-60);
			}
		} catch {
			// non-URL currentUrl values just get ignored; the fallback glyph
			// pool above keeps the rain running regardless.
		}
	}, [currentUrl]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const parent = canvas.parentElement;

		let cols: number[] = [];
		const fontSize = 14;

		function resize() {
			if (!canvas || !parent) return;
			canvas.width = parent.clientWidth;
			canvas.height = parent.clientHeight;
			const colCount = Math.floor(canvas.width / fontSize);
			cols = new Array(colCount).fill(0).map(() => Math.random() * -50);
		}
		resize();
		const ro = new ResizeObserver(resize);
		if (parent) ro.observe(parent);

		let raf = 0;
		function draw() {
			if (!canvas || !ctx) return;
			ctx.fillStyle = "rgba(18, 33, 28, 0.12)";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.font = `${fontSize}px monospace`;
			for (let i = 0; i < cols.length; i++) {
				const pool = glyphPoolRef.current;
				const glyph = pool[Math.floor(Math.random() * pool.length)] ?? "0";
				const x = i * fontSize;
				const y = cols[i] * fontSize;
				ctx.fillStyle = Math.random() < 0.06 ? "#e8fff4" : "#2fbf82";
				ctx.fillText(glyph, x, y);
				if (y > canvas.height && Math.random() > 0.975) cols[i] = 0;
				else cols[i] += 1;
			}
			raf = requestAnimationFrame(draw);
		}
		draw();

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, []);

	return (
		<div className="scan-anim-matrix">
			<canvas ref={canvasRef} />
		</div>
	);
}
