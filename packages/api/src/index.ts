/**
 * API server entry point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
    // Request body size limit (default 1MB)
    bodyLimit: config.security.bodyLimit,
  });

  // Register CORS
  await app.register(cors, {
    origin: config.cors.allowedOrigins,
    credentials: true,
  });

  // Register rate limiting
  await app.register(rateLimit, {
    max: config.security.rateLimit.max,
    timeWindow: config.security.rateLimit.timeWindow,
    // Use API key if present, otherwise use IP
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key'] as string;
      return apiKey || request.ip || 'unknown';
    },
    // Custom error response
    errorResponseBuilder: (request, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      statusCode: 429,
      limit: context.max,
      remaining: 0,
    }),
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
