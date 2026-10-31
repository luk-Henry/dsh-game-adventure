/*
 * 世界图渲染器——`.scratch/terrain.py` 第 149~1249 行的逐行移植。
 *
 * 画的是 66×34 世界坐标里的一整张世界地貌图：海、陆地、生物群系、山、林、河、湖、
 * 世界奇观、地名、国名那一层。原来是 `.scratch/terrain.py` 画好、整段内联进
 * `src/map-data.js`（545 KB）的；移植到 JS 之后地理数据只剩 15 KB（`world3.js`），
 * 图由 `build()` 现画，插件体积反而变小，地方图（`local.py`）也能复用这里的每件零件。
 *
 * 唯一的验收标准是 `node .scratch/render-diff.mjs` 打印「世界图：两边一模一样」——
 * 不是「看起来一样」，是跟 Python 画出来的逐字节相同。所以这个文件里：
 *   · 进 SVG 的每个数字都走 `f2()`（＝ Python 的 `'{:.2f}'.format`），三位小数的走 `f3()`
 *   · 每个随机数都走 `new Random(seed)`（CPython 的 MT19937，见 `rng.js`）
 *   · 开方走 `geo.js` 的 `hypot`，**不用** `Math.hypot`（跟 Python 差 1 ulp）
 *   · 字符串一个字不改，包括分隔符、空格、属性顺序
 * 不要「改进」画面——这是一次翻译，不是重画。
 *
 * 调色板也是**固定**的（界面审计 I2）：这张图里的颜色全是写死的，不吃主题、不吃
 * `prefers-color-scheme`。天色只有一处变量——外面那层 `.mnight`（见 src/client.js 的
 * `--gf-dusk` 与 `dimForDusk`）。所以这里那些 `--gf-*` 名字（如果看到）是留给地方图
 * 与主题对齐用的「死 token」，**不必**为它们补主题值，补了也不会被读到。
 *
 * 底层图元（`pd` / `wob` / `organic` / `meander` / `blob` / `ribbon` / `lerp` / `hit`）
 * 来自 `geo.js`（对应 terrain.py 第 25~145 行，已验证逐位相同），这里原样再导出，
 * 让地方图只认这一个门面。
 */
import { f2, hypot, nlen, plate_rect, plate_text_y, box_overlap, pd as _pd, wob as _wob, organic as _organic, meander as _meander, blob as _blob, ribbon as _ribbon, lerp as _lerp, hit as _hit } from './geo.js'
import { Random } from './rng.js'
import { W, H, LANDS, BIOMES, BIOME_COLOR, RIDGES, PEAKS, FORESTS, RIVERS, LAKES, LABELS, NATIONS, WONDERS } from './world3.js'
// 世界包里的**地理数据**：野地的六个点、四块陆地的取色。2026-10-30 地图审计
// M-5 / M-9 要求「野地符号落在包里的坐标上」「四块陆地的取色写在世界包里，不是
// 写死在渲染器里」——渲染器自己不认识哪块地叫什么，只能问包。这里 import 的是
// 数据模块（不含任何 import），不会跟 `packs/adventure/index.js` 绕成环。
import { places as WORLD_PLACES, mapLands } from '../packs/adventure/world.js'

/* ── 底层图元：显式包装再导出 ─────────────────────────────────────────
 *
 * 不能写 `export { pd } from './geo.js'`——`scripts/build-client.mjs` 的摊平器只认
 * `export const|let|var|function|class`，`export { … }` 一律报错。
 */

export function pd(pts, close = true) { return _pd(pts, close) }

export function wob(pts, amp = 0.12, seed = 0, n = 4, closed = true) { return _wob(pts, amp, seed, n, closed) }

export function organic(pts, amp = 0.30, bend = 0.11, seed = 0, n = 9) { return _organic(pts, amp, bend, seed, n) }

export function meander(pts, amp = 0.16, seed = 0, n = 9) { return _meander(pts, amp, seed, n) }

export function blob(cx, cy, r, seed, n = 9, ry = 1.0) { return _blob(cx, cy, r, seed, n, ry) }

export function ribbon(pts, w0, w1, seed = 0, n = 5) { return _ribbon(pts, w0, w1, seed, n) }

export function lerp(a, b, t) { return _lerp(a, b, t) }

export function hit(poly, x, y) { return _hit(poly, x, y) }

/* ── 取整：跟 Python 的 format 同一套规矩 ──────────────────────────────
 *
 * `f2` 在 `geo.js` 里（已验证）。这里补一个 `f3`——`terrain.py` 里所有线宽都是
 * `'{:.3f}'.format(...)`，`MAP_CSS` 里也是。规矩跟 `f2` 一样：先取 40 位小数的
 * 十进制展开，再在**字符串**上做半偶取整。**不能用 `toFixed`**：
 * JS 的 `toFixed` 在恰好一半时进位，Python 是四舍六入五成双。
 */
function dec(x, d) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x)
  const neg = x < 0 || Object.is(x, -0)
  const s = Math.abs(x).toFixed(40)
  const dot = s.indexOf('.')
  const intPart = s.slice(0, dot)
  const frac = s.slice(dot + 1)
  const keep = frac.slice(0, d)
  const rest = frac.slice(d)
  const first = rest.charCodeAt(0) - 48
  let up = false
  if (first > 5) {
    up = true
  } else if (first === 5) {
    // 五后面还有东西就是真的比一半大；干干净净的一半才看奇偶
    up = /[1-9]/.test(rest.slice(1)) ? true : Number(keep) % 2 !== 0
  }
  const p = Math.pow(10, d)
  let n = Number(intPart) * p + Number(keep)
  if (up) n += 1
  const body = Math.floor(n / p) + '.' + String(n % p).padStart(d, '0')
  return neg ? '-' + body : body
}

/* `f3` 的结果只取决于 `x`，而一扇地方图里真正传进来的值只有**几十种**
 * （全是线宽：`INK` / `INK2 * 0.85` / `Math.max(0.05, 0.10 * s)` 这一类），
 * 却要调上万次——实测 `dec` 占一扇图的 **7.9%**。按 `x` 记住结果就没了。
 * 跟 `f2` 一样：`-0` 与 `0` 的结果不一样（`-0.000` / `0.000`），零单独走一条路，
 * 因为 `Map` 的键按 SameValueZero 把这两个当成同一个。
 */
const F3_CACHE = new Map()
const F3_CACHE_MAX = 1 << 12

/** Python `'{:.3f}'.format(x)`。 */
export function f3(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x)
  if (x === 0) return Object.is(x, -0) ? '-0.000' : '0.000'
  const hit = F3_CACHE.get(x)
  if (hit !== undefined) return hit
  const out = dec(x, 3)
  if (F3_CACHE.size >= F3_CACHE_MAX) F3_CACHE.clear()
  F3_CACHE.set(x, out)
  return out
}

/** Python `'{:.1f}'.format(x)`——只有自查报告在用。 */
function f1(x) { return dec(x, 1) }

/** `nlen`（Python 的 `len(str)`，按码点数）与 `plate_rect` / `plate_text_y`
 *  都在 `geo.js`：世界图、地方图、面板三处共用同一条算式（审计 M-14）。 */

/** Python 的元组比较：逐项比，不是减法。`sort` 两边都是稳定排序。 */
function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

/* ── 调色板 ──────────────────────────────────────────────────────────── */

export const SEA = '#243642'
export const SEA_LO = '#3A5566'
export const SEA_DASH = '#41586A'
export const COAST = '#2A2318'
export const INK = 0.135
export const INK2 = 0.085
export const RIVER = '#93B2BC'
export const RIVER_IN = '#5E808E'
export const ROCK_LIT = '#C6BDA9'
export const ROCK_SH = '#7C7466'
export const SNOW = '#EFEAE0'
export const DUNE = '#B99C63'
export const CRACK = '#9FB3BA'

// ---------------------------------------------------------------- 山

/**
 * 一座山。抖动剖面 + 脊线 + 受光/背光两坡 + 背光坡梳齿排线 + 雪盖。
 *
 * 第一版画成干净的等腰三角形加横排线，读出来是金字塔／帐篷——
 * 剖面要抖、背光坡要梳齿，才像岩石。雪盖只在够高的山上才有，
 * 而且下缘是锯齿；雪不用白色去「画」，是留白（不排线）。
 */
export function peak(cx, cy, s, seed, idx) {
  const rnd = new Random(seed)
  const n = 11
  const hw = 2.15 * s
  const hh = 2.9 * s
  const prof = []
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1)
    const base = Math.pow(Math.max(0.0, 1 - Math.abs(2 * t - 1)), 0.72)
    const w = 1 + 0.12 * Math.sin(t * 9.1 + seed) + 0.07 * Math.sin(t * 21.3 + seed * 1.7)
    prof.push(hh * base * w)
  }
  const m = Math.floor(n / 2)
  let pmax = -Infinity
  for (const v of prof) if (v > pmax) pmax = v
  prof[m] = pmax * 1.03
  const xs = []
  for (let k = 0; k < n; k++) xs.push(cx - hw + 2 * hw * k / (n - 1))
  const top = []
  for (let k = 0; k < n; k++) top.push([xs[k], cy - prof[k]])

  const bx = cx + hw * 0.16
  const ridge = [bx, cy]
  const sil = top.concat([[cx + hw, cy], [cx - hw, cy]])
  const lit = top.slice(0, m + 1).concat([ridge])
  const sh = [ridge].concat(top.slice(m))

  const o = []
  o.push(`<clipPath id="pk${idx}"><path d="${pd(sil)}"/></clipPath>`)
  o.push(`<path d="${pd(sil)}" fill="${ROCK_SH}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
  o.push(`<path d="${pd(lit)}" fill="${ROCK_LIT}"/>`)
  o.push(`<path d="${pd(sh)}" fill="${ROCK_SH}" fill-opacity="0.85"/>`)
  // 背光坡梳齿排线：从脊线往外梳到七成，边上留一道亮缝
  const hatch = []
  for (let k = 1; k < 9; k++) {
    const t = k / 9.0
    const a = lerp(top[m], ridge, t)
    const b = lerp(top[m], [cx + hw, cy], t * 0.72)
    hatch.push([a, b])
  }
  for (const [a, b] of hatch) {
    o.push(`<line class="mh" x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}"/>`)
  }
  // 受光坡靠脊线两笔短的
  for (const k of [2, 4]) {
    const t = k / 9.0
    const a = lerp(top[m], ridge, t)
    const b = lerp(top[m], top[0], t * 0.30)
    o.push(`<line class="mh2" x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}"/>`)
  }
  o.push(`<path d="${pd([top[m], ridge], false)}" fill="none" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linecap="round"/>`)
  if (s >= 0.95) {
    const ys = cy - hh * 0.66
    const sel = top.filter((p) => p[1] < ys)
    if (sel.length >= 2) {
      const left = [sel[0][0], ys]
      const right = [sel[sel.length - 1][0], ys]
      const jag = []
      for (let i = 0; i < 6; i++) {
        const t = i / 5.0
        jag.push([left[0] + (right[0] - left[0]) * t, ys + (i % 2 ? 0.30 * s : 0.0)])
      }
      o.push(`<path d="${pd(sel.concat(jag.slice().reverse()))}" fill="${SNOW}" clip-path="url(#pk${idx})" fill-opacity="0.95"/>`)
    }
  }
  // 山脚三块碎石
  for (let k = 0; k < 3; k++) {
    const rx = cx + rnd.uniform(-hw * 1.05, hw * 1.05)
    const rs = 0.16 * s * rnd.uniform(0.6, 1.2)
    o.push(`<path d="${pd([[rx - rs, cy], [rx, cy - rs * 1.3], [rx + rs, cy]])}" fill="${ROCK_SH}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`)
  }
  return o
}

// ---------------------------------------------------------------- 树

export function tree(x, y, s, conifer, seed) {
  const rnd = new Random(seed)
  const o = []
  if (conifer) {
    o.push(`<line x1="${f2(x)}" y1="${f2(y)}" x2="${f2(x)}" y2="${f2(y - 0.28 * s)}" stroke="#6B543A" stroke-width="${f3(Math.max(0.05, 0.10 * s))}" stroke-linecap="round"/>`)
    for (let k = 0; k < 3; k++) {
      const t = k / 3.0
      const half = 0.62 * s * (1 - t * 0.55)
      const base = y - (0.20 + t * 0.62) * s
      const apex = y - (0.78 + t * 0.62) * s
      o.push(`<path d="${pd([[x - half, base], [x, apex], [x + half, base]])}" fill="#4E6A3C" stroke="${COAST}" stroke-width="${f3(INK2 * 0.75)}" stroke-linejoin="round"/>`)
    }
  } else {
    o.push(`<line x1="${f2(x)}" y1="${f2(y)}" x2="${f2(x)}" y2="${f2(y - 0.34 * s)}" stroke="#6B543A" stroke-width="${f3(Math.max(0.05, 0.11 * s))}" stroke-linecap="round"/>`)
    const cy = y - 0.72 * s
    const crown = []
    const n = 7
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n - Math.PI / 2
      const rr = 0.58 * s * (1 + rnd.uniform(-0.16, 0.16))
      crown.push([x + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92])
    }
    o.push(`<path d="${pd(crown)}" fill="#557040" stroke="${COAST}" stroke-width="${f3(INK2 * 0.75)}" stroke-linejoin="round"/>`)
  }
  return o
}

export function forest(cx, cy, r, count, seed) {
  const rnd = new Random(seed)
  const items = []
  for (let i = 0; i < count; i++) {
    const a = rnd.uniform(0, 2 * Math.PI)
    const rr = r * Math.sqrt(rnd.random())
    items.push([cy + Math.sin(a) * rr * 0.62, cx + Math.cos(a) * rr,
      rnd.uniform(0.52, 0.84), rnd.random() < 0.58, seed + i * 3])
  }
  items.sort(cmpTuple)
  const o = []
  for (const [y, x, s, con, sd] of items) {
    o.push(...tree(x, y, s, con, sd))
  }
  return o
}

// ---------------------------------------------------------------- 细部

