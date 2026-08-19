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
let hovered: SimNode | null = null;
let categoryFilter: Set<string> | null = null; // null = all categories shown

function visibleNodes(): SimNode[] {
	return categoryFilter ? simNodes.filter((n) => categoryFilter!.has(n.category)) : simNodes;
}

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

// ---------------- Legend / category filter ----------------
function renderLegend() {
	const cats = [...new Set(graph.nodes.map((n) => n.category))].sort();
	const el = document.getElementById("legend")!;
	if (cats.length <= 1) { el.innerHTML = ""; return; }
	el.innerHTML = cats.map((c) => {
		const active = !categoryFilter || categoryFilter.has(c);
		return `<div class="legend-item${active ? " active" : ""}" data-cat="${escapeAttr(c)}">
			<span class="legend-swatch" style="background:${colorFor(c)}"></span>${escapeXml(c)}
		</div>`;
	}).join("");
	el.querySelectorAll(".legend-item").forEach((elm) => {
		elm.addEventListener("click", () => {
			const cat = (elm as HTMLElement).getAttribute("data-cat")!;
			if (!categoryFilter) categoryFilter = new Set(cats);
			if (categoryFilter.has(cat) && categoryFilter.size === cats.length) {
				categoryFilter = new Set([cat]); // clicking one of "all" isolates it
			} else if (categoryFilter.has(cat)) {
				categoryFilter.delete(cat);
				if (categoryFilter.size === 0) categoryFilter = null;
			} else {
				categoryFilter.add(cat);
				if (categoryFilter.size === cats.length) categoryFilter = null;
			}
			renderLegend();
			if (mode === "2d") render2D(); else rebuildThreeScene();
		});
	});
}

