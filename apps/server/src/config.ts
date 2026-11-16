export interface ServerConfig {
  production: boolean;
  host: string;
  port: number;
  allowedOrigins: string[];
  maxRooms: number;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum)
    throw new Error(`${name} must be ${minimum}–${maximum}.`);
  return number;
}

export function readServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const allowedOrigins = (
    env.ALLOWED_ORIGINS ??
    (production
      ? ''
      : 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173')
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.length)
    throw new Error(
      'Set ALLOWED_ORIGINS to the website HTTPS origin before starting production.',
    );
  for (const origin of allowedOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('ALLOWED_ORIGINS must contain complete website origins.');
    }
    if (
      url.origin !== origin ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (production && url.protocol !== 'https:')
    ) {
      throw new Error(
        'ALLOWED_ORIGINS must contain exact origins without paths or wildcards; production requires HTTPS.',
      );
    }
  }
  return {
    production,
    allowedOrigins: [...new Set(allowedOrigins)],
    host: env.HOST?.trim() || (production ? '0.0.0.0' : '127.0.0.1'),
    port: integer(env.PORT, 2567, 1, 65535, 'PORT'),
    maxRooms: integer(env.MAX_ROOMS, 16, 1, 128, 'MAX_ROOMS'),
  };
}

/** Non-browser SDK clients have no Origin. Browser origins must match exactly. */
export function allowsOrigin(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  return !origin || allowed.includes(origin);
}
