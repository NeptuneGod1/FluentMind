# Simple Cleanup Script for ModernLWT3 Project
Write-Host "=== Starting Cleanup ===" -ForegroundColor Cyan

# 1. Remove Python cache and bytecode
if (Test-Path "__pycache__") {
    Remove-Item -Path "__pycache__" -Recurse -Force
    Write-Host "Removed __pycache__" -ForegroundColor Green
}

if (Test-Path ".ruff_cache") {
    Remove-Item -Path ".ruff_cache" -Recurse -Force
    Write-Host "Removed .ruff_cache" -ForegroundColor Green
}

# 2. Remove build artifacts
if (Test-Path "build") {
    Remove-Item -Path "build" -Recurse -Force
    Write-Host "Removed build directory" -ForegroundColor Green
}

if (Test-Path "dist") {
    Remove-Item -Path "dist" -Recurse -Force
    Write-Host "Removed dist directory" -ForegroundColor Green
}

# 3. Remove Python compiled files
$pycFiles = Get-ChildItem -Path . -Include *.pyc,*.pyo -Recurse -ErrorAction SilentlyContinue
if ($pycFiles) {
    $pycFiles | Remove-Item -Force
    Write-Host "Removed $($pycFiles.Count) .pyc/.pyo files" -ForegroundColor Green
}

# 4. Remove IDE specific files
if (Test-Path ".vscode") {
    Remove-Item -Path ".vscode" -Recurse -Force
    Write-Host "Removed .vscode directory" -ForegroundColor Green
}

if (Test-Path ".idea") {
    Remove-Item -Path ".idea" -Recurse -Force
    Write-Host "Removed .idea directory" -ForegroundColor Green
}

# 5. Remove temporary files
$tempFiles = Get-ChildItem -Path . -Include *.tmp,*.log -Recurse -ErrorAction SilentlyContinue
if ($tempFiles) {
    $tempFiles | Remove-Item -Force
    Write-Host "Removed $($tempFiles.Count) temporary/log files" -ForegroundColor Green
}

Write-Host "`n=== Cleanup Complete ===" -ForegroundColor Cyan
Write-Host "Your source code and database have not been modified." -ForegroundColor Green
Write-Host "To clean up your virtual environment, run:"
Write-Host "1. Remove-Item -Recurse -Force venv" -ForegroundColor Yellow
Write-Host "2. python -m venv venv" -ForegroundColor Yellow
Write-Host "3. .\venv\Scripts\activate" -ForegroundColor Yellow
Write-Host "4. pip install -r requirements.txt" -ForegroundColor Yellow
