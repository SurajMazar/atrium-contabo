-- Platform-wide providers managed from the super-admin panel (instead of env only).
CREATE TABLE "platform_providers" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secrets_enc" TEXT,
    "from_email" TEXT,
    "from_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_providers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_providers_kind_enabled_idx" ON "platform_providers"("kind", "enabled");
