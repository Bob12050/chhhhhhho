/**
 * Shared input state, written by the on-screen controls (UI scene) and the
 * keyboard (dev), read by gameplay. Buttons are edge-triggered via `consume`.
 */
export interface ButtonState {
  down: boolean;
  /** Set true on the frame the button goes down. */
  justPressed: boolean;
}

export class InputState {
  moveX = 0;
  moveY = 0;

  attack: ButtonState = { down: false, justPressed: false };
  skill1: ButtonState = { down: false, justPressed: false };
  interact: ButtonState = { down: false, justPressed: false };

  setButton(name: 'attack' | 'skill1' | 'interact', down: boolean): void {
    const b = this[name];
    if (down && !b.down) b.justPressed = true;
    b.down = down;
  }

  /** Call at end of each gameplay frame to clear edge flags. */
  endFrame(): void {
    this.attack.justPressed = false;
    this.skill1.justPressed = false;
    this.interact.justPressed = false;
  }
}

export const input = new InputState();
