Original prompt: the chess game isnt working in AI mode, also i want to be able to do multiple premoves that will be played in succession, i also want to be able to undo a premove if i click on the pice that is to be moved.
2026-03-07:
- Fixed chess AI turn scheduling so vs-computer mode consistently triggers the engine on the AI side, including the opening move when the human chooses Black.
- Replaced single premove storage with a premove queue and projected-board interaction state so chained premoves can be entered and executed over successive turns.
- Added premove cancellation by clicking the queued source square; cancellation trims the selected premove and any later dependent premoves.
- Verified in-browser on http://127.0.0.1:4173: AI opened as White when human picked Black, AI replied after human moves, queued `h7-h6` then `h6-h5` executed across two turns, and queued `g7-g6` was canceled by clicking `g7` before execution.
- Updated chess piece rendering to use solid figurines instead of hollow unicode outlines.
- Updated board arrows to use a chess.com-style shaft/head treatment, with knight annotations rendered as L-shaped arrows.
- `npm run build` passes. Repo-wide `npm run lint` still fails because of unrelated pre-existing issues outside `src/games/ChessGame.tsx`.
2026-03-07:
- User requested full solid-piece redesign; replacing glyph-based chess pieces with custom canvas-drawn silhouettes.
- Replaced Unicode chess glyph rendering with custom solid canvas silhouettes for all piece types.
- Verified the redesign visually in-browser; screenshot saved to `chess-solid-redesign.png`.
2026-03-07:
- Removed the old global AI demo setting from settings UI and finished the migration to per-game demo preferences stored on each profile.
- Added a second per-game demo mode, `Learn Me`, that records local action timing/preferences and biases adaptive autoplay in 2048, Connect 4, and Minesweeper without replacing the existing classic demo mode.
- Unified game-local demo buttons with the persisted per-game mode so they now cycle `Demo Off -> Classic AI -> Learn Me` instead of keeping separate unsynced local AI state.
- Added mobile/PWA shell polish for iPhone usage: standalone-safe app shell styling, install prompt card, service worker registration, manifest/icon support, and Vite build chunking configuration for Vercel.
- Verified `npm run build` passes.
- Verified browser screenshots for the menu and a game screen using the Playwright client; screenshots saved under `output/web-game/home-check/` and `output/web-game/first-game-check/`.
- Created a Vercel preview deployment:
  - Preview URL: `https://skill-deploy-7yjr6k8dot-codex-agent-deploys.vercel.app`
  - Claim URL: `https://vercel.com/claim-deployment?code=4d95ffb1-006c-424d-97fe-452d2daf307a`
  - Deploy script returned status `BUILDING`, so the preview may take another moment before serving normally.
2026-03-07:
- Fixed chess AI demo takeover logic so demo mode now drives both sides even when the game is configured as `vs AI`; regular opponent AI still works when demo is off.
- Added a chess effect to clear `aiDisabled` whenever demo mode is enabled/switched, so toggling demo modes can recover autoplay after manual input.
- Hardened the chess resign confirmation overlay by stopping pointer/click propagation on the modal and its action buttons; `Cancel` now clears `resignConfirm` and `Yes, Resign` now resolves the game result reliably.
- Verified `npm run build` passes after the chess fix.
2026-03-07:
- Extended chess `Learn Me` to record player move fingerprints (piece preference, source/target squares, early opening destinations, castling, captures, center/wing bias) from actual player and premove moves.
- Adaptive chess demo now uses the normal engine as a tactical floor, then biases among near-best moves using the stored chess profile and learned aggression/risk/exploration traits instead of replacing engine play outright.
- Added a low-data fallback so chess `Learn Me` behaves close to classic AI until enough local move history has been collected.
- Verified `npm run build` passes after the chess learning changes.
2026-03-07:
- Added chess analysis explanations beneath the analysis navigator so each analyzed move now shows a plain-language note, evaluation, and engine-preferred continuation instead of just the classification label.
- Extended `Learn Me` biasing to the remaining demo-driven games so the adaptive mode is no longer chess-only in practice:
  - `Asteroids`: records turning/thrust/fire habits and biases steering, firing window, and thrust distance.
  - `Breakout`: records launch/move/powerup behavior and biases paddle tracking, powerup chasing, and tempo.
  - `Endless Runner`: records jump timing and biases jump lookahead plus optional coin-chasing jumps.
  - `Space Invaders`: records move/shoot tendencies and biases firing lanes, dodge window, and tracking speed.
  - `Sudoku`: records value, note, hint, and board-zone preferences and biases adaptive auto-solve toward those zones/values.
  - `Memory Match`: records flip positions/zones and biases unknown-card selection toward the player’s preferred board regions.
