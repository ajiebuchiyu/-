@echo off
chcp 65001 >nul
cd /d %~dp0

echo ============================================
echo   StoryForge 一键上传到 GitHub
echo ============================================

REM 1) 暂存所有改动
git add -A

REM 2) 提交（无改动则跳过）
git commit -m "update: %date% %time%" || echo [跳过] 没有新的改动需要提交

REM 3) 首次使用：若还没有远程仓库，提示粘贴地址
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    set /p URL=首次使用，请粘贴你的 GitHub 仓库地址(如 https://github.com/用户名/仓库名.git): 
    git remote add origin %URL%
)

REM 4) 推送到 main 分支（首次会弹出 GitHub 登录/Token 窗口，之后自动记住）
git push -u origin main

echo ============================================
echo   上传完成，按任意键关闭
echo ============================================
pause
