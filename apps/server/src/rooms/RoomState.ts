import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema(
  {
    id: t.string().default(''),
    name: t.string().default(''),
    slot: t.uint8().default(0),
    ready: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    yaw: t.float32().default(0),
    pitch: t.float32().default(0),
    halfHeight: t.float32().default(0.55),
    movement: t.string().default('walking'),
    ack: t.uint32().default(0),
    health: t.float32().default(100),
    alive: t.boolean().default(true),
    life: t.uint32().default(1),
    weapon: t.string().default('rifle'),
    protected: t.boolean().default(false),
    team: t.string().default('none'),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const ScoreState = schema(
  {
    id: t.string().default(''),
    name: t.string().default(''),
    team: t.string().default('none'),
    kills: t.uint32().default(0),
    deaths: t.uint32().default(0),
    connected: t.boolean().default(true),
  },
  'ScoreState',
);
export type ScoreState = SchemaType<typeof ScoreState>;

export const RoomState = schema(
  {
    hostId: t.string().default(''),
    phase: t.string().default('lobby'),
    tick: t.uint32().default(0),
    players: t.map(PlayerState),
    mode: t.string().default('ffa'),
    scoreLimit: t.uint16().default(20),
    durationSeconds: t.uint16().default(300),
    remainingSeconds: t.uint16().default(300),
    round: t.uint32().default(0),
    blueScore: t.uint32().default(0),
    orangeScore: t.uint32().default(0),
    winnerId: t.string().default(''),
    winnerName: t.string().default(''),
    winningTeam: t.string().default('none'),
    endReason: t.string().default(''),
    scores: t.map(ScoreState),
  },
  'RoomState',
);
export type RoomState = SchemaType<typeof RoomState>;
