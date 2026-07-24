import { app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'

/**
 * 导出 Windows exe。
 * 通过调用 electron-builder 对当前项目进行打包。
 * 说明：exe 打包需要项目已 build（out/ 存在），并在开发环境执行；
 * 生产/演示环境返回引导信息，避免误触长时间打包。
 */
export function exportExe(_project: unknown): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const isPackaged = app.isPackaged
    if (isPackaged) {
      resolve({
        ok: false,
        message:
          '已打包环境不支持二次打包。请在源码环境执行 `npm run build:win`（electron-builder）生成 exe，产物位于 release/ 目录。'
      })
      return
    }

    try {
      const cwd = process.cwd()
      const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const child = spawn(cmd, ['run', 'build:win'], { cwd, shell: true })
      let log = ''
      child.stdout.on('data', (d) => (log += d.toString()))
      child.stderr.on('data', (d) => (log += d.toString()))
      child.on('close', (code) => {
        resolve({
          ok: code === 0,
          message:
            code === 0
              ? `打包完成，产物位于 ${join(cwd, 'release')}`
              : `打包失败（exit ${code}）。请检查 electron-builder 环境。\n${log.slice(-800)}`
        })
      })
    } catch (e) {
      resolve({ ok: false, message: '无法启动 electron-builder：' + String(e) })
    }
  })
}
