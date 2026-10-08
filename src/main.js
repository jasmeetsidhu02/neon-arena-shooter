import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';

// ---------- Config ----------
const ARENA = 40;            // half-size of the arena
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.6;
const WALK_SPEED = 9;
const SPRINT_SPEED = 15;
const MAG_SIZE = 12;
const RELOAD_TIME = 1.1;
const FIRE_COOLDOWN = 0.14;
const MAX_HEALTH = 100;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  score: $('score'), wave: $('wave'), ammo: $('ammo'),
  health: $('health-fill'), overlay: $('overlay'), start: $('start'),
  subtitle: $('subtitle'), banner: $('banner'), damage: $('damage'),
  crosshair: $('crosshair'),
};

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Touch devices (phones/tablets) get on-screen controls and a lighter render load
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.Fog(0x05060f, 20, 80);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, PLAYER_HEIGHT, 0);
scene.add(camera);

const controls = new PointerLockControls(camera, document.body);

// ---------- Lighting ----------
scene.add(new THREE.HemisphereLight(0x6688ff, 0x220044, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 40, 10);
sun.castShadow = true;
sun.shadow.camera.left = -ARENA; sun.shadow.camera.right = ARENA;
sun.shadow.camera.top = ARENA; sun.shadow.camera.bottom = -ARENA;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
scene.add(sun);

// ---------- Arena ----------
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
  new THREE.MeshStandardMaterial({ color: 0x0a0c1c, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(ARENA * 2, 40, 0x00f0ff, 0x1a2a55);
grid.position.y = 0.01;
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

// Boundary walls
const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d1030, emissive: 0x220044, emissiveIntensity: 0.6 });
for (const [x, z, w, d] of [
  [0, -ARENA, ARENA * 2, 1], [0, ARENA, ARENA * 2, 1],
  [-ARENA, 0, 1, ARENA * 2], [ARENA, 0, 1, ARENA * 2],
]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), wallMat);
  wall.position.set(x, 3, z);
  scene.add(wall);
}

// Pillars for cover (also block bullets)
const obstacles = [];
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x151a3a, roughness: 0.4, metalness: 0.3 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0xff2e88 });
const pillarSpots = [
  [-15, -15], [15, -15], [-15, 15], [15, 15],
  [0, -24], [0, 24], [-24, 0], [24, 0],
  [-8, 6], [9, -7],
];
for (const [x, z] of pillarSpots) {
  const h = 3 + Math.random() * 4;
  const geo = new THREE.BoxGeometry(3, h, 3);
  const pillar = new THREE.Mesh(geo, pillarMat);
  pillar.position.set(x, h / 2, z);
  pillar.castShadow = true;
  pillar.receiveShadow = true;
  pillar.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
  scene.add(pillar);
  obstacles.push({ mesh: pillar, minX: x - 1.5, maxX: x + 1.5, minZ: z - 1.5, maxZ: z + 1.5 });
}

// ---------- Gun (attached to camera) ----------
const gun = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.14, 0.6),
  new THREE.MeshStandardMaterial({ color: 0x222838, metalness: 0.7, roughness: 0.3 })
);
const gunStripe = new THREE.Mesh(
  new THREE.BoxGeometry(0.125, 0.03, 0.5),
  new THREE.MeshBasicMaterial({ color: 0x00f0ff })
);
gunStripe.position.y = 0.04;
const barrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12),
  new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
);
barrel.rotation.x = Math.PI / 2;
barrel.position.z = -0.42;
gun.add(gunBody, gunStripe, barrel);
const GUN_REST = new THREE.Vector3(0.22, -0.2, -0.5);
gun.scale.setScalar(0.6);
gun.position.copy(GUN_REST);
camera.add(gun);

const muzzleFlash = new THREE.PointLight(0x00f0ff, 0, 6);
muzzleFlash.position.set(0.22, -0.18, -0.85);
camera.add(muzzleFlash);

