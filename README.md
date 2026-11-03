# JETFRONT

2D multiplayer jetpack shooter (Mini-Militia-style gameplay, original art/UI) built with **Phaser 3 + TypeScript + Vite**, **Socket.IO** multiplayer, and prepared for **Android via Capacitor** — same code, no separate Android game.

## Run

```bash
npm install
npm run dev        # Vite client (http://localhost:5173) + Socket.IO server (:3001)
```

Open http://localhost:5173 — the LAN URL Vite prints also works on phones (touch controls appear automatically).

Other scripts: `npm run dev:web` (client only), `npm run server` (server only), `npm run build`, `npm run typecheck`.

## Controls

| Desktop | |
|---|---|
| A / D, ←/→ | Move |
| Space (or W/↑) | Jump / double jump |
| Shift | Jetpack (fuel meter) |
| Mouse | Aim 360° · Left click fire · Right click or G grenade |
| R / Q | Reload / swap weapon |
| Esc | Pause |

An in-game **HOW TO PLAY** tutorial (menu button; shown automatically before the first match) explains all of this.

Grenades: **Frag** (explosion), **Gas** (slowing + damaging cloud), **Poison** (lingering damage) — `E` / TYPE button switches, `G` / NADE throws. The jetpack has unlimited fuel.

Mobile (landscape): floating move stick, aim stick (auto-fire at the rim, optional), FIRE / JUMP / JET / NADE / TYPE / RLD / SWAP buttons (haptic feedback, smoothed sticks, bigger HUD and closer camera). Push the move stick up to use the jetpack. Touch mode is *Auto* (coarse-pointer devices) and can be forced in Settings.

## Game modes
- **Practice** – Deathmatch or Team Deathmatch vs AI bots (1–7, easy/normal/hard).
- **Multiplayer** – create/join rooms (up to 8): Deathmatch or Team Deathmatch; host starts the match.
- Maps: Military Base, Desert Battlefield, Jungle Arena. Weapons: Assault Rifle, Machine Gun, Shotgun, Sniper, Rocket Launcher, Pistol + grenades. Health/armor/ammo pickups on every map.

## Architecture

```
shared/protocol.ts       types + constants shared by client and server (damage rules, events)
server/                  Node + Socket.IO: rooms, teams, authoritative health/score/respawn
src/
  config.ts              resolution, colours, physics tuning
  data/                  weapons.ts, maps.ts, palettes.ts (pure data)
  entities/              Player, PlayerView (rendering only), Weapon, Bullet, Grenade, EnemyBot, WeaponArt
  systems/               CombatSystem, Effects, MapRenderer, PickupSystem, InputManager, MatchState,
                         MultiplayerManager, AudioManager (procedural WebAudio), Storage (localStorage), Collision
  scenes/                Boot, Menu, Practice, Customize, Settings, Lobby, Game, HUD, Results
  ui/                    theme/widgets, HUD, TouchControls
```

Gameplay logic (entities/systems) is separate from UI (ui/, HUDScene). The HUD runs as a parallel scene reading `GameScene.hudState()`.

**Netcode:** each client simulates its own player and sends state at 20 Hz; shots/grenades are relayed and simulated locally on every client; the *shooter's* client detects hits and reports them; the server validates, owns health/armor/kills/respawns and broadcasts results.

## Android (Capacitor)

```bash
npm run cap:add:android   # once
npm run cap:sync          # builds dist/ and copies it into the Android project
npm run cap:open          # open in Android Studio
```

- `vite.config.ts` uses `base: './'`, so the same build loads in the WebView; `capacitor.config.ts` is provided.
- In the WebView there is no dev proxy: set the server URL in **Settings → SET SERVER URL** (e.g. `http://192.168.1.20:3001` or your hosted server), or build with `VITE_SERVER_URL=...`.
- Lock the activity to landscape in `AndroidManifest.xml` (`android:screenOrientation="sensorLandscape"`).
- Debug handles `window.__game` / `window.__net` are exposed for testing; remove for release if desired.

## Status
Verified in Edge: all menus, 3 maps with up to 7 bots, results screen, 2-client multiplayer (join, sync, damage, kill, respawn), touch controls, production build. Not yet tested on a physical Android device.
