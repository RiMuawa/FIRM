# FOFA 中转站 API 分析文档

> 分析对象：`https://fafaapi.info/fofa.html`
>
> 分析日期：2026-11-04（Asia/Shanghai）
>
> 说明：这是对页面前端实际请求逻辑和线上响应的逆向整理。该服务是第三方中转站，不是 FOFA 官方 API，接口、限额和稳定性可能随时变化。

## 1. 基本信息

| 项目 | 内容 |
| --- | --- |
| Base URL | `https://fafaapi.info` |
| 协议 | HTTPS |
| 数据格式 | JSON，UTF-8 |
| 鉴权方式 | 32 位十六进制 API Key，通过 `key` 参数传递 |
| 页面入口 | `https://fafaapi.info/fofa.html` |
| 主要接口 | 资产搜索、聚合统计、Host 聚合、AI 生成 FOFA 语法、Key 校验 |
| 辅助接口 | 公告、商店配置 |
| 缓存 | 响应头明确 `no-cache, no-store` |
| CORS | 会回显请求的 `Origin`；`OPTIONS` 预检实测为 405 |

> 不要把 API Key 写进前端代码、公开仓库、日志或截图。当前提供的 Key 已用于验证和少量实测，本文档不会保存明文 Key。

## 2. 先决条件与编码规则

### 2.1 API Key

- 格式：`^[a-fA-F0-9]{32}$`
- 每个业务请求都通过 query/form 参数 `key` 传递。
- 实测校验接口不消耗查询次数；搜索、统计、Host、AI 接口成功调用各消耗 1 次。
- 实测无效 Key 的搜索请求返回 HTTP 400：

```json
{"errmsg":"API Key不存在或已过期","error":true}
```

### 2.2 Base64 参数

页面中的 `aesEncrypt` 实际上不是 AES，而是 UTF-8 文本的 Base64：

```js
btoa(unescape(encodeURIComponent(text)))
```

需要编码的参数：

- 搜索接口的 `queryStr`
- 统计接口的 `q`
- Host 接口的 `ip`

Node.js：

```js
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
```

Python：

```python
import base64
b64 = base64.b64encode(text.encode('utf-8')).decode('ascii')
```

PowerShell：

```powershell
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
```

### 2.3 `fields`

`fields` 是逗号分隔的字段名，例如：

```text
ip,port,protocol,country_name,title,link
```

让 HTTP 客户端只编码一次即可。页面源码里存在先 `encodeURIComponent()` 再交给 jQuery 序列化的双重编码写法，不建议照搬；实测直接传逗号分隔字段可以正常工作。

### 2.4 `route` 与 `full`

- `route`：线路编号，页面提供 `1`、`2`、`3`、`4`，默认 `1`。
- 响应中的 `usedRoute` 可能与请求的 `route` 不同，例如请求 `route=1` 时返回 `usedRoute=6`。它是上游调度信息，业务码不需要依赖它。
- `full=false`：页面标注为“一年数据”，建议默认使用。
- `full=true`：页面标注为“全部数据”，可能返回更多历史数据，也更容易触发上游错误或更高消耗。

## 3. 统一响应约定

### 3.1 必须检查业务错误

服务可能返回 HTTP 200，但响应体仍是业务错误：

```json
{"errmsg":"FOFA官方返回的错误信息：\n[820000] 查询语法错误","error":true}
```

因此每次请求后都必须：

1. 检查 HTTP 状态码；
2. 解析 JSON；
3. 检查响应体 `error === true`；
4. 再读取业务数据。

不要只依赖 HTTP 状态码。

### 3.2 常见错误

| 场景 | 实测响应 |
| --- | --- |
| Key 不存在或过期 | HTTP 400，`{"errmsg":"API Key不存在或已过期","error":true}` |
| Key 校验失败 | HTTP 200，`{"valid":false}` |
| FOFA 查询语法错误 | HTTP 200，`error:true`，`errmsg` 内含官方错误码和原因 |
| 请求过于频繁 | `{"errmsg":"请求过于频繁，请3秒后再试","error":true}` |
| 上游异常 | `error:true`，`errmsg` 可能包含 501/502/504 或 FOFA 官方错误信息 |

