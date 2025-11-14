#!/bin/bash

# Database setup script for CloudWrkz
# This script creates the database and user for local PostgreSQL or Docker container

set -e

echo "🚀 Setting up CloudWrkz database..."

# Default values
DB_NAME="cloudwrkz"
DB_USER="cloudwrkz"
DB_PASSWORD="cloudwrkz_dev_password"

# Detect PostgreSQL connection method
PSQL_CMD=""
USE_DOCKER=false
DOCKER_CONTAINER=""

# Try local PostgreSQL first
if command -v sudo &> /dev/null && sudo -u postgres psql -c "SELECT 1;" &>/dev/null; then
    PSQL_CMD="sudo -u postgres psql"
    echo "✅ Using sudo postgres user"
elif psql -U postgres -c "SELECT 1;" &>/dev/null; then
    PSQL_CMD="psql -U postgres"
    echo "✅ Using postgres user directly"
elif psql -U "$USER" -d postgres -c "SELECT 1;" &>/dev/null; then
    PSQL_CMD="psql -U $USER -d postgres"
    echo "✅ Using current user: $USER"
fi

# If local PostgreSQL not found, try Docker containers as fallback
if [ -z "$PSQL_CMD" ] && command -v docker &> /dev/null; then
    # Check for devcontainer db service (from .devcontainer/docker-compose.yml)
    # Docker Compose creates containers like: {project}-{service}-1
    # Try common patterns for devcontainer db service
    for container in $(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "(db|postgres)"); do
        if docker exec "$container" psql -U postgres -c "SELECT 1;" &>/dev/null; then
            DOCKER_CONTAINER="$container"
            USE_DOCKER=true
            PSQL_CMD="docker exec -i $container psql -U postgres"
            echo "✅ Using Docker container: $container (devcontainer db)"
            break
        elif docker exec "$container" psql -U cloudwrkz -c "SELECT 1;" &>/dev/null; then
            DOCKER_CONTAINER="$container"
            USE_DOCKER=true
            PSQL_CMD="docker exec -i $container psql -U cloudwrkz"
            echo "✅ Using Docker container: $container (root docker-compose postgres)"
            break
        fi
    done
fi

# If still no connection method found, show error and exit
if [ -z "$PSQL_CMD" ]; then
    echo "❌ Cannot connect to PostgreSQL. Please ensure:"
    echo "   1. PostgreSQL is installed and running locally, OR"
    echo "   2. Docker container with PostgreSQL is running"
    echo ""
    echo "Try starting PostgreSQL locally:"
    echo "   sudo systemctl start postgresql"
    echo "   # or"
    echo "   sudo service postgresql start"
    echo ""
    if command -v docker &> /dev/null; then
        echo "Or start Docker container:"
        echo "   docker-compose up -d"
        echo "   # or (for devcontainer)"
        echo "   cd .devcontainer && docker-compose up -d"
    else
        echo "Note: Docker is not installed. Install Docker to use containerized PostgreSQL."
    fi
    exit 1
fi

echo "📦 Creating database and user..."

# Create user if it doesn't exist
$PSQL_CMD <<'EOF'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'cloudwrkz') THEN
        CREATE USER cloudwrkz WITH PASSWORD 'cloudwrkz_dev_password';
        RAISE NOTICE 'User cloudwrkz created';
    ELSE
        RAISE NOTICE 'User cloudwrkz already exists';
    END IF;
END
$$;
EOF

# Create database if it doesn't exist
$PSQL_CMD <<'EOF'
SELECT 'CREATE DATABASE cloudwrkz'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cloudwrkz')\gexec
EOF

# Grant privileges
$PSQL_CMD <<'EOF'
GRANT ALL PRIVILEGES ON DATABASE cloudwrkz TO cloudwrkz;
ALTER DATABASE cloudwrkz OWNER TO cloudwrkz;
\c cloudwrkz
GRANT ALL ON SCHEMA public TO cloudwrkz;
EOF

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📋 Database Details:"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Password: $DB_PASSWORD"
echo ""
echo "🔗 Connection string:"
echo "   postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?schema=public"
echo ""
echo "📝 Next steps:"
echo "   1. Verify .env.local has the connection string above"
echo "   2. Run: pnpm db:push"
