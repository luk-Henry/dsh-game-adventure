/**
 * 世界的规矩：读包的那台机器。
 *
 * 包是数据，这里是唯一一段**读规矩**的代码。六个引擎：
 *
 *   dangerOf(entry, place, rules)               那天他那边有多不太平（0–cap）
 *   outcomeOf(entry, act, rules, { shards })     四档里落哪一档：paid / hurt / more / tail
 *   worldWeights(entry, place, sceneKey, rules)  外头那层「世界句」的桶权重（按真实处境加权）
 *   momentOf(facts, moments, { outdoors })       那一天有没有一件值得单讲的事（高光事件）
 *   directionOf(facts, directions, { before })   那一天朝哪边走（方向与比例，2026-10-08）
 *   choiceOf(facts, choice, ctx)                 那件事里他走了哪条路（选择点，2026-10-08）
 *
 * 规矩本身是**项**（term）的列表，全是数据，故事包换一个世界就换一套数：
 *
 *   { when: 'fails', per: 9, max: 4 }                  次数 × per，封顶 max 次
 *   { when: 'minutes', gte: 120, add: 8 }              至少这么久
 *   { when: 'minutes', gt: 60, add: 4 }                超过这么久
 *   { when: 'hour', in: [[23, 24], [0, 5]], add: 14 }  时段（可跨零点，末点不含；24 表示一天末尾）
 *   { when: 'place', out: true, add: 8 }               人在地图外面
 *   { when: 'place', is: ['market', 'guild'], add: 4 } 在某个地方
 *   { when: 'tags', has: ['查资料', '翻文件'], add: 16 } 那天干过这些活
 *   { when: 'helpers', gt: 0, add: 18 }                有人帮手
 *   { when: 'always', add: 20 }                        兜底
 *   { when: 'outside', bucket: 'road', add: 16 }       只在世界层用：他人在野地里
 *   { when: 'direction', is: ['risk'], add: 7 }        只在世界层用：这一天落在「涉险」那个方向上
 *                                                      （`entry.direction` 是**按天算出来的**，见 directionOf；
 *                                                      单条记录身上没有这个字段，所以这里永远不会中）
 *   { …, else: true }                                  「否则」：紧挨着的上一项没中才判它
 *                                                      （对着代码里的 `else if` 抄，别漏）
 *
 * 认识的信号**全部来自记录**（`records.json` / `ticks`），一个都不许凭空造：
 * fails / minutes / hour / helpers / deliverables / actions / files。
 *
 * 这一层的红线：**改的只是门槛与权重，不是事实**。同一份记录在同一条规矩下
 * 永远得到同一个结果（散列是稳定散列），换个世界包只是换一套门槛。
 *
 * 接线**已经做完**（2026-10-08）：`src/client.js:24` 从本文件 import 这六台引擎，
 * 面板算的与这里算的是**同一份数**，`client.js` 里那份写死的数字已经不在了
 * （`dangerOf` 现在只负责加一层 `directionBias`）。
 *
 * `scripts/verify-rules.mjs` 是这一层的证据：
 *   §1  接线网 —— 面板的 `dangerOf` 与这里在 2940 格上是同一个数（拆掉接线它就红）
 *   §1b 语义网 —— 照本文件头部写的语义**自己再算一遍**，与面板对上（改坏语义它就红）
 *   §2  世界句 —— 面板挑出的那句确实落在 `worldBucket` 算出的桶里
 *   §3–§8 散列 / 四档 / 方向 / 选择点 / 归宿：判据都自己重写了一遍
 */

/** 与 client.js 的 `pickIndex` 同一个算法（FNV-1a 32 位）。verify-rules.mjs 会逐值比对。 */
export function hash(seed, len) {
  let h = 2166136261
  const text = String(seed)
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % len
}

const pick = (list, seed) => (list && list.length ? list[hash(seed, list.length)] : null)
const hourOf = (entry) => new Date(Number.isFinite(Number(entry?.startedAt)) ? Number(entry.startedAt) : 0).getHours()

/** 认识的信号：名字 → 从记录里读什么。 */
export const SIGNALS = {
  fails: (e) => Math.round(Number(e?.fails) || 0),
  minutes: (e) => Math.round(Number(e?.minutes) || 0),
  hour: (e) => hourOf(e),
  helpers: (e) => (e?.helpers || []).length,
  deliverables: (e) => (e?.deliverables || []).length,
  actions: (e) => Object.values(e?.counts || {}).reduce((sum, v) => sum + (Math.round(Number(v)) || 0), 0),
  files: (e) => (e?.files || []).length,
}

export const SIGNAL_NAMES = Object.keys(SIGNALS)
export const WHEN_NAMES = [...SIGNAL_NAMES, 'always', 'outside', 'place', 'tags', 'direction']

/** 这一项今天中了没有。 */
function hit(term, entry, place, ctx) {
  switch (term.when) {
    case 'always': return true
    case 'outside': return place === null || (ctx.outdoors ? ctx.outdoors.has(ctx.sceneKey) : false)
    case 'place':
      if (term.out) return place === null
      if (term.is) return term.is.includes(place)
      return false
    case 'tags': return (term.has || []).some((t) => (entry?.tags || []).includes(t))
    // 这一天朝哪边走：`entry.direction` 是按天算出来挂在记录上的（见 directionOf）。
    // 单条记录身上没有这个字段——所以「一天的规矩」只认日卷，不认某一格。
    case 'direction': return !!entry?.direction && (term.is || []).includes(entry.direction)
    case 'hour': return (term.in || []).some(([from, to]) => hourOf(entry) >= from && hourOf(entry) < to)
    default: {
      const value = SIGNALS[term.when] ? SIGNALS[term.when](entry) : 0
      if (term.gte !== undefined) return value >= term.gte
      if (term.gt !== undefined) return value > term.gt
      // 只写了 per 的项（`fails`）：次数本身就是量，0 不算中
      return value > 0
    }
  }
}

/** 这一项加多少。`per` 的写法是「每单位加多少，最多算到 max」。 */
function amount(term, entry) {
  if (term.per !== undefined) {
    const n = SIGNALS[term.when] ? SIGNALS[term.when](entry) : 0
    return Math.min(n, term.max === undefined ? Infinity : term.max) * term.per
  }
  return term.add || 0
}

/**
 * 按顺序判一遍，返回中了的项（顺序保留）。
 *
 * `else: true` 的项只在**紧挨着**上一项没中时才判——代码里的 `else if` 链就是它。
 * 漏掉 `else` 会把「深夜 +14」和「天黑 +7」算成两份（深夜本来就属于天黑）。
 */
function fireTerms(terms, entry, place, ctx) {
  const hitTerms = []
  let prev = false
  for (const term of terms || []) {
    const now = term.else === true ? !prev && hit(term, entry, place, ctx) : hit(term, entry, place, ctx)
    if (now) hitTerms.push(term)
    prev = now
  }
  return hitTerms
}

/** 那天他那边有多不太平。同一个 entry 永远得到同一个数。 */
export function dangerOf(entry, place = null, rules = null) {
  const spec = rules?.danger
  if (!spec) return 0
  let d = spec.base || 0
  for (const term of fireTerms(spec.terms, entry, place, {})) d += amount(term, entry)
  return Math.max(0, Math.min(spec.cap === undefined ? 100 : spec.cap, Math.round(d)))
}

/**
 * 外头那层的桶权重：`[[桶, 权重], ...]`，顺序就是掷点时的顺序（会决定同分时谁先中）。
 *
 * 权重为 0 的项**不进列表**——这不是省事，是client.js 里 `add()` 的原样行为，
 * 顺序变了掷出来的桶就变了。
 */
export function worldWeights(entry, place = null, sceneKey = '', rules = null, outdoors = null) {
  const spec = rules?.world
  if (!spec) return []
  const ctx = { outdoors, sceneKey }
  const out = []
  // 同一个桶中两次就**占两项**（照抄源码里的 `weights.push`）。合并看着更干净，
  // 但那会挪动别的桶在掷点区间里的位置——只有同桶两项紧挨着时合并才等价，这里不赌。
  const add = (bucket, weight) => { if (weight > 0) out.push([bucket, weight]) }
  for (const term of fireTerms(spec.terms, entry, place, ctx)) add(term.bucket, amount(term, entry))
  return out
}

/** 这一行外头会讲哪一类事；`null` 表示这一行没有世界句（三五分钟的一段不算）。 */
export function worldBucket(entry, place = null, sceneKey = '', rules = null, outdoors = null) {
  const spec = rules?.world
  if (!spec || !entry || !Number.isFinite(Number(entry.startedAt))) return null
  const mins = Math.round(Number(entry?.minutes) || 0)
  if (mins > 0 && mins <= (spec.minMinutes === undefined ? 0 : spec.minMinutes)) return null
  const weights = worldWeights(entry, place, sceneKey, rules, outdoors)
  if (!weights.length) return null
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  let roll = hash(`${entry.id || ''}|world|bucket`, total)
  for (const [bucket, w] of weights) {
    if (roll < w) return bucket
    roll -= w
  }
  return 'quiet'
}

