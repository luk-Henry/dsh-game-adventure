/**
 * 端到端跑一遍真链路（除了浏览器和真 ctx，其余全是真的）：
 *
 *   真 <DSH_HOME>/gameflow/records.json
 *     → 复制进临时沙箱
 *     → 真 src/index.js 的 apply()（最小 ctx）注册出来的那条路由
 *     → 挂在真 node:http 服务上
 *     → 真 src/client.js 的 fetchRecords()（相对 URL 按 origin 解析，跟浏览器一样）
 *     → 真 narrationFor / dayLine / hisTags / keepsFor / helpersFor
 *
 * 为什么单独有这么一个脚本：冒烟测试喂的是桩数据，真机上人只看过一眼截图。
 * 「宿主半边注册的路由 ↔ 客户端读到的 JSON ↔ 翻译层说的话」这三段之间的接缝
 * 一直没有被整体跑过一次。这里把它接起来，并且顺手确认跑完没动到用户那份数据。
 *
 * 用法：node scripts/e2e.mjs
 */

import http from 'node:http'
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const realHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const realStore = join(realHome, 'gameflow', 'records.json')

// 沙箱：用的是真数据的一份拷贝，跑完不该动到用户那份。
const sandbox = join(tmpdir(), 'dsh-gameflow-e2e')
const sandboxStore = join(sandbox, 'gameflow', 'records.json')
mkdirSync(dirname(sandboxStore), { recursive: true })
copyFileSync(realStore, sandboxStore)
const realBefore = readFileSync(realStore, 'utf8')
process.env.DSH_HOME = sandbox

const say = (...a) => console.log(...a)
let failed = 0
const check = (name, pass, extra = '') => {
  if (!pass) failed++
  say(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`)
}

say(`真 store: ${realStore}  ${statSync(realStore).size} B`)
const seed = JSON.parse(readFileSync(sandboxStore, 'utf8'))
say(`沙箱 store 版本 ${seed.version}，${seed.records.length} 条记录\n`)

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
check('路由形状对', captured?.kind === 'prefix' && captured?.path === '/dsh-gameflow',
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
  const url = `${origin}/dsh-gameflow/measure`
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

const now = Date.now()
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

/* --- 5. 收工，确认没动到用户那份数据 ------------------------------- */

server.close()
globalThis.fetch = realFetch

const realAfter = readFileSync(realStore, 'utf8')
check('跑完没动过用户那份 records.json', realAfter === realBefore)
// 2026-10-09（用户 m01403 第 2 条「旧日子删除」）：沙箱那份**会被改**，而且是应该改——
// 宿主半边每次应答/写盘前都把记录裁到只剩今天，顺手记下两个接缝（`since` / `seam`）。
// 所以这里断的不是「一个字没动」，而是「动得对」：写回去的只剩今天，两个标量在。
const sandboxAfter = JSON.parse(readFileSync(sandboxStore, 'utf8'))
const dayFrom = new Date().setHours(0, 0, 0, 0)
const lastAt = (r) => Number(r?.endedAt) || Number(r?.startedAt) || 0
const hadOlder = seed.records.some((r) => lastAt(r) < dayFrom)
check('沙箱那份被按新规矩裁过：写回去的只剩今天',
  sandboxAfter.version === 8 && sandboxAfter.records.every((r) => lastAt(r) >= dayFrom),
  `v${sandboxAfter.version} ${seed.records.length} → ${sandboxAfter.records.length} 条`)
check('沙箱那份记下了两个接缝（since 是头一天；有旧日子时 seam 是上一段）',
  sandboxAfter.since > 0 && (!hadOlder || (sandboxAfter.seam && sandboxAfter.seam.startedAt < dayFrom)),
  `since=${sandboxAfter.since} seam=${JSON.stringify(sandboxAfter.seam)}`)

say(`\n${failed === 0 ? '全过' : `${failed} 条不过`}`)
process.exit(failed ? 1 : 0)
