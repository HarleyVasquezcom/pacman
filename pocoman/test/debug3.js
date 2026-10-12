'use strict';
var Levels = require('../js/generator.js');
var F = Levels.FLAGS;

var n = +process.argv[2] || 2;
var lvl = Levels.generate(n);
console.log('level', n, 'par', lvl.par, 'solution', JSON.stringify(lvl.solution));
lvl.rows.forEach(function (r) { console.log('  ' + r.replace(/ /g, '.')); });

var p = Levels.parse(Levels.serialize(lvl), n);
var w = p.w, h = p.h;
var goals = [];
for (var i = 0; i < p.cells.length; i++) if (p.cells[i] & F.G) goals.push(i);
console.log('player', p.player, 'boxes', p.boxes, 'goals', goals);

var boxes = {};
p.boxes.forEach(function (b) { boxes[b] = 1; });
var player = p.player, pushes = 0;

function draw(tag) {
  var lines = [];
  for (var y = 0; y < h; y++) {
    var s = '';
    for (var x = 0; x < w; x++) {
      var c = y * w + x, ch;
      if (p.cells[c] & F.W) ch = '#';
      else if (boxes[c]) ch = goals.indexOf(c) >= 0 ? '*' : '$';
      else if (player === c) ch = goals.indexOf(c) >= 0 ? '+' : '@';
      else if (goals.indexOf(c) >= 0) ch = '.';
      else ch = '.';
      s += ch;
    }
    lines.push('    ' + s);
  }
  console.log(tag + '\n' + lines.join('\n'));
}

draw('START');
for (var s = 0; s < p.solution.length; s++) {
  var d = +p.solution.charAt(s);
  var dx = Levels.DIRS[d].dx, dy = Levels.DIRS[d].dy;
  var nx = (player % w) + dx, ny = ((player / w) | 0) + dy;
  var ni = ny * w + nx;
  var label = ['up', 'right', 'down', 'left'][d];
  if (nx < 0 || ny < 0 || nx >= w || ny >= h || (p.cells[ni] & F.W)) {
    console.log('!! step ' + s + ' (' + label + ') from ' + player + ' -> ' + ni + ' : WALL/OOB');
    break;
  }
  if (boxes[ni]) {
    var tx = nx + dx, ty = ny + dy, ti = ty * w + tx;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || (p.cells[ti] & F.W) || boxes[ti]) {
      console.log('!! step ' + s + ' (' + label + ') push of box ' + ni + ' -> ' + ti + ' : BLOCKED');
      break;
    }
    delete boxes[ni]; boxes[ti] = 1; pushes++;
    draw('after step ' + s + ' (' + label + ') PUSH');
  }
  player = ni;
}
var left = Object.keys(boxes).filter(function (b) { return goals.indexOf(+b) < 0; });
console.log(left.length ? 'UNSOVED — boxes off marks: ' + left : 'SOLVED! pushes=' + pushes);
