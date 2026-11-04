import { formatDate, oneMonthAgo } from '../data'

export type JoinMode = '&&' | '||'
export type CompareOp = '=' | '==' | '!='

export interface QueryRow {
  op: CompareOp
  value: string
}

export interface FieldCard {
  kind: 'field'
  field: string
  join: JoinMode
  rows: QueryRow[]
}

export interface RawCard {
  kind: 'raw'
  raw: string
}

export type QueryCard = FieldCard | RawCard

export interface Conflict {
  type: 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3' | 'B4'
  msg: string
}

export interface CompletionContext {
  kind: 'field' | 'value' | 'op' | 'join' | null
  field?: string
  token: string
  quoted?: boolean
  atClose?: boolean
}

export const EDITOR_FIELDS = [
  'after', 'app', 'asn', 'base_protocol', 'banner', 'banner_fid', 'banner_hash', 'before', 'body',
  'body_hash', 'category', 'cert', 'cert.domain', 'cert.is_equal', 'cert.is_expired', 'cert.is_match',
  'cert.is_valid', 'cert.issuer', 'cert.issuer.cn', 'cert.issuer.org', 'cert.not_after.after',
  'cert.not_after.before', 'cert.not_before.after', 'cert.not_before.before', 'cert.sn', 'cert.subject',
  'cert.subject.cn', 'cert.subject.org', 'city', 'cloud_name', 'cname', 'cname_domain', 'country', 'domain',
  'fid', 'header', 'header_hash', 'host', 'icp', 'icon_hash', 'ip', 'is_cloud', 'is_domain', 'is_fraud',
  'is_honeypot', 'is_ipv6', 'jarm', 'js_md5', 'js_name', 'org', 'os', 'port', 'product', 'product.version',
  'protocol', 'region', 'sdk_hash', 'server', 'status_code', 'title', 'tls.ja3s', 'tls.version', 'type'
] as const

const AC_BOOLEAN_FIELDS = new Set([
  'is_cloud', 'is_cloude', 'is_domain', 'is_fraud', 'is_honeypot', 'is_ipv6', 'cert.is_equal',
  'cert.is_expired', 'cert.is_match', 'cert.is_valid'
])

export const PROTOCOL_VALUES = [
  'http', 'https', 'ssh', 'ftp', 'sftp', 'telnet', 'smtp', 'pop3', 'imap', 'rdp', 'vnc', 'snmp', 'mysql',
  'redis', 'mongodb', 'memcached', 'elasticsearch', 'rabbitmq', 'kafka', 'zookeeper', 'nfs', 'smb', 'ldap',
  'ldaps', 'dns', 'socks5', 'socks4', 'rtsp', 'onvif', 'bacnet', 'modbus', 'mqtt', 'amqp', 'svn', 'ipp', 'mms'
]

const CATEGORY_VALUES = ['路由器', '视频监控', '交换机', 'ADSL', '防火墙', '打印机', '其他网络设备']

const COUNTRY_HEAD = 'CN 中国,US 美国,HK 香港,TW 台湾,JP 日本,KR 韩国,SG 新加坡,DE 德国,FR 法国,GB 英国,'
  + 'RU 俄罗斯,CA 加拿大,AU 澳大利亚,NL 荷兰,IN 印度,BR 巴西,VN 越南,TH 泰国,MY 马来西亚,ID 印度尼西亚,'
  + 'PH 菲律宾,IT 意大利,ES 西班牙,CH 瑞士,SE 瑞典,AT 奥地利,PL 波兰,UA 乌克兰,TR 土耳其,IR 伊朗,'
  + 'KP 朝鲜,KZ 哈萨克斯坦,SA 沙特阿拉伯,AE 阿联酋,IL 以色列,EG 埃及,ZA 南非,MX 墨西哥,AR 阿根廷'

