import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Vector2 {
    x = 0;
    y = 0;
  }

  return {
    default: {
      Core: { Events: { BLUR: 'blur' } },
      Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown' } },
      Math: {
        Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
        Vector2,
      },
      Geom: {
        Rectangle: {
          Contains: (
            rectangle: { x: number; y: number; width: number; height: number },
            x: number,
            y: number,
          ) => x >= rectangle.x
            && x <= rectangle.x + rectangle.width
            && y >= rectangle.y
            && y <= rectangle.y + rectangle.height,
        },
      },
    },
  };
});

import { KineticScroll } from '@/ui/kinetic-scroll';

interface PointerStub {
  id: number;
  x: number;
  y: number;
  isDown: boolean;
  wasCanceled: boolean;
  event: { timeStamp: number };
}

function makePointer(id: number, x: number, y: number, timeStamp: number): PointerStub {
  return { id, x, y, isDown: true, wasCanceled: false, event: { timeStamp } };
}

function makeHarness() {
  const input = new EventEmitter();
  const events = new EventEmitter();
  const gameEvents = new EventEmitter();
  const dragStates: boolean[] = [];
  let value = 0;
  const scene = {
    input,
    events,
    game: { events: gameEvents },
    add: { graphics: vi.fn() },
    cameras: {
      main: {
        getWorldPoint: (x: number, y: number, out: { x: number; y: number }) => {
          out.x = x / 2;
          out.y = y / 2;
          return out;
        },
      },
    },
  } as unknown as Phaser.Scene;

  new KineticScroll(scene, {
    viewport: () => ({ x: 0, y: 0, width: 360, height: 640 }) as Phaser.Geom.Rectangle,
    getValue: () => value,
    getMax: () => 1000,
    setValue: (next) => { value = next; },
    onDragState: (dragged) => dragStates.push(dragged),
    indicator: false,
  });

  return { input, events, gameEvents, dragStates, value: () => value };
}

describe('kinetic menu scrolling', () => {
  it('releases the drag state synchronously when the pointer goes up', () => {
    const harness = makeHarness();
    const pointer = makePointer(1, 200, 400, 0);

    harness.input.emit('pointerdown', pointer);
    pointer.y = 300;
    pointer.event.timeStamp = 20;
    harness.input.emit('pointermove', pointer);
    expect(harness.dragStates.at(-1)).toBe(true);

    pointer.isDown = false;
    harness.input.emit('pointerup', pointer);
    expect(harness.dragStates.at(-1)).toBe(false);
  });

  it('recovers from a cancelled touch and accepts the next swipe', () => {
    const harness = makeHarness();
    const first = makePointer(1, 200, 400, 0);

    harness.input.emit('pointerdown', first);
    first.y = 320;
    first.event.timeStamp = 20;
    harness.input.emit('pointermove', first);
    const afterFirstMove = harness.value();
    expect(afterFirstMove).toBeGreaterThan(0);

    first.isDown = false;
    first.wasCanceled = true;
    harness.events.emit('update', 20, 16);
    expect(harness.dragStates.at(-1)).toBe(false);

    const second = makePointer(2, 200, 400, 40);
    harness.input.emit('pointerdown', second);
    second.y = 280;
    second.event.timeStamp = 60;
    harness.input.emit('pointermove', second);
    expect(harness.value()).toBeGreaterThan(afterFirstMove);
  });

  it('clears an active gesture when the browser loses focus', () => {
    const harness = makeHarness();
    const pointer = makePointer(1, 200, 400, 0);

    harness.input.emit('pointerdown', pointer);
    pointer.y = 300;
    pointer.event.timeStamp = 20;
    harness.input.emit('pointermove', pointer);
    harness.gameEvents.emit('blur');

    expect(harness.dragStates.at(-1)).toBe(false);
  });
});
