const SLOT_COUNT = PALETTE.length;
const cachedIcons = new Map();
const inventoryCards = new Map();
const recipeButtons = [];
let inventoryTab = 'blocks';

function iconURL(id) {
  if (!cachedIcons.has(id)) cachedIcons.set(id, resourceIcon(art.tiles, id));
  return cachedIcons.get(id);
}

function iconImage(id) {
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  if (id) img.src = iconURL(id);
  return img;
}

function makeInventory() {
  for (let i = 0; i < SLOT_COUNT; i++) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'slot';
    const num = document.createElement('span');
    num.className = 'slot-num'; num.textContent = i + 1; num.setAttribute('aria-hidden', 'true');
    const count = document.createElement('span');
    count.className = 'slot-count'; count.hidden = true; count.setAttribute('aria-hidden', 'true');
    button.append(num, iconImage(0), count);
    button.addEventListener('click', () => {
      select(i);
      if (playing) canvas.focus({ preventScroll: true });
    });
    hotbar.append(button);
  }
  for (const id of [...CATALOGUE, IT.BERRIES, IT.COAL, IT.WOOD_PICK, IT.STONE_PICK]) {
    const placeable = CATALOGUE.includes(id);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'catalogue-item'; button.disabled = !placeable;
    const label = document.createElement('span'); label.textContent = ITEMS[id].name;
    const count = document.createElement('span'); count.className = 'slot-count'; count.hidden = true;
    button.append(iconImage(id), label, count);
    if (placeable) button.addEventListener('click', () => equip(id));
    inventoryCards.set(id, { button, count, placeable });
    $('catalogue-grid').append(button);
  }
  for (const recipe of RECIPES) {
    const [id, count] = recipe.out;
    const row = document.createElement('div'); row.className = 'recipe-row';
    const desc = document.createElement('div');
    const label = document.createElement('strong'); label.textContent = `${ITEMS[id].name}${count > 1 ? ` ×${count}` : ''}`;
    const requirements = document.createElement('p');
    requirements.textContent = recipe.using.map(([ids, amount]) => `${amount} × ${Array.isArray(ids) ? 'planches (tout bois)' : ITEMS[ids].name.toLowerCase()}`).join(' + ');
    desc.append(label, requirements);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button';
    button.addEventListener('click', () => {
      if (!survival?.craft(recipe)) return;
      addToHotbar(id);
      refreshHotbar(); refreshInventory();
      inventoryMessage(`${ITEMS[id].name}${count > 1 ? ` ×${count}` : ''} fabriqué${count > 1 ? 's' : ''}.`);
      saveSoon();
    });
    recipeButtons.push({ recipe, button });
    row.append(iconImage(id), desc, button); $('recipe-list').append(row);
  }
}

function refreshHotbar() {
  for (const [i, slot] of Array.from(hotbar.children).entries()) {
    const id = hotSlots[i], name = id ? ITEMS[id].name : 'Emplacement vide';
    const qty = survival?.count(id) ?? null;
    const img = slot.children[1], count = slot.children[2];
    if (id && img.getAttribute('src') !== iconURL(id)) img.src = iconURL(id);
    img.hidden = !id;
    const empty = !id || qty === 0;
    count.hidden = !id || qty === null;
    if (qty !== null) count.textContent = qty;
    slot.classList.toggle('is-empty', empty);
    slot.title = `${i + 1} · ${name}${qty !== null && id ? ` (${qty})` : ''}`;
    slot.setAttribute('aria-label', slot.title);
    slot.setAttribute('aria-pressed', String(i === selection));
  }
  const selected = hotSlots[selection];
  $('block-caption').textContent = selected ? ITEMS[selected].name : survival?.tool ? ITEMS[survival.tool].name : 'Mains nues';
  $('active-slot').textContent = `Emplacement ${selection + 1} sur ${SLOT_COUNT}`;
}

