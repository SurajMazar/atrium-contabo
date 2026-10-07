-- Built-in analytics per organization, off by default (super admins turn it on). Additive only.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "analytics_enabled" BOOLEAN NOT NULL DEFAULT false;
