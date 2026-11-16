/** Wake a sleeping hobby host before matchmaking. Closing the dialog cancels future room creation. */
export async function waitForRoomServer(
  endpoint: string,
  isActive: () => boolean,
  timeoutMs = 75000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (isActive() && performance.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(
          Math.ceil(Math.max(1, Math.min(10000, deadline - performance.now()))),
        ),
      });
      if (response.ok) {
        const health = (await response.json()) as {
          status?: string;
          maxPlayers?: number;
        };
        if (health.status === 'ok' && health.maxPlayers === 8) {
          if (!isActive()) throw new Error('Room connection cancelled.');
          return;
        }
      }
    } catch {
      /* Cold starts can briefly return HTML, a proxy error or an unavailable socket. */
    }
    if (isActive())
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(750, Math.max(0, deadline - performance.now())),
        ),
      );
  }
  throw new Error(
    isActive()
      ? 'Private matches could not be reached. Please try again shortly.'
      : 'Room connection cancelled.',
  );
}
