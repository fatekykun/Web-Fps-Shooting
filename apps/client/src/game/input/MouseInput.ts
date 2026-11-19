import type { InputManager } from './InputManager';

export class MouseInput {
  constructor(private readonly input: InputManager) {
    document.addEventListener('mousemove', this.move);
    document.addEventListener('mousedown', this.down);
    document.addEventListener('mouseup', this.up);
  }
  private readonly move = (event: MouseEvent): void => {
    if (this.input.locked && !this.input.touchMode)
      this.input.mouseLook(event.movementX, event.movementY);
  };
  private readonly down = (event: MouseEvent): void => {
    if (!this.input.locked || this.input.touchMode) return;
    this.input.setMouseButton(event.button, true);
  };
  private readonly up = (event: MouseEvent): void => {
    if (!this.input.touchMode) this.input.setMouseButton(event.button, false);
  };
  dispose(): void {
    document.removeEventListener('mousemove', this.move);
    document.removeEventListener('mousedown', this.down);
    document.removeEventListener('mouseup', this.up);
  }
}
