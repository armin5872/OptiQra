// Webview-side script for the Crawl Tree panel. Bundled with esbuild
// (see esbuild.js) since it pulls in three.js for the 3D view. Runs inside
// the VS Code webview sandbox — no Node/VS Code APIs here, only
// acquireVsCodeApi() + postMessage.
import * as THREE from "three";

declare function acquireVsCodeApi(): { postMessage: (msg: any) => void };
const vscode = acquireVsCodeApi();

interface CrawlNode { id: string; label: string; category: string; issueCount: number; }
interface CrawlEdge { source: string; target: string; }
interface CrawlGraph { nodes: CrawlNode[]; edges: CrawlEdge[]; }

interface SimNode extends CrawlNode { x: number; y: number; z: number; vx: number; vy: number; vz: number; }

const CATEGORY_COLORS = ["#6366f1", "#a855f7", "#38bdf8", "#34d399", "#facc15", "#fb923c", "#f43f5e", "#22d3ee", "#f472b6", "#84cc16"];
function colorFor(category: string): string {
	let h = 0;
	for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
	return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}
function issueColor(count: number): string {
	if (count === 0) return "#34d399";
	if (count <= 2) return "#38bdf8";
	if (count <= 5) return "#facc15";
	if (count <= 10) return "#fb923c";
	return "#f43f5e";
}

let graph: CrawlGraph = { nodes: [], edges: [] };
let simNodes: SimNode[] = [];
let mode: "2d" | "3d" = "2d";
let selected: SimNode | null = null;

function initSim(g: CrawlGraph) {
	const R = Math.max(200, g.nodes.length * 14);
	simNodes = g.nodes.map((n, i) => {
		const angle = (i / Math.max(1, g.nodes.length)) * Math.PI * 2;
		return {
			...n,
			x: Math.cos(angle) * R * (0.4 + Math.random() * 0.6),
			y: Math.sin(angle) * R * (0.4 + Math.random() * 0.6),
			z: (Math.random() - 0.5) * R * 0.6,
			vx: 0, vy: 0, vz: 0,
		};
	});
}

function stepSim(iterations: number) {
	const idx = new Map(simNodes.map((n, i) => [n.id, i]));
	for (let iter = 0; iter < iterations; iter++) {
		// repulsion
		for (let i = 0; i < simNodes.length; i++) {
			for (let j = i + 1; j < simNodes.length; j++) {
				const a = simNodes[i], b = simNodes[j];
				let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
				let d2 = dx * dx + dy * dy + dz * dz + 0.01;
				const force = 4000 / d2;
				const d = Math.sqrt(d2);
				dx /= d; dy /= d; dz /= d;
				a.vx += dx * force; a.vy += dy * force; a.vz += dz * force * 0.4;
				b.vx -= dx * force; b.vy -= dy * force; b.vz -= dz * force * 0.4;
			}
		}
		// attraction along edges
		for (const e of graph.edges) {
			const a = simNodes[idx.get(e.source)!]; const b = simNodes[idx.get(e.target)!];
			if (!a || !b) continue;
			const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
			const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
			const target = 120;
			const force = (d - target) * 0.02;
			const ux = dx / d, uy = dy / d, uz = dz / d;
			a.vx += ux * force; a.vy += uy * force; a.vz += uz * force * 0.4;
			b.vx -= ux * force; b.vy -= uy * force; b.vz -= uz * force * 0.4;
		}
		// centering + damping
		for (const n of simNodes) {
			n.vx += -n.x * 0.001; n.vy += -n.y * 0.001; n.vz += -n.z * 0.001;
			n.vx *= 0.85; n.vy *= 0.85; n.vz *= 0.85;
			n.x += n.vx; n.y += n.vy; n.z += n.vz;
		}
	}
}

