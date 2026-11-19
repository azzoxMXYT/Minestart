const $ = (id) => document.getElementById(id);
const card = $('game-card'), viewport = $('viewport'), hotbar = $('hotbar');
const play = $('play'), guide = $('guide-dialog'), worldDialog = $('world-dialog');
const eco = $('eco'), showFps = $('show-fps'), seedInput = $('seed-input');
const settingsDialog = $('settings-dialog'), inventoryDialog = $('inventory-dialog'), installDialog = $('install-dialog');
const dialogs = [inventoryDialog, settingsDialog, guide, worldDialog, installDialog].filter(Boolean);
const activeDialog = () => dialogs.find((dialog) => dialog.open);
const fpsMeter = $('fps-meter'), fpsValue = $('fps-value'), frameRate = new FrameRate();
const appEdition = document.documentElement.dataset.edition;
const STORAGE = 'minestart:2', LEGACY_STORAGE = 'minestart:1';
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
let player, world, survival, selection = 0, hotSlots = [...PALETTE];
let mode = GAME_MODE.CREATIVE, savedWorlds = {};
let miningPointer = null, mineKey = '', mineWork = 0;
let lastVitals = '', lastClock = '', lastLight = -1, lastWorldDraw = 0, lastCheckpoint = 0;
let playing = false, started = false, pointerCaptured = false, drag = null, usingTouch = coarse.matches || appEdition === 'android';
let lastSpace = -Infinity, lockTime = 0;
let frameRequest = 0, lastFrame = 0, forceDraw = true;
let lastPosition = '', renderedPose = [], renderedTarget = '';

function fromStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch (error) {
    if (error.name !== 'SyntaxError') storageOK = false;
    return null;
  }
}

function readSave() {
  const data = fromStorage(STORAGE);
  if (data && typeof data.worlds === 'object' && data.worlds) {
    const worlds = {};
    for (const name of Object.values(GAME_MODE)) if (safeSeed(data.worlds[name]?.seed)) worlds[name] = data.worlds[name];
    return { mode: data.mode === GAME_MODE.SURVIVAL ? GAME_MODE.SURVIVAL : GAME_MODE.CREATIVE, worlds, eco: data.eco, showFps: data.showFps };
  }
  const old = storageOK ? fromStorage(LEGACY_STORAGE) : null;
  if (old && safeSeed(old.seed)) return { mode: GAME_MODE.CREATIVE, worlds: { creative: { ...old, generation: 1 } }, eco: old.eco };
  return { mode: GAME_MODE.CREATIVE, worlds: {} };
}

function showStorage() {
  $('save-status').classList.toggle('is-unavailable', !storageOK);
  $('save-text').textContent = storageOK ? 'Sauvegarde locale' : 'Sauvegarde indisponible';
  $('save-status').title = storageOK ? 'Chaque mode a sa propre sauvegarde sur cet appareil.' : 'Ce navigateur ne permet pas de sauvegarder sur cet appareil.';
}

function persist() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!world || !player) return;
  const { x, y, z, yaw, pitch, flying } = player;
  savedWorlds[mode] = { seed: world.seed, generation: world.generation, edits: Array.from(world.edits), player: { x, y, z, yaw, pitch, flying }, selection, hotbar: [...hotSlots], survival: survival?.snapshot() };
  if (!storageOK) return;
  try { localStorage.setItem(STORAGE, JSON.stringify({ mode, worlds: savedWorlds, eco: eco.checked, showFps: showFps.checked }));
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
  return { x, y, z, yaw: saved.yaw % (Math.PI * 2), pitch: clamp(saved.pitch, -1.54, 1.54), vy: 0, grounded: false, flying: !survival && renderer.is3D && saved.flying === true };
}

