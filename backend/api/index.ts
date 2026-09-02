import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Vercel serverless entry for the backend.
 *
 * The same NestJS application the always-on server runs, adapted to a host that
 * does not keep a process alive between requests. It reuses the compiled build
 * (`dist/`, produced in the Vercel build step) so there is exactly one app, not
 * a serverless copy that can drift from the server one.
 *
 * Two things differ from `src/main.ts`:
 *
 * 1. **`init()`, not `listen()`.** Vercel owns the socket; the function is handed
 *    a request and a response and delegates them to Express.
 * 2. **The app is built once and cached.** A warm instance serves many requests,
 *    so paying the Nest bootstrap on every one would add a cold start to each.
 *
 * The housekeeping timer does not run here. On Vercel it is disabled
 * (`HOUSEKEEPING_INTERVAL_SECONDS=0`) and driven instead by a Cron hitting
 * `/api/v1/internal/housekeeping`, because a serverless process is not alive to
 * hold a timer. See backend/vercel.json.
 */

// Required from the compiled output rather than imported from source: Vercel
// compiles this file on its own, and pointing it at `dist/` keeps NestJS's
// decorator metadata intact instead of re-bundling the whole app through the
// function compiler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../dist/main.js') as {
  createApp: () => Promise<NestExpressApplication>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateEnvironment } = require('../dist/config/environment.js') as {
  validateEnvironment: (source: NodeJS.ProcessEnv) => unknown;
};

type ExpressHandler = (req: IncomingMessage, res: ServerResponse) => void;

let cached: Promise<ExpressHandler> | null = null;

async function handlerFor(): Promise<ExpressHandler> {
  if (!cached) {
    cached = (async () => {
      // Fail fast on a bad configuration, the same as the server does before
      // Nest builds anything. Without this the first symptom is a stack trace
      // from deep inside dependency injection.
      validateEnvironment(process.env);

      const app = await createApp();
      await app.init();
      return app.getHttpAdapter().getInstance() as unknown as ExpressHandler;
    })().catch((error) => {
      // Clear the cache so a redeploy that fixes the configuration can recover
      // without the rejected promise being served forever.
      cached = null;
      throw error;
    });
  }
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const express = await handlerFor();
  express(req, res);
}
