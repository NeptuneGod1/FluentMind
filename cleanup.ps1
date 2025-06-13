# Safe Cleanup Script for ModernLWT3 Project
# This script will remove unnecessary files while keeping your project functional

Write-Host "=== ModernLWT3 Project Cleanup ===" -ForegroundColor Cyan
Write-Host "This script will remove unnecessary files to clean up your project."
Write-Host "Checking for files to clean..."

# Initialize counters
$script:totalFreed = 0
$script:itemsRemoved = 0

# Function to safely remove items and track space
function Remove-ItemSafely {
    param (
        [string]$path,
        [string]$description
    )
    
    if (Test-Path $path) {
        try {
            $item = Get-Item $path -ErrorAction Stop
            $size = if ($item.PSIsContainer) {
                (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
            } else {
                if ($item.Length) { $item.Length } else { 0 }
            }
            
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            
            $script:totalFreed += $size
            $script:itemsRemoved++
            
            $sizeMB = if ($size -gt 0) { "{0:N2} MB" -f ($size / 1MB) } else { "unknown size" }
            Write-Host "✓ Removed $description ($sizeMB)" -ForegroundColor Green
        }
        catch {
            Write-Host "! Failed to remove $description" -ForegroundColor Red
            Write-Host "  Error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "- $description not found" -ForegroundColor Gray
    }
}

# 1. Remove Python cache and bytecode
Remove-ItemSafely -path "__pycache__" -description "Python cache directory"
Remove-ItemSafely -path ".ruff_cache" -description "Ruff linter cache"

# Remove all .pyc and .pyo files in the project
Get-ChildItem -Path . -Include *.pyc,*.pyo -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $size = if ($_.Length) { $_.Length } else { 0 }
    $script:totalFreed += $size
    $script:itemsRemoved++
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
}

# 2. Remove build artifacts
Remove-ItemSafely -path "build" -description "Build directory"
Remove-ItemSafely -path "dist" -description "Distribution directory"

# 3. Remove IDE specific files (if any)
Remove-ItemSafely -path ".vscode" -description "VS Code settings"
Remove-ItemSafely -path ".idea" -description "PyCharm settings"

# 4. Remove Python cache files in all subdirectories
Get-ChildItem -Directory -Recurse -Force -Include "__pycache__" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
    $script:totalFreed += $size
    $script:itemsRemoved++
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

# 5. Remove temporary files
Get-ChildItem -Path . -Include *.tmp,*.log -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $size = if ($_.Length) { $_.Length } else { 0 }
    $script:totalFreed += $size
    $script:itemsRemoved++
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
}

# Summary
$totalMB = if ($script:totalFreed -gt 0) { "{0:N2} MB" -f ($script:totalFreed / 1MB) } else { "0 MB" }
Write-Host "`n=== Cleanup Complete ===" -ForegroundColor Cyan
Write-Host "Removed $($script:itemsRemoved) items"
Write-Host "Freed approximately $totalMB of disk space"

# Optional: Virtual environment cleanup
Write-Host "`n=== Optional Cleanup ===" -ForegroundColor Yellow
Write-Host "To remove and recreate your virtual environment, run these commands:"
Write-Host "1. Remove-Item -Recurse -Force venv" -ForegroundColor Yellow
Write-Host "2. python -m venv venv" -ForegroundColor Yellow
Write-Host "3. .\venv\Scripts\activate" -ForegroundColor Yellow
Write-Host "4. pip install -r requirements.txt" -ForegroundColor Yellow

Write-Host "`nNote: Your database and source code have not been modified." -ForegroundColor Green
Write-Host "To run this cleanup again, just run: .\cleanup.ps1" -ForegroundColor Cyan
