/*
 * 世界图 / 地方图共用的底层图元。
 *
 * 这一层是 `.scratch/terrain.py` 第 25~145 行（`hit` / `pd` / `wob` / `organic` /
 * `meander` / `blob` / `ribbon` / `lerp`）与 `.scratch/geo.py` 的 `inside` 的直译。
 * 之所以要一字不差地照搬：验证手段是「JS 画出来的 SVG 跟 Python 画出来的逐字节相同」，
 * 任何一个抖动或取整差一点，整张图的岸线就全错位。
 *
 * 本文件导出 `f2`（Python 的 `'{:.2f}'.format`）与那一组图元。
 */
import { Random } from './rng.js'

/**
 * Python `'{:.2f}'.format(x)`。
 *
 * 不能用 `toFixed`：JS 的 `toFixed` 在「恰好一半」时进位（`(0.125).toFixed(2)` 是
 * `"0.13"`），Python 是「四舍六入五成双」（`'{:.2f}'.format(0.125)` 是 `'0.12'`）。
 * 这里的做法是先取 40 位小数的十进制展开（`toFixed(40)` 对 double 是精确的），
 * 再在**字符串**上做一次半偶取整——既躲开二进制误差，也躲开 JS 的进位规矩。
 *
 * **记忆化（2026-10-06）**：一扇地方图里有约 **67,000 个**坐标要过这儿，而
 * `toFixed(40)` 一次要 **0.83 µs**——实测一扇图 110 ms 里有 **74 ms** 就花在这一句上
 * （量法见 `.scratch/bench-lens.mjs` / `.scratch/bench-f2.mjs`），鼠标每走四五十像素
 * 换一扇窗，主线程就顿一下，面板上就是「卡卡的」。
 *
 * `f2` 是纯函数，缓存一个字节都不会变。**`-0` 与 `0` 的结果不一样**（`-0.00` / `0.00`），
 * 而 `Map` 的键按 SameValueZero 把这两个当成同一个，所以零单独走一条路、不进缓存。
 */
const F2_CACHE_MAX = 1 << 18
const f2Cache = new Map()

export function f2(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x)
  if (x === 0) return Object.is(x, -0) ? '-0.00' : '0.00'
  const hit = f2Cache.get(x)
  if (hit !== undefined) return hit
  const out = f2Slow(x)
  // 满了就整个倒掉：攒到几十兆不值得，重新攒起来也就一扇图的功夫。
  if (f2Cache.size >= F2_CACHE_MAX) f2Cache.clear()
  f2Cache.set(x, out)
  return out
}

/** 真正算的那一支。`0` 与 `-0` 已经在上面分掉了，所以这里 `x < 0` 就够。 */
function f2Slow(x) {
  const neg = x < 0
  const s = Math.abs(x).toFixed(40)
  const dot = s.indexOf('.')
  const intPart = s.slice(0, dot)
  const frac = s.slice(dot + 1)
  const keep = frac.slice(0, 2)
  const rest = frac.slice(2)
  const first = rest.charCodeAt(0) - 48
  let up = false
  if (first > 5) {
    up = true
  } else if (first === 5) {
    // 五后面还有东西就是真的比一半大；干干净净的一半才看奇偶
    up = /[1-9]/.test(rest.slice(1)) ? true : Number(keep) % 2 !== 0
  }
  let n = Number(intPart) * 100 + Number(keep)
  if (up) n += 1
  const body = Math.floor(n / 100) + '.' + String(n % 100).padStart(2, '0')
  return neg ? '-' + body : body
}

/** 一个坐标对按 Python 那样写成两位小数。 */
export function p2(p) {
  return f2(p[0]) + ' ' + f2(p[1])
}

/* ── 与 Python `math.hypot` 逐位相同的开方 ─────────────────────────────
 *
 * `Math.hypot` 跟 Python 对不上（391 个样本里差 107 个），而 `wob` / `organic` /
 * `meander` / `ribbon` 全靠它把线段法线归一化，差 1 ulp 整张图的岸线就会错位。
 * 实测 Python 的 `math.hypot` 是**正确取整**的（用 80 位十进制对表，0 处不一致），
 * 所以这里也用正确取整的办法：把 x²+y² 算成「一个双精度数 + 一个补正项」，
 * 开方后补一记牛顿修正，最后只四舍五入一次。
 *
 * **不能缩放**（`sqrt(xs²+ys²)*m`）——最后那次乘法就会丢掉半个 ulp，
 * 那正是 `Math.hypot` 与「缩放版」都错在同一批样本上的原因。
 */
const SPLITTER = 134217729 // 2^27 + 1

function split(a) {
  const c = SPLITTER * a
  const hi = c - (c - a)
  return [hi, a - hi]
}

/** 两个 double 的精确乘积：`a*b === hi + lo`。 */
function twoProduct(a, b) {
  const p = a * b
  const [ah, al] = split(a)
  const [bh, bl] = split(b)
  return [p, ah * bh - p + ah * bl + al * bh + al * bl]
}

/** 两个 double 的精确和：`a+b === hi + lo`。 */
function twoSum(a, b) {
  const s = a + b
  const bb = s - a
  return [s, a - (s - bb) + (b - bb)]
}

