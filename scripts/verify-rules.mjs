/**
 * 证明「面板上的危险、世界句与抉择」=「包里写着的那套规矩」。
 *
 *   node scripts/verify-rules.mjs          （2026-10-08 从 .tmp-acp/ 搬来）
 *
 * 规矩是**数据**：数字住在 `src/packs/adventure/rules.js`，由 `src/packs/rules.js`
 * 那台机器读。2026-10-08 接线之后，面板算的与这里算的**是同一份数**（`client.js` 的
 * `dangerOf` 就是 `rules.js` 的 `dangerOf` 吃包里那份 `RULES`），所以「手抄时抄错一个
 * 9 或 12」这件事从根上不可能再发生——可另外两件事会发生，这一份就拦它们：
 *
 *   接线被拆掉（有人把数字写回 client.js）        → §1 红
 *   语义被改坏（漏判 `else`、忘了夹 `cap`、读错项）→ §1b 红
 *   世界句的桶算法与权重不一致                    → §2 红
 *
 * 各节各证什么：
 *   §1  接线网（2940 格）     面板 `dangerOf` 与机器 `dangerOf` 同一个数
 *   §1b 语义网（同 2940 格）  照机器头部写的语义**自己再算一遍**，与面板对上
 *   §2  世界句（58800 格）    面板挑出的那句确实落在我算出的桶里
 *   §3  散列（4000 条）       稳定散列自己重算一遍
 *   §4–§8 四档 / checkRules / 方向 / 选择点 / 归宿：判据都**自己重写了一遍**
 *         （机器里那几个函数没导出，只能重写——这反而更硬：写错了就对不上）
 *
 * 桩子：
 *   ../src/packs/rules.js                 读规矩的那台机器
 *   ../src/packs/adventure/rules.js       冒险者的事务所这一套数
 *   ../src/packs/index.js                 applyPack()——已经过 verify-packs.mjs 证明
 *                                         与 client.js 的活对象一字不差
 */
import assert from 'node:assert/strict'
import * as gf from '../src/client.js'
import { adventure } from '../src/packs/adventure/index.js'
import { applyPack } from '../src/packs/index.js'
import { rules } from '../src/packs/adventure/rules.js'
import { dangerOf, outcomeOf, worldBucket, hash, checkRules, directionOf, checkDirections } from '../src/packs/rules.js'

const HOURS = [0, 4, 5, 7, 8, 12, 19, 20, 22, 23]
const FAILS = [0, 1, 2, 3, 4, 6]
const MINS = [3, 5, 30, 60, 90, 120, 300]
const PLACES = [null, 'scriptorium', 'market', 'tavern', 'guild', 'workshop', 'archive']
const TAGS = [[], ['查资料'], ['派了活', '聊了聊'], ['翻文件'], ['改文件', '跑命令']]
const HELPERS = [[], ['帮手']]
const DELIV = [[], ['一份']]
const SCENES = ['', 'mine']

const at = (hour) => new Date(2026, 9, 8, hour, 0, 0).getTime()
const filled = applyPack({}, 'adventure', 'adventure')
let id = 0

// ── 1. dangerOf 的**接线**：整个格子（几点 × 几次报错 × 多久 × 在哪）
// 这一节证明面板还算着包里的数（不是 client.js 里那份写死的），语义另见 §1b。
let dangerCases = 0
for (const hour of HOURS) for (const fails of FAILS) for (const mins of MINS) for (const place of PLACES) {
  const entry = { id: `d${id++}`, startedAt: at(hour), minutes: mins, fails, counts: { 改文件: 3 } }
  const mine = dangerOf(entry, place, rules)
  const live = gf.dangerOf(entry, place)
  assert.equal(mine, live, `dangerOf(时=${hour} 错=${fails} 长=${mins} 地=${place})：我算 ${mine}，面板算 ${live}`)
  dangerCases++
}

// ── 1b. dangerOf 的**语义**：照 rules.js 头部写的规矩自己再算一遍
//
// 为什么 §1 不够：接线之后「面板算的」与「机器算的」是同一个函数吃同一份 `rules`，
// §1 只能抓住「有人把接线拆掉」，抓不住「机器把语义改坏」。所以这里不看机器怎么写的，
// 只照它头部那张表说的意思重写一遍：项 → 中不中 / 加多少 / `else: true` 只认
// **紧挨着的上一项**没中。改错 `base`、忘夹 `cap`、漏判 `else`，这一节都会红。
// 最后那两个「故意弄坏一处」是给这一节自己的牙口看的——一格都不变就说明网太疏。
const HOUR_OF = (e) => new Date(Number(e?.startedAt) || 0).getHours()
const SIGNAL = {
  fails: (e) => Math.round(Number(e?.fails) || 0),
  minutes: (e) => Math.round(Number(e?.minutes) || 0),
  hour: HOUR_OF,
  helpers: (e) => (e?.helpers || []).length,
  deliverables: (e) => (e?.deliverables || []).length,
  actions: (e) => Object.values(e?.counts || {}).reduce((s, v) => s + (Math.round(Number(v)) || 0), 0),
  files: (e) => (e?.files || []).length,
}
const hitsByHand = (term, entry, place) => {
  if (term.when === 'always') return true
  if (term.when === 'place') return term.out ? place === null : (term.is || []).includes(place)
  if (term.when === 'tags') return (term.has || []).some((t) => (entry?.tags || []).includes(t))
  if (term.when === 'hour') return (term.in || []).some(([a, b]) => HOUR_OF(entry) >= a && HOUR_OF(entry) < b)
  const v = SIGNAL[term.when] ? SIGNAL[term.when](entry) : 0
  if (term.gte !== undefined) return v >= term.gte
  if (term.gt !== undefined) return v > term.gt
  return v > 0
}
const addsByHand = (term, entry) => (term.per !== undefined
  ? Math.min(SIGNAL[term.when] ? SIGNAL[term.when](entry) : 0, term.max === undefined ? Infinity : term.max) * term.per
  : (term.add || 0))
/** `broken` 用来故意弄坏一处（'no-else' 漏判 else / 'no-cap' 不夹 cap）。 */
const dangerByHand = (entry, place, broken = '') => {
  const spec = rules.danger
  let d = spec.base || 0
  let prev = false
  for (const term of spec.terms || []) {
    const raw = hitsByHand(term, entry, place)
    const now = broken === 'no-else' ? raw : (term.else === true ? !prev && raw : raw)
    if (now) d += addsByHand(term, entry)
    prev = now
  }
  if (broken === 'no-cap') return Math.round(d)
  return Math.max(0, Math.min(spec.cap === undefined ? 100 : spec.cap, Math.round(d)))
}
let byHandCases = 0
const byHandDiff = { 'no-else': 0, 'no-cap': 0 }
for (const hour of HOURS) for (const fails of FAILS) for (const mins of MINS) for (const place of PLACES) {
  const entry = { id: `h${id++}`, startedAt: at(hour), minutes: mins, fails, counts: { 改文件: 3 } }
  const live = gf.dangerOf(entry, place)
  const hand = dangerByHand(entry, place)
  assert.equal(hand, live, `照表算 dangerOf(时=${hour} 错=${fails} 长=${mins} 地=${place})：我算 ${hand}，面板算 ${live}`)
  byHandCases++
  for (const broken of ['no-else', 'no-cap']) if (dangerByHand(entry, place, broken) !== live) byHandDiff[broken]++
}
assert.ok(byHandDiff['no-else'] > 0, '漏判 else 居然一格都没变——§1b 这张网没有牙')
assert.ok(byHandDiff['no-cap'] > 0, '不夹 cap 居然一格都没变——§1b 这张网没有牙')