/**
 * 四档里落哪一档。
 *
 * `shards` 是这一行那个场景的四档结局（`{ more, paid, hurt, again }`）；给 null 就当作没有 more。
 * 返回 `{ slot, roll, danger, tries }`——`tries` 是 `{e}` 该写「第几回」。
 */
export function outcomeOf(entry, act, rules = null, options = {}) {
  const { place = null, shards = null } = options
  const counts = entry?.counts || {}
  const n = Math.round(Number(counts[act]) || 0)
  const seed = `${entry?.id || ''}|${act}|${n}`
  const spec = rules?.outcome || {}
  const paidAt = spec.paidAt === undefined ? 50 : spec.paidAt
  const numAt = spec.numAt === undefined ? 34 : spec.numAt
  const minRepeat = spec.minRepeat === undefined ? 2 : spec.minRepeat
  const fails = Math.round(Number(entry?.fails) || 0)
  const paid = (entry?.deliverables || []).length
  const danger = dangerOf(entry, place, rules)
  const roll = hash(`${seed}|outcome`, 100)

  let slot
  if (paid > 0 && roll < paidAt) slot = 'paid'
  else if (roll < danger + (paid > 0 ? paidAt : 0)) slot = 'hurt'
  else if (n >= minRepeat && (shards?.more || []).length && hash(`${seed}|num`, 100) < numAt) slot = 'more'
  else slot = 'tail'
  return { slot, roll, danger, tries: Math.max(fails, spec.hurtFloor === undefined ? 1 : spec.hurtFloor) }
}

/* ── 高光事件：那一天有没有一件值得单讲的事 ────────────────────────────────
 *
 * 四档收尾管的是「这一行怎么收」，这一层管的是「这一天有没有一件大事」——
 * 读的还是记录里真有的东西，只是**按天**读：那天撞过几次墙、干到几点、交出去几件、
 * 走过哪一景。数据在 `src/packs/adventure/moments.js`。
 *
 *   { id: 'night-raid',
 *     when: [{ when: 'hours', in: [[22, 24], [0, 5]] }, { when: 'fails', gte: 3 }],
 *     steps: ['…', '…', '…'],
 *     close: '…' }
 *
 * 与 danger / world 那两处**正好相反**：那两处是「中一项加一份」（打分），这里是
 * 「每一项都得中」（判条件）。按列表顺序判，**第一个全中的就是那一天的那件事**——
 * 顺序就是优先级，写在包里。同一份记录永远得到同一件事：没有掷点、不读「现在」。
 *
 * 这一层多认识四个项名（只有它按天看，别的引擎没有这个上下文）：
 *
 *   { when: 'hours', in: [[22, 24], [0, 5]] }   那一天里**有一个**钟点落在这段
 *   { when: 'places', has: ['market'] }         那一天到过某处（面板上那七处）
 *   { when: 'scenes', has: ['mine'] }           那一天出现过某一景（26 个场景键）
 *   { when: 'outside' }                         那一天有一景落在野地里（见 OUT_KEYS）
 */

/** 这一层多认识的项名。danger / world 那两处**不许**用它们——它们没有按天看的上下文。 */
export const MOMENT_WHEN_NAMES = [...SIGNAL_NAMES, 'always', 'outside', 'place', 'tags', 'hours', 'places', 'scenes']
/** 方向那一层按天看，用的是同一套项语言。**不认 `direction`**——方向不能拿自己当条件。 */
export const DIRECTION_WHEN_NAMES = MOMENT_WHEN_NAMES

/**
 * 命运抉择留下的**痕迹**（2026-10-09 加的，用户 m01903 第 2 条）。
 *
 * 一条路走完，会在**当天**留下几种痕迹；今天后面几格的说法跟着它变，明天清空。
 * 六个名字是固定的——「伤」在身上，「账」欠着人，「名声」在别人嘴里，
 * 「得着」是多出来的东西，「知道」是他往后认得出的东西，「丢掉」是没了的东西。
 *
 * 它只活在这一层与面板那一层（`src/client.js` 的 `dayMarks`），不进 `records.json`。
 */
export const MARK_NAMES = ['wound', 'debt', 'fame', 'gain', 'lore', 'loss']

/** 这一项这一天中了没有。 */
function momentHit(term, facts, ctx) {
  const set = (name) => (facts && facts[name] instanceof Set ? facts[name] : new Set())
  switch (term.when) {
    case 'hours':
      return [...set('hours')].some((h) => (term.in || []).some(([from, to]) => h >= from && h < to))
    case 'places':
      return (term.has || []).some((p) => set('places').has(p))
    case 'scenes':
      return (term.has || []).some((k) => set('scenes').has(k))
    case 'outside':
      return [...set('scenes')].some((k) => (ctx.outdoors ? ctx.outdoors.has(k) : false))
    default: {
      const value = SIGNALS[term.when] ? SIGNALS[term.when](facts) : 0
      if (term.gte !== undefined) return value >= term.gte
      if (term.gt !== undefined) return value > term.gt
      return value > 0
    }
  }
}

/**
 * 那一天的那件事：按顺序找第一个 `when` 全中的，一件都没中就返回 `null`。
 *
 * `facts` 是那一天收出来的那份**记录形状**（`rollUnit` 收的日卷），外加
 * `hours` / `places` / `scenes` 三个集合（`client.js` 的 `dayFacts` 攒的）。
 */
export function momentOf(facts, moments = null, ctx = {}) {
  if (!Array.isArray(moments)) return null
  for (const moment of moments) {
    const terms = moment?.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => momentHit(term, facts, ctx))) return moment
  }
  return null
}

/* ── 选择点：那件事走到一半，他走的是哪条路 ─────────────────────────────────
 *
 * 用户 m08146「全做。」里的第 ④ 件。岔口**只住在事件里**（`moment.choice`）：
 * 没有事件的日子没有岔口，也没有哪条路要挑。
 *
 *   { id: 'night-raid',
 *     when: [...], steps: [...], close: '…',
 *     choice: { roads: [
 *       { id: 'hold',  label: '守到天亮', when: [{ when: 'minutes', gte: 240 }], lines: [...] },
 *       { id: 'leave', label: '退走',                                        lines: [...] } ] } }
 *
 * 两条路都是**外头的路**（守到天亮 / 退走），不是他心里怎么想。判法跟高光事件同一套：
 * 按顺序找第一条**每一项都中**的路；**最后一条没有条件**，就是「谁都没轮到的时候他自己
 * 落的那一条」——所以永远走得出来一条，除非那张表本身写坏了。
 *
 * 走的那条**封在这一件里**：同一份记录看两遍是同一条路（没有掷点、不读「现在」），
 * 也不写回 `records.json`。判据用的还是记录里真有的东西（撞了几次墙、干了多久、
 * 交出去几件、什么钟点），一项都不许凭空造。
 */

/**
 * 这件事里他走了哪条路。`facts` 跟 `momentOf` 是同一份（那一天的记录形状外加
 * `hours` / `places` / `scenes` 三个集合）。一条都没轮到就返回**最后那条没有条件的**，
 * 表里连那条都没有（写坏了）才返回 `null`。
 */
export function choiceOf(facts, choice, ctx = {}) {
  const roads = choice && Array.isArray(choice.roads) ? choice.roads : null
  if (!roads || !roads.length) return null
  for (const road of roads) {
    if (!road || typeof road.id !== 'string' || !road.id) continue
    const terms = road.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => momentHit(term, facts, ctx))) return road
  }
  const back = roads.filter((road) => road && typeof road.id === 'string' && road.id
    && (!Array.isArray(road.when) || !road.when.length))
  return back.length ? back[back.length - 1] : null
}

