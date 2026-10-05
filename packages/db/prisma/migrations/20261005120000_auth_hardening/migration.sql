-- Auth hardening: refresh-token reuse detection, TOTP replay protection, MFA attempt limits.
ALTER TABLE "users" ADD COLUMN "mfa_last_step" INTEGER;
ALTER TABLE "sessions" ADD COLUMN "previous_refresh_token_hash" TEXT;
ALTER TABLE "sessions" ADD COLUMN "rotated_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "sessions_previous_refresh_token_hash_key" ON "sessions"("previous_refresh_token_hash");
ALTER TABLE "user_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
