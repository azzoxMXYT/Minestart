import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/fps.js', import.meta.url), 'utf8');
const FrameRate = runInNewContext(`${source}\nFrameRate`);

test('la cadence est mesurée sur le temps écoulé entre les images de jeu', () => {
  const meter = new FrameRate();
  let reading = meter.tick(0);
  assert.equal(reading, null);
  for (let now = 25; now < 600; now += 25) assert.equal(meter.tick(now), null);
  reading = meter.tick(600);
  assert.equal(reading, 40);
  for (let now = 650; now < 1200; now += 50) assert.equal(meter.tick(now), null);
  assert.equal(meter.tick(1200), 20);
});

test('une pause ou un changement de réglage ne fausse pas la mesure suivante', () => {
  const meter = new FrameRate(500);
  meter.tick(10);
  meter.tick(100);
  meter.reset();
  assert.equal(meter.tick(10000), null);
  for (let now = 10020; now < 10500; now += 20) assert.equal(meter.tick(now), null);
  assert.equal(meter.tick(10500), 50);
});
