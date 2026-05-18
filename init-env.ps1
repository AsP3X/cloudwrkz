# Human: Windows-friendly bootstrap for local `.env` files (same behavior as init-env.sh).
# Agent: READS *.env.example; WRITES .env if missing; REPLACES GENERATE_ME with 64 hex chars per line.

$ErrorActionPreference = "Stop"

function New-RandomHexSecret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Initialize-EnvFile {
    param(
        [string]$EnvFile,
        [string]$ExampleFile
    )

    if (-not (Test-Path $ExampleFile)) {
        Write-Error "Example file not found: $ExampleFile"
    }

    if (-not (Test-Path $EnvFile)) {
        Write-Host "Creating $EnvFile from $ExampleFile..."
        Copy-Item $ExampleFile $EnvFile
    }

    $lines = Get-Content $EnvFile
    $changed = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match '^\s*#' -or $line -notmatch 'GENERATE_ME') {
            continue
        }
        $secret = New-RandomHexSecret
        $lines[$i] = $line -replace 'GENERATE_ME', $secret
        $changed = $true
    }
    if ($changed) {
        Set-Content -Path $EnvFile -Value $lines -Encoding utf8
    }
    Write-Host "$EnvFile is ready."
}

Initialize-EnvFile -EnvFile "apps/api/.env" -ExampleFile "apps/api/.env.example"
Initialize-EnvFile -EnvFile "apps/web-vite/.env" -ExampleFile "apps/web-vite/.env.example"
Initialize-EnvFile -EnvFile "apps/cli/.env" -ExampleFile "apps/cli/.env.example"