export function dunes(poly, seed, count = 26) {
  const rnd = new Random(seed)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const xlo = Math.min(...xs)
  const xhi = Math.max(...xs)
  const ylo = Math.min(...ys)
  const yhi = Math.max(...ys)
  const o = []
  let tries = 0
  let made = 0
  while (made < count && tries < count * 40) {
    tries += 1
    const x = rnd.uniform(xlo, xhi)
    const y = rnd.uniform(ylo, yhi)
    if (!hit(poly, x, y)) {
      continue
    }
    made += 1
    const w = rnd.uniform(0.55, 1.25)
    o.push(`<path d="M${f2(x - w)} ${f2(y)} Q${f2(x)} ${f2(y - 0.30)} ${f2(x + w)} ${f2(y)}" fill="none" stroke="${DUNE}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.55"/>`)
  }
  return o
}

export function cracks(poly, seed, count = 22) {
  const rnd = new Random(seed)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const xlo = Math.min(...xs)
  const xhi = Math.max(...xs)
  const ylo = Math.min(...ys)
  const yhi = Math.max(...ys)
  const o = []
  let tries = 0
  let made = 0
  while (made < count && tries < count * 40) {
    tries += 1
    let x = rnd.uniform(xlo, xhi)
    let y = rnd.uniform(ylo, yhi)
    if (!hit(poly, x, y)) {
      continue
    }
    made += 1
    const pts = [[x, y]]
    let a = rnd.uniform(0, 2 * Math.PI)
    for (let _k = 0; _k < 2; _k++) {
      a += rnd.uniform(-0.7, 0.7)
      x += Math.cos(a) * rnd.uniform(0.35, 0.7)
      y += Math.sin(a) * rnd.uniform(0.35, 0.7)
      pts.push([x, y])
    }
    o.push(`<path d="${pd(pts, false)}" fill="none" stroke="${CRACK}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.5"/>`)
  }
  return o
}

export function marsh(poly, seed, count = 20) {
  const rnd = new Random(seed)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const xlo = Math.min(...xs)
  const xhi = Math.max(...xs)
  const ylo = Math.min(...ys)
  const yhi = Math.max(...ys)
  const o = []
  let tries = 0
  let made = 0
  while (made < count && tries < count * 40) {
    tries += 1
    const x = rnd.uniform(xlo, xhi)
    const y = rnd.uniform(ylo, yhi)
    if (!hit(poly, x, y)) {
      continue
    }
    made += 1
    if (made % 2) {
      o.push(`<path d="${pd(blob(x, y, rnd.uniform(0.20, 0.42), seed + made, 8, 0.62))}" fill="${RIVER_IN}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`)
    } else {
      for (let k = 0; k < 3; k++) {
        const rx = x + (k - 1) * 0.16
        o.push(`<line x1="${f2(rx)}" y1="${f2(y)}" x2="${f2(rx + rnd.uniform(-0.1, 0.1))}" y2="${f2(y - rnd.uniform(0.28, 0.45))}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.7"/>`)
      }
    }
  }
  return o
}

/**
 * 地貌上的一层笔触。没有这层，陆地就是一块平色——「画」的感觉全在这里。
 *
 * 草＝短草点、苔原＝小点、山地＝交叉排线、荒漠＝沙垄（另有 dunes）、
 * 沼泽＝苇子（另有 marsh）。都很淡，1× 下基本看不见，2× 下才成纹——
 * 这正是要的：缩下去是块干净的色，放大才有笔。
 */
export function marks(poly, seed, count, kind) {
  const rnd = new Random(seed)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const xlo = Math.min(...xs)
  const xhi = Math.max(...xs)
  const ylo = Math.min(...ys)
  const yhi = Math.max(...ys)
  const o = []
  let tries = 0
  let made = 0
  while (made < count && tries < count * 40) {
    tries += 1
    const x = rnd.uniform(xlo, xhi)
    const y = rnd.uniform(ylo, yhi)
    if (!hit(poly, x, y)) {
      continue
    }
    made += 1
    if (kind === 'grass') {
      for (let k = 0; k < 3; k++) {
        const bx = x + (k - 1) * 0.14
        o.push(`<line class="mg1" x1="${f2(bx)}" y1="${f2(y)}" x2="${f2(bx + rnd.uniform(-0.08, 0.08))}" y2="${f2(y - rnd.uniform(0.16, 0.30))}"/>`)
      }
    } else if (kind === 'tundra') {
      o.push(`<circle class="md" cx="${f2(x)}" cy="${f2(y)}" r="${f3(rnd.uniform(0.05, 0.09))}"/>`)
    } else if (kind === 'rock') {
      for (let k = 0; k < 3; k++) {
        const a = -0.85 + k * 0.42
        const dx = Math.cos(a) * 0.30
        const dy = Math.sin(a) * 0.30
        o.push(`<line class="mg2" x1="${f2(x - dx)}" y1="${f2(y - dy)}" x2="${f2(x + dx)}" y2="${f2(y + dy)}"/>`)
      }
    } else if (kind === 'swamp') {
      for (let k = 0; k < 2; k++) {
        const rx = x + (k - 0.5) * 0.22
        o.push(`<line class="mg3" x1="${f2(rx)}" y1="${f2(y)}" x2="${f2(rx + rnd.uniform(-0.08, 0.08))}" y2="${f2(y - rnd.uniform(0.30, 0.50))}"/>`)
      }
    }
  }
  return o
}

/**
 * 罗盘。整张图里唯一一处朱红——老地图的规矩，指北那根才点色。
 *
 * 2026-10-08 用户报「大地图里那枚罗盘根本看不到了，被你搞成透明了的，而且位置不对」。
 * 两处都是实情：① 它原本跟海岸线一样用 `COAST`（`#2A2318`）画环与辐条，可它落在
 * 深色的海面上（`SEA` `#243642`）——**深墨压深海**，白天就只剩一点影子，入夜再被夜罩
 * 压一层就彻底看不见；② 圆心 (6.2, 33.0)、半径 1.55，纵向占 31.45–34.55，而取景框是
 * `0 0 66 34` ⇒ 下面约 13% 被地图下边缘切掉（这个坐标从 66×34 那一版起就是这样，
 * 不是后来改坏的）。所以环与辐条改成浅色的 `BONE`——深海上才读得出；圆心挪进图里。
 *
 * 2026-10-08 当天他又报「这个罗盘毫无用处啊，也不像指南针，要么就做成指南针？同时位置，
 * 应该是在地图的某个角落，比如左上、左下、右上、右下，而不是现在这样一个奇怪的地方。
 * 移动到右下方得了。」⇒ 第三版：**画成磁针式指南针**（一圈刻度 ＋ 一根细长的针，北半
 * 朱红、南半浅墨，微微斜着——三个样子摆在右下角给他挑过，他拍的是这一个），**圆心挪到
 * 右下角**（东南那片海上），**半径放大一档** 1.55 → 2.0（面板 508px 上从 24 像素宽到
 * 31 像素，缩略看才读得出是个罗盘）。指北那根仍然是朱红。
 */
export function compass(cx, cy, r) {
  const o = []
  o.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.92)}" fill="none" stroke="${BONE}" stroke-width="${f3(INK2)}" opacity="0.55"/>`)
  o.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.70)}" fill="none" stroke="${BONE}" stroke-width="${f3(INK2 * 0.7)}" opacity="0.3"/>`)
  for (let k = 0; k < 24; k++) {
    const a = Math.PI * 2 * k / 24 - Math.PI / 2
    o.push(`<line x1="${f2(cx + Math.cos(a) * r * 0.70)}" y1="${f2(cy + Math.sin(a) * r * 0.70)}" x2="${f2(cx + Math.cos(a) * r * 0.92)}" y2="${f2(cy + Math.sin(a) * r * 0.92)}" stroke="${BONE}" stroke-width="${f3(INK2 * 0.8)}" opacity="0.45"/>`)
  }
  const n = r * 0.80
  const w = r * 0.115
  o.push(`<g transform="rotate(-18 ${f2(cx)} ${f2(cy)})">`)
  o.push(`<path d="${pd([[cx, cy - n], [cx + w, cy], [cx - w, cy]])}" fill="#B4523F" opacity="0.95"/>`)
  o.push(`<path d="${pd([[cx, cy + n], [cx + w, cy], [cx - w, cy]])}" fill="${BONE}" opacity="0.8"/>`)
  o.push(`<line x1="${f2(cx)}" y1="${f2(cy - n)}" x2="${f2(cx)}" y2="${f2(cy + n)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.6)}" opacity="0.45"/>`)
  o.push('</g>')
  o.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.045)}" fill="${COAST}" opacity="0.7"/>`)
  o.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.022)}" fill="${BONE}"/>`)
  return o
}

/**
 * 夜里那层。**画在地图自己的 SVG 里**，不画在面板上。
 *
 * 2026-10-07 用户报的 bug：天黑了，地图还是亮的。面板那边只写 `--gf-*` 那套变量
 * （见 client.js 的 applyDaylight），而这张图的颜色是写死的十六进制，一个变量都不读，
 * 于是木头暗了、图没暗。
 *
 * 补一个整幅的罩子最省事，但它有个硬约束：**罩子必须正好是取景框**——多一个单位
 * 就会漏到面板的木板上去（client.js 里那段说明讲的就是这个）。所以罩子直接按 W×H 画，
 * 而取景框就是 `0 0 W H`，两者永远相等，没人能把它改歪。
 *
 * 颜色与浓度跟面板那边**同一套变量、同一个系数**（dimForDusk 的 0.55）——
 * 「天黑了」这件事只有一处定义，两边各写一遍迟早会分家。
 */
export function night() {
  return `<rect class="mnight" x="0.00" y="0.00" width="${f2(W)}" height="${f2(H)}"/>`
}

export function rect(x, y, w, h, fill, sw = INK2 * 0.8) {
  return `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${fill}" stroke="${COAST}" stroke-width="${f3(sw)}"/>`
}

/** 一座塔：塔身 + 三个城齿。城齿是「这是城堡不是房子」的唯一记号。 */
export function tower(x, by, w, h, fill) {
  const o = [rect(x - w / 2, by - h, w, h, fill)]
  const cw = w / 3.0
  for (let k = 0; k < 3; k++) {
    o.push(rect(x - w / 2 + k * cw, by - h - 0.14, cw, 0.15, fill, INK2 * 0.65))
  }
  return o
}

/**
 * 首都。一级是奇观级（城墙 + 三塔 + 旗），二级只有一座塔。
 *
 * 用户 m13525 第 3 条之后，国家在世界图上只剩这一个记号 + 一枚徽记 + 一个名字，
 * 所以这个记号得一眼能认出来是「城」。
 */
