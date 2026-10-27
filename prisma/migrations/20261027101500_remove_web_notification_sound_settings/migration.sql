-- Native Counter and Station apps own their alert sounds.
-- Remove obsolete web notification sound settings from restaurant data and defaults.

ALTER TABLE "restaurants"
  ALTER COLUMN "notificationSettings"
  SET DEFAULT '{"orderAlerts":true,"desktopNotifications":true}'::jsonb;

UPDATE "restaurants"
SET "notificationSettings" =
  "notificationSettings" - 'soundEnabled' - 'soundType'
WHERE "notificationSettings" ? 'soundEnabled'
   OR "notificationSettings" ? 'soundType';