function openWorld(seed, data = {}) {
  world = new World(seed, data.edits, data.generation === 1 && mode === GAME_MODE.CREATIVE ? 1 : WORLD_GENERATION);
  survival = mode === GAME_MODE.SURVIVAL ? new Survival(data.survival) : null;
  player = restorePlayer(world, data.player);
  hotSlots = Array.isArray(data.hotbar) && data.hotbar.length === SLOT_COUNT
    ? data.hotbar.map((id) => CATALOGUE.includes(id) ? id : ID.AIR)
    : survival ? Array(SLOT_COUNT).fill(ID.AIR) : [...PALETTE];
  if (!survival) hotSlots = hotSlots.map((id, i) => id || PALETTE[i]);
  selection = Number.isInteger(data.selection) && data.selection >= 0 && data.selection < SLOT_COUNT ? data.selection : 0;
  lastSpace = -Infinity;
  lastCheckpoint = survival?.clock ?? 0;
  renderer.setWorld(world);
  $('world-name').textContent = worldName(seed);
  $('world-seed').textContent = String(seed).padStart(6, '0');
  lastPosition = lastVitals = lastClock = '';
  lastLight = -1;
  endMining();
  refreshHotbar();
  updateUI();
  invalidate();
}

function changeMode(next) {
  if (mode === next || !Object.values(GAME_MODE).includes(next)) return;
  pauseGame();
  persist();
  mode = next;
  started = false;
  const saved = savedWorlds[mode];
  openWorld(saved?.seed ?? DEFAULT_SEED, saved);
  persist();
}

function makeVitals() {
  for (const [id, symbol] of [['health', 'heart'], ['food', 'food']]) {
    for (let i = 0; i < 10; i++) {
      const unit = document.createElement('span');
      unit.className = 'vital-unit'; unit.setAttribute('aria-hidden', 'true');
      unit.innerHTML = `<svg class="empty-vital"><use href="#i-${symbol}-pixel"/></svg><svg class="fill-vital"><use href="#i-${symbol}-pixel"/></svg>`;
      $(id).append(unit);
    }
  }
}

function updateVitals() {
  if (!survival) return;
  const health = Math.ceil(survival.health), food = Math.ceil(survival.food), air = Math.ceil(survival.air);
  const stamp = `${health}:${food}:${Math.floor(survival.air * 10)}`;
  if (lastVitals !== stamp) {
    for (const [id, label, value] of [['health', 'Vie', health], ['food', 'Nourriture', food]]) {
      $(id).setAttribute('aria-label', `${label} : ${value} sur 20`);
      $(id).title = `${label} : ${value}/20`;
      for (let i = 0; i < 10; i++) $(id).children[i].style.setProperty('--cutoff', `${100 - clamp(value - i*2, 0, 2)*50}%`);
    }
    $('air-meter').hidden = survival.air >= MAX_AIR;
    $('air-meter').setAttribute('aria-valuenow', air);
    $('air-meter').style.setProperty('--percent', `${survival.air * 100 / MAX_AIR}%`);
    lastVitals = stamp;
  }
  const time = clockLabel(survival.clock);
  if (time !== lastClock) {
    $('clock-text').textContent = time;
    $('clock-icon').setAttribute('href', survival.night ? '#i-moon' : '#i-sun');
    $('world-clock').classList.toggle('is-night', survival.night);
    lastClock = time;
  }
}

