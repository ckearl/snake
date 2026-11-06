# Snake (Twitch edition — WIP)

Pixel-art snake in plain HTML/JS, no build step. Pick one of 20 fruits and 1/3/5/10/random fruits on the board; pick a board size, board theme, and snake color in Settings.

```sh
npm start   # serves on http://localhost:8080 (needs python3)
npm test    # game-logic + interpolation tests (node --test)
```

Must be served over HTTP (not opened via `file://`) because it uses ES modules.

**Controls:** Arrows / WASD to move · Space or P to pause · Esc for menu · T show/hide stopwatch · M mute · F fullscreen. Settings is seven draggable icon strips, in order: fruit (or the basket = mixed, every fruit a random kind), game mode, fruit count, speed, board size, snake color, board color. A **?** at the end of game mode / fruit count / snake color / board color re-rolls that choice every round; the icon in the centre frame is the active choice. Click an icon or use arrow keys too. All saved.
Top bar: fullscreen, mute, and close (back to menu).

**Game modes:**
- **Classic** — plain snake.
- **Walls** — every 2nd fruit eaten drops a wall block on a free square. Walls never land right in front of you and never box you in (the open squares always stay connected, with no dead ends). Walls count toward a win, so fewer fruits are needed as they appear.
- **Portals** — fruits come in matched pairs (each pair a different fruit). Eat one end and you come straight out of the other; both fruits stay as the portal ends until your tail is through. Fruit count = number of pairs.
- **Winged** — fruits fly freely around the board, bouncing off the edges and your body. Catch one by touching it with your head.
- **Yin Yang** — every fruit you eat flips the snake: your tail becomes your head and you head off the other way.
- **Magnet** — fruits fly like Winged, but steer toward your head (your body still blocks them).
- **Box** — the fruit is shut in a wooden box. Push the box (head first) onto its target square to release the fruit, then eat it as a separate move — you can leave it there for later. Pushing the box into the edge or a wall knocks it to a new spot (the target stays); pushing it into your own body is a death. Always one box and one target (fruit count is ignored). New boxes land at least 3 squares from your head with all 8 squares around them open; you win once there's no room for another box and target.

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

| Command | Effect | Default cooldown |
|---|---|---|
| `!wall` | Adds a wall block (never in front of you, never boxes you in) — any mode | 2s |
| `!fly` | Adds a bonus winged fruit (not replaced once eaten) — any mode | 2s |
| `!size [small\|medium\|large\|bigger\|smaller]` | Changes the board size (random if no size given). Shrinking centres on the head; anything outside is lost | 8s |
| `!color [name]` | Snake colour, e.g. `!color red`, `!color pink to yellow` (random if none) | 3s |
| `!mapcolor [name]` | Board colour, e.g. `!mapcolor volcano` (random if none) | 3s |
| `!fruit [name\|mixed]` | Fruit type, e.g. `!fruit kiwi`, `!fruit watermelon`, `!fruit basket` for mixed (random if none) | 3s |
| `!speed [slow\|normal\|fast\|turtle\|snake\|bunny\|faster\|slower]` | Snake speed for the rest of the round (random if none) | 5s |

Size, colour, fruit and speed changes from chat last for the current round (or the next, if sent from the menu), then
your own settings come back. A toast credits the viewer for each action. With `?debug`,
`snakeDebug.chat('name', '!wall')` simulates a chat message.

## Layout
- `src/game.js` — pure game state + rules (no DOM). Future Twitch events should mutate state through functions here.
- `src/themes.js` — board themes (Sun, Moon, Snowflake, Volcano, Desert, Forest, Ocean, Space), snake skins (10 solid + 7 two-colour gradients, head → tail), theme icons.
- `src/pixels.js` — tiny pixel-sprite toolkit.
- `src/fruits.js` — the 20 pixel-art fruit sprites.
- `src/critters.js` — bunny and turtle speed icons.
- `src/commands.js` — chat command parsing, option matching, cooldowns.
- `src/chat.js` — anonymous read-only Twitch chat (IRC over WebSocket).
- `src/render.js` — canvas drawing: board, snake, orange/crown sprites, menu scene.
- `src/sound.js` — WebAudio blips (eat / die / start / win jingle), mute persisted.
- `src/effects.js` — win fireworks and dizzy stars for the loss bonk.
- Tests: `test/game.test.js` (rules), `test/modes.test.js` (walls/portals), `test/box.test.js` (box mode), `test/render.test.js` (smooth movement), `test/actions.test.js` (chat actions), `test/commands.test.js` (commands + IRC parsing).
- `src/main.js` — screens (menu, settings, play), input, game loop, layout.
- `style.css` — layout and UI styling.

## Debugging
Open `http://localhost:8080/?debug` to get `window.snakeDebug` in devtools:
`snakeDebug.game` (live state), `snakeDebug.win()`, `snakeDebug.lose()`, `snakeDebug.chat(user, text)`, `snakeDebug.progress`.

## Credits
- Font: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) by the Pixelify Sans Project Authors, bundled in `fonts/` under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
