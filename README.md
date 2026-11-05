# Snake (Twitch edition — WIP)

Pixel-art snake in plain HTML/JS, no build step. Pick one of 20 fruits and 1/3/5/10/random fruits on the board; pick a board size, board theme, and snake color in Settings.

```sh
npm start   # serves on http://localhost:8080 (needs python3)
npm test    # game-logic + interpolation tests (node --test)
```

Must be served over HTTP (not opened via `file://`) because it uses ES modules.

**Controls:** Arrows / WASD to move · Space or P to pause · Esc for menu · T show/hide stopwatch · M mute · F fullscreen. Settings is six draggable icon strips (board size, board theme, snake color, fruit, fruit count, speed); the icon in the centre frame is the active choice. Click an icon or use arrow keys too. All saved.
Top bar: fullscreen, mute, and close (back to menu).

**Board sizes (cols × rows):** Small 9×10 · Medium 15×17 · Large 21×24

**Speed:** 135 ms per tile × multiplier — turtle 1.33 (180 ms), snake 1 (135 ms), bunny 0.67 (90 ms). Movement is smoothly interpolated between tiles.

## Layout
- `src/game.js` — pure game state + rules (no DOM). Future Twitch events should mutate state through functions here.
- `src/themes.js` — board themes (Sun, Moon, Snowflake, Volcano, Desert, Forest, Ocean, Space), snake skins (10 solid + 7 two-colour gradients, head → tail), theme icons.
- `src/pixels.js` — tiny pixel-sprite toolkit.
- `src/fruits.js` — the 20 pixel-art fruit sprites.
- `src/critters.js` — bunny and turtle speed icons.
- `src/render.js` — canvas drawing: board, snake, orange/crown sprites, menu scene.
- `src/sound.js` — WebAudio blips (eat / die / start), mute persisted.
- `src/main.js` — screens (menu, settings, play), input, game loop, layout.
- `style.css` — layout and UI styling.
