# Database setup script for CloudWrkz
# This script creates the database and user for local PostgreSQL or Docker container

$ErrorActionPreference = "Stop"

# Helper functions for colored output
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO]  $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK]  $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN]  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR]  $Message" -ForegroundColor Red
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "  $Title" -ForegroundColor Blue
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

# Helper function to execute psql commands
# For Docker: uses docker exec directly
# For local: uses the stored PSQL_CMD with proper execution
function Invoke-PsqlCommand {
    param(
        [string]$Command,
        [string]$Database = $null,
        [string]$User = $null
    )
    
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $psqlArgs = @()
        $psqlArgs += if ($User) { "-U"; $User } else { "-U"; $DOCKER_USER }
        if ($Database) {
            $psqlArgs += "-d"
            $psqlArgs += $Database
        }
        $psqlArgs += "-c"
        $psqlArgs += $Command
        $result = & docker exec $DOCKER_CONTAINER psql $psqlArgs 2>&1
        return $result
    } else {
        # For local psql, parse PSQL_CMD and execute
        # PSQL_CMD format: "psql -h db -U cloudwrkz -d cloudwrkz" or "psql -U postgres"
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = @()
        
        # Add existing arguments (skip the first which is 'psql')
        for ($i = 1; $i -lt $cmdParts.Length; $i++) {
            $arg = $cmdParts[$i]
            # Skip -d parameter if we're overriding it
            if ($arg -eq "-d" -and $Database) {
                $i++ # Skip the database name too
                continue
            }
            if ($i -gt 0 -and $cmdParts[$i-1] -eq "-d" -and $Database) {
                continue # Skip the database name
            }
            $args += $arg
        }
        
        # Add database if specified
        if ($Database) {
            $args += "-d"
            $args += $Database
        }
        
        # Add the command
        $args += "-c"
        $args += $Command
        
        $result = & $executable $args 2>&1
        return $result
    }
}

# Helper function to execute psql with input (for heredoc-like behavior)
function Invoke-PsqlInput {
    param(
        [string]$Input,
        [string]$Database = $null,
        [string]$User = $null
    )
    
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $psqlArgs = @()
        $psqlArgs += if ($User) { "-U"; $User } else { "-U"; $DOCKER_USER }
        if ($Database) {
            $psqlArgs += "-d"
            $psqlArgs += $Database
        }
        $Input | & docker exec -i $DOCKER_CONTAINER psql $psqlArgs 2>&1
    } else {
        # Parse PSQL_CMD
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = @()
        
        # Add existing arguments
        for ($i = 1; $i -lt $cmdParts.Length; $i++) {
            $arg = $cmdParts[$i]
            if ($arg -eq "-d" -and $Database) {
                $i++
                continue
            }
            if ($i -gt 0 -and $cmdParts[$i-1] -eq "-d" -and $Database) {
                continue
            }
            $args += $arg
        }
        
        if ($Database) {
            $args += "-d"
            $args += $Database
        }
        
        $Input | & $executable $args 2>&1
    }
}

# Default values
$DB_NAME = "cloudwrkz"
$DB_USER = "cloudwrkz"
$DB_PASSWORD = "cloudwrkz_dev_password"

Write-Section "CloudWrkz Database Setup"

Write-Info "Starting database setup process..."
Write-Info "Target database: $DB_NAME"
Write-Info "Target user: $DB_USER"

# Detect PostgreSQL connection method
$PSQL_CMD = $null
$USE_DOCKER = $false
$DOCKER_CONTAINER = ""
$DOCKER_USER = "postgres"  # Default Docker user
$DOCKER_ADMIN_USER = $null  # Will be determined - user with admin privileges
$POSTGRES_VERSION = ""
$CONNECTION_METHOD = ""

Write-Section "Detecting PostgreSQL Installation"

Write-Step "Checking for local PostgreSQL installation..."

# Check if psql command exists
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Warning "psql command not found in PATH"
} else {
    Write-Info "psql found: $($psqlPath.Source)"
}

# Try connecting to Docker network hostname first (if inside container)
Write-Step "Checking for Docker network connection (db hostname)..."

