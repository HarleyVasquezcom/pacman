/* Seeded RNG utilities — deterministic mazes per level. */
(function (root) {
  'use strict';
  var PAC = (root.PAC = root.PAC || {});

  function hashInt(n) {
    n = n | 0;
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return n >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this._next = mulberry32(hashInt(seed));
  }
  RNG.prototype.float = function () { return this._next(); };
  RNG.prototype.range = function (min, max) { return min + (max - min) * this._next(); };
  RNG.prototype.int = function (n) { return Math.floor(this._next() * n); };
  RNG.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  RNG.prototype.chance = function (p) { return this._next() < p; };

  PAC.hashInt = hashInt;
  PAC.RNG = RNG;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hashInt: hashInt, RNG: RNG };
  }
})(typeof window !== 'undefined' ? window : globalThis);
