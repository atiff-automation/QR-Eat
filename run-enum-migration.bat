@echo off
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running this script.
  exit /b 1
)
npx tsx scripts/apply-enum-migration.ts