function updateUI() {
  const map = !renderer.is3D, dead = survival?.dead;
  document.documentElement.classList.toggle('is-touch', usingTouch);
  document.documentElement.classList.toggle('touch-play', started && usingTouch);
  viewport.classList.toggle('is-survival', Boolean(survival));
  viewport.classList.toggle('is-dead', Boolean(dead));
  $('vitals').hidden = !survival;
  $('world-clock').hidden = !survival;
  updateVitals();
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('world-mode').textContent = survival ? 'Survie' : 'Créatif';
  $('mode-help').textContent = survival ? 'Récolte, fabrique et tiens jusqu’à l’aube.' : 'Blocs illimités, construction libre.';
  $('mine-command').textContent = survival ? 'Maintenir gauche' : 'Clic gauche';
  $('guide-mine').textContent = survival ? 'Maintenir clic gauche / clic droit' : 'Clic gauche / droit';
  $('guide-berries').hidden = $('guide-eat').hidden = !survival;
  card.classList.toggle('is-playing', playing);
  viewport.classList.toggle('drag-look', playing && !map && !pointerCaptured);
  $('ready').classList.toggle('is-playing', playing);
  $('ready-text').textContent = dead ? 'À réapparaître' : playing ? 'Partie en cours' : started ? 'En pause' : 'Prêt à jouer';
  $('view-label').textContent = map ? 'Vue du monde · 2D' : 'Vue du monde';
  $('game-mode').textContent = `${survival ? 'SURVIE' : player?.flying ? 'EN VOL' : 'CRÉATIF'}${map ? ' · 2D' : ''}`;
  canvas.tabIndex = playing ? 0 : -1;
  viewport.querySelector('.reticle').hidden = map || !playing;
  fpsMeter.hidden = !playing || !showFps.checked;
  $('pause').hidden = !playing;
  $('touch-controls').hidden = !(playing && usingTouch);
  $('touch-fly').hidden = !(playing && usingTouch && !map && !survival);
  $('touch-fly').setAttribute('aria-pressed', String(Boolean(player?.flying)));
  $('touch-eat').hidden = !(playing && usingTouch && survival);
  const jump = viewport.querySelector('[data-act="jump"]');
  jump.querySelector('span').textContent = player?.flying ? 'Haut' : 'Saut';
  jump.setAttribute('aria-label', player?.flying ? 'Monter' : 'Sauter');
  viewport.querySelector('[data-act="down"]').hidden = !player?.flying;
  $('guide-touch-fly').hidden = map || Boolean(survival);
  $('guide-touch-food').hidden = !survival;
  $('guide-touch-mine').textContent = survival ? 'Maintiens Miner / touche Poser' : 'Boutons Miner / Poser';
  updateMenu(dead);
  $('settings-renderer').textContent = map ? 'VUE 2D' : 'VUE 3D';
  const hint = $('footer-hint');
  if (!playing) hint.textContent = 'Menu du jeu';
  else if (usingTouch) hint.textContent = map ? 'Touche un bloc pour le viser' : 'Glisse pour regarder';
  else {
    const kbd = document.createElement('kbd'); kbd.textContent = 'Échap';
    hint.replaceChildren(kbd, document.createTextNode(' Menu de pause'));
  }
  $('guide-copy').textContent = usingTouch
    ? map ? 'En vue 2D, touche un bloc à proximité pour le viser.' : 'Glisse un doigt sur le paysage pour regarder. La croix au centre indique le bloc visé.'
    : map ? 'WebGL est indisponible. En vue 2D, vise un bloc à proximité avec le curseur.' : 'Vise un bloc avec la croix au centre de l’écran. Si la souris n’est pas capturée, glisse sur la vue ou utilise les flèches.';
  for (const id of ['guide-look', 'eco-option']) $(id).hidden = map;
  for (const id of ['guide-fly', 'guide-fly-move']) $(id).hidden = map || Boolean(survival);
}

function updateMenu(dead) {
  $('start-layer').hidden = playing;
  $('menu-kicker').textContent = started ? 'MINESTART · PARTIE LOCALE' : 'MINESTART · ACCUEIL';
  $('menu-title').textContent = !started ? 'Menu principal' : dead ? 'Partie terminée' : 'Partie en pause';
  $('menu-modes').hidden = started;
  $('new-world').hidden = started;
  $('menu-home').hidden = !started;
  $('play-label').textContent = dead ? 'Réapparaître' : started ? 'Reprendre' : 'Jouer';
  $('play-hint').textContent = dead ? `${survival.why || 'Tu as perdu ta vie.'} Ton sac est conservé.`
    : `${worldName(world.seed)} · ${started ? (survival ? 'Survie' : 'Créatif') : (survival ? 'Récolte et survis à la nuit.' : 'Construis sans limite.')}`;
}

function resetFps() {
  frameRate.reset();
  fpsValue.textContent = '–';
  fpsMeter.classList.remove('is-slow');
  fpsMeter.hidden = !playing || !showFps.checked;
}

function updateFps(now) {
  const value = frameRate.tick(now);
  if (value === null) return;
  if (fpsValue.textContent !== String(value)) fpsValue.textContent = value;
  fpsMeter.classList.toggle('is-slow', value < 24);
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
  return { side: Number(right) - Number(left), forward: Number(forward) - Number(back), up: active('Space', 'jump'), down: shift || active('down'), sprint: shift && (!survival || survival.food >= 3) };
}

