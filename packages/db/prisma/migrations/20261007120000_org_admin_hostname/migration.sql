-- Additive: an optional, unique admin hostname per organization (white-label sign-in).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "admin_hostname" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_admin_hostname_key" ON "organizations"("admin_hostname");