/* ── 归宿：这一年他是怎么过来的 ────────────────────────────────────────────
 *
 * 用户 m08146「全做。」里的第 ⑤ 件，也是这一组的最后一件。它跟前面几台机器都不一样：
 * 前面那些算的都是**一天**或**一件事**的账，这一台算的是**一整年**的账——干过多少天、
 * 撞过多少回、交出去几件、那一年往哪个方向走得多、遇上事的时候多半走的是哪条路。
 *
 *   { id: 'kept-at-it',   when: [{ when: 'fails', gte: 24 }], lines: [...] }
 *   { id: 'on-the-road',  when: [{ when: 'direction', has: ['risk'], share: 40 }], lines: [...] }
 *   { id: 'held-the-line', when: [{ when: 'roads', has: ['hold', 'seal'], share: 50 }], lines: [...] }
 *   { id: 'quiet-year',   lines: [...], close: '…' }        // 最后一件不带条件
 *
 * 判法跟高光事件同一套：按顺序找第一件 `when` 全中的；**最后一件没有条件**，
 * 前面一件都没轮到就归它——所以永远挑得出一件（除非那张表写坏了）。顺序就是优先级。
 *
 * 这一层多认识三个项名，而且 `direction` 在这一层读的是**那一年的分布**（不是单条记录上
 * 那个字符串）——所以它自己一个 `fateHit`，`momentHit` 一个字不动。
 *
 *   { when: 'days', gte: 60 }                          那一年干过多少天
 *   { when: 'direction', has: ['risk'], share: 40 }     那一年落在这个方向的日子占四成以上
 *   { when: 'roads', has: ['hold', 'seal'], share: 50 } 那一年走过的岔口里一半以上是这几条
 *
 * `share` 省掉就是「有这么一天就行」。`hours` / `places` / `scenes` / `outside` 与信号
 * 那几项照旧认（跟事件那一层同一套），所以「那年他下过矿洞」这种也写得出来。
 */

/** 这一层多认识的项名：`days`（那一年干过多少天）、`roads`（那一年走岔口的分布）、
 *  `direction`（那一年落的方向的分布——**跟方向那一层不一样**：那边不许拿方向当条件，
 *  因为它是单条记录上的一个字符串；这里读的是一年的账，所以认得）。 */
export const FATE_WHEN_NAMES = [...MOMENT_WHEN_NAMES, 'days', 'roads', 'direction']

/** 一份分布里 `has` 那几条占了多少（`{ risk: 4, hearth: 5 }` → 四成四）。 */
function shareOf(tally, has) {
  if (!tally || typeof tally !== 'object' || tally instanceof Set) return 0
  let total = 0
  let hit = 0
  for (const key of Object.keys(tally)) {
    const n = Math.round(Number(tally[key]) || 0)
    total += n
    if (has.includes(key)) hit += n
  }
  return total ? (hit / total) * 100 : 0
}

/** 这一项那一年中了没有。 */
function fateHit(term, facts, ctx) {
  switch (term.when) {
    case 'days': {
      const n = Array.isArray(facts?.days) ? facts.days.length : Math.round(Number(facts?.days) || 0)
      if (term.gte !== undefined) return n >= term.gte
      if (term.gt !== undefined) return n > term.gt
      if (term.lte !== undefined) return n <= term.lte
      if (term.lt !== undefined) return n < term.lt
      return n > 0
    }
    case 'direction':
    case 'roads': {
      const ids = Array.isArray(term.has) ? term.has : (Array.isArray(term.is) ? term.is : [])
      const share = shareOf(facts ? facts[term.when] : null, ids)
      if (term.share !== undefined) return share >= term.share
      return share > 0
    }
    default:
      return momentHit(term, facts, ctx)
  }
}

/**
 * 这一年收在哪一件上。`facts` 是那一年的账（`rollUnit` 收的年卷，外加 `days` 与
 * `hours` / `places` / `scenes` 三个集合、`direction` 与 `roads` 两份分布）。
 * 一件都没轮到就返回**最后那件不带条件的**；表里连它都没有（写坏了）才返回 `null`。
 */
export function fateOf(facts, fates = null, ctx = {}) {
  if (!Array.isArray(fates)) return null
  for (const fate of fates) {
    const terms = fate?.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => fateHit(term, facts, ctx))) return fate
  }
  const back = fates.filter((f) => f && typeof f.id === 'string' && f.id && (!Array.isArray(f.when) || !f.when.length))
  return back.length ? back[back.length - 1] : null
}

/** 归宿表有没有写错（给 `scripts/packs.mjs` 用）。 */
export function checkFates(fates, where = 'fate') {
  const bad = []
  if (fates === undefined || fates === null) return bad
  if (!Array.isArray(fates)) return [`${where}: 归宿得是一个列表`]
  const seen = new Set()
  let fallbacks = 0
  fates.forEach((fate, i) => {
    const at = `${where}[${i}]`
    if (!fate || typeof fate !== 'object') { bad.push(`${at}: 得是一个对象`); return }
    if (typeof fate.id !== 'string' || !fate.id) bad.push(`${at}.id: 得给一个名字`)
    else if (seen.has(fate.id)) bad.push(`${at}.id: 重了（${fate.id}）`)
    else seen.add(fate.id)
    const terms = fate.when
    if (!Array.isArray(terms) || !terms.length) {
      fallbacks++
      if (i !== fates.length - 1) bad.push(`${at}.when: 不带条件的那一件（兜底）得排在最后`)
    } else {
      terms.forEach((term, j) => {
        const t = `${at}.when[${j}]`
        if (!term || typeof term !== 'object') { bad.push(`${t}: 得是一个对象`); return }
        if (!FATE_WHEN_NAMES.includes(term.when)) { bad.push(`${t}.when: 不认识「${term.when}」（认识的只有 ${FATE_WHEN_NAMES.join(' / ')}）`); return }
        if (term.when === 'direction' || term.when === 'roads') {
          const ids = Array.isArray(term.has) ? term.has : (Array.isArray(term.is) ? term.is : null)
          if (!ids || !ids.length) bad.push(`${t}.has: 得列出名字（这个方向 / 这几条路）`)
          if (term.share !== undefined && !(typeof term.share === 'number' && term.share > 0 && term.share <= 100)) {
            bad.push(`${t}.share: 得是 1–100 的数（占多少）`)
          }
        }
        if (term.when === 'hours' && !(Array.isArray(term.in) && term.in.length && term.in.every((p) => Array.isArray(p) && p.length === 2 && p[0] < p[1] && p[0] >= 0 && p[1] <= 24))) {
          bad.push(`${t}.in: 得是 [[起, 止], ...]，起 < 止、都在 0–24 之间（止不含）`)
        }
        if ((term.when === 'places' || term.when === 'scenes') && !(Array.isArray(term.has) && term.has.length)) bad.push(`${t}.has: 得列出名字`)
        for (const k of ['gte', 'gt', 'lte', 'lt']) if (term[k] !== undefined && !(typeof term[k] === 'number' && term[k] >= 0)) bad.push(`${t}.${k}: 得是不小于 0 的数`)
      })
    }
    if (!Array.isArray(fate.lines) || fate.lines.length < 3 || fate.lines.some((s) => typeof s !== 'string' || !s)) {
      bad.push(`${at}.lines: 得是三句以上（这一年的账）`)
    }
    if (typeof fate.close !== 'string' || !fate.close) bad.push(`${at}.close: 得有一句收束（末尾那一句）`)
  })
  if (fates.length && fallbacks !== 1) bad.push(`${where}: 不带条件的那一件（兜底）得**正好有一个**，现在是 ${fallbacks} 个`)
  return bad
}

/* ── 方向与比例：这一天朝哪边走 ────────────────────────────────────────────
 *
 * 用户 m07234 第 2 条问的是「比例」。这里的做法是**上限，不是配额**：
 * 一天落哪个方向，由**那天真有没有那件事**决定；`cap` 只负责「不许过多」——
 * 判的时候看这一天**之前所有日子**里这个方向已经占了多少，加上这一天会不会超过上限。
 * 所以「涉险」最多占一半，而它也不会被硬凑满：真没事的那天，条件不中，就不写它。
 *
 *   { id: 'risk', label: '涉险', cap: 50, bias: 7, when: [{ when: 'fails', gte: 1 }], lines: [...] }
 *
 * 判法跟高光事件同一套项语言（按天看：`hours` / `places` / `scenes` / `outside` 加信号），
 * 每一项都中才算中；**列表顺序就是优先级**。标了 `fallback: true` 的那一档不看条件，
 * 前面都不轮到就归它——所以它拿到的是「剩下的」。
 *
 * `bias` 是那一档的危险系数（`{ when: 'direction', is: [...] }` 读它，见 `hit()`）：
 * 涉险的日子危险加七点、过日子的日子减七点，封顶 55 不变。
 *
 * 确定性：判条件只看那一天的记录，看比例只看**更早**的日子——所以明天多了一条记录，
 * 也不会把昨天、上个月的方向改掉（历史不会被重写）。
 */

/**
 * 这一天之前，这个方向已经占了多少；**加上这一天**会不会超过上限。
 *
 * 上限算的是「到这一天为止，这个方向在全部日子里占的比例」——所以是
 * `(已经占的 + 今天这一档) / (前面的天数 + 今天)`，不是「已经占的 / 今天」。
 * 差这一个 `+ 1` 会让上限慢慢漂到七成五：四天里前三天都判涉险，
 * 第四天拿 `2/4 = 50%` 一比就放行，结果四天里三天是涉险（2026-10-08 自查抓到）。
 *
 * 恰好卡在上限上时**放行**：比例会一直停在上限（n/2 天涉险再加一天还是 n/2），
 * 那正是「上限不是配额」的读法——素材真够就一直给到一半，多一天都不给。
 */
