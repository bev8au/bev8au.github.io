// The vessel's command module: a pressurized cylinder about four metres across, drawn a little larger than modelled,
// with a deck along its floor, the cockpit under the nose windows, and wall displays carrying the pilot's records.
// Units are the module's own: +Z points to the cockpit, +Y is up, and the hatch is the aft bulkhead at -Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
	AMBER, ICE, DIM, CYAN, GREEN, RED, FONT, COND, DISPLAY,
	rng, canvas, tex, wrap, hazardSheet, signTexture, displayFrame, cornerTicks, storyScreen, liveCanvas, shell, pushOut,
	type Panel, type Live, type Kit, type Interior,
} from './interior';

export type CabinContent = {
	name: string;
	panels: Panel[]; // the wall displays, in the order they are met walking in
	worlds: { code: string; name: string; look: string; orbit: number }[];
	vesselOrbit: number;
};

const SCALE = 1.15; // how much larger than modelled the cabin is drawn
const R = 1.9; // hull radius
const FLOOR = -1.15; // deck height; the hull's axis is y = 0
const EYE = FLOOR + 1.62 / SCALE; // a 1.62 m eye height, in cabin units
const Z_HATCH = -3.6, Z_NOSE = 2.2, Z_TIP = 4.0, R_TIP = 0.75;
const HATCH_Y = -0.3; // the hatch's centre height
const SPAWN = new THREE.Vector3(0, EYE, -3.0);
const REVEAL_AT = 2.9 * SCALE; // a wall display boots up once the pilot is this close, in metres

const LOOK_COLOR: Record<string, string> = { eris: '#e9eef2', mars: '#d9774f', saturn: '#e6c88e', neptune: '#5b86ff' };

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

// ---------- The module ----------

