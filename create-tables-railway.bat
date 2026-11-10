@echo off
echo ========================================
echo Creating Tables in Railway Database
echo ========================================
echo.
echo Using DATABASE_URL from the environment...
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running this script.
  exit /b 1
)

echo.
echo Running SQL script to create tables...
echo.
psql %DATABASE_URL% -f insert-tables.sql

echo.
echo ========================================
echo Complete!
echo ========================================
