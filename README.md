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

The shuffle button at the bottom of Settings randomises every row.

**Board sizes (cols × rows):** Small 10×9 · Medium 17×15 · Large 24×21

**Speed:** 135 ms per tile × multiplier — turtle 1.33 (180 ms), snake 1 (135 ms), bunny 0.67 (90 ms). Movement is smoothly interpolated between tiles.

## Layout
- `src/game.js` — pure game state + rules (no DOM). Future Twitch events should mutate state through functions here.
- `src/themes.js` — board themes (Sun, Moon, Snowflake, Volcano, Desert, Forest, Ocean, Space), snake skins (10 solid + 7 two-colour gradients, head → tail), theme icons.
- `src/pixels.js` — tiny pixel-sprite toolkit.
- `src/fruits.js` — the 20 pixel-art fruit sprites.
- `src/critters.js` — bunny and turtle speed icons.
- `src/render.js` — canvas drawing: board, snake, orange/crown sprites, menu scene.
- `src/sound.js` — WebAudio blips (eat / die / start / win jingle), mute persisted.
- `src/effects.js` — win fireworks and dizzy stars for the loss bonk.
- Tests: `test/game.test.js` (rules), `test/modes.test.js` (walls/portals), `test/render.test.js` (smooth movement).
- `src/main.js` — screens (menu, settings, play), input, game loop, layout.
- `style.css` — layout and UI styling.

## Debugging
Open `http://localhost:8080/?debug` to get `window.snakeDebug` in devtools:
`snakeDebug.game` (live state), `snakeDebug.win()`, `snakeDebug.lose()`.

## Credits
- Font: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) by the Pixelify Sans Project Authors, bundled in `fonts/` under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