export function commandModule(content: CabinContent) {
	return (kit: Kit): Interior => {
		const { world, mat, std, glow, add, put, box, rbox, rod, face, loader } = kit;
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
		// Aft bulkhead and its hatch
		const { door, wheel } = kit.hatch({ z: Z_HATCH, y: HATCH_Y, radius: R, material: std({ map: wall.map, roughness: 0.75 }) });
		// Fire extinguisher by the hatch
		add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 20), mat.red, -1.05, FLOOR + 0.95, Z_HATCH + 0.25);
		add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), mat.dark, -1.05, FLOOR + 1.2, Z_HATCH + 0.25);

		// ---------- Deck: plating, edge lights, a hazard band marking the hatch zone ----------
		const deckLen = 3.3 - Z_HATCH;
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.05, deckLen), std({ map: floorSheet(), roughness: 0.8, metalness: 0.25 }));
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(0, FLOOR, Z_HATCH + deckLen / 2);
		world.add(floor);
		const band = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.16), new THREE.MeshStandardMaterial({ map: hazardSheet(1024, 72, 36), roughness: 0.7 }));
		band.rotation.x = -Math.PI / 2;
		band.position.set(0, FLOOR + 0.002, -2.75);
		world.add(band);
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
			world.add(l);
		}
		world.add(new THREE.HemisphereLight('#dfe8ff', '#3a3530', 0.5));

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
		const sy = FLOOR + 1.52, SW = 2.0, SH = 1.25;
		content.panels.slice(0, 4).forEach((p, i) => {
			const side = i % 2 ? 1 : -1, z = i < 2 ? -1.55 : 0.75;
			const group = new THREE.Group();
			group.position.set(side * 1.5, sy, z);
			group.rotation.y = -side * (Math.PI / 2);
			put(rbox(SW + 0.1, SH + 0.1, 0.06, mat.gunmetal, 0.02), group, 0, 0, -0.035);
			put(rbox(SW + 0.02, SH + 0.02, 0.012, mat.plastic, 0.004), group, 0, 0, -0.004);
			put(face(storyScreen(p, i, content.panels.length, side > 0, kit.redraw), SW, SH, false), group, 0, 0, 0.003);
			put(new THREE.Mesh(new THREE.BoxGeometry(SW - 0.2, 0.008, 0.008), mat.led), group, 0, -SH / 2 - 0.05, 0.004);
			world.add(group);
			for (const dz of [-SW / 2 + 0.15, SW / 2 - 0.15]) box(0.22, 0.05, 0.05, mat.gunmetal, side * 1.62, sy + 0.3, z + dz);
		});
		// A painted designation on the port wall by the entry
		const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: signTexture('ML-1 · COMMAND', '#2a2f37', true), transparent: true, opacity: 0.8, depthWrite: false }));
		decal.position.set(1.55, FLOOR + 2.24, -2.9);
		decal.rotation.y = -Math.PI / 2;
		world.add(decal);

		// ---------- Cockpit ----------
		// Facing the cockpit (+Z), the pilot's left is +X. Two seats with side sticks on their outer armrests.
		for (const s of [-1, 1]) {
			const x = s * 0.6, z = 2.38;
			put(rbox(0.5, 0.12, 0.5, mat.seat, 0.05), world, x, FLOOR + 0.48, z);
			put(rbox(0.5, 0.72, 0.12, mat.seat, 0.05), world, x, FLOOR + 0.92, z - 0.26).rotation.x = -0.18;
			put(rbox(0.3, 0.2, 0.1, mat.seat, 0.04), world, x, FLOOR + 1.38, z - 0.34).rotation.x = -0.18;
			for (const a of [-1, 1]) put(rbox(0.07, 0.07, 0.42, mat.body, 0.02), world, x + a * 0.28, FLOOR + 0.62, z);
			for (const a of [-0.12, 0.12]) put(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.012), mat.strap), world, x + a, FLOOR + 0.92, z - 0.19).rotation.x = -0.18;
			rod(new THREE.Vector3(x, FLOOR, z), new THREE.Vector3(x, FLOOR + 0.42, z), 0.05, mat.metal);
			const ax = x + s * 0.28, az = z + 0.13;
			add(new THREE.CylinderGeometry(0.03, 0.035, 0.025, 20), mat.plastic, ax, FLOOR + 0.67, az);
			add(new THREE.CylinderGeometry(0.011, 0.015, 0.07, 14), mat.trim, ax, FLOOR + 0.71, az);
			const grip = add(new THREE.CapsuleGeometry(0.021, 0.06, 4, 12), mat.plastic, ax, FLOOR + 0.78, az + 0.005);
			grip.rotation.x = 0.2;
			add(new THREE.SphereGeometry(0.008, 10, 8), glow(RED, 1.4), ax, FLOOR + 0.825, az + 0.02);
		}

		// Pedestal under the desk, with a vent grille and a cyan underglow on the deck
		put(rbox(2.2, 0.68, 0.66, mat.body, 0.03), world, 0, FLOOR + 0.34, 3.13);
		put(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.02), mat.plastic), world, 0, FLOOR + 0.06, 2.795);
		const vents = (() => {
			const { cv, g } = canvas(1024, 192);
			g.fillStyle = '#1a1d22';
			g.fillRect(0, 0, 1024, 192);
			for (let y = 12; y < 192; y += 22) { g.fillStyle = '#07080a'; g.fillRect(16, y, 992, 11); }
			return tex(cv);
		})();
		const grille = put(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), std({ map: vents, roughness: 0.7, metalness: 0.4 })), world, 0, FLOOR + 0.34, 2.797);
		grille.rotation.y = Math.PI;
		put(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.008, 0.008), mat.led), world, 0, FLOOR + 0.12, 2.792);
		const under = new THREE.PointLight(CYAN, 0.7, 1.4, 2);
		under.position.set(0, FLOOR + 0.12, 2.65);
		world.add(under);

		// The desk: a sloped control surface. Its local x runs to the pilot's left and z away from the pilot.
		const desk = new THREE.Group();
		desk.position.set(0, FLOOR + 0.8, 3.0);
		desk.rotation.x = -0.28;
		world.add(desk);
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
		put(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.04), mat.body), world, 0, -0.52, 3.44);

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
			world.add(group);
			return group;
		};
		const navG = mfd(nav.tex, 0.96, 0.533, new THREE.Vector3(0, FLOOR + 1.2, 3.38), Math.PI, -0.3, 4, 6);
		const cmdG = mfd(cmd.tex, 0.58, 0.397, new THREE.Vector3(0.93, FLOOR + 1.17, 3.2), Math.PI + 0.42, -0.25, 3, 4);
		const sysG = mfd(sys.tex, 0.58, 0.397, new THREE.Vector3(-0.93, FLOOR + 1.17, 3.2), Math.PI - 0.42, -0.25, 3, 4);
		const hoodLight = new THREE.PointLight('#9fdcff', 0.6, 1.0, 2);
		hoodLight.position.set(0, FLOOR + 1.08, 3.02);
		world.add(hoodLight);
		const consoleGlow = new THREE.PointLight('#9cc8ff', 1.2, 2.5, 2);
		consoleGlow.position.set(0, FLOOR + 1.3, 2.75);
		world.add(consoleGlow);

		// Head-up display: a combiner glass on two posts above the navigation display
		const hudG = new THREE.Group();
		hudG.position.set(0, FLOOR + 1.73, 3.3);
		hudG.rotation.set(-0.18, Math.PI, 0, 'YXZ');
		world.add(hudG);
		put(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ color: '#0d2a26', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })), hudG);
		put(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2625), new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1).multiplyScalar(1.4) })), hudG, 0, 0, 0.002);
		for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.3, 0.012), mat.trim), hudG, s * 0.218, -0.04, -0.004);
		put(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.014, 0.02), mat.body), hudG, 0, -0.137, -0.004);
		// How often each display redraws; the command display only blinks its cursor
		kit.live(nav, navG, 1 / 15);
		kit.live(hud, hudG, 1 / 15);
		kit.live(sys, sysG, 1 / 12);
		kit.live(cmd, cmdG, 0.5);

		// Overhead panel above the seats
		const over = new THREE.Group();
		over.position.set(0, 1.62, 2.3);
		over.rotation.x = 0.2;
		world.add(over);
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
		world.add(sunSprite);
		const planetTex = loader.load(kit.textures + 'neptune.jpg');
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
		world.add(planet);

		return {
			code: 'VSL-01',
			name: 'Command module, aboard ML-1',
			scale: SCALE,
			eye: EYE,
			spawn: SPAWN,
			spawnYaw: Math.PI,
			collide,
			hatch: { z: Z_HATCH, y: HATCH_Y, door, wheel },
			revealAt: REVEAL_AT,
			exposure: 0.9,
		};
	};
}

// ---------- Walking ----------

// The aisle between the lockers, from the hatch to the cockpit, around the two seats
const seats = [[0.3, 0.9], [-0.9, -0.3]].map(([x0, x1]) => ({ x0, x1, z0: 2.08, z1: 2.68 }));
function collide(p: THREE.Vector3, radius: number) {
	p.x = THREE.MathUtils.clamp(p.x, -1.2, 1.2);
	p.z = THREE.MathUtils.clamp(p.z, Z_HATCH + 0.3, 2.55);
	pushOut(p, seats, radius);
}
