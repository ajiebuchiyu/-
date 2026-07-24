@echo off
title StoryForge 一键启动
cd /d "%~dp0"

rem 某些工具链会给 NODE_OPTIONS 注入 --use-system-ca 等 Electron 不支持的参数，必须清空才能正常启动
rem ELECTRON_RUN_AS_NODE=1 会让 electron 以 Node 模式运行而不是启动 GUI，也需要清空
call set "NODE_OPTIONS="
call set "ELECTRON_RUN_AS_NODE="

echo ==========================================
echo    StoryForge - GalGame / AVG 创作引擎
echo ==========================================
echo.

rem ---------- 1. 检查 Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js！
    echo 请先安装 Node.js（https://nodejs.org/），安装后重新运行本脚本。
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js 版本: %%v
echo.

rem ---------- 2. 首次运行自动安装依赖 ----------
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖，可能需要几分钟...
    call npm install
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败！可切换国内镜像后重试：
        echo     npm config set registry https://registry.npmmirror.com
        echo.
        pause
        exit /b 1
    )
    echo [OK] 依赖安装完成
    echo.
)

rem ---------- 3. 选择启动方式 ----------
echo 请选择启动方式：
echo.
echo   [1] 桌面版 - Electron 开发模式（推荐，功能最全）
echo   [2] 网页版 - 浏览器打开 http://127.0.0.1:4178
echo   [3] 打包   - 生成 Windows 安装包（输出到 release 目录）
echo.
choice /c 123 /t 15 /d 1 /n /m "输入 1 / 2 / 3（15 秒后默认选 1）: "

if errorlevel 3 goto PACK
if errorlevel 2 goto WEB
goto DESKTOP

:DESKTOP
echo.
echo [启动] 桌面版，关闭本窗口即退出...
call npm run dev
goto END

:WEB
echo.
echo [启动] 网页版，浏览器将自动打开 http://127.0.0.1:4178
echo 保持本窗口开启，关闭窗口即停止服务
call npx vite --config vite.web.config.ts --port 4178 --strictPort --open
goto END

:PACK
echo.
echo [打包] 正在构建 Windows 安装包，首次会下载 Electron 组件，耗时较长...
call npm run build:win
if errorlevel 1 (
    echo [错误] 打包失败，请查看上方日志。
) else (
    echo.
    echo [OK] 打包完成！安装包位于 release 目录：
    dir /b release\*.exe 2>nul
    start "" explorer "%~dp0release"
)
goto END

:END
echo.
pause
