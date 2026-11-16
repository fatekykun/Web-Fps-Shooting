import { expect, it } from 'vitest';
import { allowsOrigin, readServerConfig } from './config';
import { RoomCapacity } from './rooms/RoomCapacity';

it('defaults to local development and binds production to the platform network', () => {
  expect(readServerConfig({}).host).toBe('127.0.0.1');
  expect(readServerConfig({}).port).toBe(2567);
  expect(() => readServerConfig({ NODE_ENV: 'production' })).toThrow(
    /ALLOWED_ORIGINS/,
  );
  const config = readServerConfig({
    NODE_ENV: 'production',
    PORT: '10000',
    ALLOWED_ORIGINS: 'https://game.example, https://preview.example',
    MAX_ROOMS: '4',
  });
  expect(config.host).toBe('0.0.0.0');
  expect(config.port).toBe(10000);
  expect(config.maxRooms).toBe(4);
  expect(allowsOrigin('https://game.example', config.allowedOrigins)).toBe(
    true,
  );
  expect(allowsOrigin(undefined, config.allowedOrigins)).toBe(true);
  for (const origin of [
    'null',
    'https://evil.example',
    'https://game.example.evil.example',
    'http://game.example',
  ])
    expect(allowsOrigin(origin, config.allowedOrigins)).toBe(false);
});
it('rejects ambiguous origins and invalid numeric configuration', () => {
  for (const origin of [
    '*',
    'https://game.example/',
    'http://game.example',
    'https://user:pass@game.example',
    'https://game.example/path',
  ])
    expect(() =>
      readServerConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: origin }),
    ).toThrow();
  for (const port of ['', '0', '-1', '65536', 'NaN', '1.2'])
    expect(() => readServerConfig({ PORT: port })).toThrow();
  for (const max of ['0', '129', 'NaN'])
    expect(() => readServerConfig({ MAX_ROOMS: max })).toThrow();
});
it('reserves capacity synchronously and releases it once on failure or disposal', () => {
  const capacity = new RoomCapacity(1);
  const release = capacity.reserve();
  expect(capacity.active).toBe(1);
  expect(() => capacity.reserve()).toThrow(/frequencies are busy/);
  release();
  release();
  expect(capacity.active).toBe(0);
  capacity.reserve()();
  expect(capacity.active).toBe(0);
});
