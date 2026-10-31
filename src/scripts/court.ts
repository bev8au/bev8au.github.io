// The vessel's first habitat bay: a basketball arena inside a cylinder twenty metres across and thirty-four long.
// A hardwood court runs down its floor between two hoops; bleachers climb one side, arena boards with the pilot's
// basketball story hang along the other, and a scoreboard hangs from a truss over center court.
// Units are metres: +Z runs from the entrance hatch to the viewport at the far end, +Y is up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	AMBER, ICE, DIM, COND, DISPLAY,
	rng, canvas, tex, storyScreen, liveCanvas, shell, pushOut,
	type Panel, type Live, type Kit, type Interior,
} from './interior';

export type CourtContent = {
	panels: Panel[]; // the arena boards, from the hatch end
	banners: { top: string; middle: string; bottom: string }[];
};

const RH = 10; // hall radius
const FL = -5.6; // floor height; the hall's axis is y = 0
const HW = Math.sqrt(RH * RH - FL * FL); // half the floor's width
const Z0 = -17, Z1 = 17; // entrance and far bulkheads
const EYE = FL + 1.62;
const HATCH_Y = FL + 0.85;
const CW = 6, CL = 11; // half the court's width and length
const BASKET = CL - 1.575; // distance from center court to each basket
const NAVY = '#232d4b', ORANGE = '#e57200';

// ---------- Surfaces ----------

// The hall's inner skin, as one sheet: u runs around from +X through +Y, v from the entrance to the far end.
// Acoustic panels in deep navy, an orange accent band along each side just above the floor.
function arenaSheet() {
	const W = 4096, H = 2048;
	const { cv, g } = canvas(W, H);
	const rand = rng(71);
	g.fillStyle = '#121a2c';
	g.fillRect(0, 0, W, H);
	const cols = 52, rows = 10, pw = W / cols, ph = H / rows;
	for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
		const x = i * pw, y = j * ph, k = (rand() - 0.5) * 10;
		g.fillStyle = `rgb(${24 + k},${33 + k},${54 + k})`;
		g.fillRect(x + 3, y + 3, pw - 6, ph - 6);
		// Slatted acoustic face
		g.fillStyle = 'rgba(0,0,0,0.22)';
		for (let s = 8; s < pw - 8; s += 9) g.fillRect(x + s, y + 8, 3, ph - 16);
		g.strokeStyle = 'rgba(120,140,180,0.18)';
		g.lineWidth = 2;
		g.strokeRect(x + 4, y + 4, pw - 8, ph - 8);
	}
	// Accent bands where the walls rise from the floor, and a lighter band high up
	const band = (y: number, color: string, wpx: number) => {
		for (const a of [Math.asin(y / RH), Math.PI - Math.asin(y / RH)]) {
			const u = (((a / (Math.PI * 2)) % 1) + 1) % 1;
			g.fillStyle = color;
			g.fillRect(u * W - wpx / 2, 0, wpx, H);
		}
	};
	band(FL + 1.1, ORANGE, 22);
	band(FL + 1.35, 'rgba(229,114,0,0.5)', 6);
	band(FL + 7.4, 'rgba(147,163,192,0.35)', 14);
	return tex(cv);
}