- Shared hook now exposes trait accessors and a learned-profile threshold so adaptive demos can scale style influence without replacing each game’s existing AI baseline.
- Verified `npm run build` passes.
- Verified `npx eslint src/games/AsteroidsGame.tsx src/games/BreakoutGame.tsx src/games/EndlessRunner.tsx src/games/SpaceInvadersGame.tsx src/games/SudokuGame.tsx src/games/MemoryMatch.tsx src/games/ChessGame.tsx src/hooks/useAIDemo.ts` passes.
2026-03-07:
- Moved chess analysis explanations into the desktop analysis sidebar so the note is visible next to the move list instead of only under the board.
- Fixed chess demo/self-play turn selection so `Classic AI` can move for both colors and regular vs-AI wakeups resume after manual moves.
- Fixed Flappy and Breakout demo startup by allowing the demo AI loop to act from the start screen instead of waiting for a human launch/flap.
- Fixed Endless Runner’s world scroll direction; the player no longer falls off the opening platform immediately after starting.
- Slowed Asteroids by reducing asteroid speed, ship acceleration, ship rotation speed, and bullet speed.
- Verified `npm run build` passes.
- Verified `npx eslint src/games/ChessGame.tsx src/games/FlappyGame.tsx src/games/BreakoutGame.tsx src/games/EndlessRunner.tsx src/games/AsteroidsGame.tsx` passes.
- Browser spot-checks:
  - Endless Runner now starts into live gameplay instead of immediately dying (`output/web-game/runner-start-check-2/shot-0.png`).
  - Flappy and Breakout still render correctly after the fixes (`output/web-game/flappy-open-2/shot-0.png`, `output/web-game/breakout-open/shot-0.png`).
2026-03-07:
- Added direct manual controls for Flappy and Breakout so they no longer depend on demo-mode state to start playing; both now expose explicit player action buttons and canvas pointer-start paths.
- Made classic/demo AI chase collectibles in games that have them:
  - `Breakout` now prefers falling powerups in both Classic AI and Learn Me, and Learn Me records actual powerup pickups.
  - `Endless Runner` now chases both coins and powerups in Classic AI, while Learn Me records actual coin/powerup collection and biases its jump choices with that data.
- Tuned game feel:
  - `Endless Runner`: lower gravity, softer jump, slower speed ramp, wider spawn spacing.
  - `Neon Pulse Run` (renamed from `Neon Blob Dash`): lower base speed, softer gravity/jump, slower ramp, wider obstacle spacing, safer duck-button release handling.
  - `Asteroids`: widened/shrunk the THRUST button label so it no longer overflows.
- Renamed `Neon Blob Dash` to `Neon Pulse Run` in the game UI/registry.
- Verified `npm run build` passes.
- Verified `npx eslint src/games/FlappyGame.tsx src/games/BreakoutGame.tsx src/games/EndlessRunner.tsx src/games/NeonBlobDash.tsx src/games/AsteroidsGame.tsx src/store/gameRegistry.ts` passes.
2026-03-07:
- Switched the app shell to a phone-width mobile frame (`max-width: 430px`) and centered the experience, so the app now behaves like a dedicated mobile web app instead of stretching to desktop widths.
- Forced chess onto the mobile layout path even on large screens, so there is only one chess UI path left to maintain and test.
- Verified `npm run build` passes.
- Verified `npx eslint src/App.tsx src/games/ChessGame.tsx` passes.
