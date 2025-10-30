-- Add stripe key storage to company_settings
ALTER TABLE "company_settings"
ADD COLUMN IF NOT EXISTS "stripePublicKey" TEXT;

ALTER TABLE "company_settings"
ADD COLUMN IF NOT EXISTS "stripeSecretKey" TEXT;
