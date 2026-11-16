import { expect, it } from 'vitest';
import { resolveServerEndpoint, validateServerUrl } from './serverEndpoint';

it('normalizes HTTPS/WSS origins for both matchmaking and socket transport', () => {
  expect(validateServerUrl(' wss://rooms.example/ ', true)).toBe(
    'https://rooms.example',
  );
  expect(validateServerUrl('ws://localhost:2567/')).toBe(
    'http://localhost:2567',
  );
  expect(
    resolveServerEndpoint('https://rooms.example/', {
      protocol: 'https:',
      hostname: 'play.example',
    }),
  ).toBe('https://rooms.example');
});
it('prevents local, insecure or malformed public deployment endpoints', () => {
  for (const endpoint of [
    'http://rooms.example',
    'https://localhost:2567',
    'ws://127.0.0.1:2567',
    'https://[::1]:2567',
  ])
    expect(() => validateServerUrl(endpoint, true)).toThrow();
  for (const endpoint of [
    'rooms.example',
    'ftp://rooms.example',
    'https://user:password@rooms.example',
    'https://rooms.example/api',
    'https://rooms.example/?token=x',
    'https://rooms.example/#x',
  ])
    expect(() => validateServerUrl(endpoint)).toThrow();
  expect(() =>
    resolveServerEndpoint('http://localhost:2567', {
      protocol: 'https:',
      hostname: 'localhost',
    }),
  ).toThrow(/HTTPS/);
});
it('keeps local training and development usable without probing a public frontend on port 2567', () => {
  expect(
    resolveServerEndpoint(undefined, {
      protocol: 'http:',
      hostname: '127.0.0.1',
    }),
  ).toBe('http://127.0.0.1:2567');
  expect(
    resolveServerEndpoint(
      undefined,
      { protocol: 'http:', hostname: '192.168.1.2' },
      true,
    ),
  ).toBe('http://192.168.1.2:2567');
  expect(() =>
    resolveServerEndpoint('', { protocol: 'https:', hostname: 'play.example' }),
  ).toThrow(/Training is available/);
});