export function capital(x, y, tier) {
  const o = []
  if (tier === 1) {
    o.push(rect(x - 1.05, y - 0.52, 2.10, 0.52, '#CBB99A'))
    o.push(`<path d="M${f2(x - 0.22)} ${f2(y)} L${f2(x - 0.22)} ${f2(y - 0.34)} L${f2(x + 0.22)} ${f2(y - 0.34)} L${f2(x + 0.22)} ${f2(y)} Z" fill="#4A3A28"/>`)
    for (const [dx, h] of [[-1.02, 0.76], [0.0, 1.12], [1.02, 0.76]]) {
      o.push(...tower(x + dx, y, 0.46, h, '#CBB99A'))
    }
    o.push(`<line x1="${f2(x)}" y1="${f2(y - 1.26)}" x2="${f2(x)}" y2="${f2(y - 1.62)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    o.push(`<path d="M${f2(x)} ${f2(y - 1.60)} L${f2(x + 0.46)} ${f2(y - 1.48)} L${f2(x)} ${f2(y - 1.36)} Z" fill="#B4523F"/>`)
  } else {
    o.push(...tower(x, y, 0.40, 0.78, '#CBB99A'))
  }
  return o
}

/** 族徽。十个种族各一个记号，全用墨线——小到这个尺寸，颜色认不出来，形状才认得出来。 */
export function emblem(x, y, s, race) {
  const k = `stroke="${COAST}" stroke-width="${f3(INK2 * 0.85)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`
  if (race === '人类') {
    return [rect(x - s * 0.30, y - s * 0.34, s * 0.60, s * 0.68, 'none', INK2 * 0.85)]
  }
  if (race === '精灵') {
    return [`<path d="M${f2(x)} ${f2(y + s * 0.42)} Q${f2(x - s * 0.40)} ${f2(y)} ${f2(x)} ${f2(y - s * 0.42)} Q${f2(x + s * 0.40)} ${f2(y)} ${f2(x)} ${f2(y + s * 0.42)} Z" ${k} /><line x1="${f2(x)}" y1="${f2(y + s * 0.40)}" x2="${f2(x)}" y2="${f2(y - s * 0.36)}" ${k} />`]
  }
  if (race === '矮人') {
    return [`<line x1="${f2(x - s * 0.34)}" y1="${f2(y + s * 0.40)}" x2="${f2(x + s * 0.20)}" y2="${f2(y - s * 0.34)}" ${k} />`,
      rect(x + s * 0.06, y - s * 0.48, s * 0.42, s * 0.26, 'none', INK2 * 0.85)]
  }
  if (race === '兽人') {
    return [`<line x1="${f2(x - s * 0.38)}" y1="${f2(y - s * 0.36)}" x2="${f2(x + s * 0.38)}" y2="${f2(y + s * 0.38)}" ${k} />`,
      `<line x1="${f2(x + s * 0.38)}" y1="${f2(y - s * 0.36)}" x2="${f2(x - s * 0.38)}" y2="${f2(y + s * 0.38)}" ${k} />`]
  }
  if (race === '树人') {
    return [`<path d="M${f2(x - s * 0.42)} ${f2(y + s * 0.22)} L${f2(x)} ${f2(y - s * 0.44)} L${f2(x + s * 0.42)} ${f2(y + s * 0.22)} Z" ${k} />`,
      `<line x1="${f2(x)}" y1="${f2(y + s * 0.20)}" x2="${f2(x)}" y2="${f2(y + s * 0.46)}" ${k} />`]
  }
  if (race === '龙') {
    return [`<path d="M${f2(x - s * 0.42)} ${f2(y + s * 0.30)} L${f2(x)} ${f2(y - s * 0.44)} L${f2(x + s * 0.42)} ${f2(y + s * 0.30)} L${f2(x)} ${f2(y + s * 0.02)}" ${k} />`]
  }
  if (race === '鱼人') {
    return [`<line x1="${f2(x)}" y1="${f2(y + s * 0.46)}" x2="${f2(x)}" y2="${f2(y - s * 0.28)}" ${k} />`,
      `<path d="M${f2(x - s * 0.34)} ${f2(y - s * 0.14)} L${f2(x - s * 0.34)} ${f2(y - s * 0.44)} L${f2(x)} ${f2(y - s * 0.20)} L${f2(x + s * 0.34)} ${f2(y - s * 0.44)} L${f2(x + s * 0.34)} ${f2(y - s * 0.14)}" ${k} />`]
  }
  if (race === '半身人') {
    return [`<line x1="${f2(x)}" y1="${f2(y + s * 0.44)}" x2="${f2(x)}" y2="${f2(y - s * 0.44)}" ${k} />`,
      `<line x1="${f2(x)}" y1="${f2(y - s * 0.10)}" x2="${f2(x - s * 0.30)}" y2="${f2(y - s * 0.40)}" ${k} />`,
      `<line x1="${f2(x)}" y1="${f2(y - s * 0.10)}" x2="${f2(x + s * 0.30)}" y2="${f2(y - s * 0.40)}" ${k} />`]
  }
  if (race === '巨人') {
    return [`<path d="M${f2(x - s * 0.44)} ${f2(y + s * 0.40)} L${f2(x - s * 0.10)} ${f2(y - s * 0.42)} L${f2(x + s * 0.26)} ${f2(y + s * 0.40)} Z" ${k} />`,
      `<path d="M${f2(x + s * 0.02)} ${f2(y + s * 0.40)} L${f2(x + s * 0.30)} ${f2(y - s * 0.10)} L${f2(x + s * 0.46)} ${f2(y + s * 0.40)} Z" ${k} />`]
  }
  if (race === '亡灵') {
    return [`<circle cx="${f2(x)}" cy="${f2(y - s * 0.06)}" r="${f2(s * 0.36)}" ${k} />`,
      `<circle cx="${f2(x - s * 0.13)}" cy="${f2(y - s * 0.10)}" r="${f2(s * 0.08)}" fill="${COAST}"/>`,
      `<circle cx="${f2(x + s * 0.13)}" cy="${f2(y - s * 0.10)}" r="${f2(s * 0.08)}" fill="${COAST}"/>`]
  }
  return []
}

/** 徽记：一面盾 + 一个族徽。盾色就是这一族的底色，所以同一族的一眼是一家。 */
export function crest(x, y, s, race, field) {
  const w = s * 0.88
  const d = `M${f2(x - w / 2)} ${f2(y - s / 2)} L${f2(x + w / 2)} ${f2(y - s / 2)} L${f2(x + w / 2)} ${f2(y + s * 0.08)} Q${f2(x + w / 2)} ${f2(y + s * 0.38)} ${f2(x)} ${f2(y + s / 2)} Q${f2(x - w / 2)} ${f2(y + s * 0.38)} ${f2(x - w / 2)} ${f2(y + s * 0.08)} Z`
  const o = [`<path d="${d}" fill="${field}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.85)}" stroke-linejoin="round"/>`]
  o.push(...emblem(x, y, s * 0.56, race))
  return o
}

/**
 * 国家那一层：首都记号 + 徽记 + 名字。**没有国界、没有色块。**
 *
 * 用户 m13525 第 3 条：「国家不是核心。地貌才是核心，国家只是在地貌上生存。」
 * 第 4 条：「很多种族可能共用一块土地，但是实际生存的面积并不大。」
 * 所以这里没有领地，只有「谁在这儿立了个都城」。
 *
 * mode='tier1' 只写一级国的名字（用户点头的那版）；
 * mode='all' 二十国全写，二级小一号——出对比用。
 */
export function nations(mode = 'tier1') {
  const o = []
  // 都城：**画在 world3 给的坐标上**（2026-10-30 地图审计 M-15）。从前是「国名落点
  // 往下挪 2.59 / 1.57」，那是照着老图手抄的偏移：深渊港数据写 (44.6,33.4)、画在
  // (26.9,32)，差 17.76 格，还正好贴在珊瑚宫旁边。现在数据说话，牌子去躲城，不是
  // 城去躲牌子。
  for (const row of NATIONS) {
    const [name, race, land, color, seeds, [nx, ny], [cname, c0x, c0y, tier]] = row
    const [cx, cy] = _cap_at(cname, nx, ny, tier, c0x, c0y)
    o.push(...capital(cx, cy, tier))
  }
  for (const [name, race, color, tier, cx, cy] of nationPlates()) {
    if (tier !== 1 && mode === 'none') {
      continue
    }
    // 二级国名也写（2026-10-27 地图审计 M-3）：二十座都城都画出来了，可其中九座
    // （二级国的）连国名都没有——图上那九座城像是凭空多的。小一号写就是了。
    const fs = NATION_FS[tier]
    const cs = NATION_CS[tier]
    const { slot, t, w } = nationMetrics(name, tier)
    const [x0, r1, , r3] = nationBox(cx, cy, name, tier)
    const op = tier === 1 ? '0.84' : '0.72'
    o.push(`<rect x="${f2(x0)}" y="${f2(r1)}" width="${f2(w)}" height="${f2(r3 - r1)}" rx="0.16" fill="#EFE7D3" opacity="${op}"/>`)
    // 徽记摆在它那一槽的正中
    o.push(...crest(x0 + NATION_PAD + slot / 2, cy, cs, race, color))
    // 名字摆在「徽记槽 + 缝」右边那一段的正中——两边留白相等，且不会碰到徽记
    const tx = x0 + NATION_PAD + slot + NATION_INNER + t / 2
    o.push(`<text x="${f2(tx)}" y="${f2(plate_text_y(cy, fs))}" font-size="${f2(fs)}" fill="${tier === 1 ? '#3B2E20' : '#5A4A34'}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" letter-spacing="0.06">${name}</text>`)
  }
  // 城名比国名小一号压在都城记号下面；落点由 `cityPlates()` 统一算（跟 `_boxes()` 同一份）。
  for (const [cname, px, py, cfs] of cityPlates()) {
    const [r0, r1, r2, r3] = plate_rect(px, py, cname, cfs, 0.42)
    o.push(`<rect x="${f2(r0)}" y="${f2(r1)}" width="${f2(r2 - r0)}" height="${f2(r3 - r1)}" rx="0.14" fill="#EFE7D3" opacity="0.85"/>`)
    o.push(`<text x="${f2(px)}" y="${f2(plate_text_y(py, cfs))}" font-size="${f2(cfs)}" fill="#2A2318" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" letter-spacing="0.04">${cname}</text>`)
  }
  return o
}

/**
 * 地名。海名是浅蓝、不上底板；陆地名压一块淡底板——不然压在山上读不出来。
 *
 * 跟国名重名的地貌名**不写**：地貌层叫「银树森林」，国也叫「银树森林」，
 * 写两遍就是同一句话说两次（用户 m13525 第 3 条：国家只是在地貌上生存）。
 * 重名的十个：银树森林、铁砧山、古林、裂牙荒原、灰烬之地、黑石要塞、
 * 夏丘、龙骨荒漠、鸦林、龙焰半岛——国名那一层已经写了，这里让路。
 */
export function labels() {
  const o = []
  const fs = 1.15
  for (const [name, kind, rect] of labelPlates()) {
    if (!rect) continue
    const [r0, r1, r2, r3] = rect
    const px = (r0 + r2) / 2
    // 2026-10-31：跟 `plate_text_y` 同一件事——原来落 1.37，字身框上边留 0.401、
    // 下边只剩 0.03，整行贴着底板下沿。上移 0.14fs 落到 1.23，两边空当取中。
    const ty = r1 + fs * 1.23
    if (kind === 'sea') {
      o.push(`<text x="${f2(px)}" y="${f2(ty)}" font-size="${f2(fs)}" fill="#8FB0BC" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" letter-spacing="0.06" opacity="0.92">${name}</text>`)
    } else {
      o.push(`<rect x="${f2(r0)}" y="${f2(r1)}" width="${f2(r2 - r0)}" height="${f2(r3 - r1)}" rx="0.16" fill="#EFE7D3" opacity="0.72"/>`)
      o.push(`<text x="${f2(px)}" y="${f2(ty)}" font-size="${f2(fs)}" fill="#3B2E20" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" letter-spacing="0.06">${name}</text>`)
    }
  }
  return o
}

// ---------------------------------------------------------------- 出图

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/* 国名与地貌名。一级国名 1.15 → 1.22（2026-10-30 地图审计 M-13）：地图本体宽 508px
 * 里每单位 508 / 66 = 7.7px，1.15 只有 8.9px，比城名（0.95）显不出层级；1.22 约 9.4px，
 * 仍然压得住图。二级国名 0.88 → 0.92，跟城名拉开一档。
 *
 * 二级国名再抬到 1.13（2026-10-31：t24 抬到 1.06、t30 按真实宽度校正、t35 收到真宿主口径）：
 * **换算是拿地图本体宽算的，不是面板宽**——面板 560，左右各 22px padding，地图本体实测
 * 508（look 四尺寸量出来的 `.gf-stage svg` 宽）。0.92 落在 508 上只有 7.08px；1.06 也只有
 * **1.06 × 508 / 66 = 8.16px**，还没到 8.5 那条线（t24 的 8.99px 是拿 560 算的，分母错了）。
 *
 * 而 508 本身也只在**预览页**成立：滚动条空档（`--gf-sb`）预览页是 6px，真 DSH 面板是 15px
 * （2026-10-05 真面板实测「见闻录内容宽 499 / padding box 514」，见 src/client.js 里
 * syncGutter 上面那段注释）。所以真宿主里地图只有 **499px**，每单位 499 / 66 = 7.561px：
 *   1.11 → **8.39px**（差 0.11px，没到线）｜1.13 → **8.5435px ≥ 8.5**
 *   同一支 1.13 在预览页 508 上是 **8.6976px ≥ 8.5**
 * ⇒ 取 **1.13**：两个分母都过。一级 1.22 不动（499 上 9.22px、508 上 9.39px，早已达标）。
 * 字号一大，牌子就更难躲；所以同一轮把候选落点从手写的 25 个换成按距离排序的密格
 * （`nationShifts()`），并给二级国名加了一条「挤不下就不画」的规矩（见 `nationPlates()`）
 * ——国名是给「他在哪一片」用的，宁可少一个，也不许两块牌子叠在一起。 */
const NATION_FS = { 1: 1.22, 2: 1.13 }
const NATION_CS = { 1: 1.30, 2: 1.00 }

/** 地貌名牌子：夹进图里之后的那块矩形（`labels()`、`_baseBoxes()`、面板避让共用）。 */
export function labelRect(name, x, y, fs = 1.15) {
  const [r0, , r2] = plate_rect(0, 0, name, fs)
  const w = r2 - r0
  const px = clampNum(x, w / 2 + 0.4, W - w / 2 - 0.4)
  const py = clampNum(y, fs * 1.05, H - fs * 0.5)
  return plate_rect(px, py, name, fs)
}

/** 都城记号的包围盒（`capital()` 画的那面三角旗 + 底座）。 */
export function capital_box(cx, cy, tier) {
  const top = tier === 1 ? 1.62 : 0.78
  return [cx - 1.28, cy - top, cx + 1.28, cy]
}

/* 地貌名的落点（M-4/M-13）。地貌名也挪：它从前钉死在 `world3` 给的那个点上，
 * 于是「铁砧山脉」正好压在野地记号「地下矿洞」上、「符文石」压着「乱石岗」。
 * 挪法是小事上下左右试一圈，谁压得少用谁；挪完的框才是城名与国名要躲的东西。 */
const LABEL_FS = 1.15
const LABEL_SHIFTS = [[0, 0], [0, -1.2], [0, 1.2], [-2.0, 0], [2.0, 0], [-2.0, -1.2], [2.0, -1.2],
  [-2.0, 1.2], [2.0, 1.2], [0, -2.4], [0, 2.4], [-4.0, 0], [4.0, 0], [-4.0, -1.2], [4.0, -1.2],
  [0, -3.6], [0, 3.6], [-6.0, 0], [6.0, 0]]
let _LABEL_PLATES = null

/** 地貌名的落点（算一次）：`[名字, 类别, 框或 null]`，跟国名重名的那十个是 null。 */
export function labelPlates() {
  if (_LABEL_PLATES) return _LABEL_PLATES
  const taken = []
  for (const row of NATIONS) {
    const [cname, c0x, c0y, tier] = row[6]
    const [kx, ky] = _cap_at(cname, row[5][0], row[5][1], tier, c0x, c0y)
    taken.push(capital_box(kx, ky, tier))
  }
  for (const [kind, x, y, s] of WONDERS) {
    const [hw, hh] = WONDER_BOX[kind]
    taken.push([x - hw * s, y - hh * s, x + hw * s, y + hh * s])
  }
  for (const [, , , box] of wildBoxes()) taken.push(box)
  const named = new Set(NATIONS.map((n) => n[0]))
  const out = []
  for (const [name, x, y, kind] of LABELS) {
    if (named.has(name)) {
      out.push([name, kind, null])
      continue
    }
    let best = null
    for (const [dx, dy] of LABEL_SHIFTS) {
      const rect = labelRect(name, x + dx, y + dy, LABEL_FS)
      let area = 0
      for (const t of taken) area += box_overlap(rect, t)
      const score = area + (Math.abs(dx) + Math.abs(dy)) * 0.01
      if (!best || score < best[0]) best = [score, rect]
      if (area === 0) break
    }
    taken.push(best[1])
    out.push([name, kind, best[1]])
  }
  _LABEL_PLATES = out
  return out
}

// 都城记号默认落在**名字正下方**：牌子底边和旗尖之间留 0.2 单位。
// 不这么干的话，手写的都城坐标总有一半躲在自家牌子后面（自查报了 11 处
// 「某国 × 自家都城」压住）。牌子还是按地形摆（`NATIONS` 第六项），
// 都城跟着牌子走——「城在名字下面」这件事，读图的人不需要解释。
export const CAP_OFF = { 1: 2.59, 2: 1.57 }
// 例外：珊瑚海国的名字浮在海上（岛太小，牌子放不下），都城得留在岛上。
export const CAP_AT = { '珊瑚宫': [29.9, 31.0] }

/**
 * 都城画在哪：**数据里的城址优先**（2026-10-30 地图审计 M-15）。
 *
 * 从前是「国名落点往下挪 `CAP_OFF`」——那是照着老图手抄的偏移。后来 `world3.py`
 * 重新排过地形，二十座城的坐标变了，这里却还在按老偏移画：深渊港数据写
 * (44.6, 33.4)、画在 (26.9, 32)，差 17.76 格，还正好贴上珊瑚宫。牌子与城名
 * 又都是照着这个错位的结果手抄的，于是「城镇记号跟城堡中心精确重合」也成了巧合。
 *
 * 现在拿着 `NATIONS` 第七项里那对坐标画，牌子去躲城；只有浮岛上的珊瑚宫仍走
 * `CAP_AT`（岛太小，城得留在岛上）。
 */
export function _cap_at(cname, nx, ny, tier, cx = null, cy = null) {
  if (Object.prototype.hasOwnProperty.call(CAP_AT, cname)) {
    return CAP_AT[cname]
  }
  // 给了数据坐标就照数据画（M-15）；`null` 与 `undefined` 都算「没给」——
  // `Number(null)` 是 0，会让每座都城都被夹到左上角去。
  const given = cx !== null && cx !== undefined && cy !== null && cy !== undefined
  const x = given ? Number(cx) : NaN
  const y = given ? Number(cy) : NaN
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return [clampNum(x, 1.6, W - 1.6), clampNum(y, 2.4, H - 0.6)]
  }
  return [nx, ny + CAP_OFF[tier]]
}

/* 国名牌也会挪（M-13）：西半部挤着十个国名，压着地貌名与奇观。
 * 挪法是「原位 → 上下 → 左右 → 远处」一路试，挑重叠面积最小的落点；
 * `_boxes()` 与 `check()` 读的是同一份结果，所以自查看得见挪的效果。
 *
 * 2026-10-31（t24）：手写的 25 个候选不够用了。二级国名抬到 1.06 之后，
 * 河间王国那块牌子在这 25 个里找不到落脚处，被挤到 +4.6 格上，压住「符文石」
 * 与「乱石岗」两处。改成 `shiftRing(0.5, 7)`：0.5 格一档、曼哈顿距离 ≤ 7 的
 * 整片菱形（约 380 个点，近的在前），二十块牌子都能零重叠落下去。 */
const NATION_GAP = 0.55

/** 以原落点为中心的一圈候选点：`step` 一档，曼哈顿距离 ≤ `radius`，近的在前。 */
function shiftRing(step, radius) {
  const n = Math.round(radius / step)
  const out = []
  for (let iy = -n; iy <= n; iy += 1) {
    for (let ix = -n; ix <= n; ix += 1) {
      if (Math.abs(ix) + Math.abs(iy) > n) continue
      out.push([ix * step, iy * step])
    }
  }
  out.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])))
  return out
}

