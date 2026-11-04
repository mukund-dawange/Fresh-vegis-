@echo off
cd /d "%~dp0"
echo Opening Freshleaf on http://127.0.0.1:4173
echo Keep this window open while you use the local preview.
node scripts\serve.mjs
pause