function invalidate() {
  forceDraw = true;
  if (!frameRequest) frameRequest = requestAnimationFrame(frame);
}

function currentTarget(point, includeMobs = true) {
  const reach = survival ? SURVIVAL_REACH : REACH;
  if (!renderer.is3D) {
    const cursor = point ?? renderer.hover;
    if (survival && cursor && includeMobs) {
      const { ox, oz, tile } = renderer.layout(player);
      const [x, z] = [(cursor[0] - ox) / tile, (cursor[1] - oz) / tile];
      const mob = survival.mobs.find((m) => Math.hypot(m.x - x, m.z - z) <= .55 && Math.hypot(m.x - player.x, m.z - player.z) <= 3.5);
      if (mob) return { mob };
    }
    return renderer.pick(player, cursor, reach);
  }
  const eye = [player.x, player.y + EYE, player.z], direction = lookDirection(player);
  const block = raycast(world, eye, direction, reach);
  if (survival && includeMobs) {
    let closest = Math.min(3.5, block?.distance ?? 3.5), aimed = null;
    for (const mob of survival.mobs) {
      const d = rayBox(eye, direction, slimeBox(mob.x, mob.y, mob.z), closest);
      if (d < closest) { closest = d; aimed = mob; }
    }
    if (aimed) return { mob: aimed };
  }
  return block;
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
  let dt = 0;
  if (playing && elapsed > 0) {
    dt = Math.min(elapsed / 1000, .09);
    const parts = Math.max(1, Math.ceil(dt / .011));
    const axes = directionInputs(dt);
    for (let i = 0; i < parts; i++) advance(world, player, axes, dt / parts);
    if (survival) {
      const previous = survival.damageCount;
      survival.step(world, player, axes, dt, updateTerrain);
      updateVitals();
      if (survival.damageCount !== previous) {
        const flash = $('damage-flash');
        flash.classList.remove('is-hit'); void flash.offsetWidth; flash.classList.add('is-hit');
        if (survival.dead) pauseGame();
        else { announce(survival.why); saveSoon(); }
      }
      if (survival.clock - lastCheckpoint >= 12) { lastCheckpoint = survival.clock; persist(); }
    }
  }
  const hit = playing ? currentTarget() : null;
  if (playing && survival && miningPointer !== null) dig(hit, dt);
  viewport.classList.toggle('aimed-mob', Boolean(hit?.mob));
  const pose = [player.x, player.y, player.z, player.yaw, player.pitch];
  const target = hit?.cell?.join(',') ?? hit?.mob?.id ?? '';
  const light = survival ? Math.round(daylightAt(survival.clock) * 100) : 100;
  const animated = playing && survival?.mobs.length && now - lastWorldDraw > (eco.checked || !renderer.is3D ? 80 : 64);
  // Stay idle while the camera, weather and creatures are still.
  if (forceDraw || animated || light !== lastLight || target !== renderedTarget || pose.some((v, i) => Math.abs(v - renderedPose[i]) > .0001)) {
    renderer.draw(player, hit, now, eco.checked, survival);
    renderedPose = pose;
    renderedTarget = target;
    lastLight = light;
    lastWorldDraw = now;
    updateCoordinates();
  }
  forceDraw = false;
  if (playing && showFps.checked) updateFps(now);
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
  if (playing || play.disabled || activeDialog()) return;
  if (survival?.dead) {
    survival.respawn(); player = world.spawn(); lastVitals = '';
    persist();
  }
  started = true;
  playing = true;
  lastFrame = performance.now();
  lastSpace = -Infinity;
  resetFps();
  updateUI();
  canvas.focus({ preventScroll: true });
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
  resetFps();
  keys.clear(); touchKeys.clear(); drag = null; endMining();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  clearTimeout(toastTimer); $('toast').hidden = true;
  updateUI();
  if (!document.hidden) play.focus({ preventScroll: true });
  persist();
  invalidate();
}

function returnToMenu() {
  started = false;
  if (playing) pauseGame();
  else { updateUI(); persist(); invalidate(); }
  if (document.fullscreenElement === card || card.classList.contains('theater')) toggleFullscreen();
  play.focus({ preventScroll: true });
}

function updateTerrain(x, z) {
  renderer.update(x, z);
  saveSoon();
  invalidate();
}

