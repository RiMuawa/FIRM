# IoT Worktable

面向 IoT 信息搜集的桌面工作台，基于 **Electron + electron-vite + React + TypeScript**。

当前版本已完成 `todo.md` 中“第三方数据源 → 主查看窗口 → 查询编辑器 → 指纹库/知识库联动”的第一条可运行主链路。

## 已实现

- **第三方 FOFA 搜索**：接入 `fafaapi.info` 中转 API，支持查询、分页、结果字段解析。
- **安全 Key 管理**：API Key 只保存在 Electron 主进程；可用时通过系统 `safeStorage` 加密，不进入渲染层日志或构建产物。
- **串行限流**：搜索、统计与 AI 语法接口共用主进程队列，业务请求间隔约 3.1 秒。
- **主查看窗口**：按 IP 聚合结果卡片，展示标题、端口、协议、产品、Server、国家与站点图标。
- **当前页画像**：无需额外消耗额度，直接从当前页聚合产品、分类、国家、端口、Server 与协议 TOP 5。
- **查询编辑器**：底部停靠、条件拆分、包含/排除取反、一键加入一月内/排除云服务。
- **指纹库**：保存当前查询、收藏、编辑、搜索、删除、JSON 导入导出，并可一键载入或直接搜索。
- **知识库**：记录母厂/贴牌关系、Server、Title、文件夹与备注，可转成 FOFA 查询。
- **窗口协作**：左侧指纹库/知识库与中间结果区、底部查询编辑器联动；左右/下侧分栏可拖动调整。
- **标签页**：支持多搜索标签与父子关系标记，`Ctrl+N` 新建子标签，`Ctrl+Enter` 搜索。
- **本地持久化**：指纹库和知识库保存在渲染层 `localStorage`，重启应用后保留。

## 快速开始

```powershell
npm install
npm run dev
```

首次打开会提示配置第三方 API Key。也可以在 `https://fafaapi.info/fofa.html` 获取 Key 后，在应用右上角“配置数据源”中保存并验证。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发环境 |
| `npm run typecheck` | 检查主进程、预加载与渲染层类型 |
| `npm run build` | 类型检查并构建生产文件到 `out/` |
| `npm start` | 预览已构建的桌面应用 |
| `npm run build:dir` | 构建未打包的应用目录 |
| `npm run build:win` | 生成 Windows x64 NSIS 安装包 |

打包产物默认输出到 `release/<version>/`。

## 目录结构

```text
.
├─ src/
│  ├─ main/          # Electron 主进程、FOFA API 代理、Key 存储与限流队列
│  ├─ preload/       # 预加载脚本、类型化 IPC 桥接
│  ├─ shared/        # 主进程与渲染层共享类型
│  └─ renderer/      # React 工作台界面
├─ third-party-api/  # 第三方中转 API 逆向分析文档
├─ todo.md           # 产品规划
├─ build/            # 打包资源目录
├─ electron.vite.config.ts
├─ electron-builder.yml
└─ package.json
```

## 安全策略

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- 渲染层不接触 API Key 明文
- 外部链接只允许 `http/https` 并由系统浏览器打开
- 禁止页面内嵌 WebView

## 尚未实现

- 多人协作服务端、指纹共享与共用知识库
- 正式树状标签页管理（当前已记录父子关系，交互仍为横向标签）
- 内嵌浏览器内核与统一标签管理
- 官方 FOFA API 数据源切换
- 知识库图片附件与思维导图视图
- 云端同步、账号体系与冲突合并

## 打包图标

将 Windows 图标放到 `build/icon.ico` 即可自动使用。未提供图标时会使用 Electron 默认图标。
