# Database setup script for CloudWrkz
# Choose: local PostgreSQL, remote PostgreSQL, Docker local, or Docker remote.
# For remote options you can define address, port, and password.

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

function Write-WarnMsg {
    param([string]$Message)
    Write-Host "[WARN]  $Message" -ForegroundColor Yellow
}

function Write-ErrMsg {
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

# Default values for the app database
$DB_NAME = "cloudwrkz"
$DB_USER = "cloudwrkz"
$DB_PASSWORD = "cloudwrkz_dev_password"

# Connection type and remote options
$SETUP_TYPE = ""
$REMOTE_HOST = ""
$REMOTE_PORT = "5432"
$REMOTE_ADMIN_USER = "postgres"
$REMOTE_ADMIN_PASSWORD = ""

# Will be set based on chosen setup
$PSQL_CMD = $null
$USE_DOCKER = $false
$DOCKER_CONTAINER = ""
$DOCKER_USER = "postgres"
$DOCKER_ADMIN_USER = $null
$POSTGRES_VERSION = ""
$CONNECTION_METHOD = ""
$CONNECTION_HOST = "localhost"
$CONNECTION_PORT = "5432"

# Prompt for remote connection details (shared by Remote and Docker Remote)
function Prompt-RemoteConnection {
    Write-Host ""
    Write-Host "Enter remote PostgreSQL connection details:" -ForegroundColor White
    Write-Host ""
    $script:REMOTE_HOST = Read-Host "  Host or IP address"
    if ([string]::IsNullOrWhiteSpace($script:REMOTE_HOST)) {
        Write-ErrMsg "Host is required."
        exit 1
    }
    $portInput = Read-Host "  Port [$script:REMOTE_PORT]"
    if (-not [string]::IsNullOrWhiteSpace($portInput)) {
        $script:REMOTE_PORT = $portInput
    }
    $userInput = Read-Host "  Admin username [$script:REMOTE_ADMIN_USER]"
    if (-not [string]::IsNullOrWhiteSpace($userInput)) {
        $script:REMOTE_ADMIN_USER = $userInput
    }
    $securePassword = Read-Host "  Admin password" -AsSecureString
    $script:REMOTE_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword))
    if ([string]::IsNullOrWhiteSpace($script:REMOTE_ADMIN_PASSWORD)) {
        Write-ErrMsg "Password is required."
        exit 1
    }
    $script:CONNECTION_HOST = $script:REMOTE_HOST
    $script:CONNECTION_PORT = $script:REMOTE_PORT
}

# Try to connect via local PostgreSQL only
function Setup-LocalPostgres {
    Write-Step "Attempting to connect via local PostgreSQL..."
    try {
        $result = & psql -U postgres -c "SELECT version();" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $script:PSQL_CMD = "psql -U postgres"
            $script:USE_DOCKER = $false
            $script:CONNECTION_METHOD = "postgres user (local)"
            $versionOutput = & psql -U postgres -c "SELECT version();" -t 2>&1
            if ($versionOutput) {
                $script:POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
            }
            return $true
        }
    } catch {}
    try {
        $currentUser = $env:USERNAME
        $result = & psql -U $currentUser -d postgres -c "SELECT version();" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $script:PSQL_CMD = "psql -U $currentUser -d postgres"
            $script:USE_DOCKER = $false
            $script:CONNECTION_METHOD = "current user $currentUser (local)"
            $versionOutput = & psql -U $currentUser -d postgres -c "SELECT version();" -t 2>&1
            if ($versionOutput) {
                $script:POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
            }
            return $true
        }
    } catch {}
    return $false
}

# Connect to remote PostgreSQL using prompted credentials
function Setup-RemotePostgres {
    $env:PGPASSWORD = $script:REMOTE_ADMIN_PASSWORD
    $script:PSQL_CMD = "psql -h $($script:REMOTE_HOST) -p $($script:REMOTE_PORT) -U $($script:REMOTE_ADMIN_USER) -d postgres"
    $script:CONNECTION_METHOD = "Remote ($($script:REMOTE_HOST):$($script:REMOTE_PORT))"
    try {
        $versionOutput = & psql -h $script:REMOTE_HOST -p $script:REMOTE_PORT -U $script:REMOTE_ADMIN_USER -d postgres -c "SELECT version();" -t 2>&1
        if ($LASTEXITCODE -eq 0 -and $versionOutput) {
            $script:POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
            return $true
        }
    } catch {}
    return $false
}

