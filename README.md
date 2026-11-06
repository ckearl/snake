# Snake (Twitch edition — WIP)

Pixel-art snake in plain HTML/JS, no build step. Pick one of 20 fruits and 1/3/5/10/random fruits on the board; pick a board size, board theme, and snake color in Settings.

```sh
npm start   # serves on http://localhost:8080 (needs python3)
npm test    # game-logic + interpolation tests (node --test)
```

Must be served over HTTP (not opened via `file://`) because it uses ES modules.

**Controls:** Arrows / WASD to move · Space or P to pause · Space or Enter right after a game ends to play again (no waiting for the menu) · R to restart · Esc for menu · T show/hide stopwatch · M mute · F fullscreen · C turn chat commands off/on. Settings is seven draggable icon strips, in order: fruit (or the basket = mixed, every fruit a random kind), game mode, fruit count, speed, board size, snake color, board color. A **?** at the end of game mode / fruit count / snake color / board color re-rolls that choice every round; the icon resting in the centre of each strip (full size, the others shrink and fade) is the active choice. Click an icon or use arrow keys too. All saved.
Top bar: score, and — once you've finished a run in that mode (or blend) — a crown with the high score for the mode in play (the moment you beat it the crown hops with a little jingle, and the number turns gold and climbs with you); fullscreen, mute, and close (back to menu). High scores are kept per board size and game mode (or blend).

