import { createGameServer } from './server';
import { readServerConfig } from './config';

const { port, host, ...settings } = readServerConfig();
let shuttingDown = false;
const server = createGameServer(
  { port, host, ...settings },
  () => !shuttingDown,
);
await server.listen(port, host);
console.log(`BREAKPOINT rooms listening at http://${host}:${port}`);
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => {
    console.error('Shutdown exceeded 10 seconds.');
    process.exit(1);
  }, 10000);
  deadline.unref();
  try {
    await server.gracefullyShutdown(false);
  } finally {
    clearTimeout(deadline);
  }
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