// ── 2. worldBucket：整个格子（还带上「有人帮手 / 干过什么活 / 户外的活」）
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const fits = (pool, line) => pool.some((t) => new RegExp(`^${escape(t).replace(/\\\{e\\\}/g, '.+?')}$`).test(line))
let worldCases = 0
for (const hour of HOURS) for (const fails of FAILS) for (const mins of MINS) for (const place of PLACES)
for (const tags of TAGS) for (const helpers of HELPERS) for (const sceneKey of SCENES) {
  const entry = { id: `w${id++}`, startedAt: at(hour), minutes: mins, fails, tags, helpers, counts: { 改文件: 3 } }
  const live = gf.worldLine(entry, 'adventure', place, '', sceneKey)
  const bucket = worldBucket(entry, place, sceneKey, rules, filled.OUT_KEYS)
  if (!live) {
    assert.equal(bucket, null, `这一行外头本不该出声，我却指到了「${bucket}」`)
  } else {
    assert.ok(gf.WORLD_LINES[bucket], `我算出桶「${bucket}」，可是世界句表里没有这个桶`)
    assert.ok(fits(gf.WORLD_LINES[bucket], live), `我算出桶「${bucket}」，那句「${live}」却不在这个桶里`)
  }
  worldCases++
}

// ── 3. 稳定散列：用生活句反过来验（lifeLine 的 seed 是 `${id}|life`）
// 包里的 `life` 已经按说法分好了：`adventure.life.morning` 就是冒险语气那份（13 句），
// `ledger.life.morning` 是案牍那份（6 句）——applyPack 按包装回去，verify-packs.mjs 已验过。
const morning = adventure.life.morning
assert.ok(Array.isArray(morning) && morning.length > 1, '生活句池子形状不对')
let hashCases = 0
for (let i = 0; i < 4000; i++) {
  const entry = { id: `h${i}`, startedAt: at(6), minutes: 30 }
  const live = gf.lifeLine(entry, 'adventure', null, '')
  const idx = hash(`${entry.id}|life`, morning.length)
  assert.equal(morning[idx], live, `散列对不上：我挑第 ${idx} 句（${morning[idx]}），面板挑了「${live}」`)
  hashCases++
}

// ── 4. 四档（paid / hurt / more / tail）：结构
// 这一段是**手抄**的，这里只能验证分支结构与区间；完整证明要等接线那轮——
// 接线后 smoke 会把每个场景的每一档都渲染一遍，与现在的渲染逐字比对。
const shard = { more: ['再来一遍'], paid: [], hurt: [], again: [] }
const tryFind = (slot, useDeliv, useMore) => {
  for (let i = 0; i < 30000; i++) {
    const entry = {
      id: `o${i}`, startedAt: at(12), minutes: 30, fails: 0,
      deliverables: useDeliv ? ['一份'] : [], counts: { 改文件: 3 },
    }
    const got = outcomeOf(entry, '改文件', rules, { place: 'scriptorium', shards: useMore ? shard : { more: [] } })
    if (got.slot === slot) return got
  }
  return null
}
const four = [
  ['paid', tryFind('paid', true, true), (g) => g.roll < 50 && g.danger >= 0],
  ['hurt', tryFind('hurt', false, true), (g) => g.roll < g.danger],
  ['more', tryFind('more', false, true), (g) => g.roll >= g.danger],
  ['tail', tryFind('tail', false, false), (g) => g.roll >= g.danger],
]
for (const [slot, got, ok] of four) {
  assert.ok(got, `四档里的「${slot}」一档都掷不出来，规矩多半写错了`)
  assert.ok(ok(got), `「${slot}」这一档的掷点与区间对不上：roll=${got.roll} danger=${got.danger}`)
}
// 有交付物时，paid 只由前 50 点决定；没有交付物时永远不落 paid
for (const entry of [
  { id: 'x1', startedAt: at(12), minutes: 30, fails: 0, deliverables: ['一份'], counts: { 改文件: 3 } },
  { id: 'x2', startedAt: at(12), minutes: 300, fails: 4, deliverables: [], counts: { 改文件: 3 } },
]) {
  const got = outcomeOf(entry, '改文件', rules, { place: null, shards: shard })
  if (!entry.deliverables.length) assert.notEqual(got.slot, 'paid', '没有交付物却拿了钱')
  assert.equal(got.danger, gf.dangerOf(entry, null), 'hurt 那段用的危险值与面板不一致')
}

// ── 5. 规矩自己的检查器：好规矩不报错，坏规矩必须报错
assert.deepEqual(checkRules(rules, 'adventure'), [], '这份规矩没通过自己的检查')
assert.ok(checkRules({ danger: { base: 12, cap: 55, terms: [{ when: '不认识的' }] } }).length, '不认识的 when 该报错')
assert.ok(checkRules({ danger: { base: 12, cap: 55, terms: [{ when: 'hour', in: [[5, 5]] }] } }).length, '空时段该报错')
assert.ok(checkRules({ world: { terms: [{ when: 'always', add: 1 }] } }).length, '世界层漏了 bucket 该报错')
assert.ok(checkRules({ outcome: { paidAt: 120 } }).length, 'paidAt 超出 0–100 该报错')

