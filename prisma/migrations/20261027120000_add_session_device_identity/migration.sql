-- Add device identity to user sessions for one-session-per-device replacement.
-- Nullable keeps existing sessions and older clients valid.

ALTER TABLE "user_sessions"
  ADD COLUMN "deviceId" TEXT,
  ADD COLUMN "deviceType" TEXT;

CREATE INDEX "user_sessions_userId_deviceId_idx"
  ON "user_sessions"("userId", "deviceId");

CREATE INDEX "user_sessions_userId_deviceType_lastActivity_idx"
  ON "user_sessions"("userId", "deviceType", "lastActivity");
