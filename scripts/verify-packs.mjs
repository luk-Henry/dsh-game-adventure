/**
 * 证明「包把 client.js 里那份底子整段收着，面板读的就是包那一份」。
 *
 * 三段对照：
 *   ① `applyPack({})` 的结果（包里的句子）
 *   ② `SOURCE_CONTENT`（client.js 里仍然写着的字面量，装载之前抓住的）
 *   ③ 活对象（`gf.SCENES` 这些，面板真正读的）
 *
 * 接线之后 ② 已经不再被读了，它的身份是「**切开那天的冻结快照**」（2026-10-10 ④ 文本重建
 * 那一版起）：新句子一律接在每个数组的**末尾**，所以底子永远是包的**前缀**。于是这里比两件事：
 *   · 包把底子**整段收着**——老句子一条不少、一条没挪位（前缀比）；
 *   · 面板读的那一份跟包装出来的**一字不差**（全等）——接线没走样。
 * 早先比的是「三者一字不差」，那要求每加一句都得在两个文件里各写一遍；语料越长这个双写越是坑，
 * 所以改成前缀。底子里那句「包 = 底子 = 面板」的说法从这一版起作废。
 *
 *   node scripts/verify-packs.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { applyPack, PACKS } from '../src/packs/index.js'

const gf = await import('../src/client.js')
const target = applyPack({}, 'adventure', 'adventure')
const base = gf.SOURCE_CONTENT

const names = [
  'SCENES', 'SHARDS', 'VOICES', 'WORLD_LINES', 'WORLD_QUIET', 'SHARED_LINES',
  'HOME_LINES', 'CAST', 'CAST_LINES', 'PROP_WORDS', 'LIFE_POOLS', 'ACTION_PLACE', 'OUT_KEYS',
]

const size = (v) => (v instanceof Set ? `${v.size} 个` : Array.isArray(v) ? `${v.length} 条` : `${Object.keys(v).length} 键`)

let bad = 0
// 底子是冻结快照（见文件头），所以「包收着底子」那一段按**前缀**比：
// 数组逐位对到 `before` 那么长（元素是对象就继续往里递归，`scenes` 里那种「对象套数组」也裁得动）；
// 对象照底子的键递归；Set（`OUT_KEYS`）照样裁。
// 装载器会给 `VOICES` 的每一条加一个 `world` 字段，也会让 `SHARDS`/`SCENES` 多出
// 「另一个包自带的那套说法」——所以对「面板读的那一份」也用同一把尺子裁到包有的键。
const prefix = (after, before) => {
  if (before instanceof Set) return new Set([...after].filter((k) => before.has(k)))
  if (Array.isArray(before)) return before.map((b, i) => prefix(Array.isArray(after) ? after[i] : undefined, b))
  return (after && typeof after === 'object')
    ? Object.fromEntries(Object.keys(before).map((k) => [k, prefix(after[k], before[k])]))
    : after
}
for (const name of names) {
  // PROP_WORDS / LIFE_POOLS / ACTION_PLACE 没有 export（只有模块内部在用），
  // 所以第三段对它们无从下手——前两段（包收着底子）照样成立。
  const live = name in gf
  try {
    assert.deepStrictEqual(prefix(target[name], base[name]), base[name], `${name}：底子那一段不在包里了（少了句子或挪了位置）`)
    if (live) assert.deepStrictEqual(prefix(gf[name], target[name]), target[name], `${name}：面板读的那一份跟包对不上`)
    console.log(`✓ ${name.padEnd(13)} ${size(base[name]).padStart(6)}   包收着底子${live ? '，面板读的就是包那一份' : '（没导出，第三段跳过）'}`)
  } catch (e) {
    bad += 1
    console.log(`✗ ${name.padEnd(13)}`)
    console.log(`    ${String(e.message).split('\n').slice(0, 6).join('\n    ')}`)
  }
}

// 装载新加进来的键。注册表里**只有讲得出话的包**会往这几组里加键（判据就是 `actionLines`），
// 加进来的键只要是注册表里声明过的说法就合法。只有「注册表里没声明的键」才算夹带。
// 2026-10-06 晚船家收进 `.parked/ferry-voice/`、2026-10-08 那三套预留（规则怪谈 / 宫斗心计 /
// 谍战潜伏）只有名字没有内容，于是讲得出话的只剩冒险一套，这一段现在应当**一个键都没有**——
// 哪天有新的说法进注册表，它自己会重新冒出来。
// 数组（`WORLD_QUIET` 这种）不参与这一段：它的「键」是下标，包变长就会冒出一堆假的新键。
const keysOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set) ? Object.keys(v) : [])
const declared = new Set(Object.values(PACKS).filter((p) => p.actionLines).map((p) => p.voice))
const added = names.flatMap((name) => keysOf(target[name])
  .filter((k) => !(k in (base[name] || {})) && !declared.has(k))
  .map((k) => `${name}.${k}`))
const legit = names.flatMap((name) => keysOf(target[name])
  .filter((k) => !(k in (base[name] || {})) && declared.has(k))
  .map((k) => `${name}.${k}`))
console.log(`\n装载新加进来的键：${legit.join('、') || '（无）'}${legit.length ? `（注册表里声明过的说法：${[...declared].join('/')}）` : ''}`)
if (added.length !== 0) {
  bad += 1
  console.log(`✗ 有底子里没有的键混进来了：${added.join('、')}`)
}

// 规矩也要一份：包里的数 = `target.RULES`，而且面板真的在读它
// （把同一份规矩直接喂给引擎，与 `gf.dangerOf` 对，相等就说明 client.js 里的 RULES 就是这一份）
import { rules as adventureRules } from '../src/packs/adventure/rules.js'
import { dangerOf as rulesDangerOf } from '../src/packs/rules.js'
try {
  assert.deepStrictEqual(target.RULES, adventureRules)
  for (let i = 0; i < 24; i += 1) {
    const entry = { id: `probe-${i}`, fails: i % 5, minutes: i * 13, startedAt: Date.UTC(2026, 9, 5, i % 24) }
    for (const place of [null, 'workshop', 'market']) {
      assert.equal(gf.dangerOf(entry, place), rulesDangerOf(entry, place, adventureRules), `dangerOf 不一致：${i}/${place}`)
    }
  }
  console.log(`✓ RULES         ${Object.keys(adventureRules).length} 键   包里的规矩原样装进 target.RULES，且面板读的就是它`)
  // 场景句那一层：26 个场景。**开头/收尾在世界包的 `scenes` 里，四档结局在 `shards` 里**
  // （面板两处都读；早年给讲述者包写的全套六档随案牍一起收进了 .parked/ledger-voice/）。
  const sceneList = Object.values(target.SCENES?.adventure || {}).flat()
  const sceneKeys = [...new Set(sceneList.map((s) => s.key))]
  const shards = target.SHARDS?.adventure || {}
  assert.equal(sceneKeys.length, 26)
  assert.ok(sceneKeys.every((k) => shards[k]))
  assert.ok(sceneList.every((s) => (s.lead || []).length && (s.tail || []).length))
  assert.ok(Object.values(shards).every((s) => ['more', 'paid', 'hurt', 'again']
    .every((t) => Array.isArray(s[t]) && s[t].length)))
  const frags = sceneList.reduce((n, s) => n + s.lead.length + s.tail.length, 0)
    + Object.values(shards).reduce((n, s) => n + s.more.length + s.paid.length + s.hurt.length + s.again.length, 0)
  console.log(`✓ 场景句        ${sceneKeys.length} 个场景 / ${frags} 条片段   开头收尾在世界包、四档在拼句池，面板读的就是这两份`)

  // 地理那一层（2026-10-06 搬进包）：地图、取景框、地点。**底子里已经没有这一份了**
  // （`SOURCE_CONTENT` 只管句子），所以这里对的是「包 = 面板读的」两段，
  // 外加「包里的地图 = 运行时现画的那一张」（不许两处各写一遍）。
  // 2026-11-10：原来这里 import `.scratch/map-data.js`（532 KB 旧图当夹具）逐字比对。
  // 那个文件不在任何 clone 里，脚本一跑就 `Cannot find module`——插件市场的静态预检
  // 也正是把它记成「打包面里有模块指向包外」（SUBMISSION_SCAN_INCOMPLETE）。夹具删掉，
  // 换成「现画一次 + 摘要钉住」：图要是漂了，这里照样红，仓库里却不再有包外引用。
  const { mapSvg, MAP_CSS: MAP_CSS_NOW } = await import('../src/map/world.js')
  const { getPack } = await import('../src/packs/index.js')
  const pack = getPack('adventure')
  assert.equal(pack.map.svg, mapSvg(), '包里的地图不是 src/map/world.js 现画的那一份')
  assert.equal(pack.map.css, MAP_CSS_NOW, '包里的地图样式不是 src/map/world.js 的那一份')
  // 期望摘要：2026-11-10 复核的那一版（地图 554,732 字 / 样式 607 字）。
  // **有意改地图就同步改这两行**——这正是原来的夹具唯一在做的事。
  assert.equal(createHash('sha256').update(pack.map.svg).digest('hex'),
    'c8140ea7bae40caaaf4dcbe869616efd1f89ab3a352697b9fb47f5e9b8c33650', '地图内容漂了')
  assert.equal(createHash('sha256').update(pack.map.css).digest('hex'),
    '8b2089fc13e182557479937547710f2df4341f459b9cafd6f05d5b80c06b4cab', '地图样式漂了')
  assert.deepStrictEqual(target.PLACES, pack.places)
  assert.deepStrictEqual(target.VIEW, pack.map.view)
  assert.deepStrictEqual(gf.PLACES, pack.places)
  assert.deepStrictEqual(gf.VIEW, pack.map.view)
  assert.equal(gf.MAP_SVG, pack.map.svg)
  assert.equal(gf.MAP_CSS, pack.map.css)
  assert.equal(gf.WORLD_ID, pack.id)
  assert.equal(gf.WORLD_THEME, pack.theme)
  console.log(`✓ 地理          ${Object.keys(pack.places).length} 处地点 / 地图 ${pack.map.svg.length} 字   包 = 面板读的，且包里的地图就是素材本身`)

  // 一天的框（2026-10-08 加的 C1「一天要有头有尾」）：跟 `MOMENTS` 一样**只住包里**，
  // `SOURCE_CONTENT` 里没有第二份，所以这里对的是「包 = 装载器 = 面板读的」。
  assert.deepStrictEqual(target.DAY_FRAME, pack.dayFrame)
  assert.deepStrictEqual(gf.DAY_FRAME, pack.dayFrame)
  const frameCount = ['open', 'close', 'meal']
    .reduce((n, part) => n + Object.values(pack.dayFrame[part] || {}).reduce((m, l) => m + l.length, 0), 0)
  console.log(`✓ 一天的框       ${frameCount} 条   包 = 装载器 = 面板读的（这一组只住包里，底子里没有第二份）`)

  // 交锋（2026-10-08 加的 A「战斗加厚」）：同样只住包里的一组。26 个场景一个不缺，
  // 每个场景**至少** 4 条挨打句（2026-10-08 加的那批是 4 条；2026-10-10 ④ 文本重建又各加了
  // 3 到 5 条，所以这里判「不少于 4」）+ 2 拍交锋（接住 / 代价）。
  assert.deepStrictEqual(target.CLASHES, pack.clash)
  assert.deepStrictEqual(gf.CLASHES, pack.clash)
  const clashKeys = Object.keys(pack.clash || {})
  assert.equal(clashKeys.length, 26)
  assert.ok(clashKeys.every((k) => shards[k]), '有交锋的场景不在拼句池里')
  assert.ok(clashKeys.every((k) => pack.clash[k].hold.length === 2 && pack.clash[k].cost.length === 2))
  assert.ok(clashKeys.every((k) => (shards[k].hurt || []).length >= 4), '有场景的挨打句不到 4 条')
  const clashCount = clashKeys.reduce((n, k) => n + pack.clash[k].hold.length + pack.clash[k].cost.length, 0)
  const hurtCount = clashKeys.reduce((n, k) => n + shards[k].hurt.length, 0)
  console.log(`✓ 交锋          ${clashKeys.length} 个场景 / ${clashCount} 句 + ${hurtCount} 条挨打句   包 = 装载器 = 面板读的；每个场景至少 4 条挨打句 + 2 拍交锋`)

  // 序曲（2026-10-08 加的「起点 / 他叫什么」）：同样只住包里的一组。
  // 形状是 `{ name, lines }`——名字单独一格（归宿那一层还要用），六句话按顺序讲。
  assert.deepStrictEqual(target.ORIGIN, pack.origin)
  assert.deepStrictEqual(gf.ORIGIN, pack.origin)
  const originLines = (pack.origin && pack.origin.lines) || []
  assert.ok(pack.origin.name && originLines.length >= 4, '序曲太短或没有名字')
  assert.ok(String(originLines[0]).includes(pack.origin.name), '第一句里没有他的名字')
  console.log(`✓ 序曲          ${originLines.length} 句 / 名字 ${pack.origin.name}   包 = 装载器 = 面板读的（这一组也只住包里）`)

  // 方向与比例（2026-10-08 加的 ③「方向 + 比例」）：同样只住包里的一组。
  // 形状是 `[{ id, label, cap, bias, when?, fallback?, lines }]`，顺序即优先级，
  // 兜底那一档排在最后、cap 100、不带条件。
  assert.deepStrictEqual(target.DIRECTIONS, pack.directions)
  assert.deepStrictEqual(gf.DIRECTIONS, pack.directions)
  const dirs = pack.directions || []
  assert.ok(dirs.length >= 4, '方向那一列太短')
  assert.ok(dirs.every((d) => d && d.id && d.label && Array.isArray(d.lines) && d.lines.length >= 3))
  const backs = dirs.filter((d) => d.fallback)
  assert.equal(backs.length, 1, '兜底要正好一个')
  assert.equal(backs[0].cap, 100, '兜底那一档的 cap 得是 100')
  assert.ok(dirs[dirs.length - 1].fallback === true, '兜底要排在最后（顺序就是优先级）')
  assert.ok(dirs.filter((d) => !d.fallback).every((d) => Array.isArray(d.when) && d.when.length))
  const dirCount = dirs.reduce((n, d) => n + d.lines.length, 0)
  console.log(`✓ 方向与比例    ${dirs.length} 档 / ${dirCount} 句抬头（${dirs.map((d) => `${d.label}${d.cap}`).join('、')}）   包 = 装载器 = 面板读的`)

  // 选择点（2026-10-08 加的 ④「选择点」）：岔口住在 `moments` 里，`MOMENTS` 那一组
  // 已经整份逐字比过了（`assert.deepStrictEqual(target.MOMENTS, pack.moments)` 在别处），
  // 所以这里只把形状点一遍：四件事各两条路，前一条带条件、最后一条不带。
  const moments = pack.moments || []
  const roads = moments.flatMap((m) => ((m.choice && m.choice.roads) || []))
  assert.equal(roads.length, moments.length * 2, '每件事得正好两条路')
  assert.ok(moments.every((m) => {
    const rs = (m.choice && m.choice.roads) || []
    return rs.length === 2 && rs.every((r) => r && r.id && r.label && Array.isArray(r.lines) && r.lines.length >= 2)
      && Array.isArray(rs[0].when) && rs[0].when.length && !(rs[1].when && rs[1].when.length)
  }), '岔口的形状不对（前一条带条件、最后一条不带）')
  const roadCount = roads.reduce((n, r) => n + r.lines.length, 0)
  console.log(`✓ 选择点        ${moments.length} 件事 / ${roads.length} 条路 / ${roadCount} 句   岔口住在事件里（${roads.map((r) => r.label).join('、')}）`)

  // 归宿（2026-10-08 加的 ⑤「归宿」）：同样只住包里的一组，挂在年卷那一行末尾。
  // 形状是 `[{ id, when?, lines, close }]`——顺序即优先级，最后一件不带条件（兜底），
  // 末尾那句 `close` 是名字的第二处、也是最后一处。
  assert.deepStrictEqual(target.FATES, pack.fate)
  assert.deepStrictEqual(gf.FATES, pack.fate)
  const fates = pack.fate || []
  assert.ok(fates.length >= 4, '归宿那一列太短')
  assert.ok(fates.every((f) => f && f.id && Array.isArray(f.lines) && f.lines.length >= 3 && typeof f.close === 'string' && f.close), '归宿的形状不对')
  assert.equal(fates.filter((f) => !Array.isArray(f.when) || !f.when.length).length, 1, '兜底要正好一个')
  assert.ok(!Array.isArray(fates[fates.length - 1].when) || !fates[fates.length - 1].when.length, '兜底要排在最后（顺序就是优先级）')
  const name = (pack.origin && pack.origin.name) || ''
  assert.ok(name && fates.every((f) => f.close.includes(name)), '末尾那句收束里没用他的名字')
  const fateCount = fates.reduce((n, f) => n + f.lines.length + 1, 0)
  console.log(`✓ 归宿         ${fates.length} 件 / ${fateCount} 句（末尾那句都带名字）   包 = 装载器 = 面板读的（这一组也只住包里）`)

  // 痕迹（2026-10-09 加的 ③「当天的回响」）：同样只住包里的一组，六个痕迹各三池。
  // 形状是 `{ wound: { echo, life, world }, ... }`——只活当天：那件事走完那一刻起，
  // 当天后面每一行照它挑说法（世界句 / 生活句 / 单独一行回声）。
  assert.deepStrictEqual(target.MARKS, pack.marks)
  assert.deepStrictEqual(gf.MARKS, pack.marks)
  const markNames = Object.keys(pack.marks || {})
  assert.equal(markNames.length, 6, '痕迹不是六个')
  assert.ok(markNames.every((k) => {
    const one = pack.marks[k] || {}
    return ['echo', 'life', 'world'].every((p) => Array.isArray(one[p]) && one[p].length >= 2)
  }), '痕迹的三池形状不对')
  const markCount = markNames.reduce((n, k) => n + pack.marks[k].echo.length + pack.marks[k].life.length + pack.marks[k].world.length, 0)
  console.log(`✓ 痕迹         ${markNames.length} 个痕迹 / ${markCount} 句（回声 ${markNames.map((k) => pack.marks[k].echo.length).join('/')}）   包 = 装载器 = 面板读的（这一组也只住包里）`)

  // 战斗（2026-10-10 加，用户 m14888「他必须有战斗」）：同样只住包里的一组。
  // 形状是 `{ foes, tiers, turns, report }`——五种对手各四池、三档、两池共用的。
  // 旧的 `CLASHES` 那一层留着不接线（备用），所以这里照旧也比它一遍（上面）。
  assert.deepStrictEqual(target.FIGHTS, pack.fights)
  assert.deepStrictEqual(gf.FIGHTS, pack.fights)
  const foes = (pack.fights && pack.fights.foes) || []
  assert.ok(foes.length >= 3, '对手太少')
  assert.ok(foes.every((f) => ['meet', 'way', 'trade', 'end'].every((k) => Array.isArray(f[k]) && f[k].length >= 3)), '对手的四池形状不对')
  assert.ok(foes.filter((f) => !Array.isArray(f.when) || !f.when.length).length === 1
    && (!foes[foes.length - 1].when || !foes[foes.length - 1].when.length), '兜底那个对手不是正好一个、也不在最后')
  const tiers = (pack.fights && pack.fights.tiers) || []
  assert.ok(tiers.length >= 2 && (!tiers[tiers.length - 1].when || !tiers[tiers.length - 1].when.length), '兜底那一档不在最后')
  assert.ok((pack.fights.turns || []).length >= 3 && (pack.fights.report || []).length >= 3, 'turns / report 太薄')
  assert.ok(pack.fights.report.every((t) => t.includes('{n}')), '战报那一池有句子不带 {n}')
  const fightCount = foes.reduce((n, f) => n + f.meet.length + f.way.length + f.trade.length + f.end.length, 0)
    + pack.fights.turns.length + pack.fights.report.length
  console.log(`✓ 战斗         ${foes.length} 种对手 / ${tiers.length} 档 / ${fightCount} 句（${foes.map((f) => f.label).join('、')}）   包 = 装载器 = 面板读的（这一组也只住包里）`)

  // 当日计划（2026-10-10 加，第二期：`dayPlan` + `stateAt`）：同样只住包里的一组。
  // 形状是 `{ stations, lossAt, losses, plans }`——十一站的路线、少一分那三段、那两句。
  assert.deepStrictEqual(target.JOURNEY, pack.journey)
  assert.deepStrictEqual(gf.JOURNEY, pack.journey)
  const stations = (pack.journey && pack.journey.stations) || []
  assert.ok(stations.length >= 8, '站太少')
  assert.ok(!stations[0].when || !stations[0].when.length, '兜底那一站不在最前面')
  assert.ok(stations.filter((s) => !Array.isArray(s.when) || !s.when.length).length === 1, '兜底那一站不是正好一个')
  assert.ok(['spring', 'summer', 'autumn', 'winter'].every((k) => Array.isArray(pack.journey.plans?.season?.[k])
    && pack.journey.plans.season[k].length >= 2), '四季那四池不齐')
  assert.ok(['early', 'mid', 'late'].every((k) => Array.isArray(pack.journey.losses?.[k])
    && pack.journey.losses[k].length >= 2), '少一分那三段不齐')
  const planCount = stations.length + (pack.journey.plans?.plan || []).length
    + Object.values(pack.journey.plans?.season || {}).reduce((n, l) => n + l.length, 0)
    + Object.values(pack.journey.losses || {}).reduce((n, l) => n + l.length, 0)
  console.log(`✓ 当日计划     ${stations.length} 站 / ${planCount} 条（${stations.slice(0, 3).map((s) => s.label).join('、')}……${stations[stations.length - 1].label}）   包 = 装载器 = 面板读的（这一组也只住包里）`)

  // 命运（2026-10-10 加，第三期：`forks`）：同样只住包里的一组。形状是一张表——
  // 每一件命运有 `look`（眼前那一点点环境描写）、两条路（`kind` 一主一支）、
  // 每条路各有几种结果（`beats` 那几拍、`marks` 那几样痕迹，`then.die` / `then.back`）。
  assert.deepStrictEqual(target.FORKS, pack.forks)
  assert.deepStrictEqual(gf.FORKS, pack.forks)
  const forks = Array.isArray(pack.forks) ? pack.forks : []
  assert.ok(forks.length >= 3, '命运太少')
  for (const fork of forks) {
    assert.ok(Array.isArray(fork.look) && fork.look.length >= 1 && fork.look.length <= 2, `${fork.id} 的眼前那一句不对`)
    assert.ok(Array.isArray(fork.roads) && fork.roads.length === 2, `${fork.id} 不是两条路`)
    assert.strictEqual(fork.roads.filter((r) => r.kind === 'main').length, 1, `${fork.id} 的主线不是正好一条`)
    for (const road of fork.roads) {
      assert.ok(Array.isArray(road.look) && road.look.length >= 1 && road.look.length <= 2, `${fork.id}/${road.id} 少了眼前那一句`)
      assert.ok(!('cost' in road), `${fork.id}/${road.id} 还带着代价（代价是不可知的）`)
      assert.ok(Array.isArray(road.outcomes) && road.outcomes.length >= 1, `${fork.id}/${road.id} 一种结果都没有`)
      assert.ok(road.outcomes.every((o) => Array.isArray(o.beats) && o.beats.length >= 4), `${fork.id}/${road.id} 有结果不到四拍`)
      const last = road.outcomes[road.outcomes.length - 1]
      assert.ok(!Array.isArray(last.when) || !last.when.length, `${fork.id}/${road.id} 的兜底不在最后`)
      assert.ok(road.outcomes.filter((o) => !Array.isArray(o.when) || !o.when.length).length === 1, `${fork.id}/${road.id} 的兜底不是正好一个`)
      const die = road.outcomes.filter((o) => o.then && o.then.die === true)
      if (die.length) {
        assert.strictEqual(road.kind, 'branch', `${fork.id}/${road.id} 主线不许死`)
        assert.strictEqual(die.length, 1, `${fork.id}/${road.id} 死路不止一种`)
        assert.ok(!Array.isArray(die[0].marks) || !die[0].marks.length, `${fork.id}/${road.id} 死路上还留了痕迹`)
      }
      for (const out of road.outcomes) {
        if (out.then && out.then.back === true) assert.strictEqual(road.kind, 'branch', `${fork.id}/${road.id} 只有分支才绕回主线`)
      }
    }
  }
  const forkCount = forks.reduce((n, f) => n + f.look.length + f.roads.reduce((m, r) =>
    m + r.look.length + r.outcomes.reduce((k, o) => k + o.beats.length, 0), 0), 0)
  console.log(`✓ 命运         ${forks.length} 件 / ${forks.reduce((n, f) => n + f.roads.reduce((m, r) => m + r.outcomes.length, 0), 0)} 种结果 / ${forkCount} 句   包 = 装载器 = 面板读的（这一组也只住包里）`)
} catch (e) {
  bad += 1
  console.log(`✗ RULES\n    ${String(e.message).split('\n').slice(0, 6).join('\n    ')}`)
}

console.log(bad ? `\n${bad} 处对不上——包与 client.js 已经漂了。` : '\n包收着底子那一段（老句子一条不少、顺序没动），面板读的就是包那一份。')
process.exitCode = bad ? 1 : 0
