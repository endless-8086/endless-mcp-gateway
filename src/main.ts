import { createApp } from './app.js';
import { config } from './config.js';

const { app, manager } = await createApp();

try {
  await manager.start();
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port }, 'MCP gateway started');
} catch (error) {
  app.log.error(error, 'failed to start MCP gateway');
  await app.close().catch(() => undefined);
  process.exitCode = 1;
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