function underCap(dir, before) {
  const cap = dir.cap === undefined ? 100 : dir.cap
  const total = before.length + 1
  const used = before.filter((id) => id === dir.id).length
  return ((used + 1) / total) * 100 <= cap + 1e-9
}

/**
 * 那一天朝哪边走。`facts` 是那一天收出来的记录形状（外加 `hours` 那几个集合），
 * `before` 是**更早那些日子**的方向 id 列表（按时间排，最早的在前面）。
 *
 * 找不到任何一档（连兜底都没有，或者兜底也被上限挡住）就返回 `null`——那一天不写方向。
 */
export function directionOf(facts, directions = null, ctx = {}) {
  if (!Array.isArray(directions) || !directions.length) return null
  const before = Array.isArray(ctx.before) ? ctx.before : []
  for (const dir of directions) {
    if (!dir || dir.fallback === true) continue
    const terms = dir.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (!terms.every((term) => momentHit(term, facts, ctx))) continue
    if (!underCap(dir, before)) continue
    return dir
  }
  const back = directions.find((dir) => dir && dir.fallback === true)
  if (!back) return null
  return underCap(back, before) ? back : null
}

/** 方向表有没有写错（给 `scripts/packs.mjs` 用）。 */
export function checkDirections(directions, where = 'directions') {
  const bad = []
  if (directions === undefined || directions === null) return bad
  if (!Array.isArray(directions)) return [`${where}: 方向得是一个列表`]
  const seen = new Set()
  let fallbacks = 0
  directions.forEach((dir, i) => {
    const at = `${where}[${i}]`
    if (!dir || typeof dir !== 'object') { bad.push(`${at}: 得是一个对象`); return }
    if (typeof dir.id !== 'string' || !dir.id) bad.push(`${at}.id: 得给一个名字`)
    else if (seen.has(dir.id)) bad.push(`${at}.id: 重了（${dir.id}）`)
    else seen.add(dir.id)
    if (typeof dir.label !== 'string' || !dir.label) bad.push(`${at}.label: 得有一个说法（界面上那几个字）`)
    if (typeof dir.cap !== 'number' || dir.cap <= 0 || dir.cap > 100) bad.push(`${at}.cap: 得是 1–100 的数（上限）`)
    if (typeof dir.bias !== 'number') bad.push(`${at}.bias: 得是数（危险系数，可正可负）`)
    if (dir.fallback === true) {
      fallbacks++
      if (Array.isArray(dir.when) && dir.when.length) bad.push(`${at}.when: 兜底那一档不该有条件`)
      if (dir.cap !== 100) bad.push(`${at}.cap: 兜底那一档得是 100（不然没条件可判的日子会空着）`)
    } else if (!Array.isArray(dir.when) || !dir.when.length) {
      bad.push(`${at}.when: 得列出条件（每一项都得中）；兜底那一档才写 fallback: true`)
    } else {
      dir.when.forEach((term, j) => {
        const t = `${at}.when[${j}]`
        if (!term || typeof term !== 'object') { bad.push(`${t}: 得是一个对象`); return }
        if (!DIRECTION_WHEN_NAMES.includes(term.when)) { bad.push(`${t}.when: 不认识「${term.when}」（认识的只有 ${DIRECTION_WHEN_NAMES.join(' / ')}）`); return }
        if (term.when === 'hours' && !(Array.isArray(term.in) && term.in.length && term.in.every((p) => Array.isArray(p) && p.length === 2 && p[0] < p[1] && p[0] >= 0 && p[1] <= 24))) {
          bad.push(`${t}.in: 得是 [[起, 止], ...]，起 < 止、都在 0–24 之间（止不含）`)
        }
        if ((term.when === 'places' || term.when === 'scenes') && !(Array.isArray(term.has) && term.has.length)) bad.push(`${t}.has: 得列出名字`)
        for (const k of ['gte', 'gt']) if (term[k] !== undefined && !(typeof term[k] === 'number' && term[k] >= 0)) bad.push(`${t}.${k}: 得是不小于 0 的数`)
      })
    }
    if (!Array.isArray(dir.lines) || dir.lines.length < 3 || dir.lines.some((s) => typeof s !== 'string' || !s)) {
      bad.push(`${at}.lines: 得是三句以上（这一天的抬头）`)
    }
  })
  if (directions.length && fallbacks !== 1) bad.push(`${where}: 兜底那一档（fallback: true）得**正好有一个**，现在是 ${fallbacks} 个`)
  return bad
}

/** 事件本身有没有写错（给 `scripts/packs.mjs` 用）。判的是「这台机器读不读得懂」。 */
export function checkMoments(moments, where = 'moments') {
  const bad = []
  if (moments === undefined || moments === null) return bad
  if (!Array.isArray(moments)) return [`${where}: 事件得是一个列表`]
  const seen = new Set()
  moments.forEach((moment, i) => {
    const at = `${where}[${i}]`
    if (!moment || typeof moment !== 'object') { bad.push(`${at}: 得是一个对象`); return }
    if (typeof moment.id !== 'string' || !moment.id) bad.push(`${at}.id: 得给一个名字`)
    else if (seen.has(moment.id)) bad.push(`${at}.id: 重了（${moment.id}）`)
    else seen.add(moment.id)
    if (!Number.isInteger(moment.weight) || moment.weight < 1 || moment.weight > 3) {
      bad.push(`${at}.weight: 得给份量（1–3 的整数；摆岔口的事件得是 2 或 3）`)
    }
    if (!Array.isArray(moment.when) || !moment.when.length) bad.push(`${at}.when: 得列出条件（每一项都得中）`)
    else moment.when.forEach((term, j) => {
      const t = `${at}.when[${j}]`
      if (!term || typeof term !== 'object') { bad.push(`${t}: 得是一个对象`); return }
      if (!MOMENT_WHEN_NAMES.includes(term.when)) { bad.push(`${t}.when: 不认识「${term.when}」（认识的只有 ${MOMENT_WHEN_NAMES.join(' / ')}）`); return }
      if (term.when === 'hours' && !(Array.isArray(term.in) && term.in.length && term.in.every((p) => Array.isArray(p) && p.length === 2 && p[0] < p[1] && p[0] >= 0 && p[1] <= 24))) {
        bad.push(`${t}.in: 得是 [[起, 止], ...]，起 < 止、都在 0–24 之间（止不含）`)
      }
      if ((term.when === 'places' || term.when === 'scenes') && !(Array.isArray(term.has) && term.has.length)) bad.push(`${t}.has: 得列出名字`)
      for (const k of ['gte', 'gt']) if (term[k] !== undefined && !(typeof term[k] === 'number' && term[k] >= 0)) bad.push(`${t}.${k}: 得是不小于 0 的数`)
    })
    if (!Array.isArray(moment.steps) || moment.steps.length < 2 || moment.steps.some((s) => typeof s !== 'string' || !s)) {
      bad.push(`${at}.steps: 得是两句以上（一句一行排着说）`)
    }
    if (typeof moment.close !== 'string' || !moment.close) bad.push(`${at}.close: 得有一句收束`)
    // 岔口（选择点）：写了就得**正好两条路**——前一条有条件、最后一条没有（自己落的那条）。
    if (moment.choice !== undefined && moment.choice !== null) {
      const roads = moment.choice.roads
      if (!Array.isArray(roads) || roads.length !== 2) {
        bad.push(`${at}.choice.roads: 得正好两条路（前一条带条件，最后一条不带）`)
      } else {
        const roadIds = new Set()
        roads.forEach((road, j) => {
          const r = `${at}.choice.roads[${j}]`
          if (!road || typeof road !== 'object') { bad.push(`${r}: 得是一个对象`); return }
          if (typeof road.id !== 'string' || !road.id) bad.push(`${r}.id: 得给一个名字`)
          else if (roadIds.has(road.id)) bad.push(`${r}.id: 重了（${road.id}）`)
          else roadIds.add(road.id)
          if (typeof road.label !== 'string' || !road.label) bad.push(`${r}.label: 得有一个说法（这一条路叫什么）`)
          const terms = road.when
          if (j === roads.length - 1) {
            if (Array.isArray(terms) && terms.length) bad.push(`${r}.when: 最后那条路不该有条件（谁都没轮到时就归它）`)
          } else if (!Array.isArray(terms) || !terms.length) {
            bad.push(`${r}.when: 得列出条件（每一项都得中）；只有最后那条路才不带条件`)
          } else {
            terms.forEach((term, k) => {
              const t = `${r}.when[${k}]`
              if (!term || typeof term !== 'object') { bad.push(`${t}: 得是一个对象`); return }
              if (!MOMENT_WHEN_NAMES.includes(term.when)) { bad.push(`${t}.when: 不认识「${term.when}」（认识的只有 ${MOMENT_WHEN_NAMES.join(' / ')}）`); return }
              if (term.when === 'hours' && !(Array.isArray(term.in) && term.in.length && term.in.every((p) => Array.isArray(p) && p.length === 2 && p[0] < p[1] && p[0] >= 0 && p[1] <= 24))) {
                bad.push(`${t}.in: 得是 [[起, 止], ...]，起 < 止、都在 0–24 之间（止不含）`)
              }
              if ((term.when === 'places' || term.when === 'scenes') && !(Array.isArray(term.has) && term.has.length)) bad.push(`${t}.has: 得列出名字`)
              for (const k of ['gte', 'gt']) if (term[k] !== undefined && !(typeof term[k] === 'number' && term[k] >= 0)) bad.push(`${t}.${k}: 得是不小于 0 的数`)
            })
          }
          if (!Array.isArray(road.lines) || road.lines.length < 2 || road.lines.some((s) => typeof s !== 'string' || !s)) {
            bad.push(`${r}.lines: 得是两句以上（这一条路怎么走）`)
          }
        })
      }
    }
  })
  return bad
}