### 3.3 频率限制

- 页面自身有 1 秒防抖，但实测服务端大约有 3 秒级限流。
- 建议客户端串行调用，两次业务请求之间至少间隔 3 秒，生产环境建议 3-5 秒。
- 遇到“请求过于频繁”时不要立即死循环重试，应指数退避。

### 3.4 配额字段

业务接口通常返回：

```json
{
  "newTodayRemaining": 193,
  "newTotalRemaining": 190
}
```

- `newTodayRemaining`：调用后当天剩余次数。
- `newTotalRemaining`：调用后总剩余次数。
- 应以服务端返回值为准，不要只在本地扣减。

## 4. API 清单

| 方法 | 路径 | 用途 | 是否消耗次数 |
| --- | --- | --- | --- |
| GET | `/fofaapi/v1/validate-key` | 校验 Key、查询有效期和余额 | 否（实测） |
| GET | `/fofaapi` | FOFA 资产搜索 | 是 |
| GET | `/fofaapi/stats` | FOFA 聚合统计 | 是 |
| GET | `/fofaapi/host` | Host 资产聚合 | 是 |
| POST | `/fofaapi/ai/query` | 自然语言生成 FOFA 语法 | 是 |
| GET | `/fofaapi/announcements` | 公告配置 | 否 |
| GET | `/fofaapi/shop` | 商店配置 | 否 |

## 5. Key 校验

### 请求

```http
GET /fofaapi/v1/validate-key?key=<32位API_KEY>
```

### 成功响应

```json
{
  "valid": true,
  "firstUsedAt": "2026-11-03 20:20:39",
  "expireTime": "2026-11-04 20:20:40",
  "todayRemaining": 200,
  "totalRemaining": 197
}
```

### 失败响应

无效 Key：

```json
{"valid":false}
```

页面逻辑会把 `valid=false` 当作“Key 验证失败”；如果没有 `errmsg`，应提示用户检查 Key 或是否过期。

### 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `valid` | boolean | Key 是否有效 |
| `firstUsedAt` | string | 首次使用时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `expireTime` | string | 到期时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `todayRemaining` | number | 当天剩余次数 |
| `totalRemaining` | number | 总剩余次数 |

## 6. 资产搜索

### 请求

```http
GET /fofaapi
```

| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `key` | 是 | string | 32 位 API Key |
| `queryStr` | 是 | string | FOFA 查询语法的 UTF-8 Base64 |
| `fields` | 是 | string | 逗号分隔的返回字段 |
| `page` | 是 | number | 页码，从 1 开始 |
| `size` | 是 | number | 每页条数；页面可选 10、100、200、500、1000、2000、5000、10000 |
| `route` | 否 | number | 线路 1-4，默认 1 |
| `full` | 否 | boolean string | `false`=一年数据，`true`=全部数据；建议 `false` |

### 查询语法编码示例

查询：

```text
ip="1.1.1.1"
```

Base64：

```text
aXA9IjEuMS4xLjEi
```

### 成功响应示例

```json
{
  "finalResults": [
    {
      "fields": {
        "protocol": "http",
        "port": "80",
        "ip": "1.1.1.1",
        "country_name": "澳大利亚",
        "link": "http://studentwifi.emu.edu.tr",
        "title": ""
      }
    }
  ],
  "newTodayRemaining": 199,
  "newTotalRemaining": 196,
  "size": 70190,
  "total": 70190,
  "error": false,
  "errmsg": null
}
```

### 响应字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `finalResults` | array | 当前页结果，每项形如 `{"fields": {...}}` |
| `data` | array | 兼容字段；页面会按 `finalResults || data || response` 回退 |
| `total` | number | 命中总数 |
| `size` | number | 实测与 `total` 相同，是命中总数，不是请求的每页条数 |
| `newTodayRemaining` | number | 本次调用后当天剩余次数 |
| `newTotalRemaining` | number | 本次调用后总剩余次数 |
| `error` | boolean | 业务错误标记 |
| `errmsg` | string/null | 业务错误说明 |

