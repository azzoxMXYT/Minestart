const SIZE = 112;
const HEIGHT = 48;
const AREA = SIZE * SIZE;
const CHUNK = 16;
const SEA = 8;
const DEFAULT_SEED = 84217;
const REACH = 8.5;
const ID = Object.freeze({ AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6, PLANKS: 7, BRICKS: 8, WATER: 9, BEDROCK: 10, DAISY: 11, POPPY: 12, TUFT: 13 });
const TILE = Object.freeze({ GRASS: 0, GRASS_EDGE: 1, DIRT: 2, STONE: 3, SAND: 4, RINGS: 5, BARK: 6, LEAVES: 7, PLANKS: 8, BRICKS: 9, WATER: 10, BEDROCK: 11, DAISY: 12, POPPY: 13, TUFT: 14, CLOUD: 15 });
const BLOCKS = [
  { name: 'Air', top: 0, side: 0 },
  { name: 'Herbe', top: TILE.GRASS, side: TILE.GRASS_EDGE, bottom: TILE.DIRT },
  { name: 'Terre', top: TILE.DIRT, side: TILE.DIRT },
  { name: 'Pierre', top: TILE.STONE, side: TILE.STONE },
  { name: 'Sable', top: TILE.SAND, side: TILE.SAND },
  { name: 'Bois', top: TILE.RINGS, side: TILE.BARK },
  { name: 'Feuilles', top: TILE.LEAVES, side: TILE.LEAVES },
  { name: 'Planches', top: TILE.PLANKS, side: TILE.PLANKS },
  { name: 'Briques', top: TILE.BRICKS, side: TILE.BRICKS },
  { name: 'Eau', top: TILE.WATER, side: TILE.WATER },
  { name: 'Roche mère', top: TILE.BEDROCK, side: TILE.BEDROCK },
  { name: 'Marguerite', top: TILE.DAISY, side: TILE.DAISY },
  { name: 'Coquelicot', top: TILE.POPPY, side: TILE.POPPY },
  { name: 'Hautes herbes', top: TILE.TUFT, side: TILE.TUFT },
];
const PALETTE = [ID.GRASS, ID.DIRT, ID.STONE, ID.SAND, ID.WOOD, ID.LEAVES, ID.PLANKS, ID.BRICKS];
const isPlant = (block) => block >= ID.DAISY;
const solid = (block) => block > ID.AIR && block !== ID.WATER && !isPlant(block);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const indexOf = (x, y, z) => x + z * SIZE + y * AREA;
const inside = (x, y, z) => x >= 0 && x < SIZE && y >= 0 && y < HEIGHT && z >= 0 && z < SIZE;

function hash(x, y, z = 0, salt = 0) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul(salt | 0, 2654435761);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const tx = smooth(x - ix), tz = smooth(z - iz);
  return mix(mix(hash(ix, iz, 0, seed), hash(ix + 1, iz, 0, seed), tx),
    mix(hash(ix, iz + 1, 0, seed), hash(ix + 1, iz + 1, 0, seed), tx), tz);
}

function hills(x, z, hx, hz, sx, sz) {
  return Math.exp(-(((x - hx) / sx) ** 2 + ((z - hz) / sz) ** 2));
}

function worldName(seed) {
  if (seed === DEFAULT_SEED) return 'Vallon vert';
  return ['Bois de mousse', 'Val d’ardoise', 'Rive des pins', 'Prairie des fleurs', 'Colline du levant', 'Lac d’émeraude', 'Vallon des chênes'][seed % 7];
}