/**
 * 命运抉择有没有份量（**R18**，给 `scripts/packs.mjs` 用）。
 *
 * 用户 m01903 第 2 条原话：「现在需要用户做出决定的时刻，我们称为『命运抉择』，
 * 那么是需要有对应的、具有份量的事件来供用户选择，而不是轻飘飘的，没有任何代价的。」
 * 四条硬规矩，机器判的是**结构**，读不读得动人只能靠人看：
 *
 *   一、**够格才给选项**：摆了岔口的事件 `weight` 得是 2 或 3。轻的事不该让人做决定。
 *   二、**每条路都得有代价**：`cost` 是一句完整的话（句号收尾、有实词），不许空、
 *       也不许「没费什么」这种零代价。
 *   三、**两条路不对称**：两条路留下的痕迹不能一模一样——两条都留「伤」就等于没得选。
 *   四、**每条路至少留一种痕迹**：`marks` 一到两个，名字得是那六个里的。
 */
export function checkChoices(moments, where = 'moments') {
  const bad = []
  if (!Array.isArray(moments)) return bad
  moments.forEach((moment, i) => {
    if (!moment || typeof moment !== 'object') return
    if (moment.choice === undefined || moment.choice === null) return
    const at = `${where}[${i}]`
    if (!(Number.isInteger(moment.weight) && moment.weight >= 2)) {
      bad.push(`${at}.weight: 摆了岔口就得是 2 或 3（份量不够的事不该让人做决定），现在是 ${moment.weight}`)
    }
    const roads = moment.choice.roads
    if (!Array.isArray(roads) || roads.length !== 2) return
    const sets = []
    roads.forEach((road, j) => {
      const r = `${at}.choice.roads[${j}]`
      if (!road || typeof road !== 'object') { sets.push(''); return }
      const cost = road.cost
      if (typeof cost !== 'string' || !cost.trim()) {
        bad.push(`${r}.cost: 得写明这一条路的代价（不许零代价）`)
      } else {
        if (!/。$/.test(cost)) bad.push(`${r}.cost: 得是一句完整的话（句号收尾）`)
        if (cost.replace(/[。，、；：]/g, '').length < 8) bad.push(`${r}.cost: 太短，读不出代价（${cost}）`)
      }
      const marks = road.marks
      if (!Array.isArray(marks) || !marks.length) {
        bad.push(`${r}.marks: 每条路至少留一种痕迹（${MARK_NAMES.join(' / ')}）`)
      } else {
        if (marks.length > 2) bad.push(`${r}.marks: 最多留两种痕迹`)
        marks.forEach((m, k) => {
          if (!MARK_NAMES.includes(m)) bad.push(`${r}.marks[${k}]: 不认识「${m}」（认得的只有 ${MARK_NAMES.join(' / ')}）`)
        })
      }
      sets.push(Array.isArray(marks) ? marks.slice().sort().join('+') : '')
    })
    if (sets.length === 2 && sets[0] === sets[1]) {
      bad.push(`${at}.choice.roads: 两条路留下的痕迹一模一样（${sets[0]}），那就等于没得选`)
    }
  })
  return bad
}

/**
 * 痕迹池有没有写全（给 `scripts/packs.mjs` 用，规矩 R19）。返回违规说明的数组，空数组＝没问题。
 *
 * 痕迹池是「那一天挑过的那条路，今天后面每一格怎么说」（2026-10-09 加，用户 m01903 第 2、3 条）。
 * 六个名字在 `MARK_NAMES` 里，**一个不许少、也不许多**：
 *   - 六个都得有；
 *   - 每个都得有 `echo`（跟活计无关的那一句，最常出现）、`life`（掺进起居）、`world`（外头怎么传）；
 *   - `echo` 至少四句，`life` 与 `world` 各至少两句——池子太薄，同一天里就会撞回同一句
 *     （同一天有十来个格，一行一句回声）。
 *
 * 这一套的危险跟 R12 / R13 同一种：名字写错一个字母不会报错，只会在屏幕上**安静地少一处回声**。
 */
export function checkMarks(marks, where = 'marks') {
  const bad = []
  if (marks === null || marks === undefined) return bad
  if (typeof marks !== 'object' || Array.isArray(marks)) return [`${where}: 痕迹池得是一个对象`]
  for (const name of MARK_NAMES) {
    const one = marks[name]
    if (one === null || one === undefined) {
      bad.push(`${where}.${name}: 六个痕迹一个都不能少（${MARK_NAMES.join(' / ')}）`)
      continue
    }
    if (typeof one !== 'object' || Array.isArray(one)) {
      bad.push(`${where}.${name}: 得是一个对象（echo / life / world）`)
      continue
    }
    for (const [key, least] of [['echo', 4], ['life', 2], ['world', 2]]) {
      const list = one[key]
      if (!Array.isArray(list) || !list.length) {
        bad.push(`${where}.${name}.${key}: 这一池是空的`)
        continue
      }
      if (list.length < least) {
        bad.push(`${where}.${name}.${key}: 只有 ${list.length} 句，至少 ${least} 句（池子太薄，同一天里会撞回同一句）`)
      }
    }
  }
  for (const name of Object.keys(marks)) {
    if (!MARK_NAMES.includes(name)) {
      bad.push(`${where}.${name}: 不认识这个痕迹（认得的只有 ${MARK_NAMES.join(' / ')}）`)
    }
  }
  return bad
}

/**
 * 规矩本身有没有写错（给 `scripts/packs.mjs` 用）。返回违规说明的数组，空数组＝没问题。
 * 这些检查**不是**在审内容好不好，只是在拦「这台机器读不懂的规矩」。
 */
export function checkRules(rules, where = 'rules') {
  const bad = []
  if (rules === null || rules === undefined) return bad
  if (typeof rules !== 'object' || Array.isArray(rules)) return [`${where}: 规矩得是一个对象`]
  const terms = (list, at) => {
    if (!Array.isArray(list)) { bad.push(`${at}.terms: 得是一个列表`); return }
    list.forEach((term, i) => {
      const t = `${at}.terms[${i}]`
      if (!term || typeof term !== 'object') { bad.push(`${t}: 得是一个对象`); return }
      if (!WHEN_NAMES.includes(term.when)) { bad.push(`${t}.when: 不认识「${term.when}」（认识的只有 ${WHEN_NAMES.join(' / ')}）`); return }
      for (const k of ['add', 'per', 'max', 'gte', 'gt']) {
        if (term[k] !== undefined && !(typeof term[k] === 'number' && term[k] >= 0)) bad.push(`${t}.${k}: 得是不小于 0 的数`)
      }
      if (term.else !== undefined && typeof term.else !== 'boolean') bad.push(`${t}.else: 得是 true 或 false`)
      if (term.when === 'hour' && !(Array.isArray(term.in) && term.in.length && term.in.every((p) => Array.isArray(p) && p.length === 2 && p[0] < p[1] && p[0] >= 0 && p[1] <= 24))) {
        bad.push(`${t}.in: 得是 [[起, 止], ...]，起 < 止、都在 0–24 之间（止不含）`)
      }
      if (term.when === 'place' && !term.out && !Array.isArray(term.is)) bad.push(`${t}: 要么 out: true，要么 is: [地方]`)
      if (term.when === 'tags' && !(Array.isArray(term.has) && term.has.length)) bad.push(`${t}.has: 得列出动作名`)
      if (term.per !== undefined && SIGNALS[term.when] === undefined) bad.push(`${t}.per: 只有 ${SIGNAL_NAMES.join(' / ')} 能按次数算`)
    })
  }
  if (rules.danger !== undefined) {
    const d = rules.danger
    if (typeof d.base !== 'number') bad.push(`${where}.danger.base: 得是数`)
    if (typeof d.cap !== 'number' || d.cap <= 0) bad.push(`${where}.danger.cap: 得是正数`)
    terms(Array.isArray(d.terms) ? { terms: d.terms } && d.terms : d.terms, `${where}.danger`)
  }
  if (rules.outcome !== undefined) {
    const o = rules.outcome
    for (const k of ['paidAt', 'numAt']) if (o[k] !== undefined && !(typeof o[k] === 'number' && o[k] >= 0 && o[k] <= 100)) bad.push(`${where}.outcome.${k}: 得是 0–100 的数`)
    if (o.minRepeat !== undefined && !(o.minRepeat >= 1)) bad.push(`${where}.outcome.minRepeat: 得是不小于 1 的数`)
    if (o.hurtFloor !== undefined && !(o.hurtFloor >= 1)) bad.push(`${where}.outcome.hurtFloor: 得是不小于 1 的数`)
  }
  if (rules.world !== undefined) {
    const w = rules.world
    if (w.minMinutes !== undefined && !(w.minMinutes >= 0)) bad.push(`${where}.world.minMinutes: 得不小于 0`)
    if (Array.isArray(w.terms)) {
      terms(w.terms, `${where}.world`)
      w.terms.forEach((term, i) => {
        if (!term || typeof term.bucket !== 'string' || !term.bucket) bad.push(`${where}.world.terms[${i}].bucket: 得说落进哪个桶`)
      })
    } else bad.push(`${where}.world.terms: 得是一个列表`)
  }
  return bad
}

