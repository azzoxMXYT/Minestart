const $ = (id) => document.getElementById(id);
const card = $('game-card'), viewport = $('viewport'), hotbar = $('hotbar');
const play = $('play'), guide = $('guide-dialog'), worldDialog = $('world-dialog');
const eco = $('eco'), seedInput = $('seed-input');
const STORAGE = 'minestart:1';
const safeSeed = (value) => Number.isInteger(value) && value >= 0 && value < 1000000;
const keys = new Set();
const touchKeys = new Set();
const coarse = matchMedia('(pointer: coarse)');
const art = makeArt();
let canvas = $('scene');
let renderer;
let storageOK = true;
let saveTimer = 0;
let toastTimer = 0;
let player, world, selection = 0;
let playing = false, started = false, pointerCaptured = false, drag = null, usingTouch = coarse.matches;
let lastSpace = -Infinity, lockTime = 0;
let frameRequest = 0, lastFrame = 0, forceDraw = true;
let lastPosition = '', renderedPose = [], renderedTarget = '';

function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE));
    return data && safeSeed(data.seed) ? data : {};
  } catch (error) {
    if (error.name !== 'SyntaxError') storageOK = false;
    return {};
  }
}

function showStorage() {
  $('save-status').classList.toggle('is-unavailable', !storageOK);
  $('save-text').textContent = storageOK ? 'Sauvegarde locale' : 'Sauvegarde indisponible';
  $('save-status').title = storageOK ? 'Les constructions sont conservées dans ce navigateur.' : 'Ce navigateur ne permet pas de sauvegarder sur cet appareil.';
}

function persist() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!world || !player || !storageOK) return;
  try {
    const { x, y, z, yaw, pitch, flying } = player;
    localStorage.setItem(STORAGE, JSON.stringify({ seed: world.seed, edits: Array.from(world.edits), player: { x, y, z, yaw, pitch, flying }, selection, eco: eco.checked }));
  } catch {
    storageOK = false;
    showStorage();
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 390);
}

function announce(text, duration = 2100) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}

function restorePlayer(map, saved) {
  if (!saved || !['x', 'y', 'z', 'yaw', 'pitch'].every((id) => Number.isFinite(saved[id]))) return map.spawn();
  const { x, y, z } = saved;
  if (collides(map, playerBox(x, y, z))) return map.spawn();
  return { x, y, z, yaw: saved.yaw % (Math.PI * 2), pitch: clamp(saved.pitch, -1.54, 1.54), vy: 0, grounded: false, flying: renderer.is3D && saved.flying === true };
}

function openWorld(seed, data = {}) {
  world = new World(seed, data.edits);
  player = restorePlayer(world, data.player);
  lastSpace = -Infinity;
  renderer.setWorld(world);
  $('world-name').textContent = worldName(seed);
  $('world-seed').textContent = String(seed).padStart(6, '0');
  lastPosition = '';
  updateUI();
  invalidate();
}

function makeInventory() {
  for (const [i, id] of PALETTE.entries()) {
    const button = document.createElement('button');
    const num = document.createElement('span');
    const img = document.createElement('img');
    const name = BLOCKS[id].name;
    button.type = 'button'; button.className = 'slot';
    button.title = `${i + 1} · ${name}`;
    button.setAttribute('aria-label', `${i + 1} : ${name}`);
    num.className = 'slot-num'; num.textContent = i + 1; num.setAttribute('aria-hidden', 'true');
    img.src = blockIcon(art.tiles, id); img.alt = ''; img.draggable = false;
    button.append(num, img);
    button.addEventListener('click', () => {
      select(i);
      if (playing) canvas.focus({ preventScroll: true });
    });
    hotbar.append(button);
  }
}

function select(i, save = true) {
  selection = (i + PALETTE.length) % PALETTE.length;
  for (const [n, slot] of Array.from(hotbar.children).entries()) slot.setAttribute('aria-pressed', String(n === selection));
  $('block-caption').textContent = BLOCKS[PALETTE[selection]].name;
  if (save) saveSoon();
}

