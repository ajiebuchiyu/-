@echo off
cd /d %~dp0

echo ============================================
echo   StoryForge Upload to GitHub
echo ============================================

REM Stage all changes
git add -A

REM Commit (skip if nothing changed)
git commit -m "update: %date% %time%" || echo [SKIP] No changes to commit

REM First time: set remote URL if not configured
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    set /p URL=First time - paste your GitHub repo URL (e.g. https://github.com/user/repo.git): 
    git remote add origin %URL%
)

REM Push to main (first push will open GitHub login window)
git push -u origin main

echo ============================================
echo   Done! Press any key to close
echo ============================================
pause