重要：响应中的 `size` 不是当前页条数。当前页条数是 `finalResults.length`。

### 支持的搜索字段

页面提供的字段如下：

```text
ip
port
protocol
country
country_name
region
city
longitude
latitude
asn
org
host
domain
os
server
icp
title
jarm
header
banner
cert
base_protocol
link
cert.issuer.org
cert.issuer.cn
cert.subject.org
cert.subject.cn
tls.ja3s
tls.version
cert.sn
cert.not_before
cert.not_after
cert.domain
status_code
header_hash
banner_hash
banner_fid
cname
lastupdatetime
product
product_category
```

字段返回在 `item.fields` 下。嵌套字段名同样使用点号，例如 `cert.issuer.org`。

### 常见查询语法

```text
ip="1.1.1.1"
domain="example.com"
port="443" && protocol="https"
title="登录" && country="CN"
server="nginx" && country="CN"
icon_hash="-123456789"
cert.subject.cn="example.com"
```

## 7. 聚合统计

### 请求

```http
GET /fofaapi/stats
```

| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `key` | 是 | string | 32 位 API Key |
| `q` | 是 | string | FOFA 查询语法的 UTF-8 Base64 |
| `fields` | 是 | string | 逗号分隔的统计字段 |
| `route` | 否 | number | 线路 1-4 |

### 支持的统计字段

```text
title
protocol
domain
port
os
server
country
asn
org
asset_type
fid
icp
```

### 成功响应示例

```json
{
  "lastupdatetime": "",
  "required_fpoints": 0,
  "query": "ip=\"1.1.1.1\"",
  "distinct": {
    "ip": 1,
    "ipc": 0,
    "title": 15
  },
  "error": false,
  "usedRoute": "6",
  "route": "6",
  "size": 70321,
  "newTotalRemaining": 195,
  "consumed_fpoint": 0,
  "time": 1207,
  "newTodayRemaining": 198,
  "aggs": {
    "port": [
      {"count": 36528, "name": "80", "detail": {}},
      {"count": 12974, "name": "53", "detail": {}},
      {"count": 6130, "name": "443", "detail": {}}
    ],
    "title": [
      {"count": 5265, "name": "403 Forbidden", "detail": {}},
      {"count": 11, "name": "301 Moved Permanently", "detail": {}}
    ]
  }
}
```

### 响应说明

| 字段 | 说明 |
| --- | --- |
| `query` | 服务端解码后的查询语法 |
| `aggs` | 按字段聚合的数组；每个元素含 `name`、`count`、`detail` |
| `distinct` | 若干字段的去重统计 |
| `size` | 该查询命中的资产总量 |
| `time` | 上游查询耗时，单位疑似毫秒 |
| `required_fpoints` / `consumed_fpoint` | F 点相关信息 |
| `usedRoute` / `route` | 实际使用线路 |

## 8. Host 聚合

### 请求

```http
GET /fofaapi/host
```

| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `key` | 是 | string | 32 位 API Key |
| `ip` | 是 | string | IP 或域名的 UTF-8 Base64 |
| `detail` | 否 | boolean | `false` 返回端口/协议摘要；`true` 返回端口详情 |
| `route` | 否 | number | 线路 1-4 |

页面只接受 IPv4 或普通域名；如果要传域名，同样需要 Base64。

### `detail=false` 响应示例

```json
{
  "product": ["CLOUDFLARE-产品"],
  "fromCache": true,
  "org": "Cloudflare, Inc.",
  "required_fpoints": 0,
  "ip": "1.1.1.1",
  "error": false,
  "country_code": "AU",
  "protocol": ["http", "https"],
  "update_time": "2026-11-01 19:00:00",
  "usedRoute": "5",
  "route": "5",
  "port": [80, 8080, 443, 2086],
  "domain": ["example.com"],
  "host": "1.1.1.1",
  "country_name": "Australia",
  "newTotalRemaining": 194,
  "consumed_fpoint": 0,
  "time": 1007,
  "category": ["Website Cloud Defense"],
  "asn": 13335,
  "newTodayRemaining": 197
}
```

