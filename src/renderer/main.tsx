import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PreviewApp from './preview/PreviewApp'
import { installWebShim } from './webShim'
import { useProjectStore } from './store/projectStore'
import './styles.css'

// 非 Electron（浏览器）环境下注入兼容层，让完整引擎界面可直接在浏览器操作演示
installWebShim()

// 拦截 window.alert：将原生弹窗重定向到 toast 系统
// 避免原生 alert 在页面顶部/中心弹出、遮挡 UI 或位置不可控
const nativeAlert = window.alert
window.alert = function (message?: any): void {
  // 保留对同步阻塞场景的降级（极少数场景需要用户确认才能继续）
  // 绝大多数调用是纯通知性的，走 toast 即可
  try {
    const store = useProjectStore.getState()
    if (store.toast) {
      store.toast(String(message ?? ''), 'info')
      return
    }
  } catch {
    /* store 尚未就绪时降级 */
  }
  nativeAlert.call(window, message)
}

// 根据 URL 参数区分：主编辑器窗口 vs 独立预览窗口
const isPreview = new URLSearchParams(window.location.search).get('mode') === 'preview'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isPreview ? <PreviewApp /> : <App />}</React.StrictMode>
)