function editBlock(place, point) {
  if (!playing) return;
  const hit = currentTarget(point, false);
  if (!hit) { announce('Approche-toi d’un bloc pour le modifier.'); return; }
  if (place && survival && hit.id === ID.BERRY_BUSH) {
    const got = survival.harvest(world, hit.cell);
    if (got) {
      announce(`+${got} baie${got === 1 ? '' : 's'} · ${usingTouch ? 'Icône baie' : 'F'} pour manger`);
      updateTerrain(hit.cell[0], hit.cell[2]);
    } else announce('Tu ne peux pas ramasser plus de baies.');
    return;
  }
  const cell = place ? hit.neighbor : hit.cell;
  if (!cell || !inside(...cell)) return;
  const [x,y,z] = cell;
  const id = place ? hotSlots[selection] : ID.AIR;
  if (place) {
    if (!id || (survival && !survival.count(id))) { announce('Ton emplacement est vide. Récolte des blocs ou ouvre l’inventaire (E).'); return; }
    if (solid(world.get(x,y,z)) || intersectsPlayer(player,x,y,z)) return;
    if (isPlant(id) && !solid(world.get(x,y-1,z))) { announce('Pose cette décoration sur un bloc solide.'); return; }
  }
  if (!place && hit.id === ID.BEDROCK) { announce('La roche mère ne peut pas être cassée.'); return; }
  if (!world.set(x,y,z,id)) return;
  if (place && survival) { survival.spend(id); refreshHotbar(); }
  updateTerrain(x,z);
}

function endMining() {
  miningPointer = null;
  mineKey = ''; mineWork = 0;
  $('mine-meter').hidden = true;
}

function beginBreak(pointer, point) {
  if (!playing) return;
  if (!survival) { editBlock(false, point); return; }
  endMining();
  const target = currentTarget(point);
  if (target?.mob) {
    const message = survival.strike(target.mob);
    if (message) { announce(message); saveSoon(); invalidate(); }
    return;
  }
  if (!target) announce('Approche-toi et vise un bloc.');
  miningPointer = pointer;
}

function dig(hit, dt) {
  const key = hit?.cell ? `${hit.cell.join(',')}:${hit.id}` : '';
  const meter = $('mine-meter');
  const fresh = key !== mineKey;
  if (fresh) { mineKey = key; mineWork = 0; }
  if (!key) { meter.hidden = true; return; }
  const rule = mineRule(hit.id, survival.tool);
  if (!rule.seconds) {
    meter.hidden = true;
    if (fresh) announce(rule.hint);
    return;
  }
  mineWork += dt;
  meter.hidden = false;
  meter.style.setProperty('--percent', `${clamp(mineWork / rule.seconds,0,1)*100}%`);
  if (mineWork < rule.seconds) return;
  if (world.set(...hit.cell, ID.AIR)) {
    const id = blockDrop(hit.id);
    const qty = survival.add(id);
    if (qty) {
      addToHotbar(id);
      announce(`${ITEMS[id].name} +${qty}`, 1150);
    }
    survival.food = Math.max(0, survival.food - .10);
    refreshHotbar();
    updateTerrain(hit.cell[0], hit.cell[2]);
  }
  mineWork = 0; mineKey = ''; meter.hidden = true;
}

