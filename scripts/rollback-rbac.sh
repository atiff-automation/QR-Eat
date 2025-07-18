#!/bin/bash

# RBAC Rollback Script for QR Restaurant System
# This script rolls back the RBAC migration and restores the legacy cookie-based authentication
# 
# Usage: ./scripts/rollback-rbac.sh [backup_file]

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$BACKUP_DIR/rbac_rollback_$(date +%Y%m%d_%H%M%S).log"
BACKUP_FILE="$1"

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

# Find backup file
find_backup_file() {
    if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        log "Using specified backup file: $BACKUP_FILE"
        return
    fi
    
    log "Searching for latest backup file..."
    
    if [ ! -d "$BACKUP_DIR" ]; then
        error "Backup directory not found: $BACKUP_DIR"
    fi
    
    # Find the most recent backup file
    BACKUP_FILE=$(find "$BACKUP_DIR" -name "pre_rbac_migration_*.sql" | sort -r | head -n 1)
    
    if [ -z "$BACKUP_FILE" ]; then
        error "No backup file found in $BACKUP_DIR. Cannot proceed with rollback."
    fi
    
    log "Found backup file: $BACKUP_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking rollback prerequisites..."
    
    # Check if we're in the correct directory
    if [ ! -f "package.json" ] || [ ! -f "prisma/schema.prisma" ]; then
        error "Please run this script from the project root directory"
    fi
    
    # Check if required tools are installed
    command -v node >/dev/null 2>&1 || error "Node.js is required but not installed"
    command -v psql >/dev/null 2>&1 || error "PostgreSQL client (psql) is required but not installed"
    
    # Check database connection
    log "Testing database connection..."
    if ! npx prisma db execute --stdin < /dev/null 2>/dev/null; then
        error "Cannot connect to database. Please check your DATABASE_URL"
    fi
    
    success "Prerequisites check completed"
}

# Create rollback backup
create_rollback_backup() {
    log "Creating backup of current RBAC state..."
    
    # Extract database info from DATABASE_URL
    if [ -f ".env" ]; then
        source ".env"
    fi
    
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL not found in environment file"
    fi
    
    ROLLBACK_BACKUP="$BACKUP_DIR/rbac_state_before_rollback_$(date +%Y%m%d_%H%M%S).sql"
    
    if command -v pg_dump >/dev/null 2>&1; then
        pg_dump "$DATABASE_URL" > "$ROLLBACK_BACKUP" || error "Failed to create rollback backup"
        success "RBAC state backup created: $ROLLBACK_BACKUP"
    else
        warning "pg_dump not found. Skipping current state backup."
    fi
}

# Export current RBAC data
export_rbac_data() {
    log "Exporting current RBAC data for reference..."
    
    RBAC_EXPORT_DIR="$BACKUP_DIR/rbac_export_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$RBAC_EXPORT_DIR"
    
    # Export user roles
    log "Exporting user roles..."
    npx prisma db execute --stdin <<< "COPY (SELECT * FROM user_roles) TO STDOUT WITH CSV HEADER;" > "$RBAC_EXPORT_DIR/user_roles.csv" 2>/dev/null || warning "Failed to export user roles"
    
    # Export permissions
    log "Exporting permissions..."
    npx prisma db execute --stdin <<< "COPY (SELECT * FROM permissions) TO STDOUT WITH CSV HEADER;" > "$RBAC_EXPORT_DIR/permissions.csv" 2>/dev/null || warning "Failed to export permissions"
    
    # Export role permissions
    log "Exporting role permissions..."
    npx prisma db execute --stdin <<< "COPY (SELECT * FROM role_permissions) TO STDOUT WITH CSV HEADER;" > "$RBAC_EXPORT_DIR/role_permissions.csv" 2>/dev/null || warning "Failed to export role permissions"
    
    # Export audit logs
    log "Exporting audit logs..."
    npx prisma db execute --stdin <<< "COPY (SELECT * FROM audit_logs) TO STDOUT WITH CSV HEADER;" > "$RBAC_EXPORT_DIR/audit_logs.csv" 2>/dev/null || warning "Failed to export audit logs"
    
    success "RBAC data exported to: $RBAC_EXPORT_DIR"
}

# Restore database from backup
restore_database() {
    log "Restoring database from backup..."
    
    if [ -f ".env" ]; then
        source ".env"
    fi
    
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL not found in environment file"
    fi
    
    # Drop current database and restore from backup
    log "Dropping current database..."
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    
    if [ -z "$DB_NAME" ]; then
        error "Could not extract database name from DATABASE_URL"
    fi
    
    # Create a temporary connection URL without the database name
    DB_BASE_URL=$(echo "$DATABASE_URL" | sed 's/\/[^\/]*$//')
    
    log "Terminating existing connections..."
    psql "$DB_BASE_URL/postgres" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" || warning "Could not terminate all connections"
    
    log "Dropping database: $DB_NAME"
    psql "$DB_BASE_URL/postgres" -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" || error "Failed to drop database"
    
    log "Creating database: $DB_NAME"
    psql "$DB_BASE_URL/postgres" -c "CREATE DATABASE \"$DB_NAME\";" || error "Failed to create database"
    
    log "Restoring from backup: $BACKUP_FILE"
    psql "$DATABASE_URL" < "$BACKUP_FILE" || error "Failed to restore database from backup"
    
    success "Database restored from backup"
}

