# PAC-MAN · 1000 Levels

A complete, zero-dependency Pac-Man game with **1000 playable levels**, built in plain
HTML5 canvas + JavaScript. Every level has its own procedurally generated, fully
validated maze — all reachable, all distinct, all deterministic (level 37 always
looks the same).

## Run it

**Option A — just double-click** `index.html` (works from `file://`, no server needed).

**Option B — local server:**

```
node serve.js          # then open http://localhost:8080
```

**Option C — any static server** (`python -m http.server`, `npx serve`, …).

## How to play

| Control | Action |
| --- | --- |
| ← ↑ → ↓ / W A S D | Move |
| P | Pause / resume |
| M | Mute / unmute |
| Esc | Back / pause |
| Enter or Space | Start game |
| Touch | Swipe on the maze or use the on-screen pad |

- Eat **every dot** to clear a level; the big **power pellets** turn ghosts blue and edible.
- Ghost combo while a power pellet lasts: **200 → 400 → 800 → 1600**.
- A **bonus fruit** appears twice per level (cherry → key; its value grows every epoch).
- 3 lives, +1 every 10,000 points. Clear level 1000 to win the game.

## The 1000 levels

- **100 worlds × 10 levels**, grouped into **10 epochs of 10 worlds**.
- Each world has a neon colour theme. The ten base palettes (Neon Blue, Crimson,
  Emerald … Royal Gold) are **hue-rotated by 36° per epoch**, so world 11 is
  "Neon Blue II" in a fresh palette and all 100 worlds have unique names and colours.
- Difficulty `t = (n-1)/999` runs 0 → 1 across the game — level 1 is a stroll,
  level 100 (the old final) is only ~10 % of the way, level 1000 is merciless:

  | Knob | Level 1 | Level 1000 |
  | --- | --- | --- |
  | Pac-Man speed | 7.20 | 9.20 |
  | Ghost speed | 6.30 | 9.10 |
  | Power-pellet window | 6.8 s | 1.6 s |
  | Ghost house release | 1.00× | 0.15× (almost immediate) |
  | Scatter / chase | 7 s / 16 s | 1.5 s / 45 s (mostly chase) |
  | Dots per level | ~170 | ~365 |

- Mazes open up as you climb (`loopProb` 0.10 → 0.45): more lanes, more ambush angles.
- **Level Select** pages 100 levels at a time (10 pages, arrows ‹ ›); it opens on your
  current page and stars every level you have reached. **Continue** on the menu jumps
  straight to your furthest level.
- Progress, high score and mute state persist in `localStorage`.

## Verify the levels (dev)

```
node test/maze.test.js
```

Checks all 1000 mazes for: full pellet reachability, valid ghost house/gate, tunnel
openness, determinism, level-to-level variety, pellet-count range — plus a monotonic
easy→hard ramp (speeds up, fright window and release tighten every level) and 100
distinct world names/colours. Runs in under 2 seconds.

## Code layout

```
index.html      shell, HUD, overlays, level-select pager
style.css       arcade look, responsive layout, touch pad
js/rng.js       seeded RNG (deterministic mazes)
js/maze.js      maze generator + BFS validation + distance fields
js/levels.js    the 1000 level definitions (speeds, themes, styles, hue rotation)
js/entities.js  movement engine, Pac-Man, 4 ghost AIs (Blinky/Pinky/Inky/Clyde)
js/render.js    canvas renderer
js/game.js      game state machine, scoring, fruit, collisions
js/main.js      UI, input, main loop
test/           node test suite
```