// ── 6. 方向与比例（2026-10-08 加，用户 m07234 第 2 条「比例需要调整」）
//
// 三件事各证一遍：① 面板的危险系数就是「机器算的 + 那一档的 bias」（封在 0–99）；
// ② 「外头」那层按方向加权那几项，机器与面板读的是同一份；③ 上限真是上限。
const DIRS = filled.DIRECTIONS || []
const dirBias = (id) => {
  const dir = DIRS.find((d) => d && d.id === id)
  const bias = dir ? Number(dir.bias) : 0
  return Number.isFinite(bias) ? bias : 0
}
let dirCases = 0
for (const id of [...DIRS.map((d) => d.id), undefined]) {
  for (const hour of HOURS) for (const fails of FAILS) for (const place of PLACES) {
    const entry = { id: 'dir', startedAt: at(hour), minutes: 30, fails, counts: {}, direction: id }
    const mine = Math.max(0, Math.min(99, dangerOf(entry, place, rules) + (id ? dirBias(id) : 0)))
    assert.equal(mine, gf.dangerOf(entry, place), `方向「${id}」的危险与面板不一致（时=${hour} 错=${fails} 地=${place}）`)
    dirCases += 1
  }
}
// 方向改的只是危险那一档；「外头」那层按方向加权那几项也得两边一致
// （照第 2 节的办法：我算出桶，面板那句就得落在这个桶里）。
let dirWorld = 0
for (const dir of DIRS) {
  for (const hour of HOURS) for (const place of PLACES) {
    const entry = { id: `dw${id++}`, startedAt: at(hour), minutes: 30, fails: 1, tags: ['改文件'], counts: { 改文件: 3 }, direction: dir.id }
    const live = gf.worldLine(entry, 'adventure', place, '', 'mine')
    const bucket = worldBucket(entry, place, 'mine', rules, filled.OUT_KEYS)
    if (!live) {
      assert.equal(bucket, null, `方向「${dir.id}」这一行外头本不该出声，我却指到了「${bucket}」`)
    } else {
      assert.ok(fits(gf.WORLD_LINES[bucket], live), `方向「${dir.id}」：我算出桶「${bucket}」，那句「${live}」却不在这个桶里`)
    }
    dirWorld += 1
  }
}
// 上限：四天都够涉险 ⇒ 只落两天（`(used + 1) / total` 那一比，差一个 +1 会漂到七成五）
const riskFacts = () => ({ id: 'd', startedAt: at(19), minutes: 120, fails: 2, hours: new Set([19]), counts: {}, deliverables: [] })
const dirBefore = []
const dirPicked = []
for (let i = 0; i < 4; i++) {
  const got = directionOf(riskFacts(), DIRS, { before: dirBefore })
  dirPicked.push(got ? got.id : null)
  if (got) dirBefore.push(got.id)
}
assert.deepEqual(dirPicked, ['hearth', 'risk', 'hearth', 'risk'], `上限没兜住：${dirPicked.join('/')}`)
// 兜底：一个都没有的时候也得给一档（不然那一天没方向）
assert.equal((directionOf({ id: 'q', startedAt: at(12), minutes: 30, fails: 0, hours: new Set([12]), counts: {}, deliverables: [] }, DIRS, { before: [] }) || {}).id, 'hearth', '平常的一天该落到兜底那一档')
// 规矩自己的检查器：好规矩不报错，坏规矩必须报错
assert.deepEqual(checkDirections(DIRS, 'adventure'), [], '这份方向表没通过自己的检查')
assert.ok(checkDirections([{ id: 'x', label: 'x', cap: 200, lines: ['一。', '二。', '三。'] }]).length, 'cap 超出 1–100 该报错')
assert.ok(checkDirections([{ id: 'x', label: 'x', cap: 50, lines: ['一。', '二。', '三。'] }]).length, '非兜底却没有条件该报错')
assert.ok(checkDirections([{ id: 'x', label: 'x', cap: 100, fallback: true, when: [{ when: 'fails', gte: 1 }], lines: ['一。', '二。', '三。'] }]).length, '兜底带了条件该报错')
assert.ok(checkDirections([{ id: 'x', label: 'x', cap: 50, when: [{ when: '不认识的' }], lines: ['一。', '二。', '三。'] }]).length, '不认识的项名该报错')
assert.ok(checkDirections([{ id: 'x', label: 'x', cap: 50, when: [{ when: 'fails', gte: 1 }], lines: ['一。'] }]).length, '抬头只给一句该报错')

/* ── 7. 选择点：那件事走到一半，他走的是哪条路 ───────────────────────────
 *
 * 岔口只住在事件里，判法与事件同源（`momentHit`）。这一节做两件事：
 *   ① 拿包里那四件事 × 一串真信号，逐格比「机器挑的那条路」与「面板上那两行说的是哪条路」；
 *   ② 把写坏的岔口喂给 `checkMoments`，确认它会报出来。
 */
const { choiceOf, checkMoments } = await import('../src/packs/rules.js')
const { moments: PACK_MOMENTS } = await import('../src/packs/adventure/moments.js')

const roadFacts = (over = {}) => ({
  hours: new Set(), places: new Set(), scenes: new Set(),
  deliverables: [], helpers: [], files: [], tags: [], counts: {}, fails: 0, minutes: 0, ...over,
})
// 自己再写一遍「这条路的条件中没中」——不调机器里那个（它没导出），
// 拿它跟机器挑出来的那条路对，才算真验过。
const roadHit = (term, facts) => {
  const num = { minutes: facts.minutes, fails: facts.fails, deliverables: facts.deliverables.length }[term.when]
  if (num !== undefined) {
    if (term.gte !== undefined) return num >= term.gte
    if (term.gt !== undefined) return num > term.gt
    return false
  }
  if (term.when === 'hours') return [...facts.hours].some((h) => (term.in || []).some(([a, b]) => h >= a && h < b))
  return false
}
const roadExpect = (roads, facts) => {
  for (const road of roads) {
    const terms = road.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => roadHit(term, facts))) return road.id
  }
  return roads[roads.length - 1].id
}
let roadCases = 0
const roadPicked = new Set()
for (const moment of PACK_MOMENTS) {
  const roads = (moment.choice && moment.choice.roads) || []
  assert.equal(roads.length, 2, `「${moment.id}」的岔口不是两条路`)
  assert.ok(Array.isArray(roads[0].when) && roads[0].when.length, `「${moment.id}」前一条路没有条件`)
  assert.ok(!(roads[1].when && roads[1].when.length), `「${moment.id}」最后那条路不该有条件`)
  for (const fails of [0, 2, 4, 6]) {
    for (const minutes of [30, 100, 200, 300, 400]) {
      for (const dels of [0, 2, 3]) {
        const facts = roadFacts({ fails, minutes, deliverables: Array.from({ length: dels }, (_, i) => `d${i}`) })
        const got = choiceOf(facts, moment.choice)
        assert.ok(got && roads.some((r) => r.id === got.id), `「${moment.id}」挑出来的路不在表里`)
        assert.equal(got.id, roadExpect(roads, facts), `「${moment.id}」fails ${fails} / ${minutes} 分钟 / ${dels} 件：机器挑了「${got.id}」，照条件该是「${roadExpect(roads, facts)}」`)
        roadPicked.add(got.id)
        roadCases += 1
      }
    }
  }
}
// 没有事件、没有岔口表：都该是 null（岔口只住在事件里）。
assert.equal(choiceOf(roadFacts({ minutes: 300 }), null), null, '没有事件却挑出了路')
assert.equal(choiceOf(roadFacts({ minutes: 300 }), {}), null, '岔口表是空的却挑出了路')
assert.equal(choiceOf(roadFacts({ minutes: 300 }), { roads: [] }), null, '一条路都没有却挑出了路')
assert.deepEqual([...roadPicked].sort(), ['again', 'back', 'blame', 'cross', 'finish', 'hold', 'home', 'leave', 'mark', 'own', 'push', 'seal', 'stop', 'take'].sort(), `八件事那十四条路没走全：${[...roadPicked].join('/')}`)
// 规矩自己的检查器：包里那八件事干净，写坏的岔口必须报出来。
assert.deepEqual(checkMoments(PACK_MOMENTS, 'adventure'), [], '包里那八件事没通过自己的检查')
const goodRoad = { id: 'a', label: '甲', when: [{ when: 'fails', gte: 1 }], lines: ['一句话。', '两句话。'] }
const goodBack = { id: 'b', label: '乙', lines: ['一句话。', '两句话。'] }
const wrap = (roads) => checkMoments([{ id: 'x', weight: 2, when: [{ when: 'fails', gte: 1 }], steps: ['他做了点什么。', '他又做了点什么。'], close: '就这样。', choice: { roads } }], 'verify')
assert.deepEqual(wrap([goodRoad, goodBack]), [], '好岔口不该报错')
assert.ok(wrap([goodRoad]).length, '只有一条路该报错')
assert.ok(wrap([goodRoad, goodBack, goodBack]).length, '三条路该报错')
assert.ok(wrap([goodRoad, { ...goodBack, when: [{ when: 'fails', gte: 2 }] }]).length, '最后那条路带条件该报错')
assert.ok(wrap([{ ...goodRoad, when: [] }, goodBack]).length, '前一条路没有条件该报错')
assert.ok(wrap([goodRoad, { ...goodBack, lines: ['只有一句。'] }]).length, '一条路只有一句该报错')
assert.ok(wrap([goodRoad, { ...goodBack, id: 'a' }]).length, '两条路重名该报错')
assert.ok(wrap([goodRoad, { ...goodBack, label: '' }]).length, '一条路没有说法该报错')
assert.ok(wrap([{ ...goodRoad, when: [{ when: '不认识的' }] }, goodBack]).length, '不认识的项名该报错')
assert.ok(checkMoments([{ id: 'x', weight: 4, when: [{ when: 'fails', gte: 1 }], steps: ['他做了点什么。', '他又做了点什么。'], close: '就这样。' }], 'verify').length, '份量超出 1–3 该报错')
assert.ok(checkMoments([{ id: 'x', weight: 1.5, when: [{ when: 'fails', gte: 1 }], steps: ['他做了点什么。', '他又做了点什么。'], close: '就这样。' }], 'verify').length, '份量不是整数该报错')

