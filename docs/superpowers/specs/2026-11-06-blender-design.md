# Blender: play any mix of game modes at once

Status: draft for review (not scheduled to build yet).

## Why

The streamer wants to play several modes at the same time — any and all
combinations, not a curated list. Their examples:

- **Shields + Winged** — flying fruits carry their walls, so you can only eat a
  fruit from a specific side.
- **Mines + Twin** — every fruit eaten swaps head and tail *and* lays a mine field.
- **Portal + Walls + Magnet** — every second fruit drops a wall, eating a fruit
  teleports you to its twin, and the fruits are pulled toward the head.

Their principle: *every combination has a logical order with every other one;
it's a matter of working out the logic.* Their worked example (Keys + Box) sets
the pattern for the rest of this document — see "Wrapping order".

## Goals

- Any set of the ten modes can be played together, from one mode to all of them.
- Every combination plays fairly: no soft-locks (a fruit you can never reach),
  no unavoidable deaths, no crashes.
- Each mode keeps its own feel inside a blend — a blend is the modes' rules
  stacked, not a new set of rules.
- A single mode picked through the blender plays exactly like that mode today.

## Non-goals

- New modes, or new rules that only exist inside blends (beyond the glue needed
  to make two rules meet logically, spelled out below).
- Rebalancing existing modes.
- Chat or channel-point control of the blend (there is no `!mode` command today;
  adding one is separate work).

## Anti-goals (a failure even if it "works")

- A blend where the player can get stuck with nothing reachable to eat.
- A blend that silently drops one of the chosen modes because it was hard to
  combine.
- Single-mode play changing behaviour, or existing high scores being lost.

## The modes, by what they do

| Family | Modes | What it controls |
|---|---|---|
| **Wrapping** — what stands between you and the fruit | Keys, Box, Shields, Portal (pairs), Poison (decoys) | How a fruit is presented and unlocked |
| **Movement** — how loose things move | Winged, Magnet | Fruit flies / homes in |
| **On-eat** — what happens when the real fruit is eaten | Twin, Walls, Mines, Portal (teleport) | Consequences of eating |

Classic is "no modes": it isn't selectable in the blender (choosing nothing =
Classic).

## Wrapping order (the core rule)

Every fruit "slot" is built from the outside in. Each wrapping mode in the blend
adds its layer; missing layers are skipped.

```
Keys (lock + key)  →  Box (crate + target)  →  the fruit  →  Shields (on the fruit)
```

- **Keys** is always outermost. A slot starts as a lock (solid, grey, shape)
  plus its key. With **Box** also on, the slot *also* lays out the box's
  target at the start, so three things spawn: key, lock, target (the streamer's
  rule). Eating the key opens the lock and the **box** appears on the lock's
  square; pushing the box onto the target reveals the fruit on the target.
  Without Box, opening the lock reveals the fruit directly (today's Keys mode).
- **Box** without Keys works as today: box + target spawn, push to release.
- **Shields** go on the fruit itself, once it's visible — never on a lock, key,
  box or target. Walls are rolled when the fruit is revealed (5% / 65% / 30%
  for 0 / 1 / 2), with today's fairness rules (never facing the edge or a block,
  never on the side the head is about to come in by, always one open way in).
- **Portal** makes fruit come in linked pairs. With wrapping on, the pair is
  the innermost thing: see Portal pairs below.
- **Poison** adds decoys: see Poison below.

Placement for a slot follows the strictest rule among its layers: a lock that
will become a box needs a box's clear ring; everything keeps SPAWN_CLEARANCE (3)
from the head; locks never wall anything off.

## Movement

- Winged / Magnet move **loose fruit only**: revealed fruit, portal fruit, poison
  decoys. Locks, keys, boxes and targets stay on the grid. *(My call — see
  open question 3.)*