/** 与 CPython `math.hypot(x, y)` 逐位相同。 */
export function hypot(x, y) {
  const a = Math.abs(x)
  const b = Math.abs(y)
  if (a === 0 && b === 0) return 0
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  // x*x 会溢出／下溢的话先缩一下，补正项同比例缩，结论不变
  const m = a > b ? a : b
  let k = 1
  if (m > 1e150) k = 2 ** -600
  else if (m < 1e-150) k = 2 ** 600
  const X = x * k
  const Y = y * k
  const p1 = twoProduct(X, X)
  const p2 = twoProduct(Y, Y)
  const s = twoSum(p1[0], p2[0])
  const tail = s[1] + p1[1] + p2[1]
  const r = Math.sqrt(s[0])
  if (r === 0) return 0
  const rr = twoProduct(r, r)
  const resid = s[0] - rr[0] - rr[1] + tail
  return (r + resid / (2 * r)) / k
}

/** `math.hypot(dx, dy) or 1e-9`——Python 那边就是这么写的。 */
function len(dx, dy) {
  return hypot(dx, dy) || 1e-9
}

/** 点列 → `path` 的 `d`。 */
export function pd(pts, close = true) {
  let s = 'M' + p2(pts[0])
  for (let i = 1; i < pts.length; i++) s += 'L' + p2(pts[i])
  return s + (close ? 'Z' : '')
}

/** 射线法：点在不在多边形里。`geo.py` 的 `inside` 的单点版。 */
export function hit(poly, x, y) {
  let out = false
  let j = poly.length - 1
  for (let i = 0; i < poly.length; i++) {
    const dy = poly[j][1] - poly[i][1]
    if (Math.abs(dy) < 1e-12) {
      j = i
      continue
    }
    const cond = poly[i][1] > y !== poly[j][1] > y
    const xint = ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / dy + poly[i][0]
    if (cond && x < xint) out = !out
    j = i
  }
  return out
}

/** 把一圈点打碎再沿法线抖一点——手画的岸线不会是一段段直线。 */
export function wob(pts, amp = 0.12, seed = 0, n = 4, closed = true) {
  const rnd = new Random(seed)
  let src = pts.slice()
  if (closed) src = src.concat([src[0]])
  const out = []
  for (let i = 0; i < src.length - 1; i++) {
    const ax = src[i][0]
    const ay = src[i][1]
    const dx = src[i + 1][0] - ax
    const dy = src[i + 1][1] - ay
    const L = len(dx, dy)
    const ux = -dy / L
    const uy = dx / L
    for (let k = 0; k < n; k++) {
      const t = k / n
      const d = rnd.uniform(-amp, amp)
      out.push([ax + dx * t + ux * d, ay + dy * t + uy * d])
    }
  }
  return out
}

/** 生物群系的边界：一记低频的鼓包 + 一层高频的手抖。 */
export function organic(pts, amp = 0.3, bend = 0.11, seed = 0, n = 9) {
  const rnd = new Random(seed)
  const out = []
  const m = pts.length
  for (let i = 0; i < m; i++) {
    const ax = pts[i][0]
    const ay = pts[i][1]
    const bx = pts[(i + 1) % m][0]
    const by = pts[(i + 1) % m][1]
    const dx = bx - ax
    const dy = by - ay
    const L = len(dx, dy)
    const ux = -dy / L
    const uy = dx / L
    const ph = rnd.uniform(0, 6.28)
    for (let k = 0; k < n; k++) {
      const t = k / n
      const s = bend * L * Math.sin(t * Math.PI * 1.6 + ph) + rnd.uniform(-amp, amp)
      out.push([ax + dx * t + ux * s, ay + dy * t + uy * s])
    }
  }
  return out
}

/** 把折线加密并加上蜿蜒。河不会走直线。 */
export function meander(pts, amp = 0.16, seed = 0, n = 9) {
  const rnd = new Random(seed)
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0]
    const ay = pts[i][1]
    const dx = pts[i + 1][0] - ax
    const dy = pts[i + 1][1] - ay
    const L = len(dx, dy)
    const ux = -dy / L
    const uy = dx / L
    const ph = rnd.uniform(0, 6.28)
    for (let k = 0; k < n; k++) {
      const t = k / n
      const s = amp * L * Math.sin(t * Math.PI * 2.1 + ph) * Math.sin(t * Math.PI)
      out.push([ax + dx * t + ux * s, ay + dy * t + uy * s])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** 一团不规则的圆——湖、水塘都用它。 */
export function blob(cx, cy, r, seed, n = 9, ry = 1.0) {
  const rnd = new Random(seed)
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const rr = r * (1 + rnd.uniform(-0.28, 0.28))
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * ry])
  }
  return out
}

/** 一条宽度渐变的带子——河不能只描一条线，得是有宽度的面。 */
export function ribbon(pts, w0, w1, seed = 0, n = 5) {
  const line = wob(pts, 0.05, seed, n, false)
  const left = []
  const right = []
  const m = line.length
  for (let i = 0; i < m; i++) {
    const t = i / Math.max(1, m - 1)
    const w = (w0 + (w1 - w0) * t) / 2
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(m - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = len(dx, dy)
    const ux = -dy / L
    const uy = dx / L
    left.push([line[i][0] + ux * w, line[i][1] + uy * w])
    right.push([line[i][0] - ux * w, line[i][1] - uy * w])
  }
  return left.concat(right.reverse())
}

/** 线性插值。 */
export function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}
