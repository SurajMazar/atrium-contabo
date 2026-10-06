-- Additive only: existing rows keep their data (new columns are nullable / default to empty).

-- Per-website dashboard branding, layered over the organization's branding.
ALTER TABLE "websites" ADD COLUMN IF NOT EXISTS "admin_branding" JSONB;

-- Invitations can limit the invitee to specific websites.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "website_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
