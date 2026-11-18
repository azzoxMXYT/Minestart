const FACES = [
  { n: [0, 1, 0], axes: [0, 2], light: 1.11, corners: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]] },
  { n: [0,-1, 0], axes: [0, 2], light: .50, corners: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]] },
  { n: [0, 0, 1], axes: [0, 1], light: .89, corners: [[0,1,1],[1,1,1],[1,0,1],[0,0,1]] },
  { n: [0, 0,-1], axes: [0, 1], light: .68, corners: [[1,1,0],[0,1,0],[0,0,0],[1,0,0]] },
  { n: [1, 0, 0], axes: [1, 2], light: .70, corners: [[1,1,1],[1,1,0],[1,0,0],[1,0,1]] },
  { n: [-1,0, 0], axes: [1, 2], light: .94, corners: [[0,1,0],[0,1,1],[0,0,1],[0,0,0]] },
];
const UV = [[0,0],[1,0],[1,1],[0,1]];
const STRIDE = 9;
const PER_ROW = SIZE / CHUNK;
const HORIZON = [.71, .855, .895];
const GL_VERTEX = `
  attribute vec3 position;
  attribute vec2 uv;
  attribute vec3 light;
  attribute float material;
  uniform mat4 projection;
  varying vec2 vUv;
  varying vec3 vLight;
  varying vec3 vWorld;
  varying float vMaterial;
  void main() {
    vUv = uv; vLight = light; vWorld = position; vMaterial = material;
    gl_Position = projection * vec4(position, 1.0);
  }
`;
const GL_FRAGMENT = `
  precision mediump float;
  uniform sampler2D atlas;
  uniform vec3 eye;
  uniform vec3 fogColor;
  uniform vec2 fogRange;
  uniform float clock;
  varying vec2 vUv;
  varying vec3 vLight;
  varying vec3 vWorld;
  varying float vMaterial;
  void main() {
    float dist = distance(eye, vWorld);
    vec4 texel = texture2D(atlas, vUv);
    if (texel.a < .45) discard;
    vec3 color = texel.rgb * vLight;
    if (vMaterial > .5 && vMaterial < 1.5) {
      vec2 p = floor(vWorld.xz * 16.0) / 16.0;
      vec2 ripple = fract(p * vec2(.43, .69) + vec2(clock * .035, 0.0));
      vec3 lake = texture2D(atlas, vec2(.5625,.5625) + ripple * .125).rgb;
      float bands = sin(p.y * 6.6 + sin(p.x * .48 + clock * .65) * 2.5 + clock * .76);
      float streak = smoothstep(.66, 1.0, bands) * smoothstep(-.3, .8, sin(p.x * 2.15 - p.y + clock * .4));
      color = mix(color, lake * vLight, .74);
      color = mix(color, vec3(.59,.80,.83), .24 * streak + .13 * smoothstep(12.0, 56.0, dist));
    }
    float fog = smoothstep(fogRange.x, fogRange.y, dist);
    if (vMaterial > 1.5 && vMaterial < 2.5) fog = smoothstep(58.0, 200.0, dist) * .56;
    gl_FragColor = vec4(mix(color, fogColor, fog * .86), 1.0);
  }
`;
const SKY_VERTEX = `
  attribute vec2 position;
  varying vec2 screen;
  void main() { screen = position; gl_Position = vec4(position, .9999, 1.0); }
`;
const SKY_FRAGMENT = `
  precision mediump float;
  varying vec2 screen;
  uniform vec3 forward;
  uniform vec3 right;
  uniform vec3 up;
  uniform vec2 lens;
  uniform vec3 horizon;
  uniform float submerged;
  void main() {
    vec3 d = normalize(forward + right * screen.x * lens.x + up * screen.y * lens.y);
    float h = smoothstep(-.11, .52, d.y);
    vec3 sky = mix(horizon, vec3(.32,.64,.88), h);
    float glow = pow(max(0.0, dot(d, normalize(vec3(-.52,.43,-.49)))), 6.0);
    sky = mix(sky, vec3(.92,.93,.79), .20 * glow);
    gl_FragColor = vec4(mix(sky, vec3(.22,.52,.61),submerged), 1.0);
  }
`;
const LINE_VERTEX = `
  attribute vec3 position;
  uniform mat4 projection;
  void main() { gl_Position = projection * vec4(position, 1.0); }
`;
const LINE_FRAGMENT = `precision mediump float; void main() { gl_FragColor = vec4(.91,1.0,.77,.88); }`;