/* ── 战斗：一场仗怎么打 ───────────────────────────────────────────────────────
 *
 * 用户 m14888：「唯一的缺点，就是极度缺少战斗，我真的两眼一黑。他必须有战斗。」
 *
 * 查过真存档：三十二条记录、一百零九个「记录 × 动作」对里**挨打的有五十八个**——
 * 战斗并不稀，稀的是它在屏幕上只有一句话。所以要改的是**形状**：
 * 从前那一层（`clash`，两拍、没有对手、没有胜负）留着不接线，这一层顶上来。
 *
 *   { foes: [
 *       { id: 'dead', label: '死了的东西',
 *         when: [{ when: 'hours', in: [[22, 24], [0, 5]] },
 *                { when: 'scenes', has: ['tower', 'ruin', 'mine'] }],
 *         meet: [...], way: [...], trade: [...], end: [...] },
 *       …,
 *       { id: 'brigands', label: '劫道的', meet: [...], … } ],   // 最后一个不带 when
 *     tiers: [
 *       { id: 'big', label: '大', when: [{ when: 'fails', gte: 6 }], trade: 3, way: true, turn: true },
 *       { id: 'mid', label: '中', when: [{ when: 'fails', gte: 2 }], trade: 2, way: true, turn: false },
 *       { id: 'small', label: '小', trade: 1, way: false, turn: false } ],   // 兜底
 *     turns: [...],     // 失算那一拍（大档才单说）
 *     report: [...] }   // 日卷那一行的战报，{n} 是这一天打了几场
 *
 * 判法跟高光事件同一套：按列表顺序找第一个 `when` 全中的；**对手最后那一个不带条件**
 * （劫道的，谁都没轮到就归它），**档位最后那一档也不带条件**（小）。所以永远挑得出来一场，
 * 除非那张表本身写坏了。
 *
 * 读的还是记录里真有的东西（撞墙几次、坐了多久、交出去几件、走过哪一景、什么钟点），
 * 没有掷点、不读「现在」：同一份记录永远打同一场仗。校验：R20。
 */

/** 条件里的项名、时段、阈值有没有写错。返回违规说明的数组。 */
function fightTermBad(terms, at) {
  const bad = []
  if (!Array.isArray(terms) || !terms.length) return [`${at}: 得列出条件（每一项都得中）`]
  terms.forEach((term, i) => {
    const t = `${at}[${i}]`
    if (!term || typeof term !== 'object') { bad.push(`${t}: 得是一个对象`); return }
    if (!MOMENT_WHEN_NAMES.includes(term.when)) {
      bad.push(`${t}.when: 不认识「${term.when}」（认识的只有 ${MOMENT_WHEN_NAMES.join(' / ')}）`)
      return
    }
    if (term.when === 'hours' && !(Array.isArray(term.in) && term.in.length && term.in.every((p) => Array.isArray(p) && p.length === 2 && p[0] < p[1] && p[0] >= 0 && p[1] <= 24))) {
      bad.push(`${t}.in: 得是 [[起, 止], ...]，起 < 止、都在 0–24 之间（止不含）`)
    }
    if ((term.when === 'places' || term.when === 'scenes') && !(Array.isArray(term.has) && term.has.length)) {
      bad.push(`${t}.has: 得列出名字`)
    }
    for (const k of ['gte', 'gt']) {
      if (term[k] !== undefined && !(typeof term[k] === 'number' && term[k] >= 0)) bad.push(`${t}.${k}: 得是不小于 0 的数`)
    }
  })
  return bad
}

/**
 * 这一天打哪一场、打多大。返回 `{ foe, tier }`，表写坏了才返回 `null`。
 *
 * `facts` 跟 `momentOf` 是同一份（那一天的记录形状，外加 `hours` / `places` / `scenes` 三个集合）。
 * **它不管「该不该打」**——该不该打由四档收尾那一层定（这一行落在 `hurt` 那一档才叫它）。
 */
export function fightOf(facts, fights = null, ctx = {}) {
  const foes = fights && Array.isArray(fights.foes) ? fights.foes : null
  if (!foes || !foes.length) return null
  const hit = (terms) => !Array.isArray(terms) || !terms.length
    || terms.every((term) => momentHit(term, facts, ctx))
  const foe = foes.find((one) => one && typeof one === 'object' && hit(one.when))
  if (!foe) return null
  const tiers = Array.isArray(fights.tiers) ? fights.tiers.filter((one) => one && typeof one === 'object') : []
  const tier = tiers.find((one) => hit(one.when)) || null
  return tier ? { foe, tier } : null
}

/**
 * 战斗表有没有写错（给 `scripts/packs.mjs` 用，规矩 **R20**）。空数组＝没问题。
 *
 * 判的是「这台机器读不读得懂」，不是在审打斗写得好不好。最要紧的两条：
 *   - **兜底**：对手与档位各**正好一个**不带 `when`，而且都得排在**最后**（顺序即优先级）；
 *   - **池子够厚**：对手四池各至少三句，`turns` 与 `report` 各至少三句——
 *     一场仗要连着说四到七句，池子太薄就会在同一场里撞回同一句。
 */
export function checkFights(fights, where = 'fights') {
  const bad = []
  if (fights === null || fights === undefined) return bad
  if (typeof fights !== 'object' || Array.isArray(fights)) return [`${where}: 战斗表得是一个对象`]

  const foes = fights.foes
  if (!Array.isArray(foes) || foes.length < 3) {
    bad.push(`${where}.foes: 得是三种以上的对手（最后一个不带 when，是兜底）`)
  } else {
    const seen = new Set()
    let falls = 0
    foes.forEach((foe, i) => {
      const at = `${where}.foes[${i}]`
      if (!foe || typeof foe !== 'object') { bad.push(`${at}: 得是一个对象`); return }
      if (typeof foe.id !== 'string' || !foe.id) bad.push(`${at}.id: 得给一个名字`)
      else if (seen.has(foe.id)) bad.push(`${at}.id: 重了（${foe.id}）`)
      else seen.add(foe.id)
      if (typeof foe.label !== 'string' || !foe.label) bad.push(`${at}.label: 得有一个说法（这一伙叫什么）`)
      if (Array.isArray(foe.when) && foe.when.length) {
        for (const one of fightTermBad(foe.when, `${at}.when`)) bad.push(one)
      } else {
        falls += 1
        if (i !== foes.length - 1) bad.push(`${at}.when: 不带条件的那一个（兜底）得排在最后`)
      }
      for (const [key, least] of [['meet', 3], ['way', 3], ['trade', 3], ['end', 3]]) {
        const list = foe[key]
        if (!Array.isArray(list) || list.length < least || list.some((s) => typeof s !== 'string' || !s)) {
          bad.push(`${at}.${key}: 得是 ${least} 句以上（这一场要连着说好几拍）`)
        }
      }
    })
    if (falls !== 1) bad.push(`${where}.foes: 兜底那一个（不带 when）得**正好一个**，现在是 ${falls} 个`)
  }

  const tiers = fights.tiers
  if (!Array.isArray(tiers) || tiers.length < 2) {
    bad.push(`${where}.tiers: 得是两档以上（最后一档不带 when，是兜底）`)
  } else {
    const seen = new Set()
    let falls = 0
    tiers.forEach((tier, i) => {
      const at = `${where}.tiers[${i}]`
      if (!tier || typeof tier !== 'object') { bad.push(`${at}: 得是一个对象`); return }
      if (typeof tier.id !== 'string' || !tier.id) bad.push(`${at}.id: 得给一个名字`)
      else if (seen.has(tier.id)) bad.push(`${at}.id: 重了（${tier.id}）`)
      else seen.add(tier.id)
      if (!Number.isInteger(tier.trade) || tier.trade < 1 || tier.trade > 3) bad.push(`${at}.trade: 得是 1–3 的整数（交手几拍）`)
      for (const k of ['way', 'turn']) if (typeof tier[k] !== 'boolean') bad.push(`${at}.${k}: 得是 true 或 false`)
      if (Array.isArray(tier.when) && tier.when.length) {
        for (const one of fightTermBad(tier.when, `${at}.when`)) bad.push(one)
      } else {
        falls += 1
        if (i !== tiers.length - 1) bad.push(`${at}.when: 不带条件的那一档（兜底）得排在最后`)
      }
    })
    if (falls !== 1) bad.push(`${where}.tiers: 兜底那一档（不带 when）得**正好一个**，现在是 ${falls} 个`)
  }

  for (const [key, least] of [['turns', 3], ['report', 3]]) {
    const list = fights[key]
    if (!Array.isArray(list) || list.length < least || list.some((s) => typeof s !== 'string' || !s)) {
      bad.push(`${where}.${key}: 得是 ${least} 句以上`)
    }
  }
  if (Array.isArray(fights.report) && fights.report.some((s) => typeof s === 'string' && !s.includes('{n}'))) {
    bad.push(`${where}.report: 每一句都得带 {n}（不然这一天打了几场就说不出来）`)
  }
  return bad
}

