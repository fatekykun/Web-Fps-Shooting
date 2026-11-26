import type { InputManager } from './InputManager';

export class KeyboardInput {
  private readonly keys = new Set<string>();
  constructor(private readonly input: InputManager) {
    document.addEventListener('keydown', this.down);
    document.addEventListener('keyup', this.up);
  }
  private readonly down = (event: KeyboardEvent): void => {
    const input = this.input;
    if (!input.locked || event.metaKey || event.altKey) return;
    const b = input.bindings;
    if (event.code === b.scoreboard) {
      event.preventDefault();
      input.setScoreboard(true);
      return;
    }
    if (event.code === 'Escape') {
      input.release();
      return;
    }
    if (
      !Object.values(b).includes(event.code) &&
      !(
        event.code === 'ShiftRight' &&
        b.sprint === 'ShiftLeft' &&
        !Object.values(b).includes('ShiftRight')
      )
    )
      return;
    event.preventDefault();
    if (!this.keys.has(event.code) && !event.repeat) {
      if (event.code === b.jump) input.movement.jumpPressed = true;
      if (event.code === b.slide) input.movement.slidePressed = true;
      if (event.code === b.prone) input.movement.pronePressed = true;
      if (event.code === b.dive) input.movement.divePressed = true;
      if (event.code === b.reload) input.weapon.reloadPressed = true;
      if (event.code === b.inspect) input.inspectPressed = true;
      for (const id of ['rifle', 'smg', 'shotgun', 'sniper', 'melee'] as const)
        if (event.code === b[id]) input.weapon.switchTo = id;
    }
    this.keys.add(event.code);
    this.axes();
  };
  private readonly up = (event: KeyboardEvent): void => {
    if (event.code === this.input.bindings.scoreboard) {
      if (this.input.locked) event.preventDefault();
      this.input.setScoreboard(false);
    }
    this.keys.delete(event.code);
    this.axes();
  };
  private axes(): void {
    const b = this.input.bindings;
    this.input.setKeyboardAxes(
      Number(this.keys.has(b.forward)) - Number(this.keys.has(b.backward)),
      Number(this.keys.has(b.right)) - Number(this.keys.has(b.left)),
      this.keys.has(b.sprint) ||
        (b.sprint === 'ShiftLeft' &&
          !Object.values(b).includes('ShiftRight') &&
          this.keys.has('ShiftRight')),
      this.keys.has(b.jump),
    );
  }
  clear(): void {
    this.keys.clear();
    this.axes();
  }
  dispose(): void {
    document.removeEventListener('keydown', this.down);
    document.removeEventListener('keyup', this.up);
  }
}