function program(gl, vertex, fragment, attrs, uniforms) {
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(error || 'Shader non disponible');
    }
    return shader;
  }
  const v = compile(gl.VERTEX_SHADER, vertex), f = compile(gl.FRAGMENT_SHADER, fragment);
  const result = gl.createProgram();
  gl.attachShader(result, v); gl.attachShader(result, f); gl.linkProgram(result);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) || 'Programme WebGL non disponible');
  return { glProgram: result,
    attr: Object.fromEntries(attrs.map((name) => [name, gl.getAttribLocation(result, name)])),
    uni: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(result, name)])) };
}

class MeshWriter {
  constructor() { this.pages = []; this.verts = []; this.indices = []; }

  face(corners, tile, light, material, turn = 0, double = false) {
    if (this.verts.length >= 60000 * STRIDE) this.finish();
    const offset = this.verts.length / STRIDE;
    const [u, v] = tileOrigin(tile);
    const pixel = PIXELS / ATLAS_SIZE;
    for (let i = 0; i < 4; i++) {
      const [s, t] = UV[(i + turn) % 4];
      this.verts.push(...corners[i], u + s * pixel, v + t * pixel, ...light[i], material);
    }
    // The brighter diagonal gives smoother joins between ambient-occlusion corners.
    const flip = light[0][0] + light[2][0] > light[1][0] + light[3][0];
    const indices = flip ? [0,3,1,1,3,2] : [0,2,1,0,3,2];
    for (const i of indices) this.indices.push(offset + i);
    if (double) for (let i = indices.length - 1; i >= 0; i--) this.indices.push(offset + indices[i]);
  }

  finish() {
    if (!this.indices.length) return;
    this.pages.push({ verts: new Float32Array(this.verts), indices: new Uint16Array(this.indices) });
    this.verts = [];
    this.indices = [];
  }
}

function occlusion(world, outside, axisA, axisB, corner) {
  const sa = corner[axisA] === 0 ? -1 : 1;
  const sb = corner[axisB] === 0 ? -1 : 1;
  const sample = outside.slice();
  sample[axisA] += sa;
  const a = solid(world.get(...sample));
  sample[axisB] += sb;
  const b2 = solid(world.get(...sample));
  sample[axisA] -= sa;
  const b = solid(world.get(...sample));
  return a && b ? .62 : [1, .90, .77, .62][Number(a) + Number(b) + Number(b2)];
}

function sunShade(world, x, y, z, n) {
  // A few voxel samples cast short, cheap baked shadows under trees and ledges.
  const ox = x + .5 + n[0] * .61, oy = y + .5 + n[1] * .61, oz = z + .5 + n[2] * .61;
  for (let d = 1; d < 9; d++) {
    const id = world.get(Math.floor(ox - d * .65), Math.floor(oy + d * .84), Math.floor(oz + d * .41));
    if (solid(id)) return d <= 3 ? .73 : .83;
  }
  return 1;
}

function terrainMesh(world, cx, cz) {
  const mesh = new MeshWriter();
  for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
    const top = world.tops[x + z * SIZE];
    for (let y = 0; y <= top; y++) {
      const id = world.get(x, y, z);
      if (!id) continue;
      const tile = BLOCKS[id];
      if (isPlant(id)) {
        const shade = sunShade(world, x, y, z, [0,0,0]);
        const power = shade * .99;
        const light = Array(4).fill([power, power, power * .96]);
        const a = .12, b = .88;
        mesh.face([[x+a,y+1,z+a],[x+b,y+1,z+b],[x+b,y,z+b],[x+a,y,z+a]], tile.top, light, 3, 0, true);
        mesh.face([[x+b,y+1,z+a],[x+a,y+1,z+b],[x+a,y,z+b],[x+b,y,z+a]], tile.top, light, 3, 0, true);
        continue;
      }
      for (let i = 0; i < FACES.length; i++) {
        const face = FACES[i], n = face.n;
        const outside = [x + n[0], y + n[1], z + n[2]];
        if (outside[1] < 0) continue;
        const other = world.get(...outside);
        if (solid(other) || (id === ID.WATER && other === ID.WATER)) continue;
        const art = i === 0 ? tile.top : i === 1 ? tile.bottom ?? tile.side : tile.side;
        const water = id === ID.WATER;
        const sun = water || i === 1 ? 1 : sunShade(world, x, y, z, n);
        const grain = hash(x, y, z, 2);
        const variance = id === ID.LEAVES ? .90 + grain * .18 : .96 + grain * .09;
        const l = (water && i === 0 ? 1.035 : face.light) * variance * sun;
        const shade = sun < 1 ? [l * .96,l,l * 1.04] : [l * 1.015,l,l * .953];
        const light = face.corners.map((c) => {
          const ao = occlusion(world, outside, ...face.axes, c);
          return shade.map((s) => s * (water ? mix(ao, 1, .63) : ao));
        });
        const corners = face.corners.map(([vx, vy, vz]) => [x + vx, y + vy - (water ? .12 : 0), z + vz]);
        const turn = i === 0 && (id === ID.GRASS || id === ID.STONE || id === ID.DIRT || id === ID.SAND) ? Math.floor(grain * 4) : 0;
        mesh.face(corners, art, light, water ? 1 : 0, turn);
      }
    }
  }
  mesh.finish();
  return mesh.pages;
}

