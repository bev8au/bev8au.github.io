// Cinematic 3D tactical plot for the mission-debrief design.
// Renders the home star, photo-textured project planets, an asteroid belt and a radar disc with three.js,
// then reports screen positions each frame so the page can place its HTML targets and labels.
// Planet, sun, rock and sky textures: Solar System Scope (solarsystemscope.com), CC BY 4.0.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVessel, type Bay } from './vessel';

export type Look = 'eris' | 'mars' | 'saturn' | 'neptune';
export type BodySpec = { id: string; orbit: number; phase: number; look: Look; size: number };
export type ScreenPoint = { key: string; x: number; y: number; r: number };
// A site pinned to the close-up body's surface; front > 0 while it faces the camera
export type PinPoint = { x: number; y: number; front: number };
// A close-up's sites: a count to spread over the face the camera sees, or [latitude, longitude] spots on the world's map
export type Pins = number | [number, number][];
export type PlotOptions = {
	reduced: boolean;
	onFrame: (bodies: ScreenPoint[], labels: ScreenPoint[], sun: ScreenPoint, pins: PinPoint[]) => void;
	// When true, the wheel only zooms with Ctrl/⌘ held, so the page can still scroll past the plot
	zoomNeedsModifier: () => boolean;
	// A crewed vessel on its own inclined orbit; it reports to onFrame and takes close-ups under the id 'vessel',
	// of the whole ship or of one section (the command module, then each bay)
	vessel?: { orbit: number; inclination: number; node: number; phase: number; bays: Bay[] };
};
// Where a close-up puts its body: x and y as fractions of the frame, r as the body's radius in px
export type CloseFrame = { x: number; y: number; r: number };

const BELT = [8.6, 10.6]; // between the rocky worlds and the gas giants
// Most planets that can cast shadows on each other; must be at least the number of sorties
const MAX_OCC = 8;
const AMBER = new THREE.Color('#f2b13b');
const ICE = new THREE.Color('#e4ecf7');
const TEX = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}textures/`;

// The photo maps that dress each world. detail (0 to 1) keeps that share of the map's fine contrast;
// the rest blends toward its broad colors, for a smoother look.
type Surface = { map: string; tint?: string; detail?: number; night?: string; clouds?: string; normal?: string; specular?: string; atmo: string; haze: number };
const SURFACE: Record<Look, Surface> = {
	eris: { map: 'eris.jpg', detail: 1, atmo: '#d6dbe4', haze: 0.15 }, // a pale, icy world (Solar System Scope's fictional Eris)
	mars: { map: 'mars.jpg', detail: 1, atmo: '#e0a080', haze: 0.45 },
	saturn: { map: 'saturn.jpg', atmo: '#e8d2a8', haze: 0.25 },
	neptune: { map: 'neptune.jpg', atmo: '#8fb6f5', haze: 0.6 },
};

// ---------- CPU noise, used to shape rocks ----------
function hash3(x: number, y: number, z: number, seed: number) {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number, seed: number) {
	const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
	const xf = x - xi, yf = y - yi, zf = z - zi;
	const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
	const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
	const l = (a: number, b: number, t: number) => a + (b - a) * t;
	return l(
		l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
		l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
		w,
	);
}
function fbm(x: number, y: number, z: number, seed: number, oct = 5) {
	let s = 0, a = 0.5, f = 1;
	for (let i = 0; i < oct; i++) {
		s += a * vnoise(x * f, y * f, z * f, seed + i);
		f *= 2.02;
		a *= 0.5;
	}
	return s / (1 - Math.pow(0.5, oct));
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function radialTexture(stops: [number, string][], size = 128) {
	const cv = document.createElement('canvas');
	cv.width = cv.height = size;
	const g = cv.getContext('2d')!;
	const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	stops.forEach(([o, c]) => grad.addColorStop(o, c));
	g.fillStyle = grad;
	g.fillRect(0, 0, size, size);
	const t = new THREE.CanvasTexture(cv);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

// Lumpy, smooth-shaded rock with spherical UVs so a cratered photo map can wrap it
function rockGeometry(seed: number, detail: number, lump = 0.8) {
	let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
	geo.deleteAttribute('normal');
	geo.deleteAttribute('uv');
	geo = mergeVertices(geo);
	const p = geo.attributes.position;
	const v = new THREE.Vector3();
	const uv = new Float32Array(p.count * 2);
	for (let i = 0; i < p.count; i++) {
		v.fromBufferAttribute(p, i).normalize();
		uv[i * 2] = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5;
		uv[i * 2 + 1] = Math.asin(v.y) / Math.PI + 0.5;
		v.multiplyScalar(0.6 + fbm(v.x * 1.1 + 5, v.y * 1.1, v.z * 1.1, seed, 4) * lump);
		p.setXYZ(i, v.x, v.y * 0.78, v.z);
	}
	geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	geo.computeVertexNormals();
	return geo;
}

// ---------- GLSL ----------
const GLSL_NOISE = /* glsl */ `
	float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
	float noise(vec3 x) {
		vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
		return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
			mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
	}
	float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const VIEW_VERTEX = /* glsl */ `
	varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying vec3 vViewPos; varying vec2 vUv;
	void main() {
		vPos = position;
		vUv = uv;
		vN = normalize(normalMatrix * normal);
		vec4 mv = modelViewMatrix * vec4(position, 1.0);
		vViewPos = mv.xyz;
		vV = normalize(-mv.xyz);
		gl_Position = projectionMatrix * mv;
	}
`;

const SCREEN_VERTEX = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// All lighting is in view space. One light: the star at uSunView.
const PLANET_FRAGMENT = /* glsl */ `
	uniform sampler2D uDay, uNight, uClouds, uNormal, uSpec, uRingTex;
	uniform float uHasNight, uHasClouds, uHasNormal, uHasSpec, uDetail, uHasRing, uRingIn, uRingOut, uTime;
	uniform vec3 uTint, uSunView, uRingCenter, uRingNormal, uAtmo;
	uniform vec4 uOcc[MAX_OCC];
	uniform int uOccCount, uSelf;
	varying vec3 vN; varying vec3 vViewPos; varying vec2 vUv;

	float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

	// Normal map without tangents (screen-space derivatives), as in three.js
	vec3 perturbNormal(vec3 p, vec3 n, vec3 mapN, vec2 uv) {
		vec3 q0 = dFdx(p), q1 = dFdy(p);
		vec2 st0 = dFdx(uv), st1 = dFdy(uv);
		vec3 q1perp = cross(q1, n), q0perp = cross(n, q0);
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max(dot(T, T), dot(B, B));
		float s = det == 0.0 ? 0.0 : inversesqrt(det);
		return normalize(T * (mapN.x * s) + B * (mapN.y * s) + n * mapN.z);
	}

	// Soft shadows from other planets and from a ring plane, along the ray to the star
	float shadowAt(vec3 P, vec3 L, float toSun) {
		float s = 1.0;
		for (int i = 0; i < MAX_OCC; i++) {
			if (i >= uOccCount) break;
			if (i == uSelf) continue;
			vec3 oc = uOcc[i].xyz - P;
			float t = dot(oc, L);
			if (t <= 0.0 || t > toSun) continue;
			float d = length(oc - L * t);
			float r = uOcc[i].w;
			float pen = r * 0.12 + t * 0.015;
			s *= smoothstep(r - pen, r + pen, d);
		}
		if (uHasRing > 0.5) {
			float denom = dot(L, uRingNormal);
			if (abs(denom) > 1e-4) {
				float t = dot(uRingCenter - P, uRingNormal) / denom;
				if (t > 0.0) {
					float u = (length(P + L * t - uRingCenter) - uRingIn) / (uRingOut - uRingIn);
					if (u > 0.0 && u < 1.0) s *= 1.0 - texture2D(uRingTex, vec2(u, 0.5)).a * 0.85;
				}
			}
		}
		return s;
	}

	void main() {
		vec3 Ng = normalize(vN);
		vec3 N = Ng;
		vec3 V = normalize(-vViewPos);
		vec3 L = normalize(uSunView - vViewPos);
		float toSun = length(uSunView - vViewPos);
		if (uHasNormal > 0.5) N = perturbNormal(vViewPos, Ng, texture2D(uNormal, vUv).xyz * 2.0 - 1.0, vUv);

		// A heavily biased lookup reads a small mip: the surface's broad colors, which the fine detail blends toward
		vec3 albedo = mix(texture2D(uDay, vUv, 5.0).rgb, texture2D(uDay, vUv).rgb, uDetail) * uTint;
		float day = dot(Ng, L);
		float shadow = shadowAt(vViewPos, L, toSun);

		float cloud = 0.0;
		if (uHasClouds > 0.5) {
			vec2 cuv = vUv + vec2(uTime * 0.0015, 0.0);
			cloud = texture2D(uClouds, cuv).r;
			albedo *= 1.0 - texture2D(uClouds, cuv + vec2(0.004, -0.002)).r * 0.4; // cloud shadows on the ground
		}

		// A soft S-curve instead of a hard cutoff, so the terminator fades rather than drawing a line across smooth worlds
		vec3 col = albedo * smoothstep(-0.12, 1.0, dot(N, L)) * shadow * 1.2;
		col = mix(col, vec3(0.95) * smoothstep(-0.12, 1.0, day) * shadow * 1.2, cloud * 0.92);

		// Sun glint on water
		if (uHasSpec > 0.5) {
			float water = texture2D(uSpec, vUv).r * (1.0 - cloud);
			float g = pow(max(dot(Ng, normalize(L + V)), 0.0), 70.0);
			col += vec3(1.0, 0.9, 0.75) * g * water * shadow * 2.2 * step(0.0, day);
		}
		// City lights on the night side
		if (uHasNight > 0.5) {
			float night = 1.0 - smoothstep(-0.12, 0.08, day * shadow);
			col += texture2D(uNight, vUv).rgb * vec3(1.0, 0.78, 0.5) * night * (1.0 - cloud * 0.85) * 1.6;
		}

		col += albedo * (0.02 + 0.06 * max(dot(N, normalize(vec3(0.0, 0.4, 1.0))), 0.0)); // faint fill from the camera side

		// Atmospheric haze: thin on the day limb, reddened at the terminator
		float rim = pow(1.0 - max(dot(Ng, V), 0.0), 3.0);
		float lit = smoothstep(-0.25, 0.4, day) * shadow;
		vec3 haze = mix(vec3(1.0, 0.45, 0.2), uAtmo, smoothstep(-0.05, 0.35, day));
		col += haze * rim * lit * 0.55;

		gl_FragColor = vec4(col, 1.0);
	}
`;