- **Winged + Magnet together:** fruit flies at Winged speed and bounces as
  Winged does, with a gentle Magnet pull (half Magnet's steering). Both modes
  stay recognisable. *(My call.)*
- A flying fruit bounces off everything solid in the blend: snake body, wall
  blocks, boxes, locks, mine flags.
- **Shields on a flying fruit** move with it (fixed to its sides; the fruit
  doesn't rotate). Whether the head can catch it is decided by the side the
  head touches: the side of the fruit facing the head's approach. *(What happens
  on a walled side is open question 1.)*

## On-eat effects

On-eat effects fire only when a **real fruit** is eaten (or caught) — never for
a key, a box push, a poison decoy, or a target. They run in this fixed order:

1. **Score / grow** (+1; a portal pair counts once).
2. **Portal teleport** — the head comes out of the twin.
3. **Twin flip** — tail becomes head (after the teleport, so you flip from where
   you came out).
4. **Walls** — every 2nd fruit drops a wall block.
5. **Mines** — lay a mine field (placed as today: away from the head, flag never
   on the snake).
6. **Refill** — the slot is rebuilt through the wrapping order.

A flying fruit caught between ticks applies its on-eat effects at the next tick
boundary, so a teleport or flip always happens on a whole square.

## Every pair

Ten modes → 45 pairs. "Both apply" means the rules don't touch each other.

| Pair | How they combine |
|---|---|
| Walls + Portal | Both apply. |
| Walls + Winged | Both apply; fruit bounce off wall blocks. |
| Walls + Twin | Both apply. Flip happens before the wall drops; the wall never lands on the two squares ahead of the *new* head. |
| Walls + Magnet | Both apply; fruit bounce off wall blocks. |
| Walls + Box | Walls never land in a box's clear ring or on its target; pushing a box into a wall respawns the box (as today). |
| Walls + Poison | Both apply; the poison wander treats wall blocks as solid (as today). |
| Walls + Mines | Walls never land on a flag; a field may lie over walls. |
| Walls + Keys | Walls and locks are both solid; a wall never walls anything off counting locks (already true). |
| Walls + Shields | Shields never face a wall block (already true). |
| Portal + Winged | Both portal fruits fly. Catching one teleports the head to the square under the twin's centre; if that square is blocked, the nearest free square. |
| Portal + Twin | Teleport, then flip. |
| Portal + Magnet | As Portal + Winged, with Magnet steering. |
| Portal + Box | Box releases one end of a pair on the target; the twin appears at the same moment on a free square (SPAWN_CLEARANCE from the head). |
| Portal + Poison | Poison decoys are single fruit, never pairs. |
| Portal + Mines | Both apply; the teleport exit may be inside a field (it counts as a visit). |
| Portal + Keys | Each end of a pair sits behind its own lock, both locks share one shape, and one key opens both. |
| Portal + Shields | Each end rolls its own walls. You enter one end through an open side; the exit end's walls go with the pair. |
| Winged + Twin | Both apply (flip at the next tick boundary). |
| Winged + Magnet | Winged flight with a gentle Magnet pull (see Movement). |
| Winged + Box | The box doesn't fly; the fruit it releases does, taking off from the target. |
| Winged + Poison | Decoys fly too. |
| Winged + Mines | Fruit bounce off flags (as today) and fly freely over fields. |
| Winged + Keys | Keys stay put (open question 3); the fruit flies once revealed. |
| Winged + Shields | Walls ride on the flying fruit (see Movement). |
| Twin + Magnet | Both apply. |
| Twin + Box | Flip after eating the released fruit. |
| Twin + Poison | Eating poison never flips. |
| Twin + Mines | After a flip the new head may already be in a field: from then on it counts as a visit. |
| Twin + Keys | Eating a key never flips. |
| Twin + Shields | Both apply. |
| Magnet + Box | The released fruit homes in; the box doesn't. |
| Magnet + Poison | Decoys home in too: they're the danger. |
| Magnet + Mines | As Winged + Mines. |
| Magnet + Keys | As Winged + Keys. |
| Magnet + Shields | Walls ride on the homing fruit (open question 1 matters most here). |
| Box + Poison | Decoys stay loose; they're never in a box. |
| Box + Mines | Fields avoid the box's ring and its target; pushing a box onto a flag counts as a bump (respawn). |
| Box + Keys | The streamer's example: key, lock and target spawn; key opens the lock to reveal the box; push it home to reveal the fruit. |
| Box + Shields | Shields roll on the fruit when the box reveals it. |
| Poison + Mines | The poison wander treats flags as solid and never takes a 4th move inside a field. |
| Poison + Keys | Decoys stay loose. The wander treats locks as solid and never eats a key on its own. *(My call.)* |
| Poison + Shields | Decoys get walls too. The wander never enters a fruit through a walled side. |
| Mines + Keys | Flags never on a lock or key; a field may lie over them. |
| Mines + Shields | Both apply. |
| Keys + Shields | Shields roll on the fruit when its lock opens. |

### Poison inside any blend

- Each slot still comes with one poison decoy (fruit count N → N real + N decoys).
- Decoys are always **loose, unwrapped single fruit**: never locked, boxed or
  paired. They do get movement and shields. *(My call — see open question 4.)*
- While poisoned, the wander's "never suicidal" check has to know every deadly
  thing in the blend: walls, locks, flags and field limits, walled fruit sides,
  pushing a box into the body. This is the biggest piece of new logic.

### Notable three-way cases

- **Portal + Twin + Mines** — teleport, flip, then the field is laid; the field
  avoids the *new* head.
- **Keys + Box + Portal** — each lock reveals a box; each box releases one end
  of a pair, and the twin appears on release.
- **Shields + Magnet + Portal** — both ends home in with walls on; catching one
  through an open side teleports you to the other.
- **All ten** — must still be playable: key + lock + target per slot, box
  inside, a portal pair inside that, flying with a pull, walls on the fruit,
  poison decoys, mines and walls on eating, flip after teleport.

## Fruit count

- Fruit count = number of slots (a slot = everything one fruit needs).
- Box today always has exactly one box; in a blend that is open question 2.

## Winning

You win when **any** layer can't place what it needs next (a slot, a box ring,
a mine field, a decoy), or the board is full — the same "no room left" rule each
mode already uses, applied to all of them.