function eatBerries() {
  if (!survival) return;
  const ok = survival.eat();
  const missing = usingTouch ? 'Vise un buisson et touche Poser pour récolter des baies.' : 'Récolte des baies avec un clic droit sur un buisson.';
  const text = ok ? 'Tu as mangé une baie · +5 nourriture' : survival.count(IT.BERRIES) ? 'Tu n’as pas faim.' : missing;
  if (inventoryDialog.open) { refreshInventory(); inventoryMessage(text); }
  else announce(text);
  if (ok) { updateVitals(); saveSoon(); }
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
  canvas.addEventListener('pointerdown', (e) => {
    if (!playing || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    if (!renderer.is3D) {
      renderer.hover = canvasPoint(e);
      if (e.pointerType !== 'touch') {
        if (e.button === 2) editBlock(true, renderer.hover);
        else beginBreak(e.pointerId, renderer.hover);
      }
      return;
    }
    if (e.button === 2) { editBlock(true); return; }
    if (pointerCaptured) { beginBreak(e.pointerId); return; }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0, touch: e.pointerType === 'touch' };
    canvas.setPointerCapture?.(e.pointerId);
    if (survival && !drag.touch) beginBreak(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!playing) return;
    if (!renderer.is3D) { renderer.hover = canvasPoint(e); return; }
    if (pointerCaptured || drag?.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.distance += Math.abs(dx) + Math.abs(dy);
    if (drag.distance >= 4) {
      if (miningPointer === e.pointerId) endMining();
      rotate(dx * .0053, -dy * .0053);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag?.id !== e.pointerId) return;
    if (playing && !survival && drag.distance < 5 && !drag.touch) editBlock(false);
    drag = null;
  });
  for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, (e) => {
    if (miningPointer === e.pointerId) endMining();
    if (drag?.id === e.pointerId) drag = null;
  });
  canvas.addEventListener('pointerleave', () => {
    if (!renderer.is3D && !usingTouch) { renderer.hover = null; if (miningPointer !== null) endMining(); }
  });
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
  const label = on ? 'Quitter le plein écran' : 'Plein écran';
  $('fullscreen-label').textContent = label;
  $('fullscreen').setAttribute('aria-label', label);
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
  if (activeDialog()) return;
  pauseGame();
  dialog.showModal();
}

function openInventory() {
  if (activeDialog()) return;
  inventoryTab = 'blocks';
  $('block-search').value = '';
  inventoryMessage('');
  refreshInventory();
  openDialog(inventoryDialog);
}

function randomSeed() {
  let seed;
  do { seed = Math.floor(Math.random() * 1000000); } while (seed === world.seed || seed === Number(seedInput.value));
  seedInput.value = String(seed).padStart(6, '0');
}

try { renderer = new VoxelRenderer(canvas, art); connectCanvas(); }
catch { useMap(); }
const saved = readSave();
eco.checked = typeof saved.eco === 'boolean' ? saved.eco : usingTouch;
showFps.checked = saved.showFps !== false;
mode = saved.mode;
savedWorlds = saved.worlds;
makeInventory();
makeVitals();
const initial = savedWorlds[mode];
openWorld(initial?.seed ?? DEFAULT_SEED, initial);
showStorage();
play.disabled = false;
if (location.protocol === 'file:' && $('download')) $('download').href = location.href.split('#')[0];

play.addEventListener('click', startGame);
$('pause').addEventListener('click', pauseGame);
$('menu-home').addEventListener('click', returnToMenu);
$('open-settings').addEventListener('click', () => openDialog(settingsDialog));
$('menu-guide').addEventListener('click', () => openDialog(guide));
$('fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', setFullscreenLabel);
$('open-guide').addEventListener('click', () => openDialog(guide));
$('open-inventory').addEventListener('click', openInventory);
$('block-search').addEventListener('input', refreshInventory);
$('eat').addEventListener('click', eatBerries);
$('touch-eat').addEventListener('click', eatBerries);
$('touch-fly').addEventListener('click', toggleFlight);
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => changeMode(button.dataset.mode));
for (const button of $('inventory-tabs').querySelectorAll('button')) button.addEventListener('click', () => {
  inventoryTab = button.dataset.tab;
  refreshInventory();
});
$('new-world').addEventListener('click', () => {
  $('world-warning').textContent = `Ce nouveau monde remplacera uniquement la partie ${survival ? 'Survie' : 'Créatif'} et ses constructions.`;
  randomSeed(); openDialog(worldDialog);
});
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
eco.addEventListener('change', () => { resetFps(); persist(); invalidate(); });
showFps.addEventListener('change', () => { resetFps(); persist(); });

