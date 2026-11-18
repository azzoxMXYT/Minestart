const PIXELS = 16;
const ATLAS_SIZE = 256;
const CELL = 32;
const PAD = 8;
const ATLAS_COLUMNS = ATLAS_SIZE / CELL;
const tileOrigin = (tile) => [(tile % ATLAS_COLUMNS * CELL + PAD) / ATLAS_SIZE, (Math.floor(tile / ATLAS_COLUMNS) * CELL + PAD) / ATLAS_SIZE];
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

function makeArt() {
  const atlas = canvasOf(ATLAS_SIZE, ATLAS_SIZE);
  const atlasCtx = atlas.getContext('2d');
  atlasCtx.imageSmoothingEnabled = false;
  const tiles = Array.from({ length: Math.max(...Object.values(TILE)) + 1 }, () => canvasOf(PIXELS, PIXELS));
  for (let tile = 0; tile < tiles.length; tile++) {
    const ctx = tiles[tile].getContext('2d');
    if ([TILE.DAISY, TILE.POPPY, TILE.TUFT, TILE.BERRY_BUSH, TILE.EMPTY_BUSH, TILE.TORCH].includes(tile)) {
      paintPlant(ctx, tile);
    } else {
      const data = ctx.createImageData(PIXELS, PIXELS);
      for (let y = 0; y < PIXELS; y++) for (let x = 0; x < PIXELS; x++) {
        const at = (x + y * PIXELS) * 4;
        const rgb = texel(tile, x, y);
        data.data.set(rgb.length === 4 ? rgb : [...rgb, 255], at);
      }
      ctx.putImageData(data, 0, 0);
    }
    // Extend the border pixels so the mip maps do not bleed into the next tile.
    const bx = tile % ATLAS_COLUMNS * CELL, by = Math.floor(tile / ATLAS_COLUMNS) * CELL;
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
    case TILE.COBBLE: {
      const row = y >> 2, col = (x + row * 3) % 8;
      if (y % 4 === 0 || col === 0) return tint(78, 87, 80, d * .38);
      return tint(139, 146, 133, d * .8 + (hash(x - col, row, 3) - .5) * 31 + (y % 4 === 1 ? 12 : 0));
    }
    case TILE.SANDSTONE:
      return tint(202, 177, 120, d * .63 + (y % 5 === 0 ? -11 : y % 5 === 1 ? 6 : 0));
    case TILE.GRANITE:
      return h < .08 ? tint(90, 66, 64) : h > .91 ? tint(190, 157, 145) : tint(151, 114, 104, d * 1.05);
    case TILE.SLATE:
      return tint(91, 110, 120, d * .8 - ((x + y * 2) % 7 === 0 ? 13 : 0));
    case TILE.SNOW:
      return tint(227, 236, 239, d * .42 + (h > .82 ? 6 : 0));
    case TILE.ICE:
      return tint(127, 188, 211, d * .64 + ((x + 3 * y) % 17 < 2 ? 23 : 0));
    case TILE.GLASS: {
      if (x === 0 || x === 15 || y === 0 || y === 15) return [...tint(134, 193, 203, d * .35), 255];
      if ((x === 1 || x === 14 || y === 1 || y === 14) && h > .26) return [182, 222, 222, 216];
      if ((x + y === 8 && x > 2 && y > 2) || (x + y === 16 && x > 8 && y > 2 && y < 7)) return [200, 238, 234, 190];
      return [130, 193, 201, 0];
    }
    case TILE.PINE_RINGS: {
      const [r,g,b] = texel(TILE.RINGS, x, y);
      return [r - 22, g - 21, b - 14];
    }
    case TILE.PINE_BARK: {
      const [r,g,b] = texel(TILE.BARK, x, y);
      return [r - 15, g - 13, b - 6];
    }
    case TILE.PINE_PLANKS: {
      const [r,g,b] = texel(TILE.PLANKS, x, y);
      return [r - 17, g - 19, b - 10];
    }
    case TILE.TERRACOTTA:
      return tint(184, 111, 77, d * .68 + (y % 6 === 0 ? -8 : 0));
    case TILE.RED_WOOL:
      return tint(181, 73, 71, d * .86 + ((x + y) % 3 ? 0 : 9));
    case TILE.BLUE_WOOL:
      return tint(67, 118, 167, d * .86 + ((x + y) % 3 ? 0 : 9));
    case TILE.COAL_ORE:
    case TILE.COPPER_ORE:
    case TILE.IRON_ORE: {
      const patch = noise(x / 2.9, y / 2.9, tile * 19);
      if ((patch > .61 && h > .14) || (patch > .50 && h > .94)) {
        if (tile === TILE.COAL_ORE) return tint(50, 56, 55, d * .8);
        if (tile === TILE.COPPER_ORE) return tint(198, 119, 75, d * .92 + (h < .31 ? -28 : 10));
        return tint(196, 153, 126, d * .83);
      }
      return texel(TILE.STONE, x, y);
    }
    case TILE.COPPER_BLOCK:
    case TILE.IRON_BLOCK: {
      const rim = x === 0 || y === 0 ? 23 : x === 15 || y === 15 ? -26 : 0;
      const bolt = (x === 2 || x === 13) && (y === 2 || y === 13) ? -27 : 0;
      return tile === TILE.COPPER_BLOCK ? tint(188, 112, 73, d * .48 + rim + bolt) : tint(171, 181, 177, d * .45 + rim + bolt);
    }
    case TILE.SLIME_FACE:
    case TILE.SLIME_SKIN: {
      if (tile === TILE.SLIME_FACE) {
        if ((x >= 3 && x <= 5 || x >= 10 && x <= 12) && y >= 6 && y <= 9) return (y === 6 && (x === 3 || x === 10)) ? [212, 249, 206] : [22, 60, 64];
        if ((x === 7 || x === 8) && y === 11) return [39, 107, 94];
      }
      return tint(96, 181, 147, d * .56 + (x === 0 || y === 0 ? 23 : x === 15 || y > 13 ? -13 : 0));
    }
    default:
      return tint(247, 249, 236, (blocky - .5) * 4);
  }
}

