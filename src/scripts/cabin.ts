// First-person interior of the vessel's command module: a pressurized cylinder about four metres across,
// a deck along its floor, the cockpit under the nose windows, and wall displays carrying the pilot's records.
// It has its own renderer and only runs while it is open. Units are metres; +Z points to the cockpit,
// +Y is up, and the hatch is the aft bulkhead at -Z. W A S D (or the arrow keys) walk; with the mouse captured,
// as in a first-person game, moving it turns the view.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CabinPanel = {
	tag: string;
	section: string;
	title: string;
	chips: string[];
	paragraphs: string[];
	photos: { src: string; caption: string }[];
};
export type CabinContent = {
	name: string;
	textures: string; // base URL of the site's textures
	panels: CabinPanel[]; // the wall displays, in the order they are met walking in
	worlds: { code: string; name: string; look: string; orbit: number }[];
	vesselOrbit: number;
};
export type Cabin = {
	open(): void;
	close(): void;
	readonly isOpen: boolean;
	readonly lockReleasedAt: number; // when the mouse was last freed, so the Escape that freed it can be ignored
};

const R = 1.9; // hull radius
const FLOOR = -1.15; // deck height; the hull's axis is y = 0
const EYE = FLOOR + 1.62;
const Z_HATCH = -3.6, Z_NOSE = 2.2, Z_TIP = 4.0, R_TIP = 0.75;
const HATCH_Y = -0.3; // the hatch's centre height
const PLAYER = 0.2; // body radius for collisions
const SPAWN = new THREE.Vector3(0, EYE, -3.0);
const REVEAL_AT = 2.9; // a wall display boots up once the pilot is this close

const AMBER = '#f2b13b', ICE = '#e4ecf7', DIM = '#93a3c0', CYAN = '#6fd6ff', GREEN = '#5fd28a', RED = '#e2574c';
const FONT = '"Barlow", "Barlow Condensed", Arial, sans-serif';
const COND = '"Barlow Condensed", "Barlow", "Arial Narrow", Arial, sans-serif';
const DISPLAY = 'Michroma, "Barlow Condensed", Arial, sans-serif';
const LOOK_COLOR: Record<string, string> = { eris: '#e9eef2', mars: '#d9774f', saturn: '#e6c88e', neptune: '#5b86ff' };

function rng(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function canvas(w: number, h: number) {
	const cv = document.createElement('canvas');
	cv.width = w;
	cv.height = h;
	return { cv, g: cv.getContext('2d')! };
}

function tex(cv: HTMLCanvasElement, srgb = true) {
	const t = new THREE.CanvasTexture(cv);
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	t.anisotropy = 8;
	return t;
}

// Word-wrapped text; returns the y below the last line. With `dry` it only measures.
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, dry = false) {
	let line = '';
	for (const word of text.split(' ')) {
		const test = line ? `${line} ${word}` : word;
		if (g.measureText(test).width > maxW && line) {
			if (!dry) g.fillText(line, x, y);
			line = word;
			y += lineH;
		} else line = test;
	}
	if (line) { if (!dry) g.fillText(line, x, y); y += lineH; }
	return y;
}

// The largest body size at which the paragraphs fit in `maxH`
function fitText(g: CanvasRenderingContext2D, paragraphs: string[], w: number, maxH: number) {
	for (let size = 58; size >= 30; size -= 2) {
		g.font = `400 ${size}px ${FONT}`;
		const lh = Math.round(size * 1.42), gap = Math.round(size * 0.62);
		let y = 0;
		for (const p of paragraphs) y = wrap(g, p, 0, y, w, lh, true) + gap;
		if (y - gap - lh <= maxH) return { size, lh, gap };
	}
	return { size: 30, lh: 43, gap: 19 };
}

// ---------- Surfaces ----------

// Interior wall panels around the hull, as one sheet: u runs around (from +X, through +Y), v runs aft to fore.
// Holes in the alpha map are portholes.
function wallSheet(portholes: { a: number; z: number; r: number }[]) {
	const W = 4096, H = 2048;
	const len = Z_NOSE - Z_HATCH, circ = Math.PI * 2 * R;
	const px = (a: number) => (((a / (Math.PI * 2)) % 1) + 1) % 1 * W;
	const py = (z: number) => (1 - (z - Z_HATCH) / len) * H;
	const { cv, g } = canvas(W, H);
	const rand = rng(17);
	g.fillStyle = '#c9ccca';
	g.fillRect(0, 0, W, H);
	const cols = 20, rows = 8, pw = W / cols, ph = H / rows;
	const labels = ['STOW A1', 'STOW A2', 'O2 SUPPLY', 'CO2 SCRUB', 'PANEL C4', 'H2O', 'MED KIT', 'FIRE PORT', 'DATA BUS', 'PWR 28V', 'CAUTION HOT', 'NO STEP', 'LIGHT 3', 'COMM'];
	for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
		const x = i * pw, y = j * ph, k = (rand() - 0.5) * 14;
		g.fillStyle = `rgb(${204 + k},${207 + k},${205 + k})`;
		g.fillRect(x + 3, y + 3, pw - 6, ph - 6);
		// Recessed seam with a lit lip
		g.strokeStyle = 'rgba(70,74,78,0.75)';
		g.lineWidth = 4;
		g.strokeRect(x + 2, y + 2, pw - 4, ph - 4);
		g.strokeStyle = 'rgba(255,255,255,0.35)';
		g.lineWidth = 1.5;
		g.strokeRect(x + 6, y + 6, pw - 12, ph - 12);
		g.fillStyle = 'rgba(80,84,90,0.7)';
		for (const [fx, fy] of [[10, 10], [pw - 14, 10], [10, ph - 14], [pw - 14, ph - 14]]) g.fillRect(x + fx, y + fy, 4, 4);
		const f = rand();
		if (f < 0.22) {
			// Velcro patches for stowing kit
			g.fillStyle = 'rgba(64,66,70,0.85)';
			for (let n = 0; n < 2 + Math.floor(rand() * 3); n++) g.fillRect(x + 20 + rand() * (pw - 60), y + 20 + rand() * (ph - 60), 22 + rand() * 18, 18 + rand() * 14);
		} else if (f < 0.38) {
			// Placard with fine print
			const lx = x + 18, ly = y + 18 + rand() * (ph - 90);
			g.fillStyle = 'rgba(244,242,234,0.95)';
			g.fillRect(lx, ly, 120, 54);
			g.fillStyle = 'rgba(30,34,44,0.85)';
			g.font = `600 16px ${COND}`;
			g.fillText(labels[Math.floor(rand() * labels.length)], lx + 8, ly + 20);
			g.fillStyle = 'rgba(30,34,44,0.5)';
			for (let l = 0; l < 3; l++) g.fillRect(lx + 8, ly + 28 + l * 7, 70 + rand() * 30, 2);
		} else if (f < 0.48) {
			// Vent grille
			const gx = x + 24, gy = y + 30;
			for (let s = 0; s < 12; s++) { g.fillStyle = 'rgba(40,42,46,0.8)'; g.fillRect(gx, gy + s * 9, pw - 48, 4); }
		} else if (f < 0.54) {
			// Access hatch with a yellow latch tag
			g.strokeStyle = 'rgba(60,62,66,0.7)';
			g.lineWidth = 3;
			g.strokeRect(x + 24, y + 26, pw - 48, ph - 52);
			g.fillStyle = AMBER;
			g.fillRect(x + pw / 2 - 14, y + ph - 40, 28, 10);
		}
		if (rand() < 0.08) { g.fillStyle = 'rgba(58,108,170,0.85)'; g.fillRect(x + 3, y + ph * 0.4, pw - 6, 10); }
	}
	// Wear around where hands go
	for (let n = 0; n < 140; n++) {
		const x = rand() * W, y = rand() * H, r = 20 + rand() * 90;
		const gr = g.createRadialGradient(x, y, 0, x, y, r);
		gr.addColorStop(0, `rgba(90,84,76,${0.03 + rand() * 0.05})`);
		gr.addColorStop(1, 'rgba(90,84,76,0)');
		g.fillStyle = gr;
		g.fillRect(x - r, y - r, r * 2, r * 2);
	}
	const { cv: acv, g: ag } = canvas(W, H);
	ag.fillStyle = '#fff';
	ag.fillRect(0, 0, W, H);
	for (const p of portholes) {
		const cx = px(p.a), cy = py(p.z), rx = (p.r / circ) * W, ry = (p.r / len) * H;
		g.fillStyle = '#5b6068';
		g.beginPath(); g.ellipse(cx, cy, rx * 1.45, ry * 1.45, 0, 0, Math.PI * 2); g.fill();
		ag.fillStyle = '#000';
		ag.beginPath(); ag.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ag.fill();
	}
	const map = tex(cv), alpha = tex(acv, false);
	return { map, alpha };
}

// The nose cone's inner skin, with the cockpit windows cut through its upper half
function noseSheet() {
	const W = 2048, H = 1024;
	const { cv, g } = canvas(W, H);
	const { cv: acv, g: ag } = canvas(W, H);
	g.fillStyle = '#c2c5c4';
	g.fillRect(0, 0, W, H);
	ag.fillStyle = '#fff';
	ag.fillRect(0, 0, W, H);
	const rand = rng(29);
	for (let i = 0; i < 24; i++) {
		const x = (i / 24) * W, k = (rand() - 0.5) * 12;
		g.fillStyle = `rgb(${196 + k},${199 + k},${198 + k})`;
		g.fillRect(x + 3, 3, W / 24 - 6, H - 6);
		g.strokeStyle = 'rgba(70,74,78,0.7)';
		g.lineWidth = 4;
		g.strokeRect(x + 2, 2, W / 24 - 4, H - 4);
	}
	// Five windows centred on the top (u = 0.25), framed in dark paint; v runs aft (0) to fore (1)
	const n = 5, span = 0.34, gap = 0.012;
	for (let i = 0; i < n; i++) {
		const u0 = 0.25 - span / 2 + (i * span) / n + gap, u1 = 0.25 - span / 2 + ((i + 1) * span) / n - gap;
		const x0 = u0 * W, x1 = u1 * W, y0 = (1 - 0.86) * H, y1 = (1 - 0.2) * H;
		g.fillStyle = '#3d4249';
		g.fillRect(x0 - 16, y0 - 16, x1 - x0 + 32, y1 - y0 + 32);
		ag.fillStyle = '#000';
		ag.beginPath();
		ag.roundRect(x0, y0, x1 - x0, y1 - y0, 18);
		ag.fill();
	}
	return { map: tex(cv), alpha: tex(acv, false) };
}

