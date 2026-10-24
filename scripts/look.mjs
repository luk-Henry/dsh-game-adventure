/**
 * 用无头 Edge 把面板真的渲染出来，量关键坐标、截图、并断言「版面对不对」。
 *
 * 为什么单独有这个脚本：`scripts/smoke.mjs` 的 DOM 垫片没有排版引擎，
 * 它只能验「说了什么」，验不了「摆在哪儿」——而用户报的 bug 一半是「摆在哪儿」
 * （地图和下面的字左右对不齐、面板被窗口切掉、右栏文字被挤断）。
 * 这里用 Chromium 自己算出来的 getBoundingClientRect 当尺子，把这几件事钉成数字。
 *
 * 注意：Chromium 起不来是被沙箱拦住的（FATAL: platform_channel.cc Check failed 0x5），
 * 所以要在一个更宽的沙箱里跑；它不进 npm test，是改版面时自己看一眼的工具。
 *
 *   node scripts/look.mjs            量四个常见窗口尺寸，顺手截图
 *   node scripts/look.mjs 1280x800   只量一个尺寸
 *
 * 截图落在 .scratch/look-<宽>x<高>.png。换说法当年是靠 GF_VOICE 看的，
 * 2026-10-05 只有冒险这一套，那条开关已经撤了（案牍在 .parked/ledger-voice/）。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PAGE = new URL('../preview.html', import.meta.url).href
const SHOTS = join(ROOT, '.scratch')

const EDGES = [
  process.env.GF_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const edge = EDGES.find((p) => existsSync(p))
if (!edge) {
  console.log('没找到 Edge，跳过（要量版面就在 GF_EDGE 里指一个 Chromium 内核浏览器）')
  process.exit(0)
}

const arg = process.argv[2]
// 说法：2026-10-05 起只有冒险这一套（案牍摘掉，收在 .parked/ledger-voice/），
// 所以这里没有开关可拨，预览页也不认说法参数了。
const sizes = arg
  ? [arg.split('x').map(Number)]
  : [
      [1920, 1080],
      [1440, 900],
      [1280, 800],
      [1024, 720],
    ]

const port = 9333 + (process.pid % 200)
const profile = mkdtempSync(join(tmpdir(), 'gf-look-'))
mkdirSync(SHOTS, { recursive: true })

const child = spawn(
  edge,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1600,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function json(path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return res.json()
}

// 等调试端口起来
let ready = false
for (let i = 0; i < 40; i++) {
  try {
    await json('/json/version')
    ready = true
    break
  } catch {
    await sleep(500)
  }
}
if (!ready) {
  child.kill()
  console.log(`Edge 起来了但调试端口没开（${port}）——多半是沙箱不让它开 IPC`)
  process.exit(1)
}

const list = await json('/json/list')
const target = list.find((t) => t.type === 'page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const waiting = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  const slot = waiting.get(msg.id)
  if (!slot) return
  waiting.delete(msg.id)
  msg.error ? slot.reject(new Error(JSON.stringify(msg.error))) : slot.resolve(msg.result)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    waiting.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
await send('Runtime.enable')
await send('Page.enable')

/** 在页面里量一遍：坐标都换算成视口坐标，够断言用。 */
const MEASURE = `(() => {
  const host = [...document.querySelectorAll('[data-dsh-gameflow]')].pop()
  if (!host || !host.shadowRoot) return { err: '没找到面板' }
  const sr = host.shadowRoot
  const box = (sel) => {
    const el = sr.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
             right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1),
             scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight }
  }
  const rows = [...sr.querySelectorAll('.gf-row')].map((row) => {
    const him = row.querySelector('.gf-him-col')
    const you = row.querySelector('.gf-you')
    const f = (el) => el ? { scrollW: el.scrollWidth, clientW: el.clientWidth } : null
    return { him: f(him), you: f(you) }
  })
  return {
    viewport: { w: innerWidth, h: innerHeight },
    room: box('.gf-room'),
    stageSvg: box('.gf-stage svg'),
    when: box('.gf-when'),
    you: box('.gf-you'),
    himCol: box('.gf-him-col'),
    timeline: box('.gf-timeline'),
    cols: box('.gf-cols'),
    rows,
    pageScrollW: document.documentElement.scrollWidth,
    pageClientW: document.documentElement.clientWidth,
  }
})()`

const results = []
for (const [w, h] of sizes) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: PAGE })
  await sleep(1400)
  const res = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
  const m = res.result.value
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = join(SHOTS, `look-${w}x${h}.png`)
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  results.push({ w, h, m, file })
}

ws.close()
child.kill()
await sleep(300)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {}

const checks = []
const near = (a, b, tol = 0.6) => a != null && b != null && Math.abs(a - b) <= tol

for (const { w, h, m, file } of results) {
  const tag = `${w}x${h}`
  if (m.err) {
    checks.push([`${tag} 面板渲染出来了`, false, m.err])
    continue
  }
  const room = m.room
  checks.push([`${tag} 地图左边缘 = 见闻录文字左边缘`, near(m.stageSvg.x, m.when.x), `地图 ${m.stageSvg.x} / 文字 ${m.when.x}`])
  checks.push([`${tag} 地图左边缘 = 左栏左边缘`, near(m.stageSvg.x, m.you.x), `地图 ${m.stageSvg.x} / 左栏 ${m.you.x}`])
  checks.push([`${tag} 地图右边缘 = 右栏右边缘`, near(m.stageSvg.right, m.himCol.right), `地图 ${m.stageSvg.right} / 右栏 ${m.himCol.right}`])
  checks.push([`${tag} 面板还在窗口里（没被切掉）`,
    room.x >= -0.5 && room.y >= -0.5 && room.right <= w + 0.5 && room.bottom <= h + 0.5,
    `面板 ${room.x},${room.y} → ${room.right},${room.bottom}（窗口 ${w}x${h}）`])
  checks.push([`${tag} 面板矮于窗口（矮屏时自己缩）`, room.h <= h - 118 + 1, `面板高 ${room.h}，窗口高 ${h}`])
  checks.push([`${tag} 页面没有横向溢出`, m.pageScrollW <= m.pageClientW + 1, `${m.pageScrollW} > ${m.pageClientW}`])
  const clipped = m.rows.filter((r) => (r.him && r.him.scrollW > r.him.clientW + 1) || (r.you && r.you.scrollW > r.you.clientW + 1))
  checks.push([`${tag} 两栏的文字都没被挤断（${m.rows.length} 行）`, clipped.length === 0, `${clipped.length} 行溢出`])
  checks.push([`${tag} 截图存了`, existsSync(file), file])
}

let failed = 0
console.log('')
for (const [name, ok, detail] of checks) {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail ? `(${detail})` : ''}`)
}
console.log(`\n${failed === 0 ? '版面全对' : `${failed} 条不过`}\n`)
process.exit(failed ? 1 : 0)