// The floor: maple planks along the court, the court's lines and paint, and the surrounds in navy.
// Canvas x follows world x; canvas y runs from the entrance (top) to the far end.
function courtSheet() {
	const L = Z1 - Z0, W = 4096, H = Math.round((W * L) / (2 * HW));
	const { cv, g } = canvas(W, H);
	const sx = W / (2 * HW), sz = H / L;
	const X = (x: number) => (x + HW) * sx, Z = (z: number) => (z - Z0) * sz;
	const rand = rng(83);
	// Planks: narrow strips along z, their butt joints staggered
	const plank = 0.06 * sx;
	for (let x = 0; x < W; x += plank) {
		let y = -rand() * 1.8 * sz;
		while (y < H) {
			const len = (1.2 + rand() * 1.6) * sz, k = (rand() - 0.5) * 22;
			g.fillStyle = `rgb(${206 + k},${158 + k * 0.8},${102 + k * 0.6})`;
			g.fillRect(x, y, plank - 1, len - 2);
			y += len;
		}
	}
	// Grain
	for (let n = 0; n < 26000; n++) {
		g.fillStyle = `rgba(120,70,30,${0.03 + rand() * 0.05})`;
		g.fillRect(rand() * W, rand() * H, 1, 6 + rand() * 30);
	}
	// Out of bounds in navy; the keys painted navy; center circle orange
	g.fillStyle = 'rgba(35,45,75,0.92)';
	g.fillRect(0, 0, W, Z(-CL));
	g.fillRect(0, Z(CL), W, H - Z(CL));
	g.fillRect(0, Z(-CL), X(-CW), Z(CL) - Z(-CL));
	g.fillRect(X(CW), Z(-CL), W - X(CW), Z(CL) - Z(-CL));
	for (const e of [-1, 1]) {
		const zb = e * CL, zf = e * (CL - 5.8);
		g.fillRect(X(-2.45), Math.min(Z(zb), Z(zf)), X(2.45) - X(-2.45), Math.abs(Z(zb) - Z(zf)));
	}
	g.fillStyle = 'rgba(229,114,0,0.88)';
	g.beginPath(); g.arc(X(0), Z(0), 1.8 * sx, 0, Math.PI * 2); g.fill();
	// Lines, five centimetres wide
	g.strokeStyle = '#f4f1ea';
	g.lineWidth = Math.max(4, 0.05 * sx);
	g.strokeRect(X(-CW), Z(-CL), X(CW) - X(-CW), Z(CL) - Z(-CL));
	g.beginPath(); g.moveTo(X(-CW), Z(0)); g.lineTo(X(CW), Z(0)); g.stroke();
	g.beginPath(); g.arc(X(0), Z(0), 1.8 * sx, 0, Math.PI * 2); g.stroke();
	g.beginPath(); g.arc(X(0), Z(0), 0.6 * sx, 0, Math.PI * 2); g.stroke();
	for (const e of [-1, 1]) {
		const zb = e * CL, zbk = e * BASKET, zf = e * (CL - 5.8);
		// Key and free-throw circle: solid toward center court, dashed inside the key
		g.strokeRect(X(-2.45), Math.min(Z(zb), Z(zf)), X(2.45) - X(-2.45), Math.abs(Z(zb) - Z(zf)));
		const toCenter = e > 0 ? [Math.PI, Math.PI * 2] : [0, Math.PI];
		g.beginPath(); g.arc(X(0), Z(zf), 1.8 * sx, toCenter[0], toCenter[1]); g.stroke();
		g.setLineDash([0.35 * sx, 0.3 * sx]);
		g.beginPath(); g.arc(X(0), Z(zf), 1.8 * sx, toCenter[1], toCenter[0] + Math.PI * 2); g.stroke();
		g.setLineDash([]);
		// Three-point line: straight in the corners, then an arc around the basket
		const r3 = 5.6, xc = 5.4, dz = Math.sqrt(r3 * r3 - xc * xc);
		for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(s * xc), Z(zb)); g.lineTo(X(s * xc), Z(zbk - e * dz)); g.stroke(); }
		const a0 = Math.atan2(-e * dz * sz, xc * sx), a1 = Math.atan2(-e * dz * sz, -xc * sx);
		g.beginPath(); g.arc(X(0), Z(zbk), r3 * sx, Math.min(a0, a1), Math.max(a0, a1), e < 0); g.stroke();
		// Restricted area
		g.beginPath(); g.arc(X(0), Z(zbk), 1.25 * sx, e > 0 ? Math.PI : 0, e > 0 ? Math.PI * 2 : Math.PI); g.stroke();
	}
	// Center court and the surrounds carry the bay's name
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillStyle = '#f4f1ea';
	g.font = `400 ${Math.round(0.7 * sx)}px ${DISPLAY}`;
	g.fillText('ML-1', X(0), Z(0));
	g.save();
	g.translate(X((CW + HW) / 2), Z(0));
	g.rotate(Math.PI / 2);
	g.font = `600 ${Math.round(0.8 * sx)}px ${COND}`;
	g.fillStyle = 'rgba(244,241,234,0.85)';
	g.fillText('THE COURT  ·  HABITAT BAY 1', 0, 0);
	g.restore();
	for (const e of [-1, 1]) {
		g.save();
		g.translate(X(0), Z(e * (CL + (Z1 - CL) / 2)));
		if (e > 0) g.rotate(Math.PI); // each reads the right way up from center court
		g.font = `400 ${Math.round(0.55 * sx)}px ${DISPLAY}`;
		g.fillStyle = 'rgba(229,114,0,0.95)';
		g.fillText('CSSS BASKETBALL', 0, 0);
		g.restore();
	}
	return tex(cv);
}

