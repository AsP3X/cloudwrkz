#!/bin/bash

# Database setup script for CloudWrkz
# This script creates the database and user for local PostgreSQL

set -e

echo "🚀 Setting up CloudWrkz database..."

# Default values
DB_NAME="cloudwrkz"
DB_USER="cloudwrkz"
DB_PASSWORD="cloudwrkz_dev_password"

# Detect PostgreSQL connection method
PSQL_CMD=""
if command -v sudo &> /dev/null && sudo -u postgres psql -c "SELECT 1;" &>/dev/null; then
    PSQL_CMD="sudo -u postgres psql"
    echo "✅ Using sudo postgres user"
elif psql -U postgres -c "SELECT 1;" &>/dev/null; then
    PSQL_CMD="psql -U postgres"
    echo "✅ Using postgres user directly"
elif psql -U "$USER" -d postgres -c "SELECT 1;" &>/dev/null; then
    PSQL_CMD="psql -U $USER -d postgres"
    echo "✅ Using current user: $USER"
else
    echo "❌ Cannot connect to PostgreSQL. Please ensure:"
    echo "   1. PostgreSQL is installed and running"
    echo "   2. You have access to PostgreSQL (check pg_hba.conf)"
    echo ""
    echo "Try starting PostgreSQL:"
    echo "   sudo systemctl start postgresql"
    echo "   # or"
    echo "   sudo service postgresql start"
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
