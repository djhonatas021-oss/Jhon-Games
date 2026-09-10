@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando os componentes necessarios...
  npm install
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar os componentes. Verifique sua internet e se o Node.js esta instalado.
    pause
    exit /b 1
  )
)
if not exist .env (
  copy /Y .env.example .env >nul
  echo.
  echo Foi criado o arquivo .env.
  echo Abra o arquivo .env e cole sua chave do Asaas na linha ASAAS_API_KEY=...
  echo Depois salve e execute este arquivo novamente.
  pause
  exit /b 0
)
node server.js
pause