### `detail=true` 响应示例

```json
{
  "org": "Cloudflare, Inc.",
  "required_fpoints": 0,
  "ip": "1.1.1.1",
  "error": false,
  "ports": [
    {
      "port": 443,
      "update_time": "2026-11-04 06:00:00",
      "protocol": "https",
      "products": [
        {
          "product": "CLOUDFLARE-产品",
          "category": "Website Cloud Defense",
          "level": 4,
          "sort_hard_code": 2,
          "company": "Cloudflare, Inc."
        }
      ]
    }
  ],
  "country_code": "AU",
  "update_time": "2026-11-04 10:00:00",
  "usedRoute": "6",
  "route": "6",
  "domain": ["example.com"],
  "host": "1.1.1.1",
  "country_name": "Australia",
  "newTotalRemaining": 193,
  "consumed_fpoint": 0,
  "time": 1517,
  "asn": 13335,
  "newTodayRemaining": 196
}
```

注意两种模式的字段名不同：

- `detail=false`：`port` 是数字数组，`protocol` 是字符串数组，`product` 是数组。
- `detail=true`：`ports` 是对象数组，每个端口下包含 `products` 数组。

## 9. AI 生成 FOFA 语法

### 请求

```http
POST /fofaapi/ai/query
Content-Type: application/x-www-form-urlencoded
```

| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `key` | 是 | string | 32 位 API Key |
| `question` | 是 | string | 自然语言需求，页面限制 200 字符 |

### 请求示例

```text
key=<API_KEY>&question=查询IP为1.1.1.1的资产
```

### 成功响应

```json
{
  "invalid": false,
  "syntax": "ip=\"1.1.1.1\"",
  "todayRemaining": 195,
  "error": false,
  "message": null,
  "totalRemaining": 192
}
```

### 无法生成或不是资产查询

```json
{
  "invalid": true,
  "syntax": "",
  "todayRemaining": 194,
  "error": false,
  "message": "仅支持生成FOFA资产查询语法",
  "totalRemaining": 191
}
```

该接口只负责生成语法，不会执行资产搜索。生成后仍需调用 `/fofaapi`。

## 10. 辅助接口

### 10.1 公告

```http
GET /fofaapi/announcements
```

响应中的 `announcements` 是 JSON 字符串，需要二次解析：

```json
{
  "announcements": "[{\"id\":3,\"content\":\"...\",\"type\":\"warning\",\"active\":true}]"
}
```

### 10.2 商店配置

```http
GET /fofaapi/shop
```

响应中的 `shop` 同样是 JSON 字符串，需要二次解析：

```json
{
  "shop": "{\"active\":true,\"packages\":[{\"name\":\"200次/日套餐\",\"items\":[\"...\"]}]}"
}
```

## 11. 可直接使用的调用示例

### 11.1 cURL / PowerShell

```powershell
$key = $env:FAFA_API_KEY
if (-not $key) { throw '请先设置 FAFA_API_KEY' }

$query = 'ip="1.1.1.1"'
$queryB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($query))

curl.exe -sS -G 'https://fafaapi.info/fofaapi' `
  --data-urlencode "key=$key" `
  --data-urlencode "queryStr=$queryB64" `
  --data-urlencode 'fields=ip,port,protocol,country_name,title,link' `
  --data-urlencode 'page=1' `
  --data-urlencode 'size=10' `
  --data-urlencode 'route=1' `
  --data-urlencode 'full=false'
```

### 11.2 Node.js / TypeScript

```ts
const BASE = 'https://fafaapi.info';
const key = process.env.FAFA_API_KEY;

if (!key) throw new Error('缺少 FAFA_API_KEY');

const b64 = (text: string): string =>
  Buffer.from(text, 'utf8').toString('base64');