**Game modes:**
- **Classic** — plain snake.
- **Walls** — every 2nd fruit eaten drops a wall block on a free square. Walls never land right in front of you and never box you in (the open squares always stay connected, with no dead ends). Walls count toward a win, so fewer fruits are needed as they appear.
- **Portals** — fruits come in matched pairs (each pair a different fruit). Eat one end and you come straight out of the other; both fruits stay as the portal ends until your tail is through. Fruit count = number of pairs.
- **Winged** — fruits fly freely around the board, bouncing off the edges and your body. Catch one by touching it with your head.
- **Twin** — every fruit you eat flips the snake: your tail becomes your head and you head off the other way.
- **Magnet** — fruits fly like Winged, but steer toward your head (your body still blocks them).
- **Box** — the fruit is shut in a wooden box. Push the box (head first) onto its target square to release the fruit, then eat it as a separate move — you can leave it there for later. Pushing the box into the edge or a wall knocks it to a new spot (the target stays); pushing it into your own body is a death. Always one box and one target (fruit count is ignored). New boxes land at least 3 squares from your head with all 8 squares around them open; you win once there's no room for another box and target.
- **Poison** — each regular fruit comes with a poison one (the same fruit in the poisoned snake's grey, with green bubbles rising off it; with mixed fruit, regular fruit is never a greyish kind like turnip or mushroom). Poison gives no point and no length: instead it takes the wheel for as many moves as the snake is long. The snake turns grey with dizzy eyes and wanders — straight half the time, left or right a quarter each — but only among moves that are safe (it looks ahead so it never steers into a wall, itself, or a dead end it can't get out of). It flickers back to its colour over the last two moves. Fruit count = regular fruits (with as many poison ones). Fruits land at least 3 squares from your head; you win once there's no room for the next one.
- **Mines** — every fruit you eat lays a 3×3 mine field (dashed outline in a colour complementary to the board) with a flag in the middle. Touch the flag, or let your head spend 4 moves inside a field, and it goes off (a soft pop of smoke and embers, the flag tumbling away); dip in and back out within 3 moves and the field is cleared with a little confetti. The field warms toward red as you linger and blinks on your last safe move. Only the head counts — your body can lie across a field, and a new field may land over your body (never on its flag square), so late in a game a field may show little more than its flag. Fields fit whole on the board, never overlap, land at least 3 squares from your head and away from fruit; fruit avoids fields while there's anywhere else. You win once there's no room for another field.
- **Keys** — every fruit starts shut in a solid grey lock marked with a shape (circle, triangle, square, star, plus, diamond, heart, moon, bolt, drop). Eat the key with the same shape (keys are all one colour, the board's complementary accent, like mine fields) and the lock pops off, then eat the fruit. Keys don't score or grow you; locked squares are solid. One key + lock per fruit count, each pair a different shape; both land at least 3 squares from your head, and a lock never walls anything off (not even once the locks around it have opened). You win once there's no room for another key and lock.
- **Shields** — each fruit has short walls along its sides: usually one (65%), sometimes two (30%), rarely none (5%). Run into one head-on and it's over; eat the fruit through an open side and every wall touching its square goes with it — including a neighbouring fruit's wall on the side they share. Walls only stop the head (your body can slide along them), never face the board edge or a spot right in front of you, and there's always at least one open way in.

**Blender** — the blender at the very end of the game mode row (after **?**) plays several modes at once. Click it to open the pop-up, tap any of the ten modes to put them in or take them out, and tick Done. Choosing none is Classic; choosing one is just that mode; two or more puts the blender in the centre of the row with a little badge saying how many modes are in it. The blend is remembered, and high scores are kept per blend (e.g. Box + Keys has its own crown). **?** still rolls a single mode, and the shuffle button never lands on the blender.

How modes stack in a blend:
- **Wrapping, from the outside in:** Keys (lock + key) → Box (crate + target) → the fruit → Shields. With Keys + Box, each fruit starts as a key, a lock and a target: the key opens the lock to show the box, and the box pushed home lets the fruit out. Walls (Shields) only go on a fruit once it's out. Every fruit (fruit count) gets its own box and target in a blend.
- **Portals** make the fruit a linked pair: with Keys each end has its own lock (same shape) and one key opens both; with Box, the box lets out one end and the twin appears elsewhere at the same moment.
- **Poison** puts one poison fruit beside each fruit. It's always a loose single fruit (never locked, boxed or paired), but it flies and gets walls like the rest. The wander knows about everything in the blend: it never steps into a wall, lock, flag or a fruit's wall, never takes a 4th move inside a mine field, and only eats a key, pushes a box or jumps through a portal when there's no other way.
- **Winged / Magnet** move loose fruit only (fruit that's out, portal fruit, poison); keys, locks, boxes and targets stay put. Both together: Winged's speed with a gentle Magnet pull. A flying fruit keeps its walls: run into a wall and it's over; if the fruit flies into you wall-first, it just bounces off.
- **On eating a fruit**, in order: score, the portal (out of the twin), the Twin flip, the Walls block, the Mines field, then the fruit is replaced. A flying fruit caught between squares does all that on the next square.
- You win once anything in the blend has no room left for its next piece.

The shuffle button at the bottom of Settings randomises every row.

**Board sizes (cols × rows):** Small 10×9 · Medium 17×15 · Large 24×21

**Speed:** 135 ms per tile × multiplier — turtle 1.33 (180 ms), snake 1 (135 ms), bunny 0.67 (90 ms). Movement is smoothly interpolated between tiles.

## Twitch chat
Open the game with `?channel=yourchannel` (e.g. `http://localhost:8080/?channel=ckearl`), or open the
**Stream** panel (speech-bubble button in the top bar, or the broadcast button at the bottom of Settings)
and enter the channel. It reads chat anonymously — no login. The dot on the button is green when
connected. The channel is remembered.

The Stream panel also lets you turn each command on/off and set its cooldown (saved; applies
immediately). Opening it mid-game pauses the game.

All of chat together can run at most **3 commands every 1 minute** (both numbers can be changed at the top of the command list — e.g. 5 every 2 minutes; 0 = no limit),
on top of each command's own cooldown. Anything chat drops in is a bonus: it scores and grows you like any fruit, but the
mode doesn't replace it once eaten, so the mode carries on as normal around it. The drop commands take an optional fruit
(`!box pineapple`, `!fly grape`); without one you get the board's fruit.

| Command | Effect | Default cooldown |
|---|---|---|
| **Drop fruit** (any mode) | | |
| `!fruit {fruit}` | Drops a bonus fruit | 20s |
| `!fly {fruit}` | Drops a bonus winged fruit | 20s |
| `!shield {fruit}` | Drops a bonus fruit with one or two walls on it (Shields mode's fruit) | 30s |
| `!portal {fruit}` | Opens a bonus portal: a linked fruit pair, eat one to come out of the other | 30s |
| `!key {fruit}` | Drops a bonus key and the lock it opens, with the fruit inside (Keys mode) | 30s |
| `!box {fruit}` | Drops a bonus box and its own target; it only opens on that target (Box mode) | 30s |
| `!poison {fruit}` | Drops a bonus fruit and a poison one beside it (Poison mode) | 45s |
| **Hazards** (any mode) | | |
| `!wall` | Adds a wall block (never in front of you, never boxes you in) | 30s |
| `!mine` | Lays a mine field with its flag (Mines mode) | 45s |
| **Snake** | | |
| `!twin` | The next 5 fruits eaten each flip the snake end for end (Twin mode); another `!twin` tops it back up to 5 | 60s |
| `!speed {slow\|normal\|fast\|turtle\|snake\|bunny\|faster\|slower}` | Snake speed for the rest of the round (random if none) | 30s |
| `!color {color}` | Snake colour, e.g. `!color red`, `!color pink to yellow` (random if none) | 15s |
| **Board** | | |
| `!mapcolor {map}` | Board colour, e.g. `!mapcolor volcano` (random if none) | 15s |
| `!fruittype {fruit\|mixed}` | The board's fruit, e.g. `!fruittype kiwi`, `!fruittype basket` for mixed (random if none) | 20s |
| `!size {small\|medium\|large\|bigger\|smaller}` | Changes the board size (random if no size given). Shrinking centres on the head; anything outside is lost | 60s |

Chat drops (and everything else that spawns) keep out of mine fields while there's room elsewhere.

Size, colour, fruit and speed changes from chat last for the current round (or the next, if sent from the menu), then
your own settings come back. A toast credits the viewer for each action. With `?debug`,
`snakeDebug.chat('name', '!wall')` simulates a chat message.

## Layout
- `src/game.js` — pure game state + rules (no DOM). Future Twitch events should mutate state through functions here.
- `src/themes.js` — board themes (Sun, Moon, Snowflake, Volcano, Desert, Forest, Ocean, Space), snake skins (10 solid + 7 two-colour gradients, head → tail).
- `src/pixels.js` — tiny pixel-sprite toolkit.
- `src/fruits.js` — the 20 pixel-art fruit sprites.
- `src/critters.js` — pixel sprites: bunny and turtle speed icons, game mode icons, board theme icons.
- `src/commands.js` — chat command parsing, option matching, cooldowns.
- `src/chat.js` — anonymous read-only Twitch chat (IRC over WebSocket).
- `src/render.js` — canvas drawing: board, snake, orange/crown sprites, menu scene.
- `src/sound.js` — WebAudio blips (eat / die / start / win jingle, a note per turn direction, mode sounds), mute persisted.
- `src/effects.js` — win fireworks, dizzy stars for the loss bonk, confetti for a cleared mine field, the blast when one goes off.
- Tests: `test/game.test.js` (rules), `test/modes.test.js` (walls/portals), `test/box.test.js` (box mode), `test/poison.test.js` (poison mode), `test/mines.test.js` (mines mode), `test/key.test.js` (keys mode), `test/shield.test.js` (shields mode), `test/render.test.js` (smooth movement), `test/actions.test.js` (chat actions), `test/commands.test.js` (commands + IRC parsing), `test/blender.test.js` (blends: how each pair of modes combines), `test/blender-fuzz.test.js` (seeded random games in every pair of modes, bigger blends and all ten, checking the board stays sound after every move).
- `src/main.js` — screens (menu, settings, play), input, game loop, layout.
- `style.css` — layout and UI styling.

## Debugging
Open `http://localhost:8080/?debug` to get `window.snakeDebug` in devtools:
`snakeDebug.game` (live state), `snakeDebug.win()`, `snakeDebug.lose()`, `snakeDebug.chat(user, text)`, `snakeDebug.progress`.

## Credits
- Font: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) by the Pixelify Sans Project Authors, bundled in `fonts/` under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