// ---------- Audio (synthesized, no assets) ----------
let audioCtx = null;
function beep({ freq = 440, endFreq = freq, dur = 0.1, type = 'square', vol = 0.15 }) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}
const sfx = {
  shoot: () => beep({ freq: 900, endFreq: 120, dur: 0.12, type: 'sawtooth', vol: 0.12 }),
  hit: () => beep({ freq: 1200, endFreq: 800, dur: 0.05, type: 'square', vol: 0.08 }),
  kill: () => beep({ freq: 300, endFreq: 40, dur: 0.35, type: 'triangle', vol: 0.25 }),
  hurt: () => beep({ freq: 160, endFreq: 60, dur: 0.25, type: 'sawtooth', vol: 0.2 }),
  reload: () => beep({ freq: 400, endFreq: 700, dur: 0.15, type: 'square', vol: 0.06 }),
  empty: () => beep({ freq: 200, dur: 0.05, type: 'square', vol: 0.05 }),
  wave: () => beep({ freq: 300, endFreq: 1200, dur: 0.5, type: 'triangle', vol: 0.2 }),
};

// ---------- Input ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let mouseDown = false;
if (!isTouch) {
  addEventListener('mousedown', (e) => { if (e.button === 0) mouseDown = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
}

// ---------- Touch controls ----------
// Left side: floating joystick to move. Right side: drag to aim.
// FIRE button shoots while held and can also be dragged to aim.
const touch = {
  moveX: 0, moveY: 0,       // joystick, -1..1
  moveId: null, originX: 0, originY: 0,
  looks: new Map(),         // pointerId -> last {x, y}
  fireId: null,
};
const JOY_RADIUS = 55;
const LOOK_SENS = 0.006;
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const joystick = $('joystick');
const knob = $('joystick-knob');
const fireBtn = $('btn-fire');

function applyLook(dx, dy) {
  lookEuler.setFromQuaternion(camera.quaternion);
  lookEuler.y -= dx * LOOK_SENS;
  lookEuler.x -= dy * LOOK_SENS;
  lookEuler.x = THREE.MathUtils.clamp(lookEuler.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  camera.quaternion.setFromEuler(lookEuler);
}

function resetJoystick() {
  touch.moveId = null;
  touch.moveX = touch.moveY = 0;
  knob.style.transform = '';
  joystick.style.left = joystick.style.top = joystick.style.bottom = '';
  joystick.classList.remove('active');
}

function resetTouch() {
  resetJoystick();
  touch.looks.clear();
  touch.fireId = null;
  fireBtn.classList.remove('active');
}

const moveZone = $('move-zone');
moveZone.addEventListener('pointerdown', (e) => {
  if (touch.moveId !== null) return;
  e.preventDefault();
  moveZone.setPointerCapture(e.pointerId);
  touch.moveId = e.pointerId;
  touch.originX = e.clientX;
  touch.originY = e.clientY;
  // Joystick appears under the thumb
  const size = joystick.offsetWidth;
  joystick.style.left = `${e.clientX - size / 2}px`;
  joystick.style.top = `${e.clientY - size / 2}px`;
  joystick.style.bottom = 'auto';
  joystick.classList.add('active');
});
moveZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== touch.moveId) return;
  let dx = e.clientX - touch.originX;
  let dy = e.clientY - touch.originY;
  const len = Math.hypot(dx, dy);
  if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  touch.moveX = dx / JOY_RADIUS;
  touch.moveY = dy / JOY_RADIUS;
});
for (const type of ['pointerup', 'pointercancel']) {
  moveZone.addEventListener(type, (e) => { if (e.pointerId === touch.moveId) resetJoystick(); });
}

