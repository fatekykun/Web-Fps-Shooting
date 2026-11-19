/** Each look gesture starts at its own origin; deltas never cross pointer owners. */
export class TouchCamera {
  private x = 0;
  private y = 0;
  begin(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
  move(x: number, y: number): { x: number; y: number } {
    const delta = { x: x - this.x, y: y - this.y };
    this.x = x;
    this.y = y;
    return delta;
  }
}
