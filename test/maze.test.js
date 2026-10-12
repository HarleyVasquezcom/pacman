/* Node test suite: proves all 1000 levels generate valid, deterministic,
 * distinct, fully-connected mazes with a monotonic easy → hard ramp.
 *
 * Run:  node test/maze.test.js
 */
'use strict';

require('../js/rng.js');
require('../js/maze.js');
require('../js/levels.js');

var PAC = globalThis.PAC;
var failures = [];
var pelletCounts = [];
var prev = null;
var t0 = Date.now();

for (var n = 1; n <= PAC.MAX_LEVEL; n++) {
  var cfg = PAC.getLevel(n);
  var maze;
  try {
    maze = PAC.generateMaze(n, cfg.style);
  } catch (e) {
    failures.push('L' + n + ' generation error: ' + e.message);
    continue;
  }

  var v = PAC.validateMaze(maze);
  if (!v.ok) failures.push('L' + n + ' invalid: ' + v.reasons.slice(0, 4).join('; '));
  pelletCounts.push(maze.pelletTotal);

  /* determinism: same level -> same maze */
  var again = PAC.generateMaze(n, cfg.style);
  var nondet = -1;
  for (var i = 0; i < maze.grid.length; i++) {
    if (maze.grid[i] !== again.grid[i]) { nondet = i; break; }
  }
  if (nondet >= 0) failures.push('L' + n + ' nondeterministic at tile ' + nondet);

  /* variety: no two consecutive levels share a maze */
  if (prev) {
    var identical = true;
    for (var j = 0; j < maze.grid.length; j++) {
      if (maze.grid[j] !== prev.grid[j]) { identical = false; break; }
    }
    if (identical) failures.push('L' + n + ' maze identical to L' + (n - 1));
  }
  prev = maze;

  /* config sanity */
  if (!(cfg.pacSpeed > 0 && cfg.ghostSpeed > 0)) failures.push('L' + n + ' bad speeds');
  if (!(cfg.frightenedTime >= 1.5 && cfg.frightenedTime <= 7)) failures.push('L' + n + ' bad frightenedTime');
  if (!(cfg.releaseScale >= 0.1 && cfg.releaseScale <= 1)) failures.push('L' + n + ' bad releaseScale');
  if (!cfg.fruit || !(cfg.fruit.value > 0)) failures.push('L' + n + ' bad fruit');
  if (!(cfg.style.loopProb >= 0 && cfg.style.loopProb <= 0.5)) failures.push('L' + n + ' bad loopProb');
  if (!(cfg.style.pelletTarget >= 150 && cfg.style.pelletTarget <= 400)) failures.push('L' + n + ' bad pelletTarget');
}

pelletCounts.sort(function (a, b) { return a - b; });

/* ------------------------------------------------------------------ */
/* Difficulty must ramp monotonically across all 1000 levels          */
/* ------------------------------------------------------------------ */
var prevCfg = null;
for (var m = 1; m <= PAC.MAX_LEVEL; m++) {
  var c = PAC.getLevel(m);
  if (prevCfg) {
    if (c.ghostSpeed < prevCfg.ghostSpeed) failures.push('L' + m + ' ghost speed dips');
    if (c.pacSpeed < prevCfg.pacSpeed) failures.push('L' + m + ' pac speed dips');
    if (c.frightenedTime > prevCfg.frightenedTime) failures.push('L' + m + ' fright time grows');
    if (c.releaseScale > prevCfg.releaseScale) failures.push('L' + m + ' release loosens');
    if (c.style.pelletTarget < prevCfg.style.pelletTarget) failures.push('L' + m + ' pellet target drops');
    if (!(c.schedule[1] >= prevCfg.schedule[1])) failures.push('L' + m + ' chase window shrinks');
  }
  prevCfg = c;
}

var l1 = PAC.getLevel(1), l1000 = PAC.getLevel(PAC.MAX_LEVEL);
if (!(l1000.ghostSpeed > l1.ghostSpeed)) failures.push('ghost speed does not ramp');
if (!(l1000.frightenedTime < l1.frightenedTime)) failures.push('frightened time does not shrink');
if (!(l1000.pacSpeed >= l1.pacSpeed)) failures.push('pac speed does not ramp');
if (!(l1000.releaseScale < l1.releaseScale)) failures.push('ghost releases do not tighten');

/* ------------------------------------------------------------------ */
/* 100 worlds: distinct names and palettes                             */
/* ------------------------------------------------------------------ */
var names = {}, walls = {};
for (var w = 0; w < PAC.MAX_WORLD; w++) {
  var th = PAC.getWorld(w);
  if (names[th.name]) failures.push('duplicate world name "' + th.name + '" (world ' + (w + 1) + ')');
  if (walls[th.wall]) failures.push('duplicate wall colour ' + th.wall + ' (world ' + (w + 1) + ')');
  names[th.name] = 1;
  walls[th.wall] = 1;
}

console.log('levels checked : ' + PAC.MAX_LEVEL + '  (' + (Date.now() - t0) + ' ms)');
console.log('worlds checked : ' + PAC.MAX_WORLD);
console.log('pellets min/med/max : ' + pelletCounts[0] + ' / ' +
  pelletCounts[Math.floor(pelletCounts.length / 2)] + ' / ' +
  pelletCounts[pelletCounts.length - 1]);
console.log('speed L1 -> L' + PAC.MAX_LEVEL + ' : pac ' + l1.pacSpeed.toFixed(2) + '->' + l1000.pacSpeed.toFixed(2) +
  ', ghost ' + l1.ghostSpeed.toFixed(2) + '->' + l1000.ghostSpeed.toFixed(2) +
  ', fright ' + l1.frightenedTime.toFixed(1) + 's->' + l1000.frightenedTime.toFixed(1) + 's' +
  ', release ' + l1.releaseScale.toFixed(2) + '->' + l1000.releaseScale.toFixed(2));

if (failures.length) {
  console.log('\nFAILURES (' + failures.length + '):');
  failures.slice(0, 40).forEach(function (f) { console.log('  ' + f); });
  process.exit(1);
}
console.log('\nALL ' + PAC.MAX_LEVEL + ' LEVELS OK');