const COUNTRY_REST = 'AD 安道尔,AF 阿富汗,AG 安提瓜和巴布达,AI 安圭拉,AL 阿尔巴尼亚,AM 亚美尼亚,AO 安哥拉,'
  + 'AQ 南极洲,AS 美属萨摩亚,AW 阿鲁巴,AX 奥兰群岛,AZ 阿塞拜疆,BA 波黑,BB 巴巴多斯,BD 孟加拉国,BE 比利时,'
  + 'BF 布基纳法索,BG 保加利亚,BH 巴林,BI 布隆迪,BJ 贝宁,BL 圣巴泰勒米,BM 百慕大,BN 文莱,BO 玻利维亚,'
  + 'BQ 荷属加勒比区,BS 巴哈马,BT 不丹,BV 布韦岛,BW 博茨瓦纳,BY 白俄罗斯,BZ 伯利兹,CC 科科斯群岛,'
  + 'CD 刚果（金）,CF 中非,CG 刚果（布）,CI 科特迪瓦,CK 库克群岛,CL 智利,CM 喀麦隆,CO 哥伦比亚,'
  + 'CR 哥斯达黎加,CU 古巴,CV 佛得角,CW 库拉索,CX 圣诞岛,CY 塞浦路斯,CZ 捷克,DJ 吉布提,DK 丹麦,'
  + 'DM 多米尼克,DO 多米尼加,DZ 阿尔及利亚,EC 厄瓜多尔,EE 爱沙尼亚,EH 西撒哈拉,ER 厄立特里亚,'
  + 'ET 埃塞俄比亚,FI 芬兰,FJ 斐济,FK 福克兰群岛,FM 密克罗尼西亚,FO 法罗群岛,GA 加蓬,GD 格林纳达,'
  + 'GE 格鲁吉亚,GF 法属圭亚那,GG 根西岛,GH 加纳,GI 直布罗陀,GL 格陵兰,GM 冈比亚,GN 几内亚,'
  + 'GP 瓜德罗普,GQ 赤道几内亚,GR 希腊,GS 南乔治亚和南桑威奇,GT 危地马拉,GU 关岛,GW 几内亚比绍,'
  + 'GY 圭亚那,HM 赫德岛,HN 洪都拉斯,HR 克罗地亚,HT 海地,HU 匈牙利,IE 爱尔兰,IM 马恩岛,'
  + 'IO 英属印度洋领地,IQ 伊拉克,IS 冰岛,JE 泽西岛,JM 牙买加,JO 约旦,KE 肯尼亚,KG 吉尔吉斯斯坦,'
  + 'KH 柬埔寨,KI 基里巴斯,KM 科摩罗,KN 圣基茨和尼维斯,KW 科威特,KY 开曼群岛,LA 老挝,LB 黎巴嫩,'
  + 'LC 圣卢西亚,LI 列支敦士登,LK 斯里兰卡,LR 利比里亚,LS 莱索托,LT 立陶宛,LU 卢森堡,LV 拉脱维亚,'
  + 'LY 利比亚,MA 摩洛哥,MC 摩纳哥,MD 摩尔多瓦,ME 黑山,MF 法属圣马丁,MG 马达加斯加,MH 马绍尔群岛,'
  + 'MK 北马其顿,ML 马里,MM 缅甸,MN 蒙古,MO 澳门,MP 北马里亚纳群岛,MQ 马提尼克,MR 毛里塔尼亚,'
  + 'MS 蒙特塞拉特,MT 马耳他,MU 毛里求斯,MV 马尔代夫,MW 马拉维,MZ 莫桑比克,NA 纳米比亚,'
  + 'NC 新喀里多尼亚,NE 尼日尔,NF 诺福克岛,NG 尼日利亚,NI 尼加拉瓜,NO 挪威,NP 尼泊尔,NR 瑙鲁,'
  + 'NU 纽埃,NZ 新西兰,OM 阿曼,PA 巴拿马,PE 秘鲁,PF 法属波利尼西亚,PG 巴布亚新几内亚,PK 巴基斯坦,'
  + 'PM 圣皮埃尔和密克隆,PN 皮特凯恩群岛,PR 波多黎各,PS 巴勒斯坦,PT 葡萄牙,PW 帕劳,PY 巴拉圭,'
  + 'QA 卡塔尔,RE 留尼汪,RO 罗马尼亚,RS 塞尔维亚,RW 卢旺达,SB 所罗门群岛,SC 塞舌尔,SD 苏丹,'
  + 'SH 圣赫勒拿,SI 斯洛文尼亚,SJ 斯瓦尔巴和扬马延,SK 斯洛伐克,SL 塞拉利昂,SM 圣马力诺,SN 塞内加尔,'
  + 'SO 索马里,SR 苏里南,SS 南苏丹,ST 圣多美和普林西比,SV 萨尔瓦多,SX 荷属圣马丁,SY 叙利亚,'
  + 'SZ 斯威士兰,TC 特克斯和凯科斯群岛,TD 乍得,TF 法属南部领地,TG 多哥,TJ 塔吉克斯坦,TK 托克劳,'
  + 'TL 东帝汶,TM 土库曼斯坦,TN 突尼斯,TO 汤加,TT 特立尼达和多巴哥,TV 图瓦卢,TZ 坦桑尼亚,'
  + 'UG 乌干达,UM 美属太平洋岛屿,UY 乌拉圭,UZ 乌兹别克斯坦,VA 梵蒂冈,VC 圣文森特和格林纳丁斯,'
  + 'VE 委内瑞拉,VG 英属维尔京群岛,VI 美属维尔京群岛,VU 瓦努阿图,WF 瓦利斯和富图纳,WS 萨摩亚,'
  + 'YE 也门,YT 马约特,ZM 赞比亚,ZW 津巴布韦'