## Settings UI

- A **blender icon** at the end of the game mode row (after "?").
- Clicking it opens a pop-up with every mode's icon (not Classic). Tap to toggle;
  any number from one to all. Done closes it.
- Choosing exactly one mode in the pop-up is the same as picking that mode in
  the row.
- With two or more chosen, the mode row's centre shows the blender icon (with
  a small count badge — *my call*), and the row remembers the blend.
- "?" (random each round) stays a single random mode. *(My call; a "random
  blend" can come later.)*

## High scores

- Kept per board size **and blend**: the chosen modes sorted into one key, e.g.
  `snake.best.medium.box+key`. A one-mode blend uses today's key, so existing
  scores carry over.
- The top-bar crown shows the best for the blend in play.

## Testing

- Every pair (45) and a sample of larger blends get a **fuzz test**: many seeded
  games of random-but-legal play asserting no crash, every slot reachable, no
  unavoidable death at spawn, state invariants (pairs have both ends, keys have
  locks, flags never on the snake, etc.).
- Targeted tests for every row of the pair table whose rule isn't "both apply".
- The poison wander gets its own fuzz across blends (it was the hardest part of
  Poison on its own).

## Left to the builder

- Code structure: most of it is turning the single `mode` into a set of modes
  and the ~20 `mode === '...'` checks into "has mode" checks, plus a slot model
  for the wrapping order.
- Visual details of the pop-up, badge and any new animations (gentle and subtle,
  like the rest of the game).
- Order of building: a sensible path is the mode set + UI first, then pairs
  family by family (on-eat, movement, wrapping), Poison last.

## Open questions (the streamer's call)

1. **A flying fruit's walls:** if the head touches a walled side of a flying
   fruit, is that a death (like a wall), or does the fruit just bounce away?
2. **Box with fruit count above one:** in a blend with Box, does each slot get
   its own box and target, or is it always one at a time (as Box mode is now)?
3. **Keys with Winged / Magnet:** do the keys fly too, or stay put on the grid?
4. **Poison decoys:** always loose single fruit (my default), or wrapped the
   same way as the real fruit (decoy locks, decoy boxes)?
