'use strict';
var Levels = require('../js/generator.js');
var F = Levels.FLAGS;

var lvl = Levels.generate(1);
console.log('rows:'); lvl.rows.forEach(function (r) { console.log('  [' + r.replace(/ /g, '·') + ']'); });
console.log('par', lvl.par, 'solution', JSON.stringify(lvl.solution));

var p = Levels.parse(Levels.serialize(lvl), 1);
console.log('parsed player', p.player, 'boxes', p.boxes, 'w,h', p.w, p.h);
var goals = [];
for (var i = 0; i < p.cells.length; i++) if (p.cells[i] & F.G) goals.push(i);
console.log('goals', goals);

/* step through the stored solution */
var boxes = {};
p.boxes.forEach(function (b) { boxes[b] = 1; });
var player = p.player;
for (var s = 0; s < p.solution.length; s++) {
  var d = +p.solution.charAt(s);
  var dx = Levels.DIRS[d].dx, dy = Levels.DIRS[d].dy;
  var nx = (player % p.w) + dx, ny = ((player / p.w) | 0) + dy;
  var ni = ny * p.w + nx;
  var msg = 'step ' + s + ' dir ' + d + ' player ' + player + ' -> ' + ni;
  if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) { console.log(msg + ' OUT OF BOUNDS'); break; }
  if (p.cells[ni] & F.W) { console.log(msg + ' HIT WALL'); break; }
  if (boxes[ni]) {
    var tx = nx + dx, ty = ny + dy, ti = ty * p.w + tx;
    if (tx < 0 || ty < 0 || tx >= p.w || ty >= p.h) { console.log(msg + ' PUSH OUT OF BOUNDS'); break; }
    if ((p.cells[ti] & F.W) || boxes[ti]) { console.log(msg + ' PUSH BLOCKED'); break; }
    delete boxes[ni]; boxes[ti] = 1;
  }
  player = ni;
}
console.log('final boxes', Object.keys(boxes).map(Number), 'goals', goals);

/* fresh solve on the parsed level */
var sol = Levels.solve(p.cells, p.w, p.h, p.player, p.boxes, { nodeCap: 200000, timeCap: 3000 });
console.log('fresh solve:', sol ? { pushes: sol.pushes, len: sol.steps.length, explored: sol.explored } : null);