/* ── 7b. 命运抉择的份量（R18）：轻飘飘的不许摆到人面前 ───────────────────
 *
 * 用户第 2 条：要用户做决定的那一刻，得配一件有份量、有代价的事。
 * 四条硬规矩：摆了岔口的份量 ≥ 2；每条路都写一句代价；代价得是完整的一句
 * 人话（不是路名的复述）；每条路留下 1–2 样痕迹，且两条路不许留一样的。
 */
const { checkChoices, checkMarks, MARK_NAMES } = await import('../src/packs/rules.js')
const goodChoice = (over = {}) => ([{
  id: 'x', weight: 2, when: [{ when: 'fails', gte: 1 }],
  steps: ['他做了点什么。', '他又做了点什么。'], close: '就这样。',
  choice: {
    roads: [
      { id: 'a', label: '甲', when: [{ when: 'fails', gte: 3 }], lines: ['一句话。', '两句话。'], cost: '他落下了一处旧伤，往后阴天就发紧。', marks: ['wound'] },
      { id: 'b', label: '乙', lines: ['一句话。', '两句话。'], cost: '那一趟没走到，往后他欠了别人一回。', marks: ['debt', 'fame'] },
    ],
  },
  ...over,
}])
assert.deepEqual(checkChoices(goodChoice(), 'verify'), [], '够份量的岔口不该报错')
assert.ok(checkChoices(goodChoice({ weight: 1 }), 'verify').length, '轻飘飘的事件摆了岔口该报错')
assert.ok(checkChoices([{ ...goodChoice()[0], choice: { roads: [{ ...goodChoice()[0].choice.roads[0], cost: '' }, goodChoice()[0].choice.roads[1]] } }], 'verify').length, '有一条路没写代价该报错')
assert.ok(checkChoices([{ ...goodChoice()[0], choice: { roads: [{ ...goodChoice()[0].choice.roads[0], cost: '受伤' }, goodChoice()[0].choice.roads[1]] } }], 'verify').length, '代价是半截话该报错')
assert.ok(checkChoices([{ ...goodChoice()[0], choice: { roads: [{ ...goodChoice()[0].choice.roads[0], marks: [] }, goodChoice()[0].choice.roads[1]] } }], 'verify').length, '一条路什么痕迹都没留该报错')
assert.ok(checkChoices([{ ...goodChoice()[0], choice: { roads: [{ ...goodChoice()[0].choice.roads[0], marks: ['不认识的'] }, goodChoice()[0].choice.roads[1]] } }], 'verify').length, '不认识的痕迹该报错')
assert.ok(checkChoices([{ ...goodChoice()[0], choice: { roads: [{ ...goodChoice()[0].choice.roads[0], marks: ['wound'] }, { ...goodChoice()[0].choice.roads[1], marks: ['wound'] }] } }], 'verify').length, '两条路留一样的痕迹该报错')
assert.ok(checkChoices([{ ...goodChoice()[0], choice: { roads: [{ ...goodChoice()[0].choice.roads[0], marks: ['wound', 'debt', 'fame'] }, goodChoice()[0].choice.roads[1]] } }], 'verify').length, '一条路留三样痕迹该报错')

/* ── 7c. 痕迹池（R19）：六个痕迹、三池、池子不能薄 ─────────────────────────
 *
 * 痕迹是「那一天走的那条路，往后几天里怎么显出来」的说法（只活当天）。
 * 规矩管的是形状：六个痕迹一个不许少，每个都得有回声 / 生活 / 外头三池，
 * 回声至少四句（同一天里会连着挂好几行）、另两池各至少两句。
 */
const { marks: PACK_MARKS } = await import('../src/packs/adventure/marks.js')
const goodMarks = (over = {}) => ({
  wound: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'], world: ['一。', '二。'] },
  debt: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'], world: ['一。', '二。'] },
  fame: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'], world: ['一。', '二。'] },
  gain: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'], world: ['一。', '二。'] },
  lore: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'], world: ['一。', '二。'] },
  loss: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'], world: ['一。', '二。'] },
  ...over,
})
assert.deepEqual(checkMarks(PACK_MARKS, 'adventure'), [], '包里那六个痕迹没通过自己的检查')
assert.deepEqual(MARK_NAMES.slice().sort(), Object.keys(PACK_MARKS).sort(), '六个痕迹的名字跟规矩里那一份对不上')
assert.deepEqual(checkMarks(goodMarks(), 'verify'), [], '够厚的痕迹池不该报错')
assert.ok(checkMarks(goodMarks({ wound: undefined }), 'verify').length, '少一个痕迹该报错')
assert.ok(checkMarks({ ...goodMarks(), 多出来的: goodMarks().wound }, 'verify').length, '多一个不认识的痕迹该报错')
assert.ok(checkMarks(goodMarks({ wound: { echo: ['一。', '二。', '三。', '四。'], life: ['一。', '二。'] } }), 'verify').length, '少一池该报错')
assert.ok(checkMarks(goodMarks({ wound: { echo: ['一。', '二。', '三。'], life: ['一。', '二。'], world: ['一。', '二。'] } }), 'verify').length, '回声池太薄该报错')
assert.ok(checkMarks(goodMarks({ wound: { echo: ['一。', '二。', '三。', '四。'], life: ['一。'], world: ['一。', '二。'] } }), 'verify').length, '生活池太薄该报错')


/* ── 8. 归宿：这一年收在哪儿 ─────────────────────────────────────────────
 *
 * 归宿那一层没有前身可比（2026-10-08 新写的），所以证明分两处：
 *   ① 拿包里那九件 × 一串真账（天数 / 撞墙 / 交付 / 景 / 方向分布 / 岔口分布）逐格比
 *      「机器挑的那一件」与「照条件自己算的那一件」；
 *   ② 把写坏的归宿表喂给 `checkFates`，确认它会报出来。
 */
const { fateOf, checkFates } = await import('../src/packs/rules.js')
const { fate: PACK_FATES } = await import('../src/packs/adventure/fate.js')

