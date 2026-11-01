@echo off
rem Abre o HuntDesk Navegador P0 (duas contas do jogo lado a lado, medindo memoria e CPU).
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando o motor do navegador pela primeira vez, aguarde...
  call npm install
)
call npm start
