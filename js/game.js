/* Game core: state machine, rules, scoring, ghost scheduling, rendering glue. */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});
  var COLS = PAC.COLS, ROWS = PAC.ROWS, TILE = 16;

  var State = {
    MENU: 'menu',
    LEVEL_INTRO: 'levelIntro',
    PLAY: 'play',
    DEATH: 'death',
    LEVEL_COMPLETE: 'levelComplete',
    GAME_OVER: 'gameOver',
    WIN: 'win',
    PAUSED: 'paused'
  };

  var DIR_BY_NAME = {};
  PAC.DIRS.forEach(function (d) { DIR_BY_NAME[d.name] = d; });

  var LS_HIGH = 'pacman100.high';
  var LS_PROGRESS = 'pacman100.progress';
  /* storage keys kept from the original 100-level build so saved progress survives */

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = new PAC.Sfx();

    this.state = State.MENU;
    this.pauseFrom = State.PLAY;
    this.stateTimer = 0;
    this.time = 0;

    this.level = 1;
    this.score = 0;
    this.lives = 3;
    this.nextExtra = 10000;
    this.high = loadNum(LS_HIGH);
    this.progress = Math.max(1, Math.min(PAC.MAX_LEVEL, loadNum(LS_PROGRESS) || 1));
    this._saveTimer = 2;

    this.maze = null;
    this.cfg = null;
    this.pac = null;
    this.ghosts = [];

    this.mode = 'scatter';
    this.modeIdx = 0;
    this.modeTimer = 0;
    this.roundTime = 0;
    this.frightTimer = 0;
    this.frightCombo = 0;
    this.eaten = 0;
    this.fruitThresholds = [0, 0];
    this.fruitSpawns = 0;
    this.fruit = { active: false, timer: 0, x: 0, y: 0, type: null, value: 0 };
    this.popups = [];
    this.chompAlt = false;
    this.deathProgress = 0;
    this._won = false;

    /* preview maze behind the menu */
    this.prepareLevel(1);
    this.setState(State.MENU);
    this.resize();
  }

  /* ------------------------------------------------------------------ */
  /* Persistence helpers                                                 */
  /* ------------------------------------------------------------------ */

  function loadNum(key) {
    try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; }
  }
  function saveNum(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  Game.prototype.saveHigh = function () { saveNum(LS_HIGH, this.high); };
  Game.prototype.saveProgress = function () { saveNum(LS_PROGRESS, this.progress); };

  /* ------------------------------------------------------------------ */
  /* Level flow                                                          */
  /* ------------------------------------------------------------------ */

  Game.prototype.prepareLevel = function (n) {
    this.cfg = PAC.getLevel(n);
    this.maze = PAC.generateMaze(n, this.cfg.style);
    this.pac = new PAC.Pacman(this.maze);
    this.pac.reset();
    this.pac.speed = this.cfg.pacSpeed;
    this.ghosts = [];
    for (var i = 0; i < 4; i++) {
      var g = new PAC.Ghost(this.maze, i);
      g.reset(this.cfg.releaseScale);
      this.ghosts.push(g);
    }
    this.mode = 'scatter';
    this.modeIdx = 0;
    this.modeTimer = this.cfg.schedule[0];
    this.roundTime = 0;
    this.frightTimer = 0;
    this.frightCombo = 0;
    this.eaten = 0;
    this.fruitSpawns = 0;
    this.fruit.active = false;
    this.fruitThresholds = [
      Math.round(this.maze.pelletTotal * 0.35),
      Math.round(this.maze.pelletTotal * 0.8)
    ];
    this.popups = [];
    this.chompAlt = false;
    this.updateHud();
  };

  Game.prototype.newGame = function (n) {
    this.score = 0;
    this.lives = 3;
    this.nextExtra = 10000;
    this.level = Math.max(1, Math.min(PAC.MAX_LEVEL, n || 1));
    this.prepareLevel(this.level);
    if (this.level > this.progress) { this.progress = this.level; this.saveProgress(); }
    this.sfx.levelStart();
    this.setState(State.LEVEL_INTRO, 2.4);
  };

  Game.prototype.nextLevel = function () {
    if (this.level >= PAC.MAX_LEVEL) { this.win(); return; }
    this.level++;
    if (this.level > this.progress) { this.progress = this.level; this.saveProgress(); }
    this.prepareLevel(this.level);
    this.sfx.levelStart();
    this.setState(State.LEVEL_INTRO, 2.2);
  };

  Game.prototype.levelComplete = function () {
    if (this.state !== State.PLAY) return;
    this._won = this.level >= PAC.MAX_LEVEL;
    this.sfx.levelClear();
    this.setState(State.LEVEL_COMPLETE, 2.4);
  };

  Game.prototype.win = function () {
    this.saveHigh();
    this.progress = PAC.MAX_LEVEL;
    this.saveProgress();
    this.sfx.win();
    this.setState(State.WIN);
  };

  Game.prototype.gameOver = function () {
    this.saveHigh();
    this.sfx.gameOver();
    this.setState(State.GAME_OVER);
  };

  Game.prototype.toMenu = function () {
    this.setState(State.MENU);
  };

  Game.prototype.setState = function (s, timer) {
    this.state = s;
    this.stateTimer = timer || 0;
    if (PAC.UI && PAC.UI.sync) PAC.UI.sync(this);
  };

  Game.prototype.togglePause = function () {
    if (this.state === State.PLAY) {
      this.pauseFrom = State.PLAY;
      this.setState(State.PAUSED);
    } else if (this.state === State.PAUSED) {
      this.setState(this.pauseFrom);
    }
  };

  Game.prototype.toggleMute = function () {
    this.sfx.setMuted(!this.sfx.muted);
    if (PAC.UI && PAC.UI.muteIndicator) PAC.UI.muteIndicator(this.sfx.muted);
    if (!this.sfx.muted) this.sfx.uiClick();
  };

  Game.prototype.input = function (name) {
    if (this.state !== State.PLAY || !this.pac) return;
    var d = DIR_BY_NAME[name];
    if (d) this.pac.nextDir = { x: d.x, y: d.y };
  };

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  Game.prototype.update = function (dt) {
    this.time += dt;
    switch (this.state) {
      case State.PLAY:
        this.updatePlay(dt);
        break;
      case State.LEVEL_INTRO:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.setState(State.PLAY);
        break;
      case State.DEATH:
        this.deathProgress = 1 - Math.max(0, this.stateTimer) / 1.8;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.lives <= 0) {
            this.gameOver();
          } else {
            this.respawn();
          }
        }
        break;
      case State.LEVEL_COMPLETE:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.nextLevel();
        break;
      default:
        break; // menu / pause / game over / win wait for the player
    }
  };

  Game.prototype.updatePlay = function (dt) {
    this.roundTime += dt;

    this.pac.update(dt);
    for (var i = 0; i < this.ghosts.length; i++) this.ghosts[i].update(dt, this);

    if (this.modeTimer !== Infinity) {
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) this.flipMode();
    }
    if (this.frightTimer > 0) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) this.endFright();
    }

    this.checkPellet();
    if (this.state !== State.PLAY) return;

    this.updateFruit(dt);
    this.checkCollisions();
    if (this.state !== State.PLAY) return;

    for (var p = this.popups.length - 1; p >= 0; p--) {
      this.popups[p].life -= dt;
      this.popups[p].y -= dt * 6;
      if (this.popups[p].life <= 0) this.popups.splice(p, 1);
    }

    this._saveTimer -= dt;
    if (this._saveTimer <= 0) {
      this._saveTimer = 2;
      if (this.score > loadNum(LS_HIGH)) this.saveHigh();
    }
  };

  Game.prototype.flipMode = function () {
    this.modeIdx = Math.min(this.modeIdx + 1, this.cfg.schedule.length - 1);
    this.mode = (this.modeIdx % 2 === 0) ? 'scatter' : 'chase';
    this.modeTimer = this.cfg.schedule[this.modeIdx];
    /* ghosts never reverse on a mode change except when frightened (handled elsewhere) */
  };

  Game.prototype.checkPellet = function () {
    var pts = this.maze.eatPellet(this.pac.tileX(), this.pac.tileY());
    if (!pts) return;
    this.eaten++;
    if (pts === 50) {
      this.activateFright();
      this.sfx.powerPellet();
    } else {
      this.sfx.chomp(this.chompAlt);
      this.chompAlt = !this.chompAlt;
    }
    this.addScore(pts);
    this.checkFruitSpawn();
    if (this.maze.pelletTotal <= 0) this.levelComplete();
  };

  Game.prototype.activateFright = function () {
    this.frightTimer = this.cfg.frightenedTime;
    this.frightCombo = 0;
    for (var i = 0; i < this.ghosts.length; i++) {
      var g = this.ghosts[i];
      if (g.state === 'normal') {
        g.frightened = true;
        g.dir = { x: -g.dir.x, y: -g.dir.y }; // classic instant reversal
        g.nextDir = null;
      }
    }
  };

  Game.prototype.endFright = function () {
    this.frightTimer = 0;
    for (var i = 0; i < this.ghosts.length; i++) this.ghosts[i].frightened = false;
  };

  Game.prototype.checkFruitSpawn = function () {
    while (this.fruitSpawns < 2 && this.eaten >= this.fruitThresholds[this.fruitSpawns]) {
      this.fruit.active = true;
      this.fruit.timer = 9.5;
      this.fruit.x = this.maze.fruitTile.x + 0.5;
      this.fruit.y = this.maze.fruitTile.y + 0.5;
      this.fruit.type = this.cfg.fruit;
      this.fruit.value = this.cfg.fruit.value;
      this.fruitSpawns++;
    }
  };

  Game.prototype.updateFruit = function (dt) {
    if (!this.fruit.active) return;
    this.fruit.timer -= dt;
    if (this.fruit.timer <= 0) { this.fruit.active = false; return; }
    var dx = Math.abs(this.fruit.x - this.pac.x);
    if (dx > COLS / 2) dx = COLS - dx;
    var dy = Math.abs(this.fruit.y - this.pac.y);
    if (dx < 0.7 && dy < 0.7) {
      this.fruit.active = false;
      this.addScore(this.fruit.value);
      this.popups.push({ x: this.fruit.x, y: this.fruit.y, text: String(this.fruit.value), life: 1.4 });
      this.sfx.fruit();
    }
  };

  Game.prototype.checkCollisions = function () {
    for (var i = 0; i < this.ghosts.length; i++) {
      var g = this.ghosts[i];
      if (g.state !== 'normal') continue; // house/eyes/transitioning ghosts are harmless
      var dx = Math.abs(g.x - this.pac.x);
      if (dx > COLS / 2) dx = COLS - dx;
      var dy = Math.abs(g.y - this.pac.y);
      if (dx >= 0.6 || dy >= 0.6) continue;
      if (g.frightened) {
        g.frightened = false;
        g.state = 'eyes';
        g.nextDir = null;
        var pts = 200 * Math.pow(2, this.frightCombo);
        this.frightCombo = Math.min(3, this.frightCombo + 1);
        this.addScore(pts);
        this.popups.push({ x: g.x, y: g.y, text: String(pts), life: 1.2 });
        this.sfx.eatGhost();
      } else {
        this.die();
        return;
      }
    }
  };

  Game.prototype.die = function () {
    this.lives--;
    this.pac.dead = true;
    this.deathProgress = 0;
    this.sfx.death();
    this.updateHud();
    this.setState(State.DEATH, 1.8);
  };

  Game.prototype.respawn = function () {
    this.pac.reset();
    for (var i = 0; i < this.ghosts.length; i++) this.ghosts[i].reset(this.cfg.releaseScale);
    this.mode = 'scatter';
    this.modeIdx = 0;
    this.modeTimer = this.cfg.schedule[0];
    this.roundTime = 0;
    this.frightTimer = 0;
    this.frightCombo = 0;
    this.endFright();
    this.sfx.levelStart();
    this.setState(State.LEVEL_INTRO, 2.0);
  };

  Game.prototype.addScore = function (pts) {
    this.score += pts;
    if (this.score > this.high) this.high = this.score;
    while (this.score >= this.nextExtra) {
      this.lives++;
      this.nextExtra += 10000;
      this.sfx.extraLife();
    }
    this.updateHud();
  };

  /* Classic ghost targeting. Scatter corners are used in scatter mode. */
  Game.prototype.getGhostTarget = function (g) {
    if (this.mode === 'scatter') return g.def.scatter;
    var p = this.pac;
    var pt = { x: p.tileX(), y: p.tileY() };
    switch (g.def.name) {
      case 'blinky':
        return pt;
      case 'pinky': {
        var ahead = 4;
        return { x: pt.x + p.dir.x * ahead, y: pt.y + p.dir.y * ahead };
      }
      case 'inky': {
        var blinky = this.ghosts[0];
        var mid = { x: pt.x + p.dir.x * 2, y: pt.y + p.dir.y * 2 };
        return { x: mid.x + (mid.x - blinky.tileX()), y: mid.y + (mid.y - blinky.tileY()) };
      }
      case 'clyde': {
        var dx = g.tileX() - pt.x, dy = g.tileY() - pt.y;
        if (dx * dx + dy * dy > 64) return pt;
        return g.def.scatter;
      }
    }
    return pt;
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  Game.prototype.render = function () {
    var ctx = this.ctx;
    var theme = this.cfg.theme;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);
    if (!this.maze) return;

    var flashing = this.state === State.LEVEL_COMPLETE && Math.floor(this.time * 6) % 2 === 0;
    PAC.Render.maze(ctx, this.maze, theme, flashing);

    if (this.state !== State.LEVEL_COMPLETE) {
      PAC.Render.pellets(ctx, this.maze, theme, this.time);
      if (this.fruit.active) PAC.Render.fruit(ctx, this.fruit);
      var frightFlash = this.frightTimer > 0 && this.frightTimer < 2 && Math.floor(this.time * 8) % 2 === 0;
      for (var i = 0; i < this.ghosts.length; i++) {
        if (this.ghosts[i].visible) PAC.Render.ghost(ctx, this.ghosts[i], frightFlash);
      }
      PAC.Render.pac(ctx, this.pac, this.state === State.DEATH ? this.deathProgress : 0);
    }

    PAC.Render.popups(ctx, this.popups);

    if (this.state === State.LEVEL_INTRO) {
      PAC.Render.centerText(ctx, 'READY!', '#ffe14d',
        'LEVEL ' + this.level + ' · ' + (this.cfg.theme.name || ''), '#7ee8ff');
    } else if (this.state === State.DEATH && this.lives <= 0 && this.stateTimer < 0.9) {
      PAC.Render.centerText(ctx, 'GAME OVER', '#ff4d6a');
    }
  };

  Game.prototype.resize = function () {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    this.canvas.width = COLS * TILE * dpr;
    this.canvas.height = ROWS * TILE * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */

  Game.prototype.updateHud = function () {
    if (typeof document === 'undefined') return;
    setText('hud-score', pad(this.score));
    setText('hud-high', pad(this.high));
    setText('hud-level', String(this.level));
    setText('hud-world', this.cfg ? this.cfg.theme.name : '');
    var lives = document.getElementById('hud-lives');
    if (lives) {
      var html = '';
      for (var i = 0; i < Math.min(9, this.lives); i++) html += '<i class="life"></i>';
      lives.innerHTML = html;
    }
  };

  function pad(n) {
    n = Math.floor(n);
    return n < 100 ? ('0' + n).slice(-2) : String(n);
  }
  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  PAC.Game = Game;
  PAC.State = State;
})(typeof window !== 'undefined' ? window : globalThis);