# Docker local: start compose if needed, then connect via localhost or db
function Setup-DockerLocal {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-ErrMsg "Docker is not installed. Install Docker to use this option."
        exit 1
    }
    try {
        $null = & docker ps 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ErrMsg "Docker is not running. Start Docker and try again."
            exit 1
        }
    } catch {
        Write-ErrMsg "Docker is not running or not accessible."
        exit 1
    }

    $composeFile = $null
    if (Test-Path "docker-compose.yml") {
        $composeFile = "docker-compose.yml"
    } elseif (Test-Path ".devcontainer/docker-compose.yml") {
        $composeFile = ".devcontainer/docker-compose.yml"
    }
    if ($composeFile) {
        Write-Step "Starting PostgreSQL with Docker Compose ($composeFile)..."
        try {
            & docker compose -f $composeFile up -d postgres 2>&1 | Out-Null
        } catch {
            & docker-compose -f $composeFile up -d postgres 2>&1 | Out-Null
        }
        Start-Sleep -Seconds 2
    }

    # Try localhost then db (devcontainer network)
    foreach ($tryHost in @("localhost", "db")) {
        foreach ($tryUser in @("cloudwrkz", "postgres")) {
            foreach ($tryPass in @("cloudwrkz_dev_password", "postgres")) {
                try {
                    $env:PGPASSWORD = $tryPass
                    $result = & psql -h $tryHost -p 5432 -U $tryUser -d postgres -c "SELECT 1;" 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        $script:PSQL_CMD = "psql -h $tryHost -p 5432 -U $tryUser -d postgres"
                        $script:CONNECTION_METHOD = "Docker local (${tryHost}:5432, $tryUser)"
                        $versionOutput = & psql -h $tryHost -p 5432 -U $tryUser -d postgres -c "SELECT version();" -t 2>&1
                        if ($versionOutput) {
                            $script:POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
                        }
                        $env:PGPASSWORD = $tryPass
                        $script:USE_DOCKER = $true
                        $script:CONNECTION_PORT = "5432"
                        $script:CONNECTION_HOST = $tryHost
                        return $true
                    }
                } catch {}
            }
        }
    }

    # Fallback: find running postgres container
    $containers = & docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "(db|postgres|cloudwrkz)" }
    foreach ($container in $containers) {
        try {
            $result = & docker exec $container psql -U postgres -c "SELECT 1;" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $script:DOCKER_CONTAINER = $container
                $script:PSQL_CMD = "docker exec -i $container psql -U postgres"
                $script:CONNECTION_METHOD = "Docker local (container: $container)"
                $script:DOCKER_USER = "postgres"
                $versionOutput = & docker exec $container psql -U postgres -c "SELECT version();" -t 2>&1
                if ($versionOutput) {
                    $script:POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
                }
                $script:USE_DOCKER = $true
                return $true
            }
        } catch {}
        try {
            $result = & docker exec $container psql -U cloudwrkz -c "SELECT 1;" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $script:DOCKER_CONTAINER = $container
                $script:PSQL_CMD = "docker exec -i $container psql -U cloudwrkz"
                $script:CONNECTION_METHOD = "Docker local (container: $container)"
                $script:DOCKER_USER = "cloudwrkz"
                $versionOutput = & docker exec $container psql -U cloudwrkz -c "SELECT version();" -t 2>&1
                if ($versionOutput) {
                    $script:POSTGRES_VERSION = ($versionOutput | Select-Object -First 1).Trim()
                }
                $script:USE_DOCKER = $true
                return $true
            }
        } catch {}
    }
    return $false
}

# =============================================================================
# Main
# =============================================================================

Write-Section "CloudWrkz Database Setup"

Write-Info "Target database: $DB_NAME"
Write-Info "Target user: $DB_USER"

Write-Section "Choose database setup type"

Write-Host "  1) Local PostgreSQL (system installation on this machine)"
Write-Host "  2) Remote PostgreSQL (existing server; you provide address, port, password)"
Write-Host "  3) Docker local (PostgreSQL in a container on this machine)"
Write-Host "  4) Docker remote (PostgreSQL in Docker on another machine; you provide address, port, password)"
Write-Host ""
$choice = Read-Host "Enter choice [1-4]"