class World {
  constructor(seed = DEFAULT_SEED, edits = []) {
    this.seed = seed;
    this.blocks = new Uint8Array(AREA * HEIGHT);
    this.surface = new Uint8Array(AREA);
    this.tops = new Uint8Array(AREA);
    this.edits = new Map();
    this.generate();
    this.original = this.blocks.slice();
    // The seed recreates the base map, so only player edits need to be stored.
    if (Array.isArray(edits)) for (const entry of edits) {
      if (!Array.isArray(entry)) continue;
      const [i, id] = entry;
      if (!Number.isInteger(i) || i < AREA || i >= this.blocks.length || !Number.isInteger(id) || id < 0 || id >= BLOCKS.length || id === ID.BEDROCK || id === this.original[i]) continue;
      this.blocks[i] = id;
      this.edits.set(i, id);
    }
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) this.refreshTop(x, z);
  }

  get(x, y, z) { return inside(x, y, z) ? this.blocks[indexOf(x, y, z)] : ID.AIR; }

  raw(x, y, z, id) { if (inside(x, y, z)) this.blocks[indexOf(x, y, z)] = id; }

  refreshTop(x, z) {
    const col = x + z * SIZE;
    let y = HEIGHT - 1;
    while (y > 0 && !this.blocks[col + y * AREA]) y--;
    this.tops[col] = y;
  }

  set(x, y, z, id) {
    if (!inside(x, y, z) || y === 0 || !Number.isInteger(id) || id < 0 || id >= BLOCKS.length || id === ID.BEDROCK) return false;
    const i = indexOf(x, y, z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    if (id === this.original[i]) this.edits.delete(i);
    else this.edits.set(i, id);
    if (!solid(id) && isPlant(this.get(x, y + 1, z))) this.set(x, y + 1, z, ID.AIR);
    this.refreshTop(x, z);
    return true;
  }

  generate() {
    const seed = this.seed;
    const classic = seed === DEFAULT_SEED;
    const shift = classic ? 0 : (hash(seed, 43) - .5) * 15;
    const swell = classic ? 1 : .79 + hash(seed, 94) * .39;
    const basin = new Float32Array(AREA);
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const warp = (noise(x / 27 + 30, z / 27, seed) - .5) * 5;
      const base = 10.8 + 4.9 * (noise(x / 19, z / 19, seed) - .5)
        + 2.5 * (noise(x / 7.5, z / 7.5, seed + 12) - .5) + 1.0 * (noise(x / 2.8, z / 2.8, seed + 5) - .5);
      const elevation = base + 10.4 * hills(x, z, 51, 94, 20, 17) + swell * (
        15.8 * hills(x + warp, z, 22 - shift * .4, 58, 13, 25) + 8 * hills(x, z, 33, 36, 13, 12)
        + 20.2 * hills(x + warp, z, 86 + shift * .4, 56, 13, 23) + 8.1 * hills(x, z, 94, 76, 14, 19)
        + 22.2 * hills(x + warp, z, 56 + shift, 20, 14, 12) + 11.9 * hills(x, z, 73, 15, 14, 13)
        + 12.1 * hills(x, z, 33, 23, 12, 12) + 8.2 * hills(x, z, 104, 19, 14, 18));
      const channel = 55 + shift + 4.8 * Math.sin(z * .105 + 1);
      const distance = Math.hypot((x - channel) / (19.2 + shift * .16), (z - 55) / 29) + warp * .062;
      basin[x + z * SIZE] = distance;
      const cut = 1 - smooth(clamp((distance - .71) / .65, 0, 1));
      let h = mix(elevation, 4.2 + 1.1 * noise(x / 5, z / 5, seed), cut);
      if (classic && z >= 76 && z <= 99) {
        // A grassy overlook and footpath anchor the first-person view above the lake.
        const ridge = 19.75 - Math.max(0, 89.7 - z) * 1.33 - Math.abs(x - 51) * .225;
        h = Math.max(h, ridge + (noise(x / 4, z / 4, seed + 83) - .5) * .6);
      }
      // Terraces expose striped rock faces above the valley.
      if (h > 25 && (z < 40 || x > 78 || x < 31)) h = mix(h, Math.round(h / 2.3) * 2.3, .72);
      this.surface[x + z * SIZE] = clamp(Math.floor(h), 3, HEIGHT - 11);
    }
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const col = x + z * SIZE;
      const h = this.surface[col];
      const beach = h <= SEA + 1 + (noise(x / 4, z / 4, seed) > .76 ? 1 : 0) && basin[col] < 1.31;
      const steep = h - Math.min(this.surface[Math.max(0, x - 1) + z * SIZE], this.surface[Math.min(SIZE - 1, x + 1) + z * SIZE],
        this.surface[x + Math.max(0, z - 1) * SIZE], this.surface[x + Math.min(SIZE - 1, z + 1) * SIZE]);
      const bareRock = h > 22 && steep >= 2 && noise(x / 3.5, z / 3.5, seed + 2) < .52;
      const trailX = 52 - (93 - z) * .48 + 1.4 * Math.sin((z - 92) * .34);
      const trail = classic && z > 74 && z < 110 && Math.abs(x - trailX) < 1 + hash(x, z, 1, seed) * .75;
      const depth = 2 + (noise(x / 7, z / 7, seed + 3) > .59 ? 1 : 0);
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let id;
        if (y === 0) id = ID.BEDROCK;
        else if (y > h) id = ID.WATER;
        else if (beach && y >= h - 2) id = ID.SAND;
        else if (y === h) id = bareRock ? ID.STONE : trail ? ID.DIRT : ID.GRASS;
        else if (y >= h - depth && !bareRock) id = ID.DIRT;
        else id = ID.STONE;
        this.blocks[col + y * AREA] = id;
      }
    }
    this.growForest(classic);
    for (let z = 2; z < SIZE - 2; z++) for (let x = 2; x < SIZE - 2; x++) {
      const h = this.surface[x + z * SIZE];
      if (this.get(x, h, z) !== ID.GRASS || this.get(x, h + 1, z)) continue;
      const p = hash(x, z, 2, seed);
      const meadow = noise(x / 8, z / 8, seed + 13) > .53;
      if (p < (meadow ? .085 : .032)) this.raw(x, h + 1, z, ID.TUFT);
      else if (p > (meadow ? .982 : .997)) this.raw(x, h + 1, z, p > .994 ? ID.POPPY : ID.DAISY);
    }
    if (classic) for (const [x, z, id] of [[49, 89, ID.DAISY], [48, 88, ID.DAISY], [54, 90, ID.POPPY], [55, 89, ID.DAISY], [56, 87, ID.DAISY], [55, 88, ID.TUFT], [47, 89, ID.TUFT], [58, 88, ID.POPPY], [51, 86, ID.TUFT], [54, 87, ID.TUFT], [50, 90, ID.TUFT]]) {
      const h = this.surface[x + z * SIZE];
      if (!this.get(x, h + 1, z)) this.raw(x, h + 1, z, id);
    }
  }

  growForest(classic) {
    const trees = [];
    const plant = (x, z, pine, boost = 0) => {
      const base = this.surface[x + z * SIZE];
      if (base < SEA + 2 || this.get(x, base, z) !== ID.GRASS || trees.some(([tx, tz]) => (x - tx) ** 2 + (z - tz) ** 2 < 23)) return;
      trees.push([x, z]);
      const trunk = (pine ? 7 : 4) + Math.floor(hash(x, z, 81, this.seed) * 3) + boost;
      for (let y = 1; y <= trunk; y++) this.raw(x, base + y, z, ID.WOOD);
      const first = pine ? trunk - 5 : trunk - 2;
      for (let y = first; y <= trunk + (pine ? 2 : 1); y++) {
        const d = y - trunk;
        const radius = pine ? (d > 0 ? (d === 1 ? 1 : 0) : 1 + (d < -2 && (d % 2 !== 0) ? 1 : 0)) : (d >= 0 ? 1 : 2);
        for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dz) === radius * 2 && radius > 0 && (pine || hash(x + dx, y, z + dz, this.seed) > .36)) continue;
          if (!this.get(x + dx, base + y, z + dz)) this.raw(x + dx, base + y, z + dz, ID.LEAVES);
        }
      }
    };
    if (classic) for (const [x, z, pine, boost] of [[42, 81, false, 1], [64, 80, false, 1], [36, 73, false, 0], [76, 75, true, 0], [72, 67, false, 1], [35, 60, true, 1], [80, 58, false, 1], [66, 34, true, 0], [48, 34, false, 0]]) plant(x, z, pine, boost);
    for (let gz = 4; gz < SIZE - 5; gz += 6) for (let gx = 4; gx < SIZE - 5; gx += 6) {
      const f = noise(gx / 20, gz / 20, this.seed + 99);
      if (hash(gx, gz, 43, this.seed) > .24 + f * .48) continue;
      const x = gx + Math.floor(hash(gx, gz, 2, this.seed) * 5) - 2;
      const z = gz + Math.floor(hash(gx, gz, 17, this.seed) * 5) - 2;
      if ((x > 44 && x < 61 && z > 80) || (classic && z > 86 && x > 39 && x < 65)) continue;
      const h = this.surface[x + z * SIZE];
      plant(x, z, h > 26 || hash(x, z, 0, this.seed) > .78);
    }
  }

  spawn() {
    for (let ring = 0; ring < 19; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = 52 + dx, z = 93 + dz;
        const y = this.tops[x + z * SIZE];
        const id = this.get(x, y, z);
        if (solid(id) && id !== ID.LEAVES && id !== ID.WOOD && y < HEIGHT - 3) {
          return { x: x + .5, y: y + 1.001, z: z + .5, yaw: .015, pitch: -.105, vy: 0, grounded: true, flying: false };
        }
      }
    }
    return { x: 52.5, y: HEIGHT + 1, z: 93.5, yaw: .015, pitch: -.105, vy: 0, grounded: false, flying: false };
  }
}