# First try as cloudwrkz user (if database was created with new credentials)
try {
    $env:PGPASSWORD = "cloudwrkz_dev_password"
    $result = & psql -h db -U cloudwrkz -d cloudwrkz -c "SELECT version();" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $env:PGPASSWORD = "cloudwrkz_dev_password"
        $PSQL_CMD = "psql -h db -U cloudwrkz -d cloudwrkz"
        $USE_DOCKER = $true
        $CONNECTION_METHOD = "Docker network (db hostname, cloudwrkz user)"
        $versionOutput = & psql -h db -U cloudwrkz -d cloudwrkz -c "SELECT version();" -t 2>&1
        if ($versionOutput) {
            $POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
        }
        Write-Success "Connected via $CONNECTION_METHOD"
    }
} catch {
    # Try as postgres superuser (for initial setup)
    try {
        $env:PGPASSWORD = "postgres"
        $result = & psql -h db -U postgres -d postgres -c "SELECT version();" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $env:PGPASSWORD = "postgres"
            $PSQL_CMD = "psql -h db -U postgres -d postgres"
            $USE_DOCKER = $true
            $CONNECTION_METHOD = "Docker network (db hostname, postgres superuser)"
            $versionOutput = & psql -h db -U postgres -d postgres -c "SELECT version();" -t 2>&1
            if ($versionOutput) {
                $POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
            }
            Write-Success "Connected via $CONNECTION_METHOD"
        }
    } catch {
        # Continue to next method
    }
}

# Try local PostgreSQL
if ([string]::IsNullOrEmpty($PSQL_CMD)) {
    Write-Step "Attempting to connect via local PostgreSQL..."

    # Try postgres user (direct)
    try {
        $result = & psql -U postgres -c "SELECT version();" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $PSQL_CMD = "psql -U postgres"
            $USE_DOCKER = $false
            $CONNECTION_METHOD = "postgres user (direct)"
            $versionOutput = & psql -U postgres -c "SELECT version();" -t 2>&1
            if ($versionOutput) {
                $POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
            }
            Write-Success "Connected via $CONNECTION_METHOD"
        }
    } catch {
        # Try current user
        try {
            $currentUser = $env:USERNAME
            $result = & psql -U $currentUser -d postgres -c "SELECT version();" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $PSQL_CMD = "psql -U $currentUser -d postgres"
                $USE_DOCKER = $false
                $CONNECTION_METHOD = "current user ($currentUser)"
                $versionOutput = & psql -U $currentUser -d postgres -c "SELECT version();" -t 2>&1
                if ($versionOutput) {
                    $POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
                }
                Write-Success "Connected via $CONNECTION_METHOD"
            }
        } catch {
            # Continue to Docker check
        }
    }
}

# If local PostgreSQL not found, try Docker containers as fallback
if ([string]::IsNullOrEmpty($PSQL_CMD)) {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        Write-Step "Local PostgreSQL not found, checking Docker containers..."

        # Check if Docker is running
        try {
            $dockerPs = & docker ps 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Docker is installed but not running"
            } else {
                Write-Info "Scanning running Docker containers for PostgreSQL..."

                # Get containers matching db or postgres
                $containers = & docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "(db|postgres)" }

                if (-not $containers -or $containers.Count -eq 0) {
                    Write-Warning "No PostgreSQL containers found running"
                } else {
                    Write-Info "Found containers: $($containers -join ' ')"

                    foreach ($container in $containers) {
                        Write-Step "Testing container: $container"

                        # Try postgres user first
                        try {
                            $result = & docker exec $container psql -U postgres -c "SELECT version();" 2>&1 | Out-Null
                            if ($LASTEXITCODE -eq 0) {
                                $DOCKER_CONTAINER = $container
                                $USE_DOCKER = $true
                                $DOCKER_USER = "postgres"
                                $PSQL_CMD = "docker exec -i $container psql -U postgres"
                                $CONNECTION_METHOD = "Docker container: $container (postgres user)"
                                $versionOutput = & docker exec $container psql -U postgres -c "SELECT version();" -t 2>&1
                                if ($versionOutput) {
                                    $POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
                                }
                                Write-Success "Connected via $CONNECTION_METHOD"
                                break
                            }
                        } catch {
                            # Try cloudwrkz user
                            try {
                                $result = & docker exec $container psql -U cloudwrkz -c "SELECT version();" 2>&1 | Out-Null
                                if ($LASTEXITCODE -eq 0) {
                                    $DOCKER_CONTAINER = $container
                                    $USE_DOCKER = $true
                                    $DOCKER_USER = "cloudwrkz"
                                    $PSQL_CMD = "docker exec -i $container psql -U cloudwrkz"
                                    $CONNECTION_METHOD = "Docker container: $container (cloudwrkz user)"
                                    $versionOutput = & docker exec $container psql -U cloudwrkz -c "SELECT version();" -t 2>&1
                                    if ($versionOutput) {
                                        $POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
                                    }
                                    Write-Success "Connected via $CONNECTION_METHOD"
                                    break
                                }
                            } catch {
                                Write-Info "  Container $container is not accessible or not PostgreSQL"
                            }
                        }
                    }
                }
            }
        } catch {
            Write-Warning "Docker is installed but not accessible"
        }
    }
}

