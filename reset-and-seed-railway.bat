@echo off
echo ========================================
echo Reset and Seed Railway Database
echo ========================================
echo.
echo Using DATABASE_URL from the environment...
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running this script.
  exit /b 1
)

echo.
echo Step 1: Resetting database...
echo.
npx prisma migrate reset --force

echo.
echo ========================================
echo Complete!
echo ========================================
