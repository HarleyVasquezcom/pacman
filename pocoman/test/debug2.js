'use strict';
var Levels = require('../js/generator.js');
var F = Levels.FLAGS;

/* Reproduce the exact level-1 scramble, then trace the solver node by node. */
var lvl = Levels.generate(1);
var p = Levels.parse(Levels.serialize(lvl), 1);
var w = p.w, h = p.h;
console.log('rows'); p.rows.forEach(function (r) { console.log('  ' + r.replace(/ /g, '.')); });
console.log('player', p.player, 'boxes', p.boxes, 'goals', []);
var goals = [];
for (var i = 0; i < p.cells.length; i++) if (p.cells[i] & F.G) goals.push(i);
console.log('goals', goals);

/* --- re-run the solver with instrumentation by copying its core --- */
var DIRS = Levels.DIRS;
var goalSet = {};
goals.forEach(function (g) { goalSet[g] = 1; });
var cells = p.cells, boxes0 = p.boxes, player0 = p.player;

function flood(start, boxArr) {
  var bs = {}; boxArr.forEach(function (b) { bs[b] = 1; });
  return Levels.flood(cells, w, h, start, { has: function (c) { return !!bs[c]; } });
}

var nodes = [{ boxes: boxes0.slice(), player: player0, parent: -1, push: -1, walk: null }];
var head = 0;
while (head < nodes.length && nodes.length < 40) {
  var n = nodes[head++];
  console.log('\nEXPAND #' + (head - 1) + ' boxes=' + n.boxes + ' player=' + n.player);
  var reach = flood(n.player, n.boxes);
  console.log('  reachable: ' + reach.list.join(','));
  for (var bi = 0; bi < n.boxes.length; bi++) {
    var b = n.boxes[bi], bx = b % w, by = (b / w) | 0;
    for (var d = 0; d < 4; d++) {
      var fx = bx - DIRS[d].dx, fy = by - DIRS[d].dy;
      if (fx < 0 || fy < 0 || fx >= w || fy >= h) continue;
      var from = fy * w + fx;
      if (!reach.seen[from]) continue;
      var tx = bx + DIRS[d].dx, ty = by + DIRS[d].dy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      var to = ty * w + tx;
      if ((cells[to] & F.W) || n.boxes.indexOf(to) >= 0) continue;
      var nb = n.boxes.slice(); nb[bi] = to;
      var walk = walkPath(reach.pred, n.player, from);
      var solvedAll = nb.every(function (c) { return goalSet[c]; });
      console.log('  push box ' + b + ' -> ' + to + '  (stand at ' + from + ') walk=' + JSON.stringify(walk) +
        (solvedAll ? '   *** SOLVED ***' : ''));
      nodes.push({ boxes: nb, player: to, parent: head - 1, push: d, walk: walk });
      if (solvedAll) {
        /* reconstruct exactly like the real solver */
        var steps = [], cur = nodes.length - 1;
        while (cur > 0) {
          steps.push(nodes[cur].push);
          if (nodes[cur].walk) for (var q = nodes[cur].walk.length - 1; q >= 0; q--) steps.push(nodes[cur].walk[q]);
          cur = nodes[cur].parent;
        }
        steps.reverse();
        console.log('\nRECONSTRUCTED: ' + steps.join('') + '   pushes=' + steps.filter(function (s, i2) { return false; }).length);
        console.log('replay ->', JSON.stringify(Levels.replay(p, steps.join(''))));
        process.exit(0);
      }
    }
  }
}
console.log('no solution found in trace');

function walkPath(pred, start, target) {
  var path = [], cur = target, guard = 0;
  while (cur !== start) {
    if (++guard > 4096) return null;
    var pv = pred[cur];
    if (pv < 0 || pv === undefined) return null;
    var dx = (cur % w) - (pv % w), dy = ((cur / w) | 0) - ((pv / w) | 0);
    for (var dd = 0; dd < 4; dd++) if (DIRS[dd].dx === dx && DIRS[dd].dy === dy) { path.push(dd); break; }
    cur = pv;
  }
  path.reverse();
  return path;
}