/* ── 当日计划：册子上的十一站 ────────────────────────────────────────────────
 *
 * 用户 m14781：「我们需要按照一个人的一天来写，一个人在一个魔法世界里，他要如何度过一天，
 * 他有怎样的规划……」m14933 换了根：「他有一个终极任务也是人生任务，一个终局，这一路上，
 * 他要生活、要调查、要寻找、要保护，也要一路杀过去。这样他才能走完整个大陆，到处奔波。」
 * 册子上的十一站就是那条路线，**也是主线进度条**。数据在 `src/packs/adventure/journey.js`。
 *
 *   { stations: [
 *       { id: 'stone',  label: '界碑镇',   seal: '碑' },                     // 第一个不带 when
 *       { id: 'bridge', label: '河间城',   seal: '石桥',
 *         when: [{ when: 'places', has: ['home'] }] },
 *       … ],
 *     lossAt: [4, 8], losses: { early: […], mid: […], late: […] },
 *     plans: { plan: […], season: { spring: […], … } } }
 *
 * 判法跟别处**正好相反**：不是「第一个中的」，是「**最后一个**中的」——走得最远的那一站
 * 说了算。一个都没中就回到第一站（他总有个起点）。项语言跟高光事件同一套（`momentHit`），
 * 读的还是记录里真有的东西：今天到过哪几处、走过哪几景、撞了几次墙、交出去几件。
 *
 * 为什么站号算得出来：存档只留今天（用户 m01403「旧日子删除」），所以**不许**靠「昨天走到第
 * 几站」往后推；方案 A 的老办法就是**只看今天**。校验：R21。
 */

/**
 * 他今天在册子上的哪一站。走得最远的说了算；一处都没到过就是第一站。
 * `facts` 跟 `momentOf` 是同一份（那一天的记录形状外加 `hours` / `places` / `scenes`）。
 */
export function stationOf(facts, stations = null, ctx = {}) {
  if (!Array.isArray(stations) || !stations.length) return null
  for (let i = stations.length - 1; i >= 1; i -= 1) {
    const terms = stations[i] && stations[i].when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => momentHit(term, facts, ctx))) return stations[i]
  }
  return stations[0] || null
}

/**
 * 这一份当日计划表写对没有：站齐不齐、兜底对不对、少一分那三段在不在、句子里的占位符齐不齐。
 * 返回违规说明的数组（空数组＝干净）。
 */
export function checkJourney(journey, where = 'journey') {
  const bad = []
  if (journey === null || journey === undefined) return bad
  if (typeof journey !== 'object' || Array.isArray(journey)) return [`${where}: 当日计划表得是一个对象`]

  const stations = journey.stations
  if (!Array.isArray(stations) || stations.length < 8) {
    bad.push(`${where}.stations: 得是八站以上（册子上那一条路线）`)
  } else {
    const seen = new Set()
    let falls = 0
    stations.forEach((one, i) => {
      const at = `${where}.stations[${i}]`
      if (!one || typeof one !== 'object') { bad.push(`${at}: 得是一个对象`); return }
      if (typeof one.id !== 'string' || !one.id) bad.push(`${at}.id: 得给一个名字`)
      else if (seen.has(one.id)) bad.push(`${at}.id: 重了（${one.id}）`)
      else seen.add(one.id)
      if (typeof one.label !== 'string' || !one.label) bad.push(`${at}.label: 得有一个地名`)
      if (typeof one.seal !== 'string' || !one.seal) bad.push(`${at}.seal: 得写出那一处封印的样子`)
      if (Array.isArray(one.when) && one.when.length) {
        for (const line of fightTermBad(one.when, `${at}.when`)) bad.push(line)
      } else {
        falls += 1
        if (i !== 0) bad.push(`${at}.when: 不带条件的那一站（兜底）得排在最前面`)
      }
    })
    if (falls !== 1) bad.push(`${where}.stations: 兜底那一站（不带 when）得**正好一个**，现在是 ${falls} 个`)
  }

  const total = Array.isArray(stations) ? stations.length : 0
  const lossAt = journey.lossAt
  if (!(Array.isArray(lossAt) && lossAt.length === 2
    && lossAt.every((n) => Number.isInteger(n) && n > 1 && n <= total)
    && lossAt[0] < lossAt[1])) {
    bad.push(`${where}.lossAt: 得是两个递增的整数（少一分那三段从第几站起），都在 2–${total || '站数'} 之间`)
  }

  const losses = journey.losses
  if (!losses || typeof losses !== 'object') {
    bad.push(`${where}.losses: 得写出少一分那三段`)
  } else {
    for (const key of ['early', 'mid', 'late']) {
      const list = losses[key]
      if (!Array.isArray(list) || list.length < 2 || list.some((s) => typeof s !== 'string' || !s)) {
        bad.push(`${where}.losses.${key}: 得是两句以上`)
      }
    }
  }

  const plans = journey.plans
  if (!plans || typeof plans !== 'object') {
    bad.push(`${where}.plans: 得写出当日计划那两样`)
    return bad
  }
  const plan = plans.plan
  if (!Array.isArray(plan) || plan.length < 3 || plan.some((s) => typeof s !== 'string' || !s)) {
    bad.push(`${where}.plans.plan: 得是三句以上（那一天他手上那几件事）`)
  } else {
    for (const mark of ['{n}', '{place}', '{seal}']) {
      if (plan.some((s) => !s.includes(mark))) bad.push(`${where}.plans.plan: 每一句都得带 ${mark}`)
    }
  }
  const season = plans.season
  if (!season || typeof season !== 'object') {
    bad.push(`${where}.plans.season: 得写出四个季节`)
  } else {
    for (const key of ['spring', 'summer', 'autumn', 'winter']) {
      const list = season[key]
      if (!Array.isArray(list) || list.length < 2 || list.some((s) => typeof s !== 'string' || !s)) {
        bad.push(`${where}.plans.season.${key}: 得是两句以上`)
      }
    }
  }
  return bad
}

/* ── 命运：他走到那儿，两条路，你得替他定一条 ──────────────────────────────
 *
 * 用户 m16528 第 1 条把旧的那层否掉了：「这种选择，不叫命运……你现在给的都是日常，都很随意，
 * 都无足轻重。」他给的例子是**方向**（魔窟 / 暗堡，各给一点环境描述，谁也猜不到后面是什么）
 * 和**遭遇**（一伙人在追一个暗精灵，帮还是不帮）。用户 m16552 又把整件事拔高成**一本书**：
 * 岔口选对了书往下讲，选错了就是**分支**——要么死，要么绕回主线。
 *
 * 所以命运那一层换了住处：内容在 `src/packs/adventure/forks.js`，判它的是这里两台机器。
 *
 *   { id: 'way', weight: 3, when: [...], look: [...],
 *     roads: [
 *       { id: 'cave', kind: 'branch', label: '魔窟', look: [...],
 *         outcomes: [ { id: 'death', beats: [...], marks: [], then: { die: true } },
 *                     { id: 'lose-arm', when: [...], beats: [...], marks: [...], then: { tier: 2 } } ] },
 *       { id: 'keep', kind: 'main', label: '暗堡', look: [...], outcomes: [...] } ] }
 *
 * 两件事跟旧的那层不一样：
 *
 *   · **没有 `cost`**。代价不可知（用户第 2 条）——按钮上只有地名与眼前那一句，一个字的账
 *     都不写；后果写在 `beats` 里，跟着**结果**走，不跟着路走。
 *   · **两条路只有一条是主线那一支**（`kind: 'main'`）。走到分支上要么死（`then.die`），
 *     要么绕回主线（`then.back`）——绕回来要付代价。
 *
 * 判法跟高光事件同一套（`momentHit`，读的还是记录里真有的东西），一条都没轮到时返回 `null`
 * ——那一天就没有命运。校验：**R22**，见 `checkForks`。
 */

