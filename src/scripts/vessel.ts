// A crewed survey vessel built from primitives and canvas textures, no model files.
// Bow to stern along +Z to -Z: a command module with a lit cockpit and docking port, a node carrying the
// high-gain antenna, a spinning habitat ring with one pod per bay, a truss spine with a pressurized corridor,
// solar wings, radiator wings, propellant tanks, a reactor behind its shadow shield, and a plasma engine.
// The command module and each bay are sections: each has a picking proxy, a highlight shell, a point the
// page's leaders start from, and a centre and reach the camera can close in on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// What sets a bay's pod apart from the others
export type BayFeature = 'court' | 'observatory' | 'music' | 'map' | 'arcade';
export type Bay = { stencil: string; feature: BayFeature };

export type Section = {
	anchor: THREE.Object3D; // on the hull, where the page's leaders start
	center: THREE.Object3D; // what the camera closes in on
	reach: number; // radius that has to fit the close-up frame, in world units
	proxy: THREE.Mesh; // invisible, simple shape for pointer picking
	ringAngle?: number; // a bay's angle on the habitat ring, at ring rotation 0
};

export type Vessel = {
	root: THREE.Group; // placed and turned along its orbit by the plot; holds the scaled model
	ring: THREE.Group; // the habitat ring, which spins about the vessel's long axis
	sections: Section[]; // the command module, then one per bay in order
	reach: number; // bounding radius, in root units
	materials: THREE.MeshStandardMaterial[]; // they take the sky as an environment map once it loads
	highlight(hover: number, selected: number): void; // section indexes, or -1
	update(t: number, dt: number, near: number): void; // near: 0 far away, 1 in the vessel's close-up
};