const RADIUS = .275;
const BODY = 1.74;
const EYE = 1.57;
const playerBox = (x, y, z) => [x - RADIUS, y, z - RADIUS, x + RADIUS, y + BODY, z + RADIUS];

function collides(world, box) {
  const [x0, y0, z0, x1, y1, z1] = box;
  if (x0 < 0 || x1 >= SIZE || z0 < 0 || z1 >= SIZE || y0 < 0 || y0 > HEIGHT + 14) return true;
  for (let y = Math.floor(y0 + .00001); y <= Math.floor(y1 - .00001); y++) {
    for (let z = Math.floor(z0); z <= Math.floor(z1 - .00001); z++) {
      for (let x = Math.floor(x0); x <= Math.floor(x1 - .00001); x++) if (solid(world.get(x, y, z))) return true;
    }
  }
  return false;
}

function intersectsPlayer(player, x, y, z) {
  const [x0, y0, z0, x1, y1, z1] = playerBox(player.x, player.y, player.z);
  return x < x1 && x + 1 > x0 && y < y1 && y + 1 > y0 + 1e-5 && z < z1 && z + 1 > z0;
}

function advance(world, p, axes, dt) {
  const water = world.get(Math.floor(p.x), Math.floor(p.y + .25), Math.floor(p.z)) === ID.WATER;
  const speed = p.flying ? 8.3 : water ? 3.0 : axes.sprint ? 7.4 : 4.75;
  const m = Math.max(1, Math.hypot(axes.side, axes.forward));
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const dx = (axes.forward * sin + axes.side * cos) * speed * dt / m;
  const dz = (-axes.forward * cos + axes.side * sin) * speed * dt / m;
  if (!collides(world, playerBox(p.x + dx, p.y, p.z))) p.x += dx;
  if (!collides(world, playerBox(p.x, p.y, p.z + dz))) p.z += dz;

  if (p.flying) p.vy = (Number(axes.up) - Number(axes.down)) * 6.2;
  else if (water) p.vy = axes.up ? 4.3 : Math.max(-2.4, p.vy - dt * 6.0);
  else if (axes.up && p.grounded) p.vy = 8.15;
  else p.vy = Math.max(-24, p.vy - dt * 21.5);
  const dy = p.vy * dt;
  if (!collides(world, playerBox(p.x, p.y + dy, p.z))) {
    p.y += dy;
    p.grounded = false;
  } else {
    // Move as far as the nearest floor or ceiling, to avoid hovering above it.
    let lo = 0, hi = 1;
    for (let i = 0; i < 8; i++) {
      const t = (lo + hi) / 2;
      if (collides(world, playerBox(p.x, p.y + dy * t, p.z))) hi = t;
      else lo = t;
    }
    p.y += dy * lo;
    p.grounded = dy < 0;
    p.vy = 0;
  }
}

function lookDirection(p) {
  const h = Math.cos(p.pitch);
  return [Math.sin(p.yaw) * h, Math.sin(p.pitch), -Math.cos(p.yaw) * h];
}

// Step exactly between voxel boundaries rather than sampling through a thin block.
function raycast(world, origin, direction, reach = REACH) {
  const cell = origin.map(Math.floor);
  const step = direction.map(Math.sign);
  const delta = direction.map((v) => v === 0 ? Infinity : Math.abs(1 / v));
  const next = direction.map((v, i) => v > 0 ? (cell[i] + 1 - origin[i]) / v : v < 0 ? (cell[i] - origin[i]) / v : Infinity);
  let distance = 0;
  let neighbor = null;
  let plant = null;
  while (distance <= reach) {
    const id = world.get(...cell);
    if (solid(id)) return { cell, neighbor, id, distance };
    if (isPlant(id) && !plant) plant = { cell: cell.slice(), neighbor: cell.slice(), id, distance };
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    if (!Number.isFinite(next[axis])) break;
    neighbor = cell.slice();
    cell[axis] += step[axis];
    distance = next[axis];
    next[axis] += delta[axis];
  }
  return plant;
}