const fateFacts = (over = {}) => ({
  days: 0, fails: 0, minutes: 0, deliverables: [], scenes: new Set(), hours: new Set(), places: new Set(),
  direction: {}, roads: {}, ...over,
})
// 自己再写一遍「这一件够不够得着」——不调机器里那个（`fateHit` 没导出）。
const shareOf2 = (tally, ids) => {
  const keys = Object.keys(tally || {})
  const total = keys.reduce((n, k) => n + tally[k], 0)
  if (!total) return 0
  return (keys.filter((k) => ids.includes(k)).reduce((n, k) => n + tally[k], 0) / total) * 100
}
const fateHit2 = (term, facts) => {
  if (term.when === 'days') {
    if (term.gte !== undefined) return facts.days >= term.gte
    if (term.lte !== undefined) return facts.days <= term.lte
    return facts.days > 0
  }
  if (term.when === 'direction' || term.when === 'roads') {
    const share = shareOf2(facts[term.when], term.has || [])
    return term.share !== undefined ? share >= term.share : share > 0
  }
  if (term.when === 'fails') return term.gte !== undefined ? facts.fails >= term.gte : facts.fails > 0
  if (term.when === 'minutes') return term.gte !== undefined ? facts.minutes >= term.gte : facts.minutes > 0
  if (term.when === 'deliverables') return term.gte !== undefined ? facts.deliverables.length >= term.gte : facts.deliverables.length > 0
  if (term.when === 'scenes') return (term.has || []).some((k) => facts.scenes.has(k))
  if (term.when === 'hours') return [...facts.hours].some((h) => (term.in || []).some(([a, b]) => h >= a && h < b))
  throw new Error(`自己这份判据里没写「${term.when}」`)
}
const fateExpect = (fates, facts) => {
  for (const one of fates) {
    const terms = one.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((t) => fateHit2(t, facts))) return one.id
  }
  return fates[fates.length - 1].id
}
const DIR_TALLIES = [{}, { risk: 1 }, { risk: 4, hearth: 6 }, { coin: 3, hearth: 7 }, { food: 5 }, { risk: 9, hearth: 1 }]
const ROAD_TALLIES = [{}, { hold: 3, leave: 1 }, { leave: 3, back: 1 }, { seal: 1, cross: 1, home: 1 }, { hold: 1, leave: 3 }]
let fateCases = 0
const fatePicked = new Set()
for (const days of [0, 2, 30, 31, 60, 200]) {
  for (const fails of [0, 5, 12, 15, 24, 40]) {
    for (const dels of [0, 2, 10]) {
      for (const mine of [false, true]) {
        for (const dir of DIR_TALLIES) {
          for (const road of ROAD_TALLIES) {
            const facts = fateFacts({
              days,
              fails,
              deliverables: Array.from({ length: dels }, (_, i) => `d${i}`),
              scenes: new Set(mine ? ['mine'] : []),
              direction: { ...dir },
              roads: { ...road },
            })
            const got = fateOf(facts, PACK_FATES)
            assert.ok(got && PACK_FATES.some((f) => f.id === got.id), '挑出来的归宿不在表里')
            assert.equal(got.id, fateExpect(PACK_FATES, facts), `days ${days} / fails ${fails} / 交付 ${dels} / 矿洞 ${mine} / 方向 ${JSON.stringify(dir)} / 岔口 ${JSON.stringify(road)}：机器挑了「${got.id}」，照条件该是「${fateExpect(PACK_FATES, facts)}」`)
            fatePicked.add(got.id)
            fateCases += 1
          }
        }
      }
    }
  }
}
assert.deepEqual([...fatePicked].sort(), PACK_FATES.map((f) => f.id).sort(), `九件没走全：${[...fatePicked].join('/')}`)
assert.equal(fateOf(fateFacts({ days: 60 }), []), null, '空表却挑出了归宿')
assert.equal(fateOf(fateFacts({ days: 60 }), null), null, '没有表却挑出了归宿')
// 规矩自己的检查器：包里那九件干净，写坏的表必须报出来。
assert.deepEqual(checkFates(PACK_FATES, 'adventure'), [], '包里那九件没通过自己的检查')
const goodFate = { id: 'x', when: [{ when: 'days', gte: 1 }], lines: ['一句话。', '两句话。', '三句话。'], close: '就这样。' }
const goodBack2 = { id: 'y', lines: ['一句话。', '两句话。', '三句话。'], close: '就这样。' }
assert.deepEqual(checkFates([goodFate, goodBack2], 'verify'), [], '好归宿不该报错')
assert.ok(checkFates([goodFate, goodFate], 'verify').length, 'id 重了该报错')
assert.ok(checkFates([goodFate, goodBack2, { ...goodFate, id: 'z' }], 'verify').length, '兜底不在最后该报错')
assert.ok(checkFates([goodBack2, goodBack2], 'verify').length, '兜底不止一个该报错')
assert.ok(checkFates([{ ...goodFate, when: [{ when: '不认识的' }] }, goodBack2], 'verify').length, '不认识的项名该报错')
assert.ok(checkFates([{ ...goodFate, when: [{ when: 'roads', share: 50 }] }, goodBack2], 'verify').length, '方向 / 岔口没列名字该报错')
assert.ok(checkFates([{ ...goodFate, when: [{ when: 'direction', has: ['risk'], share: 400 }] }, goodBack2], 'verify').length, 'share 越界该报错')
assert.ok(checkFates([{ ...goodFate, lines: ['一句话。', '两句话。'] }, goodBack2], 'verify').length, '账只给两句该报错')
assert.ok(checkFates([{ ...goodFate, close: '' }, goodBack2], 'verify').length, '末尾没有收束该报错')

/* ------------------------------------------------------------------ *
 * 9. 战斗（2026-10-10 加，用户 m14888「他必须有战斗」）
 *
 *    这一台机器（`fightOf`）没有前身可比——它顶掉的那道两拍交锋（`clashOf`）压根不是
 *    一个引擎，只是在挨打那一行补两句现成的。所以证明分两处：
 *      ① 这里：把「钟点 × 撞墙次数 × 交付 × 景」铺成格子，逐格跟**自己重写一遍的判据**
 *         对拍（`fightHit2` / `fightExpect`，只认战斗真的用到的那几个项名）；
 *      ② 再加一串写坏的表，确认 `checkFights` 会报出来（兜底少了 / 兜底不在最后 /
 *         池子太薄 / 战报不带 `{n}`）。
 * ------------------------------------------------------------------ */
