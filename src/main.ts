import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/700.css';
import Phaser from 'phaser';
import { COLORS, GAME_H, PHYS, SCREEN_W, setScreenWidth } from './config';
import { BootScene } from './scenes/BootScene';
import { CustomizeScene } from './scenes/CustomizeScene';
import { CricketLobbyScene } from './scenes/CricketLobbyScene';
import { CricketMenuScene } from './scenes/CricketMenuScene';
import { CricketScene } from './scenes/CricketScene';
import { GameScene } from './scenes/GameScene';
import { GameSelectScene } from './scenes/GameSelectScene';
import { HowToScene } from './scenes/HowToScene';
import { HUDScene } from './scenes/HUDScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MenuScene } from './scenes/MenuScene';
import { PracticeScene } from './scenes/PracticeScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SettingsScene } from './scenes/SettingsScene';
import { audio } from './systems/AudioManager';
import { installAutoFullscreen, isTouchDevice } from './systems/Fullscreen';
import { net } from './systems/MultiplayerManager';
import { computeScreenW, installResizeHandler, measureSafeInsets } from './systems/Viewport';

// Render every Text object at 2x for crisp typography on high-DPI screens.
const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
  text: (x: number, y: number, text: string, style?: object) => Phaser.GameObjects.Text;
};
const baseText = factory.text;
factory.text = function (this: unknown, x, y, text, style) {
  return baseText.call(this, x, y, text, { resolution: 2, ...style });
};

// fill the whole screen: canvas width follows the real aspect ratio (height stays 720)
measureSafeInsets();
setScreenWidth(computeScreenW());

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: SCREEN_W,
  height: GAME_H,
  backgroundColor: COLORS.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: PHYS.gravity }, fps: isTouchDevice() ? 60 : 120, debug: false } },
  input: { activePointers: 4, windowEvents: true },
  render: { antialias: true, powerPreference: 'high-performance' },
  disableContextMenu: true,
  scene: [BootScene, GameSelectScene, CricketMenuScene, CricketLobbyScene, CricketScene, MenuScene, HowToScene, PracticeScene, CustomizeScene, SettingsScene, LobbyScene, GameScene, HUDScene, ResultsScene],
});

// Browsers and the Android WebView block audio until a user gesture.
const unlock = (): void => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
window.addEventListener('touchend', unlock);

installAutoFullscreen();
installResizeHandler(game);

// Keep the debug handle for local testing.
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __net: typeof net }).__net = net;