function updateUI() {
  const map = !renderer.is3D;
  card.classList.toggle('is-playing', playing);
  viewport.classList.toggle('drag-look', playing && !map && !pointerCaptured);
  $('ready').classList.toggle('is-playing', playing);
  $('ready-text').textContent = playing ? 'Partie en cours' : started ? 'En pause' : 'Prêt à jouer';
  $('view-label').textContent = map ? 'Vue du monde · 2D' : 'Vue du monde';
  $('game-tag').lastChild.nodeValue = map ? ' VUE 2D' : player?.flying ? ' EN VOL' : ' CRÉATIF';
  viewport.querySelector('.reticle').hidden = map;
  $('pause').hidden = !playing;
  $('touch-controls').hidden = !(playing && usingTouch);
  $('start-layer').hidden = playing;
  $('play-label').textContent = started ? 'Reprendre' : 'Jouer';
  $('play-hint').textContent = map ? 'Vue 2D · Vise les blocs avec le curseur' : started ? 'Retour dans ton monde' : usingTouch ? 'Touche pour entrer dans le monde' : 'Clique pour entrer dans le monde';
  const hint = $('footer-hint');
  if (usingTouch) hint.textContent = map ? 'Touche un bloc pour le viser' : 'Glisse pour regarder';
  else {
    const kbd = document.createElement('kbd'); kbd.textContent = 'Échap';
    hint.replaceChildren(kbd, document.createTextNode(map || (playing && !pointerCaptured) ? ' Mettre en pause' : ' Libérer la souris'));
  }
  $('guide-copy').textContent = map ? 'WebGL est indisponible. En vue 2D, vise un bloc à proximité avec le curseur.' : 'Vise un bloc avec la croix au centre de l’écran. Si la souris n’est pas capturée, glisse sur la vue ou utilise les flèches.';
  for (const id of ['guide-look', 'guide-fly', 'guide-fly-move', 'eco-option']) $(id).hidden = map;
}

function updateCoordinates() {
  const position = [Math.floor(player.x), Math.floor(player.y + .00002), Math.floor(player.z)];
  const stamp = position.join(',');
  if (stamp === lastPosition) return;
  lastPosition = stamp;
  for (const [i, axis] of ['x', 'y', 'z'].entries()) $(`coord-${axis}`).textContent = position[i];
}

function active(...codes) { return codes.some((code) => keys.has(code) || touchKeys.has(code)); }
function directionInputs(dt) {
  const map = !renderer.is3D;
  const left = active('KeyA', 'KeyQ', 'left') || (map && active('ArrowLeft'));
  const right = active('KeyD', 'right') || (map && active('ArrowRight'));
  const forward = active('KeyW', 'KeyZ', 'forward') || (map && active('ArrowUp'));
  const back = active('KeyS', 'back') || (map && active('ArrowDown'));
  if (map) {
    player.yaw = 0;
  } else {
    const turn = Number(active('ArrowRight')) - Number(active('ArrowLeft'));
    const tilt = Number(active('ArrowUp')) - Number(active('ArrowDown'));
    if (turn || tilt) rotate(turn * dt * 1.35, tilt * dt * 1.22);
  }
  const shift = active('ShiftLeft', 'ShiftRight');
  return { side: Number(right) - Number(left), forward: Number(forward) - Number(back), up: active('Space', 'jump'), down: shift, sprint: shift };
}

function invalidate() {
  forceDraw = true;
  if (!frameRequest) frameRequest = requestAnimationFrame(frame);
}

function currentTarget(point) {
  if (!renderer.is3D) return renderer.pick(player, point);
  const eye = [player.x, player.y + EYE, player.z];
  return raycast(world, eye, lookDirection(player));
}

function frame(now) {
  frameRequest = 0;
  const interval = eco.checked || !renderer.is3D ? 31 : 10;
  const elapsed = now - lastFrame;
  if (playing && elapsed < interval && !forceDraw) {
    frameRequest = requestAnimationFrame(frame);
    return;
  }
  lastFrame = now;
  if (playing && elapsed > 0) {
    const dt = Math.min(elapsed / 1000, .09);
    const parts = Math.max(1, Math.ceil(dt / .011));
    const axes = directionInputs(dt);
    for (let i = 0; i < parts; i++) advance(world, player, axes, dt / parts);
  }
  const hit = playing ? currentTarget() : null;
  const pose = [player.x, player.y, player.z, player.yaw, player.pitch];
  const target = hit?.cell.join(',') ?? '';
  // A stationary view does not need to redraw, even with the game unpaused.
  if (forceDraw || target !== renderedTarget || pose.some((v, i) => Math.abs(v - renderedPose[i]) > .0001)) {
    renderer.draw(player, hit, now, eco.checked);
    renderedPose = pose;
    renderedTarget = target;
    updateCoordinates();
  }
  forceDraw = false;
  if (playing && !frameRequest) frameRequest = requestAnimationFrame(frame);
}

