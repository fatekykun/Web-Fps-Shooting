import { afterEach, expect, it, vi } from 'vitest';
import { waitForRoomServer } from './serverReadiness';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('waits through a host cold start and requires a ready eight-player service', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('Starting', { status: 503 }))
    .mockResolvedValueOnce(new Response('Loading page'))
    .mockResolvedValue(Response.json({ status: 'ok', maxPlayers: 8 }));
  vi.stubGlobal('fetch', fetch);
  const ready = waitForRoomServer('https://rooms.example', () => true);
  await vi.advanceTimersByTimeAsync(1600);
  await ready;
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('cancels a pending wake-up and bounds retries when the service remains unavailable', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(null, { status: 503 })),
  );
  let active = true;
  const cancelled = waitForRoomServer(
    'https://rooms.example',
    () => active,
  ).catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(1);
  active = false;
  await vi.advanceTimersByTimeAsync(750);
  expect(await cancelled).toBe('Room connection cancelled.');
  const expired = waitForRoomServer(
    'https://rooms.example',
    () => true,
    100,
  ).catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(101);
  expect(await expired).toMatch(/could not be reached/);
});