function skyClouds() {
  const mesh = new MeshWriter();
  const shapes = [
    [-5, 42, 18, 4.0, 3.0, 1.15, ['..##..', '.#####', '######', '..##..']],
    [77, 41.5, 19, 4.0, 2.7, 1.08, ['..###.', '#####.', '.#####', '...##.']],
    [40, 43, -18, 3.3, 2.6, .7, ['.###.', '#####', '..##.']],
    [115, 43, -23, 5, 3.7, 1.2, ['...##..', '.######', '#####..', '..###..']],
    [-35, 41, -30, 4.5, 3.2, .9, ['..###', '#####', '.###.']],
    [29, 48, 66, 3.7, 3.2, .85, ['.###', '####', '##..']],
    [83, 46, 82, 4.0, 3.0, 1.1, ['..###', '#####', '..##.']],
    [9, 44, 100, 4.2, 2.7, 1, ['.#####', '#####.', '...##.']],
  ];
  for (const [ox, y, oz, sx, sz, sy, rows] of shapes) {
    for (let z = 0; z < rows.length; z++) for (let x = 0; x < rows[z].length; x++) {
      if (rows[z][x] !== '#') continue;
      for (let i = 0; i < FACES.length; i++) {
        const { n, corners } = FACES[i];
        if (n[1] === 0 && rows[z + n[2]]?.[x + n[0]] === '#') continue;
        const light = i === 0 ? [1.03,1.025,1.04] : i === 1 ? [.88,.935,1.01] : [.97,.987,1.03];
        mesh.face(corners.map(([a, b, c]) => [ox + (x + a) * sx, y + b * sy, oz + (z + c) * sz]), TILE.CLOUD, Array(4).fill(light), 2);
      }
    }
  }
  mesh.finish();
  return mesh.pages;
}

