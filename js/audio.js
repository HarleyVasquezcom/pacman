/* Tiny WebAudio sound engine — bleeps & jingles, no assets required. */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});

  function Sfx() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('pacman100.muted') === '1';
    } catch (e) { /* storage unavailable */ }
  }

  Sfx.prototype.ensure = function () {
    if (!this.ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { return null; }
    }
    if (this.ctx.state === 'suspended') { this.ctx.resume().catch(function () {}); }
    return this.ctx;
  };

  Sfx.prototype.setMuted = function (m) {
    this.muted = !!m;
    try { localStorage.setItem('pacman100.muted', m ? '1' : '0'); } catch (e) {}
  };

  /* One tone: square/saw blip with optional frequency sweep. */
  Sfx.prototype.tone = function (opts) {
    if (this.muted) return;
    var ctx = this.ensure();
    if (!ctx) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    var vol = opts.vol == null ? 0.08 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.03);
  };

  Sfx.prototype.chomp = function (alt) {
    this.tone({ freq: alt ? 330 : 420, to: alt ? 240 : 300, dur: 0.06, type: 'square', vol: 0.05 });
  };
  Sfx.prototype.powerPellet = function () {
    this.tone({ freq: 200, to: 700, dur: 0.25, type: 'sawtooth', vol: 0.07 });
  };
  Sfx.prototype.eatGhost = function () {
    var self = this;
    [520, 780, 1040].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.08, type: 'square', vol: 0.07, delay: i * 0.06 });
    });
  };
  Sfx.prototype.fruit = function () {
    this.tone({ freq: 660, dur: 0.09, type: 'triangle', vol: 0.08 });
    this.tone({ freq: 990, dur: 0.12, type: 'triangle', vol: 0.08, delay: 0.09 });
  };
  Sfx.prototype.death = function () {
    this.tone({ freq: 620, to: 90, dur: 1.1, type: 'sawtooth', vol: 0.09 });
  };
  Sfx.prototype.extraLife = function () {
    var self = this;
    [660, 880, 1320].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.1, type: 'square', vol: 0.07, delay: i * 0.09 });
    });
  };
  Sfx.prototype.levelStart = function () {
    var self = this;
    [392, 523, 659, 784].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.1, type: 'square', vol: 0.06, delay: i * 0.12 });
    });
  };
  Sfx.prototype.levelClear = function () {
    var self = this;
    [523, 659, 784, 1046, 1318].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.1, type: 'square', vol: 0.07, delay: i * 0.1 });
    });
  };
  Sfx.prototype.gameOver = function () {
    var self = this;
    [392, 330, 262, 196].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.22, type: 'sawtooth', vol: 0.07, delay: i * 0.22 });
    });
  };
  Sfx.prototype.win = function () {
    var self = this;
    [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.14, type: 'square', vol: 0.07, delay: i * 0.13 });
    });
  };
  Sfx.prototype.uiClick = function () {
    this.tone({ freq: 700, to: 500, dur: 0.05, type: 'square', vol: 0.04 });
  };

  PAC.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
