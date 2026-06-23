$Root = "C:\Desktop\Projects\order-platform\order-platform"

Write-Host "Starting Docker infrastructure..." -ForegroundColor Cyan
Set-Location $Root
docker compose up -d postgres redis kafka

Start-Sleep -Seconds 5

Write-Host "Starting backend services..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; uvicorn auth_service.main:app --reload --host 0.0.0.0 --port 8004"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; uvicorn catalog_service.main:app --reload --host 0.0.0.0 --port 8005"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; uvicorn order_service.main:app --reload --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; uvicorn stripe_webhook_service.main:app --reload --host 0.0.0.0 --port 8006"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; python -m inventory_service.main"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; python -m payment_service.main"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; .\.venv\Scripts\Activate.ps1; python -m notification_service.main"

Write-Host "Starting frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; npm run dev"

Write-Host "FlowCommerce AI dev stack launched." -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Auth:     http://localhost:8004/health" -ForegroundColor Green
Write-Host "Catalog:  http://localhost:8005/health" -ForegroundColor Green
Write-Host "Order:    http://localhost:8000/health" -ForegroundColor Green