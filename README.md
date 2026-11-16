# Fofa Iot Ripository Manager

面向 IoT 信息搜集的桌面工作台，基于 **Electron + electron-vite + React + TypeScript**。

当前版本已完成 `todo.md` 中“第三方数据源 → 主查看窗口 → 查询编辑器 → 指纹库/知识库联动”的第一条可运行主链路。

## 已实现

- **双数据源**：支持 FOFA 官方 API（`fofa.info`，仅 Key 认证、F 点计费、免费查询剩余额度）与 `fafaapi.info` 第三方中转，可同时配置并在设置中一键切换；官方数组行结果自动归一化，主查看窗口无感知。
- **第三方 FOFA 搜索**：接入 `fafaapi.info` 中转 API，支持查询、分页、结果字段解析。
- **安全 Key 管理**：两个数据源的凭据只保存在 Electron 主进程；可用时通过系统 `safeStorage` 加密，不进入渲染层日志或构建产物；旧版单 Key 配置自动迁移。
- **串行限流**：搜索接口经主进程串行队列限流，官方数据源间隔约 1.2 秒、中转约 3.1 秒；也支持 `FOFA_API_KEY` / `FOFA_EMAIL` / `FAFA_API_KEY` 环境变量。
- **主查看窗口**：按 IP 聚合结果卡片，展示标题、端口、协议、产品、Server、国家与站点图标。
- **当前页画像**：无需额外消耗额度，直接从当前页聚合产品、分类、国家、端口、Server 与协议 TOP 5。
- **查询编辑器**：底部停靠、条件拆分、包含/排除取反、一键加入一月内/排除云服务。
- **指纹库**：保存当前查询、收藏、编辑、搜索、删除、JSON 导入导出，并可一键载入或直接搜索。
- **知识库**：记录母厂/贴牌关系、Server、Title、文件夹与备注，可转成 FOFA 查询。
- **窗口协作**：左侧指纹库/知识库与中间结果区、底部查询编辑器联动；左右/下侧分栏可拖动调整。
- **标签页**：支持多搜索标签与父子关系标记，`Ctrl+N` 新建子标签，`Ctrl+Enter` 搜索。
- **本地持久化**：指纹库和知识库保存在渲染层 `localStorage`，重启应用后保留。
- **使用统计**：主进程在查询链路自动记录当日查询次数、成功/失败与数据量（本地按天存储，保留 180 天），活动栏「统计」页可查看近 14 天趋势。

## 快速开始

```powershell
npm install
npm run dev
```

首次打开会提示配置数据源。可以在 FOFA 官方（`https://fofa.info/userInfo` → 扩展接口）或 `https://fafaapi.info/fofa.html` 获取 Key 后，在应用右上角“配置数据源”中保存、验证并切换；两者可同时配置。

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

## 设计复刻页（Design Replica）

面向设计评审的辅助工具：一个与主应用**视觉与交互完全一致**的纯网页，复用全部真实 React 组件、mock 掉 Electron 数据层，并为每个语义元素（按钮 / 输入 / 图标 / 文本 / 徽章）分配分层编号，右键即可查看，内置映射表面板双向联动。

```powershell
npm run dev
# 浏览器打开 http://127.0.0.1:5173/design.html（Electron 窗口仍加载主应用 index 页）
```

- **编号**：`区域.路径.元素` 的可读路径（如 `titlebar.btn.close`、`viewer.asset-card-1.asset-badges.port-badge-2`），由 DOM 结构确定性推导，跨会话稳定；高频元素有手工别名。
- **右键查看**：检视模式开启时右键任意元素弹出编号卡片（类型 / 文本 / 可见性），点击编号复制，可一键在映射表中定位；关闭检视模式则恢复浏览器默认右键。
- **映射表**：右侧可开合面板，按区域分组实时列出全部元素，支持搜索与类型过滤；点击行滚动定位并在页面中闪烁高亮，条件元素（弹窗、浮层、toast、加载/错误态）出现即自动入表。
- **状态切换器**：工具条可将下一次搜索强制为 正常 / 空结果 / 加载中 / 错误 四种状态，也可一键打开设置、预设管理、布局菜单、统计页等界面状态，方便检视所有 UI 分支。
- **降级行为**：内嵌浏览器渲染占位页（地址栏 / 前进后退 / 加载进度真实可用）；窗口最小化 / 最大化 / 关闭与外部链接会被拦截并给出提示。
- **数据隔离**：复刻页所有持久化走 `design:` 前缀的 localStorage 命名空间，与主应用互不污染；首次打开自动播种演示数据（指纹 / 知识 / 预设 / 121 条 FOFA 结果）。

构建产物为 `out/renderer/design.html`（与 index 并列，资源相对引用），任意静态服务器指向 `out/renderer` 即可访问。

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
- 聚合统计（官方 `/api/v1/aggs`、中转 stats 接口）与 Host 聚合
- 知识库图片附件与思维导图视图
- 云端同步、账号体系与冲突合并

## 打包图标

将 Windows 图标放到 `build/icon.ico` 即可自动使用。未提供图标时会使用 Electron 默认图标。
