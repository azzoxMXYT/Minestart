const PIXELS = 16;
const ATLAS_SIZE = 128;
const CELL = 32;
const PAD = 8;
const tileOrigin = (tile) => [(tile % 4 * CELL + PAD) / ATLAS_SIZE, ((tile >> 2) * CELL + PAD) / ATLAS_SIZE];
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

function makeArt() {
  const atlas = canvasOf(ATLAS_SIZE, ATLAS_SIZE);
  const atlasCtx = atlas.getContext('2d');
  atlasCtx.imageSmoothingEnabled = false;
  const tiles = Array.from({ length: 16 }, () => canvasOf(PIXELS, PIXELS));
  for (let tile = 0; tile < tiles.length; tile++) {
    const ctx = tiles[tile].getContext('2d');
    if (tile === TILE.DAISY || tile === TILE.POPPY || tile === TILE.TUFT) {
      paintPlant(ctx, tile);
    } else {
      const data = ctx.createImageData(PIXELS, PIXELS);
      for (let y = 0; y < PIXELS; y++) for (let x = 0; x < PIXELS; x++) {
        const at = (x + y * PIXELS) * 4;
        const rgb = texel(tile, x, y);
        data.data.set([...rgb, 255], at);
      }
      ctx.putImageData(data, 0, 0);
    }
    // Extend the border pixels so the mip maps do not bleed into the next tile.
    const bx = tile % 4 * CELL, by = (tile >> 2) * CELL;
    const bands = [[0, 1, 0, PAD], [0, PIXELS, PAD, PIXELS], [PIXELS - 1, 1, PAD + PIXELS, PAD]];
    for (const [sx, sw, dx, dw] of bands) for (const [sy, sh, dy, dh] of bands) {
      atlasCtx.drawImage(tiles[tile], sx, sy, sw, sh, bx + dx, by + dy, dw, dh);
    }
  }
  return { atlas, tiles };
}

function texel(tile, x, y) {
  const h = hash(x, y, 3, tile + 11);
  const blocky = hash(x >> 1, y >> 1, 6, tile + 142);
  const clusters = noise(x / 4, y / 4, tile + 523);
  const d = Math.round((h - .5) * 16 + (blocky - .5) * 19 + (clusters - .5) * 22);
  const tint = (r, g, b, amount = d) => [r + amount, g + amount, b + amount];
  switch (tile) {
    case TILE.GRASS:
      if (h > .92) return tint(139, 176, 71, d * .35);
      if (h < .078) return tint(98, 140, 48, d * .6);
      return tint(119, 161, 58, d * .78);
    case TILE.GRASS_EDGE: {
      const fringe = 2 + Math.floor(hash(x, 7, 9) * 3) + (hash(x >> 2, 12, 3) > .79 ? 1 : 0);
      if (y < fringe) return tint(113, 155, 56, d * .89 - y * 1.8);
      if (y === fringe && h > .42) return tint(97, 111, 50, d * .47);
      return texel(TILE.DIRT, x, y);
    }
    case TILE.DIRT:
      if (h > .965) return tint(152, 121, 87, d * .42);
      if (h < .06) return tint(107, 73, 47, d * .57);
      return tint(132, 94, 62, d * .85);
    case TILE.STONE: {
      const layer = (y + Math.floor(hash(x >> 2, y >> 2, 13) * 2)) % 7;
      return tint(145, 148, 133, Math.round(d * .74 + (layer === 0 ? -9 : layer === 1 ? 7 : 0)));
    }
    case TILE.SAND:
      return tint(217, 196, 141, d * .58 + (h > .93 ? 10 : 0));
    case TILE.RINGS: {
      const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (ring > 6.6) return tint(114, 79, 43, d);
      return tint(181, 139, 81, Math.floor(ring) % 2 === 0 ? d * .49 : d * .52 - 24);
    }
    case TILE.BARK: {
      const stroke = hash(x, 10, 1) - .5;
      return tint(122, 89, 54, stroke * 53 + (hash(x, y >> 2, 1) - .5) * 20 + d * .45);
    }
    case TILE.LEAVES: {
      const tuft = hash(x + (y % 2), y, 87);
      if (tuft < .10) return tint(53, 88, 36, d * .70);
      if (tuft > .89) return tint(116, 157, 57, d * .53);
      return tint(81, 127, 45, d * 1.15 + (clusters - .5) * 15);
    }
    case TILE.PLANKS: {
      const board = y >> 2;
      const seam = y % 4 === 0 || (x + board * 5 + 3) % 16 === 0;
      return tint(181, 135, 76, d * .6 + (hash(3, board, 12) - .5) * 16 + (seam ? -39 : y % 4 === 1 ? 15 : 0));
    }
    case TILE.BRICKS: {
      const row = y >> 2;
      const address = (x + (row % 2) * 4) % 16;
      if (y % 4 === 0 || address % 8 === 0) return tint(163, 145, 119, d * .65);
      return tint(162, 83, 56, d * .62 + (hash(address >> 3, row, 14) - .5) * 21 + (y % 4 === 1 ? 10 : 0));
    }
    case TILE.WATER: {
      const ribbon = hash(x >> 2, y, 128);
      if ((y === 1 || y === 4 || y === 9 || y === 13) && ribbon > .57) return tint(93, 181, 199, (h - .5) * 10);
      return tint(61, 153, 179, d * .18 + (y % 4 === 0 ? 4 : 0));
    }
    case TILE.BEDROCK:
      return tint(77, 85, 79, d * 1.55);
    default:
      return tint(247, 249, 236, (blocky - .5) * 4);
  }
}

