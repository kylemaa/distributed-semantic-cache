/**
 * API server entry point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerRoutes } from './routes.js';

async function start() {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: config.cors.allowedOrigins,
    credentials: true,
  });

  // Register routes
  await registerRoutes(app);

  // Start server
  try {
    await app.listen({
      port: config.api.port,
      host: config.api.host,
    });
    console.log(`🚀 Server running at http://${config.api.host}:${config.api.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n${signal} received, closing server...`);
      await app.close();
      process.exit(0);
    });
  });
}

start();
