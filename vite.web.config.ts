import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 独立的 Web 演示构建配置。
 * 复用 renderer 源码，注入浏览器兼容层（webShim），产出可在浏览器直接运行的引擎界面。
 * 不影响 electron.vite.config.ts 的桌面构建。
 */
export default defineConfig({
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: resolve(__dirname, 'web-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  },
  plugins: [react()]
})