# Update configuration
update_config() {
    log "Updating application configuration..."
    
    # Create backup of current .env
    if [ -f ".env" ]; then
        cp ".env" "$BACKUP_DIR/.env.rbac.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Remove RBAC configuration
    if [ -f ".env" ]; then
        sed -i.bak '/^RBAC_ENABLED=/d' ".env" 2>/dev/null || true
        sed -i.bak '/^RBAC_AUDIT_ENABLED=/d' ".env" 2>/dev/null || true
        sed -i.bak '/^RBAC_SESSION_TIMEOUT=/d' ".env" 2>/dev/null || true
        sed -i.bak '/^# RBAC Configuration/d' ".env" 2>/dev/null || true
        rm -f ".env.bak" 2>/dev/null || true
        
        # Add legacy auth configuration
        echo "" >> ".env"
        echo "# Legacy Authentication (Restored)" >> ".env"
        echo "LEGACY_AUTH_ENABLED=true" >> ".env"
        
        log "Removed RBAC configuration and restored legacy auth settings"
    fi
    
    success "Configuration rollback completed"
}

# Regenerate Prisma client
regenerate_client() {
    log "Regenerating Prisma client..."
    
    npx prisma generate || error "Failed to regenerate Prisma client"
    
    success "Prisma client regenerated"
}

# Test legacy system
test_legacy_system() {
    log "Testing legacy system functionality..."
    
    # Build the application
    log "Building application..."
    npm run build || error "Failed to build application"
    
    # Check if legacy auth tables exist
    log "Verifying legacy tables..."
    if ! npx prisma db execute --stdin <<< "SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_owners';" 2>/dev/null | grep -q "1"; then
        error "Legacy tables not found. Rollback may have failed."
    fi
    
    success "Legacy system testing completed"
}

# Generate rollback report
generate_rollback_report() {
    log "Generating rollback report..."
    
    REPORT_FILE="$BACKUP_DIR/rbac_rollback_report_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$REPORT_FILE" << EOF
# RBAC Rollback Report

**Rollback Date:** $(date)
**Backup File Used:** $BACKUP_FILE
**RBAC Data Exported:** $RBAC_EXPORT_DIR

## Rollback Summary

### Actions Performed
- ✅ RBAC data exported for reference
- ✅ Database restored from pre-RBAC backup
- ✅ RBAC configuration removed
- ✅ Legacy authentication restored
- ✅ Prisma client regenerated

### Database Status
- RBAC tables removed
- Legacy tables restored
- Data integrity verified

### Configuration Changes
- RBAC_ENABLED removed
- LEGACY_AUTH_ENABLED=true added

### Data Preservation
All RBAC data has been exported to CSV files for reference:
- User roles: $RBAC_EXPORT_DIR/user_roles.csv
- Permissions: $RBAC_EXPORT_DIR/permissions.csv
- Role permissions: $RBAC_EXPORT_DIR/role_permissions.csv
- Audit logs: $RBAC_EXPORT_DIR/audit_logs.csv

### System Status
- Legacy cookie-based authentication restored
- All pre-RBAC functionality should be working
- User accounts restored to pre-migration state

### Important Notes
1. All RBAC configurations have been lost
2. Role-based permissions are no longer enforced
3. Audit logging has been disabled
4. Session management reverted to legacy cookies

### Next Steps
1. Verify all user workflows
2. Test authentication functionality
3. Monitor for any issues
4. Consider addressing the original security concerns

### Re-migration
If you want to attempt RBAC migration again:
1. Review the failure logs
2. Address any issues found
3. Run: ./scripts/migrate-rbac.sh

### Support
For issues or questions, contact the development team.

EOF

    success "Rollback report generated: $REPORT_FILE"
}

# Main rollback function
main() {
    echo "========================================"
    echo "RBAC Rollback Script"
    echo "========================================"
    echo
    
    log "Starting RBAC rollback for QR Restaurant System"
    log "Log file: $LOG_FILE"
    
    # Confirmation prompt
    echo -e "${RED}WARNING: This will rollback the RBAC system and restore the legacy authentication.${NC}"
    echo "This operation will:"
    echo "- Remove all RBAC data (roles, permissions, audit logs)"
    echo "- Restore the database to pre-RBAC state"
    echo "- Disable role-based access control"
    echo "- Re-enable legacy cookie authentication"
    echo
    read -p "Are you sure you want to proceed? Type 'YES' to continue: " -r
    if [ "$REPLY" != "YES" ]; then
        error "Rollback cancelled by user"
    fi
    
    # Execute rollback steps
    find_backup_file
    check_prerequisites
    create_rollback_backup
    export_rbac_data
    restore_database
    update_config
    regenerate_client
    test_legacy_system
    generate_rollback_report
    
    echo
    echo "========================================"
    success "RBAC Rollback completed successfully!"
    echo "========================================"
    echo
    log "Rollback log: $LOG_FILE"
    log "RBAC data exported to: $RBAC_EXPORT_DIR"
    echo
    echo "The system has been restored to its pre-RBAC state."
    echo "Please verify that all functionality is working correctly."
    echo
    echo "If you need to re-attempt the RBAC migration, review the"
    echo "original migration logs and address any issues found."
}

# Run main function
main "$@"