#!/bin/bash

# Database setup script for CloudWrkz
# Choose: local PostgreSQL, remote PostgreSQL, Docker local, or Docker remote.
# For remote options you can define address, port, and password.

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

# Default values for the app database
DB_NAME="cloudwrkz"
DB_USER="cloudwrkz"
DB_PASSWORD="cloudwrkz_dev_password"

# Connection type: local | remote | docker_local | docker_remote
SETUP_TYPE=""
# Remote/Docker remote connection details
REMOTE_HOST=""
REMOTE_PORT="5432"
REMOTE_ADMIN_USER="postgres"
REMOTE_ADMIN_PASSWORD=""

# Will be set based on chosen setup
PSQL_CMD=""
USE_DOCKER=false
DOCKER_CONTAINER=""
POSTGRES_VERSION=""
CONNECTION_METHOD=""
CONNECTION_HOST="localhost"
CONNECTION_PORT="5432"

# -----------------------------------------------------------------------------
# Interactive prompts for remote connection
# -----------------------------------------------------------------------------
prompt_remote_connection() {
    echo ""
    echo -e "${BOLD}Enter remote PostgreSQL connection details:${NC}"
    echo ""
    read -p "  Host or IP address: " REMOTE_HOST
    [ -z "$REMOTE_HOST" ] && error "Host is required." && exit 1
    read -p "  Port [${REMOTE_PORT}]: " input_port
    [ -n "$input_port" ] && REMOTE_PORT="$input_port"
    read -p "  Admin username [${REMOTE_ADMIN_USER}]: " input_user
    [ -n "$input_user" ] && REMOTE_ADMIN_USER="$input_user"
    read -sp "  Admin password: " REMOTE_ADMIN_PASSWORD
    echo ""
    [ -z "$REMOTE_ADMIN_PASSWORD" ] && error "Password is required." && exit 1
    CONNECTION_HOST="$REMOTE_HOST"
    CONNECTION_PORT="$REMOTE_PORT"
}