function rotate(yaw, pitch) {
  player.yaw = (player.yaw + yaw) % (Math.PI * 2);
  player.pitch = clamp(player.pitch + pitch, -1.54, 1.54);
}

function usingDrag() {
  if (playing && renderer.is3D && !pointerCaptured) {
    updateUI();
    if (!usingTouch) announce('Glisse la souris ou utilise les flèches pour regarder.', 3500);
  }
}

function startGame() {
  if (playing || play.disabled || guide.open || worldDialog.open) return;
  started = true;
  playing = true;
  lastFrame = performance.now();
  lastSpace = -Infinity;
  canvas.focus({ preventScroll: true });
  updateUI();
  invalidate();
  if (!renderer.is3D || usingTouch) return;
  if (!canvas.requestPointerLock) { usingDrag(); return; }
  try {
    const request = canvas.requestPointerLock();
    request?.catch(usingDrag);
  } catch { usingDrag(); }
}

function pauseGame() {
  if (!playing) return;
  playing = false;
  pointerCaptured = false;
  keys.clear(); touchKeys.clear(); drag = null;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  clearTimeout(toastTimer); $('toast').hidden = true;
  updateUI();
  persist();
  invalidate();
}

function editBlock(place, point) {
  if (!playing) return;
  const hit = currentTarget(point);
  if (!hit) { announce('Approche-toi d’un bloc pour le modifier.'); return; }
  const cell = place ? hit.neighbor : hit.cell;
  if (!cell || !inside(...cell)) return;
  const [x,y,z] = cell;
  if (place && (solid(world.get(x,y,z)) || intersectsPlayer(player, x,y,z))) return;
  if (!place && hit.id === ID.BEDROCK) { announce('La roche mère ne peut pas être cassée.'); return; }
  if (!world.set(x,y,z,place ? PALETTE[selection] : ID.AIR)) return;
  renderer.update(x, z);
  saveSoon();
  invalidate();
}

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function connectCanvas() {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pauseGame();
    useMap();
    player.flying = false;
    renderer.setWorld(world);
    updateUI(); invalidate();
    announce('Affichage 3D indisponible. Le jeu continue en 2D.', 4000);
  }, { once: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('click', () => { if (!playing) startGame(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (!playing || e.button > 2 || e.button === 1) return;
    e.preventDefault();
    if (!renderer.is3D) {
      renderer.hover = canvasPoint(e);
      if (e.pointerType !== 'touch') editBlock(e.button === 2, renderer.hover);
      return;
    }
    if (pointerCaptured || e.button === 2) { editBlock(e.button === 2); return; }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0, touch: e.pointerType === 'touch' };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!playing) return;
    if (!renderer.is3D) { renderer.hover = canvasPoint(e); return; }
    if (pointerCaptured || drag?.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.distance += Math.abs(dx) + Math.abs(dy);
    if (drag.distance >= 3) rotate(dx * .0053, -dy * .0053);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag?.id !== e.pointerId) return;
    if (playing && drag.distance < 5 && !drag.touch) editBlock(false);
    drag = null;
  });
  for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { if (!renderer.is3D && !usingTouch) renderer.hover = null; });
}

function useMap() {
  const replacement = canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  canvas = replacement;
  renderer = new MapRenderer(canvas, art);
  connectCanvas();
}

function setFullscreenLabel() {
  const on = document.fullscreenElement === card || card.classList.contains('theater');
  $('fullscreen').setAttribute('aria-pressed', String(on));
  $('fullscreen-label').textContent = on ? 'Quitter le plein écran' : 'Plein écran';
  $('fullscreen-icon').setAttribute('href', on ? '#i-contract' : '#i-expand');
  invalidate();
}

async function toggleFullscreen() {
  if (document.fullscreenElement === card) {
    await document.exitFullscreen().catch(() => {});
  } else if (card.classList.contains('theater')) {
    card.classList.remove('theater');
  } else {
    try {
      if (!card.requestFullscreen) throw new Error();
      await card.requestFullscreen();
    } catch { card.classList.add('theater'); }
  }
  setFullscreenLabel();
  if (playing) canvas.focus({ preventScroll: true });
}

function openDialog(dialog) {
  pauseGame();
  dialog.showModal();
}

function randomSeed() {
  let seed;
  do { seed = Math.floor(Math.random() * 1000000); } while (seed === world.seed || seed === Number(seedInput.value));
  seedInput.value = String(seed).padStart(6, '0');
}