const { fightOf, checkFights } = await import('../src/packs/rules.js')
const PACK_FIGHTS = (await import('../src/packs/adventure/fights.js')).fights
const fightFacts = (over = {}) => ({
  fails: 0, minutes: 0, counts: {}, helpers: [], deliverables: [], files: [],
  hours: new Set([14]), places: new Set(), scenes: new Set(), ...over,
})
const fightHit2 = (term, facts) => {
  if (term.when === 'hours') return [...facts.hours].some((h) => (term.in || []).some(([a, b]) => h >= a && h < b))
  if (term.when === 'scenes') return (term.has || []).some((k) => facts.scenes.has(k))
  if (term.when === 'places') return (term.has || []).some((k) => facts.places.has(k))
  if (term.when === 'fails') return term.gte !== undefined ? facts.fails >= term.gte : facts.fails > 0
  if (term.when === 'minutes') return term.gte !== undefined ? facts.minutes >= term.gte : facts.minutes > 0
  if (term.when === 'deliverables') return term.gte !== undefined ? facts.deliverables.length >= term.gte : facts.deliverables.length > 0
  throw new Error(`自己这份判据里没写「${term.when}」`)
}
const fightExpect = (facts) => {
  const foe = PACK_FIGHTS.foes.find((f) => !Array.isArray(f.when) || !f.when.length
    || f.when.every((t) => fightHit2(t, facts)))
  const tier = PACK_FIGHTS.tiers.find((t) => !Array.isArray(t.when) || !t.when.length
    || t.when.every((term) => fightHit2(term, facts)))
  return { foe: (foe || {}).id, tier: (tier || {}).id }
}
let fightCases = 0
const foePicked = new Set()
const tierPicked = new Set()
for (const hour of [2, 9, 14, 21, 23]) {
  for (const fails of [0, 1, 2, 6, 9]) {
    for (const dels of [0, 1, 2]) {
      for (const scene of ['', 'frost', 'tower', 'mine', 'road', 'home']) {
        const facts = fightFacts({
          hours: new Set([hour]),
          fails,
          minutes: dels ? 130 : 40,
          deliverables: Array.from({ length: dels }, (_, i) => `d${i}`),
          scenes: new Set(scene ? [scene] : []),
        })
        const got = fightOf(facts, PACK_FIGHTS, { outdoors: filled.OUT_KEYS })
        assert.ok(got && got.foe && got.tier, '挑不出对手或档位（兜底那两支没接上）')
        const want = fightExpect(facts)
        assert.equal(got.foe.id, want.foe, `${hour} 点 / 撞墙 ${fails} / 交付 ${dels} / 景 ${scene || '(屋里)'}：机器挑了「${got.foe.id}」，照条件该是「${want.foe}」`)
        assert.equal(got.tier.id, want.tier, `${hour} 点 / 撞墙 ${fails}：机器挑了「${got.tier.id}」，照条件该是「${want.tier}」`)
        foePicked.add(got.foe.id)
        tierPicked.add(got.tier.id)
        fightCases += 1
      }
    }
  }
}
// 三档的拍数（战斗.md 里定死的死数）：小 3 / 中 5 / 大 7。
const beatsOf = (tier) => 1 + (tier.way ? 1 : 0) + Math.round(Number(tier.trade) || 0) + (tier.turn ? 1 : 0) + 1
assert.deepEqual(PACK_FIGHTS.tiers.map((t) => [t.id, beatsOf(t)]), [['big', 7], ['mid', 5], ['small', 3]], '三档的拍数不是 7/5/3')
// 规矩自己的检查器：包里那一套干净，写坏的表必须报出来。
assert.deepEqual(checkFights(PACK_FIGHTS, 'adventure'), [], '包里那一套没通过自己的检查')
const goodFoe = { id: 'a', label: '甲', when: [{ when: 'fails', gte: 2 }], meet: ['一。', '二。', '三。'], way: ['一。', '二。', '三。'], trade: ['一。', '二。', '三。'], end: ['一。', '二。', '三。'] }
const goodBackFoe = { id: 'z', label: '兜底', meet: ['一。', '二。', '三。'], way: ['一。', '二。', '三。'], trade: ['一。', '二。', '三。'], end: ['一。', '二。', '三。'] }
const goodTier = { id: 't1', label: '一档', trade: 1, way: false, turn: false, when: [{ when: 'fails', gte: 2 }] }
const goodBackTier = { id: 't2', label: '兜底', trade: 1, way: false, turn: false }
const goodFoeB = { ...goodFoe, id: 'b', label: '乙', when: [{ when: 'minutes', gte: 120 }] }
const goodFights = (over = {}) => ({
  foes: [goodFoe, goodFoeB, goodBackFoe], tiers: [goodTier, goodBackTier],
  turns: ['一。', '二。', '三。'], report: ['打了{n}场。', '一共{n}场。', '这一天{n}场。'], ...over,
})
assert.deepEqual(checkFights(goodFights(), 'verify'), [], '好表不该报错')
assert.ok(checkFights(goodFights({ foes: [goodFoe, goodFoeB, goodBackFoe, { ...goodBackFoe, id: 'y' }] }), 'verify').length, '兜底不止一个该报错')
assert.ok(checkFights(goodFights({ foes: [goodBackFoe, goodFoe, goodFoeB] }), 'verify').length, '兜底不在最后该报错')
assert.ok(checkFights(goodFights({ foes: [goodFoe, goodFoe, goodBackFoe] }), 'verify').length, '对手 id 重了该报错')
assert.ok(checkFights(goodFights({ foes: [{ ...goodFoe, meet: ['一。', '二。'] }, goodFoeB, goodBackFoe] }), 'verify').length, '对手池太薄该报错')
assert.ok(checkFights(goodFights({ tiers: [{ ...goodTier, trade: 9 }, goodBackTier] }), 'verify').length, '交手的拍数越界该报错')
assert.ok(checkFights(goodFights({ tiers: [goodTier] }), 'verify').length, '档位没有兜底该报错')
assert.ok(checkFights(goodFights({ turns: ['一。', '二。'] }), 'verify').length, '失算那一池太薄该报错')
assert.ok(checkFights(goodFights({ report: ['打了。', '两场。', '三场。'] }), 'verify').length, '战报不带 {n} 该报错')

/* ------------------------------------------------------------------ *
 * 10. 当日计划（2026-10-10 加，第二期：`dayPlan` + `stateAt`）
 *
 *    这一台机器（`stationOf`）挑的是「册子走到第几站」。它跟战斗那台是同一副骨头
 *    （复用 `momentHit`），但**方向相反**：战斗从前往后找第一个中的，它**从后往前**
 *    找——走得最远的那一处说了算（存档只留今天，没法靠「昨天走到第几站」推）。
 *    所以这里也自己重写一遍判据逐格对拍，再把写坏的表交给 `checkJourney`。
 * ------------------------------------------------------------------ */
