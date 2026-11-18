import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// The browser build inlines its modules so it can open directly from disk.
const source = readFileSync(new URL('../src/terrain.js', import.meta.url), 'utf8');
const { World, ID, DEFAULT_SEED, SIZE, HEIGHT, AREA, EYE, advance, collides, intersectsPlayer, lookDirection, playerBox, raycast } =
  runInNewContext(`${source}\n({ World, ID, DEFAULT_SEED, SIZE, HEIGHT, AREA, EYE, advance, collides, intersectsPlayer, lookDirection, playerBox, raycast })`);
const still = { side: 0, forward: 0, sprint: false, up: false, down: false };

function step(map, player, controls = {}, frames = 100) {
  for (let i = 0; i < frames; i++) advance(map, player, { ...still, ...controls }, .01);
}

test('une graine reproduit le terrain et le point de départ', () => {
  const a = new World(), b = new World(DEFAULT_SEED), c = new World(28831);
  assert.equal(a.blocks.length, SIZE * SIZE * HEIGHT);
  assert.deepEqual(a.blocks, b.blocks);
  assert.notDeepEqual(a.blocks, c.blocks);
  assert.ok(a.blocks.includes(ID.WATER));
  assert.ok(a.blocks.includes(ID.LEAVES));
  for (const map of [a, b, c]) {
    const p = map.spawn();
    assert.equal(collides(map, playerBox(p.x, p.y, p.z)), false);
    step(map, p, {}, 15);
    assert.equal(p.grounded, true);
  }
});

test('des constructions et des blocs cassés survivent à la reconstruction du monde', () => {
  const map = new World();
  const { x, y, z } = map.spawn();
  const a = [Math.floor(x) + 2, Math.floor(y) + 1, Math.floor(z)];
  const b = [Math.floor(x), Math.floor(y) - 1, Math.floor(z)];
  const original = map.get(...b);
  assert.equal(map.get(...a), ID.AIR);
  assert.equal(map.set(...a, ID.BRICKS), true);
  assert.equal(map.set(...b, ID.AIR), true);
  const restored = new World(map.seed, JSON.parse(JSON.stringify([...map.edits])));
  assert.equal(restored.get(...a), ID.BRICKS);
  assert.equal(restored.get(...b), ID.AIR);
  assert.equal(restored.tops[a[0] + a[2] * SIZE], a[1]);
  assert.equal(restored.set(...a, ID.AIR), true);
  assert.equal(restored.set(...b, original), true);
  assert.equal(restored.edits.size, 0);
});

test('la roche mère et les limites du monde ne sont pas modifiables', () => {
  const map = new World(1, [[0, ID.AIR], [AREA - 1, ID.GRASS], [-1, ID.DIRT], [AREA * HEIGHT, ID.STONE], [AREA, -2], ['5', 1], null]);
  assert.equal(map.get(0, 0, 0), ID.BEDROCK);
  assert.equal(map.set(0, 0, 0, ID.AIR), false);
  assert.equal(map.set(-1, 30, 0, ID.GRASS), false);
  assert.equal(map.set(0, HEIGHT, 0, ID.GRASS), false);
  assert.equal(map.edits.size, 0);
});

test('la visée trouve la face et le voisin exacts et respecte la portée', () => {
  const map = new World();
  map.set(8, 45, 9, ID.PLANKS);
  const hit = raycast(map, [8.5, 45.5, 13.5], [0, 0, -1]);
  assert.deepEqual(Array.from(hit.cell), [8, 45, 9]);
  assert.deepEqual(Array.from(hit.neighbor), [8, 45, 10]);
  assert.equal(hit.id, ID.PLANKS);
  assert.equal(hit.distance, 3.5);
  assert.equal(raycast(map, [8.5, 45.5, 13.5], [0, 0, -1], 3), null);
  const p = map.spawn();
  p.pitch = -.8;
  assert.ok(raycast(map, [p.x, p.y + EYE, p.z], lookDirection(p)));
});

test('le joueur marche, saute, vole et reste bloqué par la géométrie', () => {
  const map = new World();
  const p = map.spawn();
  const startY = p.y;
  step(map, p, { up: true }, 20);
  assert.ok(p.y > startY + .6);
  step(map, p);
  assert.ok(Math.abs(p.y - startY) < .002);
  const x = Math.floor(p.x), y = Math.floor(p.y + .002), z = Math.floor(p.z);
  assert.equal(intersectsPlayer(p, x, y, z), true);
  assert.equal(intersectsPlayer(p, x, y, z - 1), false);
  map.set(x, y, z - 1, ID.STONE);
  map.set(x, y + 1, z - 1, ID.STONE);
  step(map, p, { forward: 1 });
  assert.ok(p.z >= z + .27);
  assert.ok(p.z < z + .5);
  p.flying = true;
  step(map, p, { up: true }, 40);
  assert.ok(p.y > startY + 2);
  step(map, p, { forward: 1 }, 30);
  assert.ok(p.z < z - 1);
});
