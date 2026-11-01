@echo off
rem Mede a memoria e a CPU do Zen a cada 10 s, para comparar com o P0. Feche esta janela para parar.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "ferramentas\medir-zen.ps1" -Processo zen
pause
