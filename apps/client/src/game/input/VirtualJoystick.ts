export class VirtualJoystick {
  private centerX = 0;
  private centerY = 0;
  private radius = 1;
  private localRadius = 1;
  private knob: HTMLElement | null = null;
  begin(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    const baseWidth = element.offsetWidth || rect.width;
    this.localRadius = Math.max(1, baseWidth / 2 - 20);
    this.radius = Math.max(1, (this.localRadius * rect.width) / baseWidth);
    this.knob = element.querySelector('[data-joystick-knob]');
  }
  move(x: number, y: number): { forward: number; right: number } {
    let dx = (x - this.centerX) / this.radius;
    let dy = (y - this.centerY) / this.radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    if (this.knob)
      this.knob.style.transform = `translate(${dx * this.localRadius}px, ${dy * this.localRadius}px)`;
    if (length < 0.12) return { forward: 0, right: 0 };
    const strength = (Math.min(1, length) - 0.12) / 0.88;
    const normalizedLength = Math.hypot(dx, dy);
    return {
      forward: (-dy / normalizedLength) * strength,
      right: (dx / normalizedLength) * strength,
    };
  }
  clear(): void {
    if (this.knob) this.knob.style.transform = '';
    this.knob = null;
  }
}
