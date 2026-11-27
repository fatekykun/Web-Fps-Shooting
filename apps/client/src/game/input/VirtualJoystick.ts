export class VirtualJoystick {
  private centerX = 0;
  private centerY = 0;
  private radius = 1;
  private localRadius = 1;
  private knob: HTMLElement | null = null;
  private sprintDistance = 1;
  private sprinting = false;

  get sprintActive(): boolean {
    return this.sprinting;
  }

  begin(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    const baseWidth = element.offsetWidth || rect.width;
    this.localRadius = Math.max(1, baseWidth / 2 - 20);
    this.radius = Math.max(1, (this.localRadius * rect.width) / baseWidth);
    const distance = Number(element.dataset.sprintDistance ?? this.radius);
    // Leave a walking zone near the center and keep the trigger within reach of the top edge.
    this.sprintDistance = Math.min(
      Math.max(1, this.centerY - 2),
      Math.max(this.radius * 0.55, distance),
    );
    this.knob = element.querySelector('[data-joystick-knob]');
  }
  move(x: number, y: number): { forward: number; right: number } {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const length = Math.hypot(dx, dy);
    const knobScale = this.localRadius / Math.max(this.radius, length);
    if (this.knob)
      this.knob.style.transform = `translate(${dx * knobScale}px, ${dy * knobScale}px)`;
    if (length < this.radius * 0.12) {
      this.sprinting = false;
      return { forward: 0, right: 0 };
    }
    const forward = -dy / length;
    // A small distance and angle margin keeps a held sprint stable near the trigger.
    const releaseMargin = Math.min(8, this.sprintDistance * 0.15);
    this.sprinting =
      -dy >= this.sprintDistance - (this.sprinting ? releaseMargin : 0) &&
      forward >= (this.sprinting ? 0.72 : 0.82);
    return { forward, right: dx / length };
  }
  clear(): void {
    if (this.knob) this.knob.style.transform = '';
    this.knob = null;
    this.sprinting = false;
  }
}