function floorSheet() {
	const W = 1024, H = 2048;
	const { cv, g } = canvas(W, H);
	const rand = rng(41);
	g.fillStyle = '#30343a';
	g.fillRect(0, 0, W, H);
	const tw = W / 6, th = H / 14;
	for (let i = 0; i < 6; i++) for (let j = 0; j < 14; j++) {
		const k = (rand() - 0.5) * 10;
		g.fillStyle = `rgb(${50 + k},${54 + k},${60 + k})`;
		g.fillRect(i * tw + 3, j * th + 3, tw - 6, th - 6);
		// Anti-slip tread
		g.fillStyle = 'rgba(90,96,104,0.35)';
		for (let s = 0; s < 220; s++) g.fillRect(i * tw + 6 + rand() * (tw - 12), j * th + 6 + rand() * (th - 12), 2, 2);
		g.fillStyle = 'rgba(24,26,30,0.9)';
		for (const [fx, fy] of [[8, 8], [tw - 12, 8], [8, th - 12], [tw - 12, th - 12]]) g.fillRect(i * tw + fx, j * th + fy, 4, 4);
	}
	// A worn walkway down the middle
	const gr = g.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
	gr.addColorStop(0, 'rgba(120,124,130,0)');
	gr.addColorStop(0.5, 'rgba(120,124,130,0.12)');
	gr.addColorStop(1, 'rgba(120,124,130,0)');
	g.fillStyle = gr;
	g.fillRect(0, 0, W, H);
	return tex(cv);
}

function hazardSheet(w: number, h: number, stripe = 48) {
	const { cv, g } = canvas(w, h);
	g.fillStyle = '#1c1d20';
	g.fillRect(0, 0, w, h);
	g.fillStyle = '#e3b23c';
	for (let x = -h; x < w + h; x += stripe * 2) {
		g.beginPath();
		g.moveTo(x, h); g.lineTo(x + h, 0); g.lineTo(x + h + stripe, 0); g.lineTo(x + stripe, h);
		g.fill();
	}
	return tex(cv);
}

// A lit sign, or with `painted` just the lettering, for stencilling onto a wall
function signTexture(text: string, color: string, painted = false) {
	const { cv, g } = canvas(1024, 256);
	if (!painted) {
		g.fillStyle = '#06090d';
		g.fillRect(0, 0, 1024, 256);
		g.strokeStyle = color;
		g.lineWidth = 6;
		g.strokeRect(12, 12, 1000, 232);
	}
	g.font = `400 86px ${DISPLAY}`;
	g.fillStyle = color;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(text, 512, 134);
	return tex(cv);
}

// ---------- Displays ----------

// Every display shares one look: deep navy glass, a faint grid, a header bar and corner brackets.
// Returns the inner padding and where the content starts.
function displayFrame(g: CanvasRenderingContext2D, w: number, h: number, title: string, tag: string, tagColor = DIM) {
	const bg = g.createLinearGradient(0, 0, 0, h);
	bg.addColorStop(0, '#0c1828');
	bg.addColorStop(1, '#03080f');
	g.fillStyle = bg;
	g.fillRect(0, 0, w, h);
	const cell = Math.round(h / 20);
	g.fillStyle = 'rgba(110,170,240,0.045)';
	for (let x = cell; x < w; x += cell) g.fillRect(x, 0, 1, h);
	for (let y = cell; y < h; y += cell) g.fillRect(0, y, w, 1);
	const bar = Math.round(h * 0.075), pad = Math.round(h * 0.045);
	g.fillStyle = 'rgba(111,214,255,0.09)';
	g.fillRect(0, 0, w, bar);
	g.fillStyle = 'rgba(111,214,255,0.55)';
	g.fillRect(0, bar, w, 2);
	g.fillStyle = AMBER;
	g.fillRect(pad, bar * 0.36, bar * 0.28, bar * 0.28);
	g.textBaseline = 'middle';
	g.font = `400 ${Math.round(bar * 0.34)}px ${DISPLAY}`;
	g.fillStyle = ICE;
	g.fillText(title.toUpperCase(), pad + bar * 0.5, bar * 0.52);
	g.textAlign = 'right';
	g.font = `600 ${Math.round(bar * 0.4)}px ${COND}`;
	g.fillStyle = tagColor;
	g.fillText(tag.toUpperCase(), w - pad, bar * 0.52);
	g.textAlign = 'left';
	g.textBaseline = 'alphabetic';
	g.strokeStyle = 'rgba(228,236,247,0.55)';
	g.lineWidth = Math.max(2, h / 400);
	const c = pad * 0.9, e = 10;
	for (const [x, y, dx, dy] of [[e, e, 1, 1], [w - e, e, -1, 1], [e, h - e, 1, -1], [w - e, h - e, -1, -1]]) {
		g.beginPath(); g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y); g.stroke();
	}
	return { pad, top: bar + pad };
}

function cornerTicks(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number, color: string) {
	g.strokeStyle = color;
	g.lineWidth = 4;
	for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
		g.beginPath(); g.moveTo(cx, cy + dy * len); g.lineTo(cx, cy); g.lineTo(cx + dx * len, cy); g.stroke();
	}
}

// One wall display: a column of photos beside the record's text, which takes the largest size that fits
function storyScreen(p: CabinPanel, index: number, total: number, photosLeft: boolean, onChange: () => void) {
	const W = 2560, H = 1600;
	const { cv, g } = canvas(W, H);
	const t = tex(cv);
	const imgs: (HTMLImageElement | null)[] = p.photos.map(() => null);
	const draw = () => {
		const { pad, top } = displayFrame(g, W, H, `${p.tag} · ${p.section}`, `VSL-01 · Record ${index + 1} / ${total}`);
		const foot = H - pad - 20;
		const bottom = foot - 70;
		// Footer: which of the records this is
		g.fillStyle = 'rgba(111,214,255,0.25)';
		g.fillRect(pad, foot - 42, W - pad * 2, 2);
		g.font = `600 30px ${COND}`;
		g.fillStyle = DIM;
		g.fillText('ML-1  //  COMMAND MODULE  //  PERSONAL RECORD', pad, foot);
		for (let i = 0; i < total; i++) {
			g.fillStyle = i === index ? AMBER : 'rgba(147,163,192,0.3)';
			g.fillRect(W - pad - (total - i) * 92 + 12, foot - 14, 80, 10);
		}

		// Photos, each at its own proportions
		const n = p.photos.length, capH = 58, gap = 34;
		const aspect = imgs.map((im) => (im ? im.width / im.height : 4 / 3));
		const avail = bottom - top;
		const colW = Math.min(1000, ...aspect.map((a) => ((avail - (n - 1) * gap - n * capH) / n) * a));
		const px = photosLeft ? pad : W - pad - colW;
		const stack = aspect.reduce((sum, a) => sum + colW / a + capH, 0) + (n - 1) * gap;
		let py = top + Math.max(0, (avail - stack) / 2);
		p.photos.forEach((ph, i) => {
			const h = colW / aspect[i];
			const im = imgs[i];
			if (im) {
				g.drawImage(im, px, py, colW, h);
				// Dimmed a little so bright backgrounds sit on the glass instead of glaring
				const shade = g.createLinearGradient(0, py, 0, py + h);
				shade.addColorStop(0, 'rgba(6,16,32,0.2)');
				shade.addColorStop(1, 'rgba(6,16,32,0.38)');
				g.fillStyle = shade;
				g.fillRect(px, py, colW, h);
			} else {
				g.fillStyle = 'rgba(111,214,255,0.06)';
				g.fillRect(px, py, colW, h);
			}
			g.strokeStyle = 'rgba(111,214,255,0.4)';
			g.lineWidth = 2;
			g.strokeRect(px, py, colW, h);
			cornerTicks(g, px - 8, py - 8, colW + 16, h + 16, 34, ICE);
			g.font = `600 30px ${COND}`;
			g.fillStyle = AMBER;
			g.fillText(`IMG ${String(i + 1).padStart(2, '0')}`, px, py + h + 44);
			g.fillStyle = ICE;
			g.fillText(ph.caption.toUpperCase(), px + 112, py + h + 44);
			py += h + capH + gap;
		});

		// The record: its section, its title, then the text
		const tx = photosLeft ? px + colW + 100 : pad, tw = W - pad * 2 - colW - 100;
		let y = top + 36;
		g.font = `600 34px ${COND}`;
		g.fillStyle = AMBER;
		g.fillText(`${p.tag}  //  ${p.section.toUpperCase()}`, tx, y);
		y += 90;
		g.font = `400 60px ${DISPLAY}`;
		g.fillStyle = '#ffffff';
		y = wrap(g, p.title, tx, y, tw, 80);
		g.fillStyle = AMBER;
		g.fillRect(tx, y - 36, 140, 5);
		y += 44;
		const chipsH = p.chips.length ? 100 : 0;
		const fit = fitText(g, p.paragraphs, tw, bottom - chipsH - y);
		p.paragraphs.forEach((para, i) => {
			g.font = `400 ${fit.size}px ${FONT}`;
			g.fillStyle = i === 0 ? '#eef3fa' : '#c3cfdf';
			y = wrap(g, para, tx, y, tw, fit.lh) + fit.gap;
		});
		let cx = tx;
		g.font = `600 32px ${COND}`;
		for (const chip of p.chips) {
			const label = chip.toUpperCase(), cw = g.measureText(label).width + 44;
			g.beginPath();
			g.roundRect(cx, bottom - 56, cw, 56, 6);
			g.fillStyle = 'rgba(111,214,255,0.08)';
			g.fill();
			g.strokeStyle = 'rgba(111,214,255,0.6)';
			g.lineWidth = 2;
			g.stroke();
			g.fillStyle = ICE;
			g.fillText(label, cx + 22, bottom - 17);
			cx += cw + 18;
		}
		t.needsUpdate = true;
	};
	p.photos.forEach((ph, i) => {
		const im = new Image();
		im.onload = () => { imgs[i] = im; draw(); onChange(); };
		im.src = ph.src;
	});
	draw();
	return t;
}

type Live = { tex: THREE.CanvasTexture; draw(time: number): void };

// A display redrawn while it runs: drawn in its design units onto a smaller canvas, and kept without mipmaps,
// so each update is a quick upload
function liveCanvas(w: number, h: number, k: number) {
	const { cv, g } = canvas(Math.round(w * k), Math.round(h * k));
	const t = tex(cv);
	t.generateMipmaps = false;
	t.minFilter = THREE.LinearFilter;
	return { g, t, begin: () => g.setTransform(k, 0, 0, k, 0, 0) };
}