// ---------------- 2D SVG rendering ----------------
const svgHost = document.getElementById("svg-host")!;
function render2D() {
	const w = svgHost.clientWidth, h = svgHost.clientHeight;
	const cx = w / 2, cy = h / 2;
	const vis = new Set(visibleNodes().map((n) => n.id));
	let svg = `<svg width="${w}" height="${h}" style="cursor:${dragging ? "grabbing" : "grab"};">`;
	svg += `<g id="pan-group" transform="translate(${cx + panX},${cy + panY}) scale(${zoom})">`;
	const idx = new Map(simNodes.map((n, i) => [n.id, i]));
	for (const e of graph.edges) {
		if (!vis.has(e.source) || !vis.has(e.target)) continue;
		const a = simNodes[idx.get(e.source)!]; const b = simNodes[idx.get(e.target)!];
		if (!a || !b) continue;
		const dim = selected && selected.id !== e.source && selected.id !== e.target;
		svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${dim ? "#1a1f2b" : "#323b52"}" stroke-width="${1 / zoom}" />`;
	}
	for (const n of simNodes) {
		if (!vis.has(n.id)) continue;
		const r = 6 + Math.min(10, n.issueCount);
		const isSel = selected?.id === n.id;
		const isHov = hovered?.id === n.id;
		const glowR = r + (isSel ? 7 : isHov ? 4 : 0);
		svg += `<g class="node" data-id="${escapeAttr(n.id)}" style="cursor:pointer;">
			${isSel || isHov ? `<circle cx="${n.x}" cy="${n.y}" r="${glowR}" fill="${issueColor(n.issueCount)}" opacity="0.22"/>` : ""}
			<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${issueColor(n.issueCount)}" stroke="${isSel ? "#fff" : "#0b0e14"}" stroke-width="${isSel ? 2 : 1}" opacity="0.94"/>
			<text x="${n.x}" y="${n.y + r + 12}" font-size="${10 / Math.max(zoom, 0.6)}" fill="${isSel || isHov ? "#e7eaf1" : "#8b93a7"}" text-anchor="middle">${escapeXml(n.label)}</text>
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
		el.addEventListener("mouseenter", () => {
			const id = (el as HTMLElement).getAttribute("data-id")!;
			hovered = simNodes.find((n) => n.id === id) || null;
			render2D();
		});
		el.addEventListener("mouseleave", () => { hovered = null; render2D(); });
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
let targetRotX = 0.3, targetRotY = 0.5, targetCamDist = 500;
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const meshByNodeId = new Map<string, THREE.Mesh>();
const baseScaleByNodeId = new Map<string, number>();

function init3D() {
	const host = document.getElementById("three-host")!;
	host.innerHTML = "";
	const w = host.clientWidth, h = host.clientHeight;
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setSize(w, h);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	host.appendChild(renderer.domElement);
	camera = new THREE.PerspectiveCamera(60, w / h, 1, 5000);

	buildThreeScene();

	host.onmousedown = (e) => { threeDrag = true; threeDragMoved = false; lastX = e.clientX; lastY = e.clientY; };
	window.addEventListener("mouseup", () => (threeDrag = false));
	host.onwheel = (e) => { e.preventDefault(); targetCamDist = Math.max(80, Math.min(2200, targetCamDist + e.deltaY * 0.5)); };
	host.onmousemove = (e) => {
		const rect = host.getBoundingClientRect();
		pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		updateHover();
	};
	host.onclick = () => {
		if (threeDragMoved) return; // don't select after a drag-orbit
		if (hoveredMesh) {
			const id = (hoveredMesh.userData as any).nodeId as string;
			selected = simNodes.find((n) => n.id === id) || null;
			showDetail(selected);
			refreshSelectionVisuals();
		} else {
			selected = null;
			showDetail(null);
			refreshSelectionVisuals();
		}
	};
	host.style.cursor = "grab";
	tick3D();
}

function buildThreeScene() {
	scene = new THREE.Scene();
	meshByNodeId.clear();
	baseScaleByNodeId.clear();

	const vis = new Set(visibleNodes().map((n) => n.id));
	const lineGeo = new THREE.BufferGeometry();
	const positions: number[] = [];
	const idx = new Map(simNodes.map((n, i) => [n.id, i]));
	for (const e of graph.edges) {
		if (!vis.has(e.source) || !vis.has(e.target)) continue;
		const a = simNodes[idx.get(e.source)!]; const b = simNodes[idx.get(e.target)!];
		if (!a || !b) continue;
		positions.push(a.x, -a.y, a.z, b.x, -b.y, b.z);
	}
	lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	const lineMat = new THREE.LineBasicMaterial({ color: 0x323b52, transparent: true, opacity: 0.55 });
	scene.add(new THREE.LineSegments(lineGeo, lineMat));

	const sphereGeo = new THREE.SphereGeometry(1, 20, 20);
	const glowGeo = new THREE.SphereGeometry(1, 16, 16);
	for (const n of simNodes) {
		if (!vis.has(n.id)) continue;
		const r = 4 + Math.min(8, n.issueCount);
		const color = new THREE.Color(issueColor(n.issueCount));

		const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 });
		const mesh = new THREE.Mesh(sphereGeo, mat);
		mesh.scale.setScalar(r);
		mesh.position.set(n.x, -n.y, n.z);
		(mesh as any).userData.nodeId = n.id;
		scene.add(mesh);
		meshByNodeId.set(n.id, mesh);
		baseScaleByNodeId.set(n.id, r);

		// Soft glow halo — a separate transparent back-face sphere, standard
		// cheap trick to fake bloom without a full postprocessing pipeline.
		const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.BackSide });
		const glow = new THREE.Mesh(glowGeo, glowMat);
		glow.scale.setScalar(r * 1.9);
		glow.position.copy(mesh.position);
		(glow as any).userData.isGlow = true;
		(glow as any).userData.nodeId = n.id;
		scene.add(glow);
	}
	scene.add(new THREE.AmbientLight(0xffffff, 0.55));
	const dl = new THREE.DirectionalLight(0xffffff, 0.9);
	dl.position.set(200, 300, 400);
	scene.add(dl);
	const dl2 = new THREE.DirectionalLight(0x6366f1, 0.3);
	dl2.position.set(-300, -100, -200);
	scene.add(dl2);

	refreshSelectionVisuals();
}

function rebuildThreeScene() {
	if (mode !== "3d" || !renderer) return;
	buildThreeScene();
}

let hoveredMesh: THREE.Mesh | null = null;
function updateHover() {
	if (!camera || !scene) return;
	raycaster.setFromCamera(pointerNdc, camera);
	const candidates = [...meshByNodeId.values()];
	const hits = raycaster.intersectObjects(candidates, false);
	const newHovered = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
	if (newHovered !== hoveredMesh) {
		hoveredMesh = newHovered;
		hovered = hoveredMesh ? simNodes.find((n) => n.id === (hoveredMesh!.userData as any).nodeId) || null : null;
		const host = document.getElementById("three-host")!;
		host.style.cursor = hoveredMesh ? "pointer" : threeDrag ? "grabbing" : "grab";
		refreshSelectionVisuals();
	}
}

function refreshSelectionVisuals() {
	for (const [id, mesh] of meshByNodeId) {
		const base = baseScaleByNodeId.get(id) ?? 4;
		const isSel = selected?.id === id;
		const isHov = hovered?.id === id;
		const targetScale = base * (isSel ? 1.35 : isHov ? 1.15 : 1);
		mesh.scale.setScalar(targetScale);
		const mat = mesh.material as THREE.MeshStandardMaterial;
		mat.emissiveIntensity = isSel ? 0.9 : isHov ? 0.6 : 0.35;
	}
}

let threeDrag = false, threeDragMoved = false;
window.addEventListener("mousemove", (e) => {
	if (!threeDrag || mode !== "3d") return;
	targetRotY += (e.clientX - lastX) * 0.006;
	targetRotX = Math.max(-1.45, Math.min(1.45, targetRotX + (e.clientY - lastY) * 0.006));
	lastX = e.clientX; lastY = e.clientY;
	threeDragMoved = true;
	const host = document.getElementById("three-host")!;
	host.style.cursor = "grabbing";
});
function tick3D() {
	if (mode !== "3d" || !renderer || !scene || !camera) return;
	// Smooth/inertial camera easing instead of snapping directly to target —
	// small touch, but it's the difference between "spinning a chart" and
	// feeling like you're orbiting something solid.
	rotX += (targetRotX - rotX) * 0.15;
	rotY += (targetRotY - rotY) * 0.15;
	camDist += (targetCamDist - camDist) * 0.15;
	camera.position.set(
		camDist * Math.cos(rotX) * Math.sin(rotY),
		camDist * Math.sin(rotX),
		camDist * Math.cos(rotX) * Math.cos(rotY),
	);
	camera.lookAt(0, 0, 0);

	// Gentle pulse on the selected node's glow so it reads as "active" even
	// when the camera isn't moving.
	if (selected) {
		const glow = [...scene.children].find((c) => (c as any).userData?.isGlow && (c as any).userData?.nodeId === selected!.id) as THREE.Mesh | undefined;
		if (glow) {
			const t = performance.now() / 500;
			const pulse = 1 + Math.sin(t) * 0.08;
			const base = baseScaleByNodeId.get(selected.id) ?? 4;
			glow.scale.setScalar(base * 1.9 * pulse);
		}
	}

	renderer.render(scene, camera);
	rafId = requestAnimationFrame(tick3D);
}

function showDetail(n: SimNode | null) {
	const el = document.getElementById("detail")!;
	if (!n) {
		el.innerHTML = `<div style="padding:20px; color:var(--oq-text-dim); text-align:center;">
			<div style="font-size:28px; margin-bottom:8px;">🕸️</div>
			Click a node to see file details.<br/>
			<span style="font-size:11px;">In 3D: hover to preview, click to select, drag to orbit, scroll to zoom.</span>
		</div>`;
		return;
	}
	const sevBadge = n.issueCount === 0 ? "good" : n.issueCount > 5 ? "high" : "medium";
	el.innerHTML = `
		<div style="padding:16px;">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
				<span style="width:10px;height:10px;border-radius:50%;background:${issueColor(n.issueCount)};flex-shrink:0;box-shadow:0 0 8px ${issueColor(n.issueCount)}80;"></span>
				<div style="font-weight:600; word-break:break-all;">${escapeXml(n.label)}</div>
			</div>
			<div style="font-size:11px; color:var(--oq-text-muted); margin-bottom:12px; word-break:break-all; padding-left:18px;">${escapeXml(n.id)}</div>
			<div style="display:flex; gap:6px; padding-left:18px; margin-bottom:4px;">
				<div class="oq-badge ${sevBadge}">${n.issueCount} issue(s)</div>
				<div class="oq-badge informational" style="background:${colorFor(n.category)}22; color:${colorFor(n.category)};">${escapeXml(n.category)}</div>
			</div>
			<div style="margin-top:14px; display:flex; gap:8px; padding-left:18px;">
				<button class="oq-btn primary" id="detail-open">Open file</button>
				<button class="oq-btn" id="detail-fix" ${n.issueCount === 0 ? "disabled" : ""}>Fix</button>
			</div>
			<div style="margin-top:14px; padding:14px 18px 0; border-top:1px solid var(--oq-border); font-size:11px; color:var(--oq-text-dim);">
				Connected to ${graph.edges.filter((e) => e.source === n.id || e.target === n.id).length} other file(s) in the crawl graph.
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

window.addEventListener("resize", () => {
	if (mode === "3d" && renderer && camera) {
		const host = document.getElementById("three-host")!;
		camera.aspect = host.clientWidth / host.clientHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(host.clientWidth, host.clientHeight);
	} else if (mode === "2d") {
		render2D();
	}
});

window.addEventListener("message", (event) => {
	const msg = event.data;
	if (msg.type === "graph") {
		graph = msg.data;
		initSim(graph);
		stepSim(400);
		renderLegend();
		render2D();
		showDetail(null);
		const totalIssues = graph.nodes.reduce((sum: number, n: CrawlNode) => sum + n.issueCount, 0);
		(document.getElementById("stats") as HTMLElement).textContent =
			`${graph.nodes.length} files · ${graph.edges.length} links · ${totalIssues} issue(s)`;
	}
});

showDetail(null);
vscode.postMessage({ type: "ready" });
