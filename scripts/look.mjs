/**
 * 用无头 Edge 把面板真的渲染出来，量关键坐标、截图、并断言「版面对不对」。
 *
 * 为什么单独有这个脚本：`scripts/smoke.mjs` 的 DOM 垫片没有排版引擎，
 * 它只能验「说了什么」，验不了「摆在哪儿」——而用户报的 bug 一半是「摆在哪儿」
 * （地图和下面的字左右对不齐、面板被窗口切掉、右栏文字被挤断）。
 * 这里用 Chromium 自己算出来的 getBoundingClientRect 当尺子，把这几件事钉成数字。
 *
 * 2026-10-31（t33）起，**所有依赖真实几何的断言都住在这一支**，只管两件真事：
 *   ① 版面对不对（下面那八条）；
 *   ② **地图本体宽 / 每单位多少 px / 国名的等效字号**——这些以前塞在 smoke 里，
 *      而 smoke 是手搓的 DOM 垫片、没有排版，量不到尺寸，只能「写死一个 508 兜底」，
 *      于是看起来在量事实、其实在比常数：真几何变了它不会红（t31 复核点名的坑）。
 *      搬到这里以后，面板 padding 一改、地图被挤窄一格，这条就红。
 *
 * 注意：Chromium 起不来是被沙箱拦住的（FATAL: platform_channel.cc Check failed 0x5），
 * 所以要在一个更宽的沙箱里跑；它不进 npm test，也**不进 prepublishOnly**
 * ——发布链不该依赖「这台机器能起 Edge」。改版面/改地图字号时自己跑一次。
 *
 *   node scripts/look.mjs            量四个常见窗口尺寸，顺手截图
 *   node scripts/look.mjs 1280x800   只量一个尺寸
 *
 * 截图落在 .scratch/look-<宽>x<高>.png。换说法当年是靠 GF_VOICE 看的，
 * 2026-10-05 只有冒险这一套，那条开关已经撤了（案牍在 .parked/ledger-voice/）。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PAGE = new URL('../preview.html', import.meta.url).href
const SHOTS = join(ROOT, '.scratch')

// 地图本体宽的两个常数：取景框宽（世界单位）与面板左右 padding。
// 前者是这张图的坐标系（`viewBox="0 0 66 34"` 的 66），后者是 CSS 里 `.gf-stage` 的左右各 22px。
const FRAME_W = 66
const PANEL_PAD_X = 22 // 单边；下面断的是真算式（左右留白 + 边框），见断言处的注释

// 真宿主的地图本体宽 **499px**（最窄实测口径）。
// 出处：2026-10-05 用真 DSH 面板的量尺寸钩子量到「见闻录内容宽 499、padding box 514」
// ⇒ 滚动条空档 `--gf-sb` 在真面板里是 **15px**（预览页只有 6px），见 src/client.js 里
// syncGutter 上面那段注释。面板 560 − 左 22 − 右 (22 + 15) − 边框 2 = **499**。
// 这个常数是「用户真正看到的那个宽度」：look 本身跑的是预览页，只能量到 508，
// 所以要拿两个分母都判一遍——只按当页实测宽判，就会像 t24/t30 那样「量具比真机宽」还判自己达标。
const HOST_MAP_WIDTH_PX = 499
const HOST_GUTTER_PX = 15

// 国名字号从源码读（`NATION_FS` 是模块私有常量，不为了自检改成导出）。
// 读不到就让下面那条断言红——总比悄悄用旧默认值算出一个「达标」强。
const worldSrc = readFileSync(new URL('../src/map/world.js', import.meta.url), 'utf8')
const fsPair = /const NATION_FS = \{ 1: ([\d.]+), 2: ([\d.]+) \}/.exec(worldSrc)
const NATION_FS = {
  1: fsPair ? Number(fsPair[1]) : NaN,
  2: fsPair ? Number(fsPair[2]) : NaN,
}

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
  const host = [...document.querySelectorAll('[data-dsh-game-adventure]')].pop()
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
    stage: box('.gf-stage'),
    stageSvg: box('.gf-stage svg'),
    stageViewBox: (() => {
      const svg = sr.querySelector('.gf-stage svg')
      const vb = svg && svg.getAttribute('viewBox')
      if (!vb) return { raw: vb === undefined ? 'undefined' : String(vb) }
      // 这里在模板字符串里，正则里的反斜杠会被吃掉（「\s」→「s」），所以按空格切。
      const parts = String(vb).trim().split(' ').filter((s) => s !== '').map(Number)
      if (parts.length !== 4 || !parts.every((v) => Number.isFinite(v))) return { raw: String(vb) }
      return { raw: String(vb), w: parts[2], h: parts[3] }
    })(),
    // 几何真值：地图本体宽不是「面板宽 − 44」算出来的，而是面板宽减掉左右留白与边框。
    // 左边留白 22px 写死在 .gf-stage 的 margin-left；右边是 22px + --gf-sb
    // （滚动条空档，JS 量出来写进去，预览页 6px、真面板 15px）；再加面板左右各 1px 边框。
    // 这里把两半都按实时值取出来，算式改了、padding 改了，下面那条断言立刻红。
    roomBorder: (() => {
      const el = sr.querySelector('.gf-room')
      const s = el && getComputedStyle(el)
      return s ? { left: parseFloat(s.borderLeftWidth) || 0, right: parseFloat(s.borderRightWidth) || 0 } : null
    })(),
    stageMargin: (() => {
      const el = sr.querySelector('.gf-stage')
      const s = el && getComputedStyle(el)
      return s ? { left: parseFloat(s.marginLeft) || 0, right: parseFloat(s.marginRight) || 0 } : null
    })(),
    stageGutter: (() => {
      const el = sr.querySelector('.gf-stage')
      const s = el && getComputedStyle(el)
      const raw = s ? s.getPropertyValue('--gf-sb').trim() : ''
      return { raw, px: parseFloat(raw) || 0 }
    })(),
    when: box('.gf-when'),
    you: box('.gf-you'),
    himCol: box('.gf-him-col'),
    timeline: box('.gf-timeline'),
    cols: box('.gf-cols'),
    rows,
    // 2026-10-31：记号那枚图钉真的画出来了吗。
    // 用户报「他的标记变成了纯原色圆」——图钉那张内联 svg 被 .gf-stage svg 的
    // width:100% 压成 0×0（特异度 0,1,1 打赢 0,1,0），只剩一圈涟漪。
    // 这里量它的真实像素尺寸，再换算成世界单位比（4 × 5）。
    pin: (() => {
      const g = sr.querySelector('.gf-pin-glyph')
      const ring = sr.querySelector('.gf-pin-ring')
      const pin = sr.querySelector('.gf-live-pin')
      if (!pin) return null
      const box2 = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
      }
      return { glyph: box2(g), ring: box2(ring) }
    })(),
    // 2026-10-31（用户报「每个名字在方框里都没居中，对比前面的徽记更没对齐」）：
    // 把地图上每一块带底板的牌子都量一遍——牌子矩形 vs 里面那行字的包围盒，
    // 取左右、上下空当之差。国名那块左边还被徽记吃掉一段，所以国名的差值是关键。
    plates: (() => {
      try {
        const mapSvgEl = sr.querySelector('.gf-stage svg')
        if (!mapSvgEl) return { err: '找不到地图 svg' }
        const out = []
        let plate = null
        let crestX = null
        const bbox = (el) => { try { return el.getBBox() } catch { return null } }
        for (const el of mapSvgEl.querySelectorAll('rect, text, path')) {
          const tag = el.tagName.toLowerCase()
          if (tag === 'rect' && el.getAttribute('rx') && !el.closest('pattern')) {
            plate = bbox(el)
            crestX = null
            continue
          }
          if (!plate) continue
          if (tag === 'path') {
            // 徽记：夹在底板与名字之间的那些 path，取最靠左的那个当外边界
            const c = bbox(el)
            if (c && c.width > 0 && c.height > 0 && c.height <= plate.height + 0.4) {
              crestX = crestX == null ? c.x : Math.min(crestX, c.x)
            }
            continue
          }
          if (tag !== 'text') continue
          const t = bbox(el)
          // 海名不上底板（labels() 里 kind === 'sea' 那一支），它的「牌子」是旁边
          // 随便哪块矩形——只要字明显不在这块板里，就不算一块名牌的量法。
          const inside = t
            && t.x >= plate.x - 0.6 && t.x + t.width <= plate.x + plate.width + 0.6
            && t.y >= plate.y - 0.6 && t.y + t.height <= plate.y + plate.height + 0.6
          if (t && t.width > 0 && inside) {
            // 外边界：左边是徽记（有的话）的左沿，右边是名字的右沿
            const outerLeft = (crestX == null ? t.x : crestX) - plate.x
            const outerRight = (plate.x + plate.width) - (t.x + t.width)
            out.push({
              name: (el.textContent || '').slice(0, 8),
              dx: +(outerLeft - outerRight).toFixed(3),
              dy: +((t.y - plate.y) - ((plate.y + plate.height) - (t.y + t.height))).toFixed(3),
            })
          }
          plate = null
          crestX = null
        }
        return out
      } catch (error) { return { err: String(error && error.message ? error.message : error) } }
    })(),
    // 2026-10-31：地名签的字有没有坐在牌子里面。
    // 用户那张截图里「他的屋子」右半截压在别的东西上——代码把 x 写成牌子中心、
    // 却没写 text-anchor，SVG 默认 start，于是字从正中起笔往右挤出牌子。
    // 这里直接问浏览器要字的包围盒（getBBox，用户单位）与牌子的矩形比。
    place: (() => {
      const bg = sr.querySelector('.gf-place-bg')
      const tx = sr.querySelector('.gf-place-text')
      if (!bg || !tx) return null
      let ink = null
      try { ink = tx.getBBox() } catch { ink = null }
      return {
        text: tx.textContent || '',
        anchor: getComputedStyle(tx).textAnchor,
        plate: { x: Number(bg.getAttribute('x')), y: Number(bg.getAttribute('y')),
                 w: Number(bg.getAttribute('width')), h: Number(bg.getAttribute('height')) },
        ink: ink ? { x: +ink.x.toFixed(2), y: +ink.y.toFixed(2), w: +ink.width.toFixed(2), h: +ink.height.toFixed(2) } : null,
      }
    })(),
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

  // 2026-10-31（用户截图报的）：地名签的字必须坐在牌子里面。
  // 这条能抓的正是「x 写成牌子中心、却没写 text-anchor」——那时字从正中起笔，
  // 右半截溢出牌子（实测溢出 2.78 个世界单位 ≈ 21px），压在旁边的字与记号上。
  const pl = m.place
  const ink = pl && pl.ink
  const plate = pl && pl.plate
  const insideX = !!(ink && plate) && ink.x >= plate.x - 0.06 && ink.x + ink.w <= plate.x + plate.w + 0.06
  // 纵向的容差比横向松：`getBBox` 量的是**字身框**（含 ascent/descent 那些空当），
  // 汉字本身没有下伸部分，压着牌子下沿的那 0.09 格（约 0.7px）是空的。
  // 横向那个才是真毛病（从前溢出 2.78 格），所以横向仍旧咬 0.06。
  const insideY = !!(ink && plate) && ink.y >= plate.y - 0.28 && ink.y + ink.h <= plate.y + plate.h + 0.28
  checks.push([`${tag} 地名签的字坐在牌子里面（左右不溢出）`, insideX,
    pl ? `${pl.text || '（空）'}：字 ${ink ? ink.x + '→' + +(ink.x + ink.w).toFixed(2) : '量不到'} / 牌 ${plate ? plate.x + '→' + +(plate.x + plate.w).toFixed(2) : '没有'}（text-anchor ${pl.anchor}）` : '面板上没有地名签'])
  checks.push([`${tag} 地名签的字坐在牌子里面（上下不溢出）`, insideY,
    ink && plate ? `字 y ${ink.y}→${+(ink.y + ink.h).toFixed(2)} / 牌 y ${plate.y}→${+(plate.y + plate.h).toFixed(2)}` : '量不到'])

  // 2026-10-31（用户截图报的）：记号那枚图钉必须真的画出来（4×5 世界单位），
  // 不能被 `.gf-stage svg` 的 width:100% 压成 0×0 —— 那样只剩一圈涟漪，看着像「纯色圆」。
  const pinUnitPx = m.stageSvg.w / 66
  const gw = m.pin && m.pin.glyph ? m.pin.glyph.w / pinUnitPx : 0
  const gh = m.pin && m.pin.glyph ? m.pin.glyph.h / pinUnitPx : 0
  // 每一块名牌里的字都要坐在板心。
  // 改前国名的左右差是 1.1 格（底板左边被徽记吃掉了，字还钉在祖国中心），
  // 上下差是 0.34 格（字整行贴着下沿）——这两条阈值能把它们当场抓红。
  const plates = Array.isArray(m.plates) ? m.plates : []
  const worstDx = plates.reduce((a, p) => (Math.abs(p.dx) > Math.abs(a.dx) ? p : a), { dx: 0, name: '—' })
  const worstDy = plates.reduce((a, p) => (Math.abs(p.dy) > Math.abs(a.dy) ? p : a), { dy: 0, name: '—' })
  checks.push([`${tag} 每块名牌里的字都居中（左右差 ≤ 0.2 格、上下差 ≤ 0.08 格）`,
    plates.length >= 30 && Math.abs(worstDx.dx) <= 0.2 && Math.abs(worstDy.dy) <= 0.08,
    plates.length
      ? `${plates.length} 块｜左右最偏 ${worstDx.name} ${worstDx.dx}｜上下最偏 ${worstDy.name} ${worstDy.dy}`
      : (m.plates && m.plates.err ? `量的时候出错：${m.plates.err}` : '一块牌子都没量到')])

  checks.push([`${tag} 记号那枚图钉画出来了（4×5 世界单位）`,
    m.pin != null && gw > 3.4 && gw < 4.6 && gh > 4.4 && gh < 5.6,
    m.pin && m.pin.glyph
      ? `${m.pin.glyph.w}×${m.pin.glyph.h}px = ${gw.toFixed(2)}×${gh.toFixed(2)} 世界单位（每单位 ${pinUnitPx.toFixed(3)}px）`
      : '面板上找不到 .gf-pin-glyph'])

  // ── 几何（t33：这些从 smoke 搬过来的，只有真浏览器量得出来）─────────────────
  // 「地图本体宽 = 面板宽 − 44」这条**按现行 CSS 是不成立的**：44 只算了左右各 22px 的留白，
  // 漏了面板左右各 1px 边框、以及右边那圈滚动条空档（--gf-sb，见 .gf-stage 的
  // margin: 12px calc(22px + var(--gf-sb)) 0 22px）。预览页实测 560 − 22 − 28 − 2 = 508。
  // 所以这里断的是**真算式**：面板宽 − 左边留白 −（22 + 滚动条空档）− 左右边框 = 地图宽。
  // 谁把 padding / margin / 边框改一下，这个数就变，断言立刻红——这才是它该有的牙。
  // 注意：这里量到的是**预览页**的宽度（--gf-sb = 6）；真宿主 --gf-sb = 15、地图只有 499px，
  // 所以字号那几条另外按 HOST_MAP_WIDTH_PX 再判一遍（见下面「两个分母」）。
  const panelW = room.w
  const mapW = m.stageSvg.w
  const mLeft = m.stageMargin ? m.stageMargin.left : NaN
  const mRight = m.stageMargin ? m.stageMargin.right : NaN
  const bLeft = m.roomBorder ? m.roomBorder.left : NaN
  const bRight = m.roomBorder ? m.roomBorder.right : NaN
  const gutter = m.stageGutter ? m.stageGutter.px : NaN
  const inset = mLeft + mRight + bLeft + bRight
  checks.push([`${tag} 地图左边留白 ${PANEL_PAD_X}px（.gf-stage 的 margin-left）`,
    near(mLeft, PANEL_PAD_X), `margin-left ${mLeft}`])
  checks.push([`${tag} 地图右边留白 = ${PANEL_PAD_X}px + 滚动条空档（--gf-sb = ${m.stageGutter ? m.stageGutter.raw || '0' : '?'}）`,
    near(mRight, PANEL_PAD_X + gutter, 0.6), `margin-right ${mRight} / 期望 ${PANEL_PAD_X + gutter}`])
  checks.push([`${tag} 地图本体宽 = 面板宽 − 左右留白 − 左右边框`,
    near(mapW, panelW - inset, 0.6),
    `面板 ${panelW} − (${mLeft} + ${mRight} + ${bLeft} + ${bRight}) = ${+(panelW - inset).toFixed(1)}，地图 ${mapW}`])

  // 取景框宽与「每单位多少 px」：viewBox 的宽必须是 66，地图宽 / 66 就是那一格的像素。
  const vbW = m.stageViewBox && Number.isFinite(m.stageViewBox.w) ? m.stageViewBox.w : NaN
  const unitPx = mapW / FRAME_W
  checks.push([`${tag} 取景框宽 ${FRAME_W} 世界单位（viewBox 第 3 个数）`,
    vbW === FRAME_W, `viewBox 宽 ${Number.isFinite(vbW) ? vbW : `读不到（${m.stageViewBox ? m.stageViewBox.raw : 'null'}）`}`])
  checks.push([`${tag} 每世界单位 ${unitPx.toFixed(3)}px（= 地图宽 ${mapW} / ${FRAME_W}）`,
    Number.isFinite(unitPx) && unitPx > 0, `地图宽 ${mapW} / ${FRAME_W} = ${unitPx.toFixed(3)}`])

  // 国名等效字号：字号（世界单位）× 每单位 px。这是「读不读得出来」的真凭据。
  // **两个分母都要过**（t35）：当页实测宽（预览页 508）只是「这台机器量得到的那一个」，
  // 真宿主的地图宽是 499（--gf-sb = 15 而不是 6，见文件头 HOST_MAP_WIDTH_PX 的出处），
  // 那个才是用户真正看到的。只按当页宽判，就是「量具比真机宽 9px 还判自己达标」——
  // t24 拿 560（面板宽）当分母、t30 拿 508（预览页地图宽）当分母，都是这同一个错的上下两层。
  const t1px = NATION_FS[1] * unitPx
  const t2px = NATION_FS[2] * unitPx
  const hostUnitPx = HOST_MAP_WIDTH_PX / FRAME_W
  const t1Host = NATION_FS[1] * hostUnitPx
  const t2Host = NATION_FS[2] * hostUnitPx
  checks.push([`${tag} 二级国名等效字号 ≥ 8.5px（当页 ${mapW}px：${NATION_FS[2]} × ${unitPx.toFixed(3)} = ${t2px.toFixed(2)}px）`,
    Number.isFinite(t2px) && t2px >= 8.5,
    `${t2px.toFixed(2)}px（NATION_FS[2] = ${NATION_FS[2]}，每单位 ${unitPx.toFixed(3)}px）`])
  checks.push([`${tag} 二级国名等效字号 ≥ 8.5px（真宿主 ${HOST_MAP_WIDTH_PX}px：${NATION_FS[2]} × ${hostUnitPx.toFixed(3)} = ${t2Host.toFixed(2)}px）`,
    Number.isFinite(t2Host) && t2Host >= 8.5,
    `${t2Host.toFixed(2)}px（每单位 ${hostUnitPx.toFixed(3)}px = ${HOST_MAP_WIDTH_PX} / ${FRAME_W}）`])
  checks.push([`${tag} 一级国名等效字号 ≥ 9px（当页 ${mapW}px：${NATION_FS[1]} × ${unitPx.toFixed(3)} = ${t1px.toFixed(2)}px）`,
    Number.isFinite(t1px) && t1px >= 9,
    `${t1px.toFixed(2)}px（NATION_FS[1] = ${NATION_FS[1]}）`])
  checks.push([`${tag} 一级国名等效字号 ≥ 9px（真宿主 ${HOST_MAP_WIDTH_PX}px：${NATION_FS[1]} × ${hostUnitPx.toFixed(3)} = ${t1Host.toFixed(2)}px）`,
    Number.isFinite(t1Host) && t1Host >= 9,
    `${t1Host.toFixed(2)}px`])
}

let failed = 0
console.log('')
for (const [name, ok, detail] of checks) {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail ? `(${detail})` : ''}`)
}
console.log(`\n${failed === 0 ? '版面全对' : `${failed} 条不过`}\n`)
process.exit(failed ? 1 : 0)
