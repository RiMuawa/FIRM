# FOFA 官方 API 实测文档

> 分析对象：`https://fofa.info/api/v1/*`
>
> 分析日期：2026-11-05（Asia/Shanghai）
>
> 说明：以下内容来自使用临时 Key 的线上实测（测完即销毁），响应结构为当日快照。官方文档站 `https://fofa.info/api` 为 SPA，需登录查看完整说明。

## 1. 基本信息

| 项目 | 内容 |
| --- | --- |
| Base URL | `https://fofa.info` |
| 协议 | HTTPS |
| 数据格式 | JSON，UTF-8 |
| 鉴权方式 | `key`（32 位十六进制）。官方文档写 `email` + `key`，**实测仅传 `key` 即可通过认证**；`email` 可选附带 |
| 计费 | F 点；`ip="1.1.1.1"` 单条查询实测 `consumed_fpoint: 0` |
| 限流 | 约 1 QPS（应用内按 1.2 秒间隔串行） |

> Key 只放在主进程，不要下发到渲染进程或写入构建产物。

## 2. 账号信息（免费）

### 请求

```http
GET /api/v1/info/my?key=<32位KEY>[&email=<邮箱>]
```

### 实测响应

```json
{
  "error": false,
  "email": "9****m",
  "username": "…",
  "category": "user",
  "fcoin": 0,
  "fofa_point": 25,
  "remain_free_point": 5000,
  "remain_api_query": -1,
  "remain_api_data": -1,
  "isvip": true,
  "vip_level": 2,
  "is_verified": false,
  "avatar": "https://nosec.org/missing.jpg",
  "message": "",
  "fofacli_ver": "4.0.3",
  "fofa_server": true,
  "expiration": "-"
}
```

| 字段 | 说明 |
| --- | --- |
| `fofa_point` / `remain_free_point` | 剩余 F 点 / 剩余免费 F 点 |
| `remain_api_query` / `remain_api_data` | API 查询与返回条数余量，`-1` 表示不限制 |
| `isvip` / `vip_level` | 会员状态与等级 |
| `expiration` | 会员到期时间，`"-"` 表示无 |

Key 无效时返回业务错误（`error:true` + `errmsg`），需按错误处理。

## 3. 资产搜索

### 请求

```http
GET /api/v1/search/all
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `key` | 是 | 32 位 API Key |
| `qbase64` | 是 | FOFA 查询语法的 UTF-8 Base64 |
| `fields` | 否 | 逗号分隔返回字段（默认 `host,ip,port`） |
| `size` | 否 | 每页条数，受会员等级限制（应用内中转沿用 200、官方上限 10000） |
| `page` | 否 | 页码，从 1 开始 |
| `full` | 否 | `false` 一年数据（默认），`true` 全部数据 |
| `email` | 否 | 可选，官方文档的配合字段 |

### 实测响应

```json
{
  "error": false,
  "consumed_fpoint": 0,
  "required_fpoints": 0,
  "size": 70430,
  "tip": "",
  "page": 1,
  "mode": "extended",
  "query": "ip=\"1.1.1.1\"",
  "results": [
    [
      "1.1.1.1", "2086", "http", "澳大利亚", "",
      "http://…:2086", "cloudflare", "CLOUDFLARE-产品", "网站安全监控系统",
      "streamlock.net", "Cloudflare, Inc.", "2026-11-05 09:00:00"
    ]
  ]
}
```

### 与中转站的关键差异

| | 官方 | 中转（fafaapi.info） |
| --- | --- | --- |
| 结果结构 | `results` 为**二维数组**，按 `fields` 顺序排列 | `finalResults[].fields` 对象 |
| 命中总数 | `size` | `total` |
| 配额 | 响应内无余额，需另调 `/api/v1/info/my`（免费） | 响应内 `newTodayRemaining` / `newTotalRemaining` |
| 业务错误 | HTTP 200 也可能 `error:true` + `errmsg` | 同样需要检查 |

应用主进程已把官方响应归一化为 `finalResults[].fields` 结构，渲染层无感知。

## 4. 集成说明（本仓库）

- 主进程 `src/main/fofa.ts` 同时实现官方与中转两个 provider，凭据相互独立，存储于 `userData/fofa-providers.json`（旧版 `fofa-api-key.json` 自动迁移为中转凭据）。
- 环境变量：官方 `FOFA_API_KEY`（可选 `FOFA_EMAIL`）；中转 `FAFA_API_KEY`。环境变量优先于本地存储。
- 限流：全业务串行队列，官方间隔 1.2 秒、中转 3.1 秒。
- 官方搜索成功后自动附带 `/api/v1/info/my` 的余额（失败不影响搜索结果）。
- 聚合统计与 AI 语法生成目前仅中转支持；官方对应能力未实测，调用会得到明确报错。