const { stationOf, checkJourney } = await import('../src/packs/rules.js')
const PACK_JOURNEY = (await import('../src/packs/adventure/journey.js')).journey
const journeyFacts = (over = {}) => ({
  fails: 0, minutes: 0, counts: {}, helpers: [], deliverables: [], files: [],
  hours: new Set([14]), places: new Set(), scenes: new Set(), ...over,
})
const journeyHit2 = (term, facts) => {
  if (term.when === 'hours') return [...facts.hours].some((h) => (term.in || []).some(([a, b]) => h >= a && h < b))
  if (term.when === 'scenes') return (term.has || []).some((k) => facts.scenes.has(k))
  if (term.when === 'places') return (term.has || []).some((k) => facts.places.has(k))
  if (term.when === 'fails') return term.gte !== undefined ? facts.fails >= term.gte : facts.fails > 0
  if (term.when === 'minutes') return term.gte !== undefined ? facts.minutes >= term.gte : facts.minutes > 0
  if (term.when === 'deliverables') return term.gte !== undefined ? facts.deliverables.length >= term.gte : facts.deliverables.length > 0
  throw new Error(`自己这份判据里没写「${term.when}」`)
}
const journeyExpect = (facts) => {
  const list = PACK_JOURNEY.stations
  for (let i = list.length - 1; i >= 0; i--) {
    const one = list[i]
    if (!Array.isArray(one.when) || !one.when.length) return one.id
    if (one.when.every((t) => journeyHit2(t, facts))) return one.id
  }
  return list[0].id
}
let journeyCases = 0
const stationPicked = new Set()
for (const place of ['', 'home', 'archive', 'workshop', 'guild', 'tavern', 'market', 'scriptorium']) {
  for (const scene of ['', 'watch', 'ruin', 'quench']) {
    for (const fails of [0, 3, 6]) {
      for (const dels of [0, 1]) {
        const facts = journeyFacts({
          places: new Set(place ? [place] : []),
          scenes: new Set(scene ? [scene] : []),
          fails,
          deliverables: Array.from({ length: dels }, (_, i) => `d${i}`),
        })
        const got = stationOf(facts, PACK_JOURNEY.stations, { outdoors: filled.OUT_KEYS })
        assert.ok(got && got.id, '挑不出一站（兜底那一站没接上）')
        const want = journeyExpect(facts)
        assert.equal(got.id, want, `${place || '(没进城)'} / 景 ${scene || '(没出门)'} / 撞墙 ${fails} / 交付 ${dels}：机器挑了「${got.id}」，照条件该是「${want}」`)
        stationPicked.add(got.id)
        journeyCases += 1
      }
    }
  }
}
// 十一站一站不落：路线是完整的，不是「只到得了前几站」。
assert.equal(stationPicked.size, PACK_JOURNEY.stations.length, `十一站里有 ${PACK_JOURNEY.stations.length - stationPicked.size} 站永远到不了`)
// 规矩自己的检查器：包里那一套干净，写坏的表必须报出来。
assert.deepEqual(checkJourney(PACK_JOURNEY, 'adventure'), [], '包里那一套没通过自己的检查')
const goodStation = (i) => ({ id: `s${i}`, label: `地方${i}`, seal: `封印${i}`, when: [{ when: 'fails', gte: i }] })
const goodJourney = (over = {}) => ({
  stations: [{ id: 's0', label: '地方0', seal: '封印0' },
    ...Array.from({ length: 7 }, (_, i) => goodStation(i + 1))],
  lossAt: [3, 6],
  losses: { early: ['一。', '二。'], mid: ['一。', '二。'], late: ['一。', '二。'] },
  plans: {
    plan: ['他今天有{n}件事，头一件在{place}，是{seal}。', '他记着{n}件事，先办{place}的{seal}。', '这一天他排了{n}件事，第一件是{place}的{seal}。'],
    season: { spring: ['一。', '二。'], summer: ['一。', '二。'], autumn: ['一。', '二。'], winter: ['一。', '二。'] },
  },
  ...over,
})
assert.deepEqual(checkJourney(goodJourney(), 'verify'), [], '好表不该报错')
assert.ok(checkJourney(goodJourney({ stations: goodJourney().stations.slice(0, 4) }), 'verify').length, '站太少该报错')
assert.ok(checkJourney(goodJourney({ stations: [goodStation(1), goodJourney().stations[0], ...goodJourney().stations.slice(2)] }), 'verify').length, '兜底不在最前面该报错')
assert.ok(checkJourney(goodJourney({ stations: [...goodJourney().stations, { id: 'sx', label: '又一个兜底', seal: '无' }] }), 'verify').length, '兜底不止一个该报错')
assert.ok(checkJourney(goodJourney({ lossAt: [6, 3] }), 'verify').length, 'lossAt 不递增该报错')
assert.ok(checkJourney(goodJourney({ plans: { ...goodJourney().plans, plan: ['他今天有{n}件事，头一件在{place}。', '他记着{n}件事，先办{place}的{seal}。', '这一天他排了{n}件事，第一件是{place}的{seal}。'] } }), 'verify').length, '计划里缺一个占位符该报错')
assert.ok(checkJourney(goodJourney({ plans: { ...goodJourney().plans, season: { spring: ['一。', '二。'], summer: ['一。', '二。'], autumn: ['一。', '二。'] } } }), 'verify').length, '缺一个季节该报错')

/* ------------------------------------------------------------------ *
 * 11. 命运（2026-10-10 加，用户 m16528 三条批评与 m16548「可以把角色写死」）
 *
 *    这一台机器（`forkOf`）挑的是「这一天压下来的是哪一件命运」，跟高光事件、战斗、
 *    当日计划同一副骨头（复用 `momentHit`）——按顺序找第一件每一项都中的，一件都没中
 *    就没有命运。第二台（`resultOf`）挑的是「这条路走下来落的是哪一种结果」。
 *    两台都自己重写一遍判据逐格对拍（不调机器里那个），再把写坏的表交给 `checkForks`。
 *
 *    两件事要特别注意：**死的路只在分支上**（主线不许死，用户 m16552 的书得能讲下去），
 *    所以这里**两条路都要走一遍**——只走主线那一支的话，「死」这种结果一次都验不到。
 * ------------------------------------------------------------------ */
const { forkOf, resultOf, checkForks } = await import('../src/packs/rules.js')
const PACK_FORKS = (await import('../src/packs/adventure/forks.js')).forks
const forkFacts = (over = {}) => ({
  fails: 0, minutes: 0, counts: {}, helpers: [], deliverables: [], files: [],
  hours: new Set([14]), places: new Set(), scenes: new Set(), ...over,
})
// 自己再写一遍「这一项中没中」——包里那三件只用到这四样。
const forkHit2 = (term, facts) => {
  if (term.when === 'hours') return [...facts.hours].some((h) => (term.in || []).some(([a, b]) => h >= a && h < b))
  if (term.when === 'scenes') return (term.has || []).some((k) => facts.scenes.has(k))
  if (term.when === 'places') return (term.has || []).some((k) => facts.places.has(k))
  if (term.when === 'fails') return term.gte !== undefined ? facts.fails >= term.gte : facts.fails > 0
  if (term.when === 'minutes') return term.gte !== undefined ? facts.minutes >= term.gte : facts.minutes > 0
  throw new Error(`自己这份判据里没写「${term.when}」`)
}
const forkExpect = (facts) => {
  for (const one of PACK_FORKS) {
    if (Array.isArray(one.when) && one.when.length && one.when.every((t) => forkHit2(t, facts))) return one
  }
  return null
}
const resultExpect = (road, facts) => {
  const list = (road && road.outcomes) || []
  for (const one of list) {
    if (Array.isArray(one.when) && one.when.length && one.when.every((t) => forkHit2(t, facts))) return one
  }
  return list.length ? list[list.length - 1] : null
}
let forkCases = 0
const forkPicked = new Set()
const resultPicked = new Set()
const everyOutcome = new Set()
for (const fork of PACK_FORKS) {
  for (const road of fork.roads) for (const out of road.outcomes) everyOutcome.add(`${fork.id}/${road.id}/${out.id}`)
}
for (const place of ['', 'home', 'archive', 'workshop', 'tavern', 'scriptorium']) {
  for (const scene of ['', 'ruin', 'road', 'quench', 'watch', 'mine', 'tower', 'frost']) {
    for (const minutes of [0, 40, 90, 200]) {
      for (const fails of [0, 1, 3, 4]) {
        for (const hour of [2, 10, 20]) {
          const facts = forkFacts({
            places: new Set(place ? [place] : []),
            scenes: new Set(scene ? [scene] : []),
            minutes,
            fails,
            hours: new Set([hour]),
          })
          const got = forkOf(facts, PACK_FORKS, { outdoors: filled.OUT_KEYS })
          const want = forkExpect(facts)
          assert.equal(got ? got.id : null, want ? want.id : null,
            `${place || '(没进城)'} / 景 ${scene || '(没出门)'} / 走了 ${minutes} 分 / 撞墙 ${fails} / ${hour} 点：机器挑了「${got ? got.id : '(没有命运)'}」，照条件该是「${want ? want.id : '(没有命运)'}」`)
          forkCases += 1
          if (!got) continue
          forkPicked.add(got.id)
          // 两条路都走一遍：分支上那种「死」也在里面。
          for (const road of got.roads) {
            const res = resultOf(facts, road, { outdoors: filled.OUT_KEYS })
            const wantRes = resultExpect(road, facts)
            assert.ok(res && res.id, `${got.id}/${road.id} 一种结果都挑不出来（兜底没接上）`)
            assert.equal(res.id, wantRes.id,
              `${got.id}/${road.id}：机器挑了「${res.id}」，照条件该是「${wantRes.id}」`)
            resultPicked.add(`${got.id}/${road.id}/${res.id}`)
          }
        }
      }
    }
  }
}
// 三件一件不落、每一种结果一条不落：路线是完整的，不是「只走得到前几件」。
assert.equal(forkPicked.size, PACK_FORKS.length, `三件命运里有 ${PACK_FORKS.length - forkPicked.size} 件永远压不下来`)
assert.equal(resultPicked.size, everyOutcome.size,
  `还有 ${everyOutcome.size - resultPicked.size} 种结果永远落不到（${[...everyOutcome].filter((k) => !resultPicked.has(k)).join('、')}）`)
