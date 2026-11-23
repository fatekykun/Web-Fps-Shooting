export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface MovementInput {
  forward: number;
  right: number;
  yaw: number;
  sprint?: boolean;
  jump?: boolean;
  jumpPressed?: boolean;
  slidePressed?: boolean;
  pronePressed?: boolean;
  divePressed?: boolean;
}

export type MovementState =
  | 'walking'
  | 'sprinting'
  | 'crouching'
  | 'prone'
  | 'sliding'
  | 'backsliding'
  | 'airborne'
  | 'diving'
  | 'recovering';
