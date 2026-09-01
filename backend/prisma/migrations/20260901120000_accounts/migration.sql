-- Customer accounts: passwords and federated sign-in.
--
-- Additive only. Every column is nullable and every table is new, so existing
-- customers, sessions and orders are untouched and the migration is safe to run
-- against a populated database. A customer created before this migration simply
-- has no password, which is a real state rather than a broken one.

-- --------------------------------------------------------------------------
-- Passwords on the existing customer record.
-- --------------------------------------------------------------------------
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "password_updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- A stored hash must be a hash. This does not prove the algorithm is strong,
-- but it does make a plaintext password physically unstorable in this column.
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_password_hash_is_hashed"
  CHECK ("password_hash" IS NULL OR "password_hash" LIKE 'scrypt$%');

-- --------------------------------------------------------------------------
-- Federated identities.
-- --------------------------------------------------------------------------
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');

CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "provider_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- One Google account is one customer. Without this a race during sign-up could
-- attach the same provider account to two customers.
CREATE UNIQUE INDEX "auth_identities_provider_account_key"
  ON "auth_identities"("provider", "provider_account_id");

CREATE INDEX "auth_identities_customer_id_idx" ON "auth_identities"("customer_id");

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- Password resets. Only the hash of the token is stored, as with sessions.
-- --------------------------------------------------------------------------
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "request_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");
CREATE INDEX "password_resets_customer_id_consumed_at_idx"
  ON "password_resets"("customer_id", "consumed_at");

ALTER TABLE "password_resets"
  ADD CONSTRAINT "password_resets_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A reset token must expire. An eternal one is a permanent account takeover.
ALTER TABLE "password_resets"
  ADD CONSTRAINT "password_reset_expiry_after_creation"
  CHECK ("expires_at" > "created_at");