# If still no connection method found, show detailed error and exit
if ([string]::IsNullOrEmpty($PSQL_CMD)) {
    Write-Section "Connection Failed"
    Write-Error "Cannot connect to PostgreSQL. Please ensure PostgreSQL is available."
    Write-Host ""
    Write-Host "Possible solutions:" -ForegroundColor White
    Write-Host ""
    Write-Host "1. Install and start local PostgreSQL:" -ForegroundColor Yellow
    Write-Host "   Windows: Download from https://www.postgresql.org/download/windows/"
    Write-Host "   Or use Chocolatey: choco install postgresql"
    Write-Host "   Then start the service: net start postgresql-x64-XX"
    Write-Host ""
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        Write-Host "2. Start Docker PostgreSQL container:" -ForegroundColor Yellow
        Write-Host "   docker-compose up -d"
        Write-Host "   Or (for devcontainer):"
        Write-Host "   cd .devcontainer && docker-compose up -d"
        Write-Host ""
        Write-Host "3. Check if PostgreSQL is running:" -ForegroundColor Yellow
        Write-Host "   Local: Get-Service postgresql*"
        Write-Host "   Docker: docker ps | Select-String postgres"
    } else {
        Write-Host "2. Install Docker to use containerized PostgreSQL:" -ForegroundColor Yellow
        Write-Host "   Visit: https://docs.docker.com/get-docker/"
    }
    Write-Host ""
    exit 1
}

# Display connection information
Write-Section "Connection Information"
Write-Success "Connection method: $CONNECTION_METHOD"
if (-not [string]::IsNullOrEmpty($POSTGRES_VERSION)) {
    $versionParts = $POSTGRES_VERSION -split ' ' | Select-Object -First 3
    Write-Info "PostgreSQL version: $($versionParts -join ' ')"
}
if ($USE_DOCKER) {
    Write-Info "Docker container: $DOCKER_CONTAINER"
}

# Determine admin user for Docker operations
if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
    Write-Step "Determining admin user for database operations..."
    
    # First, check if the connected user has superuser privileges
    $isSuperuser = & docker exec $DOCKER_CONTAINER psql -U $DOCKER_USER -t -c "SELECT usesuper FROM pg_user WHERE usename = current_user;" 2>&1
    $isSuperuser = ($isSuperuser | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
    
    if ($isSuperuser -eq "t" -or $isSuperuser -eq "true") {
        $DOCKER_ADMIN_USER = $DOCKER_USER
        Write-Info "Connected user '$DOCKER_USER' has superuser privileges"
    } else {
        # Try to find a superuser - check common names
        $adminUsers = @("postgres", "root", "admin")
        $foundAdmin = $false
        
        foreach ($adminUser in $adminUsers) {
            try {
                $result = & docker exec $DOCKER_CONTAINER psql -U $adminUser -c "SELECT 1;" 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $DOCKER_ADMIN_USER = $adminUser
                    $foundAdmin = $true
                    Write-Info "Found admin user: $adminUser"
                    break
                }
            } catch {
                # Continue to next user
            }
        }
        
        if (-not $foundAdmin) {
            # If no admin user found, try using the connected user anyway
            $DOCKER_ADMIN_USER = $DOCKER_USER
            Write-Warning "No superuser found, will attempt operations with connected user '$DOCKER_USER'"
        }
    }
} else {
    $DOCKER_ADMIN_USER = "postgres"  # Default for local PostgreSQL
}

# Verify connection health
Write-Section "Verifying Connection Health"
Write-Step "Testing database connection..."

try {
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $result = & docker exec $DOCKER_CONTAINER psql -U $DOCKER_USER -c "SELECT 1;" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Connection test failed"
        }
    } else {
        $result = Invoke-PsqlCommand -Command "SELECT 1;" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Connection test failed"
        }
    }
    Write-Success "Connection test passed"
} catch {
    Write-Error "Connection test failed"
    exit 1
}

