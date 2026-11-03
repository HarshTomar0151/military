import type { WeaponDef } from '../data/weapons';

/** Runtime ammo / cooldown / reload state for one weapon slot. */
export class Weapon {
  ammo: number;
  reserve: number;
  reloadEnd = 0; // game time (ms) when the current reload completes; 0 = not reloading
  reloadStart = 0;
  private nextFire = 0;
  bloom = 0; // current extra spread (degrees)

  constructor(readonly def: WeaponDef) {
    this.ammo = def.mag;
    this.reserve = def.infinite ? Infinity : Math.round(def.mag * def.reserveMags);
  }

  get reloading(): boolean {
    return this.reloadEnd > 0;
  }

  reloadProgress(now: number): number {
    if (!this.reloading) return 0;
    return Math.min(1, (now - this.reloadStart) / (this.reloadEnd - this.reloadStart));
  }

  canFire(now: number): boolean {
    return !this.reloading && this.ammo > 0 && now >= this.nextFire;
  }

  /** Consumes a round; returns the spread (radians) to apply to this shot. */
  fire(now: number): number {
    this.ammo--;
    this.nextFire = now + this.def.fireDelay;
    const spread = ((this.def.spreadDeg + this.bloom) * Math.PI) / 180;
    this.bloom = Math.min(this.def.maxBloomDeg, this.bloom + this.def.bloomDeg);
    return spread;
  }

  startReload(now: number): boolean {
    if (this.reloading || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloadStart = now;
    this.reloadEnd = now + this.def.reloadMs;
    return true;
  }

  cancelReload(): void {
    this.reloadEnd = 0;
  }

  /** Returns true on the frame a reload finishes. */
  update(now: number, dt: number): boolean {
    this.bloom = Math.max(0, this.bloom - dt * 6);
    if (this.reloading && now >= this.reloadEnd) {
      const need = this.def.mag - this.ammo;
      const take = Math.min(need, this.reserve);
      this.ammo += take;
      if (this.reserve !== Infinity) this.reserve -= take;
      this.reloadEnd = 0;
      return true;
    }
    return false;
  }

  refill(): void {
    this.ammo = this.def.mag;
    this.reserve = this.def.infinite ? Infinity : Math.round(this.def.mag * this.def.reserveMags);
    this.reloadEnd = 0;
  }

  addReserve(mags: number): void {
    if (this.reserve === Infinity) return;
    const cap = Math.round(this.def.mag * (this.def.reserveMags + 1));
    this.reserve = Math.min(cap, this.reserve + Math.round(this.def.mag * mags));
  }

  get empty(): boolean {
    return this.ammo <= 0 && this.reserve <= 0;
  }

  get nextFireAt(): number {
    return this.nextFire;
  }
}
