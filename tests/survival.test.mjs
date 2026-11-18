import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = ['terrain', 'survival'].map((name) => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')).join('\n');
const { Survival, World, ID, IT, DEFAULT_SEED, RECIPES, SIZE, mineRule, blockDrop, clockLabel, daylightAt, indexOf, raycast } =
  runInNewContext(`${source}\n({ Survival, World, ID, IT, DEFAULT_SEED, RECIPES, SIZE, mineRule, blockDrop, clockLabel, daylightAt, indexOf, raycast })`);
const p = { x: 52.5, y: 20.001, z: 93.5, grounded: true };
const still = { side: 0, forward: 0, sprint: false };
const recipe = (id) => RECIPES.find((candidate) => candidate.out[0] === id);
const level = (water = false) => ({
  seed: DEFAULT_SEED,
  tops: new Uint8Array(SIZE * SIZE).fill(19),
  torches: new Set(),
  get: (_x, y) => y < 20 ? ID.STONE : water ? ID.WATER : ID.AIR,
});

test('les anciens mondes gardent leur terrain ; les nouveaux ajoutent minerais et nourriture', () => {
  const legacy = new World(DEFAULT_SEED, [], 1), updated = new World();
  for (const id of [ID.COAL_ORE, ID.COPPER_ORE, ID.IRON_ORE, ID.BERRY_BUSH, ID.PINE_LOG, ID.SNOW]) {
    assert.equal(legacy.blocks.includes(id), false);
    assert.equal(updated.blocks.includes(id), true);
  }
  const [x, z] = [56, 92], y = updated.tops[x + z * SIZE];
  const bush = raycast(updated, [x + .5, y + .44, z + 1.3], [0,0,-1], 1.5);
  assert.equal(bush?.id, ID.BERRY_BUSH);
  const survival = new Survival(), foodBefore = survival.count(IT.BERRIES);
  assert.equal(survival.harvest(updated, [x,y,z]), 2);
  assert.equal(survival.harvest(updated, [x,y,z]), 0);
  assert.equal(survival.count(IT.BERRIES), foodBefore + 2);
  assert.equal(updated.get(x,y,z), ID.EMPTY_BUSH);
  const restored = new Survival(survival.snapshot());
  let regenerated = false;
  restored.step(updated, p, still, 45, () => { regenerated = true; });
  assert.equal(updated.get(x,y,z), ID.BERRY_BUSH);
  assert.equal(regenerated, true);
});

test('les recettes consomment les ingrédients, débloquent les minerais et équipent la meilleure pioche', () => {
  const s = new Survival();
  assert.equal(s.craft(recipe(IT.WOOD_PICK)), false);
  assert.equal(s.count(ID.PLANKS), 0);
  s.add(ID.WOOD);
  assert.equal(s.craft(recipe(ID.PLANKS)), true);
  assert.equal(s.count(ID.WOOD), 0);
  assert.equal(s.count(ID.PLANKS), 4);
  assert.equal(s.craft(recipe(IT.WOOD_PICK)), true);
  assert.equal(s.craft(recipe(IT.WOOD_PICK)), false);
  assert.equal(s.tool, IT.WOOD_PICK);
  assert.ok(mineRule(ID.STONE, s.tool).seconds < mineRule(ID.STONE, 0).seconds);
  assert.ok(mineRule(ID.IRON_ORE, s.tool).hint);
  assert.equal(blockDrop(ID.COAL_ORE), IT.COAL);
  s.add(ID.STONE, 3);
  assert.equal(s.craft(recipe(IT.STONE_PICK)), true);
  assert.equal(s.tool, IT.STONE_PICK);
  assert.ok(mineRule(ID.IRON_ORE, s.tool).seconds > 0);
  assert.equal(s.spend(ID.STONE), false);
  assert.equal(new Survival(s.snapshot()).tool, IT.STONE_PICK);
});

test('les baies nourrissent, la chute et l’eau font perdre de la vie', () => {
  const s = new Survival({ food: 11 });
  assert.equal(s.eat(), true);
  assert.equal(s.food, 16);
  assert.equal(s.count(IT.BERRIES), 1);
  s.step(level(), { ...p, y: 27, grounded: false }, still, .05);
  s.step(level(), p, still, .05);
  assert.ok(s.health < 20);
  const hp = s.health;
  for (let i = 0; i < 120; i++) s.step(level(true), p, still, .1);
  assert.equal(s.air, 0);
  assert.ok(s.health < hp);
  s.step(level(), p, still, .1);
  assert.equal(s.air, 10);
  assert.equal(s.hurt(99, 'test'), true);
  const dead = new Survival(s.snapshot());
  assert.equal(dead.dead, true);
  dead.respawn();
  assert.equal(dead.health, 20);
  assert.equal(dead.food, 20);
  assert.equal(dead.count(IT.BERRIES), 1);
});

test('les gelées nocturnes attaquent mais restent loin des torches', () => {
  const s = new Survival({ clock: 223 });
  const w = level();
  const origin = { x: p.x + .72, y: p.y, z: p.z, vy: 0, hp: 1, blink: 0, phase: 0, bite: 0 };
  const mob = { ...origin };
  s.mobs.push(mob);
  w.torches.add(indexOf(53,20,93));
  s.step(w, p, still, .07);
  assert.equal(s.health, 20);
  w.torches.clear();
  s.step(w, p, still, .07);
  assert.ok(s.health < 20);
  assert.match(s.strike(mob), /dissipée/);
  assert.equal(s.count(IT.BERRIES), 3);
  assert.equal(s.mobs.length, 0);
  assert.equal(daylightAt(223), 0);
  assert.equal(daylightAt(90), 1);
  assert.equal(clockLabel(330), 'Jour 2 · 09:00');
});