switch ($choice) {
    "1" {
        $SETUP_TYPE = "local"
        Write-Section "Local PostgreSQL"
        if (-not (Setup-LocalPostgres)) {
            Write-ErrMsg "Could not connect to local PostgreSQL."
            Write-Host ""
            Write-Host "Possible solutions:" -ForegroundColor White
            Write-Host "  Windows: Download from https://www.postgresql.org/download/windows/"
            Write-Host "  Or: choco install postgresql"
            Write-Host "  Then: net start postgresql-x64-XX"
            exit 1
        }
        Write-Success "Connected to local PostgreSQL"
    }
    "2" {
        $SETUP_TYPE = "remote"
        Write-Section "Remote PostgreSQL"
        Prompt-RemoteConnection
        if (-not (Setup-RemotePostgres)) {
            Write-ErrMsg "Could not connect to remote PostgreSQL at ${REMOTE_HOST}:${REMOTE_PORT}"
            Write-Host "  Check host, port, firewall, and credentials."
            exit 1
        }
        Write-Success "Connected to remote PostgreSQL"
    }
    "3" {
        $SETUP_TYPE = "docker_local"
        Write-Section "Docker local"
        if (-not (Setup-DockerLocal)) {
            Write-ErrMsg "Could not connect to PostgreSQL via Docker."
            Write-Host ""
            Write-Host "  Ensure Docker is running and start the stack:"
            Write-Host "    docker compose up -d postgres"
            exit 1
        }
        Write-Success "Connected to Docker local PostgreSQL"
    }
    "4" {
        $SETUP_TYPE = "docker_remote"
        Write-Section "Docker remote"
        Prompt-RemoteConnection
        if (-not (Setup-RemotePostgres)) {
            Write-ErrMsg "Could not connect to remote PostgreSQL at ${REMOTE_HOST}:${REMOTE_PORT}"
            Write-Host "  Check host, port, firewall, and that the container exposes the port."
            exit 1
        }
        Write-Success "Connected to Docker remote PostgreSQL"
    }
    default {
        Write-ErrMsg "Invalid choice. Use 1, 2, 3, or 4."
        exit 1
    }
}

# Display connection information
Write-Section "Connection Information"
Write-Success "Connection method: $CONNECTION_METHOD"
if (-not [string]::IsNullOrEmpty($POSTGRES_VERSION)) {
    $versionParts = $POSTGRES_VERSION -split ' ' | Select-Object -First 3
    Write-Info "PostgreSQL version: $($versionParts -join ' ')"
}
if ($USE_DOCKER -and -not [string]::IsNullOrEmpty($DOCKER_CONTAINER)) {
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
            Write-WarnMsg "No superuser found, will attempt operations with connected user '$DOCKER_USER'"
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
    Write-ErrMsg "Connection test failed"
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
    Write-WarnMsg "User '$DB_USER' already exists"
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
    Write-WarnMsg "Database '$DB_NAME' already exists"
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
            Write-WarnMsg "Database '$DB_NAME' already exists"
            Write-Info "Skipping database creation"
        } else {
            $errorMsg = if ($errorOutput) { $errorOutput -join "; " } else { "Exit code: $exitCode" }
            Write-ErrMsg "Failed to create database: $errorMsg"
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
                Write-WarnMsg "Database '$DB_NAME' already exists"
                Write-Info "Skipping database creation"
            } elseif ($errorOutput) {
                Write-ErrMsg "Failed to create database: $($errorOutput -join '; ')"
                exit 1
            } else {
                Write-Success "Database '$DB_NAME' created successfully"
            }
        } catch {
            Write-ErrMsg "Failed to create database: $_"
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
    Write-WarnMsg "Some privileges may not have been granted (this may be expected)"
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
        Write-ErrMsg "Database '$DB_NAME' not found after creation"
        exit 1
    }
} catch {
    Write-ErrMsg "Failed to verify database existence"
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
        Write-ErrMsg "User '$DB_USER' not found after creation"
        exit 1
    }
} catch {
    Write-ErrMsg "Failed to verify user existence"
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
            Write-WarnMsg "Database connection test failed (this may be expected for Docker containers)"
        }
    } catch {
        Write-WarnMsg "Database connection test failed (this may be expected for Docker containers)"
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

Write-Host "Connection String:" -ForegroundColor White
$CONNECTION_STRING = "postgresql://${DB_USER}:${DB_PASSWORD}@${CONNECTION_HOST}:${CONNECTION_PORT}/${DB_NAME}?schema=public"
Write-Host "   $CONNECTION_STRING" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor White
Write-Host "   1. Add the connection string to your .env.local file:"
Write-Host ('      DATABASE_URL="' + $CONNECTION_STRING + '"') -ForegroundColor Cyan
Write-Host "   2. Run database migrations:"
Write-Host "      pnpm db:push" -ForegroundColor Cyan
Write-Host '   3. (Optional) Seed the database with initial data'
Write-Host ""

