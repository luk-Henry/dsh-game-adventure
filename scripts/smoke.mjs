/**
 * 最小 DOM 垫片 + 冒烟测试。
 * 没有 jsdom 可用（沙箱里也起不了 headless Chromium），所以手搓一个够用的 DOM，
 * 只为了证明 createGameflow() 真的能跑起来、能挂载、能渲染卡片、能翻面、能关掉。
 * 它验证的是「有没有崩」，不是「好不好看」。
 */

import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import vm from 'node:vm'

class ClassList {
  constructor(el) { this.el = el }
  // 必须直接操作元素自己那个 Set，否则 classList 与挂载用的 _class 会各说各话
  get set() { return this.el._class }
  add(...c) { for (const x of c) this.set.add(x) }
  remove(...c) { for (const x of c) this.set.delete(x) }
  toggle(c, force) {
    // 真 DOM 的 toggle 认第二个参数（给了 force 就照它办）；垫片必须一样，
    // 否则 `toggle(cls, on)` 这种写法在自检里会一次次反着来。
    const want = force === undefined ? !this.set.has(c) : !!force
    if (want) this.set.add(c)
    else this.set.delete(c)
    return want
  }
  contains(c) { return this.set.has(c) }
}

let NODE_ID = 0
/**
 * 垫片里的「滚过去」记录：门上那枚惊叹号点一下要落到那一行（用户 m11602 第 1 条），
 * 靠的就是 `scrollIntoView`。真 DOM 有这个函数，垫片原来没有——补一个只记账、不动版面的，
 * 自检要验的是「有没有叫它过去、怎么叫的」，不是滚动位置（那得在浏览器里量）。
 */
const SCROLLS = []
// 焦点也记一笔：面板打开时焦点该落在哪儿（用户 m12690 那份清单的第 4 条），真 DOM 里
// `focus()` 会改 document.activeElement，垫片里只留下「是谁被叫过」。
const FOCUSES = []

class El {
  constructor(tag, ns) {
    this._id = ++NODE_ID
    this.tagName = String(tag).toUpperCase()
    this.ns = ns || null
    this._class = new Set()
    this._text = ''
    this.children = []
    this.parentNode = null
    this.attributes = {}
    this.listeners = {}
    this.hidden = false
    this.classList = new ClassList(this)
    this.style = {
      _props: {},
      setProperty(k, v) { this._props[k] = v },
      removeProperty(k) { delete this._props[k] },
      getPropertyValue(k) { return this._props[k] },
    }
  }

  get className() { return [...this._class].join(' ') }
  set className(v) { this._class = new Set(String(v || '').split(/\s+/).filter(Boolean)) }
  _sync() { /* className is derived; nothing to do */ }

  get textContent() { return this._text || this.children.map((c) => c.textContent).join('') }
  set textContent(v) { this._text = String(v); this.children = [] }

  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c)
    c.parentNode = this
    this.children.push(c)
    return c
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c)
    if (c.parentNode === this) c.parentNode = null
    return c
  }
  remove() { this.parentNode?.removeChild(this) }

  setAttribute(k, v) {
    // 真 DOM 里 setAttribute('class', ...) 就是改 className，垫片必须跟着走，
    // 否则 SVG 那批用 setAttribute 建的元素在 all() 里一个都找不到。
    if (k === 'class') this.className = v
    this.attributes[k] = String(v)
  }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null }
  hasAttribute(k) { return k in this.attributes }
  removeAttribute(k) { delete this.attributes[k] }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f) }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f) }
  attachShadow() { this.shadowRoot = new El('#shadow-root'); return this.shadowRoot }
  createElement(tag) { return new El(tag) }
  createElementNS(ns, tag) { return new El(tag, ns) }
  contains(n) { return n === this || this.children.some((c) => c.contains(n)) }
  focus() { FOCUSES.push(this) }
  scrollIntoView(opts) { SCROLLS.push({ el: this, opts: opts || {} }) }
  dispatch(type, ev = {}) {
    for (const f of [...(this.listeners[type] || [])]) f(ev)
  }
  get offsetWidth() { return 360 }
  // 客户端现在会量「滚动条占掉多宽」（offsetWidth - clientWidth）写进 --gf-sb，
  // 好让地图和见闻录的字对齐。垫片给一个差 10px 的假数，断言看得到它。
  get clientWidth() { return 350 }

  /**
   * 量尺寸那条路会把地图整棵 SVG 序列化下来交给宿主。垫片不需要跟真 DOM 逐字节一样，
   * 只要「序列化得出来」——断言看的是里面有没有 `<svg`。
   */
  get outerHTML() {
    const tag = this.tagName.toLowerCase()
    const cls = this.className ? ` class="${this.className}"` : ''
    const attrs = Object.entries(this.attributes).map(([k, v]) => ` ${k}="${v}"`).join('')
    return `<${tag}${cls}${attrs}>${this.textContent}</${tag}>`
  }

  /**
   * 地图是**运行时现画**的（`g.innerHTML = mapSvg()`，见 client.js 的 buildMap 与
   * `src/map/world.js`）。这段垫片要解析的 SVG 现在来自 `.scratch/map-data.js`——
   * 当年那张图，2026-10-08 起退居为回归夹具（见下面 MAP_SVG 那一段）。
   * 真浏览器会把它解析成真正的元素；垫片不解析的话，自检里地图就是一片空白——
   * 「地图真的是画出来的（几十个面）」那条断言会瞎，等于地图出了事没人管。
   *
   * 这个解析器只够读地图那一段：标签、属性、自闭合、嵌套，没有注释、没有 CDATA、
   * 没有文字节点。**别拿它当通用 HTML 解析器用。**
   */
  get innerHTML() { return this._raw || '' }
  set innerHTML(html) {
    // 原样的那段字符串也留一份：第五十五版起「镜内换了一张图」要按**内容**判
    // （城一律按城画之后，两层元素的个数可能一样，只有题名框里那个名字不同）。
    this._raw = String(html)
    this.children = []
    const stack = [this]
    const RE_TAG = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g
    const RE_ATTR = /([\w:-]+)="([^"]*)"/g
    let m
    while ((m = RE_TAG.exec(html))) {
      if (m[1] === '/') {
        if (stack.length > 1) stack.pop()
        continue
      }
      const node = new El(m[2])
      for (const a of m[3].matchAll(RE_ATTR)) node.setAttribute(a[1], a[2])
      stack[stack.length - 1].appendChild(node)
      if (m[4] !== '/') stack.push(node)
    }
  }

  /** 深度遍历（含 shadow root），把 .cls 收集出来 */
  all(cls, out = []) {
    const roots = [this, ...(this.shadowRoot ? [this.shadowRoot] : [])]
    for (const r of roots) {
      if (r._class.has(cls)) out.push(r)
      for (const c of r.children) c.all(cls, out)
    }
    return out
  }

  /** 按标签名找（SVG 那批没有 class，只能按标签数） */
  allTag(tag, out = []) {
    const want = String(tag).toUpperCase()
    const roots = [this, ...(this.shadowRoot ? [this.shadowRoot] : [])]
    for (const r of roots) {
      if (r.tagName === want) out.push(r)
      for (const c of r.children) c.allTag(tag, out)
    }
    return out
  }

  /** 只认 '.cls' 这一种选择器——量尺寸那条路按 class 挑元素，够用了 */
  querySelector(sel) {
    const s = String(sel || '')
    if (!s.startsWith('.')) return null
    return this.all(s.slice(1))[0] || null
  }

  /**
   * 垫片没有排版引擎，量不出真实的宽高——给一堆 0 就行。
   * 「量尺寸」那条路要验的是「量得到、发得出」，不是数字对不对（真数字得在浏览器里量）。
   */
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0 }
  }
}

globalThis.getComputedStyle = () => ({
  fontSize: '12px',
  lineHeight: 'normal',
  color: 'rgb(0, 0, 0)',
  paddingTop: '0px',
  paddingRight: '0px',
  paddingBottom: '0px',
  paddingLeft: '0px',
  marginTop: '0px',
  marginRight: '0px',
  marginBottom: '0px',
  marginLeft: '0px',
})

const document = new El('#document')
document.body = new El('body')
document.appendChild(document.body)

globalThis.document = document
globalThis.window = {
  setTimeout,
  clearTimeout,
  clearInterval,
  setInterval,
  // 客户端会在 resize 时重量滚动条空档（见 syncGutter）。垫片记下来，
  // 断言既能看见「挂上了」，也能看见 destroy 时「摘掉了」。
  listeners: {},
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f) },
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f) },
}
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb } observe() {} disconnect() {} }

const {
  apply,
  buildStage,
  CAST,
  CAST_LINES,
  CLASHES,
  createGameflow: createGameflowRaw,
  composeSequence,
  dangerOf,
  DAY_FRAME,
  dayFrameOf,
  dayLine,
  daylight,
  DEFAULT_VOICE,
  DIRECTIONS,
  FATES,
  FIGHTS,
  helpersFor,
  hisTags,
  HOME_LINES,
  inject,
  lifeLine,
  MARKS,
  mealOf,
  MOMENTS,
  narrationFor,
  ORIGIN,
  PLACES,
  placeName,
  placeOf,
  renderStage,
  SCENES,
  SHARDS,
  SHARED_LINES,
  THEMES,
  travelMs,
  VIEW,
  VOICES,
  fetchRecords,
  fetchStore,
  fightsFor,
  JOURNEY,
  seasonOf,
  dayPlanOf,
  dayPlansFor,
  planLines,
  lossLine,
  stateAt,
  OUT_KEYS,
} = await import('../src/client.js')

// 幕布（用户 m19006 / m19218）：今天还没按过「开始冒险」，见闻录一格都不铺。它只对**面板记得住
// 东西**的机器生效（`picks.canSave` 假就不设，见 renderTimeline）——所以自检里绝大多数夹具
// （不给 `storage`）照旧铺得开；给了假存储的那些，存储自己回答「今天已经按过」：
// `freshStore()` 默认写上了，`storeStub` 单独回答 `dsh.gameflow.started` 这一个键，
// 要看幕布的夹具自己把它删掉。
const createGameflow = createGameflowRaw

// 地图是**运行时现画出来的**（`src/map/world.js` 的 `mapSvg()`，见 `src/map/README.md`）。
// 当年那张「画好的一整段 SVG」现在只剩一个身份：**回归夹具**，住在 `.scratch/map-data.js`
// ——2026-10-08 从 `src/` 搬出去的：它 532 KB，一直跟着包发给别人，而包里没人 import 它。
// 夹具在，就多验几条「现画的结果跟当年那张图一字不差」；夹具不在（别人 clone 到的那份
// 没有 `.scratch/`），那几条**大声跳过**，其余六百多条照跑。
let MAP_SVG = null
let MAP_CSS = null
try {
  const fixture = await import('../.scratch/map-data.js')
  MAP_SVG = fixture.MAP_SVG
  MAP_CSS = fixture.MAP_CSS
} catch {
  console.log('  --   没有 `.scratch/map-data.js`（回归夹具不在），依赖它的那几条会跳过')
}
const HAVE_MAP_FIXTURE = Boolean(MAP_SVG && MAP_CSS)
// 注册表本身：2026-10-06 起地理也在包里，所以自检要能拿到包里的那一份来对。
const { PACKS, getPack, listPacks, worldIds } = await import('../src/packs/index.js')
// 战斗那台机器（见「战斗」那一节）：面板上挑对手与档位靠它，所以自检直接问它一遍。
const { fightOf: rulesFightOf } = await import('../src/packs/rules.js')

const ACTION_TAGS = ['改文件', '跑命令', '翻文件', '查资料', '派了活', '聊了聊']
const VOICE_IDS = Object.keys(VOICES)

/**
 * 「故事风格」那张清单里**会列出来的**那几套：讲得出话的（`narrates`）＋ 预留的
 * （`soon`，2026-10-06 晚用户第 3 条：规则怪谈 / 宫斗心计 / 谍战潜伏），
 * 按 `voice` 去重、照注册表顺序。期望值一律从它推，所以注册表里加减包，这一节不用改。
 */
const listedStyles = () => {
  const seen = new Set()
  const out = []
  for (const pack of listPacks()) {
    if (!pack.narrates && !pack.soon) continue
    if (seen.has(pack.voice)) continue
    seen.add(pack.voice)
    out.push(pack)
  }
  return out
}

const at = (days, h, m = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** 行首那个钟点（跟 src/client.js 的 clockText 同一个格式）。 */
const hhmm = (ts) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 钉死「现在是几点」：问候语、屋里的光、他此刻在干什么都读它。
// 不然一到傍晚（本来在干活的记录会变成「出门了」）断言就飘。
const NOW = at(0, 16, 40)

// 用的就是真实回填出来的那种数据形状：交付物、帮手来自宿主的元数据；
// title 也照旧带着（宿主还在记），但卡片已经不看它了。
const demo = [
  {
    id: 'session-demo-1',
    startedAt: at(0, 16, 30),
    endedAt: NOW - 3 * 60 * 1000,
    minutes: 33,
    title: '回顾厅',
    // 宿主写记录时 `tags` 就是**按次数排好的**（先时间标签，再前三名动作）——
    // 这里的顺序要跟下面 counts 的次数一致，否则测的就不是真数据。
    tags: ['改文件', '跑命令', '翻文件'],
    // 宿主 m02710 起会数每个动作各几次、动过哪几个文件——这是「你做了什么」的忠实版本
    actions: 27,
    counts: { 改文件: 12, 跑命令: 9, 翻文件: 6 },
    files: [
      'D:\\文档合集\\插件\\dsh-gameflow\\src\\client.js',
      'D:\\文档合集\\插件\\dsh-gameflow\\scripts\\smoke.mjs',
    ],
    deliverables: [
      'D:\\文档合集\\插件\\dsh-gameflow\\回望厅-设计文档.md',
      'D:\\文档合集\\插件\\dsh-gameflow\\README.md',
    ],
    helpers: ['Research DSH host plugin API', 'Research DSH client plugin API'],
  },
  { startedAt: at(0, 16, 20), endedAt: at(0, 16, 21), minutes: 1, tags: ['一小会儿'] },
  {
    startedAt: at(1, 23, 50),
    endedAt: at(2, 0, 40),
    minutes: 50,
    title: '# 最终方案总结：`dsh-gameflow`',
    tags: ['很晚了', '查资料', '改文件'],
    actions: 9,
    counts: { 改文件: 4, 查资料: 2 },
    files: ['D:\\限载4人\\01_策划案v3.md'],
    deliverables: [
      'D:\\限载4人\\01_策划案v3.md',
      'D:\\限载4人\\01_策划案.md',
      'D:\\限载4人\\02_数值表.md',
    ],
  },
  { startedAt: at(2, 2, 10), endedAt: at(2, 2, 35), minutes: 25, tags: ['改文件'], counts: { 改文件: 3 }, files: ['D:\\a\\notes.md'] },
  { startedAt: at(3, 14, 0), endedAt: at(3, 14, 3), minutes: 3, tags: [] },
  { startedAt: at(6, 20, 30), endedAt: at(6, 21, 35), minutes: 65, tags: ['查资料'] },
  // 这一条是专门给「按周分组（>=2 组）」用的：上面几条的日期都跟着「今天」走，
  // 星期几不同的时候第 6 天可能还落在同一周里（2026-10-04 是星期日，那一周只有 1 组，
  // 这条断言就飘了）。往前挪到 8 天以前——按周一划周，offset ≥ 7 必然落在上一周。
  {
    startedAt: at(8, 20, 30),
    endedAt: at(8, 21, 35),
    minutes: 65,
    tags: ['改文件'],
    counts: { 改文件: 3 },
    files: ['D:\\a\\old.md'],
  },
]

const results = []
const check = (name, pass, extra = '') => {
  results.push({ name, pass, extra })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${extra ? `  (${extra})` : ''}`)
}
// 依赖 `.scratch/map-data.js` 那几夹具的那几条：夹具不在就**跳过**，不算失败，也不装哑巴
// ——结束的时候会把跳过了哪几条印出来。静默地少验几条，比红着更危险。
const skipped = []
const checkOnFixture = (name, pass, extra = '') => {
  if (!HAVE_MAP_FIXTURE) { skipped.push(name); return }
  check(name, pass, extra)
}

/* --- 翻译层：纯函数，先单独钉死 ------------------------------------- */

// 夹具用的记录。**一定给它一个 id**：没有 id 的记录 `withIds` 会造 `anon-<开始时刻>`，
// 景是按 `${id}|${act}|${n}|scene` 挑的（见 pickShards）——时刻跟着日历走，同一份夹具
// 今天挑到机关坊、明天就挑到河湾，断言会随日期红绿（2026-10-24 撞见：「他在干什么：
// 正在试法器」那条就是这么红的）。id 从内容算，内容一样就是同一条。
const R = (over) => {
  const base = { startedAt: NOW - 60000, endedAt: NOW - 60000, minutes: 30, tags: [], ...over }
  if (base.id == null) {
    const key = JSON.stringify([base.tags, base.counts || null, base.minutes, base.fails || 0])
    let h = 2166136261
    for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
    base.id = `r-${(h >>> 0).toString(36)}`
  }
  return base
}

// 他人在**落脚处**时，句子里不许再出现外头干活的那套东西——
// 用户 2026-10-04 第 1 条：「现在他的位置在落脚点，那么需要做符合落脚点的事情」。
const AWAY_WORDS = /卷轴|卷宗|箱子|法器|机关|架子|梯子|地图|案前|案角|工坊|档案塔|抄写室|集市|公会|酒馆|铺子|码头|城外|同伴|帮手|咒文|符纸|契书/
const homeOnly = (line) => typeof line === 'string' && line.length > 0 && !AWAY_WORDS.test(line)

// 2026-10-03 起，一句话由**四档结局**拼出来：交出过东西 → 交活拿钱；
// 撞过墙（fails ≥ 3）→ 挨了两下；做很多遍 → 反复（一半是「成了」）；否则 → 只有一次的结局。
// 所以这里钉的是「必须拼出一句像样的话」+「四档各自会走到」。
check('他在干什么：拼出一句话（冒险语气）',
  (() => {
    const line = narrationFor([R({ tags: ['改文件'] })], NOW).line
    // 2026-10-07 起句子不再一律以「他」开头：用户要的是「句式有变化」，
    // 于是加了物作主语（「桌上那盏灯快没油了」）和间接引语（「看院子的老人说，……」）。
    // 这条盯的改成「这句话讲的是他」——句子里得有「他」，而不是必须打头。
    return /他/.test(line) && line.endsWith('。') && line.includes('，') && !line.includes('{')
  })(),
  narrationFor([R({ tags: ['改文件'] })], NOW).line)
check('换一个已经没有的说法：退回默认那一套，句子照说',
  // 2026-10-05 用户摘掉了第二套说法「案牍」（连内容收在 .parked/ledger-voice/），
  // 所以现在给一个不存在的语气，应该安静地退回冒险——而不是空一句话。
  (() => {
    const gone = narrationFor([R({ tags: ['改文件'] })], NOW, 'ledger').line
    const adv = narrationFor([R({ tags: ['改文件'] })], NOW).line
    return gone === adv && adv.endsWith('。')
  })(),
  narrationFor([R({ tags: ['改文件'] })], NOW, 'ledger').line)
check('他在干什么：正在试法器', narrationFor([R({ tags: ['跑命令'] })], NOW).place === 'workshop')
check('他在干什么：主线挑「更像一件事」的那条',
  // 两条夹具给**同一个 id**：句子是按 `${id}|${act}|${n}` 挑的，换 id 就换句，
  // 这条要钉的是「两条记录挑出来的主活一样」，不是「两句话一样」。
  narrationFor([R({ id: 'main-line', tags: ['改文件', '改文件', '查资料'] })], NOW).line
  === narrationFor([R({ id: 'main-line', tags: ['改文件', '查资料'] })], NOW).line,
  narrationFor([R({ id: 'main-line', tags: ['改文件', '查资料'] })], NOW).line)

/* --- 四档结局（用户 m04700：不能老是「翻找无果、多少遍」）--------------- */

const L = (over) => R({ id: 'session-out-1', counts: { 改文件: 9 }, ...over })
// 哪一档由稳定散列挑，所以断言要看**一批** id 的分布，不能赌某一个 id 恰好走到哪一档。
const OUT_IDS = Array.from({ length: 40 }, (_, i) => `out-${i}`)
const linesFor = (over) => OUT_IDS.map((id) => narrationFor([R({ id, counts: { 改文件: 9 }, tags: ['改文件'], ...over })], NOW).line)
// 2026-10-07：四档收尾从「按动作分」改成「按场景分」（一件事一套收尾），三个正则跟着重写。
// 它们盯的是**这一档有没有出现**，不是句子该怎么写——词面换了就得跟着换，
// 否则红的是断言自己过时，不是产品坏了。
const PAID_RE = /铜币|工钱|定金|几个钱|几枚|钱|交货|收了|付了|卖家/
const HURT_RE = /挨|挂彩|伤|扑|撕|烫|摔|砸|呛|划|燎|磕/
const DONE_RE = /对上|咬上|终于|总算|成了|才顺|稳稳|亮着|点了点头|人齐了/

// 一、交出过东西 → 有一部分日子他就是去交活拿钱（不是每一天，不然又单调）
const paidLines = linesFor({ deliverables: ['D:\\x\\a.md'] })
check('那天交出了东西，有些日子他就去交活拿钱',
  paidLines.filter((l) => PAID_RE.test(l)).length >= 8,
  `${paidLines.filter((l) => PAID_RE.test(l)).length}/40`)
check('交活那一档不记账：一个数字都不许有', paidLines.every((l) => !/\d/.test(l)))
// 二、撞过墙 → 有一部分日子他那边就挨了两下（{e} 用汉字数字）
const hurtLines = linesFor({ fails: 11 })
check('那天撞过墙，有些日子他那边就挨了两下',
  hurtLines.filter((l) => HURT_RE.test(l)).length >= 8,
  `${hurtLines.filter((l) => HURT_RE.test(l)).length}/40`)
check('挨几下也写成汉字数字', hurtLines.every((l) => !/\d/.test(l)))
// 三、次数多 → 只在**约三分之一**的日子里提次数（2026-10-04 收紧：用户说数字太多）
const moreLines = linesFor({})
const numLines = moreLines.filter((l) => /遍|回|趟|次|本/.test(l))
check('次数多，但只偶尔提一句「多少遍」', numLines.length >= 8 && numLines.length <= 22, `${numLines.length}/40`)
check('剩下那些日子讲的是别的事，不是数字', moreLines.filter((l) => !/遍|回|趟|次|本/.test(l)).length >= 18)
check('每一行都是完整的一句话', moreLines.every((l) => /他/.test(l) && l.endsWith('。') && l.includes('，')))
check('「做很多遍」里有一半是成了（不是全是没找着）',
  (() => {
    // 2026-10-07：原来只拿「改文件」那四十行看。收尾改成按场景分档之后，改文件底下那四件事的
    // `more` 恰好都是「还没成」的口吻，于是它红的是**取样太窄**，不是产品变了。
    // 改成六个动作轮着取样：看的是「做很多遍」这一档整体上有没有成 / 没成两种日子。
    const acts = ['改文件', '跑命令', '翻文件', '查资料', '派了活', '聊了聊']
    const all = OUT_IDS.map((id, i) => {
      const act = acts[i % acts.length]
      return narrationFor([R({ id, counts: { [act]: 9 }, tags: [act] })], NOW).line
    })
    return all.some((l) => DONE_RE.test(l)) && all.some((l) => !DONE_RE.test(l))
  })())
// 四、四档会**混着来**：同一天又交了东西又撞了墙时，按散列分流
const bothLines = linesFor({ deliverables: ['D:\\x\\a.md'], fails: 11 })
check('交了东西又撞了墙的日子，四档混着来（不是清一色）',
  bothLines.filter((l) => PAID_RE.test(l)).length > 0 && bothLines.filter((l) => HURT_RE.test(l)).length > 0,
  `交活 ${bothLines.filter((l) => PAID_RE.test(l)).length}/40，挨打 ${bothLines.filter((l) => HURT_RE.test(l)).length}/40`)
check('四档都不会漏出占位符', bothLines.every((l) => !/\{/.test(l)))
// 只有一两次 → 走没有次数的结局（不硬说「找了几十遍」）
check('次数只有一两次时不吹成几十遍',
  !/几十|十几/.test(narrationFor([L({ tags: ['改文件'], counts: { 改文件: 1 } })], NOW).line))
check('没交东西也没撞墙时不会冒出钱或挨打',
  (() => {
    const line = narrationFor([L({ tags: ['改文件'], counts: { 改文件: 3 } })], NOW).line
    return !PAID_RE.test(line) && !HURT_RE.test(line)
  })())
// 场景仍然由「你那天做了什么」决定：改文件不会跑去打龙
check('四档都还留在那一件事的场子里',
  (() => {
    const a = narrationFor([L({ tags: ['改文件'], deliverables: ['D:\\x\\a.md'] })], NOW).line
    const b = narrationFor([L({ tags: ['改文件'], fails: 9 })], NOW).line
    // 2026-10-05：主线动作改成按次数排之后，这里跑的是「改文件」，所以两档都该落在纸笔那一套里。
    // `more` 那一档补过「终于」口吻的句子之后，收尾句可能是「他把笔搁下，那一行总算顺了」这种不带物件的，
    // 所以把摹 / 笔 / 墨 / 抄 / 页 也放进来。
    return /契书|咒文|符纸|符|图|纸|卷宗|笔画|誊|摹|笔|墨|抄|页|羊皮|疆域|河道/.test(a)
      && /划破|墨洒|纸|抄|笔|墨|符|描|撕|伤|烫|摔|砸|划|刀/.test(b)
  })())
// 用户 m05036 第 3 条：「上一次如果是和箱子有关，下一次就不要再在箱子上磨蹭了」
const PROPS = ['卷轴', '卷宗', '契书', '符纸', '架子', '箱子', '梯子', '册子', '机关', '法器',
  '零件', '齿轮', '炉', '火', '灯', '纸', '墨', '笔', '窗', '门', '茶', '地图', '图', '路', '摊子', '椅子', '围裙']
const propsIn = (t) => PROPS.filter((w) => String(t).includes(w))
/** 引擎认的「开场」是第一个逗号之前那半句（`composeSequence` 就是这么记的）。 */
const headOf = (t) => {
  const s = String(t == null ? '' : t)
  const i = s.indexOf('，')
  return i > 0 ? s.slice(0, i) : s
}
const seqOf = (act, n = 6) => {
  const list = Array.from({ length: n }, (_, i) => ({
    id: `seq-${act}-${i}`,
    startedAt: NOW - (n - i) * 3600 * 1000,
    endedAt: NOW - (n - i) * 3600 * 1000 + 30 * 60 * 1000,
    minutes: 30,
    tags: [act],
    counts: { [act]: 7 },
  }))
  return [...composeSequence(list, 'adventure').values()].map((v) => v.line)
}
const adjShare = (lines) => lines.filter((l, i) => i > 0 && propsIn(l).some((p) => propsIn(lines[i - 1]).includes(p))).length
for (const act of ['改文件', '翻文件', '跑命令']) {
  const lines = seqOf(act)
  check(`连着两行不会围着同一样东西转（${act}）`, adjShare(lines) === 0,
    lines.map((l) => propsIn(l).join('+') || '-').join(' | '))
}
// 2026-10-04 第 2 条：用户截图里隔着几行的两行还是同一句开场
// （两行都是「他把落了灰的箱子一只只搬下来」），所以避开的不止上一行，是最近几行。
check('隔几行的两行也不会撞同一个开场',
  (() => {
    const leads = seqOf('翻文件', 8).map((l) => l.slice(0, l.indexOf('，')))
    return new Set(leads).size === leads.length
  })(), seqOf('翻文件', 8).map((l) => l.slice(0, l.indexOf('，'))).join(' | '))
// 用户 2026-10-04 第 1 条：位置在落脚处，句子就得是落脚处的事
check('落脚处的句子不许再提外头的活计',
  ['改文件', '翻文件', '跑命令', '查资料', '派了活', '聊了聊'].every((act) => {
    const line = dayLine({ minutes: 3, tags: [act] }, 'adventure')
    return HOME_LINES.includes(line) && homeOnly(line)
  }),
  homeOnly(dayLine({ minutes: 3, tags: ['翻文件'] }, 'adventure'))
    ? dayLine({ minutes: 3, tags: ['翻文件'] }, 'adventure') : 'still talks about work')
check('落脚处也有好几种说法，不是每次都同一句',
  new Set(Array.from({ length: 12 }, (_, i) => dayLine({ id: `h-${i}`, minutes: 3, tags: ['改文件'] }, 'adventure'))).size > 2,
  Array.from({ length: 12 }, (_, i) => dayLine({ id: `h-${i}`, minutes: 3, tags: ['改文件'] }, 'adventure')).join(' / '))
check('一整天六行，句子各不相同',
  new Set(seqOf('翻文件')).size === 6, seqOf('翻文件').join(' / '))
check('相邻两行不会用同一句开头',
  (() => {
    const leads = seqOf('翻文件').map((l) => l.slice(0, l.indexOf('，')))
    return leads.every((l, i) => i === 0 || l !== leads[i - 1])
  })(), seqOf('翻文件').map((l) => l.slice(0, l.indexOf('，'))).join(' | '))
check('同一份记录跑两遍，句子一模一样',
  seqOf('翻文件').join('') === seqOf('翻文件').join(''))

/* --- 二十件事：同一个动作底下，他每次做的是不同的一件 ---------------- *
 * 用户 2026-10-05 第 3 条：「在他的冒险上，这里的行为也是具有重复性的，
 * 就感觉在卷轴塔做的事情差不多。」——所以改文件底下分成了抄咒文 / 誊符纸 /
 * 改契书 / 补地图……右栏说的是哪一件，位置就跟着去哪一处。 */
const picksOf = (acts, n = 6) => {
  const list = Array.from({ length: n }, (_, i) => ({
    id: `pick-${acts.join('-')}-${i}`,
    startedAt: NOW - (n - i) * 3600 * 1000,
    endedAt: NOW - (n - i) * 3600 * 1000 + 30 * 60 * 1000,
    minutes: 30,
    tags: acts,
    counts: Object.fromEntries(acts.map((a, k) => [a, 9 - k * 3])),
  }))
  return [...composeSequence(list, 'adventure').values()]
}
check('同一个动作底下，他换着做不同的事（不是每天同一个箱子）',
  new Set(picksOf(['改文件']).map((p) => p.w)).size >= 3,
  picksOf(['改文件']).map((p) => p.w).join(' | '))
check('每件事都有名字（标签就是他今天真正在做的那一件）',
  picksOf(['改文件']).every((p, i) => p.w && hisTags(['改文件'], 'adventure', `pick-改文件-${i}`, p.w)[0] === p.w),
  picksOf(['改文件']).map((p) => p.w).join(' | '))
check('连着三行都在同一件事上，第二件事就顶上来（位置跟着动）',
  (() => {
    const picks = picksOf(['改文件', '跑命令'])
    return new Set(picks.map((p) => p.act)).size > 1 && new Set(picks.map((p) => p.place)).size > 1
  })(),
  picksOf(['改文件', '跑命令']).map((p) => `${p.act}/${p.place}`).join(' | '))
check('同一句收尾不会在最近几行里连着冒出来',
  (() => {
    const used = picksOf(['改文件'], 8).map((p) => p.clause).filter(Boolean)
    return new Set(used).size === used.length
  })(),
  picksOf(['改文件'], 8).map((p) => p.clause).join(' | '))


// 2026-10-07 用户抓到串味：「他拿尺子比着把河道往北挪，写到第几十遍，忽然对上了」——
// 量河道配了「写到第几十遍」。根子是四档收尾原来按**动作**分（一个动作底下所有场景共用一套），
// 于是「抄咒文」的收尾会跑到「补地图」身上。这条断言直接盯结构：拿到的收尾句必须出自
// **这一行挑中的那件事自己的池子**（场景的 tail，或该场景 key 底下的 more / paid / hurt）。
const scenesOf = (act) => (SCENES.adventure && SCENES.adventure[act]) || []
// 2026-10-08：子代理那批 hurt 有一半自带句号，拼出来就成了「。。」（探针输出里实测到）。
// 句库片段一律不带句号——句号是拼句那边补的（`${fill(lead)}，${fill(body)}。`）。
check('句库片段末尾不带句号（句号由拼句那边补）',
  (() => {
    const slots = ['lead', 'tail', 'more', 'paid', 'hurt', 'again']
    const bad = []
    for (const [voice, keys] of Object.entries(SHARDS)) {
      for (const [key, shard] of Object.entries(keys || {})) {
        for (const slot of slots) {
          for (const t of shard?.[slot] || []) if (String(t).endsWith('。')) bad.push(`${voice}/${key}/${slot}: ${t}`)
        }
      }
    }
    for (const [voice, acts] of Object.entries(SCENES)) {
      for (const [act, list] of Object.entries(acts || {})) {
        for (const s of list || []) {
          for (const slot of slots) {
            for (const t of s?.[slot] || []) if (String(t).endsWith('。')) bad.push(`${voice}/${act}/${s.key}/${slot}: ${t}`)
          }
        }
      }
    }
    return bad.length === 0
  })())

check('收尾句只从「这件事自己的」池子里取（串味就是这么修掉的）',
  (() => {
    const bad = []
    for (const act of ['改文件', '跑命令', '翻文件', '查资料', '派了活', '聊了聊']) {
      for (const p of picksOf([act], 12)) {
        if (!p.clause) continue
        const scene = scenesOf(act).find((s) => s.w === p.w)
        if (!scene) { bad.push(`${act}/${p.w}：没有这件事`); continue }
        // 2026-10-08：`{e}` 在 `pickShards` 里已经被换成「第一回」，`{n}` 要留到拼句时才换——
        // 所以比之前两边都先归一（占位符与汉字数字一律抹成同一个记号），结构意图不变。
        const normClause = (t) => String(t || '').replace(/\{e\}|\{n\}/g, '#').replace(/[一二三四五六七八九十百千]+/g, '#')
        const pools = [scene.tail, ...['more', 'paid', 'hurt'].map((t) => SHARDS.adventure[scene.key]?.[t])]
        if (!pools.some((list) => (list || []).some((t) => normClause(t) === normClause(p.clause)))) bad.push(`${act}/${p.w}/${p.clause}`)
      }
    }
    return bad.length === 0
  })())

// 承接句：一件事隔几行又回来做，句子**开头**会把它接上。
// 用户 2026-10-07 的原话是「每行都是独立事件，没有『后来呢』」，这一条就是那句的机器版。
check('一件事隔几行又回来做，句子里会把它接上',
  (() => {
    const again = Object.values(SHARDS.adventure).flatMap((s) => s.again || [])
    const lines = picksOf(['改文件'], 12).map((p) => p.line)
    return lines.some((l) => again.some((a) => l.startsWith(`${a}，`)))
  })(),
  picksOf(['改文件'], 12).map((p) => p.line).join(' | '))


/* 2026-10-07 用户第 2 条：「世界还是谁都不认识谁」——现在每个地方住一个固定的熟人（见 CAST）。 */

check('每个地方都有一个固定的熟人，而且名字不重样',
  Object.keys(CAST).length >= 6
  && new Set(Object.values(CAST)).size === Object.keys(CAST).length
  && Object.keys(CAST).every((p) => (CAST_LINES[p] || []).length >= 3),
  Object.entries(CAST).map(([p, n]) => `${p}=${n}`).join(' '))
check('熟人只在自己那个地方出现（不串场）', (() => {
  // 2026-10-08 改成按**来源**判，不再按名字扫：卷轴塔那件事自己的开头里就写着
  // 「常来的行商说，这种卷轴只在南边见过一回」——那是场景在讲行商，不是行商跑错了地方。
  // 这里咬的是 `CAST_LINES`：某个地方那位熟人的开场，只许在他那个地方的行里出现。
  const headOfLine = (l) => {
    const s = String(l || '')
    const i = s.indexOf('，')
    return i > 0 ? s.slice(0, i) : s.replace(/。$/, '')
  }
  const castHeadsOf = (place) => (CAST_LINES[place] || []).map((t) => headOfLine(String(t).replace(/\{p\}/g, CAST[place])))
  const bad = []
  let seen = 0
  for (const act of ACTION_TAGS) {
    for (const p of picksOf([act], 12)) {
      const head = headOfLine(p.line)
      for (const place of Object.keys(CAST)) {
        if (!castHeadsOf(place).includes(head)) continue
        seen += 1
        // 户外的活落点是野地（`wild: true`），城里的熟人当然也不该出场。
        if (p.place !== place) bad.push(`${act}/${p.place}: 该在「${place}」出场的 ${CAST[place]} 到了这儿 —— ${p.line}`)
      }
    }
  }
  return bad.length === 0 && seen >= 4
})(), (() => {
  const heads = []
  for (const act of ACTION_TAGS) {
    for (const p of picksOf([act], 12)) {
      const h = String(p.line).slice(0, Math.max(0, String(p.line).indexOf('，')))
      if (Object.values(CAST).some((n) => String(p.line).includes(n))) heads.push(`${p.place}:${h}`)
    }
  }
  return heads.join(' | ')
})())
check('熟人不是每行都出场（每行都有人，又成了套话）', (() => {
  let withWho = 0
  let total = 0
  for (const act of ACTION_TAGS) {
    for (const p of picksOf([act], 12)) {
      total += 1
      if (Object.values(CAST).some((n) => p.line.includes(n))) withWho += 1
    }
  }
  return withWho > 0 && withWho < total * 0.7
})(), (() => {
  let withWho = 0
  let total = 0
  for (const act of ACTION_TAGS) {
    for (const p of picksOf([act], 12)) {
      total += 1
      if (Object.values(CAST).some((n) => p.line.includes(n))) withWho += 1
    }
  }
  return `${withWho}/${total}`
})())
check('拼出来的句子里没有漏下的占位符（{p} / {n} / {e}）',
  ACTION_TAGS.every((act) => picksOf([act], 12).every((p) => !/\{[pne]\}/.test(p.line))),
  ACTION_TAGS.map((act) => picksOf([act], 12).find((p) => /\{[pne]\}/.test(p.line))?.line || '-').join(' '))


// 用户 m03745 举的那个例子还在表里（种子挑不挑得中另说，句子本身不许丢）
check('用户举的那句「有人肯说，可说的都是旧年的传闻」还在表里',
  readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').includes('可说的都是旧年的传闻'))

/* --- 生活层（用户 m04700：「他在哪休息，有日常」）--------------------- */

const LIFE = (over) => ({ id: 'life-1', startedAt: NOW, endedAt: NOW, minutes: 30, tags: ['改文件'], ...over })
// 2026-10-06 扩写之后，一个条件底下有好几种说法（原来每个条件 2 句，2026-10-07 又扩了一遍）。
// 断言不能再钉死「一定得天刚亮那句」。改成先把这个条件下的**全部说法**采样出来，
// 再断言别处拿到的句子落在这个集合里——集合本身也钉住了（说法少于 10 种就算退化：
// 2026-10-07 扩写后冒险语气每个条件是 12~14 句，案牍是 6 句）。
const lifePool = (entry, prev = null, n = 60) => {
  const set = new Set()
  for (let i = 0; i < n; i += 1) {
    const line = lifeLine({ ...entry, id: `pool-${i}` }, 'adventure', prev)
    if (line) set.add(line)
  }
  return set
}
const MORNING = lifePool(LIFE({ startedAt: at(0, 6, 30) }))
/**
 * 早上那一池的**真身**（面板读的那一份）。
 *
 * 为什么另起一个：上面那几个 `lifePool(...)` 是**抽样**（60 个 id 里出现过的说法），
 * 池子里加一条新句，抽样可能刚好没抽到它——2026-10-08 中魔改造往早上的池子加了一条
 * 「他起来先把檐下那盏符灯灭了」，`MORNING` 里就没有它，于是下面那条「早上优先于歇」
 * 拿 `MORNING.has(...)` 判就红了（句子本身没错，是尺子不准）。判「这一句归哪一池」
 * 得对着池子判。
 */
const MORNING_POOL = new Set((PACKS.adventure.life || {}).morning || [])
const NIGHT = lifePool(LIFE({ startedAt: at(0, 23, 30) }))
const OUT = lifePool(LIFE({ startedAt: NOW }), { endedAt: NOW - 4 * 3600 * 1000 })
const OVERNIGHT = lifePool(LIFE({ startedAt: NOW }), { endedAt: NOW - 26 * 3600 * 1000 })
const LONGSIT = lifePool(LIFE({ startedAt: at(0, 14, 0), minutes: 180 }))
check('赶早的那一段：天刚亮他就起来了',
  MORNING.size >= 10 && /天刚亮|比营地里的人都早|窗板推开|灶上热了碗|晾在外头的靴子/.test([...MORNING].join('')), `${MORNING.size} 种说法`)
check('深夜的那一段：只剩他一扇窗亮着',
  NIGHT.size >= 10 && /只剩他这一扇窗|添了两回灯油|灯芯剪短|火盆里添了两块炭|打了个哈欠/.test([...NIGHT].join('')), `${NIGHT.size} 种说法`)
check('中间走了小半天：他出去过一趟',
  OUT.size >= 10 && /出去过一趟|鞋上还沾着泥|出去走了一圈|出去办了点事/.test([...OUT].join('')), `${OUT.size} 种说法`)
check('隔了一夜：他又坐到老位置上',
  OVERNIGHT.size >= 10 && /隔了一夜|落了层薄灰/.test([...OVERNIGHT].join('')), `${OVERNIGHT.size} 种说法`)
check('一口气坐太久：他中途歇过一回',
  LONGSIT.size >= 10 && /歇过一回|走了两圈|水壶坐到炉上/.test([...LONGSIT].join('')), `${LONGSIT.size} 种说法`)
check('生活层五个条件各自的说法互不重复（复制粘贴会串档）', (() => {
  const seen = new Set()
  for (const pool of [MORNING, NIGHT, OUT, OVERNIGHT, LONGSIT]) {
    for (const text of pool) {
      if (seen.has(text)) return false
      seen.add(text)
    }
  }
  return true
})(), `${MORNING.size}+${NIGHT.size}+${OUT.size}+${OVERNIGHT.size}+${LONGSIT.size} 种`)
check('生活层相邻两行不撞同一句（avoid 管用）', (() => {
  for (const entry of [LIFE({ startedAt: at(0, 6, 30) }), LIFE({ startedAt: at(0, 23, 30) }), LIFE({ startedAt: at(0, 14, 0), minutes: 180 })]) {
    for (const first of lifePool(entry)) {
      if (lifeLine(entry, 'adventure', null, first) === first) return false
    }
  }
  return true
})())
check('普通的下午、普通的长度，就没有这一句（大多数行是空的）',
  lifeLine(LIFE({ startedAt: at(0, 15, 0), minutes: 40 }), 'adventure') === '')
// 生活层是按**说法**分组的（`LIFE_POOLS[name][voice]`）。
// 2026-10-05：第二套说法「案牍」被用户摘掉了（连内容收在 .parked/ledger-voice/）。
// 它在的时候这里钉的是「案牍也有自己那五池」，现在钉的是**没有那一池会怎样**。
const lifePoolOf = (voice, entry, prev = null, n = 60) => {
  const set = new Set()
  for (let i = 0; i < n; i += 1) {
    const line = lifeLine({ ...entry, id: `pool-${i}` }, voice, prev)
    if (line) set.add(line)
  }
  return set
}
check('没有自己那一池说法的语气，那一行就安静着（不借冒险的词说别人的日子）', (() => {
  // 表里那一套是冒险，它五池俱全。临时往表里塞一个「有说法、没有日子」的探针，
  // 验的是 lifeLine 新那条规矩（原来它少哪一池就退到冒险那套去，等于替别人过日子）。
  VOICES.probe = { label: '探针', lines: {}, words: {} }
  try {
    const probe = LIFE({ startedAt: at(0, 6, 30) })
    return lifeLine(probe, 'probe') === '' && lifePoolOf('probe', probe).size === 0
  } finally {
    delete VOICES.probe
  }
})())
check('不存在的语气退回默认那一套，生活句照说',
  lifePoolOf('no-such-voice', LIFE({ startedAt: at(0, 6, 30) })).size >= 10)
check('早上的优先于「歇过一回」（先起得早，再谈歇）',
  MORNING_POOL.size >= 10
  && MORNING_POOL.has(lifeLine(LIFE({ startedAt: at(0, 6, 30), minutes: 180 }), 'adventure')))

// 片段拼出来的句子必须**同一天永远同一句**：看一眼是它，再看一眼还是它。
check('同一天看两眼是同一句话（种子只吃 id 和当天次数）',
  (() => {
    const e = { id: 'session-demo-1', startedAt: NOW - 60000, endedAt: NOW - 60000, minutes: 30, tags: ['改文件'], counts: { 改文件: 7 } }
    return narrationFor([e], NOW).line === narrationFor([{ ...e }], NOW).line
  })())
check('换一天（换 id）就会换一句',
  (() => {
    const mk = (id) => ({ id, startedAt: NOW - 60000, endedAt: NOW - 60000, minutes: 30, tags: ['改文件'] })
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => narrationFor([mk(id)], NOW).line))
    return seen.size > 1
  })())
check('句子会拿当天的真实次数说话（写成中文数字，不是「12 次」）',
  (() => {
    const line = narrationFor([{ id: 'x', startedAt: NOW - 60000, endedAt: NOW - 60000, minutes: 30, tags: ['改文件'], counts: { 改文件: 12 } }], NOW).line
    return /[一二三四五六七八九十]/.test(line) && !/\d/.test(line) && !/\{n\}/.test(line)
  })(),
  narrationFor([{ id: 'x', startedAt: NOW - 60000, endedAt: NOW - 60000, minutes: 30, tags: ['改文件'], counts: { 改文件: 12 } }], NOW).line)
check('次数只有一两次时不说「找了几遍」这种话（1 次不配计数）',
  !/\{n\}/.test(narrationFor([{ id: 'x', startedAt: NOW - 60000, endedAt: NOW - 60000, minutes: 30, tags: ['改文件'], counts: { 改文件: 1 } }], NOW).line))
check('十分钟内算人还在，超过就趴下打盹',
  narrationFor([R({ endedAt: NOW - 30 * 60000 })], NOW).line === '他趴在桌上打盹。',
  narrationFor([R({ endedAt: NOW - 30 * 60000 })], NOW).line)
// 2026-10-08（第三十六版）：「他出门了」不再把记号收起来。用户原话是
// 「角色必须一直显示在地图上」——他看见的是「角色标记不见了，他又跑了界外去了？？」。
// 出门那一支钉在**落脚处**（`home`），那句话也跟着改了（原来写「地图上找不到他」，
// 跟「记号常在」直接冲突；中间那版写的是「他出门了，这会儿在界碑外。」，
// 用户 2026-10-08 又拍了「从来不存在界外」，所以界外那一枚野地整个删掉，回到落脚处）。
const AWAY_LINE = '他出门去了，这会儿不在。'
check('出门了就出门了，不写一句等你回来',
  narrationFor([R({ endedAt: NOW - 5 * 3600 * 1000 })], NOW).line === AWAY_LINE)
check('出门了记号也不收：钉在落脚处（home）',
  narrationFor([R({ endedAt: NOW - 5 * 3600 * 1000 })], NOW).place === 'home',
  String(narrationFor([R({ endedAt: NOW - 5 * 3600 * 1000 })], NOW).place))
check('超过三小时和「压根没有记录」一样安静',
  narrationFor([], NOW).line === narrationFor([R({ endedAt: NOW - 5 * 3600 * 1000 })], NOW).line)
check('压根没有记录的时候记号也在（同样钉在落脚处）', narrationFor([], NOW).place === 'home',
  String(narrationFor([], NOW).place))
// 连续性只存在于句子里（用户 m02673 拍的板）：隔天了才顺口提一句上次在哪儿，
// 同一天不提、只有一段也不提，而且永远不出现天数/等级/进度条。
{
  const prevDay = { startedAt: at(1, 14, 0), endedAt: at(1, 15, 0), minutes: 60, tags: ['翻文件'] }
  const awayWith = (entries) => narrationFor(entries, NOW).line
  const longAgo = [R({ endedAt: NOW - 5 * 3600 * 1000 }), prevDay]
  check('出门了会顺口提一句上次在哪儿（隔天了）',
    awayWith(longAgo) === `${AWAY_LINE}上次见到他是在银树书库。`, awayWith(longAgo))
  check('同一天的上一段不算「上次」',
    awayWith([R({ endedAt: NOW - 5 * 3600 * 1000 }), R({ startedAt: at(0, 9, 0), endedAt: at(0, 10, 0), minutes: 60, tags: ['翻文件'] })])
    === AWAY_LINE)
  check('只有一段记录的时候也不提「上次」', awayWith([longAgo[0]]) === AWAY_LINE)
  check('那句话里没有天数、等级、进度（连续性只在句子里）',
    !/\d+\s*(天|级|进度|连续)/.test(awayWith(longAgo)), awayWith(longAgo))
  check('人物在的时候不提「上次」（那句话只挂在出门那一句上）',
    // 2026-10-07：原来比的是「有前一天的记录 / 没有」两次算出来的整句一字不差。
    // 加了承接句之后，前面有一行旧记录会让这一行的开头真的不一样（那是**要的**），
    // 所以这里改成直接盯那句「上次」——它只许出现在出门那一句上。
    !/上次/.test(narrationFor([R({ tags: ['改文件'] }), prevDay], NOW).line),
    narrationFor([R({ tags: ['改文件'] }), prevDay], NOW).line)
}
check('凌晨那盏灯还亮着',
  narrationFor([R({ tags: ['改文件'], endedAt: at(0, 1, 25) })], at(0, 1, 30)).line === '别人都睡了，他那扇窗还亮着。',
  narrationFor([R({ tags: ['改文件'], endedAt: at(0, 1, 25) })], at(0, 1, 30)).line)
check('回来打个转（在落脚处，说的是落脚处的事）',
  HOME_LINES.includes(narrationFor([R({ minutes: 2 })], NOW).line) &&
  homeOnly(narrationFor([R({ minutes: 2 })], NOW).line),
  narrationFor([R({ minutes: 2 })], NOW).line)
check('一口气坐太久', narrationFor([R({ minutes: 200 })], NOW).line === '他从下午一直坐到灯快没油。')
// 2026-10-08（第三十六版）：户外的记号不许在「凌晨那盏灯还亮着」和「一口气坐太久」
// 这两条分支上悄悄换回城里的屋子。那两条 return 原来写的是 `place`
// （= `ACTION_PLACE[act]`，动作那间屋子），**没看 `hit.place`**——他明明在野地里，
// 过了零点记号会跑回卷轴塔。这个只有在真浏览器里看截图才发现（冒烟当时没覆盖到）。
// 挑中哪一件活是拿 id 当散列键的，试出来为止。**而且散列键里带着那一格的时间**，
// 所以「凌晨」那一条得在那个钟点上重新挑一遍 id——拿 `NOW` 挑出来的 id 换到 01:30 用，
// 挑中的就是另一件活了。
const wildAt = (clock, over) => {
  for (let i = 0; i < 8000; i++) {
    const r = R({
      id: `w-${i}`, tags: ['改文件'], counts: { 改文件: 12 },
      startedAt: clock - 25 * 60000, endedAt: clock - 5 * 60000, ...over,
    })
    const n = narrationFor([r], clock)
    if (n.place && PLACES[n.place] && PLACES[n.place].wild) return { r, n }
  }
  return null
}
const wildOne = wildAt(NOW)
check('找得到一条「他在野地里」的记录（不然下面两条是空跑）',
  !!wildOne, wildOne ? `${wildOne.r.id} → ${wildOne.n.place}` : '一条都没撞上')
const NIGHT_CLOCK = at(0, 1, 30)
const wildNight = wildAt(NIGHT_CLOCK)
check('凌晨那盏灯还亮着的时候，野地里的记号不换地方',
  !!wildNight && wildNight.n.place !== 'home'
  && narrationFor([wildNight.r], NIGHT_CLOCK).place === wildNight.n.place,
  wildNight ? `${wildNight.n.place} → ${String(narrationFor([wildNight.r], NIGHT_CLOCK).place)}` : '一条都没撞上')
check('一口气坐太久的时候，野地里的记号也不换地方',
  !!wildOne && narrationFor([{ ...wildOne.r, minutes: 200 }], NOW).place === wildOne.n.place,
  wildOne ? `${wildOne.n.place} → ${String(narrationFor([{ ...wildOne.r, minutes: 200 }], NOW).place)}` : '—')
check('没有说话、也没有标签的一天照样有人', narrationFor([R({})], NOW).line === '他还在那儿，手没停。')

// 2026-10-05 起缺 id 的记录会拿到一个临时 id（见 withIds），所以「这一天说什么」
// 一律走 composeSequence——这条断言钉的是「顶上那句与见闻录那一行同源」这件事本身。
const seqLine = (over) => [...composeSequence([R(over)], 'adventure').values()][0].line
check('见闻录里那一天：有主线就说主线（跟上面「他在干什么」是同一句）',
  narrationFor([R({ tags: ['翻文件'] })], NOW).line === seqLine({ tags: ['翻文件'] }),
  seqLine({ tags: ['翻文件'] }))
check('见闻录里那一天：打个转说出来（也是落脚处的事）',
  HOME_LINES.includes(dayLine({ minutes: 2, tags: ['改文件'] })) &&
  homeOnly(dayLine({ minutes: 2, tags: ['改文件'] })),
  dayLine({ minutes: 2, tags: ['改文件'] }))
check('见闻录里那一天：深夜', dayLine({ minutes: 30, tags: ['深夜'] }) === '别人都睡了，他那扇窗还亮着。')
check('见闻录里那一天：久坐', dayLine({ minutes: 150, tags: [] }) === '他一个人坐了很久。')
check('见闻录里那一天：什么都没有就留白', dayLine({ minutes: 30, tags: [] }) === '那天他没什么动静。')

/* --- 地图：他去哪儿 ------------------------------------------------ */

check('改文件 = 抄写室', placeOf({ minutes: 30, tags: ['改文件'] }) === 'scriptorium')
check('跑命令 = 工坊', placeOf({ minutes: 30, tags: ['跑命令'] }) === 'workshop')
check('派了活 = 公会', placeOf({ minutes: 30, tags: ['派了活'] }) === 'guild')
check('打个转就回落脚处', placeOf({ minutes: 2, tags: ['改文件'] }) === 'home')
check('没动作也回落脚处', placeOf({ minutes: 40, tags: ['深夜'] }) === 'home')
check('地图上没有名字的地方就说空话', placeName('nowhere') === '')
check('地名的说法跟着世界走', placeName('archive', 'adventure') === '银树书库',
  placeName('archive', 'adventure'))
check('每栋房子都有名字；没有自己那套说法的就退到默认那套', (() => {
  // 表里还留着当年第二套说法（案牍）写的那批地名（档案塔 / 抄写室），
  // 但那一套 2026-10-05 已经摘掉了，所以这里钉的是**退路**：给一个不存在的说法，
  // 说出来的仍是默认那一套的名字，不是空的。
  return Object.keys(PLACES).every((id) => placeName(id, 'adventure'))
    && placeName('archive', 'no-such-voice') === placeName('archive', 'adventure')
})())
check('每个动作都指向一张地图上真有的房子',
  ACTION_TAGS.every((tag) => {
    const p = placeOf({ minutes: 30, tags: [tag] })
    return p === null || Boolean(PLACES[p])
  }))
// 用户 m02118 要的就是「显示主人公在哪个地方进行活动」。
// 六个动作必须落在六个不同的地方——糊在同一个点上等于没做地图。
check('六个动作散在六个不同的地方',
  new Set(ACTION_TAGS.map((t) => placeOf({ minutes: 30, tags: [t] }))).size === ACTION_TAGS.length,
  ACTION_TAGS.map((t) => `${t}:${placeOf({ minutes: 30, tags: [t] })}`).join(' '))
/* --- 地图：运行时现画，跟当年那张图一字不差 --------------------------- *
 * 2026-10-08 起，`buildMap()` 就是 `g.innerHTML = mapSvg()`（`src/map/world.js`，
 * 带记忆化）：图是**算出来的**。`src/map-data.js`（532 KB）搬去 `.scratch/` 之后，
 * 在这儿的身份只剩一个——**回归夹具**，用来钉「现画的结果跟当年那张图一模一样」。
 *
 * 这里原来站着二十来条断言，逐点验「山都长在陆地上」「河从山里流到海里」——
 * 那是给**代码现画**的地图配的安全网。地图仍然由代码画，但那套判据在移植进 JS
 * 之后变成了验死数据（`src/map/world.js` 与 `.scratch/terrain.py` 已逐字节对过
 * 2762 项），留着比删掉危险，所以整段删了，换成盯真东西的这几条。
 * 地貌本身对不对，源头是 `.scratch/world3.py` 的 `check()` 与 `src/map/README.md`
 * 里那几条对表命令；这几条不替代它们。
 * ------------------------------------------------------------------- */

const SHAPES = HAVE_MAP_FIXTURE ? (MAP_SVG.match(/<(path|circle|rect|ellipse|line|polyline|polygon)\b/g) || []).length : 0
/* 2026-10-06 第二版世界图（`.scratch/terrain.py` 画的）：国名与地貌名**烘进图里**了。
 * 上一版不烘，是因为那张图上唯一的字是「他现在在哪儿」——那种字必须跟着记录变，
 * 只能由 client.js 叠上去。国名不是那种字：它是这张图自己的家具，跟山、河一样是
 * 死数据，烘进去反而少一层要对齐的东西（叠在上面的只剩记号、地名签、灯三样）。
 * 所以这条盯的变成「**随记录变的那一层**不许烘进去」——数量封顶，且不许有 tspan。 */
const TEXTS = HAVE_MAP_FIXTURE ? (MAP_SVG.match(/<text\b/g) || []).length : 0
/* 2026-10-27（地图审计 M-3）：封顶从 30 放到 60。原来那 30 是「当年图上只有 19 个国名与
 * 地貌名」时拍的；现在二十座城的城名与九座二级国的国名也烘进来了（城画了却一个名字都
 * 没有，M-3）。这条的本意没变：**随记录变的那一层不许烘进去**——所以仍要封顶、仍不许
 * 有 tspan；变的只是「家具」数得清的上限。 */
checkOnFixture('地图里烘进去的字只有国名、地貌名与城名（跟着记录变的那层仍然叠在外面）',
  TEXTS > 0 && TEXTS <= 60 && !/<tspan/i.test(MAP_SVG || ''),
  HAVE_MAP_FIXTURE ? `${TEXTS} 个 <text> / ${(MAP_SVG.length / 1024).toFixed(0)} KB` : '')
checkOnFixture('地图里没有位图（是画的，不是贴的图）',
  !/data:image|<image\b/i.test(MAP_SVG || ''))
checkOnFixture('地图是画出来的（几千个形状，不是一个矩形）',
  SHAPES > 2000, `${SHAPES} 个形状`)
checkOnFixture('地图的样式全挂在 .gf-map 底下（不许漏出来污染面板）',
  (MAP_CSS || '').split('}').filter((r) => r.includes('{')).every((r) => /\.gf-map\b/.test(r.split('{')[0])),
  (MAP_CSS || '').split('}').filter((r) => r.includes('{') && !/\.gf-map\b/.test(r.split('{')[0]))
    .map((r) => r.split('{')[0].trim()).join(' | '))
// 2026-10-08（第三十六版）：七个城里 ＋ 六个野地。野地是给「户外的活」配落点的——
// 记号因此永远有地方可钉。**没有兜底的「界外」那一枚**：用户 2026-10-08 拍了
// 「从来不存在界外，如果是下矿洞，那就写下矿洞」，所以「他出门了」钉落脚处（`home`）。
check('十三个地点：七个城里 ＋ 六个野地，一个不多一个不少', Object.keys(PLACES).length === 13,
  Object.keys(PLACES).join(','))
check('七个城里的是「有房子的」（没有 wild 标记）',
  Object.values(PLACES).filter((p) => !p.wild).length === 7)
check('六个野地都标了 wild（野地：没有城里的熟人，也不在城里）',
  Object.values(PLACES).filter((p) => p.wild).length === 6,
  Object.values(PLACES).filter((p) => p.wild).map((p) => p.id).join(','))
check('野地的名字都是地图上真有的地方（没有「界外」那一枚）',
  !PLACES.road
  && Object.values(PLACES).filter((p) => p.wild).every((p) => (p.name.adventure || '') !== '界外'
    && (p.name.adventure || '') !== '界碑外'),
  Object.values(PLACES).filter((p) => p.wild).map((p) => p.name.adventure).join(' / '))
check('每栋房子门口那块空地都不一样（记号不会叠在一起）',
  new Set(Object.values(PLACES).map((p) => p.door.join(','))).size === Object.keys(PLACES).length)
// 记号、地名签、灯都是**叠在地图上**的，所以它们必须落在地图那个框里，
// 不然记号会飘到画布外面去（框就是 SVG 自己的 viewBox）。
// 2026-10-06：世界换成了 `.scratch/terrain.py` 画的那张（world3 的 66×34），
// 画布就是内容本身——框从 0,0 起，没有一圈要裁掉的空白，所以下面这条容得下 0。
// 它盯的仍然是「别把 96×54 那个老画布又捡回来」（bw/bh 那一半）。
const stageBox = buildStage().svg.getAttribute('viewBox').split(' ').map(Number)
const [bx, by, bw, bh] = stageBox
check('地图的框跟地图内容对得上（不是老画布那个框）',
  bw < 100 && bh < 100 && bx >= 0 && by >= 0, `viewBox ${stageBox.join(' ')}`)
check('七个地点都在那个框里（记号不会跑到画布外面）',
  Object.values(PLACES).every((p) => p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh),
  Object.values(PLACES).filter((p) => !(p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh)).map((p) => p.id).join(','))

// 换主题 = 换一组颜色。少一个键就会在切主题时穿帮（classics 漏过 land，被这条抓住过）。
const THEME_KEYS = [
  '--gf-land-farm', '--gf-land-elven', '--gf-land-rock', '--gf-land-sand', '--gf-leaf-elf',
  '--gf-land-line', '--gf-water-line', '--gf-roof-line', '--gf-wood-line',
  '--gf-paper-line', '--gf-cloth-line', '--gf-stone-line', '--gf-leaf-line',
]
for (const [id, theme] of Object.entries(THEMES)) {
  /* 夜里那层现在是**覆盖层**（2026-10-07 木与铜：同一块木板夜里更暗，不再换一整套
     材料），所以要比对的是叠完之后的色板，不是它自己那几十行。 */
  const sets = [['白天', theme.tokens], ...(theme.tokensDark ? [['夜里', { ...theme.tokens, ...theme.tokensDark }]] : [])]
  for (const [label, set] of sets) {
    const missing = THEME_KEYS.filter((k) => !set[k])
    check(`${id} 主题（${label}）的领地色和描边色都齐`,
      missing.length === 0, missing.length ? `缺 ${missing.join(' ')}` : `${THEME_KEYS.length} 个键`)
  }
}
/* 界面审计 U1/U7/U8 的根：某个主题**少定义一枚 token** 是无声的——`var()` 会静静落到
   兜底值上。classics 就这样丢掉过地名字色（浅奶油压浅纸，1.16:1）、小标题（整片灰）、
   地名签细边与地图凹槽（computed 直接 none），而没有任何断言会红。这里堵两个口子：

   ① 凡是被读、而且**没写兜底**的 `--gf-*`，两套主题都必须自己定义（缺了就红）；
   ② 有几枚**有兜底、但缺了会掉色**的（就是 U1/U7/U8 的现场），列成一张白名单，
      两套主题同样必须自己给值——写兜底不等于可以不定义。 */
const RUNTIME_TOKENS = new Set(['--gf-dusk', '--gf-glow', '--gf-crack-dim']) // JS 按钟点现写的，不归主题管
const SHADOWABLE_TOKENS = [
  '--gf-place-fg', '--gf-tag-fg', '--gf-k-fg', '--gf-head-fg', '--gf-week-fg',
  '--gf-room-line', '--gf-stage-shadow', '--gf-grain', '--gf-door-filter',
]
const clientSource = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
const noFallback = new Set()
for (const hit of clientSource.matchAll(/var\((--gf-[a-z0-9-]+)([^)]*)\)/g)) {
  if (!hit[2].trimStart().startsWith(',')) noFallback.add(hit[1])
}
for (const [id, theme] of Object.entries(THEMES)) {
  const missing = [...new Set([...noFallback, ...SHADOWABLE_TOKENS])]
    .filter((key) => !RUNTIME_TOKENS.has(key) && !theme.tokens[key])
  check(`${id} 主题把该自己定义的 token 都定义了（缺一枚会静静落到兜底上，没人知道）`,
    missing.length === 0, missing.length ? `缺 ${missing.join(' ')}` : `${noFallback.size} 枚没兜底 + ${SHADOWABLE_TOKENS.length} 枚掉色的，都齐`)
}

// 深色那层只该改「木料与铜」（底色、字色、线、影），不该重画地图——
// 地图要暗是**天黑了**那件事，由 applyDaylight / dimForDusk 按钟点压，不是 DSH 的深色开关。
check('深色那层是覆盖层，不重画地图（地图的暗归钟点管）',
  !Object.keys(THEMES.plain.tokensDark).some((k) => k === '--gf-land' || k.startsWith('--gf-land-') ||
    k === '--gf-water' || k.startsWith('--gf-water-') || k === '--gf-roof-hi' ||
    k.startsWith('--gf-paper-') || k.startsWith('--gf-wood-') || k.startsWith('--gf-leaf') ||
    k.startsWith('--gf-stone-') || k.startsWith('--gf-cloth-') || k.startsWith('--gf-cloak-') ||
    k === '--gf-ink' || k === '--gf-cave' || k === '--gf-skin' || k === '--gf-dusk-color'),
  Object.keys(THEMES.plain.tokensDark).length + ' 个键')

/* --- 记号：他此刻在地图上的哪个点 ----------------------------------- */
// 平面地图上记号就直接钉在门口那个坐标上，再往上抬一点点。
// 2026-10-31（t29）：记号搬进 HTML 那一层之后它没有 `transform` 属性可咬了（位置在
// `style.transform` 上、单位是像素），所以改咬元素上记着的那对世界坐标（`data-at`）。
const pinAt = ([dx, dy]) => `${dx.toFixed(1)},${dy.toFixed(1)}`
// 2026-10-08：并进户外的活（描残咒 / 下矿坑 / 查夜哨…）之后，一个动作挑到哪件事是掷骰子，
// 「记号落在哪个点」不再由动作单独决定（挑到户外的活记号要收起来，见下一条）。
// 这一节验的是**记号机制**本身，所以直接喂一个说清楚的 narration：给哪个地方，就钉在哪个门口。
const nowAt = (t) => ({ line: '他还在那儿，手没停。', place: placeOf({ minutes: 33, tags: [t] }), act: t, hour: 12 })
check('六个动作在地图上给出六个不同的点（人真的会挪）',
  new Set(ACTION_TAGS.map((t) => {
    const stage = buildStage()
    renderStage(stage, nowAt(t))
    return stage.pin.getAttribute('data-at')
  })).size === ACTION_TAGS.length)
check('记号就钉在他那道门口',
  (() => {
    const stage = buildStage()
    renderStage(stage, nowAt('翻文件'))
    return stage.pin.getAttribute('data-at') === pinAt(PLACES.archive.door)
  })())
// 2026-10-08（第三十六版）：原来这条叫「出门了记号就收起来」——用户看见的正是
// 这个（「角色标记不见了，他又跑了界外去了？？」）。现在反过来：出门了记号照在，
// 钉在落脚处，`data-place` 是 `home`。
check('出门了记号照在，钉在落脚处（data-place 是 home）',
  (() => {
    const stage = buildStage()
    renderStage(stage, narrationFor([{ startedAt: NOW - 9 * 3600 * 1000, endedAt: NOW - 5 * 3600 * 1000, minutes: 33, tags: ['改文件'] }], NOW))
    return stage.pin.style.opacity === '1' && stage.pin.getAttribute('data-place') === 'home'
  })())

/* --- 他不在两地之间瞬移（2026-10-05 用户第 1 条）--------------------- *
 * 原话：「他移动得太快了……上一分钟还在落脚处，下一分钟就到了卷轴塔，这简直是在飞。」
 * 地图是 96×54 的世界，所以两座城之间本来就有远近：走一趟按门口直线距离算时长。
 * ------------------------------------------------------------------- */
check('走一趟有远近之分：横穿全图比隔壁镇久得多',
  travelMs('scriptorium', 'guild') > travelMs('home', 'guild'),
  `${travelMs('scriptorium', 'guild')} vs ${travelMs('home', 'guild')}`)
check('再近也有个下限（不是瞬间到）',
  travelMs('scriptorium', 'home') >= 1200, `${travelMs('scriptorium', 'home')}`)
check('最远那一趟也短于界面重画的节拍（5 秒）',
  Math.max(...Object.keys(PLACES).flatMap((a) => Object.keys(PLACES).map((b) => travelMs(a, b)))) <= 3600)
check('本来就在那儿就不用走', travelMs('archive', 'archive') === 0)
check('认不出的地方不用走', travelMs('nowhere', 'archive') === 0 && travelMs('archive', 'nowhere') === 0)
// 自检里那套最小 DOM 垫片没有 requestAnimationFrame，所以 walk 会一步走到终点——
// 能断言的就变成「它确实是从上一个地方出发的」和「它最后落在目标门口」。
check('位置变了就从上一个地方出发（不是凭空出现在新地方）',
  (() => {
    const stage = buildStage()
    renderStage(stage, nowAt('翻文件'), 'adventure', 'home')
    return stage.pin.getAttribute('data-from') === 'home'
      && stage.pin.getAttribute('data-place') === 'archive'
      && stage.pin.getAttribute('data-at') === pinAt(PLACES.archive.door)
  })())
check('第一次画的时候没有「上一个地方」这回事',
  (() => {
    const stage = buildStage()
    renderStage(stage, narrationFor([{ startedAt: NOW - 20 * 60000, endedAt: NOW, minutes: 33, tags: ['翻文件'] }], NOW))
    return stage.pin.getAttribute('data-from') === null
  })())
check('上一次也是这个地方，就不重复走一趟',
  (() => {
    const stage = buildStage()
    // 位置给死成 `archive`：2026-10-08 那六个户外的活各自有了落点之后，
    // 「翻文件」这一串挑到 `tower` / `watch` 就会真的走一趟（那是**要的**），
    // 而这条断言问的是「同一个地方要不要走」。
    const n = { ...narrationFor([{ startedAt: NOW - 20 * 60000, endedAt: NOW, minutes: 33, tags: ['翻文件'] }], NOW), place: 'archive' }
    renderStage(stage, n, 'adventure', 'archive')
    return stage.pin.getAttribute('data-from') === null
  })())

/* --- 两级地图：全图（L0）↔ 细节版（L1）（2026-10-08 用户 m19416 定的） ------- */
// 世界图 66×34、细节版 22×11.35——**九分之一面积、三倍线性分辨率**。
// 放大不是 `scale`，是**换 viewBox**：viewBox 一收成那扇窗，世界图那层（`<use>` 借同一份
// DOM，一个字节都不复制）自动就是 3 倍，现画的地方图那层天然 1:1。所以内容那两层
// 一个 transform 都不写——只有记号/灯/地名签那一层要一个反缩放（见下面那条断言）。
// 自检的垫片没有 getBoundingClientRect，`clientWidth` 给的是 350，所以像素↔世界的比例
// 全图是 350/66、细节版是 350/22——下面喂指针坐标时按这两个换算。
const { build_local, focusAt, check: localCheck, FOCUS: LOCAL_FOCUS } = await import('../src/map/local.js')
const PXU = 350 / 66 // 全图：1 世界单位 = 350/66 像素
const PXZ = 350 / 22 // 细节版：1 世界单位 = 350/22 像素
/** 七个地点各钉在哪座城——细节版聚到的那座必须是同一座。 */
const CITY_OF = Object.fromEntries(
  Object.entries(PLACES).map(([id, p]) => [id, focusAt(p.door[0], p.door[1]).focus]),
)
/**
 * 面板会把窗心夹在哪儿、吸附到哪儿（跟 client.js 的 zoomOrigin 同一套算法）。
 * 第六十六版起 `ZOOM_EDGE = 0`：**整扇窗必须落在世界图里面**——留余量那会儿，
 * 贴边露出来的那一角底下会冒出全图那张世界图（拖动时推得够远还会整片露出来）。
 */
const winOrigin = (cx, cy) => {
  const q = (v) => Math.round(v / 0.25) * 0.25
  // 两头取整到格子上再夹（跟 client.js 一样）：不然吸附那一下会往外挪半格，
  // 34 − 11.35 = 22.65 吸成 22.75，底边就露出 0.1 个世界单位。
  const loX = Math.ceil(0 / 0.25) * 0.25
  const hiX = Math.floor((66 - 22) / 0.25) * 0.25
  const loY = Math.ceil(0 / 0.25) * 0.25
  const hiY = Math.floor((34 - 11.35) / 0.25) * 0.25
  return [
    q(Math.min(Math.max(cx - 11, loX), hiX)),
    q(Math.min(Math.max(cy - 11.35 / 2, loY), hiY)),
  ]
}
/** 那扇窗的 viewBox 该怎么写（跟 client.js 的 zoomSetWin 一样，两位小数）。 */
const winBox = (wx, wy) => `${wx.toFixed(2)} ${wy.toFixed(2)} 22 11.35`
/**
 * 全图里点一下（进细节版），返回那个 stage。
 *
 * 进去那一扇是**当场**画的（`zoomEnter` → `zoomDraw`，不等计时器），所以只留一点点
 * 时间让读数的次序稳一点。
 */
const clickIn = async (mx, my) => {
  const stage = buildStage()
  stage.svg.dispatch('pointerdown', { clientX: mx * PXU, clientY: my * PXU })
  await new Promise((r) => setTimeout(r, 20))
  return stage
}
/**
 * 细节版里按住拖 dx,dy 个世界单位，松手。返回**拖到一半时**那三个读数。
 *
 * 起手那一点给的是世界坐标 (mx,my)，得按当前那扇窗换算成屏幕坐标——
 * 细节版里 `k = 350 / 22` 像素每世界单位（见 `zoomMove`）。
 */
const dragBy = (stage, mx, my, dx, dy) => {
  const [wx, wy] = stage.zoomWin
  const X = (mx - wx) * PXZ
  const Y = (my - wy) * PXZ
  stage.svg.dispatch('pointerdown', { clientX: X, clientY: Y, pointerId: 1 })
  stage.svg.dispatch('pointermove', { clientX: X + dx * PXZ, clientY: Y + dy * PXZ, pointerId: 1 })
  const during = {
    pan: stage.zoomPan.getAttribute('transform'),
    on: stage.zoomLocal.getAttribute('data-on'),
    drag: stage.zoomLocal.getAttribute('data-drag'),
    zdrag: stage.zoom.getAttribute('data-drag'),
    mdrag: stage.mini.getAttribute('data-drag'),
    world: stage.zoomWorld.getAttribute('display'),
    ovl: stage.overlay.getAttribute('transform'),
  }
  stage.svg.dispatch('pointerup', { clientX: X + dx * PXZ, clientY: Y + dy * PXZ, pointerId: 1 })
  during.after = {
    pan: stage.zoomPan.getAttribute('transform'),
    drag: stage.zoomLocal.getAttribute('data-drag'),
    zdrag: stage.zoom.getAttribute('data-drag'),
    mdrag: stage.mini.getAttribute('data-drag'),
    ovl: stage.overlay.getAttribute('transform'),
  }
  return during
}

check('刚建出来的地图只有一张（细节版那一层还没画东西，不算数）',
  buildStage().svg.all('gf-map').length === 1,
  String(buildStage().svg.all('gf-map').length))

check('画布上的次序是：地图 → 细节版（地面在下、界面在上）',
  (() => {
    const order = buildStage().svg.children
      .map((c) => c.getAttribute('class') || c.tagName.toLowerCase())
      .join(' > ')
    return order === 'gf-map > defs > gf-zoom'
  })(),
  buildStage().svg.children.map((c) => c.getAttribute('class') || c.tagName.toLowerCase()).join(' > '))

// 用户 m23060 报「角色标记一卡一卡」（那是 steps(4, end) 的跳），m23080 批甲：
// 把灯 / 记号 / 地名签从地图那张 SVG 里搬进**自己的一张 SVG**，让它自己成一层，
// 动画改回光滑之后只重画这一小层。这条钉住「真的搬出去了、里面装的就是那一组」。
check('灯 / 记号 / 地名签住在自己的一张 SVG 里（不是地图那张里面）',
  (() => {
    const s = buildStage()
    const kids = s.overlaySvg.children.map((c) => c.getAttribute('class') || c.tagName.toLowerCase())
    return String(s.overlaySvg.tagName).toLowerCase() === 'svg'
      && s.overlaySvg.getAttribute('class') === 'gf-overlay-svg'
      && s.overlaySvg.getAttribute('viewBox') === '0 0 66 34'
      && kids.join(' > ') === 'gf-overlay'
      && s.svg.all('gf-overlay').length === 0
  })(),
  (() => {
    const s = buildStage()
    return `<${s.overlaySvg.tagName} class="${s.overlaySvg.getAttribute('class')}"> 里是 `
      + s.overlaySvg.children.map((c) => c.getAttribute('class') || c.tagName.toLowerCase()).join(' > ')
      + `；地图那张里还剩 ${s.svg.all('gf-overlay').length} 组`
  })())

check('一上来是全图：细节版收着、小全图与那颗按钮都不露',
  (() => {
    const s = buildStage()
    return s.zoom.getAttribute('display') === 'none'
      && s.svg.getAttribute('viewBox') === '0 0 66 34'
      && s.mini.getAttribute('display') === 'none'
      && s.back.getAttribute('hidden') === ''
  })(),
  (() => {
    const s = buildStage()
    return `细节版 ${s.zoom.getAttribute('display')}／取景框 ${s.svg.getAttribute('viewBox')}`
      + `／小全图 ${s.mini.getAttribute('display')}／按钮 hidden=${s.back.getAttribute('hidden')}`
  })())

check('全图里点一下，进细节版：取景框收成那扇窗，小全图与那颗按钮都出来',
  (() => {
    const s = buildStage()
    const [mx, my] = [12.8, 28.69]
    s.svg.dispatch('pointerdown', { clientX: mx * PXU, clientY: my * PXU })
    const [wx, wy] = winOrigin(mx, my)
    return s.zoom.getAttribute('display') === null
      && s.svg.getAttribute('viewBox') === winBox(wx, wy)
      && s.mini.getAttribute('display') === null
      && s.back.getAttribute('hidden') === null
  })(),
  (() => {
    const s = buildStage()
    const [mx, my] = [12.8, 28.69]
    s.svg.dispatch('pointerdown', { clientX: mx * PXU, clientY: my * PXU })
    const [wx, wy] = winOrigin(mx, my)
    return `${s.svg.getAttribute('viewBox')}（该是 ${winBox(wx, wy)}）`
      + `／小全图 ${s.mini.getAttribute('display')}／按钮 hidden=${s.back.getAttribute('hidden')}`
  })())

// 记号那张 SVG 的 viewBox 必须跟地图那张同步：两张盖在同一块地方、世界坐标得是同一个取景框，
// 不然记号会按旧框换算、跑到别处去（进细节版与回全图两处都要跟）。
check('记号那张 SVG 的取景框跟地图同步（进细节版跟、回全图也跟）',
  (() => {
    const s = buildStage()
    const a = s.overlaySvg.getAttribute('viewBox')
    const [mx, my] = [12.8, 28.69]
    s.svg.dispatch('pointerdown', { clientX: mx * PXU, clientY: my * PXU })
    const b = s.overlaySvg.getAttribute('viewBox')
    const c = s.svg.getAttribute('viewBox')
    s.svg.dispatch('dblclick', {})
    const d = s.overlaySvg.getAttribute('viewBox')
    return a === '0 0 66 34' && b === c && b !== a && d === '0 0 66 34'
  })(),
  (() => {
    const s = buildStage()
    const a = s.overlaySvg.getAttribute('viewBox')
    const [mx, my] = [12.8, 28.69]
    s.svg.dispatch('pointerdown', { clientX: mx * PXU, clientY: my * PXU })
    return `全图 ${a} → 细节版 ${s.overlaySvg.getAttribute('viewBox')}（地图那张 ${s.svg.getAttribute('viewBox')}）`
  })())

check('进细节版就画那一扇窗的地方图（3× 全细节，带 gf-map 类），底下垫的世界图就收起来',
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    return s.zoomLocal.children.length > 100
      && s.zoomLocal.getAttribute('data-on') === ''
      && s.zoomLocal.className === 'gf-map gf-zoom-local'
      && s.zoomWorld.getAttribute('display') === 'none'
  })()),
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    return `${s.zoomLocal.children.length} 个顶层元素／class=${s.zoomLocal.className}`
      + `／底下那层 ${s.zoomWorld.getAttribute('display')}`
  })()))

check('细节版底下垫的是世界图自己（借过去的，不是复制一份）',
  buildStage().zoomWorld.children.length === 1
  && buildStage().zoomWorld.children[0].tagName === 'USE'
  && buildStage().zoomWorld.children[0].getAttribute('href') === '#gf-world',
  (() => {
    const w = buildStage().zoomWorld.children[0]
    return w ? `${w.tagName} ${w.getAttribute('href')}` : '（空的）'
  })())

/* 丙（2026-10-08）：拖动期间地面上换成一张**预先烘好的位图**（见 `zoomShotBake`）。
   它平时藏着（`data-on` 不在就不显示），烘好了才在拖动时顶上来（`zoomGround`）。
   这里只查结构——「到底烘出来没有」由真浏览器探针说话：垫片里没有 Blob / Image /
   画布，那一段整段跳过（烘不出来就一直走矢量，功能一模一样）。 */
const shotProbe = (() => {
  const s = buildStage()
  const img = s.zoomBit.children[0]
  const night = s.zoomBit.children[1]
  return {
    ok: s.zoomBit.tagName === 'G' && s.zoomBit.getAttribute('data-on') === null
      && s.zoomBit.children.length === 2
      && img.tagName === 'IMAGE' && img.getAttribute('class') === 'gf-zoom-shot'
      && Number(img.getAttribute('width')) === VIEW.w && Number(img.getAttribute('height')) === VIEW.h
      && night.getAttribute('class') === 'mnight'
      && Number(night.getAttribute('width')) === VIEW.w && Number(night.getAttribute('height')) === VIEW.h,
    read: `${s.zoomBit.tagName}.${s.zoomBit.getAttribute('class')} 里 ${s.zoomBit.children.length} 个：`
      + `${img.tagName} ${img.getAttribute('width')}×${img.getAttribute('height')}`
      + ` ＋ ${night.getAttribute('class')}；data-on=${s.zoomBit.getAttribute('data-on')}（该是 null＝平时藏着）`,
  }
})()

check('拖动时顶上来那张位图是备好的（一张整幅的图 ＋ 一块夜罩），平时藏着',
  shotProbe.ok, shotProbe.read)

/* 拖动：**只挪一层空的 `<g>`**（实测 252 帧掉 1 帧），地方图那 4700 个元素一挪就是
   21 帧，所以一进拖动就把它收起来、让底下那层世界图顶上来，松手以后再画
   （见 `zoomMove` / `zoomUp`）。 */
const dragProbe = (() => {
  const s = buildStage()
  // 从世界正中进去：贴边的窗（比如 (12.8, 28.69) 那扇）再往外拖会被夹住（第六十六版）。
  s.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU })
  const [wx, wy] = s.zoomWin
  const during = dragBy(s, wx + 11, wy + 11.35 / 2, 3, 0)
  return {
    ok: during.pan === 'translate(3.00 0.00)' && during.on === null
      && during.drag === '' && during.world === null,
    read: `拖到一半：挪的那一层 ${during.pan}／地方图 data-on=${during.on}（该是撤掉）`
      + `／data-drag=${during.drag}（该是空串＝真不画）／底下那层 ${during.world}（该是露出来）`,
  }
})()

check('按住一拖：只有一层在挪、地方图先收起来（真不画）、底下那层世界图顶上来',
  dragProbe.ok, dragProbe.read)

/* 用户 2026-10-08 第 3 条：「拖动的时候，文字和角色标记也都在跟着跑」。
   原来挪的是**一层**，记号/地名签是它的兄弟节点、不跟着挪：地面在滑、记号却钉在
   屏幕上不动，看着就是「记号跟脚下的地对不上」。现在同一份位移也写在记号那一层上。 */
const dragGlueProbe = (() => {
  const s = buildStage()
  renderStage(s, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
  s.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU })
  const [wx, wy] = s.zoomWin
  const during = dragBy(s, wx + 11, wy + 11.35 / 2, 3, 0)
  const p = PLACES.home.door
  const body = `translate(${p[0].toFixed(2)} ${p[1].toFixed(2)}) scale(0.3333333333333333) translate(-${p[0].toFixed(2)} -${p[1].toFixed(2)})`
  return {
    ok: during.ovl === `translate(3.00 0.00) ${body}` && during.after.ovl === body,
    read: `拖到一半记号那层 ${during.ovl}／松手之后 ${during.after.ovl}`,
  }
})()

check('拖动的时候记号那一层跟着地面走同一个位移，松手就撤掉（地面与记号不再错开）',
  dragGlueProbe.ok, dragGlueProbe.read)

/* 甲（2026-10-08）：位置**一帧只写一次**。`pointermove` 在高回报鼠标上一秒能来上千次，
   每来一次就写一遍 transform，等于让浏览器一秒重排上千次。装一个假的
   `requestAnimationFrame`，连发五次鼠标事件，看是不是只排了一帧、而且写下去的是
   最后那一次（而不是第一帧那一堆中间值）。 */
const dragFrameProbe = await (async () => {
  const raf = globalThis.requestAnimationFrame
  const caf = globalThis.cancelAnimationFrame
  const queued = []
  globalThis.requestAnimationFrame = (fn) => { queued.push(fn); return queued.length }
  globalThis.cancelAnimationFrame = () => {}
  try {
    const s = buildStage()
    s.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU })
    const [wx, wy] = s.zoomWin
    const X = 11 * PXZ
    const Y = (11.35 / 2) * PXZ
    s.svg.dispatch('pointerdown', { clientX: X, clientY: Y, pointerId: 1 })
    s.svg.dispatch('pointermove', { clientX: X + 1 * PXZ, clientY: Y, pointerId: 1 })
    const first = { pan: s.zoomPan.getAttribute('transform'), q: queued.length }
    for (let i = 2; i <= 5; i += 1) {
      s.svg.dispatch('pointermove', { clientX: X + i * PXZ, clientY: Y, pointerId: 1 })
    }
    const before = { pan: s.zoomPan.getAttribute('transform'), q: queued.length }
    queued.shift()()
    return {
      ok: first.q === 1 && before.q === 1 && before.pan === first.pan
        && s.zoomPan.getAttribute('transform') === 'translate(5.00 0.00)',
      read: `连发五次：排了 ${before.q} 帧（该是 1）／跑那一帧之前写下去的是 ${before.pan}`
        + `（该还是第一帧的 ${first.pan}）／跑完 ${s.zoomPan.getAttribute('transform')}（该是 5.00）`,
    }
  } finally {
    if (raf === undefined) delete globalThis.requestAnimationFrame
    else globalThis.requestAnimationFrame = raf
    if (caf === undefined) delete globalThis.cancelAnimationFrame
    else globalThis.cancelAnimationFrame = caf
  }
})()

check('拖动时位置一帧只写一次：连发五次鼠标事件只排一帧，写下去的是最后那一次',
  dragFrameProbe.ok, dragFrameProbe.read)

/* 乙（2026-10-08）：拖动期间换一套省事的画法——整组挂 [data-drag]（快速栅格化），
   小全图那张（里面又是一整份 2056 个元素的世界图）也一起收起来。
   松手之后**不马上撤**（用户 m22080 的甲）：松手那一帧地面照旧用烘好的位图垫着，
   撤是等细的那张真画出来、在 `zoomDraw` 里一起撤的——撤早了那 3752 个节点当场重排一次版面，
   松手那一下白付 80ms（2026-10-08 量到的）。 */
const dragCheapProbe = await (async () => {
  const s = buildStage()
  s.svg.dispatch('pointerdown', { clientX: 12.8 * PXU, clientY: 28.69 * PXU })
  const [wx, wy] = s.zoomWin
  const during = dragBy(s, wx + 11, wy + 11.35 / 2, 3, 0)
  const rightAfter = { zdrag: s.zoom.getAttribute('data-drag'), mdrag: s.mini.getAttribute('data-drag') }
  await new Promise((r) => setTimeout(r, 260))
  const settled = { zdrag: s.zoom.getAttribute('data-drag'), mdrag: s.mini.getAttribute('data-drag') }
  return {
    ok: during.zdrag === '' && during.mdrag === '' && during.drag === ''
      && rightAfter.zdrag === '' && rightAfter.mdrag === ''
      && settled.zdrag === null && settled.mdrag === null,
    read: `拖到一半：整组 data-drag=${during.zdrag}（该是空串）／小全图 data-drag=${during.mdrag}`
      + `（该是空串）／松手那一下还收着（${rightAfter.zdrag}、${rightAfter.mdrag}，该都是空串）`
      + `／细的那张画出来之后 ${settled.zdrag}、${settled.mdrag}（该都是 null）`,
  }
})()

check('拖动期间整组换省事的画法、小全图也收起来，松手全撤',
  dragCheapProbe.ok, dragCheapProbe.read)

check('松手落定一扇新窗：窗心跟着拖的距离走，并吸附到 1/4 格',
  (() => {
    const s = buildStage()
    // 从**世界正中**进去。第六十六版起取景框整扇被夹在世界图里面，从 (12.8, 28.69)
    // 进去的那扇窗本来就贴着左边与底边，再往外拖会被夹住、窗心挪不动，量不出位移。
    s.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU })
    const [wx, wy] = s.zoomWin
    const [mx, my] = [wx + 11, wy + 11.35 / 2]
    // 往右下拖 3 与 1.5 个世界单位：画面跟着走，窗心就要往回挪这么多
    const during = dragBy(s, mx, my, 3, 1.5)
    const [nx, ny] = winOrigin(mx - 3, my - 1.5)
    return during.pan !== null
      && s.zoomPan.getAttribute('transform') === null
      && s.zoomWin[0] === nx && s.zoomWin[1] === ny
      && s.svg.getAttribute('viewBox') === winBox(nx, ny)
  })(),
  (() => {
    const s = buildStage()
    s.svg.dispatch('pointerdown', { clientX: 12.8 * PXU, clientY: 28.69 * PXU })
    const [wx, wy] = s.zoomWin
    const [mx, my] = [wx + 11, wy + 11.35 / 2]
    dragBy(s, mx, my, 3, 1.5)
    const [nx, ny] = winOrigin(mx - 3, my - 1.5)
    return `取景框 ${s.svg.getAttribute('viewBox')}（该是 ${winBox(nx, ny)}）`
      + `／拖动那层的 transform 撤掉了吗：${s.zoomPan.getAttribute('transform')}`
  })())

check('松手之后才画新那一扇（那 36ms 的同步建图不落在一串动作中间）',
  (await (async () => {
    const s = buildStage()
    s.svg.dispatch('pointerdown', { clientX: 12.8 * PXU, clientY: 28.69 * PXU })
    const [wx, wy] = s.zoomWin
    dragBy(s, wx + 11, wy + 11.35 / 2, 3, 1.5)
    const right = s.zoomLocal.getAttribute('data-on')
    await new Promise((r) => setTimeout(r, 200))
    return right === null && s.zoomLocal.getAttribute('data-on') === '' && s.zoomAt !== null
  })()),
  (await (async () => {
    const s = buildStage()
    s.svg.dispatch('pointerdown', { clientX: 12.8 * PXU, clientY: 28.69 * PXU })
    const [wx, wy] = s.zoomWin
    dragBy(s, wx + 11, wy + 11.35 / 2, 3, 1.5)
    const right = s.zoomLocal.getAttribute('data-on')
    await new Promise((r) => setTimeout(r, 200))
    return `松手那一下 data-on=${right}（该是 null）／200ms 后 ${s.zoomLocal.getAttribute('data-on')}`
      + `（该是空）／落定在 ${s.zoomAt}`
  })()))

/** 把一条 transform 作用到一个点上（SVG 的变换表从左到右是「先套外层」，作用要倒着算）。 */
const xfPoint = (s, p) => {
  const parts = [...String(s || '').matchAll(/(scale|translate)\(([^)]+)\)/g)]
  let [x, y] = p
  for (let i = parts.length - 1; i >= 0; i--) {
    const v = parts[i][2].split(/[\s,]+/).map(Number)
    if (parts[i][1] === 'scale') { x *= v[0]; y *= v[0] } else { x += v[0]; y += v[1] }
  }
  return [x, y]
}

/* 记号那一层在细节版里补一个反缩放（见 `zoomOverlay`）：以**他脚下那块地**为中心
   `translate(p) scale(1/3) translate(-p)`。这个变换把 `p` 映到 `p` 自己，所以记号在两级里
   位置、大小逐像素一样（±3 个世界单位的偏移 × 1/3 × 23.09px 还是 ±23px）。
   第四十六版（用户 2026-10-08 报「角色标记就被放大镜的边缘挤压走了」，他定的甲）
   定的「记号永远画在自己那块地上」在这一版里仍然成立：细节版动的是**那一层**，不是记号。 */
const pinZoomProbe = (() => {
  const s = buildStage()
  renderStage(s, { line: '', place: 'home', act: null, hour: 23 }, 'adventure')
  const [hx, hy] = PLACES.home.door
  const want = pinAt(PLACES.home.door)
  const before = s.overlay.getAttribute('transform')
  s.svg.dispatch('pointerdown', { clientX: hx * PXU, clientY: hy * PXU })
  const t = s.overlay.getAttribute('transform')
  // 他脚下那块地过一遍那个反缩放：落回自己；离他 3 个单位的点：缩到 1 个（正好三分之一）
  const on = xfPoint(t, [hx, hy])
  const near = xfPoint(t, [hx + 3, hy])
  return {
    ok: before === null
      && /^translate\(/.test(String(t)) && /scale\(0\.3333/.test(String(t))
      && Math.abs(on[0] - hx) < 0.02 && Math.abs(on[1] - hy) < 0.02
      && Math.abs(near[0] - (hx + 1)) < 0.02
      && s.pin.getAttribute('data-at') === want
      && Number(s.miniDot.getAttribute('cx')) === hx
      && Number(s.miniDot.getAttribute('cy')) === hy,
    read: `全图时记号那一层 ${before}（该是没有）／细节版里 ${t}`
      + `／他脚下那块地落回 ${on.map((v) => v.toFixed(2)).join(',')}（该是 ${hx},${hy}）`
      + `／离他 3 个单位的点缩到 ${near[0].toFixed(2)}（该是 ${(hx + 1).toFixed(2)}）`
      + `／记号自己还是 ${s.pin.getAttribute('data-at')}／小全图上的点 ${s.miniDot.getAttribute('cx')},${s.miniDot.getAttribute('cy')}`,
  }
})()

check('细节版里记号一个像素都不动、大小也不变（动的是那一层，不是记号）',
  pinZoomProbe.ok, pinZoomProbe.read)

check('细节版那一层里没有第二枚记号（挪的是同一枚，尺寸不放大）',
  buildStage().zoomPan.all('gf-pin').length === 0,
  buildStage().zoomPan.children.map((c) => c.tagName).join(' '))

check('双击回全图：取景框回到 66×34、地方图腾空（那张 800 KB 不看了就不占着）',
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    s.svg.dispatch('dblclick')
    return s.zoom.getAttribute('display') === 'none'
      && s.svg.getAttribute('viewBox') === '0 0 66 34'
      && s.zoomLocal.children.length === 0
      && s.zoomLocal.getAttribute('data-on') === null
      && s.zoomLocal.className === 'gf-zoom-local'
      && s.overlay.getAttribute('transform') === null
      && s.mini.getAttribute('display') === 'none'
      && s.back.getAttribute('hidden') === ''
      && s.svg.all('gf-map').length === 1
  })()),
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    s.svg.dispatch('dblclick')
    return `取景框 ${s.svg.getAttribute('viewBox')}／细节版 ${s.zoom.getAttribute('display')}`
      + `／地方图 ${s.zoomLocal.children.length} 个顶层元素、class=${s.zoomLocal.className}`
      + `／记号那一层 ${s.overlay.getAttribute('transform')}／画布上 ${s.svg.all('gf-map').length} 张图`
  })()))

check('角落那颗「全图」按钮也回全图',
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    s.back.dispatch('click')
    return s.svg.getAttribute('viewBox') === '0 0 66 34'
      && s.zoom.getAttribute('display') === 'none'
      && s.back.getAttribute('hidden') === ''
  })()),
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    s.back.dispatch('click')
    return `取景框 ${s.svg.getAttribute('viewBox')}／细节版 ${s.zoom.getAttribute('display')}`
  })()))

check('按 Esc 也回全图（不用去够角落里那颗按钮）',
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    document.dispatch('keydown', { key: 'Escape' })
    return s.svg.getAttribute('viewBox') === '0 0 66 34'
      && s.zoom.getAttribute('display') === 'none'
      && s.zoomLocal.children.length === 0
  })()),
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    document.dispatch('keydown', { key: 'Escape' })
    return `取景框 ${s.svg.getAttribute('viewBox')}／细节版 ${s.zoom.getAttribute('display')}`
      + `／地方图 ${s.zoomLocal.children.length} 个顶层元素`
  })()))

/* 用户 m19416 定的第三条：**他走出这一扇窗，视野就跟着他挪过去**。
   判据是他换了个地方之后，取景框变成「以他新位置为中心」那一扇。 */
check('他走出这一扇窗了，视野跟着他挪过去（不是让他走出画面外）',
  (await (async () => {
    const s = buildStage()
    renderStage(s, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
    const [hx, hy] = PLACES.home.door
    s.svg.dispatch('pointerdown', { clientX: hx * PXU, clientY: hy * PXU })
    const before = s.svg.getAttribute('viewBox')
    const [mx, my] = PLACES.market.door
    renderStage(s, { line: '', place: 'market', act: null, hour: 12 }, 'adventure')
    await new Promise((r) => setTimeout(r, 200))
    const [wx, wy] = winOrigin(mx, my)
    return s.svg.getAttribute('viewBox') === winBox(wx, wy)
      && before !== s.svg.getAttribute('viewBox')
  })()),
  (await (async () => {
    const s = buildStage()
    renderStage(s, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
    const [hx, hy] = PLACES.home.door
    s.svg.dispatch('pointerdown', { clientX: hx * PXU, clientY: hy * PXU })
    const before = s.svg.getAttribute('viewBox')
    const [mx, my] = PLACES.market.door
    renderStage(s, { line: '', place: 'market', act: null, hour: 12 }, 'adventure')
    await new Promise((r) => setTimeout(r, 200))
    const [wx, wy] = winOrigin(mx, my)
    return `他在落脚处时 ${before} → 他到了集市 ${s.svg.getAttribute('viewBox')}（该是 ${winBox(wx, wy)}）`
  })()))

/* 反过来也要成立：视野是**他自己**挪开的（拖动、小全图），下一次重画不许把视野拽回他那儿。
   不这么做的话，他一边在别处走动、一边想看看地图另一头就看不成了（视野被一直拽回去）。 */
check('视野是自己挪开的，下一次重画不把它拽回去（想看别处就能看）',
  (await (async () => {
    const s = await clickIn(10.5, 18.99) // 他就在窗心
    s.mini.dispatch('pointerdown', { clientX: 56, clientY: 29 }) // 自己跳到世界正中
    await new Promise((r) => setTimeout(r, 200))
    const away = s.svg.getAttribute('viewBox')
    renderStage(s, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
    await new Promise((r) => setTimeout(r, 200))
    return away !== '0 0 66 34' && s.svg.getAttribute('viewBox') === away
  })()),
  (await (async () => {
    const s = await clickIn(10.5, 18.99)
    s.mini.dispatch('pointerdown', { clientX: 56, clientY: 29 })
    await new Promise((r) => setTimeout(r, 200))
    const away = s.svg.getAttribute('viewBox')
    renderStage(s, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
    await new Promise((r) => setTimeout(r, 200))
    return `自己挪到 ${away}，再重画一次还是 ${s.svg.getAttribute('viewBox')}`
  })()))

check('细节版聚到窗心最近的那座城（七个地点各认对自己那座城）',
  (await (async () => {
    for (const id of Object.keys(PLACES)) {
      const p = PLACES[id]
      const s = await clickIn(p.door[0], p.door[1])
      // 窗心跟点的那一处最多差 1/4 格（吸附），所以「聚到哪座城」按窗心算
      const [wx, wy] = s.zoomWin
      const want = focusAt(wx + 11, wy + 11.35 / 2).focus
      if (s.zoomLocal.getAttribute('data-focus') !== want) return false
    }
    return true
  })()),
  Object.keys(PLACES).map((id) => `${id}→${CITY_OF[id]}`).join(' '))

check('小全图上点一下，细节版跳到那儿（点哪儿看哪儿）',
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    // 垫片里量不出小全图的 rect，兜底是 112×58 从 (0,0) 起——点它的正中就是世界 (33,17)
    s.mini.dispatch('pointerdown', { clientX: 56, clientY: 29 })
    await new Promise((r) => setTimeout(r, 200))
    const [nx, ny] = winOrigin(33, 17)
    return s.svg.getAttribute('viewBox') === winBox(nx, ny)
  })()),
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    s.mini.dispatch('pointerdown', { clientX: 56, clientY: 29 })
    await new Promise((r) => setTimeout(r, 200))
    const [nx, ny] = winOrigin(33, 17)
    return `取景框 ${s.svg.getAttribute('viewBox')}（该是 ${winBox(nx, ny)}）`
  })()))

check('同一扇窗里再点一下不重画（缓存命中，连题名框里的人都不换）',
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    const first = s.zoomLocal.children[0]
    const n = s.zoomLocal.children.length
    const focus = s.zoomLocal.getAttribute('data-focus')
    // 点小全图上「现在这一扇」的中心：算出来的窗还是同一扇，`zoomSwap` 该当场早退
    const [wx, wy] = s.zoomWin
    s.mini.dispatch('pointerdown', {
      clientX: ((wx + 11) / 66) * 112,
      clientY: ((wy + 11.35 / 2) / 34) * 58,
    })
    await new Promise((r) => setTimeout(r, 200))
    return s.zoomLocal.children[0] === first
      && s.zoomLocal.children.length === n
      && s.zoomLocal.getAttribute('data-focus') === focus
  })()),
  (await (async () => {
    const s = await clickIn(12.8, 28.69)
    const first = s.zoomLocal.children[0]
    const n = s.zoomLocal.children.length
    const [wx, wy] = s.zoomWin
    s.mini.dispatch('pointerdown', {
      clientX: ((wx + 11) / 66) * 112,
      clientY: ((wy + 11.35 / 2) / 34) * 58,
    })
    await new Promise((r) => setTimeout(r, 200))
    return `那一层换了吗：${s.zoomLocal.children[0] === first}／元素 ${n} → ${s.zoomLocal.children.length}`
      + `／聚到 ${s.zoomLocal.getAttribute('data-focus')}`
  })()))

check('地方图那一层真的画得出来（不是空壳）',
  build_local(1.5, 6.72, '银树城').length > 500000,
  `${build_local(1.5, 6.72, '银树城').length} 字`)

/* 2026-10-08（第四十版）性能第二层：**空闲预建**。
   一扇地方图在浏览器里 36ms（拼字符串）+ 23ms（解析），拖动松手那 90ms 里根本画不完；
   但停稳之后的空闲时段很多。把周围八扇先建好，等他真拖过去就是缓存命中——
   「拖一下顿一下」大半就没了。垫片没有 requestIdleCallback，这里临时装一个假的，
   验「排上八扇、一片建一扇」。**排进队里不算数**：还要过一道 2000ms 的静默期
   （`ZOOM_QUIET_MS`，2026-10-08 从 700 拉长的）才真开工——预建是 36ms 的同步块，
   拆不开，拖着的时候落下来就是一次实打实的掉帧。 */
const zoomIdleProbe = await (async () => {
  const idles = []
  const realRic = globalThis.requestIdleCallback
  globalThis.requestIdleCallback = (cb) => { idles.push(cb); return idles.length }
  try {
    // 挑一扇**不贴边**的窗：贴边时好几个「邻居」会被夹成同一扇，去重之后就不足八扇。
    // 世界正中的 (33,17) → 窗心 22,11.25，八邻居互不相同、也没被前面那些断言建过。
    const stage = await clickIn(33, 17)
    // 丙（2026-10-08）：队里先躺着的那一片是「趁空闲烘一张位图」（`zoomShotSoon`），
    // 不是预建——它不是这条断言要数的东西，先让掉再数。（垫片里没有 Blob/Image，
    // 那片活跑起来什么也不做，正好。）
    const shotQueued = idles.length
    while (idles.length) idles.shift()({ didTimeout: false, timeRemaining: () => 50 })
    const beforeQuiet = idles.length
    // 静默期 2000ms，从「画完那一刻」起算；clickIn 已经等掉 20，再多等 2400 有富余。
    await new Promise((r) => setTimeout(r, 2400))
    const afterQuiet = idles.length
    let built = 0
    // 一片建一扇：跑完一片就接着排下一片，直到队列空
    while (idles.length) { idles.shift()({ didTimeout: false, timeRemaining: () => 50 }); built += 1 }
    return {
      // 八扇邻居里有已经画过的（比如贴底边那一扇 [0, 22.5]——前面「松手落定一扇新窗」
      // 那条断言正好落在它上面），`zoomPrewarm` 命中缓存就跳过，所以数出来是 7 或 8。
      ok: beforeQuiet === 0 && afterQuiet === 1 && built >= 7 && built <= 8
        && stage.zoomLocal.getAttribute('data-on') === '',
      read: `烘位图那片 ${shotQueued}（先让掉）、静默前 ${beforeQuiet} 片、静默后 ${afterQuiet} 片，跑完建了 ${built} 扇`,
    }
  } finally {
    if (realRic === undefined) delete globalThis.requestIdleCallback
    else globalThis.requestIdleCallback = realRic
  }
})()

check('空闲的时候把周围八扇排上队，一片建一扇，一共八扇',
  zoomIdleProbe.ok, zoomIdleProbe.read)

/* 一.1（2026-10-08）：**面板画第一笔的时候，把他所在那一扇先排进空闲队列**。
   原来只有「画过一次之后」才开始预建周围（`zoomDraw` 末尾那次 `zoomPrewarm`），
   所以第一次点进细节版那一扇永远是现建——浏览器里那是 36ms 拼串 ＋ 23ms 解析的
   同步块，约 60ms。这里拿一个**全新的 stage** 验：画第一笔就排上、静默期过了就建，
   而且只建这一扇。 */
const zoomWarmProbe = await (async () => {
  const idles = []
  const realRic = globalThis.requestIdleCallback
  globalThis.requestIdleCallback = (cb) => { idles.push(cb); return idles.length }
  try {
    const stage = buildStage()
    renderStage(stage, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
    const painted = stage.warm === true
    const beforeQuiet = idles.length
    // 静默期 2000ms，从「画完那一刻」起算；多等 100 有富余。
    await new Promise((r) => setTimeout(r, 2100))
    const afterQuiet = idles.length
    let built = 0
    while (idles.length) { idles.shift()({ didTimeout: false, timeRemaining: () => 50 }); built += 1 }
    return {
      ok: painted && beforeQuiet === 0 && afterQuiet === 1 && built === 1,
      read: `画过第一笔 ${painted}、静默前 ${beforeQuiet} 片、静默后 ${afterQuiet} 片，跑完建了 ${built} 扇`,
    }
  } finally {
    if (realRic === undefined) delete globalThis.requestIdleCallback
    else globalThis.requestIdleCallback = realRic
  }
})()

check('面板画第一笔就把他所在那一扇排上队，静默期过了就建（第一次点进细节版不必现建）',
  zoomWarmProbe.ok, zoomWarmProbe.read)

/* 一.2（2026-10-08）＋乙（用户 m22080）：**拖动里手停了就把「松手会落的那一扇」先建好**。
   原来拖动期间一个预建都不许落下来（建一扇是 36ms 的同步块，落下来就是一次掉帧），
   所以松手那一下多半要现建。现在判据换成「离上一次 pointermove 够久就算手停」：
   手还在动时那片**让掉**（跑它也只重排一片，不建），手一停就真建一扇。
   算式跟 `zoomUp` 里那句一模一样，所以松手落的那一扇正好是已经建好的那一扇。 */
const zoomDragWarmProbe = await (async () => {
  const idles = []
  const realRic = globalThis.requestIdleCallback
  globalThis.requestIdleCallback = (cb) => { idles.push(cb); return idles.length }
  const drain = () => { let n = 0; while (idles.length) { idles.shift()({ didTimeout: false, timeRemaining: () => 50 }); n += 1 } return n }
  try {
    // 换**一份新的模块实例**（查询串绕开 ESM 的模块缓存）：`zoomCache` 是模块级的，
    // 上面十几个探针早把它喂满了，不换实例的话「松手会落的那一扇」多半已经在缓存里，
    // `zoomDragJob` 就是 null、`zoomPump` 当场早退——这条断言永远量不到东西（实测如此）。
    // 注意要 import `src/client.js`（**有导出**的那一份）：`lib/client.js` 是摊平产物、没有导出。
    const fresh = await import(`../src/client.js?zoomdrag=${Date.now()}`)
    // 起手挑世界正中（33,17）：窗心 22 / 11.25，八个邻居落在 x=0、22、44 上，
    // 而**贴着地图边沿的窗会被 `zoomOrigin` 夹到同一处**（西边那一列全夹成 x=-3），
    // 于是「松手那一扇」正好是已经建好的邻居、一片都不排，断言就白写了。
    const stage = fresh.buildStage()
    stage.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU })
    await new Promise((r) => setTimeout(r, 20))
    // 先把这一路上排下来的（烘位图那片、以及静默期那一批邻居）放干净，
    // 免得一会儿数出来的是别人的片子。
    drain()
    await new Promise((r) => setTimeout(r, 2100))
    drain()
    const [wx, wy] = stage.zoomWin
    const X = (33 - wx) * PXZ
    const Y = (17 - wy) * PXZ
    // 拖 7 个世界单位，**不能拖整扇窗（22）**：22 正好是 `zoomPrewarm` 已经建好的那八扇邻居，
    // 「松手那一扇」本来就在缓存里、当场早退，这条断言就白写了（实测拖 22 时一片都不排）。
    stage.svg.dispatch('pointerdown', { clientX: X, clientY: Y, pointerId: 1 })
    stage.svg.dispatch('pointermove', { clientX: X + 7 * PXZ, clientY: Y, pointerId: 1 })
    const whileMoving = idles.length
    // 手还在动：跑掉**一片**（只跑一片——让掉的那一片会自己重排一片，跑一片就够了），
    // 它该让掉、不建。
    if (idles.length) idles.shift()({ didTimeout: false, timeRemaining: () => 50 })
    const stillMoving = idles.length
    // 手停了（400ms 里没有 pointermove）——这一片该真建一扇，建完不再重排。
    await new Promise((r) => setTimeout(r, 400))
    const built = drain()
    const afterPause = idles.length
    stage.svg.dispatch('pointerup', { clientX: X + 7 * PXZ, clientY: Y, pointerId: 1 })
    // 缓存命中的证据：松手那一下**当场**画出来（`zoomSwap` 里 `wait = 0`），没排计时器。
    const onNow = stage.zoomLocal.getAttribute('data-on')
    const timered = stage.zoomTimer
    return {
      ok: whileMoving === 1 && stillMoving === 1 && built === 1 && afterPause === 0
        && onNow === '' && !timered,
      read: `手还在动 ${whileMoving} 片（该是 1）、跑掉一片之后还是 ${stillMoving} 片（该是 1，让掉了）`
        + `／停 400ms 后跑掉 ${built} 片（该是 1，真建了）、还剩 ${afterPause} 片（该是 0）`
        + `／松手那一下 data-on=${onNow}（该是空串，缓存命中当场画）、计时器 ${timered}（该是 0）`,
    }
  } finally {
    if (realRic === undefined) delete globalThis.requestIdleCallback
    else globalThis.requestIdleCallback = realRic
  }
})()

check('拖动里手停了就先把「松手会落的那一扇」建好（手还在动时那片让掉、一片都不建）',
  zoomDragWarmProbe.ok, zoomDragWarmProbe.read)

/* 2026-10-08（第四十版）镜内垫在底下那层（世界图自己的 3 倍）**只在镜里还什么都没有的
   时候露出来**。这是量出来的：它露着的时候，镜子每挪一格就要重栅格化整张世界图——
   扫一遍地图 55 帧掉帧，藏起来是 2 帧（跟不动鼠标一样）。两级地图里这条照样成立：
   拖动的时候露着（只挪这一层，实测 252 帧掉 1 帧），地方图一画出来就藏。 */
const zoomUnderProbe = await (async () => {
  const s = await clickIn(12.8, 28.69)
  const drawn = s.zoomWorld.getAttribute('display')
  const on = s.zoomLocal.getAttribute('data-on')
  s.svg.dispatch('dblclick')
  const back = s.zoomWorld.getAttribute('display')
  return {
    ok: drawn === 'none' && on === '' && back === null,
    read: `画出来之后底下那层 ${drawn}、地方图 data-on=${on}；回全图之后 ${back}`,
  }
})()

check('细节版画出了地方图，底下垫的那层世界图就收起来（不收每挪一格重栅格化整张世界图）',
  zoomUnderProbe.ok, zoomUnderProbe.read)

/* 这里原来有一条「同一扇窗里鼠标偏向另一座城，画出来的是另一张图」（第四十版）。
   第五十六版换成两级地图之后**不可能发生**了：聚到哪座城取自**窗心**
   （`zoomDraw` 里 `focusAt(wx + ZOOM_W/2, wy + ZOOM_H/2)`），而窗心由窗的位置唯一决定——
   同一扇窗永远聚到同一座城。缓存键里那一节城名留着，是为了跟预建队列算出来的键
   逐字一致（见 `zoomPrewarm`）。 */

/* --- 地图的框：记号与地名签都叠在它上面 ----------------------------- */
// CSS 是在 client.js 的模板字符串里的，直接读源文件比对。
const CSS = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
// 2026-10-06：地图换成 `.scratch/terrain.py` 画的那张（66×34，从 0,0 起），
// 画布本身等于内容，没有一圈要裁掉的空白——上一版那个 `16 11.5 66 34` 是老图
// 四周有一圈海、要裁掉才不留白的写法。这条盯的仍是「框 = 图自己的尺寸」。
check('取景框就是画布本身（66×34，从 0,0 起）',
  buildStage().svg.getAttribute('viewBox') === '0 0 66 34',
  buildStage().svg.getAttribute('viewBox'))
check('裁的时候没把东西裁掉（地图上的记号、城镇都还在框里）',
  Object.values(PLACES).map((p) => p.door)
    .every(([px, py]) => px > bx && px < bx + bw && py > by && py < by + bh))
check('面板比上一版宽（424 → 560）', /min\(560px/.test(CSS), CSS.match(/min\(5\d\dpx[^)]*\)/)?.[0])
check('地图撑满整行，不再写死一个 360px', /\.gf-stage svg \{[^}]*width: 100%/.test(CSS))
// 细节版**不吃事件**：它整块盖在地图上，吃事件的话拖动就断在这儿了。
// 地方图那层靠 `data-on` 淡进来（属性在、类也在，样式才吃得住）。
check('细节版的样式在，而且不吃鼠标',
  /\.gf-zoom \{ pointer-events: none; \}/.test(CSS)
  && /\.gf-zoom-local \{ opacity: 0;/.test(CSS)
  && /\.gf-zoom-local\[data-on\] \{ opacity: 1; \}/.test(CSS))
// 第四十二版（用户 m17683 定的甲）：那 93 道 SVG 模糊**在细节版里**摘掉。
// 每个被滤镜的元素都要一张离屏层，一帧 80 张——实测掉帧 91 → 16；
// 整扇窗逐像素比只差 1.98/255（看得见的那一块 0.86/255），看不出来。
// 摘的是**细节版那一份**（`#gf-world` 外面那扇照旧留着，真浏览器里点开还看得到软边）。
check('细节版那一份把模糊摘了（一帧 80 张离屏层省掉），外面那扇照旧留着',
  /\.gf-zoom-local \[filter\] \{ filter: none; \}/.test(CSS))
// 拖动时每帧只挪一层空的 <g>，挂上 will-change 才有机会被当成一张图搬。
// （软件栅格下量不出差别，见 README 第四十二版那段的保留。）
check('拖动时每帧只挪的那一层挂了 will-change:transform',
  /\.gf-zoom-pan \{ will-change: transform; \}/.test(CSS))
/* 2026-10-08（用户报四点那一版）：
   ① 拖动期间那层地方图**真的不画**（`display:none`），不是压透明度——压着它照样每帧
      重画 5686 个元素，拖动一帧 32–40ms；真藏掉回到 20–24ms。
   ② 拖动不许起选区：截图里国名、地形名被浏览器选成蓝底。`user-select` 在 `.gf-stage`
      上（会继承给里面的 SVG 文字），只关地图这一块。
   ③ 触摸屏上拖地图要能拖，不许被滚动手势抢走。 */
check('拖动期间那层地方图真的不画（不是压透明度）',
  /\.gf-zoom-local\[data-drag\] \{ display: none; \}/.test(CSS))
check('地图这一块不许起选区（拖动不再选中地图上的字）',
  /\.gf-stage \{[^}]*user-select: none;/.test(CSS))
check('地图接得住拖动（触摸屏上不被滚动手势抢走）',
  /\.gf-stage svg \{[^}]*touch-action: none;/.test(CSS))
/* 乙（2026-10-08）：拖动期间换一套省事的画法。三条都得在，而且小全图那条**必须排在**
   `.gf-stage svg.gf-mini:not([display="none"])` 之后（同特异性，靠顺序赢）。 */
check('拖动期间世界图那层换快速栅格化（不做抗锯齿）',
  /\.gf-zoom\[data-drag\] \.gf-zoom-world \{ shape-rendering: optimizeSpeed; \}/.test(CSS))
check('拖动期间文字也不做精细字距（text-rendering: optimizeSpeed）',
  /\.gf-zoom\[data-drag\] text \{ text-rendering: optimizeSpeed; \}/.test(CSS))
check('拖动期间小全图也收起来（它里面又是一整份世界图），松手就回来',
  CSS.indexOf('.gf-stage svg.gf-mini[data-drag] { display: none; }')
    > CSS.indexOf('.gf-stage svg.gf-mini:not([display="none"]) { display: block; }'))
/* 丙（2026-10-08）：那张预先烘好的位图（拖动时顶上来当地面）。平时藏着，
   拖动且烘好时才挂 `data-on` 露出来——见 `zoomGround`。 */
check('拖动时顶上来那张位图平时藏着，挂了 data-on 才露',
  /\.gf-zoom-bit \{ display: none; \}/.test(CSS)
  && /\.gf-zoom-bit\[data-on\] \{ display: block; \}/.test(CSS))
// 第四十三版：镜内那 98 条犁沟（田里的 `.lf`）一直是隐形的。这条样式住在
// `src/map/local.js` 的 `LOCAL_CSS` 里，而面板只灌 `MAP_CSS`——`.lf` 上没有
// inline style，SVG 默认 `stroke:none`，于是镜内那块地一直是光板。
// 拆出 `LF_CSS` 之后由装载块接在 `MAP_CSS` 后面。这一条查的是「源文件里接上了」，
// 「接出来的样式真在页面上」由下面那一条查。
check('镜内犁沟那条样式接上了（面板灌 CSS + MAP_CSS + LF_CSS）',
  /style\.textContent = CSS \+ MAP_CSS \+ LF_CSS/.test(CSS))

/* --- 提灯照地：夜里那圈光池 ----------------------------------------- */
// 第四十二版：夜罩从「整块盖满」换成「以他为中心的一圈径向渐变」——
// 脚下透明、远处才暗到原来的程度。灯这才像照到了地面，而不是在暗图上刷了个暖斑。
const nightProbe = (() => {
  const stage = buildStage()
  const grad = stage.night
  const stops = grad ? grad.children.length : 0
  const ops = grad ? grad.children.map((s) => s.getAttribute('stop-opacity')).join(',') : ''
  renderStage(stage, { line: '', place: 'home', act: null, hour: 23 }, 'adventure')
  const deep = [grad.getAttribute('cx'), grad.getAttribute('cy'), grad.getAttribute('r')]
  renderStage(stage, { line: '', place: 'home', act: null, hour: 12 }, 'adventure')
  const noon = grad.getAttribute('r')
  return {
    ok: !!grad && grad.tagName === 'RADIALGRADIENT'
      && grad.getAttribute('gradientUnits') === 'userSpaceOnUse'
      && stops === 4 && ops === '0,0.06,0.52,1'
      && deep.join(',') === '10.50,18.99,5.76' && noon === '9.20',
    read: `${grad && grad.tagName} ${stops} 个 stop（${ops}）／`
      + `深夜 圆心 ${deep.slice(0, 2).join(',')} r=${deep[2]}／正午 r=${noon}`,
  }
})()

check('夜里那圈光池以他为中心，半径随时辰收放（脚下亮、远处才暗）',
  nightProbe.ok, nightProbe.read)
check('夜罩改用那圈渐变，深夜压得够黑（2026-10-30 地图审计 M-12：0.45 → 0.52）',
  /#gf-world \.mnight \{ fill: url\(#gf-night\); opacity: calc\(var\(--gf-dusk,0\) \* 0\.52\); \}/.test(CSS)
  && /#gf-night stop \{ stop-color: var\(--gf-dusk-color, #140D07\); \}/.test(CSS))
// 第四十三版：细节版那张地方图**也走那圈渐变**。
// 原来它吃的是 MAP_CSS 里那条平面色 `.gf-map .mnight`（`#140D07`、0.55 × dusk），
// 夜里那一块是均匀 0.43 的暗——实测同一块地：开着细节版 95.1/255、回全图 127.0/255，
// 等于把亮着的地面压暗 25%。特异性 (0,3,0) 压得过 MAP_CSS 的 (0,2,0)。
// 第五十六版起两级共用**同一条** `gf-night`：它是世界坐标的渐变，两级都直接吃。
check('细节版那张地方图的夜罩也走那圈渐变（不再把亮着的地面压暗）',
  /\.gf-map\.gf-zoom-local \.mnight \{ fill: url\(#gf-night\); opacity: calc\(var\(--gf-dusk,0\) \* 0\.52\); \}/.test(CSS)
  && /#gf-zoom \.mnight \{ fill: url\(#gf-night\); opacity: calc\(var\(--gf-dusk,0\) \* 0\.52\); \}/.test(CSS))
/* 这里原来有一条「镜内那圈光池按镜子的映射倒推」（第四十三～四十七版）：镜子是钉在
   鼠标底下的一个圆，镜内那层被 `scale(3)` 放大过，所以光池的圆心与半径都得倒推。
   第五十六版换成两级地图之后整条不需要了——细节版是换 viewBox 换出来的，
   两层吃的是同一条世界坐标的渐变（`#gf-night`），圆心就是他脚下那块地本身。 */
/* 2026-10-06 用户报的 bug：面板收起来只是 opacity 0，那块 560x700 的矩形照样吃鼠标，
   压在下面的 DSH 界面点不动、悬停没反应。修法是根节点不吃事件、只有看得见的两样自己打开，
   外加把被 display: flex 盖掉的 [hidden] 按回去。 */
check('收起来的面板不再吃鼠标（DSH 界面点得动了）',
  /\.gf-root \{[^}]*pointer-events: none/.test(CSS)
  && /\.gf-door \{[^}]*pointer-events: auto/.test(CSS)
  && /\.gf-room \{[^}]*visibility: hidden[^}]*pointer-events: none/.test(CSS)
  && /\.gf-room\.gf-open \{[^}]*visibility: visible[^}]*pointer-events: auto/.test(CSS)
  && /\.gf-room\[hidden\] \{ display: none; \}/.test(CSS),
  ['root', /\.gf-root \{[^}]*pointer-events: none/.test(CSS),
    'door', /\.gf-door \{[^}]*pointer-events: auto/.test(CSS),
    'room', /\.gf-room \{[^}]*visibility: hidden[^}]*pointer-events: none/.test(CSS),
    'open', /\.gf-room\.gf-open \{[^}]*visibility: visible[^}]*pointer-events: auto/.test(CSS),
    'hidden', /\.gf-room\[hidden\] \{ display: none; \}/.test(CSS)].join(' '))

/* 2026-10-07 用户要「两层更有区别」：光是小一号不够，生活层还要缩进一格、左边挂一条淡竖线，
   一眼看出它是挂在活计旁边的一句旁白。（用 border 而不是 ::before 的引号，是为了不动文本。） */
check('生活层一眼看得出是从属的那一层（缩进 + 一条淡竖线，比活计小一号）',
  /\.gf-life \{[^}]*padding-left: 9px[^}]*border-left: var\(--gf-life-line, 2px solid var\(--gf-line\)\)/.test(CSS)
  && /\.gf-life \{[^}]*font-size: var\(--gf-life-size, 11px\)/.test(CSS)
  && /\.gf-remark \{[^}]*font-size: 13\.5px/.test(CSS),
  `life ${/\.gf-life \{[^}]*font-size: var\(--gf-life-size, ([\d.]+px)\)/.exec(CSS)?.[1]} vs remark ${/\.gf-remark \{[^}]*font-size: ([\d.]+px)/.exec(CSS)?.[1]}`)

/* 2026-10-07 第二层（版式）：木与铜那一轮只做了材质，这一层补的是「东西的样子」——
   行与行之间那条极淡的分隔线、门的框与地面影、面板底下那道下沿、开合改成掀板。
   四个都走 token（别的主题不写就是透明，等于没加），所以每条断言既查规则在不在，
   也查 token 有没有值——不然「加了但看不见」照样算过。 */
check('行与行之间有一条极淡的分隔线，每段第一行不画',
  /\.gf-row \{[^}]*border-top: 1px solid var\(--gf-row-line, transparent\)/.test(CSS)
  && /\.gf-week > \.gf-row:first-child,\s*\n\.gf-week-label \+ \.gf-row \{ padding-top: 0; border-top: 0; \}/.test(CSS),
  THEMES.plain.tokens['--gf-row-line'])
check('门有框、也有地面影（都画在门的后面，不吃事件）',
  /\.gf-door::before \{[^}]*border: 1px solid var\(--gf-door-frame, transparent\)[^}]*z-index: -1/.test(CSS)
  && /\.gf-door::after \{[^}]*radial-gradient\(closest-side, var\(--gf-door-shadow, transparent\), transparent\)[^}]*z-index: -1/.test(CSS)
  && /\.gf-door::before \{[^}]*pointer-events: none/.test(CSS),
  `${THEMES.plain.tokens['--gf-door-frame']} / ${THEMES.plain.tokens['--gf-door-shadow']}`)
check('面板底下收了一道口（一块木板总得有个下沿）',
  /\.gf-room::after \{[^}]*var\(--gf-room-foot, transparent\)/.test(CSS)
  && /\.gf-room::after \{[^}]*border-bottom: 1px solid var\(--gf-room-edge, transparent\)/.test(CSS)
  && /\.gf-room::after \{[^}]*pointer-events: none/.test(CSS),
  THEMES.plain.tokens['--gf-room-foot'])
check('开合是「掀板」不是网页弹窗（收起来歪一点，打开时摆正）',
  /\.gf-room \{[^}]*transform: translateY\(14px\) rotate\(0\.9deg\) scale\(0\.97\)/.test(CSS)
  && /\.gf-room\.gf-open \{[^}]*transform: none/.test(CSS)
  && /\.gf-room \{[^}]*transition: opacity 240ms cubic-bezier\(0\.2, 0\.8, 0\.3, 1\)/.test(CSS),
  /\.gf-room \{[^}]*transform: (translateY\([^;]*\));/.exec(CSS)?.[1])


// 2026-10-04：标签也成了候选集——同一个动作不同日子叫法不同，但都在允许的集合里。
const ADV_WORDS = {
  改文件: ['抄咒文', '誊符纸', '改契书', '补地图', '誊古卷'],
  跑命令: ['试法器', '调机关', '修炉子', '装符石', '开炉'],
  翻文件: ['翻卷轴', '找旧记载', '上架子', '搬箱笼', '查旧册'],
  查资料: ['打听', '问路', '探消息', '访旧人', '对说法'],
  派了活: ['派同伴', '打发帮手', '分派路线', '贴悬赏'],
  聊了聊: ['闲聊', '搭话', '听人说', '叙旧'],
}
const inSet = (got, table, keys) => got.length === keys.length && keys.every((k, i) => table[k].includes(got[i]))

check('他的词：认得出（用的是这个世界那套词）',
  inSet(hisTags(['跑命令', '改文件', '翻文件']), ADV_WORDS, ['跑命令', '改文件', '翻文件']),
  hisTags(['跑命令', '改文件', '翻文件']).join('/'))
check('同一个动作，换一天可以换一种叫法',
  new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => hisTags(['改文件'], 'adventure', `s-${i}`)[0])).size > 1)
check('他的词：认不出的直接丢掉（不硬编）', hisTags(['莫名其妙']).length === 0)
check('他的词：最多三个', hisTags(['改文件', '跑命令', '翻文件', '查资料', '派了活']).length === 3)

/* --- 说法表 --------------------------------------------------------- *
 * 这一节存在的唯一理由是防住那个真出过的 bug：判断用的词表和记录用的词表
 * 没对齐，于是每一张卡片都落到兜底那一行、说着同一句废话。
 * 所以下面几条是「对每一种说法、每一个动作」都要求一句话，缺一个就红。
 * 2026-10-05 起表里只有一套（冒险）：第二套「案牍」被用户摘掉了。
 * 2026-10-06 世界包一度自带它那套说法（夜航船 → 船家），于是这条从「写死 adventure」
 * 改成**对着注册表判**；当天最晚船家也摘掉了（「去掉所有船家的内容」），表里又只剩
 * 冒险一套——判据不用再改，注册表里有几个世界包就该有几套说法。
 * ------------------------------------------------------------------- */

check('说法表：注册了几个世界包就有几套说法（现在只有奇幻冒险一套）',
  VOICE_IDS.join('/') === worldIds().map((id) => PACKS[id].voice).join('/')
  && VOICE_IDS.includes('adventure'),
  `${VOICE_IDS.join('/')} ← 注册表 ${worldIds().join('/')}`)
check('语气表：默认是冒险', DEFAULT_VOICE === 'adventure', DEFAULT_VOICE)
check('语气表：认不出的语气回落到默认', narrationFor([R({ tags: ['改文件'] })], NOW, '瞎写的').line
  === narrationFor([R({ tags: ['改文件'] })], NOW).line)

for (const id of VOICE_IDS) {
  const missing = ACTION_TAGS.filter((t) => {
    const line = narrationFor([R({ tags: [t] })], NOW, id).line
    return !line || line === '他还在那儿，手没停。'
  })
  check(`语气「${VOICES[id].label}」：六个动作一个都不落空`, missing.length === 0, `缺 ${missing.join('、')}`)
  const wordless = ACTION_TAGS.filter((t) => !hisTags([t], id).length)
  check(`语气「${VOICES[id].label}」：六个动作都有他那边的说法`, wordless.length === 0, `缺 ${wordless.join('、')}`)
  check(`语气「${VOICES[id].label}」：同一天同一件事在同一个地方`,
    ACTION_TAGS.every((t) => narrationFor([R({ tags: [t] })], NOW, id).place
      === narrationFor([R({ tags: [t] })], NOW, DEFAULT_VOICE).place))
}

check('冒险语气：说的是另一个世界的说法（不是文件操作的原话）',
  (() => {
    // 2026-10-06：原来是拿「契书 / 咒文 / 符纸 / 纸 / 朱砂 / 卷 / 驮马 / 霜……」一串词去套某一句。
    // 它栽在两件事上：① 并进来的户外活（送契书）说的是「驮袋 / 牲口 / 篝火 / 油布」，词表里没有；
    // ② 这条记录没有 id，键由 `startedAt` 生成（见 withIds），**跨一天**散列就翻一档、句子跟着换。
    // 改成跟下面「见闻录里也是」同一种盯结构的判法：开头那半句出自冒险语气下「改文件」这几件事
    // 自己的池子（或那个熟人），后半句出自它自己的收尾／四档池子，且通篇没有文件操作的原话。
    // 这样日期怎么翻都不假红，而「换的是另一个世界的说法」这件事本身还是钉着。
    const line = narrationFor([R({ tags: ['改文件'] })], NOW, 'adventure').line
    const cut = line.indexOf('，')
    const head = cut > 0 ? line.slice(0, cut) : line.replace(/。$/, '')
    const body = line.slice(cut + 1).replace(/。$/, '')
    const scenes = (SCENES.adventure && SCENES.adventure['改文件']) || []
    const place = placeOf({ minutes: 30, tags: ['改文件'] })
    const castHeads = (CAST_LINES[place] || []).map((h) => h.replace(/\{p\}/g, CAST[place])).map(headOf)
    const norm = (t) => String(t || '').replace(/^他(?=[^，。])/, '').replace(/\{e\}|\{n\}/g, '#').replace(/[一二三四五六七八九十百千]+/g, '#')
    const bodyNorm = norm(body)
    const tailOwn = scenes.some((s) => [
      ...(s.tail || []),
      ...['more', 'paid', 'hurt', 'again'].flatMap((k) => SHARDS.adventure[s.key]?.[k] || []),
    ].some((t) => {
      const n = norm(t)
      return n && (bodyNorm === n || bodyNorm.endsWith(`，${n}`))
    }))
    const headOwn = scenes.some((s) => (s.lead || []).map(headOf).includes(head)
      || (s.again || []).some((t) => headOf(t) === head)) || castHeads.includes(head)
    return /他/.test(line) && headOwn && tailOwn && !/文件|代码|命令|数据|项目/.test(line)
  })(),
  narrationFor([R({ tags: ['改文件'] })], NOW, 'adventure').line)
check('冒险语气：见闻录里也是',
  (() => {
    // 2026-10-07：原来拿「器 / 机关 / 炉……」一串词去套某一句。句式放开之后这条开头可能是
    // 「看院子的老人说，……」——套词就变成了猜谜。改成盯结构：这一句的**两半都必须出自
    // 冒险语气下「跑命令」那几件事自己的池子**，那才是「换的是另一个世界的说法」这件事本身。
    const line = dayLine({ minutes: 30, tags: ['跑命令'] }, 'adventure')
    const cut = line.indexOf('，')
    const head = cut > 0 ? line.slice(0, cut) : line.replace(/。$/, '')
    const body = line.slice(cut + 1).replace(/。$/, '')
    const scenes = (SCENES.adventure && SCENES.adventure['跑命令']) || []
    // 2026-10-07：这一行的开头还可能是**法器坊那个熟人**（见 CAST / CAST_LINES），
    // 所以头部有两个合法来源；尾部仍然必须出自这件事自己的池子。
    const place = placeOf({ minutes: 30, tags: ['跑命令'] })
    const castHeads = (CAST_LINES[place] || []).map((h) => h.replace(/\{p\}/g, CAST[place])).map(headOf)
    // 尾部那句话可能落在 `tail` / `more` / `paid` / `hurt` 哪一档上（看那一行的散列），
    // 也可能前面还跟着「有人出场」那半句（开头自带逗号）——所以按**后缀**比，
    // 并把 `{e}` / `{n}` 与已替换成的汉字数字归一后再比。
    const norm = (t) => String(t || '').replace(/^他(?=[^，。])/, '').replace(/\{e\}|\{n\}/g, '#').replace(/[一二三四五六七八九十百千]+/g, '#')
    const bodyNorm = norm(body)
    const tailOwn = scenes.some((s) => [
      ...(s.tail || []),
      ...['more', 'paid', 'hurt'].flatMap((k) => SHARDS.adventure[s.key]?.[k] || []),
    ].some((t) => {
      const n = norm(t)
      return n && (bodyNorm === n || bodyNorm.endsWith(`，${n}`))
    }))
    return /他/.test(line)
      && (scenes.some((s) => (s.lead || []).map(headOf).includes(head)) || castHeads.includes(head)
        || scenes.some((s) => (s.again || []).some((t) => headOf(t) === head)))
      && tailOwn
  })(),
  dayLine({ minutes: 30, tags: ['跑命令'] }, 'adventure'))
check('冒险语气：标签也换了',
  inSet(hisTags(['改文件', '派了活'], 'adventure'), ADV_WORDS, ['改文件', '派了活']),
  hisTags(['改文件', '派了活'], 'adventure').join('/'))
check('跟语气无关的那几句两边一个字不差',
  narrationFor([R({ endedAt: NOW - 5 * 3600 * 1000 })], NOW, 'adventure').line
  === narrationFor([R({ endedAt: NOW - 5 * 3600 * 1000 })], NOW).line)

check('帮手还在外面', helpersFor({ helpers: ['x', 'y'] }) === '有两个帮手还在外面。', helpersFor({ helpers: ['x', 'y'] }))
check('没有帮手就不写这一行', helpersFor({}) === null)

check('白天的光是白的', JSON.stringify(daylight(12)) === '{"dusk":0,"glow":0}', JSON.stringify(daylight(12)))
check('黄昏开始暗下来', daylight(18).dusk > 0 && daylight(18).glow > 0)
check('夜里只剩一盏灯', daylight(23).glow === 1 && daylight(3).glow === 1)
check('天快亮的时候还暗着', daylight(6).dusk > 0 && daylight(6).glow < 1)

/* --- 挂载与渲染 ----------------------------------------------------- */

// 门后那格书架挑过的世界记在哪儿：真面板用浏览器的 `localStorage`，自检里没有那个东西，
// 所以塞一个假存储进去，好把「记下来了」「下次打开自己装上」这两件事都钉住
// （键名由插件自己定，这里不写死——下面从存储里反着读）。
const worldStore = new Map()
// 幕布（用户 m19006 / m19218）：今天还没按过「开始冒险」，见闻录一格都不铺。这一节看的是
// **按过之后**的画面，所以 `dsh.gameflow.started` 这个键单独给一个回答——**不写进
// `worldStore`**：下面那些「挑过的说法记下来了」会去点存储里的键，多一个键就红
// （2026-10-19 撞过一次，别再把这一笔塞进 Map 里）。
const stubStart = String(new Date(NOW).setHours(0, 0, 0, 0))
const storeStub = {
  getItem: (k) => (k === 'dsh.gameflow.started' ? stubStart : worldStore.has(k) ? worldStore.get(k) : null),
  setItem: (k, v) => { worldStore.set(k, String(v)) },
  removeItem: (k) => { worldStore.delete(k) },
}
const gf = createGameflow({ loadRecords: () => demo, now: () => NOW, storage: storeStub })
gf.mount()

const host = document.body.children.find((c) => 'data-dsh-gameflow' in c.attributes)
check('挂载到 body', !!host)

const shadow = host.shadowRoot
check('shadow root 建立', !!shadow)
check('入口没崩：inject 为空数组', Array.isArray(inject) && inject.length === 0)
check('入口没崩：apply 是函数', typeof apply === 'function')
check('门存在', host.all('gf-door').length === 1)
check('门上的字是「门后」', host.all('gf-door-label')[0]?.textContent === '门后',
  host.all('gf-door-label')[0]?.textContent)
check('门有给读屏软件的名字', host.all('gf-door')[0]?.getAttribute('aria-label') === '推开门看看',
  host.all('gf-door')[0]?.getAttribute('aria-label'))

// 收起态：面板应该是藏在下面的
const room = host.all('gf-room')[0]
check('收起态面板是隐的', room.hidden === true)

gf.open()
const tick = () => new Promise((r) => setTimeout(r, 0))
await tick()
check('展开后面板可见', room.hidden === false)
check('展开后面板加上了 gf-open', room.classList.contains('gf-open'))
check('面板最上面就是地图，没有一个「头」（2026-10-03 并掉了问候语）',
  host.all('gf-head').length === 0 && host.all('gf-greet').length === 0)
// 2026-10-08：状态块从「时间 / 位置」两行标签（2026-10-03 定的）并回一行。
// 用户说整块板子不够直观简洁——标签是多余的（值本身就是答案），位置又和地图上
// 那枚记号旁边的地名重复。现在只剩一个金色的「此刻」当锚点。
check('状态块只剩一个标签，而且是「此刻」',
  host.all('gf-k').length === 1 && host.all('gf-k')[0]?.textContent === '此刻',
  host.all('gf-k').map((n) => n.textContent).join('/'))
check('「时间」「位置」这两个标签不再出现（值本身已经是答案）',
  host.all('gf-k').every((n) => !['时间', '位置'].includes(n.textContent)),
  host.all('gf-k').map((n) => n.textContent).join('/'))
check('此刻后面是 24 小时的钟点（用户 m03745 要的 09:47 那种）',
  host.all('gf-v')[0]?.textContent === '16:40', host.all('gf-v')[0]?.textContent)
// 2026-10-25：这一行指着哪儿**从记录里推**，不再写死「古林书斋」。
// 根因（2026-10-25 定位）：面板画记号用的是 `narrationFor(...).place`，那**不是** `placeOf`——
// 第四十版起「出门的活各有野地落点」，`narrationFor` 走 `hit.place` 会落到 `ruin` / `mine` /
// `quench` 这些**野地**上，而 `placeOf` 只认 `ACTION_PLACE[act]`（城里那间屋子）。拿 `placeOf`
// 反推期望值，等于用另一套判据去猜面板的结果，池子一动就假红（这就是那六条红的来路）。
// 现在照 `renderStage` 里那行 `const at = PLACES[narration.place] || PLACES.home` 推。
const PIN_AT = PLACES[narrationFor(demo, NOW).place] || PLACES.home
const PIN_PLACE = PIN_AT.id
const PIN_NAME = placeName(PIN_PLACE, 'adventure')
const PIN_DOOR = PIN_AT.door || [0, 0]
check('再后面是地名（值还在，只是不挂标签了）', host.all('gf-v')[1]?.textContent === PIN_NAME, host.all('gf-v')[1]?.textContent)
check('两者中间有一枚中点（一行读完，不必读标签）', host.all('gf-sep').length === 1)

/* --- 那间屋子 ------------------------------------------------------- */

const stage = host.all('gf-stage')[0]
check('面板里有地图', !!stage)
// 2026-10-06：新那张世界图里，海面的波纹和山体的排线、草、苇子都画成 `<line>`/`<circle>`
// （成批的参数一样的笔画挪进了 CSS，见 `.scratch/terrain.py` 的 `MAP_CSS`），
// 所以数形状得把 `line` 也算上——只数 path/circle 会数出一千出头，看着像贴了一张图。
check('地图真的是画出来的（几千个形状，不是一张图）',
  (stage.allTag('path').length + stage.allTag('circle').length
    + stage.allTag('rect').length + stage.allTag('ellipse').length
    + stage.allTag('line').length + stage.allTag('polyline').length
    + stage.allTag('polygon').length) > 2000,
  `${stage.allTag('path').length} path / ${stage.allTag('circle').length} circle / ${stage.allTag('line').length} line`)
check('地图是一整块地（大地图一张 svg ＋ 地名签那张自己的 svg ＋ 角落那张小全图 ＋ 右上角那枚图钉的图标 ＋ 记号里那枚图钉的小 svg，小图只在细节版里露出来）',
  stage.allTag('svg').length === 5 && stage.all('gf-mini').length === 1
  && stage.all('gf-always-icon').length === 1 && stage.all('gf-overlay-svg').length === 1
  && stage.all('gf-pin-glyph').length === 1,
  `${stage.allTag('svg').length} 张 svg（地名签那张 ${stage.all('gf-overlay-svg').length} 张、小全图 ${stage.all('gf-mini').length} 张、图钉图标 ${stage.all('gf-always-icon').length} 张、记号里的图钉 ${stage.all('gf-pin-glyph').length} 张）`)
check('地图上有灯（夜里那盏）', stage.all('gf-lamp-glow-1').length === 1)
check('地图上有个记号指着他现在在哪儿', stage.all('gf-pin').length === 1)
/* 记号的位置写在 transform 属性上，而「一起一落」是一条 CSS 动画——**CSS 的 transform 会整个
   盖掉属性上的 transform**。两者落在同一个组上的话，记号会被画到画布左上角（还整个朝上长出画布，
   等于被裁掉），而自渲染管线照抄属性、图上却是好的：2026-10-03 真浏览器里那枚记号一直不存在，
   用户报「地图上看不到他在哪」。所以这条断言盯的是**层数**，不是位置。 */
check('记号的动画挂在内层，不许盖掉外层的定位', stage.all('gf-pin')[0]?.all('gf-pin-bob').length === 1
  && stage.all('gf-pin').length === 1)
check('灯也一样：闪的是内层，外层留着属性控「他不在就没光」',
  stage.all('gf-lamp-glow')[0]?.all('gf-lamp-flicker').length === 1)
check('CSS 里没有任何一条动画落在带定位的组上',
  !/\.gf-pin\s*\{[^}]*animation/.test(shadow.allTag('style').map((s) => s.textContent).join('\n'))
  && !/\.gf-lamp-glow\s*\{[^}]*animation/.test(shadow.allTag('style').map((s) => s.textContent).join('\n')))
check('记号是亮出来的', stage.all('gf-pin')[0]?.style.opacity === '1',
  String(stage.all('gf-pin')[0]?.style.opacity))
check(`记号落在他待的那一处（改文件 → ${PIN_NAME}）`,
  stage.all('gf-pin')[0]?.getAttribute('data-place') === PIN_PLACE,
  String(stage.all('gf-pin')[0]?.getAttribute('data-place')))
check('记号就钉在他那道门口（不是随便飘在图上）',
  stage.all('gf-pin')[0]?.getAttribute('data-at') === pinAt(PIN_DOOR),
  `${stage.all('gf-pin')[0]?.getAttribute('data-at')} / 期望 ${pinAt(PIN_DOOR)}`)
check('地名写在图下面那行字里',
  host.all('gf-v')[1]?.textContent === PIN_NAME,
  host.all('gf-v')[1]?.textContent)
// 用户 2026-10-03：「地图上看不到他在哪，需要一个标注。」
// 记号旁边贴一个地名——位置跟着记号走，靠画布边缘会自动翻到另一边。
check('记号旁边贴着地名', stage.all('gf-place')[0]?.getAttribute('opacity') === '1',
  String(stage.all('gf-place')[0]?.getAttribute('opacity')))
check('贴的就是他此刻在的那个地方',
  stage.all('gf-place-text')[0]?.textContent === PIN_NAME,
  stage.all('gf-place-text')[0]?.textContent)
// 2026-10-30 M-4：落点改成「躲开图上已有的字与记号」（`placeLabel`），所以不再咬死
// 「右移 3.0」这个具体数——咬的是**它还贴着这枚记号**（不超过 14 个世界单位），
// 并且没有跑到画布外。躲的时候会绕到别的方向，那是这一轮的用意。
check('标签跟着记号走（不钉在画布角落）', (() => {
  const [px, py] = PIN_DOOR
  const bg = stage.all('gf-place-bg')[0]
  const x0 = Number(bg.getAttribute('x'))
  const y0 = Number(bg.getAttribute('y'))
  const w = Number(bg.getAttribute('width'))
  const h = Number(bg.getAttribute('height'))
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const far = Math.max(Math.abs(cx - px), Math.abs(cy - py))
  return far < 14 && x0 >= bx - 0.5 && x0 + w <= bx + bw + 0.5
})(), `${stage.all('gf-place-bg')[0]?.getAttribute('x')},${stage.all('gf-place-bg')[0]?.getAttribute('y')}`)
check('靠右边就翻到记号左边，不会掉出画布', (() => {
  const bg = stage.all('gf-place-bg')[0]
  return Number(bg.getAttribute('x')) + Number(bg.getAttribute('width')) <= bx + bw
})(), `${stage.all('gf-place-bg')[0]?.getAttribute('x')} + ${stage.all('gf-place-bg')[0]?.getAttribute('width')}`)
check('地图上那枚记号旁边的地名，跟着世界那套叫法走', (() => {
  // 2026-10-08：并进户外的活之后，一个动作挑到哪件事是掷骰子——挑到户外的活那天他就不在图上
  // （顶上写「地图外面」）。这一条验的是**换个地方，那儿的名字跟着换**，所以位置给死。
  // 2026-10-10：地名签搬进记号那张自己的 SVG 了（用户 m23060/m23080），所以从那儿找。
  const s2 = buildStage()
  renderStage(s2, { line: '他还在那儿，手没停。', place: 'scriptorium', act: '改文件', hour: 12 }, 'adventure')
  return s2.overlaySvg.all('gf-place-text')[0].textContent === '古林书斋'
})(), String(buildStage().overlaySvg.all('gf-place-text')[0]?.textContent))
// 那句话是拼出来的（片段组合），所以这里不钉死一句错话，钉的是**面板上那句必须
// 跟翻译层算出来的那句一字不差**——拼句子改了措辞，这条测试照样管用。
const NEWEST_LINE = narrationFor(demo, NOW).line
// 最新那一行那件事（改文件）能拿来开头的半句：场景自己的开头、承接句、同伴句。
// 存放的是带 `{n}`/`{e}` 的原样片段，所以按占位符切碎，只留够长的碎块去比对。
// （`CAST_LINES` 是按同伴分的表，`SHARDS` 每一件里没有 lead/tail——那是场景那一层的。）
const flatLines = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v).flat() : []))
const POOL_HEADS = (() => {
  const pieces = []
  for (const scene of SCENES.adventure['改文件'] || []) {
    pieces.push(...(scene.lead || []), ...(((SHARDS.adventure || {})[scene.key] || {}).again || []))
  }
  pieces.push(...flatLines(CAST_LINES))
  const out = []
  for (const piece of pieces) for (const part of String(piece).split(/\{[^}]*\}/)) if (part.length >= 3) out.push(part)
  return out
})()
// 2026-10-05 用户：「他现在的行为被单独显示在上面了，我觉得不需要这个显示，
// 就放在他的冒险下面，和你的工作的时间对齐」——那句话现在住在见闻录最新一行的右栏。
check('他此刻那句话不再单独占一行（画下面那块没有了）',
  host.all('gf-caption').length === 0, String(host.all('gf-caption').length))
check('他此刻那句话在最新那一行的「他的冒险」下面',
  host.all('gf-nowish')[0]?.textContent === NEWEST_LINE,
  host.all('gf-nowish')[0]?.textContent)
check('那一行不再跟着写「此刻」（那两个字已经在地图下面那块状态里）',
  !/此刻/.test(host.all('gf-nowish')[0]?.parentNode?.parentNode?.parentNode?.all('gf-when')[0]?.textContent || ''),
  host.all('gf-nowish')[0]?.parentNode?.parentNode?.parentNode?.all('gf-when')[0]?.textContent)
check('那句话是拼出来的（不是表里那一句老的）',
  NEWEST_LINE !== VOICES.adventure.lines['改文件']
  && /他/.test(NEWEST_LINE) && NEWEST_LINE.endsWith('。')
  // 2026-10-05 折叠之后，「最新那一行」前面那六行是六**天**（见 client.js 的 foldDays）——
  // 承接句（`shards.again`；它本来就是给「隔几天又回来做同一件事」写的）因此更容易轮到
  // 最新这一行，它不带纸笔那套词。所以判据从「带哪个名词」换成「开头那半句出自这一行
  // 那个动作的句池」：场景开头 / 承接句 / 同伴句，三样都算。
  && POOL_HEADS.some((part) => NEWEST_LINE.includes(part)),
  NEWEST_LINE)

/* --- 那句话是浮出来的 ----------------------------------------------- */
// 字是拆成 span 的，但 textContent 仍然是完整一句（读屏软件和上面的断言都靠这个）
{
  const line = NEWEST_LINE
  const cap = host.all('gf-nowish')[0]
  const spans = cap.all('gf-type')
  check('那句话是一个字一个字浮出来的', spans.length === Array.from(line).length,
    `${spans.length} 个字 / 期望 ${Array.from(line).length}`)
  check('第一个字立刻就开始浮现', spans[0].style.animationDelay === '0ms', spans[0].style.animationDelay)
  check('后面的字依次错开 24ms', spans[3].style.animationDelay === '72ms', spans[3].style.animationDelay)
  check('整句不会拖成打字机（封顶 900ms）',
    spans.every((s) => Number.parseInt(s.style.animationDelay, 10) <= 900),
    spans[spans.length - 1].style.animationDelay)
  // 关掉面板再开一次：节点是重建的，字数还是那么多，也不会被拼接两遍
  gf.close()
  gf.open()
  await tick()
  const cap2 = host.all('gf-nowish')[0]
  check('重开面板那句话还是完整一句（一个字都不多）',
    cap2.all('gf-type').length === spans.length && cap2.textContent === line,
    `${cap2.all('gf-type').length} 个字 / ${cap2.textContent}`)
}
// 16:40 → daylight 还在白天那档
check('白天不点灯', host.all('gf-root')[0].style.getPropertyValue('--gf-glow') === '0',
  host.all('gf-root')[0].style.getPropertyValue('--gf-glow'))

// 换一个「出门了」的时刻：人还在图上，只是回到了落脚处
const gfNight = createGameflow({ loadRecords: () => demo, now: () => NOW + 6 * 3600 * 1000 })
gfNight.mount()
gfNight.open()
await tick()
const nightStage = document.body.children.filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
// 2026-10-08（第三十六版）：这三条原来是反的（记号收起来、`data-place` 清掉、
// 地名签收起来、地点那行写「地图外面」）。用户拍的是「角色必须一直显示在地图上」，
// 所以现在记号照在、`data-place` 是 `home`、地名签与状态行都写「落脚处」。
check('出门了他也在图上（记号照亮）',
  nightStage.all('gf-pin')[0]?.style.opacity === '1',
  String(nightStage.all('gf-pin')[0]?.style.opacity))
check('出门了钉在落脚处（data-place 是 home）',
  nightStage.all('gf-pin')[0]?.getAttribute('data-place') === 'home',
  String(nightStage.all('gf-pin')[0]?.getAttribute('data-place')))
check('出门了地点那行写「他的屋子」（不是「地图外面」，也不是「界外」）',
  nightStage.all('gf-v')[1]?.textContent === '他的屋子',
  String(nightStage.all('gf-v')[1]?.textContent))
check('出门了地名标签写着「他的屋子」',
  nightStage.all('gf-place-text')[0]?.textContent === '他的屋子',
  String(nightStage.all('gf-place-text')[0]?.textContent))
check('夜里的地图把灯点上', Number(nightStage.all('gf-root')[0].style.getPropertyValue('--gf-glow')) > 0.5,
  nightStage.all('gf-root')[0].style.getPropertyValue('--gf-glow'))
gfNight.destroy()

/* --- 见闻录：两栏，左边你、右边他 ----------------------------------- */

const rows = host.all('gf-row')
// 2026-10-09（用户原话：「除了今天之外，全部去掉。每天都新鲜事，而不要保存过去的事。」）：
// 夹具里七条，落在今天的只有两条（16:30 起的 33 分钟那一段、16:20 那一分钟），
// 其余五条是昨天起算的——一概不进见闻录。这两条夹具是**直接喂给界面**的（不经过宿主半边），
// 所以这里量的是界面那一层的过滤；真机上旧日子在更早一步就没了（宿主半边裁，见 src/index.js
// 的 pruneStore 与用户 m01403 第 2 条「旧日子删除」）。
check('只讲今天：昨天起的那五条一条都不进见闻录', rows.length === 2, `实际 ${rows.length}`)
const weeks = host.all('gf-week')
check('只有一周，连分组标签都不出现（「这一周」那行是会散的）',
  weeks.length === 1 && host.all('gf-week-label').length === 0,
  `${weeks.length} 组 / ${host.all('gf-week-label').length} 个标签`)
check('两栏各有表头（2026-10-03 改的名，2026-10-11 左栏改叫「你的日常」）', host.all('gf-col-you')[0]?.textContent === '你的日常'
  && host.all('gf-col-him')[0]?.textContent === '他的冒险',
  `${host.all('gf-col-you')[0]?.textContent} / ${host.all('gf-col-him')[0]?.textContent}`)
check('一行里就是两栏', rows[0].all('gf-cols').length === 1
  && rows[0].all('gf-you').length === 1 && rows[0].all('gf-him-col').length === 1)
check('左边是你的词加次数，一个句子都没有',
  rows[0].all('gf-you')[0].all('gf-tag').map((t) => t.textContent).join('/') === '改文件 ×12/跑命令 ×9/翻文件 ×6',
  rows[0].all('gf-you')[0].all('gf-tag').map((t) => t.textContent).join('/'))
check('左边还写着你动了哪几个文件（中文名排前，最多两个，全名挂在 title 上）',
  rows[0].all('gf-files')[0]?.textContent === '回望厅-设计文档 · client 等 4 个',
  rows[0].all('gf-files')[0]?.textContent)
check('文件名全在，只是收进悬停里',
  (rows[0].all('gf-files')[0]?.getAttribute('title') || '').includes('smoke.mjs'),
  rows[0].all('gf-files')[0]?.getAttribute('title'))
check('右边是他的说法，跟左边一一对上',
  (() => {
    // 2026-10-05 起第一枚是**这一行句子里真正在讲的那件事**（场景词，见 SCENES），
    // 后面才轮到各标签翻译出来的说法——所以不能再按位置一一对号，改成「都在并集里、
    // 不重复、头一枚属于主线那个动作」。
    // 2026-10-25：并集得把**场景词**一起算进去——那一枚本来就不在 `words` 里
    // （它是 `SCENES[语气][动作][i].w`），只查 `words` 会把正确的输出判成假红。
    // 而 `SCENES` 的形状是 `{ 语气: { 动作: [{key, w, lead, tail}, …] } }`——两层对象套数组，
    // 只 `.flat()` 一层拿到的是「动作 → 数组」那个对象，`.map(s => s.w)` 全是 undefined，
    // 等于这一条一直是哑的（2026-10-25 定位到这一处）。
    const got = rows[0].all('gf-him-col')[0].all('gf-tag').map((t) => t.textContent)
    const keys = ['改文件', '跑命令', '翻文件']
    const scenes = new Set(
      Object.values(SCENES).flatMap((byAct) => Object.values(byAct)).flat().map((s) => s.w),
    )
    const union = keys.flatMap((k) => ADV_WORDS[k])
    return got.length > 0 && got.length <= 3
      && new Set(got).size === got.length
      && got.every((w) => union.includes(w) || scenes.has(w))
      && (ADV_WORDS['改文件'].includes(got[0]) || scenes.has(got[0]))
  })(),
  rows[0].all('gf-him-col')[0].all('gf-tag').map((t) => t.textContent).join('/'))
check('左边不再重复报「动了几个文件」', rows[0].all('gf-meta').length === 0)
check('时长挪到行首那一刻里，左栏就少一行（时刻换成了 24 小时钟点）',
  rows[0].all('gf-when')[0]?.textContent === `今天 16:30 – ${hhmm(NOW)} · 35 分钟`,
  rows[0].all('gf-when')[0]?.textContent)
// 用户 2026-10-07 第 1 条：「现在已经 17:00 了，上面的时间还停在 16:38」——
// 「此刻」那一行右端必须是**现在**（这一段 16:30 开始、16:37 落盘、33 分钟，
// 现在 16:40，所以写 16:30 – 16:40；33 + 3 = 36 分钟，按 5 分钟计就是 35）。
// 底下那些行仍是它自己的起点，不动。
check('「此刻」那一行的右端是现在，不是这一段的起点',
  rows[0].all('gf-when')[0]?.textContent.endsWith(`– ${hhmm(NOW)} · 35 分钟`),
  rows[0].all('gf-when')[0]?.textContent)
check('过去的行照旧只写自己的起点（不是每一行都变成区间）',
  rows[1].all('gf-when')[0]?.textContent === '今天 16:20 · 1 分钟',
  rows[1].all('gf-when')[0]?.textContent)
check('老记录没有 counts 也照样写（退回只写词，不编数字）',
  rows[1].all('gf-you')[0].all('gf-tag').map((t) => t.textContent).join('/') === '一小会儿',
  rows[1].all('gf-you')[0].all('gf-tag').map((t) => t.textContent).join('/'))
check('没有文件就不留那一行（留白是对的）', rows[1].all('gf-files').length === 0)
// 行首那半句：近两天说「今天 / 昨天 / 前天」，更早才写月日（用户 2026-10-03 定的）
// 行首那半句：现在只会写「今天」（2026-10-09 起见闻录只讲今天）。
// 原来这里还有四条：「昨天 23:50 那段写昨天」「前天那段写前天」「三天以上才写月日」——
// 那三档现在一次都不会出现（历史记录根本不进这张表），所以换成下面这一条更硬的：
// 整张表里不许出现「昨天」「前天」或者「几月几日」开头的抬头。
// 真机上那些旧日子已经在宿主半边被裁掉了（`pruneStore`），面板这一层是第二道闸。
check('刚发生的那段写「今天」', rows[0].all('gf-when')[0]?.textContent.startsWith('今天'), rows[0].all('gf-when')[0]?.textContent)
check('整张表里没有一个抬头是「昨天」或更早（过去的都收走了）',
  host.all('gf-when').length > 0
  && host.all('gf-when').every((n) => (n.textContent || '').startsWith('今天')),
  host.all('gf-when').map((n) => n.textContent).join(' | '))

/* --- 面板开着的时候，时间要往前走（用户 2026-10-07 第 1 条） --------------- */
// 宿主每五分钟把进度写进 records.json（src/index.js 的 PERSIST_INTERVAL_MS），
// 面板也得跟着走；原来只在**打开那一刻**读一次，开着不动它就停在打开那一刻。
// 自检把节拍压到 20ms，就不用真等一分钟才看得见它走。
//
// 用户 2026-10-07 晚把两件事分清楚了（他圈了两个框）：
//   红框 = 表头那个「时间」→ **实时**，此刻的真实钟点，每分钟走；
//   蓝框 = 见闻录里的时刻 → **按 5 分钟计数、每 5 分钟落定一次**（18:26 写 18:25、
//          49 分钟写 50 分钟），中间那几分钟不抖出来。
const landed = (ts) => Math.floor(ts / (5 * 60 * 1000)) * (5 * 60 * 1000)
/** 时长按 5 分钟计（跟 src/client.js 的 landedMinutes 同一条规则；不到 5 分钟保持原数）。 */
const landMin = (m) => (m < 5 ? Math.round(m) : Math.round(m / 5) * 5)
let clockNow = NOW
let clockReads = 0
const clockGf = createGameflow({
  loadRecords: () => { clockReads += 1; return demo },
  now: () => clockNow,
  clockTickMs: 20,
})
clockGf.mount()
clockGf.open()
await new Promise((r) => setTimeout(r, 80))
const clockHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const whenNow = () => clockHost.all('gf-when')[0]?.textContent
const headNow = () => clockHost.all('gf-v')[0]?.textContent
const readsAtOpen = clockReads
check('刚打开时，「此刻」那一行写的就是打开这一刻',
  whenNow() === `今天 16:30 – ${hhmm(clockNow)} · ${landMin(36)} 分钟`, whenNow())
// 过七分钟（16:47）：见闻录里该落在 16:45 那个整五分钟上，不是 16:47。
clockNow = NOW + 7 * 60 * 1000
await new Promise((r) => setTimeout(r, 80))
check('时间往前走，「此刻」那一行跟着走（不是打开那一刻钉死）',
  whenNow() === `今天 16:30 – ${hhmm(landed(clockNow))} · ${landMin(41)} 分钟`, whenNow())
check('跨过整五分钟，它自己重新读了一次记录（跟宿主写盘同一班）',
  clockReads > readsAtOpen, `${readsAtOpen} → ${clockReads}`)
// 再走一分钟（16:48）：还在同一个五分钟格里，见闻录里那行一个字都不许动。
const readsAtMark = clockReads
clockNow = NOW + 8 * 60 * 1000
await new Promise((r) => setTimeout(r, 80))
check('没跨过整五分钟的时候，那一行不跟着分钟乱走（每5分钟一落）',
  whenNow() === `今天 16:30 – ${hhmm(landed(clockNow))} · ${landMin(41)} 分钟`, whenNow())
check('表头那个「时间」是此刻的真实钟点（红框要实时，21:03 就写 21:03）',
  headNow() === hhmm(clockNow), headNow())
check('同一个五分钟格里不再重读记录（一分钟读一次就白读了）',
  clockReads === readsAtMark, `${readsAtMark} → ${clockReads}`)
clockGf.close()
await new Promise((r) => setTimeout(r, 400))
const readsAfterClose = clockReads
const whenAfterClose = whenNow()
clockNow = NOW + 20 * 60 * 1000
await new Promise((r) => setTimeout(r, 80))
// 2026-10-08 晚用户 m11003 第 2 条要的是「门上给一个提醒的符号」——那枚记号关着门
// 也得自己亮，所以收起来之后钟**还走**：跨过整五分钟仍然重读一次记录，只重算记号。
check('面板收起来，跨过整五分钟它照样读一次记录（门框上那枚提醒记号要自己亮）',
  clockReads > readsAfterClose, `${readsAfterClose} → ${clockReads}`)
check('收起来的时候只重算记号，见闻录那一行一个字都不动（版面不重排）',
  whenNow() === whenAfterClose, `${whenAfterClose} → ${whenNow()}`)
clockGf.destroy()

/* --- 过去那些行的时刻也落在整五分钟上（用户 2026-10-07 晚的蓝框） ---------- */
// 用的就是他截图里那两个数：18:26 → 18:25、49 分钟 → 50 分钟；17:03 → 17:00。
// 第三条盯的是短段：不到 5 分钟保持原数，「一小会儿」不该被写成 5 分钟。
const snapGf = createGameflow({
  loadRecords: () => [
    {
      id: 'snap-1', startedAt: at(0, 19, 36), endedAt: at(0, 19, 55), minutes: 49,
      tags: ['改文件'], counts: { 改文件: 12 }, files: [], cwd: 'D:\\x\\a',
      // 19:35 → 19:55 一共 5 格（今天只铺最近半小时，窗口里放得下几格就几格），
      // 只在案 4 格（19:45 那格是空的，不是没记）。
      cells: [at(0, 19, 35), at(0, 19, 40), at(0, 19, 45), at(0, 19, 50), at(0, 19, 55)],
      // 一格一条明细：哪五分钟里做了什么（用户 2026-10-08 第 2 条要的梯子）。
      // **没列出来的那几格**＝那五分钟里什么都没发生；客户端照样给它们铺一行，
      // 只是矮、安静（见 rowFor 的 quiet）。铺不铺，由 `ticks` 在不在决定。
      ticks: [
        { at: at(0, 19, 35), actions: 3, counts: { 改文件: 3 }, files: ['D:\\x\\a\\一.js'], fails: 0, tags: ['改文件'] },
        { at: at(0, 19, 40), actions: 2, counts: { 改文件: 2 }, files: [], fails: 0, tags: ['改文件'] },
        { at: at(0, 19, 50), actions: 4, counts: { 改文件: 4 }, files: [], fails: 0, tags: ['改文件'] },
        { at: at(0, 19, 55), actions: 3, counts: { 改文件: 3 }, files: [], fails: 0, tags: ['改文件'] },
      ],
    },
    {
      id: 'snap-2', startedAt: at(0, 17, 3), endedAt: at(0, 17, 6), minutes: 3,
      tags: ['查资料'], counts: { 查资料: 2 }, files: [], cwd: 'D:\\x\\a',
      cells: [at(0, 17, 0)],
      ticks: [{ at: at(0, 17, 0), actions: 1, counts: { 查资料: 1 }, files: [], fails: 0, tags: ['查资料'] }],
    },
    {
      // 版本 6 及以前的老记录：没有 ticks，就照旧一张卡一行（不编格子）。
      // 49 分钟照旧凑整成 50 分钟（见下面的断言）。
      id: 'snap-3', startedAt: at(0, 15, 3), endedAt: at(0, 15, 33), minutes: 49,
      tags: ['跑命令'], counts: { 跑命令: 3 }, files: [], cwd: 'D:\\x\\a',
    },
    {
      // 短段：3 分钟照旧是 3 分钟，不会被凑成 5 分钟。
      id: 'snap-4', startedAt: at(0, 14, 0), endedAt: at(0, 14, 5), minutes: 3,
      tags: ['翻文件'], counts: { 翻文件: 1 }, files: [], cwd: 'D:\\x\\a',
    },
  ],
  now: () => at(0, 20, 0),
})
snapGf.mount()
await new Promise((r) => setTimeout(r, 60))
const snapHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const snapWhen = (i) => snapHost.all('gf-row')[i]?.all('gf-when')[0]?.textContent
const snapRow = (i) => snapHost.all('gf-row')[i]
// 用户 2026-10-08 第 2 条：「时间落盘是错误的，我要的是每5分钟落一次，不要折叠。
// 也就是说，时间从上而下应该是 10:00，9:55,9:50,9:45,9:40……」——一行人，抬头一个时刻。
const snapRows = () => snapHost.all('gf-row')
const ladder = (from, n) => Array.from({ length: n }, (_, k) => snapWhen(from + k))
const snap1 = ladder(0, 5).map((_, k) => snapRow(k))
const dressed = snap1.filter((r) => r.all('gf-tag').length > 0)
const empty = snap1.filter((r) => r.all('gf-quiet-dot').length > 0)
check('最新的那一格只写一个时刻（不再写区间与时长）',
  snapWhen(0) === '今天 19:55', snapWhen(0))
check('梯子从上往下每 5 分钟一格：19:55 19:50 … 19:35',
  ladder(0, 5).join(' ') === '今天 19:55 今天 19:50 今天 19:45 今天 19:40 今天 19:35',
  ladder(0, 5).join(' '))
check('在案的那几格左栏有账，空着的那格只剩一枚点（五格都在）',
  dressed.length === 4 && empty.length === 1, `${dressed.length} 格有账 / ${empty.length} 格空着`)
check('空着的那几格不编动作（左栏一个动作标签都没有）',
  empty.every((r) => r.all('gf-tag').length === 0), `${empty.length} 格`)
const quietLines = empty.map((r) => r.all('gf-remark')[0]?.textContent || '')
check('空着的那一格也有话（安静句，不是空白）',
  quietLines.every((line) => line.length > 0),
  quietLines.join(' / '))
// 2026-10-05 起今天只铺**最近半小时**（见 src/client.js 的 foldLadder，2026-10-06 用户
// 第 4 条把它从两小时改成半小时）：17:00 那一段、15:00 那张老式卡、14:00 那个短段都在
// 半小时以外，于是收成今天的一卷。梯子上那五格不变。
check('今天半小时以外的那几段收成一卷（不再一格一格往下铺）',
  snapRows().length === 6 && snapWhen(5) === '今天 14:00 – 17:10 · 55 分钟'
  && snapRow(5).all('gf-row-roll').length === 1 && snapRow(5).all('gf-row-day').length === 1,
  `${snapRows().length} 行 | ${snapWhen(5)}`)
check('那一卷把三分钟那段、老式卡与短段都加在一起（左栏是各格相加）',
  snapRow(5).all('gf-you')[0]?.all('gf-tag').map((t) => t.textContent).join('/') === '跑命令 ×3/查资料 ×1/翻文件 ×1',
  snapRow(5).all('gf-you')[0]?.all('gf-tag').map((t) => t.textContent).join('/'))
check('那一卷不当「此刻」，悬停写明它是今天早些时候',
  (snapRow(5).getAttribute('title') || '') === '今天早些时候的那几格也收在这一卷里',
  snapRow(5).getAttribute('title'))
snapGf.destroy()

/* --- 短段不凑整（3 分钟还是 3 分钟，不会被写成 5 分钟） ---------------------- */
// 这一段得放在半小时窗口里才看得见——不然它会先被收进今天那一卷。
const shortGf = createGameflow({
  loadRecords: () => [{
    id: 'short-1', startedAt: at(0, 19, 50), endedAt: at(0, 19, 55), minutes: 3,
    tags: ['翻文件'], counts: { 翻文件: 1 }, files: [], cwd: 'D:\\x\\a',
  }],
  now: () => at(0, 20, 0),
})
shortGf.mount()
await new Promise((r) => setTimeout(r, 60))
const shortHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('短段不凑整（3 分钟还是 3 分钟，不会被写成 5 分钟）',
  shortHost.all('gf-when')[0]?.textContent === '今天 19:50 – 19:55 · 3 分钟',
  shortHost.all('gf-when')[0]?.textContent)
shortGf.destroy()

/* --- 见闻录只讲今天（用户 2026-10-09） -------------------------------------- */
// 用户原话：「除了今天之外，全部去掉。每天都新鲜事，而不要保存过去的事。」
// 原来这里是一条四级折叠梯（2026-10-05 那两轮）：今天最近半小时一格一格，再往前按
// 日 / 周 / 月 / 年收卷。2026-10-09 把「讲」这一头砍到只剩今天——**砍的是讲，不是存**：
// `records.json` 里那些日子一个字节都没动，只是面板不再讲（见 src/client.js 的 foldLadder，
// 要装回来只要把那个 `continue` 换回三档判据）。下面三节就是这条新规矩的网。
const foldTick = (day, h, m, n, act = '改文件') => ({
  at: at(day, h, m), actions: n, counts: { [act]: n }, files: ['D:\\x\\a\\旧.js'], fails: 0, tags: [act],
})
const foldCards = [
  {
    // 今天最近半小时：三格，照旧一行一格。
    id: 'fold-today', startedAt: at(0, 19, 35), endedAt: at(0, 19, 45), minutes: 10,
    tags: ['改文件'], counts: { 改文件: 4 }, files: ['D:\\x\\a\\今天.js'], cwd: 'D:\\x\\a',
    ticks: [foldTick(0, 19, 35, 2), foldTick(0, 19, 40, 1), foldTick(0, 19, 45, 1)],
  },
  {
    // 今天更早的那一段（半小时以外）：也收成一卷，抬头仍写「今天」。
    // counts 故意写成 99：下面那条断言要证明「卷的左栏是各格相加（3+2），不是卡片那个总数」。
    id: 'fold-today-early', startedAt: at(0, 15, 0), endedAt: at(0, 15, 30), minutes: 25,
    tags: ['查资料'], counts: { 查资料: 99 }, files: ['D:\\x\\a\\今天早.js'], cwd: 'D:\\x\\a',
    ticks: [foldTick(0, 15, 0, 3, '查资料'), foldTick(0, 15, 30, 2, '查资料')],
  },
  {
    // 昨天两个来回：8:55 铺到 12:00（三十八格），21:00 又去了一趟——该收成**一行**。
    id: 'fold-yesterday-a', startedAt: at(1, 8, 55), endedAt: at(1, 12, 0), minutes: 185,
    tags: ['改文件'], counts: { 改文件: 30 }, files: ['D:\\x\\a\\旧.js'],
    deliverables: ['D:\\x\\a\\旧稿.md'],
    ticks: [foldTick(1, 8, 55, 5), foldTick(1, 9, 0, 6), foldTick(1, 10, 0, 4)],
  },
  {
    id: 'fold-yesterday-b', startedAt: at(1, 21, 0), endedAt: at(1, 21, 30), minutes: 30,
    tags: ['跑命令'], counts: { 跑命令: 7 }, files: ['D:\\x\\a\\旧.js'],
    ticks: [foldTick(1, 21, 0, 3, '跑命令'), foldTick(1, 21, 30, 4, '跑命令')],
  },
  {
    // 前天只有一张老式卡（版本 6 那种，没有 ticks）：也该收成一卷。
    id: 'fold-before', startedAt: at(2, 14, 0), endedAt: at(2, 14, 20), minutes: 20,
    tags: ['查资料'], counts: { 查资料: 2 }, files: ['D:\\x\\a\\更旧.md'], cwd: 'D:\\x\\a',
  },
]
const foldGf = createGameflow({ loadRecords: () => foldCards, now: () => at(0, 20, 0) })
foldGf.mount()
await new Promise((r) => setTimeout(r, 60))
const folforkDeathHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const folforkDeathRows = folforkDeathHost.all('gf-row')
const dayRows = folforkDeathHost.all('gf-row-day')
const foldWhen = (i) => folforkDeathRows[i]?.all('gf-when')[0]?.textContent
const foldYou = (i) => folforkDeathRows[i]?.all('gf-you')[0]?.all('gf-tag').map((t) => t.textContent).join('/')
// 五张卡里落在今天的只有两张：19:35 起的十分钟（铺成三格）＋15:00 起的二十五分钟（一卷）。
// 另外三张是昨天两趟与前天那张老式卡——一条都不进见闻录。
check('今天最近半小时照旧一格一格，今天更早的收成一卷',
  folforkDeathRows.length === 4 && folforkDeathHost.all('gf-row-roll').length === 1 && dayRows.length === 1,
  `${folforkDeathRows.length} 行 / 卷 ${folforkDeathHost.all('gf-row-roll').length} 行（日卷 ${dayRows.length}）`)
check('今天那三格没被折进去（抬头写一个时刻）',
  foldWhen(0) === '今天 19:45' && foldWhen(2) === '今天 19:35', `${foldWhen(0)} | ${foldWhen(2)}`)
check('今天更早的那一段也收成一卷（还是「今天」，悬停写明是早些时候）',
  foldWhen(3) === '今天 15:00 – 15:35 · 25 分钟'
  && (folforkDeathRows[3].getAttribute('title') || '') === '今天早些时候的那几格也收在这一卷里',
  `${foldWhen(3)} | ${folforkDeathRows[3].getAttribute('title')}`)
check('今天那一卷的左栏是各格相加（3+2 = 5），不是卡片那个总数（99）',
  foldYou(3) === '查资料 ×5', foldYou(3))
// 昨天那三张（8:55–12:00 那一大段、21:00 那一趟、前天那张没有 ticks 的老式卡）：
// 一张都不出现。原来这里验的是它们的卷抬头「昨天 08:55 – 21:35 · 3 小时 35 分」——
// 那套日卷/周卷/月卷/年卷的抬头现在一次都不会出现，所以换成下面两条。
check('昨天与前天的那三张卡一条都不进见闻录（整张表的抬头都写「今天」）',
  folforkDeathHost.all('gf-when').length === 4
  && folforkDeathHost.all('gf-when').every((n) => (n.textContent || '').startsWith('今天')),
  folforkDeathHost.all('gf-when').map((n) => n.textContent).join(' | '))
check('一面日卷 / 周卷 / 月卷 / 年卷都不再有（日卷只剩今天那一卷）',
  dayRows.length === 1 && folforkDeathHost.all('gf-row-week').length === 0
  && folforkDeathHost.all('gf-row-month').length === 0 && folforkDeathHost.all('gf-row-year').length === 0,
  `日 ${dayRows.length} / 周 ${folforkDeathHost.all('gf-row-week').length} / 月 ${folforkDeathHost.all('gf-row-month').length} / 年 ${folforkDeathHost.all('gf-row-year').length}`)
// 存档那一头没被动过：喂进去的五张卡原样还在（过滤是新建一份，没有就地改）
check('存档那一份一个字节没动（五张卡还是五张）',
  foldCards.length === 5 && foldCards[3].id === 'fold-yesterday-b', `剩 ${foldCards.length} 张`)
foldGf.destroy()

/* --- 更早的那些日子：周卷 / 月卷 / 年卷都不再出现（2026-10-09） --------------- */
// 这三张卡（十天前、七十天前、四百天前）原来各自收成周卷 / 月卷 / 年卷。
// 2026-10-09 起见闻录只讲今天，它们一条都不出现——但仍然在存档里（这里只是喂给面板的那一份）。
const rollCards = [
  {
    // 十天前：落在「八个自然周」那一档里 → 周卷。
    id: 'roll-week', startedAt: at(10, 9, 0), endedAt: at(10, 9, 30), minutes: 20,
    tags: ['改文件'], counts: { 改文件: 6 }, files: ['D:\\x\\a\\周.js'], cwd: 'D:\\x\\a',
    ticks: [foldTick(10, 9, 0, 3), foldTick(10, 9, 30, 3)],
  },
  {
    // 七十天前：过了八周、还在十二个月里 → 月卷。
    id: 'roll-month', startedAt: at(70, 14, 0), endedAt: at(70, 14, 30), minutes: 20,
    tags: ['跑命令'], counts: { 跑命令: 6 }, files: ['D:\\x\\a\\月.js'], cwd: 'D:\\x\\a',
    ticks: [foldTick(70, 14, 0, 3, '跑命令'), foldTick(70, 14, 30, 3, '跑命令')],
  },
  {
    // 四百天前：更早 → 年卷。
    id: 'roll-year', startedAt: at(400, 11, 0), endedAt: at(400, 11, 30), minutes: 20,
    tags: ['翻文件'], counts: { 翻文件: 6 }, files: ['D:\\x\\a\\年.js'], cwd: 'D:\\x\\a',
    ticks: [foldTick(400, 11, 0, 3, '翻文件'), foldTick(400, 11, 30, 3, '翻文件')],
  },
]
const rollGf = createGameflow({ loadRecords: () => rollCards, now: () => at(0, 20, 0) })
rollGf.mount()
await new Promise((r) => setTimeout(r, 60))
const rollHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const rollRows = rollHost.all('gf-row')
check('十天前 / 七十天前 / 四百天前的卡一张都不进见闻录',
  rollRows.length === 0, `实际 ${rollRows.length} 行`)
check('一面周卷 / 月卷 / 年卷都不再有',
  rollHost.all('gf-row-week').length === 0 && rollHost.all('gf-row-month').length === 0
  && rollHost.all('gf-row-year').length === 0,
  `${rollHost.all('gf-row-week').length}/${rollHost.all('gf-row-month').length}/${rollHost.all('gf-row-year').length}`)
check('今天一条都没有的时候，表态只有一句「他还没走过多远。」（不装作有历史）',
  rollHost.all('gf-empty').length === 1 && rollHost.all('gf-empty')[0].textContent === '他还没走过多远。',
  rollHost.all('gf-empty')[0]?.textContent)
rollGf.destroy()

/* --- 行数上限与历史长短无关（阶梯的意义就在这里） ---------------------------- */
// 一年与三年的记录：行数差不超过年数（多的那几年各占一行）。
const spread = (days) => {
  // 今天先摆两段（都落在最近半小时以外，会收成今天那一卷）：行数必须与历史长短无关。
  // 2026-10-09 之前这里验的是「三年比一年多出的就是那几年，各一行」——三年份历史现在
  // 一行都不占，所以判据换成正面的：历史再长，今天那几段也就是一卷。
  const out = [
    { id: 'spread-today-a', startedAt: at(0, 10, 0), endedAt: at(0, 10, 30), minutes: 20, tags: ['改文件'], counts: { 改文件: 4 }, files: [], cwd: 'D:\\x\\a' },
    { id: 'spread-today-b', startedAt: at(0, 14, 0), endedAt: at(0, 14, 30), minutes: 20, tags: ['改文件'], counts: { 改文件: 4 }, files: [], cwd: 'D:\\x\\a' },
  ]
  for (let d = 1; d <= days; d += 9) {
    out.push({
      id: `spread-${d}`, startedAt: at(d, 10, 0), endedAt: at(d, 10, 30), minutes: 20,
      tags: ['改文件'], counts: { 改文件: 4 }, files: [], cwd: 'D:\\x\\a',
    })
  }
  return out
}
const rowsForHistory = async (days) => {
  const gf = createGameflow({ loadRecords: () => spread(days), now: () => at(0, 20, 0) })
  gf.mount()
  await new Promise((r) => setTimeout(r, 60))
  const host = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
  const n = host.all('gf-row').length
  gf.destroy()
  return n
}
const rows1y = await rowsForHistory(365)
const rows3y = await rowsForHistory(1095)
check('行数只由今天有多少段决定，与历史长短无关（一年份与三年份一样：今天那一卷）',
  rows1y === 1 && rows3y === 1, `一年 ${rows1y} 行 / 三年 ${rows3y} 行`)
// 2026-10-09 之前这里验的是「折叠出来的那一卷不当此刻」：过了午夜打开面板，最新那一卷是
// **昨天**收的，不能把昨天那件事说成现在。见闻录只讲今天之后，昨天那一卷根本不进 `units`，
// 所以「此刻」走的是那个空档（一句话都没有今天的东西）——判据换成新的，牙口还是同一个：
// 不许出现任何**动作**（act 必须为 null，否则记号会往昨天那件事的地方钉）。
const foldSaid = () => narrationFor([
  { id: 'fold-late', startedAt: at(1, 23, 40), endedAt: at(1, 23, 57), minutes: 17, tags: ['改文件'], counts: { 改文件: 2 }, files: [] },
], at(0, 0, 3))
check('昨天那一卷不当「此刻」（过了午夜打开，他不会还在昨天那件事上）',
  foldSaid().act === null && foldSaid().place === 'home' && foldSaid().line === SHARED_LINES.away,
  `${foldSaid().line} / act=${foldSaid().act} / place=${foldSaid().place}`)

// 2026-10-05 之后「此刻」那行不再写「就是现在」，它写的就是他那句话本身
check('最新那行的右栏写的是他那句话（不再写「就是现在」）',
  rows[0].all('gf-remark')[0]?.textContent === NEWEST_LINE && !/就是现在/.test(rows[0].all('gf-remark')[0]?.textContent || ''),
  rows[0].all('gf-remark')[0]?.textContent)
check('另一行说别的话（不是每行都同一句）',
  (rows[1].all('gf-remark')[0]?.textContent || '').length > 3
  && rows[1].all('gf-remark')[0]?.textContent !== rows[0].all('gf-remark')[0]?.textContent,
  rows[1].all('gf-remark')[0]?.textContent)
check('打个转那天也说出来（在落脚处，说的是落脚处的事）',
  HOME_LINES.includes(rows[1].all('gf-remark')[0]?.textContent) &&
  homeOnly(rows[1].all('gf-remark')[0]?.textContent),
  rows[1].all('gf-remark')[0]?.textContent)

// 见闻录是「他走过的地方」，不是你的会话列表
check('DSH 的会话标题一个字都没有', host.all('gf-title').length === 0)
// 2026-10-03 用户问「为什么会有他带回来了策划案这种描述？」——交付物是**你的**东西，
// 放到他那一边既破了戏（他在抄咒文，不会带回来一份策划案），又和左栏的文件名重复。
check('交付物写在左栏，不写「他带回来」（用户问过）', host.all('gf-keeps').length === 0)
check('交付物并进左栏的文件名那一行（去重）',
  rows[0].all('gf-files')[0]?.textContent === '回望厅-设计文档 · client 等 4 个',
  rows[0].all('gf-files')[0]?.textContent)
// 昨天那张卡（三件交付物、`01_策划案v3` 那份）原来在这儿验「超过两个就收成『等 N 个』」。
// 它已经不在这张表里了——换成正面验这件事：它的东西一个字都不该出现。
check('昨天那张卡的交付物在这张表里一个字都不出现',
  host.all('gf-files').every((n) => !String(n.textContent || '').includes('01_策划案')),
  host.all('gf-files').map((n) => n.textContent).join(' | '))
check('右边写上帮手（汉字数字，右栏不许出现阿拉伯数字）', rows[0].all('gf-help')[0]?.textContent === '有两个帮手还在外面。',
  rows[0].all('gf-help')[0]?.textContent)
check('那天的他那边可以什么都没有（不为了填满而编）',
  rows[1].all('gf-help').length === 0 && rows[1].all('gf-remark').length === 1)
// 2026-10-07 用户看图说「格式不一致」：同样挂在活计句下面的位置，生活层缩进挂竖线、
// 帮手那行却是一行没头没尾的淡字。它属于活计那一层，就该穿活计那套样式——
// 这条断言盯的是「它跟活计句同一层，不是第三层」。
check('帮手那行是活计那一层的（跟活计句同一套样式，不是第三层）',
  rows[0].all('gf-help')[0]?._class?.has('gf-remark')
  && !rows[0].all('gf-help')[0]?._class?.has('gf-life'),
  [...(rows[0].all('gf-help')[0]?._class || [])].join(' '))
// 生活层只在他那一栏，而且**不是每行都有**（大多数行应该没有）。
check('生活层写在他那一栏',
  host.all('gf-life').every((n) => n.parentNode?._class?.has('gf-him-col')),
  host.all('gf-life').map((n) => n.textContent).join(' | '))
check('生活层不是每行都有（不然又成套话）',
  host.all('gf-life').length > 0 && host.all('gf-life').length < rows.length,
  `${host.all('gf-life').length}/${rows.length}`)
check('左栏一个字都不多（生活层不许跑到左边）',
  rows.every((r) => r.all('gf-you')[0].all('gf-life').length === 0))
check('两边各自最多 3 个标签（两栏一样厚）', rows.every((r) => r.all('gf-you')[0].all('gf-tag').length <= 3
  && r.all('gf-him-col')[0].all('gf-tag').length <= 3))
// 2026-10-02 试用反馈：一开始不知道卡片能点开。
// 用户 m02118 的解法是「不要去点」——两栏并排，一眼看完，所以整个翻开机制和折角都删了。
check('没有任何需要点开的东西', host.all('gf-card').length === 0 && host.all('gf-fold').length === 0)
check('也没有「点一下」这类提示', host.all('gf-hint').length === 0)
check('每行都能被读屏软件读成一句话',
  (rows[0].getAttribute('aria-label') || '').includes('你在改文件 12 次、跑命令 9 次、翻文件 6 次'),
  rows[0].getAttribute('aria-label'))

// 门缝里那道光：平时藏着，手放上去才亮（「动作和效果」的补课）
const doorPanelStyles = shadow.allTag('style').map((s) => s.textContent).join('\n')
const cracks = host.all('gf-door-crack')
check('门下留了两道光缝', cracks.length === 2, String(cracks.length))
check('光缝平时是暗的',
  doorPanelStyles.includes('.gf-door-crack {') && /\.gf-door-crack \{[^}]*opacity: 0/.test(doorPanelStyles))
check('手放上去才亮（hover 与键盘聚焦都给）',
  /\.gf-door:hover \.gf-door-crack,\s*\n\.gf-door:focus-visible \.gf-door-crack \{ opacity: var\(--gf-crack-dim\)/.test(doorPanelStyles))
check('光缝颜色跟门把手同色（暖的）',
  cracks.every((c) => c.attributes.fill === 'var(--gf-door-knob)'))
check('两道光缝一明一暗', cracks[0].attributes.style === '--gf-crack-dim:0.55' && cracks[1].attributes.style === '--gf-crack-dim:1',
  `${cracks[0].attributes.style} / ${cracks[1].attributes.style}`)

// 门：鼠标移上去就自己浮现（用户 m07224 第 3 条原话）。
// 留 140ms 犹豫时间——鼠标只是划过去不该弹出来；触摸屏上 pointerenter 紧挨着 click。
gf.close()
await new Promise((r) => setTimeout(r, 380)) // 关是有过渡的：320ms 之后才真的 hidden
const doorEl = host.all('gf-door')[0]
const roomEl = host.all('gf-room')[0]
check('先把它关上（不然下面两条是空的）', roomEl.hidden === true)
check('门挂上了「移上去」和「移开」两个监听',
  (doorEl.listeners.pointerenter || []).length === 1 && (doorEl.listeners.pointerleave || []).length === 1)
doorEl.dispatch('pointerenter', { pointerType: 'touch' })
await new Promise((r) => setTimeout(r, 180))
check('触摸屏上不会被悬停误开（一次点击不能被算成两下）', roomEl.hidden === true)
doorEl.dispatch('pointerenter', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 180))
check('鼠标停在门上，它自己就浮现了', roomEl.hidden === false)
gf.close()
await new Promise((r) => setTimeout(r, 380))
doorEl.dispatch('pointerenter', { pointerType: 'mouse' })
doorEl.dispatch('pointerleave', {})
await new Promise((r) => setTimeout(r, 180))
check('鼠标只是划过去（没停住）不会弹出来', roomEl.hidden === true)

// 2026-10-06 用户补的：「移走 2 秒就消失」。2026-10-07 第 3 条嫌慢，改成 1 秒。
doorEl.dispatch('pointerenter', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 180))
check('（先把它用悬停打开）', roomEl.hidden === false)
doorEl.dispatch('pointerleave', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 600))
check('鼠标移开半秒多，他还在（不是一移开就没了）', roomEl.hidden === false)
await new Promise((r) => setTimeout(r, 900))
check('鼠标移开一秒之后，它自己收起来了', roomEl.hidden === true)

// 但从门挪进面板里不算离开——否则你想把鼠标往上移去看内容，面板正好在你手底下关掉。
doorEl.dispatch('pointerenter', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 180))
doorEl.dispatch('pointerleave', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 400))
roomEl.dispatch('pointerenter', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 1600))
check('鼠标从门挪进面板里，面板不关（挪进去不算离开）', roomEl.hidden === false)
roomEl.dispatch('pointerleave', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 1500))
check('鼠标从面板上移开一秒，才真的收起来', roomEl.hidden === true)

check('窗口尺寸变了会重量一次滚动条空档',
  (globalThis.window.listeners.resize || []).length >= 1,
  String((globalThis.window.listeners.resize || []).length))
check('滚动条空档写进了 --gf-sb（地图靠它跟字对齐）',
  host.all('gf-root')[0].style.getPropertyValue('--gf-sb') === '10px',
  host.all('gf-root')[0].style.getPropertyValue('--gf-sb'))
check('地图、状态块、表头的右边距都跟着这个变量走',
  /\.gf-stage \{[^}]*margin: 12px calc\(22px \+ var\(--gf-sb, 0px\)\) 0 22px/.test(doorPanelStyles)
  && /\.gf-cols-head \{[^}]*padding: 6px calc\(22px \+ var\(--gf-sb, 0px\)\) 10px 22px/.test(doorPanelStyles)
  && /\.gf-now \{[^}]*padding: 9px calc\(22px \+ var\(--gf-sb, 0px\)\) 0 22px/.test(doorPanelStyles))

// 主题
gf.setTheme('classics')
check('切到古籍图书馆', host.all('gf-root')[0].getAttribute('data-theme') === 'classics')
check('主题色板写进了 CSS 变量', host.all('gf-root')[0].style.getPropertyValue('--gf-bg').includes('42, 33, 26'))
check('地图也跟着换色（重上一次色，不用重画一套画）',
  host.all('gf-root')[0].style.getPropertyValue('--gf-land') === '#3A3226',
  host.all('gf-root')[0].style.getPropertyValue('--gf-land'))
gf.setTheme('plain')
check('切回朴素的书房', host.all('gf-root')[0].getAttribute('data-theme') === 'plain')
gf.setTheme('nope')
check('无效主题被忽略', gf.theme === 'plain')

// 说法：只换他那边的名词，地图和位置一动不动。
// 2026-10-05 起「案牍」那套被用户摘掉了，所以这一节验的是「给一个表里没有的说法会
// 怎样」：安静地退回默认那一套，什么都不动（2026-10-06 起表里是冒险 + 船家两套）。
const lineBefore = host.all('gf-remark').map((n) => n.textContent)
const placeBefore = host.all('gf-pin')[0].getAttribute('data-at')
const placeNameBefore = host.all('gf-v')[1].textContent
gf.setVoice('ledger')
check('给一个已经没有的说法：退回默认那一套', gf.voice === 'adventure', gf.voice)
check('退回之后，见闻录一句话都没动',
  host.all('gf-remark').map((n) => n.textContent).join() === lineBefore.join())
check('他站的地方一动不动（说法不改地理）',
  host.all('gf-pin')[0].getAttribute('data-at') === placeBefore)
check('地名也一动不动', host.all('gf-v')[1].textContent === placeNameBefore,
  `${placeNameBefore} → ${host.all('gf-v')[1].textContent}`)
check('那句话也照旧', (host.all('gf-nowish')[0]?.textContent || '') === NEWEST_LINE)
gf.setVoice('nope')
check('无效语气被忽略', gf.voice === 'adventure')

// 「故事风格」：门后那扇窗里那一格，也是**换说法的唯一入口**（2026-10-06 用户第 1 条：
// 「切换的方式只能放在故事风格后面，也就是现在点击『冒险』这个地方进行切换」）。
// 2026-10-05 用户先点了「入口放门后，不占见闻录的版面」，同一轮又把它从「谁在讲」
// 改名成**故事风格**；2026-10-06 起是**一个名字 + 一张清单**（用户当天晚些时候第 1 条：
// 「故事风格并不是并行点击切换，而是只有一个冒险，然后点击冒险，会弹出来一个小界面，
// 小界面往下就可以选择其他故事风格」）——名字上写当前那一套，点它才弹出清单。
const voiceNames = host.all('gf-voice-name')
const voiceBtns = host.all('gf-voice-b')
check('门后那扇窗里有「故事风格」这一行',
  host.all('gf-voice-k').map((n) => n.textContent).join() === '故事风格',
  host.all('gf-voice-k').map((n) => n.textContent).join('/'))
check('「故事风格」后面只有一个名字（不是并排几个按钮）',
  voiceNames.length === 0 && voiceBtns.length === 1
  && voiceBtns[0].getAttribute('data-voice') === gf.style,
  `名字 ${voiceNames.length} 个 / 开关 ${voiceBtns.length} 个：${voiceBtns.map((n) => n.textContent).join('/')}`)
check('名字上写的就是包里那套说法的名字（当前这套叫「奇幻冒险」）',
  voiceBtns[0].textContent === PACKS.adventure.label && PACKS.adventure.label === '奇幻冒险',
  `${voiceBtns[0].textContent} / ${PACKS.adventure.label}`)
check('没点开之前，那张清单是收着的（清单里只列其他几套）',
  host.all('gf-styles')[0]?.hidden === true
  && host.all('gf-style-item').length === listedStyles().length - 1,
  `清单 ${host.all('gf-styles').length} 张（收着）/ 列着 ${host.all('gf-style-item').length} 项`)
check('当前讲的那一套是按着的那个',
  voiceBtns[0].getAttribute('aria-pressed') === 'true', gf.style)

/* ------------------------------------------------------------------ *
 * 说法清单（2026-10-06，用户 m04413 第 1、2 条 + 当天晚些时候第 1 条）
 *
 * 用户原话：「1、故事包位置错误，切换的方式只能放在故事风格后面，也就是现在点击
 * 『冒险』这个地方进行切换；2、而且切换的时候，不要改变其他内容，只改变叙事风格，
 * 也就是对应的他的冒险的下面的内容。」他随后补了做法：「故事风格并不是并行点击切换，
 * 而是只有一个冒险，然后点击冒险，会弹出来一个小界面，小界面往下就可以选择其他故事
 * 风格」，以及「只列其他几套」「鼠标移开1秒后自动关闭」。
 *
 * 所以原先摆在地图下面那格「故事包」书架**连 DOM 一起撤了**，改由这一格承担：名字上写
 * 当前那一套，点它才弹出清单，清单里只列其余几套。这一节用一个**临时说法包**验机制：
 * 把注册表里那个奇幻冒险复制一份、换个 id 与名字塞进 `PACKS`。**期望值一律从注册表推**
 * （`listPacks()`），所以新包进来这一节不用改。
 * ------------------------------------------------------------------ */
const packsMod = await import('../src/packs/index.js')
const trigger = () => host.all('gf-voice-b')[0]
const itemsNow = () => host.all('gf-style-item')
const styleOf = (voice) => itemsNow().find((n) => n.getAttribute('data-voice') === voice)
const menuOpen = () => host.all('gf-styles')[0]?.hidden !== true
// 换一套词：右栏要看得见它真的换了（句子、词都从这个包来）
const demoWords = { ...PACKS.adventure.words, 改文件: ['照镜子', '抹掉影子'] }
const demoStyle = {
  ...PACKS.adventure,
  id: 'smoke-demo',
  name: '烟与镜',
  voice: 'smoke',
  label: '烟与镜',
  tagline: '演示用的第二套说法。',
  cover: '烟',
  words: demoWords,
  sharedLines: { ...PACKS.adventure.sharedLines, idle: '镜子里那个人也把手停了。' },
}
packsMod.PACKS['smoke-demo'] = demoStyle
gf.refreshStyles()
check('注册了几套说法，清单里就列其余几套（当前那一套不列）',
  itemsNow().length === listedStyles().length - 1
  && !!styleOf('smoke') && !styleOf('adventure')
  && host.all('gf-voice')[0]?.hidden !== true,
  itemsNow().map((n) => `${n.getAttribute('data-voice')}=${n.textContent}`).join(' / '))
check('清单里的名字都是包里的名字（注册表顺序就是清单次序）',
  itemsNow().map((n) => n.textContent).join('/')
  === listedStyles().filter((p) => p.voice !== gf.style).map((p) => p.label).join('/'),
  itemsNow().map((n) => n.textContent).join('/'))
check('没点名字之前，清单不露出来',
  menuOpen() === false && trigger().getAttribute('aria-expanded') === 'false')
trigger().dispatch('click')
check('点一下名字，清单就弹出来了（用户当天晚些时候第 1 条）',
  menuOpen() === true && trigger().getAttribute('aria-expanded') === 'true')
// 2026-10-06 傍晚用户说「单显示船家有点单调了，我们应该在前面加一个措辞，表示可以切换」，
// 于是清单顶上多了一行小字，那个名字底下也多了一条虚线（旧书折角的意思：这儿能翻）。
// 当天最晚他第 1 条把那行小字定成「换一种风格」（原来是「换一种讲法」）。
check('清单顶上写着这是干什么的（不是光秃秃一项）',
  host.all('gf-styles-head').length === 1 && host.all('gf-styles-head')[0].textContent === '换一种风格',
  host.all('gf-styles-head').map((n) => n.textContent).join('/') || '没有那行字')
const styleCss = shadow.allTag('style').map((s) => s.textContent).join('\n')
check('那个名字底下压着一条虚线，移上去变实（看得出能点）',
  /\.gf-voice-b\s*\{[^}]*border-bottom:\s*1px dashed/.test(styleCss)
  && /\.gf-voice-b:hover\s*\{[^}]*border-bottom-style:\s*solid/.test(styleCss),
  /\.gf-voice-b[^}]*border-bottom[^;]*/.exec(styleCss)?.[0]?.trim() || '没找到那条虚线')
check('清单里每一项前面一个小记号（是一列条目，不是一个浮着的标签）',
  /\.gf-style-item::before\s*\{[^}]*content:\s*'·'/.test(styleCss),
  /\.gf-style-item::before[^}]*/.exec(styleCss)?.[0]?.trim() || '没找到那个记号')
// 第四十三版：这一条查「真灌进页面那支 <style> 里了」——`LF_CSS` 是从
// `src/map/local.js` 拼出来的，颜色只在那边写一次，面板这边不重复，
// 所以只有把渲染出来的样式读出来才验得到。
// 丙（用户 m22497）把犁沟从 `FIELD_LO #87793C` / 0.062 / 0.85 改成
// `FURROW #8C7B3C` / 0.035 / 0.5——田改成一块犁过的地之后，七道细沟要够细才不糊在一起。
check('镜内犁沟那条真灌进页面了（`#8C7B3C`、0.035、0.5）',
  /\.gf-map \.lf\{stroke:#8C7B3C;stroke-width:0\.035;opacity:0\.5\}/.test(styleCss),
  /\.gf-map \.lf[^}]*\}/.exec(styleCss)?.[0]?.trim() || '没找到犁沟那一条')
/* 2026-10-06 晚用户第 3 条：「预留几个风格，为规则怪谈、宫斗心计、谍战潜伏」。
   它们只有名字、没有内容，所以名字先摆上、点了也不换说法——
   这跟「锁着」是两回事（锁着是钱的事，授权完就能用；预留是还没写，给多少钱都用不了）。 */
const packOfVoice = (voice) => packsMod.listPacks().find((p) => p.voice === voice)
const reservedItems = () => itemsNow().filter((n) => packOfVoice(n.getAttribute('data-voice'))?.soon)
// 预留的那几套直接从注册表里数出来（`soon: true`），不另开一份名单——
// 名单多一份就会跟注册表走岔（`src/packs/reserved.js` 是它们的家，这里只认注册表）。
const soonPacks = () => Object.values(packsMod.PACKS).filter((p) => p.soon)
check('预留的那几套照样列在清单里（名字先摆上，内容还没写）',
  reservedItems().length === soonPacks().length && soonPacks().length >= 3
  && reservedItems().map((n) => n.textContent).join('/')
    === soonPacks().map((p) => p.label).join('/'),
  reservedItems().map((n) => n.textContent).join('/') || '（一项都没有）')
/* 2026-10-06 深夜用户第 1 条：「这里还是显示着没有写好」——那句话原先挂在 `title` 上，
   鼠标一停就浮出系统那个白框。他接着（m06529 第 1 条）又说「现在这三个的风格，也要用
   奇幻冒险悬停时浮出的那个白框」：浮框留着，但挂的是**它自己那一句**（跟挑得动的项
   一个规矩），不再是「还没写好」；点它不换说法这件事改在摊开的那一块里说（见下面几条）。 */
check('预留的那几套悬停也浮出它自己那一句（不是「还没写好」）',
  reservedItems().every((n) => n.getAttribute('title')
    === packOfVoice(n.getAttribute('data-voice'))?.tagline
    && !n.hasAttribute('aria-disabled') && n.getAttribute('aria-expanded') === 'false'),
  reservedItems().map((n) => `${n.textContent}：${n.getAttribute('title') || '（没挂浮话）'}`).join(' / '))
/* 2026-10-06 深夜用户第 2 条：「我希望点击了再显示描述，而不是全体展示在这里，有点密集了就」——
   那一句住在各自包的 `tagline` 里，画在名字底下那一块 `.gf-style-note` 上，**默认收着**。
   点得动的那几项没有这一块（它们悬停时自己浮出那一句），所以这一条同时钉住「有几块」
   与「里头是哪一句」。 */
const styleNotes = () => host.all('gf-style-note')
const notesShut = () => styleNotes().every((n) => n.hidden === true)
const noteCore = (n) => n.children?.[0]?.textContent
check('预留的那几套的「它的核」默认收着（不是全体摊在清单里）',
  styleNotes().length === soonPacks().filter((p) => p.tagline).length
  && soonPacks().every((p) => styleNotes().some((n) => noteCore(n) === p.tagline))
  && notesShut(),
  styleNotes().map((n) => `${noteCore(n) || '（空的）'}${n.hidden ? '（收着）' : '（摊着）'}`).join(' / ')
    || '（一块都没有）')
const reservedBefore = gf.style
const reservedWho = () => reservedItems()[0].getAttribute('data-voice')
reservedItems()[0].dispatch('click')
check('点一下预留的那一套：它那一句摊开、说法没换',
  gf.style === reservedBefore
  && styleNotes().find((n) => n.parentNode === reservedItems()[0].parentNode)?.hidden === false
  && reservedItems()[0].getAttribute('aria-expanded') === 'true',
  `${reservedBefore} → ${gf.style}；摊开的是 ${reservedWho()}`)
if (reservedItems().length > 1) {
  reservedItems()[1].dispatch('click')
  check('摊开另一套，前一套自己合上（一次只摊一个）',
    styleNotes().filter((n) => n.hidden === false).length === 1
    && styleNotes().find((n) => n.parentNode === reservedItems()[1].parentNode)?.hidden === false
    && styleNotes().find((n) => n.parentNode === reservedItems()[0].parentNode)?.hidden === true)
  reservedItems()[1].dispatch('click')
}
check('再点同一个就合上（摊开是「点一下」的事，不是一直挂着）', notesShut())
trigger().dispatch('click')
check('清单收起来，摊开的那一句也跟着收起来',
  menuOpen() === false && notesShut())
trigger().dispatch('click')
// 2026-10-06 傍晚用户把鼠标放上去，浮出来的却是「案上的活计，出了门就是路上的一件事。」，
// 他说「并不符合奇幻冒险的内核所在」——那句话住在 `adventure/world.js` 里，本来是给
// 「选世界」那一格写的，入口搬成「选说法」之后被原样挂到了说法的名字上。现在钉住这层接线：
// 名字与清单里每一项的 title 都得是**它自己那个包**的 tagline（`packOfVoice` 在上面）。
check('悬停那个名字浮出来的话，是这一套包里自己那一句',
  trigger().getAttribute('title') === packsMod.PACKS.adventure.tagline,
  trigger().getAttribute('title') || '（没挂）')
// 清单里每一项都挂自己那一句 tagline（预留的那几套 m06529 起也挂），这一条只看挑得动的，
// 免得跟上面那条预留的断言说同一件事。
const pickableItems = () => itemsNow().filter((n) => !packOfVoice(n.getAttribute('data-voice'))?.soon)
check('清单里挑得动的每一项浮出来的话，也是它自己那一句（不是共用的同一句）',
  pickableItems().length > 0
  && pickableItems().every((n) => n.getAttribute('title') === packOfVoice(n.getAttribute('data-voice'))?.tagline),
  pickableItems().map((n) => `${n.getAttribute('data-voice')}: ${n.getAttribute('title') || '（没挂）'}`).join(' / '))
// 换说法之前先记下「不该动的那几样」：地名、记号、主题、左栏、行数、地图本体。
const styleBefore = {
  id: gf.style,
  theme: gf.theme,
  place: host.all('gf-v')[1].textContent,
  pin: host.all('gf-pin')[0].getAttribute('data-at'),
  you: host.all('gf-you').map((n) => n.textContent).join('|'),
  rows: host.all('gf-row').length,
  svg: host.allTag('svg').length,
  kids: host.all('gf-stage')[0].children.length,
}
styleOf('smoke').dispatch('click')
check('点清单里那一项，说法就换了', gf.style === 'smoke', gf.style)
check('换完清单自己收起来（不用再点一下）', menuOpen() === false)
check('换完，名字上写的是新那套',
  trigger().textContent === demoStyle.label && trigger().getAttribute('data-voice') === 'smoke',
  `${trigger().textContent} / ${trigger().getAttribute('data-voice')}`)
check('清单跟着重算：刚换上的那套从清单里消失，换下来的那套回到清单里',
  !styleOf('smoke') && !!styleOf('adventure'),
  itemsNow().map((n) => n.getAttribute('data-voice')).join('/'))
check('挑过的说法记下来了（下次打开还是它）',
  worldStore.size === 1 && [...worldStore.values()][0] === 'smoke',
  worldStore.size
    ? [...worldStore.entries()].map(([k, v]) => `${k}=${v}`).join('、')
    : '（一个字都没记）')
check('只换说法：地名一个字不动（用户第 2 条）',
  host.all('gf-v')[1].textContent === styleBefore.place,
  `${styleBefore.place} → ${host.all('gf-v')[1].textContent}`)
check('只换说法：记号一动不动（人还站在同一个地方）',
  host.all('gf-pin')[0].getAttribute('data-at') === styleBefore.pin,
  `${styleBefore.pin} → ${host.all('gf-pin')[0].getAttribute('data-at')}`)
check('只换说法：主题不动（换的是谁在讲，不是这个世界）',
  gf.theme === styleBefore.theme
  && host.all('gf-root')[0].getAttribute('data-theme') === styleBefore.theme,
  `${gf.theme} / ${host.all('gf-root')[0].getAttribute('data-theme')}`)
check('只换说法：左栏（你的日常）一个字不动',
  host.all('gf-you').map((n) => n.textContent).join('|') === styleBefore.you,
  host.all('gf-you').map((n) => n.textContent).join('|'))
check('只换说法：行数、地图、stage 的孩子都没动（没重画一遍）',
  host.all('gf-row').length === styleBefore.rows
  && host.allTag('svg').length === styleBefore.svg
  && host.all('gf-stage')[0].children.length === styleBefore.kids,
  `${styleBefore.rows} → ${host.all('gf-row').length} 行 / svg ${styleBefore.svg} → ${host.allTag('svg').length} / 孩子 ${styleBefore.kids} → ${host.all('gf-stage')[0].children.length}`)
check('只换说法：右栏换成那个包里的词了',
  host.all('gf-him-col')[0].all('gf-tag').some((t) => demoWords['改文件'].includes(t.textContent)),
  host.all('gf-him-col')[0].all('gf-tag').map((t) => t.textContent).join('/'))
check('换过之后，按手挪到新的那一套上（开关上就是它）',
  trigger().getAttribute('aria-pressed') === 'true'
  && trigger().getAttribute('data-voice') === 'smoke')
trigger().dispatch('click')
styleOf('adventure').dispatch('click')
check('点回来还是原来那套说法', gf.style === styleBefore.id, gf.style)
check('点回来，地名、记号、主题都回到原样',
  host.all('gf-v')[1].textContent === styleBefore.place
  && host.all('gf-pin')[0].getAttribute('data-at') === styleBefore.pin
  && gf.theme === styleBefore.theme,
  `${host.all('gf-v')[1].textContent} / ${gf.theme}`)
check('记的是「现在讲哪一套」，不是「换过哪几套」',
  worldStore.size === 1 && [...worldStore.values()][0] === styleBefore.id,
  [...worldStore.entries()].map(([k, v]) => `${k}=${v}`).join('、'))
delete packsMod.PACKS['smoke-demo']
gf.refreshStyles()
check('从注册表里拿掉一套说法，清单里那一项跟着没了',
  itemsNow().length === listedStyles().length - 1 && !styleOf('smoke') && !!styleOf('rules-horror'),
  itemsNow().map((n) => n.textContent).join('/'))
/* 只剩一套说法时不摆假开关（用户 m02590 的那条规矩，这一格一样成立）。
   2026-10-06 晚起注册表里常驻着三套**预留**的名字，所以「只剩一套」要连它们一起摘掉
   才试得出来——预留的那三套本身就是「列着、点不动」，不是假开关。 */
const reservedPacks = Object.fromEntries(soonPacks().map((p) => [p.id, p]))
for (const id of Object.keys(reservedPacks)) delete packsMod.PACKS[id]
gf.refreshStyles()
check('只剩一套说法时，它是一个不可点的名字（不摆假开关）',
  trigger().hidden === true && host.all('gf-voice-name').length === 1
  && itemsNow().length === 0,
  `开关 ${trigger().hidden ? '收着' : '摆着'} / 名字 ${host.all('gf-voice-name').length} 个 / 清单 ${itemsNow().length} 项`)
check('只剩一套时，名字上写的就是它',
  host.all('gf-voice-name')[0].textContent === PACKS.adventure.label,
  host.all('gf-voice-name')[0].textContent)
Object.assign(packsMod.PACKS, reservedPacks)
gf.refreshStyles()
check('把那几套预留的放回注册表，名字又变回一个开关（这一格是照着注册表画的）',
  trigger().hidden === false && itemsNow().length === listedStyles().length - 1,
  `开关 ${trigger().hidden ? '收着' : '摆着'} / 清单 ${itemsNow().length} 项`)
/* 鼠标移开一秒自动收（用户 m05151 第 2 条：「除了你说的收起方式，还需要有鼠标移开1秒后
   自动关闭」）。这里真等一秒——这是那条规定本身，等得起。 */
trigger().dispatch('click')
check('再点一下名字，清单又弹出来（开合是同一个按钮）', menuOpen() === true)
host.all('gf-voice')[0].dispatch('pointerenter', { pointerType: 'mouse' })
host.all('gf-voice')[0].dispatch('pointerleave', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 1100))
check('鼠标移开一秒，清单自己收起来（用户 m05151 第 2 条）', menuOpen() === false)

// 深色：DSH 用 body[data-ds-dark-theme] 表示，shadow DOM 里选不到，只能读成布尔
const gfRoot = host.all('gf-root')[0]
/* 2026-10-07 用户从三张试片里挑了「B 木与铜」：默认主题不再是半透明玻璃，
   而是桌上一只木盒——实色深木 + 一层极淡的木纹，配黄铜的线与字。 */
check('亮色下是一块木头的底（木与铜）', gfRoot.style.getPropertyValue('--gf-bg') === '#241A12',
  gfRoot.style.getPropertyValue('--gf-bg'))
check('木纹在、玻璃没了（不再是一块半透明玻璃）',
  gfRoot.style.getPropertyValue('--gf-grain').includes('repeating-linear-gradient')
  && gfRoot.style.getPropertyValue('--gf-backdrop') === 'none')
check('故事句是黑体（他说楷体看不清）、数字与时间仍是等宽铜字',
  gfRoot.style.getPropertyValue('--gf-story-font') === 'var(--gf-font)'
  && !gfRoot.style.getPropertyValue('--gf-story-font').includes('KaiTi')
  && gfRoot.style.getPropertyValue('--gf-font').includes('Microsoft YaHei')
  && gfRoot.style.getPropertyValue('--gf-num-font').includes('monospace')
  && /\.gf-remark \{[^}]*font-family: var\(--gf-story-font/.test(CSS)
  && /\.gf-cols-head \{[^}]*letter-spacing: var\(--gf-head-ls/.test(CSS))
check('地名签的字色跟面板的字色分开了（浅字压浅签那个毛病）',
  gfRoot.style.getPropertyValue('--gf-place-fg') === '#2B2018'
  && String(buildStage).includes("'var(--gf-place-fg, var(--gf-fg))'"))
document.body.setAttribute('data-ds-dark-theme', '')
gf.setTheme('plain') // 触发重新上色（真实环境里靠 MutationObserver）
check('深色下同一块木板更暗一点', gfRoot.style.getPropertyValue('--gf-bg') === '#1B120C',
  gfRoot.style.getPropertyValue('--gf-bg'))
check('深色的字也换了', gfRoot.style.getPropertyValue('--gf-fg') === '#E7D9BE')
check('重新上色之后屋里的光还在（不被色板重置回白天）',
  gfRoot.style.getPropertyValue('--gf-glow') === '0', gfRoot.style.getPropertyValue('--gf-glow'))
document.body.removeAttribute('data-ds-dark-theme')
gf.setTheme('plain')
check('切回亮色后恢复木色', gfRoot.style.getPropertyValue('--gf-bg') === '#241A12')

// 空数据
const gf2 = createGameflow({ loadRecords: () => [], now: () => NOW })
gf2.mount()
gf2.open()
await tick()
check('没有记录时显示空状态',
  document.body.all('gf-empty').some((n) => n.textContent === '他还没走过多远。'),
  document.body.all('gf-empty')[0]?.textContent)
const emptyHost = document.body.children.filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('空屋子也画出来（地方一直在，只是没人）', emptyHost.all('gf-stage').length === 1)
check('没有任何记录时不列见闻录', emptyHost.all('gf-row').length === 0)
check('没有任何记录时两栏表头也收起来', emptyHost.all('gf-cols-head')[0]?.hidden === true)
// 2026-10-08（第三十六版）：一条记录都没有的时候也一样——记号照在，钉在落脚处。
// 原来这两条断言的是「没有记号」与「地图外面」，跟用户拍的「角色必须一直显示在
// 地图上」直接冲突。
check('没有任何记录时记号也在（钉在落脚处）', emptyHost.all('gf-pin')[0]?.style.opacity === '1',
  String(emptyHost.all('gf-pin')[0]?.style.opacity))
check('没有任何记录时地点那行写「他的屋子」', emptyHost.all('gf-v')[1]?.textContent === '他的屋子',
  String(emptyHost.all('gf-v')[1]?.textContent))

// 关掉
gf.close()
check('关掉后面板收回', !room.classList.contains('gf-open'))
gf.destroy()
check('销毁后从 body 上摘掉', !document.body.children.includes(host))
gf2.destroy()

/* ------------------------------------------------------------------ *
 * host 半边：只用非内容信号的分类 + 记录器 + 落点
 * ------------------------------------------------------------------ */

const {
  activeMinutes,
  classify,
  countsOf,
  createRecorder,
  decodeSessionFile,
  isSubagentHeader,
  keepToday,
  landedCells,
  mergeRecords,
  pruneStore,
  recordFromEvents,
  resolveDshHome,
  startOfDay,
  storeFile,
  touchedPath,
  PERSIST_INTERVAL_MS,
  msToTick,
  STORE_VERSION,
  inject: hostInject,
  apply: hostApply,
} = await import('../src/index.js')

check('host 半边导出了 apply 形状的 inject', Array.isArray(hostInject) && hostInject.includes('webServer'))

// apply() 绝不能把宿主搞崩：拿一个假的 ctx 真跑一遍
// 危险：apply() 里的回填会读、甚至写 $DSH_HOME/gameflow/records.json。
// 测试绝不能碰用户真那份记录，所以先把它指到一个临时目录（下面会还原）。
const savedHomeForHostTests = process.env.DSH_HOME
process.env.DSH_HOME = join(tmpdir(), `dsh-gameflow-smoke-${process.pid}`)

const seen = { events: [], warned: [], effect: 0, registered: null, handlers: {} }
const fakeCtx = {
  logger: { warn: (e) => seen.warned.push(String(e)) },
  on(type, fn) { seen.events.push(type); seen.handlers[type] = fn; return fn },
  effect(fn, label) { seen.effect += 1; return fn() && label },
  webServer: {
    register(route) {
      seen.registered = route
      return () => {}
    },
  },
}
let applyThrew = null
try {
  hostApply(fakeCtx)
} catch (error) {
  applyThrew = error
}
check('apply() 不抛异常', applyThrew === null, String(applyThrew))
check('订上了四个会话事件',
  ['session/created', 'session/event', 'session/flush', 'session/disposed']
    .every((t) => seen.events.includes(t)), seen.events.join(','))
check('注册了 prefix 路由且路径对', seen.registered?.kind === 'prefix' && seen.registered?.path === '/dsh-gameflow')
check('走 ctx.effect 注册（路由 + 定时落盘，都可清理）', seen.effect === 2, String(seen.effect))

/* ---- 定时落盘：第三轮加的（m02673「好，要。」） ---- */
// 成本：宿主只读事件、做加减法、写 JSON，一次模型调用都没有，所以是零 token。
check('落盘间隔是 5 分钟（零 token）', PERSIST_INTERVAL_MS === 5 * 60 * 1000, String(PERSIST_INTERVAL_MS))
check('存储版本号是 9（加字段就 +1，回填才会重跑）', STORE_VERSION === 9, String(STORE_VERSION))

/* ---- 旧日子真删（用户 m01403 第 2 条「旧日子删除」） ---- *
 * 交出去、写回盘的记录只剩今天，但两件「接缝」要留下：`since`（这份存档的头一天，
 * 序曲认它）与 `seam`（最近被删掉的那一段，今天第一行上面那句「隔了一夜」认它）。
 * 时间一律用**本地时间**造（`new Date(y, m, d, …)`），因为「今天」是按本地零点划的。 */
{
  const NOW = new Date(2026, 9, 9, 14, 0, 0).getTime()
  const at = (d, h, m) => new Date(2026, 9, d, h, m, 0, 0).getTime()
  const todayRec = { id: 't1', startedAt: at(9, 9, 0), endedAt: at(9, 10, 0) }
  // 跨午夜那一张：昨晚 23:30 一路铺到今天 00:40 ⇒ 属今天（看 endedAt，不看 startedAt）
  const nightRec = { id: 'n1', startedAt: at(8, 23, 30), endedAt: at(9, 0, 40) }
  const oldRec = { id: 'o1', startedAt: at(7, 15, 0), endedAt: at(7, 16, 0) }
  const oldRec2 = { id: 'o2', startedAt: at(8, 9, 0), endedAt: at(8, 11, 0) }
  const all = [todayRec, nightRec, oldRec, oldRec2]

  check('当地零点是零点（不是 UTC 零点）',
    new Date(startOfDay(NOW)).getHours() === 0 && startOfDay(NOW) <= NOW, String(startOfDay(NOW)))

  const split = keepToday(all, NOW)
  check('旧日子真删：只留今天那两条', split.kept.map((r) => r.id).join(',') === 't1,n1', split.kept.map((r) => r.id).join(','))
  check('旧日子真删：更早那两条进 gone', split.gone.map((r) => r.id).join(',') === 'o1,o2', split.gone.map((r) => r.id).join(','))
  check('旧日子真删：跨午夜那张卡属今天，不被删掉半截',
    split.kept.some((r) => r.id === 'n1'), split.kept.map((r) => r.id).join(','))

  const pruned = pruneStore(all, {}, NOW)
  check('裁剪交出来的是整份存档（version + records + since + seam）',
    pruned.version === STORE_VERSION && Array.isArray(pruned.records)
      && typeof pruned.since === 'number' && 'seam' in pruned, Object.keys(pruned).join(','))
  check('裁剪：records 只剩今天', pruned.records.map((r) => r.id).join(',') === 't1,n1', pruned.records.map((r) => r.id).join(','))
  check('裁剪：since 是**全部历史**里的头一天（不是留下来的那几条）',
    pruned.since === oldRec.startedAt, String(pruned.since))
  check('裁剪：seam 是最近被删掉的那一段（昨天 09:00–11:00，不是前天的）',
    pruned.seam?.startedAt === oldRec2.startedAt && pruned.seam?.endedAt === oldRec2.endedAt,
    JSON.stringify(pruned.seam))

  // 第二天再裁一次：`since` 与 `seam` 只能往前长，不能因为盘上只剩今天就被重算没了。
  const next = pruneStore([todayRec], { since: at(1, 8, 0), seam: { startedAt: oldRec2.startedAt, endedAt: oldRec2.endedAt } }, NOW)
  check('裁剪：盘上记着的 since 不会被重算小（序曲不能每天重播一遍）',
    next.since === at(1, 8, 0), String(next.since))
  check('裁剪：盘上记着的 seam 不会被重算丢（「隔了一夜」不能每天凭空起头）',
    next.seam?.startedAt === oldRec2.startedAt, JSON.stringify(next.seam))
  check('裁剪：没有旧日子可删时，今天那几条原样留着',
    pruneStore([todayRec], {}, NOW).records.length === 1 && pruneStore([todayRec], {}, NOW).seam === null,
    JSON.stringify(pruneStore([todayRec], {}, NOW).seam))
}

// 定时器必须是 unref 的，且插件卸载时要清掉——不然宿主进程退不出去。
// 2026-10-04 起改成 setTimeout 链（落盘对齐整五分钟），所以这两个也要打桩。
{
  // 一个不在整五分上的时刻（离上一个整五分过了 30 秒），离下一个整五分还有 270 秒。
  const TICK_AT = 1791010830000
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  let timerFn = null
  let unrefCalled = false
  let cleared = false
  let delay = null
  const realNow = Date.now
  globalThis.setTimeout = (fn, ms) => {
    timerFn = fn
    delay = ms
    return { unref() { unrefCalled = true } }
  }
  globalThis.clearTimeout = () => { cleared = true }
  // 把时钟钉死：不然「睡到下一个整五分」这种断言会随真实毫秒漂移而偶发挂掉。
  Date.now = () => TICK_AT
  try {
    hostApply({
      ...fakeCtx,
      // 这一版把 effect 立刻执行掉，好检查清理函数真的清了定时器
      effect(fn, label) { seen.effect += 1; const clean = fn(); if (typeof clean === 'function') clean(); return label },
    })
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
    Date.now = realNow
  }
  check('注册了定时落盘', typeof timerFn === 'function')
  check('定时器 unref 过（不会把宿主钉住不退出）', unrefCalled)
  check('插件卸载时清掉定时器（不留野定时器）', cleared)
  // 对齐钟面：从任意时刻起，睡到下一个整五分钟，睡多久都不会超过一个间隔
  check('下一次落盘睡到整五分钟', msToTick(1791010830000) === 300000 - (1791010830000 % 300000))
  check('正好踩在整五分钟上就睡满一个间隔', msToTick(1791010800000) === 300000)
  check('乱给时刻也不会算出负数', msToTick(NaN) === PERSIST_INTERVAL_MS)
  check('定时器第一次就按对齐后的间隔来（不是从插件启动那刻起算）',
    delay === msToTick(TICK_AT) && delay === 270000, `${delay} 毫秒`)
}

// session/flush 必须在磁盘上真的留下一份记录
{
  const storePath = join(process.env.DSH_HOME, 'gameflow', 'records.json')
  const live = { id: 'live-1', header: { createdAt: at(0, 15, 0), cwd: 'D:\\x\\live' } }
  seen.handlers['session/created'](live)
  seen.handlers['session/event'](live, { type: 'user/message', time: at(0, 15, 1) })
  seen.handlers['session/event'](live, {
    type: 'tool/call',
    time: at(0, 15, 30),
    data: { name: 'edit', arguments: JSON.stringify({ file_path: 'D:\\x\\live\\a.js' }) },
  })
  seen.handlers['session/event'](live, {
    type: 'tool/call',
    time: at(0, 16, 0),
    data: { name: 'edit', arguments: JSON.stringify({ file_path: 'D:\\x\\live\\a.js' }) },
  })
  seen.handlers['session/flush']()
  await new Promise((r) => setTimeout(r, 80))
  let written = null
  try {
    written = JSON.parse(readFileSync(storePath, 'utf8'))
  } catch (error) {
    written = { error: String(error) }
  }
  const liveRec = (written?.records ?? []).find((r) => r.id === 'live-1')
  check('session/flush 真的把记录写进磁盘', Boolean(liveRec), JSON.stringify(written).slice(0, 160))
  check('落盘写的是 {version: STORE_VERSION, records}', written?.version === STORE_VERSION, String(written?.version))
  check('落盘的记录里带着动作次数与文件名',
    liveRec?.actions === 2 && liveRec?.files?.length === 1, JSON.stringify(liveRec))
  check('apply 出错只写日志、不把宿主搞崩', seen.warned.length >= 0)
}

// 重复挂载（比如两条通道同时生效）只会被记一笔日志，不该炸 boot
const dupCtx = {
  ...fakeCtx,
  webServer: { register() { throw new Error('webserver: duplicate prefix route "/dsh-gameflow"') } },
}
let dupThrew = null
try {
  hostApply(dupCtx)
} catch (error) {
  dupThrew = error
}
check('重复挂载不炸 boot', dupThrew === null, String(dupThrew))

// 路由真的会回 JSON，且非 GET / 非本路径都 404
const fakeRes = () => {
  const out = { code: 0, headers: null, body: null, writeHead(c, h) { out.code = c; out.headers = h }, end(b) { out.body = b } }
  return out
}
const ok = fakeRes()
await seen.registered.handler({ method: 'GET', url: '/dsh-gameflow/records' }, ok)
check('路由回 200 + JSON', ok.code === 200 && String(ok.headers['content-type']).startsWith('application/json'))
check('回的是 {version, records}', JSON.parse(ok.body).version === STORE_VERSION && Array.isArray(JSON.parse(ok.body).records),
  String(JSON.parse(ok.body).version))
check('不让缓存', ok.headers['cache-control'] === 'no-store')
const miss = fakeRes()
await seen.registered.handler({ method: 'GET', url: '/dsh-gameflow/nope' }, miss)
check('无关路径回 404', miss.code === 404)
const post = fakeRes()
await seen.registered.handler({ method: 'POST', url: '/dsh-gameflow/records' }, post)
check('POST 回 404', post.code === 404)

// ---------------------------------------------------------------------------
// 量尺寸（宿主那一侧）：开关是主目录里的一个文件，量下来的东西落在 gameflow/measure/
// ---------------------------------------------------------------------------
{
  const switchPath = join(process.env.DSH_HOME, 'gameflow', 'measure.on')
  const layoutPath = join(process.env.DSH_HOME, 'gameflow', 'measure', 'layout.json')
  const mapPath = join(process.env.DSH_HOME, 'gameflow', 'measure', 'map.svg')

  // 假请求：监听一挂上就把数据与结束事件推过去（真实 http 是先挂监听再来数据，
  // 但这里没必要真等 tick——读到空 body 会变成 400，反而测不到想测的东西）
  // `socket.remoteAddress` 也要给：量尺寸那条路只认本机回环（见下面「只收本机」那条）。
  const fakeReq = (method, url, body = null, remoteAddress = '127.0.0.1') => {
    const req = { method, url, socket: { remoteAddress }, destroy() {} }
    req.on = (type, fn) => {
      if (type === 'data' && body !== null) queueMicrotask(() => fn(Buffer.from(body)))
      if (type === 'end') queueMicrotask(() => fn())
      return req
    }
    return req
  }

  const off = fakeRes()
  await seen.registered.handler(fakeReq('GET', '/dsh-gameflow/measure'), off)
  check('量尺寸：没放开关文件就说「没开」', JSON.parse(off.body).on === false, String(off.body))

  const denied = fakeRes()
  await seen.registered.handler(fakeReq('POST', '/dsh-gameflow/measure', JSON.stringify({ panel: {} })), denied)
  check('量尺寸：开关没开时 POST 回 403（插件不会偷偷往外报自己的尺寸）',
    denied.code === 403, String(denied.code))

  writeFileSync(switchPath, '', 'utf8')
  const on = fakeRes()
  await seen.registered.handler(fakeReq('GET', '/dsh-gameflow/measure'), on)
  check('量尺寸：放了开关文件就说「开着」', JSON.parse(on.body).on === true, String(on.body))

  const saved = fakeRes()
  const payload = { panel: { w: 560, h: 720 }, items: [{ name: 'stage svg 地图', x: 22 }], map: '<svg id="map"></svg>' }
  await seen.registered.handler(fakeReq('POST', '/dsh-gameflow/measure', JSON.stringify(payload)), saved)
  check('量尺寸：开着就写下去', saved.code === 200 && JSON.parse(saved.body).ok === true, String(saved.body))
  check('量尺寸：layout.json 里是逐块的位置（map 与 items 都在）',
    JSON.parse(readFileSync(layoutPath, 'utf8')).items?.[0]?.x === 22, readFileSync(layoutPath, 'utf8').slice(0, 80))
  check('量尺寸：地图 SVG 单独存一份 map.svg（好离线出图看）',
    readFileSync(mapPath, 'utf8').includes('id="map"'))

  const bad = fakeRes()
  await seen.registered.handler(fakeReq('POST', '/dsh-gameflow/measure', '{这不是 JSON'), bad)
  check('量尺寸：body 不是 JSON 回 400（不把宿主绊倒）', bad.code === 400, String(bad.code))

  // 取证通道只给本机：外面的来源一律 403（不是鉴权体系，是一道门闩）
  const outside = fakeRes()
  await seen.registered.handler(fakeReq('GET', '/dsh-gameflow/measure', null, '10.1.2.3'), outside)
  check('量尺寸：非本机来源回 403（取证通道不出门）', outside.code === 403, String(outside.code))
  const outsidePost = fakeRes()
  await seen.registered.handler(fakeReq('POST', '/dsh-gameflow/measure', JSON.stringify({ panel: {} }), '::ffff:10.1.2.3'), outsidePost)
  check('量尺寸：非本机来源连 POST 也进不来', outsidePost.code === 403, String(outsidePost.code))
  const loop6 = fakeRes()
  await seen.registered.handler(fakeReq('GET', '/dsh-gameflow/measure', null, '::1'), loop6)
  check('量尺寸：IPv6 回环也认（::1）', loop6.code === 200 && JSON.parse(loop6.body).on === true, String(loop6.body))
  check('量尺寸：写盘是原子的（目录里不留 .tmp）',
    readdirSync(join(process.env.DSH_HOME, 'gameflow', 'measure')).every((n) => !n.endsWith('.tmp')),
    readdirSync(join(process.env.DSH_HOME, 'gameflow', 'measure')).join(','))

  rmSync(switchPath, { force: true })
  const again = fakeRes()
  await seen.registered.handler(fakeReq('GET', '/dsh-gameflow/measure'), again)
  check('量尺寸：删掉开关文件就停', JSON.parse(again.body).on === false, String(again.body))
}

// ---------------------------------------------------------------------------
// 按下「开始冒险」＝这一天的起点（8 → 9，用户 m04200）：
// 宿主那条写路由把起点记进存档，并把「在它之前就结束」的记录删掉
// ---------------------------------------------------------------------------
{
  const storePath = join(process.env.DSH_HOME, 'gameflow', 'records.json')
  const startAt = at(0, 20, 7)
  const mkRec = (id, from, to, minutes) => ({
    id,
    startedAt: from,
    endedAt: to,
    minutes,
    actions: 1,
    tags: ['改文件'],
    counts: { 改文件: 1 },
    files: ['D:\\x\\a\\a.js'],
    ticks: [{ at: from, actions: 1, counts: { 改文件: 1 }, files: ['D:\\x\\a\\a.js'], fails: 0, tags: ['改文件'] }],
  })
  // 一条在起点之前就结束（该删），一条跨过起点（该留）。version 写 9，免得触发回填。
  const seed = {
    version: STORE_VERSION,
    since: at(3, 0, 0),
    seam: null,
    dayStart: 0,
    records: [mkRec('before-start', at(0, 19, 55), at(0, 20, 0), 5), mkRec('after-start', at(0, 20, 6), at(0, 20, 10), 4)],
  }
  writeFileSync(storePath, JSON.stringify(seed), 'utf8')

  const reqOf = (method, url, body = null, remoteAddress = '127.0.0.1') => {
    const req = { method, url, socket: { remoteAddress }, destroy() {} }
    req.on = (type, fn) => {
      if (type === 'data' && body !== null) queueMicrotask(() => fn(Buffer.from(body)))
      if (type === 'end') queueMicrotask(() => fn())
      return req
    }
    return req
  }

  const readStoreNow = () => JSON.parse(readFileSync(storePath, 'utf8'))

  const pressed = fakeRes()
  await seen.registered.handler(reqOf('POST', '/dsh-gameflow/start', JSON.stringify({ at: startAt })), pressed)
  const pressedBody = JSON.parse(pressed.body || '{}')
  check('按下开始冒险：路由回 200 + ok（界面只在真的写成时才掀幕布）',
    pressed.code === 200 && pressedBody.ok === true, String(pressed.body))
  check('按下开始冒险：存档里记下 dayStart（与 since/seam 并列）',
    readStoreNow().dayStart === startAt, String(readStoreNow().dayStart))
  check('按下开始冒险：起点之前就结束的记录被删掉，跨过起点的那条留着',
    readStoreNow().records.map((r) => r.id).join(',') === 'after-start' && pressedBody.dropped >= 1,
    `${readStoreNow().records.map((r) => r.id).join(',')} / dropped=${pressedBody.dropped}`)

  const recordsAfter = fakeRes()
  await seen.registered.handler(reqOf('GET', '/dsh-gameflow/records'), recordsAfter)
  const polled = JSON.parse(recordsAfter.body || '{}')
  check('取数据的应答带上 dayStart（界面靠它裁掉起点之前那几格）',
    polled.dayStart === startAt && polled.records.map((r) => r.id).join(',') === 'after-start',
    String(polled.dayStart))

  // 起点跨天就作废：昨天按的不该把今天也裁了（pruneStore 里那道 startOfDay 比较）。
  const crossed = pruneStore(
    [{ id: 'x', startedAt: at(0, 9, 0), endedAt: at(0, 9, 30), minutes: 30, actions: 1, tags: [], counts: {}, files: [] }],
    { since: at(3, 0, 0), seam: null, dayStart: at(1, 20, 7) },
    at(0, 9, 40),
  )
  check('起点跨了午夜就当没有（昨天按的不裁今天）',
    crossed.dayStart === 0 && crossed.records.length === 1, `${crossed.dayStart} / ${crossed.records.length}`)

  // 不许乱按：非 POST、坏 JSON、缺 at、非本机回环——四种都该被挡在门外。
  const wrongMethod = fakeRes()
  await seen.registered.handler(reqOf('GET', '/dsh-gameflow/start'), wrongMethod)
  check('按下开始冒险：GET 回 405（它是写路由）', wrongMethod.code === 405, String(wrongMethod.code))
  const badJson = fakeRes()
  await seen.registered.handler(reqOf('POST', '/dsh-gameflow/start', '{这不是 JSON'), badJson)
  check('按下开始冒险：body 不是 JSON 回 400', badJson.code === 400, String(badJson.code))
  const noAt = fakeRes()
  await seen.registered.handler(reqOf('POST', '/dsh-gameflow/start', JSON.stringify({})), noAt)
  check('按下开始冒险：没有 at 回 400（不拿宿主的钟瞎猜）', noAt.code === 400, String(noAt.code))
  const outsideStart = fakeRes()
  await seen.registered.handler(reqOf('POST', '/dsh-gameflow/start', JSON.stringify({ at: startAt }), '10.1.2.3'), outsideStart)
  check('按下开始冒险：非本机来源回 403', outsideStart.code === 403, String(outsideStart.code))
}

// 深夜 + 改文件最多的一次
const nightTags = classify({
  startedAt: at(0, 2, 30),
  minutes: 150,
  toolCalls: { edit: 9, read: 4, bash: 2 },
  userMessages: 3,
})
check('深夜开工给「深夜」', nightTags.includes('深夜'), nightTags.join('/'))
check('坐得久给「坐了很久」', nightTags.includes('坐了很久'), nightTags.join('/'))
check('主活是改文件', nightTags.includes('改文件'), nightTags.join('/'))
check('标签最多 3 个', nightTags.length <= 3, nightTags.join('/'))

// 纯聊天：一个工具都没用，但说了话
const chatTags = classify({ startedAt: at(0, 14, 0), minutes: 12, toolCalls: {}, userMessages: 4 })
check('没用工具但说了话 → 「聊了聊」', chatTags.includes('聊了聊'), chatTags.join('/'))

// 很短
check('五分钟以内 → 「一小会儿」',
  classify({ startedAt: at(0, 14, 0), minutes: 4, toolCalls: { read: 1 } }).includes('一小会儿'))

// 记录器：从**第一件事**起算（header.createdAt 只代表「会话开过」，不代表坐下来了——
// 见 src/index.js 里 event() 的那一段），到最后一个事件的 time 收尾
let fake = 1000
const rec = createRecorder({ now: () => fake })
const session = { id: 's1', header: { createdAt: 1_000_000, cwd: 'D:\\文档合集\\插件\\dsh-gameflow' } }
rec.created(session)
rec.event(session, { type: 'user/message', time: 1_060_000 })
rec.event(session, { type: 'tool/call', time: 1_090_000, data: { name: 'edit' } })
rec.event(session, { type: 'tool/call', time: 1_095_000, data: { name: 'edit' } })
rec.event(session, { type: 'tool/result', time: 3_700_000 })
const card = rec.disposed(session)
check('时长只算挨着的空隙，挂着过夜不算', card.minutes === 1, `${card.minutes} 分钟`)
check('项目名取自 cwd 最后一段', card.project === 'dsh-gameflow', String(card.project))
check('数了两次 edit', card.tags.includes('改文件'), card.tags.join('/'))
check('没读消息文本：card 上没有正文类字段',
  !('content' in card) && !('text' in card) && !('messages' in card))

// 时长不是首尾相减：1060→1090→1095 秒之间只隔了 35 秒，最后一个事件在一小时后
check('activeMinutes 累加挨着的事件，跳过空档',
  activeMinutes([1_060_000, 1_090_000, 1_095_000, 3_700_000], 1_000_000, 3_700_000) === 1,
  String(activeMinutes([1_060_000, 1_090_000, 1_095_000, 3_700_000], 1_000_000, 3_700_000)))
check('一个连续的会话不会被切碎',
  activeMinutes([0, 600_000, 1_200_000, 1_800_000], 0, 1_800_000) === 30,
  String(activeMinutes([0, 600_000, 1_200_000, 1_800_000], 0, 1_800_000)))
check('没有事件时刻时退回首尾相减',
  activeMinutes([], 0, 600_000) === 10, String(activeMinutes([], 0, 600_000)))

/* 每五分钟一格，落在案上的那几格。
   用户 2026-10-08：「我要的是，每5分钟落定一次时间，即记录在案。」 */
const LAND = PERSIST_INTERVAL_MS
check('一格五分钟：按钟面取整、去重、升序',
  JSON.stringify(landedCells([LAND * 3 + 60_000, LAND * 3 + 240_000, LAND * 5], LAND))
    === JSON.stringify([LAND * 3, LAND * 5]),
  JSON.stringify(landedCells([LAND * 3 + 60_000, LAND * 3 + 240_000, LAND * 5], LAND)))
check('三分钟的短段也算一格（不凑整，但确实落了）',
  JSON.stringify(landedCells([LAND * 2 + 180_000], LAND)) === JSON.stringify([LAND * 2]),
  JSON.stringify(landedCells([LAND * 2 + 180_000], LAND)))
check('没有事件时刻就没有格子（老数据、上游没给 time）',
  landedCells([]).length === 0 && landedCells(undefined).length === 0)
check('记录里就带着这条刻度（card.cells）',
  JSON.stringify(card.cells) === JSON.stringify([900_000, 3_600_000]), JSON.stringify(card.cells))

/* ---- 卡片上的「记忆」：标题、交付物、帮手（全都不是对话正文） ---- */
const titled = createRecorder({ now: () => fake })
const ts = { id: 's2', header: { createdAt: 0, cwd: 'D:\\x\\回顾厅' } }
titled.created(ts)
// 得说句话才算一段时光——只开了个会话就退出去的，不收卡片（见下面的测试）
titled.event(ts, { type: 'user/message', time: 900 })
titled.event(ts, {
  type: 'session/title',
  time: 1000,
  data: { title: '# 最终方案总结：`dsh-gameflow`', source: { kind: 'fallback' } },
})
check('兜底标题也收下', titled.snapshot()[0].title.startsWith('# 最终方案'), titled.snapshot()[0].title)
titled.event(ts, { type: 'session/title', time: 2000, data: { title: '回顾厅', source: { kind: 'user' } } })
check('正式标题覆盖兜底标题', titled.snapshot()[0].title === '回顾厅', titled.snapshot()[0].title)
titled.event(ts, {
  type: 'session/title',
  time: 3000,
  data: { title: '第一句话的截断', source: { kind: 'fallback' } },
})
check('兜底标题不许反盖正式标题', titled.snapshot()[0].title === '回顾厅', titled.snapshot()[0].title)

titled.event(ts, {
  type: 'deliverables/presented',
  time: 4000,
  data: { files: [{ path: 'D:\\a\\README.md' }, { path: 'D:\\a\\README.md' }, { path: 'D:\\a\\x.md' }] },
})
titled.event(ts, { type: 'subagent/catalog', time: 5000, data: { childId: 'c1', label: '查资料' } })
titled.event(ts, { type: 'subagent/catalog', time: 6000, data: { childId: 'c1', label: '查资料' } })
check('交付物去重', titled.snapshot()[0].deliverables.length === 2,
  JSON.stringify(titled.snapshot()[0].deliverables))
check('帮手去重', titled.snapshot()[0].helpers.length === 1, JSON.stringify(titled.snapshot()[0].helpers))

/* ---- 「你做了什么」的忠实版本：动作次数与动过手的文件（第三轮，m02673） ---- */
check('数每个动作各几次，多的排前面',
  JSON.stringify(countsOf({ toolCalls: { edit: 5, read: 2, bash: 3 } })) === '{"改文件":5,"跑命令":3,"翻文件":2}',
  JSON.stringify(countsOf({ toolCalls: { edit: 5, read: 2, bash: 3 } })))
check('认不出的工具直接丢掉，不硬编「其它」',
  JSON.stringify(countsOf({ toolCalls: { 莫名其妙: 3 } })) === '{}', JSON.stringify(countsOf({ toolCalls: { 莫名其妙: 3 } })))
check('只认改文件的路径',
  touchedPath('edit', JSON.stringify({ file_path: 'D:\\a\\x.js' })) === 'D:\\a\\x.js',
  String(touchedPath('edit', JSON.stringify({ file_path: 'D:\\a\\x.js' }))))
check('翻文件那种读一眼就走的不算「动过手」',
  touchedPath('read', JSON.stringify({ file_path: 'D:\\a\\x.js' })) === undefined)
check('参数不是 JSON 也不炸', touchedPath('edit', '不是 json') === undefined)
check('参数里没有路径就什么都不记', touchedPath('edit', JSON.stringify({ command: 'ls' })) === undefined)
// 这条是红线：edit 的 old_string/new_string 就是真代码，一个字节都不许碰
check('绝不碰参数里的其它内容（edit 的 old_string 就是真代码）',
  touchedPath('edit', JSON.stringify({ old_string: 'const secret = 1', new_string: 'x' })) === undefined)

const touched = createRecorder({ now: () => fake })
const tSession = { id: 's3', header: { createdAt: 0, cwd: 'D:\\x\\p' } }
touched.created(tSession)
touched.event(tSession, { type: 'user/message', time: 500 })
const call = (time, name, args) => ({ type: 'tool/call', time, data: { name, arguments: JSON.stringify(args) } })
touched.event(tSession, call(1000, 'edit', { file_path: 'D:\\x\\a.js' }))
touched.event(tSession, call(2000, 'edit', { file_path: 'D:\\x\\a.js' }))
touched.event(tSession, call(3000, 'edit', { file_path: 'D:\\x\\b.js' }))
touched.event(tSession, call(4000, 'bash', { command: 'ls' }))
const touchedRec = touched.disposed(tSession)
check('同一个文件改两次只算一个', touchedRec.files.length === 2, JSON.stringify(touchedRec.files))
check('文件按动过的顺序记', touchedRec.files.join('/') === 'D:\\x\\a.js/D:\\x\\b.js', JSON.stringify(touchedRec.files))
check('动作总数也记下来', touchedRec.actions === 4, String(touchedRec.actions))
check('次数最多的动作排前面', Object.keys(touchedRec.counts)[0] === '改文件', JSON.stringify(touchedRec.counts))
check('回填出来的记录和实时记录形状一样（counts/files/actions/cells/ticks 都在）',
  ['counts', 'files', 'actions', 'cells', 'ticks'].every((k) => k in touchedRec), Object.keys(touchedRec).join(','))

// 子代理会话不该在时间线上多出一张「你坐了两分钟」的噪音卡片
const subRec = createRecorder({ now: () => fake })
const subSession = { id: 'sub1', header: { createdAt: 0, origin: 'subagent', delegationDepth: 1 } }
subRec.created(subSession)
subRec.event(subSession, { type: 'user/message', time: 10 })
check('子代理会话不记录', subRec.snapshot().length === 0, String(subRec.snapshot().length))
check('delegationDepth 也算子代理', isSubagentHeader({ delegationDepth: 2 }) === true)
check('正常会话不是子代理', isSubagentHeader({ cwd: 'D:\\x' }) === false)

// 「开门看了一眼就走」的会话不该立卡片：只有开机事件，没有一句话、没有一个工具
const idle = createRecorder({ now: () => fake })
const idleSession = { id: 'idle1', header: { createdAt: 0, cwd: 'D:\\x\\长夜酒店' } }
idle.created(idleSession)
idle.event(idleSession, { type: 'permission/preset', time: 1000, data: {} })
idle.event(idleSession, { type: 'session/end-seed', time: 2_000_000 })
check('空会话不出现在 snapshot 里', idle.snapshot().length === 0, String(idle.snapshot().length))
check('开门看了一眼就走 → 不收卡片', idle.disposed(idleSession) === undefined)

// 但只要说过一句话，它就算数
const said = createRecorder({ now: () => fake })
const saidSession = { id: 'said1', header: { createdAt: 0, cwd: 'D:\\x\\长夜酒店' } }
said.created(saidSession)
said.event(saidSession, { type: 'user/message', time: 1000 })
check('说了话就算一段时光', said.disposed(saidSession)?.tags.includes('聊了聊') === true,
  JSON.stringify(said.snapshot()[0]?.tags))

/* ---- 分段：一场会话不再等于一行见闻录（用户 2026-10-03 定的） ----
   他抱怨「就 9 月 30 日和 10 月 2 日有记录，太少了」——根因是一场会话能跨天，
   整场只收一行。现在中间停 45 分钟以上、或者一段干满 2 小时，就另起一段。 */
const MIN = 60 * 1000
const split = createRecorder({ now: () => fake })
const splitSession = { id: 'span1', header: { createdAt: 0, cwd: 'D:\\x\\回望厅' } }
split.created(splitSession)
split.event(splitSession, { type: 'tool/call', time: 1 * MIN, data: { name: 'edit' } })
split.event(splitSession, { type: 'tool/call', time: 5 * MIN, data: { name: 'read' } })
// 停了 55 分钟 → 该切了
split.event(splitSession, { type: 'tool/call', time: 60 * MIN, data: { name: 'bash' } })
check('停下来超过 45 分钟就另起一段', split.snapshot().length === 2, String(split.snapshot().length))
check('分段 id 沿用会话 id 再加序号', split.snapshot().map((r) => r.id).join(' ') === 'span1 span1#2',
  split.snapshot().map((r) => r.id).join(' '))
check('后面的段从新的一件事开始算',
  split.snapshot()[1].startedAt === 60 * MIN && split.snapshot()[1].counts['跑命令'] === 1,
  JSON.stringify(split.snapshot()[1].startedAt))
check('前面那段的时长只算它自己那两下',
  split.snapshot()[0].minutes === 4 && split.snapshot()[0].counts['翻文件'] === 1,
  `${split.snapshot()[0].minutes} / ${JSON.stringify(split.snapshot()[0].counts)}`)
check('一段里的动作不会跑到另一段去',
  split.snapshot()[1].actions === 1 && split.snapshot()[0].actions === 2,
  `${split.snapshot()[0].actions} / ${split.snapshot()[1].actions}`)

// 连着干不切；干满两小时才切
const long = createRecorder({ now: () => fake })
const longSession = { id: 'span2', header: { createdAt: 0, cwd: 'D:\\x\\回望厅' } }
long.created(longSession)
for (const t of [0, 30, 60, 90].map((m) => m * MIN)) long.event(longSession, { type: 'tool/call', time: t, data: { name: 'edit' } })
check('连着干一个半小时不会被钟表切碎', long.snapshot().length === 1, String(long.snapshot().length))
long.event(longSession, { type: 'tool/call', time: 125 * MIN, data: { name: 'edit' } })
check('但干满两小时就收尾另起一段', long.snapshot().length === 2, String(long.snapshot().length))
check('中途那些空段不收（一句话没说、一个工具没用过）',
  long.snapshot().every((r) => r.actions > 0), JSON.stringify(long.snapshot().map((r) => r.actions)))

/* ---- 回填：会话文件是多个 zstd frame 拼起来的，header 独占第一个 ---- */
let multi = null
try {
  const { zstdCompressSync } = await import('node:zlib')
  const line = (value) => Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
  multi = Buffer.concat([
    zstdCompressSync(line({ type: 'session', id: 'z1', version: 4, createdAt: 5_000, cwd: 'D:\\x\\回望厅' })),
    zstdCompressSync(line({ type: 'session/title', seq: 1, time: 6_000, data: { title: '回顾厅', source: { kind: 'user' } } })),
    zstdCompressSync(line({ type: 'tool/call', seq: 2, time: 6_100, data: { name: 'edit' } })),
    zstdCompressSync(line({ type: 'deliverables/presented', seq: 3, time: 6_200, data: { files: [{ path: 'D:\\x\\a\\回望厅-设计文档.md' }] } })),
  ])
} catch {
  multi = null
}
if (multi === null) {
  check('这台机器有 zstd（回填要靠它）', false, 'node:zlib 没有 zstdCompressSync')
} else {
  check('只解第一个 frame 会漏掉后面三行', decodeSessionFile(multi).length === 4,
    String(decodeSessionFile(multi).length))
  const backfilled = recordFromEvents(decodeSessionFile(multi))
  check('回填给出的是**一组**分段（一场会话不再等于一行）',
    Array.isArray(backfilled) && backfilled.length === 1, JSON.stringify(backfilled.length))
  const first = backfilled[0]
  check('回填出的卡片和实时记录同构',
    first.id === 'z1' && first.title === '回顾厅' && first.project === '回望厅',
    JSON.stringify(first))
  check('回填也认交付物', first.deliverables.length === 1, JSON.stringify(first.deliverables))
  check('回填也挡住子代理',
    recordFromEvents([{ type: 'session', id: 'z2', createdAt: 0, origin: 'subagent' }]).length === 0)
}

// 落盘去重：同 id 新的赢，按时间倒序
const merged = mergeRecords(
  [{ id: 'a', startedAt: 300, minutes: 1 }, { id: 'b', startedAt: 200, minutes: 2 }],
  [{ id: 'a', startedAt: 300, minutes: 99 }, { id: 'c', startedAt: 100, minutes: 3 }],
)
check('按 id 去重', merged.length === 3, `${merged.length} 条`)
check('同 id 新的覆盖旧的', merged.find((r) => r.id === 'a').minutes === 99)
check('按开始时间倒序', merged.map((r) => r.id).join('') === 'abc', merged.map((r) => r.id).join(''))

// 落点：不在 storages 里，且认 $DSH_HOME
if (savedHomeForHostTests === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = savedHomeForHostTests
const savedHome = process.env.DSH_HOME
process.env.DSH_HOME = 'C:\\tmp\\dsh-home'
check('认 $DSH_HOME', storeFile() === 'C:\\tmp\\dsh-home\\gameflow\\records.json', storeFile())
process.env.DSH_HOME = '   '
check('空白的 $DSH_HOME 当没设', resolveDshHome() !== '   ')
if (savedHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = savedHome
check('不写进别人的 storages 目录', !storeFile('C:\\h').includes('storages'), storeFile('C:\\h'))

/* ------------------------------------------------------------------ *
 * 数据通路：唯一跟宿主半边说话的那个函数
 *
 * 上面所有渲染断言喂的都是 createGameflow({ loadRecords })，
 * 于是真正跑在生产里的这条路一行都没被碰过——补上。
 * ------------------------------------------------------------------ */

const realFetch = globalThis.fetch
const realLocation = globalThis.location

const stubFetch = (impl) => {
  const calls = []
  globalThis.location = { protocol: 'http:' }
  globalThis.fetch = (url, init) => {
    calls.push({ url, init })
    return impl(url, init)
  }
  return calls
}

let fCalls = stubFetch(async () => ({ ok: true, json: async () => ({ version: 1, records: [{ id: 'a' }] }) }))
let fOut = await fetchRecords()
check('要记录：拿到宿主回的 records', fOut.length === 1 && fOut[0].id === 'a', JSON.stringify(fOut))
check('要记录：请求的就是那条路由', fCalls[0]?.url === '/dsh-gameflow/records', String(fCalls[0]?.url))
check('要记录：带 accept: application/json', fCalls[0]?.init?.headers?.accept === 'application/json')

fCalls = stubFetch(async () => ({ ok: false, json: async () => ({}) }))
fOut = await fetchRecords()
check('宿主说不 ok：当作空屋子，不抛', Array.isArray(fOut) && fOut.length === 0)

stubFetch(async () => ({ ok: true, json: async () => { throw new Error('坏 JSON') } }))
fOut = await fetchRecords()
check('回的不是 JSON：当作空屋子', Array.isArray(fOut) && fOut.length === 0)

stubFetch(async () => ({ ok: true, json: async () => ({ version: 1 }) }))
fOut = await fetchRecords()
check('回里没有 records 数组：当作空屋子', Array.isArray(fOut) && fOut.length === 0)

stubFetch(async () => { throw new Error('断网') })
fOut = await fetchRecords()
check('请求直接抛：当作空屋子，界面不弹错', Array.isArray(fOut) && fOut.length === 0)

fCalls = stubFetch(async () => ({ ok: true, json: async () => ({ records: [{ id: 'x' }] }) }))
globalThis.location = { protocol: 'file:' }
fOut = await fetchRecords()
check('file:// 打开时（双击 preview.html）压根不发请求', fOut.length === 0 && fCalls.length === 0,
  `calls=${fCalls.length}`)

stubFetch(async () => ({ ok: true, json: async () => ({}) }))
delete globalThis.fetch
fOut = await fetchRecords()
check('环境里没有 fetch：当作空屋子', Array.isArray(fOut) && fOut.length === 0)

/* ------------------------------------------------------------------ *
 * 量尺寸（浏览器那一侧）：装上去先问一声开关，开着就量一份发回去
 *
 * 验的是「量得到、发得出」——垫片没有排版引擎，量出来的数字全是 0，
 * 真想看对齐得在真浏览器里跑（那时脚本会落到 $DSH_HOME/gameflow/measure/）。
 * ------------------------------------------------------------------ */

{
  let asked = 0
  const posted = []
  stubFetch(async (url, init) => {
    if (url === '/dsh-gameflow/measure') {
      if (init && init.method === 'POST') {
        posted.push(JSON.parse(init.body))
        return { ok: true, json: async () => ({ ok: true }) }
      }
      asked += 1
      return { ok: true, json: async () => ({ on: true }) }
    }
    return { ok: true, json: async () => ({ records: [] }) }
  })

  const mgf = createGameflow({ loadRecords: () => demo, now: () => NOW, measureDelay: 0 })
  mgf.mount()
  mgf.open()
  await new Promise((r) => setTimeout(r, 80))

  check('量尺寸：装上去先问一声开关（GET 那条路由）', asked === 1, `问了 ${asked} 次`)
  check('量尺寸：开关开着就量一份发回去（POST 到同一条路由）', posted.length >= 1, `发了 ${posted.length} 次`)
  const body = posted[0] || {}
  check('量尺寸：那一份里有面板宽高', typeof body.panel?.w === 'number' && typeof body.panel?.h === 'number',
    JSON.stringify(body.panel))
  check('量尺寸：那一份里逐块的位置（地图框、时间行、两栏都在）',
    Array.isArray(body.items) && body.items.some((i) => i.name.includes('地图')) && body.items.length >= 8,
    `${body.items?.length} 块`)
  check('量尺寸：每一块都带 x/y（对齐问题就是拿这个相减）',
    (body.items || []).every((i) => typeof i.x === 'number' && typeof i.y === 'number'))
  check('量尺寸：地图 SVG 一起带回去（好离线出图看）',
    typeof body.map === 'string' && body.map.includes('<svg'), String(body.map).slice(0, 40))
  check('量尺寸：带着主题与语气', body.theme === mgf.theme && body.voice === mgf.voice, `${body.theme}/${body.voice}`)
  mgf.destroy()

  // 开关关着：问了，但不该往外发任何东西
  const quiet = []
  stubFetch(async (url, init) => {
    if (url === '/dsh-gameflow/measure' && init && init.method === 'POST') quiet.push(init.body)
    return { ok: true, json: async () => ({ on: false }) }
  })
  const offGf = createGameflow({ loadRecords: () => demo, now: () => NOW, measureDelay: 0 })
  offGf.mount()
  offGf.open()
  await new Promise((r) => setTimeout(r, 80))
  check('量尺寸：开关关着就一个字节都不发（对装上插件的人是彻底不存在的）', quiet.length === 0, `${quiet.length} 次`)
  offGf.destroy()
}

globalThis.fetch = realFetch
if (realLocation === undefined) delete globalThis.location
else globalThis.location = realLocation

/* ------------------------------------------------------------------ *
 * 运行时装：DSH 注入的是不带 type="module" 的经典 script
 * ------------------------------------------------------------------ */

let loaded = null
globalThis.window.__ModuleLoader__ = { load: (spec) => { loaded = spec } }

const bundleCode = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
check('lib/client.js 没有顶层 export', !/^export\b/m.test(bundleCode))
check('lib/client.js 没有 import 语句', !/^\s*import\s/m.test(bundleCode))

// 用经典 script 的方式执行真正的产物：顶层有 export 会在这里 SyntaxError
vm.runInThisContext(bundleCode, { filename: 'lib/client.js' })
check('跑起来就调了 __ModuleLoader__.load', loaded !== null)
check('id 就是包名', loaded?.id === 'dsh-gameflow', String(loaded?.id))

const mod = loaded.factory(() => {
  throw new Error('客户端 bundle 不该 require 任何东西')
})
check('factory 交出 apply', typeof mod.apply === 'function')
check('factory 交出 inject（数组）', Array.isArray(mod.inject))
check('factory 交出 createGameflow', typeof mod.createGameflow === 'function')

let registeredCleanup = false
mod.apply({
  effect(fn) {
    registeredCleanup = typeof fn() === 'function'
  },
})
check('apply 走 ctx.effect 注册了清理', registeredCleanup)

/* ------------------------------------------------------------------ *
 * 内容包接线（2026-10-05）：世界的句子与规矩从 src/packs/ 来
 *
 * 装载器把包填进 client.js 那一组对象之后，值必须与文件里写着的底子
 * （`SOURCE_CONTENT`，装载前抓的那一份）逐个相等——否则「接线」就等于偷偷换了一套
 * 文案，那是用户看不见的回归。`.tmp-acp/verify-packs.mjs` 做同样的事，这里守着产物。
 * 三个没导出的（`PROP_WORDS`/`LIFE_POOLS`/`ACTION_PLACE`）只能对上「底子存在」这一半。
 * ------------------------------------------------------------------ */

const CONTENT_NAMES = ['SCENES', 'SHARDS', 'VOICES', 'WORLD_LINES', 'WORLD_QUIET', 'SHARED_LINES',
  'HOME_LINES', 'CAST', 'CAST_LINES', 'PROP_WORDS', 'LIFE_POOLS', 'ACTION_PLACE', 'OUT_KEYS']
// 2026-10-05 起包与底子是**同一套**——第二套说法「案牍」被用户摘掉了（它当年会多给
// 一个 `SHARDS.ledger` 键；那种「装进来的新内容」由下面那条单列的断言管）。
// 2026-10-10（④ 文本重建）起底子是**切开那天的冻结快照**：包只保证把底子**整段收着**
// （前缀），新句子一律接在数组末尾——所以这里按前缀比，另外单列「有没有夹带底子里没有的东西」。
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.getPrototypeOf(v) === Object.prototype
/* 按**底子的形状**裁一份出来再比：底子里有的键逐个比，底子里没有的键不算数；
 * 数组按位裁到同样的长度（元素是对象就继续往里递归）。
 *
 * 为什么不是只裁顶层：2026-10-06 地理进包那一次，装载器给 `VOICES` 的每一条都加了一个
 * `world` 字段（「这一套说法只讲哪个世界」，讲述者包是 null）——顶层键没变，条目里多了一个键，
 * 只裁顶层就抓不住。递归裁之后「装进来的新内容」仍由下面那条 `contentAdded` 单列（顶层）。
 *
 * 为什么 Set 要单列一支：`OUT_KEYS` 是 Set，第二套世界包（夜航船）带来一个新的户外场景
 * 键（`punt`）是**合法的**，但 `deepStrictEqual` 拿整只 Set 比就会红。这里按「底子里
 * 本来就有哪些」裁一遍再比——多出来的那部分由 `contentAdded` 那条单列（它现在也认注册表）。 */
const restrictTo = (after, before) => {
  if (before instanceof Set) return new Set([...after].filter((key) => before.has(key)))
  // 数组逐位裁到 `before` 那么长（元素是对象就继续往里递归，`scenes` 那种「对象套数组」也裁得动）：
  // 底子从 2026-10-10（④ 文本重建）起是**切开那天的冻结快照**，新句子一律接在数组末尾，
  // 所以底子永远是包的前缀。
  if (Array.isArray(before)) return before.map((b, i) => restrictTo(Array.isArray(after) ? after[i] : undefined, b))
  if (!isPlainObject(after) || !isPlainObject(before)) return after
  const out = {}
  for (const key of Object.keys(before)) out[key] = restrictTo(after[key], before[key])
  return out
}
// 注册表里声明过的说法 id：装载器给 `VOICES`/`SCENES`/`SHARDS` 多出来的那些键
// **必须**都在这里（世界包自带的那套说法），别的多出来的才算夹带。
// 注意 `voiceIds()` 是「讲述者包」（kind: 'voice'）——世界包自带的那套说法不在里面，
// 所以这里按「谁给了 actionLines 谁就有一套说法」自己算（跟 applyPack 的口径一致）。
const DECLARED_VOICES = new Set(Object.values(PACKS).filter((p) => p.actionLines).map((p) => p.voice))
const contentMoved = []
const contentAdded = []
for (const name of CONTENT_NAMES) {
  const before = mod.SOURCE_CONTENT?.[name]
  const after = mod[name]
  if (before === undefined) { contentMoved.push(`${name}(底子没了)`); continue }
  if (after === undefined) continue // 没导出：对不上，也没得对
  try {
    assert.deepStrictEqual(restrictTo(after, before), before)
    // 数组（`WORLD_QUIET` 这种）不参与这一段：它的「键」是下标，包变长就会冒出一堆假的新键。
    if (isPlainObject(after)) {
      for (const key of Object.keys(after)) {
        if (!(key in (before || {})) && !DECLARED_VOICES.has(key)) contentAdded.push(`${name}.${key}`)
      }
    }
  } catch {
    contentMoved.push(name)
  }
}
check('内容包装载之后把文件里写着的底子整段收着（老句子一条不少、顺序没动）', contentMoved.length === 0, contentMoved.join(' / '))
check('内容包确实装进来了（不是空底子）',
  (mod.SOURCE_CONTENT?.WORLD_LINES?.night || []).length >= 10
  && (mod.SOURCE_CONTENT?.SCENES?.adventure?.['改文件'] || []).length === 6,
  `night ${(mod.SOURCE_CONTENT?.WORLD_LINES?.night || []).length} / 改文件 ${(mod.SOURCE_CONTENT?.SCENES?.adventure?.['改文件'] || []).length}`)
check('装载没有夹带底子里没有的东西', contentAdded.length === 0, contentAdded.join(' / ') || '（一个都没有）')
check('多出来的那几套说法，必须是注册表里真有的（现在只有奇幻冒险那一套）',
  VOICE_IDS.every((id) => DECLARED_VOICES.has(id))
  && mod.SCENES && Object.keys(mod.SCENES).every((id) => DECLARED_VOICES.has(id)),
  `VOICES ${VOICE_IDS.join('/')} ← 注册表 ${[...DECLARED_VOICES].join('/')}`)
/* 2026-10-06 晚加的三套预留风格（规则怪谈 / 宫斗心计 / 谍战潜伏）只有名字、没有内容，
   所以它们**进不了说法表**——装载器只收「有 actionLines 的包」。这条钉住这件事：
   哪天有人给预留包随手塞了半句词表，这里就红。 */
check('预留的那几套还没写内容，所以不在说法表里',
  Object.values(PACKS).filter((p) => p.soon).every((p) => !p.actionLines && !VOICE_IDS.includes(p.voice))
  && Object.values(PACKS).filter((p) => p.soon).length >= 1,
  `预留 ${Object.values(PACKS).filter((p) => p.soon).map((p) => p.voice).join('/')} ← 说法表 ${VOICE_IDS.join('/')}`)
// 场景句分两处住：**开头（lead）与收尾（tail）在世界包的 `scenes` 里**，
// **四档结局（more / paid / hurt / again）在拼句池 `shards` 里**——面板两处都读。
const sceneSlots = ['lead', 'tail', 'more', 'paid', 'hurt', 'again']
const sceneList = Object.values(mod.SCENES?.adventure || {}).flat()
const sceneKeys = [...new Set(sceneList.map((s) => s.key))]
const shardsAdventure = mod.SHARDS?.adventure || {}
const sceneFrags = sceneList.reduce((n, s) => n + (s.lead || []).length + (s.tail || []).length, 0)
const shardFrags = Object.values(shardsAdventure)
  .reduce((n, s) => n + ['more', 'paid', 'hurt', 'again'].reduce((m, t) => m + (s[t] || []).length, 0), 0)
check('场景句：26 个场景，开头收尾在世界包、四档结局在拼句池（面板读的就是这两份）',
  sceneKeys.length === 26
  && sceneKeys.every((k) => shardsAdventure[k])
  && sceneList.every((s) => (s.lead || []).length && (s.tail || []).length)
  && Object.values(shardsAdventure).every((s) => ['more', 'paid', 'hurt', 'again']
    .every((t) => Array.isArray(s[t]) && s[t].length)),
  `${sceneKeys.length} 个场景 / 开头收尾 ${sceneFrags} 条 + 四档 ${shardFrags} 条`)
check('build-client 摊平了两层 import（包与规矩都进来了）',
  typeof mod.composeSequence === 'function' && typeof mod.createGameflow === 'function')
// 地理（地图、取景框、地点）2026-10-06 也搬进世界包了。跟句子一样，判据是
// 「面板读的就是包里那一份」——`MAP_SVG`/`MAP_CSS` 是导出来给这条断言用的。
const packAdv = getPack('adventure')
check('地理来自世界包（地图、取景框、地点三样都是包里的那一份）',
  mod.MAP_SVG === packAdv?.map?.svg
  && mod.MAP_CSS === packAdv?.map?.css
  && JSON.stringify(mod.VIEW) === JSON.stringify(packAdv?.map?.view)
  && JSON.stringify(mod.PLACES) === JSON.stringify(packAdv?.places),
  `地图 ${mod.MAP_SVG?.length} 字 / 地点 ${Object.keys(mod.PLACES || {}).length} 处 / 框 ${JSON.stringify(mod.VIEW)}`)
checkOnFixture('包里的地图与素材本身是同一份（不是两处各写一遍）',
  HAVE_MAP_FIXTURE && packAdv?.map?.svg === MAP_SVG && packAdv?.map?.css === MAP_CSS,
  HAVE_MAP_FIXTURE ? `包 ${packAdv?.map?.svg?.length} 字 / 素材 ${MAP_SVG.length} 字` : '')
check('现在装的是哪个世界，面板自己知道（「故事风格」那一格要拿它对名字）',
  mod.WORLD_ID === 'adventure' && mod.WORLD_LABEL === '奇幻冒险' && mod.WORLD_THEME === 'plain',
  `${mod.WORLD_ID} / ${mod.WORLD_LABEL} / ${mod.WORLD_THEME}`)

/* ------------------------------------------------------------------ *
 * 预览页：用户会双击它，所以它自己也得过一遍语法关
 * ------------------------------------------------------------------ */

const previewHtml = readFileSync(new URL('../preview.html', import.meta.url), 'utf8')
const inlineScripts = [...previewHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
check('预览页有内联脚本', inlineScripts.length >= 2, String(inlineScripts.length))
for (const [i, code] of inlineScripts.entries()) {
  let err = null
  try {
    new vm.Script(code, { filename: `preview.html#${i}` })
  } catch (e) {
    err = e.message
  }
  check(`预览页第 ${i + 1} 段脚本能编译`, err === null, err || '')
}
check('预览页认这个模块形状', previewHtml.includes('__ModuleLoader__') && previewHtml.includes('./lib/client.js'))
check('预览页不再摆说法开关（只有一套，界面只说一次）',
  !previewHtml.includes('data-voice') && !previewHtml.includes('setVoice'))
check('预览页不指定说法：用模块自己那套默认',
  !/voice\s*:/.test(previewHtml) && !previewHtml.includes('?voice='))
check('预览页能切主题', previewHtml.includes('setTheme') && previewHtml.includes('theme=classics'))
check('预览页喂的是真回填出来的记录', previewHtml.includes('回望厅-设计文档.md') && previewHtml.includes('Research DSH host plugin API'))

/* ------------------------------------------------------------------ *
 * 红线自动扫（2026-10-05，用户 m06628 勾的「0 + 3 打包」里的第 3 件）
 *
 * 这一版最贵的东西是语气：不感叹、不劝、不出现陪伴/成长/进度这类说明书词，
 * 钱只许出现在「那天交了东西」那一档里，右栏一个阿拉伯数字都不许有。
 * 在这之前，这些规矩只写在文档里和我的脑子里——两千多句没有一句被机器看过。
 * 现在把它们变成断言。扫两层：
 *   一层是**拼之前的句库**（逐档逐场景收，出处可追）——散列定种子，有些句子
 *     可能永远挑不中，只扫输出会漏掉它；
 *   一层是**真拼出来的句子**（两种语气 × 六个动作 × 四十段）。
 * ------------------------------------------------------------------ */

const TABLE = []
const addLine = (where, text, whole = true) => {
  if (typeof text !== 'string' || !text.trim()) return
  // 模板里的 {n} / {e} 是拼的时候才填的次数与下数，这里拿汉字填上再扫
  TABLE.push({ where, text: text.replace(/\{n\}/g, '十几').replace(/\{e\}/g, '三'), whole })
}

for (const [act, scenes] of Object.entries(SCENES.adventure || {})) {
  for (const scene of scenes) {
    // 开头与收尾那两半都是**碎片**（拼的时候接「，」再补句号），
    // 不拿「以句号收尾」这条去要求它们；能整句看的只有拼出来的那一层。
    for (const s of scene.lead || []) addLine(`SCENES/${act}/${scene.key}/lead`, s, false)
    for (const s of scene.tail || []) addLine(`SCENES/${act}/${scene.key}/tail`, s, false)
  }
}
for (const [voice, table] of Object.entries(SHARDS)) {
  for (const [act, tiers] of Object.entries(table)) {
    for (const [tier, list] of Object.entries(tiers)) {
      // 四档收尾也一样是碎片（「同一页他抄了{n}遍，越抄越短」）
      if (Array.isArray(list)) for (const s of list) addLine(`SHARDS/${voice}/${act}/${tier}`, s, false)
    }
  }
}
for (const [voice, v] of Object.entries(VOICES)) {
  for (const [act, s] of Object.entries(v.lines || {})) addLine(`VOICES/${voice}/${act}`, s)
}
for (const [k, s] of Object.entries(SHARED_LINES)) addLine(`SHARED_LINES/${k}`, s)
for (const [i, s] of (HOME_LINES || []).entries()) addLine(`HOME_LINES/${i}`, s)
// 高光事件那几行（2026-10-08 加）：整句，跟主句同一套要求（句号收尾、无阿拉伯数字、无现代词）。
for (const moment of MOMENTS || []) {
  for (const [i, s] of (moment.steps || []).entries()) addLine(`MOMENTS/${moment.id}/steps[${i}]`, s)
  addLine(`MOMENTS/${moment.id}/close`, moment.close)
  // 岔口那两条路（2026-10-08 加，选择点）：同样是整句，同一套要求。
  for (const [j, road] of ((moment.choice && moment.choice.roads) || []).entries()) {
    for (const [i, s] of (road.lines || []).entries()) addLine(`MOMENTS/${moment.id}/choice/roads[${j}]/lines[${i}]`, s)
    addLine(`MOMENTS/${moment.id}/choice/roads[${j}]/cost`, road.cost)
  }
}
// 痕迹那三池（2026-10-09 加，2026-10-10 ④ 文本重建加厚）：也是整句，同一套要求。
// 注意它们的 `where` 前缀是 `MARKS/`，不会掉进上面那两条「红框／蓝框」的过滤里
// （那两条只认 `SCENES|SHARDS/` 与 `lifeLine/`）。
for (const [name, pools] of Object.entries(MARKS || {})) {
  for (const [pool, list] of Object.entries(pools || {})) {
    for (const [i, s] of (list || []).entries()) addLine(`MARKS/${name}/${pool}[${i}]`, s)
  }
}
// 序曲那几句（2026-10-08 加）：也是整句，同一套要求。名字只在这一段里出现。
for (const [i, s] of ((ORIGIN && ORIGIN.lines) || []).entries()) addLine(`ORIGIN/lines[${i}]`, s)
// 归宿那几句（2026-10-08 加，用户 m08146「全做。」第 ⑤ 件）：也是整句，同一套要求。
// 末尾那句收束是名字的**第二处**，也是最后一处。
for (const one of FATES || []) {
  for (const [i, s] of ((one && one.lines) || []).entries()) addLine(`FATES/${one.id}/lines[${i}]`, s)
  if (one && one.close) addLine(`FATES/${one.id}/close`, one.close)
}
// 当日计划那几句（2026-10-10 加，第二期）：`plan` 每句带 {n}/{place}/{seal} 三个占位符，
// 这里先把地点与封印名换成真名再扫（`addLine` 只认 {n}/{e}，所以先自己替换一遍）。
// `season` 与 `losses` 是整句，同一套要求。
const JOURNEY_HEAD = ((JOURNEY && JOURNEY.stations) || [])[0] || { label: '界碑镇', seal: '碑' }
for (const [i, s] of ((JOURNEY?.plans?.plan) || []).entries()) {
  addLine(`JOURNEY/plans/plan[${i}]`, s.replace(/\{place\}/g, JOURNEY_HEAD.label).replace(/\{seal\}/g, JOURNEY_HEAD.seal))
}
for (const [key, list] of Object.entries(JOURNEY?.plans?.season || {})) {
  for (const [i, s] of (list || []).entries()) addLine(`JOURNEY/plans/season/${key}[${i}]`, s)
}
for (const [key, list] of Object.entries(JOURNEY?.losses || {})) {
  for (const [i, s] of (list || []).entries()) addLine(`JOURNEY/losses/${key}[${i}]`, s)
}

// 真拼一层：四十段、两种语气、六个动作轮着来，最后一段是「刚刚才结束」，
// 好让 narrationFor 走「他此刻在做什么」那一支（不是「出门了」那一支）。
const RED_ACTS = ['改文件', '跑命令', '翻文件', '查资料', '派了活', '聊了聊']
const redEntries = (n = 40) =>
  Array.from({ length: n }, (_, i) => {
    const acts = [RED_ACTS[i % 6], RED_ACTS[(i + 2) % 6]]
    const minutes = 30 + (i % 4) * 40
    const startedAt = NOW - (n - i) * 3 * 3600 * 1000
    return {
      id: `red-${i}`,
      startedAt,
      endedAt: i === n - 1 ? NOW - 60 * 1000 : startedAt + minutes * 60 * 1000,
      minutes,
      tags: acts,
      counts: { [acts[0]]: 7 + (i % 5), [acts[1]]: 3 + (i % 3) },
      files: i % 3 === 0 ? ['D:\\x\\a.md'] : [],
      deliverables: i % 5 === 0 ? ['D:\\x\\b.md'] : [],
      helpers: i % 7 === 0 ? ['one', 'two', 'three'] : [],
    }
  })

const GEN = []
const redList = redEntries()
for (const voice of VOICE_IDS) {
  const seq = composeSequence(redList, voice)
  for (const [id, pickd] of seq) if (pickd && pickd.line) GEN.push({ where: `拼/${voice}/${id}`, text: pickd.line })
  for (const e of redList) {
    const d = dayLine(e, voice)
    if (d) GEN.push({ where: `dayLine/${voice}/${e.id}`, text: d })
    const h = helpersFor(e)
    if (h) GEN.push({ where: `helpersFor/${e.id}`, text: h })
    const l = lifeLine(e, voice, redList[0])
    if (l) GEN.push({ where: `lifeLine/${voice}/${e.id}`, text: l })
  }
  const narr = narrationFor(redList, NOW, voice)
  if (narr && narr.line) GEN.push({ where: `narrationFor/${voice}`, text: narr.line })
}

const ALL_LINES = [...TABLE, ...GEN]
const scanRed = (name, ok, list = ALL_LINES) => {
  const bad = list.filter((x) => !ok(x.text))
  check(name, bad.length === 0, bad.length ? bad.slice(0, 3).map((x) => `${x.where}｜${x.text}`).join(' ／ ') : `${list.length} 句都过`)
}

// 2026-10-05 摘掉案牍之后这两个数各少了约一半（原来两套说法时 1320 句），
// 门槛跟着降下来——这两条是**防大删**，不是钉具体数字。
check('红线扫的句子够多（句库 550 句起，加上拼出来的）',
  TABLE.length >= 550 && GEN.length >= 100, `句库 ${TABLE.length} 句 + 拼出来 ${GEN.length} 句`)

scanRed('红线：没有一句带感叹号或问号', (t) => !/[!！?？]/.test(t))
scanRed('红线：没有一句是说明书（陪伴 / 成长 / 记录 / 进度 / 等级 / 天数 / 余额）',
  (t) => !/陪伴|成长|记录|进度|等级|天数|余额|旅程|养成/.test(t))
scanRed('红线：没有一句提到现代的东西（文件 / 代码 / 用户 / 项目 / 数据 / 系统）',
  (t) => !/文件|代码|电脑|用户|项目|数据|系统|需求|方案|文档|手机|软件|网络|插件/.test(t))
scanRed('红线：没有一句在要补偿（你终于来了 / 我等了你三天 / 好久没来）',
  (t) => !/你终于|终于来了|你可算|我等了|等了.{0,3}(天|久)|好久没|几天没|多久没|别丢下/.test(t))
scanRed('红线：每一句都以句号收尾，没有半截话',
  (t) => t.trim().endsWith('。') && !/，。|。，|，，|[{}]/.test(t),
  ALL_LINES.filter((x) => x.whole !== false))
scanRed('红线：没有一句是两声「他」（同一个主语接两遍）',
  (t) => !/^他[^，。]*，他/.test(t))

/* 2026-10-07 用户拍的两层：红框＝他的活计（工作 / 战斗 / 其他），蓝框＝只能是生活。
   这一对断言就是那句话本身——两边各扫一遍，哪边串了都红。
   红框的料来自 SCENES 与 SHARDS（全在 TABLE 里），蓝框的料只有 lifeLine（在 GEN 里）。
   `DEED_ONLY` 是按**单个字**拼的（墨、笔），所以先拿掉几个跟行当无关的常用词：
   2026-10-06 抓到的那条假红是「缆绳绷得**笔**直」撞上 `笔`（那句话出自后来收进
   `.parked/ferry-voice/` 的船家那一套）；假朋友只许一条一条往里加，不许放宽词表本身。 */
const FALSE_FRIENDS = /笔直|墨黑|架子鼓/g
const DEED_ONLY = /咒文|符纸|契书|疆域图|地图|法器|机关|齿盘|零件|风箱|卷轴|架子|箱笼|匣子|册子|悬赏|火漆|银墨|镇石|羊皮|梯子|抄本|笔录|墨|笔/
const LIFE_ONLY = /吃|睡|枕|被褥|哈欠|打盹|起床|面包|汤|靴|晾|灶|宵夜|早饭|晚饭/
const lifeLines = GEN.filter((x) => x.where.startsWith('lifeLine/'))
// 红框的料只算 SCENES 与 SHARDS：SHARED_LINES / HOME_LINES 是「他此刻在做什么」与
// 「他出门了 / 在家」那种状态话（打盹、睡了），本来就不是活计，不在这条里管。
const deedLines = TABLE.filter((x) => /^(SCENES|SHARDS)\//.test(x.where))
scanRed('蓝框只有生活：生活层里不许出现行当词（咒文 / 法器 / 卷轴……）',
  (t) => !DEED_ONLY.test(t.replace(FALSE_FRIENDS, '')), lifeLines)
scanRed('红框不是生活：活计句里不许出现起居词（吃 / 睡 / 面包……）',
  (t) => !LIFE_ONLY.test(t), deedLines)

// 钱：只许出现在「那天交了东西」那一档。表里能追到出处，所以这条扫表，不扫拼出来的。
const MONEY = /工钱|铜币|定金|卖家|收进袋里|给了钱|收了钱|分了一笔|一笔钱|犒劳/
const moneyLines = TABLE.filter((x) => MONEY.test(x.text))
const strayMoney = moneyLines.filter((x) => !x.where.endsWith('/paid'))
check('红线：钱只出现在「交了东西」那一档里', strayMoney.length === 0,
  strayMoney.length ? strayMoney.slice(0, 3).map((x) => `${x.where}｜${x.text}`).join(' ／ ') : `${moneyLines.length} 句带钱，全在 paid 档`)
check('「交了东西」那一档真有钱（这条不是空的）', moneyLines.length >= 6, `${moneyLines.length} 句`)

// 右栏一个阿拉伯数字都不许有：这条要真渲染一遍，走 DOM，不走函数返回值。
// 2026-10-09（见闻录只讲今天）：四条**全摆到今天**的最近半小时里，各自留一格，
// 这样「每一段时光一行」还是四行、形状（帮手 / 交付物 / 只说话 / 三样工具）也都是四样。
// 底下另外压一条**昨天**的：它一个字节都不该画出来，可今天最早那一行上面那句
// 「隔了一夜」正是拿它比出来的（`prevOf` 走的是全部记录，不是今天那一份）。
const RED_ROWS = [
  {
    id: 'red-row-1', startedAt: at(0, 16, 30), endedAt: NOW - 3 * 60 * 1000, minutes: 7,
    tags: ['改文件', '跑命令', '翻文件'], counts: { 改文件: 12, 跑命令: 9, 翻文件: 6 },
    files: ['D:\\x\\client.js'], deliverables: ['D:\\x\\a.md'], helpers: ['h1', 'h2'],
  },
  {
    id: 'red-row-2', startedAt: at(0, 16, 24), endedAt: at(0, 16, 29), minutes: 5,
    tags: ['查资料'], counts: { 查资料: 21 }, helpers: ['h1'],
  },
  {
    id: 'red-row-3', startedAt: at(0, 16, 18), endedAt: at(0, 16, 23), minutes: 5,
    tags: ['派了活', '聊了聊'], counts: { 派了活: 5, 聊了聊: 2 },
  },
  {
    id: 'red-row-4', startedAt: at(0, 16, 12), endedAt: at(0, 16, 17), minutes: 5,
    tags: ['翻文件'], counts: { 翻文件: 40 }, deliverables: ['D:\\x\\b.md', 'D:\\x\\c.md'],
  },
  {
    id: 'red-row-past', startedAt: at(1, 15, 40), endedAt: at(1, 16, 13), minutes: 33,
    tags: ['改文件'], counts: { 改文件: 3 },
  },
]
const RED_TODAY = RED_ROWS.filter((r) => r.id !== 'red-row-past')

const rgf = createGameflow({ loadRecords: () => RED_ROWS, now: () => NOW })
rgf.mount()
rgf.open()
await tick()
const rhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const himText = rhost.all('gf-him-col').map((e) => e.textContent)
const youText = rhost.all('gf-you').map((e) => e.textContent)
check('红线：右栏（他那一栏）一个阿拉伯数字都没有',
  himText.length === RED_TODAY.length && himText.every((t) => !/[0-9]/.test(t)),
  himText.find((t) => /[0-9]/.test(t)) || `${himText.length} 行都干净`)
check('红线：昨天那一条不进见闻录（右栏只有今天那四行）',
  himText.length === 4 && !rhost.textContent.includes('red-row-past'),
  `${himText.length} 行 / ${RED_ROWS.length} 条记录`)
check('红线：左栏（你那一栏）照样是名词和数字（上一条不是空的）',
  youText.some((t) => /[0-9]/.test(t)), youText[0] || '(左栏没渲染出来)')
check('红线：右栏没有空行（每一行都真说出了点什么）',
  himText.every((t) => t.trim().length > 0), `${himText.filter((t) => !t.trim()).length} 行是空的`)

// 2026-10-05 在 preview.html 上撞见的真缺陷：演示数据那四条记录都没有 id，
// 而 `composeSequence` 拿不到 id 就**整行跳过**，`prevOf` 也把几行挤在同一个键上，
// 于是四行一句生活层都没有（「隔了一夜，他又坐到老位置上。」永远不出现）。
// 这里把有 id 的那份拆掉 id 再渲染一遍，钉住「缺 id 也走同一条路」。
const NO_ID_ROWS = RED_ROWS.map(({ id, ...rest }) => rest)
const ngf = createGameflow({ loadRecords: () => NO_ID_ROWS, now: () => NOW })
ngf.mount()
ngf.open()
await tick()
const nhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const nHim = nhost.all('gf-him-col').map((e) => e.textContent)
check('缺 id 的记录也照样有句子（不是整行被跳过）',
  nHim.length === RED_TODAY.length && nHim.every((t) => t.trim().length > 0),
  `${nHim.filter((t) => !t.trim()).length} 行是空的`)
check('缺 id 的记录也照样有生活层（上一段的间隔还认得出来）',
  nhost.all('gf-life').length >= 1, `${nhost.all('gf-life').length} 条生活层`)

/* ------------------------------------------------------------------ *
 * 高光事件：有些日子会多出几行（2026-10-08，用户 m06647 第 2 条）
 *
 * 一句话的活计之外，偶尔有一件事**从开头讲到收束**——「血色婚礼」那种量级靠的
 * 不是更华丽的句子，是**有经过**。三件事的边界在这里一条一条钉住：
 *   ① 只有真发生过才出现（门槛由真实记录喂出来，不是按天摇骰子）；
 *   ② 它加在那一行**下面**，不替掉他手上那句话，也不另开一个窗口；
 *   ③ 没有事的日子照旧只有一行（不是天天都有大事）；
 *   ④ 同一份记录看两眼，一个字都不变。
 * ------------------------------------------------------------------ */

// 2026-10-09（见闻录只讲今天）：这三段原来摆在三个过去的日子上，现在**全部摆到今天**，
// 而且落在最近半小时以外——于是它们收成今天那一卷。`momentsFor` 本来就只认日卷
// （`if (unit.tier !== 'day') continue`），所以「一天一件事」这条判据一个字都不用改，
// 换的只是「三天」变成「今天里那三段」。门槛还是三样：一段交了两样东西（交割日）、
// 两段平平常常（撞墙不够、交付物不够，什么都不发生）。
const MOMENT_DAYS = [
  {
    id: 'moment-day-deliver', startedAt: at(0, 9, 0), endedAt: at(0, 10, 0), minutes: 60,
    tags: ['改文件'], counts: { 改文件: 8 }, deliverables: ['D:\\x\\a.md', 'D:\\x\\b.md'],
  },
  {
    id: 'moment-day-quiet-a', startedAt: at(0, 11, 0), endedAt: at(0, 11, 30), minutes: 30,
    tags: ['翻文件'], counts: { 翻文件: 5 },
  },
  {
    id: 'moment-day-quiet-b', startedAt: at(0, 14, 0), endedAt: at(0, 14, 30), minutes: 30,
    tags: ['翻文件'], counts: { 翻文件: 5 },
  },
]

const mgf = createGameflow({ loadRecords: () => MOMENT_DAYS, now: () => NOW })
mgf.mount()
mgf.open()
await tick()
const mhostM = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const mBlocks = mhostM.all('gf-moment')
const mLines = mBlocks.flatMap((b) => b.all('gf-moment-line').map((e) => e.textContent))
const mHim = mhostM.all('gf-him-col').map((e) => e.textContent)
const mDays = mhostM.all('gf-row-day')

check('高光事件：今天只有一行一卷，那一卷上正好一件大事（门槛不到的两段不叠）',
  mDays.length === 1 && mBlocks.length === 1, `${mDays.length} 卷里有 ${mBlocks.length} 件事`)
check('高光事件：一件事是从头讲到收束的（至少五句：经过四句＋一句收束）',
  mBlocks.length === 1 && mBlocks.every((b) => b.all('gf-moment-line').length >= 5),
  mBlocks.map((b) => b.all('gf-moment-line').length).join(' / ') || '(一件事都没有)')
check('高光事件：它加在他手上那句话下面，不是替掉那一行',
  mDays.length === 1 && mDays.every((r) => r.all('gf-remark').length >= 1),
  `${mDays.filter((r) => !r.all('gf-remark').length).length} 卷没有主句`)
check('高光事件：算他那边的（在右栏里）',
  mBlocks.length === 1 && mHim.some((t) => t.includes(mLines[0])),
  mLines[0] || '(一句话都没有)')
check('高光事件：每一句都以句号收尾，且一个阿拉伯数字都没有',
  mLines.length >= 5 && mLines.every((t) => t.endsWith('。') && !/[0-9]/.test(t)),
  mLines.find((t) => !t.endsWith('。') || /[0-9]/.test(t)) || `${mLines.length} 句都干净`)

// 同一份记录看两眼，事件句必须一模一样（种子只吃记录本身，跟「哪一天看」无关）。
const mgf2 = createGameflow({ loadRecords: () => MOMENT_DAYS, now: () => NOW })
mgf2.mount()
mgf2.open()
await tick()
const mhost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const mLines2 = mhost2.all('gf-moment').flatMap((b) => b.all('gf-moment-line').map((e) => e.textContent))
check('高光事件：同一份记录看两眼，一个字都不变',
  mLines.length > 0 && mLines.join('\n') === mLines2.join('\n'),
  mLines.length === mLines2.length ? '句数一样但内容不同' : `${mLines.length} / ${mLines2.length}`)

// 引擎那一层：条件读不读得懂、门槛到没到、同一天撞上好几件时先讲哪一件。
const { momentOf } = await import('../src/packs/rules.js')
const { moments: PACK_MOMENTS } = await import('../src/packs/adventure/moments.js')
check('高光事件：面板装上的就是包里那一份（连先后次序都一样）',
  (MOMENTS || []).map((m) => m.id).join(',') === PACK_MOMENTS.map((m) => m.id).join(','),
  (MOMENTS || []).map((m) => m.id).join(',') || '(一件都没有)')
const FACTS = (over = {}) => ({
  hours: new Set(), places: new Set(), scenes: new Set(),
  deliverables: [], helpers: [], files: [], tags: [], counts: {}, fails: 0, minutes: 0, ...over,
})
check('高光事件：下矿洞那天撞了两下，就是塌方',
  momentOf(FACTS({ scenes: new Set(['mine']), fails: 2 }), MOMENTS)?.id === 'mine-cave-in',
  momentOf(FACTS({ scenes: new Set(['mine']), fails: 2 }), MOMENTS)?.id || '(什么都没发生)')
check('高光事件：路上撞了两下，就是桥头那场埋伏',
  momentOf(FACTS({ scenes: new Set(['road']), fails: 2 }), MOMENTS)?.id === 'bridge-ambush',
  momentOf(FACTS({ scenes: new Set(['road']), fails: 2 }), MOMENTS)?.id || '(什么都没发生)')
check('高光事件：交了两样东西，就是交割日',
  momentOf(FACTS({ deliverables: ['a.md', 'b.md'] }), MOMENTS)?.id === 'delivery-day',
  momentOf(FACTS({ deliverables: ['a.md', 'b.md'] }), MOMENTS)?.id || '(什么都没发生)')
check('高光事件：门槛不到就什么都不发生（不是天天有大事）',
  momentOf(FACTS({ scenes: new Set(['mine']), fails: 1 }), MOMENTS) === null
  && momentOf(FACTS({ deliverables: ['a.md'] }), MOMENTS) === null,
  '只撞一下、只交一样，都还不算一件事')
check('高光事件：同一天撞上好几件，先讲排在前面的那一件',
  momentOf(FACTS({ hours: new Set([23]), fails: 3, scenes: new Set(['mine', 'road']), deliverables: ['a.md', 'b.md'] }), MOMENTS)?.id === 'night-raid',
  momentOf(FACTS({ hours: new Set([23]), fails: 3, scenes: new Set(['mine', 'road']), deliverables: ['a.md', 'b.md'] }), MOMENTS)?.id || '(什么都没发生)')

/* ------------------------------------------------------------------ *
 * 退休：事件层那两条路（原来在 `scripts/smoke.mjs:4307` 起）
 *
 * 原来这里验的是「选择点」——高光事件走到一半，他走的是哪条路（守到天亮 / 退走），
 * 两条路夹在「经过」与「收束」之间，左边压一道金线。2026-10-10（用户 m16528 三条）之后
 * **那一层不再摆路了**：岔口整层撤掉，只剩 `steps` ＋ `close`，屏幕上跟事件有关的路
 * 从此只有命运那一层（`.gf-fork` / `.gf-choice-live`）。包里 `moments.js` 的 `choice`
 * 与 `cost` 一个字节没删（旧内容备用，用户 m14810 第 6 条），R18 照旧管它的形状——
 * 所以**引擎那一层与规矩那一层的断言留着**（见下面 `choiceOf` 那几条），
 * 只有 DOM 那一层（`gf-choice-line` / `gf-moment-fork` 那几行）作废，已由下面
 * 「命运能点」那一节接手（`gf-fork-line` / `gf-choice-live`）。
 * ------------------------------------------------------------------ */


// 引擎那一层：路是照真信号挑的，不是摇出来的。
const { choiceOf } = await import('../src/packs/rules.js')
const { moments: PACK_MOMENTS_ALL } = await import('../src/packs/adventure/moments.js')
const roadsOf = (id) => (PACK_MOMENTS_ALL.find((m) => m.id === id) || {}).choice
check('选择点：夜袭那天做得久就守到天亮，做得短就退走',
  choiceOf(FACTS({ minutes: 300 }), roadsOf('night-raid'))?.id === 'hold'
  && choiceOf(FACTS({ minutes: 100 }), roadsOf('night-raid'))?.id === 'leave',
  `${choiceOf(FACTS({ minutes: 300 }), roadsOf('night-raid'))?.id || '没走'} / ${choiceOf(FACTS({ minutes: 100 }), roadsOf('night-raid'))?.id || '没走'}`)
check('选择点：塌方那天撞得更狠就回头把阵填了，否则拎起镐头下山',
  choiceOf(FACTS({ fails: 4 }), roadsOf('mine-cave-in'))?.id === 'seal'
  && choiceOf(FACTS({ fails: 2 }), roadsOf('mine-cave-in'))?.id === 'leave',
  `${choiceOf(FACTS({ fails: 4 }), roadsOf('mine-cave-in'))?.id || '没走'} / ${choiceOf(FACTS({ fails: 2 }), roadsOf('mine-cave-in'))?.id || '没走'}`)
check('选择点：桥头那天做得久就把话带到，否则折回去',
  choiceOf(FACTS({ minutes: 200 }), roadsOf('bridge-ambush'))?.id === 'cross'
  && choiceOf(FACTS({ minutes: 60 }), roadsOf('bridge-ambush'))?.id === 'back',
  `${choiceOf(FACTS({ minutes: 200 }), roadsOf('bridge-ambush'))?.id || '没走'} / ${choiceOf(FACTS({ minutes: 60 }), roadsOf('bridge-ambush'))?.id || '没走'}`)
check('选择点：交割那天交出去三样就往后再接一件，只交两样就先回家',
  choiceOf(FACTS({ deliverables: ['a', 'b', 'c'] }), roadsOf('delivery-day'))?.id === 'again'
  && choiceOf(FACTS({ deliverables: ['a', 'b'] }), roadsOf('delivery-day'))?.id === 'home',
  `${choiceOf(FACTS({ deliverables: ['a', 'b', 'c'] }), roadsOf('delivery-day'))?.id || '没走'} / ${choiceOf(FACTS({ deliverables: ['a', 'b'] }), roadsOf('delivery-day'))?.id || '没走'}`)
check('选择点：没有事件就没有岔口（岔口只住在事件里）',
  choiceOf(FACTS({ minutes: 300 }), null) === null && choiceOf(FACTS({ minutes: 300 }), {}) === null,
  '没事件的时候挑不出路来')

// 规矩那一层：写坏的岔口要报出来（少一条路、最后那条路带条件、路里只有一句）。
const { checkMoments } = await import('../src/packs/rules.js')
const badChoice = (roads) => checkMoments([{ id: 'x', when: [{ when: 'fails', gte: 1 }], steps: ['他做了点什么。', '他又做了点什么。'], close: '就这样。', choice: { roads } }], 'smoke')
check('选择点：写坏的岔口会被规矩抓出来（少一条路、最后那条带条件、路里只有一句）',
  badChoice([{ id: 'a', label: '甲', when: [{ when: 'fails', gte: 1 }], lines: ['一句话。', '两句话。'] }]).length >= 1
  && badChoice([
    { id: 'a', label: '甲', when: [{ when: 'fails', gte: 1 }], lines: ['一句话。', '两句话。'] },
    { id: 'b', label: '乙', when: [{ when: 'fails', gte: 2 }], lines: ['一句话。', '两句话。'] },
  ]).length >= 1
  && badChoice([
    { id: 'a', label: '甲', when: [{ when: 'fails', gte: 1 }], lines: ['只有一句。'] },
    { id: 'b', label: '乙', lines: ['一句话。', '两句话。'] },
  ]).length >= 1,
  `少一条路 ${badChoice([{ id: 'a', label: '甲', lines: ['一句话。', '两句话。'] }]).length} 条 / 最后那条带条件 ${badChoice([{ id: 'a', label: '甲', when: [{ when: 'fails', gte: 1 }], lines: ['一句话。', '两句话。'] }, { id: 'b', label: '乙', when: [{ when: 'fails', gte: 2 }], lines: ['一句话。', '两句话。'] }]).length} 条 / 路里只有一句 ${badChoice([{ id: 'a', label: '甲', when: [{ when: 'fails', gte: 1 }], lines: ['只有一句。'] }, { id: 'b', label: '乙', lines: ['一句话。', '两句话。'] }]).length} 条`)
check('选择点：包里那四件事的岔口都过规矩',
  checkMoments(PACK_MOMENTS_ALL, 'adventure').length === 0,
  checkMoments(PACK_MOMENTS_ALL, 'adventure').slice(0, 3).join(' / ') || '四件都干净')

/* ------------------------------------------------------------------ *
 * 命运能点：那两条路是他挑的（2026-10-08 晚用户 m10670 第 2 条；2026-10-10 按用户 m16528 三条重做）
 *
 * 用户 m10670 第 2 条原话：「我要的交互选项在哪？」——他要的是**他挑**，不是机器替他挑。
 * 2026-10-10 用户 m16528 三条把「能点的那个东西」整个重做了：不再是「守到天亮 / 退走」那种
 * 日常（第 1 条：「你现在给的都是日常，都很随意，都无足轻重」），而是**魔窟还是暗堡**这种
 * 他真不知道会怎么样的岔口；**代价不可知**（第 2 条：按钮上只有地名与眼前那一句，一个字的
 * 账都不写）；挑的那条**影响这一整天**（第 3 条：痕迹、仗、回声全从它出）。六条边界：
 *   ① 还没定下来：摆两个按钮（两条路都摆着），每条只有招牌 + 眼前那一句，**没有代价**；
 *   ② 点一下：那一格那两个按钮下去，日卷那一行换上「命运」那一段（两枚一亮一暗 + 落的那一种
 *      结果，每拍一行）；
 *   ③ 记在本地（跟挑说法同一个存储、另一个键），同一个存储再看一遍还是那条；
 *   ④ 没有存储（预览页 / 自检里 `storage: null`）就不摆按钮，**书自己走主线那一支**；
 *   ⑤ 册子上的进度也记在那儿（`dsh.gameflow.ledger`，只两个整数，见用户 m16552）；
 *   ⑥ 门框那枚记号跟着它亮（`refreshBadge` 与 `renderTimeline` 同一个来源）。
 * ------------------------------------------------------------------ */

// 一个干净的假存储（底下就是个 Map），照挂载那一节那套写。
// 2026-10-19（用户 m19006）起，见闻录里有一道**幕布**：今天还没按过「开始冒险」，
// 这一天的行与那件命运**一概不铺**。下面这些夹具要看的都是「按过之后」的画面，
// 所以默认写上一笔「今天已经按过」；要看幕布的夹具自己把它删掉（见那两条断言）。
const freshStore = () => {
  const box = new Map()
  const d0 = new Date(NOW)
  d0.setHours(0, 0, 0, 0)
  box.set('dsh.gameflow.started', String(d0.getTime()))
  return {
    box,
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => { box.set(k, String(v)) },
    removeItem: (k) => { box.delete(k) },
  }
}
// 从「今天」往前推天数（跟 `at` 同一个算法，只是基准钉在 NOW 上）——年卷那一档
// 要一份够长的历史，用 `at` 也行，这里写明是为了让人一眼看出基准是哪一个。
const pickAt = (days, h, m = 0) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

// 今天这一卷：后半夜做满六个钟头、撞了四下 ⇒ 命运那一层落的是**方向**（`way`：荒地里走了
// 有一段路，路分了两股——一边是魔窟，一边是暗堡）。这正是用户 m16528 第 1 条举的那个例子。
// 今天 16:35 那一格就是「他走到这儿」的那一格（`forkStartCell`：命运的条件是按天判的，
// 所以起头就是今天最早那一格），按钮长在它那一行上。
const PICK_DAYS = [
  {
    // `counts` 那个数字不只是拿来写「×N」的：景是按 `${id}|${act}|${n}|scene` 散列挑的
    // （`pickIndex`），`n = 14` 时 `改文件` 挑到 `map`（桌上那张图）⇒ 命运会落到**取舍**那一件；
    // `n = 15` 挑到 `ruin` ⇒ **方向**那一件成立（`way` 要的正是野景）。改这个数之前先跑一遍
    // 那段 DEBUG 探针，或者把这张卡的活换成 `翻文件`（它的景 `tower` / `watch` 全在 `way` 的清单里）。
    id: 'pick-day-raid', startedAt: at(0, 0, 30), endedAt: at(0, 6, 30), minutes: 360,
    tags: ['改文件'], counts: { 改文件: 15 }, fails: 4,
  },
  {
    // 「此刻」那一格：**带 `ticks` 才会铺成梯子**（见 rowUnits 的 `grid`）——按钮就长在这一行上。
    id: 'pick-day-new', startedAt: at(0, 16, 35), endedAt: at(0, 16, 40), minutes: 5,
    tags: ['改文件'], counts: { 改文件: 1 }, fails: 0,
    ticks: [foldTick(0, 16, 35, 1)],
  },
]

const { forks: PACK_FORKS } = await import('../src/packs/adventure/forks.js')
const wayFork = (PACK_FORKS || []).find((f) => f.id === 'way')
const wayRoad = (id) => (((wayFork || {}).roads) || []).find((r) => r.id === id)
const wayOut = (roadId, outId) => (((wayRoad(roadId) || {}).outcomes) || []).find((o) => o.id === outId)
const caveRoad = wayRoad('cave')   // 魔窟：**分支**那一支
const keepRoad = wayRoad('keep')   // 暗堡：主线那一支
const caveDeath = wayOut('cave', 'death')
// 撞了四下 ⇒ 主线那一条落的是 `miscount`（`fails ≥ 2`）。
const keepOut = wayOut('keep', 'miscount')

// 下面 `MISS_DAYS` 那一套（今天 40 分钟、撞了四下）从前落的是**遭遇**那一件（`meet`）——
// 那时日卷那一份账只看得见屏幕上铺着的那几格。2026-10-11（用户 m17334）起，被收进日卷的
// 那些段也进账，这个夹具改落**取舍**那一件（`pick`：屋里的火），所以下面那几条断言
// **不写死是哪一件**，照着摆出来的两颗按钮对。
const meetFork = (PACK_FORKS || []).find((f) => f.id === 'meet')
const meetRoad = (id) => (((meetFork || {}).roads) || []).find((r) => r.id === id)
const meetOut = (roadId, outId) => (((meetRoad(roadId) || {}).outcomes) || []).find((o) => o.id === outId)
const stopRoad = meetRoad('stop')   // 拦一下：主线那一支
const stopOut = meetOut('stop', 'failed')   // 撞了四下 ⇒ `fails ≥ 3` 那一档

const pickStore = freshStore()
const pgf = createGameflow({ loadRecords: () => PICK_DAYS, now: () => NOW, storage: pickStore })
pgf.mount()
pgf.open()
await tick()
const phost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const pickBars = phost.all('gf-choice-live')
const pickBtns = phost.all('gf-choice-pick')
const lookLine = (phost.all('gf-choice-look')[0] || {}).textContent || ''
check('命运：这一轮夹具落在「魔窟还是暗堡」那一件上（顺序即优先级）',
  !!wayFork && pickBars.length === 1 && pickBtns.map((e) => e.getAttribute('data-road')).join(' ') === 'cave keep',
  `${wayFork ? wayFork.id : '没找到那一件'} / ${pickBtns.map((e) => e.getAttribute('data-road')).join(' ')}`)
check('命运：还没定下来就摆两个按钮，眼前那一句也摆着（不是光秃秃两个词）',
  pickBars.length === 1 && pickBtns.length === 2 && lookLine.length > 6,
  `${pickBars.length} 处 / ${pickBtns.length} 颗 / 眼前那一句「${lookLine || '没有'}」`)
check('命运：两个按钮写的就是那两条路的招牌（两条路都摆着）',
  pickBtns.map((e) => (e.all('gf-choice-name')[0] || {}).textContent).join(' ') === '魔窟 暗堡',
  pickBtns.map((e) => (e.all('gf-choice-name')[0] || {}).textContent).join(' '))
check('命运：按钮上只有眼前那一句，**一个字的代价都没有**（用户 m16528 第 2 条）',
  pickBtns.length === 2 && pickBtns.every((e) => {
    const hint = (e.all('gf-choice-hint')[0] || {}).textContent || ''
    return hint.length > 4 && !hint.includes('代价') && (e.all('gf-choice-cost')[0] || null) === null
  }),
  pickBtns.map((e) => (e.all('gf-choice-hint')[0] || {}).textContent || '没写眼前那句').join(' / '))
check('命运：按钮是按钮，悬停能先看一眼这条路（title 不带句号）',
  pickBtns.every((e) => e.tagName === 'BUTTON' && String(e.getAttribute('title') || '').length > 0
    && !String(e.getAttribute('title') || '').endsWith('。'))
  && pickBtns[0].getAttribute('data-road') === 'cave' && pickBtns[1].getAttribute('data-road') === 'keep',
  pickBtns.map((e) => `${e.getAttribute('data-road')}:${e.getAttribute('title')}`).join(' / '))

// 折叠状态动不了「命运」：同一份记录，把「现在」往后推 45 分钟（那一刻 16:35 那一格已经收进
// 日卷了），摆出来的还得是同一件、同样两条路。用户 m18197 逐字：「但是我没有选，我挪走了鼠标，
// 于是感叹号就消失了」——根子就是取景的口径跟着折叠变（见 `forkStep` / `pendingPin`）。
const rolledStore = freshStore()
const rolledGf = createGameflow({ loadRecords: () => PICK_DAYS, now: () => NOW + 45 * 60 * 1000, storage: rolledStore })
rolledGf.mount()
rolledGf.open()
await tick()
const rolledHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const rolledBtns = rolledHost.all('gf-choice-pick')
check('命运：折叠状态动不了它——同一份记录晚看 45 分钟，摆的还是同一件、同样两条路',
  rolledHost.all('gf-choice-live').length === 1 && rolledBtns.length === 2
  && rolledBtns.map((e) => e.getAttribute('data-road')).join(' ')
    === pickBtns.map((e) => e.getAttribute('data-road')).join(' '),
  `${rolledHost.all('gf-choice-live').length} 处 / ${rolledBtns.map((e) => e.getAttribute('data-road')).join(' ') || '一颗都没有'}`)

// 没定下来之前，「他的冒险」（右栏）一概不进这一遍（用户 m18547 第 2 条逐字：「在用户没有进行命运
// 选择的时候，界面要一直停在命运选择上，并且不再有任何落盘的进程和发展，必须等用户选择之后，再
// 开始发展。」）。2026-10-18 用户 m18735 又补了一条：「停的只是右侧"他的冒险"，左侧是用户的
// "你的日常"不能停。」——所以晚看 45 分钟、中间又干了一段活之后：**右栏一个字不往下写**（命运还是
// 那一件、那两条路，新来那一段不出现在右栏），可**左栏照旧一行一行铺出来**（尾巴那几行只有左栏）。
const laterDays = [...PICK_DAYS, {
  id: 'pick-later', startedAt: at(0, 17, 10), endedAt: at(0, 17, 40), minutes: 30,
  tags: ['跑命令'], counts: { 跑命令: 3 }, files: ['晚来的活'], fails: 2, deliverables: [],
}]
const laterGf = createGameflow({ loadRecords: () => laterDays, now: () => NOW + 45 * 60 * 1000, storage: freshStore() })
laterGf.mount()
laterGf.open()
await tick()
const laterHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const laterRows = laterHost.all('gf-row')
const laterTail = laterHost.all('gf-row-tail')
check('命运：没定下来之前，他那边一概不进这一遍（晚看 45 分钟、中间又干了一段，右栏还是那几行）',
  laterHost.all('gf-choice-live').length === 1
  && laterHost.all('gf-choice-pick').length === 2
  && laterHost.all('gf-fork-line').length === 0
  && !laterHost.all('gf-him-col').map((e) => e.textContent).join('|').includes('晚来的活'),
  `${laterRows.length} 行（尾巴 ${laterTail.length} 行） / `
  + `${laterHost.all('gf-choice-pick').map((e) => e.getAttribute('data-road')).join(' ') || '一颗都没有'}`)
check('命运：你那边照旧往下铺（停的只是右栏，用户 m18735）',
  laterTail.length > 0
  && laterTail.every((r) => r.all('gf-him-col').length === 0)
  && laterTail.map((e) => e.textContent).join('|').includes('晚来的活'),
  `${laterTail.length} 行只建了左栏 / `
  + `${laterTail.map((e) => String(e.textContent).replace(/\s+/g, ' ').slice(0, 26)).join(' ／ ') || '一行都没有'}`)
// 命运压下来那一刻就是**当下**：停在屏幕上最新那一行上（用户 m18547 第 1 条逐字：「我们的命运
// 选择必须是当下这个时间点的」）。这一轮夹具的最新一行是「此刻」那一格 16:40，日卷那一卷是
// 00:30 那张卡——不写死钟点，只认「摆着按钮的那一行就是最上面那一行」。
const liveRow = phost.all('gf-row').find((r) => r.all('gf-choice-live').length > 0) || null
const newestRow = phost.all('gf-row')[0] || null
check('命运：停在当下那一行上（摆着按钮的就是最上面那一行），不是日卷那一卷上',
  !!liveRow && liveRow === newestRow && !String(newestRow.textContent).includes('00:30'),
  `${newestRow ? String(newestRow.textContent).replace(/\s+/g, ' ').slice(0, 46) : '没有行'}`)

// 点「暗堡」（主线那一支）：日卷那一行换上这条路落的那一种结果（`miscount`），按钮下去。
pickBtns[1].dispatch('click')
await tick()
const afterBtns = phost.all('gf-choice-pick')
const afterForkLines = phost.all('gf-fork-line').map((e) => e.textContent)
check('命运：点一下「暗堡」，日卷那一行就换上这条路落的那一种结果，按钮没了',
  afterBtns.length === 0 && !!keepOut && afterForkLines.length === keepOut.beats.length
  && afterForkLines.join('\n') === keepOut.beats.join('\n'),
  `${afterBtns.length} 颗 / ${afterForkLines.length} 句 / ${afterForkLines[0] || '没换'}`)
check('命运：那两枚再摆一次（走的那条亮、没走的那条暗），并写明是你定下的',
  (phost.all('gf-choice-took')[0] || {}).textContent === '暗堡'
  && (phost.all('gf-choice-left')[0] || {}).textContent === '魔窟'
  && String((phost.all('gf-choice-said')[0] || {}).textContent || '').includes('你定下的'),
  `${(phost.all('gf-choice-took')[0] || {}).textContent || '没亮'} / ${(phost.all('gf-choice-said')[0] || {}).textContent || '没说'}`)
check('命运：挑的那条写进了本地（键是「哪一天 + 哪一件」），册子上的进度也记下了',
  (() => {
    const stored = JSON.parse(pickStore.getItem('dsh.gameflow.choices') || '{}')
    const dayKey = Object.keys(stored)[0]
    const d = new Date(NOW)
    d.setHours(0, 0, 0, 0)
    const led = JSON.parse(pickStore.getItem('dsh.gameflow.ledger') || 'null')
    // 走的是主线那一支 ⇒ 册子上多按一个指印，死的那一栏不动。
    return dayKey === `day:${d.getTime()}|way` && stored[dayKey] === 'keep'
      && led && led.deaths === 0 && led.seals === 1
  })(),
  [...pickStore.box.entries()].map(([k, v]) => `${k}=${v}`).join(' / ') || '什么都没记下')

// 同一个存储再看一遍：还是你挑的那条（不是书自己那条主线）。
const pgf2 = createGameflow({ loadRecords: () => PICK_DAYS, now: () => NOW, storage: pickStore })
pgf2.mount()
pgf2.open()
await tick()
const phost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('命运：同一个存储再看一遍，还是你挑的那条',
  phost2.all('gf-choice-pick').length === 0
  && phost2.all('gf-fork-line').map((e) => e.textContent).join('\n') === (keepOut ? keepOut.beats.join('\n') : ''),
  phost2.all('gf-fork-line').map((e) => e.textContent)[0] || '没记住')

// 挑到**分支**上、而且那一支是死路：右半边整块换成死亡页（用户 m16548「整个右半边界面，
// 就是已死亡」），今天后面那些格一个字都不写；左栏照旧（用户 m16552 第 2 条「左栏不停」）。
const deathStore = freshStore()
const deathGf = createGameflow({ loadRecords: () => PICK_DAYS, now: () => NOW, storage: deathStore })
deathGf.mount()
deathGf.open()
await tick()
const forkDeathHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
forkDeathHost.all('gf-choice-pick')[0].dispatch('click')   // 魔窟
await tick()
const deathLines = forkDeathHost.all('gf-death-line').map((e) => e.textContent)
const deathLed = JSON.parse(deathStore.getItem('dsh.gameflow.ledger') || 'null')
check('命运：挑到死路上，右半边整块就是死亡页（不是接着往下讲）',
  !!caveDeath && forkDeathHost.all('gf-death').length === 1
  && deathLines.join('\n') === caveDeath.beats.join('\n')
  && (forkDeathHost.all('gf-death-mark')[0] || {}).textContent === '已死亡'
  && (forkDeathHost.all('gf-death-tail')[0] || {}).textContent === '今天到这里为止。'
  && forkDeathHost.all('gf-fork-line').length === 0 && forkDeathHost.all('gf-choice-pick').length === 0,
  `${forkDeathHost.all('gf-death').length} 块 / ${deathLines.length} 句（期望 ${caveDeath ? caveDeath.beats.length : '?'}） / `
  + `${(forkDeathHost.all('gf-death-mark')[0] || {}).textContent || '没写'} / `
  + `尾「${(forkDeathHost.all('gf-death-tail')[0] || {}).textContent || '没写'}」 / `
  + `${forkDeathHost.all('gf-fork-line').length} 句命运 / ${forkDeathHost.all('gf-choice-pick').length} 颗按钮`)
check('命运：死过一次就记在册子上（第二天重来，他自己不记得——用户 m16552）',
  !!deathLed && deathLed.deaths === 1 && deathLed.seals === 0,
  `${deathStore.getItem('dsh.gameflow.ledger')}`)
check('命运：死了以后，今天后面那些格一个字都不写（左栏照旧）',
  forkDeathHost.all('gf-death').length === 1 && forkDeathHost.all('gf-moment').length === 0
  && forkDeathHost.all('gf-plan').length === 0 && forkDeathHost.all('gf-direction').length === 0,
  `${forkDeathHost.all('gf-moment').length} 件事 / ${forkDeathHost.all('gf-plan').length} 行计划 / ${forkDeathHost.all('gf-direction').length} 行方向`)
deathGf.destroy()

// 没有存储就不摆按钮（预览页与自检里就是这一档）：**书自己走主线那一支**。
// 用户 m16552：「如果没选对，那么就是碰到了分支」——可没有挑的人，书照它自己的线走。
const nostoreGf = createGameflow({ loadRecords: () => PICK_DAYS, now: () => NOW, storage: null })
nostoreGf.mount()
nostoreGf.open()
await tick()
const nostoreHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('命运：没有存储就不摆按钮，书自己走主线那一支（暗堡那一条）',
  nostoreHost.all('gf-choice-pick').length === 0
  && nostoreHost.all('gf-fork-line').length === (keepOut ? keepOut.beats.length : -1)
  && String((nostoreHost.all('gf-choice-said')[0] || {}).textContent || '').includes('他自己走'),
  `${nostoreHost.all('gf-choice-pick').length} 颗 / ${nostoreHost.all('gf-fork-line').length} 句 / ${(nostoreHost.all('gf-choice-said')[0] || {}).textContent || '没说'}`)

/* 退休：岔口挑的那条「也进年卷那份账」（原来在 `scripts/smoke.mjs:4401`）
 *
 * 原来这里摆了三十几天记录 + 一天夜袭，验「年底那句收束从『绕了不少道』换成『都收了尾』」。
 * 2026-10-09（用户 m00789「除了今天之外，全部去掉」）之后**年卷一次都不会产生**，
 * 那条路在界面上走不到了。机器还在（`fatesFor` / `FATES` / `.gf-fate-close` 一个字节没删，
 * `.backup/2026-10-08-210603/` 里有一版能读），但**这条断言不能再摆在这儿装成绿的**：
 * 它现在验的东西已经没有入口。装回折叠梯子那一轮，把这一段从备份里取回来即可。
 * 归宿那一整套的退休理由与这里相同，见下面「归宿」那一节。
 */

/* ------------------------------------------------------------------ *
 * 选项的样子、漏掉的那一档、门上那枚记号、常驻按钮（2026-10-08 晚，用户 m11003 三条）
 *
 * 他原话三条：
 *   ① 「交互要成为一个新的按键选项，目前你给的这两个『守到天亮』和『退走』不像一个交互的
 *      选项，而是一个标签，所以需要换一个显示效果；同时，有交互的一段叙事里，要有新的
 *      区别方式，让用户在翻阅刚才的时候，知道自己错过了一个选项」；
 *   ② 「如果用户不选，那么会自动随机选一个，但是我们要给用户选择的提醒，那么就是现在
 *      门上给一个提醒的符号」；
 *   ③ 「在界面上，我们需要做一个常驻按钮，即是让门后的事情可以一直浮现」。
 *
 * 五条边界：选项一枚一枚竖着排开（整行宽，不再跟左栏那几枚签一套），长在**最新那一格**
 * 那一行上（「此刻」：他还干着、这一格还没落下去），折叠落盘的那一卷**一个字都不提前说**
 * 他往哪条路走（用户 m12444 第 1、3 条）；有岔口的那一段左边压一道金线；那一格落定之后
 * 那一卷照他自己走的那条算——把原来那两枚选项一亮一暗再摆一遍，并写明「他选择了 XX」
 * （用户 m12195 第 2 条）；门关着也亮那枚记号、挑完就灭；「留住」点下去这一页就不自己收。
 * ------------------------------------------------------------------ */

// 今天一天两段：后半夜那一截（00:30–01:10，撞过墙 ⇒ 一件夜袭、一个岔口）
// ＋ 最新那一格（16:35，`NOW = 16:40`，那一格的五分钟还没走完）——所以今天这一卷摆着选项。
//
// 2026-10-09（用户 m00789「除了今天之外，全部去掉。每天都新鲜事，而不要保存过去的事」）：
// 原来这里是「五天夜袭」，靠**更早那四卷**验「走完的那几卷把两枚选项一亮一暗再摆一遍」。
// 现在只有今天一卷，那几条改由下面 `STALE_DAYS`（今天这一格已经落定的那一份）验——
// 同一台机器、同一套牙口，只是从「更早那几卷」挪到了「今天这一卷落定之后」。
const MISS_DAYS = [
  {
    id: 'miss-today', startedAt: at(0, 0, 30), endedAt: at(0, 1, 10), minutes: 40,
    tags: ['改文件'], counts: { 改文件: 14 }, fails: 4,
  },
  {
    // 这一条要铺成**梯子**，选项才有地方长（一张没有 ticks 的卡不算格子）。
    // 只铺**一格**（`at(0,16,40)` 起点与终点同一格），所以整张表是两行：
    // 那一格 ＋ 今天那一卷。跨度要是两格（16:35–16:40），这里就会冒出三行。
    id: 'miss-new', startedAt: at(0, 16, 40), endedAt: at(0, 16, 40), minutes: 5,
    tags: ['改文件'], counts: { 改文件: 1 }, fails: 0,
    ticks: [foldTick(0, 16, 40, 1)],
  },
]
const missStore = freshStore()
const missGf = createGameflow({ loadRecords: () => MISS_DAYS, now: () => NOW, storage: missStore })
missGf.mount()
missGf.open()
await tick()
const mhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const mStyle = String((mhost.allTag('STYLE')[0] || {}).textContent || '')
const mBadge = () => mhost.all('gf-door-badge')[0]
const mDoor = () => mhost.all('gf-door')[0]
const mRoom = () => mhost.all('gf-room')[0]
check('选项：一枚一枚竖着排开、整行宽，上面先写一行「命运」（不再跟左栏那几枚签一套）',
  mhost.all('gf-choice-head').length === 1
  && mhost.all('gf-choice-head').every((e) => e.textContent === '命运')
  && /\.gf-choice\s*\{[^}]*flex-direction:\s*column/.test(mStyle)
  && /\.gf-choice-pick\s*\{[^}]*width:\s*100%/.test(mStyle)
  && /\.gf-choice-pick\s*\{[^}]*text-align:\s*left/.test(mStyle),
  `${mhost.all('gf-choice-head').length} 行抬头 / 整行宽`)
check('选项：只有今天那一卷摆着选项（更早的记录一条都不出现）',
  mhost.all('gf-choice-live').length === 1 && mhost.all('gf-choice-pick').length === 2
  && mhost.all('gf-choice-done').length === 0 && mhost.all('gf-fork-line').length === 0
  && mhost.all('gf-row').length === 2,
  `${mhost.all('gf-choice-live').length} 处 / ${mhost.all('gf-choice-pick').length} 颗 / `
  + `${mhost.all('gf-choice-done').length} 段走完的 / ${mhost.all('gf-fork-line').length} 句命运 / `
  + `${mhost.all('gf-row').length} 行`)
const mTook = mhost.all('gf-choice-took').map((e) => e.textContent)
const mSaid = mhost.all('gf-choice-said').map((e) => e.textContent)

// 用户 m12444 第 1 条：「在今天19:40~21:10的时候，这个时候是一次折叠落盘，折叠落盘时一段小节式地
// 描述，不能弹出选项，任何选项」——那一对按钮长在**最新那一格**那一行上（「此刻」：他还干着、
// 这一格还没落下去），折叠落盘的那一卷（`gf-row-day`）一个字都不提前说他往哪条路走。
const mRows = mhost.all('gf-row')
const mLiveRow = mRows.find((r) => r.all('gf-choice-live').length === 1)
const mRollRow = mRows.find((r) => r.classList.contains('gf-row-day'))
check('选项：这一对按钮长在「此刻」那一格那一行上（折叠落盘那一卷不摆任何选项）',
  !!mLiveRow && mLiveRow === mRows[0] && !mLiveRow.classList.contains('gf-row-roll')
  && mLiveRow.all('gf-when').length === 1
  && !!mRollRow && mRollRow.all('gf-choice-live').length === 0
  && mRollRow.all('gf-fork-line').length === 0 && mRollRow.all('gf-moment').length === 1,
  `${mRows.length} 行 / 选项在${mLiveRow === mRows[0] ? '最上面那一格' : '别处'}`
  + `（${mLiveRow ? mLiveRow.all('gf-when').map((e) => e.textContent).join('') : ''}） / `
  + `那一卷里 ${mRollRow ? mRollRow.all('gf-choice-live').length : '?'} 处选项・`
  + `${mRollRow ? mRollRow.all('gf-fork-line').length : '?'} 句命运`)

// 焦点：面板一打开就该落进来（用户 m12690 那份清单的第 4 条真缺陷）。有得挑就落在第一颗选项上，
// 没得挑（面板记不住）就落在面板本身——所以面板要 `tabindex="-1"`，不然程序收不住它。
const mFocused = FOCUSES[FOCUSES.length - 1]
check('选项：面板一打开，焦点就落在第一颗选项上（不再留在门外）',
  !!mFocused && mFocused.classList.contains('gf-choice-pick'),
  `最后落在${mFocused ? '那一颗选项上' : '别处'}`)
check('选项：有命运的那一段自己认得出来（左边压一道金线）',
  mhost.all('gf-moment').length === 1 && mhost.all('gf-choice-live').length === 1
  && /\.gf-choice-live\s*\{[^}]*border-left:\s*1px solid var\(--gf-fork-rule/.test(mStyle),
  `${mhost.all('gf-moment').length} 件事 / ${mhost.all('gf-choice-live').length} 段带金线`)
check('门上那枚记号：还有一处没挑，门关着也亮着（悬停说清楚有几处）',
  !!mBadge() && mBadge().hidden === false && mDoor().classList.contains('gf-door-has-choice')
  && String(mDoor().getAttribute('title') || '').includes('命运'),
  `${mBadge() && mBadge().hidden ? '藏着' : '亮着'} / ${mDoor().getAttribute('title')}`)

// 那一处挑掉：你挑的那条亮着、另一条暗着，并写明是你定下的。
//
// **这里不写死是哪一件命运**：落哪一件由这一天的账算出来。2026-10-11 起（用户 m17334）
// 日卷里那些**折叠掉的段**也进这一份账，所以这个夹具落的不再是「遭遇」那一件——
// 照着摆出来的两颗按钮对，比拿表里某一条去猜准。
const mBefore = mhost.all('gf-choice-pick').map((e) => (e.all('gf-choice-name')[0] || {}).textContent)
mhost.all('gf-choice-live')[0].all('gf-choice-pick')[0].dispatch('click')
await tick()
const tookAfter = mhost.all('gf-choice-took').map((e) => e.textContent)
const leftAfter = mhost.all('gf-choice-left').map((e) => e.textContent)
check('选项：挑过的那一卷换成你挑的那条亮着、另一条暗着，选项没了',
  mhost.all('gf-choice-live').length === 0 && mhost.all('gf-choice-pick').length === 0
  && mhost.all('gf-choice-done').length === 1
  && mhost.all('gf-choice-took').length === 1 && mhost.all('gf-choice-left').length === 1
  && mBefore.length === 2 && tookAfter[0] === mBefore[0] && leftAfter[0] === mBefore[1]
  && mhost.all('gf-fork-line').length >= 4,
  `${mhost.all('gf-choice-done').length} 段走完的 / 亮着的：${tookAfter.join('/')} / `
  + `${mhost.all('gf-fork-line').length} 句命运`)
check('选项：自己挑的那一档写「你定下的：XX」（2026-10-10 按用户 m14810 第 5 条改口）',
  mhost.all('gf-choice-said').length === 1
  && mhost.all('gf-choice-said')[0].textContent === `你定下的：${tookAfter[0]}`,
  `${mhost.all('gf-choice-said').map((e) => e.textContent).join(' / ') || '一个字都没写'}`)
check('门上那枚记号：都挑完就灭了',
  mBadge().hidden === true && !mDoor().classList.contains('gf-door-has-choice')
  && mDoor().getAttribute('title') === '推开门看看',
  `${mBadge().hidden ? '灭了' : '还亮着'} / ${mDoor().getAttribute('title')}`)
// 用户 m12444 第 3 条：「在这里的选项是红色的，常驻按钮按了之后也是红色的，这是不对的，
// 不符合我们颜色梯度的，可以换位感叹号一样的金色。」——三处红（选项那枚空心菱、悬停那道边、
// 常驻按钮按下去）都换成门上那枚惊叹号用的同一支金（--gf-door-knob）。
check('选项与常驻按钮：那两处红色换成跟门上那枚同一支金（\u201c状态是亮起来，不是变成另一个颜色\u201d）',
  /\.gf-choice-pick::before \{[^}]*color:\s*var\(--gf-door-knob/.test(mStyle)
  && /\.gf-choice-pick:hover \{[^}]*border-color:\s*var\(--gf-door-knob/.test(mStyle)
  && /\.gf-always\[aria-pressed='true'\] \{[^}]*color:\s*var\(--gf-door-knob/.test(mStyle)
  && /\.gf-always\[aria-pressed='true'\] \{[^}]*border-color:\s*var\(--gf-door-knob/.test(mStyle)
  && !/\.gf-choice-pick::before \{[^}]*--gf-seal/.test(mStyle),
  '空心菱 / 悬停那道边 / 常驻按钮按下去：三处都是 --gf-door-knob')

// 没定下来就**停在那儿**（用户 m14810 第 5 条：「如果用户不选，后面的故事就不会继续发生，
// 界面就停在这个地方等用户来选择」）。
//
// 2026-10-10 之前这一档验的是反过来的事：最新那一格落定之后（停了十分钟）哪儿都不再摆选项，
// 那一卷写成「他没做抉择，他自己走了一条」——**那正是这一版作废的行为**（用户 m11863 第 2 条
// 那条「否则就自动选择其中一条进行描述了」也一并作废）。
//
// 现在：今天摆**两格**（16:25 与 16:30，`NOW = 16:40`，两格都已落定），后半夜那一条撞过墙
// ⇒ 这一天的账从头算就够得着命运，所以命运**停在屏幕上最新那一行（16:30）**：
//   · 选项照旧摆着（不再随五分钟过去消失），抬头是「命运」，下面多一句「往下的事，等你定了再讲。」；
//   · 比它晚的什么都不写（整条见闻录：日卷 ＋ 16:30 ＋ 16:25，三行）；
//   · 门上那枚记号一直亮着（它现在挡着往下讲，不是「五分钟之内可以挑一挑」）。
//
// 「停在哪一格」的规矩（用户 m17334，2026-10-11；用户 m18547，2026-10-18 改）：
// **哪一件**按当下这一份账判（`forkDayFacts` 的整天账），**哪一刻**＝第一次看见它时屏幕上
// 最新那一行（`pendingPin` 钉住，`rows[rows.length - 1].at`）——从前那个「从早往前累、
// 第一次让它成立的那一段」会让停点落在几十钟头以前（用户 m18547 第 1 条）。
const STALE_DAYS = [
  MISS_DAYS[0],
  {
    // 一张卡铺**两格**：16:25 与 16:30（都落在 NOW 之前）。
    id: 'miss-late', startedAt: at(0, 16, 25), endedAt: at(0, 16, 30), minutes: 10,
    tags: ['改文件'], counts: { 改文件: 2 }, fails: 0,
    ticks: [foldTick(0, 16, 25, 1), foldTick(0, 16, 30, 1)],
  },
]
const staleStore = freshStore()
const staleGf = createGameflow({ loadRecords: () => STALE_DAYS, now: () => NOW, storage: staleStore })
staleGf.mount()
staleGf.open()
await tick()
const shost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const sWhens = shost.all('gf-when').map((e) => e.textContent).join(' ')
check('命运：没定下来就一直摆着，而且停在**屏幕上最新那一行**（当下），比它晚的什么都不写',
  shost.all('gf-choice-live').length === 1 && shost.all('gf-choice-pick').length === 2
  && shost.all('gf-row').length === 3
  && String(shost.all('gf-row')[0].textContent).includes('16:30')
  && shost.all('gf-choice-done').length === 0 && shost.all('gf-fork-line').length === 0,
  `${shost.all('gf-choice-live').length} 处选项 / ${shost.all('gf-choice-pick').length} 颗 / `
  + `${shost.all('gf-row').length} 行（${sWhens.trim()}）/ `
  + `路[${shost.all('gf-choice-pick').map((e) => e.textContent).join('|')}] / `
  + `${shost.all('gf-choice-done').length} 段走完的`)
check('命运：停在哪儿说得明白（按钮下面压一句「往下的事，等你定了再讲。」）',
  shost.all('gf-wait').length === 1
  && shost.all('gf-wait')[0].textContent === '往下的事，等你定了再讲。',
  shost.all('gf-wait').map((e) => e.textContent).join(' / ') || '一个字都没写')
check('命运：它挡着往下讲，所以门上那枚记号一直亮着（不是「五分钟之内挑一挑」）',
  shost.all('gf-door-badge')[0].hidden === false
  && String(shost.all('gf-door')[0].getAttribute('title') || '').includes('命运'),
  `记号${shost.all('gf-door-badge')[0].hidden ? '灭' : '亮'} / `
  + `${shost.all('gf-door')[0].getAttribute('title')}`)
staleGf.destroy()

// 2026-10-10 修的一个真 bug：命运**起头的那一格算不出来**时（今天最后一段已经收了半小时以上，
// 整块面板只剩一卷、一格都没有），`forkCellOf` 返回 `null`——那时必须停在**这一卷自己那一行**。
// 从前那里留的是 `null`，而 `Number(null)` 是 `0`、`Number.isFinite(0)` 为真 ⇒ `stopAt = 0`
// ⇒ `units.filter((u) => Number(u.at) <= 0)` 把整条梯子全滤掉，屏幕上**一行都没有**。
const ROLLFORK_DAYS = [
  {
    id: 'rollfork-1', startedAt: at(0, 0, 30), endedAt: at(0, 1, 10), minutes: 40,
    tags: ['改文件'], counts: { 改文件: 14 }, fails: 4,
  },
]
const rollforkGf = createGameflow({
  loadRecords: () => ROLLFORK_DAYS, now: () => NOW, storage: freshStore(),
})
rollforkGf.mount()
rollforkGf.open()
await tick()
const rfhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('命运：算不出起头那一格时（今天只剩一卷）也不许把整条见闻录滤空',
  rfhost.all('gf-row').length >= 1 && rfhost.all('gf-choice-live').length === 1
  && rfhost.all('gf-choice-pick').length === 2 && rfhost.all('gf-wait').length === 1,
  `${rfhost.all('gf-row').length} 行 / ${rfhost.all('gf-choice-live').length} 处选项 / `
  + `${rfhost.all('gf-choice-pick').length} 颗 / ${rfhost.all('gf-wait').length} 句停住的说明`)
rollforkGf.destroy()

// 昨天那条夜袭**根本不进见闻录**（用户 m00789：除了今天之外全部去掉），所以今天这一格
// 不管落没落定都不会摆选项：那一卷连人带事都没上屏幕，没有「昨天的岔口」可等。
// （原来这条验的是「最新那一卷是昨天那一卷时不摆选项」——那道闸现在在 `renderTimeline`
//  的今天过滤上，比 `momentsFor` 的 `todayFrom` 更靠前，所以连卷都不会成形。）
const YESTERDAY_DAYS = [
  {
    id: 'ytd-1', startedAt: at(1, 22, 30), endedAt: at(1, 23, 30), minutes: 60,
    tags: ['改文件'], counts: { 改文件: 14 }, fails: 4,
  },
  {
    // 今天只有**一格**（起点终点同一格），所以整张表只有那一行——昨天那一条被裁掉了。
    id: 'ytd-cell', startedAt: at(0, 16, 40), endedAt: at(0, 16, 40), minutes: 5,
    tags: ['改文件'], counts: { 改文件: 1 }, fails: 0,
    ticks: [foldTick(0, 16, 40, 1)],
  },
]
const ytdStore = freshStore()
const ytdGf = createGameflow({ loadRecords: () => YESTERDAY_DAYS, now: () => NOW, storage: ytdStore })
ytdGf.mount()
ytdGf.open()
await tick()
const yhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('选项：昨天那一条根本不进见闻录，所以没有「昨天的岔口」可等',
  yhost.all('gf-row').length === 1 && yhost.all('gf-choice').length === 0
  && yhost.all('gf-choice-pick').length === 0
  && yhost.all('gf-choice-done').length === 0 && yhost.all('gf-choice-said').length === 0
  && yhost.all('gf-door-badge')[0].hidden === true,
  `${yhost.all('gf-row').length} 行 / ${yhost.all('gf-choice').length} 处选项 / `
  + `${yhost.all('gf-choice-done').length} 段走完的 / `
  + `${yhost.all('gf-choice-said').map((e) => e.textContent).join('/') || '一个字都没写'} / `
  + `记号${yhost.all('gf-door-badge')[0].hidden ? '灭' : '亮'}`)
ytdGf.destroy()

// 面板记不住（预览页、自检里 `storage: null`）：不摆选项，也不亮记号。
const noPickGf = createGameflow({ loadRecords: () => MISS_DAYS, now: () => NOW, storage: null })
noPickGf.mount()
noPickGf.open()
await tick()
const noPickHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('门上那枚记号：面板记不住的时候不亮（摆了也挑不成，亮着就是骗人）',
  noPickHost.all('gf-door-badge')[0].hidden === true && noPickHost.all('gf-choice-pick').length === 0
  && noPickHost.all('gf-choice-done').length === 1 && noPickHost.all('gf-choice-said').length === 1
  && noPickHost.all('gf-choice-said')[0].textContent === '这条是他自己走的'
  && noPickHost.all('gf-wait').length === 0,
  `${noPickHost.all('gf-choice-pick').length} 颗 / ${noPickHost.all('gf-choice-done').length} 段走完的 / `
  + `${noPickHost.all('gf-choice-said').map((e) => e.textContent).join('/') || '一个字都没写'}`)
const noPickFocused = FOCUSES[FOCUSES.length - 1]
check('选项：面板记不住的时候，焦点落在面板本身（没有选项可落）',
  !!noPickFocused && noPickFocused.classList.contains('gf-room'),
  `最后落在${noPickFocused ? (noPickFocused.classList.contains('gf-room') ? '面板上' : '别处') : '没有'}`)
noPickGf.destroy()

// 常驻按钮（用户 m11003 第 3 条；用户 m19425 第 1 条把它从门边挪到地图右上角，并改成图钉）。
const pin = mhost.all('gf-always')[0]
const pinStage = mhost.all('gf-stage')[0]
check('常驻按钮：地图右上角有一枚「始终显示」（默认没钉住，而且是图钉不是字）',
  !!pin && !!pinStage && pinStage.contains(pin) && pin.getAttribute('aria-pressed') === 'false'
  && pin.textContent === '' && pin.allTag('svg').length === 1
  && pin.all('gf-pin-outline').length === 1 && pin.all('gf-pin-filled').length === 1
  && pin.getAttribute('aria-label') === '始终显示',
  `${pin ? '有' : '没有'} / 在 stage 里=${!!pinStage && pinStage.contains(pin)} / `
  + `aria-pressed=${pin && pin.getAttribute('aria-pressed')} / 字=${JSON.stringify(pin && pin.textContent)}`)
pin.dispatch('click')
await tick()
const pinKey = [...missStore.box.keys()].find((k) => k.includes('pinned')) || ''
check('常驻按钮：点一下钉住了，写进本地（下次打开还记着）',
  pin.getAttribute('aria-pressed') === 'true' && pinKey !== '' && missStore.getItem(pinKey) === '1',
  `aria-pressed=${pin.getAttribute('aria-pressed')} / ${pinKey}=${pinKey ? missStore.getItem(pinKey) : '没写'}`)
mDoor().dispatch('pointerleave', { pointerType: 'mouse' })
await new Promise((r) => setTimeout(r, 1200))
check('常驻按钮：钉住了，鼠标移开也不收（门后的事一直浮现）',
  mRoom().classList.contains('gf-open'), mRoom().classList.contains('gf-open') ? '还开着' : '收掉了')
document.dispatch('pointerdown', { composedPath: () => [] })
await tick()
check('常驻按钮：钉住了，点到外面也不收',
  mRoom().classList.contains('gf-open'), mRoom().classList.contains('gf-open') ? '还开着' : '收掉了')
pin.dispatch('click')
await tick()
document.dispatch('pointerdown', { composedPath: () => [] })
await tick()
check('常驻按钮：放开之后回到老规矩（点到外面就收）',
  pin.getAttribute('aria-pressed') === 'false' && !mRoom().classList.contains('gf-open'),
  `aria-pressed=${pin.getAttribute('aria-pressed')} / ${mRoom().classList.contains('gf-open') ? '还开着' : '收了'}`)
missGf.destroy()

// 上次钉住了：这次挂上就自己开着，不用再点一次。
const pinStore2 = freshStore()
if (pinKey) pinStore2.setItem(pinKey, '1')
const pinGf2 = createGameflow({ loadRecords: () => MISS_DAYS, now: () => NOW, storage: pinStore2 })
pinGf2.mount()
await tick()
const pinHost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('常驻按钮：上次钉住了，这次挂上就自己开着',
  pinHost2.all('gf-room')[0].classList.contains('gf-open')
  && pinHost2.all('gf-always')[0].getAttribute('aria-pressed') === 'true',
  `${pinHost2.all('gf-room')[0].classList.contains('gf-open') ? '开着' : '收着'} / `
  + `aria-pressed=${pinHost2.all('gf-always')[0].getAttribute('aria-pressed')}`)
pinGf2.destroy()

/* ------------------------------------------------------------------ *
 * 门上那枚提醒记号：一枚**能点**的惊叹号（2026-10-08 更晚，用户 m11602）
 *
 * 他的原话是「现在门上是有个标记，但是这个标记没有作用」，两条要求：
 *   ① 只有真需要他挑的时候才出现；② 换一个更像事件提醒的符号（原来那枚小金菱不够游戏性）。
 * 所以这一节验四件事：形状（能按的惊叹号，不是一块纯色）、只在有得挑时亮、
 * 点一下就推开面板并落到那一行（那一行亮一下）、那一行在眼前时记号压暗一档。
 * ------------------------------------------------------------------ */
// 用一只干净的存储：上面那一节已经把 `missStore` 里那三处挑完了，同一只存储再看就是「挑过了」。
const badgeStore = freshStore()
const badgeGf = createGameflow({ loadRecords: () => MISS_DAYS, now: () => NOW, storage: badgeStore })
badgeGf.mount()
badgeGf.open()
await tick()
const bhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const bStyle = String((bhost.allTag('STYLE')[0] || {}).textContent || '')
const bBadge = () => bhost.all('gf-door-badge')[0]
const bRoom = () => bhost.all('gf-room')[0]
const bTimeline = () => bhost.all('gf-timeline')[0]
check('门上那枚记号：是一枚能按的惊叹号（原来那块纯色不够像事件提醒）',
  !!bBadge() && bBadge().tagName === 'BUTTON' && bBadge().textContent === ''
  && /\.gf-door-badge \{/.test(bStyle)
  && /\.gf-door-badge::before \{/.test(bStyle) && /\.gf-door-badge::after \{/.test(bStyle)
  && /@keyframes gf-badge-pulse/.test(bStyle)
  && String(bBadge().getAttribute('aria-label') || '').includes('等你定'),
  `${bBadge() && bBadge().tagName} / 字=${JSON.stringify(bBadge() && bBadge().textContent)} / `
  + `aria-label=${bBadge() && bBadge().getAttribute('aria-label')}`)
check('门上那枚记号：有得挑的时候才亮（最新那一卷没挑，亮着）',
  bBadge().hidden === false && bhost.all('gf-choice-pick').length === 2,
  `${bBadge().hidden ? '藏着' : '亮着'} / ${bhost.all('gf-choice-pick').length} 颗选项`)
// 点它：推开面板、滚到那一行、那一行亮一下——记号得**有作用**。
badgeGf.close()
await tick()
SCROLLS.length = 0
bBadge().dispatch('click', { stopPropagation() {} })
await tick()
await tick()
const flashRow = bhost.all('gf-fork-flash')[0]
check('门上那枚记号：点一下就推开面板、滚到那一对选项上、那一行亮一下',
  bRoom().hidden === false && SCROLLS.length === 1 && SCROLLS[0].opts.block === 'center'
  && !!SCROLLS[0].el && SCROLLS[0].el.classList.contains('gf-choice-live')
  && !!flashRow && flashRow.classList.contains('gf-row') && flashRow.all('gf-choice').length >= 1,
  `${bRoom().hidden ? '还收着' : '推开了'} / 滚了 ${SCROLLS.length} 次(${SCROLLS.map((s) => s.opts.block).join(',')}) / `
  + `落的是${SCROLLS[0].el && SCROLLS[0].el.classList.contains('gf-choice-live') ? '那一对选项' : '整行'} / `
  + `${flashRow ? '那一行亮着' : '没有行亮着'}`)
// 那一行就在眼前了：压暗一档（用户选的那条：提醒只在「你还没看见」时最亮）。
const rect = (top, bottom) => ({ top, bottom, left: 0, right: 0, x: 0, y: 0, width: 0, height: 0 })
bTimeline().getBoundingClientRect = () => rect(0, 400)
for (const r of bhost.all('gf-row')) r.getBoundingClientRect = () => rect(900, 1000)
bTimeline().dispatch('scroll')
check('门上那枚记号：那一行还在屏幕外的时候照旧亮着（不压暗）',
  bBadge().classList.contains('gf-badge-seen') === false,
  `压暗=${bBadge().classList.contains('gf-badge-seen')}`)
// 压暗看的是**那一对选项**在不在眼前（`refreshBadgeSeen` 量的是 `openForkEl || openRowEl`），
// 所以这一节把选项本身摆进视野里，不是把整行摆进去。
const bOpenRow = bhost.all('gf-row').find((r) => r.all('gf-choice').length > 0)
const bOpenFork = bOpenRow ? bOpenRow.all('gf-choice-live')[0] : null
if (bOpenFork) bOpenFork.getBoundingClientRect = () => rect(120, 220)
bTimeline().dispatch('scroll')
check('门上那枚记号：那一对选项就在眼前了，记号压暗一档、脉动也停',
  !!bOpenFork && bBadge().classList.contains('gf-badge-seen') === true
  && /\.gf-door-badge\.gf-badge-seen \{[^}]*opacity/.test(bStyle),
  `压暗=${bBadge().classList.contains('gf-badge-seen')}`)
// 2026-10-09（用户 m01403 第 1 条「滚动文案内容依然卡顿」）：滚动期间把地图上那三处
// 永不停的动画**按停**——滚的是下面那半页字，旁边那张 5817 个形状的地图跟着重画没有意义。
// 手停下来 180ms 之后类自己摘掉、动画接着走（那一段是 setTimeout，这里只看挂上没挂上）。
check('滚动的时候地图那三处动画按停（滚完自己接着走）',
  bRoom().classList.contains('gf-scrolling')
  && /\.gf-room\.gf-scrolling \.gf-stage \.gf-pin-bob[\s\S]*?animation-play-state:\s*paused/.test(bStyle),
  `类=${bRoom().classList.contains('gf-scrolling')}`)
// 2026-10-10（用户 m23060 / m23080 甲）：按住拖地图的时候同样按停那三处——
// 拖动那两秒在满负荷重画世界图那一层，不能再叠上记号自己的动画。手一松就接着走。
check('拖地图的时候那三处动画也按停（手一松接着走）',
  (() => {
    const s = buildStage()
    // 先点进细节版（全图里点一下就是进去），再按住拖一下。
    s.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU, pointerId: 1 })
    const idle0 = s.overlaySvg.getAttribute('class')
    s.svg.dispatch('pointerdown', { clientX: 200, clientY: 120, pointerId: 1 })
    s.svg.dispatch('pointermove', { clientX: 240, clientY: 150, pointerId: 1 })
    const drag = s.overlaySvg.getAttribute('class')
    s.svg.dispatch('pointerup', { clientX: 240, clientY: 150, pointerId: 1 })
    const up = s.overlaySvg.getAttribute('class')
    return /\.gf-overlay-svg\.gf-zooming \.gf-pin-bob[\s\S]*?animation-play-state:\s*paused/.test(bStyle)
      && idle0 === 'gf-overlay-svg' && drag === 'gf-overlay-svg gf-zooming' && up === 'gf-overlay-svg'
  })(),
  (() => {
    const s = buildStage()
    s.svg.dispatch('pointerdown', { clientX: 33 * PXU, clientY: 17 * PXU, pointerId: 1 })
    s.svg.dispatch('pointerdown', { clientX: 200, clientY: 120, pointerId: 1 })
    s.svg.dispatch('pointermove', { clientX: 240, clientY: 150, pointerId: 1 })
    const drag = s.overlaySvg.getAttribute('class')
    s.svg.dispatch('pointerup', { clientX: 240, clientY: 150, pointerId: 1 })
    return `拖动中 ${drag} → 松手 ${s.overlaySvg.getAttribute('class')}`
  })())
// 用户 m12444 第 4 条：「现在门上感叹号，也不够明显，感觉暗淡下去了，是需要增亮的，因为是提醒
// 用户有选项。」——整枚放大两号（15 → 24）、静态那圈晕 6 → 9px、脉动 5↔11 → 7↔16，
// **看见过那一档也从 0.36 提到 0.68**（压暗是「你已经看见了」，不是「它本来就该暗」）。
check('门上那枚记号：够明显（放大两号、晕加宽、看见过那一档也提亮）',
  /\.gf-door-badge \{[^}]*width:\s*24px/.test(bStyle)
  && /\.gf-door-badge \{[^}]*box-shadow:\s*0 0 9px/.test(bStyle)
  && /@keyframes gf-badge-pulse [\s\S]*?50% \{ box-shadow:\s*0 0 16px/.test(bStyle)
  && /\.gf-door-badge\.gf-badge-seen \{[^}]*opacity:\s*0\.68/.test(bStyle),
  '24px / 9px 晕 / 脉动到 16px / 看见过 0.68')

// 用户 m12690 那份清单里属于**面板与门**的另外三条真缺陷：
//   ① 门自己是按钮，里面还套着一枚按钮——现在门与记号是**兄弟**（外面一层只做定位的壳）；
//   ② 那枚记号自己也吃事件、也吃键盘（`pointer-events: auto` + `:focus-visible`），
//      地图右上角那枚图钉同样补上 `:focus-visible`；
//   ③ 面板是对话窗：`tabindex="-1"` 让程序能收住焦点（见上面焦点那一条）。
check('门那一角：记号是门的兄弟（按钮里不再套按钮），它自己也吃事件、也吃键盘',
  bhost.all('gf-door-wrap').length === 1
  && bhost.all('gf-door-wrap')[0].all('gf-door').length === 1
  && bhost.all('gf-door-wrap')[0].all('gf-door-badge').length === 1
  && bhost.all('gf-door')[0].all('gf-door-badge').length === 0
  && /\.gf-door-badge \{[^}]*pointer-events:\s*auto/.test(bStyle)
  && /\.gf-door-badge:focus-visible \{/.test(bStyle)
  && /\.gf-always:focus-visible \{/.test(bStyle)
  && bRoom().getAttribute('tabindex') === '-1',
  `${bhost.all('gf-door-wrap').length} 层壳 / 门里套着 ${bhost.all('gf-door')[0].all('gf-door-badge').length} 枚记号`)
badgeGf.destroy()

// 面板记不住（预览页、自检里 storage: null）：**连收起来走钟那一支也一个都不亮**——
// 那时候面板里根本不摆选项，门上亮着就是骗人（用户 m11602 第 1 条「只在需要交互时出现」）。
let nullReads = 0
let nullNow = NOW
const nullGf = createGameflow({
  loadRecords: () => { nullReads += 1; return MISS_DAYS },
  now: () => nullNow,
  clockTickMs: 20,
  storage: null,
})
nullGf.mount()
nullGf.open()
await new Promise((r) => setTimeout(r, 80))
const nullHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
nullGf.close()
await new Promise((r) => setTimeout(r, 400))
const nullReadsBefore = nullReads
nullNow = NOW + 20 * 60 * 1000
await new Promise((r) => setTimeout(r, 80))
check('门上那枚记号：面板记不住的时候，收起来走钟那一支也一个都不亮（亮了就是骗人）',
  nullReads > nullReadsBefore && nullHost.all('gf-door-badge')[0].hidden === true
  && nullHost.all('gf-choice-pick').length === 0,
  `${nullReadsBefore} → ${nullReads} 次读记录 / `
  + `${nullHost.all('gf-door-badge')[0].hidden ? '藏着' : '亮着'}`)
nullGf.destroy()

/* ------------------------------------------------------------------ *
 * 一天的框：一天要有头有尾（2026-10-08，用户 m07599 第 2 条与 C1）
 *
 * 用户的原话是「角色时间要和用户的时间对得上，比如早上、中午、晚上都得吃饭，但有可能
 * 因为什么事而耽误」。这句话落在两处：
 *   ① 日卷那一行**上面**一句定场（这一天怎么起头）、**下面**一句收尾（怎么收）；
 *   ② 那顿饭归生活层那一格（蓝框），让活耽误了就说明白是哪一顿被耽误的。
 * 四条边界：只有日卷那一档有；今天还没过完的那半截卷不说收尾；一顿饭一格只说一次；
 * 同一份记录看两眼一个字都不变。
 * ------------------------------------------------------------------ */

// 四天：早饭拖到九点才吃、晚饭吃到过了点、午饭吃得正点、今天后半夜那一段（还没过完）。
// 只讲今天（用户 2026-10-09）之后，日卷只剩今天这一卷了：
// 原来那四张跨天的卡一条都进不了版面。留今天一张卡——它落在最近半小时以外
// （`NOW` 是 16:40，界是 16:10），所以收成今天那一卷，定场句照挂。
// 顺带把吃饭那一格钉在同一张卡上：正点午饭，报的是平常那一版。
const C1_DAYS = [
  { id: 'c1-lunch', startedAt: at(0, 12, 0), endedAt: at(0, 13, 0), minutes: 60, tags: ['查资料'], counts: { 查资料: 4 } },
]

const c1gf = createGameflow({ loadRecords: () => C1_DAYS, now: () => NOW })
c1gf.mount()
c1gf.open()
await tick()
const c1host = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const c1Days = c1host.all('gf-row-day')
// 行是从新往旧画的：只讲今天之后，这里就只剩今天那半截卷一行。
const c1Opens = c1Days.map((r) => r.all('gf-day-open').map((e) => e.textContent))
const c1Closes = c1Days.map((r) => r.all('gf-day-close').map((e) => e.textContent))
const c1Life = c1Days.map((r) => r.all('gf-life').map((e) => e.textContent).join(''))

check('一天的框：今天那一卷也是一行日卷（更早那几天一条都不出现）',
  c1Days.length === 1 && c1host.all('gf-row').length === 1, `${c1Days.length} 行日卷 / 全表 ${c1host.all('gf-row').length} 行`)
// 今天这一卷永远是 `partial: true`（见 foldLadder 里 `put('day', today, true, …)`），
// 所以**收尾句从此一次都不会出现**——收尾说的是「这一天怎么收」，而这一天还没过完。
// 收尾那一档（`gf-day-close`）与包里那几条收尾句因此成了走不到的代码：机器留着
// （装回折叠梯子时从 `.backup/2026-10-08-210603/` 取回），断言如实退休。
check('一天的框：日卷那一行上面有定场句；今天还没过完，所以没有收尾句',
  c1Opens.length === 1 && c1Opens[0].length === 1 && c1Opens[0][0].trim().endsWith('。')
  && c1host.all('gf-day-close').length === 0,
  `定场 ${c1Opens.map((x) => x.length).join('/')} · 收尾 ${c1host.all('gf-day-close').length} 句`)
check('一天的框：今天那半截卷还没过完，所以不说收尾句',
  c1Closes[0].length === 0 && c1Opens[0].length === 1,
  c1Closes[0][0] || `今天有定场句、没有收尾句（共 ${c1host.all('gf-day-close').length} 句收尾）`)
check('一天的框：只有日卷那一档有（格子与周卷都没有）',
  c1host.all('gf-day-open').length === c1Days.length
  && c1host.all('gf-day-close').length === 0
  && c1host.all('gf-row-week').every((r) => r.all('gf-day-open').length === 0),
  `${c1host.all('gf-day-open').length} 句定场 / 全表 ${c1host.all('gf-row').length} 行`)
check('一天的框：一个阿拉伯数字都没有',
  [...c1Opens.flat(), ...c1Closes.flat()].every((t) => !/[0-9]/.test(t)),
  [...c1Opens.flat(), ...c1Closes.flat()].find((t) => /[0-9]/.test(t)) || `${c1Opens.flat().length + c1Closes.flat().length} 句都干净`)

// 同一份记录看两眼，定场与收尾必须一模一样（种子只吃记录本身，跟「哪一天看」无关）。
const c1gf2 = createGameflow({ loadRecords: () => C1_DAYS, now: () => NOW })
c1gf2.mount()
c1gf2.open()
await tick()
const c1host2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const c1Again = c1host2.all('gf-row-day').map((r) => [
  ...r.all('gf-day-open').map((e) => e.textContent),
  ...r.all('gf-day-close').map((e) => e.textContent),
].join('|')).join('\n')
const c1First = c1Days.map((r, i) => [...c1Opens[i], ...c1Closes[i]].join('|')).join('\n')
check('一天的框：同一份记录看两眼，一个字都不变',
  c1Opens.flat().length > 0 && c1First === c1Again,
  c1First === c1Again ? c1Again.split('\n')[0] : `第一眼：${c1First} ／ 第二眼：${c1Again}`)

// 引擎那一层：起头按第一格、收尾按最后一格、跨午夜不按天亮那一档、半截卷不给收尾。
const { adventure: PACK_ADVENTURE } = await import('../src/packs/adventure/index.js')
const PACK_DAY_FRAME = PACK_ADVENTURE.dayFrame
const inPool = (pool, text) => (pool || []).includes(text)
const c1Frame = (startedAt, endedAt, partial) => dayFrameOf({ id: 'probe', startedAt, endedAt }, partial)
const c1Evening = c1Frame(at(2, 19, 30), at(2, 21, 0))
const c1Cross = c1Frame(at(2, 22, 30), at(1, 1, 10))
check('一天的框：面板装上的就是包里那一份（连先后次序都一样）',
  JSON.stringify(DAY_FRAME) === JSON.stringify(PACK_DAY_FRAME),
  Object.keys(DAY_FRAME.open || {}).join(',') || '(包里没有这一组)')
check('一天的框：傍晚开工那一段，起头说傍晚、收尾说傍晚（还没到夜里）',
  inPool(PACK_DAY_FRAME.open.evening, c1Evening.open) && inPool(PACK_DAY_FRAME.close.evening, c1Evening.close),
  `${c1Evening.open} ／ ${c1Evening.close}`)
check('一天的框：夜里开工、过了零点才收，收尾说的是夜里（不是天亮那一档）',
  inPool(PACK_DAY_FRAME.open.night, c1Cross.open) && inPool(PACK_DAY_FRAME.close.night, c1Cross.close),
  `${c1Cross.open} ／ ${c1Cross.close}`)
check('一天的框：今天那半截卷，收尾那一句是空的',
  c1Frame(at(0, 1, 0), at(0, 2, 0), true).close === ''
  && inPool(PACK_DAY_FRAME.open.dawn, c1Frame(at(0, 1, 0), at(0, 2, 0), true).open),
  c1Frame(at(0, 1, 0), at(0, 2, 0), true).close || '(空的)')

// 那顿饭：窗口来自真实钟点；让活耽误了就报被耽误的那一顿；一顿饭一格只说一次。
const mealCase = (startedAt, endedAt, minutes) => mealOf({ id: 'meal', startedAt, endedAt, minutes })
check('吃饭：早上九点才坐下吃的那一顿，说的是「拖到过了点」那一版',
  mealCase(at(2, 9, 0), at(2, 11, 0), 120)?.key === 'breakfast'
  && mealCase(at(2, 9, 0), at(2, 11, 0), 120)?.late === true,
  JSON.stringify(mealCase(at(2, 9, 0), at(2, 11, 0), 120)))
check('吃饭：晚饭吃到过了点，报的是晚饭（不是中饭）',
  mealCase(at(3, 19, 30), at(3, 21, 0), 90)?.key === 'supper'
  && mealCase(at(3, 19, 30), at(3, 21, 0), 90)?.late === true,
  JSON.stringify(mealCase(at(3, 19, 30), at(3, 21, 0), 90)))
check('吃饭：正点吃的那一顿，说的是平常那一版',
  mealCase(at(4, 12, 0), at(4, 13, 0), 60)?.key === 'lunch'
  && mealCase(at(4, 12, 0), at(4, 13, 0), 60)?.late === false,
  JSON.stringify(mealCase(at(4, 12, 0), at(4, 13, 0), 60)))
check('吃饭：后半夜那一段盖不住任何饭点，就什么都不说',
  mealCase(at(0, 1, 0), at(0, 2, 0), 60) === null,
  JSON.stringify(mealCase(at(0, 1, 0), at(0, 2, 0), 60)))
check('吃饭：上一格也在这顿饭的窗口里，这一格就不说了（一顿饭只说一次）',
  mealCase(at(3, 12, 30), at(3, 13, 30), 60) !== null
  && mealOf(
    { id: 'meal-2', startedAt: at(3, 12, 30), endedAt: at(3, 13, 30), minutes: 60 },
    { id: 'meal-1', startedAt: at(3, 11, 30), endedAt: at(3, 12, 30), minutes: 60 },
  ) === null,
  '连着两格都在午饭窗口里，后一格安静着')
// 只讲今天之后，一天只剩一卷，所以「三顿饭都落在蓝框里」没法在一份记录里同时验了
// （早餐、晚饭那两版改由上面那几条引擎层的断言钉着，它们与「今天」无关）。
// 这里钉的是**蓝框本身**：那一顿真落在生活层那一格，而不是活计那一栏。
check('吃饭：那顿饭真落在蓝框里（生活层那一格，不是活计那一栏）',
  c1Life.some((t) => inPool(PACK_DAY_FRAME.meal.lunch, t)),
  c1Life.filter(Boolean).join(' ／ ') || '(一条生活层都没有)')

/* ------------------------------------------------------------------ *
 * 战斗：挨打那一行铺成一场有头有尾的仗（2026-10-10，用户 m14888「他必须有战斗」）
 *
 * 用户的抱怨这次是「极度缺少战斗，我真的两眼一黑。他必须有战斗」。查下来战斗并不稀
 * （真存档里 109 个「记录×动作」对中有 58 个落的是挨打那一档），稀的是**形状**：
 * 一行只有一句，每个场景只有两条真打句，折叠之后日卷那行只剩一句概括。
 * 所以这一层换掉了 2026-10-08 那道两拍的交锋（`clashOf`，现在只当备用）：
 *   · 五种对手（顺序即优先级，最后一支不带条件的是兜底「劫道的」）；
 *   · 三档：大（撞墙六次以上，七拍）/ 中（两次以上，五拍）/ 小（兜底，三拍）；
 *   · 一场四到七拍：遭遇 → 应对 → 交手（一到三手）→ 失算（只有大档）→ 收场；
 *   · 日卷末尾一句战报（这一天打了几场、身上添了什么）。
 * 边界四条：
 *   ① 只有落 `hurt` 那一档的行才有（挨打永远只来自真实的撞墙次数）；
 *   ② 梯子上那五分钟一格不挂（那是刻度，不是一天的讲法）；
 *   ③ 同一份记录看两眼，这一场仗一字不变；
 *   ④ 一天最多三场（`MAX_FIGHTS_PER_DAY`，见下面那条）。
 * ------------------------------------------------------------------ */

// 这一节自己钉一个基准日：日卷的 id 是 `day:<那天零点>`，拿「今天」算散列会天天变，
// 夹具今天绿、明天就红。钉死 2026-10-08 16:40（本地）之后，下面这几天的 roll 永远一样
// （算法与读数见 `.tmp-acp/probe-clash-days.mjs`，那一份可以随时重跑复核）。
const CLASH_BASE = new Date(2026, 9, 8, 16, 40, 0, 0).getTime()
const clashAt = (days, h, m = 0) => {
  const d = new Date(CLASH_BASE)
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
// 只讲今天（用户 2026-10-09）之后，跨天那五张卡一条都进不了版面——只有今天那一卷
// 会被画出来，而今天最多只收成一卷。所以这里改成**今天一张卡**：
// 09:00–11:00 坐满两小时、撞墙两次 ⇒ danger 46（`base 12` + `fails 2→18` +
// `minutes 120→8` + 人在外面→8；钟点 9 点不加，钟点项只在 20–24/0–8 与 23–5 上加）。
// 卷的散列种子吃的是 `day:<那天零点>|改文件|2` ⇒ roll 12 < 46 ⇒ 落在挨打那一档。
// 那几个读数是 `.scratch/probe-clash-today.mjs` 逐格算出来的，不是猜的
// （换次数、换动作都会挪落点，改夹具前先跑那个探针）。
const CLASH_DAYS = [
  { id: 'clash-today', startedAt: clashAt(0, 9, 0), endedAt: clashAt(0, 11, 0), minutes: 120, tags: ['改文件'], counts: { 改文件: 2 }, fails: 2 },
]
// 干干净净的那一天：同一段时间、同一个动作，只是**一次墙都没撞**（fails 0 ⇒ danger 28，
// 而 `跑命令|1` 的 roll 是 53 ⇒ 落在 tail 那一档）。它自己一份记录，不与上面那张混。
const CLASH_CLEAN = [
  { id: 'clash-clean', startedAt: clashAt(0, 9, 0), endedAt: clashAt(0, 11, 0), minutes: 120, tags: ['跑命令'], counts: { 跑命令: 1 }, fails: 0 },
]

const clgf = createGameflow({ loadRecords: () => CLASH_DAYS, now: () => CLASH_BASE })
clgf.mount()
clgf.open()
await tick()
const clhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const clDays = clhost.all('gf-row-day')
const clBlocks = clhost.all('gf-fight')
const clLines = clBlocks.flatMap((b) => b.all('gf-fight-line').map((e) => e.textContent))
// 包里那 141 句（五种对手 × 26 ＋ turns 6 ＋ report 5）——面板上出现的每一句都得在里头。
// 战报那一池带 `{n}`，渲染出来已经换成汉字数字，所以比的是**换过之后**的句子：
// 把池子里每一句的 `{n}` 换成 `countWord(1)`（这一节里一天只有一场，见下面那条战报断言）。
const FIGHT_POOL = new Set([
  ...FIGHTS.foes.flatMap((f) => [...f.meet, ...f.way, ...f.trade, ...f.end]),
  ...FIGHTS.turns,
  ...FIGHTS.report.map((t) => t.replace(/\{n\}/g, '一')),
])
// 包里那些挨打句（片段，`{e}` 是次数占位）——拿它反着认「这一行确实是挨打那一档」，
// 比拿一堆字去猜准：把片段变成正则，`{e}` 换成「一段不是句读的东西」。
// 开头的「他」写成可有可无：拼句的时候，开头已经以「他」起头，收尾那一句的「他」
// 会被拿掉（见 `src/client.js` 里 `clause.replace(/^他(?=[^，。])/, '')`），
// 不认这一点就会把「描到第两遍，墙缝里又探出一截枯手……」误判成「这一行没挨打」。
const HURT_RES = Object.values(PACKS.adventure.shards || {})
  .flatMap((s) => (s && s.hurt) || [])
  .map((f) => {
    const body = String(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{e\\\}/g, '[^，。]*')
    return new RegExp(body.replace(/^他/, '他?'))
  })
const hurtish = (t) => HURT_RES.some((re) => re.test(String(t)))
const clFight = clDays.filter((r) => r.all('gf-fight').length)

check('战斗：今天撞得厉害，真打起来了（不是只在纸上写着）',
  clFight.length === 1 && clBlocks.length === 1, `${clDays.length} 行里有 ${clFight.length} 行开了打`)
// 这一天的档位是中档（撞墙两次 ⇒ 五拍）：遭遇一句、应对一句、交手两手、收场一句。
// 大档多一句失算（从共用的 `turns` 里挑）、小档少一句应对与一手交手。
check('战斗：一场是五拍——遭遇、应对、两手交手、收场（中档）',
  clBlocks.length === 1 && clBlocks.every((b) => b.all('gf-fight-line').length === 5),
  clBlocks.map((b) => b.all('gf-fight-line').length).join('/') || '(一场都没有)')
check('战斗：抬头写着对手与档位（是标签，不是句子）',
  clBlocks.length === 1 && clBlocks.every((b) => b.all('gf-fight-head').length === 1)
  && clBlocks[0].all('gf-fight-head')[0].textContent.split('·').every((part) => part.trim())
  && clBlocks[0].all('gf-fight-head')[0].textContent.includes('·'),
  clBlocks[0] ? clBlocks[0].all('gf-fight-head').map((e) => e.textContent).join('/') : '(一场都没有)')
check('战斗：它接在他挨打那一句下面，不是替掉那一行',
  clBlocks.length === 1 && clFight.every((r) => r.all('gf-remark').some((e) => hurtish(e.textContent))),
  `${clFight.filter((r) => !r.all('gf-remark').some((e) => hurtish(e.textContent))).length} 行开了打却没挨打句 · `
  + `那一行的主句：${clFight.flatMap((r) => r.all('gf-remark').map((e) => e.textContent)).join(' ／ ') || '(一句都没有)'}`)
check('战斗：算他那边的（在右栏里）',
  clLines.length === 5 && clhost.all('gf-him-col').map((e) => e.textContent).some((t) => t.includes(clLines[0])),
  clLines[0] || '(一句话都没有)')
check('战斗：面板装上的就是包里那一份（一个字都不改）',
  clLines.length === 5 && clLines.every((t) => FIGHT_POOL.has(t)),
  clLines.find((t) => !FIGHT_POOL.has(t)) || `${clLines.length} 句都在包里那 ${FIGHT_POOL.size} 句里头`)
check('战斗：每一句都以句号收尾，且一个阿拉伯数字都没有',
  clLines.length === 5 && clLines.every((t) => t.endsWith('。') && !/[0-9]/.test(t)),
  clLines.find((t) => !t.endsWith('。') || /[0-9]/.test(t)) || `${clLines.length} 句都干净`)
// 日卷末尾那一句战报：折叠把具体的句子吞掉之后，靠它照样看得见「这一天打过」。
// 这一天只打了一场 ⇒ `{n}` 换成「一」；今天那半截卷也有这一句（他今天真打过就得说）。
const clReport = clhost.all('gf-fight-report').map((e) => e.textContent)
check('战斗：日卷末尾报一句战果（这一天打了几场）',
  clReport.length === 1 && clReport[0].includes('一') && clReport[0].endsWith('。') && !/[0-9]/.test(clReport[0]),
  clReport.join(' ／ ') || '(一句都没有)')

// 没撞过墙的那一天不会凭空打起来：另起一份记录（同一段时间、同一个动作，只是没撞墙）。
const cleangf = createGameflow({ loadRecords: () => CLASH_CLEAN, now: () => CLASH_BASE })
cleangf.mount()
cleangf.open()
await tick()
const cleanhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('战斗：没撞过墙的那一天不会凭空打起来',
  cleanhost.all('gf-fight').length === 0
  && cleanhost.all('gf-fight-report').length === 0
  && !cleanhost.all('gf-remark').some((e) => hurtish(e.textContent)),
  `${cleanhost.all('gf-row').length} 行干干净净 · ${cleanhost.all('gf-remark').map((e) => e.textContent).join('')}`)

// 同一份记录看两眼，战斗句必须一模一样（种子只吃记录本身，跟「哪一天看」无关）。
const clgf2 = createGameflow({ loadRecords: () => CLASH_DAYS, now: () => CLASH_BASE })
clgf2.mount()
clgf2.open()
await tick()
const clhost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const clLines2 = clhost2.all('gf-fight').flatMap((b) => b.all('gf-fight-line').map((e) => e.textContent))
check('战斗：同一份记录看两眼，这一场仗一个字都不变',
  clLines.length > 0 && clLines.join('\n') === clLines2.join('\n'),
  clLines.length === clLines2.length ? '句数一样但内容不同' : `${clLines.length} / ${clLines2.length}`)

// 格子那一档：今天照旧一格一格（最近半小时），那五分钟的刻度上不铺战斗。
// 16:20 那一格自己算出来就是挨打那一档（`clash-grid#<16:20>|跑命令|1|outcome` = roll 10，
// 失败九次顶到上限就是 36 点，加底子 12 ⇒ danger 至少 48），所以这一格是真的挨了打——
// 面板照样不给它铺战斗。
const CLASH_TODAY = [{
  id: 'clash-grid', startedAt: clashAt(0, 16, 20), endedAt: clashAt(0, 16, 25), minutes: 5,
  tags: ['跑命令'], counts: { 跑命令: 1 }, fails: 9,
  ticks: [{ at: clashAt(0, 16, 20), actions: 1, counts: { 跑命令: 1 }, files: [], fails: 9, tags: ['跑命令'] }],
}]
const ggf = createGameflow({ loadRecords: () => CLASH_TODAY, now: () => CLASH_BASE })
ggf.mount()
ggf.open()
await tick()
const ghost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const gRemarks = ghost.all('gf-remark').map((e) => e.textContent)
check('战斗：梯子上那五分钟一格不挂（那是刻度，不是一天的讲法）',
  ghost.all('gf-fight').length === 0 && ghost.all('gf-row-day').length === 0,
  `${ghost.all('gf-fight').length} 场战斗 / ${ghost.all('gf-row').length} 行里 ${ghost.all('gf-row-day').length} 行是日卷`)
check('战斗：挨打的那一格照样看得见（不是把这一档整个吞掉了）',
  gRemarks.length >= 1 && gRemarks.some((t) => hurtish(t)),
  gRemarks.join(' ／ ') || '(一格都没有)')

// 五种对手与三档都挑得到：直接问那台机器（`fightOf`），不必绕面板。
// 这一条跟 `scripts/verify-rules.mjs` 里那一大片格子是两回事——那里对的是**逐格一致**，
// 这里对的是「五种对手、三档真的各有各的触发条件」，一眼能看出哪一支是死的。
const foeOf = (facts) => rulesFightOf(facts, FIGHTS, { outdoors: OUT_KEYS })
const foeHit = (facts) => (foeOf(facts) || {}).foe || {}
const tierHit = (facts) => (foeOf(facts) || {}).tier || {}
const FOE_CASES = [
  ['死了的东西', { hours: new Set([23]), scenes: new Set(['tower']) }],
  ['拦他的人', { hours: new Set([14]), minutes: 130, deliverables: ['a.md'] }],
  ['雪狼', { hours: new Set([14]), scenes: new Set(['frost']) }],
  ['荒原上下来的人', { hours: new Set([21]), scenes: new Set(['home']) }],
  ['劫道的', { hours: new Set([14]), scenes: new Set(['home']) }],
]
const foeWrong = FOE_CASES.filter(([label, facts]) => foeHit(facts).label !== label)
check('战斗：五种对手各有各的触发条件（一支都不是死的）',
  foeWrong.length === 0, foeWrong.map(([label, facts]) => `${label}→${foeHit(facts).label || '(挑不出)'}`).join(' · ') || '五支都对得上')
const TIER_CASES = [['大', 7], ['中', 3], ['小', 0]]
const tierWrong = TIER_CASES.filter(([label, fails]) => tierHit({ hours: new Set([14]), fails }).label !== label)
check('战斗：三档按撞墙次数分（撞得越狠打得越大）',
  tierWrong.length === 0, tierWrong.map(([label, fails]) => `${label}→${(tierHit({ hours: new Set([14]), fails }) || {}).label || '(挑不出)'}`).join(' · ') || '三档都对得上')
// 一天最多三场：这条闸在现在的折叠梯子上够不着（一天只收一卷，一卷最多挂一场），
// 所以直接问 `fightsFor`：四行同一天、每行都落挨打那一档 ⇒ 只有前三行挂得上。
// （四行的 `from` 必须是**同一天**，闸数的就是它；键各不相同，才数得出四行。）
const capUnit = (i) => ({
  key: `day:1000#${i}`, roll: true, tier: 'day', from: 1000, at: 1000 + i,
  entry: { id: `cap-${i}`, startedAt: 1000 + i, minutes: 120, fails: 3, counts: { 改文件: 2 } },
})
const capSeq = new Map([[`day:1000#0`, { slot: 'hurt' }], [`day:1000#1`, { slot: 'hurt' }],
  [`day:1000#2`, { slot: 'hurt' }], [`day:1000#3`, { slot: 'hurt' }]])
const capFights = fightsFor([capUnit(0), capUnit(1), capUnit(2), capUnit(3)], capSeq)
check('战斗：一天最多三场（再多就成了打斗集锦，不是一个人的日子）',
  capFights.size === 3, `四行同一天，挂上了 ${capFights.size} 场`)

/* ------------------------------------------------------------------ *
 * 当日计划：那一天他手上那几件事、册子走到第几站、这一季的路通不通
 * （2026-10-10，用户 m14781「我们需要按照一个人的一天来写……他有怎样的规划」）
 *
 * 三条口径：
 *   ① 只看今天——存档只留今天（用户 m01403），所以不许靠「昨天走到第几站」推；
 *      判站的规矩是**从最后一站往前找第一个中的**，走得最远的那一处说了算；
 *   ② 一天不变——计划是那一天的属性，跟这一格正在做什么无关；
 *   ③ 只读——跟「方向」一样是推出来的，同一份记录看两眼一字不变。
 *
 * 摆出来的只有两句（`.gf-plan-line`）与日卷末尾那句少一分（`.gf-loss`）；状态那一整份
 * （`stateAt`）第二期只**算出来**给自检看，**换掉最后一跳**在第三期。
 * ------------------------------------------------------------------ */
const { checkJourney } = await import('../src/packs/rules.js')
const { journey: PACK_JOURNEY } = await import('../src/packs/adventure/journey.js')

// 合成一天：`dayPlanOf(roll, list, seq)` 三样都手写，免得被挑句那台机器牵着走。
// （钟点/地方/景从 `list` + `seq` 取，撞墙次数/时长/交付/帮手从 `roll.entry` 取。）
const planRoll = (at = 1000, over = {}) => ({
  key: `day:${at}`, roll: true, tier: 'day', from: at, at,
  entry: { id: `plan-${at}`, startedAt: at, minutes: 120, counts: { 翻文件: 2 }, fails: 0, ...over },
})
const planUnits = (at = 1000, over = {}) => [{
  key: 'u1', at, grid: true,
  entry: { id: 'u1', startedAt: at, minutes: 60, counts: { 翻文件: 2 }, fails: 0, ...over },
}]
const planPick = (place, sceneKey) => new Map([['u1', { place, sceneKey }]])
const planFor = (place, sceneKey, dayOver = {}) =>
  dayPlanOf(planRoll(1000, dayOver), planUnits(1000), planPick(place, sceneKey))

const planStone = planFor(null, null)
const planTree = planFor('archive', 'scroll')
const planBell = planFor('market', 'ledger')
const planHalf = planFor('scriptorium', 'scroll')
check('当日计划：册子上的路线是十一站，走得最远的那一处说了算',
  PACK_JOURNEY.stations.length === 11
    && planStone.station.id === 'stone' && planTree.station.id === 'tree'
    && planBell.station.id === 'bell' && planHalf.station.id === 'half',
  `${PACK_JOURNEY.stations.length} 站 · 没出门 ${planStone.station.id}(${planStone.index + 1}) · 书库 ${planTree.station.id}(${planTree.index + 1}) · 货栈 ${planBell.station.id}(${planBell.index + 1}) · 书斋 ${planHalf.station.id}(${planHalf.index + 1})`)

check('当日计划：走到哪一站，身上少的那一分就说到哪一段',
  planStone.loss === 'early' && planTree.loss === 'early' && planBell.loss === 'mid' && planHalf.loss === 'late',
  `${planStone.loss}/${planTree.loss}/${planBell.loss}/${planHalf.loss}（三段各 ${['early', 'mid', 'late'].map((k) => PACK_JOURNEY.losses[k].length).join('/')} 句）`)

const planOut = planFor(null, 'frost')
const planPaid = planFor(null, null, { deliverables: ['D:\\x\\a.md'] })
const planHelped = planFor(null, null, { helpers: ['someone'] })
const planBoth = planFor(null, null, { deliverables: ['D:\\x\\a.md'], helpers: ['someone'] })
const planCounts = [planStone, planOut, planPaid, planHelped, planBoth].map((p) => p.count)
check('当日计划：手上两件起，交出去东西或有帮手就多一件，封顶四件',
  planCounts.join(',') === '2,2,3,3,4',
  `两件起 → ${planCounts.join('/')}（封顶四件）`)
check('当日计划：今天有野外的景，或者交出去过东西，就算赶路',
  planStone.kind === 'rest' && planOut.kind === 'travel' && planPaid.kind === 'travel',
  `${planStone.kind} / 野外 ${planOut.kind} / 交了东西 ${planPaid.kind}`)

const seasonAt = (y, m, d) => seasonOf(new Date(y, m - 1, d, 12, 0, 0, 0).getTime())
check('当日计划：一年那条钟按月份分四季（路有季节性，日历算得出来，不用跨天记忆）',
  seasonAt(2026, 1, 15) === 'winter' && seasonAt(2026, 4, 1) === 'spring'
    && seasonAt(2026, 7, 1) === 'summer' && seasonAt(2026, 10, 8) === 'autumn',
  `一月 ${seasonAt(2026, 1, 15)} / 四月 ${seasonAt(2026, 4, 1)} / 七月 ${seasonAt(2026, 7, 1)} / 十月 ${seasonAt(2026, 10, 8)}`)

// 状态：一格上算出来的那一整份（在哪、在做什么、到哪一步、册子第几站、带着什么）。
const stUnit = (over = {}) => ({
  key: 'st-1', at: clashAt(0, 14, 0), grid: true,
  entry: { id: 'st-1', startedAt: clashAt(0, 14, 0), minutes: 60, counts: { 改文件: 3, 翻文件: 1 }, fails: 0, ...over },
})
const stBase = stateAt(stUnit(), planBell, { place: 'market', sceneKey: 'ledger' }, 'loss')
check('状态：在哪、在做什么、那件事到哪一步，都是同一格上算出来的',
  stBase.where === 'market' && stBase.doing === '改文件' && stBase.step === 'half'
    && stBase.station === 7 && stBase.loss === 'mid' && stBase.carry === 'loss' && stBase.road === 'ledger',
  `${stBase.where} · ${stBase.doing} · ${stBase.step} · 第 ${stBase.station} 站 · ${stBase.loss} · ${stBase.road}`)
const stDone = stateAt(stUnit({ deliverables: ['a.md'] }), planBell)
const stBroke = stateAt(stUnit({ fails: 3 }), planBell)
const stStill = stateAt(stUnit({ minutes: 0 }), planBell)
const stIdle = stateAt(stUnit({ counts: {} }), null)
check('状态：交出去了就是做成了，撞过两下就是砸了，没动过就是还没动',
  stDone.step === 'done' && stBroke.step === 'broke' && stStill.step === 'still'
    && stIdle.doing === '歇着' && stIdle.station === 0,
  `${stDone.step}/${stBroke.step}/${stStill.step} · 没活干时 ${stIdle.doing}（站号 ${stIdle.station}）`)

// 一天打几场跟着「赶路／歇脚」走：歇脚的日子只留一场。
const capRest = fightsFor([capUnit(0), capUnit(1), capUnit(2), capUnit(3)], capSeq, new Map([[1000, { kind: 'rest' }]]))
const capTravel = fightsFor([capUnit(0), capUnit(1), capUnit(2), capUnit(3)], capSeq, new Map([[1000, { kind: 'travel' }]]))
check('当日计划：歇脚的日子一天最多一场，赶路才放三场',
  capRest.size === 1 && capTravel.size === 3,
  `歇脚 ${capRest.size} 场 / 赶路 ${capTravel.size} 场`)

// 摆出来的那几句：今天有一条早上的记录（收成日卷）＋ 一条刚过五分钟的（还是格）。
const PLAN_DAYS = [
  {
    id: 'plan-day', startedAt: clashAt(0, 10, 0), endedAt: clashAt(0, 11, 0), minutes: 60,
    tags: ['翻文件'], counts: { 翻文件: 3 }, fails: 0, deliverables: ['D:\\x\\a.md'],
  },
  {
    id: 'plan-cell', startedAt: clashAt(0, 16, 20), endedAt: clashAt(0, 16, 25), minutes: 5,
    tags: ['改文件'], counts: { 改文件: 2 }, fails: 0,
  },
]
const planGf = createGameflow({ loadRecords: () => PLAN_DAYS, now: () => CLASH_BASE })
planGf.mount()
planGf.open()
await tick()
const planHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const planTexts = planHost.all('gf-plan-line').map((e) => e.textContent)
const planRows = planHost.all('gf-row')
const planDayRows = planRows.filter((r) => r.all('gf-plan-line').length > 0)
const planHead = planTexts[0] || ''
const planHit = (PACK_JOURNEY.stations || []).find((s) => planHead.includes(s.label) && planHead.includes(s.seal))
check('当日计划：日卷那一行先说打算（第一句里带着站名与封印名）',
  planTexts.length === 2 && !!planHit && planHead.includes('三') && planHead.endsWith('。'),
  `${planTexts.length} 句 · ${planHead || '（没有）'}`)
check('当日计划：第二句是这一季的路（季节是从日期算出来的）',
  planTexts.length === 2 && (PACK_JOURNEY.plans.season.autumn || []).includes(planTexts[1]),
  planTexts[1] || '（没有）')
const planLoss = planHost.all('gf-loss').map((e) => e.textContent).filter(Boolean)
const allLosses = ['early', 'mid', 'late'].flatMap((k) => PACK_JOURNEY.losses[k] || [])
check('当日计划：日卷末尾那句少一分，来自那一站那一段的池子',
  planLoss.length === 1 && allLosses.includes(planLoss[0]),
  `${planLoss.length} 句 · ${planLoss[0] || '（没有）'}`)
check('当日计划：那两句只长在日卷那一行上，五分钟的格子上一个字都没有',
  planDayRows.length === 1 && planTexts.length === 2,
  `${planTexts.length} 句 / ${planRows.length} 行里 ${planDayRows.length} 行是日卷`)

const planGf2 = createGameflow({ loadRecords: () => PLAN_DAYS, now: () => CLASH_BASE })
planGf2.mount()
planGf2.open()
await tick()
const planHost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const planTexts2 = planHost2.all('gf-plan-line').map((e) => e.textContent)
const planLoss2 = planHost2.all('gf-loss').map((e) => e.textContent)
check('当日计划：同一份记录看两眼，打算与少一分那几句一个字都不变',
  planTexts.length > 0 && planTexts.join('\n') === planTexts2.join('\n') && planLoss.join('\n') === planLoss2.join('\n'),
  planTexts.length === planTexts2.length ? '句数一样但内容不同' : `${planTexts.length} / ${planTexts2.length}`)

const journeyBad = checkJourney(PACK_JOURNEY)
check('当日计划：包里那一份过规矩（站够多、兜底在头一个、少一分三段齐、每句带三个占位符）',
  journeyBad.length === 0,
  journeyBad.length ? journeyBad.slice(0, 3).join(' · ') : '干净')

/* ------------------------------------------------------------------ *
 * 痕迹：当天那一次「命运抉择」走的那条路，当天后面每一行都留一点回声
 * （2026-10-09，用户第 3 条「用户当天的这些命运抉择，会在当天影响后续的日常事件」）
 *
 * 三条口径：
 *   ① 只活当天——午夜一过，昨天那条路就不再往后说话；
 *   ② 只从真实行为来——那一天真有一件够份量的事，也真挑了一条路（或机器替他落了一条）；
 *   ③ 不写回存档——跟「方向」一样是推出来的，同一份记录看两眼一字不变。
 *
 * 一行最多一处回声：本来就有世界句或生活句的行，那两句自己就带着痕迹（`mark` 递进
 * worldLine / lifeLine）；剩下的行（以及日卷那一行）才挂一句 `.gf-mark-line`。
 * ------------------------------------------------------------------ */
const { marks: PACK_MARKS } = await import('../src/packs/adventure/marks.js')

const MARK_DAYS = [
  {
    // 0 点半上手工，撞了四下：够一件夜袭（钟点在 0 点、撞三次以上）。
    // 两条路里 `hold` 要「坐满四个钟头」，这一天只有四十分钟 ⇒ 走的是 `leave`，
    // 留下的痕迹是「丢掉 + 名声」两样，主痕迹是「丢掉」。
    id: 'mark-day', startedAt: at(0, 0, 30), endedAt: at(0, 1, 10), minutes: 40,
    tags: ['改文件'], counts: { 改文件: 14 }, fails: 4,
  },
]
const markGf = createGameflow({ loadRecords: () => MARK_DAYS, now: () => NOW })
markGf.mount()
markGf.open()
await tick()
const khost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const kEchoes = khost.all('gf-mark-line').map((e) => e.textContent)
check('痕迹：那一卷末尾挂着一句回声，就是这一天走的那条路留下的',
  khost.all('gf-row-day').length === 1 && kEchoes.length === 1
  && (MARKS.loss.echo || []).includes(kEchoes[0]),
  kEchoes[0] || '(一句都没有)')
const kWorld = khost.all('gf-world').map((e) => e.textContent)
check('痕迹：外头那一句也是照痕迹那一池挑的（不是另挑一句）',
  kWorld.length === 1 && (MARKS.loss.world || []).includes(kWorld[0]),
  kWorld[0] || '(一句都没有)')

// 同一份记录看两眼，回声必须一模一样（种子只吃记录本身，跟「哪一天看」无关）。
const markGf2 = createGameflow({ loadRecords: () => MARK_DAYS, now: () => NOW })
markGf2.mount()
markGf2.open()
await tick()
const khost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const kEchoes2 = khost2.all('gf-mark-line').map((e) => e.textContent)
check('痕迹：同一份记录看两眼，这一句回声一字不变',
  kEchoes.length > 0 && kEchoes.join('\n') === kEchoes2.join('\n'),
  kEchoes.join(' ／ ') || '(一句都没有)')

// 那一天一件够份量的事都没有：一句回声都不许有。
const MARK_CLEAN = [{
  id: 'mark-clean', startedAt: at(0, 14, 0), endedAt: at(0, 15, 0), minutes: 60,
  tags: ['翻文件'], counts: { 翻文件: 3 }, fails: 0,
}]
const cleanMarkGf = createGameflow({ loadRecords: () => MARK_CLEAN, now: () => NOW, storage: freshStore() })
cleanMarkGf.mount()
cleanMarkGf.open()
await tick()
const cleanMarkHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('痕迹：那一天没走到任何一条路上，一句回声都没有',
  cleanMarkHost.all('gf-mark-line').length === 0,
  `${cleanMarkHost.all('gf-row').length} 行里 ${cleanMarkHost.all('gf-mark-line').length} 句回声`)

// 账还没结：今天那一件事正摆在最新那一格上等人挑（`pending`）——那件事还没走完，
// 谈不上「往后」，所以这时候一句回声都不许有；挑下去，后面每一行才开始说话。
const MARK_LIVE = [
  {
    id: 'mark-live-night', startedAt: at(0, 0, 30), endedAt: at(0, 1, 10), minutes: 40,
    tags: ['改文件'], counts: { 改文件: 14 }, fails: 4,
  },
  {
    id: 'mark-live-before', startedAt: at(0, 16, 25), endedAt: at(0, 16, 30), minutes: 5,
    tags: ['改文件'], counts: { 改文件: 1 }, fails: 0, ticks: [foldTick(0, 16, 25, 1)],
  },
  {
    id: 'mark-live-now', startedAt: at(0, 16, 40), endedAt: at(0, 16, 40), minutes: 5,
    tags: ['改文件'], counts: { 改文件: 1 }, fails: 0, ticks: [foldTick(0, 16, 40, 1)],
  },
]
const liveMarkGf = createGameflow({ loadRecords: () => MARK_LIVE, now: () => NOW, storage: freshStore() })
liveMarkGf.mount()
liveMarkGf.open()
await tick()
const lhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('痕迹：账还没结（岔口正摆在最新那一格上）时，一句回声都没有',
  lhost.all('gf-choice-pick').length === 2 && lhost.all('gf-mark-line').length === 0,
  `${lhost.all('gf-choice-pick').length} 颗选项 · ${lhost.all('gf-mark-line').length} 句回声`)

// 挑第一颗（这一天的命运是「遭遇」：拦一下 / 别管；头一颗是 `stop`，撞了四下 ⇒ 落 `failed`），
// 它留下的痕迹是 `loss`（包里 `meet.stop.failed.marks` 头一样）。
lhost.all('gf-choice-pick')[0].dispatch('click')
await tick()
const liveMarkId = (stopOut && Array.isArray(stopOut.marks) && stopOut.marks[0]) || ''
const lEchoes = lhost.all('gf-mark-line').map((e) => e.textContent)
check('痕迹：挑完那一刻起，后面每一行开始回声（走的那条路留下什么，后面就说什么）',
  !!liveMarkId && lEchoes.length >= 1 && lEchoes.every((t) => ((MARKS[liveMarkId] || {}).echo || []).includes(t)),
  `${liveMarkId} / ${lEchoes.join(' ／ ') || '(一句都没有)'}`)
const lLife = lhost.all('gf-life').map((e) => e.textContent)
check('痕迹：那一格的蓝框也换成了痕迹那一池（那件事之后他就着这个过日子）',
  !!liveMarkId && lLife.some((t) => ((MARKS[liveMarkId] || {}).life || []).includes(t)),
  `${liveMarkId} / ${lLife.join(' ／ ') || '(一句都没有)'}`)
const lWorld = lhost.all('gf-world').map((e) => e.textContent)
check('痕迹：外头那一句同样出自痕迹那一池',
  !!liveMarkId && lWorld.length >= 1
  && lWorld.every((t) => ((MARKS[liveMarkId] || {}).world || []).includes(t)),
  `${liveMarkId} / ${lWorld.join(' ／ ') || '(一句都没有)'}`)
check('痕迹：一行最多一处回声（本来有世界句或生活句的行，那两句自己就带着了）',
  lhost.all('gf-row').every((r) => r.all('gf-mark-line').length <= 1),
  lhost.all('gf-row').map((r) => r.all('gf-mark-line').length).join(','))
check('痕迹：面板读的那一份就是包里那一份（六个痕迹、句数一致）',
  JSON.stringify(MARKS) === JSON.stringify(PACK_MARKS),
  Object.keys(MARKS).join(',') || '(一个都没有)')
// 2026-10-10（④ 文本重建）把三池加厚过：一天十来个格，池子薄了会撞回同一句。
check('痕迹：这一版把三池加厚过（回声十句、生活与世界各六句起）',
  Object.values(MARKS).every((one) => (one.echo || []).length >= 10
    && (one.life || []).length >= 6 && (one.world || []).length >= 6),
  Object.entries(MARKS).map(([k, v]) => `${k} ${v.echo.length}/${v.life.length}/${v.world.length}`).join(' · '))

/* ------------------------------------------------------------------ *
 * 序曲：故事开头那一段（2026-10-08，用户第 3 条「他可以有名字，你取一个」）
 *
 * 他叫什么、从哪儿来、落脚处落在哪块地方、靠什么换饭吃——一段**固定的**开场，
 * 按顺序说，不从池里挑。名字**只说这一次**：全篇一千多条句子照旧一律用「他」，
 * 名字一多就变成角色扮演了。边界四条：
 *   ① 只挂在**最老的那一行**上——不是挂在「第 0 天」那个日卷上（那一行迟早被折叠梯子
 *      折掉，序曲跟着就没了）；
 *   ② 梯子粗到年卷它还在（夹具里那张两年前的记录收成年卷，序曲照样挂在它上面）；
 *   ③ 说的就是包里那一份，一个字不改；
 *   ④ 名字在整块面板里出现两次（序曲第一句、年卷末尾那句收束），同一份记录看两眼一字不变。
 * ------------------------------------------------------------------ */

// 只讲今天（用户 2026-10-09）之后，序曲那道闸也换了：它只在**今天就是这份存档的
// 头一天**时才说（见 renderTimeline 里的 `originHere`——「过去全部去掉」之后，
// 最老那一行永远就是今天最早那一行，不加这道闸它会天天重播）。所以这里两份记录：
//   ① `ORIGIN_TODAY`——只有今天，序曲该挂在今天那一行上；
//   ② `ORIGIN_OLD`——多一张两年前的卡，今天就不再是头一天，序曲一个字都不说。
const ORIGIN_TODAY = [
  { id: 'origin-today', startedAt: clashAt(0, 15, 0), endedAt: clashAt(0, 16, 0), minutes: 60, tags: ['翻文件'], counts: { 翻文件: 5 }, fails: 0 },
]
const ORIGIN_OLD = [
  { id: 'origin-old', startedAt: clashAt(760, 14, 0), endedAt: clashAt(760, 15, 0), minutes: 60, tags: ['改文件'], counts: { 改文件: 3 }, fails: 0 },
  { id: 'origin-today', startedAt: clashAt(0, 15, 0), endedAt: clashAt(0, 16, 0), minutes: 60, tags: ['翻文件'], counts: { 翻文件: 5 }, fails: 0 },
]
const ogf = createGameflow({ loadRecords: () => ORIGIN_TODAY, now: () => CLASH_BASE })
ogf.mount()
ogf.open()
await tick()
const ohost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const oRows = ohost.all('gf-row')
const oLastRow = oRows[oRows.length - 1]
const oBlocks = ohost.all('gf-origin')
const oLines = oBlocks.flatMap((b) => b.all('gf-origin-line').map((e) => e.textContent))
const ORIGIN_NAME = (ORIGIN && ORIGIN.name) || ''
// 整块面板里的字：垫片的 `textContent` 只走 children，而面板挂在 shadow root 里，
// 所以自己走一遍，只收叶子节点上的字（父子都带 text 的节点会被算两遍）。
// **样式表不算**——CSS 注释里的字不是讲给他听的话。
const panelText = (host) => {
  const out = []
  const walk = (n) => {
    if (n.tagName === 'STYLE' || n.tagName === 'SCRIPT') return
    if (!n.children.length) { if (n.textContent) out.push(n.textContent); return }
    for (const c of n.children) walk(c)
  }
  walk(host.shadowRoot || host)
  return out.join('\n')
}
const oNameHits = ORIGIN_NAME ? panelText(ohost).split(ORIGIN_NAME).length - 1 : 0
// 名字全篇**两处**：序曲第一句，加上每一卷年卷末尾那句收束（归宿那一句，见后一节）。
const oFateCloses = ohost.all('gf-fate-close').map((e) => e.textContent)

check('序曲：只在最老的那一行上说（故事的开头只有一个）',
  oBlocks.length === 1 && oLastRow.all('gf-origin').length === 1,
  `${oBlocks.length} 段序曲 / ${oRows.length} 行里最后一行${oLastRow.all('gf-origin').length ? '有' : '没有'}`)
check('序曲：说的就是包里那一份，一个字都不改',
  oLines.length >= 4 && oLines.join('\n') === ((ORIGIN && ORIGIN.lines) || []).join('\n'),
  oLines.length === ((ORIGIN && ORIGIN.lines) || []).length ? '句数一样但内容不同' : `${oLines.length} 句`)
check('序曲：第一句就说出了他的名字',
  ORIGIN_NAME !== '' && String(oLines[0] || '').includes(ORIGIN_NAME),
  `${ORIGIN_NAME} / ${oLines[0] || '(一句都没有)'}`)
// 名字全篇**一处**：序曲第一句。年卷末尾那句收束（归宿）与年卷一起休眠了——
// 见闻录只讲今天之后不再产生年卷，所以这里如实改成「只说这一次」。
check('序曲：名字全篇只说这一次（说多了他就变成角色扮演了）',
  oNameHits === 1 && oFateCloses.length === 0,
  `${ORIGIN_NAME} 在面板里出现 ${oNameHits} 次 / 收束 ${oFateCloses.length} 句`)
check('序曲：挂在那一天第一句上面（开场在前，那一天的事在后）',
  (() => {
    const first = oLastRow.all('gf-origin')[0]
    const remark = oLastRow.all('gf-remark')[0]
    if (!first || !remark) return false
    const walk = (node, out = []) => { out.push(node); for (const c of node.children) walk(c, out); return out }
    const order = walk(oLastRow)
    return order.indexOf(first) < order.indexOf(remark)
  })(),
  `序曲 ${oLastRow.all('gf-origin').length} 段 / 那一行 ${oLastRow.all('gf-remark').length} 句`)

const ogf2 = createGameflow({ loadRecords: () => ORIGIN_TODAY, now: () => CLASH_BASE })
ogf2.mount()
ogf2.open()
await tick()
const ohost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const oLines2 = ohost2.all('gf-origin').flatMap((b) => b.all('gf-origin-line').map((e) => e.textContent))
check('序曲：同一份记录看两眼，一个字都不变',
  oLines.length > 0 && oLines.join('\n') === oLines2.join('\n'),
  oLines.length === oLines2.length ? '句数一样但内容不同' : `${oLines.length} / ${oLines2.length}`)

// 反面：存档里只要还有更早的日子，今天就不是头一天，序曲一个字都不说。
// （用户 2026-10-09「过去全部去掉」之后，最老那一行永远就是今天最早那一行——
//  没有这道闸，序曲会天天重播。）
const ogfOld = createGameflow({ loadRecords: () => ORIGIN_OLD, now: () => CLASH_BASE })
ogfOld.mount()
ogfOld.open()
await tick()
const ohostOld = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
check('序曲：存档里还有更早的日子，今天就不是头一天，序曲一个字都不说',
  ohostOld.all('gf-origin').length === 0 && ohostOld.all('gf-row').length === 1,
  `${ohostOld.all('gf-origin').length} 段序曲 / ${ohostOld.all('gf-row').length} 行（只有今天那一行）`)

/* ------------------------------------------------------------------ *
 * 归宿：这一年收在哪儿（2026-10-08，用户 m08146「全做。」第 ⑤ 件）
 *
 * 年卷那一行原来只剩「标签 + 主句」——没有世界句、没有生活句、没有事件、没有交锋，
 * 末尾正好空着。归宿就挂在那儿：拿那一年的账（干过多少天、撞过多少回、交出去几件、
 * 日子落在哪几档方向上、遇上事的时候多半走哪条路）挑一件，末尾一句收束里用一次他的名字。
 *
 * **2026-10-09：界面那一半退休了。** 用户那天说「除了今天之外，全部去掉」——
 * 见闻录只讲今天之后年卷一次都不会产生，`fatesFor` 与 `gf-fate-close` 成了走不到的代码
 * （机器留着，装回折叠梯子时从 `.backup/2026-10-08-210603/` 取回）。
 * 原来钉界面的六条（年卷那一行末尾多出一段、收束排在最后、收束里带他的名字……）如实退休；
 * **引擎那一层十二条一条没动**——`fateOf` 只看那一年的账，与「今天」无关，照样全过。
 * 名字也因此从「全篇两处」变回「只有序曲那一处」（见序曲那一节的断言）。
 * ------------------------------------------------------------------ */

// 引擎那一层：这一年的账挑哪一件，全靠真数，不是摇出来的。
const { fateOf, checkFates } = await import('../src/packs/rules.js')
const PACK_FATES = (await import('../src/packs/adventure/fate.js')).fate
const FF = (over = {}) => ({ days: 0, hours: new Set(), places: new Set(), scenes: new Set(), direction: {}, roads: {}, ...over })
const DAYS = (n) => new Array(n).fill(0)
const fateId = (facts) => (fateOf(facts, PACK_FATES) || {}).id || '(一件都没挑中)'
check('归宿：一年只干了两天，归到「没待多久」那一件',
  fateId(FF({ days: DAYS(2) })) === 'thin-year', fateId(FF({ days: DAYS(2) })))
check('归宿：干过三十天还算「没待多久」，三十一天就够不着了',
  fateId(FF({ days: DAYS(30) })) === 'thin-year' && fateId(FF({ days: DAYS(31) })) === 'quiet-year',
  `${fateId(FF({ days: DAYS(30) }))} / ${fateId(FF({ days: DAYS(31) }))}`)
check('归宿：撞过二十四回以上，归到「接着做下去」那一件',
  fateId(FF({ days: DAYS(60), fails: 30 })) === 'kept-at-it', fateId(FF({ days: DAYS(60), fails: 30 })))
check('归宿：下过矿洞又撞过十几回，归到「塌过几回」那一件（够不着前面那件）',
  fateId(FF({ days: DAYS(60), fails: 15, scenes: new Set(['mine']) })) === 'underground',
  fateId(FF({ days: DAYS(60), fails: 15, scenes: new Set(['mine']) })))
check('归宿：交出去十样以上，归到「攒住了几样东西」那一件',
  fateId(FF({ days: DAYS(60), deliverables: DAYS(10) })) === 'paid-off',
  fateId(FF({ days: DAYS(60), deliverables: DAYS(10) })))
check('归宿：遇上事的日子一半以上收了尾，归到「没留下什么没办的」那一件',
  fateId(FF({ days: DAYS(60), roads: { hold: 3, leave: 1 } })) === 'held-the-line',
  fateId(FF({ days: DAYS(60), roads: { hold: 3, leave: 1 } })))
check('归宿：一半以上是绕道，归到「还是回到了那间屋子」那一件',
  fateId(FF({ days: DAYS(60), roads: { leave: 3, back: 1 } })) === 'walked-away',
  fateId(FF({ days: DAYS(60), roads: { leave: 3, back: 1 } })))
check('归宿：四成日子在涉险，归到「一直在走」那一件',
  fateId(FF({ days: DAYS(60), direction: { risk: 4, hearth: 6 } })) === 'on-the-road',
  fateId(FF({ days: DAYS(60), direction: { risk: 4, hearth: 6 } })))
check('归宿：六成日子在攒盘缠与过日子，归到「过成了老样子」那一件',
  fateId(FF({ days: DAYS(60), direction: { coin: 3, hearth: 7 } })) === 'steady',
  fateId(FF({ days: DAYS(60), direction: { coin: 3, hearth: 7 } })))
check('归宿：哪一件都够不着，归到最后那件不带条件的',
  fateId(FF({ days: DAYS(60), direction: { food: 5 } })) === 'quiet-year',
  fateId(FF({ days: DAYS(60), direction: { food: 5 } })))
check('归宿：同时够着好几件，取排在前面的那一件（顺序就是优先级）',
  fateId(FF({ days: DAYS(60), fails: 30, deliverables: DAYS(12), direction: { risk: 10 } })) === 'kept-at-it',
  fateId(FF({ days: DAYS(60), fails: 30, deliverables: DAYS(12), direction: { risk: 10 } })))
check('归宿：没有归宿表的时候挑不出东西来',
  fateOf(FF({ days: DAYS(60) }), []) === null && fateOf(FF({ days: DAYS(60) }), null) === null,
  '空表与没有表都返回 null')

// 规矩那一层：写坏的归宿表要报出来。
const okFate = (over = {}) => ({ id: 'x', when: [{ when: 'days', gte: 1 }], lines: ['一句话。', '两句话。', '三句话。'], close: '就这样。', ...over })
const FALLBACK = { id: 'y', lines: ['一句话。', '两句话。', '三句话。'], close: '就这样。' }
const badFate = (fates) => checkFates(fates, 'smoke')
check('归宿：写坏的归宿表会被规矩抓出来（id 重、兜底不在最后、share 越界、账只有两句、收束空）',
  badFate([okFate(), okFate()]).length >= 1
  && badFate([okFate(), FALLBACK, okFate({ id: 'z' })]).length >= 1
  && badFate([okFate({ when: [{ when: 'direction', has: ['risk'], share: 400 }] }), FALLBACK]).length >= 1
  && badFate([okFate({ lines: ['只有一句。'] }), FALLBACK]).length >= 1
  && badFate([okFate({ close: '' }), FALLBACK]).length >= 1,
  `id 重 ${badFate([okFate(), okFate()]).length} 条 / 兜底不在最后 ${badFate([okFate(), FALLBACK, okFate({ id: 'z' })]).length} 条 / share 越界 ${badFate([okFate({ when: [{ when: 'direction', has: ['risk'], share: 400 }] }), FALLBACK]).length} 条 / 账只有一句 ${badFate([okFate({ lines: ['只有一句。'] }), FALLBACK]).length} 条 / 收束空 ${badFate([okFate({ close: '' }), FALLBACK]).length} 条`)
check('归宿：包里那九件都过规矩',
  checkFates(PACK_FATES, 'adventure').length === 0,
  checkFates(PACK_FATES, 'adventure').slice(0, 3).join(' / ') || '九件都干净')

/* ------------------------------------------------------------------ *
 * 方向与比例：这一天朝哪边走（2026-10-08，用户 m07234 第 2 条「比例需要调整」）
 *
 * 四条要钉住的：
 *   ① 抬头落在**日卷那一行**上（五分钟的格是刻度，不是一天的讲法）；
 *   ② 上限真起作用——四天都撞过墙，涉险也只能占一半（上限不是配额）；
 *   ③ 方向挂在记录上（`entry.direction`），危险系数跟着动一档（涉险 +7、过日子 −7）；
 *   ④ 同一份记录看两眼，抬头一个字都不变。
 *
 * 夹具那四天都 19:00 开工、坐两小时、撞墙两次 ⇒ 四天都够「涉险」。算出来是
 * 过日子 / 涉险 / 过日子 / 涉险（第一天 1/1 就超一半，第三天 2/3 也超）——
 * 天数少的时候只有涉险与过日子两档轮得上，别的档上限低，比例还没降下来。
 * ------------------------------------------------------------------ */
const DIR_DAYS = [
  // 今天一张卡：坐两小时、撞墙两次 ⇒ 够「涉险」的条件。
  { id: 'dir-today', startedAt: clashAt(0, 9, 0), endedAt: clashAt(0, 11, 0), minutes: 120, tags: ['改文件'], counts: { 改文件: 4 }, fails: 2 },
  // 今天另起一格五分钟（刻度那一档不该挂抬头），钟点落在最近半小时里才是格。
  {
    id: 'dir-cell', startedAt: clashAt(0, 16, 20), endedAt: clashAt(0, 16, 30), minutes: 10,
    tags: ['改文件'], counts: { 改文件: 2 }, fails: 0,
    ticks: [
      { at: clashAt(0, 16, 20), actions: 1, counts: { 改文件: 1 }, files: [], fails: 0, tags: ['改文件'] },
      { at: clashAt(0, 16, 25), actions: 1, counts: { 改文件: 1 }, files: [], fails: 0, tags: ['改文件'] },
    ],
  },
]

const dgf = createGameflow({ loadRecords: () => DIR_DAYS, now: () => CLASH_BASE })
dgf.mount()
dgf.open()
await tick()
const dhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const dRows = dhost.all('gf-row')
const dRolls = dRows.filter((r) => r.classList.contains('gf-row-roll'))
const dCells = dRows.filter((r) => !r.classList.contains('gf-row-roll'))
const dDayRows = dhost.all('gf-row-day')
const dirLines = (id) => ((DIRECTIONS || []).find((d) => d && d.id === id) || {}).lines || []
const allDirLines = new Set((DIRECTIONS || []).flatMap((d) => (d && d.lines) || []))

check('方向：抬头落在日卷那一行上（那是「这一天」的说法）',
  dDayRows.length === 1 && dDayRows.filter((r) => r.all('gf-direction').length).length === 1,
  `${dDayRows.length} 行日卷里 ${dDayRows.filter((r) => r.all('gf-direction').length).length} 行有抬头`)

check('方向：梯子上那五分钟一格不挂（那是刻度，不是一天的讲法）',
  dCells.length >= 2 && dCells.every((r) => r.all('gf-direction').length === 0),
  `${dCells.length} 格里 ${dCells.filter((r) => r.all('gf-direction').length).length} 格有抬头`)

check('方向：说的就是包里那一份，一个字都不改',
  dhost.all('gf-direction').length > 0 && dhost.all('gf-direction').every((e) => allDirLines.has(e.textContent)),
  dhost.all('gf-direction').map((e) => e.textContent).join(' ／ '))

// 只讲今天之后，一份记录里最多只剩一天，而「涉险」的上限是一半——
// 一天就是全占，所以今天这一天只轮得到兜底那一档（过日子）。比例那一套
// 挪到下面用引擎那一层验（它只看那几天的账，与「今天」无关）。
check('方向：只有一天时，涉险那一档被上限挡住，落的是兜底那一档',
  dDayRows.length === 1 && (() => {
    const hit = dDayRows[0].all('gf-direction')[0]
    return !!hit && dirLines('hearth').includes(hit.textContent)
  })(),
  `${dDayRows.length} 行 / ${(dDayRows[0] ? dDayRows[0].all('gf-direction')[0] : {}).textContent || '（没有抬头）'}`)

// 上限：四天都够涉险，落下来只能是两天（`(used + 1) / total` 那一比）。
// 引擎那一层自己排一遍（`before` 是更早那些日子的方向 id）。
const { directionOf: rulesDirectionOf } = await import('../src/packs/rules.js')
const dirFacts = (over = {}) => ({ fails: 2, hours: new Set([19]), places: new Set(), scenes: new Set(), deliverables: [], minutes: 120, ...over })
const dirSeq = []
for (let i = 0; i < 4; i++) {
  const hit = rulesDirectionOf(dirFacts(), DIRECTIONS, { before: dirSeq.map((d) => d && d.id) })
  dirSeq.push(hit || null)
}
const dRisk = dirSeq.filter((d) => d && d.id === 'risk').length
check('方向：涉险最多占一半（上限不是配额）',
  dRisk === 2 && dirSeq.every((d) => d && ['risk', 'coin', 'food', 'hearth'].includes(d.id)),
  `四天里 ${dRisk} 天涉险 · ${dirSeq.map((d) => (d ? d.id : '(空着)')).join('/')}`)

// 方向挂在记录上，危险系数跟着动一档（读的就是 `entry.direction`）。
const dirProbe = { id: 'dir-probe', startedAt: clashAt(2, 19, 0), minutes: 120, counts: {}, fails: 0 }
const dPlain = dangerOf(dirProbe, 'home')
const dRiskAt = dangerOf({ ...dirProbe, direction: 'risk' }, 'home')
const dHearth = dangerOf({ ...dirProbe, direction: 'hearth' }, 'home')
check('方向：涉险的日子危险高七点，过日子的日子低七点',
  dRiskAt - dPlain === 7 && dPlain - dHearth === 7,
  `${dPlain} → 涉险 ${dRiskAt} / 过日子 ${dHearth}`)

const dgf2 = createGameflow({ loadRecords: () => DIR_DAYS, now: () => CLASH_BASE })
dgf2.mount()
dgf2.open()
await tick()
const dhost2 = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const dText = dhost.all('gf-direction').map((e) => e.textContent)
const dText2 = dhost2.all('gf-direction').map((e) => e.textContent)
check('方向：同一份记录看两眼，抬头一个字都不变',
  dText.length > 0 && dText.join('\n') === dText2.join('\n'),
  dText.length === dText2.length ? '句数一样但内容不同' : `${dText.length} / ${dText2.length}`)

/* ------------------------------------------------------------------ *
 * 记着的那套说法，打开时自己装上（2026-10-06）
 *
 * 上面那几条断言验的是**写**；这里反过来验**读**：拿一个「只记着某一套」的存储开一个
 * 新面板，它应该自己就讲上那一套（说法、名字、世界、主题四样都对）。
 *
 * 2026-10-06 晚船家摘掉之后，注册表里讲得出话的只剩奇幻冒险一套，所以这里**临时注册**
 * 一套（`smoke-kept`）来验这条路——验完就摘掉，注册表原样还回去。
 *
 * 放在最后是因为换说法动的是模块级那一份（几个面板之间共享），前面那些断言不该被它影响。
 * ------------------------------------------------------------------ */
packsMod.PACKS['smoke-kept'] = {
  ...PACKS.adventure,
  id: 'smoke-kept',
  name: '记着的那套说法',
  kind: 'voice',
  voice: 'kept',
  label: '记着的那套',
  tagline: '用来验「记着的说法自己装上」的那一套。',
  free: true,
}
const keptKey = [...worldStore.keys()][0]
const keptStore = {
  getItem: (k) => (k === keptKey ? 'kept' : null),
  setItem: () => {},
  removeItem: () => {},
}
const keptGf = createGameflow({ loadRecords: () => [], now: () => NOW, storage: keptStore })
keptGf.mount()
const keptHost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const keptTrigger = () => keptHost.all('gf-voice-b')[0]
const keptItems = () => keptHost.all('gf-style-item')
check('上次挑的那套说法，打开时自己就讲上了（不用再点一次）',
  keptGf.style === 'kept' && keptTrigger().getAttribute('data-voice') === 'kept',
  `${keptGf.style} / 名字上写的是 ${keptTrigger().getAttribute('data-voice')}`)
check('自己装上的那套说法，名字上写的就是它',
  keptTrigger().textContent === packsMod.PACKS['smoke-kept'].label
  && keptHost.all('gf-voice-b').length === 1,
  `${keptTrigger().textContent} / 开关 ${keptHost.all('gf-voice-b').length} 个`)
check('自己装上的那套说法，讲出来的词也来自它',
  keptGf.voice === 'kept')
check('清单里只列没在讲的那几套（当前那套不列）',
  keptItems().length === listedStyles().length - 1
  && !keptItems().some((n) => n.getAttribute('data-voice') === 'kept')
  && keptItems()[0].getAttribute('data-voice') === 'adventure'
  && keptItems()[0].textContent === packsMod.PACKS.adventure.label,
  keptItems().map((n) => `${n.getAttribute('data-voice')}=${n.textContent}`).join(' / '))
check('自己装上的那套说法，世界与主题还是这个世界的（说法不带着地理跑）',
  keptGf.world === packsMod.PACKS.adventure.id
  && keptGf.theme === packsMod.PACKS.adventure.theme
  && keptHost.all('gf-map').length === 1,
  `${keptGf.world} / ${keptGf.theme} / 地图 ${keptHost.all('gf-map').length} 张`)
delete packsMod.PACKS['smoke-kept']

/* ------------------------------------------------------------------ *
 * 锁着的说法不摆假开关（2026-10-06）
 *
 * 用户 m03366 第 3 步原话里那句「未解锁包不给假按钮」：`free: false` 的说法照样摆在
 * 那张清单里（看得见才谈得上想不想要），但 `aria-disabled` 且**没有挂 click**——点下去
 * 说法不许换、也不许记进存储。把 id 交给 `unlocked` 之后（＝授权校验完了）它才亮、
 * 才点得动。同样放在最后：换说法动的是模块级那一份。
 * ------------------------------------------------------------------ */
packsMod.PACKS['smoke-locked'] = {
  ...PACKS.adventure,
  id: 'smoke-locked',
  name: '锁着的那套说法',
  kind: 'voice',
  voice: 'locked',
  label: '锁着的那套',
  cover: '锁',
  tagline: '还没解锁的那套说法。',
  free: false,
}
const lockedGf = createGameflow({ loadRecords: () => [], now: () => NOW, storage: null })
lockedGf.mount()
const lockedhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
const lockedOpen = () => lockedhost.all('gf-voice-b')[0].dispatch('click')
const lockedItem = () => lockedhost.all('gf-style-item')
  .find((n) => n.getAttribute('data-voice') === 'locked')
lockedOpen()
check('锁着的那套说法照样摆在清单里（看得见，只是点不动）',
  lockedhost.all('gf-style-item').length === listedStyles().length - 1 && !!lockedItem()
  && lockedhost.all('gf-voice-b').length === 1,
  `${lockedhost.all('gf-style-item').length} 项：${lockedhost.all('gf-style-item').map((n) => n.textContent).join('/')}`)
check('锁着的那个是点不动的（不给假开关）',
  lockedItem().getAttribute('aria-disabled') === 'true',
  `aria-disabled ${lockedItem().getAttribute('aria-disabled')}`)
const lockedBefore = lockedGf.style
lockedItem().dispatch('click')
check('点那一下什么也没发生（说法没换）',
  lockedGf.style === lockedBefore, `${lockedBefore} → ${lockedGf.style}`)
const unlockedGf = createGameflow({
  loadRecords: () => [], now: () => NOW, storage: null, unlocked: ['smoke-locked'],
})
unlockedGf.mount()
const unlockedhost = [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
unlockedhost.all('gf-voice-b')[0].dispatch('click')
const unlockedItem = () => unlockedhost.all('gf-style-item')
  .find((n) => n.getAttribute('data-voice') === 'locked')
check('把 id 交给 unlocked（授权完），清单里那一项就亮了',
  unlockedItem().getAttribute('aria-disabled') !== 'true')
unlockedItem().dispatch('click')
check('点亮之后点一下，说法真的换了', unlockedGf.style === 'locked', unlockedGf.style)
delete packsMod.PACKS['smoke-locked']

/* ------------------------------------------------------------------ *
 * 开场那一下：一台刚开机的机器先给一颗「开始冒险」（2026-10-09）
 *
 * 用户 m01903 第 1 条逐字：「这里我刚刚打开电脑，啥也没有。所以需要一个点击开始，内容为
 * "开始冒险"，点击完再弹出两个说明，这两个说明一直显示至第一个5分钟的落盘出现，说明
 * 分别是：每5分钟会更新一次事件；极少数情况下需要您来做出选择。」
 *
 * 三件事分开量：空的时候摆按钮 / 按过之后换成那两条说明（当天不再问）/ 今天有格落盘了
 * 就一起退场。记的是**那一天的零点**，所以夹具钉在 `NOW` 上，不跟着今天走。
 * ------------------------------------------------------------------ */
const START_KEY = 'dsh.gameflow.started'
const dayZero = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const startStore = new Map()
const startStub = {
  getItem: (k) => (startStore.has(k) ? startStore.get(k) : null),
  setItem: (k, v) => { startStore.set(k, String(v)) },
  removeItem: (k) => { startStore.delete(k) },
}
const hostNow = () => [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()

const startGf = createGameflow({ loadRecords: () => [], now: () => NOW, storage: startStub })
startGf.mount()
const startHost = hostNow()
check('刚开机什么都没有的时候，摆的是一颗「开始冒险」',
  startHost.all('gf-start').length === 1 && startHost.all('gf-start')[0].textContent === '开始冒险'
  && startHost.all('gf-hint').length === 0,
  `${startHost.all('gf-start').length} 颗 / 说明 ${startHost.all('gf-hint').length} 条`)
check('那颗按钮旁边，原来那句话一个字没动（还是只说明状态）',
  startHost.all('gf-empty').length === 1
  && startHost.all('gf-empty')[0].textContent === '他还没走过多远。',
  startHost.all('gf-empty')[0]?.textContent)

startHost.all('gf-start')[0].dispatch('click')
check('按一下「开始冒险」：按钮没了，换成那两条说明',
  startHost.all('gf-start').length === 0 && startHost.all('gf-hint').length === 2,
  `${startHost.all('gf-start').length} 颗 / 说明 ${startHost.all('gf-hint').length} 条`)
check('那两条说明就是他写的那两句',
  startHost.all('gf-hint').map((e) => e.textContent).join(' ／ ')
    === '每5分钟会更新一次事件。 ／ 极少数时候，需要你来定一件大事。',
  startHost.all('gf-hint').map((e) => e.textContent).join(' ／ '))
check('按过这件事记在本地那份存储里（记的是那一天的零点，不写记录）',
  startStore.get(START_KEY) === String(dayZero(NOW)),
  `${START_KEY} = ${startStore.get(START_KEY)} / 今天零点 ${dayZero(NOW)}`)
await startGf.refresh()
check('重画一遍：按钮不回来、说明还挂着（今天还没落盘）',
  startHost.all('gf-start').length === 0 && startHost.all('gf-hint').length === 2,
  `${startHost.all('gf-start').length} 颗 / 说明 ${startHost.all('gf-hint').length} 条`)

// 今天已经落过一格：按钮与说明一起退场（说明是「挂到第一个五分钟格落盘」的）。
const START_LIVE = [{
  id: 'start-live',
  startedAt: at(0, 16, 35),
  endedAt: NOW,
  minutes: 0,
  tags: ['改文件'],
  counts: { 改文件: 1 },
  ticks: [foldTick(0, 16, 35, 1)],
}]
const liveGf = createGameflow({ loadRecords: () => START_LIVE, now: () => NOW, storage: startStub })
liveGf.mount()
const liveHost = hostNow()
check('今天第一格落盘之后，按钮与那两条说明一起退场',
  liveHost.all('gf-start').length === 0 && liveHost.all('gf-hint').length === 0
  && liveHost.all('gf-row').length >= 1,
  `${liveHost.all('gf-start').length} 颗 / 说明 ${liveHost.all('gf-hint').length} 条 / ${liveHost.all('gf-row').length} 行`)

// 今天已经落过活了、但今天还没按过：照样摆那一颗，**而且一格都不铺**（用户 m19006 逐字：
// 「今天我打开，并没有让我点击开始冒险呢，直接就是一个，命运选择？」；用户 m19218 逐字：
// 「你看今天我并没有点开始冒险，却有如此显示」——傍晚才打开面板的人，今天那几格早就在了，
// 从前这颗按钮只长在空态那一支上，他永远看不见；后来补上了按钮，行却还照旧铺着，于是
// 这一天「还没开场」却已经讲了一半）。
const lateStub = (() => {
  const map = new Map([[START_KEY, String(dayZero(NOW) - 86400000)]])
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
})()
const lateGf = createGameflow({ loadRecords: () => START_LIVE, now: () => NOW, storage: lateStub })
lateGf.mount()
const lateHost = hostNow()
check('今天已经有落了活、但还没按过：只摆那一颗「开始冒险」，一格都不铺（用户 m19006 / m19218）',
  lateHost.all('gf-start').length === 1 && lateHost.all('gf-hint').length === 0
  && lateHost.all('gf-row').length === 0,
  `${lateHost.all('gf-start').length} 颗 / 说明 ${lateHost.all('gf-hint').length} 条 / ${lateHost.all('gf-row').length} 行`)
lateHost.all('gf-start')[0].dispatch('click')
await lateGf.refresh()
check('按下之后：那一天从第一格讲起，按钮自己退场、那两条说明不补',
  lateHost.all('gf-start').length === 0 && lateHost.all('gf-hint').length === 0
  && lateHost.all('gf-row').length >= 1,
  `${lateHost.all('gf-start').length} 颗 / 说明 ${lateHost.all('gf-hint').length} 条 / ${lateHost.all('gf-row').length} 行`)

// 这一天还没开始讲，命运就先不摆（用户 m19006 第 2 问：「上面是开始冒险的点击，下面又是命运…」）；
// 整条见闻录也不铺（用户 m19218）。
const curtainStore = freshStore()
curtainStore.removeItem('dsh.gameflow.started')
const curtainGf = createGameflow({ loadRecords: () => PICK_DAYS, now: () => NOW, storage: curtainStore })
curtainGf.mount()
const curtainHost = hostNow()
check('幕布：没按过「开始冒险」之前一格都不铺，那件命运也没按钮（门上那枚记号同时不亮）',
  curtainHost.all('gf-row').length === 0 && curtainHost.all('gf-choice-live').length === 0
  && curtainHost.all('gf-door-badge')[0].hidden === true,
  `${curtainHost.all('gf-row').length} 行 / ${curtainHost.all('gf-choice-live').length} 处选项 / 记号${curtainHost.all('gf-door-badge')[0].hidden ? '灭' : '亮'}`)
curtainHost.all('gf-start')[0].dispatch('click')
await curtainGf.refresh()
check('按下「开始冒险」之后：行铺出来了，那件命运才摆出来（两颗按钮）',
  curtainHost.all('gf-row').length >= 1 && curtainHost.all('gf-choice-live').length === 1
  && curtainHost.all('gf-choice-pick').length === 2,
  `${curtainHost.all('gf-row').length} 行 / ${curtainHost.all('gf-choice-live').length} 处选项 / ${curtainHost.all('gf-choice-pick').length} 颗`)

// 昨天按过不算（用户 m13333 第 2 条「每天出现」）。
const ydayStub = {
  getItem: (k) => (k === START_KEY ? String(dayZero(NOW) - 86400000) : null),
  setItem: () => {},
  removeItem: () => {},
}
const ydayGf = createGameflow({ loadRecords: () => [], now: () => NOW, storage: ydayStub })
ydayGf.mount()
const ydayHost = hostNow()
check('昨天按过不算：第二天开机又是一颗「开始冒险」',
  ydayHost.all('gf-start').length === 1 && ydayHost.all('gf-hint').length === 0,
  `${ydayHost.all('gf-start').length} 颗 / 说明 ${ydayHost.all('gf-hint').length} 条`)

// 没有存储（预览页、`storage: null`）：按得动，只是记在内存里——按钮不许每次重画都回来。
const memGf = createGameflow({ loadRecords: () => [], now: () => NOW, storage: null })
memGf.mount()
const memHost = hostNow()
memHost.all('gf-start')[0].dispatch('click')
await memGf.refresh()
check('没有存储也按得动：按过之后当天不再回来（记在内存里）',
  memHost.all('gf-start').length === 0 && memHost.all('gf-hint').length === 2,
  `${memHost.all('gf-start').length} 颗 / 说明 ${memHost.all('gf-hint').length} 条`)

/* ---- 报告 B-05~B-09 的回马枪：每一处都拿一份「最坏的输入」再走一遍 ---- */

// B-06：老记录没有格子，抬头写「起点 – 终点」。跨过午夜那一张从前写成
// 「昨天 23:30 – 00:10」——读起来像倒着走了二十分钟。终点不是同一天就得写清是哪天。
const MIDNIGHT_DAYS = [{
  id: 'midnight', startedAt: at(1, 23, 30), endedAt: at(0, 0, 10), minutes: 40,
  tags: ['改文件'], counts: { 改文件: 5 }, files: ['D:\\x\\a\\跨午夜.js'],
}]
const midnightGf = createGameflow({ loadRecords: () => MIDNIGHT_DAYS, now: () => NOW, storage: freshStore() })
midnightGf.mount()
const midnightHost = hostNow()
const midnightWhen = midnightHost.all('gf-when').map((e) => e.textContent).join(' | ')
check('跨午夜的抬头写清终点是哪一天（不许出现「昨天 23:30 – 00:10」那种倒着走）',
  /23:30/.test(midnightWhen) && /今天 00:10/.test(midnightWhen),
  midnightWhen)
midnightGf.destroy()

// B-07：`files` 写成一个**字符串**时不能被 spread 成一个个单字（「a · . 等 5 个」）。
const STRING_FILES = [{
  id: 'string-files', startedAt: at(0, 16, 0), endedAt: at(0, 16, 20), minutes: 20,
  tags: ['改文件'], counts: { 改文件: 2 }, files: 'D:\\x\\a\\a.js',
}]
const stringGf = createGameflow({ loadRecords: () => STRING_FILES, now: () => NOW, storage: freshStore() })
stringGf.mount()
const stringHost = hostNow()
const stringFiles = stringHost.all('gf-files')[0]
check('files 是字符串时整条当成一个文件名（不拆成单字）',
  stringFiles?.textContent.trim() === 'a' && stringFiles?.getAttribute('title') === 'a.js',
  `「${stringFiles?.textContent}」/ title=${stringFiles?.getAttribute('title')}`)
stringGf.destroy()

// B-09：接缝（`seam`）只用来问「上一段」，**不是记录**。宿主的 pruneStore 保证它落在昨天以前，
// 可存档是别人写的、老版本也写过。万一它落在今天，只按时刻过滤就会把它铺成一行
// 「15:00 – 15:00 · 不到一分钟」，还跟着重算一次命运。
const SEAM_TODAY = {
  since: at(30, 0, 0),
  seam: { startedAt: at(0, 15, 0), endedAt: at(0, 15, 0) },
  records: [{
    id: 'seam-today-rec', startedAt: at(0, 16, 0), endedAt: at(0, 16, 25), minutes: 25,
    tags: ['改文件'], counts: { 改文件: 3 }, files: ['D:\\x\\a\\今天.js'],
  }],
}
const seamGf = createGameflow({ loadRecords: () => SEAM_TODAY, now: () => NOW, storage: freshStore() })
seamGf.mount()
const seamHost = hostNow()
const seamWhens = seamHost.all('gf-when').map((e) => e.textContent).join(' | ')
check('接缝落在今天也不铺成一行（它只用来问「上一段」）',
  seamHost.all('gf-row').length === 1 && !/15:00/.test(seamWhens),
  `${seamHost.all('gf-row').length} 行：${seamWhens}`)
seamGf.destroy()

// B-08：宿主抖一下（要不到数据）不该把见闻录擦成「他还没走过多远。」——保留上一份。
const LIVE_ONE = [{
  id: 'keep-last', startedAt: at(0, 16, 0), endedAt: at(0, 16, 25), minutes: 25,
  tags: ['改文件'], counts: { 改文件: 3 }, files: ['D:\\x\\a\\在位.js'],
}]
let keepLastLoad = () => LIVE_ONE
const keepLastGf = createGameflow({ loadRecords: () => keepLastLoad(), now: () => NOW, storage: freshStore() })
keepLastGf.mount()
const keepLastHost = hostNow()
const rowsBefore = keepLastHost.all('gf-row').length
keepLastLoad = () => null // 要不到（fetchStore 那条路交回的就是 null）
await keepLastGf.refresh()
check('要不到数据时保留上一份（不闪成空态）',
  keepLastHost.all('gf-row').length === rowsBefore && keepLastHost.all('gf-empty').length === 0,
  `${rowsBefore} → ${keepLastHost.all('gf-row').length} 行 / 空态 ${keepLastHost.all('gf-empty').length} 处`)
keepLastGf.destroy()

// `fetchStore` 与 `fetchRecords` 的两种「没有」要分开：界面那条路要 null（留着上一份），
// 老写法照旧摊平成空数组（它的契约一直是「只认数组」）。
stubFetch(async () => { throw new Error('断网') })
const brokenStore = await fetchStore()
const brokenRecords = await fetchRecords()
check('要整份存档：要不到就交回 null（界面留着上一份），老写法照旧交空数组',
  brokenStore === null && Array.isArray(brokenRecords) && brokenRecords.length === 0,
  `${brokenStore === null ? 'null' : JSON.stringify(brokenStore)} / ${JSON.stringify(brokenRecords)}`)

// ---------------------------------------------------------------------------
// 8 → 9：按下「开始冒险」那一刻才是这一天的起点（用户 m04200 逐字「不是，我刚刚点开，
// 就已经存在2条冒险在里面了，这是不对的。当用户点开的时候，才会开始计算时间，
// 并到下一个5分钟的时候才会落盘。」）。
// 下面三组夹具就是照这句话摆的：起点之前的两条一概不铺；按下之后的第一个格子在
// 下一个整五分钟；没按过的那一天跟从前一样只有那颗按钮。
// ---------------------------------------------------------------------------
const PRESSED_AT = at(0, 20, 7)
const BANNED_REC = (id, from, to, minutes) => ({
  id, startedAt: from, endedAt: to, minutes, actions: 1,
  tags: ['改文件'], counts: { 改文件: 1 }, files: ['D:\\x\\a\\a.js'],
  ticks: [{ at: from, actions: 1, counts: { 改文件: 1 }, files: ['D:\\x\\a\\a.js'], fails: 0, tags: ['改文件'] }],
})
const START_STORE = (dayStart, records) => ({ since: at(3, 0, 0), seam: null, dayStart, records })

// ① 今天 20:00、20:05 两条 + 起点 20:07：一条都不铺（那两条都是按下之前就结束的）。
// 本地那枚「今天按过」的标记这里故意空着（按下那一刻宿主那条路由还没回来），
// 所以画面上该是**只有那颗按钮**——起点只由 dayStart 说了算。
const beforeStartStorage = freshStore()
beforeStartStorage.removeItem('dsh.gameflow.started')
const beforeStartGf = createGameflow({
  loadRecords: () => START_STORE(PRESSED_AT, [
    BANNED_REC('b-1', at(0, 19, 55), at(0, 20, 0), 5),
    BANNED_REC('b-2', at(0, 20, 0), at(0, 20, 5), 5),
  ]),
  now: () => at(0, 20, 9),
  storage: beforeStartStorage,
})
beforeStartGf.mount()
const beforeStartHost = hostNow()
check('按下之前攒的那几条一概不铺（起点之前就结束的记录一条都不算）',
  beforeStartHost.all('gf-row').length === 0 && beforeStartHost.all('gf-start').length === 1,
  `${beforeStartHost.all('gf-row').length} 行 / 按钮 ${beforeStartHost.all('gf-start').length} 个`)
beforeStartGf.destroy()

// ② 起点 20:07，20:09 有一次工具调用：20:10 之前仍是空，跨过 20:10 才出现「今天 20:10」那一格。
const firstCellStore = START_STORE(PRESSED_AT, [
  BANNED_REC('c-1', at(0, 20, 9), at(0, 20, 9), 1),
])
let firstCellNow = at(0, 20, 9)
const firstCellGf = createGameflow({
  loadRecords: () => firstCellStore,
  now: () => firstCellNow,
  storage: freshStore(),
})
firstCellGf.mount()
const firstCellHost = hostNow()
check('按下之后、整五分钟还没到：见闻录仍是空的（第一行不落在按下那一刻）',
  firstCellHost.all('gf-row').length === 0, `${firstCellHost.all('gf-row').length} 行`)
firstCellNow = at(0, 20, 11)
await firstCellGf.refresh()
const firstCellWhens = firstCellHost.all('gf-when').map((e) => e.textContent).join(' | ')
check('跨过下一个整五分钟才落第一格，且写的是那一格（今天 20:10）',
  firstCellHost.all('gf-row').length === 1 && /20:10/.test(firstCellWhens) && !/20:09/.test(firstCellWhens),
  `${firstCellHost.all('gf-row').length} 行：${firstCellWhens}`)
firstCellGf.destroy()

// ③ 没按过的那一天：跟从前一模一样——只有那颗按钮，一格都不铺。
const neverStarted = freshStore()
neverStarted.removeItem('dsh.gameflow.started')
const neverStartGf = createGameflow({
  loadRecords: () => START_STORE(0, [BANNED_REC('d-1', at(0, 16, 0), at(0, 16, 25), 25)]),
  now: () => NOW,
  storage: neverStarted,
})
neverStartGf.mount()
const neverStartHost = hostNow()
check('没按过「开始冒险」的一天：只有那颗按钮，一格都不铺',
  neverStartHost.all('gf-row').length === 0 && neverStartHost.all('gf-start').length === 1
    && neverStartHost.all('gf-list-before-start').length === 1,
  `${neverStartHost.all('gf-row').length} 行 / 按钮 ${neverStartHost.all('gf-start').length} 个`)
neverStartGf.destroy()

// ④ 升级那一天：本地那枚标记是**今天**（老版本按过、记下的），可存档是 8 时代的样子——
// 有 `version`、没有 `dayStart`。这时不能认旧账，否则他打开就又看见按下之前那几行
// （用户 m04200 报的就是这个：刚点开就已经有两条冒险在里面了）。
const upgradeStore = freshStore() // 默认就写着「今天已经按过」
const upgradeGf = createGameflow({
  loadRecords: () => ({
    version: STORE_VERSION,
    since: at(3, 0, 0),
    seam: null,
    records: [BANNED_REC('u-1', at(0, 19, 55), at(0, 20, 0), 5)],
  }),
  now: () => NOW,
  storage: upgradeStore,
})
upgradeGf.mount()
const upgradeHost = hostNow()
check('升级那天：存档里没有 dayStart 就不认本地那枚旧标记（仍然只有按钮、一格不铺）',
  upgradeHost.all('gf-row').length === 0 && upgradeHost.all('gf-start').length === 1
    && upgradeHost.all('gf-list-before-start').length === 1,
  `${upgradeHost.all('gf-row').length} 行 / 按钮 ${upgradeHost.all('gf-start').length} 个`)
upgradeGf.destroy()

/* 地方图的机器自查（2026-10-27，地图审计 M-2）：20 扇窗逐个跑 `src/map/local.js` 的
   `check(focus)`——镇子在陆上 / 取景框不出世界 / 城在框里 / 夜罩最后一条 / 窗里每座城
   都有自己的名字牌。原来这条只活在 `.scratch/wire.mjs` 之外的临时脚本里，20 扇里有
   15 扇丢名字（29 个，连焦点城也丢），没人发现。 */
for (const [city] of LOCAL_FOCUS) {
  const [bad, len] = localCheck(city)
  check(`地方图 ${city}：镇子在陆上、框不出世界、夜罩收尾、城名都写出来了`,
    bad.length === 0, bad.length ? bad.join(' / ') : `${len} 字节`)
}

/* 世界图的机器自查（2026-10-30，地图审计 M-4/M-5/M-9/M-13/M-14/M-15）。
   六条：① 面板那枚地名签的框跟世界图那块牌子用的是同一条算式（`plate_rect`）；
   ② 十三枚签和图上已有的字与记号几乎不压（压的按面积算，≤3 枚）；
   ③ 六处野地各有记号；④ 四块陆地各有底色；⑤ 一级国名不小于 1.22；⑥ 都城落在数据坐标上。 */
const mapWorld = await import('../src/map/world.js')
if (HAVE_MAP_FIXTURE) {
  const { places: MAP_PLACES } = await import('../src/packs/adventure/world.js')
  const { view: MAP_VIEW } = await import('../src/packs/adventure/world.js')
  const { NATIONS: MAP_NATIONS } = await import('../src/map/world3.js')
  const view = MAP_VIEW || { x: 0, y: 0, w: 66, h: 34 }

  // ① 同一条算式：`plate_rect` 与面板那块碑 bg 的宽高一致，基线也对得上。
  const probe = mapWorld.placeLabel(0, 0, '银树城', mapWorld.PLACE_FS, { x: -100, y: -100, w: 400, h: 400 })
  const wantW = probe[2] - probe[0]
  const wantH = probe[3] - probe[1]
  const panel = hostNow()
  const bgEl = panel && panel.querySelector('.gf-place-bg')
  const txEl = panel && panel.querySelector('.gf-place-text')
  const gotFs = txEl ? Number(txEl.getAttribute('font-size')) : 0
  const wantAt = mapWorld.placeLabel(0, 0, txEl ? txEl.textContent : '', gotFs, { x: -100, y: -100, w: 400, h: 400 })
  check('面板那枚地名签跟世界图那块牌子用同一条算式（M-14）',
    Boolean(bgEl) && Math.abs(Number(bgEl.getAttribute('width')) - (wantAt[2] - wantAt[0])) <= 0.12
    && Math.abs(Number(bgEl.getAttribute('height')) - (wantAt[3] - wantAt[1])) <= 0.12
    && Math.abs(Number(txEl.getAttribute('y')) - (Number(bgEl.getAttribute('y')) + gotFs * 1.37)) <= 0.06,
    bgEl && `${txEl.textContent} ${bgEl.getAttribute('width')}×${bgEl.getAttribute('height')} fs=${gotFs} 期望 ${wantAt[2] - wantAt[0]}×${wantAt[3] - wantAt[1]}（样签 ${wantW}×${wantH}）`)

  // ② 地名签的落点（2026-10-31 改口径）。
  //
  // 原来的判据是「压住图上字与记号的枚数 ≤ 2」（M-4 / t24）——那时签子的毛病是
  // 太大、太不透明，压住别人的字看着像坏了。可这一轮用户报的是**另一头**：
  // 「他的屋子」那枚签落到了**离记号 16 格**的地方，而它存在的全部意义就是指出他在哪。
  // 签离记号十几格，等于没有签。
  //
  // 所以判据换成三件事，按重要性排：
  //   · 每一枚都贴着记号（≤ 9 格）——**新加的主判据**；
  //   · 没有一块地图牌子被别人盖掉超过 35%（改前最狠那块盖到 63%，字基本没了）；
  //   · 压住的总面积别失控（≤ 10 平方世界单位）。
  // 配套：签字底板从 0.72 提到 0.9，压住的那点字透不上来——这两件事是连着的。
  let worstDist = 0
  let worstDistName = ''
  let worstCover = 0
  let worstCoverName = ''
  let pressedArea = 0
  for (const key of Object.keys(MAP_PLACES)) {
    const one = MAP_PLACES[key]
    const rect = mapWorld.placeLabel(one.door[0], one.door[1], one.name.adventure, mapWorld.PLACE_FS, view)
    const dist = Math.hypot((rect[0] + rect[2]) / 2 - one.door[0], (rect[1] + rect[3]) / 2 - one.door[1])
    if (dist > worstDist) { worstDist = dist; worstDistName = one.name.adventure }
    for (const b of mapWorld.textBoxes()) {
      const ox = Math.min(rect[2], b[4]) - Math.max(rect[0], b[2])
      const oy = Math.min(rect[3], b[5]) - Math.max(rect[1], b[3])
      if (ox > 0.05 && oy > 0.05) {
        const o = ox * oy
        pressedArea += o
        const own = (b[4] - b[2]) * (b[5] - b[3])
        const cover = own > 0 ? o / own : 0
        if (cover > worstCover) { worstCover = cover; worstCoverName = b[0] }
      }
    }
  }
  check('十三枚地名签都贴着记号（≤ 9 格；改前最远 16 格）', worstDist <= 9,
    `最远 ${worstDist.toFixed(2)} 格：${worstDistName}`)
  check('没有一块地图牌子被地名签盖掉超过 35%', worstCover <= 0.35,
    `最狠 ${(worstCover * 100).toFixed(0)}%：${worstCoverName}｜压住总面积 ${pressedArea.toFixed(2)}`)
  check('地名签压住的总面积不失控（≤ 10 平方世界单位）', pressedArea <= 10, pressedArea.toFixed(2))

  // ③ 六处野地都有记号（M-5：改前只有「奇观」八处，野地一枚也没有）。
  const wildKeys = ['ruin', 'frost', 'mine', 'quench', 'tower', 'watch']
  const svgNow = MAP_SVG || ''
  const wildHits = wildKeys.filter((k) => svgNow.includes(`gf-wild-${k}`))
  check('六处野地各自有记号（M-5）', wildHits.length === wildKeys.length, `${wildHits.length}/6`)

  // ④ 四块陆地各有底色（M-9：改前四块共用一张 `grasstex`）。
  const landHits = ['west', 'north', 'east', 'isles'].filter((k) => svgNow.includes(`url(#grasstex-${k})`))
  check('四块陆地名下的底色各不相同（M-9）', landHits.length === 4, `${landHits.length}/4`)

  // ⑤ 国名的字号（2026-10-31：t24 抬到 1.06、t30 按真实宽度改成 1.11、t35 收到真宿主口径 1.13）。
  //
  //    **这一段只证「源码常数」，不证几何。** 分工写在最前面，别再往这里塞几何断言：
  //    - **几何归 `scripts/look.mjs`**：它在真无头 Edge 里用 `getBoundingClientRect` 量
  //      「地图本体宽 = 面板宽 − 左右留白（左 22、右 22 + 滚动条空档）− 左右各 1px 边框」
  //      「每单位多少 px」「二级国名等效字号 ≥ 8.5px」「一级 ≥ 9px」，四个尺寸各量一次；
  //      字号那几条还按**两个分母**各判一遍（当页实测宽 + 真宿主最窄 499px）。真几何一变，那里会红。
  //    - **smoke 是手搓的 DOM 垫片，没有排版能力**：`getBoundingClientRect` 可能压根没有，
  //      `clientWidth` 给的是 350 这种假数。所以这里**不再「试着量一下、量不到退回常量」**——
  //      那种写法看着在量事实，实际在比常数（t31 复核点名的就是它）。
  //
  // 这里能证的只有两件真事：① 源码里的 `NATION_FS` 与期望一致（改回旧值就红）；
  // ② 拿 look.mjs 四尺寸实测的地图本体宽当分母，等效字号够 8.5 / 9。
  // ⚠ 分母 508 是**预览页**的地图宽；真宿主滚动条是 15px（不是 6px），那里只有 499px，
  //    所以「真宿主也够 8.5」这件事只能由 look.mjs 按两个分母判，本文件不代劳。
  const MAP_WIDTH_PX = 508 // look.mjs 四尺寸实测（面板 560 − 左 22 − 右 22+6 滚动条空档 − 边框 2 = 508）
  const FRAME_W = 66
  // 字号从 `src/map/world.js` 的源码里读（`NATION_FS` 是模块私有常量，不为了自检改成导出）。
  const worldSrc = readFileSync(new URL('../src/map/world.js', import.meta.url), 'utf8')
  const fsPair = /const NATION_FS = \{ 1: ([\d.]+), 2: ([\d.]+) \}/.exec(worldSrc)
  const fs1 = fsPair ? Number(fsPair[1]) : NaN
  const fs2 = fsPair ? Number(fsPair[2]) : NaN
  check('源码里的国名字号是 一级 1.22 / 二级 1.13（smoke 只证常数，几何归 look.mjs）',
    fs1 === 1.22 && fs2 === 1.13, `读到 ${fsPair ? `${fsPair[1]} / ${fsPair[2]}` : 'NATION_FS 没解析出来'}`)
  const t1px = (fs1 * MAP_WIDTH_PX) / FRAME_W
  const t2px = (fs2 * MAP_WIDTH_PX) / FRAME_W
  const szTag = (fs) => fs.toFixed(2)
  const nationSizes = [...svgNow.matchAll(/font-size="(1\.\d\d|0\.\d\d)"/g)].map((m) => m[1])
  const t1Count = nationSizes.filter((v) => v === szTag(fs1)).length
  const t2Count = nationSizes.filter((v) => v === szTag(fs2)).length
  check(`国名放大了：一级 ${szTag(fs1)}、二级 ${szTag(fs2)}（M-13 / t24 / t30）`,
    t1Count >= 11 && t2Count >= 8 && nationSizes.filter((v) => v === '0.92').length === 0,
    `${szTag(fs1)} × ${t1Count} / ${szTag(fs2)} × ${t2Count} / 0.92 × ${nationSizes.filter((v) => v === '0.92').length}`)

  // ⑤之二 等效字号（**算式层面**）：字号 × 地图本体宽 / 取景框宽 ≥ 8.5px。
  // 分母 508 抄自 look.mjs 四尺寸实测（预览页口径）；**真几何对不对由 look.mjs 断言，这里不量**。
  // 真宿主是 499px（滚动条 15px），1.13 × 499 / 66 = 8.54px 也过——那一半由 look.mjs 判。
  check(`二级国名等效字号 ≥ 8.5px（${szTag(fs2)} × ${MAP_WIDTH_PX} / ${FRAME_W} = ${t2px.toFixed(2)}px，t30/t35）`,
    t2px >= 8.5, `${t2px.toFixed(2)}px（分母用 look.mjs 实测常量 ${MAP_WIDTH_PX}px；几何本身归 look.mjs）`)
  check(`一级国名等效字号 ≥ 9px（${szTag(fs1)} × ${MAP_WIDTH_PX} / ${FRAME_W} = ${t1px.toFixed(2)}px，t30）`,
    t1px >= 9, `${t1px.toFixed(2)}px`)
  check('图上那些国名牌用的就是这两个字号（baked SVG 与 NATION_FS 不许脱节，t30）',
    svgNow.includes(`font-size="${szTag(fs1)}"`) && svgNow.includes(`font-size="${szTag(fs2)}"`),
    `找 ${szTag(fs1)} / ${szTag(fs2)}`)
  check('二级国名没有被抽稀掉（相压为 0 时九块都画得出来，t24）',
    mapWorld.nationSkips().length === 0 && t2Count === 9,
    `抽掉 ${mapWorld.nationSkips().length} 块${mapWorld.nationSkips().length ? '：' + mapWorld.nationSkips().map((s) => s[0]).join(' ') : ''}`)

  // ⑤之三 图上没有任何两块牌/记号互相压住（t24：从前自述 3 处、实为 3 处，现在必须 0）。
  const collideCount = (() => {
    const log = console.log
    const lines = []
    console.log = (...a) => lines.push(a.join(' '))
    mapWorld.check()
    console.log = log
    return lines.filter((l) => l.startsWith('！压住')).length
  })()
  check('图上没有两块牌子/记号压在一起（世界自查 check() 为 0，t24）', collideCount === 0, `相压 ${collideCount} 处`)

  // ⑥ 都城记号就画在数据给的坐标上（M-15：改前一律是「国名落点 + 固定偏移」）。
  const offs = MAP_NATIONS.map((row) => {
    const [cname, cx, cy] = row[6]
    const [kx, ky] = mapWorld._cap_at(cname, row[5][0], row[5][1], row[6][3], cx, cy)
    return Math.max(Math.abs(kx - cx), Math.abs(ky - cy))
  })
  check('二十座都城都画在数据坐标上（M-15）', offs.every((d) => d < 0.01),
    `最大偏差 ${Math.max(...offs).toFixed(2)} 格`)
}

/* --- 门框上那枚惊叹号：亮 = 有一处命运正等你决定，且见闻录为此停住 -------------
 * 用户 m04298 第 2 条原话：「还是有之前的那个问题：即门上有感叹号，但是查看的时候却没有选择；
 * 或者是有感叹号，但是已经跑过了选择的落盘。正确的是，当有感叹号的时候，意味着有一个命运选择的
 * 时候需要用户来做出，界面会一直停在这个地方等待用户做出选择，否则不会有新的落盘。」
 *
 * 唯一标准：**记号亮着 ⇔ 屏幕上真摆着一对可点的选项**。从前记号有两个来源——门收着时
 * `refreshBadge` 自己算一遍、门开着时读 `renderTimeline` 的 `pending`；两处闸门不一样
 * （收着那一支不认幕布、不重读挑过的账），于是出现「门上有感叹号，推开门却没有选项」
 * 与「有感叹号，可那一挑早跑完了」。现在 `refreshBadge` 也照见闻录那台机器真画一遍、
 * 读同一个数，下面四条就是钉住这件事的。
 * ------------------------------------------------------------------ */
{
  const hostNow = () => [...document.body.children].filter((c) => 'data-dsh-gameflow' in c.attributes).pop()
  const badgeOn = (host) => {
    const one = host.all('gf-door-badge')[0]
    return !!one && one.hidden === false
  }
  const liveCount = (host) => host.all('gf-choice-live').length
  // 一份会摆出岔口的今天：凌晨撞过墙那一段（fails 4）+ 刚落定的那一格。
  const forkDays = () => MISS_DAYS.map((one) => ({ ...one }))
  // 跨午夜那张卡：昨天 23:50 坐下、今天 00:10 才收笔（用户 m04298 说的那两种情形都要撞一遍）。
  const crossDays = () => ([
    ...forkDays(),
    {
      id: 't14-cross', startedAt: at(1, 23, 50), endedAt: at(0, 0, 10), minutes: 10,
      tags: ['改文件'], counts: { 改文件: 2 }, fails: 0,
      ticks: [foldTick(1, 23, 55, 1), foldTick(0, 0, 5, 1)],
    },
  ])

  // ① 按下「开始冒险」之前就有记录的那一份：存档是从老版本升上来的（带 `version`、没有
  //    `dayStart`），本地还留着 8 时代那枚「今天按过」的旧标记。见闻录这时候是幕布，
  //    屏幕上一对按钮都没有——门上的记号也就不该亮（这条在旧代码上是红的）。
  const staleGf = createGameflow({
    loadRecords: () => ({ version: STORE_VERSION, since: at(3, 0, 0), seam: null, records: forkDays() }),
    now: () => NOW,
    storage: freshStore(),
  })
  staleGf.mount()
  await tick()
  const staleHost = hostNow()
  await staleGf.refreshBadge()
  const staleClosed = badgeOn(staleHost)
  staleGf.open()
  await tick()
  await staleGf.refresh()
  const staleOpen = badgeOn(staleHost)
  const staleLive = liveCount(staleHost)
  check('记号与选项同生同死（一）：按下「开始冒险」之前那份存档——门收着不亮，推开门也没有选项',
    staleClosed === false && staleOpen === false && staleLive === 0,
    `收着 亮=${staleClosed}，开着 亮=${staleOpen} / 选项=${staleLive}`)
  staleGf.destroy()

  // ② 同一份记录、两条路：门收着算出来的数必须等于推开门屏幕上真摆着的那一对。
  let sameNow = NOW
  const sameGf = createGameflow({
    loadRecords: () => crossDays(),
    now: () => sameNow,
    storage: freshStore(),
  })
  sameGf.mount()
  await tick()
  const sameHost = hostNow()
  await sameGf.refreshBadge()
  const sameClosed = badgeOn(sameHost)
  sameGf.open()
  await tick()
  await sameGf.refresh()
  const sameOpen = badgeOn(sameHost)
  const sameLive = liveCount(sameHost)
  check('记号与选项同生同死（二）：同一份记录，门收着与门开着得出同一个数（亮 ⇔ 有选项）',
    sameClosed === sameOpen && sameOpen === (sameLive > 0) && sameLive >= 1,
    `收着 亮=${sameClosed}，开着 亮=${sameOpen} / 选项=${sameLive}`)

  // ③ 停住：钟往前推三个整五分钟，一行都不许新增，那一对选项还在原位
  //    （用户 m14810 第 5 条：「界面就停在这个地方等用户来选择」）。
  const rowsBefore = sameHost.all('gf-row').length
  const rowAt = () => sameHost.all('gf-row').findIndex((r) => r.all('gf-choice-live').length === 1)
  const liveRowBefore = rowAt()
  sameNow = NOW + 15 * 60 * 1000
  await sameGf.refresh()
  const rowsAfter = sameHost.all('gf-row').length
  const liveRowAfter = rowAt()
  check('摆着选项时把钟往前推三个整五分钟：一行都不新增，那一对选项还在原位',
    rowsAfter === rowsBefore && liveCount(sameHost) >= 1 && liveRowAfter === liveRowBefore,
    `${rowsBefore} → ${rowsAfter} 行 / 选项在第 ${liveRowBefore + 1} → ${liveRowAfter + 1} 行`)

  // ④ 挑完：记号立刻灭，再刷新两次也不会自己亮回来；那一截立刻照原样铺开。
  sameHost.all('gf-choice-live')[0].all('gf-choice-pick')[0].dispatch('click')
  await tick()
  await sameGf.refresh()
  const afterPickLive = liveCount(sameHost)
  const badgeRightAfter = badgeOn(sameHost)
  const doneSegments = sameHost.all('gf-choice-done').length
  const forkLines = sameHost.all('gf-fork-line').length
  await sameGf.refresh()
  await sameGf.refresh()
  const badgeLater = badgeOn(sameHost)
  check('挑完之后记号立刻灭，再刷新两次也不会自己亮回来（记号亮 = 真的还有一处没挑）',
    afterPickLive === 0 && badgeRightAfter === false && badgeLater === false,
    `选项=${afterPickLive} / 立刻 亮=${badgeRightAfter} / 两次之后 亮=${badgeLater}`)
  check('挑完之后那一截立刻照原样铺开（不再停住）',
    doneSegments === 1 && forkLines >= 2 && sameHost.all('gf-row').length >= rowsBefore,
    `${doneSegments} 段走完的 / ${forkLines} 句命运 / ${sameHost.all('gf-row').length} 行`)
  sameGf.destroy()
}


// 红线 14 的禁词表真有牙（2026-10-31，用户 m04298 第 1 条）。
// 只验「表里非空」是没有意义的——那条断言在表被清空、或者判定被短路时照样绿。
// 所以这里走 `scripts/packs.mjs --probe`：它是**同一条判定**（scanRedline14），
// 塞一句带禁词的进去必须报命中，塞一句干净的必须报 0。
{
  const probe = (text) => {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./packs.mjs', import.meta.url)), '--probe', text], { encoding: 'utf8' })
    return { status: run.status, stdout: String(run.stdout || '') }
  }
  const bad = probe('他推门进客栈，柜上的掌柜抬起头。')
  const good = probe('店主擦着碗说，北边来的人这回绕了远路。')
  check('红线 14 的禁词表真有牙：塞一句「进入客栈、掌柜抬头」进去必须抓到（中式铺面那一路）',
    bad.status !== 0 && bad.stdout.includes('R23 自检：') && bad.stdout.includes('掌柜') && bad.stdout.includes('客栈')
    && /R23 自检：([1-9]\d*) 处/.test(bad.stdout),
    `退出 ${bad.status} / ${bad.stdout.trim().split('\n').slice(-1)[0] || '（没有输出）'}`)
  check('红线 14 的禁词表不误伤：同一句里换成「店主」就该一声不响',
    good.status === 0 && good.stdout.includes('R23 自检：0 处'),
    `退出 ${good.status} / ${good.stdout.trim().split('\n').slice(-1)[0] || '（没有输出）'}`)
}

// 命运得是真的两难（2026-10-31，用户 m04344 那句「一个救那箱纸、一个救人，那不是就是让人去
// 救人吗？也就是选择没有意义，因为根本不会两难」）。跟红线 14 一个办法：走 `--probe-forks`
// 喂一件**故意写坏的** fork（按钮写「别管」、look 只有一句、句子里把代价说了），它必须当场抓到；
// 同时把仓库里真在用的那三件逐条过一遍——判据的权威版本在 `scripts/packs.mjs` 的
// `scanForkRoads`，这里只验「产出的数据没回过味来」。
{
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./packs.mjs', import.meta.url)), '--probe-forks'], { encoding: 'utf8' })
  const stdout = String(run.stdout || '')
  check('命运的机器判据真有牙：按钮写「别管」、look 只有一句、句子里说「代价」，三样都得抓到',
    run.status === 0 && /R22 自检：坏样本 ([3-9]|\d\d+) 处 \/ 干净样本 0 处/.test(stdout),
    `退出 ${run.status} / ${stdout.trim().split('\n').slice(-1)[0] || '（没有输出）'}`)

  const judge = ['别管', '不管', '见死不救', '袖手', '少管闲事', '自扫门前雪', '事不关己']
  const ledger = ['代价', '风险', '会失去']
  const { forks } = await import('../src/packs/adventure/forks.js')
  const roads = (forks || []).flatMap((fork) => (fork.roads || []).map((road) => ({ fork: fork.id, road })))
  const judged = roads.filter(({ road }) => judge.some((w) => String(road.label || '').includes(w)))
  const shortLook = roads.filter(({ road }) => !Array.isArray(road.look) || road.look.length < 2)
  const leaked = roads.filter(({ road }) => (road.look || []).some((t) => ledger.some((w) => String(t).includes(w))))
  check('命运的按钮都不自带审判（「别管」那一路已经改成只说做什么）',
    judged.length === 0,
    judged.map(({ fork, road }) => `${fork}/${road.id}: ${road.label}`).join(' / ') || `${roads.length} 条路都干净`)
  check('命运的两条路各给两句理由是必须的：少一句就红',
    shortLook.length === 0,
    shortLook.map(({ fork, road }) => `${fork}/${road.id}: ${(road.look || []).length} 句`).join(' / ') || '每条路都是两句')
  check('命运那两句理由里一个字都不许把账摊开（「代价/风险/会失去」）',
    leaked.length === 0,
    leaked.map(({ fork, road }) => `${fork}/${road.id}`).join(' / ') || '没有一句提到代价')
}

/* ------------------------------------------------------------------ *
 * 册子上的十一站：每一站都得**真能走到**（2026-10-31，t19）
 *
 * 2026-10-31 之前有两站挂在同一个地方：`sunken`（灰港 / 沉桥）与 `sea`（珊瑚海国 / 海底）
 * 都挂 `quench`（河湾）。`stationOf` 是**从最后一站往前**找第一个条件全中的，所以去一趟河湾
 * 两站同时成立、靠前那一站（灰港）**永远轮不到**——册子上的第六站等于不存在，人还没出海，
 * 第十站（海底）先亮了。
 *
 * 这里四条判据，防的都是「下一次」：
 *   ① 逐站验可达：按这一站自己的条件造一份最小见证，`stationOf` 必须落回**这一站**；
 *   ② 珊瑚海国单独立一条（它就是被吃掉的那一站）；
 *   ③ 两站的条件**不许等价**——等价时靠前那站永远轮不到，这一条比修好某一站更值钱；
 *   ④ 站名是真地名：世界图上查得到，或者世界包里那七处屋子的名字（`界碑镇` 是他出发的镇子，
 *      比地图上的城小、世界图上没有它的牌子，来处在 `叙事/世界观.md` 第七、八节——所以是**明写的例外**）。
 * ------------------------------------------------------------------ */
{
  const { stationOf } = await import('../src/packs/rules.js')
  const { journey: JOURNEY_NOW } = await import('../src/packs/adventure/journey.js')
  const { places: PLACES_NOW } = await import('../src/packs/adventure/world.js')
  const world3 = await import('../src/map/world3.js')
  const STATIONS = JOURNEY_NOW.stations || []

  // 野地那六处「地方」与「景」是同一件事的两面：人到了河湾，`places` 里有 quench，
  // 那一格挑中的 `sceneKey` 也是 quench（见包里 scenes 的 `place` 字段）。造见证时必须一起加，
  // 否则会得出「改前灰港到得了」这种假结论。
  const WILD_NOW = new Set(['ruin', 'frost', 'mine', 'quench', 'tower', 'watch'])
  const witness = (one) => {
    const facts = {
      places: new Set(), scenes: new Set(), hours: new Set(),
      fails: 0, minutes: 0, helpers: 0, actions: 0, files: 0, deliverables: [],
    }
    const put = (key, isPlace) => {
      if (isPlace) facts.places.add(key)
      facts.scenes.add(key)
      if (WILD_NOW.has(key)) facts.places.add(key)
    }
    for (const term of one.when || []) {
      if (term.when === 'places') for (const p of term.has || []) put(p, true)
      else if (term.when === 'scenes') for (const k of term.has || []) put(k, false)
      else if (term.when === 'hours') facts.hours.add((term.in || [[0, 1]])[0][0])
      else if (term.when === 'fails') facts.fails = Math.max(facts.fails, Number(term.gte ?? 1))
      else if (term.when === 'minutes') facts.minutes = Math.max(facts.minutes, Number(term.gte ?? 1))
      else if (term.when === 'helpers') facts.helpers = Math.max(facts.helpers, Number(term.gte ?? 1))
      else if (term.when === 'actions') facts.actions = Math.max(facts.actions, Number(term.gte ?? 1))
      else if (term.when === 'files') facts.files = Math.max(facts.files, Number(term.gte ?? 1))
      else if (term.when === 'deliverables') {
        const need = Math.max(1, Number(term.gte ?? 1))
        facts.deliverables = Array.from({ length: need }, (_, i) => `w${i}.md`)
      }
    }
    return facts
  }
  const dead = STATIONS.filter((one) => (one.when || []).length && stationOf(witness(one), STATIONS) !== one)
  const bare = STATIONS.filter((one) => !(one.when || []).length)
  check('当日计划：册子上十一站**每一站都真能走到**（按各站自己的条件造一天，走得最远的那一处正是它）',
    STATIONS.length === 11 && bare.length === 1 && dead.length === 0,
    dead.length
      ? dead.map((one) => `${one.id}(${one.label}) → ${(stationOf(witness(one), STATIONS) || {}).id || '（没有）'}`).join(' / ')
      : `${STATIONS.length} 站：兜底 ${bare[0] ? bare[0].id : '（没有）'}，其余 ${STATIONS.length - bare.length} 站各自可达`)

  // ② 就是被吃掉的那一站：去一趟河湾，算的是珊瑚海国（第十站）；而灰港（第六站）在自己那一天
  //   也真出现过——两站从此各归各的，不再互相遮。
  const seaOne = STATIONS.find((one) => one.id === 'sea') || null
  const sunkenOne = STATIONS.find((one) => one.id === 'sunken') || null
  const seaHit = seaOne ? stationOf(witness(seaOne), STATIONS) : null
  const sunkenHit = sunkenOne ? stationOf(witness(sunkenOne), STATIONS) : null
  check('当日计划：册子第十站（珊瑚海国）真到得了——去一趟河湾算的是它，第六站（灰港）也不再被盖住',
    !!seaOne && !!sunkenOne && seaHit === seaOne && sunkenHit === sunkenOne,
    `${seaOne ? `河湾 → ${seaHit ? `${seaHit.id}(${seaHit.label})` : '（没有）'}` : '（包里没有 sea 那一站）'}`
    + ` · ${sunkenOne ? `废塔 → ${sunkenHit ? `${sunkenHit.id}(${sunkenHit.label})` : '（没有）'}` : '（包里没有 sunken 那一站）'}`)

  // ③ 两站的条件不许等价、也不许一站的落点被后面那站整个盖住。
  //    「盖住」比「等价」更宽：`A` 只挂 quench、`B` 挂 quench + tower，那么任何让 `A` 成立的那天
  //    都让 `B` 成立，而 `stationOf` 先问靠后的 `B` ⇒ `A` 永远轮不到。所以判的是**子集**，不是相等。
  const forced = (one) => {
    const keys = new Set()
    let pure = true
    for (const term of one.when || []) {
      if (term.when === 'places' || term.when === 'scenes') {
        for (const key of term.has || []) keys.add(`${term.when}:${key}`)
      } else pure = false
    }
    return { keys, pure }
  }
  const shaded = []
  for (let i = 0; i < STATIONS.length; i += 1) {
    const a = forced(STATIONS[i])
    if (!a.keys.size || !a.pure) continue
    for (let j = i + 1; j < STATIONS.length; j += 1) {
      const b = forced(STATIONS[j])
      if (!b.keys.size || !b.pure) continue
      if (Array.from(a.keys).every((key) => b.keys.has(key))) shaded.push(`${STATIONS[i].id} ⊂ ${STATIONS[j].id}`)
    }
  }
  check('当日计划：册子上没有哪一站的落点被后面那站整个盖住（盖住＝它永远轮不到，正是河湾那次事故）',
    shaded.length === 0,
    shaded.length ? shaded.join(' · ') : `${STATIONS.filter((one) => (one.when || []).length).length} 站的条件两两不包含`)

  // ④ 站名是真地名（世界图 / 世界包 / 明写的例外）。
  const mapNames = new Set()
  for (const row of world3.NATIONS || []) {
    if (!Array.isArray(row)) continue
    if (typeof row[0] === 'string') mapNames.add(row[0])
    if (Array.isArray(row[6]) && typeof row[6][0] === 'string') mapNames.add(row[6][0])
  }
  for (const row of world3.LABELS || []) if (Array.isArray(row) && typeof row[0] === 'string') mapNames.add(row[0])
  for (const key of Object.keys(world3.SHORT || {})) mapNames.add(key)
  const placeNames = new Set()
  for (const one of Object.values(PLACES_NOW || {})) {
    for (const voice of Object.keys(one.name || {})) placeNames.add(one.name[voice])
  }
  // 他出发的那座镇子：世界图上没有它的牌子（比城小），出处是 `叙事/世界观.md` 第七、八节。
  const HOME_TOWN = '界碑镇'
  const empty = STATIONS.filter((one) => one.label !== HOME_TOWN
    && !mapNames.has(one.label) && !placeNames.has(one.label))
  check('当日计划：册子上每一站的地名都是这世界里真有的（世界图上查得到，或世界包里那几处屋子的名字）',
    empty.length === 0 && STATIONS.some((one) => one.label === HOME_TOWN),
    empty.length ? empty.map((one) => `${one.id}(${one.label})`).join(' / ') : `${STATIONS.length} 站都对得上（${HOME_TOWN} 是他出发的镇子，明写例外）`)

  // 站挂的地点键必须在世界包里（打错一个字母就一直落在第一站，谁也不报错）。
  const unknownKeys = []
  for (const one of STATIONS) {
    for (const term of one.when || []) {
      if (term.when !== 'places') continue
      for (const key of term.has || []) if (!PLACES_NOW || !PLACES_NOW[key]) unknownKeys.push(`${one.id}: ${key}`)
    }
  }
  check('当日计划：各站挂的地方都是世界包里真有的那几处（挂错键会永远落在第一站，且一声不响）',
    unknownKeys.length === 0,
    unknownKeys.join(' / ') || `${Object.keys(PLACES_NOW || {}).length} 处地方，键都认得出`)
}

/* ------------------------------------------------------------------ *
 * 2026-10-31（t28）：挂载时那一次长任务，与滚动取证仪表的三处读数。
 *
 * 背景（用户 m16xxx / t27 的 trace）：挂载那一刻 `buildStage()` 就把 554 KB、两千多
 * 个形状的整张世界图 `innerHTML` 进一棵 `display:none` 的树里，实测那次长任务
 * 260ms ParseHTML + 340ms EvaluateScript，而面板默认是收着的——绝大多数启动根本
 * 不会打开它。现在地图分两步：先建壳（类名照样先给），真面板等第一次开门再灌。
 * ------------------------------------------------------------------ */

// A. 地图可以「只建壳」，等第一次开门再灌（真面板走的就是这一路）。
{
  const eager = buildStage()
  const eagerShapes = eager.svg.all('gf-map')[0].children.length
  check('地图默认是建的时候就灌好：自检里那十几处直接调 buildStage() 的地方，行为一个字没变',
    eagerShapes > 1000,
    `${eagerShapes} 个孩子`)

  const lazy = buildStage({ deferMap: true })
  const lazyMap = lazy.svg.all('gf-map')[0]
  const shell = lazyMap.getAttribute('class')
  const filled = lazy.fillMap()
  const shapes = lazyMap.children.length
  const again = lazy.fillMap()
  const shapesAgain = lazyMap.children.length
  check('传 deferMap 就只建壳（那一层在、里面空着），fillMap() 只灌一次，第二次返回 false',
    shell === 'gf-map' && filled === true && shapes > 1000 && again === false && shapesAgain === shapes,
    `壳 class=${shell} / 第一遍 ${filled} → ${shapes} 个孩子 / 第二遍 ${again} → ${shapesAgain}`)
}

// B. 真面板：挂载时地图是空的，第一次开门才灌，那行「正在铺开地图…」跟着收。
{
  const stageGf = createGameflow({ loadRecords: () => START_LIVE, now: () => NOW, storage: startStub })
  stageGf.mount()
  const stageHost = hostNow()
  const mapIn = () => stageHost.all('gf-map')[0]
  const atMount = mapIn() ? mapIn().children.length : -1
  stageGf.open()
  await tick()
  await tick()
  const afterOpen = mapIn() ? mapIn().children.length : -1
  const notes = stageHost.all('gf-stage-note')
  check('挂载时地图只建壳、不灌（554 KB 留给第一次开门，面板收着时不付这笔钱）',
    atMount === 0,
    `挂载后 ${atMount} 个孩子`)
  check('第一次开门之后地图灌好了，「正在铺开地图…」那行字收起来',
    afterOpen > 1000 && notes.length === 1 && notes[0].hidden === true,
    `开门后 ${afterOpen} 个孩子 / 过渡说明 ${notes.length} 条，hidden=${notes[0] && notes[0].hidden}`)
  stageGf.destroy()
}

// C. 取证仪表：两个观察器**都**装。从前是 if / else if，真机 Chromium 123+ 走第一支，
//    longtask 观察器一次都没装上，`tasks` 于是永远是空数组——t27 因此说不清那 300ms
//    到底是不是 JS 干的。
{
  const seen = []
  const realPO = globalThis.PerformanceObserver
  const realFetch = globalThis.fetch
  globalThis.PerformanceObserver = class {
    static supportedEntryTypes = ['event', 'long-animation-frame', 'longtask']
    constructor(cb) { this.cb = cb }
    observe(opts) { seen.push(opts && opts.type) }
    disconnect() {}
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ on: true }) })
  try {
    const watchGf = createGameflow({ loadRecords: () => START_LIVE, now: () => NOW, storage: startStub })
    watchGf.mount()
    await tick()
    await tick()
    await tick()
    watchGf.destroy()
  } finally {
    if (realPO === undefined) delete globalThis.PerformanceObserver
    else globalThis.PerformanceObserver = realPO
    if (realFetch === undefined) delete globalThis.fetch
    else globalThis.fetch = realFetch
  }
  check('滚动取证仪表把 LoAF 与 longtask 两个观察器都装上（从前是 if/else，tasks 永远是空的）',
    seen.includes('long-animation-frame') && seen.includes('longtask'),
    `装上的：${seen.join(' / ') || '（一个都没装）'}`)
}

// D. 读数口径（静态）：每一处时刻都是文档原点，缓冲丢了几个有计数，信封上带着可见性与焦点。
{
  const src = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const from = src.indexOf('function flushScrollWatch')
  const body = from < 0 ? '' : src.slice(from, from + 4200)
  check('取证信封写明原点、带上可见性与焦点、缓冲丢弃有计数（t28 第二、三处读数）',
    /origin: 'document'/.test(body)
      && /timeOrigin/.test(body)
      && /visibilityState/.test(body)
      && /hasFocus/.test(body)
      && /firstAt: Math\.round\(watch\.first\)/.test(body)
      && /dropped: \{ \.\.\.watch\.dropped \}/.test(body),
    `origin=${/origin: 'document'/.test(body)} / 可见性=${/visibilityState/.test(body)} / 焦点=${/hasFocus/.test(body)} / 丢弃计数=${/dropped: \{ \.\.\.watch\.dropped \}/.test(body)}`)
  check('滚动轨迹与帧用的是同一个钟：noteScroll 用 perfNow()，落下的 t 就是文档原点（不再减掉第一次）',
    /const t = perfNow\(\)/.test(src) && /watch\.path\.push\(\{ t: Math\.round\(t\)/.test(src),
    `perfNow=${/const t = perfNow\(\)/.test(src)} / 文档原点=${/watch\.path\.push\(\{ t: Math\.round\(t\)/.test(src)}`)
}

// —— t29：记号、涟漪、灯那一层是 HTML，世界→像素得自己算，量早了会偏 ——
{
  const src = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const hung = /stage\.appendChild\(stageHandle\.live\)/.test(src)
  const ttl = /const LIVE_BOX_TTL = \d+/.test(src)
  const settle = /liveSettleTimer = window\.setTimeout/.test(src)
  check('三处动静那一层挂在面板的定位容器里，量尺寸有保质期、开门排完版还会再量一次（t29）',
    hung && ttl && settle,
    `挂上了=${hung} / 保质期=${ttl} / 开门后再量=${settle}`)
}

const failed = results.filter((r) => !r.pass)
if (skipped.length) {
  console.log(`\n跳过了 ${skipped.length} 条（没有 .scratch/map-data.js 夹具）：`)
  for (const name of skipped) console.log(`  --   ${name}`)
}
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