window.addEventListener('keydown', (e) => {
  const dialog = activeDialog();
  if ((dialog && dialog !== inventoryDialog) || e.ctrlKey || e.metaKey || e.altKey) return;
  const code = keyboardCode(e);
  const writing = e.target instanceof HTMLInputElement || e.target.isContentEditable;
  if (!writing && !e.repeat && code === 'KeyE') {
    e.preventDefault();
    if (inventoryDialog.open) inventoryDialog.close(); else openInventory();
    return;
  }
  if (!writing && !e.repeat && code === 'KeyF' && survival && !survival.dead && (playing || inventoryDialog.open)) {
    e.preventDefault(); eatBerries(); return;
  }
  if (inventoryDialog.open) return;
  if (e.key === 'Escape') {
    if (playing) { e.preventDefault(); pauseGame(); }
    else if (card.classList.contains('theater')) toggleFullscreen();
    return;
  }
  if (!playing) return;
  if (code === 'F3') {
    e.preventDefault();
    if (!e.repeat) {
      showFps.checked = !showFps.checked;
      resetFps(); saveSoon();
      announce(showFps.checked ? 'Compteur de FPS affiché' : 'Compteur de FPS masqué');
    }
    return;
  }
  if (/^(Digit|Numpad)[1-8]$/.test(code) || /^[1-8]$/.test(e.key)) {
    e.preventDefault(); select(Number(/^[1-8]$/.test(e.key) ? e.key : code.at(-1)) - 1); return;
  }
  if (!/^(Key[WZQASD]|Arrow(Left|Up|Down|Right)|Space|Shift(Left|Right))$/.test(code)) return;
  e.preventDefault();
  keys.add(code);
  if (code === 'Space' && !e.repeat && renderer.is3D && !survival) {
    if (performance.now() - lastSpace < 285) {
      toggleFlight();
      lastSpace = -Infinity;
    } else lastSpace = performance.now();
  }
});
function toggleFlight() {
  if (!playing || survival || !renderer.is3D) return;
  player.flying = !player.flying;
  player.vy = 0;
  updateUI();
  announce(player.flying ? (usingTouch ? 'Vol activé · Haut / Bas' : 'Vol activé · Espace pour monter, Maj pour descendre') : 'Vol désactivé');
  saveSoon();
}
window.addEventListener('keyup', (e) => keys.delete(keyboardCode(e)));
function keyboardCode(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  if (/^[wzqasdef]$/i.test(e.key)) return `Key${e.key.toUpperCase()}`;
  return e.key === ' ' ? 'Space' : e.key === 'Shift' ? 'ShiftLeft' : e.key;
}

document.addEventListener('pointerlockchange', () => {
  const captured = document.pointerLockElement === canvas;
  if (captured && !playing) { document.exitPointerLock(); return; }
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
  if (e.pointerType === 'touch' && !usingTouch) { usingTouch = true; updateUI(); invalidate(); }
});
for (const button of viewport.querySelectorAll('[data-move], [data-act="jump"], [data-act="down"]')) {
  const move = button.dataset.move || button.dataset.act;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault(); button.setPointerCapture?.(e.pointerId); touchKeys.add(move);
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => touchKeys.delete(move));
}
const touchBreak = viewport.querySelector('[data-act="break"]');
touchBreak.addEventListener('pointerdown', (e) => {
  if (!survival) return;
  e.preventDefault();
  touchBreak.setPointerCapture?.(e.pointerId);
  beginBreak(e.pointerId);
});
touchBreak.addEventListener('lostpointercapture', (e) => { if (e.pointerId === miningPointer) endMining(); });
touchBreak.addEventListener('click', () => { if (!survival) editBlock(false); });
viewport.querySelector('[data-act="place"]').addEventListener('click', () => editBlock(true));
for (const event of ['pointerup', 'pointercancel']) window.addEventListener(event, (e) => {
  if (e.pointerId === miningPointer && (event === 'pointercancel' || e.button === 0)) endMining();
});

window.addEventListener('blur', () => { keys.clear(); touchKeys.clear(); endMining(); });
function suspendGame() { if (playing) pauseGame(); else persist(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendGame(); });
window.addEventListener('minestart:pause', suspendGame);
window.addEventListener('minestart:back', (event) => {
  const dialog = activeDialog();
  if (dialog) { dialog.close(); event.preventDefault(); }
  else if (playing) { pauseGame(); event.preventDefault(); }
  else if (started) { returnToMenu(); event.preventDefault(); }
});
window.addEventListener('pagehide', persist);
if (window.ResizeObserver) new ResizeObserver(invalidate).observe(viewport);
else window.addEventListener('resize', invalidate);