let _NATION_SHIFTS = null
function nationShifts() {
  if (!_NATION_SHIFTS) _NATION_SHIFTS = shiftRing(0.5, 7)
  return _NATION_SHIFTS
}

// 还找不到就再往外一圈（只在二级国名要放弃之前用一次，见 `nationPlates()`）。
// 步长跟近圈一样细（0.5）：粗了会「差 0.06 格也找不到」，南境金丘就差这么一点。
let _NATION_FAR = null
function nationFarShifts() {
  if (!_NATION_FAR) _NATION_FAR = shiftRing(0.5, 16)
  return _NATION_FAR
}

let _CITY_SHIFTS = null
/** 城名的候选点：比国名那圈更细（0.35 一格）、半径 9 格——城名贴着城，但挤的时候也要有路可退。 */
function cityShifts() {
  if (!_CITY_SHIFTS) _CITY_SHIFTS = shiftRing(0.35, 9)
  return _CITY_SHIFTS
}

let _NATION_PLATES = null
let _NATION_SKIPS = null

/**
 * 一块国名牌的版面：`[留白][徽记][缝][名字][留白]`，两边留白相等。
 *
 * 2026-10-31（用户连报两轮）：先是「名字在方框里没居中、跟前面的图标对不齐」，
 * 我把字往左挪——结果「图标和名字的首字重叠了」。两个毛病是同一个根：
 * 底板的宽是按**纯文字**算出来的，徽记是事后在左边「外挂」上去的，
 * 于是底板里根本没有徽记的位置，字怎么挪都是错的。
 *
 * 现在底板宽度由四段加起来：`2 × 留白 + 徽记槽 + 缝 + 文字宽`，
 * 徽记摆在槽中间、字摆在剩余区的中间——不会重叠，两边留白也一样宽。
 */
const NATION_PAD = 0.40
const NATION_INNER = 0.32
const CREST_W_RATIO = 0.88

function nationMetrics(name, tier) {
  const fs = NATION_FS[tier]
  const cs = NATION_CS[tier]
  const n = nlen(name)
  const t = n * fs + Math.max(0, n - 1) * 0.06 // 字宽（含 letter-spacing）
  const slot = cs * CREST_W_RATIO
  return { fs, cs, slot, t, w: 2 * NATION_PAD + slot + NATION_INNER + t, h: fs * 1.62 }
}

function nationBox(cx, cy, name, tier) {
  const { fs, w, h } = nationMetrics(name, tier)
  return [cx - w / 2, cy - fs * 0.95, cx + w / 2, cy - fs * 0.95 + h]
}

/** 二十块国名牌的落点（算一次；`nations()`、`_baseBoxes()`、面板避让共用）。
 *
 * 抽稀规矩（2026-10-31 t24，`_NATION_SKIPS`）：一级国名十一块**一定画**（它们是这张
 * 图的骨架）；二级国名九块按「离国名落点最近、且跟任何已有的字/记号零重叠」挑，
 * 挑不到就**不画**——国名是给「他在哪一片」用的，两块牌子叠在一起比缺一个名字更糟。
 * 挑掉的那几块记在 `nationSkips()` 里，冒烟数得出来。 */
export function nationPlates() {
  if (_NATION_PLATES) return _NATION_PLATES
  const taken = []
  for (const b of _fixedBoxes()) taken.push([b[2], b[3], b[4], b[5]])
  const slots = new Array(NATIONS.length)
  const skips = []
  // 一级国先挑（它们是这张图的骨架），二级国补空。
  const order = NATIONS.map((row, i) => i).sort((a, b) => (NATIONS[a][6][3] - NATIONS[b][6][3]) || (a - b))
  for (const i of order) {
    const row = NATIONS[i]
    const [name, race, land, color, seeds, [nx, ny], [cname, , , tier]] = row
    const [q0, , q2] = plate_rect(0, 0, name, NATION_FS[tier])
    const half = nationMetrics(name, tier).w / 2 + 0.1
    const look = (shifts) => {
      let found = null
      for (const [dx, dy] of shifts) {
        const cx = clampNum(nx + dx, half + 0.4, W - half - 0.4)
        const cy = clampNum(ny + dy, 1.9, H - 1.2)
        const box = nationBox(cx, cy, name, tier)
        const grown = [box[0] - NATION_GAP, box[1] - NATION_GAP, box[2] + NATION_GAP, box[3] + NATION_GAP]
        let area = 0
        for (const t of taken) area += box_overlap(grown, t)
        // 面积一样时，近的赢
        const score = area + (Math.abs(dx) + Math.abs(dy)) * 0.004
        if (!found || score < found[0]) found = [score, cx, cy, box, area]
        if (area === 0) break
      }
      return found
    }
    let best = look(nationShifts())
    // 近的那圈找不到零重叠，就先往外再找一圈（二级国名才有这一步；一级国名不许跑远）。
    if (tier !== 1 && best[4] > 0) {
      const far = look(nationFarShifts())
      if (far[4] < best[4]) best = far
    }
    if (tier !== 1 && best[4] > 0) {
      // 二级国名：找一个零重叠的落点找不到 ⇒ 这一块不画（见上面的抽稀规矩）。
      skips.push([name, `零重叠落点找不到（最近的也压 ${Number(f2(best[4]))} 格²）`])
      slots[i] = null
      continue
    }
    taken.push(best[3])
    slots[i] = [name, race, color, tier, best[1], best[2]]
  }
  _NATION_PLATES = slots.filter(Boolean)
  _NATION_SKIPS = skips
  return _NATION_PLATES
}

/** 被抽稀掉的那几块国名牌（`[名字, 为什么]`）。正常情况下是空的。 */
export function nationSkips() {
  nationPlates()
  return _NATION_SKIPS || []
}

/**
 * 不动的那些记号：地貌名、都城、奇观、野地。城名与国名都绕着它们落。
 *
 * 眼睛查这个不可靠：一张 508px 的图上十几块牌子和二十个记号，
 * 漏掉一处叠在一起，读图的人第一眼就看见。所以让机器报。
 */
function _fixedBoxes() {
  const out = []
  for (const [name, kind, rect] of labelPlates()) {
    if (!rect) continue
    out.push([name, 'label', rect[0], rect[1], rect[2], rect[3]])
  }
  for (const row of NATIONS) {
    const [cname, c0x, c0y, tier] = row[6]
    const [kx, ky] = _cap_at(cname, row[5][0], row[5][1], tier, c0x, c0y)
    const [q0, q1, q2, q3] = capital_box(kx, ky, tier)
    out.push([cname, 'capital', q0, q1, q2, q3])
  }
  for (const [kind, x, y, s] of WONDERS) {
    const [hw, hh] = WONDER_BOX[kind]
    out.push(['奇观·' + WONDER_CN[kind], 'wonder',
      x - hw * s, y - hh * s, x + hw * s, y + hh * s])
  }
  for (const [name, x, y, box] of wildBoxes()) {
    out.push([name, 'wild', box[0], box[1], box[2], box[3]])
  }
  return out
}

/** 图上所有牌子和记号（不动的那些 + 国名 + 城名），用来查「谁压在谁身上」。 */
function _baseBoxes() {
  const out = _fixedBoxes()
  for (const [name, race, color, tier, cx, cy] of nationPlates()) {
    const [b0, b1, b2, b3] = nationBox(cx, cy, name, tier)
    out.push([name, 'nation', b0, b1, b2, b3])
  }
  for (const [name, px, py, fs] of cityPlates()) {
    const [r0, r1, r2, r3] = plate_rect(px, py, name, fs, 0.42)
    out.push([name, 'city', r0, r1, r2, r3])
  }
  return out
}

// 城名牌（2026-10-27 地图审计 M-3）。二十座都城一直画着，可图上没有一个城名——
// 他自己站在「银树城」，那三个字在整张图上找不到。城名比国名小一号，压在都城记号
// **下面**（记号占 cy-top..cy）；挤不开就按 `cityShifts()` 就近挪，挪完还挤就挑
// 压得最少的落点照画（名字比留白重要）。
//
// 2026-10-31（t24）：候选从手写的 59 个换成 `shiftRing(0.35, 4.2)`——国名抬到 1.06
// 之后西半部更挤，手写候选里挑不出零重叠的落点（自查剩「龙骨城 × 奇观·龙骸」一处）。
const CITY_FS = 0.95
const CITY_FS_LO = 0.82
let _CITY_PLATES = null

function cityPlateBox(px, py, name) {
  const [r0, r1, r2, r3] = plate_rect(px, py, name, CITY_FS, 0.42)
  return [name, 'city', r0, r1, r2, r3]
}

/** 二十块城名牌的落点（算一次，`nations()` 与 `_boxes()` 共用同一份）。 */
export function cityPlates() {
  if (_CITY_PLATES) return _CITY_PLATES
  const taken = _fixedBoxes().map((b) => [b[2], b[3], b[4], b[5]])
  // 国名先定（它们大、候选多），城名躲着它们。
  for (const [name, race, color, tier, cx, cy] of nationPlates()) taken.push(nationBox(cx, cy, name, tier))
  const out = []
  for (const row of NATIONS) {
    const [, , , , , [nx, ny], [cname, c0x, c0y, tier]] = row
    const [cx, cy] = _cap_at(cname, nx, ny, tier, c0x, c0y)
    let best = null
    // 先按 0.95 试；还挤就缩到 0.82 再试一遍（M-6/M-13：城名压不住地名就小一号）。
    for (const [rank, fs] of [[0, CITY_FS], [1, CITY_FS_LO], [2, 0.72], [3, 0.66]]) {
      // 城名压在都城记号**下面**：牌子顶边在记号底边之下留 0.35
      const baseY = cy + 0.35 + fs * 0.95
      const [q0, , q2] = plate_rect(0, 0, cname, fs, 0.42)
      const half = (q2 - q0) / 2
      for (const [dx, dy] of cityShifts()) {
        const px = clampNum(cx + dx, half + 0.3, W - half - 0.3)
        const py = clampNum(baseY + dy, fs * 0.95 + 0.2, H - fs * 0.8)
        const box = plate_rect(px, py, cname, fs, 0.42)
        let area = 0
        for (const t of taken) area += box_overlap(box, t)
        const score = area + rank * 0.35
        if (!best || score < best[0]) best = [score, px, py, fs]
        if (area === 0) break
      }
      if (best && best[0] < 0.35) break
    }
    taken.push(plate_rect(best[1], best[2], cname, best[3], 0.42))
    out.push([cname, best[1], best[2], best[3]])
  }
  _CITY_PLATES = out
  return out
}

export function _boxes() {
  return _baseBoxes()
}

/**
 * 图上所有**写着字或画着记号**的地方，展开成扁平的矩形表——
 * `[说法, 种类, x0, y0, x1, y1]`（2026-10-30 M-4 用）。
 *
 * 面板上那枚地名签得躲开这张图上已有的字与记号，不然「银树城」三个字会压在
 * 「银树森林」上。世界图与面板是两套坐标系：世界图这张表按 `VIEW` 平移即可。
 */
export function textBoxes() {
  const out = _boxes()
  return out.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5]])
}

/**
 * 面板上那枚地名签的落点（M-4）。返回 `plate_rect` 那块矩形。
 *
 * 四个方向都试：右、左、上、下。右/左按**签子的边**留 `gapX`（不是按中心），
 * 上/下按签子的底边/顶边留 `gapUp`/`gapDown`——原来的算式就是「右移 3.0」
 * 「上移 4.2」「贴顶时下移 0.9」，这里只是再多算三条备选，谁压得少用谁。
 *
 * 压的分两档：压图上已有的字与记号算真的；压自己那枚针（半径 `pinR` 的一小块）
 * 乘以 3——签压针，读起来像针掉进了牌子。出框的一律不用（除非四个方向全出框）。
 */
/** 面板地名签的正文字号（M-4：1.75 时十三枚里有十枚压在图上别的字上，1.6 时剩两枚）。 */
export const PLACE_FS = 1.6

