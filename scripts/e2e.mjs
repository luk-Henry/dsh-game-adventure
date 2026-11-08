/**
 * 端到端跑一遍真链路（除了浏览器和真 ctx，其余全是真的）：
 *
 *   **自己合成的固定存档**（写进临时沙箱）
 *     → 真 src/index.js 的 apply()（最小 ctx）注册出来的那条路由
 *     → 挂在真 node:http 服务上
 *     → 真 src/client.js 的 fetchRecords()（相对 URL 按 origin 解析，跟浏览器一样）
 *     → 真 narrationFor / dayLine / hisTags / composeSequence / helpersFor
 *
 * 为什么单独有这么一个脚本：冒烟测试喂的是桩数据，真机上人只看过一眼截图。
 * 「宿主半边注册的路由 ↔ 客户端读到的 JSON ↔ 翻译层说的话」这三段之间的接缝
 * 一直没有被整体跑过一次。这里把它接起来。
 *
 * **为什么改成自己造存档**（报告 B-05）：从前这里复制真机的 `records.json` 再断言
 * 「客户端要到了记录」。可插件每写一次盘都把旧日子裁掉，只留今天——于是这条断言
 * 实际在问「用户今天用没用过 DSH」：换台机器、换一天跑，早上就跑出 0 条 → 假红。
 * 端到端要验的是**接缝**，不是某台机器的运气。所以固定存档自己造：
 * 结构每次都一样（今天两段 + 两条旧日子），时间跟着当天走，谁跑、哪天跑都全绿。
 *
 * 真机那份 `records.json` 仍然要护着——但那是**另一条**断言：它在盘上就先记哈希、
 * 跑完再对一遍；真机上压根没有那份文件时（DSH 还没跑过），出声说明并跳过。
 *
 * 用法：node scripts/e2e.mjs
 */

import http from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const realHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const realStore = join(realHome, 'gameflow', 'records.json')

