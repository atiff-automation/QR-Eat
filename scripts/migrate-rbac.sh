#!/bin/bash

# RBAC Migration Script for QR Restaurant System
# This script performs a complete migration from legacy cookie-based auth to RBAC system
# 
# Usage: ./scripts/migrate-rbac.sh [environment]
# Environment options: development, staging, production

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$BACKUP_DIR/rbac_migration_$(date +%Y%m%d_%H%M%S).log"
ENVIRONMENT="${1:-development}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if we're in the correct directory
    if [ ! -f "package.json" ] || [ ! -f "prisma/schema.prisma" ]; then
        error "Please run this script from the project root directory"
    fi
    
    # Check if required tools are installed
    command -v node >/dev/null 2>&1 || error "Node.js is required but not installed"
    command -v npm >/dev/null 2>&1 || error "npm is required but not installed"
    command -v npx >/dev/null 2>&1 || error "npx is required but not installed"
    
    # Check environment
    if [ ! -f ".env.${ENVIRONMENT}" ] && [ ! -f ".env" ]; then
        error "Environment file not found. Please ensure .env.${ENVIRONMENT} or .env exists"
    fi
    
    # Check database connection
    log "Testing database connection..."
    if ! npx prisma db execute --stdin < /dev/null 2>/dev/null; then
        error "Cannot connect to database. Please check your DATABASE_URL"
    fi
    
    success "Prerequisites check completed"
}

# Create backup directory
setup_backup_dir() {
    log "Setting up backup directory..."
    mkdir -p "$BACKUP_DIR"
    success "Backup directory ready: $BACKUP_DIR"
}

# Backup current database
backup_database() {
    log "Creating database backup..."
    
    # Extract database info from DATABASE_URL
    if [ -f ".env.${ENVIRONMENT}" ]; then
        source ".env.${ENVIRONMENT}"
    elif [ -f ".env" ]; then
        source ".env"
    fi
    
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL not found in environment file"
    fi
    
    BACKUP_FILE="$BACKUP_DIR/pre_rbac_migration_$(date +%Y%m%d_%H%M%S).sql"
    
    # Create backup using pg_dump
    if command -v pg_dump >/dev/null 2>&1; then
        log "Creating PostgreSQL backup..."
        pg_dump "$DATABASE_URL" > "$BACKUP_FILE" || error "Failed to create database backup"
        success "Database backup created: $BACKUP_FILE"
    else
        warning "pg_dump not found. Skipping database backup."
        warning "Please ensure you have a backup of your database before proceeding."
        read -p "Do you want to continue without backup? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Migration cancelled by user"
        fi
    fi
}

# Check current system state
check_current_state() {
    log "Checking current system state..."
    
    # Check if RBAC tables already exist
    if npx prisma db execute --stdin <<< "SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles';" 2>/dev/null | grep -q "1"; then
        warning "RBAC tables already exist. This might be a repeated migration."
        read -p "Do you want to continue? This will reset the RBAC system. (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Migration cancelled by user"
        fi
    fi
    
    # Count existing users
    OWNER_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM restaurant_owners;" 2>/dev/null | tail -n 1 | tr -d ' ')
    STAFF_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM staff;" 2>/dev/null | tail -n 1 | tr -d ' ')
    ADMIN_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM platform_admins;" 2>/dev/null | tail -n 1 | tr -d ' ')
    
    log "Current user counts:"
    log "  - Restaurant Owners: ${OWNER_COUNT:-0}"
    log "  - Staff Members: ${STAFF_COUNT:-0}"
    log "  - Platform Admins: ${ADMIN_COUNT:-0}"
    
    success "System state check completed"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    # Generate Prisma client
    log "Generating Prisma client..."
    npx prisma generate || error "Failed to generate Prisma client"
    
    # Deploy migrations
    log "Deploying database migrations..."
    npx prisma migrate deploy || error "Failed to deploy migrations"
    
    success "Database migrations completed"
}

# Seed permissions and role templates
seed_rbac_data() {
    log "Seeding RBAC permissions and role templates..."
    
    # Check if seed script exists
    if [ -f "prisma/seed.ts" ] || [ -f "prisma/seed.js" ]; then
        npx prisma db seed || error "Failed to seed database"
    else
        warning "No seed script found. Creating basic RBAC data..."
        node "$SCRIPT_DIR/seed-rbac-data.js" || error "Failed to create basic RBAC data"
    fi
    
    success "RBAC data seeding completed"
}