// Mission elapsed time, from a launch long before the visit
const met = (time: number) => {
	const s = Math.floor(1_481_000 + time);
	const pad2 = (n: number) => String(n).padStart(2, '0');
	return `T+ ${String(Math.floor(s / 86400)).padStart(3, '0')}:${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
};
const targetOf = (time: number, n: number) => Math.floor(time / 4) % n;

// The navigation display: the system in its orbital plane, a sweeping scan, the ship on its inclined orbit,
// a target lock that steps through the worlds, and their ranges and bearings
function navScreen(c: CabinContent): Live {
	const W = 1800, H = 1000;
	const { g, t, begin } = liveCanvas(W, H, 0.8);
	const worlds = [...c.worlds].sort((a, z) => a.orbit - z.orbit);
	const maxOrbit = Math.max(c.vesselOrbit, ...worlds.map((w) => w.orbit));
	const history: number[] = [];
	const draw = (time: number) => {
		begin();
		const { pad, top } = displayFrame(g, W, H, 'Navigation · Survey orbit', met(time), CYAN);
		const split = 1220;
		const cx = 640, cy = top + (H - top - pad) / 2 + 6, K = 0.42, RMAX = 540;
		const sc = (RMAX - 30) / maxOrbit;
		g.save();
		g.beginPath();
		g.rect(pad, top, split - pad - 20, H - top - pad);
		g.clip();
		// Scan sweep in the orbital plane
		const sweep = time * 0.7;
		g.save();
		g.translate(cx, cy);
		g.scale(1, K);
		if ('createConicGradient' in g) {
			const cg = g.createConicGradient(sweep - 0.7, 0, 0);
			cg.addColorStop(0, 'rgba(111,214,255,0)');
			cg.addColorStop(0.7 / (Math.PI * 2), 'rgba(111,214,255,0.3)');
			cg.addColorStop(0.7 / (Math.PI * 2) + 0.001, 'rgba(111,214,255,0)');
			g.fillStyle = cg;
			g.beginPath();
			g.arc(0, 0, RMAX, sweep - 0.7, sweep);
			g.lineTo(0, 0);
			g.fill();
		}
		g.restore();
		const at = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r * K] as const;
		g.strokeStyle = 'rgba(111,214,255,0.7)';
		g.lineWidth = 2;
		g.beginPath(); g.moveTo(cx, cy); g.lineTo(...at(sweep, RMAX)); g.stroke();
		// Bearing ring with ticks
		g.strokeStyle = 'rgba(111,214,255,0.35)';
		g.beginPath(); g.ellipse(cx, cy, RMAX, RMAX * K, 0, 0, Math.PI * 2); g.stroke();
		g.font = `600 22px ${COND}`;
		g.fillStyle = 'rgba(147,163,192,0.8)';
		g.textAlign = 'center';
		for (let d = 0; d < 360; d += 10) {
			const a = (d * Math.PI) / 180, long = d % 30 === 0;
			const [x0, y0] = at(a, RMAX), [x1, y1] = at(a, RMAX + (long ? 18 : 9));
			g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
			if (long) { const [lx, ly] = at(a, RMAX + 40); g.fillText(String(d).padStart(3, '0'), lx, ly + 8); }
		}
		g.textAlign = 'left';
		// Orbits
		g.setLineDash([]);
		for (const w of worlds) {
			g.strokeStyle = 'rgba(140,190,255,0.28)';
			g.beginPath(); g.ellipse(cx, cy, w.orbit * sc, w.orbit * sc * K, 0, 0, Math.PI * 2); g.stroke();
		}
		// The star
		const sun = g.createRadialGradient(cx, cy, 0, cx, cy, 70);
		sun.addColorStop(0, 'rgba(255,246,226,1)');
		sun.addColorStop(0.18, 'rgba(255,214,150,0.8)');
		sun.addColorStop(1, 'rgba(242,177,59,0)');
		g.fillStyle = sun;
		g.fillRect(cx - 70, cy - 70, 140, 140);
		// Worlds, sized by kind, moving at their own pace
		const sel = targetOf(time, worlds.length);
		const placed = worlds.map((w, i) => {
			const a = 0.7 + i * 1.9 + time * 0.05 * Math.pow(maxOrbit / w.orbit, 1.5) * 0.35;
			const [x, y] = at(a, w.orbit * sc);
			const r = w.look === 'saturn' ? 15 : w.look === 'neptune' ? 13 : w.look === 'mars' ? 9 : 8;
			const col = LOOK_COLOR[w.look] ?? ICE;
			const shade = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
			shade.addColorStop(0, '#ffffff');
			shade.addColorStop(0.35, col);
			shade.addColorStop(1, 'rgba(10,20,40,1)');
			if (w.look === 'saturn') {
				g.strokeStyle = 'rgba(230,200,142,0.8)';
				g.lineWidth = 3;
				g.beginPath(); g.ellipse(x, y, r * 2, r * 0.6, -0.3, 0, Math.PI * 2); g.stroke();
			}
			g.fillStyle = shade;
			g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
			g.font = `600 26px ${COND}`;
			g.fillStyle = i === sel ? AMBER : CYAN;
			g.fillText(w.code, x + r + 12, y - 8);
			g.fillStyle = 'rgba(228,236,247,0.8)';
			g.font = `500 22px ${COND}`;
			g.fillText(w.name.toUpperCase(), x + r + 12, y + 16);
			return { x, y, r, w };
		});
		// The ship on its inclined orbit, with its trail
		const rs = c.vesselOrbit * sc, tilt = -0.32, ks = K * 1.5;
		const shipAt = (a: number) => {
			const ex = Math.cos(a) * rs, ey = Math.sin(a) * rs * ks;
			return [cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)] as const;
		};
		g.setLineDash([10, 10]);
		g.strokeStyle = 'rgba(242,177,59,0.5)';
		g.lineWidth = 2;
		g.beginPath();
		for (let k = 0; k <= 96; k++) { const [x, y] = shipAt((k / 96) * Math.PI * 2); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
		g.stroke();
		g.setLineDash([]);
		const sa = 2.2 + time * 0.12;
		for (let k = 0; k < 40; k++) {
			const [x0, y0] = shipAt(sa - (k + 1) * 0.02), [x1, y1] = shipAt(sa - k * 0.02);
			g.strokeStyle = `rgba(242,177,59,${0.9 * (1 - k / 40)})`;
			g.lineWidth = 5 - k * 0.1;
			g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
		}
		const [sx, sy] = shipAt(sa), [nx, ny] = shipAt(sa + 0.02);
		const head = Math.atan2(ny - sy, nx - sx);
		const pulse = (time * 0.8) % 1;
		g.strokeStyle = `rgba(242,177,59,${1 - pulse})`;
		g.lineWidth = 2;
		g.beginPath(); g.arc(sx, sy, 12 + pulse * 34, 0, Math.PI * 2); g.stroke();
		g.save();
		g.translate(sx, sy);
		g.rotate(head);
		g.fillStyle = AMBER;
		g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -10); g.lineTo(-5, 0); g.lineTo(-10, 10); g.closePath(); g.fill();
		g.restore();
		g.font = `600 28px ${COND}`;
		g.fillStyle = AMBER;
		g.fillText('ML-1', sx + 22, sy + 34);
		// Target lock: brackets close in on the selected world, a line runs to it from the ship
		const tg = placed[sel];
		const lockIn = Math.min(1, (time % 4) * 2.2);
		const b = tg.r + 34 - lockIn * 18;
		g.setLineDash([6, 8]);
		g.strokeStyle = 'rgba(111,214,255,0.7)';
		g.beginPath(); g.moveTo(sx, sy); g.lineTo(tg.x, tg.y); g.stroke();
		g.setLineDash([]);
		cornerTicks(g, tg.x - b, tg.y - b, b * 2, b * 2, 12, AMBER);
		if (lockIn >= 1 && Math.floor(time * 3) % 2 === 0) {
			g.font = `600 22px ${COND}`;
			g.fillStyle = AMBER;
			g.fillText('TGT LOCK', tg.x - b, tg.y - b - 12);
		}
		g.restore();

		// Right column: the target list, then the ship's own state
		g.fillStyle = 'rgba(111,214,255,0.3)';
		g.fillRect(split, top, 2, H - top - pad);
		const x0 = split + 40, x1 = W - pad;
		let y = top + 30;
		g.font = `600 28px ${COND}`;
		g.fillStyle = DIM;
		g.fillText('TARGETS', x0, y);
		g.textAlign = 'right';
		g.fillText('RNG  /  BRG', x1, y);
		g.textAlign = 'left';
		y += 26;
		placed.forEach((p, i) => {
			const on = i === sel;
			if (on) {
				g.fillStyle = 'rgba(242,177,59,0.13)';
				g.fillRect(x0 - 16, y, x1 - x0 + 16, 84);
				g.fillStyle = AMBER;
				g.fillRect(x0 - 16, y, 5, 84);
			}
			const range = Math.hypot(p.x - sx, (p.y - sy) / K) / sc;
			const brg = ((Math.atan2((p.y - sy) / K, p.x - sx) * 180) / Math.PI + 360) % 360;
			g.font = `600 32px ${COND}`;
			g.fillStyle = on ? AMBER : CYAN;
			g.fillText(p.w.code, x0, y + 38);
			g.fillStyle = ICE;
			g.fillText(p.w.name.toUpperCase(), x0 + 92, y + 38);
			g.font = `500 26px ${COND}`;
			g.fillStyle = DIM;
			g.fillText(`${range.toFixed(2)} AU`, x0, y + 72);
			g.textAlign = 'right';
			g.fillText(`${brg.toFixed(1).padStart(5, '0')}°`, x1, y + 72);
			g.textAlign = 'left';
			y += 96;
		});
		y += 14;
		g.fillStyle = 'rgba(111,214,255,0.3)';
		g.fillRect(x0 - 16, y, x1 - x0 + 16, 2);
		y += 46;
		const vel = 7.42 + Math.sin(time * 0.9) * 0.03 + Math.sin(time * 3.1) * 0.006;
		history.push(vel);
		if (history.length > 60) history.shift();
		for (const [label, value] of [['VELOCITY', `${vel.toFixed(3)} KM/S`], ['ORBIT RADIUS', `${c.vesselOrbit.toFixed(1)} AU`], ['INCLINATION', '17.2°']]) {
			g.font = `600 26px ${COND}`;
			g.fillStyle = DIM;
			g.fillText(label, x0, y);
			g.textAlign = 'right';
			g.font = `600 30px ${COND}`;
			g.fillStyle = ICE;
			g.fillText(value, x1, y);
			g.textAlign = 'left';
			y += 44;
		}
		// Velocity trace
		const gy = y + 6, gh = H - pad - gy - 6;
		if (gh > 30) {
			g.strokeStyle = 'rgba(111,214,255,0.2)';
			g.strokeRect(x0, gy, x1 - x0, gh);
			g.strokeStyle = CYAN;
			g.lineWidth = 3;
			g.beginPath();
			history.forEach((v, i) => {
				const px = x0 + (i / 59) * (x1 - x0), py = gy + gh / 2 - ((v - 7.42) / 0.05) * (gh / 2);
				if (i) g.lineTo(px, py); else g.moveTo(px, py);
			});
			g.stroke();
		}
		t.needsUpdate = true;
	};
	return { tex: t, draw };
}

// Ship systems: a reactor gauge, segmented status bars, and a live comms carrier trace
function systemsScreen(): Live {
	const W = 1200, H = 820;
	const { g, t, begin } = liveCanvas(W, H, 0.8);
	const rows = [['LIFE SUPPORT', 0.96], ['POWER BUS', 0.88], ['THERMAL', 0.74], ['COMMS', 0.92], ['PROPULSION', 0.61]] as const;
	const draw = (time: number) => {
		begin();
		const { pad, top } = displayFrame(g, W, H, 'Systems', 'All nominal', GREEN);
		// Reactor gauge
		const gx = pad + 170, gy = top + 190, gr = 150;
		const v = 0.972 + Math.sin(time * 1.3) * 0.006;
		g.lineCap = 'round';
		g.lineWidth = 18;
		g.strokeStyle = 'rgba(147,163,192,0.18)';
		g.beginPath(); g.arc(gx, gy, gr, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
		g.strokeStyle = CYAN;
		g.shadowColor = CYAN;
		g.shadowBlur = 18;
		g.beginPath(); g.arc(gx, gy, gr, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * v)); g.stroke();
		g.shadowBlur = 0;
		g.lineCap = 'butt';
		g.textAlign = 'center';
		g.font = `400 54px ${DISPLAY}`;
		g.fillStyle = ICE;
		g.fillText(`${(v * 100).toFixed(1)}`, gx, gy + 18);
		g.font = `600 28px ${COND}`;
		g.fillStyle = DIM;
		g.fillText('REACTOR OUTPUT %', gx, gy + 66);
		g.textAlign = 'left';
		// Status bars
		const bx = gx + gr + 80, bw = W - pad - bx - 90;
		rows.forEach(([name, base], i) => {
			const y = top + 40 + i * 74;
			const val = Math.min(1, base + Math.sin(time * (0.7 + i * 0.4) + i) * 0.015);
			g.font = `600 26px ${COND}`;
			g.fillStyle = DIM;
			g.fillText(name, bx, y);
			const segs = 24, sw = bw / segs;
			for (let s = 0; s < segs; s++) {
				g.fillStyle = s / segs < val ? (val > 0.7 ? GREEN : AMBER) : 'rgba(147,163,192,0.15)';
				g.fillRect(bx + s * sw, y + 10, sw - 4, 18);
			}
			g.font = `600 28px ${COND}`;
			g.fillStyle = ICE;
			g.fillText(`${Math.round(val * 100)}%`, bx + bw + 16, y + 28);
		});
		// Comms carrier
		const wy = top + 420, wh = H - pad - wy;
		g.fillStyle = 'rgba(111,214,255,0.05)';
		g.fillRect(pad, wy, W - pad * 2, wh);
		g.strokeStyle = 'rgba(111,214,255,0.18)';
		g.lineWidth = 1;
		for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(pad, wy + (wh * k) / 4); g.lineTo(W - pad, wy + (wh * k) / 4); g.stroke(); }
		g.font = `600 24px ${COND}`;
		g.fillStyle = DIM;
		g.fillText('COMMS CARRIER  ·  8.4 GHZ  ·  LINK SOLID', pad + 16, wy + 34);
		g.strokeStyle = CYAN;
		g.lineWidth = 3;
		g.shadowColor = CYAN;
		g.shadowBlur = 10;
		g.beginPath();
		for (let x = 0; x <= W - pad * 2; x += 4) {
			const u = x * 0.012;
			const yv = Math.sin(u * 2.6 + time * 4) * 0.45 + Math.sin(u * 7.3 - time * 6.5) * 0.2 + Math.sin(u * 17 + time * 11) * 0.08;
			const py = wy + wh * 0.58 + yv * wh * 0.32;
			if (x) g.lineTo(pad + x, py); else g.moveTo(pad + x, py);
		}
		g.stroke();
		g.shadowBlur = 0;
		t.needsUpdate = true;
	};
	return { tex: t, draw };
}

// The greeting, and an index of the records on the walls
function commandScreen(c: CabinContent): Live {
	const W = 1200, H = 820;
	const { g, t, begin } = liveCanvas(W, H, 0.8);
	const draw = (time: number) => {
		begin();
		const { pad, top } = displayFrame(g, W, H, 'ML-1 · Command', 'Pilot on board', GREEN);
		g.font = `400 54px ${DISPLAY}`;
		g.fillStyle = '#ffffff';
		g.fillText('WELCOME ABOARD', pad, top + 70);
		g.fillStyle = AMBER;
		g.fillRect(pad, top + 96, 120, 5);
		g.font = `400 34px ${FONT}`;
		g.fillStyle = '#c9d4e3';
		let y = wrap(g, `This is ${c.name}’s command module. Walk the cabin to read the records on its walls.`, pad, top + 160, W - pad * 2, 46);
		y += 24;
		g.font = `600 26px ${COND}`;
		g.fillStyle = DIM;
		g.fillText('RECORDS ON BOARD', pad, y);
		y += 18;
		c.panels.forEach((p, i) => {
			y += 54;
			g.fillStyle = 'rgba(111,214,255,0.06)';
			g.fillRect(pad, y - 38, W - pad * 2, 48);
			g.font = `600 30px ${COND}`;
			g.fillStyle = AMBER;
			g.fillText(p.tag, pad + 14, y);
			g.fillStyle = ICE;
			g.fillText(p.title.toUpperCase(), pad + 74, y);
			g.textAlign = 'right';
			g.fillStyle = GREEN;
			g.fillText(i % 2 ? 'PORT WALL' : 'STARBOARD WALL', W - pad - 14, y);
			g.textAlign = 'left';
		});
		if (Math.floor(time * 2) % 2 === 0) {
			g.fillStyle = CYAN;
			g.fillRect(pad, y + 34, 22, 34);
		}
		t.needsUpdate = true;
	};
	return { tex: t, draw };
}

// Head-up display symbology for the combiner glass: heading tape, pitch ladder, flight path marker
function hudSymbology(c: CabinContent): Live {
	const W = 1024, H = 640;
	const { g, t, begin } = liveCanvas(W, H, 0.75);
	const worlds = [...c.worlds].sort((a, z) => a.orbit - z.orbit);
	const col = 'rgba(140,255,215,0.95)';
	const draw = (time: number) => {
		begin();
		g.clearRect(0, 0, W, H);
		g.strokeStyle = col;
		g.fillStyle = col;
		g.lineWidth = 3;
		g.font = `600 26px ${COND}`;
		g.textAlign = 'center';
		// Heading tape
		const hdg = (127 + time * 1.5) % 360;
		g.beginPath(); g.moveTo(262, 70); g.lineTo(762, 70); g.stroke();
		for (let d = Math.floor((hdg - 26) / 5) * 5; d <= hdg + 26; d += 5) {
			const x = 512 + (d - hdg) * 9.6;
			const long = d % 10 === 0;
			g.beginPath(); g.moveTo(x, 70); g.lineTo(x, long ? 50 : 60); g.stroke();
			if (long) g.fillText(String(((d % 360) + 360) % 360).padStart(3, '0'), x, 40);
		}
		g.beginPath(); g.moveTo(512, 76); g.lineTo(500, 94); g.lineTo(524, 94); g.closePath(); g.fill();
		// Pitch ladder
		const pitch = Math.sin(time * 0.25) * 4, roll = Math.sin(time * 0.18) * 0.05;
		g.save();
		g.translate(512, 330);
		g.rotate(roll);
		for (const p of [-15, -10, -5, 5, 10, 15]) {
			const y = (p - pitch) * -13;
			if (Math.abs(y) > 200) continue;
			g.setLineDash(p < 0 ? [12, 8] : []);
			for (const s of [-1, 1]) {
				g.beginPath(); g.moveTo(s * 70, y); g.lineTo(s * 170, y); g.lineTo(s * 170, y + (p < 0 ? -12 : 12)); g.stroke();
				g.fillText(String(Math.abs(p)), s * 200, y + 9);
			}
		}
		g.setLineDash([]);
		const hy = pitch * 13;
		g.beginPath(); g.moveTo(-320, hy); g.lineTo(-60, hy); g.moveTo(60, hy); g.lineTo(320, hy); g.stroke();
		g.restore();
		// Flight path marker
		g.beginPath(); g.arc(512, 330, 15, 0, Math.PI * 2); g.stroke();
		g.beginPath(); g.moveTo(482, 330); g.lineTo(497, 330); g.moveTo(527, 330); g.lineTo(542, 330); g.moveTo(512, 315); g.lineTo(512, 302); g.stroke();
		// Speed and range boxes, the locked target
		g.textAlign = 'left';
		g.strokeRect(70, 300, 130, 56);
		g.strokeRect(824, 300, 130, 56);
		g.font = `600 34px ${COND}`;
		g.fillText((7.42 + Math.sin(time * 0.9) * 0.03).toFixed(2), 88, 340);
		g.fillText(`${(10.4 + Math.sin(time * 0.2) * 0.04).toFixed(2)}`, 842, 340);
		g.font = `600 22px ${COND}`;
		g.fillText('VEL KM/S', 70, 386);
		g.fillText('ORB AU', 824, 386);
		g.textAlign = 'center';
		const tg = worlds[targetOf(time, worlds.length)];
		g.font = `600 28px ${COND}`;
		g.fillText(`NAV LOCK  ${tg.code}  ${tg.name.toUpperCase()}`, 512, 590);
		t.needsUpdate = true;
	};
	return { tex: t, draw };
}

// The desk's painted surface and its backlit legends, from the same cluster layout the switches sit on.
// The desk is DW wide and DD deep; local x runs to the pilot's left, z away from the pilot.
const DW = 2.2, DD = 0.5;
type Cluster = { x: number; w: number; label: string };
function deskSheets(clusters: Cluster[]) {
	const CW = 2816, CH = 640, s = CW / DW;
	const cx = (x: number) => (DW / 2 - x) * s, cz = (z: number) => (DD / 2 - z) * s;
	const { cv, g } = canvas(CW, CH);
	const { cv: gcv, g: gg } = canvas(CW, CH);
	const rand = rng(53);
	g.fillStyle = '#2a2e35';
	g.fillRect(0, 0, CW, CH);
	for (let n = 0; n < 9000; n++) {
		g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rand() * 0.03})`;
		g.fillRect(rand() * CW, rand() * CH, 2, 2);
	}
	gg.fillStyle = '#000';
	gg.fillRect(0, 0, CW, CH);
	for (const c of clusters) {
		const x0 = cx(c.x + c.w / 2), x1 = cx(c.x - c.w / 2), y0 = cz(0.18), y1 = cz(-0.18);
		g.fillStyle = '#1b1e23';
		g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, 14); g.fill();
		g.strokeStyle = 'rgba(210,220,235,0.22)';
		g.lineWidth = 3;
		g.stroke();
		g.fillStyle = '#5a606a';
		for (const [fx, fy] of [[x0 + 16, y0 + 16], [x1 - 16, y0 + 16], [x0 + 16, y1 - 16], [x1 - 16, y1 - 16]]) { g.beginPath(); g.arc(fx, fy, 6, 0, Math.PI * 2); g.fill(); }
		gg.font = `600 30px ${COND}`;
		gg.fillStyle = '#e8f6ff';
		gg.textAlign = 'center';
		gg.fillText(c.label, (x0 + x1) / 2, y0 + 40);
		gg.fillStyle = 'rgba(232,246,255,0.5)';
		gg.fillRect((x0 + x1) / 2 - 80, y0 + 52, 160, 2);
	}
	return { map: tex(cv), glow: tex(gcv) };
}

