@echo off
title Campeonato FIFA VIVA - servidor
cd /d "%~dp0"
echo.
echo   Campeonato no ar em:  http://localhost:8080
echo.
echo   Deixe esta janela ABERTA durante o evento.
echo   Para encerrar, feche a janela ou aperte Ctrl+C.
echo.
start "" http://localhost:8080
python servir.py
pause
