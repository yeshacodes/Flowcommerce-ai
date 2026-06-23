Write-Host "Stopping Docker infrastructure..." -ForegroundColor Cyan
docker compose down

Write-Host "Docker containers stopped." -ForegroundColor Green
Write-Host "Close any service terminals manually with Ctrl+C if needed."
