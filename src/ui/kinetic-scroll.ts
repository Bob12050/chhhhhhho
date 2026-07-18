import Phaser from 'phaser';

type ScrollAxis = 'x' | 'y';

export interface KineticScrollOptions {
  axis?: ScrollAxis;
  viewport: () => Phaser.Geom.Rectangle;
  getValue: () => number;
  getMax: () => number;
  setValue: (value: number) => void;
  enabled?: () => boolean;
  onDragState?: (dragged: boolean) => void;
  onTouchStart?: () => void;
  dragThreshold?: number;
  wheelFactor?: number;
  indicator?: boolean;
  indicatorDepth?: number;
}

/**
 * Shared phone-style scrolling for canvas menus. Dragging follows the finger,
 * quick swipes retain momentum, and touching a moving list stops it without
 * accidentally activating the row underneath.
 */
export class KineticScroll {
  private readonly axis: ScrollAxis;
  private readonly indicator: Phaser.GameObjects.Graphics | null;
  private pointerId: number | null = null;
  private tracking = false;
  private dragging = false;
  private startAxis = 0;
  private startCross = 0;
  private startValue = 0;
  private lastAxis = 0;
  private lastTime = 0;
  private velocity = 0;
  private readonly pointerPoint = new Phaser.Math.Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: KineticScrollOptions,
  ) {
    this.axis = options.axis ?? 'y';
    this.indicator = options.indicator === false
      ? null
      : scene.add.graphics().setDepth(options.indicatorDepth ?? 20);

    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointermove', this.handlePointerMove);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointerupoutside', this.handlePointerUp);
    scene.input.on('wheel', this.handleWheel);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
    this.drawIndicator();
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.options.enabled?.() === false || !this.contains(pointer)) return;

    const moving = Math.abs(this.velocity) >= 35;
    this.velocity = 0;
    this.pointerId = pointer.id;
    this.tracking = true;
    this.dragging = moving;
    this.startAxis = this.axisPosition(pointer);
    this.startCross = this.crossPosition(pointer);
    this.startValue = this.options.getValue();
    this.lastAxis = this.startAxis;
    this.lastTime = this.eventTime(pointer);
    this.options.onTouchStart?.();
    this.options.onDragState?.(moving);
    this.drawIndicator();
  };

  private handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.tracking || pointer.id !== this.pointerId) return;

    const axis = this.axisPosition(pointer);
    const cross = this.crossPosition(pointer);
    const axisDistance = axis - this.startAxis;
    const crossDistance = cross - this.startCross;
    const threshold = this.options.dragThreshold ?? 7;

    if (!this.dragging) {
      if (Math.abs(axisDistance) < threshold) return;
      // Do not steal a deliberate gesture in the opposite axis.
      if (Math.abs(crossDistance) > Math.abs(axisDistance) * 1.35) {
        this.tracking = false;
        return;
      }
      this.dragging = true;
      this.options.onDragState?.(true);
    }

    const next = Phaser.Math.Clamp(
      this.startValue - axisDistance,
      0,
      Math.max(0, this.options.getMax()),
    );
    this.options.setValue(next);

    const now = this.eventTime(pointer);
    const elapsed = Math.max(1, now - this.lastTime);
    const instantVelocity = (-(axis - this.lastAxis) / elapsed) * 1000;
    this.velocity = Phaser.Math.Clamp(this.velocity * 0.55 + instantVelocity * 0.45, -3200, 3200);
    this.lastAxis = axis;
    this.lastTime = now;
    this.drawIndicator();
  };

  private handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (!this.tracking || pointer.id !== this.pointerId) return;
    this.tracking = false;
    this.pointerId = null;
    if (!this.dragging) this.velocity = 0;

    // Phaser dispatches row pointerup handlers in the same tick. Keep the
    // dragged flag alive through that dispatch so a swipe never becomes a tap.
    this.scene.time.delayedCall(0, () => {
      this.dragging = false;
      this.options.onDragState?.(false);
    });
    this.drawIndicator();
  };

  private handleWheel = (
    pointer: Phaser.Input.Pointer,
    _objects: unknown,
    deltaX: number,
    deltaY: number,
  ): void => {
    if (this.options.enabled?.() === false || !this.contains(pointer)) return;
    const delta = this.axis === 'y' ? deltaY : deltaX || deltaY;
    const next = Phaser.Math.Clamp(
      this.options.getValue() + delta * (this.options.wheelFactor ?? 0.85),
      0,
      Math.max(0, this.options.getMax()),
    );
    this.velocity = 0;
    this.options.setValue(next);
    this.drawIndicator();
  };

  private update = (_time: number, delta: number): void => {
    if (this.options.enabled?.() === false) {
      this.velocity = 0;
      this.drawIndicator();
      return;
    }
    if (!this.tracking && Math.abs(this.velocity) >= 12) {
      const before = this.options.getValue();
      const max = Math.max(0, this.options.getMax());
      const next = Phaser.Math.Clamp(before + this.velocity * (delta / 1000), 0, max);
      this.options.setValue(next);
      if (next === before && (next === 0 || next === max)) this.velocity = 0;
      else this.velocity *= Math.pow(0.92, delta / (1000 / 60));
    } else if (!this.tracking) {
      this.velocity = 0;
    }
    this.drawIndicator();
  };

  private contains(pointer: Phaser.Input.Pointer): boolean {
    const point = this.logicalPointerPosition(pointer);
    return Phaser.Geom.Rectangle.Contains(this.options.viewport(), point.x, point.y);
  }

  private axisPosition(pointer: Phaser.Input.Pointer): number {
    const point = this.logicalPointerPosition(pointer);
    return this.axis === 'y' ? point.y : point.x;
  }

  private crossPosition(pointer: Phaser.Input.Pointer): number {
    const point = this.logicalPointerPosition(pointer);
    return this.axis === 'y' ? point.x : point.y;
  }

  private logicalPointerPosition(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    // The game renders its 360px layout into a 2x backing buffer. Phaser's
    // raw pointer is therefore in render pixels; camera world space restores
    // the logical menu coordinates used by every viewport and row.
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y, this.pointerPoint);
  }

  private eventTime(pointer: Phaser.Input.Pointer): number {
    const eventTime = pointer.event?.timeStamp;
    return typeof eventTime === 'number' ? eventTime : this.scene.time.now;
  }

  private drawIndicator(): void {
    if (!this.indicator) return;
    const max = Math.max(0, this.options.getMax());
    const enabled = this.options.enabled?.() !== false;
    this.indicator.clear().setVisible(enabled && max > 0);
    if (!enabled || max <= 0) return;

    const view = this.options.viewport();
    const value = Phaser.Math.Clamp(this.options.getValue(), 0, max);
    const active = this.tracking || Math.abs(this.velocity) >= 12;
    this.indicator.fillStyle(0xffd86b, active ? 0.78 : 0.34);
    if (this.axis === 'y') {
      const thumb = Math.max(30, (view.height * view.height) / (view.height + max));
      const y = view.y + (value / max) * (view.height - thumb);
      this.indicator.fillRoundedRect(view.right - 4, y, 3, thumb, 2);
    } else {
      const thumb = Math.max(36, (view.width * view.width) / (view.width + max));
      const x = view.x + (value / max) * (view.width - thumb);
      this.indicator.fillRoundedRect(x, view.bottom - 4, thumb, 3, 2);
    }
  }

  private destroy = (): void => {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('pointerupoutside', this.handlePointerUp);
    this.scene.input.off('wheel', this.handleWheel);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update);
    this.indicator?.destroy();
  };
}
