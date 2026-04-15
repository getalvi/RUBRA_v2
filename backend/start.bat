@echo off
title RUBRA v5 Backend
cd /d "%~dp0"
echo.
echo  Starting RUBRA Backend...
echo  API: http://localhost:8000
echo  Docs: http://localhost:8000/docs
echo.
python app.py
pause