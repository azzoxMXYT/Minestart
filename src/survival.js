const GAME_MODE = Object.freeze({ CREATIVE: 'creative', SURVIVAL: 'survival' });
const IT = Object.freeze({ BERRIES: BLOCKS.length, COAL: BLOCKS.length + 1, WOOD_PICK: BLOCKS.length + 2, STONE_PICK: BLOCKS.length + 3 });
const ITEMS = [...BLOCKS, { name: 'Baies' }, { name: 'Charbon' }, { name: 'Pioche en bois' }, { name: 'Pioche en pierre' }];
const DAY_LENGTH = 240;
const MAX_VITAL = 20;
const MAX_AIR = 10;
const MAX_STACK = 999;
const TORCH_RADIUS = 6.5;
const SURVIVAL_REACH = 5.6;
const ANY_PLANKS = [ID.PLANKS, ID.PINE_PLANKS];
const RECIPES = [
  { out: [ID.PLANKS, 4], using: [[ID.WOOD, 1]] },
  { out: [ID.PINE_PLANKS, 4], using: [[ID.PINE_LOG, 1]] },
  { out: [IT.WOOD_PICK, 1], using: [[ANY_PLANKS, 3]], unique: true },
  { out: [IT.STONE_PICK, 1], using: [[ID.STONE, 3], [ANY_PLANKS, 1]], unique: true },
  { out: [ID.TORCH, 4], using: [[ANY_PLANKS, 1], [IT.COAL, 1]] },
  { out: [ID.COBBLE, 2], using: [[ID.STONE, 2]] },
  { out: [ID.SANDSTONE, 1], using: [[ID.SAND, 4]] },
  { out: [ID.GLASS, 2], using: [[ID.SAND, 2], [IT.COAL, 1]] },
  { out: [ID.TERRACOTTA, 3], using: [[ID.DIRT, 3], [IT.COAL, 1]] },
  { out: [ID.BRICKS, 4], using: [[ID.TERRACOTTA, 3], [IT.COAL, 1]] },
  { out: [ID.RED_WOOL, 2], using: [[ID.LEAVES, 2], [ID.POPPY, 1]] },
  { out: [ID.BLUE_WOOL, 2], using: [[ID.LEAVES, 2], [ID.COPPER_ORE, 1]] },
  { out: [ID.COPPER_BLOCK, 1], using: [[ID.COPPER_ORE, 4], [IT.COAL, 1]] },
  { out: [ID.IRON_BLOCK, 1], using: [[ID.IRON_ORE, 4], [IT.COAL, 1]] },
];

function daylightAt(clock) {
  const hour = (clock % DAY_LENGTH) * 24 / DAY_LENGTH;
  return smooth(clamp((hour - 5.15) / 2.3, 0, 1)) * smooth(clamp((20.3 - hour) / 2.45, 0, 1));
}