try { renderer = new VoxelRenderer(canvas, art); connectCanvas(); }
catch { useMap(); }
const saved = readSave();
eco.checked = saved.eco === true;
makeInventory();
select(Number.isInteger(saved.selection) && saved.selection >= 0 && saved.selection < PALETTE.length ? saved.selection : 0, false);
openWorld(saved.seed ?? DEFAULT_SEED, saved);
showStorage();
play.disabled = false;
if (location.protocol === 'file:') $('download').href = location.href.split('#')[0];

play.addEventListener('click', startGame);
$('pause').addEventListener('click', pauseGame);
$('fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', setFullscreenLabel);
$('open-guide').addEventListener('click', () => openDialog(guide));
$('new-world').addEventListener('click', () => { randomSeed(); openDialog(worldDialog); });
$('cancel-world').addEventListener('click', () => worldDialog.close());
$('random-seed').addEventListener('click', randomSeed);
$('world-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = Number(seedInput.value);
  if (!/^[0-9]{1,6}$/.test(seedInput.value) || !safeSeed(value)) return;
  worldDialog.close();
  started = false;
  openWorld(value);
  persist();
  announce('Ton nouveau monde est prêt.');
});
eco.addEventListener('change', () => { persist(); invalidate(); });

window.addEventListener('keydown', (e) => {
  if (guide.open || worldDialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (playing) { e.preventDefault(); pauseGame(); }
    else if (card.classList.contains('theater')) toggleFullscreen();
    return;
  }
  if (!playing) return;
  const code = keyboardCode(e);
  if (/^(Digit|Numpad)[1-8]$/.test(code) || /^[1-8]$/.test(e.key)) {
    e.preventDefault(); select(Number(/^[1-8]$/.test(e.key) ? e.key : code.at(-1)) - 1); return;
  }
  if (!/^(Key[WZQASD]|Arrow(Left|Up|Down|Right)|Space|Shift(Left|Right))$/.test(code)) return;
  e.preventDefault();
  keys.add(code);
  if (code === 'Space' && !e.repeat && renderer.is3D) {
    if (performance.now() - lastSpace < 285) {
      player.flying = !player.flying;
      player.vy = 0;
      lastSpace = -Infinity;
      updateUI();
      announce(player.flying ? 'Vol activé · Espace pour monter, Maj pour descendre' : 'Vol désactivé');
    } else lastSpace = performance.now();
  }
});
window.addEventListener('keyup', (e) => keys.delete(keyboardCode(e)));
function keyboardCode(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  if (/^[wzqasd]$/i.test(e.key)) return `Key${e.key.toUpperCase()}`;
  return e.key === ' ' ? 'Space' : e.key === 'Shift' ? 'ShiftLeft' : e.key;
}

document.addEventListener('pointerlockchange', () => {
  const captured = document.pointerLockElement === canvas;
  if (!captured && pointerCaptured) { pauseGame(); return; }
  pointerCaptured = captured;
  if (captured) lockTime = performance.now();
  updateUI();
});
document.addEventListener('pointerlockerror', usingDrag);
document.addEventListener('mousemove', (e) => {
  if (!playing || !pointerCaptured || !renderer.is3D) return;
  const { movementX: dx, movementY: dy } = e;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  // Browsers can report the cursor's jump on entering pointer lock as mouse motion.
  const jump = Math.max(Math.abs(dx), Math.abs(dy));
  if (jump > 300 || (jump > 65 && performance.now() - lockTime < 42)) return;
  rotate(clamp(dx, -130, 130) * .0026, -clamp(dy, -130, 130) * .0026);
});
viewport.addEventListener('wheel', (e) => {
  if (playing && !e.ctrlKey && e.deltaY) { e.preventDefault(); select(selection + Math.sign(e.deltaY)); }
}, { passive: false });

viewport.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !usingTouch) { usingTouch = true; updateUI(); }
});
for (const button of viewport.querySelectorAll('[data-move], [data-act="jump"]')) {
  const move = button.dataset.move || 'jump';
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault(); button.setPointerCapture?.(e.pointerId); touchKeys.add(move);
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => touchKeys.delete(move));
}
for (const button of viewport.querySelectorAll('[data-act="break"], [data-act="place"]')) {
  button.addEventListener('click', () => editBlock(button.dataset.act === 'place'));
}

window.addEventListener('blur', () => { keys.clear(); touchKeys.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('pagehide', persist);
if (window.ResizeObserver) new ResizeObserver(invalidate).observe(viewport);
else window.addEventListener('resize', invalidate);
