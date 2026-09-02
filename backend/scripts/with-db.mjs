#!/usr/bin/env node
/**
 * Runs a command with a real PostgreSQL available, then shuts it down.
 *
 *   node scripts/with-db.mjs npx prisma migrate deploy
 *   node scripts/with-db.mjs npm test
 *
 * The server's lifetime is tied to this process, so nothing is left running and
 * a command can never half-succeed against a database that disappeared. This
 * is the local substitute for "docker compose up -d postgres" on a machine
 * with neither Docker nor a system PostgreSQL.
 *
 * DEVELOPMENT AND TEST ONLY. Staging and production point DATABASE_URL at
 * Render's managed PostgreSQL and never execute this file.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const FRESH = process.env.DB_FRESH === 'true';
const PORT = Number(process.env.DB_PORT ?? 55432);
const DATA_DIR = join(here, '..', process.env.DB_DATA_DIR ?? '.pgdata');
const USER = 'toptoken';
const PASSWORD = 'toptoken';
const DATABASE = process.env.DB_NAME ?? 'toptoken_dev';

const DATABASE_URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

const argv = process.argv.slice(2);
if (argv.length === 0) {
  process.stderr.write('Usage: node scripts/with-db.mjs <command> [args...]\n');
  process.exit(1);
}

if (FRESH && existsSync(DATA_DIR)) {
  rmSync(DATA_DIR, { recursive: true, force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

let started = false;

/**
 * Creates the database explicitly as UTF8.
 *
 * initdb inherits the Windows locale, which produced a WIN1252 cluster and made
 * PostgreSQL reject every Hebrew string in the catalog. Creating from template0
 * with an explicit encoding sidesteps the cluster default, so the development
 * database matches production (Render provisions UTF8) rather than silently
 * differing from it.
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
    }
  } finally {
    await client.end();
  }
}


async function shutdown(code) {
  if (started) {
    await pg.stop().catch(() => undefined);
  }
  process.exit(code);
}

try {
  if (!existsSync(DATA_DIR)) {
    await pg.initialise();
  }
  await pg.start();
  started = true;

  await ensureUtf8Database(pg, DATABASE);

  const [command, ...args] = argv;
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // DIRECT_URL mirrors DATABASE_URL locally: the embedded PostgreSQL is not
    // behind a pooler, so migrations and the runtime use the same connection.
    // In a deployed serverless environment the two differ; see the schema.
    env: { ...process.env, DATABASE_URL, DIRECT_URL: DATABASE_URL },
  });

  const code = await new Promise((resolve) => {
    child.on('close', resolve);
    child.on('error', (error) => {
      process.stderr.write(`Failed to run "${command}": ${error.message}\n`);
      resolve(1);
    });
  });

  await shutdown(code ?? 1);
} catch (error) {
  process.stderr.write(`\nDatabase harness failed: ${error instanceof Error ? error.message : error}\n`);
  await shutdown(1);
}