export function placeLabel(px, py, text, fs, view, opts = {}) {
  const gapX = opts.gapX === undefined ? 3.0 : opts.gapX
  const gapUp = opts.gapUp === undefined ? 4.2 : opts.gapUp
  const gapDown = opts.gapDown === undefined ? 0.9 : opts.gapDown
  const pinR = opts.pinR === undefined ? 1.05 : opts.pinR
  const sizes = opts.sizes || [fs, fs * 0.88, fs * 0.78]
  const boxes = textBoxes()
  const pin = [px - pinR, py - pinR, px + pinR, py + pinR]
  // 候选点：十六个方向 × 三档远近。
  //
  // 2026-10-31：远近**封顶在 2.1 档**（约 6 个世界单位）。原来一直试到 4.0 档，
  // 于是挤不下的时候就一路飞出去——用户实测「他的屋子」那枚签落到了**离记号 16 格**
  // 的地方，而它存在的全部意义就是指出他在哪。签离记号十几格，等于没有签。
  // 宁可挪近一点压着别的字（签字底板 0.9 不透明，压住的那点字透不上来）。
  const dirs = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1],
    [1, -0.45], [1, 0.45], [-1, -0.45], [-1, 0.45], [0.45, -1], [-0.45, -1], [0.45, 1], [-0.45, 1]]
  const rungs = [1, 1.5, 2.1, 2.9]
  let best = null
  for (let rank = 0; rank < sizes.length; rank++) {
    const size = sizes[rank]
    const [q0, , q2] = plate_rect(0, 0, text, size)
    const w = q2 - q0
    let clean = false
    for (const rung of rungs) {
      for (const [sx, sy] of dirs) {
        const cx = sx === 0 ? px : px + Math.sign(sx) * (Math.abs(sx) * gapX * rung + w / 2)
        const cy = sy === 0 ? py : py + Math.sign(sy) * (Math.abs(sy) * (sy > 0 ? gapDown : gapUp) * rung
          + (sy > 0 ? size * 0.95 : size * 0.67))
        const rect = plate_rect(cx, cy, text, size)
        const inside = rect[0] >= view.x + 0.4 && rect[2] <= view.x + view.w - 0.4
          && rect[1] >= view.y + 0.4 && rect[3] <= view.y + view.h - 0.4
        let area = 0
        let worst = 0
        for (const b of boxes) {
          const o = box_overlap(rect, [b[2], b[3], b[4], b[5]])
          if (o <= 0) continue
          area += o
          // 2026-10-31：光算总面积不够——把**一块**牌子盖掉 63% 和把四块各盖 16%
          // 面积一样，可前者那块字基本没了。所以再按「压得最狠的那一块占它自己多少」
          // 加一道平方罚。
          const own = (b[4] - b[2]) * (b[5] - b[3])
          if (own > 0) worst = Math.max(worst, o / own)
        }
        const onPin = box_overlap(rect, pin)
        // 压住的分按面积算；可**挪太远**同样难受——签离针十几格，读的人得来回找。
        //
        // 2026-10-31：原来只有「每远一档加 0.5」那点软约束，压不住——斜向候选
        // （|sx|=1 且 |sy|=1）两头的偏移会**叠加**，最高一档实际能到 14 格。
        // 现在加一道**硬闸**：签心离记号超过 limit 的候选一律重罚，只在
        // 「附近一个都没得选」时才会被迫用上。签存在的意义是指出他在哪，
        // 离十几格的签不如不要。
        //
        // 硬闸两次收紧：9 → 6.5 → **8**。逐档扫过才发现「更紧」不等于「更好」：
        // 收到 6.5 时最远确实降到 6.35 格，可最狠那一块牌子被盖掉的比例从 31% 跳到 63%
        // （霜堡），总面积也从 7.78 涨到 16.15 —— 签是贴上去了，可它把别人的城名糊了。
        // 8 这一档是拐点：最远 7.86 格、盖最狠 31%、总面积 8.72，三项都比原来的 9 更好。
        // 见 `.scratch/label-sweep.mjs`（一次性扫掠表）。
        const limit = opts.limit === undefined ? 8 : opts.limit
        const far = Math.hypot((rect[0] + rect[2]) / 2 - px, (rect[1] + rect[3]) / 2 - py)
        // 距离用两级：硬闸在 `limit`（默认 8 格，超过一律重罚），软的是每格 0.9 分。
        // 软罚再大就会越过上面那个拐点（farK 1.4 时盖最狠跳到 63%）。
        const farK = opts.farK === undefined ? 0.9 : opts.farK
        const score = area * 2.2 + worst * worst * 14 + onPin * 4 + (inside ? 0 : 1e6) + (far > limit ? 1e5 : 0)
          + far * farK + (rung - 1) * 0.5 + rank * 0.5
        if (!best || score < best[0]) best = [score, rect, size]
        if (area === 0 && onPin === 0 && inside && far <= limit) {
          clean = true
          break
        }
      }
      if (clean) break
    }
    if (clean) break
  }
  const [, rect, size] = best
  // 前四项是牌子那块矩形，第五项是实际用上的字号（挤的时候会小一号）。
  return [rect[0], rect[1], rect[2], rect[3], size]
}

/** 报出所有互相压住的牌子/记号。空着才是好的。 */
export function check() {
  const bs = _boxes()
  const bad = []
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]
      const b = bs[j]
      const ox = Math.min(a[4], b[4]) - Math.max(a[2], b[2])
      const oy = Math.min(a[5], b[5]) - Math.max(a[3], b[3])
      if (ox > 0.05 && oy > 0.05) {
        bad.push([a[0], b[0], Number(f2(ox)), Number(f2(oy))])
      }
    }
  }
  for (const t of bad) {
    console.log(`！压住：${t[0]} × ${t[1]}  (${f2(t[2])} × ${f2(t[3])})`)
  }
  if (!bad.length) {
    console.log('牌子与记号：没有互相压住的。')
  }
  // 都城必须站在陆地上：牌子浮在海上是可以的（岛国），城不能。
  const rings = []
  for (const rs of Object.values(LANDS)) for (const r of rs) rings.push(r)
  for (const row of NATIONS) {
    const [name, race, land, color, seeds, [nx, ny], [cname, c0x, c0y, tier]] = row
    const [cx, cy] = _cap_at(cname, nx, ny, tier, c0x, c0y)
    if (!rings.some((r) => hit(r, cx, cy))) {
      console.log(`！都城落在海里：${cname}（${name}）@ ${f1(cx)},${f1(cy)}`)
    }
  }
  // 奇观：浮岛必须在水里（不然不叫浮岛），别的必须踩在陆地上。
  for (const [kind, x, y, s] of WONDERS) {
    const on = rings.some((r) => hit(r, x, y))
    const cn = WONDER_CN[kind]
    if (WONDER_SEA.has(kind) && on) {
      console.log(`！浮岛钉在陆地上：${cn} @ ${f1(x)},${f1(y)}`)
    }
    if (!WONDER_SEA.has(kind) && !on) {
      console.log(`！奇观落在海里：${cn}（${kind}）@ ${f1(x)},${f1(y)}`)
    }
  }
  // 野地：六个地方都得踩在陆地上（M-5 加了记号，记号不能站进海里）。
  for (const [name, x, y] of wildBoxes()) {
    if (!rings.some((r) => hit(r, x, y))) {
      console.log(`！野地落在海里：${name} @ ${f1(x)},${f1(y)}`)
    }
  }
  return bad
}

// ---------------------------------------------------------------- 世界奇观
//
// 地貌是主角、国家是一层薄东西，再往上是**十来处奇观**——一眼认得出、值得
// 单独画一笔的地方。它们不是「大一号的地貌」，所以得有自己的说法才读得出来：
// 所有奇观共用一条视觉规矩——**底下一圈淡光晕 + 一圈虚线环**。老地图上
// 「这里有东西」就是这么标的：虚线环是「有人特意量过、记过」的记号。
//
// 摆哪儿由 world3.WONDERS 给，全部钉在已有的地理上（世界之树在三片精灵／
// 树人的林子里、龙骸在龙骨荒漠、水晶脉在矮人的铁砧山、符文石在巨人之脊、
// 污染之地在亡灵那座冰原岛上、浮岛漂在断桥海上）。

export const TREE_HI = '#6E8C4E'
export const TREE_LO = '#3F5A34'
export const BONE = '#E6DECA'
export const BONE_SH = '#B4AA92'
export const CRYSTAL = '#8FBBCB'
export const CRYSTAL_HI = '#DDF1F7'
export const STONE = '#9C968A'
export const STONE_LO = '#6E685E'
export const BLIGHT = '#6B6470'
export const SLATE = '#5A6B84'

export const WONDER_HALO = '<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFE7A8" stop-opacity="0.44"/><stop offset="0.58" stop-color="#FFE7A8" stop-opacity="0.20"/><stop offset="1" stop-color="#FFE7A8" stop-opacity="0"/></radialGradient>'
export const WONDER_COLD = '<radialGradient id="halocold" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#B9D6C8" stop-opacity="0.40"/><stop offset="0.58" stop-color="#B9D6C8" stop-opacity="0.17"/><stop offset="1" stop-color="#B9D6C8" stop-opacity="0"/></radialGradient>'

/**
 * 奇观的地界：一圈光晕 + 一圈虚线环。**必须画在奇观自己底下。**
 *
 * 环是给读图的人看的「这里有人特意量过」——1× 下光晕只剩一层淡黄，
 * 真正把「这是个奇观」说出去的是这圈虚线，所以它得够粗、够密。
 */
export function wonder_mark(cx, cy, r, cold = false) {
  const o = [`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="url(#${cold ? 'halocold' : 'halo'})"/>`]
  o.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.93)}" fill="none" stroke="${COAST}" stroke-width="${f3(INK2 * 1.25)}" stroke-dasharray="0.34 0.30" opacity="0.62"/>`)
  return o
}

/**
 * 世界之树：冠极大、干极粗、根铺开，外加三只绕树的鸟。
 *
 * 要跟林子里那些小树**一眼分开**：小树是「一根杆加一团圆」，这棵是
 * 「五瓣互相压着的叶团 + 一根有根盘的干 + 鸟」。鸟是尺度——树高不过三只鸟
 * 叠起来，读图的人立刻知道这不是一棵树，是一棵树。
 */
