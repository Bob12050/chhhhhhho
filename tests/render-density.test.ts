import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { installRenderDensity, RENDER_DENSITY } from '@/core/render-density';

describe('render density', () => {
  it('reapplies the HD camera to scenes that are started again', () => {
    const camera = {
      setSize: vi.fn(),
      setZoom: vi.fn(),
      centerOn: vi.fn(),
    };
    const on = vi.fn();
    const scene = {
      cameras: { cameras: [camera] },
      sys: { events: { on } },
    } as unknown as Phaser.Scene;
    const setSize = vi.fn();
    const refresh = vi.fn();
    const game = {
      scale: {
        baseSize: { setSize },
        canvas: { width: 0, height: 0 },
        refresh,
      },
      scene: { getScenes: () => [scene] },
    } as unknown as Phaser.Game;

    installRenderDensity(game, 360, 720);

    expect(setSize).toHaveBeenCalledWith(720, 1440);
    expect(camera.setSize).toHaveBeenCalledWith(720, 1440);
    expect(camera.setZoom).toHaveBeenCalledWith(RENDER_DENSITY);
    expect(camera.centerOn).toHaveBeenCalledWith(180, 360);
    expect(on).toHaveBeenCalledWith('start', expect.any(Function));

    camera.setSize.mockClear();
    camera.setZoom.mockClear();
    camera.centerOn.mockClear();
    const restartHandler = on.mock.calls[0][1] as () => void;
    restartHandler();

    expect(camera.setSize).toHaveBeenCalledWith(720, 1440);
    expect(camera.setZoom).toHaveBeenCalledWith(RENDER_DENSITY);
    expect(camera.centerOn).toHaveBeenCalledWith(180, 360);
  });
});