function bindLook(el, isFire) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    touch.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isFire) { touch.fireId = e.pointerId; fireBtn.classList.add('active'); }
  });
  el.addEventListener('pointermove', (e) => {
    const last = touch.looks.get(e.pointerId);
    if (!last || state.mode !== 'playing') return;
    applyLook(e.clientX - last.x, e.clientY - last.y);
    last.x = e.clientX;
    last.y = e.clientY;
  });
  for (const type of ['pointerup', 'pointercancel']) {
    el.addEventListener(type, (e) => {
      touch.looks.delete(e.pointerId);
      if (e.pointerId === touch.fireId) { touch.fireId = null; fireBtn.classList.remove('active'); }
    });
  }
}
bindLook($('look-zone'), false);
bindLook(fireBtn, true);

$('btn-reload').addEventListener('pointerdown', (e) => { e.preventDefault(); startReload(); });
$('btn-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); pauseGame(); });

// Stop iOS/Android from scrolling, zooming or long-press menus during play
document.addEventListener('touchmove', (e) => { if (state.mode === 'playing') e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Game state ----------
const state = {
  mode: 'menu', // menu | playing | paused | over
  score: 0,
  wave: 0,
  health: MAX_HEALTH,
  ammo: MAG_SIZE,
  reloading: 0,
  fireCooldown: 0,
  enemiesToSpawn: 0,
  spawnTimer: 0,
};

const enemies = [];
const projectiles = [];
const particles = [];
const tracers = [];

// ---------- Enemies ----------
const enemyGeo = new THREE.IcosahedronGeometry(0.8, 0);
const eyeGeo = new THREE.SphereGeometry(0.22, 12, 12);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function spawnEnemy() {
  const isShooter = state.wave >= 2 && Math.random() < Math.min(0.15 + state.wave * 0.05, 0.5);
  const color = isShooter ? 0xffaa00 : 0xff2e88;
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.7, flatShading: true,
  });
  const mesh = new THREE.Mesh(enemyGeo, mat);
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.z = 0.65;
  mesh.add(eye);
  mesh.castShadow = true;

  // Spawn on the arena edge, away from the player
  let x, z;
  do {
    const side = Math.floor(Math.random() * 4);
    const t = (Math.random() * 2 - 1) * (ARENA - 3);
    [x, z] = [[t, -ARENA + 3], [t, ARENA - 3], [-ARENA + 3, t], [ARENA - 3, t]][side];
  } while (Math.hypot(x - camera.position.x, z - camera.position.z) < 20);

  mesh.position.set(x, 1.6, z);
  scene.add(mesh);
  enemies.push({
    mesh,
    hp: 2 + Math.floor(state.wave / 2),
    // A touch screen is harder to aim with, so drones are a bit slower on phones
    speed: ((isShooter ? 3 : 4.5) + state.wave * 0.35 + Math.random()) * (isTouch ? 0.85 : 1),
    shooter: isShooter,
    shootTimer: 1.5 + Math.random() * 2,
    bobOffset: Math.random() * Math.PI * 2,
    flash: 0,
  });
}

function killEnemy(index) {
  const e = enemies[index];
  burst(e.mesh.position, e.mesh.material.color, 40);
  scene.remove(e.mesh);
  e.mesh.material.dispose();
  enemies.splice(index, 1);
  state.score += e.shooter ? 150 : 100;
  sfx.kill();
  updateHUD();
}

// ---------- Enemy projectiles ----------
const projGeo = new THREE.SphereGeometry(0.2, 10, 10);
const projMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
function enemyShoot(e) {
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(e.mesh.position);
  const target = camera.position.clone();
  target.y -= 0.3;
  const vel = target.sub(mesh.position).normalize().multiplyScalar(14);
  scene.add(mesh);
  projectiles.push({ mesh, vel, life: 5 });
}

// ---------- Particles ----------
function burst(pos, color, count) {
  const positions = new Float32Array(count * 3);
  const vels = [];
  for (let i = 0; i < count; i++) {
    positions.set([pos.x, pos.y, pos.z], i * 3);
    vels.push(new THREE.Vector3(
      (Math.random() - 0.5) * 12, Math.random() * 10, (Math.random() - 0.5) * 12
    ));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color, size: 0.25, transparent: true, opacity: 1, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  particles.push({ points, vels, life: 0.9, maxLife: 0.9 });
}

// ---------- Shooting ----------
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

function shoot() {
  if (state.reloading > 0 || state.fireCooldown > 0) return;
  if (state.ammo <= 0) { sfx.empty(); startReload(); return; }

  state.ammo--;
  state.fireCooldown = FIRE_COOLDOWN;
  sfx.shoot();
  updateHUD();

  // Recoil + flash
  gun.position.z = GUN_REST.z + 0.12;
  gun.rotation.x = 0.15;
  muzzleFlash.intensity = 30;

  raycaster.setFromCamera(screenCenter, camera);
  const ray = raycaster.ray;

  // Nearest pillar along the ray blocks the shot
  const wallHit = raycaster.intersectObjects(obstacles.map((o) => o.mesh), false)[0];
  const wallDist = wallHit ? wallHit.distance : Infinity;

  // Enemies are treated as spheres; touch players get a slightly bigger hit radius (aim assist)
  const hitRadius = isTouch ? 1.35 : 0.9;
  let targetIdx = -1;
  let targetDist = Infinity;
  const toEnemy = new THREE.Vector3();
  enemies.forEach((e, i) => {
    toEnemy.subVectors(e.mesh.position, ray.origin);
    const along = toEnemy.dot(ray.direction);
    if (along <= 0 || along >= wallDist || along >= targetDist) return;
    if (ray.distanceToPoint(e.mesh.position) < hitRadius) { targetIdx = i; targetDist = along; }
  });

  const start = new THREE.Vector3();
  barrel.getWorldPosition(start);
  let end = ray.origin.clone().addScaledVector(ray.direction, 80);

  if (targetIdx !== -1) {
    const e = enemies[targetIdx];
    end = e.mesh.position.clone();
    e.hp--;
    e.flash = 0.1;
    sfx.hit();
    ui.crosshair.classList.add('hit');
    setTimeout(() => ui.crosshair.classList.remove('hit'), 90);
    burst(end, 0xffffff, 8);
    if (e.hp <= 0) killEnemy(targetIdx);
  } else if (wallHit) {
    end = wallHit.point.clone();
    burst(end, 0x00f0ff, 6);
  }

  // Tracer
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({
    color: 0x00f0ff, transparent: true, opacity: 1,
  }));
  scene.add(tracer);
  tracers.push({ line: tracer, life: 0.08 });

  if (state.ammo === 0) startReload();
}

function startReload() {
  if (state.mode !== 'playing' || state.reloading > 0 || state.ammo === MAG_SIZE) return;
  state.reloading = RELOAD_TIME;
  sfx.reload();
  ui.ammo.textContent = '…';
}

// ---------- Player ----------
function damagePlayer(amount) {
  state.health = Math.max(0, state.health - amount);
  ui.damage.style.opacity = '1';
  setTimeout(() => (ui.damage.style.opacity = '0'), 120);
  sfx.hurt();
  updateHUD();
  if (state.health <= 0) gameOver();
}

function resolveCollisions(pos) {
  const limit = ARENA - 1 - PLAYER_RADIUS;
  pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
  pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit);
  for (const o of obstacles) {
    const cx = THREE.MathUtils.clamp(pos.x, o.minX, o.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, o.minZ, o.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist < PLAYER_RADIUS) {
      if (dist === 0) { pos.x += PLAYER_RADIUS; continue; }
      const push = (PLAYER_RADIUS - dist) / dist;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }
}

// ---------- Waves ----------
function nextWave() {
  state.wave++;
  state.enemiesToSpawn = 3 + state.wave * 2;
  state.spawnTimer = 1;
  showBanner(`WAVE ${state.wave}`);
  sfx.wave();
  // Small heal between waves
  if (state.wave > 1) state.health = Math.min(MAX_HEALTH, state.health + 20);
  updateHUD();
}

let bannerTimeout;
function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.style.opacity = '1';
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => (ui.banner.style.opacity = '0'), 1500);
}

