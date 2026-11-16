import {
  createRouter,
  defineServer,
  defineRoom,
  matchMaker,
} from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DepotRoom } from './rooms/DepotRoom';
import { RoomCapacity } from './rooms/RoomCapacity';
import { initializePhysics } from '@breakpoint/shared/physics';
import { allowsOrigin, readServerConfig, type ServerConfig } from './config';

export function createGameServer(
  config: ServerConfig = readServerConfig(),
  isReady: () => boolean = () => true,
) {
  DepotRoom.capacity = new RoomCapacity(config.maxRooms);
  matchMaker.controller.standardHttpStatus = true;
  matchMaker.controller.getCorsHeaders = (headers) => ({
    'Access-Control-Allow-Origin': allowsOrigin(
      headers.get('origin'),
      config.allowedOrigins,
    )
      ? (headers.get('origin') ?? config.allowedOrigins[0]!)
      : config.allowedOrigins[0]!,
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return defineServer({
    greet: false,
    gracefullyShutdown: false,
    beforeListen: initializePhysics,
    routes: createRouter(
      {},
      {
        onRequest: (request) => {
          if (
            !allowsOrigin(request.headers.get('origin'), config.allowedOrigins)
          ) {
            return Response.json(
              {
                error: 'This website is not allowed to connect to these rooms.',
              },
              { status: 403 },
            );
          }
          if (!isReady())
            return Response.json(
              { error: 'Server is restarting. Please reconnect shortly.' },
              { status: 503 },
            );
        },
      },
    ),
    transport: new WebSocketTransport({
      maxPayload: 8192,
      pingInterval: 3000,
      pingMaxRetries: 2,
      perMessageDeflate: false,
      beforeUpgrade: (request) => {
        if (!isReady()) return new Response(null, { status: 503 });
        if (!allowsOrigin(request.headers.get('origin'), config.allowedOrigins))
          return new Response(null, { status: 403 });
      },
    }),
    rooms: { depot: defineRoom(DepotRoom) },
    express: (app) => {
      app.get('/health', (_request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response
          .status(isReady() ? 200 : 503)
          .json({ status: isReady() ? 'ok' : 'draining', maxPlayers: 8 });
      });
    },
  });
}