// ---------------- 2D SVG rendering ----------------
const svgHost = document.getElementById("svg-host")!;
function render2D() {
	const w = svgHost.clientWidth, h = svgHost.clientHeight;
	const cx = w / 2, cy = h / 2;
	let svg = `<svg width="${w}" height="${h}" style="cursor:grab;">`;
	svg += `<g id="pan-group" transform="translate(${cx + panX},${cy + panY}) scale(${zoom})">`;
	const idx = new Map(simNodes.map((n, i) => [n.id, i]));
	for (const e of graph.edges) {
		const a = simNodes[idx.get(e.source)!]; const b = simNodes[idx.get(e.target)!];
		if (!a || !b) continue;
		svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2a3142" stroke-width="${1 / zoom}" />`;
	}
	for (const n of simNodes) {
		const r = 6 + Math.min(10, n.issueCount);
		const isSel = selected?.id === n.id;
		svg += `<g class="node" data-id="${escapeAttr(n.id)}" style="cursor:pointer;">
			<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${issueColor(n.issueCount)}" stroke="${isSel ? '#fff' : '#0b0e14'}" stroke-width="${isSel ? 2 : 1}" opacity="0.92"/>
			<text x="${n.x}" y="${n.y + r + 12}" font-size="${10 / Math.max(zoom, 0.6)}" fill="#8b93a7" text-anchor="middle">${escapeXml(n.label)}</text>
		</g>`;
	}
	svg += `</g></svg>`;
	svgHost.innerHTML = svg;
	svgHost.querySelectorAll(".node").forEach((el) => {
		el.addEventListener("click", () => {
			const id = (el as HTMLElement).getAttribute("data-id")!;
			selected = simNodes.find((n) => n.id === id) || null;
			showDetail(selected);
			render2D();
		});
	});
}
function escapeXml(s: string) { return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!)); }
function escapeAttr(s: string) { return s.replace(/"/g, "&quot;"); }

let panX = 0, panY = 0, zoom = 1, dragging = false, lastX = 0, lastY = 0;
svgHost.addEventListener("mousedown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => (dragging = false));
window.addEventListener("mousemove", (e) => {
	if (!dragging || mode !== "2d") return;
	panX += e.clientX - lastX; panY += e.clientY - lastY;
	lastX = e.clientX; lastY = e.clientY;
	render2D();
});
svgHost.addEventListener("wheel", (e) => {
	if (mode !== "2d") return;
	e.preventDefault();
	zoom = Math.max(0.2, Math.min(3, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
	render2D();
});

// ---------------- 3D three.js rendering ----------------
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let rafId = 0;
let rotX = 0.3, rotY = 0.5, camDist = 500;

function init3D() {
	const host = document.getElementById("three-host")!;
	host.innerHTML = "";
	const w = host.clientWidth, h = host.clientHeight;
	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(60, w / h, 1, 5000);
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setSize(w, h);
	host.appendChild(renderer.domElement);

	const lineGeo = new THREE.BufferGeometry();
	const positions: number[] = [];
	const idx = new Map(simNodes.map((n, i) => [n.id, i]));
	for (const e of graph.edges) {
		const a = simNodes[idx.get(e.source)!]; const b = simNodes[idx.get(e.target)!];
		if (!a || !b) continue;
		positions.push(a.x, -a.y, a.z, b.x, -b.y, b.z);
	}
	lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	const lineMat = new THREE.LineBasicMaterial({ color: 0x2a3142, transparent: true, opacity: 0.6 });
	scene.add(new THREE.LineSegments(lineGeo, lineMat));

	const sphereGeo = new THREE.SphereGeometry(1, 12, 12);
	for (const n of simNodes) {
		const r = 4 + Math.min(8, n.issueCount);
		const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(issueColor(n.issueCount)) });
		const mesh = new THREE.Mesh(sphereGeo, mat);
		mesh.scale.setScalar(r);
		mesh.position.set(n.x, -n.y, n.z);
		(mesh as any).userData.nodeId = n.id;
		scene.add(mesh);
	}
	scene.add(new THREE.AmbientLight(0xffffff, 0.6));
	const dl = new THREE.DirectionalLight(0xffffff, 0.8);
	dl.position.set(200, 300, 400);
	scene.add(dl);

	host.onmousedown = (e) => { threeDrag = true; lastX = e.clientX; lastY = e.clientY; };
	window.addEventListener("mouseup", () => (threeDrag = false));
	host.onwheel = (e) => { e.preventDefault(); camDist = Math.max(100, Math.min(2000, camDist + e.deltaY * 0.5)); };
	tick3D();
}
let threeDrag = false;
window.addEventListener("mousemove", (e) => {
	if (!threeDrag || mode !== "3d") return;
	rotY += (e.clientX - lastX) * 0.005;
	rotX = Math.max(-1.4, Math.min(1.4, rotX + (e.clientY - lastY) * 0.005));
	lastX = e.clientX; lastY = e.clientY;
});
function tick3D() {
	if (mode !== "3d" || !renderer || !scene || !camera) return;
	camera.position.set(
		camDist * Math.cos(rotX) * Math.sin(rotY),
		camDist * Math.sin(rotX),
		camDist * Math.cos(rotX) * Math.cos(rotY),
	);
	camera.lookAt(0, 0, 0);
	renderer.render(scene, camera);
	rafId = requestAnimationFrame(tick3D);
}

function showDetail(n: SimNode | null) {
	const el = document.getElementById("detail")!;
	if (!n) { el.innerHTML = '<div style="color:var(--oq-text-dim); padding:16px;">Click a node to see file details.</div>'; return; }
	el.innerHTML = `
		<div style="padding:16px;">
			<div style="font-weight:600; margin-bottom:4px; word-break:break-all;">${escapeXml(n.label)}</div>
			<div style="font-size:11px; color:var(--oq-text-muted); margin-bottom:12px; word-break:break-all;">${escapeXml(n.id)}</div>
			<div class="oq-badge ${n.issueCount === 0 ? "good" : n.issueCount > 5 ? "high" : "medium"}">${n.issueCount} issue(s)</div>
			<div style="margin-top:12px; display:flex; gap:8px;">
				<button class="oq-btn primary" id="detail-open">Open file</button>
				<button class="oq-btn" id="detail-fix">Fix</button>
			</div>
		</div>`;
	document.getElementById("detail-open")!.onclick = () => vscode.postMessage({ type: "openFile", path: n.id });
	document.getElementById("detail-fix")!.onclick = () => vscode.postMessage({ type: "fixFile", path: n.id });
}

function setMode(m: "2d" | "3d") {
	mode = m;
	document.getElementById("svg-host")!.style.display = m === "2d" ? "block" : "none";
	document.getElementById("three-host")!.style.display = m === "3d" ? "block" : "none";
	document.getElementById("btn-2d")!.classList.toggle("primary", m === "2d");
	document.getElementById("btn-3d")!.classList.toggle("primary", m === "3d");
	if (m === "3d") init3D();
	else if (rafId) cancelAnimationFrame(rafId);
}
document.getElementById("btn-2d")!.onclick = () => setMode("2d");
document.getElementById("btn-3d")!.onclick = () => setMode("3d");

window.addEventListener("message", (event) => {
	const msg = event.data;
	if (msg.type === "graph") {
		graph = msg.data;
		initSim(graph);
		stepSim(400);
		render2D();
		showDetail(null);
		(document.getElementById("stats") as HTMLElement).textContent = `${graph.nodes.length} files · ${graph.edges.length} links`;
	}
});

showDetail(null);
vscode.postMessage({ type: "ready" });
