import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { Database } from './db/database.js';
import { GatewayRepository } from './db/repository.js';
import { UpstreamManager } from './upstream/upstream-manager.js';
import { GatewayMcpEndpoint } from './gateway/gateway-server.js';
import { registerAdminRoutes } from './admin/admin-routes.js';
import { requireMcpToken } from './admin/auth.js';

export async function createApp() {
  const app = Fastify({ logger: { level: config.logLevel }, bodyLimit: config.maxBodyBytes, requestIdHeader: 'x-request-id' });
  const db = new Database();
  const repo = new GatewayRepository(db);
  const manager = new UpstreamManager(repo, db, app.log);
  const endpoint = new GatewayMcpEndpoint(manager, repo, app.log);

  await app.register(helmet, {
    global: true,
    // The gateway currently serves HTTP by default. Helmet's default
    // upgrade-insecure-requests directive would turn relative UI assets into
    // HTTPS requests and produce ERR_SSL_PROTOCOL_ERROR on an HTTP listener.
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: {
      directives: {
        'upgrade-insecure-requests': config.upgradeInsecureRequests ? [] : null
      }
    }
  });
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  const publicRoot = path.resolve(process.cwd(), 'public');
  const staticAssets: Record<string, { file: string; type: string }> = {
    '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
    '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
    '/i18n.js': { file: 'i18n.js', type: 'text/javascript; charset=utf-8' },
    '/favicon.svg': { file: 'favicon.svg', type: 'image/svg+xml' }
  };
  for (const [route, asset] of Object.entries(staticAssets)) {
    app.get(route, async (_request, reply) => {
      reply.type(asset.type).send(await readFile(path.join(publicRoot, asset.file)));
    });
  }

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    try { await db.query('SELECT 1'); reply.send({ status: 'ready' }); }
    catch { reply.code(503).send({ status: 'not_ready' }); }
  });

  await app.register(async (instance) => {
    instance.addHook('preHandler', requireMcpToken);
    await endpoint.register(instance);
  });
  await app.register(async (instance) => registerAdminRoutes(instance, repo, manager, db, app.log), { prefix: '' });

  app.addHook('onClose', async () => {
    await endpoint.close();
    await manager.stop();
    await db.close();
  });
  return { app, db, repo, manager };
}