function clockLabel(clock) {
  const minutes = Math.floor((clock % DAY_LENGTH) * 1440 / DAY_LENGTH);
  return `Jour ${1 + Math.floor(clock / DAY_LENGTH)} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function mineRule(id, tool) {
  if (id === ID.BEDROCK) return { hint: 'La roche mère ne peut pas être cassée.' };
  if (id === ID.IRON_ORE && tool !== IT.STONE_PICK) return { hint: 'Il faut une pioche en pierre pour le fer.' };
  if ((id === ID.COAL_ORE || id === ID.COPPER_ORE) && !tool) return { hint: 'Fabrique d’abord une pioche dans l’inventaire (E).' };
  if ([ID.STONE, ID.COBBLE, ID.GRANITE, ID.SLATE, ID.SANDSTONE, ID.COAL_ORE, ID.COPPER_ORE, ID.IRON_ORE, ID.COPPER_BLOCK, ID.IRON_BLOCK].includes(id)) {
    return { seconds: tool === IT.STONE_PICK ? .32 : tool === IT.WOOD_PICK ? .66 : 1.65 };
  }
  return { seconds: id === ID.WOOD || id === ID.PINE_LOG ? .86 : isPlant(id) ? .25 : .43 };
}

function blockDrop(id) {
  if (id === ID.GRASS) return ID.DIRT;
  if (id === ID.COAL_ORE) return IT.COAL;
  if (id === ID.BERRY_BUSH) return IT.BERRIES;
  return CATALOGUE.includes(id) ? id : ID.AIR;
}

function nearestTorch(world, x, y, z, limit = TORCH_RADIUS) {
  let result = null, distance2 = limit * limit;
  for (const index of world.torches) {
    const [tx,ty,tz] = coordsOf(index);
    const d2 = (x - tx - .5) ** 2 + (y - ty - .5) ** 2 + (z - tz - .5) ** 2;
    if (d2 < distance2) { distance2 = d2; result = [tx + .5, ty + .5, tz + .5]; }
  }
  return result;
}

const slimeBox = (x, y, z) => [x - .40, y, z - .40, x + .40, y + .77, z + .40];
const boundNumber = (n, fallback, max) => Number.isFinite(n) ? clamp(n, 0, max) : fallback;

class Survival {
  constructor(saved) {
    const data = saved && typeof saved === 'object' ? saved : {};
    this.health = boundNumber(data.health, MAX_VITAL, MAX_VITAL);
    this.food = boundNumber(data.food, MAX_VITAL, MAX_VITAL);
    this.air = boundNumber(data.air, MAX_AIR, MAX_AIR);
    this.clock = boundNumber(data.clock, 80, 1e9);
    this.why = typeof data.why === 'string' ? data.why.slice(0, 80) : '';
    this.bag = new Uint16Array(ITEMS.length);
    if (Array.isArray(data.bag)) {
      for (let i = 1; i < this.bag.length; i++) this.bag[i] = Math.floor(boundNumber(data.bag[i], 0, MAX_STACK));
      this.bag[ID.WATER] = this.bag[ID.BEDROCK] = this.bag[ID.EMPTY_BUSH] = 0;
    } else this.bag[IT.BERRIES] = 2;
    this.bushes = new Map();
    if (Array.isArray(data.bushes)) for (const row of data.bushes) {
      if (!Array.isArray(row)) continue;
      const [index, time] = row;
      if (Number.isInteger(index) && index >= AREA && index < AREA * HEIGHT && Number.isFinite(time)) this.bushes.set(index, time);
    }
    this.mobs = [];
    this.nextGrowth = this.clock + 1;
    this.nextSpawn = this.clock + 3;
    this.spawnSerial = 0;
    this.hurtUntil = 0;
    this.strikeAt = 0;
    this.regen = this.drown = this.starve = 0;
    this.damageCount = 0;
    this.fallTop = null;
  }

  snapshot() {
    return { health: this.health, food: this.food, air: this.air, clock: this.clock, why: this.why, bag: Array.from(this.bag), bushes: Array.from(this.bushes) };
  }

  get tool() { return this.bag[IT.STONE_PICK] ? IT.STONE_PICK : this.bag[IT.WOOD_PICK] ? IT.WOOD_PICK : 0; }
  get dead() { return this.health <= 0; }
  get night() { return daylightAt(this.clock) < .19; }
  count(id) { return this.bag[id] ?? 0; }

  add(id, quantity = 1) {
    if (!Number.isInteger(id) || id <= 0 || id >= ITEMS.length || quantity <= 0) return 0;
    const added = Math.min(MAX_STACK - this.bag[id], quantity);
    this.bag[id] += added;
    return added;
  }

  spend(id, quantity = 1) {
    if (quantity <= 0 || this.count(id) < quantity) return false;
    this.bag[id] -= quantity;
    return true;
  }

  ingredientCount(material) {
    return Array.isArray(material) ? material.reduce((sum, id) => sum + this.count(id), 0) : this.count(material);
  }

  canCraft(recipe) {
    const [id, count] = recipe.out;
    return !this.dead && (!recipe.unique || !this.count(id)) && this.count(id) + count <= MAX_STACK &&
      recipe.using.every(([material, amount]) => this.ingredientCount(material) >= amount);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    for (const [material, amount] of recipe.using) {
      let rest = amount;
      for (const id of Array.isArray(material) ? material : [material]) {
        const use = Math.min(rest, this.count(id));
        if (use) this.spend(id, use);
        rest -= use;
      }
    }
    this.add(...recipe.out);
    return true;
  }

  eat() {
    if (this.dead || this.food >= MAX_VITAL - .15 || !this.spend(IT.BERRIES)) return false;
    this.food = Math.min(MAX_VITAL, this.food + 5);
    return true;
  }

  harvest(world, cell) {
    if (this.dead || world.get(...cell) !== ID.BERRY_BUSH || this.count(IT.BERRIES) >= MAX_STACK) return 0;
    if (!world.set(...cell, ID.EMPTY_BUSH)) return 0;
    this.bushes.set(indexOf(...cell), this.clock + 43);
    return this.add(IT.BERRIES, 2);
  }

  hurt(amount, reason) {
    if (this.dead || this.clock < this.hurtUntil) return false;
    this.health = Math.max(0, this.health - amount);
    this.why = reason;
    this.hurtUntil = this.clock + .72;
    this.regen = 0;
    this.damageCount++;
    return true;
  }

  respawn() {
    this.health = MAX_VITAL;
    this.food = MAX_VITAL;
    this.air = MAX_AIR;
    this.why = '';
    this.regen = this.drown = this.starve = 0;
    this.mobs = [];
    this.fallTop = null;
    this.nextSpawn = this.clock + 12;
    this.hurtUntil = this.clock + 3;
  }

  step(world, p, axes, dt, onChange = () => {}) {
    if (this.dead) return;
    this.clock += dt;
    const x = Math.floor(p.x), z = Math.floor(p.z);
    const submerged = world.get(x, Math.floor(p.y + EYE), z) === ID.WATER;
    const swimming = submerged || world.get(x, Math.floor(p.y + .35), z) === ID.WATER;
    const moving = Boolean(axes.side || axes.forward);
    this.food = Math.max(0, this.food - dt * (.019 + (moving ? .037 : 0) + (moving && axes.sprint && !swimming ? .12 : 0)));
    if (swimming) this.fallTop = null;
    else if (!p.grounded) this.fallTop = Math.max(this.fallTop ?? p.y, p.y);
    else if (this.fallTop !== null) {
      const distance = this.fallTop - p.y;
      this.fallTop = null;
      if (distance > 3.35) this.hurt(Math.floor(distance - 2.35) * 2, 'La chute a été trop haute.');
    }
    this.air = submerged ? Math.max(0, this.air - dt) : MAX_AIR;
    if (this.air <= 0) {
      this.drown += dt;
      if (this.drown >= 1.1) { this.hurt(2, 'Tu as manqué d’air sous l’eau.'); this.drown = 0; }
    } else this.drown = 0;
    if (this.food <= 0) {
      this.starve += dt;
      if (this.starve >= 3.2) { this.hurt(2, 'Tu as manqué de nourriture.'); this.starve = 0; }
    } else this.starve = 0;
    if (!this.dead && this.health < MAX_VITAL && this.food >= 17 && this.clock > this.hurtUntil + 1) {
      this.regen += dt;
      if (this.regen >= 5) { this.health++; this.food = Math.max(0, this.food - .65); this.regen = 0; }
    } else this.regen = 0;
    if (this.clock >= this.nextGrowth) {
      this.nextGrowth = this.clock + 1;
      for (const [i, time] of this.bushes) if (time <= this.clock) {
        const cell = coordsOf(i);
        if (world.get(...cell) === ID.EMPTY_BUSH && world.set(...cell, ID.BERRY_BUSH)) onChange(cell[0], cell[2]);
        this.bushes.delete(i);
      }
    }
    if (!this.dead) this.moveSlimes(world, p, dt);
  }

  spawnSlime(world, p) {
    for (let i = 0; i < 18; i++) {
      const id = ++this.spawnSerial;
      const a = hash(id, 65, Math.floor(this.clock), world.seed) * Math.PI * 2;
      const r = 9 + hash(id, 33, Math.floor(this.clock), world.seed) * 11;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (x < 1 || z < 1 || x >= SIZE - 1 || z >= SIZE - 1) continue;
      let top = world.tops[x + z * SIZE];
      while (isPlant(world.get(x,top,z))) top--;
      const floor = world.get(x,top,z), y = top + 1.001;
      if (!solid(floor) || floor === ID.LEAVES || floor === ID.WOOD || floor === ID.PINE_LOG || Math.abs(p.y - y) > 7 ||
          nearestTorch(world, x+.5,y,z+.5) || collides(world, slimeBox(x+.5,y,z+.5))) continue;
      this.mobs.push({ id, x: x+.5, y, z: z+.5, vy: 0, hp: 3, blink: 0, phase: id * 3.1, bite: this.clock + 1 });
      return true;
    }
    return false;
  }

  moveSlimes(world, p, dt) {
    if (!this.night) { this.mobs.length = 0; return; }
    if (this.clock >= this.nextSpawn && this.mobs.length < 4) {
      this.nextSpawn = this.clock + 5.6;
      this.spawnSlime(world, p);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const slime = this.mobs[i];
      const mx = p.x - slime.x, mz = p.z - slime.z;
      if (Math.hypot(mx, mz) > 35) { this.mobs.splice(i, 1); continue; }
      const lamp = nearestTorch(world, slime.x, slime.y + .35, slime.z);
      const dx = lamp ? slime.x - lamp[0] : mx;
      const dz = lamp ? slime.z - lamp[2] : mz;
      const mag = Math.max(.3, Math.hypot(dx, dz));
      const speed = this.clock < slime.blink ? .36 : 2.05 + .49 * Math.sin(this.clock * 7 + slime.phase);
      const tryMove = (x,z) => {
        if (!lamp && nearestTorch(world, x, slime.y + .35, z)) return;
        if (!collides(world, slimeBox(x,slime.y,z))) { slime.x = x; slime.z = z; }
        else if (Math.abs(slime.vy) < .1 && !collides(world, slimeBox(x,slime.y + 1.006,z))) {
          slime.x = x; slime.z = z; slime.y += 1.006;
        }
      };
      tryMove(slime.x + dx / mag * speed * dt, slime.z);
      tryMove(slime.x, slime.z + dz / mag * speed * dt);
      slime.vy = Math.max(-9, slime.vy - 17 * dt);
      const dy = slime.vy * dt;
      if (collides(world, slimeBox(slime.x, slime.y + dy, slime.z))) {
        let lo = 0, hi = 1;
        for (let j = 0; j < 6; j++) {
          const t = (lo + hi) / 2;
          if (collides(world, slimeBox(slime.x, slime.y + dy * t, slime.z))) hi = t;
          else lo = t;
        }
        slime.y += dy * lo;
        slime.vy = 0;
      } else slime.y += dy;
      if (!lamp && this.clock >= slime.bite && Math.hypot(p.x - slime.x, p.z - slime.z) < .93 && Math.abs(p.y - slime.y) < .86) {
        if (this.hurt(3, 'Une gelée nocturne t’a surpris.')) slime.bite = this.clock + 1.4;
      }
    }
  }

  strike(slime) {
    if (this.dead || this.clock < this.strikeAt || !this.mobs.includes(slime)) return null;
    this.strikeAt = this.clock + .39;
    slime.blink = this.clock + .28;
    slime.hp -= this.tool ? 2 : 1;
    if (slime.hp > 0) return 'Gelée repoussée';
    this.mobs.splice(this.mobs.indexOf(slime), 1);
    return this.add(IT.BERRIES) ? 'Gelée dissipée · +1 baie' : 'Gelée dissipée';
  }
}