const SCALE = 0.085; // model units to world units: about one unit long, overall
const RING_Z = 2.85, RING_R = 2.35, POD_R = 0.4;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y_AXIS = V(0, 1, 0), Z_AXIS = V(0, 0, 1);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function rng(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function toTexture(cv: HTMLCanvasElement, srgb: boolean) {
	const t = new THREE.CanvasTexture(cv);
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
	const cv = document.createElement('canvas');
	cv.width = w;
	cv.height = h;
	draw(cv.getContext('2d')!);
	return toTexture(cv, srgb);
}

const STENCILS = ['NO STEP', 'H2O FILL', 'N2 VENT', 'GRAPPLE', 'EVA ACCESS', 'DO NOT TOUCH', 'RCS', 'PWR BUS B', 'TEMP SENSOR', 'O2 PURGE', 'MMOD 4', 'DATA 12', 'TETHER PT', 'LOCK', 'HATCH 2'];
const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

// Painted hull plating: a colour map, a height map for bump (seams sunk, fasteners raised) and a roughness map,
// drawn together so they line up. Panels keep a square-ish look on the part: aspect is circumference over length.
// Everything is drawn on a 2048-wide logical canvas and scaled to the real resolution.
type PlateOpts = { seed: number; aspect: number; res?: number; base?: [number, number, number]; title?: string; sub?: string; stripe?: string; grime?: number };
function plateSet(o: PlateOpts) {
	const res = o.res ?? 1024, S = res / 2048;
	const LW = 2048, LH = Math.round(THREE.MathUtils.clamp(2048 / o.aspect, 256, 2048) / 4) * 4;
	const make = () => { const cv = document.createElement('canvas'); cv.width = res; cv.height = Math.round(LH * S); return cv; };
	const colCv = make(), hgtCv = make(), rghCv = make();
	const [c, h, r] = [colCv, hgtCv, rghCv].map((cv) => { const g = cv.getContext('2d')!; g.scale(S, S); return g; });
	const rand = rng(o.seed);
	const [br, bg, bb] = o.base ?? [212, 209, 201];
	const grey = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;
	c.fillStyle = `rgb(${br},${bg},${bb})`;
	c.fillRect(0, 0, LW, LH);
	h.fillStyle = grey(128);
	h.fillRect(0, 0, LW, LH);
	r.fillStyle = grey(170);
	r.fillRect(0, 0, LW, LH);

	// Panels by recursive splits, mostly across the long axis
	const panels: [number, number, number, number][] = [];
	const minS = 90;
	const split = (x: number, y: number, w: number, hh: number, d: number) => {
		if ((w < minS * 2 && hh < minS * 2) || (d > 2 && rand() < 0.3)) { panels.push([x, y, w, hh]); return; }
		const vertical = w > hh ? rand() < 0.8 : rand() < 0.2;
		if (vertical && w >= minS * 2) { const k = x + Math.round(w * (0.3 + rand() * 0.4)); split(x, y, k - x, hh, d + 1); split(k, y, x + w - k, hh, d + 1); }
		else if (hh >= minS * 2) { const k = y + Math.round(hh * (0.3 + rand() * 0.4)); split(x, y, w, k - y, d + 1); split(x, k, w, y + hh - k, d + 1); }
		else panels.push([x, y, w, hh]);
	};
	split(0, 0, LW, LH, 0);

	for (const [x, y, w, hh] of panels) {
		const k = (rand() - 0.5) * 16, warm = (rand() - 0.5) * 6;
		const insert = rand() < 0.08;
		c.fillStyle = insert ? `rgb(${150 + k},${152 + k},${150 + k})` : `rgb(${br + k + warm},${bg + k},${bb + k - warm})`;
		c.fillRect(x, y, w, hh);
		h.fillStyle = grey(insert ? 120 : 130 + (rand() - 0.5) * 12);
		h.fillRect(x, y, w, hh);
		r.fillStyle = grey(insert ? 120 : 140 + rand() * 70);
		r.fillRect(x, y, w, hh);
		// Sunk seams, with a little grime caught in them
		c.strokeStyle = 'rgba(52,50,46,0.6)';
		c.lineWidth = 2.5;
		c.strokeRect(x + 1, y + 1, w - 2, hh - 2);
		c.strokeStyle = 'rgba(60,56,50,0.12)';
		c.lineWidth = 9;
		c.strokeRect(x + 4, y + 4, w - 8, hh - 8);
		h.strokeStyle = grey(40);
		h.lineWidth = 4;
		h.strokeRect(x + 1, y + 1, w - 2, hh - 2);
		// Fastener rows just inside the seams
		if (rand() < 0.6) {
			const step = 16 + Math.round(rand() * 8);
			const dot = (xx: number, yy: number) => {
				c.fillStyle = 'rgba(70,68,64,0.5)'; c.fillRect(xx - 1.5, yy - 1.5, 3, 3);
				h.fillStyle = grey(200); h.fillRect(xx - 1.5, yy - 1.5, 3, 3);
			};
			for (let s = x + 10; s < x + w - 6; s += step) { dot(s, y + 8); dot(s, y + hh - 8); }
			for (let s = y + 10; s < y + hh - 6; s += step) { dot(x + 8, s); dot(x + w - 8, s); }
		}
		// One feature at most per panel
		const f = rand();
		if (f < 0.12 && w > 120 && hh > 120) {
			// A hatch: inset outline, a handle, a placard
			const ix = x + 18, iy = y + 18, iw = Math.min(w - 36, 150), ih = Math.min(hh - 36, 150);
			c.strokeStyle = 'rgba(40,40,40,0.55)'; c.lineWidth = 3; c.strokeRect(ix, iy, iw, ih);
			h.strokeStyle = grey(70); h.lineWidth = 5; h.strokeRect(ix, iy, iw, ih);
			c.fillStyle = 'rgba(60,62,66,0.85)'; c.fillRect(ix + iw / 2 - 18, iy + ih / 2 - 4, 36, 8);
			h.fillStyle = grey(210); h.fillRect(ix + iw / 2 - 18, iy + ih / 2 - 4, 36, 8);
			c.fillStyle = 'rgba(232,186,60,0.9)'; c.fillRect(ix + 6, iy + 6, 26, 10);
		} else if (f < 0.2 && w > 100 && hh > 60) {
			// A vent grille
			const gx = x + 14, gy = y + 14, gw = Math.min(w - 28, 120), gh = Math.min(hh - 28, 70);
			for (let s = 0; s < gh; s += 7) {
				c.fillStyle = 'rgba(30,30,32,0.75)'; c.fillRect(gx, gy + s, gw, 3);
				h.fillStyle = grey(60); h.fillRect(gx, gy + s, gw, 3);
				r.fillStyle = grey(90); r.fillRect(gx, gy + s, gw, 3);
			}
		} else if (f < 0.27) {
			// A placard of fine print
			const px = x + 12 + rand() * Math.max(0, w - 90), py = y + 12 + rand() * Math.max(0, hh - 50);
			c.fillStyle = 'rgba(236,234,226,0.95)'; c.fillRect(px, py, 70, 34);
			c.fillStyle = 'rgba(40,44,52,0.7)';
			for (let l = 0; l < 4; l++) c.fillRect(px + 5, py + 5 + l * 7, 40 + rand() * 20, 2);
		} else if (f < 0.31 && w > 80) {
			// Caution stripes along one edge
			const sx = x + 6, sy = y + hh - 22, sw = Math.min(w - 12, 160);
			c.save(); c.beginPath(); c.rect(sx, sy, sw, 14); c.clip();
			for (let s = -20; s < sw + 20; s += 20) {
				c.fillStyle = '#e1b23a'; c.beginPath(); c.moveTo(sx + s, sy + 14); c.lineTo(sx + s + 10, sy); c.lineTo(sx + s + 20, sy); c.lineTo(sx + s + 10, sy + 14); c.fill();
				c.fillStyle = '#1d1d1f'; c.beginPath(); c.moveTo(sx + s + 10, sy + 14); c.lineTo(sx + s + 20, sy); c.lineTo(sx + s + 30, sy); c.lineTo(sx + s + 20, sy + 14); c.fill();
			}
			c.restore();
		}
	}

	// Stencils, running along the part's length
	for (let n = 0; n < 10; n++) {
		c.save();
		c.translate(rand() * LW, rand() * LH);
		c.rotate(-Math.PI / 2);
		c.fillStyle = `rgba(38,42,50,${0.55 + rand() * 0.3})`;
		c.font = `600 ${14 + Math.round(rand() * 8)}px ${FONT}`;
		c.fillText(STENCILS[Math.floor(rand() * STENCILS.length)], 0, 0);
		c.restore();
	}

	// Wear: streaks along the length, soft discolouration, scuffs
	const grime = o.grime ?? 1;
	for (let n = 0; n < 40 * grime; n++) {
		const x = rand() * LW, y = rand() * LH, len = 40 + rand() * 260;
		const g = c.createLinearGradient(x, y, x, y + len);
		g.addColorStop(0, `rgba(120,104,84,${0.05 + rand() * 0.08})`);
		g.addColorStop(1, 'rgba(120,104,84,0)');
		c.fillStyle = g;
		c.fillRect(x, y, 2 + rand() * 7, len);
	}
	for (let n = 0; n < 22 * grime; n++) {
		const x = rand() * LW, y = rand() * LH, rad = 30 + rand() * 160;
		const g = c.createRadialGradient(x, y, 0, x, y, rad);
		g.addColorStop(0, `rgba(96,92,84,${0.04 + rand() * 0.06})`);
		g.addColorStop(1, 'rgba(96,92,84,0)');
		c.fillStyle = g;
		c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
	}
	for (let n = 0; n < 60 * grime; n++) {
		const x = rand() * LW, y = rand() * LH, a = rand() * Math.PI, len = 6 + rand() * 30;
		c.strokeStyle = rand() < 0.5 ? 'rgba(250,250,246,0.35)' : 'rgba(70,66,60,0.3)';
		c.lineWidth = 1;
		c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
	}

	if (o.stripe) {
		c.fillStyle = o.stripe;
		c.fillRect(LW / 2 - 74, 0, 16, LH);
		c.fillRect(LW / 2 + 58, 0, 16, LH);
	}
	if (o.title) {
		c.save();
		c.translate(LW / 2, LH / 2);
		c.rotate(-Math.PI / 2);
		c.textAlign = 'center';
		c.fillStyle = 'rgba(30,34,42,0.9)';
		c.font = `bold ${Math.round(Math.min(64, LH * 0.12))}px ${FONT}`;
		c.fillText(o.title, 0, 10);
		if (o.sub) {
			c.font = `600 ${Math.round(Math.min(24, LH * 0.05))}px ${FONT}`;
			c.fillText(o.sub, 0, 44);
		}
		c.restore();
	}
	return { map: toTexture(colCv, true), bump: toTexture(hgtCv, false), rough: toTexture(rghCv, false) };
}

// Multi-layer insulation: crinkled metallised foil, gold, silver or black, with taped seams
function foilTexture(seed: number, base: string, light: string, dark: string) {
	return canvasTexture(1024, 1024, (g) => {
		const r = rng(seed);
		g.fillStyle = base;
		g.fillRect(0, 0, 1024, 1024);
		for (let n = 0; n < 9000; n++) {
			g.strokeStyle = r() < 0.5 ? light : dark;
			g.globalAlpha = 0.1 + r() * 0.25;
			g.lineWidth = 0.6 + r() * 2;
			let x = r() * 1024, y = r() * 1024;
			g.beginPath();
			g.moveTo(x, y);
			for (let s = 0; s < 3; s++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
			g.stroke();
		}
		g.globalAlpha = 0.55;
		g.fillStyle = dark;
		for (let n = 0; n < 9; n++) g.fillRect(0, r() * 1024, 1024, 4);
		g.globalAlpha = 0.8;
		g.fillStyle = '#e9e4d6';
		for (let n = 0; n < 4; n++) g.fillRect(r() * 1024, 0, 14, 1024);
		g.globalAlpha = 1;
	});
}

// Solar blankets: cells with a slight colour spread, silver bus lines, hinge gaps between folded segments
function solarTexture() {
	return canvasTexture(4096, 512, (g) => {
		const r = rng(5);
		g.fillStyle = '#8a929d';
		g.fillRect(0, 0, 4096, 512);
		const cols = 96, rows = 10, cw = 4096 / cols, ch = 512 / rows;
		for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
			const x = i * cw + 2, y = j * ch + 2, k = (r() - 0.5) * 10;
			const grad = g.createLinearGradient(x, y, x + cw, y + ch);
			grad.addColorStop(0, `rgb(${28 + k},${44 + k},${86 + k})`);
			grad.addColorStop(1, `rgb(${12 + k},${22 + k},${50 + k})`);
			g.fillStyle = grad;
			g.fillRect(x, y, cw - 4, ch - 4);
			g.fillStyle = 'rgba(150,170,205,0.28)';
			for (let f = 1; f < 5; f++) g.fillRect(x, y + (f * (ch - 4)) / 5, cw - 4, 1);
			g.fillRect(x + (cw - 4) / 2, y, 1, ch - 4);
		}
		g.fillStyle = '#05080f';
		for (let i = 12; i < cols; i += 12) g.fillRect(i * cw - 5, 0, 10, 512);
		g.fillStyle = '#b9bec6';
		g.fillRect(0, 0, 4096, 6);
		g.fillRect(0, 506, 4096, 6);
	});
}

// Radiator panels: white coating over fluid channels that run out from the manifold, a little scorched
function radiatorTexture() {
	return canvasTexture(1024, 1024, (g) => {
		const r = rng(9);
		g.fillStyle = '#e6e4de';
		g.fillRect(0, 0, 1024, 1024);
		for (let x = 0; x < 1024; x += 16) {
			g.fillStyle = '#c6c3bb'; g.fillRect(x, 0, 4, 1024);
			g.fillStyle = '#f6f5f1'; g.fillRect(x + 4, 0, 2, 1024);
		}
		g.fillStyle = '#aeaaa2';
		g.fillRect(0, 0, 1024, 18);
		g.fillRect(0, 1006, 1024, 18);
		for (let n = 0; n < 30; n++) {
			const x = r() * 1024, y = r() * 1024, rad = 40 + r() * 140;
			const gr = g.createRadialGradient(x, y, 0, x, y, rad);
			gr.addColorStop(0, 'rgba(140,128,108,0.08)');
			gr.addColorStop(1, 'rgba(140,128,108,0)');
			g.fillStyle = gr;
			g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
		}
	});
}

function gradientTexture(stops: [number, string][]) {
	return canvasTexture(4, 256, (g) => {
		const grad = g.createLinearGradient(0, 0, 0, 256);
		stops.forEach(([o, c]) => grad.addColorStop(o, c));
		g.fillStyle = grad;
		g.fillRect(0, 0, 4, 256);
	});
}

function dotTexture() {
	const t = canvasTexture(64, 64, (g) => {
		const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
		grad.addColorStop(0, 'rgba(255,255,255,1)');
		grad.addColorStop(0.2, 'rgba(255,255,255,0.7)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = grad;
		g.fillRect(0, 0, 64, 64);
	});
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	return t;
}

// Geometry is collected per material and merged, so each part of the vessel draws in a few dozen calls.
// A section's parts also merge into one highlight shell.
class Parts {
	private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
	add(mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
		if (m) g.applyMatrix4(m);
		if (!this.byMat.has(mat)) this.byMat.set(mat, []);
		this.byMat.get(mat)!.push(g);
	}
	build(parent: THREE.Object3D, shell?: THREE.Material) {
		const all: THREE.BufferGeometry[] = [];
		for (const [mat, gs] of this.byMat) {
			const merged = mergeGeometries(gs, false)!;
			const mesh = new THREE.Mesh(merged, mat);
			const lit = !(mat instanceof THREE.MeshBasicMaterial);
			mesh.castShadow = mesh.receiveShadow = lit;
			parent.add(mesh);
			if (shell && lit) all.push(merged);
			gs.forEach((g) => g.dispose());
		}
		if (!shell || !all.length) return null;
		const geo = mergeGeometries(all, false);
		if (!geo) return null;
		const m = new THREE.Mesh(geo, shell);
		m.renderOrder = 2;
		m.visible = false;
		parent.add(m);
		return m;
	}
}

// A cylinder (or frustum) along Z from z0 to z1, radius r0 at z0 and r1 at z1
function tube(r0: number, r1: number, z0: number, z1: number, seg = 48) {
	const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1);
	g.rotateX(Math.PI / 2);
	g.translate(0, 0, (z0 + z1) / 2);
	return g;
}

// A rod between two points
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) {
	const d = b.clone().sub(a);
	const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
	g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.normalize()));
	g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
	return g;
}

