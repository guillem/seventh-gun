// Input: desktop (pointer lock, WASD, wheel, 1-7, E, Tab/M, Esc) and touch
// (floating stick, drag look, FIRE/USE/MAP/PAUSE buttons, slot taps).
// Touches are classified once by the element they start on.
import type { Screens } from '../ui/screens';

export interface InputState {
  moveX: number;
  moveZ: number;
  yawDelta: number;
  pitchDelta: number;
  fire: boolean;
  use: boolean;      // edge-triggered, consumed by game
  gunSwitch: number | null;
  wheel: number;     // accumulated wheel steps
}

export class InputManager {
  state: InputState = {
    moveX: 0, moveZ: 0, yawDelta: 0, pitchDelta: 0,
    fire: false, use: false, gunSwitch: null, wheel: 0,
  };
  pointerLocked = false;
  sensitivity = 1;
  paused = false;
  mapOpen = false;
  isTouch = false;

  private keys = new Set<string>();
  private touchMove: { id: number; baseX: number; baseY: number; x: number; y: number } | null = null;
  private touchLook: { id: number; lastX: number; lastY: number } | null = null;
  private onPointerLockChange: (() => void) | null = null;
  private onPauseToggle: (() => void) | null = null;
  private onMapToggle: (() => void) | null = null;
  private stickBase: HTMLElement | null = null;
  private stickNub: HTMLElement | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private screens: Screens,
  ) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.bindDesktop();
    this.bindTouch();
  }

  setCallbacks(cbs: {
    onPointerLockChange?: () => void;
    onPauseToggle?: () => void;
    onMapToggle?: () => void;
  }): void {
    this.onPointerLockChange = cbs.onPointerLockChange ?? null;
    this.onPauseToggle = cbs.onPauseToggle ?? null;
    this.onMapToggle = cbs.onMapToggle ?? null;
  }

  requestLock(): void {
    if (this.isTouch) return;
    this.canvas.requestPointerLock?.();
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  private bindDesktop(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (e.code === 'Tab') e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Tab' || e.code === 'KeyM') {
        e.preventDefault();
        this.onMapToggle?.();
      }
      if (e.code === 'Escape') {
        this.onPauseToggle?.();
      }
      if (e.code === 'KeyE') this.state.use = true;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 7) this.state.gunSwitch = n;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.state.fire = false;
      if (!this.paused) this.onPauseToggle?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.onPointerLockChange?.();
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.pointerLocked) this.state.fire = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.state.fire = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.state.yawDelta -= e.movementX * 0.0022 * this.sensitivity;
      this.state.pitchDelta -= e.movementY * 0.0022 * this.sensitivity;
    });
    window.addEventListener('wheel', (e) => {
      if (this.pointerLocked) {
        e.preventDefault();
        this.state.wheel += Math.sign(e.deltaY);
      }
    }, { passive: false });
    window.addEventListener('contextmenu', (e) => {
      if (this.pointerLocked) e.preventDefault();
    });
  }

  private bindTouch(): void {
    const zone = this.screens.root.querySelector('#stick-zone') as HTMLElement | null;
    this.stickBase = this.screens.root.querySelector('#stick-base') as HTMLElement | null;
    this.stickNub = this.screens.root.querySelector('#stick-nub') as HTMLElement | null;
    if (!zone) return;

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.touchMove) return; // a second finger must not steal the stick
      const t = e.changedTouches[0];
      this.touchMove = { id: t.identifier, baseX: t.clientX, baseY: t.clientY, x: t.clientX, y: t.clientY };
      if (this.stickBase) {
        this.stickBase.classList.remove('hidden');
        this.stickBase.style.left = `${t.clientX}px`;
        this.stickBase.style.top = `${t.clientY}px`;
      }
    }, { passive: false });

    const moveHandler = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.touchMove && t.identifier === this.touchMove.id) {
          this.touchMove.x = t.clientX;
          this.touchMove.y = t.clientY;
          const dx = t.clientX - this.touchMove.baseX;
          const dy = t.clientY - this.touchMove.baseY;
          const max = 56;
          const len = Math.hypot(dx, dy);
          const k = len > max ? max / len : 1;
          if (this.stickNub) {
            this.stickNub.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
          }
        } else if (this.touchLook && t.identifier === this.touchLook.id) {
          this.state.yawDelta -= (t.clientX - this.touchLook.lastX) * 0.005 * this.sensitivity;
          this.state.pitchDelta -= (t.clientY - this.touchLook.lastY) * 0.005 * this.sensitivity;
          this.touchLook.lastX = t.clientX;
          this.touchLook.lastY = t.clientY;
        }
      }
    };
    window.addEventListener('touchmove', moveHandler, { passive: false });

    const endHandler = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.touchMove && t.identifier === this.touchMove.id) {
          this.touchMove = null;
          if (this.stickBase) this.stickBase.classList.add('hidden');
          if (this.stickNub) this.stickNub.style.transform = 'translate(0,0)';
        } else if (this.touchLook && t.identifier === this.touchLook.id) {
          this.touchLook = null;
        }
      }
    };
    window.addEventListener('touchend', endHandler);
    window.addEventListener('touchcancel', endHandler);

    // any touch that starts on the canvas (right side, not a button) looks
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.touchLook) {
        const t = e.changedTouches[0];
        this.touchLook = { id: t.identifier, lastX: t.clientX, lastY: t.clientY };
      }
    }, { passive: true });
  }

  /** Build the per-frame sim input; call once per frame before stepping. */
  poll(yaw: number, pitch: number): { moveX: number; moveZ: number; yaw: number; pitch: number; fire: boolean; use: boolean; switchGun: number | null; wheel: number } {
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.touchMove) {
      const dx = this.touchMove.x - this.touchMove.baseX;
      const dy = this.touchMove.y - this.touchMove.baseY;
      const max = 56;
      mx = Math.max(-1, Math.min(1, dx / max));
      mz = Math.max(-1, Math.min(1, -dy / max));
    }
    const out = {
      moveX: mx, moveZ: mz,
      yaw: yaw + this.state.yawDelta,
      pitch: Math.max(-1.45, Math.min(1.45, pitch + this.state.pitchDelta)),
      fire: this.state.fire,
      use: this.state.use,
      switchGun: this.state.gunSwitch,
      wheel: this.state.wheel,
    };
    // consume edges
    this.state.yawDelta = 0;
    this.state.pitchDelta = 0;
    this.state.use = false;
    this.state.gunSwitch = null;
    this.state.wheel = 0;
    return out;
  }

  setFire(down: boolean): void {
    this.state.fire = down;
  }
}