function viewOf(p, aspect) {
  const eye = [p.x, p.y + EYE, p.z];
  const forward = lookDirection(p);
  const right = [Math.cos(p.yaw), 0, Math.sin(p.yaw)];
  const up = [-right[2] * forward[1], Math.cos(p.pitch), right[0] * forward[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const tanY = Math.max(.515, Math.min(.70, .645 / aspect));
  const tanX = tanY * aspect;
  const near = .045, far = 210, depth = (far + near) / (far - near);
  const de = dot(forward, eye);
  const matrix = new Float32Array(16);
  for (let i = 0; i < 3; i++) {
    matrix[i * 4] = right[i] / tanX;
    matrix[i * 4 + 1] = up[i] / tanY;
    matrix[i * 4 + 2] = forward[i] * depth;
    matrix[i * 4 + 3] = forward[i];
  }
  matrix[12] = -dot(right, eye) / tanX;
  matrix[13] = -dot(up, eye) / tanY;
  matrix[14] = -depth * de - (2 * near * far) / (far - near);
  matrix[15] = -de;
  return { eye, forward, right, up, matrix, lens: [tanX, tanY] };
}

class VoxelRenderer {
  constructor(canvas, art) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL non disponible');
    this.gl = gl;
    this.canvas = canvas;
    this.is3D = true;
    this.blocks = program(gl, GL_VERTEX, GL_FRAGMENT, ['position', 'uv', 'light', 'material'], ['projection', 'atlas', 'eye', 'fogColor', 'fogRange', 'clock']);
    this.sky = program(gl, SKY_VERTEX, SKY_FRAGMENT, ['position'], ['forward', 'right', 'up', 'lens', 'horizon', 'submerged']);
    this.line = program(gl, LINE_VERTEX, LINE_FRAGMENT, ['position'], ['projection']);
    this.screen = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screen);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    this.outline = gl.createBuffer();
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art.atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.clouds = this.upload(skyClouds());
    this.meshes = new Map();
    this.dirty = new Set();
    this.attributes = [];
    gl.clearDepth(1);
    gl.depthFunc(gl.LEQUAL);
  }

  upload(pages) {
    const { gl } = this;
    return pages.map(({ verts, indices }) => {
      const vbo = gl.createBuffer(), ibo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      return { vbo, ibo, count: indices.length };
    });
  }

  drop(pages) {
    for (const { vbo, ibo } of pages) {
      this.gl.deleteBuffer(vbo); this.gl.deleteBuffer(ibo);
    }
  }

  setWorld(world) {
    this.world = world;
    for (const mesh of this.meshes.values()) this.drop(mesh);
    this.meshes.clear(); this.dirty.clear();
    for (let i = 0; i < PER_ROW ** 2; i++) this.dirty.add(i);
  }

  update(x, z) {
    for (let cz = Math.max(0, (z - 7) >> 4); cz <= Math.min(PER_ROW - 1, (z + 7) >> 4); cz++) {
      for (let cx = Math.max(0, (x - 7) >> 4); cx <= Math.min(PER_ROW - 1, (x + 7) >> 4); cx++) this.dirty.add(cx + cz * PER_ROW);
    }
  }

  resize(eco) {
    const { canvas } = this;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const pixelBudget = eco ? 640000 : 1600000;
    const scale = Math.min(eco ? .61 : Math.min(1.25, window.devicePixelRatio || 1), Math.sqrt(pixelBudget / Math.max(1, width * height)));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  use(shader) {
    const { gl } = this;
    for (const attr of this.attributes) gl.disableVertexAttribArray(attr);
    gl.useProgram(shader.glProgram);
    this.attributes = Object.values(shader.attr);
    for (const attr of this.attributes) gl.enableVertexAttribArray(attr);
  }

  drawPages(pages, a) {
    const { gl } = this;
    const bytes = STRIDE * 4;
    for (const { vbo, ibo, count } of pages) {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.vertexAttribPointer(a.position, 3, gl.FLOAT, false, bytes, 0);
      gl.vertexAttribPointer(a.uv, 2, gl.FLOAT, false, bytes, 12);
      gl.vertexAttribPointer(a.light, 3, gl.FLOAT, false, bytes, 20);
      gl.vertexAttribPointer(a.material, 1, gl.FLOAT, false, bytes, 32);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    }
  }

  draw(p, target, now, eco) {
    const { gl, sky, blocks } = this;
    this.resize(eco);
    const v = viewOf(p, this.canvas.width / this.canvas.height);
    const water = this.world.get(...v.eye.map(Math.floor)) === ID.WATER;
    const radius = eco ? 91 : 145;
    for (const i of this.dirty) {
      if (this.meshes.has(i)) this.drop(this.meshes.get(i));
      this.meshes.set(i, this.upload(terrainMesh(this.world, i % PER_ROW, Math.floor(i / PER_ROW))));
    }
    this.dirty.clear();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    this.use(sky);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screen);
    gl.vertexAttribPointer(sky.attr.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(sky.uni.forward, v.forward);
    gl.uniform3fv(sky.uni.right, v.right);
    gl.uniform3fv(sky.uni.up, v.up);
    gl.uniform2fv(sky.uni.lens, v.lens);
    gl.uniform3fv(sky.uni.horizon, HORIZON);
    gl.uniform1f(sky.uni.submerged, water ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    this.use(blocks);
    gl.uniformMatrix4fv(blocks.uni.projection, false, v.matrix);
    gl.uniform3fv(blocks.uni.eye, v.eye);
    gl.uniform3fv(blocks.uni.fogColor, water ? [.22,.53,.61] : HORIZON);
    gl.uniform2fv(blocks.uni.fogRange, water ? [2,19] : [eco ? 28 : 43, radius]);
    gl.uniform1f(blocks.uni.clock, (now / 1000) % 300);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(blocks.uni.atlas, 0);
    this.drawPages(this.clouds, blocks.attr);
    for (const [i, pages] of this.meshes) {
      const dx = i % PER_ROW * CHUNK + CHUNK / 2 - p.x;
      const dz = Math.floor(i / PER_ROW) * CHUNK + CHUNK / 2 - p.z;
      const ahead = dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw);
      const side = Math.abs(dx * v.right[0] + dz * v.right[2]);
      if (ahead < -18 || (Math.abs(p.pitch) < .62 && side > Math.max(ahead, 0) * (v.lens[0] + .35) + 21) || Math.hypot(dx,dz) > radius + 13) continue;
      this.drawPages(pages, blocks.attr);
    }
    if (target) this.drawOutline(target.cell, v.matrix);
  }

  drawOutline([x,y,z], matrix) {
    const { gl, line } = this;
    const e = .003;
    const point = (i) => [x + (i & 1 ? 1 + e : -e), y + (i & 2 ? 1 + e : -e), z + (i & 4 ? 1 + e : -e)];
    const vertices = [];
    for (let i = 0; i < 8; i++) for (let bit = 1; bit <= 4; bit *= 2) if (!(i & bit)) vertices.push(...point(i), ...point(i | bit));
    this.use(line);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.outline);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(line.attr.position, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(line.uni.projection, false, matrix);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, vertices.length / 3);
    gl.disable(gl.BLEND);
  }
}

