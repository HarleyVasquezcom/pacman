/* Maze generation: procedural, left/right symmetric, always fully connected.
 *
 * Layout rules (28 x 31 tiles):
 *   - Border of walls, except a side tunnel on the tunnel row (worlds that have one).
 *   - Maze carved with a randomized DFS over odd cells, then extra loops opened.
 *   - Ghost house embedded in the middle with a 2-tile gate on top.
 *   - Forced corridors above and below the house guarantee connectivity.
 *   - The left half is mirrored onto the right half for the classic symmetric look.
 *   - Pellets fill the corridors, trimmed to a per-level target; four corner
 *     pellets become power pellets. Every level seed is validated (all pellets
 *     reachable, gate usable, tunnel open) before it is accepted.
 */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});
  var RNG = PAC.RNG;

  var COLS = 28, ROWS = 31;
  var T = { WALL: 1, PELLET: 2, POWER: 3, EMPTY: 4, GATE: 5 };
  /* classic turn priority: up, left, down, right */
  var DIRS = [
    { x: 0, y: -1, name: 'up' },
    { x: -1, y: 0, name: 'left' },
    { x: 0, y: 1, name: 'down' },
    { x: 1, y: 0, name: 'right' }
  ];

  var HOUSE = {
    x0: 9, y0: 11, x1: 18, y1: 17,   // outer rectangle (walls), interior = +1/-1
    gate: [{ x: 13, y: 11 }, { x: 14, y: 11 }],
    gateTile: { x: 13, y: 11 },      // tile eyes pathfind to
    exitTile: { x: 13, y: 10 },      // first maze tile above the gate
    slots: [10.5, 12.5, 15.5, 17.5], // ghost start x positions inside the house
    bobTop: 13.5,
    bobBottom: 14.5
  };
  var SPAWN = { x: 13, y: 19 };
  var FRUIT_TILE = { x: 13, y: 19 };
  var TUNNEL_ROW = 18;
  var MIN_PELLETS = 120;

  function Maze() {
    this.cols = COLS;
    this.rows = ROWS;
    this.grid = new Uint8Array(COLS * ROWS);
    this.spawn = { x: SPAWN.x, y: SPAWN.y };
    this.fruitTile = { x: FRUIT_TILE.x, y: FRUIT_TILE.y };
    this.tunnelRow = TUNNEL_ROW;
    this.tunnel = true;
    this.pelletTotal = 0;
    this._fields = new Map();
  }

  Maze.prototype.idx = function (x, y) { return y * COLS + x; };

  /* Tile lookup with horizontal wrap (only tunnel rows have open edges). */
  Maze.prototype.tile = function (x, y) {
    if (y < 0 || y >= ROWS) return T.WALL;
    x = ((x % COLS) + COLS) % COLS;
    return this.grid[y * COLS + x];
  };

  Maze.prototype.passablePac = function (x, y) {
    var t = this.tile(x, y);
    return t !== T.WALL && t !== T.GATE;
  };

  Maze.prototype.passableGhost = function (x, y, includeGate) {
    var t = this.tile(x, y);
    if (t === T.WALL) return false;
    if (t === T.GATE && !includeGate) return false;
    return true;
  };

  Maze.prototype.eatPellet = function (x, y) {
    var t = this.tile(x, y);
    if (t === T.PELLET) { this.grid[this.idx(x, y)] = T.EMPTY; this.pelletTotal--; return 10; }
    if (t === T.POWER) { this.grid[this.idx(x, y)] = T.EMPTY; this.pelletTotal--; return 50; }
    return 0;
  };

  /* BFS distance field from a target tile (cached). Returns Int16Array (-1 = unreachable). */
  Maze.prototype.field = function (tx, ty, includeGate) {
    tx = ((tx % COLS) + COLS) % COLS;
    var key = (includeGate ? 'g' : 'p') + ':' + tx + ',' + ty;
    var cached = this._fields.get(key);
    if (cached) return cached;
    var dist = new Int16Array(COLS * ROWS).fill(-1);
    var queue = [this.idx(tx, ty)];
    dist[queue[0]] = 0;
    for (var head = 0; head < queue.length; head++) {
      var cur = queue[head];
      var cx = cur % COLS, cy = (cur / COLS) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = cx + DIRS[d].x, ny = cy + DIRS[d].y;
        if (ny < 0 || ny >= ROWS) continue;
        nx = ((nx % COLS) + COLS) % COLS;
        var ni = ny * COLS + nx;
        if (dist[ni] !== -1) continue;
        var t = this.grid[ni];
        if (t === T.WALL) continue;
        if (t === T.GATE && !includeGate) continue;
        dist[ni] = dist[cur] + 1;
        queue.push(ni);
      }
    }
    if (this._fields.size > 400) this._fields.clear();
    this._fields.set(key, dist);
    return dist;
  };

  Maze.prototype.distAt = function (field, x, y) {
    if (y < 0 || y >= ROWS) return 9999;
    x = ((x % COLS) + COLS) % COLS;
    var v = field[y * COLS + x];
    return v < 0 ? 9999 : v;
  };

  /* ------------------------------------------------------------------ */
  /* Generation                                                          */
  /* ------------------------------------------------------------------ */

  function inHouseRect(x, y) {
    return x >= HOUSE.x0 && x <= HOUSE.x1 && y >= HOUSE.y0 && y <= HOUSE.y1;
  }

  function carve(rng, style) {
    var maze = new Maze();
    var grid = maze.grid;
    grid.fill(T.WALL);

    /* 1. DFS maze over odd cells (cols 1..25, rows 1..29). */
    var start = { x: 1 + 2 * rng.int(13), y: 1 + 2 * rng.int(15) };
    var stack = [start];
    var visited = new Uint8Array(COLS * ROWS);
    visited[maze.idx(start.x, start.y)] = 1;
    grid[maze.idx(start.x, start.y)] = T.EMPTY;
    var nb = [{ x: 0, y: -2 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 2, y: 0 }];
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var opts = [];
      for (var k = 0; k < 4; k++) {
        var nx = cur.x + nb[k].x, ny = cur.y + nb[k].y;
        if (nx < 1 || nx > 25 || ny < 1 || ny > 29) continue;
        if (visited[maze.idx(nx, ny)]) continue;
        opts.push({ x: nx, y: ny });
      }
      if (!opts.length) { stack.pop(); continue; }
      var n = opts[rng.int(opts.length)];
      visited[maze.idx(n.x, n.y)] = 1;
      grid[maze.idx(n.x, n.y)] = T.EMPTY;
      grid[maze.idx((cur.x + n.x) / 2, (cur.y + n.y) / 2)] = T.EMPTY;
      stack.push(n);
    }

    /* 2. Open extra loops so the maze is not a perfect tree (classic feel). */
    for (var y = 2; y <= 28; y++) {
      for (var x = 2; x <= 25; x++) {
        if (grid[maze.idx(x, y)] !== T.WALL) continue;
        if (inHouseRect(x, y)) continue;
        var hor = grid[maze.idx(x - 1, y)] !== T.WALL && grid[maze.idx(x + 1, y)] !== T.WALL &&
                  grid[maze.idx(x, y - 1)] === T.WALL && grid[maze.idx(x, y + 1)] === T.WALL;
        var ver = grid[maze.idx(x, y - 1)] !== T.WALL && grid[maze.idx(x, y + 1)] !== T.WALL &&
                  grid[maze.idx(x - 1, y)] === T.WALL && grid[maze.idx(x + 1, y)] === T.WALL;
        if ((hor || ver) && rng.chance(style.loopProb)) grid[maze.idx(x, y)] = T.EMPTY;
      }
    }

    /* 3. Ghost house. */
    for (var hx = HOUSE.x0; hx <= HOUSE.x1; hx++) {
      grid[maze.idx(hx, HOUSE.y0)] = T.WALL;
      grid[maze.idx(hx, HOUSE.y1)] = T.WALL;
    }
    for (var hy = HOUSE.y0 + 1; hy <= HOUSE.y1 - 1; hy++) {
      grid[maze.idx(HOUSE.x0, hy)] = T.WALL;
      grid[maze.idx(HOUSE.x1, hy)] = T.WALL;
      for (var ix = HOUSE.x0 + 1; ix <= HOUSE.x1 - 1; ix++) grid[maze.idx(ix, hy)] = T.EMPTY;
    }
    for (var g = 0; g < 2; g++) grid[maze.idx(HOUSE.gate[g].x, HOUSE.gate[g].y)] = T.GATE;

    /* 4. Forced corridors around the house (guarantee full connectivity). */
    for (var fx = 8; fx <= 19; fx++) {
      grid[maze.idx(fx, HOUSE.y0 - 1)] = T.EMPTY; // row 10, above the gate
      grid[maze.idx(fx, 19)] = T.EMPTY;           // row 19, below the tunnel row
    }

    /* 5. Side tunnel. */
    maze.tunnel = !!style.tunnel;
    if (maze.tunnel) {
      for (var t1 = 0; t1 <= 3; t1++) grid[maze.idx(t1, TUNNEL_ROW)] = T.EMPTY;
      for (var t2 = COLS - 4; t2 <= COLS - 1; t2++) grid[maze.idx(t2, TUNNEL_ROW)] = T.EMPTY;
    }

    /* 6. Mirror the left half onto the right half. */
    for (var my = 0; my < ROWS; my++) {
      for (var mx = 0; mx <= 13; mx++) grid[my * COLS + (COLS - 1 - mx)] = grid[my * COLS + mx];
    }

    /* 7. Pellets. */
    var pelletTiles = [];
    for (var py = 1; py <= ROWS - 2; py++) {
      for (var px = 1; px <= COLS - 2; px++) {
        if (grid[maze.idx(px, py)] !== T.EMPTY) continue;
        if (inHouseRect(px, py)) continue;
        if (px === SPAWN.x && py === SPAWN.y) continue; // pac start tile stays empty
        if (py === TUNNEL_ROW && (px <= 4 || px >= COLS - 5)) continue; // no pellets in the tunnel
        grid[maze.idx(px, py)] = T.PELLET;
        pelletTiles.push({ x: px, y: py });
      }
    }
    if (pelletTiles.length < MIN_PELLETS) return null;

    /* Trim to the level's pellet target (extra corridors become plain floor). */
    var target = Math.max(MIN_PELLETS, style.pelletTarget | 0);
    while (pelletTiles.length > target) {
      var pick = rng.int(pelletTiles.length);
      var pt = pelletTiles.splice(pick, 1)[0];
      grid[maze.idx(pt.x, pt.y)] = T.EMPTY;
    }

    /* 8. Four corner power pellets (nearest pellet to each corner). */
    var corners = [{ x: 1, y: 1 }, { x: COLS - 2, y: 1 }, { x: 1, y: ROWS - 2 }, { x: COLS - 2, y: ROWS - 2 }];
    var used = [];
    for (var c = 0; c < corners.length; c++) {
      var order = bfsOrder(maze, corners[c].x, corners[c].y);
      var placed = false;
      for (var oi = 0; oi < order.length; oi++) {
        var cell = order[oi];
        if (grid[cell] !== T.PELLET) continue;
        var cxx = cell % COLS, cyy = (cell / COLS) | 0;
        var adjUsed = used.some(function (u) {
          return Math.abs(u.x - cxx) + Math.abs(u.y - cyy) <= 2;
        });
        if (adjUsed) continue;
        grid[cell] = T.POWER;
        used.push({ x: cxx, y: cyy });
        placed = true;
        break;
      }
      if (!placed) return null; // corner situation too weird — retry with another seed
    }

    maze.pelletTotal = pelletTiles.length + 4;
    return maze;
  }

  /* BFS visitation order (non-decreasing distance) over pac-walkable tiles. */
  function bfsOrder(maze, sx, sy) {
    var dist = maze.field(sx, sy, false);
    var order = [];
    var best = [];
    for (var i = 0; i < dist.length; i++) {
      var d = dist[i];
      if (d < 0) continue;
      if (!best[d]) best[d] = [];
      best[d].push(i);
    }
    for (var dd = 0; dd < best.length; dd++) {
      if (best[dd]) order = order.concat(best[dd]);
    }
    return order;
  }

  /* Static validation used by generation retries and the Node test suite. */
  function validate(maze) {
    var reasons = [];
    var reach = maze.field(maze.spawn.x, maze.spawn.y, false);
    var pellets = 0;
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var t = maze.grid[y * COLS + x];
        if (t === T.PELLET || t === T.POWER) {
          pellets++;
          if (reach[y * COLS + x] < 0) {
            reasons.push('unreachable pellet at ' + x + ',' + y);
            return { ok: false, reasons: reasons, pellets: pellets };
          }
        }
      }
    }
    if (pellets < MIN_PELLETS) reasons.push('too few pellets: ' + pellets);
    if (maze.tile(SPAWN.x, SPAWN.y) !== T.EMPTY) reasons.push('spawn tile blocked');
    if (maze.tile(HOUSE.exitTile.x, HOUSE.exitTile.y) === T.WALL) reasons.push('gate exit blocked');
    if (maze.tile(13, 11) !== T.GATE || maze.tile(14, 11) !== T.GATE) reasons.push('gate missing');
    var ghostReach = maze.field(HOUSE.gateTile.x, HOUSE.gateTile.y, true);
    for (var hy = HOUSE.y0 + 1; hy <= HOUSE.y1 - 1; hy++) {
      for (var hx = HOUSE.x0 + 1; hx <= HOUSE.x1 - 1; hx++) {
        if (ghostReach[maze.idx(hx, hy)] < 0) reasons.push('house interior disconnected at ' + hx + ',' + hy);
      }
    }
    if (maze.tunnel && (maze.tile(0, TUNNEL_ROW) === T.WALL || maze.tile(COLS - 1, TUNNEL_ROW) === T.WALL)) {
      reasons.push('tunnel blocked');
    }
    return { ok: reasons.length === 0, reasons: reasons, pellets: pellets };
  }

  /* Generate the maze for a level; retries advance the seed deterministically. */
  function generateMaze(levelNum, style) {
    var base = PAC.hashInt(levelNum * 9301 + 49297);
    var last = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      var rng = new RNG(base + attempt * 7919);
      var maze = carve(rng, style);
      if (!maze) continue;
      var v = validate(maze);
      if (v.ok) return maze;
      last = v;
    }
    throw new Error('maze generation failed for level ' + levelNum +
      (last ? ': ' + last.reasons.slice(0, 3).join('; ') : ''));
  }

  PAC.COLS = COLS;
  PAC.ROWS = ROWS;
  PAC.T = T;
  PAC.DIRS = DIRS;
  PAC.HOUSE = HOUSE;
  PAC.SPAWN = SPAWN;
  PAC.TUNNEL_ROW = TUNNEL_ROW;
  PAC.Maze = Maze;
  PAC.generateMaze = generateMaze;
  PAC.validateMaze = validate;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateMaze: generateMaze, validateMaze: validate, Maze: Maze, T: T };
  }
})(typeof window !== 'undefined' ? window : globalThis);
