/* Bootstrap: UI overlays, input (keyboard + touch), canvas fit, main loop. */
(function () {
  'use strict';
  var PAC = window.PAC;
  var canvas = document.getElementById('game');
  var game = new PAC.Game(canvas);

  function el(id) { return document.getElementById(id); }

  var OVERLAYS = ['menu', 'levels', 'help', 'pause', 'gameover', 'win'];
  function show(name) {
    OVERLAYS.forEach(function (o) {
      var node = el('screen-' + o);
      if (node) node.classList.toggle('active', o === name);
    });
  }

  var UI = {
    current: 'menu',
    sync: function (g) {
      switch (g.state) {
        case PAC.State.MENU:
          UI.current = 'menu';
          refreshLevelGrid();
          syncContinue();
          show('menu');
          break;
        case PAC.State.PAUSED:
          UI.current = 'pause';
          show('pause');
          break;
        case PAC.State.GAME_OVER:
          UI.current = 'gameover';
          el('go-score').textContent = 'SCORE ' + g.score;
          el('go-level').textContent = 'REACHED LEVEL ' + g.level;
          show('gameover');
          break;
        case PAC.State.WIN:
          UI.current = 'win';
          el('win-score').textContent = 'SCORE ' + g.score;
          el('win-high').textContent = 'HIGH SCORE ' + g.high;
          show('win');
          break;
        default:
          UI.current = null;
          show(null);
          break;
      }
    },
    back: function () {
      if (UI.current === 'levels' || UI.current === 'help') {
        UI.current = 'menu';
        show('menu');
        return;
      }
      if (game.state === PAC.State.PLAY || game.state === PAC.State.PAUSED) game.togglePause();
    },
    muteIndicator: function (muted) {
      el('mute-ind').textContent = muted ? '· muted ·' : '';
    }
  };
  PAC.UI = UI;

  /* ---------- level select: 1000 levels, 100 per page ---------- */
  var grid = el('level-grid');
  var PAGE = 100;
  var PAGES = Math.ceil(PAC.MAX_LEVEL / PAGE);
  var page = 0;

  function buildPage() {
    var first = page * PAGE + 1;
    var last = Math.min(PAC.MAX_LEVEL, page * PAGE + PAGE);
    grid.textContent = '';
    for (var n = first; n <= last; n++) {
      var btn = document.createElement('button');
      btn.className = 'lvl';
      btn.textContent = String(n);
      var theme = PAC.getWorld(Math.floor((n - 1) / PAC.LEVELS_PER_WORLD));
      btn.style.color = theme.wall;
      btn.style.borderColor = theme.wall + '55';
      btn.setAttribute('data-level', String(n));
      grid.appendChild(btn);
    }
    var label = el('pg-label');
    if (label) label.textContent = first + ' – ' + last + ' / ' + PAC.MAX_LEVEL;
    el('pg-prev').disabled = page === 0;
    el('pg-next').disabled = page === PAGES - 1;
    refreshLevelGrid();
  }

  function setPage(p) {
    page = Math.max(0, Math.min(PAGES - 1, p));
    buildPage();
  }

  grid.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute('data-level')) return;
    game.sfx.uiClick();
    game.newGame(parseInt(t.getAttribute('data-level'), 10));
  });

  function refreshLevelGrid() {
    var btns = grid.children;
    for (var i = 0; i < btns.length; i++) {
      var lv = parseInt(btns[i].getAttribute('data-level'), 10);
      btns[i].classList.toggle('done', lv <= game.progress);
      btns[i].classList.toggle('cur', lv === game.level);
    }
  }

  el('pg-prev').addEventListener('click', function () { game.sfx.uiClick(); setPage(page - 1); });
  el('pg-next').addEventListener('click', function () { game.sfx.uiClick(); setPage(page + 1); });

  /* ---------- menu buttons ---------- */
  function syncContinue() {
    var btn = el('btn-continue');
    if (!btn) return;
    btn.classList.toggle('hidden', game.progress <= 1);
    btn.textContent = 'CONTINUE · LEVEL ' + game.progress;
  }
  el('btn-continue').addEventListener('click', function () {
    game.sfx.uiClick();
    game.newGame(game.progress);
  });
  el('btn-start').addEventListener('click', function () { game.sfx.uiClick(); game.newGame(1); });
  el('btn-levels').addEventListener('click', function () {
    game.sfx.uiClick();
    setPage(Math.floor((Math.max(game.level, game.progress) - 1) / PAGE));
    UI.current = 'levels';
    show('levels');
  });
  el('btn-help').addEventListener('click', function () {
    game.sfx.uiClick();
    UI.current = 'help';
    show('help');
  });
  el('btn-levels-back').addEventListener('click', function () { UI.current = 'menu'; show('menu'); });
  el('btn-help-back').addEventListener('click', function () { UI.current = 'menu'; show('menu'); });
  el('btn-resume').addEventListener('click', function () { game.togglePause(); });
  el('btn-quit').addEventListener('click', function () { game.toMenu(); });
  el('btn-retry').addEventListener('click', function () { game.newGame(game.level); });
  el('btn-go-menu').addEventListener('click', function () { game.toMenu(); });
  el('btn-win-menu').addEventListener('click', function () { game.toMenu(); });

  /* ---------- keyboard ---------- */
  var KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (KEY_DIRS[k]) { e.preventDefault(); game.input(KEY_DIRS[k]); return; }
    if (k === 'p' || k === 'P') { game.togglePause(); }
    else if (k === 'm' || k === 'M') { game.toggleMute(); }
    else if (k === 'Escape') { UI.back(); }
    else if (k === 'Enter' || k === ' ') {
      if (game.state === PAC.State.MENU && UI.current === 'menu') {
        e.preventDefault();
        game.sfx.uiClick();
        game.newGame(1);
      } else if (game.state === PAC.State.PAUSED) {
        game.togglePause();
      }
    }
  });

  /* ---------- touch controls ---------- */
  var tbtns = document.querySelectorAll('.tbtn');
  Array.prototype.forEach.call(tbtns, function (b) {
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (b.getAttribute('data-dir')) game.input(b.getAttribute('data-dir'));
      if (b.getAttribute('data-act') === 'pause') game.togglePause();
    });
  });

  var swipeStart = null;
  canvas.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    swipeStart = { x: t.clientX, y: t.clientY };
    game.sfx.ensure();
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (!swipeStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - swipeStart.x, dy = t.clientY - swipeStart.y;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
    if (Math.abs(dx) > Math.abs(dy)) game.input(dx > 0 ? 'right' : 'left');
    else game.input(dy > 0 ? 'down' : 'up');
    swipeStart = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function () { swipeStart = null; });
  canvas.addEventListener('pointerdown', function () { game.sfx.ensure(); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === PAC.State.PLAY) game.togglePause();
  });

  /* ---------- canvas fit ---------- */
  function fit() {
    game.resize();
    var stage = el('stage');
    var maxW = stage.clientWidth - 6;
    var maxH = stage.clientHeight - 6;
    var scale = Math.max(0.3, Math.min(maxW / 448, maxH / 496));
    var w = Math.round(448 * scale), h = Math.round(496 * scale);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    el('frame').style.width = w + 'px';
    el('frame').style.height = h + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- main loop ---------- */
  PAC.game = game; // handy for debugging / automated tests
  UI.sync(game);
  UI.muteIndicator(game.sfx.muted);
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