Write-Step "Checking existing databases..."
try {
    # Note: -t flag needs to be handled separately as it's not a command
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $existingDbs = & docker exec $DOCKER_CONTAINER psql -U $adminUser -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;" 2>&1
    } else {
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = $cmdParts[1..($cmdParts.Length-1)] + @("-t", "-c", "SELECT datname FROM pg_database WHERE datistemplate = false;")
        $existingDbs = & $executable $args 2>&1
    }
    $existingDbs = $existingDbs | Where-Object { $_ -match '\S' } | ForEach-Object { $_.Trim() }
    if ($existingDbs -and $existingDbs.Count -gt 0) {
        Write-Info "Existing databases: $($existingDbs -join ', ')"
    } else {
        Write-Info "No existing databases found"
    }
} catch {
    Write-Info "No existing databases found"
}

Write-Section "Creating Database and User"

# Check if user already exists
Write-Step "Checking for existing user '$DB_USER'..."
try {
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $userExists = & docker exec $DOCKER_CONTAINER psql -U $adminUser -t -c "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '$DB_USER';" 2>&1
    } else {
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = $cmdParts[1..($cmdParts.Length-1)] + @("-t", "-c", "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '$DB_USER';")
        $userExists = & $executable $args 2>&1
    }
    $userExists = ($userExists | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
} catch {
    $userExists = ""
}

if (-not [string]::IsNullOrEmpty($userExists)) {
    Write-Warning "User '$DB_USER' already exists"
    Write-Step "Updating user password..."
} else {
    Write-Step "Creating user '$DB_USER'..."
}

# Create or update user
$userSql = @"
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'User $DB_USER created';
    ELSE
        ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'User $DB_USER password updated';
    END IF;
END
`$`$;
"@

try {
    # Use admin user for admin operations
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $userSql | & docker exec -i $DOCKER_CONTAINER psql -U $adminUser 2>&1 | Where-Object { $_ -notmatch "NOTICE:" } | Out-Null
    } else {
        $result = Invoke-PsqlInput -Input $userSql -User postgres 2>&1 | Where-Object { $_ -notmatch "NOTICE:" } | Out-Null
    }
} catch {
    # Ignore errors for now
}

if ([string]::IsNullOrEmpty($userExists)) {
    Write-Success "User '$DB_USER' created successfully"
} else {
    Write-Success "User '$DB_USER' password updated"
}

# Check if database already exists
Write-Step "Checking for existing database '$DB_NAME'..."
try {
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $dbExists = & docker exec $DOCKER_CONTAINER psql -U $adminUser -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" 2>&1
    } else {
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = $cmdParts[1..($cmdParts.Length-1)] + @("-t", "-c", "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';")
        $dbExists = & $executable $args 2>&1
    }
    $dbExists = ($dbExists | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
} catch {
    $dbExists = ""
}

if (-not [string]::IsNullOrEmpty($dbExists)) {
    Write-Warning "Database '$DB_NAME' already exists"
    Write-Info "Skipping database creation"
} else {
    Write-Step "Creating database '$DB_NAME'..."
    # Use admin user for admin operations
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $output = & docker exec $DOCKER_CONTAINER psql -U $adminUser -c "CREATE DATABASE $DB_NAME;" 2>&1
        $exitCode = $LASTEXITCODE
        $errorOutput = $output | Where-Object { $_ -match "ERROR|FATAL|already exists" }
        
        if ($exitCode -eq 0 -and -not $errorOutput) {
            Write-Success "Database '$DB_NAME' created successfully"
        } elseif ($errorOutput -match "already exists") {
            Write-Warning "Database '$DB_NAME' already exists"
            Write-Info "Skipping database creation"
        } else {
            $errorMsg = if ($errorOutput) { $errorOutput -join "; " } else { "Exit code: $exitCode" }
            Write-Error "Failed to create database: $errorMsg"
            if ($output) {
                Write-Host "Output: $($output -join '; ')" -ForegroundColor Yellow
            }
            exit 1
        }
    } else {
        try {
            $result = Invoke-PsqlCommand -Command "CREATE DATABASE $DB_NAME;" -User postgres 2>&1
            $errorOutput = $result | Where-Object { $_ -match "ERROR|FATAL|already exists" }
            if ($errorOutput -match "already exists") {
                Write-Warning "Database '$DB_NAME' already exists"
                Write-Info "Skipping database creation"
            } elseif ($errorOutput) {
                Write-Error "Failed to create database: $($errorOutput -join '; ')"
                exit 1
            } else {
                Write-Success "Database '$DB_NAME' created successfully"
            }
        } catch {
            Write-Error "Failed to create database: $_"
            exit 1
        }
    }
}

Write-Section "Configuring Permissions"

Write-Step "Granting privileges to user '$DB_USER'..."

# Grant privileges
$grantSql = @"
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER SCHEMA public OWNER TO $DB_USER;
"@