# -----------------------------------------------------------------------------
# Test connection using current PSQL_CMD
# -----------------------------------------------------------------------------
test_psql_connection() {
    if $PSQL_CMD -c "SELECT 1;" &>/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# -----------------------------------------------------------------------------
# Detect and set PSQL_CMD for local PostgreSQL
# -----------------------------------------------------------------------------
setup_local_postgres() {
    step "Attempting to connect via local PostgreSQL..."
    if command -v sudo &> /dev/null; then
        if sudo -u postgres psql -c "SELECT version();" &>/dev/null 2>&1; then
            PSQL_CMD="sudo -u postgres psql"
            CONNECTION_METHOD="sudo postgres user (local)"
            POSTGRES_VERSION=$(sudo -u postgres psql -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
            return 0
        fi
    fi
    if psql -U postgres -c "SELECT version();" &>/dev/null 2>&1; then
        PSQL_CMD="psql -U postgres"
        CONNECTION_METHOD="postgres user direct (local)"
        POSTGRES_VERSION=$(psql -U postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
        return 0
    fi
    if psql -U "$USER" -d postgres -c "SELECT version();" &>/dev/null 2>&1; then
        PSQL_CMD="psql -U $USER -d postgres"
        CONNECTION_METHOD="current user $USER (local)"
        POSTGRES_VERSION=$(psql -U "$USER" -d postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
        return 0
    fi
    return 1
}

# -----------------------------------------------------------------------------
# Set PSQL_CMD for remote PostgreSQL (or Docker remote)
# -----------------------------------------------------------------------------
setup_remote_postgres() {
    if ! command -v psql &>/dev/null; then
        error "PostgreSQL client (psql) is not installed."
        echo ""
        echo -e "${BOLD}Install it and retry:${NC}"
        echo "  Debian/Ubuntu (in container or host): apt-get update && apt-get install -y postgresql-client"
        echo "  Alpine: apk add --no-cache postgresql-client"
        echo "  RHEL/Fedora: dnf install postgresql  (or yum install postgresql)"
        return 1
    fi
    export PGPASSWORD="$REMOTE_ADMIN_PASSWORD"
    PSQL_CMD="psql -h ${REMOTE_HOST} -p ${REMOTE_PORT} -U ${REMOTE_ADMIN_USER} -d postgres"
    CONNECTION_METHOD="Remote (${REMOTE_HOST}:${REMOTE_PORT})"
    PSQL_ERR=$(mktemp 2>/dev/null || echo /tmp/psql-err.$$)
    if ! $PSQL_CMD -c "SELECT version();" 2>"$PSQL_ERR"; then
        [ -s "$PSQL_ERR" ] && echo -e "  ${RED}$(cat "$PSQL_ERR")${NC}" >&2
        rm -f "$PSQL_ERR"
        return 1
    fi
    rm -f "$PSQL_ERR"
    POSTGRES_VERSION=$($PSQL_CMD -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
    return 0
}

# -----------------------------------------------------------------------------
# Docker local: start container if needed, then connect via localhost
# -----------------------------------------------------------------------------
setup_docker_local() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Install Docker to use this option."
        exit 1
    fi
    if ! docker ps &>/dev/null; then
        error "Docker is not running. Start Docker and try again."
        exit 1
    fi

    # Prefer project docker-compose (root) which exposes port 5432
    COMPOSE_FILE=""
    if [ -f "docker-compose.yml" ]; then
        COMPOSE_FILE="docker-compose.yml"
    elif [ -f ".devcontainer/docker-compose.yml" ]; then
        COMPOSE_FILE=".devcontainer/docker-compose.yml"
    fi

    if [ -n "$COMPOSE_FILE" ]; then
        step "Starting PostgreSQL with Docker Compose ($COMPOSE_FILE)..."
        docker compose -f "$COMPOSE_FILE" up -d postgres 2>/dev/null || docker-compose -f "$COMPOSE_FILE" up -d postgres 2>/dev/null || true
        sleep 2
    fi

    # Try localhost then hostname "db" (devcontainer network)
    for try_host in localhost db; do
        for try_user in cloudwrkz postgres; do
            for try_pass in cloudwrkz_dev_password postgres; do
                export PGPASSWORD="$try_pass"
                if psql -h "$try_host" -p 5432 -U "$try_user" -d postgres -c "SELECT 1;" &>/dev/null 2>&1; then
                    PSQL_CMD="psql -h $try_host -p 5432 -U $try_user -d postgres"
                    CONNECTION_METHOD="Docker local ($try_host:5432, $try_user)"
                    POSTGRES_VERSION=$(PGPASSWORD="$try_pass" psql -h "$try_host" -p 5432 -U "$try_user" -d postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
                    export PGPASSWORD="$try_pass"
                    USE_DOCKER=true
                    CONNECTION_PORT="5432"
                    CONNECTION_HOST="$try_host"
                    return 0
                fi
            done
        done
    done

    # Fallback: find running postgres container and exec
    CONTAINERS=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "(db|postgres|cloudwrkz)" || true)
    for container in $CONTAINERS; do
        if docker exec "$container" psql -U postgres -c "SELECT 1;" &>/dev/null 2>&1; then
            DOCKER_CONTAINER="$container"
            PSQL_CMD="docker exec -i $container psql -U postgres"
            CONNECTION_METHOD="Docker local (container: $container)"
            POSTGRES_VERSION=$(docker exec "$container" psql -U postgres -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
            USE_DOCKER=true
            return 0
        fi
        if docker exec "$container" psql -U cloudwrkz -c "SELECT 1;" &>/dev/null 2>&1; then
            DOCKER_CONTAINER="$container"
            PSQL_CMD="docker exec -i $container psql -U cloudwrkz"
            CONNECTION_METHOD="Docker local (container: $container)"
            POSTGRES_VERSION=$(docker exec "$container" psql -U cloudwrkz -c "SELECT version();" -t 2>/dev/null | head -n1 | xargs)
            USE_DOCKER=true
            return 0
        fi
    done
    return 1
}

# =============================================================================
# Main
# =============================================================================

section "CloudWrkz Database Setup"

info "Target database: ${BOLD}${DB_NAME}${NC}"
info "Target user: ${BOLD}${DB_USER}${NC}"

section "Choose database setup type"

echo "  1) Local PostgreSQL (system installation on this machine)"
echo "  2) Remote PostgreSQL (existing server; you provide address, port, password)"
echo "  3) Docker local (PostgreSQL in a container on this machine)"
echo "  4) Docker remote (PostgreSQL in Docker on another machine; you provide address, port, password)"
echo ""
read -p "Enter choice [1-4]: " choice

case "$choice" in
    1)
        SETUP_TYPE="local"
        section "Local PostgreSQL"
        if ! setup_local_postgres; then
            error "Could not connect to local PostgreSQL."
            echo ""
            echo -e "${BOLD}Possible solutions:${NC}"
            echo "  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib"
            echo "  macOS: brew install postgresql && brew services start postgresql"
            echo "  Then: sudo systemctl start postgresql  (or: sudo service postgresql start)"
            exit 1
        fi
        ;;
    2)
        SETUP_TYPE="remote"
        section "Remote PostgreSQL"
        prompt_remote_connection
        if ! setup_remote_postgres; then
            error "Could not connect to remote PostgreSQL at ${REMOTE_HOST}:${REMOTE_PORT}"
            echo "  Check the error above, then host, port, firewall, and credentials."
            exit 1
        fi
        success "Connected to remote PostgreSQL"
        ;;
    3)
        SETUP_TYPE="docker_local"
        section "Docker local"
        if ! setup_docker_local; then
            error "Could not connect to PostgreSQL via Docker."
            echo ""
            echo "  Ensure Docker is running and start the stack:"
            echo "    docker compose up -d postgres"
            echo "  Or from .devcontainer: docker compose -f .devcontainer/docker-compose.yml up -d db"
            exit 1
        fi
        success "Connected to Docker local PostgreSQL"
        ;;
    4)
        SETUP_TYPE="docker_remote"
        section "Docker remote"
        prompt_remote_connection
        if ! setup_remote_postgres; then
            error "Could not connect to remote PostgreSQL at ${REMOTE_HOST}:${REMOTE_PORT}"
            echo "  Check the error above, then host, port, firewall, and that the container exposes the port."
            exit 1
        fi
        success "Connected to Docker remote PostgreSQL"
        ;;
    *)
        error "Invalid choice. Use 1, 2, 3, or 4."
        exit 1
        ;;