// ---------- HUD ----------
function updateHUD() {
  ui.score.textContent = state.score;
  ui.wave.textContent = state.wave;
  if (state.reloading <= 0) ui.ammo.textContent = `${state.ammo}/${MAG_SIZE}`;
  ui.health.style.width = `${(state.health / MAX_HEALTH) * 100}%`;
}

// ---------- Game flow ----------
function resetGame() {
  for (const e of enemies) { scene.remove(e.mesh); e.mesh.material.dispose(); }
  for (const p of projectiles) scene.remove(p.mesh);
  enemies.length = 0;
  projectiles.length = 0;
  Object.assign(state, {
    score: 0, wave: 0, health: MAX_HEALTH, ammo: MAG_SIZE,
    reloading: 0, fireCooldown: 0, enemiesToSpawn: 0, spawnTimer: 0,
  });
  camera.position.set(0, PLAYER_HEIGHT, 0);
  camera.rotation.set(0, 0, 0);
  nextWave();
}

function setPlaying() {
  state.mode = 'playing';
  ui.overlay.classList.add('hidden');
  document.body.classList.add('playing');
}

function showOverlay(subtitleHtml, buttonText) {
  mouseDown = false;
  resetTouch();
  document.body.classList.remove('playing');
  ui.subtitle.innerHTML = subtitleHtml;
  ui.start.textContent = buttonText;
  ui.overlay.classList.remove('hidden');
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  showOverlay('Paused', 'Resume');
}