// A row of annunciator tiles along the desk's far edge, a few of them lit
function annunciatorSheet() {
	const CW = 2816, CH = 72;
	const { cv, g } = canvas(CW, CH);
	const cells = [['MASTER CAUTION', AMBER], ['O2 FLOW', GREEN], ['PWR BUS A', GREEN], ['PWR BUS B', GREEN], ['CABIN P', ''], ['COMM LINK', GREEN], ['NAV LOCK', CYAN], ['RCS ARM', ''], ['THERMAL', AMBER], ['DOCK RDY', ''], ['GUIDANCE', GREEN], ['FUEL XFER', '']];
	g.fillStyle = '#0b0d10';
	g.fillRect(0, 0, CW, CH);
	const cw = CW / cells.length;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.font = `600 30px ${COND}`;
	cells.forEach(([label, col], i) => {
		const x = i * cw;
		g.fillStyle = col ? col : '#1d2127';
		g.globalAlpha = col ? 0.9 : 1;
		g.fillRect(x + 6, 6, cw - 12, CH - 12);
		g.globalAlpha = 1;
		g.fillStyle = col ? '#101215' : '#4a5260';
		g.fillText(label, x + cw / 2, CH / 2 + 2);
	});
	return tex(cv);
}

function segmentSheet(text: string) {
	const { cv, g } = canvas(512, 112);
	g.fillStyle = '#080604';
	g.fillRect(0, 0, 512, 112);
	g.font = `600 84px ${COND}`;
	g.textAlign = 'right';
	g.textBaseline = 'middle';
	g.fillStyle = 'rgba(242,177,59,0.12)';
	g.fillText('8888.8', 490, 60);
	g.fillStyle = AMBER;
	g.fillText(text, 490, 60);
	return tex(cv);
}

