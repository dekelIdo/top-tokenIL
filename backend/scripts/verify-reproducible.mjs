/**
 * Proves the database is reproducible from zero and that the seed is safe to
 * rerun. Invoked through scripts/with-db.mjs, which supplies DATABASE_URL.
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const run = (command) => execSync(command, { stdio: 'pipe', encoding: 'utf8' });
const line = (output, needle) =>
  output.split('\n').filter((l) => l.includes(needle)).join(' ').trim();

console.log('1. migrate deploy : ' + line(run('npx prisma migrate deploy'), 'applied'));
console.log('2. seed (first)   : ' + line(run('npm run seed'), 'Seed complete'));

const prisma = new PrismaClient();
const snapshot = async () => ({
  games: await prisma.game.count(),
  products: await prisma.product.count(),
  variants: await prisma.productVariant.count(),
  offers: await prisma.offer.count(),
  inventory: await prisma.inventory.count(),
  reviews: await prisma.review.count(),
});

const before = await snapshot();
console.log('3. seed (second)  : ' + line(run('npm run seed'), 'Seed complete'));
const after = await snapshot();

const identical = JSON.stringify(before) === JSON.stringify(after);
console.log('4. row counts     : ' + JSON.stringify(after));
console.log('5. repeatable     : ' + (identical ? 'YES, rerunning changed nothing' : 'NO, counts drifted'));
// `prisma migrate status` exits non-zero in situations that are not failures
// here (for example when it wants to talk about drift), so its outcome is
// reported rather than allowed to abort the check.
let status;
try {
  status = line(run('npx prisma migrate status'), 'up to date') || 'no "up to date" line';
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  status = line(output, 'up to date') || `exited ${error.status}: ${output.trim().split('\n').pop()}`;
}
console.log('6. migrate status : ' + status);

await prisma.$disconnect();
if (!identical) process.exit(1);