function select(i, save = true) {
  selection = (i + SLOT_COUNT) % SLOT_COUNT;
  refreshHotbar();
  if (save) saveSoon();
}

function addToHotbar(id) {
  if (!CATALOGUE.includes(id) || hotSlots.includes(id)) return;
  let slot = hotSlots.indexOf(ID.AIR);
  if (slot < 0 && survival) slot = hotSlots.findIndex((item) => !survival.count(item));
  if (slot < 0) return;
  if (!hotSlots[selection] || (survival && !survival.count(hotSlots[selection]))) selection = slot;
  hotSlots[slot] = id;
}

function inventoryMessage(text) { $('inventory-status').textContent = text; }
function equip(id) {
  if (!CATALOGUE.includes(id) || (survival && !survival.count(id))) return;
  const old = hotSlots.indexOf(id);
  if (old >= 0 && old !== selection) hotSlots[old] = hotSlots[selection];
  hotSlots[selection] = id;
  refreshHotbar(); refreshInventory();
  inventoryMessage(`${ITEMS[id].name} → touche ${selection + 1}`);
  saveSoon();
}

const searchName = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function refreshInventory() {
  const inSurvival = Boolean(survival);
  $('inventory-tabs').hidden = !inSurvival;
  $('survival-kit').hidden = !inSurvival;
  const crafting = inSurvival && inventoryTab === 'craft';
  $('blocks-tab').hidden = crafting;
  $('craft-tab').hidden = !crafting;
  for (const button of $('inventory-tabs').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.tab === inventoryTab));
  if (survival) {
    const berries = survival.count(IT.BERRIES), tool = survival.tool;
    $('tool-img').hidden = !tool;
    if (tool) $('tool-img').src = iconURL(tool);
    $('tool-name').textContent = tool ? ITEMS[tool].name : 'Mains nues';
    $('eat-text').textContent = `Manger · ${berries} baie${berries === 1 ? '' : 's'}`;
    $('eat').disabled = survival.dead || berries === 0 || survival.food >= MAX_VITAL - .15;
    $('eat').title = !berries ? 'Récolte des baies sur un buisson.' : survival.food >= MAX_VITAL - .15 ? 'Tu n’as pas faim.' : 'Restaure 5 points de nourriture';
    for (const { recipe, button } of recipeButtons) {
      button.disabled = !survival.canCraft(recipe);
      const owned = recipe.unique && survival.count(recipe.out[0]);
      button.textContent = owned ? 'Possédée' : 'Fabriquer';
      button.setAttribute('aria-label', `${owned ? 'Possédée' : 'Fabriquer'} : ${ITEMS[recipe.out[0]].name}`);
    }
  }
  $('catalogue-title').textContent = inSurvival ? 'Matériaux récoltés' : `${CATALOGUE.length} blocs et décorations`;
  const hint = usingTouch ? `Touche un bloc pour l’ajouter à l’emplacement ${selection + 1}.` : `Clique sur un bloc pour l’assigner à la touche ${selection + 1}.`;
  $('catalogue-copy').textContent = inSurvival ? `${hint} Récolte d’abord tes matériaux.` : hint;
  const query = searchName($('block-search').value.trim());
  let visible = 0;
  for (const [id, { button, count, placeable }] of inventoryCards) {
    const qty = survival?.count(id) ?? 0;
    button.hidden = (inSurvival ? !qty : !placeable) || !searchName(ITEMS[id].name).includes(query);
    if (!button.hidden) visible++;
    count.textContent = qty;
    count.hidden = !inSurvival;
    if (placeable) button.setAttribute('aria-pressed', String(id === hotSlots[selection]));
  }
  $('catalogue-empty').hidden = visible > 0;
  $('catalogue-empty').textContent = query ? 'Aucun matériau ne correspond à cette recherche.'
    : usingTouch ? 'Ton sac est vide. Vise un bloc et maintiens Miner pour le récolter.'
    : 'Ton sac est vide. Maintiens le clic gauche sur un bloc pour le récolter.';
}