function paintPlant(ctx, tile) {
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  if (tile === TILE.TORCH) {
    rect('#604128', 7, 8, 3, 8); rect('#a47e47', 7, 9, 1, 7);
    rect('#d87638', 6, 6, 5, 4); rect('#ffab4a', 6, 5, 4, 4);
    rect('#ffd782', 7, 4, 3, 3); rect('#fff2af', 8, 3, 1, 3);
    return;
  }
  if (tile === TILE.BERRY_BUSH || tile === TILE.EMPTY_BUSH) {
    rect('#735230', 7, 10, 2, 6);
    rect('#3c6132', 2, 9, 12, 5); rect('#608f3f', 3, 7, 10, 5);
    rect('#7ba347', 5, 5, 6, 3); rect('#507934', 1, 10, 4, 3); rect('#568341', 11, 8, 4, 4);
    rect('#86a953', 4, 7, 3, 1); rect('#628f3f', 7, 11, 3, 3); rect('#94b25b', 9, 6, 1, 2);
    if (tile === TILE.BERRY_BUSH) for (const [x,y] of [[4,9],[8,7],[11,10],[7,11]]) {
      rect('#be404a', x,y,2,2); rect('#f27f68', x,y,1,1);
    }
    return;
  }
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
  if (isPlant(id)) {
    ctx.drawImage(tiles[top], 2, -1, 44, 44);
    return canvas.toDataURL();
  }
  function face(tile, ox, oy, ux, uy, vx, vy, shade = 0) {
    ctx.setTransform(ux / PIXELS, uy / PIXELS, vx / PIXELS, vy / PIXELS, ox, oy);
    ctx.drawImage(tiles[tile], 0, 0);
    if (shade && id !== ID.GLASS) {
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

function resourceIcon(tiles, id) {
  if (id < BLOCKS.length) return blockIcon(tiles, id);
  const image = canvasOf(32,32);
  const ctx = image.getContext('2d');
  const rect = (color,x,y,w,h) => { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); };
  if (id === IT.BERRIES) {
    rect('#5e8a42', 14,5,4,8); rect('#94b854', 18,4,5,4); rect('#77a04b', 9,6,6,4);
    for (const [x,y] of [[6,13],[16,11],[12,20]]) {
      rect('#7a2f40', x,y+1,9,7); rect('#b74554', x+1,y,7,8); rect('#f07871', x+2,y+1,3,2);
    }
  } else if (id === IT.COAL) {
    rect('#26302e',6,13,20,12); rect('#333e3c',9,8,14,16); rect('#4f5853',13,6,7,12); rect('#596360',10,11,5,4); rect('#242c2b',17,19,10,4);
  } else {
    const stone = id === IT.STONE_PICK;
    for (let i = 0; i < 13; i++) {
      rect('#634831', 5+i,23-i,4,4); rect('#ae8254', 5+i,23-i,2,2);
    }
    for (const [x,y] of [[11,4],[15,5],[19,7],[22,10],[24,14]]) {
      rect(stone ? '#68716e' : '#6f5639', x,y,5,5);
      rect(stone ? '#b2bcb2' : '#c4a16a', x,y,5,2);
    }
  }
  return image.toDataURL();
}