try {
    # Use admin user for admin operations
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $grantSql | & docker exec -i $DOCKER_CONTAINER psql -U $adminUser 2>&1 | Where-Object { $_ -notmatch "NOTICE:" } | Out-Null
    } else {
        $result = Invoke-PsqlInput -Input $grantSql -User postgres 2>&1 | Where-Object { $_ -notmatch "NOTICE:" } | Out-Null
    }
    Write-Success "Privileges granted successfully"
} catch {
    Write-Warning "Some privileges may not have been granted (this may be expected)"
}

Write-Section "Verification"

Write-Step "Verifying database exists..."
try {
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $dbVerify = & docker exec $DOCKER_CONTAINER psql -U $adminUser -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" 2>&1
    } else {
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = $cmdParts[1..($cmdParts.Length-1)] + @("-t", "-c", "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';")
        $dbVerify = & $executable $args 2>&1
    }
    $dbVerify = ($dbVerify | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
    if (-not [string]::IsNullOrEmpty($dbVerify)) {
        Write-Success "Database '$DB_NAME' verified"
    } else {
        Write-Error "Database '$DB_NAME' not found after creation"
        exit 1
    }
} catch {
    Write-Error "Failed to verify database existence"
    exit 1
}

Write-Step "Verifying user exists..."
try {
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $userVerify = & docker exec $DOCKER_CONTAINER psql -U $adminUser -t -c "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '$DB_USER';" 2>&1
    } else {
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = $cmdParts[1..($cmdParts.Length-1)] + @("-t", "-c", "SELECT 1 FROM pg_catalog.pg_user WHERE usename = '$DB_USER';")
        $userVerify = & $executable $args 2>&1
    }
    $userVerify = ($userVerify | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
    if (-not [string]::IsNullOrEmpty($userVerify)) {
        Write-Success "User '$DB_USER' verified"
    } else {
        Write-Error "User '$DB_USER' not found after creation"
        exit 1
    }
} catch {
    Write-Error "Failed to verify user existence"
    exit 1
}

Write-Step "Testing database connection with new credentials..."
# Test connection to the new database
if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
    try {
        $result = & docker exec $DOCKER_CONTAINER psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Database connection test passed"
        } else {
            Write-Warning "Database connection test failed (this may be expected for Docker containers)"
        }
    } catch {
        Write-Warning "Database connection test failed (this may be expected for Docker containers)"
    }
} else {
    Write-Info "Skipping connection test (requires password authentication)"
}

Write-Step "Checking database size and status..."
try {
    if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
        $adminUser = if ($DOCKER_ADMIN_USER) { $DOCKER_ADMIN_USER } else { "postgres" }
        $dbSize = & docker exec $DOCKER_CONTAINER psql -U $adminUser -d $DB_NAME -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>&1
    } else {
        $cmdParts = $PSQL_CMD -split '\s+', 0, 'RegexMatch'
        $executable = $cmdParts[0]
        $args = $cmdParts[1..($cmdParts.Length-1)] + @("-d", $DB_NAME, "-t", "-c", "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
        $dbSize = & $executable $args 2>&1
    }
    $dbSize = ($dbSize | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
    if ([string]::IsNullOrEmpty($dbSize)) {
        $dbSize = "unknown"
    }
    Write-Info "Database size: $dbSize"
} catch {
    Write-Info "Database size: unknown"
}

Write-Section "Setup Complete"

Write-Success "Database setup completed successfully!"
Write-Host ""
Write-Host "Database Details:" -ForegroundColor White
Write-Host "   Database: $DB_NAME" -ForegroundColor Cyan
Write-Host "   User:     $DB_USER" -ForegroundColor Cyan
Write-Host "   Password: $DB_PASSWORD" -ForegroundColor Cyan
Write-Host ""

# Determine connection host based on setup type
$CONNECTION_HOST = "localhost"
if ($USE_DOCKER) {
    Write-Info "Using Docker container - connection via localhost"
}

Write-Host "Connection String:" -ForegroundColor White
$CONNECTION_STRING = "postgresql://${DB_USER}:${DB_PASSWORD}@${CONNECTION_HOST}:5432/${DB_NAME}?schema=public"
Write-Host "   $CONNECTION_STRING" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor White
Write-Host "   1. Add the connection string to your .env.local file:"
Write-Host ('      DATABASE_URL="' + $CONNECTION_STRING + '"') -ForegroundColor Cyan
Write-Host "   2. Run database migrations:"
Write-Host "      pnpm db:push" -ForegroundColor Cyan
Write-Host '   3. (Optional) Seed the database with initial data'
Write-Host ""

