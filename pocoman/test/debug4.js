'use strict';
/* Walk through the generation pipeline for one level, logging each rejection. */
var L = require('../js/generator.js');
var F = L.FLAGS;
var num = +process.argv[2] || 5;
var cfg = L.tierFor(num);
console.log('level', num, 'tier', cfg.name, 'size', cfg.size, 'boxes', cfg.boxes,
  'pulls', cfg.pulls, 'band', cfg.min + '-' + cfg.max, 'attempts', cfg.attempts);

for (var attempt = 0; attempt < cfg.attempts; attempt++) {
  var rng = new L.constructor; /* placeholder, replaced below */
  rng = new (require('../js/rng.js').RNG)(num * 7919 + attempt * 104729 + 1013);
  var style = cfg.styles[rng.int(cfg.styles.length)];
  var layout = L.makeLayout(rng, cfg, style);
  if (!layout) { console.log('attempt', attempt, style, '-> layout null'); continue; }
  var floors = 0;
  for (var i = 0; i < layout.cells.length; i++) if (!(layout.cells[i] & F.W)) floors++;
  if (floors < cfg.boxes[1] * 3 + 5) { console.log('attempt', attempt, style, '-> too few floor cells', floors); continue; }
  var kBoxes = cfg.boxes[0] + rng.int(cfg.boxes[1] - cfg.boxes[0] + 1);
  var goals = L.pickGoals(layout.cells, layout.w, layout.h, rng, kBoxes, cfg);
  if (!goals) { console.log('attempt', attempt, style, layout.w + 'x' + layout.h, '-> pickGoals null'); continue; }
  var goalSet = {};
  goals.forEach(function (g) { goalSet[g] = 1; layout.cells[g] |= F.G; });
  var scr = L.scramble(rng, cfg, layout, goals, kBoxes, goalSet, null, cfg.pulls);
  if (!scr) { console.log('attempt', attempt, '-> scramble null'); continue; }
  if (scr.boxes.length !== kBoxes) { console.log('attempt', attempt, '-> box count', scr.boxes.length, '!=', kBoxes); continue; }
  if (scr.offGoals < 1) { console.log('attempt', attempt, '-> all boxes back on goals'); continue; }
  var sol = L.solve(scr.cells, scr.w, scr.h, scr.player, scr.boxes, { nodeCap: cfg.solverNodes, timeCap: cfg.solverMs });
  console.log('attempt', attempt, style, layout.w + 'x' + layout.h, 'boxes', scr.boxes.length,
    'offGoals', scr.offGoals, 'pulls', scr.pulls.length,
    'sol:', sol ? ('pushes=' + sol.pushes + ' explored=' + sol.explored) : 'NULL');
  if (sol) {
    var r = L.replay({ w: scr.w, h: scr.h, cells: scr.cells, boxes: scr.boxes, player: scr.player }, sol.steps.join(''));
    console.log('        replay ->', r ? 'OK pushes=' + r.pushes : 'FAILED');
  }
}