// Backboard markings on clear glass
function backboardSheet() {
	const { cv, g } = canvas(720, 420);
	g.clearRect(0, 0, 720, 420);
	g.fillStyle = 'rgba(200,230,255,0.12)';
	g.fillRect(0, 0, 720, 420);
	g.strokeStyle = '#ffffff';
	g.lineWidth = 14;
	g.strokeRect(7, 7, 706, 406);
	g.lineWidth = 10;
	g.strokeRect(242, 230, 236, 180);
	return tex(cv);
}

function ballSheet() {
	const { cv, g } = canvas(512, 256);
	g.fillStyle = '#d2601c';
	g.fillRect(0, 0, 512, 256);
	const rand = rng(5);
	for (let n = 0; n < 4000; n++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`; g.fillRect(rand() * 512, rand() * 256, 2, 2); }
	g.strokeStyle = '#1a0f08';
	g.lineWidth = 5;
	g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
	for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
	for (const x of [0, 256]) { g.beginPath(); g.ellipse(x + 128, 128, 90, 128, 0, 0, Math.PI * 2); g.stroke(); }
	return tex(cv);
}

// A championship banner, its foot cut to a point (transparent outside)
function bannerSheet(b: CourtContent['banners'][number]) {
	const W = 512, H = 1170;
	const { cv, g } = canvas(W, H);
	g.beginPath();
	g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H - 160); g.lineTo(W / 2, H); g.lineTo(0, H - 160); g.closePath();
	g.fillStyle = NAVY;
	g.fill();
	g.save();
	g.clip();
	g.strokeStyle = ORANGE;
	g.lineWidth = 22;
	g.beginPath();
	g.moveTo(26, 0); g.lineTo(26, H - 172); g.lineTo(W / 2, H - 30); g.lineTo(W - 26, H - 172); g.lineTo(W - 26, 0);
	g.stroke();
	g.restore();
	g.textAlign = 'center';
	g.fillStyle = ICE;
	g.font = `600 64px ${COND}`;
	g.fillText(b.top.toUpperCase(), W / 2, 170);
	// A five-pointed star
	g.fillStyle = ORANGE;
	g.beginPath();
	for (let i = 0; i < 10; i++) {
		const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 26 : 62;
		g.lineTo(W / 2 + Math.cos(a) * r, 290 + Math.sin(a) * r);
	}
	g.fill();
	g.fillStyle = '#ffffff';
	g.font = `400 56px ${DISPLAY}`;
	let y = 470;
	for (const word of b.middle.toUpperCase().split(' ')) { g.fillText(word, W / 2, y); y += 84; }
	g.fillStyle = DIM;
	g.font = `600 44px ${COND}`;
	g.fillText(b.bottom.toUpperCase(), W / 2, y + 40);
	g.fillStyle = ORANGE;
	g.font = `600 40px ${COND}`;
	g.fillText('ML-1', W / 2, H - 230);
	return tex(cv);
}

function paintedSign(text: string, sub: string) {
	const { cv, g } = canvas(2048, 512);
	g.textAlign = 'center';
	g.fillStyle = '#f4f1ea';
	g.font = `400 210px ${DISPLAY}`;
	g.fillText(text, 1024, 250);
	g.fillStyle = ORANGE;
	g.fillRect(724, 300, 600, 10);
	g.fillStyle = 'rgba(244,241,234,0.8)';
	g.font = `600 84px ${COND}`;
	g.fillText(sub, 1024, 430);
	return tex(cv);
}

// The scoreboard: the bay's name, a running game clock and shot clock, and a ticker of the pilot's honors
function scoreboardScreen(ticker: string): Live {
	const W = 1600, H = 960;
	const { g, t, begin } = liveCanvas(W, H, 0.8);
	const draw = (time: number) => {
		begin();
		g.fillStyle = '#04060a';
		g.fillRect(0, 0, W, H);
		g.fillStyle = 'rgba(255,255,255,0.035)';
		for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 2, H);
		for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 2);
		g.textAlign = 'center';
		g.textBaseline = 'alphabetic';
		g.font = `400 52px ${DISPLAY}`;
		g.fillStyle = AMBER;
		g.fillText('ML-1  ·  THE COURT', W / 2, 92);
		g.fillStyle = 'rgba(242,177,59,0.5)';
		g.fillRect(80, 122, W - 160, 4);
		// Home and guest
		const home = 40 + (Math.floor(time / 17) % 30) * 2, guest = 38 + (Math.floor(time / 23) % 30) * 2;
		for (const [x, label, team, score] of [[300, 'HOME', 'CSSS', home], [W - 300, 'GUEST', 'VISITORS', guest]] as const) {
			g.font = `600 54px ${COND}`;
			g.fillStyle = ICE;
			g.fillText(label, x, 220);
			g.font = `400 64px ${DISPLAY}`;
			g.fillStyle = label === 'HOME' ? ORANGE : DIM;
			g.fillText(team, x, 310);
			g.font = `600 300px ${COND}`;
			g.fillStyle = '#ff4d1f';
			g.shadowColor = '#ff4d1f';
			g.shadowBlur = 24;
			g.fillText(String(score).padStart(2, '0'), x, 610);
			g.shadowBlur = 0;
		}
		// Game clock counts down twelve minutes, the shot clock twenty-four seconds
		const left = 720 - (time % 720), sc = 24 - (time % 24);
		g.font = `600 220px ${COND}`;
		g.fillStyle = AMBER;
		g.shadowColor = AMBER;
		g.shadowBlur = 22;
		g.fillText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, W / 2, 420);
		g.shadowBlur = 0;
		g.font = `600 48px ${COND}`;
		g.fillStyle = ICE;
		g.fillText('PERIOD 4', W / 2, 500);
		g.font = `600 150px ${COND}`;
		g.fillStyle = sc < 5 ? '#ff4d1f' : '#ffffff';
		g.fillText(String(Math.ceil(sc)).padStart(2, '0'), W / 2, 660);
		g.font = `600 36px ${COND}`;
		g.fillStyle = DIM;
		g.fillText('SHOT CLOCK', W / 2, 708);
		// Ticker
		g.fillStyle = 'rgba(229,114,0,0.9)';
		g.fillRect(0, 790, W, 120);
		g.font = `600 64px ${COND}`;
		g.fillStyle = '#ffffff';
		g.textAlign = 'left';
		const span = g.measureText(ticker).width + 120;
		const x0 = -((time * 170) % span);
		for (let x = x0; x < W; x += span) g.fillText(ticker, x, 872);
		t.needsUpdate = true;
	};
	return { tex: t, draw };
}

// A basketball net: diamonds of cord from the rim down to a narrower ring
function netGeometry(r0: number, r1: number, h: number, n = 14) {
	const levels = [0, 1, 2, 3].map((k) => {
		const r = r0 + (r1 - r0) * (k / 3), y = -h * (k / 3), off = k % 2 ? 0.5 : 0;
		return Array.from({ length: n }, (_, i) => { const a = ((i + off) / n) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
	});
	const pts: THREE.Vector3[] = [];
	for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) {
		const j = k % 2 ? (i + 1) % n : (i + n - 1) % n;
		pts.push(levels[k][i], levels[k + 1][i], levels[k][i], levels[k + 1][j]);
	}
	for (let i = 0; i < n; i++) pts.push(levels[3][i], levels[3][(i + 1) % n]);
	return new THREE.BufferGeometry().setFromPoints(pts);
}

// ---------- The bay ----------

export function courtBay(content: CourtContent) {
	return (kit: Kit): Interior => {
		const { world, mat, std, glow, add, put, box, rbox, rod, face, loader } = kit;
		const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
		const navy = std({ color: NAVY, roughness: 0.7, metalness: 0.1 });
		const orange = std({ color: ORANGE, roughness: 0.55, metalness: 0.1 });
		const steel = std({ color: '#5b626d', roughness: 0.4, metalness: 0.8 });
		const pad = std({ color: '#1b2440', roughness: 0.85, metalness: 0 });

		// ---------- Hall: the cylinder's skin, ribs every three metres, the floor ----------
		add(shell(RH, RH, Z0, Z1, 160), std({ map: arenaSheet(), roughness: 0.85, metalness: 0.05, side: THREE.BackSide }));
		for (let z = -15; z <= 15; z += 3) add(new THREE.TorusGeometry(RH - 0.14, 0.16, 10, 120), steel, 0, 0, z);
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, Z1 - Z0), std({ map: courtSheet(), roughness: 0.46, metalness: 0, envMapIntensity: 1.3 }));
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(0, FL, (Z0 + Z1) / 2);
		world.add(floor);

		// ---------- Entrance bulkhead with the hatch, and the bay's name over it ----------
		const bulkMat = std({ color: '#1a2236', roughness: 0.8, metalness: 0.2 });
		const { door, wheel } = kit.hatch({ z: Z0, y: HATCH_Y, radius: RH, material: bulkMat });
		const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: paintedSign('THE COURT', 'HABITAT BAY 1  ·  ML-1'), transparent: true, depthWrite: false }));
		sign.position.set(0, FL + 8.4, Z0 + 0.03);
		world.add(sign);

		// ---------- Far bulkhead: a round viewport onto space ----------
		const vy = FL + 6.4, vr = 3.6;
		const farShape = new THREE.Shape().absarc(0, 0, RH, 0, Math.PI * 2, false);
		farShape.holes.push(new THREE.Path().absarc(0, vy, vr, 0, Math.PI * 2, true));
		const far = add(new THREE.ShapeGeometry(farShape, 96), bulkMat, 0, 0, Z1);
		far.rotation.y = Math.PI;
		add(new THREE.TorusGeometry(vr, 0.18, 14, 96), steel, 0, vy, Z1 - 0.05);
		add(new THREE.TorusGeometry(vr * 0.42, 0.08, 10, 64), steel, 0, vy, Z1 - 0.04);
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2;
			rod(V(Math.cos(a) * vr * 0.42, vy + Math.sin(a) * vr * 0.42, Z1 - 0.04), V(Math.cos(a) * vr, vy + Math.sin(a) * vr, Z1 - 0.04), 0.06, steel);
		}
		const glassPane = add(new THREE.CircleGeometry(vr, 64), mat.glass, 0, vy, Z1 - 0.02);
		glassPane.rotation.y = Math.PI;

		// ---------- Hoops at both ends ----------
		const boardTex = backboardSheet();
		const rimMat = std({ color: '#e2571c', roughness: 0.45, metalness: 0.6 });
		const netMat = new THREE.LineBasicMaterial({ color: '#eef0f2' });
		for (const e of [-1, 1]) {
			const zb = e * (CL - 1.2); // backboard face
			// Hung from the ceiling, as in a gym: a braced drop truss over the board, clear of the floor
			const top = Math.sqrt(RH * RH - 0.6 * 0.6) - 0.25, foot = FL + 4.45, zt = zb + e * 0.45;
			for (const sx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) rod(V(sx, foot, zt + dz), V(sx, top, zt + dz), 0.045, steel);
			for (let y = foot; y < top - 0.6; y += 1.2) {
				for (const dz of [-0.3, 0.3]) rod(V(-0.3, y, zt + dz), V(0.3, y + 1.2, zt + dz), 0.025, steel);
				for (const sx of [-0.3, 0.3]) rod(V(sx, y, zt - 0.3), V(sx, y + 1.2, zt + 0.3), 0.025, steel);
			}
			for (const sx of [-0.3, 0.3]) rod(V(sx, foot, zt - e * 0.3), V(sx, FL + 3.85, zb + e * 0.06), 0.04, steel);
			// Bracing back to the end wall
			for (const sx of [-0.3, 0.3]) rod(V(sx, top - 1.2, zt + e * 0.3), V(sx * 4, top - 2.4, e * (Z1 - 0.4)), 0.035, steel);
			// Board, its frame and padding, a shot clock on top
			const board = new THREE.Group();
			board.position.set(0, FL + 3.05 + 0.15 + 0.525, zb);
			board.rotation.y = e > 0 ? Math.PI : 0;
			world.add(board);
			put(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05), new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })), board);
			for (const [w, h, x, y] of [[1.84, 0.04, 0, 0.545], [1.84, 0.04, 0, -0.545], [0.04, 1.1, 0.91, 0], [0.04, 1.1, -0.91, 0]] as const) put(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat.dark), board, x, y, -0.02);
			put(new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.12, 0.1), pad), board, 0, -0.6, 0);
			put(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.2), mat.dark), board, 0, 0.7, -0.05);
			put(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), glow('#ff3b1f', 1.6)), board, 0, 0.7, 0.051);
			// Rim on its mount, and the net
			const rimZ = zb - e * (0.15 + 0.23);
			box(0.22, 0.04, 0.17, rimMat, 0, FL + 3.05, zb - e * 0.08);
			add(new THREE.TorusGeometry(0.23, 0.011, 8, 40).rotateX(Math.PI / 2), rimMat, 0, FL + 3.05, rimZ);
			const net = new THREE.LineSegments(netGeometry(0.225, 0.15, 0.42), netMat);
			net.position.set(0, FL + 3.045, rimZ);
			world.add(net);
		}

		// ---------- Bleachers up the -X side, team benches and the scorer's table in front ----------
		const tiers = 4, depth = 0.56, rise = 0.42, front = -6.7;
		for (let k = 0; k < tiers; k++) {
			const x1 = front - depth * k, x0 = x1 - depth, h = rise * (k + 1);
			box(depth, h, 18.6, k % 2 ? mat.body : mat.dark, (x0 + x1) / 2, FL + h / 2, 0);
			box(depth, 0.03, 18.6, steel, (x0 + x1) / 2, FL + h + 0.015, 0);
		}
		// A rail along the top tier
		const backX = front - depth * tiers + 0.08, topY = FL + rise * tiers;
		for (let z = -9; z <= 9; z += 1.5) rod(V(backX, topY, z), V(backX, topY + 0.95, z), 0.025, steel);
		rod(V(backX, topY + 0.95, -9.3), V(backX, topY + 0.95, 9.3), 0.03, steel);
		// Seats, instanced: navy with orange rows
		const seatGeo = mergeGeometries([
			new RoundedBoxGeometry(0.44, 0.06, 0.4, 2, 0.02).translate(0, 0.03, 0),
			new RoundedBoxGeometry(0.44, 0.38, 0.05, 2, 0.02).rotateX(-0.15).translate(0, 0.24, -0.2),
		]);
		seatGeo.rotateY(Math.PI / 2); // facing the court (+X)
		const perTier = 34, seats = new THREE.InstancedMesh(seatGeo, std({ color: '#ffffff', roughness: 0.55, metalness: 0.05 }), perTier * tiers);
		const m4 = new THREE.Matrix4(), c = new THREE.Color();
		for (let k = 0; k < tiers; k++) for (let i = 0; i < perTier; i++) {
			const n = k * perTier + i;
			m4.makeTranslation(front - depth * k - depth * 0.55, FL + rise * (k + 1), -8.6 + i * (17.2 / (perTier - 1)));
			seats.setMatrixAt(n, m4);
			seats.setColorAt(n, c.set(k === 1 || (i > 13 && i < 20) ? ORANGE : NAVY));
		}
		world.add(seats);
		for (const [z0, z1] of [[-6.2, -1.5], [1.5, 6.2]]) {
			put(rbox(0.5, 0.08, z1 - z0, navy, 0.03), world, -6.25, FL + 0.48, (z0 + z1) / 2);
			put(rbox(0.06, 0.5, z1 - z0, navy, 0.02), world, -6.47, FL + 0.78, (z0 + z1) / 2);
			for (let z = z0 + 0.3; z < z1; z += 1.1) box(0.4, 0.44, 0.05, steel, -6.25, FL + 0.22, z);
		}
		put(rbox(0.7, 0.8, 2.6, navy, 0.04), world, -6.3, FL + 0.4, 0);
		const table = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ map: paintedSign('ML-1', 'SCORER  ·  THE COURT'), transparent: true, depthWrite: false }));
		table.position.set(-5.94, FL + 0.48, 0);
		table.rotation.y = Math.PI / 2;
		world.add(table);
		box(0.02, 0.04, 2.5, glow(ORANGE, 1.6), -5.945, FL + 0.74, 0);

		// ---------- Arena boards with the pilot's story along the +X sideline ----------
		const SW = 5.6, SH = 3.5, sy = FL + 3.25;
		content.panels.slice(0, 3).forEach((p, i) => {
			const z = -8 + i * 8;
			const group = new THREE.Group();
			group.position.set(7.75, sy, z);
			group.rotation.y = -Math.PI / 2;
			put(rbox(SW + 0.28, SH + 0.28, 0.18, mat.gunmetal, 0.05), group, 0, 0, -0.1);
			put(face(storyScreen(p, i, content.panels.length, i % 2 === 1, kit.redraw, { code: 'VSL-02', name: 'The court' }), SW, SH, false), group, 0, 0, 0.004);
			put(new THREE.Mesh(new THREE.BoxGeometry(SW - 0.4, 0.03, 0.03), mat.led), group, 0, -SH / 2 - 0.1, 0.0);
			world.add(group);
			// Cantilevers back to the wall
			for (const dy of [-1.1, 1.1]) for (const dz of [-SW / 2 + 0.6, SW / 2 - 0.6]) box(1.9, 0.14, 0.14, steel, 8.8, sy + dy, z + dz);
		});

		// ---------- Roof truss over center court, the scoreboard hanging from it ----------
		const ty = FL + 12.6, tx = Math.sqrt(RH * RH - ty * ty) - 0.2;
		for (const z of [-1.3, 1.3]) for (const y of [ty, ty - 0.9]) rod(V(-tx, y, z), V(tx, y, z), 0.08, steel);
		for (let x = -tx + 0.6; x < tx; x += 1.2) for (const z of [-1.3, 1.3]) {
			rod(V(x, ty, z), V(x + 0.6, ty - 0.9, z), 0.04, steel);
			rod(V(x + 0.6, ty - 0.9, z), V(x + 1.2, ty, z), 0.04, steel);
		}
		const ticker = content.banners.map((b) => `${b.top} ${b.middle}`.toUpperCase()).join('   ·   ') + '   ·   ';
		const score = scoreboardScreen(ticker);
		const jumbo = new THREE.Group();
		jumbo.position.set(0, FL + 9.6, 0);
		world.add(jumbo);
		put(rbox(4.5, 2.9, 4.5, mat.dark, 0.08), jumbo);
		for (let i = 0; i < 4; i++) {
			const a = (i * Math.PI) / 2;
			const side = put(face(score.tex, 4.1, 2.46, true), jumbo, Math.sin(a) * 2.26, 0, Math.cos(a) * 2.26);
			side.rotation.y = a;
		}
		for (const y of [-1.58, 1.58]) put(rbox(4.7, 0.18, 4.7, mat.body, 0.06), jumbo, 0, y, 0);
		// LED rings round its top and bottom edges
		const ledMat = glow(ORANGE, 1.3);
		for (const y of [-1.7, 1.7]) for (let i = 0; i < 4; i++) {
			const a = (i * Math.PI) / 2;
			put(new THREE.Mesh(new THREE.BoxGeometry(4.72, 0.05, 0.05), ledMat), jumbo, Math.sin(a) * 2.36, y, Math.cos(a) * 2.36).rotation.y = a;
		}
		for (const [x, z] of [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]]) rod(V(x, FL + 11.1, z), V(x, ty - 0.9, z), 0.025, steel);
		kit.live(score, jumbo, 1 / 12, 60, 3.4);

		// ---------- Light rigs, banners ----------
		for (const z of [-13, -6.5, 6.5, 13]) {
			const y = FL + 11.6, x = 0;
			box(6.2, 0.12, 1.8, mat.body, x, y + 0.08, z);
			box(6.0, 0.04, 1.6, glow('#fff4e2', 1.25), x, y, z);
			for (const sx of [-2.8, 2.8]) rod(V(sx, y + 0.1, z), V(sx, Math.sqrt(RH * RH - sx * sx) - 0.3, z), 0.03, steel);
			const l = new THREE.PointLight('#fff3e4', 70, 36, 2);
			l.position.set(x, y - 0.6, z);
			world.add(l);
		}
		world.add(new THREE.HemisphereLight('#dfe8ff', '#5a4630', 1.05));
		content.banners.slice(0, 4).forEach((b, i) => {
			const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), std({ map: bannerSheet(b), alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
			banner.position.set(-6.1, FL + 8.2, -6 + i * 4);
			banner.rotation.y = Math.PI / 2;
			world.add(banner);
			rod(V(-6.1, FL + 9.85, -6.8 + i * 4), V(-6.1, FL + 9.85, -5.2 + i * 4), 0.03, steel);
			rod(V(-6.1, FL + 9.85, -6 + i * 4), V(-6.1, Math.sqrt(RH * RH - 6.1 * 6.1) - 0.2, -6 + i * 4), 0.015, steel);
		});

		// ---------- A ball rack by the entrance, and a few balls on the floor ----------
		const ballMat = std({ map: ballSheet(), roughness: 0.75, metalness: 0 });
		const ballGeo = new THREE.SphereGeometry(0.12, 24, 16);
		for (const y of [0.35, 0.85]) {
			for (const s of [-1, 1]) rod(V(3.0 + s * 0.4, FL + y - 0.1, (Z0 + 1.55)), V(3.0 + s * 0.4, FL + y - 0.1, (Z0 + 2.45)), 0.02, steel);
			for (let i = 0; i < 4; i++) add(ballGeo, ballMat, 2.7 + i * 0.2, FL + y + 0.02, Z0 + 2);
		}
		for (const [x, z] of [[2.55, (Z0 + 1.55)], [3.45, (Z0 + 1.55)], [2.55, (Z0 + 2.45)], [3.45, (Z0 + 2.45)]]) rod(V(x, FL, z), V(x, FL + 1.05, z), 0.025, steel);
		for (const [x, z] of [[1.2, -5.6], [-0.7, -4.9], [3.9, 4.2]]) add(ballGeo, ballMat, x, FL + 0.12, z);

		// ---------- Through the viewport: the star, and a banded world ----------
		const sunDir = V(0.25, 0.18, 1).normalize();
		const glowTex = (() => {
			const { cv, g } = canvas(256, 256);
			const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
			gr.addColorStop(0, 'rgba(255,240,214,1)'); gr.addColorStop(0.1, 'rgba(255,214,150,0.8)'); gr.addColorStop(0.4, 'rgba(242,177,59,0.12)'); gr.addColorStop(1, 'rgba(242,177,59,0)');
			g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
			return tex(cv);
		})();
		const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.3) }));
		sun.position.copy(sunDir).multiplyScalar(500);
		sun.scale.setScalar(60);
		world.add(sun);
		const planetTex = loader.load(kit.textures + 'saturn.jpg');
		planetTex.colorSpace = THREE.SRGBColorSpace;
		const planet = new THREE.Mesh(
			new THREE.SphereGeometry(60, 96, 48),
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
		planet.position.set(-70, 40, 380);
		world.add(planet);

		return {
			code: 'VSL-02',
			name: 'The court, habitat bay 1',
			scale: 1,
			eye: EYE,
			spawn: V(0, EYE, Z0 + 1.4),
			spawnYaw: Math.PI,
			collide,
			hatch: { z: Z0, y: HATCH_Y, door, wheel },
			revealAt: 12,
			exposure: 1.0,
		};
	};
}

// ---------- Walking ----------

// The whole floor, around the bleachers, benches and table, the hoop bases and the ball rack
const blocks = [
	{ x0: -9, x1: -6.55, z0: -9.4, z1: 9.4 },
	{ x0: -6.6, x1: -5.9, z0: -6.3, z1: 6.3 },
	{ x0: 2.5, x1: 3.5, z0: Z0 + 1.5, z1: Z0 + 2.5 },
];
function collide(p: THREE.Vector3, radius: number) {
	p.x = THREE.MathUtils.clamp(p.x, -HW + 0.4, 7.25);
	p.z = THREE.MathUtils.clamp(p.z, Z0 + 0.3, Z1 - 0.5);
	pushOut(p, blocks, radius);
}