export function createPlot(container: HTMLElement, specs: BodySpec[], opts: PlotOptions) {
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(30, 2, 0.5, 2000);
	scene.add(camera);

	let renderer: THREE.WebGLRenderer | null = null;
	let composer: EffectComposer | null = null;
	let bloom: UnrealBloomPass | null = null;
	let film: ShaderPass | null = null;
	let dof: ShaderPass | null = null;
	let rays: ShaderPass | null = null;
	try {
		renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1;
		renderer.shadowMap.enabled = true; // only the vessel casts shadows, and only in its close-up
		renderer.shadowMap.type = THREE.PCFShadowMap;
		renderer.domElement.setAttribute('aria-hidden', 'true');
		container.prepend(renderer.domElement);
	} catch {
		renderer = null; // No WebGL: the HTML targets still track the math below over the CSS backdrop
	}

	// ---------- Textures ----------
	const loader = new THREE.TextureLoader();
	const cache = new Map<string, THREE.Texture>();
	const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
	blank.needsUpdate = true;
	function tex(name: string | undefined, color = true, onLoad?: (t: THREE.Texture) => void) {
		if (!name || !renderer) return blank;
		const key = `${name}:${color}`;
		if (!cache.has(key)) {
			const t = loader.load(TEX + name, (loaded) => { onLoad?.(loaded); if (opts.reduced || !raf) still(); });
			t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			t.anisotropy = 8;
			t.wrapS = THREE.RepeatWrapping; // clouds and the star's surface drift in u, so maps must wrap rather than smear their edge
			cache.set(key, t);
		}
		return cache.get(key)!;
	}

	// Real Milky Way panorama, tilted so the band crosses the frame diagonally. The vessel's metal reflects it.
	if (renderer) {
		const sky = tex('milky_way.jpg', true, (loaded) => {
			if (!vessel || !renderer) return;
			const pmrem = new THREE.PMREMGenerator(renderer);
			const env = pmrem.fromEquirectangular(loaded).texture;
			pmrem.dispose();
			for (const mat of vessel.materials) {
				mat.envMap = env;
				mat.envMapIntensity = 0.6;
				mat.envMapRotation.copy(scene.backgroundRotation);
				mat.needsUpdate = true;
			}
		});
		sky.mapping = THREE.EquirectangularReflectionMapping;
		scene.background = sky;
		scene.backgroundIntensity = 1.8;
		scene.backgroundRotation.set(0.55, 0.4, 0.5);
	}

	// ---------- Lighting and star ----------
	// Standard-material rocks use these; planets light themselves in PLANET_FRAGMENT
	const ambient = new THREE.AmbientLight('#7d8db0', 0.12);
	scene.add(ambient);
	const kicker = new THREE.DirectionalLight('#9fb4dc', 0.35);
	kicker.position.set(0, 0.4, 1);
	camera.add(kicker);
	const sunLight = new THREE.PointLight('#fff1dc', 3.4, 0, 0);
	scene.add(sunLight);
	// In the vessel's close-up its sunlight comes from a directional light instead, which casts shadows
	const shipSun = new THREE.DirectionalLight('#fff1dc', 0);
	shipSun.castShadow = true;
	const shadowRes = container.clientWidth >= 700 ? 4096 : 1536;
	shipSun.shadow.mapSize.set(shadowRes, shadowRes);
	shipSun.shadow.camera.near = 0.05;
	shipSun.shadow.camera.far = 6;
	Object.assign(shipSun.shadow.camera, { left: -0.62, right: 0.62, top: 0.62, bottom: -0.62 });
	shipSun.shadow.bias = -0.0004;
	shipSun.shadow.normalBias = 0.0015;
	shipSun.shadow.radius = 2;
	shipSun.shadow.autoUpdate = false;
	shipSun.shadow.needsUpdate = true; // draw the map once, so shadow samplers never see a placeholder texture
	scene.add(shipSun, shipSun.target);
	// A cool rim light from behind the vessel picks out its silhouette against the dark, as a film set would
	const rimLight = new THREE.DirectionalLight('#8fb0ff', 0);
	scene.add(rimLight, rimLight.target);

	const sunUniforms = { uTime: { value: 0 }, uMap: { value: tex('sun.jpg') } };
	const sun = new THREE.Mesh(
		new THREE.SphereGeometry(1.1, 64, 32),
		new THREE.ShaderMaterial({
			uniforms: sunUniforms,
			vertexShader: VIEW_VERTEX,
			fragmentShader: /* glsl */ `
				uniform float uTime; uniform sampler2D uMap; varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying vec2 vUv;
				${GLSL_NOISE}
				void main() {
					vec3 photo = texture2D(uMap, vUv + vec2(uTime * 0.002, 0.0)).rgb;
					float n = fbm(vPos * 2.6 + vec3(0.0, uTime * 0.06, uTime * 0.03));
					float g = fbm(vPos * 9.0 - vec3(uTime * 0.05));
					vec3 col = mix(photo * vec3(1.0, 0.95, 0.85), vec3(1.0, 0.94, 0.82), 0.45 + smoothstep(0.45, 0.8, n) * 0.35);
					col *= 0.8 + g * 0.5;
					float limb = 0.4 + 0.6 * pow(max(dot(vN, vV), 0.0), 0.5);
					gl_FragColor = vec4(col * limb * 2.4, 1.0);
				}
			`,
		}),
	);
	scene.add(sun);

	const coronaTex = radialTexture([[0, 'rgba(255,244,220,1)'], [0.12, 'rgba(255,196,110,0.75)'], [0.35, 'rgba(242,177,59,0.18)'], [1, 'rgba(242,177,59,0)']]);
	for (const [scale, opacity] of [[5, 0.7], [13, 0.1]] as const) {
		const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: coronaTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
		s.scale.setScalar(scale);
		scene.add(s);
	}

	// ---------- Radar disc: sweep wedge and bearing ticks on the orbital plane ----------
	const OUTER = Math.max(...specs.map((s) => s.orbit));
	// The overview pulls back until the second orbit from the outside fits; the outermost runs past the frame edges
	const sorted = [...new Set(specs.map((s) => s.orbit))].sort((a, z) => a - z);
	const FIT = (sorted.length > 1 ? sorted[sorted.length - 2] : OUTER) + 0.6;
	const sweepUniforms = { uSweep: { value: -Math.PI / 2 }, uR: { value: OUTER + 0.6 }, uAmber: { value: AMBER }, uIce: { value: ICE }, uFade: { value: 1 } };
	const disc = new THREE.Mesh(
		new THREE.PlaneGeometry((OUTER + 1.6) * 2, (OUTER + 1.6) * 2),
		new THREE.ShaderMaterial({
			uniforms: sweepUniforms,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: /* glsl */ `
				uniform float uSweep; uniform float uR; uniform vec3 uAmber; uniform vec3 uIce; uniform float uFade; varying vec2 vP;
				void main() {
					float r = length(vP);
					float a = atan(vP.y, vP.x);
					float d = mod(uSweep - a, 6.28318);
					float inside = (1.0 - smoothstep(uR - 0.4, uR, r)) * smoothstep(1.2, 2.2, r);
					float wedge = exp(-d * 2.4) * inside;
					float edge = (1.0 - smoothstep(0.0, 0.02, d)) * inside;
					float seg = fract(a / 6.28318 * 72.0);
					float major = fract(a / 6.28318 * 12.0);
					float band = step(uR + 0.2, r) * step(r, uR + 0.5);
					float tick = max(step(seg, 0.05) * band, step(major, 0.01) * step(uR + 0.2, r) * step(r, uR + 0.95));
					float ring = 1.0 - smoothstep(0.0, 0.035, abs(r - (uR + 0.2)));
					vec3 col = uAmber * (wedge * 0.07 + edge * 0.1) + uIce * (tick * 0.22 + ring * 0.14);
					gl_FragColor = vec4(col * uFade, 1.0);
				}
			`,
		}),
	);
	disc.rotation.x = -Math.PI / 2;
	scene.add(disc);

	let vesselOrbit: THREE.Line | null = null; // the vessel's dashed orbit, set up with the vessel below
	// ---------- Orbits: brighter on the near side for depth ----------
	const orbits = new Map<number, THREE.LineLoop>();
	for (const r of new Set(specs.map((s) => s.orbit))) {
		const n = 256;
		const pos = new Float32Array(n * 3);
		const col = new Float32Array(n * 4);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
			col.set([1, 1, 1, 0.1 + 0.3 * ((Math.sin(a) + 1) / 2)], i * 4);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
		const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, color: ICE.clone() }));
		orbits.set(r, line);
		scene.add(line);
	}

	// ---------- Asteroid belt: cratered instanced rocks plus fine dust ----------
	const moon = tex('moon.jpg');
	const rockMat = new THREE.MeshStandardMaterial({ map: moon, bumpMap: moon, bumpScale: 3, color: '#c4beb4', roughness: 1, metalness: 0 });
	const beltLayers: { group: THREE.Group; speed: number }[] = [];
	const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
	for (let k = 0; k < 3; k++) {
		const count = 340;
		const mesh = new THREE.InstancedMesh(rockGeometry(k * 7 + 1, 2), rockMat, count);
		for (let i = 0; i < count; i++) {
			const r = (BELT[0] + BELT[1]) / 2 + gauss() * (BELT[1] - BELT[0]) * 0.5;
			const a = Math.random() * Math.PI * 2;
			pv.set(Math.cos(a) * r, gauss() * 0.22, Math.sin(a) * r);
			q.setFromEuler(e.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)));
			const s = 0.018 + Math.pow(Math.random(), 5) * 0.11;
			sv.set(s * rand(1, 1.6), s, s * rand(0.8, 1.2));
			mesh.setMatrixAt(i, m4.compose(pv, q, sv));
		}
		const group = new THREE.Group();
		group.add(mesh);
		scene.add(group);
		beltLayers.push({ group, speed: 0.012 + k * 0.003 });
	}
	{
		const n = 2600;
		const pos = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			const r = (BELT[0] + BELT[1]) / 2 + gauss() * (BELT[1] - BELT[0]) * 0.65;
			const a = Math.random() * Math.PI * 2;
			pos.set([Math.cos(a) * r, gauss() * 0.3, Math.sin(a) * r], i * 3);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#a9b6cc', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.4, depthWrite: false }));
		beltLayers[0].group.add(dust);
	}

	// ---------- A few crisp bright stars in front of the panorama, for parallax as the camera moves ----------
	const starDot = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']], 32);
	const starLayers = ([[900, 1.4, 0.55], [180, 2.6, 0.9]] as const).map(([n, size, opacity]) => {
		const pos = new Float32Array(n * 3);
		const v = new THREE.Vector3();
		for (let i = 0; i < n; i++) {
			v.randomDirection().multiplyScalar(rand(60, 160));
			pos.set([v.x, v.y, v.z], i * 3);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		const mat = new THREE.PointsMaterial({ color: '#e2eaff', map: starDot, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false });
		scene.add(new THREE.Points(geo, mat));
		return { mat, size };
	});

	// ---------- Project planets ----------
	type Body = BodySpec & {
		orbit: number; angle: number; speed: number; pivot: THREE.Group; spin: THREE.Mesh;
		mat: THREE.ShaderMaterial; atmo: THREE.ShaderMaterial; ring?: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; inner: number; outer: number };
		view: THREE.Vector3; scale: number; tilt: THREE.Group; lean: number;
	};
	const ringTex = tex('saturn_ring.png');
	const bodies: Body[] = specs.map((s, index) => {
		const surf = SURFACE[s.look];
		const orbit = s.orbit;
		const pivot = new THREE.Group();
		const tilt = new THREE.Group();
		tilt.rotation.z = s.look === 'saturn' ? 0.3 : rand(-0.4, 0.4);
		pivot.add(tilt);

		const inner = s.size * 1.25, outer = s.size * 2.3;
		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uDay: { value: tex(surf.map) },
				uNight: { value: tex(surf.night) },
				uClouds: { value: tex(surf.clouds, false) },
				uNormal: { value: tex(surf.normal, false) },
				uSpec: { value: tex(surf.specular, false) },
				uRingTex: { value: ringTex },
				uHasNight: { value: surf.night ? 1 : 0 },
				uHasClouds: { value: surf.clouds ? 1 : 0 },
				uHasNormal: { value: surf.normal ? 1 : 0 },
				uHasSpec: { value: surf.specular ? 1 : 0 },
				uDetail: { value: surf.detail ?? 1 },
				uHasRing: { value: s.look === 'saturn' ? 1 : 0 },
				uRingIn: { value: inner },
				uRingOut: { value: outer },
				uRingCenter: { value: new THREE.Vector3() },
				uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
				uTint: { value: new THREE.Color(surf.tint ?? '#ffffff') },
				uAtmo: { value: new THREE.Color(surf.atmo) },
				uSunView: { value: new THREE.Vector3() },
				uTime: { value: 0 },
				uOcc: { value: Array.from({ length: MAX_OCC }, () => new THREE.Vector4()) },
				uOccCount: { value: 0 },
				uSelf: { value: index },
			},
			vertexShader: VIEW_VERTEX,
			fragmentShader: `#define MAX_OCC ${MAX_OCC}
${PLANET_FRAGMENT}`,
		});
		const spin = new THREE.Mesh(new THREE.SphereGeometry(s.size, 96, 48), mat);
		tilt.add(spin);

		const atmo = new THREE.ShaderMaterial({
			uniforms: { uColor: { value: new THREE.Color(surf.atmo) }, uSun: { value: new THREE.Vector3() }, uStrength: { value: surf.haze } },
			vertexShader: VIEW_VERTEX,
			fragmentShader: /* glsl */ `
				uniform vec3 uColor; uniform vec3 uSun; uniform float uStrength; varying vec3 vN; varying vec3 vV;
				void main() {
					float rim = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
					float lit = smoothstep(-0.35, 0.6, dot(vN, uSun));
					gl_FragColor = vec4(uColor * rim * lit * uStrength, rim * lit);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		tilt.add(new THREE.Mesh(new THREE.SphereGeometry(s.size * 1.04, 64, 32), atmo));

		let ring: Body['ring'];
		if (s.look === 'saturn') {
			const ringMat = new THREE.ShaderMaterial({
				uniforms: {
					uTex: { value: ringTex }, uIn: { value: inner }, uOut: { value: outer },
					uSunView: { value: new THREE.Vector3() }, uPlanet: { value: new THREE.Vector4() }, uNormal: { value: new THREE.Vector3() },
				},
				vertexShader: /* glsl */ `
					varying vec3 vLocal; varying vec3 vViewPos;
					void main() { vLocal = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vViewPos = mv.xyz; gl_Position = projectionMatrix * mv; }
				`,
				fragmentShader: /* glsl */ `
					uniform sampler2D uTex; uniform float uIn, uOut; uniform vec3 uSunView, uNormal; uniform vec4 uPlanet;
					varying vec3 vLocal; varying vec3 vViewPos;
					void main() {
						float u = (length(vLocal.xy) - uIn) / (uOut - uIn);
						if (u < 0.0 || u > 1.0) discard;
						vec4 t = texture2D(uTex, vec2(u, 0.5));
						vec3 L = normalize(uSunView - vViewPos);
						// The planet's shadow falls across the rings
						vec3 oc = uPlanet.xyz - vViewPos;
						float tc = dot(oc, L);
						float d = length(oc - L * tc);
						float shade = tc > 0.0 ? smoothstep(uPlanet.w * 0.96, uPlanet.w * 1.04, d) : 1.0;
						// Lit face is bright; the unlit face glows faintly with light scattered through the ice
						float facing = abs(dot(uNormal, L));
						float lit = 0.25 + 0.75 * facing;
						gl_FragColor = vec4(t.rgb * lit * shade * 1.1, t.a * 0.95);
					}
				`,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
			});
			const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 192, 1), ringMat);
			mesh.rotation.x = -Math.PI / 2 + 0.35;
			tilt.add(mesh);
			ring = { mesh, mat: ringMat, inner, outer };
		}

		scene.add(pivot);
		return { ...s, orbit, angle: s.phase, speed: 0.2 / Math.pow(orbit, 1.5), pivot, spin, mat, atmo, ring, view: new THREE.Vector3(), scale: 1, tilt, lean: tilt.rotation.z };
	});

	// ---------- The vessel: its own orbit, tilted out of the planets' plane ----------
	const vo = opts.vessel;
	const vessel = vo && renderer ? buildVessel(vo.bays) : null;
	// The orbit's plane: u runs along the line of nodes, v completes it, and n is its upward normal
	const vu = new THREE.Vector3(), vv = new THREE.Vector3(), vn = new THREE.Vector3();
	const VESSEL_SPEED = (Math.PI * 2) / 300; // radians a second
	let vAngle = 0, vScale = 1, ringGoal = 0, shipLight = 0;
	let vSection = -1; // in the vessel's close-up, the section the camera holds, or -1 for the whole ship
	let shadowSpan = 0;
	if (vo) {
		const ci = Math.cos(vo.inclination), si = Math.sin(vo.inclination);
		vu.set(Math.cos(vo.node), 0, Math.sin(vo.node));
		vv.set(-Math.sin(vo.node) * ci, si, Math.cos(vo.node) * ci);
		vn.crossVectors(vv, vu);
		vAngle = vo.phase;
		const n = 256;
		const pts = Array.from({ length: n + 1 }, (_, i) => {
			const a = (i / n) * Math.PI * 2;
			return vu.clone().multiplyScalar(Math.cos(a) * vo.orbit).addScaledVector(vv, Math.sin(a) * vo.orbit);
		});
		const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: ICE, dashSize: 0.32, gapSize: 0.22, transparent: true, opacity: 0.32, depthWrite: false }));
		line.computeLineDistances();
		vesselOrbit = line;
		scene.add(line);
	}
	if (vessel) scene.add(vessel.root);
	const vTan = new THREE.Vector3(), vX = new THREE.Vector3(), vBasis = new THREE.Matrix4();
	function placeVessel() {
		if (!vessel || !vo) return;
		const c = Math.cos(vAngle), s = Math.sin(vAngle);
		vessel.root.position.copy(vu).multiplyScalar(c * vo.orbit).addScaledVector(vv, s * vo.orbit);
		// Bow along the direction of travel, dorsal side toward the orbit's normal
		vTan.copy(vu).multiplyScalar(-s).addScaledVector(vv, c);
		vX.crossVectors(vn, vTan);
		vessel.root.quaternion.setFromRotationMatrix(vBasis.makeBasis(vX, vn, vTan));
		vessel.root.scale.setScalar(vScale);
	}
	placeVessel();

	// ---------- Post ----------
	// HDR chain: scene (with depth) -> focus blur -> light rays + lens streak -> bloom -> tone map -> film
	if (renderer) {
		const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
		composer = new EffectComposer(renderer, target);
		if (!composer.renderTarget2.depthTexture || composer.renderTarget2.depthTexture === target.depthTexture) {
			composer.renderTarget2.depthTexture = new THREE.DepthTexture(1, 1);
		}
		composer.addPass(new RenderPass(scene, camera));

		// Focus blur: gather with a golden-angle spiral; samples count where their own blur reaches this pixel,
		// so out-of-focus foreground spills softly over its surroundings. The sky stays sharp.
		dof = new ShaderPass({
			uniforms: {
				tDiffuse: { value: null }, tDepth: { value: null }, uNear: { value: camera.near }, uFar: { value: camera.far },
				uFocus: { value: 25 }, uAperture: { value: 0.35 }, uMaxBlur: { value: 10 }, uRes: { value: new THREE.Vector2(1, 1) },
			},
			vertexShader: SCREEN_VERTEX,
			fragmentShader: /* glsl */ `
				#include <packing>
				uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uFocus, uAperture, uMaxBlur; uniform vec2 uRes; varying vec2 vUv;
				float depthAt(vec2 uv) { float d = texture2D(tDepth, uv).x; return d >= 0.9999 ? -1.0 : -perspectiveDepthToViewZ(d, uNear, uFar); }
				float cocPx(float z) { return z < 0.0 ? 0.0 : clamp(abs(z - uFocus) / z * uAperture, 0.0, 1.0) * uMaxBlur; }
				void main() {
					vec4 base = texture2D(tDiffuse, vUv);
					float z = depthAt(vUv);
					float c0 = cocPx(z);
					vec3 acc = base.rgb; float wsum = 1.0;
					for (int i = 0; i < 28; i++) {
						float fi = float(i) + 0.5;
						float r = sqrt(fi / 28.0) * uMaxBlur;
						float a = fi * 2.39996;
						vec2 suv = vUv + vec2(cos(a), sin(a)) * r / uRes;
						float sz = depthAt(suv);
						float w = smoothstep(r - 1.0, r + 1.0, cocPx(sz));
						if (sz > z && z > 0.0) w *= smoothstep(r - 1.0, r + 1.0, c0); // background never bleeds over nearer things
						acc += texture2D(tDiffuse, suv).rgb * w;
						wsum += w;
					}
					gl_FragColor = vec4(acc / wsum, base.a);
				}
			`,
		});
		// Read whichever target the scene was just drawn into
		const dofRender = dof.render.bind(dof);
		dof.render = (r, write, read, delta, mask) => {
			dof!.uniforms.tDepth.value = read.depthTexture;
			dofRender(r, write, read, delta, mask);
		};
		composer.addPass(dof);

		// Light rays streaming from the star past anything in front of it, plus a horizontal blue lens streak
		rays = new ShaderPass({
			uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSunOn: { value: 0 }, uStreak: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } },
			vertexShader: SCREEN_VERTEX,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uSunOn; uniform float uStreak; uniform vec2 uRes; varying vec2 vUv;
				void main() {
					vec3 col = texture2D(tDiffuse, vUv).rgb;
					vec3 glow = vec3(0.0);
					if (uSunOn > 0.0) {
						vec2 step = (vUv - uSun) / 56.0 * 0.92;
						vec2 uv = vUv;
						float decay = 1.0;
						for (int i = 0; i < 56; i++) {
							uv -= step;
							glow += max(texture2D(tDiffuse, uv).rgb - 2.2, 0.0) * decay;
							decay *= 0.945;
						}
						glow *= 0.012 * uSunOn;
					}
					vec3 streak = vec3(0.0);
					for (int i = -24; i <= 24; i++) {
						float o = float(i);
						float px = sign(o) * pow(abs(o), 1.7) * 2.2;
						vec3 s = max(texture2D(tDiffuse, vUv + vec2(px / uRes.x, 0.0)).rgb - 1.8, 0.0);
						streak += s * exp(-abs(o) * 0.11);
					}
					streak = vec3(0.35, 0.55, 1.0) * dot(streak, vec3(0.33)) * 0.06 * uStreak;
					gl_FragColor = vec4(col + glow * vec3(1.0, 0.85, 0.65) + streak, 1.0);
				}
			`,
		});
		composer.addPass(rays);

		bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.4, 0.9);
		composer.addPass(bloom);
		composer.addPass(new OutputPass());
		film = new ShaderPass({
			uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
			vertexShader: SCREEN_VERTEX,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
				float rnd(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
				void main() {
					vec2 c = vUv - 0.5;
					float d = dot(c, c);
					float ca = 0.006 * d;
					vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
					col *= 1.0 - smoothstep(0.08, 0.5, d) * 0.55;
					col += (rnd(vUv * uRes + fract(uTime) * 97.0) - 0.5) * 0.04;
					col *= 0.975 + 0.025 * sin(vUv.y * uRes.y * 1.6);
					gl_FragColor = vec4(col, 1.0);
				}
			`,
		});
		composer.addPass(film);
	}

	// ---------- Camera ----------
	let W = 1, H = 1, elev = 0.36, fitD = 26;
	const focus = new THREE.Vector3();
	const focusGoal = new THREE.Vector3();
	let zoom = 1, zoomGoal = 1;
	let paused = false;
	// Viewer-controlled orbit around the focus point, layered on top of the idle drift
	let userAz = 0, userEl = 0, velAz = 0, velEl = 0, dragging = false;
	let userZoom = 1, userZoomGoal = 1; // wheel zoom, a multiplier on camera distance
	// Pan offset added to the focus point, so zooming can close in on whatever is under the cursor
	const pan = new THREE.Vector3(), panGoal = new THREE.Vector3();
	const view = new THREE.Vector3(); // focus + pan: the point the camera orbits and looks at
	let camAz = 0;

	// ---------- Close-up: one body fills the frame while the page lays its debrief around it ----------
	let closeId = '';
	const closeFrame: CloseFrame = { x: 0.5, y: 0.5, r: 200 };
	let azGoal = 0, elGoal = 0, steer = 0; // seconds left to swing the camera toward its goal angles
	let shiftX = 0, shiftY = 0; // view offset in px: moves the focus point away from the frame center
	let fade = 0; // 0 in the overview, 1 in a close-up; dims the radar disc and orbits
	const pinDirs: THREE.Vector3[] = []; // world-space directions from the close-up body's center to its sites
	const pinLocal: THREE.Vector3[] = []; // or, for sites on a map, their directions in the surface's own frame
	let spinGoal: number | null = null; // a mapped world turns so its sites face the camera
	const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

	function placeCamera(t: number, k: number) {
		focus.lerp(focusGoal, k);
		zoom += (zoomGoal - zoom) * k;
		const az = (camAz = userAz + Math.sin(t * 0.05) * 0.12);
		const el = elev + userEl + Math.sin(t * 0.07) * 0.025;
		const D = fitD * zoom * userZoom;
		view.copy(focus).add(pan);
		camera.position.set(view.x + Math.sin(az) * Math.cos(el) * D, view.y + Math.sin(el) * D, view.z + Math.cos(az) * Math.cos(el) * D);
		camera.lookAt(view);
		if (Math.abs(shiftX) + Math.abs(shiftY) > 0.5) camera.setViewOffset(W, H, shiftX, shiftY, W, H);
		else if (camera.view?.enabled) camera.clearViewOffset();
		camera.updateMatrixWorld();
	}

	// Pull back only until the FIT orbit fits; the outer orbit runs past the frame edges for a closer view
	function fitCamera() {
		const narrow = W / H < 1.2;
		const oldElev = elev;
		camera.fov = narrow ? 40 : 30;
		// Tall portrait screens look down more steeply so the orbits fill the height
		elev = W / H < 0.7 ? 0.95 : narrow ? 0.55 : 0.36;
		camera.aspect = W / H;
		camera.updateProjectionMatrix();
		const probe = new THREE.Vector3();
		const saved = { focus: focus.clone(), pan: pan.clone(), zoom, userAz, userEl, userZoom, shiftX, shiftY };
		focus.set(0, 0, 0); pan.set(0, 0, 0); zoom = 1; userAz = 0; userEl = 0; userZoom = 1; shiftX = 0; shiftY = 0;
		for (fitD = 10; fitD < 120; fitD *= 1.03) {
			placeCamera(0, 0);
			let ok = true;
			for (let i = 0; i < 16 && ok; i++) {
				const a = (i / 16) * Math.PI * 2;
				probe.set(Math.cos(a) * FIT, 0, Math.sin(a) * FIT).project(camera);
				ok = Math.abs(probe.x) < 0.94 && Math.abs(probe.y) < 0.8;
			}
			if (ok) break;
		}
		focus.copy(saved.focus); pan.copy(saved.pan); zoom = saved.zoom; userAz = saved.userAz; userEl = saved.userEl; userZoom = saved.userZoom;
		shiftX = saved.shiftX; shiftY = saved.shiftY;
		// A close-up keeps its own viewing angle when the screen's shape changes the base elevation
		if (closeId) { userEl += oldElev - elev; elGoal += oldElev - elev; }
	}

	// ---------- Drag to orbit the camera ----------
	const clampEl = () => { userEl = THREE.MathUtils.clamp(userEl, 0.07 - elev, 1.3 - elev); };
	let lastX = 0, lastY = 0, lastT = 0;
	container.addEventListener('pointerdown', (e) => {
		if (e.button !== 0 || (e.target as Element).closest('button, a, [data-nodrag]')) return;
		dragging = true;
		lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
		velAz = velEl = 0;
		container.setPointerCapture(e.pointerId);
		container.classList.add('dragging');
	});
	container.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		const dAz = -(e.clientX - lastX) * 0.006;
		const dEl = (e.clientY - lastY) * 0.004;
		const dt = Math.max((e.timeStamp - lastT) / 1000, 1 / 240);
		userAz += dAz; userEl += dEl;
		clampEl();
		velAz = velAz * 0.4 + (dAz / dt) * 0.6;
		velEl = velEl * 0.4 + (dEl / dt) * 0.6;
		lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
		if (!raf) still();
	});
	const endDrag = (e: PointerEvent) => {
		if (!dragging) return;
		dragging = false;
		// A pause before letting go means no fling
		if (e.timeStamp - lastT > 80 || opts.reduced) velAz = velEl = 0;
		container.classList.remove('dragging');
	};
	container.addEventListener('pointerup', endDrag);
	container.addEventListener('pointercancel', endDrag);
	// Double-click empty space to return to the default view
	container.addEventListener('dblclick', (e) => {
		if ((e.target as Element).closest('button, a')) return;
		userAz = userEl = velAz = velEl = 0;
		userZoomGoal = 1;
		panGoal.set(0, 0, 0);
		if (!raf) { userZoom = 1; pan.set(0, 0, 0); still(); }
	});

	// ---------- Wheel (and trackpad pinch) to zoom toward the cursor ----------
	const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), tmpV = new THREE.Vector3();
	container.addEventListener('wheel', (e) => {
		if (opts.zoomNeedsModifier() && !e.ctrlKey && !e.metaKey) return;
		if ((e.target as Element).closest('[data-nodrag]')) return; // let overlay text scroll
		e.preventDefault();
		const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * H : e.deltaY;
		// Pinch gestures arrive as small Ctrl+wheel deltas, so they get a stronger response
		const rate = e.ctrlKey && Math.abs(dy) < 20 ? 0.01 : 0.0012;
		const before = userZoomGoal;
		userZoomGoal = THREE.MathUtils.clamp(userZoomGoal * Math.exp(dy * rate), 0.3, 1.8);
		const scale = userZoomGoal / before;
		// Scale the view about the point on the orbital plane under the cursor, so that point stays put.
		// Zoom and pan ease at the same rate, which keeps the point fixed during the animation too.
		const r = container.getBoundingClientRect();
		ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
		ray.setFromCamera(ndc, camera);
		const { origin, direction } = ray.ray;
		// A close-up zooms straight in on its body instead
		if (scale !== 1 && direction.y < -1e-3 && !closeId) {
			hit.copy(origin).addScaledVector(direction, -origin.y / direction.y);
			if (hit.length() < 40) {
				const target = tmpV.copy(focus).add(panGoal); // where the view is heading
				panGoal.copy(hit).addScaledVector(target.sub(hit), scale).sub(focus);
				panGoal.y = 0;
				if (panGoal.length() > 16) panGoal.setLength(16);
			}
		}
		if (!raf) { userZoom = userZoomGoal; pan.copy(panGoal); still(); }
	}, { passive: false });

	let cinematic = true;
	function resize() {
		const r = container.getBoundingClientRect();
		W = Math.max(1, r.width); H = Math.max(1, r.height);
		fitCamera();
		const dpr = Math.min(devicePixelRatio || 1, 1.75);
		// Focus blur and light rays are the heaviest passes; phones skip them
		cinematic = W >= 700;
		if (renderer && composer && bloom && film && dof && rays) {
			renderer.setPixelRatio(dpr);
			renderer.setSize(W, H, false);
			composer.setPixelRatio(dpr);
			composer.setSize(W, H);
			bloom.resolution.set(W / 2, H / 2);
			film.uniforms.uRes.value.set(W * dpr, H * dpr);
			dof.uniforms.uRes.value.set(W * dpr, H * dpr);
			dof.uniforms.uMaxBlur.value = 9 * dpr;
			rays.uniforms.uRes.value.set(W * dpr, H * dpr);
			dof.enabled = rays.enabled = cinematic;
		}
		starLayers.forEach((l) => { l.mat.size = l.size * dpr; });
	}

	// ---------- Frame ----------
	const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), sunView = new THREE.Vector3(), nrm = new THREE.Vector3(), SUN_AT = new THREE.Vector3();
	const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
	let sweep = -Math.PI / 2;
	let exposure = 1;

	function step(dt: number, t: number, k: number) {
		sunUniforms.uTime.value = t;
		sweep += dt * 0.45;
		sweepUniforms.uSweep.value = sweep;
		beltLayers.forEach((l) => { l.group.rotation.y -= dt * l.speed; });

		for (const b of bodies) {
			if (!paused && !closeId) b.angle += dt * b.speed;
			b.pivot.position.set(Math.cos(b.angle) * b.orbit, 0, Math.sin(b.angle) * b.orbit);
			// A close-up holds still so its pins stay put; a mapped world first turns its sites to the camera and stands upright
			const turn = k === 1 ? 1 : 1 - Math.exp(-dt * 2);
			if (b.id !== closeId) b.spin.rotation.y += dt * 0.05;
			else if (spinGoal !== null) b.spin.rotation.y += wrapAngle(spinGoal - b.spin.rotation.y) * turn;
			const lean = b.id === closeId && spinGoal !== null ? 0 : b.lean;
			b.tilt.rotation.z += (lean - b.tilt.rotation.z) * turn;
			// In a close-up the other planets shrink away so only the chosen one stands out
			const goal = closeId && b.id !== closeId ? 0.3 : 1;
			b.scale += (goal - b.scale) * (k === 1 ? 1 : 1 - Math.exp(-dt * 2.5));
			b.pivot.scale.setScalar(b.scale);
		}
		if (vessel && vo) {
			// Under power, the ship runs its orbit faster than a planet would: about once every five minutes
			if (!paused && !closeId) vAngle += dt * VESSEL_SPEED;
			const goal = closeId && closeId !== 'vessel' ? 0.3 : 1;
			vScale += (goal - vScale) * (k === 1 ? 1 : 1 - Math.exp(-dt * 2.5));
			placeVessel();
			// The ring spins for gravity; in its close-up it eases round to where its bays read top to bottom
			if (closeId === 'vessel') vessel.ring.rotation.z += (ringGoal - vessel.ring.rotation.z) * (k === 1 ? 1 : 1 - Math.exp(-dt * 2));
			else vessel.ring.rotation.z += dt * 0.09;
			vessel.update(t, dt, shipLight);
		}

		const close = bodies.find((b) => b.id === closeId);
		if (closeId) {
			// Fly in until the body's radius on screen matches the frame the page asked for
			const ship = closeId === 'vessel' && vessel;
			const sec = ship && vSection >= 0 ? vessel.sections[vSection] : null;
			if (sec) sec.center.getWorldPosition(focusGoal);
			else focusGoal.copy(ship ? vessel.root.position : close ? close.pivot.position : SUN_AT);
			const reach = sec ? sec.reach : ship ? vessel.reach : close ? close.size * (close.ring ? 1.9 : 1) : 1.1 * 1.6; // rings and the star's glow need room too
			zoomGoal = reach / ((closeFrame.r / (H / 2)) * tanHalf()) / fitD;
		} else {
			focusGoal.set(0, 0, 0);
			zoomGoal = 1;
		}
		const ease = 1 - Math.exp(-dt * 8);
		userZoom += (userZoomGoal - userZoom) * ease;
		pan.lerp(panGoal, ease);
		const shiftGoalX = closeId ? (0.5 - closeFrame.x) * W : 0;
		const shiftGoalY = closeId ? (0.5 - closeFrame.y) * H : 0;
		shiftX += (shiftGoalX - shiftX) * k;
		shiftY += (shiftGoalY - shiftY) * k;
		fade += ((closeId ? 1 : 0) - fade) * (k === 1 ? 1 : 1 - Math.exp(-dt * 3));
		// Close in on the vessel and the star's light hands over to a shadow-casting directional light aimed at it
		if (vessel) {
			shipLight += ((closeId === 'vessel' ? 1 : 0) - shipLight) * (k === 1 ? 1 : 1 - Math.exp(-dt * 2));
			sunLight.intensity = 3.4 * (1 - 0.85 * shipLight);
			shipSun.intensity = 3.4 * shipLight;
			shipSun.shadow.autoUpdate = shipLight > 0.01;
			// The shadow map covers only what the camera holds, so a single section gets crisp shadows
			const held = closeId === 'vessel' && vSection >= 0 ? vessel.sections[vSection] : null;
			const span = held ? held.reach * 2.6 : 0.62;
			if (Math.abs(span - shadowSpan) > 1e-4) {
				shadowSpan = span;
				Object.assign(shipSun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
				shipSun.shadow.camera.updateProjectionMatrix();
			}
			const lookAt = held ? held.center.getWorldPosition(tmp2) : tmp2.copy(vessel.root.position);
			tmp.copy(vessel.root.position).normalize();
			shipSun.target.position.copy(lookAt);
			shipSun.position.copy(lookAt).addScaledVector(tmp, -3);
			// Space has no fill light: in the close-up the ambient and camera fill fall away, and a rim light comes up
			ambient.intensity = 0.12 * (1 - 0.75 * shipLight);
			kicker.intensity = 0.35 * (1 - 0.8 * shipLight);
			rimLight.intensity = 1.6 * shipLight;
			rimLight.target.position.copy(lookAt);
			rimLight.position.copy(lookAt).addScaledVector(tmp3.copy(lookAt).sub(camera.position).normalize(), 2).addScaledVector(vn, 0.9);
			// Close-ups of a single section bring the camera within the default near plane
			const D = fitD * zoom * userZoom;
			const nearGoal = THREE.MathUtils.clamp(D * 0.04, 0.003, 0.5);
			if (Math.abs(nearGoal - camera.near) / camera.near > 0.03) {
				camera.near = nearGoal;
				camera.updateProjectionMatrix();
				if (dof) dof.uniforms.uNear.value = nearGoal;
			}
		}
		// Swing the camera to the angle a close-up (or the overview) wants; a drag takes over at once
		if (steer > 0 && !dragging) {
			const s = k === 1 ? 1 : 1 - Math.exp(-dt * 2.2);
			userAz += (azGoal - userAz) * s;
			userEl += (elGoal - userEl) * s;
			steer = k === 1 ? 0 : steer - dt;
		}
		if (!dragging && (velAz || velEl)) {
			userAz += velAz * dt; userEl += velEl * dt;
			clampEl();
			const decay = Math.exp(-dt * 3.5);
			velAz *= decay; velEl *= decay;
			if (Math.abs(velAz) + Math.abs(velEl) < 0.002) velAz = velEl = 0;
		}
		placeCamera(t, k);
		scene.updateMatrixWorld();

		// Everything planets need for lighting and shadows, in view space
		sunView.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
		bodies.forEach((b) => b.view.copy(b.pivot.position).applyMatrix4(camera.matrixWorldInverse));
		for (const b of bodies) {
			const u = b.mat.uniforms;
			u.uSunView.value.copy(sunView);
			u.uTime.value = t;
			u.uOccCount.value = Math.min(bodies.length, MAX_OCC);
			bodies.slice(0, MAX_OCC).forEach((o, i) => (u.uOcc.value[i] as THREE.Vector4).set(o.view.x, o.view.y, o.view.z, o.size * o.scale));
			b.atmo.uniforms.uSun.value.copy(sunView).sub(b.view).normalize();
			if (b.ring) {
				nrm.set(0, 0, 1).transformDirection(b.ring.mesh.matrixWorld).transformDirection(camera.matrixWorldInverse);
				u.uRingCenter.value.copy(b.view);
				u.uRingNormal.value.copy(nrm);
				u.uRingIn.value = b.ring.inner * b.scale;
				u.uRingOut.value = b.ring.outer * b.scale;
				const ru = b.ring.mat.uniforms;
				ru.uSunView.value.copy(sunView);
				ru.uNormal.value.copy(nrm);
				ru.uPlanet.value.set(b.view.x, b.view.y, b.view.z, b.size * b.scale);
			}
		}

		sweepUniforms.uFade.value = 1 - fade;
		orbits.forEach((line, r) => {
			const mat = line.material as THREE.LineBasicMaterial;
			mat.color.copy(close?.orbit === r ? AMBER : ICE);
			mat.opacity = 1 - 0.75 * fade;
			line.rotation.y = camAz; // keep the brighter half of each ring on the side nearest the camera
		});
		if (vesselOrbit) {
			const mat = vesselOrbit.material as THREE.LineDashedMaterial;
			mat.color.copy(closeId === 'vessel' ? AMBER : ICE);
			mat.opacity = 0.32 * (1 - 0.75 * fade);
		}

		// Lens: focus on the close-up body, aim rays at the star, and let exposure adapt to how much star is in frame
		tmp.set(0, 0, 0).project(camera);
		const sunR = (1.1 / (camera.position.length() * tanHalf())) * (H / 2);
		const offscreen = Math.max(Math.abs(tmp.x) - 1, Math.abs(tmp.y) - 1, 0);
		const sunOn = tmp.z < 1 ? 1 - THREE.MathUtils.smoothstep(offscreen, 0, 0.35) : 0;
		if (dof) dof.uniforms.uFocus.value = camera.position.distanceTo(closeId ? focus : view);
		if (rays) {
			rays.uniforms.uSun.value.set((tmp.x + 1) / 2, (tmp.y + 1) / 2);
			rays.uniforms.uSunOn.value = sunOn;
			rays.uniforms.uStreak.value = 1 - fade; // a planet filling the frame would smear its sun glint into bands
		}
		const exposureGoal = 1.1 - 0.3 * sunOn * THREE.MathUtils.clamp(sunR / 50, 0, 1);
		exposure += (exposureGoal - exposure) * (k === 1 ? 1 : 1 - Math.exp(-dt * 1.2));
		if (renderer) renderer.toneMappingExposure = exposure;
		if (film) film.uniforms.uTime.value = t;

		report();
	}

	function toScreen(v: THREE.Vector3, key: string, size: number): ScreenPoint {
		const dist = camera.position.distanceTo(v);
		tmp.copy(v).project(camera);
		if (tmp.z > 1) return { key, x: -9999, y: -9999, r: 0 }; // behind the camera
		return { key, x: ((tmp.x + 1) / 2) * W, y: ((1 - tmp.y) / 2) * H, r: (size / (dist * tanHalf())) * (H / 2) };
	}

	const labelPoints = [
		{ key: 'belt', p: new THREE.Vector3(0, 0, BELT[1] + 0.35) },
	];
	const pinAt = new THREE.Vector3(), toCam = new THREE.Vector3(), nrmAt = new THREE.Vector3();
	function report() {
		const host = bodies.find((b) => b.id === closeId);
		const pin = (normal: THREE.Vector3) => {
			const p = toScreen(pinAt, '', 0);
			return { x: p.x, y: p.y, front: normal.dot(toCam.copy(camera.position).sub(pinAt).normalize()) };
		};
		const pins = closeId === 'vessel' && vessel
			? vessel.sections.map((sec) => {
				const p = toScreen(sec.anchor.getWorldPosition(pinAt), '', 0);
				return { x: p.x, y: p.y, front: 1 };
			})
			: !host ? []
			: pinLocal.length
				? pinLocal.map((v) => {
					// Mapped sites ride the surface, so they follow it as it turns
					pinAt.copy(v).multiplyScalar(host.size).applyMatrix4(host.spin.matrixWorld);
					return pin(nrmAt.copy(pinAt).sub(host.pivot.position).normalize());
				})
				: pinDirs.map((d) => {
					pinAt.copy(host.pivot.position).addScaledVector(d, host.size * host.scale);
					return pin(d);
				});
		opts.onFrame(
			[
				...bodies.map((b) => toScreen(b.pivot.position, b.id, b.size * b.scale)),
				...(vessel ? [toScreen(vessel.root.position, 'vessel', vessel.reach * vScale)] : []),
			],
			labelPoints.map((l) => toScreen(l.p, l.key, 0)),
			toScreen(SUN_AT, 'sun', 1.1),
			pins,
		);
	}

	// A [latitude, longitude] spot as a direction in a sphere's own frame, matching three.js sphere UVs on an equirectangular map
	function mapDir(lat: number, lon: number) {
		const phi = THREE.MathUtils.degToRad(lon + 180), theta = THREE.MathUtils.degToRad(90 - lat);
		return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
	}

	// Sites given as map spots are pinned there, and the world turns so the middle of their longitudes faces the camera.
	// A bare count is spread over the face the camera will look at, left of center on the lit side: a sunflower spiral
	// on a plain world, a wide arc above the rings on a ringed one. Either way the list on the page runs top to bottom.
	function placePins(b: Body, pins: Pins) {
		pinDirs.length = 0;
		pinLocal.length = 0;
		spinGoal = null;
		if (Array.isArray(pins)) {
			for (const [lat, lon] of pins) pinLocal.push(mapDir(lat, lon));
			// Face the middle of their east-west spread, so the outermost sites sit equally far from either limb
			const r = THREE.MathUtils.degToRad;
			const mean = Math.atan2(pins.reduce((a, [, lon]) => a + Math.sin(r(lon)), 0), pins.reduce((a, [, lon]) => a + Math.cos(r(lon)), 0));
			const offsets = pins.map(([, lon]) => wrapAngle(r(lon) - mean));
			const mid = mean + (Math.min(...offsets) + Math.max(...offsets)) / 2;
			// Spinning by psi carries map angle phi to world azimuth phi + psi - 90°, so this brings `mid` round to the camera
			spinGoal = azGoal + Math.PI / 2 - (mid + Math.PI);
			return;
		}
		const n = pins;
		if (!n) return;
		const az = azGoal, el = elev + elGoal;
		const c = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
		const r = new THREE.Vector3(0, 1, 0).cross(c).normalize();
		const u = new THREE.Vector3().crossVectors(c, r);
		const spots = Array.from({ length: n }, (_, i) => {
			if (b.ring) {
				// Across the upper face, alternating high and low so neighbours keep their distance;
				// the low row stays just clear of where the rings cross the disc
				const f = n > 1 ? i / (n - 1) : 0.5;
				return { yaw: -1.0 + 1.6 * f, pitch: i % 2 ? 0.32 : 0.82 };
			}
			const rr = n === 1 ? 0 : 0.72 * Math.sqrt((i + 0.5) / n), t = i * 2.39996; // a lone site sits mid-face
			return { yaw: -0.2 + rr * Math.cos(t), pitch: 0.05 + rr * Math.sin(t) };
		}).sort((a, z) => z.pitch - a.pitch);
		for (const { yaw, pitch } of spots) {
			pinDirs.push(new THREE.Vector3()
				.addScaledVector(c, Math.cos(yaw) * Math.cos(pitch))
				.addScaledVector(r, Math.sin(yaw) * Math.cos(pitch))
				.addScaledVector(u, Math.sin(pitch))
				.normalize());
		}
	}

	// Pick the ring angle at which the close-up camera sees the bays most evenly spread from top to bottom;
	// the page then lists them in that on-screen order
	function settleRing(az: number, el: number) {
		if (!vessel) return;
		const probe = new THREE.PerspectiveCamera(camera.fov, W / H, 0.01, 100);
		const D = vessel.reach / ((closeFrame.r / (H / 2)) * tanHalf());
		const c = vessel.root.position;
		probe.position.set(c.x + Math.sin(az) * Math.cos(el) * D, c.y + Math.sin(el) * D, c.z + Math.cos(az) * Math.cos(el) * D);
		probe.lookAt(c);
		probe.updateMatrixWorld();
		const start = vessel.ring.rotation.z, p = new THREE.Vector3();
		let best = start, bestScore = -Infinity;
		for (let i = 0; i < 180; i++) {
			const phi = start - Math.PI + (i / 180) * Math.PI * 2;
			vessel.ring.rotation.z = phi;
			vessel.root.updateMatrixWorld(true);
			const ys = vessel.sections.slice(1).map((sec) => sec.anchor.getWorldPosition(p).project(probe).y).sort((a, z) => z - a);
			let score = Infinity;
			for (let j = 1; j < ys.length; j++) score = Math.min(score, ys[j - 1] - ys[j]);
			if (score > bestScore) { bestScore = score; best = phi; }
		}
		vessel.ring.rotation.z = start;
		vessel.root.updateMatrixWorld(true);
		ringGoal = best;
	}

	// The camera direction for the vessel's close-up: a three-quarter view from the sunlit side, a little above.
	// The whole ship is seen mostly side-on so its length reads; a section is seen more from ahead, so its
	// windows and markings face the camera.
	function vesselAngles(section: number) {
		if (!vessel) return { az: 0, el: 0.3 };
		const toSun = vessel.root.position.clone().negate().normalize();
		const side = vX.dot(toSun) >= 0 ? vX.clone() : vX.clone().negate();
		const [s, up, fwd] = section < 0 ? [0.8, 0.42, 0.3] : section === 0 ? [0.62, 0.45, 0.62] : [0.55, 0.42, 0.72];
		const d = side.multiplyScalar(s).addScaledVector(vn, up).addScaledVector(vTan, fwd).normalize();
		const az = Math.atan2(d.x, d.z), el = THREE.MathUtils.clamp(Math.asin(d.y), 0.12, 0.62);
		if (section < 0) settleRing(az, el);
		else {
			const ra = vessel.sections[section].ringAngle;
			if (ra !== undefined) {
				// Turn the ring so the bay swings round toward the camera
				const target = Math.atan2(d.dot(vn), d.dot(vX));
				const cur = vessel.ring.rotation.z;
				ringGoal = cur + Math.atan2(Math.sin(target - ra - cur), Math.cos(target - ra - cur));
			}
		}
		return { az, el };
	}

	function render() {
		if (composer) composer.render();
	}

	let last = performance.now();
	let raf = 0;
	let inView = true;
	let suspended = false; // another full-screen scene (the cabin) is showing instead
	function frame(now: number) {
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		step(dt, now / 1000, 1 - Math.exp(-dt * 2.4));
		render();
		raf = requestAnimationFrame(frame);
	}
	function start() {
		if (opts.reduced || raf || suspended) return;
		last = performance.now();
		raf = requestAnimationFrame(frame);
	}
	function stop() {
		cancelAnimationFrame(raf);
		raf = 0;
	}
	function still() {
		step(0, 0, 1);
		render();
	}

	resize();
	new ResizeObserver(() => { resize(); if ((opts.reduced || !inView) && !suspended) still(); }).observe(container);
	new IntersectionObserver(([entry]) => {
		inView = entry.isIntersecting;
		if (inView) start(); else stop();
	}).observe(container);
	still();
	start();

	return {
		setPaused(p: boolean) {
			paused = p;
		},
		// Stop drawing altogether while something else covers the screen
		suspend(on: boolean) {
			suspended = on;
			if (on) stop();
			else if (inView) { start(); if (opts.reduced) still(); }
		},
		// Fly to one body ('sun' for the star) and hold it at `frame`, with `pins` sites on its face;
		// an empty id returns to the overview
		closeup(id: string, frame: CloseFrame, pins: Pins = 0, section = -1) {
			Object.assign(closeFrame, frame);
			if (id === closeId && (id !== 'vessel' || section === vSection)) return;
			const reframe = id === closeId; // the vessel stays; the camera moves between the ship and one section
			closeId = id;
			vSection = id === 'vessel' ? section : -1;
			if (reframe) {
				const { az, el } = vesselAngles(section);
				azGoal = userAz + Math.atan2(Math.sin(az - userAz), Math.cos(az - userAz));
				elGoal = el - elev;
				steer = 3;
				if (!raf) still();
				return;
			}
			userZoomGoal = 1;
			panGoal.set(0, 0, 0);
			const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
			const b = bodies.find((x) => x.id === id);
			let az = 0, el = 0.36;
			if (b) {
				// Look at the body from 70° off the line to the star: a gibbous phase, lit limb on the left, night side toward the text
				const toSun = Math.atan2(-Math.sin(b.angle), -Math.cos(b.angle));
				az = Math.PI / 2 - (toSun - THREE.MathUtils.degToRad(70));
				el = b.ring ? 0.24 : 0.12;
			} else if (id === 'vessel' && vessel) {
				({ az, el } = vesselAngles(section));
			} else if (id) {
				az = userAz;
				el = 0.22;
			}
			azGoal = userAz + wrap(az - userAz);
			elGoal = id ? el - elev : 0;
			steer = 3;
			if (b) placePins(b, pins);
			else {
				pinDirs.length = 0;
				pinLocal.length = 0;
				spinGoal = null;
			}
			if (!raf) still();
		},
		setCloseFrame(frame: CloseFrame) {
			Object.assign(closeFrame, frame);
			if (!raf) still();
		},
		// The vessel section under a point on the page, or -1; only in the vessel's close-up
		pickVessel(clientX: number, clientY: number) {
			if (!vessel || closeId !== 'vessel') return -1;
			const r = container.getBoundingClientRect();
			ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
			ray.setFromCamera(ndc, camera);
			const hits = ray.intersectObjects(vessel.sections.map((sec) => sec.proxy), false);
			return hits.length ? vessel.sections.findIndex((sec) => sec.proxy === hits[0].object) : -1;
		},
		highlightVessel(hover: number, selected: number) {
			vessel?.highlight(hover, selected);
			if (!raf) still();
		},
	};
}