export function worldtree(cx, cy, s) {
  const o = wonder_mark(cx, cy - 0.3 * s, 2.35 * s)
  const base = cy + 2.00 * s
  const ty = cy - 0.45 * s
  // 根盘 + 根脚
  o.push(`<ellipse cx="${f2(cx)}" cy="${f2(base)}" rx="${f2(1.05 * s)}" ry="${f2(0.28 * s)}" fill="#8C8358" stroke="${COAST}" stroke-width="${f3(INK2)}"/>`)
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (0.08 + 0.14 * k)
    const rx = cx + Math.cos(a) * 1.02 * s
    const ry = base + Math.sin(a) * 0.28 * s
    o.push(`<line x1="${f2(cx + (rx - cx) * 0.30)}" y1="${f2(base + (ry - base) * 0.30)}" x2="${f2(rx)}" y2="${f2(ry)}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.75"/>`)
  }
  // 干：下粗上细，两侧各收一次腰
  const tw0 = 0.29 * s
  const tw1 = 0.145 * s
  o.push(`<path d="${pd([[cx - tw0, base], [cx + tw0, base], [cx + tw0 * 0.72, base - 1.05 * s], [cx + tw1, ty], [cx - tw1, ty], [cx - tw0 * 0.72, base - 1.05 * s]])}" fill="#7A6242" stroke="${COAST}" stroke-width="${f3(INK)}"/>`)
  for (let k = 0; k < 6; k++) {
    const f = -0.72 + 0.288 * k
    o.push(`<line x1="${f2(cx + f * tw0 * 0.86)}" y1="${f2(base - 0.14 * s)}" x2="${f2(cx + f * tw1 * 0.86)}" y2="${f2(ty + 0.12 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" opacity="0.55"/>`)
  }
  // 两根分叉：主干顶端往左上、往右各分出一枝
  for (const [dx, dy, L] of [[-0.62, -0.28, 1.05], [0.60, -0.20, 0.95]]) {
    o.push(`<line x1="${f2(cx)}" y1="${f2(ty + 0.30 * s)}" x2="${f2(cx + dx * s)}" y2="${f2(ty + dy * s - L * 0.30 * s)}" stroke="#7A6242" stroke-width="${f3(0.20 * s)}" stroke-linecap="round"/>`)
  }
  // 冠：五瓣，深浅两色交替，瓣与瓣之间留墨线
  const lobes = [[-0.86, -1.44, 0.98, 0], [0.86, -1.44, 0.98, 1],
    [-0.44, -2.26, 0.90, 1], [0.44, -2.26, 0.90, 0],
    [0.00, -1.12, 0.92, 0]]
  for (let li = 0; li < lobes.length; li++) {
    const [dx, dy, lr, tone] = lobes[li]
    o.push(`<path d="${pd(blob(cx + dx * s, cy + dy * s, lr * s, 300 + li * 13, 12, 0.84))}" fill="${tone === 0 ? TREE_HI : TREE_LO}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
  }
  // 冠底压一道暗：树冠不该是一块平色
  o.push(`<path d="${pd([[cx - 1.28 * s, cy - 0.86 * s], [cx - 0.42 * s, cy - 0.52 * s], [cx + 0.46 * s, cy - 0.56 * s], [cx + 1.26 * s, cy - 0.90 * s], [cx + 0.60 * s, cy - 0.24 * s], [cx - 0.58 * s, cy - 0.22 * s]])}" fill="${TREE_LO}" opacity="0.42"/>`)
  // 鸟：三只，斜着一串
  for (const [bx, by, bw] of [[-1.62, -2.86, 0.34], [-1.08, -3.16, 0.27], [-1.86, -2.42, 0.22]]) {
    o.push(`<path d="${pd([[cx + bx * s, cy + by * s], [cx + (bx + bw * 0.5) * s, cy + (by - bw * 0.42) * s], [cx + (bx + bw) * s, cy + by * s]], false)}" fill="none" stroke="${COAST}" stroke-width="${f3(INK2 * 0.9)}" stroke-linecap="round"/>`)
  }
  return o
}

/**
 * 浮岛：漂在海上的一块地，底下拖着几根根须，还有一道水从岛心漏下来。
 *
 * 「浮」全靠两样东西说：**底下那片投在海面上的影**，和**影与岛之间那道空**。
 * 没有影，它只是一座画歪了的小岛。
 */
export function floatisle(cx, cy, s) {
  const o = wonder_mark(cx, cy - 0.1 * s, 1.75 * s)
  // 海面上的影
  o.push(`<ellipse cx="${f2(cx + 0.10 * s)}" cy="${f2(cy + 2.05 * s)}" rx="${f2(1.00 * s)}" ry="${f2(0.22 * s)}" fill="${COAST}" opacity="0.22"/>`)
  const body = [[cx - 1.22 * s, cy + 0.02 * s], [cx - 0.78 * s, cy - 0.46 * s],
    [cx - 0.18 * s, cy - 0.62 * s], [cx + 0.46 * s, cy - 0.36 * s],
    [cx + 1.20 * s, cy + 0.04 * s], [cx + 0.58 * s, cy + 0.72 * s],
    [cx + 0.12 * s, cy + 1.42 * s], [cx - 0.62 * s, cy + 0.58 * s]]
  o.push(`<path d="${pd(body)}" fill="${BIOME_COLOR['grass']}" stroke="${COAST}" stroke-width="${f3(INK)}" stroke-linejoin="round"/>`)
  const under = [[cx - 1.02 * s, cy + 0.28 * s], [cx - 0.34 * s, cy + 0.52 * s],
    [cx + 0.36 * s, cy + 0.40 * s], [cx + 1.04 * s, cy + 0.10 * s],
    [cx + 0.58 * s, cy + 0.72 * s], [cx + 0.12 * s, cy + 1.42 * s],
    [cx - 0.62 * s, cy + 0.58 * s]]
  o.push(`<path d="${pd(under)}" fill="${ROCK_SH}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
  // 岛上的小树
  const ts = [[-0.70, 0.30], [-0.24, 0.38], [0.40, 0.28]]
  for (let k = 0; k < ts.length; k++) {
    o.push(...tree(cx + ts[k][0] * s, cy - 0.22 * s, ts[k][1] * s, k % 2 === 0, 410 + k))
  }
  // 漏下来的水
  for (let k = 0; k < 3; k++) {
    const wx = cx + (0.02 + k * 0.10) * s
    o.push(`<line x1="${f2(wx)}" y1="${f2(cy + 0.62 * s)}" x2="${f2(wx + (k - 1) * 0.06 * s)}" y2="${f2(cy + 1.72 * s)}" stroke="${RIVER_IN}" stroke-width="${f3(INK2 * 0.9)}" stroke-linecap="round" opacity="0.75"/>`)
  }
  // 影底下的漂移线
  for (let k = 0; k < 3; k++) {
    const dy = cy + 2.30 * s + k * 0.16 * s
    const hw = (0.72 - k * 0.16) * s
    o.push(`<line class="mw" x1="${f2(cx - hw)}" y1="${f2(dy)}" x2="${f2(cx + hw)}" y2="${f2(dy)}"/>`)
  }
  return o
}

/**
 * 大法师塔：细高、石板顶、塔身上绕着两圈符文环。
 *
 * 跟孤塔（`towers` 里那种）分开的是**那两圈环**——环是不该出现在地图上的东西，
 * 正是这一笔说「这里有个奇观」。
 */
export function archtower(cx, cy, s) {
  const o = wonder_mark(cx, cy - 0.15 * s, 1.85 * s)
  const base = cy + 1.40 * s
  o.push(`<path d="${pd(blob(cx, base - 0.05 * s, 0.72 * s, 770, 10, 0.52))}" fill="${ROCK_SH}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
  const ty = cy - 0.70 * s
  o.push(`<path d="${pd([[cx - 0.27 * s, base], [cx + 0.27 * s, base], [cx + 0.17 * s, ty], [cx - 0.17 * s, ty]])}" fill="${STONE}" stroke="${COAST}" stroke-width="${f3(INK)}"/>`)
  for (let k = 0; k < 5; k++) {
    const yy = base - (0.28 + k * 0.42) * s
    o.push(`<line x1="${f2(cx - 0.24 * s)}" y1="${f2(yy)}" x2="${f2(cx + 0.24 * s)}" y2="${f2(yy - 0.30 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" opacity="0.45"/>`)
  }
  for (let k = 0; k < 3; k++) {
    const yy = base - (0.55 + k * 0.62) * s
    o.push(`<rect x="${f2(cx - 0.05 * s)}" y="${f2(yy - 0.16 * s)}" width="${f2(0.10 * s)}" height="${f2(0.18 * s)}" fill="${COAST}" opacity="0.75"/>`)
  }
  o.push(`<path d="${pd([[cx - 0.34 * s, ty], [cx, cy - 1.78 * s], [cx + 0.34 * s, ty]])}" fill="${SLATE}" stroke="${COAST}" stroke-width="${f3(INK)}" stroke-linejoin="round"/>`)
  o.push(`<line x1="${f2(cx)}" y1="${f2(cy - 1.78 * s)}" x2="${f2(cx)}" y2="${f2(cy - 2.05 * s)}" stroke="${COAST}" stroke-width="${f3(INK2)}"/>`)
  o.push(`<path d="${pd([[cx, cy - 2.02 * s], [cx + 0.34 * s, cy - 1.90 * s], [cx, cy - 1.80 * s]])}" fill="#B4523F" opacity="0.9"/>`)
  // 两圈符文环
  const ring2 = [[cy - 0.10 * s, 0.62 * s], [cy - 1.10 * s, 0.46 * s]]
  for (let k = 0; k < ring2.length; k++) {
    const ry = ring2[k][0]
    const rr = ring2[k][1]
    o.push(`<ellipse cx="${f2(cx)}" cy="${f2(ry)}" rx="${f2(rr)}" ry="${f2(rr * 0.30)}" fill="none" stroke="#D8B879" stroke-width="${f3(INK2 * 1.2)}" stroke-dasharray="0.20 0.16" opacity="0.9"/>`)
    for (let j = 0; j < 3; j++) {
      const a = 2 * Math.PI * (j / 3.0 + k * 0.17)
      const dx = cx + Math.cos(a) * rr
      const dy = ry + Math.sin(a) * rr * 0.30
      o.push(`<circle cx="${f2(dx)}" cy="${f2(dy)}" r="${f3(0.17 * s)}" fill="#FFE7A8" opacity="0.35"/>`)
      o.push(`<circle cx="${f2(dx)}" cy="${f2(dy)}" r="${f3(0.075 * s)}" fill="#F0DDA8"/>`)
    }
  }
  return o
}

/**
 * 龙骸：一副侧躺的骨架——脊、六根肋、一个长吻的头骨、三根散骨。
 *
 * 画在龙骨荒漠上。骨头一律**白填 + 细墨线**，跟周围沙色只差一个明度，
 * 所以远看是「地上一片白」，近看才是骨头——这正是荒原上该有的读法。
 */
export function dragonbones(cx, cy, s) {
  const o = wonder_mark(cx, cy, 2.35 * s)
  const sp = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1.0)
    sp.push([cx + (-1.90 + 2.80 * t) * s, cy + (0.55 - 0.30 * Math.sin(t * Math.PI)) * s])
  }
  // 肋
  for (let i = 1; i < 8; i++) {
    const px = sp[i][0]
    const py = sp[i][1]
    o.push(`<path d="${pd([[px, py], [px - 0.10 * s, py - 0.62 * s], [px + 0.34 * s, py - 0.94 * s], [px + 0.62 * s, py - 0.70 * s], [px + 0.42 * s, py - 0.44 * s], [px + 0.14 * s, py - 0.24 * s]])}" fill="${BONE}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.85)}" stroke-linejoin="round"/>`)
  }
  // 脊：椎骨
  for (let i = 0; i < sp.length; i++) {
    const px = sp[i][0]
    const py = sp[i][1]
    const rr = (0.16 - Math.abs(i - 4) * 0.012) * s
    o.push(`<ellipse cx="${f2(px)}" cy="${f2(py)}" rx="${f2(rr)}" ry="${f2(rr * 0.80)}" fill="${BONE}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
  }
  // 翼指：三根长骨从肩往上张开
  const wings = [-1.16, -1.44, -1.70]
  for (let k = 0; k < wings.length; k++) {
    const a = wings[k]
    const ox = sp[2][0]
    const oy = sp[2][1]
    const L = (1.05 + k * 0.14) * s
    o.push(`<line x1="${f2(ox)}" y1="${f2(oy)}" x2="${f2(ox + Math.cos(a) * L)}" y2="${f2(oy + Math.sin(a) * L)}" stroke="${BONE_SH}" stroke-width="${f3(0.16 * s)}" stroke-linecap="round"/>`)
  }
  // 头骨：长吻 + 眼窝 + 两只角
  const sx = sp[8][0]
  const sy = sp[8][1]
  o.push(`<path d="${pd([[sx - 0.16 * s, sy - 0.20 * s], [sx + 0.42 * s, sy - 0.34 * s], [sx + 1.02 * s, sy - 0.14 * s], [sx + 1.06 * s, sy + 0.12 * s], [sx + 0.44 * s, sy + 0.18 * s], [sx - 0.18 * s, sy + 0.26 * s]])}" fill="${BONE}" stroke="${COAST}" stroke-width="${f3(INK)}" stroke-linejoin="round"/>`)
  o.push(`<ellipse cx="${f2(sx + 0.18 * s)}" cy="${f2(sy - 0.06 * s)}" rx="${f2(0.10 * s)}" ry="${f2(0.08 * s)}" fill="${COAST}" opacity="0.72"/>`)
  for (let k = 0; k < 2; k++) {
    const a = -2.30 - k * 0.34
    o.push(`<line x1="${f2(sx + 0.02 * s)}" y1="${f2(sy - 0.16 * s)}" x2="${f2(sx + 0.02 * s + Math.cos(a) * 0.52 * s)}" y2="${f2(sy - 0.16 * s + Math.sin(a) * 0.52 * s)}" stroke="${BONE}" stroke-width="${f3(0.12 * s)}" stroke-linecap="round"/>`)
  }
  // 散骨
  const scattered = [[-1.35, 1.15, 0.46], [-0.20, 1.42, 0.34], [1.10, 1.20, 0.40]]
  for (let k = 0; k < scattered.length; k++) {
    const dx = scattered[k][0]
    const dy = scattered[k][1]
    const dw = scattered[k][2]
    o.push(`<rect x="${f2(cx + dx * s)}" y="${f2(cy + dy * s)}" width="${f2(dw * s)}" height="${f2(0.13 * s)}" rx="${f2(0.06 * s)}" fill="${BONE}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" transform="rotate(${-14 + k * 17} ${f2(cx + dx * s)} ${f2(cy + dy * s)})"/>`)
  }
  return o
}

/**
 * 水晶脉：五根晶柱从一道地缝里长出来，左边那面受光。
 *
 * 矮人的铁砧山上。晶柱一律**淡蓝填、尖端收成一个点**——收成点的形才像晶，
 * 收成平顶的形像碑。
 */
export function crystalvein(cx, cy, s) {
  const o = wonder_mark(cx, cy, 1.55 * s)
  const base = cy + 0.72 * s
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.12 + 0.19 * k)
    o.push(`<line x1="${f2(cx + Math.cos(a) * 0.22 * s)}" y1="${f2(base - 0.06 * s)}" x2="${f2(cx + Math.cos(a) * 1.02 * s)}" y2="${f2(base - 0.06 * s + Math.sin(a) * 0.20 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" stroke-linecap="round" opacity="0.6"/>`)
  }
  const cols = [[-0.62, 0.66, 0.34, 0.95, -0.24],
    [0.06, 0.70, 0.40, 1.60, 0.05],
    [0.60, 0.64, 0.30, 0.85, 0.30],
    [-0.18, 0.62, 0.24, 0.58, -0.52],
    [0.96, 0.66, 0.22, 0.52, 0.56]]
  for (const [bx, by, w, h, tilt] of cols) {
    const px = cx + bx * s
    const py = cy + by * s
    const tx = px + Math.sin(tilt) * h * s
    const ty = py - Math.cos(tilt) * h * s
    const mx = px + Math.sin(tilt) * h * 0.58 * s
    const my = py - Math.cos(tilt) * h * 0.58 * s
    const ux = Math.cos(tilt)
    const uy = Math.sin(tilt)
    o.push(`<path d="${pd([[px - ux * w / 2 * s, py - uy * w / 2 * s], [mx - ux * w * 0.30 * s, my - uy * w * 0.30 * s], [tx, ty], [mx + ux * w * 0.30 * s, my + uy * w * 0.30 * s], [px + ux * w / 2 * s, py + uy * w / 2 * s]])}" fill="${CRYSTAL}" stroke="${COAST}" stroke-width="${f3(INK2 * 1.25)}" stroke-linejoin="round"/>`)
    o.push(`<path d="${pd([[px - ux * w / 2 * s, py - uy * w / 2 * s], [mx - ux * w * 0.30 * s, my - uy * w * 0.30 * s], [tx, ty], [px, py]])}" fill="${CRYSTAL_HI}" opacity="0.9"/>`)
    o.push(`<line x1="${f2(px)}" y1="${f2(py)}" x2="${f2(tx)}" y2="${f2(ty)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.9)}" opacity="0.65"/>`)
  }
  return o
}

/**
 * 符文石：三块立着、一块躺着，最大那块上刻着几道符文。
 *
 * 巨人之脊上。石头**故意不整齐**——等边排列读成公园，歪着才像「谁在这儿立过」。
 */