// An overhead panel of painted switch banks with lit legends
function overheadSheet() {
	const CW = 1536, CH = 800;
	const { cv, g } = canvas(CW, CH);
	const rand = rng(61);
	g.fillStyle = '#23272d';
	g.fillRect(0, 0, CW, CH);
	const groups = ['CABIN LIGHTS', 'ENV CONTROL', 'DOCKING', 'EMERGENCY'];
	groups.forEach((label, i) => {
		const x = 40 + (i % 2) * 740, y = 40 + Math.floor(i / 2) * 380;
		g.strokeStyle = 'rgba(210,220,235,0.25)';
		g.lineWidth = 3;
		g.strokeRect(x, y, 716, 340);
		g.font = `600 34px ${COND}`;
		g.fillStyle = '#dfeaf5';
		g.fillText(label, x + 24, y + 48);
		for (let k = 0; k < 7; k++) for (let r = 0; r < 2; r++) {
			const bx = x + 34 + k * 96, by = y + 90 + r * 120;
			const lit = rand();
			g.fillStyle = '#121418';
			g.fillRect(bx, by, 64, 84);
			g.fillStyle = label === 'EMERGENCY' && k < 2 ? RED : lit < 0.3 ? AMBER : lit < 0.55 ? GREEN : '#3b414a';
			g.fillRect(bx + 10, by + 10, 44, 44);
			g.fillStyle = 'rgba(223,234,245,0.6)';
			g.fillRect(bx + 10, by + 66, 44, 4);
		}
	});
	return tex(cv);
}

// ---------- Geometry ----------

