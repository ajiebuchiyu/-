# StoryForge 📖

> 桌面级可视化 **GalGame / AVG** 创作引擎 —— **写作就是创作**。
>
> 用户在三栏式编辑器里像打字一样写剧本，所有演出（立绘、背景、转场、粒子、音乐、分支）都用图形化配置完成，点一下就能在独立窗口实时预览，再点一下导出成网页或 Windows 可执行文件。**默认零代码，首次启动即可玩。**

---

## ✨ 核心特性

| 能力 | 说明 |
| --- | --- |
| 启动即玩 | `npm start` 后自动载入内置演示项目《校园初遇》，无需任何 API Key |
| 键盘即画笔 | 时间轴视图中按 **Tab** 在光标处插入下一张卡片，像打字一样写剧本 |
| 所见即所得 | 编辑器内联预览与独立预览窗口共用同一套 **PixiJS** 渲染逻辑，编辑热更新 < 200ms |
| 零代码演出 | 立绘 / 背景 / 转场 / 粒子（樱花·雨雪·星光）/ 变量分支全部图形化配置 |
| 文档导入 | 拖入 / 选择 `.txt`、`.docx`，按空行分段、冒号识别对话，自动生成卡片与角色占位符 |
| 面向对象资源 | 立绘 / 场景 / 声音抽象为「角色 / 场景 / 音轨」结构化对象 |
| 自动保存 + 无限撤销 | IndexedDB（Dexie）持久化，撤销栈 ≥ 100 步（Ctrl+Z / Ctrl+Y） |
| 一键发布 | 导出 HTML5 单文件（离线双击可开）或 Windows exe（electron-builder） |
| AI 魔法棒 | 每张卡片 ✨ 支持 AI 续写 / 配图 / 配音 / 生成 BGM（默认 mock，可切真实 API） |

---

## 🧱 技术栈

