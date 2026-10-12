/* Entities: grid-snapped continuous movement + Pac-Man and ghost behaviour.
 *
 * Coordinates are in tile units: tile (c) spans [c, c+1) and its center is c+0.5.
 * Entities always rest on tile centers; movement snaps exactly to the next center
 * so wall stops look flush and turns happen on the grid (classic feel).
 */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});
  var DIRS = PAC.DIRS;
  var HOUSE = PAC.HOUSE;
  var COLS = PAC.COLS;

  /* ------------------------------------------------------------------ */
  /* Base entity with the movement engine                                */
  /* ------------------------------------------------------------------ */

  function Entity(maze) {
    this.maze = maze;
    this.x = 0;
    this.y = 0;
    this.dir = { x: -1, y: 0 };
    this.nextDir = null;
    this.speed = 0;
    this.visible = true;
  }

  Entity.prototype.setTile = function (tx, ty) {
    this.x = tx + 0.5;
    this.y = ty + 0.5;
  };
  Entity.prototype.tileX = function () { return Math.floor(this.x); };
  Entity.prototype.tileY = function () { return Math.floor(this.y); };
  Entity.prototype.atCenter = function () {
    return Math.abs(this.x - (Math.floor(this.x) + 0.5)) < 1e-6 &&
           Math.abs(this.y - (Math.floor(this.y) + 0.5)) < 1e-6;
  };

  /* advance(dt, passable(tx,ty), onCenter(tx,ty), ctx) */
  Entity.prototype.advance = function (dt, passable, onCenter, ctx) {
    var dist = this.speed * dt;
    var guard = 0;
    while (dist > 1e-9 && guard++ < 64) {
      var tx = Math.floor(this.x), ty = Math.floor(this.y);
      var ccx = tx + 0.5, ccy = ty + 0.5;
      var atX = Math.abs(this.x - ccx) < 1e-6, atY = Math.abs(this.y - ccy) < 1e-6;
      if (atX && atY) {
        if (onCenter) onCenter.call(ctx, tx, ty);
        if (this.nextDir && !(this.nextDir.x === this.dir.x && this.nextDir.y === this.dir.y) &&
            passable(tx + this.nextDir.x, ty + this.nextDir.y)) {
          this.dir = this.nextDir;
          this.nextDir = null;
        }
        if (!passable(tx + this.dir.x, ty + this.dir.y)) break; // blocked: rest at center
      }
      var pos = this.dir.x !== 0 ? this.x : this.y;
      var target;
      if (this.dir.x > 0 || this.dir.y > 0) target = Math.floor(pos - 0.5) + 1.5;
      else target = Math.ceil(pos + 0.5) - 1.5;
      var dTo = Math.abs(target - pos);
      var step = dist < dTo ? dist : dTo;
      if (this.dir.x !== 0) this.x += this.dir.x * step; else this.y += this.dir.y * step;
      dist -= step;
      if (this.x < 0) this.x += COLS; else if (this.x >= COLS) this.x -= COLS; // tunnel wrap
    }
  };

  /* ------------------------------------------------------------------ */
  /* Pac-Man                                                             */
  /* ------------------------------------------------------------------ */

  function Pacman(maze) {
    Entity.call(this, maze);
    this.mouth = 0;
    this.moving = false;
    this.dead = false;
  }
  Pacman.prototype = Object.create(Entity.prototype);
  Pacman.prototype.constructor = Pacman;

  Pacman.prototype.reset = function () {
    this.setTile(this.maze.spawn.x, this.maze.spawn.y);
    this.dir = { x: -1, y: 0 };
    this.nextDir = null;
    this.dead = false;
    this.mouth = 0;
  };

  Pacman.prototype.update = function (dt) {
    /* reversing mid-corridor applies instantly */
    if (this.nextDir && this.dir &&
        this.nextDir.x === -this.dir.x && this.nextDir.y === -this.dir.y &&
        (this.dir.x !== 0 || this.dir.y !== 0)) {
      this.dir = this.nextDir;
      this.nextDir = null;
    }
    var self = this;
    var bx = this.x, by = this.y;
    this.advance(dt, function (tx, ty) { return self.maze.passablePac(tx, ty); }, null, null);
    this.moving = (bx !== this.x || by !== this.y);
    if (this.moving) this.mouth = (this.mouth + dt * 8) % 1;
  };

  /* ------------------------------------------------------------------ */
  /* Ghosts                                                              */
  /* ------------------------------------------------------------------ */

  var GHOST_DEFS = [
    { name: 'blinky', color: '#ff2f3e', scatter: { x: COLS - 3, y: 1 },  slotX: 15.5, startsOut: true },
    { name: 'pinky',  color: '#ffb8de', scatter: { x: 2, y: 1 },          slotX: 12.5, startsOut: false },
    { name: 'inky',   color: '#2be0ff', scatter: { x: COLS - 3, y: PAC.ROWS - 2 }, slotX: 10.5, startsOut: false },
    { name: 'clyde',  color: '#ffb32b', scatter: { x: 2, y: PAC.ROWS - 2 },          slotX: 17.5, startsOut: false }
  ];

  function Ghost(maze, index) {
    Entity.call(this, maze);
    this.index = index;
    this.def = GHOST_DEFS[index];
    this.color = this.def.color;
    this.slotX = this.def.slotX;
    this.state = 'house';   // house | leaving | normal | eyes | entering
    this.frightened = false;
    this.releaseAt = 0;
    this.bobPhase = index * 1.7;
    this.game = null;
    this.homeY = HOUSE.bobTop;
  }
  Ghost.prototype = Object.create(Entity.prototype);
  Ghost.prototype.constructor = Ghost;

  Ghost.prototype.reset = function (releaseScale) {
    this.frightened = false;
    this.bobPhase = this.index * 1.7;
    this.homeY = HOUSE.bobTop;
    if (this.def.startsOut) {
      this.state = 'normal';
      this.setTile(HOUSE.exitTile.x, HOUSE.exitTile.y);
      this.dir = { x: -1, y: 0 };
      this.releaseAt = 0;
    } else {
      this.state = 'house';
      this.x = this.slotX;
      this.y = HOUSE.bobTop;
      this.dir = { x: 0, y: -1 };
      this.releaseAt = (this.index * 3) * releaseScale;
    }
    this.nextDir = null;
    this.visible = true;
  };

  function stepAxis(e, target, dt, axis) {
    var pos = axis === 'x' ? e.x : e.y;
    var d = target - pos;
    var step = e.speed * dt;
    if (Math.abs(d) <= step) {
      if (axis === 'x') e.x = target; else e.y = target;
      return true;
    }
    if (axis === 'x') e.x += (d > 0 ? step : -step); else e.y += (d > 0 ? step : -step);
    return false;
  }

  Ghost.prototype.update = function (dt, game) {
    this.game = game;
    var self = this;
    switch (this.state) {
      case 'house': {
        this.speed = game.cfg.ghostSpeed * 0.6;
        this.bobPhase += dt * 3;
        this.x = this.slotX;
        this.y = HOUSE.bobTop + (0.5 + 0.5 * Math.sin(this.bobPhase)) * (HOUSE.bobBottom - HOUSE.bobTop);
        if (game.roundTime >= this.releaseAt) this.state = 'leaving';
        break;
      }
      case 'leaving': {
        this.speed = game.cfg.ghostSpeed * 0.9;
        if (stepAxis(this, 13.5, dt, 'x')) {
          if (stepAxis(this, HOUSE.exitTile.y + 0.5, dt, 'y')) {
            this.state = 'normal';
            this.dir = (this.index % 2 === 0) ? { x: -1, y: 0 } : { x: 1, y: 0 };
            this.nextDir = null;
          }
        }
        break;
      }
      case 'entering': {
        this.speed = game.cfg.eyesSpeed * 0.8;
        if (stepAxis(this, 13.5, dt, 'x')) {
          if (stepAxis(this, HOUSE.bobTop, dt, 'y')) {
            this.state = 'house';
            this.frightened = false;
            this.homeY = HOUSE.bobTop;
            this.releaseAt = game.roundTime + 1.2; // short breather, then out again
          }
        }
        break;
      }
      case 'eyes': {
        this.speed = game.cfg.eyesSpeed;
        this.advance(dt,
          function (tx, ty) { return self.maze.passableGhost(tx, ty, true); },
          self.onCenter, self);
        break;
      }
      default: { // normal (may be frightened)
        this.speed = this.frightened ? game.cfg.frightenedSpeed : game.cfg.ghostSpeed;
        this.advance(dt,
          function (tx, ty) { return self.maze.passableGhost(tx, ty, false); },
          self.onCenter, self);
        break;
      }
    }
  };

  Ghost.prototype.onCenter = function (tx, ty) {
    var game = this.game;
    if (this.state === 'eyes') {
      var gt = HOUSE.gateTile;
      if (tx === gt.x && ty === gt.y) { this.state = 'entering'; return; }
      this.dir = this.pickDir(tx, ty, this.maze.field(gt.x, gt.y, true));
      return;
    }
    /* candidate directions: forward + perpendicular, never a reverse */
    var cands = [];
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i];
      if (d.x === -this.dir.x && d.y === -this.dir.y) continue;
      if (this.maze.passableGhost(tx + d.x, ty + d.y, false)) cands.push(d);
    }
    if (!cands.length) {
      var back = { x: -this.dir.x, y: -this.dir.y };
      if (this.maze.passableGhost(tx + back.x, ty + back.y, false)) this.dir = back;
      return;
    }
    if (this.frightened) {
      var r = cands[Math.floor(Math.random() * cands.length)];
      this.dir = { x: r.x, y: r.y };
      return;
    }
    var target = game.getGhostTarget(this);
    this.dir = this.pickDir(tx, ty, this.maze.field(target.x, target.y, false));
  };

  /* Pick the candidate step that minimises BFS distance to target.
   * cands are evaluated in classic priority order (up, left, down, right),
   * so ties resolve exactly like the arcade game. */
  Ghost.prototype.pickDir = function (tx, ty, field) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i];
      if (d.x === -this.dir.x && d.y === -this.dir.y) continue;
      if (!this.maze.passableGhost(tx + d.x, ty + d.y, this.state === 'eyes')) continue;
      var dd = this.maze.distAt(field, tx + d.x, ty + d.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    if (best) this.dir = { x: best.x, y: best.y };
    return this.dir;
  };

  PAC.Entity = Entity;
  PAC.Pacman = Pacman;
  PAC.Ghost = Ghost;
  PAC.GHOST_DEFS = GHOST_DEFS;
})(typeof window !== 'undefined' ? window : globalThis);