export function runestones(cx, cy, s) {
  const o = wonder_mark(cx, cy, 1.60 * s)
  const base = cy + 0.78 * s
  o.push(`<path d="${pd(blob(cx, base - 0.04 * s, 1.12 * s, 660, 11, 0.26))}" fill="#8C8358" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
  const stones = [[-0.62, 0.36, 1.55, -0.10, STONE],
    [0.16, 0.32, 1.18, 0.07, STONE_LO],
    [0.74, 0.26, 0.92, 0.15, STONE]]
  for (const [bx, w, h, tilt, tone] of stones) {
    const px = cx + bx * s
    const py = base - 0.10 * s
    const tx = px + Math.sin(tilt) * h * s
    const ty = py - Math.cos(tilt) * h * s
    o.push(`<path d="${pd([[px - w / 2 * s, py], [px + w / 2 * s, py + 0.05 * s], [tx + w * 0.36 * s, ty + 0.03 * s], [tx - w * 0.34 * s, ty]])}" fill="${tone}" stroke="${COAST}" stroke-width="${f3(INK2 * 1.1)}" stroke-linejoin="round"/>`)
    // 受光的那一边压一道亮：石头才立得起来
    o.push(`<path d="${pd([[px - w / 2 * s, py], [px - w * 0.12 * s, py - 0.02 * s], [tx - w * 0.10 * s, ty], [tx - w * 0.34 * s, ty]])}" fill="#C8C2B4" opacity="0.7"/>`)
  }
  // 躺倒的那块
  o.push(`<path d="${pd([[cx - 1.02 * s, base + 0.34 * s], [cx - 0.22 * s, base + 0.18 * s], [cx - 0.16 * s, base + 0.34 * s], [cx - 0.98 * s, base + 0.50 * s]])}" fill="${STONE_LO}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.9)}" stroke-linejoin="round"/>`)
  // 符文
  for (let k = 0; k < 4; k++) {
    const yy = base - (0.42 + k * 0.26) * s
    o.push(`<line x1="${f2(cx - 0.74 * s)}" y1="${f2(yy)}" x2="${f2(cx - 0.50 * s)}" y2="${f2(yy - 0.06 * s)}" stroke="#D8B879" stroke-width="${f3(INK2 * 1.1)}" opacity="0.95"/>`)
    o.push(`<line x1="${f2(cx - 0.62 * s)}" y1="${f2(yy - 0.10 * s)}" x2="${f2(cx - 0.62 * s)}" y2="${f2(yy + 0.06 * s)}" stroke="#D8B879" stroke-width="${f3(INK2)}" opacity="0.8"/>`)
  }
  return o
}

/**
 * 污染之地：一块灰败的地，几棵枯树，几道从心里裂开的缝。冷光晕。
 *
 * 亡灵那座冰原岛上。光晕换成冷的——同一张图上两种光晕，读的人不用被告知
 * 也知道这块地跟别处不一样。
 */
export function blightland(cx, cy, s) {
  const o = wonder_mark(cx, cy, 1.85 * s, true)
  o.push(`<path d="${pd(blob(cx, cy, 1.18 * s, 880, 13, 0.76))}" fill="${BLIGHT}" opacity="0.66" stroke="${COAST}" stroke-width="${f3(INK2)}"/>`)
  for (let k = 0; k < 6; k++) {
    const a = 2 * Math.PI * k / 6 + 0.3
    const pts = [[cx, cy]]
    for (const j of [0.34, 0.64, 0.94]) {
      const aa = a + (j !== 0.64 ? 0.22 : -0.24)
      pts.push([cx + Math.cos(aa) * j * 1.12 * s, cy + Math.sin(aa) * j * 0.86 * s])
    }
    o.push(`<path d="${pd(pts, false)}" fill="none" stroke="${COAST}" stroke-width="${f3(INK2 * 0.9)}" stroke-linecap="round" opacity="0.7"/>`)
  }
  const dead = [[-0.72, -0.28, 0.52], [0.30, -0.52, 0.62],
    [0.78, 0.24, 0.44], [-0.30, 0.44, 0.40]]
  for (const [dx, dy, ts] of dead) {
    const bx = cx + dx * s
    const by = cy + dy * s
    o.push(`<line x1="${f2(bx)}" y1="${f2(by)}" x2="${f2(bx + 0.03 * s)}" y2="${f2(by - ts * s)}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linecap="round"/>`)
    const branches = [-2.5, -0.9, -0.3]
    for (let j = 0; j < branches.length; j++) {
      const ba = branches[j]
      const hx = bx + 0.03 * s
      const hy = by - ts * s * (0.62 + j * 0.16)
      o.push(`<line x1="${f2(hx)}" y1="${f2(hy)}" x2="${f2(hx + Math.cos(ba) * ts * 0.44 * s)}" y2="${f2(hy + Math.sin(ba) * ts * 0.44 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.85)}" stroke-linecap="round" opacity="0.85"/>`)
    }
  }
  const rnd = new Random(991)
  for (let k = 0; k < 9; k++) {
    const a = rnd.uniform(0, 2 * Math.PI)
    const rr = 1.02 * s * Math.sqrt(rnd.random())
    o.push(`<circle cx="${f2(cx + Math.cos(a) * rr)}" cy="${f2(cy + Math.sin(a) * rr * 0.76)}" r="${f3(rnd.uniform(0.05, 0.09) * s)}" fill="#CFC9C0" opacity="0.5"/>`)
  }
  return o
}

export const WONDER_FN = { tree: worldtree, isle: floatisle, tower: archtower,
  bones: dragonbones, crystal: crystalvein,
  rune: runestones, blight: blightland }

// 自查用：每个奇观相对锚点的半宽/半高（单位＝s 的倍数）＋中文名 ＋该在陆地还是海上。
//
// 这张表量的是**画上去的东西**（骨架、塔身、树冠），不含那圈淡光晕：光晕是 44% 的
// 径向渐变，压在别人底下也不碍读字，可它的外接矩形比实物大一圈。2026-10-31（t24）
// 把龙骸这一项从 [2.42, 1.56] 收到 [2.05, 1.10]：旧值量的是光晕（半径 2.35s 那个圆），
// 于是矩形右下角把龙骨城的都城旗圈了进去，自查报「龙骨城 × 奇观·龙骸」一处——
// 其实旗子站在光晕外头的沙地上，两者没碰着。骨架本身没变。
export const WONDER_BOX = { tree: [1.62, 2.32], isle: [1.28, 2.34], tower: [0.78, 2.10],
  bones: [2.05, 1.10], crystal: [1.28, 1.06], rune: [1.28, 1.36],
  blight: [1.32, 1.08] }
export const WONDER_CN = { tree: '世界之树', isle: '浮岛', tower: '大法师塔',
  bones: '龙骸', crystal: '水晶脉', rune: '符文石',
  blight: '污染之地' }
export const WONDER_SEA = new Set(['isle'])

export const WILD_CN = { ruin: '乱石岗', frost: '霜原', mine: '地下矿洞',
  quench: '河湾', tower: '废塔', watch: '夜哨' }

// 自查用：每个野地记号相对锚点的半宽/半高（世界单位，s = 1）
export const WILD_BOX = { ruin: [1.02, 0.62], frost: [0.96, 0.54], mine: [0.86, 0.70],
  quench: [1.08, 0.58], tower: [0.66, 0.96], watch: [0.60, 0.92] }

/**
 * 六个野地的记号（2026-10-30 地图审计 M-5）。
 *
 * 从前这六个地方只在**面板**上有一枚钉子，世界图上什么都没有：乱石岗、霜原、
 * 地下矿洞、河湾、废塔、夜哨——名字在句子里天天出现，图上找不到在哪儿。
 * 六枚记号各画各的，不是同一个点换个颜色：
 *
 *   ruin   三块歪着的碎石          frost  三道冻裂 + 一点冰凌
 *   mine   拱形洞口（里面是黑的）  quench 一弯水 + 两丛芦苇
 *   tower  断成半截的塔身          watch  一根旗杆 + 一盏灯
 *
 * 全都用图上的墨色与石色，尺寸压在 1 单位上下——它们是地标，不是奇观。
 */