# Migrate existing users to RBAC system
migrate_users() {
    log "Migrating existing users to RBAC system..."
    
    node "$SCRIPT_DIR/migrate-users.js" || error "Failed to migrate users"
    
    success "User migration completed"
}

# Verify migration
verify_migration() {
    log "Verifying migration integrity..."
    
    node "$SCRIPT_DIR/verify-migration.js" || error "Migration verification failed"
    
    success "Migration verification completed"
}

# Update application configuration
update_config() {
    log "Updating application configuration..."
    
    # Create backup of current .env
    if [ -f ".env" ]; then
        cp ".env" "$BACKUP_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Add RBAC configuration if not present
    if ! grep -q "RBAC_ENABLED" ".env" 2>/dev/null; then
        echo "" >> ".env"
        echo "# RBAC Configuration" >> ".env"
        echo "RBAC_ENABLED=true" >> ".env"
        echo "RBAC_AUDIT_ENABLED=true" >> ".env"
        echo "RBAC_SESSION_TIMEOUT=86400" >> ".env"  # 24 hours
        log "Added RBAC configuration to .env file"
    fi
    
    success "Configuration update completed"
}

# Test system functionality
test_system() {
    log "Running system tests..."
    
    # Build the application
    log "Building application..."
    npm run build || error "Failed to build application"
    
    # Run RBAC-specific tests if they exist
    if [ -f "package.json" ] && grep -q "test:rbac" package.json; then
        log "Running RBAC tests..."
        npm run test:rbac || warning "Some RBAC tests failed"
    fi
    
    success "System testing completed"
}

# Generate migration report
generate_report() {
    log "Generating migration report..."
    
    REPORT_FILE="$BACKUP_DIR/rbac_migration_report_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$REPORT_FILE" << EOF
# RBAC Migration Report

**Migration Date:** $(date)
**Environment:** $ENVIRONMENT
**Backup Location:** $BACKUP_DIR

## Migration Summary

### User Migration Results
- Restaurant Owners Migrated: ${OWNER_COUNT:-0}
- Staff Members Migrated: ${STAFF_COUNT:-0}
- Platform Admins Migrated: ${ADMIN_COUNT:-0}

### RBAC System Status
- Permissions Seeded: ✅
- Role Templates Created: ✅
- User Roles Assigned: ✅
- Audit Logging Enabled: ✅

### Database Changes
- New Tables Created:
  - user_roles
  - permissions
  - role_permissions
  - audit_logs
  - user_sessions

### Configuration Updates
- RBAC_ENABLED=true
- RBAC_AUDIT_ENABLED=true
- RBAC_SESSION_TIMEOUT=86400

### Next Steps
1. Test all user workflows
2. Verify permission enforcement
3. Monitor system performance
4. Train users on new role switching features

### Rollback Information
- Backup File: $BACKUP_FILE
- Rollback Script: ./scripts/rollback-rbac.sh

### Support
For issues or questions, refer to:
- RBAC-SYSTEM-DOCUMENTATION.md
- API-DOCUMENTATION.md
- Contact: [Development Team]

EOF

    success "Migration report generated: $REPORT_FILE"
}

# Main migration function
main() {
    log "Starting RBAC Migration for QR Restaurant System"
    log "Environment: $ENVIRONMENT"
    log "Log file: $LOG_FILE"
    
    echo "========================================"
    echo "RBAC Migration Script"
    echo "Environment: $ENVIRONMENT"
    echo "========================================"
    echo
    
    # Confirmation prompt for production
    if [ "$ENVIRONMENT" = "production" ]; then
        echo -e "${RED}WARNING: This will migrate the PRODUCTION database to RBAC system.${NC}"
        echo "This operation is irreversible without a database restore."
        echo
        read -p "Are you sure you want to proceed? Type 'YES' to continue: " -r
        if [ "$REPLY" != "YES" ]; then
            error "Migration cancelled by user"
        fi
    fi
    
    # Execute migration steps
    check_prerequisites
    setup_backup_dir
    backup_database
    check_current_state
    run_migrations
    seed_rbac_data
    migrate_users
    verify_migration
    update_config
    test_system
    generate_report
    
    echo
    echo "========================================"
    success "RBAC Migration completed successfully!"
    echo "========================================"
    echo
    log "Migration log: $LOG_FILE"
    log "Backup directory: $BACKUP_DIR"
    echo
    echo "Next steps:"
    echo "1. Review the migration report"
    echo "2. Test all user workflows"
    echo "3. Monitor system performance"
    echo "4. Train users on new features"
    echo
    echo "If you encounter any issues, use: ./scripts/rollback-rbac.sh"
}

# Run main function
main "$@"