/* Canvas rendering: neon maze, pellets, Pac-Man, ghosts, fruit, popups. */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});
  var T = PAC.T, COLS = PAC.COLS, ROWS = PAC.ROWS;
  var TILE = 16;
  var TAU = Math.PI * 2;

  function drawMaze(ctx, maze, theme, flashOn) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = flashOn ? '#ffffff' : theme.wall;
    ctx.shadowColor = flashOn ? '#ffffff' : theme.glow;
    ctx.shadowBlur = 7;
    ctx.beginPath();
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (maze.grid[y * COLS + x] !== T.WALL) continue;
        var cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
        var links = 0;
        if (maze.tile(x, y - 1) === T.WALL) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - TILE / 2); links++; }
        if (maze.tile(x, y + 1) === T.WALL) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + TILE / 2); links++; }
        if (maze.tile(x - 1, y) === T.WALL) { ctx.moveTo(cx, cy); ctx.lineTo(cx - TILE / 2, cy); links++; }
        if (maze.tile(x + 1, y) === T.WALL) { ctx.moveTo(cx, cy); ctx.lineTo(cx + TILE / 2, cy); links++; }
        if (!links) ctx.rect(cx - 3.5, cy - 3.5, 7, 7);
      }
    }
    ctx.stroke();
    /* ghost-house gate */
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffb8de';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(13 * TILE, 11 * TILE + TILE / 2);
    ctx.lineTo(15 * TILE, 11 * TILE + TILE / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPellets(ctx, maze, theme, time) {
    ctx.save();
    ctx.fillStyle = theme.pellet;
    var x, y, t;
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        if (maze.grid[y * COLS + x] !== T.PELLET) continue;
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 1.8, 0, TAU);
        ctx.fill();
      }
    }
    ctx.shadowColor = theme.pellet;
    ctx.shadowBlur = 10;
    var pulse = 3.4 + 1.8 * Math.sin(time * 6);
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        if (maze.grid[y * COLS + x] !== T.POWER) continue;
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, pulse, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function dirAngle(dir) {
    if (!dir) return 0;
    if (dir.x > 0) return 0;
    if (dir.x < 0) return Math.PI;
    if (dir.y > 0) return Math.PI / 2;
    return dir.y < 0 ? -Math.PI / 2 : 0;
  }

  function drawPac(ctx, pac, deathProgress) {
    var px = pac.x * TILE, py = pac.y * TILE;
    var r = TILE / 2 - 1;
    ctx.save();
    ctx.translate(px, py);
    ctx.shadowColor = '#ffcf00';
    ctx.shadowBlur = 9;
    ctx.fillStyle = '#ffe100';
    if (deathProgress > 0) {
      /* death: mouth opens to nothing, then the ball collapses with a spin */
      var p = Math.min(1, deathProgress);
      var half = Math.min(Math.PI, 0.25 + p * 2.6);
      var rr = p > 0.75 ? r * (1 - (p - 0.75) / 0.25) : r;
      ctx.rotate(p * Math.PI * 3);
      if (rr > 0.3) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, rr, half, TAU - half);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      var m = 1 - Math.abs(pac.mouth * 2 - 1);   // 0..1..0
      var halfM = 0.04 + m * 0.30 * Math.PI;
      ctx.rotate(dirAngle(pac.dir));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, halfM, TAU - halfM);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEyes(ctx, px, py, dir) {
    var ox = (dir && dir.x || 0) * 1.6;
    var oy = (dir && dir.y || 0) * 1.6;
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-3, -2.5, 2.5, 3.1, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(3, -2.5, 2.5, 3.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2434ff';
    ctx.beginPath();
    ctx.arc(-3 + ox, -2.5 + oy, 1.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3 + ox, -2.5 + oy, 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawGhost(ctx, g, flash) {
    var px = g.x * TILE, py = g.y * TILE;
    var r = TILE / 2 - 1;
    if (g.state === 'eyes') { drawEyes(ctx, px, py, g.dir); return; }
    var frightened = g.frightened && g.state === 'normal';
    var body = frightened ? (flash ? '#ffffff' : '#2434ff') : g.color;

    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.arc(0, -1.5, r, Math.PI, 0, false);   // head dome
    ctx.lineTo(r, r - 3);
    for (var i = 0; i < 3; i++) {
      var cxb = r - (2 * i + 1) * (r / 3);
      ctx.arc(cxb, r - 3, r / 3, 0, Math.PI, false); // wavy hem
    }
    ctx.lineTo(-r, -1.5);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.shadowColor = body;
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.restore();

    if (frightened) {
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = flash ? '#ff2f3e' : '#ffd8d8';
      ctx.beginPath();
      ctx.arc(-2.6, -2.2, 1.4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(2.6, -2.2, 1.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = flash ? '#ff2f3e' : '#ffd8d8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4.5, 3);
      for (var w = 0; w < 3; w++) {
        var x0 = -4.5 + w * 3;
        ctx.quadraticCurveTo(x0 + 1.5, w % 2 === 0 ? 4.8 : 1.6, x0 + 3, 3);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      drawEyes(ctx, px, py, g.dir);
    }
  }

  function drawFruit(ctx, fruit) {
    var px = fruit.x * TILE, py = fruit.y * TILE;
    var name = fruit.type ? fruit.type.name : 'cherry';
    ctx.save();
    ctx.translate(px, py);
    ctx.shadowColor = fruit.type ? fruit.type.color : '#ff3040';
    ctx.shadowBlur = 8;

    function circle(x, y, rr, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    }
    function stroke(x1, y1, x2, y2, color, w) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w || 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    switch (name) {
      case 'strawberry':
        circle(0, 1.5, 4, '#ff4060');
        stroke(-2.5, -3.5, 0, -2, '#2fd06a', 1.6);
        stroke(2.5, -3.5, 0, -2, '#2fd06a', 1.6);
        circle(-1.5, 1, 0.7, '#ffd0e0');
        circle(1.5, 2.5, 0.7, '#ffd0e0');
        break;
      case 'orange':
        circle(0, 1, 4.2, '#ffa020');
        stroke(0, -3.2, 2.5, -4.5, '#2fd06a', 1.6);
        break;
      case 'apple':
        circle(-1.5, 1.5, 3.6, '#ff2030');
        circle(1.5, 1.5, 3.6, '#e01020');
        stroke(0, -3, 0, -5, '#a06030', 1.6);
        break;
      case 'melon':
        circle(0, 1, 4.4, '#8bff6a');
        stroke(-2.5, -2, -2.5, 4, '#2f9f3f', 1.1);
        stroke(0, -3.4, 0, 5.4, '#2f9f3f', 1.1);
        stroke(2.5, -2, 2.5, 4, '#2f9f3f', 1.1);
        break;
      case 'bell':
        circle(0, 1.2, 3.6, '#ffe14d');
        ctx.fillStyle = '#ffe14d';
        ctx.fillRect(-3.6, -2.6, 7.2, 2.4);
        circle(0, 5, 1.2, '#ffb020');
        break;
      case 'key':
        ctx.strokeStyle = '#7ee8ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, -2, 2.4, 0, TAU);
        ctx.stroke();
        stroke(0, 0.4, 0, 5, '#7ee8ff', 1.6);
        stroke(0, 3, 2, 3, '#7ee8ff', 1.4);
        stroke(0, 4.6, 2, 4.6, '#7ee8ff', 1.4);
        break;
      default: // cherry pair
        circle(-2.8, 2.4, 3.2, '#ff3040');
        circle(3, 3.2, 3, '#e02030');
        stroke(-2.8, -1, 0.5, -5, '#2fd06a', 1.3);
        stroke(3, 0.2, 0.5, -5, '#2fd06a', 1.3);
        break;
    }
    ctx.restore();
  }

  function drawPopups(ctx, popups) {
    ctx.save();
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.6));
      ctx.fillStyle = '#7ee8ff';
      ctx.fillText(p.text, p.x * TILE, p.y * TILE);
    }
    ctx.restore();
  }

  function drawCenterText(ctx, text, color, sub, subColor) {
    ctx.save();
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#ffe14d';
    ctx.shadowColor = color || '#ffe14d';
    ctx.shadowBlur = 12;
    ctx.fillText(text, COLS * TILE / 2, 20.5 * TILE);
    if (sub) {
      ctx.font = '9px Consolas, monospace';
      ctx.shadowBlur = 6;
      ctx.fillStyle = subColor || '#7ee8ff';
      ctx.shadowColor = subColor || '#7ee8ff';
      ctx.fillText(sub, COLS * TILE / 2, 22.5 * TILE);
    }
    ctx.restore();
  }

  PAC.Render = {
    maze: drawMaze,
    pellets: drawPellets,
    pac: drawPac,
    ghost: drawGhost,
    fruit: drawFruit,
    popups: drawPopups,
    centerText: drawCenterText,
    TILE: TILE
  };
})(typeof window !== 'undefined' ? window : globalThis);
