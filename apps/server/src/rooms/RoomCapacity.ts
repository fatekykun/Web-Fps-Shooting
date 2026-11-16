import { ServerError } from '@colyseus/core';

/** Reserve before async room initialization, so simultaneous creates cannot oversubscribe. */
export class RoomCapacity {
  private count = 0;
  constructor(readonly maximum: number) {}
  get active(): number {
    return this.count;
  }
  reserve(): () => void {
    if (this.count >= this.maximum)
      throw new ServerError(
        503,
        'All private frequencies are busy. Try again after a room closes.',
      );
    this.count++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.count--;
      }
    };
  }
}