function gameOver() {
  state.mode = 'over';
  controls.unlock();
  showOverlay(`Game over — you scored <b>${state.score}</b> on wave ${state.wave}.`, 'Play Again');
}

ui.start.addEventListener('click', () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (state.mode === 'menu' || state.mode === 'over') resetGame();

  if (isTouch) {
    // No pointer lock on phones: go fullscreen + landscape where the browser allows it
    const el = document.documentElement;
    const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fs && !document.fullscreenElement) {
      Promise.resolve(fs.call(el))
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    }
    setPlaying();
  } else {
    controls.lock();
  }
});

controls.addEventListener('lock', setPlaying);
controls.addEventListener('unlock', pauseGame);

// Pause if the player switches apps / tabs
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function fitCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  // Wider vertical FOV in portrait so phones don't get a narrow keyhole view
  camera.fov = camera.aspect < 1 ? 95 : 75;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
addEventListener('resize', fitCamera);
fitCamera();
if (isTouch) ui.start.textContent = 'Tap to Play';

// ---------- Main loop ----------
const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();
let bobTime = 0;

function update(dt) {
  // Timers
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  if (state.reloading > 0) {
    state.reloading -= dt;
    gun.rotation.z = Math.sin((1 - state.reloading / RELOAD_TIME) * Math.PI) * 0.6;
    if (state.reloading <= 0) {
      state.reloading = 0;
      state.ammo = MAG_SIZE;
      gun.rotation.z = 0;
      updateHUD();
    }
  }

  if (mouseDown || touch.fireId !== null) shoot();

  // Movement (keyboard + analog joystick)
  const speed = keys.ShiftLeft || keys.ShiftRight ? SPRINT_SPEED : WALK_SPEED;
  moveDir.set(
    (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touch.moveX,
    0,
    (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - touch.moveY
  );
  const moveLen = moveDir.length();
  const moving = moveLen > 0.08;
  if (moving) {
    if (moveLen > 1) moveDir.divideScalar(moveLen);
    controls.moveRight(moveDir.x * speed * dt);
    controls.moveForward(moveDir.z * speed * dt);
    bobTime += dt * speed;
  }
  resolveCollisions(camera.position);
  camera.position.y = PLAYER_HEIGHT + (moving ? Math.sin(bobTime * 1.2) * 0.06 : 0);

  // Gun recoil recovery + sway
  gun.position.lerp(
    new THREE.Vector3(GUN_REST.x, GUN_REST.y + (moving ? Math.sin(bobTime * 1.2) * 0.01 : 0), GUN_REST.z),
    Math.min(1, dt * 14)
  );
  gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 14);
  muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - dt * 400);

  // Spawning
  if (state.enemiesToSpawn > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.enemiesToSpawn--;
      state.spawnTimer = Math.max(0.35, 1.2 - state.wave * 0.08);
    }
  } else if (enemies.length === 0) {
    nextWave();
  }

  // Enemies
  const t = clock.elapsedTime;
  for (const e of enemies) {
    const m = e.mesh;
    const toPlayer = new THREE.Vector3(camera.position.x - m.position.x, 0, camera.position.z - m.position.z);
    const dist = toPlayer.length();
    toPlayer.normalize();

    // Shooters keep their distance; chasers close in
    const desired = e.shooter ? (dist > 14 ? 1 : dist < 9 ? -0.6 : 0) : 1;
    m.position.addScaledVector(toPlayer, e.speed * desired * dt);

    // Simple pillar avoidance
    for (const o of obstacles) {
      const cx = THREE.MathUtils.clamp(m.position.x, o.minX, o.maxX);
      const cz = THREE.MathUtils.clamp(m.position.z, o.minZ, o.maxZ);
      const dx = m.position.x - cx, dz = m.position.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < 1 && d > 0) { m.position.x += (dx / d) * (1 - d); m.position.z += (dz / d) * (1 - d); }
    }

    m.position.y = 1.6 + Math.sin(t * 3 + e.bobOffset) * 0.3;
    m.lookAt(camera.position.x, m.position.y, camera.position.z);
    m.rotation.z += dt * 2;

    // Hit flash
    if (e.flash > 0) {
      e.flash -= dt;
      m.material.emissiveIntensity = 3;
    } else {
      m.material.emissiveIntensity = 0.7;
    }

    // Melee damage
    if (dist < 1.6) damagePlayer(30 * dt);

    // Ranged attack
    if (e.shooter) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 30) {
        enemyShoot(e);
        e.shootTimer = Math.max(1, 2.6 - state.wave * 0.1) + Math.random();
      }
    }
    if (state.mode !== 'playing') return;
  }

  // Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    const pos = p.mesh.position;
    const blocked = obstacles.some((o) =>
      pos.x > o.minX && pos.x < o.maxX && pos.z > o.minZ && pos.z < o.maxZ && pos.y < o.mesh.position.y * 2);
    if (pos.distanceTo(camera.position) < 0.8) {
      damagePlayer(12);
      p.life = 0;
    }
    if (p.life <= 0 || blocked) {
      if (blocked) burst(pos, 0xffaa00, 6);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
    if (state.mode !== 'playing') return;
  }
}

function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    const attr = p.points.geometry.attributes.position;
    for (let j = 0; j < p.vels.length; j++) {
      p.vels[j].y -= 20 * dt;
      attr.array[j * 3] += p.vels[j].x * dt;
      attr.array[j * 3 + 1] = Math.max(0.05, attr.array[j * 3 + 1] + p.vels[j].y * dt);
      attr.array[j * 3 + 2] += p.vels[j].z * dt;
    }
    attr.needsUpdate = true;
    p.points.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) {
      scene.remove(p.points);
      p.points.geometry.dispose();
      p.points.material.dispose();
      particles.splice(i, 1);
    }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.08);
    if (tr.life <= 0) {
      scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'playing') update(dt);
  updateEffects(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
updateHUD();

// Expose for debugging / automated smoke tests
window.__game = { state, enemies, shoot, update, resetGame, touch, camera };