function paintPlant(ctx, tile) {
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  if (tile === TILE.TUFT) {
    rect('#55792c', 6, 10, 3, 6); rect('#769741', 7, 7, 2, 8);
    rect('#5e8534', 4, 9, 2, 4); rect('#5e8534', 5, 12, 2, 4);
    rect('#a3bd57', 7, 6, 1, 5); rect('#94af48', 3, 7, 2, 3);
    rect('#668c3b', 8, 12, 3, 4); rect('#769d41', 10, 9, 2, 4);
    rect('#a3bd57', 11, 8, 1, 2); rect('#4d752a', 2, 13, 3, 3);
    return;
  }
  rect('#436d2b', 7, 6, 2, 10); rect('#72983e', 7, 7, 1, 9);
  rect('#72983e', 4, 10, 3, 2); rect('#507c30', 5, 12, 3, 1);
  rect('#507c30', 9, 12, 3, 2); rect('#81a84b', 10, 11, 3, 1);
  const [light, dark, center] = tile === TILE.DAISY ? ['#fffbe8', '#e8e1c6', '#f5c64a'] : ['#e67956', '#b9463d', '#f5b45f'];
  rect(dark, 4, 4, 8, 3); rect(dark, 6, 2, 4, 7);
  rect(light, 5, 3, 6, 3); rect(light, 7, 1, 2, 6);
  rect(light, 3, 4, 10, 2); rect(center, 7, 4, 2, 2);
}

function blockIcon(tiles, id) {
  const canvas = canvasOf(48, 48), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const { top, side } = BLOCKS[id];
  function face(tile, ox, oy, ux, uy, vx, vy, shade = 0) {
    ctx.setTransform(ux / PIXELS, uy / PIXELS, vx / PIXELS, vy / PIXELS, ox, oy);
    ctx.drawImage(tiles[tile], 0, 0);
    if (shade) {
      ctx.fillStyle = `rgba(15,22,11,${shade})`;
      ctx.fillRect(0, 0, PIXELS, PIXELS);
    }
  }
  face(top, 24, 3, 19, 10, -19, 10);
  face(side, 5, 13, 19, 10, 0, 19, .16);
  face(side, 24, 23, 19, -10, 0, 19, .33);
  ctx.resetTransform();
  ctx.strokeStyle = '#11190db8';
  ctx.beginPath();
  ctx.moveTo(24, 3); ctx.lineTo(43, 13); ctx.lineTo(43, 32); ctx.lineTo(24, 42); ctx.lineTo(5, 32); ctx.lineTo(5, 13); ctx.closePath();
  ctx.stroke();
  return canvas.toDataURL();
}