export const FORK_WHEN_NAMES = MOMENT_WHEN_NAMES

/**
 * 这一天压下来的是哪一件命运。按顺序找第一件**每一项都中**的；一件都没中返回 `null`
 * （那一天照常过，没有岔口）。`facts` 跟 `momentOf` 是同一份。
 */
export function forkOf(facts, forks = null, ctx = {}) {
  if (!Array.isArray(forks)) return null
  for (const one of forks) {
    if (!one || typeof one.id !== 'string' || !one.id) continue
    const terms = one.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => momentHit(term, facts, ctx))) return one
  }
  return null
}

/**
 * 这条路走下来，落的是哪一种结果。按顺序找第一个**每一项都中**的；一条都没轮到时返回
 * **最后那条没有条件的**（就是「谁都没轮到的时候落的那一种」）——所以永远走得出来一种。
 * 表写坏了（一条结果都没有）才返回 `null`。
 */
export function resultOf(facts, road, ctx = {}) {
  const list = road && Array.isArray(road.outcomes) ? road.outcomes : null
  if (!list || !list.length) return null
  for (const one of list) {
    if (!one || typeof one.id !== 'string' || !one.id) continue
    const terms = one.when
    if (!Array.isArray(terms) || !terms.length) continue
    if (terms.every((term) => momentHit(term, facts, ctx))) return one
  }
  const back = list.filter((one) => one && typeof one.id === 'string' && one.id
    && (!Array.isArray(one.when) || !one.when.length))
  return back.length ? back[back.length - 1] : null
}

/**
 * 这一份命运表写对没有：两条路、只有一条主线、每条结果都有交手、不许写代价、
 * 死只能死在分支上。
 * 返回违规说明的数组（空数组＝干净）。
 */
export function checkForks(forks, where = 'forks') {
  const bad = []
  if (forks === null || forks === undefined) return bad
  if (!Array.isArray(forks) || !forks.length) return [`${where}: 得是一串命运（至少一件）`]

  const seen = new Set()
  forks.forEach((one, i) => {
    const at = `${where}[${i}]`
    if (!one || typeof one !== 'object') { bad.push(`${at}: 得是一个对象`); return }
    if (typeof one.id !== 'string' || !one.id) bad.push(`${at}.id: 得给一个名字`)
    else if (seen.has(one.id)) bad.push(`${at}.id: 重了（${one.id}）`)
    else seen.add(one.id)
    // 命运是大事：份量得是三（用户 m01903 第 2 条「具有份量的事件」）。
    if (!(Number.isInteger(one.weight) && one.weight >= 3)) {
      bad.push(`${at}.weight: 命运是大事，份量得是三（现在是 ${one.weight}）`)
    }
    if (Array.isArray(one.when) && one.when.length) {
      for (const line of fightTermBad(one.when, `${at}.when`)) bad.push(line)
    } else {
      bad.push(`${at}.when: 得写出这一件什么时候压下来`)
    }
    const look = one.look
    if (!Array.isArray(look) || !look.length || look.length > 2
      || look.some((s) => typeof s !== 'string' || !s)) {
      bad.push(`${at}.look: 得是一到两句环境（他走到这儿看见什么）`)
    }

    const roads = one.roads
    if (!Array.isArray(roads) || roads.length !== 2) {
      bad.push(`${at}.roads: 得**正好两条路**（现在是 ${Array.isArray(roads) ? roads.length : 0} 条）`)
      return
    }
    const roadIds = new Set()
    let mains = 0
    roads.forEach((road, j) => {
      const rat = `${at}.roads[${j}]`
      if (!road || typeof road !== 'object') { bad.push(`${rat}: 得是一个对象`); return }
      if (typeof road.id !== 'string' || !road.id) bad.push(`${rat}.id: 得给一个名字`)
      else if (roadIds.has(road.id)) bad.push(`${rat}.id: 重了（${road.id}）`)
      else roadIds.add(road.id)
      if (typeof road.label !== 'string' || !road.label) bad.push(`${rat}.label: 得有一个名字（按钮上写的那两三个字）`)
      if (road.kind === 'main') mains += 1
      else if (road.kind !== 'branch') bad.push(`${rat}.kind: 得写 main 还是 branch（现在是 ${road.kind}）`)
      // 代价不可知（用户 m16528 第 2 条）：挑了之前一个字的账都不许写。
      if (road.cost !== undefined) bad.push(`${rat}.cost: 命运不许写代价（用户第 2 条），后果写进结果的 beats 里`)
      const rlook = road.look
      if (!Array.isArray(rlook) || !rlook.length || rlook.length > 2
        || rlook.some((s) => typeof s !== 'string' || !s)) {
        bad.push(`${rat}.look: 得是一到两句环境（这条路往里看是什么样）`)
      }
      const outs = road.outcomes
      if (!Array.isArray(outs) || !outs.length) {
        bad.push(`${rat}.outcomes: 得写出这条路走下去的结果（至少一种）`)
        return
      }
      const outIds = new Set()
      let dies = 0
      let falls = 0
      outs.forEach((res, k) => {
        const oat = `${rat}.outcomes[${k}]`
        if (!res || typeof res !== 'object') { bad.push(`${oat}: 得是一个对象`); return }
        if (typeof res.id !== 'string' || !res.id) bad.push(`${oat}.id: 得给一个名字`)
        else if (outIds.has(res.id)) bad.push(`${oat}.id: 重了（${res.id}）`)
        else outIds.add(res.id)
        if (res.cost !== undefined) bad.push(`${oat}.cost: 命运不许写代价（用户第 2 条）`)
        const beats = res.beats
        if (!Array.isArray(beats) || beats.length < 4 || beats.some((s) => typeof s !== 'string' || !s)) {
          bad.push(`${oat}.beats: 得是四拍以上（踏进去 → 撞上阻碍 → 当场定 → 鸿沟 → 新处境）`)
        }
        const marks = res.marks
        if (!Array.isArray(marks)) bad.push(`${oat}.marks: 得给一串痕迹（可以是空的，但得写出来）`)
        else {
          if (marks.length > 2) bad.push(`${oat}.marks: 最多两样痕迹`)
          for (const name of marks) {
            if (!MARK_NAMES.includes(name)) bad.push(`${oat}.marks: 不认识的痕迹（${name}）`)
          }
        }
        const then = res.then
        if (then !== undefined && (then === null || typeof then !== 'object' || Array.isArray(then))) {
          bad.push(`${oat}.then: 得是一个对象（die / back / tier / lost）`)
        }
        if (then && then.die === true) {
          dies += 1
          if (road.kind !== 'branch') bad.push(`${oat}.then.die: 死只能死在分支上（这一条是 ${road.kind}）`)
          if (Array.isArray(marks) && marks.length) bad.push(`${oat}.then.die: 死了就不留痕迹了（marks 得是空的）`)
        }
        if (then && then.back === true && road.kind !== 'branch') {
          bad.push(`${oat}.then.back: 只有分支才谈得上绕回主线（这一条是 ${road.kind}）`)
        }
        if (then && then.tier !== undefined && ![2, 3].includes(then.tier)) {
          bad.push(`${oat}.then.tier: 只能把这一晚的战斗升到二档或三档（现在是 ${then.tier}）`)
        }
        if (Array.isArray(res.when) && res.when.length) {
          for (const line of fightTermBad(res.when, `${oat}.when`)) bad.push(line)
        } else {
          falls += 1
          if (k !== outs.length - 1) bad.push(`${oat}.when: 不带条件的那一种（兜底）得排在最后`)
        }
      })
      if (falls !== 1) bad.push(`${rat}.outcomes: 兜底那一种（不带 when）得**正好一个**，现在是 ${falls} 个`)
      if (dies > 1) bad.push(`${rat}.outcomes: 死只能有一种，现在是 ${dies} 种`)
    })
    if (mains !== 1) bad.push(`${at}.roads: 两条路里得**正好一条**是主线那一支（现在是 ${mains} 条）`)
  })
  return bad
}
