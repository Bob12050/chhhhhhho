import { describe, expect, it } from 'vitest';
import { InputState } from '@/input/input-state';

describe('InputState', () => {
  it('clears movement and held buttons on a scene restart', () => {
    const state = new InputState();
    state.moveX = 1;
    state.moveY = -1;
    state.setButton('attack', true);
    state.setButton('skill1', true);
    state.setButton('interact', true);

    state.reset();

    expect(state.moveX).toBe(0);
    expect(state.moveY).toBe(0);
    for (const button of [state.attack, state.skill1, state.skill2, state.interact, state.dodge]) {
      expect(button).toEqual({ down: false, justPressed: false });
    }
  });
});
