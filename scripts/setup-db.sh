#!/bin/bash

# Database setup script for CloudWrkz
# This script creates the database and user for local PostgreSQL or Docker container

set -e

# Color codes for better console output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions for colored output
info() {
    echo -e "${CYAN}ℹ${NC}  $1"
}

success() {
    echo -e "${GREEN}✓${NC}  $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

error() {
    echo -e "${RED}✗${NC}  $1"
}

section() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Default values
DB_NAME="cloudwrkz"
DB_USER="cloudwrkz"
DB_PASSWORD="cloudwrkz_dev_password"

section "CloudWrkz Database Setup"

info "Starting database setup process..."
info "Target database: ${BOLD}${DB_NAME}${NC}"
info "Target user: ${BOLD}${DB_USER}${NC}"

# Detect PostgreSQL connection method
PSQL_CMD=""
USE_DOCKER=false
DOCKER_CONTAINER=""
POSTGRES_VERSION=""

section "Detecting PostgreSQL Installation"

step "Checking for local PostgreSQL installation..."

# Check if psql command exists
if ! command -v psql &> /dev/null; then
    warning "psql command not found in PATH"
else
    info "psql found: $(which psql)"
fi

# Try connecting to Docker network hostname first (if inside container)
step "Checking for Docker network connection (db hostname)..."
# First try as cloudwrkz user (if database was created with new credentials)
if PGPASSWORD="cloudwrkz_dev_password" psql -h db -U cloudwrkz -d cloudwrkz -c "SELECT version();" &>/dev/null 2>&1; then
    export PGPASSWORD="cloudwrkz_dev_password"
    PSQL_CMD="psql -h db -U cloudwrkz -d cloudwrkz"
    USE_DOCKER=true
    CONNECTION_METHOD="Docker network (db hostname, cloudwrkz user)"
    POSTGRES_VERSION=$(PGPASSWORD="cloudwrkz_dev_password" psql -h db -U cloudwrkz -d cloudwrkz -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
    success "Connected via ${CONNECTION_METHOD}"
# If that fails, try as postgres superuser (for initial setup)
elif PGPASSWORD="postgres" psql -h db -U postgres -d postgres -c "SELECT version();" &>/dev/null 2>&1; then
    export PGPASSWORD="postgres"
    PSQL_CMD="psql -h db -U postgres -d postgres"
    USE_DOCKER=true
    CONNECTION_METHOD="Docker network (db hostname, postgres superuser)"
    POSTGRES_VERSION=$(PGPASSWORD="postgres" psql -h db -U postgres -d postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
    success "Connected via ${CONNECTION_METHOD}"
fi

# Try local PostgreSQL first
if [ -z "$PSQL_CMD" ]; then
    step "Attempting to connect via local PostgreSQL..."

    CONNECTION_METHOD=""
    if command -v sudo &> /dev/null; then
        if sudo -u postgres psql -c "SELECT version();" &>/dev/null 2>&1; then
            PSQL_CMD="sudo -u postgres psql"
            USE_DOCKER=false
            CONNECTION_METHOD="sudo postgres user"
            POSTGRES_VERSION=$(sudo -u postgres psql -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
            success "Connected via ${CONNECTION_METHOD}"
        fi
    fi

    if [ -z "$PSQL_CMD" ]; then
        if psql -U postgres -c "SELECT version();" &>/dev/null 2>&1; then
            PSQL_CMD="psql -U postgres"
            USE_DOCKER=false
            CONNECTION_METHOD="postgres user (direct)"
            POSTGRES_VERSION=$(psql -U postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
            success "Connected via ${CONNECTION_METHOD}"
        fi
    fi

    if [ -z "$PSQL_CMD" ]; then
        if psql -U "$USER" -d postgres -c "SELECT version();" &>/dev/null 2>&1; then
            PSQL_CMD="psql -U $USER -d postgres"
            USE_DOCKER=false
            CONNECTION_METHOD="current user ($USER)"
            POSTGRES_VERSION=$(psql -U "$USER" -d postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
            success "Connected via ${CONNECTION_METHOD}"
        fi
    fi
fi

# If local PostgreSQL not found, try Docker containers as fallback
if [ -z "$PSQL_CMD" ] && command -v docker &> /dev/null; then
    step "Local PostgreSQL not found, checking Docker containers..."
    
    # Check if Docker is running
    if ! docker ps &>/dev/null; then
        warning "Docker is installed but not running"
    else
        info "Scanning running Docker containers for PostgreSQL..."
        
        # Check for devcontainer db service (from .devcontainer/docker-compose.yml)
        # Docker Compose creates containers like: {project}-{service}-1
        # Try common patterns for devcontainer db service
        CONTAINERS=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "(db|postgres)" || true)
        
        if [ -z "$CONTAINERS" ]; then
            warning "No PostgreSQL containers found running"
        else
            info "Found containers: $(echo $CONTAINERS | tr '\n' ' ')"
            
            for container in $CONTAINERS; do
                step "Testing container: $container"
                
                # Try postgres user first
                if docker exec "$container" psql -U postgres -c "SELECT version();" &>/dev/null 2>&1; then
                    DOCKER_CONTAINER="$container"
                    USE_DOCKER=true
                    PSQL_CMD="docker exec -i $container psql -U postgres"
                    CONNECTION_METHOD="Docker container: $container (postgres user)"
                    POSTGRES_VERSION=$(docker exec "$container" psql -U postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
                    success "Connected via ${CONNECTION_METHOD}"
                    break
                # Try cloudwrkz user
                elif docker exec "$container" psql -U cloudwrkz -c "SELECT version();" &>/dev/null 2>&1; then
                    DOCKER_CONTAINER="$container"
                    USE_DOCKER=true
                    PSQL_CMD="docker exec -i $container psql -U cloudwrkz"
                    CONNECTION_METHOD="Docker container: $container (cloudwrkz user)"
                    POSTGRES_VERSION=$(docker exec "$container" psql -U cloudwrkz -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
                    success "Connected via ${CONNECTION_METHOD}"
                    break
                else
                    info "  Container $container is not accessible or not PostgreSQL"
                fi
            done
        fi
    fi
fi

# If still no connection method found, show detailed error and exit
if [ -z "$PSQL_CMD" ]; then
    section "Connection Failed"
    error "Cannot connect to PostgreSQL. Please ensure PostgreSQL is available."
    echo ""
    echo -e "${BOLD}Possible solutions:${NC}"
    echo ""
    echo -e "${YELLOW}1. Install and start local PostgreSQL:${NC}"
    echo "   Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib"
    echo "   macOS: brew install postgresql && brew services start postgresql"
    echo "   Then: sudo systemctl start postgresql"
    echo "   Or:   sudo service postgresql start"
    echo ""
    if command -v docker &> /dev/null; then
        echo -e "${YELLOW}2. Start Docker PostgreSQL container:${NC}"
        echo "   docker-compose up -d"
        echo "   Or (for devcontainer):"
        echo "   cd .devcontainer && docker-compose up -d"
        echo ""
        echo -e "${YELLOW}3. Check if PostgreSQL is running:${NC}"
        echo "   Local: sudo systemctl status postgresql"
        echo "   Docker: docker ps | grep postgres"
    else
        echo -e "${YELLOW}2. Install Docker to use containerized PostgreSQL:${NC}"
        echo "   Visit: https://docs.docker.com/get-docker/"
    fi
    echo ""
    exit 1
fi

# Display connection information
section "Connection Information"
success "Connection method: ${BOLD}${CONNECTION_METHOD}${NC}"
if [ -n "$POSTGRES_VERSION" ]; then
    info "PostgreSQL version: $(echo $POSTGRES_VERSION | cut -d' ' -f1-3)"
fi
if [ "$USE_DOCKER" = true ]; then
    info "Docker container: ${BOLD}${DOCKER_CONTAINER}${NC}"
fi

# Verify connection health
section "Verifying Connection Health"
step "Testing database connection..."
if $PSQL_CMD -c "SELECT 1;" &>/dev/null 2>&1; then
    success "Connection test passed"
else
    error "Connection test failed"
    exit 1
fi

step "Checking existing databases..."
EXISTING_DBS=$($PSQL_CMD -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;" 2>/dev/null | grep -v "^$" | xargs || true)
if [ -n "$EXISTING_DBS" ]; then
    info "Existing databases: $(echo $EXISTING_DBS | tr ' ' ', ')"
else
    info "No existing databases found"
fi

section "Creating Database and User"

# Check if user already exists
step "Checking for existing user '${DB_USER}'..."
USER_EXISTS=$($PSQL_CMD -t -c "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '${DB_USER}';" 2>/dev/null | xargs || echo "")

if [ -n "$USER_EXISTS" ]; then
    warning "User '${DB_USER}' already exists"
    step "Updating user password..."
else
    step "Creating user '${DB_USER}'..."
fi

# Create or update user
$PSQL_CMD <<EOF 2>&1 | grep -v "NOTICE:" || true
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '${DB_USER}') THEN
        CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
        RAISE NOTICE 'User ${DB_USER} created';
    ELSE
        ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
        RAISE NOTICE 'User ${DB_USER} password updated';
    END IF;
END
\$\$;
EOF

if [ -z "$USER_EXISTS" ]; then
    success "User '${DB_USER}' created successfully"
else
    success "User '${DB_USER}' password updated"
fi

# Check if database already exists
step "Checking for existing database '${DB_NAME}'..."
DB_EXISTS=$($PSQL_CMD -t -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" 2>/dev/null | xargs || echo "")

if [ -n "$DB_EXISTS" ]; then
    warning "Database '${DB_NAME}' already exists"
    info "Skipping database creation"
else
    step "Creating database '${DB_NAME}'..."
    $PSQL_CMD -c "CREATE DATABASE ${DB_NAME};" 2>&1 | grep -v "NOTICE:" || true
    success "Database '${DB_NAME}' created successfully"
fi

section "Configuring Permissions"

step "Granting privileges to user '${DB_USER}'..."

# Grant privileges
$PSQL_CMD <<EOF 2>&1 | grep -v "NOTICE:" || true
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
\c ${DB_NAME}
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER SCHEMA public OWNER TO ${DB_USER};
EOF

success "Privileges granted successfully"

section "Verification"

step "Verifying database exists..."
if $PSQL_CMD -t -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" &>/dev/null 2>&1; then
    DB_VERIFY=$($PSQL_CMD -t -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" 2>/dev/null | xargs)
    if [ -n "$DB_VERIFY" ]; then
        success "Database '${DB_NAME}' verified"
    else
        error "Database '${DB_NAME}' not found after creation"
        exit 1
    fi
else
    error "Failed to verify database existence"
    exit 1
fi

step "Verifying user exists..."
if $PSQL_CMD -t -c "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '${DB_USER}';" &>/dev/null 2>&1; then
    USER_VERIFY=$($PSQL_CMD -t -c "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '${DB_USER}';" 2>/dev/null | xargs)
    if [ -n "$USER_VERIFY" ]; then
        success "User '${DB_USER}' verified"
    else
        error "User '${DB_USER}' not found after creation"
        exit 1
    fi
else
    error "Failed to verify user existence"
    exit 1
fi

step "Testing database connection with new credentials..."
# Test connection to the new database
if [ "$USE_DOCKER" = true ]; then
    if docker exec "$DOCKER_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null 2>&1; then
        success "Database connection test passed"
    else
        warning "Database connection test failed (this may be expected for Docker containers)"
    fi
else
    info "Skipping connection test (requires password authentication)"
fi

step "Checking database size and status..."
DB_SIZE=$($PSQL_CMD -d "${DB_NAME}" -t -c "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" 2>/dev/null | xargs || echo "unknown")
info "Database size: ${DB_SIZE}"

section "Setup Complete"

success "Database setup completed successfully!"
echo ""
echo -e "${BOLD}📋 Database Details:${NC}"
echo -e "   Database: ${CYAN}${DB_NAME}${NC}"
echo -e "   User:     ${CYAN}${DB_USER}${NC}"
echo -e "   Password: ${CYAN}${DB_PASSWORD}${NC}"
echo ""

# Determine connection host based on setup type
if [ "$USE_DOCKER" = true ]; then
    CONNECTION_HOST="localhost"
    info "Using Docker container - connection via localhost"
else
    CONNECTION_HOST="localhost"
fi

echo -e "${BOLD}🔗 Connection String:${NC}"
CONNECTION_STRING="postgresql://${DB_USER}:${DB_PASSWORD}@${CONNECTION_HOST}:5432/${DB_NAME}?schema=public"
echo -e "   ${CYAN}${CONNECTION_STRING}${NC}"
echo ""

echo -e "${BOLD}📝 Next Steps:${NC}"
echo "   1. Add the connection string to your .env.local file:"
echo -e "      ${CYAN}DATABASE_URL=\"${CONNECTION_STRING}\"${NC}"
echo "   2. Run database migrations:"
echo -e "      ${CYAN}pnpm db:push${NC}"
echo "   3. (Optional) Seed the database with initial data"
echo ""