export const COUNTRY_VALUES: string[] = []
export const COUNTRY_NAMES: Record<string, string> = {}
for (const pair of `${COUNTRY_HEAD},${COUNTRY_REST}`.split(',')) {
  const split = pair.indexOf(' ')
  const code = pair.slice(0, split)
  COUNTRY_VALUES.push(code)
  COUNTRY_NAMES[code] = pair.slice(split + 1)
}

const REGION_VALUES = [
  '北京', '广东', '浙江', '江苏', '上海', '山东', '河南', '湖北', '福建', '四川', '河北', '安徽', '辽宁',
  '陕西', '湖南', '重庆', '江西', '云南', '天津', '广西', '山西', '吉林', '黑龙江', '贵州', '甘肃', '内蒙古',
  '新疆', '海南', '宁夏', '青海', '西藏', '台湾', '香港', '澳门'
]

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function splitTop(query: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let current = ''
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index]
    if (inString) {
      current += char
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      current += char
      continue
    }
    if (char === '(') {
      depth += 1
      current += char
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }
    if (depth === 0 && char === '&' && query[index + 1] === '&') {
      if (current.trim()) parts.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export function splitOrTop(query: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let current = ''
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index]
    if (inString) {
      current += char
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      current += char
      continue
    }
    if (char === '(') {
      depth += 1
      current += char
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }
    if (depth === 0 && char === '|' && query[index + 1] === '|') {
      if (current.trim()) parts.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export function stripWrapParens(input: string): string {
  let value = input.trim()
  while (value.startsWith('(') && value.endsWith(')')) {
    let depth = 0
    let inString = false
    let wraps = true
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index]
      if (inString) {
        if (char === '"') inString = false
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '(') depth += 1
      else if (char === ')') {
        if (depth > 0) depth -= 1
        if (depth === 0 && index < value.length - 1) {
          wraps = false
          break
        }
      }
    }
    if (!wraps || depth !== 0) break
    value = value.slice(1, -1).trim()
  }
  return value
}

export function balanceParens(input: string): string {
  let output = ''
  let inString = false
  let opens = 0
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (inString) {
      output += char
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      output += char
      continue
    }
    if (char === '(') {
      opens += 1
      output += char
      continue
    }
    if (char === ')') {
      if (opens > 0) {
        opens -= 1
        output += char
      }
      continue
    }
    output += char
  }
  return output + ')'.repeat(opens)
}

export function parseCondOne(input: string): { field: string; op: CompareOp | ''; value: string } | null {
  const value = input.trim()
  const keyword = /^"([^"]*)"$/.exec(value)
  if (keyword) return { field: '', op: '', value: keyword[1] }
  const match = /^([A-Za-z_][\w.]*)\s*(==|!=|=)\s*([\s\S]*)$/.exec(value)
  if (!match) return null
  let parsed = match[3].trim()
  if (parsed.length >= 2 && parsed.startsWith('"') && parsed.endsWith('"')) parsed = parsed.slice(1, -1)
  return { field: match[1], op: match[2] as CompareOp, value: parsed }
}

export function parseQueryToCards(query: string): QueryCard[] {
  const cards: QueryCard[] = []
  const byField = new Map<string, FieldCard>()

  const addSegment = (segment: string): void => {
    const alternatives = splitOrTop(stripWrapParens(segment)).filter(Boolean)
    if (!alternatives.length) return
    if (alternatives.length === 1) {
      const row = parseCondOne(alternatives[0])
      if (!row) {
        const children = splitTop(stripWrapParens(segment))
        if (children.length > 1) {
          children.forEach(addSegment)
          return
        }
        cards.push({ kind: 'raw', raw: segment })
        return
      }
      const condition = { op: row.op as CompareOp, value: row.value }
      if (!row.field) {
        cards.push({ kind: 'field', field: '', join: '&&', rows: [condition] })
        return
      }
      const key = row.field.toLowerCase()
      const existing = byField.get(key)
      if (existing) existing.rows.push(condition)
      else {
        const card: FieldCard = { kind: 'field', field: row.field, join: '&&', rows: [condition] }
        byField.set(key, card)
        cards.push(card)
      }
      return
    }

    const rows = alternatives.map((alternative) => parseCondOne(alternative))
    if (rows.every((row) => row?.field && row.field.toLowerCase() === rows[0]?.field?.toLowerCase())) {
      cards.push({
        kind: 'field',
        field: rows[0]!.field,
        join: '||',
        rows: rows.map((row) => ({ op: row!.op as CompareOp, value: row!.value }))
      })
    } else {
      cards.push({ kind: 'raw', raw: segment })
    }
  }

  for (const part of splitTop(balanceParens(String(query || '').trim()))) {
    const peeled = stripWrapParens(part)
    const segments = splitTop(peeled)
    segments.forEach((segment) => {
      const before = cards.length
      addSegment(segment)
      if (peeled !== part && segments.length === 1 && cards.length === before + 1) {
        const last = cards[before]
        if (last?.kind === 'raw') last.raw = part
      }
    })
  }
  return cards
}

