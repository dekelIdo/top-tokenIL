#!/usr/bin/env node
/**
 * Long-running local PostgreSQL for development.
 *
 * This machine has no system PostgreSQL and no Docker, so `embedded-postgres`
 * provisions a real PostgreSQL server into a gitignored directory. It is a
 * DEVELOPMENT CONVENIENCE ONLY and must never run in staging or production,
 * where Render's managed PostgreSQL is used.
 *
 * The application never imports this file. `DATABASE_URL` remains the single
 * connection interface, so a system PostgreSQL or a remote one works
 * identically: point `DATABASE_URL` at it and skip this script entirely.
 *
 *   npm run db:up       provision + start, print the DATABASE_URL, stay running
 *   npm run db:stop     stop the server, keep the data
 *   npm run db:reset    delete the data directory and start fresh
 *
 * For one-shot commands (migrations, seed, tests) prefer `scripts/with-db.mjs`,
 * which owns the server's lifetime for the duration of a single command.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, '..', '.pgdata');

export const DEV_DB = {
  user: 'toptoken',
  password: 'toptoken',
  port: 55432,
  database: 'toptoken_dev',
};

export const DEV_DATABASE_URL =
  `postgresql://${DEV_DB.user}:${DEV_DB.password}@localhost:${DEV_DB.port}/${DEV_DB.database}`;

/**
 * Creates the database explicitly as UTF8.
 *
 * initdb inherits the Windows locale, which produced a WIN1252 cluster and made
 * PostgreSQL reject every Hebrew string in the catalog with "no equivalent in
 * encoding WIN1252". Creating from template0 with an explicit encoding
 * sidesteps the cluster default, so the development database matches production
 * (Render provisions UTF8) rather than silently differing from it.
 */
async function ensureUtf8Database(pg, database) {
  const client = pg.getPgClient();
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existing.rowCount === 0) {
      await client.query(
        `CREATE DATABASE "${database}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
      );
      process.stdout.write(`Created database "${database}" (UTF8).\n`);
    }
  } finally {
    await client.end();
  }
}

function instance(dataDir = DATA_DIR) {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DEV_DB.user,
    password: DEV_DB.password,
    port: DEV_DB.port,
    persistent: true,
  });
}

async function start({ fresh = false } = {}) {
  if (fresh && existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }

  const pg = instance();

  if (!existsSync(DATA_DIR)) {
    process.stdout.write('Initialising a fresh PostgreSQL cluster...\n');
    await pg.initialise();
  }

  await pg.start();
  await ensureUtf8Database(pg, DEV_DB.database);

  process.stdout.write(`\nPostgreSQL is running on port ${DEV_DB.port}.\n`);
  process.stdout.write(`DATABASE_URL=${DEV_DATABASE_URL}\n\n`);
  process.stdout.write('Leave this process running. Stop it with Ctrl+C.\n');

  const shutdown = async () => {
    process.stdout.write('\nStopping PostgreSQL...\n');
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function stop() {
  await instance().stop();
  process.stdout.write('PostgreSQL stopped.\n');
}

const command = process.argv[2] ?? 'start';

try {
  if (command === 'start') {
    await start();
  } else if (command === 'reset') {
    await start({ fresh: true });
  } else if (command === 'stop') {
    await stop();
  } else {
    process.stderr.write(`Unknown command "${command}". Use start, stop or reset.\n`);
    process.exit(1);
  }
} catch (error) {
  process.stderr.write(
    `\nDatabase command failed: ${error instanceof Error ? error.message : error}\n`,
  );
  process.exit(1);
}