// A ring around the Z axis
function hoop(r: number, tubeR: number, z: number, seg = 64) {
	const g = new THREE.TorusGeometry(r, tubeR, 8, seg);
	g.translate(0, 0, z);
	return g;
}

function box(w: number, h: number, d: number, m: THREE.Matrix4) {
	const g = new THREE.BoxGeometry(w, h, d);
	g.applyMatrix4(m);
	return g;
}

// A smooth cable or pipe through points
function pipe(points: THREE.Vector3[], r: number, segs = 48) {
	return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, 8, false);
}

const basis = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, p: THREE.Vector3) => new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
type Add = (mat: THREE.Material, g: THREE.BufferGeometry) => void;

// Small hardware scattered over a cylinder about Z: boxes (some stacked), canisters, conduits and sensor domes,
// each sitting on the surface and facing out. avoid(theta, z) keeps windows and markings clear;
// theta is measured in the XY plane from +X.
function greebles(add: Add, mats: THREE.Material[], o: { r: number; z0: number; z1: number; n: number; seed: number; size?: number; avoid?: (th: number, z: number) => boolean }) {
	const rand = rng(o.seed);
	const k = o.size ?? 1;
	const pick = () => mats[Math.floor(rand() * mats.length)];
	for (let i = 0; i < o.n; i++) {
		const th = rand() * Math.PI * 2, z = o.z0 + rand() * (o.z1 - o.z0);
		if (o.avoid?.(th, z)) continue;
		const radial = V(Math.cos(th), Math.sin(th), 0), tan = V(-Math.sin(th), Math.cos(th), 0);
		const on = (lift: number) => radial.clone().multiplyScalar(o.r + lift).add(V(0, 0, z));
		const kind = rand();
		if (kind < 0.5) {
			const w = (0.03 + rand() * 0.1) * k, d = (0.03 + rand() * 0.12) * k, hh = (0.008 + rand() * 0.035) * k;
			add(pick(), box(w, hh, d, basis(tan, radial, Z_AXIS, on(hh / 2))));
			if (rand() < 0.45) {
				const h2 = hh * (0.5 + rand() * 0.6);
				add(pick(), box(w * (0.3 + rand() * 0.4), h2, d * (0.3 + rand() * 0.4), basis(tan, radial, Z_AXIS, on(hh + h2 / 2))));
			}
		} else if (kind < 0.68) {
			const cr = (0.012 + rand() * 0.022) * k, len = (0.05 + rand() * 0.14) * k;
			const g = new THREE.CylinderGeometry(cr, cr, len, 10);
			g.rotateX(Math.PI / 2);
			add(pick(), g.applyMatrix4(basis(tan, radial, Z_AXIS, on(cr))));
			add(mats[0], box(cr * 2.4, 0.004 * k, 0.012 * k, basis(tan, radial, Z_AXIS, on(0.002 * k))));
		} else if (kind < 0.86) {
			const len = (0.12 + rand() * 0.4) * k, s = 0.012 * k;
			add(pick(), box(s, s, len, basis(tan, radial, Z_AXIS, on(s / 2 + 0.004 * k))));
		} else {
			const dr = (0.012 + rand() * 0.02) * k;
			add(pick(), new THREE.SphereGeometry(dr, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(basis(tan, radial, Z_AXIS, on(0))));
		}
	}
}

// A handrail standing off a surface: the rail and its posts
function handrail(add: Add, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, normal: THREE.Vector3, stand = 0.045) {
	const n = normal.clone().normalize().multiplyScalar(stand);
	add(mat, strut(a.clone().add(n), b.clone().add(n), 0.009, 6));
	const posts = Math.max(2, Math.round(a.distanceTo(b) / 0.18) + 1);
	for (let i = 0; i < posts; i++) {
		const p = a.clone().lerp(b, i / (posts - 1));
		add(mat, strut(p, p.clone().add(n), 0.007, 6));
	}
}

export function buildVessel(bays: Bay[]): Vessel {
	const materials = new Set<THREE.MeshStandardMaterial>();
	const std = (p: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(p); materials.add(m); return m; };
	const phys = (p: THREE.MeshPhysicalMaterialParameters) => { const m = new THREE.MeshPhysicalMaterial(p); materials.add(m); return m; };
	const plate = (o: PlateOpts, repeatV = 1) => {
		const s = plateSet(o);
		for (const t of [s.map, s.bump, s.rough]) t.repeat.set(1, repeatV);
		return std({ map: s.map, bumpMap: s.bump, bumpScale: 1.6, roughnessMap: s.rough, roughness: 1, metalness: 0.06 });
	};
	const goldTex = foilTexture(11, '#a8741f', '#f2cc72', '#5e3e0e');
	const silverTex = foilTexture(17, '#a3a7ad', '#f1f3f6', '#53585f');
	const blackTex = foilTexture(23, '#1d1e21', '#4b4d52', '#0b0b0c');

	const m = {
		hullLong: plate({ seed: 31, aspect: 1 }, 5),
		node: plate({ seed: 37, aspect: 2.6 }),
		gold: std({ map: goldTex, bumpMap: goldTex, bumpScale: 2, roughness: 0.32, metalness: 1 }),
		silver: std({ map: silverTex, bumpMap: silverTex, bumpScale: 2, roughness: 0.28, metalness: 1 }),
		kapton: std({ map: blackTex, bumpMap: blackTex, bumpScale: 2, roughness: 0.5, metalness: 0.4 }),
		metal: std({ color: '#a5aab2', roughness: 0.34, metalness: 0.88 }),
		gunmetal: std({ color: '#4b5058', roughness: 0.42, metalness: 0.8 }),
		dark: std({ color: '#25282d', roughness: 0.58, metalness: 0.55 }),
		truss: std({ color: '#8b9098', roughness: 0.4, metalness: 0.8 }),
		copper: std({ color: '#b26c3a', roughness: 0.32, metalness: 1 }),
		paint: std({ color: '#d8d5cd', roughness: 0.62, metalness: 0.05 }),
		rail: std({ color: '#c9a64a', roughness: 0.45, metalness: 0.3 }),
		solar: phys({ map: solarTexture(), roughness: 0.18, metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12, iridescence: 0.45, iridescenceIOR: 1.7, side: THREE.DoubleSide }),
		radiator: std({ map: radiatorTexture(), roughness: 0.5, metalness: 0.05 }),
		glass: phys({ color: '#0a0e14', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }),
		window: std({ color: '#000000', emissive: '#ffc786', emissiveIntensity: 2.4 }),
		cockpit: std({ color: '#000000', emissive: '#a6d6ff', emissiveIntensity: 2 }),
		arcade: std({ color: '#000000', emissive: '#8fe8ff', emissiveIntensity: 2.4 }),
		cupola: phys({ color: '#10161f', emissive: '#ffd9a6', emissiveIntensity: 0.5, roughness: 0.06, metalness: 0.2, clearcoat: 1 }),
	};
	const hardware = [m.gunmetal, m.metal, m.dark, m.gold, m.silver, m.kapton, m.paint];

	const root = new THREE.Group();
	const model = new THREE.Group();
	model.scale.setScalar(SCALE);
	root.add(model);
	const hull = new Parts();
	const hullAdd: Add = (mat, g) => hull.add(mat, g);
	const sections: Section[] = [];
	const glow: { value: number; mesh: THREE.Mesh | null; u: { value: number } }[] = [];
	const shellMat = () => {
		const u = { value: 0 };
		const mat = new THREE.ShaderMaterial({
			uniforms: { uOn: u, uColor: { value: new THREE.Color('#ffb347') } },
			vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
				void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
			fragmentShader: /* glsl */ `uniform float uOn; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
				void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uColor * (0.1 + 1.5 * f) * uOn, 1.0); }`,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			depthFunc: THREE.LessEqualDepth,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1,
		});
		return { mat, u };
	};
	const marker = (parent: THREE.Object3D, p: THREE.Vector3) => {
		const o = new THREE.Object3D();
		o.position.copy(p);
		parent.add(o);
		return o;
	};
	const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

	// ---------- Command module: section 0 ----------
	{
		const cm = new Parts();
		const add: Add = (mat, g) => cm.add(mat, g);
		const cmPlate = plate({ seed: 5, aspect: (Math.PI * 2 * 0.62) / 0.94, res: 2048, title: 'ML-1', sub: 'SURVEY VESSEL  ·  COMMAND' });
		const nosePlate = plate({ seed: 7, aspect: (Math.PI * 2 * 0.5) / 0.66, grime: 1.4 });
		add(cmPlate, tube(0.62, 0.62, 3.78, 4.72, 64));
		add(nosePlate, tube(0.62, 0.34, 4.72, 5.32, 64));
		for (const [z, tr] of [[3.78, 0.032], [4.12, 0.012], [4.46, 0.012], [4.72, 0.032]] as const) add(m.metal, hoop(0.625, tr, z, 96));
		add(m.metal, tube(0.27, 0.27, 5.32, 5.52, 32));
		add(m.gunmetal, hoop(0.28, 0.04, 5.52, 48));
		add(m.dark, tube(0.2, 0.2, 5.52, 5.56, 32));
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2 + 0.3;
			add(m.metal, box(0.09, 0.03, 0.16, new THREE.Matrix4().makeRotationZ(a).setPosition(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 5.6)));
			add(m.gunmetal, box(0.04, 0.05, 0.04, new THREE.Matrix4().makeRotationZ(a).setPosition(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 5.68)));
		}
		// Cockpit windows set into the nose cone, framed, facing up and forward
		const slope = 0.28 / 0.6;
		for (let i = 0; i < 5; i++) {
			const a = THREE.MathUtils.degToRad(-56 + i * 28);
			const radial = V(Math.sin(a), Math.cos(a), 0);
			const z = 4.95, r = 0.62 - slope * (z - 4.72);
			const n = radial.clone().add(V(0, 0, slope)).normalize();
			const t = radial.clone().multiplyScalar(-slope).add(Z_AXIS).normalize();
			const x = t.clone().cross(n);
			const pos = radial.clone().multiplyScalar(r).add(V(0, 0, z));
			add(m.gunmetal, box(0.22, 0.19, 0.03, basis(x, t, n, pos.clone().addScaledVector(n, 0.002))));
			add(m.glass, box(0.18, 0.15, 0.02, basis(x, t, n, pos.clone().addScaledVector(n, 0.012))));
			add(m.cockpit, box(0.15, 0.12, 0.02, basis(x, t, n, pos.clone().addScaledVector(n, 0.004))));
		}
		// Reaction control quads: a housing and five small nozzles
		for (let i = 0; i < 4; i++) {
			const a = Math.PI / 4 + (i * Math.PI) / 2;
			const radial = V(Math.sin(a), Math.cos(a), 0), tan = V(Math.cos(a), -Math.sin(a), 0);
			const c = radial.clone().multiplyScalar(0.68).add(V(0, 0, 4.5));
			add(m.paint, box(0.14, 0.11, 0.2, basis(tan, radial, Z_AXIS, c)));
			add(m.kapton, box(0.145, 0.02, 0.205, basis(tan, radial, Z_AXIS, c.clone().addScaledVector(radial, 0.05))));
			for (const [dir, d] of [[tan, 0.09], [tan.clone().negate(), 0.09], [Z_AXIS, 0.12], [Z_AXIS.clone().negate(), 0.12], [radial, 0.07]] as const) {
				const bell = new THREE.CylinderGeometry(0.012, 0.024, 0.04, 12, 1, true);
				bell.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir));
				const p = c.clone().addScaledVector(dir, d);
				add(m.gunmetal, bell.translate(p.x, p.y, p.z));
			}
		}
		// Handrails either side of the markings
		for (const a of [-0.3, 0.3, Math.PI - 0.3, Math.PI + 0.3]) {
			const radial = V(Math.sin(a), Math.cos(a), 0);
			handrail(add, m.rail, radial.clone().multiplyScalar(0.62).add(V(0, 0, 3.84)), radial.clone().multiplyScalar(0.62).add(V(0, 0, 4.66)), radial);
		}
		// Hardware around the hull, clear of the markings on top and the thruster ring
		greebles(add, hardware, { r: 0.62, z0: 3.82, z1: 4.68, n: 80, seed: 41, avoid: (th, z) => Math.abs(wrap(th - Math.PI / 2)) < 0.55 || (z > 4.38 && z < 4.62) });
		add(m.metal, strut(V(-0.45, 0.42, 4.2), V(-0.82, 0.86, 4.0), 0.006));
		add(m.metal, strut(V(0.5, -0.36, 4.4), V(0.92, -0.62, 4.6), 0.006));
		add(m.paint, new THREE.SphereGeometry(0.035, 12, 8).translate(0.92, -0.62, 4.6));
		const { mat, u } = shellMat();
		glow.push({ value: 0, mesh: cm.build(model, mat), u });
		const proxy = new THREE.Mesh(tube(0.72, 0.42, 3.7, 5.7, 16), proxyMat);
		model.add(proxy);
		sections.push({ anchor: marker(model, V(0, 0.66, 4.3)), center: marker(model, V(0, 0, 4.6)), reach: 1.3 * SCALE, proxy });
	}

	// ---------- Node, berthing ports and high-gain antenna ----------
	hull.add(m.node, tube(0.46, 0.46, 3.28, 3.78, 48));
	hull.add(m.gold, tube(0.47, 0.47, 3.4, 3.66, 48));
	for (const s of [-1, 1]) {
		hull.add(m.paint, new THREE.CylinderGeometry(0.22, 0.22, 0.32, 32).rotateZ(Math.PI / 2), at(s * 0.6, 0, 3.53));
		hull.add(m.dark, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 32).rotateZ(Math.PI / 2), at(s * 0.77, 0, 3.53));
		hull.add(m.metal, new THREE.TorusGeometry(0.23, 0.025, 8, 32).rotateY(Math.PI / 2), at(s * 0.75, 0, 3.53));
	}
	const mastBase = V(0, 0.44, 3.55), mastTop = V(-0.25, 1.3, 3.4);
	hull.add(m.metal, strut(mastBase, mastTop, 0.035, 10));
	hull.add(m.gunmetal, strut(mastBase, mastBase.clone().lerp(mastTop, 0.2), 0.055, 12));
	hull.add(m.dark, box(0.14, 0.12, 0.14, at(mastTop.x, mastTop.y, mastTop.z)));
	{
		const aim = V(-0.45, 0.5, 0.74).normalize();
		const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, aim);
		const pts = Array.from({ length: 16 }, (_, i) => { const r = (i / 15) * 0.55; return new THREE.Vector2(r, 0.42 * r * r); });
		const center = mastTop.clone().addScaledVector(aim, 0.06);
		hull.add(m.paint, new THREE.LatheGeometry(pts, 64).applyQuaternion(q).translate(center.x, center.y, center.z));
		const rc = center.clone().addScaledVector(aim, 0.42 * 0.55 * 0.55);
		hull.add(m.metal, new THREE.TorusGeometry(0.55, 0.01, 6, 64).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z_AXIS, aim)).translate(rc.x, rc.y, rc.z));
		const focusPt = center.clone().addScaledVector(aim, 0.42);
		const side = V(1, 0, 0).cross(aim).normalize(), side2 = aim.clone().cross(side);
		for (let i = 0; i < 4; i++) {
			const a = (i / 4) * Math.PI * 2;
			const rim = center.clone().addScaledVector(side, Math.cos(a) * 0.5).addScaledVector(side2, Math.sin(a) * 0.5).addScaledVector(aim, 0.11);
			hull.add(m.metal, strut(rim, focusPt, 0.008));
		}
		hull.add(m.gunmetal, new THREE.CylinderGeometry(0.045, 0.025, 0.09, 16).applyQuaternion(q), at(focusPt.x, focusPt.y, focusPt.z));
		const back = mastTop.clone().addScaledVector(aim, -0.02);
		hull.add(m.gold, box(0.18, 0.18, 0.08, new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Z_AXIS, aim)).setPosition(back)));
	}

	// ---------- Hub: the bearing the ring turns on ----------
	hull.add(m.dark, tube(0.5, 0.5, 2.45, 3.28, 48));
	hull.add(m.metal, hoop(0.52, 0.045, 2.5));
	hull.add(m.metal, hoop(0.52, 0.045, 3.22));
	for (let i = 0; i < 24; i++) {
		const a = (i / 24) * Math.PI * 2;
		hull.add(m.gunmetal, box(0.03, 0.02, 0.6, new THREE.Matrix4().makeRotationZ(a).setPosition(-Math.sin(a) * 0.51, Math.cos(a) * 0.51, 2.86)));
	}

	// ---------- Habitat ring: rim truss, spokes, and one pod per bay ----------
	const ring = new THREE.Group();
	ring.position.z = RING_Z;
	model.add(ring);
	const rp = new Parts();
	rp.add(m.paint, tube(0.56, 0.56, -0.24, 0.24, 48));
	rp.add(m.gold, tube(0.565, 0.565, -0.1, 0.1, 48));
	for (const z of [-0.15, 0.15]) rp.add(m.truss, hoop(RING_R, 0.045, z, 192));
	rp.add(m.gold, hoop(RING_R, 0.03, 0, 192));
	rp.add(m.kapton, hoop(RING_R - 0.09, 0.022, 0, 192));
	for (let i = 0; i < 72; i++) {
		const a = (i / 72) * Math.PI * 2, b = ((i + 1) / 72) * Math.PI * 2;
		const p = (ang: number, z: number) => V(Math.cos(ang) * RING_R, Math.sin(ang) * RING_R, z);
		rp.add(m.truss, strut(p(a, -0.15), p(a, 0.15), 0.02));
		rp.add(m.truss, strut(p(a, -0.15), p(b, 0.15), 0.013));
		rp.add(m.truss, strut(p(a, 0.15), p(b, -0.15), 0.013));
		if (i % 3 === 0) rp.add(m.gunmetal, box(0.05, 0.05, 0.36, new THREE.Matrix4().makeRotationZ(a).setPosition(p(a, 0))));
	}
	const shieldPlate = plate({ seed: 80, aspect: 5, base: [196, 194, 188], grime: 1.3 });
	const podAngles = bays.map((_, i) => Math.PI / 2 + (i * Math.PI * 2) / bays.length);
	bays.forEach((bay, i) => {
		const th = podAngles[i];
		const radial = V(Math.cos(th), Math.sin(th), 0), tangent = V(-Math.sin(th), Math.cos(th), 0);
		const center = radial.clone().multiplyScalar(RING_R);
		const frame = basis(radial, tangent, Z_AXIS.clone(), center);
		const pod = new Parts();
		const local: Add = (mat, g) => pod.add(mat, g, frame);
		const P = (g: THREE.BufferGeometry, mat: THREE.Material) => local(mat, g);
		const L = bay.feature === 'court' ? 1.35 : 1.05;
		const accent = { court: '#c8662e', arcade: '#3d8fb0', observatory: '#6c5fb0', music: '#a33a4a', map: '#3f8a5a' }[bay.feature];

		// Spoke: a pressurized crew tube from the hub collar out to the pod, collared, with a pipe, a rail and tension cables
		const spokeA = radial.clone().multiplyScalar(0.56), spokeB = radial.clone().multiplyScalar(RING_R - POD_R + 0.02);
		pod.add(m.hullLong, strut(spokeA, spokeB, 0.085, 24));
		for (let k = 0; k <= 5; k++) {
			const r = 0.64 + (k / 5) * (RING_R - POD_R - 0.7);
			pod.add(m.metal, new THREE.TorusGeometry(0.092, 0.012, 8, 24).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z_AXIS, radial)), at(radial.x * r, radial.y * r, 0));
		}
		pod.add(m.gold, pipe([spokeA.clone().add(V(0, 0, 0.1)), spokeA.clone().lerp(spokeB, 0.5).add(V(0, 0, 0.11)), spokeB.clone().add(V(0, 0, 0.1))], 0.016, 24));
		handrail((mat, g) => pod.add(mat, g), m.rail, spokeA.clone().add(V(0, 0, -0.085)), spokeB.clone().add(V(0, 0, -0.085)), V(0, 0, -1), 0.035);
		for (const s of [-1, 1]) {
			const off = V(Math.cos(th + s * 0.2), Math.sin(th + s * 0.2), 0).multiplyScalar(RING_R);
			pod.add(m.metal, strut(radial.clone().multiplyScalar(0.58).add(V(0, 0, s * 0.18)), off, 0.01));
		}

		// Pod body, in its own frame: x outboard, y along the ring, z forward (the window face).
		// Painted plating carries the bay's name on the forward face.
		const podPlate = plate({ seed: 60 + i * 7, aspect: (Math.PI * 2 * POD_R) / L, title: bay.stencil, sub: `HABITAT BAY ${i + 1}`, stripe: accent });
		P(new THREE.CylinderGeometry(POD_R, POD_R, L, 64, 1, false, Math.PI), podPlate);
		for (const s of [-1, 1]) {
			const dome = new THREE.SphereGeometry(POD_R, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2);
			dome.scale(1, 0.42, 1);
			if (s < 0) dome.rotateX(Math.PI);
			P(dome.translate(0, (s * L) / 2, 0), m.paint);
			P(new THREE.TorusGeometry(POD_R + 0.006, 0.03, 8, 64).rotateX(Math.PI / 2).translate(0, (s * L) / 2, 0), m.metal);
			P(new THREE.TorusGeometry(0.14, 0.022, 8, 32).rotateX(Math.PI / 2).translate(0, s * (L / 2 + POD_R * 0.42 - 0.01), 0), m.gunmetal);
		}
		for (const y of [-L / 4, L / 4]) P(new THREE.TorusGeometry(POD_R + 0.004, 0.012, 6, 64).rotateX(Math.PI / 2).translate(0, y, 0), m.metal);

		// Debris shields: stand-off panels around the back and sides, leaving the window face clear
		const span = (Math.PI * 2 - 1.5) / 4;
		for (const [y0, y1] of [[-L / 2 + 0.06, -0.04], [0.04, L / 2 - 0.06]] as const) {
			for (let k = 0; k < 4; k++) {
				const g = new THREE.CylinderGeometry(POD_R + 0.03, POD_R + 0.03, y1 - y0, 16, 1, true, 0.79 + k * span, span - 0.08);
				P(g.translate(0, (y0 + y1) / 2, 0), shieldPlate);
			}
		}

		// Windows along the forward face, framed, with handrails either side
		const n = bay.feature === 'court' ? 5 : 4;
		const light = bay.feature === 'arcade' ? m.arcade : m.window;
		for (let w = 0; w < n; w++) {
			const y = (w - (n - 1) / 2) * (L / (n + 0.6));
			if (bay.feature === 'music') {
				P(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 32).rotateX(Math.PI / 2).translate(0, y, POD_R - 0.002), m.gunmetal);
				P(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 32).rotateX(Math.PI / 2).translate(0, y, POD_R + 0.008), m.glass);
				P(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 32).rotateX(Math.PI / 2).translate(0, y, POD_R + 0.002), light);
			} else {
				P(new THREE.BoxGeometry(0.17, 0.2, 0.025).translate(0, y, POD_R - 0.004), m.gunmetal);
				P(new THREE.BoxGeometry(0.13, 0.16, 0.02).translate(0, y, POD_R + 0.008), m.glass);
				P(new THREE.BoxGeometry(0.11, 0.14, 0.02).translate(0, y, POD_R + 0.002), light);
			}
		}
		for (const s of [-1, 1]) {
			const a = V(s * 0.16, -L / 2 + 0.08, Math.sqrt(POD_R * POD_R - 0.16 * 0.16));
			handrail(local, m.rail, a, a.clone().setY(L / 2 - 0.08), V(s * 0.4, 0, 1));
		}
		if (bay.feature === 'arcade') P(new THREE.BoxGeometry(0.02, L * 0.8, 0.02).translate(-0.12, 0, POD_R + 0.012), m.arcade);
		// A white radiator on the outboard side
		P(new THREE.BoxGeometry(0.36, L * 0.62, 0.016).translate(POD_R + 0.2, 0, -0.05), m.radiator);
		P(new THREE.BoxGeometry(0.03, L * 0.64, 0.03).translate(POD_R + 0.02, 0, -0.05), m.gunmetal);

		// Hardware over the shields, clear of the windows and the radiator. Greebles are laid out about Z,
		// so they are turned onto the pod's axis first: theta -90° lands on the window face, 0° outboard.
		const podM = frame.clone().multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
		greebles((mat, g) => pod.add(mat, g, podM), hardware, {
			r: POD_R + 0.03, z0: -L / 2 + 0.08, z1: L / 2 - 0.08, n: 46, seed: 90 + i, size: 0.8,
			avoid: (t) => Math.abs(wrap(t + Math.PI / 2)) < 0.9 || Math.abs(wrap(t)) < 0.35 || Math.abs(wrap(t - Math.PI)) < 0.3,
		});

		if (bay.feature === 'observatory') {
			// A glazed cupola on the forward face and a telescope looking outboard
			P(new THREE.SphereGeometry(0.17, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, L * 0.32, POD_R - 0.03), m.cupola);
			P(new THREE.TorusGeometry(0.17, 0.022, 8, 32).translate(0, L * 0.32, POD_R - 0.02), m.gunmetal);
			for (let k = 0; k < 6; k++) {
				const a = (k / 6) * Math.PI * 2;
				P(strut(V(0, L * 0.32, POD_R + 0.14), V(Math.cos(a) * 0.165, L * 0.32 + Math.sin(a) * 0.165, POD_R - 0.02), 0.006), m.gunmetal);
			}
			const tilt = new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + 0.35);
			P(new THREE.CylinderGeometry(0.07, 0.07, 0.46, 24).applyMatrix4(tilt).translate(POD_R + 0.14, -L * 0.22, 0.12), m.paint);
			P(new THREE.CylinderGeometry(0.073, 0.073, 0.06, 24).applyMatrix4(tilt).translate(POD_R + 0.34, -L * 0.22 + 0.07, 0.12), m.gunmetal);
			P(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24).applyMatrix4(tilt).translate(POD_R + 0.37, -L * 0.22 + 0.08, 0.12), m.glass);
		}
		if (bay.feature === 'map') {
			// A steerable dish and a whip antenna
			const pts = Array.from({ length: 10 }, (_, k) => { const r = (k / 9) * 0.18; return new THREE.Vector2(r, 1.1 * r * r); });
			P(new THREE.LatheGeometry(pts, 32).rotateZ(-Math.PI / 2).translate(POD_R + 0.22, L * 0.25, 0.14), m.paint);
			P(strut(V(POD_R, L * 0.25, 0.14), V(POD_R + 0.22, L * 0.25, 0.14), 0.016), m.metal);
			P(strut(V(POD_R - 0.02, -L * 0.3, 0.2), V(POD_R + 0.6, -L * 0.3, 0.34), 0.007), m.metal);
		}

		const { mat, u } = shellMat();
		glow.push({ value: 0, mesh: pod.build(ring, mat), u });
		const proxyGeo = mergeGeometries([
			new THREE.CapsuleGeometry(POD_R + 0.16, L, 4, 12).applyMatrix4(frame).toNonIndexed(),
			strut(spokeA, spokeB, 0.16, 8).toNonIndexed(),
		])!;
		const proxy = new THREE.Mesh(proxyGeo, proxyMat);
		ring.add(proxy);
		sections.push({
			anchor: marker(ring, V(0, 0, POD_R + 0.05).applyMatrix4(frame)),
			center: marker(ring, V(0.05, 0, 0.05).applyMatrix4(frame)),
			reach: (L / 2 + 0.42) * 1.3 * SCALE,
			proxy,
			ringAngle: th,
		});
	});
	rp.build(ring);

	// ---------- Spine: pressurized corridor inside a box truss, with conduits, a cable tray and a handrail ----------
	hull.add(m.hullLong, tube(0.17, 0.17, -3.5, 2.45, 32));
	const W = 0.34, z0 = -3.5, z1 = 2.4, bayLen = 0.55;
	const corners = [V(W, W), V(-W, W), V(-W, -W), V(W, -W)];
	for (let z = z0; z < z1 - 1e-3; z += bayLen) {
		const za = z, zb = Math.min(z + bayLen, z1);
		corners.forEach((c, i) => {
			const d = corners[(i + 1) % 4];
			hull.add(m.truss, strut(V(c.x, c.y, za), V(c.x, c.y, zb), 0.024, 8));
			hull.add(m.truss, strut(V(c.x, c.y, za), V(d.x, d.y, za), 0.018));
			hull.add(m.truss, strut(V(c.x, c.y, za), V(d.x, d.y, zb), 0.012));
			hull.add(m.gunmetal, box(0.06, 0.06, 0.06, at(c.x, c.y, za)));
		});
		hull.add(m.metal, hoop(0.175, 0.01, za + 0.27, 32));
	}
	corners.forEach((c, i) => { const d = corners[(i + 1) % 4]; hull.add(m.truss, strut(V(c.x, c.y, z1), V(d.x, d.y, z1), 0.018)); });
	hull.add(m.gold, pipe([V(0.22, 0.27, z0), V(0.23, 0.27, -1), V(0.22, 0.28, 1), V(0.22, 0.27, z1)], 0.034, 64));
	hull.add(m.silver, pipe([V(-0.24, -0.26, z0), V(-0.25, -0.27, -1), V(-0.24, -0.26, z1)], 0.028, 64));
	hull.add(m.kapton, pipe([V(0.27, -0.22, z0), V(0.28, -0.23, 0), V(0.27, -0.22, z1)], 0.018, 64));
	hull.add(m.dark, box(0.1, 0.03, z1 - z0, at(-0.2, 0.3, (z0 + z1) / 2)));
	handrail(hullAdd, m.rail, V(0, 0.17, z0 + 0.2), V(0, 0.17, z1 - 0.2), Y_AXIS, 0.04);
	greebles(hullAdd, hardware, { r: 0.17, z0: z0 + 0.1, z1: z1 - 0.1, n: 120, seed: 47, size: 0.55, avoid: (th) => Math.abs(wrap(th - Math.PI / 2)) < 0.4 });
	// Avionics boxes under silver foil
	for (const z of [-0.5, -0.95, 1.6]) {
		hull.add(m.silver, box(0.36, 0.16, 0.36, at(0, -0.48, z)));
		hull.add(m.dark, box(0.38, 0.03, 0.38, at(0, -0.39, z)));
		for (const s of [-1, 1]) hull.add(m.gunmetal, box(0.02, 0.1, 0.3, at(s * 0.19, -0.48, z)));
	}

	// ---------- Solar wings, port and starboard: two blankets either side of a lattice mast ----------
	const wingZ = 0.9, tilt = 0.22;
	for (const s of [-1, 1]) {
		hull.add(m.metal, strut(V(s * W, 0, wingZ), V(s * 0.88, 0, wingZ), 0.05, 12));
		hull.add(m.gunmetal, new THREE.CylinderGeometry(0.11, 0.11, 0.16, 24).rotateZ(Math.PI / 2), at(s * 0.88, 0, wingZ));
		hull.add(m.gold, new THREE.CylinderGeometry(0.115, 0.115, 0.05, 24).rotateZ(Math.PI / 2), at(s * 0.88, 0, wingZ));
		const wing = new THREE.Matrix4().makeRotationX(tilt).premultiply(at(0, 0, wingZ));
		const span0 = 0.97, span = 3.1, panels = 8, gap = 0.02;
		const W2: Add = (mat, g) => hull.add(mat, g, wing);
		for (let k = 0; k <= 16; k++) {
			const x = s * (span0 + (k / 16) * span);
			W2(m.truss, strut(V(x, 0.03, 0.04), V(x, 0.03, -0.04), 0.006, 5));
			W2(m.truss, strut(V(x, -0.03, 0.04), V(x, 0.03, 0.04), 0.006, 5));
			if (k < 16) {
				const x2 = s * (span0 + ((k + 1) / 16) * span);
				for (const zz of [0.04, -0.04]) W2(m.truss, strut(V(x, 0.03, zz), V(x2, 0.03, zz), 0.006, 5));
				W2(m.truss, strut(V(x, 0.03, 0.04), V(x2, 0.03, -0.04), 0.004, 4));
			}
		}
		for (const side of [-1, 1]) {
			const zc = side * 0.33;
			for (let p = 0; p < panels; p++) {
				const g = new THREE.PlaneGeometry(span / panels - gap, 0.52);
				g.rotateX(-Math.PI / 2);
				// Each panel's cells take their own slice of the blanket texture
				const uv = g.attributes.uv as THREE.BufferAttribute;
				for (let q = 0; q < uv.count; q++) uv.setX(q, (p + uv.getX(q)) / panels);
				g.rotateZ(Math.sin(p * 2.3 + s) * 0.012);
				W2(m.solar, g.translate(s * (span0 + (p + 0.5) * (span / panels)), 0, zc));
			}
			for (const e of [-0.265, 0.265]) W2(m.metal, box(span, 0.025, 0.018, at(s * (span0 + span / 2), 0, zc + e)));
			W2(m.metal, box(0.03, 0.03, 0.56, at(s * (span0 + span), 0, zc)));
			W2(m.gunmetal, box(0.08, 0.06, 0.56, at(s * span0, 0, zc)));
		}
	}

	// ---------- Radiator wings, above and below: three panels each, with manifolds ----------
	for (const s of [-1, 1]) {
		const y0 = 0.42, zc = -1.55, len = 1.6;
		for (let k = 0; k < 3; k++) {
			const ya = y0 + 0.04 + k * 0.62, yb = ya + 0.58;
			hull.add(m.radiator, new THREE.BoxGeometry(0.018, yb - ya, len), new THREE.Matrix4().makeRotationZ(s * (k - 1) * 0.04).setPosition(0, s * (ya + yb) / 2, zc));
			hull.add(m.metal, box(0.03, 0.03, len, at(0, s * yb, zc)));
		}
		hull.add(m.metal, box(0.03, 1.86, 0.03, at(0, s * (y0 + 0.97), zc + len / 2)));
		hull.add(m.metal, box(0.03, 1.86, 0.03, at(0, s * (y0 + 0.97), zc - len / 2)));
		hull.add(m.gold, tube(0.05, 0.05, zc - len / 2, zc + len / 2, 16).translate(0, s * y0, 0));
		for (let k = 0; k < 3; k++) hull.add(m.truss, strut(V(0, s * W, zc - 0.6 + k * 0.6), V(0, s * y0, zc - 0.6 + k * 0.6), 0.02));
	}

	// ---------- Propellant tanks under gold insulation, strapped, with feed lines to the engine ----------
	for (let i = 0; i < 4; i++) {
		const a = Math.PI / 4 + (i * Math.PI) / 2;
		const c = V(Math.cos(a) * 0.66, Math.sin(a) * 0.66, -2.95);
		hull.add(m.gold, new THREE.CapsuleGeometry(0.3, 0.72, 12, 40).rotateX(Math.PI / 2), at(c.x, c.y, c.z));
		for (const dz of [-0.3, 0, 0.3]) hull.add(m.metal, hoop(0.305, 0.016, 0, 48).translate(c.x, c.y, c.z + dz));
		hull.add(m.gunmetal, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16).rotateX(Math.PI / 2).translate(c.x, c.y, c.z + 0.68));
		hull.add(m.silver, pipe([c.clone().add(V(0, 0, -0.64)), V(c.x * 0.75, c.y * 0.75, -3.62), V(c.x * 0.45, c.y * 0.45, -4.2), V(c.x * 0.3, c.y * 0.3, -4.4)], 0.022, 32));
		for (const z of [-2.7, -3.2]) hull.add(m.truss, strut(V(Math.cos(a) * 0.34, Math.sin(a) * 0.34, z), V(c.x * 0.72, c.y * 0.72, z), 0.02));
	}

	// ---------- Shadow shield, reactor and plasma engine ----------
	hull.add(m.kapton, tube(0.45, 0.84, -3.82, -3.46, 64));
	hull.add(m.metal, hoop(0.84, 0.02, -3.46, 96));
	hull.add(m.metal, tube(0.38, 0.38, -4.34, -3.82, 48));
	for (let i = 0; i < 16; i++) {
		const a = (i / 16) * Math.PI * 2;
		hull.add(m.dark, box(0.016, 0.2, 0.46, new THREE.Matrix4().makeRotationZ(a).setPosition(-Math.sin(a) * 0.46, Math.cos(a) * 0.46, -4.08)));
	}
	hull.add(m.dark, tube(0.22, 0.32, -4.6, -4.34, 48));
	for (const a of [0, Math.PI / 2]) {
		const p = V(Math.cos(a) * 0.36, Math.sin(a) * 0.36, -4.36), q = V(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -4.95);
		hull.add(m.metal, strut(p, q, 0.025, 10));
		hull.add(m.gunmetal, strut(p, p.clone().lerp(q, 0.45), 0.04, 12));
	}
	const bellR = (t: number) => 0.2 + 0.44 * Math.pow(t, 0.62);
	const bell = Array.from({ length: 24 }, (_, i) => { const t = i / 23; return new THREE.Vector2(bellR(t), -t * 0.95); });
	// Heat tint: bronze at the throat through blue to dark grey at the exit
	const nozzleMat = std({ map: gradientTexture([[0, '#34373d'], [0.45, '#4f5c78'], [0.8, '#8a5a3a'], [1, '#b67c48']]), roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide });
	hull.add(nozzleMat, new THREE.LatheGeometry(bell, 72).rotateX(Math.PI / 2).translate(0, 0, -4.6));
	for (const t of [0.35, 0.7]) hull.add(m.copper, hoop(bellR(t) + 0.025, 0.03, -4.6 - t * 0.95, 72));
	for (let i = 0; i < 24; i++) {
		const a = (i / 24) * Math.PI * 2;
		const p = (t: number) => V(Math.cos(a) * (bellR(t) + 0.012), Math.sin(a) * (bellR(t) + 0.012), -4.6 - t * 0.95);
		hull.add(m.copper, strut(p(0.2), p(0.9), 0.008, 4));
	}
	hull.build(model);

	// The inside of the bell glows from the plasma: bright at the throat, fading toward the exit
	const glowMat = new THREE.MeshBasicMaterial({
		map: gradientTexture([[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(140,170,255,0.55)'], [1, 'rgba(255,255,255,1)']]),
		color: new THREE.Color('#9cbcff').multiplyScalar(2.4),
		side: THREE.DoubleSide,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	model.add(new THREE.Mesh(new THREE.LatheGeometry(bell.map((p) => new THREE.Vector2(p.x * 0.96, p.y)), 72).rotateX(Math.PI / 2).translate(0, 0, -4.6), glowMat));
	const plumeMat = new THREE.MeshBasicMaterial({
		map: gradientTexture([[0, 'rgba(190,210,255,0.9)'], [0.3, 'rgba(90,130,255,0.35)'], [1, 'rgba(0,0,0,0)']]),
		color: new THREE.Color('#7fa6ff'),
		side: THREE.DoubleSide,
		transparent: true,
		opacity: 0.1,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	model.add(new THREE.Mesh(tube(0.9, 0.5, -7.4, -5.55, 48), plumeMat));

	// ---------- Floodlights: pools of light on the hull, only in the close-up ----------
	const floods = ([[V(0, 1.1, 4.1), '#ffe2b8'], [V(0.7, 0.75, 2.9), '#ffe9c8'], [V(-0.55, 0.6, 0.2), '#ffe2b8'], [V(0.6, -0.7, -2.4), '#cfe0ff']] as const).map(([p, c]) => {
		const l = new THREE.PointLight(c, 0, 0.3, 2);
		l.position.copy(p);
		model.add(l);
		return l;
	});

	// ---------- Navigation lights: port red, starboard green, white strobes fore and aft, an amber beacon ----------
	const dot = dotTexture();
	const lamp = (color: string, p: THREE.Vector3, size: number) => {
		const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(color).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
		s.position.copy(p);
		s.scale.setScalar(size);
		model.add(s);
		return s;
	};
	// Facing +Z with +Y up, port is +X
	const port = lamp('#ff3b30', V(4.1, 0, wingZ), 0.16);
	const starboard = lamp('#3dff7a', V(-4.1, 0, wingZ), 0.16);
	const bowStrobe = lamp('#ffffff', V(0, 0, 5.72), 0.24);
	const sternStrobe = lamp('#ffffff', V(0, 0.86, -3.46), 0.24);
	const floodLamps = floods.map((l) => lamp('#fff1d8', l.position, 0.07));
	// The beacon keeps a constant size on screen, so the vessel can be found from across the system
	const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color('#ffb347').multiplyScalar(2.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }));
	beacon.position.set(0, 0.62 * SCALE, 3.0 * SCALE);
	beacon.scale.setScalar(0.014);
	root.add(beacon);

	let hover = -1, selected = -1;
	return {
		root,
		ring,
		sections,
		reach: 5.9 * SCALE,
		materials: [...materials],
		highlight(h: number, s: number) {
			hover = h;
			selected = s;
		},
		update(t: number, dt: number, near: number) {
			const flash = (period: number, offset: number) => ((t + offset) % period < 0.07 ? 1 : 0);
			(bowStrobe.material as THREE.SpriteMaterial).opacity = flash(1.6, 0);
			(sternStrobe.material as THREE.SpriteMaterial).opacity = flash(1.6, 0.25);
			const steady = 0.75 + 0.25 * Math.sin(t * 2.1);
			(port.material as THREE.SpriteMaterial).opacity = steady;
			(starboard.material as THREE.SpriteMaterial).opacity = steady;
			(beacon.material as THREE.SpriteMaterial).opacity = (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4), 3)) * (1 - 0.7 * near);
			plumeMat.opacity = 0.09 + 0.015 * Math.sin(t * 17) + 0.008 * Math.sin(t * 41);
			floods.forEach((l) => { l.intensity = 0.012 * near; });
			floodLamps.forEach((s) => { (s.material as THREE.SpriteMaterial).opacity = near; });
			// Highlights ease in and out; the open section keeps a softer glow
			const k = dt > 0 ? 1 - Math.exp(-dt * 10) : 1;
			glow.forEach((g, i) => {
				const goal = i === hover ? 1 : i === selected ? 0.3 : 0;
				g.value += (goal - g.value) * k;
				g.u.value = g.value * (0.85 + 0.15 * Math.sin(t * 5));
				if (g.mesh) g.mesh.visible = g.value > 0.003;
			});
		},
	};
}