// Software fallback for browsers where a school or an older GPU disables WebGL.
class MapRenderer {
  constructor(canvas, art) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.tiles = art.tiles;
    this.is3D = false;
    this.hover = null;
  }

  setWorld(world) { this.world = world; }
  update() {}

  layout(p) {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    const tile = clamp(Math.round(w / 41), 13, 24);
    return { w, h, tile, ox: Math.round(w * .5 - p.x * tile), oz: Math.round(h * .67 - p.z * tile) };
  }

  pick(p, point = this.hover) {
    const { ox, oz, tile } = this.layout(p);
    const x = point ? Math.floor((point[0] - ox) / tile) : Math.floor(p.x + 2 * Math.sin(p.yaw));
    const z = point ? Math.floor((point[1] - oz) / tile) : Math.floor(p.z - 2 * Math.cos(p.yaw));
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE || Math.hypot(p.x - x - .5, p.z - z - .5) > REACH) return null;
    let y = this.world.tops[x + z * SIZE];
    while (y > 0 && this.world.get(x,y,z) === ID.WATER) y--;
    const id = this.world.get(x,y,z);
    return { cell: [x,y,z], neighbor: [x,isPlant(id) ? y : y + 1,z], id };
  }

  draw(p, target) {
    const { canvas, ctx, world, tiles } = this;
    const { w, h, tile, ox, oz } = this.layout(p);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#354b2c'; ctx.fillRect(0, 0, w, h);
    for (let z = Math.max(0, Math.floor(-oz / tile)); z < Math.min(SIZE, Math.ceil((h - oz) / tile)); z++) {
      for (let x = Math.max(0, Math.floor(-ox / tile)); x < Math.min(SIZE, Math.ceil((w - ox) / tile)); x++) {
        const y = world.tops[x + z * SIZE], id = world.get(x,y,z);
        const px = ox + x * tile, pz = oz + z * tile;
        ctx.drawImage(tiles[isPlant(id) ? BLOCKS[world.get(x,y - 1,z)].top : BLOCKS[id].top], px, pz, tile, tile);
        if (id === ID.WATER) {
          ctx.fillStyle = '#16455a34';
          ctx.fillRect(px, pz, tile, tile);
        } else {
          const north = z > 0 ? world.tops[x + (z - 1) * SIZE] : y;
          const west = x > 0 ? world.tops[x - 1 + z * SIZE] : y;
          const shadow = clamp(.13 - (y - 16) * .006, 0, .25);
          ctx.fillStyle = `rgba(30,42,24,${shadow})`; ctx.fillRect(px,pz,tile,tile);
          ctx.fillStyle = '#142e16a0';
          if (north > y + Number(isPlant(id))) ctx.fillRect(px,pz,tile,clamp(north - y,1,5));
          if (west > y + Number(isPlant(id))) ctx.fillRect(px,pz,clamp(west - y,1,5),tile);
          if (isPlant(id)) ctx.drawImage(tiles[BLOCKS[id].top], px, pz,tile,tile);
        }
      }
    }
    if (target) {
      ctx.lineWidth = 2; ctx.strokeStyle = '#f2ffca';
      ctx.strokeRect(ox + target.cell[0] * tile + 1, oz + target.cell[2] * tile + 1, tile - 2, tile - 2);
    }
    const x = ox + p.x * tile, z = oz + p.z * tile;
    ctx.save(); ctx.translate(x, z); ctx.rotate(p.yaw);
    ctx.shadowColor = '#101b0ddd'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#e6f8a0'; ctx.strokeStyle = '#263e25'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(8,8); ctx.lineTo(0,5); ctx.lineTo(-8,8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
