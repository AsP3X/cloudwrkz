#!/bin/bash

# Verify database connection and schema

echo "🔍 Verifying database setup..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local file not found!"
    exit 1
fi

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Test connection
if psql "$DATABASE_URL" -c "SELECT 1;" &>/dev/null; then
    echo "✅ Database connection successful"
else
    echo "❌ Cannot connect to database"
    echo "   Check your DATABASE_URL in .env.local"
    exit 1
fi

# Check tables
echo ""
echo "📊 Database tables:"
psql "$DATABASE_URL" -c "\dt" 2>/dev/null || echo "   (No tables found or connection issue)"

echo ""
echo "✅ Database verification complete!"