const say = (...a) => console.log(...a)
let failed = 0
const check = (name, pass, extra = '') => {
  if (!pass) failed++
  say(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`)
}
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const lastAt = (r) => Number(r?.endedAt) || Number(r?.startedAt) || 0

/* --- 0. 沙箱：一份自己合成的固定存档 -------------------------------- */

const sandbox = join(tmpdir(), 'dsh-game-adventure-e2e')
const sandboxStore = join(sandbox, 'gameflow', 'records.json')
rmSync(sandbox, { recursive: true, force: true })
mkdirSync(dirname(sandboxStore), { recursive: true })

const now0 = Date.now()
const dayFrom = new Date(now0).setHours(0, 0, 0, 0)
const MIN = 60 * 1000
const land = (ts) => Math.floor(ts / (5 * MIN)) * (5 * MIN) // 跟 landedStamp 一样落在整五分钟上
// 「今天最近那一段」：结束在十分钟前（刚过零点那一刻也保证落在今天之内）。
const endA = land(Math.max(now0 - 10 * MIN, dayFrom + 10 * MIN))
const startA = endA - 40 * MIN
// 今天更早那一段（凌晨跑的时候会落到昨天，那时它就该被裁掉——两种都正常）
const endB = startA - 3 * 60 * MIN
const startB = endB - 25 * MIN
// 两条旧日子：一条三天前、一条五天前，**一定会被裁掉**（裁剪那条断言靠它们）
const startC = endA - 3 * 24 * 60 * MIN - 2 * 60 * MIN
const endC = startC + 30 * MIN
const startD = endA - 5 * 24 * 60 * MIN - 2 * 60 * MIN
const endD = startD + 40 * MIN

const tick = (at, n, act) => ({
  at,
  actions: n,
  counts: { [act]: n },
  files: [`D:\\x\\a\\${act}.js`],
  fails: 0,
  tags: [act],
})
const card = (id, startedAt, endedAt, act, ticks) => ({
  id,
  startedAt,
  endedAt,
  minutes: Math.round((endedAt - startedAt) / MIN),
  tags: [act],
  counts: { [act]: ticks.reduce((s, t) => s + t.actions, 0) },
  files: [`D:\\x\\a\\${act}.js`],
  cwd: 'D:\\x\\a',
  fails: 0,
  ticks,
})

const seed = {
  version: 9, // 就是当前版本：不触发回填，这个脚本不碰 ~/.dsh/sessions
  since: startD,
  seam: null,
  dayStart: 0,
  records: [
    card('e2e-today', startA, endA, '改文件', [
      tick(startA, 2, '改文件'),
      tick(startA + 20 * MIN, 1, '改文件'),
      tick(endA, 1, '改文件'),
    ]),
    card('e2e-today-early', startB, endB, '跑命令', [tick(startB, 3, '跑命令'), tick(endB, 4, '跑命令')]),
    card('e2e-old-3d', startC, endC, '查资料', [tick(startC, 2, '查资料'), tick(endC, 2, '查资料')]),
    card('e2e-old-5d', startD, endD, '翻文件', [tick(startD, 5, '翻文件'), tick(endD, 1, '翻文件')]),
  ],
}
writeFileSync(sandboxStore, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
say(`沙箱 store: ${sandboxStore}  ${seed.records.length} 条（自己合成的，不读真机）`)

// 真机那份：在盘上就先记哈希，收工时对一遍。没有那份文件就出声跳过（不是失败）。
const realBefore = existsSync(realStore) ? sha(readFileSync(realStore, 'utf8')) : null
if (realBefore === null) {
  say(`真机存档: ${realStore} 不存在（这台机器还没跑过 DSH），收工时这一条会跳过`)
} else {
  say(`真机存档: ${realStore}  ${readFileSync(realStore, 'utf8').length} B（只看不动）`)
}
process.env.DSH_HOME = sandbox

/* --- 1. 装真宿主半边，抓住它注册的路由 ------------------------------ */

const warnings = []
let captured = null
const ctx = {
  logger: {
    info: () => {},
    error: (...a) => warnings.push(a.join(' ')),
    warn: (...a) => warnings.push(a.join(' ')),
  },
  on: () => () => {},
  effect: (fn) => fn(),
  webServer: {
    register(route) {
      captured = route
      return () => {}
    },
  },
}

const host = await import('../src/index.js')
host.apply(ctx)
await new Promise((r) => setTimeout(r, 400)) // bootstrap 是 async 的，等它落定

check('宿主半边注册了路由', captured !== null)
check('路由形状对', captured?.kind === 'prefix' && captured?.path === '/dsh-game-adventure',
  `${captured?.kind} ${captured?.path}`)
check('宿主半边没报错', warnings.length === 0, warnings.join(' | '))

/* --- 2. 挂到真 HTTP 服务上 ----------------------------------------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const hit = url.pathname === captured.path || url.pathname.startsWith(`${captured.path}/`)
  if (hit) return captured.handler(req, res)
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('nope')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
say(`\n宿主半边现在挂在 ${origin}\n`)

/* --- 3. 用真客户端去要数据 ----------------------------------------- */

const realFetch = globalThis.fetch
globalThis.location = { protocol: 'http:', origin }
globalThis.fetch = (url, init) => realFetch(new URL(url, origin), init)

const client = await import('../src/client.js')
const records = await client.fetchRecords()
check('客户端要到了记录', records.length > 0, `${records.length} 条`)
check('每条都有渲染要用的字段',
  records.every((e) => Number.isFinite(e.startedAt) && Number.isFinite(e.minutes) && Array.isArray(e.tags)),
  JSON.stringify(records[0]))

/* --- 3b. 量尺寸：真 HTTP 走一圈（开关是主目录里的一个文件） --------- */

{
  const url = `${origin}/dsh-game-adventure/measure`
  const off = await realFetch(url).then((r) => r.json())
  check('量尺寸：默认是关的（插件本身不带这个行为）', off.on === false, JSON.stringify(off))

  const denied = await realFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ panel: { w: 1 } }),
  })
  check('量尺寸：开关没开时 POST 被拒（403），一个字节都写不下去', denied.status === 403, String(denied.status))

  // 打开开关（就是主目录里放一个空文件），再量一次
  const switchFile = join(process.env.DSH_HOME, 'gameflow', 'measure.on')
  writeFileSync(switchFile, '', 'utf8')
  const on = await realFetch(url).then((r) => r.json())
  check('量尺寸：放了开关文件就开着', on.on === true, JSON.stringify(on))

  const payload = {
    theme: 'plain',
    voice: 'adventure',
    panel: { w: 560, h: 720 },
    items: [{ name: 'stage svg 地图', x: 22, y: 12, w: 516, h: 280 }],
    map: '<svg id="e2e-map"></svg>',
  }
  const saved = await realFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json())
  check('量尺寸：开着就写下去', saved.ok === true, JSON.stringify(saved))

  const dir = join(process.env.DSH_HOME, 'gameflow', 'measure')
  const layout = JSON.parse(readFileSync(join(dir, 'layout.json'), 'utf8'))
  check('量尺寸：layout.json 里是逐块的位置（能拿它算对齐）',
    layout.items?.[0]?.x === 22 && layout.panel?.w === 560, JSON.stringify(layout.items?.[0]))
  check('量尺寸：地图 SVG 单独一份 map.svg（好离线出图看）',
    readFileSync(join(dir, 'map.svg'), 'utf8').includes('e2e-map'))

  rmSync(switchFile, { force: true })
  const shut = await realFetch(url).then((r) => r.json())
  check('量尺寸：删掉开关文件就停', shut.on === false, JSON.stringify(shut))
}

/* --- 4. 真翻译层：屋子里会说什么 ----------------------------------- */

// 「此刻」取最后一段收工之后一分钟：跟真机一样，「他刚坐下/刚走开」这两种都有话说。
const now = endA + MIN
const n = client.narrationFor(records, now)
say(`\n【他此刻】${n.line}    （他这会儿在${client.placeName(n.place) || '地图外面'}）`)

for (const d of [0, 1, 3, 5, 9, 21, 23]) {
  const t = now + d * 3600 * 1000
  say(`  ${String(d).padStart(2)} 小时后：${client.narrationFor(records, t).line}`)
}

say('\n【见闻录】')
// 跟面板上一样按 composeSequence 拼：单独调 dayLine 时不知道前后几行讲了什么，
// 于是会看到「两行同一句开场」这种面板上根本不会出现的假象。
const seq = client.composeSequence(records, 'adventure')
const ordered = records.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
for (const e of ordered.slice(0, 8)) {
  const date = new Date(e.startedAt)
  const stamp = `${date.getMonth() + 1}/${date.getDate()}`
  const bits = [seq.get(String(e.id))?.line || client.dayLine(e)]
  const helpers = client.helpersFor(e)
  if (helpers) bits.push(helpers)
  // 交付物现在跟文件名并在一起算左栏，这里只做个人肉核对
  const names = [...(e.files || []), ...(e.deliverables || [])]
    .map((f) => String(f).split(/[\\/]/).pop())
    .filter((v, i, a) => v && a.indexOf(v) === i)
  if (names.length) bits.push(`[动了 ${names.length} 个文件]`)
  say(`  ${stamp}  [${client.hisTags(e.tags).join(' ')}]  ${bits.join(' ')}`)
}

check('他此刻有句话', typeof n.line === 'string' && n.line.length > 0)
// 2026-10-08（第三十六版）：原来这里写着「或者明确出门了」——`place` 可以是 `null`
// （户外的活、以及「他出门了」都写 `null`），于是**记号常常整个从图上消失**。
// 用户原话是「角色必须一直显示在地图上」，所以 `null` 这条路已经堵死了：
// 户外的活有自己的野地落点，出门那一支钉在落脚处（`home`）。这里不再容 `null`。
check('他此刻在地图上一定有个位置（记号不许消失）',
  typeof n.place === 'string' && n.place.length > 0 && client.placeName(n.place).length > 0,
  String(n.place))
check('每条记录都能翻出见闻录的一行',
  records.every((e) => typeof client.dayLine(e) === 'string' && client.dayLine(e).length > 0))
check('标签全被翻译成他那边的词',
  records.every((e) => client.hisTags(e.tags).every((w) => !/改文件|跑命令|翻文件|查资料|派了活|聊了聊/.test(w))),
  JSON.stringify(records.map((e) => client.hisTags(e.tags))))

/* --- 4b. 按下「开始冒险」：真 HTTP 走一圈（8 → 9，用户 m04200） ------ */

// 先把「裁剪」这一刻的存档抓下来核对：按下之后它还会被起点再裁一次（见收工那两条断言）。
const trimmed = JSON.parse(readFileSync(sandboxStore, 'utf8'))
const hadOlder = seed.records.some((r) => lastAt(r) < dayFrom)

// 用户原话：「不是，我刚刚点开，就已经存在2条冒险在里面了，这是不对的。当用户点开的时候，
// 才会开始计算时间，并到下一个5分钟的时候才会落盘。」
// 所以按下那一刻之前攒的记录要**从存档里删掉**，并把起点记成 `dayStart`。
// 这里按在「此刻」：今天早先那两段都结束在此刻之前，按完应当一条都不剩。
const pressedAt = now0
const pressRes = await realFetch(`${origin}/dsh-game-adventure/start`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ at: pressedAt }),
})
const pressed = await pressRes.json().catch(() => ({}))
check('按下开始冒险：真 HTTP 回 200 + ok', pressRes.status === 200 && pressed.ok === true,
  `${pressRes.status} ${JSON.stringify(pressed)}`)
check('按下开始冒险：起点写进存档（dayStart 就是按下的那一刻）',
  JSON.parse(readFileSync(sandboxStore, 'utf8')).dayStart === pressedAt,
  String(JSON.parse(readFileSync(sandboxStore, 'utf8')).dayStart))
check('按下开始冒险：起点之前就结束的记录一条不剩',
  JSON.parse(readFileSync(sandboxStore, 'utf8')).records.length === 0,
  `${JSON.parse(readFileSync(sandboxStore, 'utf8')).records.length} 条`)

const polled = await realFetch(`${origin}/dsh-game-adventure/records`).then((r) => r.json())
check('取数据的应答带上 dayStart（界面靠它裁掉起点之前那几格）',
  polled.dayStart === pressedAt && Array.isArray(polled.records) && polled.records.length === 0,
  `dayStart=${polled.dayStart} records=${polled.records?.length}`)

/* --- 5. 收工：关服务、还原 fetch、对账 ------------------------------ */

// `server.close()` 要**等它回调**：从前这里写了就往下跑、紧接着 `process.exit`，
// keep-alive 连接还没断干净，libuv 就报 `UV_HANDLE_CLOSING` 断言（报告 B-05 那条噪音）。
await new Promise((r) => server.close(() => r()))
globalThis.fetch = realFetch

// 真机那份：**一个字都不许动**。没有那份文件就没有可动的东西，出声跳过。
if (realBefore === null) {
  say(`  --   真机的 records.json 不存在，跳过「没动过用户记录」这一条（不是失败）`)
} else {
  const realAfter = sha(readFileSync(realStore, 'utf8'))
  check('跑完没动过用户那份 records.json（sha256 一致）', realAfter === realBefore,
    `${realBefore.slice(0, 12)} → ${realAfter.slice(0, 12)}`)
}
// 2026-10-09（用户 m01403 第 2 条「旧日子删除」）：沙箱那份**会被改**，而且是应该改——
// 宿主半边每次应答/写盘前都把记录裁到只剩今天，顺手记下接缝（`since` / `seam`）。
// 裁剪这一条在按下之前就核对过了（见上面 `trimmed`），因为按下之后存档会被**再裁一次**
// （起点之前的一条不剩），那正是 8 → 9 要的语义。
check('裁剪真的裁了：写回去的只剩今天，旧日子一条不剩',
  trimmed.version === 9 && trimmed.records.length > 0
  && trimmed.records.length < seed.records.length
  && trimmed.records.every((r) => lastAt(r) >= dayFrom),
  `v${trimmed.version} ${seed.records.length} → ${trimmed.records.length} 条`)
check('沙箱那份记下了两个接缝（since 是头一天；有旧日子时 seam 是上一段）',
  trimmed.since > 0 && (!hadOlder || (trimmed.seam && trimmed.seam.startedAt < dayFrom)),
  `since=${trimmed.since} seam=${JSON.stringify(trimmed.seam)}`)

const sandboxAfter = JSON.parse(readFileSync(sandboxStore, 'utf8'))
check('沙箱终态：版本 9、dayStart 就是按下那一刻（记录已被起点裁空）',
  sandboxAfter.version === 9 && sandboxAfter.dayStart === pressedAt && sandboxAfter.records.length === 0,
  `v${sandboxAfter.version} dayStart=${sandboxAfter.dayStart} ${sandboxAfter.records.length} 条`)

say(`\n${failed === 0 ? '全过' : `${failed} 条不过`}`)
// 不调 `process.exit()`：让事件循环自己收尾（宿主的定时器已经 `unref()` 过）。
// 有残留句柄时宁可等它，也不要拿 `exit` 硬砍——那是 libuv 断言噪音的来源。
process.exitCode = failed ? 1 : 0