esac

# Display connection information
section "Connection Information"
success "Connection method: ${BOLD}${CONNECTION_METHOD}${NC}"
if [ -n "$POSTGRES_VERSION" ]; then
    info "PostgreSQL version: $(echo $POSTGRES_VERSION | cut -d' ' -f1-3)"
fi
if [ "$USE_DOCKER" = true ] && [ -n "$DOCKER_CONTAINER" ]; then
    info "Docker container: ${BOLD}${DOCKER_CONTAINER}${NC}"
fi

# Verify connection health
section "Verifying Connection Health"
step "Testing database connection..."
if ! test_psql_connection; then
    error "Connection test failed"
    exit 1
fi
success "Connection test passed"

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

# If we connected as the same user we just created/updated (remote), we changed their
# password to DB_PASSWORD; use that for all subsequent commands.
if [ "$SETUP_TYPE" = "remote" ] || [ "$SETUP_TYPE" = "docker_remote" ]; then
    if [ "$REMOTE_ADMIN_USER" = "$DB_USER" ]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
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
if [ "$USE_DOCKER" = true ] && [ -n "$DOCKER_CONTAINER" ]; then
    if docker exec "$DOCKER_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null 2>&1; then
        success "Database connection test passed"
    else
        warning "Database connection test failed (may be expected for some Docker setups)"
    fi
else
    info "Skipping in-process connection test (use DATABASE_URL to verify)"
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

CONNECTION_STRING="postgresql://${DB_USER}:${DB_PASSWORD}@${CONNECTION_HOST}:${CONNECTION_PORT}/${DB_NAME}?schema=public"
echo -e "${BOLD}🔗 Connection String:${NC}"
echo -e "   ${CYAN}${CONNECTION_STRING}${NC}"
echo ""

# Offer to update .env.local so DATABASE_URL matches (avoids auth errors with pnpm db:push)
ENV_LOCAL=".env.local"
if [ -f "$ENV_LOCAL" ]; then
    if grep -q "^DATABASE_URL=" "$ENV_LOCAL" 2>/dev/null; then
        read -p "Update DATABASE_URL in ${ENV_LOCAL}? [y/N]: " update_env
        if [ "$update_env" = "y" ] || [ "$update_env" = "Y" ]; then
            if sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=\"${CONNECTION_STRING}\"|" "$ENV_LOCAL" 2>/dev/null; then
                success "Updated DATABASE_URL in ${ENV_LOCAL}"
                rm -f "${ENV_LOCAL}.bak"
            else
                warning "Could not update ${ENV_LOCAL}; edit it manually."
            fi
        fi
    else
        read -p "Add DATABASE_URL to ${ENV_LOCAL}? [y/N]: " add_env
        if [ "$add_env" = "y" ] || [ "$add_env" = "Y" ]; then
            echo "" >> "$ENV_LOCAL"
            echo "DATABASE_URL=\"${CONNECTION_STRING}\"" >> "$ENV_LOCAL"
            success "Added DATABASE_URL to ${ENV_LOCAL}"
        fi
    fi
else
    read -p "Create ${ENV_LOCAL} with DATABASE_URL? [y/N]: " create_env
    if [ "$create_env" = "y" ] || [ "$create_env" = "Y" ]; then
        echo "DATABASE_URL=\"${CONNECTION_STRING}\"" > "$ENV_LOCAL"
        success "Created ${ENV_LOCAL} with DATABASE_URL"
    fi
fi
echo ""

echo -e "${BOLD}📝 Next Steps:${NC}"
echo "   1. Ensure .env.local contains: ${CYAN}DATABASE_URL=\"${CONNECTION_STRING}\"${NC}"
echo "   2. Run database migrations:"
echo -e "      ${CYAN}pnpm db:push${NC}"
echo "   3. (Optional) Seed the database with initial data"
echo ""