export function wildMark(kind, cx, cy, s = 1.0) {
  const o = []
  if (kind === 'ruin') {
    const stones = [[-0.52, 0.10, 0.46, 0.34, -0.14], [0.10, 0.06, 0.40, 0.52, 0.09],
      [0.62, 0.14, 0.30, 0.28, 0.18]]
    for (const [bx, by, w, h, tilt] of stones) {
      const px = cx + bx * s
      const py = cy + by * s
      const tx = px + Math.sin(tilt) * h * s
      const ty = py - Math.cos(tilt) * h * s
      o.push(`<path d="${pd([[px - w / 2 * s, py], [px + w / 2 * s, py], [tx + w * 0.34 * s, ty], [tx - w * 0.30 * s, ty]])}" fill="${STONE_LO}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.95)}" stroke-linejoin="round"/>`)
    }
    return o
  }
  if (kind === 'frost') {
    for (let k = 0; k < 3; k++) {
      const px = cx + (k - 1) * 0.44 * s
      const py = cy + (k === 1 ? -0.10 : 0.06) * s
      o.push(`<path d="${pd([[px - 0.26 * s, py], [px, py - 0.26 * s], [px + 0.26 * s, py], [px, py + 0.24 * s], [px - 0.26 * s, py]])}" fill="none" stroke="#8FA9B4" stroke-width="${f3(INK2 * 0.9)}" stroke-linejoin="round" opacity="0.85"/>`)
    }
    o.push(`<circle cx="${f2(cx + 0.10 * s)}" cy="${f2(cy - 0.34 * s)}" r="${f3(0.07 * s)}" fill="#E3EAEB" opacity="0.9"/>`)
    return o
  }
  if (kind === 'mine') {
    o.push(`<path d="${pd([[cx - 0.78 * s, cy + 0.54 * s], [cx - 0.78 * s, cy - 0.10 * s], [cx - 0.30 * s, cy - 0.54 * s], [cx + 0.30 * s, cy - 0.54 * s], [cx + 0.78 * s, cy - 0.10 * s], [cx + 0.78 * s, cy + 0.54 * s]])}" fill="#6E6557" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
    o.push(`<path d="${pd([[cx - 0.42 * s, cy + 0.52 * s], [cx - 0.42 * s, cy - 0.04 * s], [cx, cy - 0.34 * s], [cx + 0.42 * s, cy - 0.04 * s], [cx + 0.42 * s, cy + 0.52 * s]])}" fill="#221B14"/>`)
    return o
  }
  if (kind === 'quench') {
    o.push(`<path d="${pd([[cx - 0.96 * s, cy + 0.16 * s], [cx - 0.30 * s, cy + 0.44 * s], [cx + 0.50 * s, cy + 0.40 * s], [cx + 0.98 * s, cy + 0.10 * s]], false)}" fill="none" stroke="${SEA_LO}" stroke-width="${f3(0.30 * s)}" stroke-linecap="round" opacity="0.9"/>`)
    for (const [bx, hgt] of [[-0.30, 0.42], [0.26, 0.34]]) {
      const px = cx + bx * s
      const py = cy + 0.30 * s
      o.push(`<line x1="${f2(px)}" y1="${f2(py)}" x2="${f2(px + 0.04 * s)}" y2="${f2(py - hgt * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" stroke-linecap="round"/>`)
      o.push(`<line x1="${f2(px + 0.04 * s)}" y1="${f2(py - hgt * s * 0.7)}" x2="${f2(px + 0.20 * s)}" y2="${f2(py - hgt * s * 0.95)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}" stroke-linecap="round"/>`)
    }
    return o
  }
  if (kind === 'tower') {
    o.push(`<path d="${pd([[cx - 0.50 * s, cy + 0.80 * s], [cx - 0.40 * s, cy - 0.30 * s], [cx - 0.12 * s, cy - 0.88 * s], [cx + 0.22 * s, cy - 0.52 * s], [cx + 0.40 * s, cy + 0.80 * s]])}" fill="${STONE}" stroke="${COAST}" stroke-width="${f3(INK2 * 1.05)}" stroke-linejoin="round"/>`)
    o.push(`<line x1="${f2(cx - 0.30 * s)}" y1="${f2(cy + 0.20 * s)}" x2="${f2(cx + 0.30 * s)}" y2="${f2(cy + 0.14 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}" opacity="0.6"/>`)
    return o
  }
  // watch：旗杆 + 灯
  o.push(`<line x1="${f2(cx - 0.10 * s)}" y1="${f2(cy + 0.80 * s)}" x2="${f2(cx - 0.10 * s)}" y2="${f2(cy - 0.72 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 1.1)}" stroke-linecap="round"/>`)
  o.push(`<path d="${pd([[cx - 0.10 * s, cy - 0.72 * s], [cx + 0.46 * s, cy - 0.44 * s], [cx - 0.10 * s, cy - 0.16 * s]])}" fill="${RIVER_IN}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.85)}" stroke-linejoin="round"/>`)
  o.push(`<circle cx="${f2(cx - 0.10 * s)}" cy="${f2(cy + 0.62 * s)}" r="${f3(0.14 * s)}" fill="#E0B26A" opacity="0.92"/>`)
  return o
}

/** 六个野地的记号与它们的包围盒（世界包说「哪儿有野地」，记号由这张图画）。 */
export function wildBoxes() {
  const out = []
  for (const key of Object.keys(WORLD_PLACES)) {
    const place = WORLD_PLACES[key]
    if (!place || !place.wild) continue
    const [hw, hh] = WILD_BOX[place.id] || [0.9, 0.7]
    const name = (place.name && (place.name.adventure || Object.values(place.name)[0])) || WILD_CN[place.id] || key
    out.push([name, place.x, place.y, [place.x - hw, place.y - hh, place.x + hw, place.y + hh]])
  }
  return out
}

export function wilds() {
  const o = []
  for (const key of Object.keys(WORLD_PLACES)) {
    const place = WORLD_PLACES[key]
    if (!place || !place.wild) continue
    // 一处一个 `<g>`，类名带着两件事：这是野地记号、它是哪一处（自检与冒烟按这个认）。
    o.push(`<g class="gf-wild gf-wild-${place.id}">${wildMark(place.id, place.x, place.y, 1.0).join('')}</g>`)
  }
  return o
}

export function wonders() {
  const o = []
  for (const [kind, x, y, s] of WONDERS) {
    o.push(...WONDER_FN[kind](x, y, s))
  }
  return o
}

/** 草地纹理：一块 6×6 世界单位的图案，平铺在陆地底色上。
 *
 *  为什么用图案而不是「在陆地上随机撒草」：照直撒要三千多根 <line>、四十多万字
 *  ——比整张世界图还大，而且拖动时每帧重栅格化。图案只有一万多字节，元素不增加。
 *
 *  底那一块必须自己带上：pattern 没有背景色，只画草的话陆地就是透明的，底下那层
 *  海会透上来（「草地颜色和海一样」就是这么来的）。
 */
/** 一块陆地铺的底色：世界包说了算（M-9），没说就用草地色。 */
export function landTone(key) {
  const song = mapLands && mapLands[key]
  return (song && song.base) || BIOME_COLOR['grass']
}

export function grassPattern(size = 6.0, n = 36, seed = 31337, base = null, id = 'grasstex') {
  const rnd = new Random(seed)
  const o = [`<rect width="${f2(size)}" height="${f2(size)}" fill="${base || BIOME_COLOR['grass']}"/>`]
  for (let k = 0; k < n; k++) {
    const x = rnd.uniform(0.25, size - 0.25)
    // 纵向留够：一根草最高 0.30，落在 0.35 以下就会被图案的边切掉，平铺起来是一道缝
    const y = rnd.uniform(0.35, size - 0.25)
    for (let j = 0; j < 3; j++) {
      const bx = x + (j - 1) * 0.14
      o.push(`<line x1="${f3(bx)}" y1="${f3(y)}" x2="${f3(bx + rnd.uniform(-0.08, 0.08))}" y2="${f3(y - rnd.uniform(0.16, 0.30))}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" stroke-linecap="round" opacity="0.32"/>`)
    }
  }
  return `<pattern id="${id}" width="${f2(size)}" height="${f2(size)}" patternUnits="userSpaceOnUse">${o.join('')}</pattern>`
}

/** 草地上的深浅斑：几块很淡的色块，让大片绿地不是一块平色。
 *  压在生物群系底下（见 build），所以只会给草地添层次，不会染到林子、荒漠、雪原。 */
export function grassTints(count = 9, seed = 707) {
  const rnd = new Random(seed)
  const o = []
  let made = 0
  let tries = 0
  const rings = Object.values(LANDS).flat()
  while (made < count && tries < count * 40) {
    tries += 1
    const x = rnd.uniform(2, W - 2)
    const y = rnd.uniform(3, H - 3)
    const r = rnd.uniform(2.2, 4.4)
    const onLand = (px, py) => rings.some((ring) => hit(ring, px, py))
    if (!onLand(x, y) || !onLand(x + r, y) || !onLand(x - r, y) || !onLand(x, y + r) || !onLand(x, y - r)) continue
    made += 1
    o.push(`<path d="${pd(wob([[x - r, y], [x, y - r * 0.8], [x + r, y], [x, y + r * 0.8]], 0.5, seed + made * 17, 6))}" fill="#9FB46A" opacity="0.13"/>`)
  }
  return o
}

export function build() {
  const o = []
  o.push('<defs>')
  o.push(WONDER_HALO)
  o.push(WONDER_COLD)
  // 生物群系的边不要是一条硬边。模糊一点，交界就像慢慢过渡的——
  // 而且 clip-path 在 filter 之后生效，海岸线照样是利的。
  o.push('<filter id="soft" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="0.11"/></filter>')
  // 草地不是一块平色：底色换成一块平铺的草纹图案。四块陆地各一张（M-9）：
  // 同一张草纹铺满全图的话，冻土、旱地、岛屿跟西岸草原一个颜色。
  const landKeys = Object.keys(LANDS)
  for (const key of landKeys) {
    o.push(grassPattern(6.0, 36, 31337, landTone(key), 'grasstex-' + key))
  }
  const peaks = []
  for (const [name, line, cnt, sc] of RIDGES) {
    for (let k = 0; k < cnt; k++) {
      const t = k / Math.max(1, cnt - 1)
      const seg = t * (line.length - 1)
      const i = Math.min(line.length - 2, Math.trunc(seg))
      const p = lerp(line[i], line[i + 1], seg - i)
      peaks.push([p[0], p[1], sc * (0.86 + 0.24 * ((k * 7) % 3)), 900 + peaks.length * 17])
    }
  }
  for (const [x, y, s] of PEAKS) {
    peaks.push([x, y, s, 900 + peaks.length * 17])
  }

  const land_d = []
  const land_groups = []
  const coast_paths = []
  let si = 0
  for (const rings of Object.values(LANDS)) {
    let ri = 0
    // 每块陆地自己一撮：填色时按块取图案（M-9）
    const group = []
    for (const ring of rings) {
      const d = wob(ring, 0.13, 11 + si * 31 + ri * 7, 4)
      coast_paths.push(d)
      land_d.push(pd(d))
      group.push(pd(d))
      ri += 1
    }
    land_groups.push(group)
    si += 1
  }
  o.push(`<clipPath id="land"><path d="${land_d.join(' ')}"/></clipPath>`)
  const pk = []
  for (let idx = 0; idx < peaks.length; idx++) {
    const [x, y, s, sd] = peaks[idx]
    pk.push(...peak(x, y, s, sd, idx))
  }
  o.push('</defs>')

  o.push(`<rect x="0" y="0" width="${f2(W)}" height="${f2(H)}" fill="${SEA}"/>`)
  const rnd = new Random(7)
  let gx = 0.0
  while (gx < W) {
    let gy = 0.0
    while (gy < H) {
      const x = gx + rnd.uniform(-0.35, 0.35)
      const y = gy + rnd.uniform(-0.35, 0.35)
      let onLand = false
      for (const rings of Object.values(LANDS)) {
        for (const r of rings) {
          if (hit(r, x, y)) {
            onLand = true
            break
          }
        }
        if (onLand) break
      }
      if (!onLand) {
        const w = rnd.uniform(0.42, 0.78)
        o.push(`<line class="mw" x1="${f2(x - w / 2)}" y1="${f2(y)}" x2="${f2(x + w / 2)}" y2="${f2(y)}"/>`)
      }
      gy += 1.7
    }
    gx += 2.1
  }

  // 浅滩光晕：把岸线用海色描粗，再填陆地，剩下一圈浅色
  for (const d of coast_paths) {
    o.push(`<path d="${pd(d)}" fill="none" stroke="${SEA_LO}" stroke-width="1.35" stroke-linejoin="round"/>`)
  }
  for (let li = 0; li < land_groups.length; li++) {
    const key = landKeys[li]
    for (const d of land_groups[li]) {
      o.push(`<path d="${d}" fill="url(#grasstex-${key})"/>`)
    }
  }
  // 草地的深浅斑：压在生物群系底下，只给草地添层次
  o.push('<g clip-path="url(#land)">')
  o.push(...grassTints())
  o.push('</g>')
  // 生物群系
  for (const [name, poly] of BIOMES) {
    o.push(`<path d="${pd(organic(poly, 0.42, 0.16, 300 + nlen(name) * 7 + Math.trunc(poly[0][0] * 10), 11))}" fill="${BIOME_COLOR[name]}" clip-path="url(#land)" filter="url(#soft)"/>`)
  }
  // 地貌上的笔触：缩到 1× 基本看不见，放大才成纹
  o.push('<g clip-path="url(#land)">')
  for (const [name, poly] of BIOMES) {
    const cnt = { grass: 0, tundra: 260, rock: 460, swamp: 130, desert: 0,
      ice: 0, forest: 0, jungle: 0, volcanic: 90 }[name]
    if (cnt) {
      o.push(...marks(poly, 900 + Math.trunc(poly[0][0] * 13) + nlen(name), cnt, name))
    }
  }
  o.push('</g>')
  // 海岸墨线
  for (const d of coast_paths) {
    o.push(`<path d="${pd(d)}" fill="none" stroke="${COAST}" stroke-width="${f3(INK)}" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  // 岸外短须：只在朝海那一侧
  si = 0
  for (const rings of Object.values(LANDS)) {
    let ri = 0
    for (const ring of rings) {
      const line = wob(ring, 0.13, 11 + si * 31 + ri * 7, 4)
      const m = line.length
      const step = Math.max(1, Math.floor(m / 34))
      for (let i = 0; i < m; i += step) {
        const x = line[i][0]
        const y = line[i][1]
        const a = line[((i - 1) % m + m) % m]
        const b = line[(i + 1) % m]
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const L = hypot(dx, dy) || 1e-9
        let ux = -dy / L
        let uy = dx / L
        if (rings.some((r) => hit(r, x + ux * 0.5, y + uy * 0.5))) {
          ux = -ux
          uy = -uy
        }
        const ln = 0.30 + 0.32 * ((i * 13) % 7) / 7.0
        o.push(`<line x1="${f2(x + ux * 0.22)}" y1="${f2(y + uy * 0.22)}" x2="${f2(x + ux * (0.22 + ln))}" y2="${f2(y + uy * (0.22 + ln))}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.6"/>`)
      }
      ri += 1
    }
    si += 1
  }

  // 河
  for (const [name, pts, w0, w1] of RIVERS) {
    const line = meander(pts, 0.15, 700 + nlen(name), 9)
    const band = ribbon(line, w0 + 0.30, w1 + 0.30, 700 + nlen(name), 3)
    const core = ribbon(line, w0 * 0.42, w1 * 0.42, 800 + nlen(name), 3)
    o.push(`<path d="${pd(band)}" fill="${RIVER}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
    o.push(`<path d="${pd(core)}" fill="${RIVER_IN}" fill-opacity="0.85"/>`)
  }
  // 湖
  for (let i = 0; i < LAKES.length; i++) {
    const [x, y, r] = LAKES[i]
    o.push(`<path d="${pd(blob(x, y, r, 400 + i * 9, 10))}" fill="${RIVER}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
  }

  // 细部：沙丘、冰裂、沼泽
  for (const [name, poly] of BIOMES) {
    if (name === 'desert') {
      o.push(...dunes(poly, 500 + Math.trunc(poly[0][0] * 7), 24))
    } else if (name === 'ice') {
      o.push(...cracks(poly, 600 + Math.trunc(poly[0][0] * 7), 18))
    } else if (name === 'swamp') {
      o.push(...marsh(poly, 650 + Math.trunc(poly[0][0] * 7), 14))
    }
  }

  // 山
  o.push(...pk)
  // 林
  for (let i = 0; i < FORESTS.length; i++) {
    const [name, cx, cy, r, cnt] = FORESTS[i]
    o.push(...forest(cx, cy, r, Math.trunc(cnt * 1.6), 200 + i * 23))
  }
  // 世界奇观：压在地貌之上、地名与国名之下
  o.push(...wonders())
  // 六个野地的记号（M-5）：跟奇观同一层——它们也是「图上有那么个地方」
  o.push(...wilds())
  // 地名
  o.push(...labels())
  // 国家那一层：首都记号 + 徽记 + 一级国名（没有国界、没有色块）
  const allMode = typeof process !== 'undefined' && process.argv && process.argv.includes('--all')
  o.push(...nations(allMode ? 'all' : 'tier1'))
  // 夜罩压在**地图这一层**的最上面：记号、地名签、夜里那盏灯都叠在它上面，照样亮。
  o.push(night())
  // 罗盘画在夜罩**之后**（2026-10-08 用户报的 bug）。原来它压在夜罩底下，天黑了
  // 就跟着整张图一起暗下去——他离罗盘十几格远时那圈光池照不到，罗盘就彻底没了。
  // 罗盘是这张图的装饰，跟面板那边的记号、地名签、灯一样，不该被「提灯照地」抹掉。
  // 2026-10-08 当天他又报「毫无用处、也不像指南针、位置奇怪」⇒ 画成磁针式、挪到**右下角**
  // （东南那片海上，整枚落在图里）、半径放大一档 1.55 → 2.0。
  o.push(...compass(62.0, 30.6, 2.0))
  return o.join('\n')
}

// 地图这一层的样式。**全部挂在 .gf-map 底下**（自检盯这条：漏出来的选择器会污染面板）。
//
// 新地图每一笔的颜色与线宽都写在元素自己的属性上——它是一段画好的死数据，不跟着
// 主题变量走色（见 client.js 里 buildMap 那段说明）。
//
// 下面第一条是**夜罩**：读面板那套 --gf-* 变量，颜色与系数跟 dimForDusk 同一套、同一个 0.55。
//
// 再往下几条不是「样式」，是**省体积**：海面波纹与地貌笔触加起来四千多条，每条都把
// 颜色、线宽、透明度写在自己身上——光这一项就占掉整张图一半的体积（676 KB → 390 KB）。
// 挪进 CSS 之后每条只剩坐标。它们是**成批的、参数完全一样**的笔画，正是该进 CSS 的东西；
// 山体、城镇、国名那些一笔一划不一样的，仍然写在属性上。
//
// 注意：这一整段是**拼出来**的，不要写成模板串——CSS 里一个反引号就会把代码截断。
export const MAP_CSS =
  '.gf-map{display:block}' +
  '.gf-map .mnight{fill:var(--gf-dusk-color,#140D07);' +
  'opacity:calc(var(--gf-dusk,0) * 0.60);pointer-events:none}' +
  '.gf-map .mw{stroke:' + SEA_DASH + ';stroke-width:0.10;stroke-linecap:round;opacity:0.5}' +
  '.gf-map .mh{stroke:' + COAST + ';stroke-width:' + f3(INK2) + ';opacity:0.7}' +
  '.gf-map .mh2{stroke:' + COAST + ';stroke-width:' + f3(INK2) + ';opacity:0.45}' +
  '.gf-map .mg1{stroke:' + COAST + ';stroke-width:' + f3(INK2 * 0.8) + ';stroke-linecap:round;opacity:0.32}' +
  '.gf-map .mg2{stroke:' + COAST + ';stroke-width:' + f3(INK2 * 0.8) + ';stroke-linecap:round;opacity:0.28}' +
  '.gf-map .mg3{stroke:' + COAST + ';stroke-width:' + f3(INK2) + ';stroke-linecap:round;opacity:0.45}' +
  '.gf-map .md{fill:' + COAST + ';opacity:0.30}'

/**
 * 世界图的正文本体，**算一次就够**。
 *
 * 从前这是 `src/map-data.js` 里一整条内联字符串（545 KB），由 `.scratch/terrain.py --ship`
 * 预先写好。现在改成**运行时现画**——因为地方图那二十张加起来 14 MB，塞不进产物；
 * 而世界图与地方图用的是同一套 `world3` 数据（约 15 KB），现画反而更小。
 *
 * 实测 `build()` 约 70 ms（Python 那边连解释器启动要 985 ms），而 `applyPack` 每次调用
 * 都会读一遍 `geo.map.svg`，所以这里必须记住结果——否则每切一次世界就重画一次。
 *
 * 这个函数是**纯的**（`build()` 两次跑逐字节相同，也不改 `world3.js` 的数据），
 * 所以缓存不会让它跟谁不同步。
 */
let _svg = null
export function mapSvg() {
  if (_svg === null) _svg = build()
  return _svg
}
