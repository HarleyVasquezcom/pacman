/* 1000 hand-tuned levels: 100 worlds × 10 levels.
 *
 * Structure
 *   - Every 10 levels form a world; every 10 worlds form an "epoch" (10 epochs total).
 *   - Each world keeps one of 10 base colour themes; each epoch hue-rotates it by 36°,
 *     so world 1 "Neon Blue" becomes "Neon Blue II" in epoch 2 with a fresh palette —
 *     100 visually distinct worlds, no colour repeats until level 1001.
 *   - Difficulty t = (n-1)/999 runs 0 → 1 across the whole game: level 1 is a stroll,
 *     level 100 (the old final) sits at t ≈ 0.1, level 1000 is merciless.
 *
 * What the curve controls
 *   pacSpeed / ghostSpeed     ghosts start well behind you and end nearly level with you
 *   frightenedSpeed           eating ghosts gets harder as you climb
 *   frightenedTime            6.8 s of power at the bottom → 1.6 s at the top
 *   releaseScale              ghosts leave the house almost immediately late on
 *   schedule                  scatter windows shrink, chase windows grow (mostly-chase AI)
 *   eyesSpeed                 eaten ghosts return faster, so the combo window closes sooner
 *   style.loopProb            mazes open up (more lanes, more ambush angles)
 *   style.pelletTarget        denser, longer levels
 *   fruit value               scales with the epoch so bonuses stay worth chasing
 */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});

  var LEVELS_PER_WORLD = 10;
  var LEVELS_PER_EPOCH = 100;         // 10 worlds per epoch
  var EPOCHS = 10;

  /* 10 base themes — one per world inside an epoch. */
  var THEMES = [
    { name: 'Neon Blue',  wall: '#2f4bff', glow: '#4fc3ff', pellet: '#ffd9a0', bg: '#05060f', loop: 0.10, tunnel: true },
    { name: 'Crimson',    wall: '#ff2b52', glow: '#ff7a9a', pellet: '#ffe0b0', bg: '#0d0410', loop: 0.13, tunnel: true },
    { name: 'Emerald',    wall: '#18c96b', glow: '#63ffb0', pellet: '#fff2c0', bg: '#03120a', loop: 0.10, tunnel: false },
    { name: 'Violet',     wall: '#9b3dff', glow: '#d09bff', pellet: '#ffe9ff', bg: '#0a0416', loop: 0.16, tunnel: true },
    { name: 'Amber',      wall: '#ff9a1f', glow: '#ffd27a', pellet: '#fff7d0', bg: '#140a02', loop: 0.14, tunnel: false },
    { name: 'Cyan',       wall: '#1fd6ff', glow: '#a5f3ff', pellet: '#ffffff', bg: '#02101a', loop: 0.18, tunnel: true },
    { name: 'Rose',       wall: '#ff5fa2', glow: '#ffb0d2', pellet: '#ffeef6', bg: '#140410', loop: 0.12, tunnel: true },
    { name: 'Lime',       wall: '#a8ff1f', glow: '#e0ff9c', pellet: '#f4ffd0', bg: '#0a1202', loop: 0.20, tunnel: false },
    { name: 'Orange',     wall: '#ff6a1f', glow: '#ffb07a', pellet: '#ffeeda', bg: '#160602', loop: 0.22, tunnel: true },
    { name: 'Royal Gold', wall: '#ffd21f', glow: '#fff2a5', pellet: '#ffffff', bg: '#100c02', loop: 0.25, tunnel: true }
  ];

  var ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

  var FRUITS = [
    { name: 'cherry',     value: 100,  color: '#ff3040' },
    { name: 'strawberry', value: 300,  color: '#ff4060' },
    { name: 'orange',     value: 500,  color: '#ffa020' },
    { name: 'apple',      value: 700,  color: '#ff2030' },
    { name: 'melon',      value: 1000, color: '#8bff6a' },
    { name: 'bell',       value: 2000, color: '#ffe14d' },
    { name: 'key',        value: 3000, color: '#7ee8ff' }
  ];

  var MAX_LEVEL = 1000;
  var MAX_WORLD = MAX_LEVEL / LEVELS_PER_WORLD; // 100

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ------------------------------------------------------------------ */
  /* Colour helpers: rotate a hex colour around the hue wheel            */
  /* ------------------------------------------------------------------ */

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var t;
    if (h < 60) t = [c, x, 0];
    else if (h < 120) t = [x, c, 0];
    else if (h < 180) t = [0, c, x];
    else if (h < 240) t = [0, x, c];
    else if (h < 300) t = [x, 0, c];
    else t = [c, 0, x];
    function hex(v) {
      var n = Math.round((v + m) * 255);
      n = n < 0 ? 0 : n > 255 ? 255 : n;
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + hex(t[0]) + hex(t[1]) + hex(t[2]);
  }

  function shiftHue(hex, deg) {
    if (!deg) return hex;
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (hsl[1] < 0.02) return hex; // near-grey: nothing meaningful to rotate
    return hslToHex(hsl[0] + deg, hsl[1], hsl[2]);
  }

  /* ------------------------------------------------------------------ */
  /* Worlds: 100 of them (10 base palettes × 10 hue-shifted epochs)      */
  /* ------------------------------------------------------------------ */

  function getWorld(w) {
    w = clamp(w | 0, 0, MAX_WORLD - 1);
    var base = THEMES[w % 10];
    var epoch = Math.floor(w / 10);
    if (epoch === 0) return base;
    var deg = epoch * 36;
    return {
      name: base.name + ROMAN[epoch],
      wall: shiftHue(base.wall, deg),
      glow: shiftHue(base.glow, deg),
      pellet: shiftHue(base.pellet, deg * 0.5), // keep pellets light & readable
      bg: shiftHue(base.bg, deg),
      loop: base.loop,
      tunnel: base.tunnel
    };
  }

  /* ------------------------------------------------------------------ */
  /* Level definitions                                                   */
  /* ------------------------------------------------------------------ */

  function getLevel(n) {
    n = clamp(n | 0, 1, MAX_LEVEL);
    var w = Math.floor((n - 1) / LEVELS_PER_WORLD);       // world index 0..99
    var inWorld = (n - 1) % LEVELS_PER_WORLD;             // 0..9
    var epoch = Math.floor(w / 10);                       // 0..9
    var theme = getWorld(w);
    var t = (n - 1) / (MAX_LEVEL - 1);                    // 0..1 global difficulty

    /* fruit advances one step per epoch, plus a little inside the world */
    var fruitDef = FRUITS[Math.min(FRUITS.length - 1, epoch + Math.floor(inWorld / 3))];
    var fruit = {
      name: fruitDef.name,
      color: fruitDef.color,
      value: Math.round(fruitDef.value * (1 + 0.3 * epoch) / 50) * 50
    };

    return {
      n: n,
      world: w + 1,
      epoch: epoch + 1,
      theme: theme,
      t: t,
      style: {
        /* density is a pure function of difficulty so levels never get shorter
           as you climb — 170 dots at level 1, ~365 at level 1000 */
        loopProb: clamp(theme.loop + epoch * 0.012 + inWorld * 0.005, 0.06, 0.45),
        pelletTarget: clamp(Math.round(170 + 195 * t), 150, 400),
        tunnel: theme.tunnel
      },
      pacSpeed: clamp(7.2 + 2.0 * Math.pow(t, 0.55), 7, 9.2),
      ghostSpeed: clamp(6.3 + 2.8 * Math.pow(t, 0.62), 6, 9.1),
      frightenedSpeed: clamp(4.4 + 1.4 * t, 4.4, 5.8),
      eyesSpeed: 16 + 4 * t,
      frightenedTime: clamp(6.8 - 5.2 * Math.pow(t, 0.55), 1.5, 6.8),
      releaseScale: clamp(1 - 0.85 * Math.pow(t, 0.7), 0.15, 1),
      schedule: [
        Math.max(1.5, 7 - 5.5 * t),     // scatter
        Math.min(45, 16 + 20 * t),      // chase
        Math.max(1, 5 - 4.5 * t),       // scatter
        Math.min(50, 20 + 24 * t),      // chase
        Math.max(0.5, 3 - 2.5 * t),     // scatter
        Infinity                        // final chase
      ],
      fruit: fruit
    };
  }

  PAC.THEMES = THEMES;
  PAC.FRUITS = FRUITS;
  PAC.MAX_LEVEL = MAX_LEVEL;
  PAC.MAX_WORLD = MAX_WORLD;
  PAC.LEVELS_PER_WORLD = LEVELS_PER_WORLD;
  PAC.getLevel = getLevel;
  PAC.getWorld = getWorld;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getLevel: getLevel, getWorld: getWorld,
      THEMES: THEMES, FRUITS: FRUITS,
      MAX_LEVEL: MAX_LEVEL, MAX_WORLD: MAX_WORLD,
      LEVELS_PER_WORLD: LEVELS_PER_WORLD
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