type ApiError = { error: true; errmsg?: string | null };

async function requestJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  if (!res.ok) {
    const msg = (body as { errmsg?: string; message?: string }).errmsg
      || (body as { message?: string }).message
      || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if ((body as Partial<ApiError>).error === true) {
    throw new Error((body as ApiError).errmsg || 'FOFA API 业务错误');
  }

  return body as T;
}

async function searchFofa(query: string, page = 1, size = 10) {
  const url = new URL('/fofaapi', BASE);
  url.search = new URLSearchParams({
    key,
    queryStr: b64(query),
    fields: 'ip,port,protocol,country_name,title,link',
    page: String(page),
    size: String(size),
    route: '1',
    full: 'false',
  }).toString();

  return requestJson<{
    finalResults: Array<{ fields: Record<string, unknown> }>;
    total: number;
    size: number;
    newTodayRemaining: number;
    newTotalRemaining: number;
    error: boolean;
    errmsg: string | null;
  }>(url);
}

const result = await searchFofa('ip="1.1.1.1"', 1, 1);
console.log(result.finalResults, result.total);
```

### 11.3 Python

```python
import base64
import json
import os
import urllib.parse
import urllib.request

key = os.environ["FAFA_API_KEY"]
query = 'ip="1.1.1.1"'
query_b64 = base64.b64encode(query.encode("utf-8")).decode("ascii")

params = urllib.parse.urlencode({
    "key": key,
    "queryStr": query_b64,
    "fields": "ip,port,protocol,country_name,title,link",
    "page": 1,
    "size": 10,
    "route": 1,
    "full": "false",
})

url = "https://fafaapi.info/fofaapi?" + params
with urllib.request.urlopen(url, timeout=200) as response:
    body = json.load(response)

if body.get("error"):
    raise RuntimeError(body.get("errmsg") or "FOFA API error")

print(body["finalResults"])
```

## 12. 集成建议

1. **Key 只放在主进程或服务端**：当前应用是 Electron 项目，建议由主进程代理请求，不要下发到渲染进程或写入构建产物。
2. **随机/业务请求统一串行**：加全局 3 秒节流队列，避免触发服务端限流。
3. **统一错误处理**：同时检查 HTTP 状态、`error`、`valid`、`invalid`。
4. **不要重试语法错误**：FOFA 语法错误和无效 Key 重试没有意义，且实测错误查询也可能扣次数。
5. **查询前校验输入**：尽量在客户端先检查空查询、字段为空、Base64 编码是否正常。
6. **超时设置**：页面使用约 180-200 秒超时，实际业务建议 30-60 秒并支持取消。
7. **结果统计**：搜索响应用 `total ?? size` 作为总数，当前页数量使用 `finalResults.length`。
8. **Host 响应按 `detail` 分支解析**：`detail=false` 读 `port`，`detail=true` 读 `ports`。
9. **公告和商店配置需要二次 `JSON.parse`**。
10. **不要把 `route` 响应当成请求回显**：以 `usedRoute` 仅作诊断信息。

## 13. 本次实测记录

- Key 校验：有效。
- Key 首次使用：`2026-11-03 20:20:39`。
- Key 到期时间：`2026-11-04 20:20:40`。
- 初始总剩余次数：197。
- 资产搜索：成功返回结果，单次消耗 1 次。
- 聚合统计：成功返回 `aggs`，单次消耗 1 次。
- Host `detail=false`：成功返回摘要，单次消耗 1 次。
- Host `detail=true`：成功返回端口详情，单次消耗 1 次。
- AI 语法生成：成功返回 `ip="1.1.1.1"`，单次消耗 1 次。
- 无效查询语法：返回 HTTP 200 + `error:true`，并且实测扣除了 1 次。
- 快速连续查询：触发“请求过于频繁，请3秒后再试”。

- 实测结束时再次校验：todayRemaining=193，totalRemaining=190。

> 由于服务是第三方中转，以上结果只是 2026-11-04 的快照，不能保证长期稳定。
