import type { FofaResultItem, UsageStatsSnapshot } from '../../../shared/types'
import type { Fingerprint, KnowledgeEntry } from '../data'
import type { Preset } from '../query/editorModel'

/**
 * 设计复刻页演示数据。全部确定性生成（无随机），保证每次打开页面看到同一份界面，
 * 元素编号也因此跨会话稳定。
 */

const DAY = 24 * 60 * 60 * 1000

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

function dateStr(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * DAY)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 确定性哈希：返回 [0, 1)，同一入参永远同值 */
function hash01(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

export const demoLastQuery = 'app="Hikvision-综合安防管理平台" && country="CN"'

export const demoFingerprints: Fingerprint[] = [
  { id: 'fp-demo-01', name: '海康威视·综合安防管理平台', query: 'app="Hikvision-综合安防管理平台"', product: 'Hikvision', category: '视频监控', country: 'CN', server: '', title: '综合安防管理平台', vendor: '海康威视', model: 'iVMS-8700', note: '默认 admin/admin123，端口 8000。',
    folder: '摄像头', scope: 'personal', favorite: true, createdAt: isoDaysAgo(46), updatedAt: isoDaysAgo(3) },
  { id: 'fp-demo-02', name: '大华·DSS 安防平台', query: 'app="Dahua-ITS" || title="DSS7016"', product: 'Dahua', category: '视频监控', country: 'CN', server: '', title: 'DSS7016-D', vendor: '大华股份', model: 'DSS', note: '', folder: '摄像头', scope: 'personal', favorite: false, createdAt: isoDaysAgo(38), updatedAt: isoDaysAgo(8) },
  { id: 'fp-demo-03', name: '雄迈·嵌入式监控', query: 'app="XiongMai-Httpd" && protocol="http"', product: 'XiongMai', category: '视频监控', country: '', server: 'GoAhead-alphanum', title: 'NetSurveillance', vendor: '雄迈科技', model: '', note: '大量贴牌，参考知识库条目。', folder: '摄像头', scope: 'shared', favorite: true, createdAt: isoDaysAgo(30), updatedAt: isoDaysAgo(2) },
  { id: 'fp-demo-04', name: 'JAWS 视频服务器', query: 'app="JAWS" && port="80"', product: 'JAWS', category: '视频监控', country: '', server: 'JAWS/1.0', title: 'IP Camera', vendor: '', model: '', note: '', folder: '', scope: 'personal', favorite: false, createdAt: isoDaysAgo(27), updatedAt: isoDaysAgo(11) },
  { id: 'fp-demo-05', name: '工控·Modbus 暴露面', query: 'protocol="modbus" && country="CN"', product: '', category: '工控', country: 'CN', server: '', title: '', vendor: '', model: '', note: '仅用于测绘统计，避免直接触碰设备。', folder: '工控', scope: 'personal', favorite: false, createdAt: isoDaysAgo(21), updatedAt: isoDaysAgo(6) },
  { id: 'fp-demo-06', name: 'Zabbix 未授权面板', query: 'app="Zabbix" && title="Zabbix" && country="CN"', product: 'Zabbix', category: '运维监控', country: 'CN', server: 'nginx', title: 'Zabbix', vendor: '', model: '', note: '', folder: '工控', scope: 'personal', favorite: false, createdAt: isoDaysAgo(14), updatedAt: isoDaysAgo(5) },
  { id: 'fp-demo-07', name: 'TP-LINK 路由器后台', query: 'app="TP-LINK" && title="TP-LINK"', product: 'TP-LINK', category: '路由器', country: 'CN', server: 'mini_httpd', title: 'TP-LINK', vendor: '普联技术', model: '', note: '', folder: '路由器', scope: 'shared', favorite: false, createdAt: isoDaysAgo(9), updatedAt: isoDaysAgo(9) },
  { id: 'fp-demo-08', name: '海康海外部署', query: 'app="Hikvision" && country!="CN" && after="2026-09-01"', product: 'Hikvision', category: '视频监控', country: '', server: '', title: '', vendor: '海康威视', model: '', note: '海外测绘用，注意合规。', folder: '', scope: 'personal', favorite: false, createdAt: isoDaysAgo(4), updatedAt: isoDaysAgo(1) }
]

export const demoKnowledge: KnowledgeEntry[] = [
  { id: 'kn-demo-01', parent: '海康威视', name: '萤石云', server: '', title: 'EZOpen Simulator', note: '消费级贴牌，Web 端口多为 8000/554。', folder: '贴牌关系', scope: 'shared', updatedAt: isoDaysAgo(12) },
  { id: 'kn-demo-02', parent: '大华股份', name: '乐橙', server: '', title: 'Lechange Web', note: 'Imou 海外版 Title 带 "Imou" 字样。', folder: '贴牌关系', scope: 'shared', updatedAt: isoDaysAgo(15) },
  { id: 'kn-demo-03', parent: '雄迈科技', name: '各类小厂摄像头', server: 'GoAhead-alphanum', title: 'NetSurveillance', note: '默认口令 admin/空，海量贴牌（乔安、水星安防等）。', folder: '贴牌关系', scope: 'personal', updatedAt: isoDaysAgo(7) },
  { id: 'kn-demo-04', parent: '', name: '宇视科技', server: 'nginx', title: 'Uniview', note: 'Title 特征 "Uniview"，转查询：title="Uniview"。', folder: '', scope: 'personal', updatedAt: isoDaysAgo(19) },
  { id: 'kn-demo-05', parent: '', name: '中维世纪', server: '', title: 'Jovision', note: '云视通平台，Web 端多为 8100 端口。', folder: '', scope: 'personal', updatedAt: isoDaysAgo(25) }
]

export const demoPresets: Preset[] = [
  { id: 'pr-demo-01', name: '中亚地区摄像头', content: 'app="Hikvision" && (country="KZ" || country="UZ" || country="KG")', group: '地区', ts: isoDaysAgo(10), order: 0 },
  { id: 'pr-demo-02', name: '排除国内云厂商', content: 'org!="Alibaba" && org!="Tencent Cloud" && org!="Huawei Cloud"', group: '过滤', ts: isoDaysAgo(6), order: 1 },
  { id: 'pr-demo-03', name: '近一个月更新', content: 'after="2026-10-16"', group: '时间', ts: isoDaysAgo(3), order: 2 },
  { id: 'pr-demo-04', name: 'RTSP 明文流', content: 'protocol="rtsp" && country="CN"', group: '协议', ts: isoDaysAgo(1), order: 3 }
]

interface DemoProduct {
  product: string
  category: string
  titles: string[]
  servers: string[]
}

const DEMO_PRODUCTS: DemoProduct[] = [
  { product: 'Hikvision', category: '视频监控', titles: ['Hikvision-网络摄像机', '综合安防管理平台', 'iVMS-8700'], servers: ['nginx', ''] },
  { product: 'Dahua', category: '视频监控', titles: ['DSS7016-D', 'Dahua-网络摄像机', 'Web Client'], servers: ['lighttpd', ''] },
  { product: 'XiongMai', category: '视频监控', titles: ['NetSurveillance', 'DVR Web Service', 'IP Camera'], servers: ['GoAhead-alphanum'] },
  { product: 'TP-LINK', category: '路由器', titles: ['TP-LINK', '路由器管理页面', 'Wireless Router'], servers: ['mini_httpd'] },
  { product: 'JAWS', category: '视频监控', titles: ['IP Camera', 'JAWS Web Server'], servers: ['JAWS/1.0'] },
  { product: 'Zabbix', category: '运维监控', titles: ['Zabbix', '登录: Zabbix'], servers: ['nginx', 'Apache'] },
  { product: 'Weblogic', category: '中间件', titles: ['Error 404--Not Found', 'WebLogic Server Administration Console'], servers: ['Apache'] },
  { product: 'Tenda', category: '路由器', titles: ['腾达路由器管理', 'Tenda_路由器'], servers: ['mini_httpd'] }
]

const DEMO_PORT_PROTOCOL: Array<[string, string]> = [
  ['80', 'http'], ['443', 'https'], ['554', 'rtsp'], ['8000', 'http'], ['8080', 'http'],
  ['81', 'http'], ['88', 'http'], ['8081', 'http'], ['9000', 'http'], ['37777', 'http'],
  ['10000', 'http'], ['5060', 'sip']
]

const IP_PREFIXES = ['115.236', '115.238', '183.136', '61.164', '218.75', '59.110', '117.136', '223.104', '120.197', '202.107']
const COUNTRIES = ['中国', '中国', '中国', '中国', '中国', '美国', '新加坡', '越南', '日本']
const ORGS = ['中国电信', '中国联通', '中国移动', '阿里云', '腾讯云', '华为云', '']

/** 全量演示资产记录（确定性）。约 130+ 条、40 个独立 IP，按 size=50 可翻 3 页。 */
export function buildDemoRecords(): FofaResultItem[] {
  const records: FofaResultItem[] = []
  for (let ipIndex = 0; ipIndex < 40; ipIndex++) {
    const prefix = IP_PREFIXES[ipIndex % IP_PREFIXES.length]
    const ip = `${prefix}.${20 + ((ipIndex * 13 + 7) % 200)}.${2 + ((ipIndex * 29 + 11) % 240)}`
    const portCount = 2 + Math.floor(hash01(ipIndex * 17 + 3) * 3.4)
    const usedPorts = new Set<string>()
    for (let portIndex = 0; portIndex < portCount; portIndex++) {
      const pair = DEMO_PORT_PROTOCOL[Math.floor(hash01(ipIndex * 31 + portIndex * 7 + 1) * DEMO_PORT_PROTOCOL.length)]
      if (usedPorts.has(pair[0])) continue
      usedPorts.add(pair[0])
      const seed = ipIndex * 97 + portIndex * 13 + 5
      const meta = DEMO_PRODUCTS[Math.floor(hash01(seed) * DEMO_PRODUCTS.length)]
      const title = meta.titles[Math.floor(hash01(seed + 2) * meta.titles.length)]
      const server = meta.servers[Math.floor(hash01(seed + 3) * meta.servers.length)]
      const country = COUNTRIES[Math.floor(hash01(seed + 4) * COUNTRIES.length)]
      const org = ORGS[Math.floor(hash01(seed + 5) * ORGS.length)]
      const domain = hash01(seed + 6) > 0.85 ? `cam-${ipIndex}-${portIndex}.example.com` : ''
      records.push({
        fields: {
          ip,
          port: pair[0],
          protocol: pair[1],
          country_name: country,
          title,
          link: `http://${ip}:${pair[0]}`,
          server,
          product: meta.product,
          product_category: meta.category,
          domain,
          org,
          lastupdatetime: dateStr(Math.floor(hash01(seed + 7) * 60))
        }
      })
    }
  }
  return records
}

/** 初始使用统计（14 天 + 汇总），mock 层在其基础上累计当日搜索。 */
export function initialUsage(): UsageStatsSnapshot {
  const recent = Array.from({ length: 14 }, (_, index) => {
    const seed = index * 7 + 2
    return {
      date: dateStr(13 - index),
      searches: index % 5 === 4 ? 0 : Math.floor(hash01(seed) * 9),
      failedSearches: index % 6 === 5 ? 1 : 0,
      records: Math.floor(hash01(seed + 1) * 640)
    }
  })
  return {
    recent,
    today: { ...recent[recent.length - 1], searches: 6, failedSearches: 1, records: 287 },
    totalSearches: 184,
    totalRecords: 9635,
    trackedDays: 23
  }
}