export function cardRowQuery(card: FieldCard, row: QueryRow): string {
  const value = String(row.value ?? '').replace(/^"+|"+$/g, '')
  if (!card.field) return value ? `"${value}"` : ''
  return value === '' ? '' : `${card.field}${row.op}"${value}"`
}

export function cardToQuery(card: QueryCard): string {
  if (card.kind === 'raw') return card.raw.trim()
  const rows = card.rows.map((row) => cardRowQuery(card, row)).filter(Boolean)
  return rows.join(card.join === '||' ? ' || ' : ' && ')
}

export function cardsToQuery(cards: QueryCard[]): string {
  const parts: string[] = []
  for (const card of cards) {
    if (card.kind === 'raw') {
      if (card.raw.trim()) parts.push(card.raw.trim())
      continue
    }
    const rows = card.rows.map((row) => cardRowQuery(card, row)).filter(Boolean)
    if (!rows.length) continue
    if (rows.length > 1 && card.join === '||') parts.push(`(${rows.join(' || ')})`)
    else parts.push(rows.join(' && '))
  }
  return parts.join(' && ')
}

export function mergeCards(destination: QueryCard[], incoming: QueryCard[]): QueryCard[] {
  const result = destination.map((card) => card.kind === 'raw' ? { ...card } : { ...card, rows: card.rows.map((row) => ({ ...row })) })
  for (const incomingCard of incoming) {
    if (incomingCard.kind === 'raw') {
      result.push({ ...incomingCard })
      continue
    }
    const target = result.find((card) => card.kind === 'field'
      && card.field.toLowerCase() === incomingCard.field.toLowerCase()
      && card.join === incomingCard.join) as FieldCard | undefined
    if (target) {
      for (const row of incomingCard.rows) {
        if (!target.rows.some((existing) => existing.op === row.op && existing.value === row.value)) {
          target.rows.push({ ...row })
        }
      }
    } else {
      result.push({ ...incomingCard, rows: incomingCard.rows.map((row) => ({ ...row })) })
    }
  }
  return result
}

