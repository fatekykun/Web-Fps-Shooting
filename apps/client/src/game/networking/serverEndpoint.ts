export function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

/** One root URL serves HTTP matchmaking and WebSocket upgrades behind the host's TLS proxy. */
export function validateServerUrl(
  value: string,
  requirePublic = false,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      'VITE_SERVER_URL must be a complete HTTP(S) or WS(S) server URL.',
    );
  }
  if (
    !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'VITE_SERVER_URL must be a server origin, without credentials, a path, query or fragment.',
    );
  }
  const secure = url.protocol === 'https:' || url.protocol === 'wss:';
  if (requirePublic && (!secure || isLoopback(url.hostname))) {
    throw new Error(
      'Public deployments require an HTTPS/WSS multiplayer server, not a local address.',
    );
  }
  // The SDK derives ws/wss from the HTTP matchmaking endpoint.
  url.protocol = secure ? 'https:' : 'http:';
  return url.origin;
}

export function resolveServerEndpoint(
  configured: string | undefined,
  page: { protocol: string; hostname: string },
  development = false,
): string {
  if (configured?.trim()) {
    const endpoint = validateServerUrl(
      configured,
      !development && !isLoopback(page.hostname),
    );
    if (page.protocol === 'https:' && endpoint.startsWith('http:')) {
      throw new Error(
        'Secure websites require an HTTPS/WSS multiplayer server.',
      );
    }
    return endpoint;
  }
  if (development || isLoopback(page.hostname))
    return `${page.protocol}//${page.hostname}:2567`;
  throw new Error(
    'Private matches are temporarily unavailable on this website. Training is available.',
  );
}