// 死是这一层的重头戏：**得真验到一次**，不然「可以把角色写死」只是写在纸上。
assert.ok([...resultPicked].some((k) => {
  const [, , outId] = k.split('/')
  const fork = PACK_FORKS.find((f) => f.id === k.split('/')[0])
  const road = fork.roads.find((r) => r.id === k.split('/')[1])
  const out = road.outcomes.find((o) => o.id === outId)
  return out.then && out.then.die === true
}), '没有一种「死」的结果被走到过')
// 规矩自己的检查器：包里那三件干净，写坏的表必须报出来。
assert.deepEqual(checkForks(PACK_FORKS, 'adventure'), [], '包里那一套没通过自己的检查')
const goodRoadF = (over = {}) => ({
  id: 'a', kind: 'main', label: '甲', look: ['眼前是这样。'],
  outcomes: [
    { id: 'o1', when: [{ when: 'fails', gte: 2 }], beats: ['一。', '二。', '三。', '四。'], marks: ['wound'], then: { tier: 2 } },
    { id: 'o2', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { tier: 2 } },
  ],
  ...over,
})
const goodBranchF = (over = {}) => ({
  id: 'b', kind: 'branch', label: '乙', look: ['眼前是那样。'],
  outcomes: [
    { id: 'o3', when: [{ when: 'fails', gte: 3 }], beats: ['一。', '二。', '三。', '四。'], marks: [], then: { die: true } },
    { id: 'o4', beats: ['一。', '二。', '三。', '四。'], marks: ['loss'], then: { back: true } },
  ],
  ...over,
})
const goodFork = (over = {}) => ({
  id: 'f1', weight: 3, when: [{ when: 'fails', gte: 1 }], look: ['路到这儿分了两股。'],
  roads: [goodRoadF(), goodBranchF()],
  ...over,
})
const goodForks = (over = {}) => [goodFork(), { ...goodFork({ id: 'f2', weight: 4 }), roads: [goodRoadF({ id: 'c' }), goodBranchF({ id: 'd' })] }, ...(over.extra || [])]
assert.deepEqual(checkForks(goodForks(), 'verify'), [], '好表不该报错')
assert.ok(checkForks(goodFork({ weight: 2 }), 'verify').length, '份量不到三该报错')
assert.ok(checkForks(goodFork({ when: [] }), 'verify').length, '不写什么时候压下来该报错')
assert.ok(checkForks(goodFork({ look: [] }), 'verify').length, '没有眼前那一句该报错')
assert.ok(checkForks(goodFork({ roads: [goodRoadF()] }), 'verify').length, '只有一条路该报错')
assert.ok(checkForks(goodFork({ roads: [goodRoadF({ kind: 'main' }), goodBranchF({ kind: 'main' })] }), 'verify').length, '两条主线该报错')
assert.ok(checkForks(goodFork({ roads: [goodRoadF({ kind: 'branch' }), goodBranchF()] }), 'verify').length, '一条主线都没有该报错')
assert.ok(checkForks(goodFork({ roads: [goodRoadF({ cost: '一句代价。' }), goodBranchF()] }), 'verify').length, '路还带着代价该报错')
assert.ok(checkForks(goodFork({ roads: [goodRoadF({ look: [] }), goodBranchF()] }), 'verify').length, '路没有眼前那一句该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [{ id: 'o1', beats: ['一。', '二。'], then: { tier: 2 } }] }), goodBranchF()],
}), 'verify').length, '结果不到四拍该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [{ id: 'o1', beats: ['一。', '二。', '三。', '四。'], then: { die: true } }] }), goodBranchF()],
}), 'verify').length, '主线上的结果不许死')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF(), goodBranchF({
    outcomes: [
      { id: 'o3', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { die: true } },
      { id: 'o5', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { die: true } },
    ],
  })],
}), 'verify').length, '同一条路死两种该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF(), goodBranchF({
    outcomes: [
      { id: 'o3', beats: ['一。', '二。', '三。', '四。'], marks: ['wound'], then: { die: true } },
      { id: 'o4', beats: ['一。', '二。', '三。', '四。'], marks: ['loss'], then: { back: true } },
    ],
  })],
}), 'verify').length, '死路上还留痕迹该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [{ id: 'o1', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { back: true } }] }), goodBranchF()],
}), 'verify').length, '主线绕回主线该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [{ id: 'o1', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { tier: 4 } }] }), goodBranchF()],
}), 'verify').length, 'tier 只能是 2 或 3')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [{ id: 'o1', when: [{ when: 'fails', gte: 2 }], beats: ['一。', '二。', '三。', '四。'], marks: [], then: { tier: 2 } }] }), goodBranchF()],
}), 'verify').length, '兜底不在最后该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [
    { id: 'o1', when: [{ when: 'fails', gte: 2 }], beats: ['一。', '二。', '三。', '四。'], marks: [], then: { tier: 2 } },
    { id: 'o2', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { tier: 2 } },
    { id: 'o6', beats: ['一。', '二。', '三。', '四。'], marks: [], then: { tier: 2 } },
  ] }), goodBranchF()],
}), 'verify').length, '兜底不止一种该报错')
assert.ok(checkForks(goodFork({
  roads: [goodRoadF({ outcomes: [{ id: 'o1', beats: ['一。', '二。', '三。', '四。'], marks: ['说不清的痕迹'], then: { tier: 2 } }] }), goodBranchF()],
}), 'verify').length, '不认得的痕迹该报错')
assert.ok(checkForks([], 'verify').length, '空表该报错')
assert.ok(checkForks([goodFork(), goodFork()], 'verify').length, 'id 重了该报错')

console.log(`✅ 世界的规矩与面板一致：危险 ${dangerCases} 格（接线） + ${byHandCases} 格（照表重算，弄坏 else/cap 各能抓到 ${byHandDiff['no-else']}/${byHandDiff['no-cap']} 格） · 世界句 ${worldCases} 格 · 散列 ${hashCases} 条 · 四档 ${four.map(([s, g]) => `${s}(roll ${g.roll}/${g.danger})`).join('、')} · 方向 ${dirCases} 格 + 世界层 ${dirWorld} 格（上限 ${dirPicked.join('/')}） · 选择点 ${roadCases} 格（${[...roadPicked].sort().join('/')}） · 归宿 ${fateCases} 格（${[...fatePicked].sort().join('/')}） · 痕迹 ${MARK_NAMES.length} 个（${MARK_NAMES.join('/')}） · 战斗 ${fightCases} 格（${[...foePicked].sort().join('/')} × ${[...tierPicked].sort().join('/')}） · 当日计划 ${journeyCases} 格（${[...stationPicked].sort().join('/')}） · 命运 ${forkCases} 格（${[...forkPicked].sort().join('/')}）`)