export function dedupeQuery(query: string): string {
  const cards = parseQueryToCards(query)
  const hasPositiveProduct = cards.some((card) => card.kind === 'field'
    && card.field.toLowerCase() === 'product'
    && card.rows.some((row) => row.op === '=' || row.op === '=='))
  const output: QueryCard[] = []
  for (const card of cards) {
    if (card.kind === 'raw' || !card.field || card.join === '||') {
      output.push(card)
      continue
    }
    if (card.field.toLowerCase() === 'category' && hasPositiveProduct) continue
    const positives = card.rows.filter((row) => row.op !== '!=' && row.value !== '-')
    if (positives.length) {
      output.push({ ...card, rows: [positives[positives.length - 1]] })
    } else {
      const seen = new Set<string>()
      const rows = card.rows.filter((row) => {
        if (row.value === '-') return false
        const key = `${row.op}${row.value}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (rows.length) output.push({ ...card, rows })
    }
  }
  return cardsToQuery(output)
}

export function toggleQuickCondition(query: string, kind: 'month' | 'cloud'): string {
  const cards = parseQueryToCards(query)
  const matches = (card: QueryCard): boolean => card.kind === 'field' && (kind === 'month'
    ? card.field.toLowerCase() === 'after'
    : card.field.toLowerCase() === 'is_cloud' || card.field.toLowerCase() === 'is_cloude')
  const filtered = cards.filter((card) => !matches(card))
  if (filtered.length !== cards.length) return cardsToQuery(filtered)
  cards.push({
    kind: 'field',
    field: kind === 'month' ? 'after' : 'is_cloud',
    join: '&&',
    rows: [{ op: '=', value: kind === 'month' ? oneMonthAgo() : 'false' }]
  })
  return cardsToQuery(cards)
}

export function hasQuickCondition(query: string, kind: 'month' | 'cloud'): boolean {
  return parseQueryToCards(query).some((card) => card.kind === 'field' && (kind === 'month'
    ? card.field.toLowerCase() === 'after'
    : card.field.toLowerCase() === 'is_cloud' || card.field.toLowerCase() === 'is_cloude'))
}

const SINGLE_FIELDS = new Set([
  'after', 'asn', 'base_protocol', 'before', 'cert.is_equal', 'cert.is_expired', 'cert.is_match',
  'cert.is_valid', 'city', 'country', 'icon_hash', 'ip', 'is_cloud', 'is_cloude', 'is_domain', 'is_fraud',
  'is_honeypot', 'is_ipv6', 'org', 'port', 'protocol', 'region', 'status_code', 'type'
])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function detectConflicts(query: string): Conflict[] {
  const output: Conflict[] = []
  const push = (type: Conflict['type'], msg: string): void => {
    if (!output.some((item) => item.type === type && item.msg === msg)) output.push({ type, msg })
  }

  const groups: Array<Array<{ f: string; op: CompareOp; v: string }>> = []
  const visit = (input: string): void => {
    const peeled = stripWrapParens(input)
    const children = splitTop(peeled)
    if (children.length > 1) {
      children.forEach(visit)
      return
    }
    const members: Array<{ f: string; op: CompareOp; v: string }> = []
    for (const alternative of splitOrTop(peeled)) {
      const row = parseCondOne(alternative)
      if (row?.field) members.push({ f: row.field.toLowerCase(), op: row.op as CompareOp, v: String(row.value) })
    }
    if (members.length) groups.push(members)
  }
  for (const segment of splitTop(balanceParens(String(query || '').trim()))) visit(segment)

  for (const members of groups) {
    if (members.length < 2) continue
    const fields = [...new Set(members.map((member) => member.f))]
    if (fields.length > 1) push('B3', `或组混用多个字段（${fields.join(' / ')}）：对组内成员排除/取反时语义可能反直觉`)
    else if (members.some((member) => member.op === '!=') && members.some((member) => member.op !== '!=')) {
      push('B4', `${fields[0]} 或组内正负条件混用（多半是就地取反的产物，组约束可能形同虚设）`)
    }
    const seen = new Map<string, { f: string; v: string; ops: Set<CompareOp>; count: number }>()
    for (const member of members) {
      const key = member.f + member.v.toLowerCase()
      const entry = seen.get(key) || { f: member.f, v: member.v, ops: new Set<CompareOp>(), count: 0 }
      entry.ops.add(member.op)
      entry.count += 1
      seen.set(key, entry)
    }
    for (const entry of seen.values()) {
      if (entry.ops.size > 1) push('B2', `${entry.f}="${entry.v}" 以 ${[...entry.ops].join(' / ')} 两种写法并存（等价冗余）`)
      else if (entry.count > 1) push('B1', `或组内重复成员 ${entry.f}="${entry.v}"`)
    }
  }

  const byField = new Map<string, { singles: Array<{ v: string; op: CompareOp }>; orSets: Array<Set<string>> }>()
  const fieldState = (field: string): { singles: Array<{ v: string; op: CompareOp }>; orSets: Array<Set<string>> } => {
    if (!byField.has(field)) byField.set(field, { singles: [], orSets: [] })
    return byField.get(field)!
  }
  for (const members of groups) {
    if (members.length === 1) fieldState(members[0].f).singles.push({ v: members[0].v.toLowerCase(), op: members[0].op })
    else if (new Set(members.map((member) => member.f)).size === 1 && members.every((member) => member.op !== '!=')) {
      fieldState(members[0].f).orSets.push(new Set(members.map((member) => member.v.toLowerCase())))
    }
  }

  for (const [field, state] of byField) {
    const positives = state.singles.filter((single) => single.op !== '!=')
    const negatives = state.singles.filter((single) => single.op === '!=').map((single) => single.v)
    const opsByValue = new Map<string, Set<CompareOp>>()
    for (const single of positives) {
      if (!opsByValue.has(single.v)) opsByValue.set(single.v, new Set<CompareOp>())
      opsByValue.get(single.v)!.add(single.op)
    }
    for (const [value, ops] of opsByValue) {
      if (ops.size > 1) push('B2', `${field}="${value}" 以 ${[...ops].join(' / ')} 两种写法并存（等价冗余）`)
    }
    if (!SINGLE_FIELDS.has(field)) {
      for (const negative of negatives) if (opsByValue.has(negative)) push('A1', `${field} 的正条件与排除条件互斥，结果恒空`)
      continue
    }
    let intersection: Set<string> | null = null
    for (const value of opsByValue.keys()) {
      intersection = intersection === null ? new Set([value]) : (intersection.has(value) ? intersection : new Set())
    }
    for (const set of state.orSets) {
      intersection = intersection === null ? set : new Set([...intersection].filter((value) => set.has(value)))
    }
    if (intersection === null) continue
    if (!intersection.size) {
      push('A2', `${field} 的多个取值互相矛盾（单值字段只能取一个值），结果恒空`)
      continue
    }
    for (const negative of negatives) intersection.delete(negative)
    if (!intersection.size) push('A1', `${field} 的正条件与排除条件互斥，结果恒空`)
  }

  const after = byField.get('after')
  const before = byField.get('before')
  if (after && before) {
    const a = after.singles.find((single) => single.op !== '!=' && DATE_RE.test(single.v))
    const b = before.singles.find((single) => single.op !== '!=' && DATE_RE.test(single.v))
    if (a && b && a.v >= b.v) push('A3', `after="${a.v}" 不早于 before="${b.v}"，时间区间为空`)
  }
  return output
}

export function resolveBuiltinDates(query: string): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const resolvedYesterday = formatDate(yesterday)
  const resolvedMonth = oneMonthAgo()
  return query.replace(/((?:after|before)\s*={1,2}(?!=)\s*")([^"]*)(")/g, (_match, prefix: string, value: string, suffix: string) => (
    prefix + value.replace(/yesterday/gi, resolvedYesterday).replace(/lastmonth/gi, resolvedMonth) + suffix
  ))
}

export function valueCandidates(field: string): string[] {
  const normalized = String(field || '').toLowerCase()
  if (AC_BOOLEAN_FIELDS.has(normalized)) return ['true', 'false']
  if (normalized === 'protocol') return [...PROTOCOL_VALUES].sort()
  if (normalized === 'after' || normalized === 'before') return ['YESTERDAY', 'LastMonth', formatDate(), oneMonthAgo()]
  if (normalized === 'category') return CATEGORY_VALUES.slice()
  if (normalized === 'country') return COUNTRY_VALUES.slice()
  if (normalized === 'region') return REGION_VALUES.slice()
  return []
}

export function valueLabel(field: string, value: string): string {
  if (field.toLowerCase() !== 'country') return ''
  return COUNTRY_NAMES[value.toUpperCase()] || ''
}

export function textCompleteContext(text: string, caret: number): CompletionContext {
  const before = text.slice(0, caret)
  let match = /([A-Za-z_][\w.]*)\s*(==|=|!=)\s*"([^"]*)$/.exec(before)
  if (match) {
    if (match[3] === '' && !/([A-Za-z_][\w.]*)\s*(==|=|!=)\s*"$/.test(before)) return { kind: null, token: '' }
    return { kind: 'value', field: match[1], token: match[3], quoted: true, atClose: text.charAt(caret) === '"' }
  }
  match = /(?:^|[^A-Za-z_.])([A-Za-z_][\w.]*)\s*(==|=|!=)\s*([^\s"()&|]*)$/.exec(before)
  if (match) return { kind: 'value', field: match[1], token: match[3], quoted: false, atClose: false }
  match = /(?:^|[^A-Za-z_.])([A-Za-z_][\w.]*)$/.exec(before)
  if (match && (EDITOR_FIELDS as readonly string[]).includes(match[1].toLowerCase())) {
    return { kind: 'op', field: match[1], token: match[1] }
  }
  if (before.endsWith('&') && !before.endsWith('&&')) return { kind: 'join', token: '&' }
  if (before.endsWith('|') && !before.endsWith('||')) return { kind: 'join', token: '|' }
  match = /([A-Za-z_][\w.]*)$/.exec(before)
  if (match?.[1]) return { kind: 'field', token: match[1] }
  return { kind: null, token: '' }
}

export function completeCandidates(context: CompletionContext): string[] {
  if (!context.kind) return []
  const token = String(context.token || '')
  const lower = (value: string): string => value.toLowerCase()
  if (context.kind === 'field') {
    if (!token) return []
    return EDITOR_FIELDS.filter((field) => field !== token && lower(field).startsWith(lower(token)))
  }
  if (context.kind === 'value') {
    const suffix = context.quoted && !context.atClose ? '"' : ''
    return valueCandidates(context.field || '')
      .filter((value) => value !== token && lower(value).startsWith(lower(token)))
      .map((value) => value + suffix)
  }
  if (context.kind === 'op') return ['="', '=="', '!='].map((operator) => context.token + operator)
  if (context.kind === 'join') return [token + token]
  return []
}

export interface TextLeaf {
  start: number
  end: number
  field?: string
  op?: CompareOp | ''
  value?: string
  raw?: boolean
  seq?: number
  ci?: number
  ri?: number
}

export function scanLeaves(query: string): TextLeaf[] {
  const leaves: TextLeaf[] = []
  const text = balanceParens(String(query || ''))
  const isWhitespace = (char: string): boolean => /\s/.test(char)
  const trim = (low: number, high: number): [number, number] => {
    while (low < high && isWhitespace(text[low])) low += 1
    while (high > low && isWhitespace(text[high - 1])) high -= 1
    return [low, high]
  }
  const peel = (lowZero: number, highZero: number): [number, number] => {
    let low = lowZero
    let high = highZero
    for (;;) {
      ;[low, high] = trim(low, high)
      if (text[low] !== '(' || text[high - 1] !== ')') break
      let depth = 0
      let inString = false
      let wraps = true
      for (let index = low; index < high; index += 1) {
        const char = text[index]
        if (inString) {
          if (char === '"') inString = false
          continue
        }
        if (char === '"') {
          inString = true
          continue
        }
        if (char === '(') depth += 1
        else if (char === ')') {
          if (depth > 0) depth -= 1
          if (depth === 0 && index < high - 1) {
            wraps = false
            break
          }
        }
      }
      if (!wraps || depth !== 0) break
      low += 1
      high -= 1
    }
    return [low, high]
  }
  const splitAt = (lowZero: number, highZero: number, separator: '&' | '|'): Array<[number, number]> => {
    let low = lowZero
    let high = highZero
    ;[low, high] = trim(low, high)
    const parts: Array<[number, number]> = []
    let depth = 0
    let inString = false
    let start = low
    for (let index = low; index < high; index += 1) {
      const char = text[index]
      if (inString) {
        if (char === '"') inString = false
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '(') {
        depth += 1
        continue
      }
      if (char === ')') {
        if (depth > 0) depth -= 1
        continue
      }
      if (depth === 0 && char === separator && text[index + 1] === separator) {
        parts.push(trim(start, index))
        index += 1
        start = index + 1
      }
    }
    parts.push(trim(start, high))
    return parts.filter((part) => part[0] < part[1])
  }
  const pushLeaf = (low: number, high: number): void => {
    const row = parseCondOne(text.slice(low, high))
    if (row) leaves.push({ start: low, end: high, field: row.field, op: row.op, value: row.value })
    else leaves.push({ start: low, end: high, raw: true })
  }
  const walkSegment = (lowZero: number, highZero: number, outer?: [number, number]): void => {
    const [peeledLow, peeledHigh] = peel(lowZero, highZero)
    const alternatives = splitAt(peeledLow, peeledHigh, '|')
    if (!alternatives.length) return
    const [targetLow, targetHigh] = outer || trim(lowZero, highZero)
    if (alternatives.length === 1) {
      pushLeaf(alternatives[0][0], alternatives[0][1])
      const leaf = leaves[leaves.length - 1]
      if (leaf && !leaf.raw) {
        leaf.start = Math.min(leaf.start, targetLow)
        leaf.end = Math.max(leaf.end, targetHigh)
        return
      }
      leaves.pop()
      const children = splitAt(peeledLow, peeledHigh, '&')
      if (children.length > 1) {
        children.forEach((child) => walkSegment(child[0], child[1]))
        return
      }
      leaves.push({ start: targetLow, end: targetHigh, raw: true })
      return
    }
    const rows = alternatives.map((alternative) => parseCondOne(text.slice(alternative[0], alternative[1])))
    if (rows.every((row) => row?.field && row.field.toLowerCase() === rows[0]?.field?.toLowerCase())) {
      alternatives.forEach((alternative, index) => {
        const row = rows[index]!
        leaves.push({ start: alternative[0], end: alternative[1], field: row.field, op: row.op, value: row.value })
      })
      const first = leaves[leaves.length - alternatives.length]
      const last = leaves[leaves.length - 1]
      first.start = Math.min(first.start, targetLow)
      last.end = Math.max(last.end, targetHigh)
    } else {
      leaves.push({ start: targetLow, end: targetHigh, raw: true })
    }
  }
  splitAt(0, text.length, '&').forEach((part) => {
    const [peeledLow, peeledHigh] = peel(part[0], part[1])
    const segments = splitAt(peeledLow, peeledHigh, '&')
    const [targetLow, targetHigh] = trim(part[0], part[1])
    const hadWrap = targetLow !== peeledLow || targetHigh !== peeledHigh
    segments.forEach((segment) => {
      const before = leaves.length
      walkSegment(segment[0], segment[1], hadWrap && segments.length === 1 ? [targetLow, targetHigh] : undefined)
      if (hadWrap && segments.length === 1 && leaves.length === before + 1 && leaves[before].raw) {
        leaves[before].start = targetLow
        leaves[before].end = targetHigh
      }
    })
  })
  return leaves
}

export interface CardSpans {
  leafAt: (offset: number) => { ci: number; ri: number } | null
  spanOfCard: (cardIndex: number) => { start: number; end: number } | null
}

export function cardTextSpans(cards: QueryCard[], query: string): CardSpans {
  const leaves = scanLeaves(query)
  const seen = new Map<string, number>()
  for (const leaf of leaves) {
    if (leaf.raw) continue
    const key = (leaf.field || '').toLowerCase()
    leaf.seq = seen.get(key) || 0
    seen.set(key, leaf.seq + 1)
  }
  const spans: Array<{ start: number; end: number } | undefined> = []
  const rowSequences = new Map<string, number>()
  let rawIndex = 0
  const rawLeaves = leaves.filter((leaf) => leaf.raw)
  cards.forEach((card, cardIndex) => {
    if (card.kind === 'raw') {
      const leaf = rawLeaves[rawIndex]
      rawIndex += 1
      if (leaf) {
        leaf.ci = cardIndex
        leaf.ri = -1
        spans[cardIndex] = { start: leaf.start, end: leaf.end }
      }
      return
    }
    let union: { start: number; end: number } | null = null
    card.rows.forEach((_row, rowIndex) => {
      const key = card.field.toLowerCase()
      const sequence = rowSequences.get(key) || 0
      rowSequences.set(key, sequence + 1)
      const leaf = leaves.find((candidate) => !candidate.raw
        && (candidate.field || '').toLowerCase() === key
        && candidate.seq === sequence)
      if (!leaf) return
      leaf.ci = cardIndex
      leaf.ri = rowIndex
      union = union
        ? { start: Math.min(union.start, leaf.start), end: Math.max(union.end, leaf.end) }
        : { start: leaf.start, end: leaf.end }
    })
    if (union) spans[cardIndex] = union
  })
  return {
    leafAt: (offset: number) => {
      for (const leaf of leaves) {
        if (leaf.ci !== undefined && leaf.start <= offset && offset < leaf.end) return { ci: leaf.ci, ri: leaf.ri ?? -1 }
      }
      return null
    },
    spanOfCard: (cardIndex: number) => spans[cardIndex] || null
  }
}

export type Preset = {
  id: string
  name: string
  content: string
  group: string
  ts: string
  order?: number
}

const PRESET_STORAGE = 'iot-worktable-query-presets'

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: String(item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        name: String(item.name ?? ''),
        content: String(item.content ?? ''),
        group: String(item.group ?? ''),
        ts: String(item.ts ?? ''),
        order: typeof item.order === 'number' ? item.order : undefined
      }))
  } catch {
    return []
  }
}

export function savePresets(presets: Preset[]): void {
  try {
    localStorage.setItem(PRESET_STORAGE, JSON.stringify(presets))
  } catch {
    // localStorage may be unavailable; the editor itself remains usable.
  }
}

export function mergePresets(raws: unknown[], existing: Preset[]): { list: Preset[]; added: number; skipped: number } {
  const ids = new Set(existing.map((preset) => preset.id))
  const key = (preset: Pick<Preset, 'name' | 'content'>): string => `${preset.name.trim()}\u0000${normalizeSpace(preset.content)}`
  const seen = new Set(existing.map(key))
  const list = existing.slice()
  let added = 0
  let skipped = 0
  for (const raw of raws) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const preset: Preset = {
      id: '',
      name: String(record.name ?? '').trim(),
      content: String(record.content ?? '').trim(),
      group: String(record.group ?? '').trim(),
      ts: String(record.ts ?? ''),
      order: typeof record.order === 'number' ? record.order : undefined
    }
    if (!preset.name && !preset.content) {
      skipped += 1
      continue
    }
    if (seen.has(key(preset))) {
      skipped += 1
      continue
    }
    let id = String(record.id ?? '')
    if (!id || ids.has(id)) {
      do {
        id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      } while (ids.has(id))
    }
    preset.id = id
    ids.add(id)
    seen.add(key(preset))
    list.push(preset)
    added += 1
  }
  return { list, added, skipped }
}
