import Phaser from 'phaser';
import { COLORS, GAME_H } from '../config';
import { audio } from '../systems/AudioManager';
import { promptText } from '../systems/DomPrompt';
import { net } from '../systems/MultiplayerManager';
import { store, type TouchMode } from '../systems/Storage';
import { backButton, button, createBackdrop, fadeTo, panel, screenTitle, selector, slider, toggle, ui } from '../ui/theme';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    screenTitle(this, 'SETTINGS', 'Saved automatically on this device');
    backButton(this);
    const st = store.settings;
    const save = (): void => store.save();

    // ---- audio / display
    panel(this, 56, 140, 560, 500, { title: 'AUDIO & DISPLAY' });
    slider(this, 90, 214, 'SFX VOLUME', 0, 1, st.sfx, (v) => {
      st.sfx = v;
      audio.setVolume(v);
      save();
    }, 490);
    toggle(this, 90, 270, 'SCREEN SHAKE', st.shake, (v) => { st.shake = v; save(); }, 490);
    toggle(this, 90, 320, 'DAMAGE NUMBERS', st.dmgNumbers, (v) => { st.dmgNumbers = v; save(); }, 490);
    toggle(this, 90, 370, 'SHOW FPS', st.fps, (v) => { st.fps = v; save(); }, 490);
    selector<'low' | 'high'>(this, 90, 430, 490, 'PARTICLES', [{ value: 'high', text: 'HIGH' }, { value: 'low', text: 'LOW' }], st.particles, (v) => { st.particles = v; save(); });
    button(this, 205, 500, 230, 42, '⛶ TOGGLE FULLSCREEN', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }, { fontSize: 12 });
    button(this, 465, 500, 230, 42, 'RESET PROGRESS', () => this.confirmReset(), { fontSize: 12, danger: true });
    this.resetNote = ui(this, 90, 540, '', 14, '#ff8a8a');

    // ---- controls / network
    panel(this, 650, 140, 574, 500, { title: 'CONTROLS & NETWORK' });
    selector<TouchMode>(this, 684, 214, 506, 'TOUCH CONTROLS', [
      { value: 'auto', text: 'AUTO' }, { value: 'on', text: 'ALWAYS ON' }, { value: 'off', text: 'OFF' },
    ], st.touch, (v) => { st.touch = v; save(); });
    slider(this, 684, 270, 'TOUCH SIZE', 0.7, 1.3, st.touchScale, (v) => { st.touchScale = Math.round(v * 20) / 20; save(); }, 506, (v) => `${Math.round(v * 100)}%`);
    slider(this, 684, 320, 'TOUCH OPACITY', 0.3, 1, st.touchOpacity, (v) => { st.touchOpacity = v; save(); }, 506);
    toggle(this, 684, 370, 'AIM STICK AUTO-FIRE', st.autoFire, (v) => { st.autoFire = v; save(); }, 506);
    ui(this, 684, 416, 'SERVER', 15, COLORS.textDim);
    const url = ui(this, 684, 440, st.serverUrl || `${net.serverUrl()} (default)`, 15, '#d8ffe0', { width: 500 });
    button(this, 800, 500, 230, 42, 'SET SERVER URL', async () => {
      const v = await promptText('SERVER URL  (e.g. http://192.168.1.20:3001)', st.serverUrl, 100);
      if (v !== null) {
        st.serverUrl = v.trim();
        save();
        url.setText(st.serverUrl || `${net.serverUrl()} (default)`);
        net.connect(true);
      }
    }, { fontSize: 12 });
    button(this, 1070, 500, 230, 42, 'CHANGE CALLSIGN', async () => {
      const v = await promptText('ENTER CALLSIGN', store.data.name, 14);
      if (v) {
        store.data.name = v.slice(0, 14);
        save();
      }
    }, { fontSize: 12 });
    ui(this, 684, 556, 'Desktop: WASD/Arrows move · Space jump · Shift jetpack · Mouse aim/fire · R reload · Q swap · G or Right-click grenade · Esc pause', 13, COLORS.textDim, { width: 506 });
  }

  private resetNote!: Phaser.GameObjects.Text;
  private armed = false;

  private confirmReset(): void {
    if (!this.armed) {
      this.armed = true;
      this.resetNote.setText('Click RESET PROGRESS again to erase stats, loadout and settings.');
      this.time.delayedCall(3500, () => {
        this.armed = false;
        this.resetNote.setText('');
      });
      return;
    }
    store.reset();
    audio.setVolume(store.settings.sfx);
    fadeTo(this, 'Settings');
  }
}