// An open surface of revolution about Z, radius r0 at z0 to r1 at z1; u runs around from +X, v from z0 to z1
function shell(r0: number, r1: number, z0: number, z1: number, seg = 128) {
	const pos: number[] = [], uv: number[] = [], idx: number[] = [];
	for (let i = 0; i <= seg; i++) {
		const a = (i / seg) * Math.PI * 2;
		for (const [r, z, v] of [[r0, z0, 0], [r1, z1, 1]]) {
			pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
			uv.push(i / seg, v);
		}
	}
	for (let i = 0; i < seg; i++) {
		const a = i * 2;
		idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

// Display glass: the picture with fine scanlines and a slow rolling band; until it boots, a dim standby
// that a bright line wipes away from the top
const SCREEN_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SCREEN_FRAG = /* glsl */ `
	uniform sampler2D uMap;
	uniform float uTime, uReveal, uGain;
	varying vec2 vUv;
	void main() {
		vec3 c = texture2D(uMap, vUv).rgb;
		float edge = 1.0 - uReveal * 1.1;
		float on = smoothstep(edge - 0.004, edge + 0.004, vUv.y);
		float line = exp(-abs(vUv.y - edge) * 120.0) * step(uReveal, 0.999);
		c *= mix(0.04, 1.0, on);
		c *= 0.97 + 0.03 * sin(vUv.y * 1600.0);
		c *= 1.0 + 0.06 * smoothstep(0.95, 1.0, fract(vUv.y * 0.7 - uTime * 0.11));
		c += vec3(0.4, 0.8, 1.0) * line * 1.4;
		gl_FragColor = vec4(c * uGain, 1.0);
	}`;

// Static meshes that share a material become one mesh per material, so the cabin draws in a few dozen calls
// instead of several hundred. Anything that moves (under an object marked `keep`), glass, displays and instanced
// meshes stay as they are.
function mergeStatic(scene: THREE.Scene) {
	scene.updateMatrixWorld(true);
	const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
	const merged: THREE.Mesh[] = [];
	scene.traverse((o) => {
		if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
		const m = o.material as THREE.Material;
		if (m instanceof THREE.ShaderMaterial || m.transparent) return;
		for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.keep) return;
		let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
		if (g.index) g = g.toNonIndexed();
		for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
		g.clearGroups();
		const list = byMaterial.get(m);
		if (list) list.push(g);
		else byMaterial.set(m, [g]);
		merged.push(o);
	});
	for (const o of merged) o.removeFromParent();
	for (const [m, list] of byMaterial) {
		const g = mergeGeometries(list, false);
		if (g) scene.add(new THREE.Mesh(g, m));
	}
}

export function createCabin(host: HTMLElement, content: CabinContent, opts: { reduced: boolean; onExit: () => void }): Cabin {
	const view = host.querySelector<HTMLElement>('.cabin-view')!;
	const prompt = host.querySelector<HTMLElement>('.cabin-prompt')!;
	let renderer: THREE.WebGLRenderer | null = null;
	let composer: EffectComposer | null = null;
	let bloom: UnrealBloomPass | null = null;
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 600);
	camera.rotation.order = 'YXZ';
	let built = false, isOpen = false, raf = 0, last = 0, openedAt = 0, lockReleasedAt = -1e9;
	// The view eases toward where the mouse turns it
	let yaw = Math.PI, pitch = -0.04, yawGoal = yaw, pitchGoal = pitch;
	const pos = SPAWN.clone(), vel = new THREE.Vector3();
	let leaving = false, atHatch = false, openT = -1, bob = 0;
	let hatchDoor: THREE.Group | null = null, hatchWheel: THREE.Group | null = null;
	const keys = new Set<string>();
	const screens: { mat: THREE.ShaderMaterial; at: THREE.Vector3; reveal: number; on: boolean }[] = [];
	const slots: { live: Live; at: THREE.Vector3; every: number; next: number }[] = [];
	const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), probe = new THREE.Sphere();
	// The render resolution steps down if frames run long, and stays there
	const MAX_PR = Math.min(devicePixelRatio || 1, 1.5);
	let pr = MAX_PR, frameMs = 16.7, judgedAt = 0;

	function build() {
		built = true;
		renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 0.9;
		renderer.setPixelRatio(pr);
		view.prepend(renderer.domElement);
		composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));
		bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 0.93);
		composer.addPass(bloom);
		composer.addPass(new OutputPass());
		const pmrem = new THREE.PMREMGenerator(renderer);
		scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		scene.environmentIntensity = 0.35;
		pmrem.dispose();

		const loader = new THREE.TextureLoader();
		const sky = loader.load(content.textures + 'milky_way.jpg');
		sky.colorSpace = THREE.SRGBColorSpace;
		sky.mapping = THREE.EquirectangularReflectionMapping;
		scene.background = sky;
		scene.backgroundIntensity = 1.6;
		scene.backgroundRotation.set(0.4, 2.2, 0.3);

		const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
		const glow = (c: string, k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
		const mat = {
			metal: std({ color: '#9aa0a8', roughness: 0.35, metalness: 0.85 }),
			gunmetal: std({ color: '#454a52', roughness: 0.45, metalness: 0.7 }),
			dark: std({ color: '#1f2227', roughness: 0.6, metalness: 0.4 }),
			white: std({ color: '#d9dbd8', roughness: 0.7, metalness: 0.02 }),
			locker: std({ color: '#e1e2de', roughness: 0.55, metalness: 0.02 }),
			rail: std({ color: '#d6a63a', roughness: 0.4, metalness: 0.3 }),
			seat: std({ color: '#2f343c', roughness: 0.92, metalness: 0 }),
			strap: std({ color: '#c8662e', roughness: 0.8, metalness: 0 }),
			red: std({ color: '#b3261e', roughness: 0.45, metalness: 0.2 }),
			guard: std({ color: '#c42a1f', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.6 }),
			glass: std({ color: '#0a0e14', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.18 }),
			body: std({ color: '#2b2f36', roughness: 0.5, metalness: 0.55 }),
			trim: std({ color: '#7a808a', roughness: 0.28, metalness: 0.9 }),
			plastic: std({ color: '#15181c', roughness: 0.5, metalness: 0.1 }),
			cap: std({ color: '#3a3f46', roughness: 0.55, metalness: 0.05 }),
			grip: std({ color: '#7d838c', roughness: 0.75, metalness: 0.1 }),
			light: glow('#fff4e2', 1.8),
			cool: glow('#bfe2ff', 1.8),
			green: glow(GREEN, 2.2),
			led: glow(CYAN, 2.4),
			ledSoft: glow(CYAN, 1.1),
		};
		const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
			const mesh = new THREE.Mesh(g, m);
			mesh.position.set(x, y, z);
			scene.add(mesh);
			return mesh;
		};
		const put = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
			o.position.set(x, y, z);
			parent.add(o);
			return o;
		};
		const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
		const rbox = (w: number, h: number, d: number, m: THREE.Material, r = 0.012) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999), m);
		const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
			const d = b.clone().sub(a);
			const g = new THREE.CylinderGeometry(r, r, d.length(), 10);
			g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
			return add(g, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
		};
		// Display glass; wall displays boot when approached, the cockpit's are already running
		const face = (t: THREE.Texture, w: number, h: number, booted: boolean) => {
			const m = new THREE.ShaderMaterial({
				uniforms: { uMap: { value: t }, uTime: { value: 0 }, uReveal: { value: booted || opts.reduced ? 1 : 0 }, uGain: { value: 1.05 } },
				vertexShader: SCREEN_VERT,
				fragmentShader: SCREEN_FRAG,
			});
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
			screens.push({ mat: m, at: new THREE.Vector3(), reveal: m.uniforms.uReveal.value, on: booted });
			return mesh;
		};
		const placeScreens = () => {
			scene.updateMatrixWorld(true);
			scene.traverse((o) => {
				const s = o instanceof THREE.Mesh && screens.find((x) => x.mat === o.material);
				if (s) o.getWorldPosition(s.at);
			});
		};

		// ---------- Hull: walls with portholes, nose with windows, ribs, aft bulkhead ----------
		const portholes = [Math.PI / 2 - 0.62, Math.PI / 2 + 0.62].flatMap((a) => [-2.9, 0.42].map((z) => ({ a, z, r: 0.2 })));
		const wall = wallSheet(portholes);
		add(shell(R, R, Z_HATCH, Z_NOSE), std({ map: wall.map, bumpMap: wall.map, bumpScale: 0.6, alphaMap: wall.alpha, alphaTest: 0.5, roughness: 0.72, metalness: 0.02, side: THREE.BackSide }));
		const nose = noseSheet();
		add(shell(R, R_TIP, Z_NOSE, Z_TIP), std({ map: nose.map, alphaMap: nose.alpha, alphaTest: 0.5, roughness: 0.7, metalness: 0.02, side: THREE.BackSide }));
		for (const p of portholes) {
			const n = new THREE.Vector3(Math.cos(p.a), Math.sin(p.a), 0);
			const ring = new THREE.TorusGeometry(p.r + 0.02, 0.035, 10, 40);
			ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
			add(ring, mat.gunmetal, n.x * (R - 0.03), n.y * (R - 0.03), p.z);
		}
		for (const z of [-2.45, -1.3, -0.15, 1.0, Z_NOSE]) add(new THREE.TorusGeometry(R - 0.02, 0.045, 10, 96), mat.metal, 0, 0, z);
		// The forward docking ring
		add(new THREE.TorusGeometry(R_TIP, 0.06, 12, 48), mat.gunmetal, 0, 0, Z_TIP);
		// Aft bulkhead, with the hatch opening cut through it and a short airlock behind
		const hy = HATCH_Y;
		const bulkShape = new THREE.Shape().absarc(0, 0, R, 0, Math.PI * 2, false);
		bulkShape.holes.push(new THREE.Path().absarc(0, hy, 0.68, 0, Math.PI * 2, true));
		const bulkGeo = new THREE.ShapeGeometry(bulkShape, 48);
		const bulkUv = bulkGeo.attributes.uv;
		for (let i = 0; i < bulkUv.count; i++) bulkUv.setXY(i, bulkUv.getX(i) / (2 * R) + 0.5, bulkUv.getY(i) / (2 * R) + 0.5);
		add(bulkGeo, std({ map: wall.map, roughness: 0.75 }), 0, 0, Z_HATCH);
		add(shell(0.68, 0.68, Z_HATCH - 1.4, Z_HATCH, 48).translate(0, hy, 0), std({ color: '#3a3f46', roughness: 0.6, metalness: 0.5, side: THREE.BackSide }));
		add(new THREE.CircleGeometry(0.68, 48), mat.gunmetal, 0, hy, Z_HATCH - 1.4);
		for (const z of [-0.45, -0.95]) add(new THREE.TorusGeometry(0.66, 0.012, 8, 48), mat.green, 0, hy, Z_HATCH + z);
		add(new THREE.RingGeometry(0.68, 0.86, 64), new THREE.MeshStandardMaterial({ map: hazardSheet(1024, 128, 40), roughness: 0.6 }), 0, hy, Z_HATCH + 0.005);
		add(new THREE.TorusGeometry(0.68, 0.04, 12, 64), mat.metal, 0, hy, Z_HATCH + 0.06);
		// The door: its wheel spins to unlock it, then it slides aside
		hatchDoor = new THREE.Group();
		hatchDoor.position.set(0, hy, Z_HATCH);
		hatchDoor.userData.keep = true;
		scene.add(hatchDoor);
		put(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.08, 64).rotateX(Math.PI / 2), mat.white), hatchDoor, 0, 0, 0.04);
		put(new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), mat.glass), hatchDoor, 0, 0.36, 0.085);
		for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), mat.gunmetal), hatchDoor, s * 0.58, 0.3, 0.06);
		hatchWheel = put(new THREE.Group(), hatchDoor, 0, 0, 0.12);
		put(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 10, 40), mat.gunmetal), hatchWheel, 0, 0, 0.02);
		put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 20).rotateX(Math.PI / 2), mat.gunmetal), hatchWheel);
		for (let i = 0; i < 4; i++) {
			const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
			const spoke = put(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 10).rotateZ(Math.PI / 2), mat.gunmetal), hatchWheel, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.01);
			spoke.rotation.z = a;
		}
		const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: signTexture('AIRLOCK · EXIT', '#5fd28a') }));
		exitSign.position.set(0, hy + 1.0, Z_HATCH + 0.02);
		scene.add(exitSign);
		add(new THREE.SphereGeometry(0.03, 12, 8), mat.green, 0.55, hy + 1.0, Z_HATCH + 0.04);
		const hatchLight = new THREE.PointLight('#7dffa8', 0.6, 3, 2);
		hatchLight.position.set(0, hy + 0.9, Z_HATCH + 0.3);
		scene.add(hatchLight);
		// Fire extinguisher by the hatch
		add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 20), mat.red, -1.05, FLOOR + 0.95, Z_HATCH + 0.25);
		add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), mat.dark, -1.05, FLOOR + 1.2, Z_HATCH + 0.25);

		// ---------- Deck: plating, edge lights, a hazard band marking the hatch zone ----------
		const deckLen = 3.3 - Z_HATCH;
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.05, deckLen), std({ map: floorSheet(), roughness: 0.8, metalness: 0.25 }));
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(0, FLOOR, Z_HATCH + deckLen / 2);
		scene.add(floor);
		const band = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.16), new THREE.MeshStandardMaterial({ map: hazardSheet(1024, 72, 36), roughness: 0.7 }));
		band.rotation.x = -Math.PI / 2;
		band.position.set(0, FLOOR + 0.002, -2.75);
		scene.add(band);
		for (const s of [-1, 1]) box(0.025, 0.02, deckLen - 0.4, mat.cool, s * 1.36, FLOOR + 0.03, Z_HATCH + deckLen / 2 - 0.2);

		// ---------- Ceiling: light strips, cable trays, lights ----------
		for (const s of [-1, 1]) {
			const y = Math.sqrt(R * R - 0.55 * 0.55) - 0.05;
			box(0.12, 0.03, 5.0, mat.light, s * 0.55, y, -0.95);
			box(0.2, 0.05, 5.1, mat.gunmetal, s * 0.55, y + 0.03, -0.95);
			const ty = Math.sqrt(R * R - 1.0) - 0.06;
			box(0.22, 0.06, 5.4, mat.dark, s * 1.0, ty, -0.8);
			for (let k = 0; k < 3; k++) rod(new THREE.Vector3(s * (0.93 + k * 0.05), ty - 0.04, -3.4), new THREE.Vector3(s * (0.93 + k * 0.05), ty - 0.04, 1.9), 0.018, k === 1 ? mat.rail : mat.dark);
		}
		for (const z of [-2.6, -1.0, 0.6]) {
			const l = new THREE.PointLight('#ffeedb', 2.4, 6, 2);
			l.position.set(0, 1.45, z);
			scene.add(l);
		}
		scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3530', 0.5));

		// ---------- Stowage lockers along the lower walls, with handrails above ----------
		for (const s of [-1, 1]) {
			for (let z = -3.3; z < 1.8; z += 0.5) {
				box(0.04, 0.78, 0.47, mat.locker, s * 1.42, FLOOR + 0.4, z + 0.25);
				box(0.03, 0.05, 0.2, mat.gunmetal, s * 1.395, FLOOR + 0.62, z + 0.25);
				box(0.3, 0.78, 0.5, mat.white, s * 1.6, FLOOR + 0.4, z + 0.25);
			}
			rod(new THREE.Vector3(s * 1.45, FLOOR + 2.3, -3.3), new THREE.Vector3(s * 1.45, FLOOR + 2.3, 1.8), 0.017, mat.rail);
			for (let z = -3.3; z <= 1.81; z += 0.85) rod(new THREE.Vector3(s * 1.45, FLOOR + 2.3, z), new THREE.Vector3(s * 1.52, FLOOR + 2.3, z), 0.012, mat.rail);
		}

		// ---------- The records: four wall displays, alternating starboard (-X, on the right walking in) and port ----------
		const sy = EYE - 0.05, SW = 2.0, SH = 1.25;
		const redraw = () => { if (!raf) render(); };
		content.panels.slice(0, 4).forEach((p, i) => {
			const side = i % 2 ? 1 : -1, z = i < 2 ? -1.55 : 0.75;
			const group = new THREE.Group();
			group.position.set(side * 1.5, sy, z);
			group.rotation.y = -side * (Math.PI / 2);
			put(rbox(SW + 0.1, SH + 0.1, 0.06, mat.gunmetal, 0.02), group, 0, 0, -0.035);
			put(rbox(SW + 0.02, SH + 0.02, 0.012, mat.plastic, 0.004), group, 0, 0, -0.004);
			put(face(storyScreen(p, i, content.panels.length, side > 0, redraw), SW, SH, false), group, 0, 0, 0.003);
			put(new THREE.Mesh(new THREE.BoxGeometry(SW - 0.2, 0.008, 0.008), mat.led), group, 0, -SH / 2 - 0.05, 0.004);
			scene.add(group);
			for (const dz of [-SW / 2 + 0.15, SW / 2 - 0.15]) box(0.22, 0.05, 0.05, mat.gunmetal, side * 1.62, sy + 0.3, z + dz);
		});
		// A painted designation on the port wall by the entry
		const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: signTexture('ML-1 · COMMAND', '#2a2f37', true), transparent: true, opacity: 0.8, depthWrite: false }));
		decal.position.set(1.55, EYE + 0.62, -2.9);
		decal.rotation.y = -Math.PI / 2;
		scene.add(decal);

		// ---------- Cockpit ----------
		// Facing the cockpit (+Z), the pilot's left is +X. Two seats with side sticks on their outer armrests.
		for (const s of [-1, 1]) {
			const x = s * 0.6, z = 2.38;
			put(rbox(0.5, 0.12, 0.5, mat.seat, 0.05), scene, x, FLOOR + 0.48, z);
			put(rbox(0.5, 0.72, 0.12, mat.seat, 0.05), scene, x, FLOOR + 0.92, z - 0.26).rotation.x = -0.18;
			put(rbox(0.3, 0.2, 0.1, mat.seat, 0.04), scene, x, FLOOR + 1.38, z - 0.34).rotation.x = -0.18;
			for (const a of [-1, 1]) put(rbox(0.07, 0.07, 0.42, mat.body, 0.02), scene, x + a * 0.28, FLOOR + 0.62, z);
			for (const a of [-0.12, 0.12]) put(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.012), mat.strap), scene, x + a, FLOOR + 0.92, z - 0.19).rotation.x = -0.18;
			rod(new THREE.Vector3(x, FLOOR, z), new THREE.Vector3(x, FLOOR + 0.42, z), 0.05, mat.metal);
			const ax = x + s * 0.28, az = z + 0.13;
			add(new THREE.CylinderGeometry(0.03, 0.035, 0.025, 20), mat.plastic, ax, FLOOR + 0.67, az);
			add(new THREE.CylinderGeometry(0.011, 0.015, 0.07, 14), mat.trim, ax, FLOOR + 0.71, az);
			const grip = add(new THREE.CapsuleGeometry(0.021, 0.06, 4, 12), mat.plastic, ax, FLOOR + 0.78, az + 0.005);
			grip.rotation.x = 0.2;
			add(new THREE.SphereGeometry(0.008, 10, 8), glow(RED, 1.4), ax, FLOOR + 0.825, az + 0.02);
		}

		// Pedestal under the desk, with a vent grille and a cyan underglow on the deck
		put(rbox(2.2, 0.68, 0.66, mat.body, 0.03), scene, 0, FLOOR + 0.34, 3.13);
		put(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.02), mat.plastic), scene, 0, FLOOR + 0.06, 2.795);
		const vents = (() => {
			const { cv, g } = canvas(1024, 192);
			g.fillStyle = '#1a1d22';
			g.fillRect(0, 0, 1024, 192);
			for (let y = 12; y < 192; y += 22) { g.fillStyle = '#07080a'; g.fillRect(16, y, 992, 11); }
			return tex(cv);
		})();
		const grille = put(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), std({ map: vents, roughness: 0.7, metalness: 0.4 })), scene, 0, FLOOR + 0.34, 2.797);
		grille.rotation.y = Math.PI;
		put(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.008, 0.008), mat.led), scene, 0, FLOOR + 0.12, 2.792);
		const under = new THREE.PointLight(CYAN, 0.7, 1.4, 2);
		under.position.set(0, FLOOR + 0.12, 2.65);
		scene.add(under);

		// The desk: a sloped control surface. Its local x runs to the pilot's left and z away from the pilot.
		const desk = new THREE.Group();
		desk.position.set(0, FLOOR + 0.8, 3.0);
		desk.rotation.x = -0.28;
		scene.add(desk);
		const clusters: Cluster[] = [
			{ x: 0, w: 0.36, label: 'THRUST' },
			{ x: 0.42, w: 0.38, label: 'NAV ENTRY' },
			{ x: 0.86, w: 0.42, label: 'RCS · PROPULSION' },
			{ x: -0.42, w: 0.38, label: 'COMMS' },
			{ x: -0.86, w: 0.42, label: 'POWER DIST' },
		];
		const sheets = deskSheets(clusters);
		put(rbox(DW, 0.05, DD, mat.body, 0.012), desk, 0, -0.026, 0);
		const flat = (m: THREE.Mesh) => { m.rotation.set(-Math.PI / 2, 0, Math.PI); return m; };
		put(flat(new THREE.Mesh(new THREE.PlaneGeometry(DW - 0.02, DD - 0.02), std({ map: sheets.map, emissiveMap: sheets.glow, emissive: '#bfe6ff', emissiveIntensity: 1.1, roughness: 0.55, metalness: 0.35 }))), desk, 0, 0.0012, 0);
		put(flat(new THREE.Mesh(new THREE.PlaneGeometry(2.06, 0.05), new THREE.MeshBasicMaterial({ map: annunciatorSheet(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.3) }))), desk, 0, 0.0016, 0.215);
		put(rbox(DW + 0.04, 0.03, 0.04, mat.trim, 0.012), desk, 0, -0.008, -DD / 2 - 0.012);
		put(new THREE.Mesh(new THREE.BoxGeometry(DW - 0.1, 0.004, 0.004), mat.ledSoft), desk, 0, -0.02, -DD / 2 - 0.035);

		// Push buttons, as two instanced sets: dark caps, and lit ones in their own colours
		const unlit: THREE.Matrix4[] = [], lit: { m: THREE.Matrix4; c: THREE.Color }[] = [];
		const flatQ = new THREE.Quaternion();
		const cap = (x: number, z: number, w: number, d: number, color = '', k = 1.3, h = 0.012) => {
			const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), flatQ, new THREE.Vector3(w, h, d));
			if (color) lit.push({ m, c: new THREE.Color(color).multiplyScalar(k) });
			else unlit.push(m);
		};
		const rand = rng(97);
		// Thrust: two levers in their slots
		for (const s of [-1, 1]) {
			put(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.25), mat.plastic), desk, s * 0.07, 0.002, -0.01);
			for (let k = 0; k < 5; k++) put(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.003), mat.trim), desk, s * 0.098, 0.002, -0.12 + k * 0.055);
			const lever = put(new THREE.Group(), desk, s * 0.07, 0, s > 0 ? 0.02 : -0.02);
			lever.rotation.x = 0.32;
			put(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.13, 12), mat.trim), lever, 0, 0.065, 0);
			put(rbox(0.07, 0.032, 0.05, mat.grip, 0.012), lever, 0, 0.14, 0);
			put(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.012), glow(AMBER, 1.5)), lever, 0, 0.157, 0.01);
		}
		cap(0.16, 0.12, 0.04, 0.035, RED, 1.8);
		cap(-0.16, 0.12, 0.04, 0.035, AMBER, 1.8);
		// Nav entry: a keypad under a segment readout
		put(flat(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.057), new THREE.MeshBasicMaterial({ map: segmentSheet('0412.7'), color: new THREE.Color(1, 1, 1).multiplyScalar(1.5) }))), desk, 0.42, 0.002, 0.105);
		for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) cap(0.42 + (k - 1) * 0.07, 0.035 - r * 0.052, 0.054, 0.04, r === 3 && k === 0 ? GREEN : '', 1.5);
		// RCS and propulsion: two banks of toggles, two of them under red guards, each with a status lamp
		for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
			const x = 0.86 + (k - 2.5) * 0.062, z = r ? -0.08 : 0.06;
			put(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), mat.trim), desk, x, 0.002, z);
			const t = put(new THREE.Group(), desk, x, 0.004, z);
			t.rotation.x = rand() < 0.6 ? 0.45 : -0.45;
			put(new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0045, 0.034, 8), mat.metal), t, 0, 0.017, 0);
			put(new THREE.Mesh(new THREE.SphereGeometry(0.0058, 10, 8), mat.metal), t, 0, 0.035, 0);
			if ((r === 0 && k === 1) || (r === 1 && k === 4)) put(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.034, 0.05), mat.guard), desk, x, 0.019, z);
			cap(x, z + 0.04, 0.014, 0.01, rand() < 0.7 ? GREEN : AMBER, 1.8, 0.004);
		}
		// Comms: a grid of lit push buttons
		for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) {
			const v = rand();
			cap(-0.42 + (k - 2) * 0.064, 0.09 - r * 0.062, 0.05, 0.042, v < 0.22 ? AMBER : v < 0.4 ? CYAN : v < 0.48 ? GREEN : '', 1.2);
		}
		// Power distribution: four rotary selectors over a row of lamps
		for (let k = 0; k < 4; k++) {
			const x = -0.86 + (k - 1.5) * 0.095;
			put(new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 28), mat.trim), desk, x, 0.002, 0.045);
			const knob = put(new THREE.Group(), desk, x, 0.004, 0.045);
			knob.rotation.y = rand() * Math.PI * 2;
			put(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.026, 24), mat.plastic), knob, 0, 0.013, 0);
			put(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, 0.016), glow('#ffffff', 1.2)), knob, 0, 0.027, 0.007);
		}
		for (let k = 0; k < 6; k++) cap(-0.86 + (k - 2.5) * 0.06, -0.095, 0.034, 0.03, k < 4 ? GREEN : rand() < 0.5 ? AMBER : '', 1.6);
		const capGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
		const caps = new THREE.InstancedMesh(capGeo, mat.cap, unlit.length);
		unlit.forEach((m, i) => caps.setMatrixAt(i, m));
		desk.add(caps);
		const lamps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), lit.length);
		lit.forEach(({ m, c }, i) => { lamps.setMatrixAt(i, m); lamps.setColorAt(i, c); });
		desk.add(lamps);
		// Behind the desk, a filler panel up to the displays
		put(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.04), mat.body), scene, 0, -0.52, 3.44);

		// The displays: navigation in the middle, command to the pilot's left, systems to the right.
		// Each sits in a housing with bezel keys, under a hood with an LED strip.
		const nav = navScreen(content), cmd = commandScreen(content), sys = systemsScreen(), hud = hudSymbology(content);
		const mfd = (t: THREE.Texture, w: number, h: number, p: THREE.Vector3, yawTo: number, tilt: number, side: number, bottom: number) => {
			const group = new THREE.Group();
			group.position.copy(p);
			group.rotation.set(tilt, yawTo, 0, 'YXZ');
			const hw = w + 0.16, hh = h + 0.15;
			put(rbox(hw, hh, 0.07, mat.body, 0.02), group, 0, 0, -0.04);
			put(rbox(w + 0.03, h + 0.03, 0.012, mat.plastic, 0.004), group, 0, 0, -0.004);
			put(face(t, w, h, true), group, 0, 0, 0.003);
			for (let i = 0; i < bottom; i++) put(rbox(0.05, 0.026, 0.016, mat.cap, 0.005), group, (i - (bottom - 1) / 2) * (w / bottom), -h / 2 - 0.042, 0);
			for (const s of [-1, 1]) for (let i = 0; i < side; i++) put(rbox(0.026, 0.044, 0.016, mat.cap, 0.005), group, s * (w / 2 + 0.042), (i - (side - 1) / 2) * (h / side), 0);
			for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10).rotateX(Math.PI / 2), mat.trim), group, sx * (hw / 2 - 0.022), sy * (hh / 2 - 0.022), -0.004);
			const hood = put(rbox(hw + 0.02, 0.026, 0.17, mat.body, 0.008), group, 0, hh / 2 + 0.006, 0.05);
			hood.rotation.x = 0.12;
			put(new THREE.Mesh(new THREE.BoxGeometry(w, 0.005, 0.005), mat.led), group, 0, hh / 2 - 0.03, 0.125);
			scene.add(group);
			return group;
		};
		const navG = mfd(nav.tex, 0.96, 0.533, new THREE.Vector3(0, FLOOR + 1.2, 3.38), Math.PI, -0.3, 4, 6);
		const cmdG = mfd(cmd.tex, 0.58, 0.397, new THREE.Vector3(0.93, FLOOR + 1.17, 3.2), Math.PI + 0.42, -0.25, 3, 4);
		const sysG = mfd(sys.tex, 0.58, 0.397, new THREE.Vector3(-0.93, FLOOR + 1.17, 3.2), Math.PI - 0.42, -0.25, 3, 4);
		const hoodLight = new THREE.PointLight('#9fdcff', 0.6, 1.0, 2);
		hoodLight.position.set(0, FLOOR + 1.08, 3.02);
		scene.add(hoodLight);
		const consoleGlow = new THREE.PointLight('#9cc8ff', 1.2, 2.5, 2);
		consoleGlow.position.set(0, FLOOR + 1.3, 2.75);
		scene.add(consoleGlow);

		// Head-up display: a combiner glass on two posts above the navigation display
		const hudG = new THREE.Group();
		hudG.position.set(0, FLOOR + 1.73, 3.3);
		hudG.rotation.set(-0.18, Math.PI, 0, 'YXZ');
		scene.add(hudG);
		put(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ color: '#0d2a26', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })), hudG);
		put(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2625), new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1).multiplyScalar(1.4) })), hudG, 0, 0, 0.002);
		for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.3, 0.012), mat.trim), hudG, s * 0.218, -0.04, -0.004);
		put(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.014, 0.02), mat.body), hudG, 0, -0.137, -0.004);
		// How often each display redraws; the command display only blinks its cursor
		slots.push(
			{ live: nav, at: navG.position, every: 1 / 15, next: 0 },
			{ live: hud, at: hudG.position, every: 1 / 15, next: 0.02 },
			{ live: sys, at: sysG.position, every: 1 / 12, next: 0.04 },
			{ live: cmd, at: cmdG.position, every: 0.5, next: 0.06 },
		);

		// Overhead panel above the seats
		const over = new THREE.Group();
		over.position.set(0, 1.62, 2.3);
		over.rotation.x = 0.2;
		scene.add(over);
		put(rbox(0.86, 0.05, 0.44, mat.body, 0.015), over);
		const overSheet = overheadSheet();
		const overFace = put(new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.4), std({ map: overSheet, emissiveMap: overSheet, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.6 })), over, 0, -0.026, 0);
		overFace.rotation.set(Math.PI / 2, 0, Math.PI);

		// ---------- Outside the windows: the star, and a world hanging in the dark ----------
		const sunDir = new THREE.Vector3(0.45, 0.55, 1).normalize();
		const glowTex = (() => {
			const { cv, g } = canvas(256, 256);
			const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
			gr.addColorStop(0, 'rgba(255,240,214,1)'); gr.addColorStop(0.1, 'rgba(255,214,150,0.8)'); gr.addColorStop(0.4, 'rgba(242,177,59,0.12)'); gr.addColorStop(1, 'rgba(242,177,59,0)');
			g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
			return tex(cv);
		})();
		const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.3) }));
		sunSprite.position.copy(sunDir).multiplyScalar(300);
		sunSprite.scale.setScalar(34);
		scene.add(sunSprite);
		const planetTex = loader.load(content.textures + 'neptune.jpg');
		planetTex.colorSpace = THREE.SRGBColorSpace;
		const planet = new THREE.Mesh(
			new THREE.SphereGeometry(40, 96, 48),
			new THREE.ShaderMaterial({
				uniforms: { uMap: { value: planetTex }, uSun: { value: sunDir } },
				vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
				fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN;
					void main() { float d = max(dot(normalize(vN), uSun), 0.0); vec3 c = texture2D(uMap, vUv).rgb * (0.02 + 1.3 * d);
					gl_FragColor = vec4(c, 1.0);
					#include <colorspace_fragment>
					}`,
			}),
		);
		planet.position.set(-90, 120, 260);
		scene.add(planet);

		placeScreens();
		for (const sl of slots) sl.live.draw(0);
		mergeStatic(scene);
		// Compile every shader now rather than on the first frames, which would stutter
		renderer.compile(scene, camera);
	}

	// ---------- Walking ----------
	const seats = [[0.3, 0.9], [-0.9, -0.3]].map(([x0, x1]) => ({ x0, x1, z0: 2.08, z1: 2.68 }));
	function collide(p: THREE.Vector3) {
		p.x = THREE.MathUtils.clamp(p.x, -1.2, 1.2);
		p.z = THREE.MathUtils.clamp(p.z, Z_HATCH + 0.3, 2.55);
		for (const b of seats) {
			const cx = THREE.MathUtils.clamp(p.x, b.x0, b.x1), cz = THREE.MathUtils.clamp(p.z, b.z0, b.z1);
			const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
			if (d < PLAYER) {
				if (d > 1e-5) { p.x = cx + (dx / d) * PLAYER; p.z = cz + (dz / d) * PLAYER; }
				else p.z = b.z0 - PLAYER;
			}
		}
	}

	const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();
	function step(dt: number) {
		const ease = opts.reduced ? 1 : 1 - Math.exp(-dt * 22);
		yaw += (yawGoal - yaw) * ease;
		pitch += (pitchGoal - pitch) * ease;
		const f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0);
		const s = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
		fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
		right.set(Math.cos(yaw), 0, -Math.sin(yaw));
		want.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
		if (want.lengthSq() > 0) want.normalize().multiplyScalar(keys.has('run') ? 3.0 : 1.6);
		vel.lerp(want, 1 - Math.exp(-dt * 9));
		if (leaving) vel.multiplyScalar(0.9);
		pos.addScaledVector(vel, dt);
		collide(pos);
		const speed = Math.hypot(vel.x, vel.z);
		bob += dt * speed * 5.2;
		camera.position.set(pos.x, EYE + (opts.reduced ? 0 : Math.sin(bob) * 0.018 * Math.min(speed, 1.6)), pos.z);
		camera.rotation.set(pitch, yaw, 0);
		camera.updateMatrixWorld();
		// At the hatch and facing it, F opens it
		const near = !leaving && pos.z < Z_HATCH + 1.3 && Math.abs(pos.x) < 0.9 && fwd.z < -0.55;
		if (near !== atHatch) {
			atHatch = near;
			prompt.classList.toggle('on', near);
		}
		if (openT >= 0 && hatchDoor && hatchWheel) {
			openT += dt;
			// Step back and look at the door while it opens
			const k = 1 - Math.exp(-dt * 4), back = Z_HATCH + 1.15;
			if (pos.z < back) pos.z += (back - pos.z) * k;
			pos.x -= pos.x * k;
			pitchGoal = Math.atan2(HATCH_Y - EYE, pos.z - Z_HATCH);
			hatchWheel.rotation.z = -Math.PI * 2 * THREE.MathUtils.smoothstep(openT, 0, 0.55);
			hatchDoor.position.x = 1.42 * THREE.MathUtils.smoothstep(openT, 0.45, 1.15);
			// Timed by the animation itself, so the fade never runs ahead of the door
			if (openT > 0.95) host.classList.add('fading');
			if (openT > 1.55) { openT = -1; opts.onExit(); }
		}
		// Wall displays boot as the pilot comes near; all of them run their scanlines
		const time = (performance.now() - openedAt) / 1000;
		for (const sc of screens) {
			if (!sc.on && camera.position.distanceTo(sc.at) < REVEAL_AT) sc.on = true;
			if (sc.on && sc.reveal < 1) sc.reveal = Math.min(1, sc.reveal + dt / 1.1);
			sc.mat.uniforms.uReveal.value = sc.reveal;
			sc.mat.uniforms.uTime.value = time;
		}
		// The flight displays redraw at a display's pace, at most one per frame, and only while in view
		if (!opts.reduced) {
			let due: (typeof slots)[number] | null = null;
			for (const sl of slots) if (time >= sl.next && (!due || sl.next < due.next)) due = sl;
			if (due) {
				due.next = time + due.every;
				viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
				frustum.setFromProjectionMatrix(viewProj);
				if (frustum.intersectsSphere(probe.set(due.at, 0.7)) && camera.position.distanceTo(due.at) < 7) due.live.draw(time);
			}
		}
	}

	function leave() {
		if (leaving) return;
		leaving = true;
		atHatch = false;
		prompt.classList.remove('on');
		host.classList.add('leaving');
		if (document.pointerLockElement) document.exitPointerLock();
		if (opts.reduced) { opts.onExit(); return; }
		// The wheel turns, the door slides open, then the view fades out to the ship
		openT = 0;
		yawGoal = Math.round(yaw / (Math.PI * 2)) * Math.PI * 2; // square on to the hatch
	}

	function render() {
		composer?.render();
	}

	function setResolution(next: number) {
		pr = next;
		renderer?.setPixelRatio(pr);
		composer?.setPixelRatio(pr);
		resize();
	}

	function frame(now: number) {
		const ms = now - last;
		const dt = Math.min(ms / 1000, 0.05);
		last = now;
		// Long frames (hidden tabs aside) step the resolution down
		if (ms < 100) frameMs += (ms - frameMs) * 0.05;
		if (now - judgedAt > 1500) {
			judgedAt = now;
			if (frameMs > 22 && pr > 0.75) setResolution(Math.max(0.75, pr - 0.25));
		}
		step(dt);
		render();
		raf = requestAnimationFrame(frame);
	}

	function resize() {
		if (!renderer || !composer || !bloom) return;
		const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
		renderer.setSize(w, h, false);
		composer.setSize(w, h);
		bloom.resolution.set(w / 2, h / 2);
		camera.aspect = w / h;
		camera.fov = w / h < 0.8 ? 82 : 70;
		camera.updateProjectionMatrix();
	}
	new ResizeObserver(resize).observe(host);

	// ---------- Input: keys, a captured mouse (or touch drag) to look, the touch pad ----------
	const keyMap: Record<string, string> = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
	addEventListener('keydown', (e) => {
		if (!isOpen) return;
		if (e.code === 'KeyF' && atHatch) { leave(); e.preventDefault(); return; }
		if (leaving || !(e.code in keyMap)) return;
		keys.add(keyMap[e.code]);
		e.preventDefault();
	});
	addEventListener('keyup', (e) => { if (e.code in keyMap) keys.delete(keyMap[e.code]); });
	addEventListener('blur', () => keys.clear());
	const look = (dx: number, dy: number, k: number) => {
		yawGoal -= dx * k;
		pitchGoal = THREE.MathUtils.clamp(pitchGoal - dy * k, -1.35, 1.35);
	};
	// The mouse is captured (pointer lock): the cursor is hidden and the view turns as far as the mouse moves.
	// Browsers only capture it on a click, so entering through the module's button captures it at once;
	// otherwise, and after Escape frees it, a click on the view captures it again.
	const lock = () => {
		if (!isOpen || leaving || noLock || document.pointerLockElement === view) return;
		try { (view.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not allowed here */ }
	};
	// A browser that refuses to capture the mouse falls back to dragging to look
	let noLock = false;
	document.addEventListener('pointerlockerror', () => {
		if (!isOpen) return;
		noLock = true;
		host.classList.add('no-lock');
	});
	document.addEventListener('pointerlockchange', () => {
		const locked = document.pointerLockElement === view;
		host.classList.toggle('locked', locked);
		if (!locked) lockReleasedAt = performance.now();
	});
	// Some browsers report an occasional huge jump while the mouse is captured; those are clipped
	const clip = (v: number) => THREE.MathUtils.clamp(v, -120, 120);
	document.addEventListener('mousemove', (e) => { if (isOpen && document.pointerLockElement === view) look(clip(e.movementX), clip(e.movementY), 0.0022); });
	prompt.addEventListener('click', () => { if (atHatch) leave(); });
	host.querySelector('.cabin-capture')?.addEventListener('click', lock);
	let drag: { x: number; y: number } | null = null;
	view.addEventListener('pointermove', (e) => {
		if (e.pointerType === 'mouse') {
			if (noLock && e.buttons & 1) look(e.movementX, e.movementY, 0.0035);
			return;
		}
		if (!drag) return;
		look(e.clientX - drag.x, e.clientY - drag.y, 0.004);
		drag = { x: e.clientX, y: e.clientY };
	});
	view.addEventListener('pointerdown', (e) => {
		if (e.pointerType === 'mouse') { lock(); return; }
		drag = { x: e.clientX, y: e.clientY };
		view.setPointerCapture(e.pointerId);
	});
	for (const ev of ['pointerup', 'pointercancel']) view.addEventListener(ev, () => { drag = null; });
	host.querySelectorAll<HTMLButtonElement>('.cabin-pad button').forEach((b) => {
		const k = b.dataset.key!;
		b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); b.setPointerCapture(e.pointerId); });
		for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => keys.delete(k));
	});

	return {
		open() {
			if (isOpen) return;
			isOpen = true;
			openedAt = performance.now();
			if (!built) build();
			pos.copy(SPAWN);
			vel.set(0, 0, 0);
			yaw = yawGoal = Math.PI;
			pitch = pitchGoal = -0.04;
			leaving = atHatch = false;
			openT = -1;
			hatchDoor?.position.setX(0);
			hatchWheel?.rotation.set(0, 0, 0);
			frameMs = 16.7;
			judgedAt = performance.now() + 1500; // let it settle in first
			keys.clear();
			host.hidden = false;
			host.classList.remove('fading', 'leaving');
			void host.offsetWidth;
			host.classList.add('open');
			resize();
			last = performance.now();
			step(0);
			render();
			raf = requestAnimationFrame(frame);
			if (matchMedia('(pointer: fine)').matches) lock();
		},
		close() {
			if (!isOpen) return;
			isOpen = false;
			cancelAnimationFrame(raf);
			raf = 0;
			keys.clear();
			if (document.pointerLockElement) document.exitPointerLock();
			host.classList.remove('open', 'fading', 'locked', 'leaving');
			host.hidden = true;
			prompt.classList.remove('on');
		},
		get isOpen() { return isOpen; },
		get lockReleasedAt() { return lockReleasedAt; },
	};
}