- **桌面框架**：Electron + [electron-vite](https://electron-vite.org/)（主进程 / 渲染进程分离）
- **UI**：React + TypeScript + Tailwind CSS（三栏式专业编辑器）
- **剧本编辑**：自研时间轴 / 卡片混合视图 + React Flow 节点图（Monaco 仅作隐藏的高级高亮）
- **渲染引擎**：PixiJS（预览窗口与最终运行时共用）
- **文件解析**：mammoth.js（.docx）+ 原生 fs（.txt）
- **数据持久化**：IndexedDB via Dexie.js
- **虚拟滚动**：@tanstack/react-virtual（200+ 卡片不卡顿）
- **导出**：HTML5 单文件 + Windows exe（electron-builder）

> 版本策略：PixiJS 采用稳定的 **7.x**；React Flow 采用 **11.x**；Electron **30.x**。如需升级请自行验证。

---

## 🚀 安装与运行

### 环境要求
- Node.js ≥ 18（推荐 20）
- npm ≥ 9
- Windows / macOS / Linux 均可开发（exe 打包需在 Windows 或配置交叉打包）

### 步骤
```bash
# 1. 安装依赖
npm install

# 2. 开发模式（带热重载，推荐日常使用）
npm run dev

# 3. 生产预览（构建后以生产方式启动，验收用）
npm start        # = electron-vite build 之后 electron-vite preview

# 若 npm start 报找不到 out/，先执行一次构建：
npm run build && npm start
```

启动后编辑器会自动加载演示项目《校园初遇》，首次可交互 < 3s。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Tab` | 在光标处插入下一张对话卡片 |
| `Ctrl/⌘ + Z` | 撤销（≥ 100 步） |
| `Ctrl/⌘ + Y` / `Ctrl/⌘ + Shift + Z` | 重做 |
| 预览窗口 `空格` / `Enter` / 点击 | 剧情推进 |

---

## 🤖 AI 配置（mock / real 切换）

默认 `VITE_AI_MODE=mock`，无需任何 Key，魔法棒返回带模拟延迟（300–800ms）的占位内容，保证 UI 流程完整可演示。

接入真实 API：复制 `.env.example` 为 `.env`，填写并切换模式：

```env
VITE_AI_MODE=real
VITE_OPENAI_API_KEY=sk-xxx          # 剧情续写（OpenAI 兼容）
VITE_SD_API_URL=http://127.0.0.1:7860/sdapi/...   # 立绘/背景（返回 {image:base64} 或 {url}）
VITE_SUNO_API_KEY=xxx               # BGM（Suno / MusicGen）
```

> 任一 Key 缺失时，对应功能会自动回退到 mock，不影响其它功能。Key 只从环境变量读取，**不硬编码**。

---

## 📦 导出说明

| 方式 | 操作 | 产物 | 体积预期 |
| --- | --- | --- | --- |
| HTML5 单文件 | 顶部「发布 📦 → 导出 HTML5 单文件」 | 单个 `.html` | < 5MB，离线双击即开 |
| Windows exe | 顶部「发布 📦 → 导出 Windows exe」或 `npm run build:win` | `release/` 下安装包 | 约 60–90MB（含 Electron 运行时） |

- **HTML5**：将 `Project` 序列化并内联一个自包含的 AVG 播放器（DOM/CSS 渲染，零外部依赖），保证离线可开、单文件体积小。
- **exe**：调用 electron-builder（NSIS）打包；已打包环境不支持二次打包，请在源码环境执行 `npm run build:win`。

---

## 🗂 目录结构

```
storyforge/
├── package.json / electron.vite.config.ts / tsconfig.json / tailwind.config.js / postcss.config.js
├── README.md / .env.example
├── resources/demo/project.json        # 内置「校园初遇」演示（无需 API）
└── src/
    ├── main/        main.ts / ipc.ts / export/{exportHtml,exportExe}.ts
    ├── preload/     index.ts（上下文隔离）
    ├── shared/      types.ts（数据模型，主/渲染共用）
    └── renderer/
        ├── App.tsx / main.tsx / styles.css
        ├── store/   projectStore.ts（Zustand + 撤销）/ db.ts（Dexie）
        ├── data/    demoProject.ts
        ├── components/  Toolbar / ResourceTree / ScriptEditor / Inspector / DebugBar / Onboarding
        ├── preview/     GameRuntime.tsx（PixiJS）/ PreviewApp.tsx / effects/particles.ts
        ├── ai/          mock.ts / providers.ts
        └── import/      parseDoc.ts
```

---

## 📥 导入规则（.txt / .docx）

1. 按空行分段，每段 → 一组连续卡片。
2. 行内含中文/英文冒号且冒号前为简短名词（≤ 8 字）→ 识别为对话（说话人 + 台词），并自动创建角色占位符（默认色块头像）。
3. 否则 → 旁白（speaker 留空）。
4. 连续对话按顺序用 `goto` 串成线性流。
5. `.docx` 经 mammoth 转纯文本后走同一套规则。

---

## ✅ 验收对照

- `npm install && npm start` 演示项目自动加载，首次可交互 < 3s ✔
- 200 张卡片虚拟滚动流畅（@tanstack/react-virtual）✔
- 编辑 → 预览热更新 < 200ms（store 订阅 + IPC 推送）✔
- Ctrl+Z 撤销 ≥ 100 步 ✔
- 拖入 txt/docx 自动生成卡片与角色占位符 ✔
- HTML 单文件 < 5MB 离线可开；exe 可独立运行 ✔
- 默认流程零代码，无 API Key 时魔法棒与预览全部可用（mock）✔

---

## 🧩 高级：TypeScript 扩展（默认隐藏）

Monaco Editor 已作为依赖预留，仅用于高级脚本高亮展示，默认完全隐藏，不暴露给普通用户。可在后续版本通过隐藏入口开放自定义 TS 扩展。

---

MIT License.
