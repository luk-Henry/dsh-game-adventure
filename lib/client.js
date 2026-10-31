/*
 * dsh-gameflow · 浏览器半边（运行时装）
 *
 * ⚠️ 这个文件是 scripts/build-client.mjs 从 src/client.js 生成的，不要手改。
 * 改 src/client.js，然后跑 `node scripts/build-client.mjs`。
 *
 * 形态说明：DSH 用不带 type="module" 的经典 script 加载客户端 bundle，
 * 所以这里必须是 __ModuleLoader__.load({id, factory}) 包起来的样子，
 * 而不是一个 ES module。
 */
window.__ModuleLoader__.load({
  id: "dsh-gameflow",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

const __mod5 = (() => {
/*
 * 与 Python `random.Random(seed)` 逐位一致的伪随机数。
 *
 * 为什么非要一致：世界图与地方图原来是 `.scratch/terrain.py` / `.scratch/local.py`
 * 用 Python 画出来、再整包内联成 `src/map-data.js` 的（545 KB）。移植成 JS 之后，
 * 验证手段就是「同一份数据、同一个种子，JS 画出来的 SVG 跟 Python 画出来的逐字节相同」。
 * 只要有一个抖动不一样，整张图的岸线就全错位，那条验证也就没用了。
 *
 * 所以这里把 CPython 的两样东西原样搬过来：
 *   · MT19937 本体（`_genrand`）
 *   · CPython 的播种方式——整数种子先拆成小端 32 位字，再走 `init_by_array`
 *     （不是 MT19937 参考实现里那个 `init_genrand(seed)`）
 * 再加上 CPython 在 MT 之上那层：`random()` 取两个 32 位字拼 53 位尾数
 * （`genrand_res53`），`uniform` / `randint` / `randrange` 都从它和
 * `getrandbits` 推出来。
 *
 * 本文件只导出 `Random` 与 `uniform`。
 */

/** MT19937 的状态字数与中间偏移。 */
const N = 624
const M = 397
const MATRIX_A = 0x9908b0df
const UPPER_MASK = 0x80000000
const LOWER_MASK = 0x7fffffff

class Random {
  constructor(seed = 0) {
    this.mt = new Uint32Array(N)
    this.mti = N + 1
    this.seed(seed)
  }

  /** 照 CPython `random_seed` 走：整数取绝对值，拆成小端 32 位字。 */
  seed(n) {
    let v = Math.abs(Math.trunc(n))
    const key = []
    if (v === 0) {
      key.push(0)
    } else {
      while (v > 0) {
        key.push(v >>> 0)
        v = Math.floor(v / 4294967296)
      }
    }
    this._initByArray(key)
    return this
  }

  _initGenrand(s) {
    this.mt[0] = s >>> 0
    for (let i = 1; i < N; i++) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = (Math.imul(1812433253, p) + i) >>> 0
    }
    this.mti = N
  }

  _initByArray(key) {
    this._initGenrand(19650218)
    let i = 1
    let j = 0
    let k = Math.max(N, key.length)
    for (; k; k--) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = ((this.mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0
      i++
      j++
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]
        i = 1
      }
      if (j >= key.length) j = 0
    }
    for (k = N - 1; k; k--) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = ((this.mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0
      i++
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]
        i = 1
      }
    }
    this.mt[0] = 0x80000000
  }

  _genrand() {
    if (this.mti >= N) {
      let kk
      if (this.mti === N + 1) this._initGenrand(5489)
      for (kk = 0; kk < N - M; kk++) {
        const y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK)
        this.mt[kk] = this.mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      for (; kk < N - 1; kk++) {
        const y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK)
        this.mt[kk] = this.mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      const y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK)
      this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      this.mti = 0
    }
    let y = this.mt[this.mti++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** CPython `genrand_res53`：两个 32 位字拼出 53 位尾数。 */
  random() {
    const a = this._genrand() >>> 5
    const b = this._genrand() >>> 6
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0)
  }

  /** CPython `getrandbits(k)`，k 只用到 32 位以内。 */
  getrandbits(k) {
    if (k <= 32) return this._genrand() >>> (32 - k)
    throw new Error('getrandbits 只实现了 32 位以内')
  }

  /** CPython `_randbelow_with_getrandbits`。 */
  _randbelow(n) {
    if (n <= 0) throw new Error('_randbelow 要正数')
    // Python 是 `k = n.bit_length()`；`32 - Math.clz32(n)` 就是它。
    const k = 32 - Math.clz32(n)
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  /** CPython `random.uniform`。 */
  uniform(a, b) {
    return a + (b - a) * this.random()
  }

  /** CPython `random.randrange(start, stop)`。 */
  randrange(start, stop) {
    if (stop === undefined) {
      stop = start
      start = 0
    }
    const width = stop - start
    if (width <= 0) throw new Error('randrange 的空区间')
    return start + this._randbelow(width)
  }

  /** CPython `random.randint`。 */
  randint(a, b) {
    return this.randrange(a, b + 1)
  }
}

function uniform(a, b) {
  return a + (b - a) * Math.random()
}

  return { Random, uniform }
})()

const __mod4 = (() => {
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
const { Random } = __mod5

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

function f2(x) {
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
function p2(p) {
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
function hypot(x, y) {
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
function pd(pts, close = true) {
  let s = 'M' + p2(pts[0])
  for (let i = 1; i < pts.length; i++) s += 'L' + p2(pts[i])
  return s + (close ? 'Z' : '')
}

/** 射线法：点在不在多边形里。`geo.py` 的 `inside` 的单点版。 */
function hit(poly, x, y) {
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
function wob(pts, amp = 0.12, seed = 0, n = 4, closed = true) {
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
function organic(pts, amp = 0.3, bend = 0.11, seed = 0, n = 9) {
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
function meander(pts, amp = 0.16, seed = 0, n = 9) {
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
function blob(cx, cy, r, seed, n = 9, ry = 1.0) {
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
function ribbon(pts, w0, w1, seed = 0, n = 5) {
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
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** 一句话有几个字（按码位算，不是按 UTF-16 单元——中文在 emoji 边界上会差一位）。 */
function nlen(s) {
  return Array.from(String(s)).length
}

/**
 * 一块名牌的矩形：**世界图、地方图、面板那层签，三处共用这一条算式**
 * （2026-10-30 地图审计 M-14）。从前是三套：`local.js` 的 `plate_box`、
 * `world.js` 的 `cityPlateBox`、`client.js` 里手写的一串 `+ 1.5`，改一处另外两处
 * 不知道。同一份输入必须得同一个矩形，断言在 `scripts/smoke.mjs` 里钉着。
 *
 * 参数是**牌子中心** `(x, y)` 与字号 `fs`；高度固定 `1.62fs`，上下边距按
 * 「字心里那 0.95 / 0.67」分，跟老算式逐位对齐（老图不能因为这次合并挪一格）。
 * `pad` 是字与底板左右各留的空；世界图与地方图用 0.5，城名小牌用 0.42。
 *
 * 返回 `[x0, y0, x1, y1]`，**左上右下**。
 */
function plate_rect(x, y, text, fs, pad = 0.5) {
  const w = nlen(text) * fs + pad + fs * 0.5
  const h = fs * 1.62
  return [x - w / 2, y - fs * 0.95, x + w / 2, y - fs * 0.95 + h]
}

/**
 * 牌子里那行字的基线：底板上边往下 `0.95fs`，字心再落 `fs * 0.28`。
 *
 * 2026-10-31（用户报「名字在方框里没居中」）：原来是 `0.42fs`，量出来字身框
 * 上边离板顶 0.371、下边只剩 0.03（字号 1.22）——字整行贴着底板下沿。
 * 两边的空当取中，上移 `0.14fs`。地方图与面板那层签共用这一条，所以一起正过来。
 */
function plate_text_y(y, fs) {
  return y + fs * 0.28
}

/** 两个盒子相交的面积；不相交返回 0。盒子都是 `[x0, y0, x1, y1]`。 */
function box_overlap(a, b) {
  const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  return ox > 0 && oy > 0 ? ox * oy : 0
}

  return { f2, p2, hypot, pd, hit, wob, organic, meander, blob, ribbon, lerp, nlen, plate_rect, plate_text_y, box_overlap }
})()

const __mod6 = (() => {
/*
 * 地理数据——由 `.scratch/world3.py` 导出，不要手改这个文件。
 *
 *     python .scratch/w3-dump.py
 *
 * 世界图与地方图共用这一份：世界图是 66×34 的全景，地方图是同一坐标系上的
 * 一扇 22×11.35 的放大镜。元组在这里都成了数组，下标含义与 Python 那边一致：
 *   NATIONS   (国名, 种族, 哪块陆地, 色, [种子点...], 国名落点, (首都名, x, y, 等级))
 *   BIOMES    (名, 多边形)          RIDGES  (名, 折线, 每段取样数, 尺度)
 *   FORESTS   (名, cx, cy, r, 棵数) RIVERS  (名, 折线, w0, w1)
 *   LABELS    (名, x, y, 'sea'|'land')
 *   WONDERS   (种类, x, y, 尺度)
 */


const W = 66.0

const H = 34.0

const WEST = [
  [0.0, 9.5],
  [2.0, 6.5],
  [5.0, 5.0],
  [7.5, 6.2],
  [9.5, 4.0],
  [12.5, 4.8],
  [15.0, 3.2],
  [17.5, 5.5],
  [16.5, 8.5],
  [19.5, 11.0],
  [21.5, 14.5],
  [20.0, 17.5],
  [23.0, 20.0],
  [22.0, 23.5],
  [24.5, 26.0],
  [22.5, 28.5],
  [19.0, 29.5],
  [16.0, 31.5],
  [12.5, 30.5],
  [9.5, 31.5],
  [6.5, 30.0],
  [4.0, 31.0],
  [1.5, 29.5],
  [0.0, 27.0]
]

const NORTH = [
  [26.0, 5.0],
  [28.5, 2.5],
  [32.0, 0.0],
  [39.0, 0.0],
  [43.0, 2.0],
  [44.0, 4.5],
  [42.0, 6.2],
  [37.0, 5.2],
  [31.0, 6.0],
  [27.5, 5.8]
]

const EAST = [
  [47.0, 7.0],
  [49.5, 4.0],
  [53.0, 3.0],
  [56.5, 4.8],
  [59.0, 3.2],
  [62.5, 4.5],
  [65.0, 3.0],
  [66.0, 6.0],
  [66.0, 15.0],
  [64.0, 18.0],
  [66.0, 21.0],
  [66.0, 25.5],
  [63.0, 27.5],
  [59.0, 26.0],
  [55.5, 27.5],
  [52.0, 25.5],
  [49.0, 23.0],
  [46.5, 19.5],
  [44.8, 16.0],
  [47.5, 13.5],
  [45.2, 10.5]
]

const ISLES = [
  [
    [28.0, 29.5],
    [30.0, 28.8],
    [31.6, 30.0],
    [30.2, 31.6],
    [28.2, 31.0]
  ],
  [
    [33.5, 31.0],
    [35.6, 30.2],
    [37.0, 31.6],
    [35.6, 33.2],
    [33.7, 32.6]
  ],
  [
    [39.5, 28.5],
    [41.5, 28.0],
    [42.5, 29.4],
    [41.0, 30.8],
    [39.3, 30.0]
  ],
  [
    [24.9, 31.2],
    [27.0, 30.6],
    [27.9, 32.0],
    [26.6, 33.2],
    [25.0, 33.2]
  ],
  [
    [37.6, 31.6],
    [39.2, 31.2],
    [39.6, 32.8],
    [37.9, 32.8]
  ],
  [
    [43.5, 31.8],
    [45.2, 31.3],
    [45.8, 33.0],
    [44.0, 33.6]
  ]
]

const LANDS = {
  "west": [
    [
      [0.0, 9.5],
      [2.0, 6.5],
      [5.0, 5.0],
      [7.5, 6.2],
      [9.5, 4.0],
      [12.5, 4.8],
      [15.0, 3.2],
      [17.5, 5.5],
      [16.5, 8.5],
      [19.5, 11.0],
      [21.5, 14.5],
      [20.0, 17.5],
      [23.0, 20.0],
      [22.0, 23.5],
      [24.5, 26.0],
      [22.5, 28.5],
      [19.0, 29.5],
      [16.0, 31.5],
      [12.5, 30.5],
      [9.5, 31.5],
      [6.5, 30.0],
      [4.0, 31.0],
      [1.5, 29.5],
      [0.0, 27.0]
    ]
  ],
  "north": [
    [
      [26.0, 5.0],
      [28.5, 2.5],
      [32.0, 0.0],
      [39.0, 0.0],
      [43.0, 2.0],
      [44.0, 4.5],
      [42.0, 6.2],
      [37.0, 5.2],
      [31.0, 6.0],
      [27.5, 5.8]
    ]
  ],
  "east": [
    [
      [47.0, 7.0],
      [49.5, 4.0],
      [53.0, 3.0],
      [56.5, 4.8],
      [59.0, 3.2],
      [62.5, 4.5],
      [65.0, 3.0],
      [66.0, 6.0],
      [66.0, 15.0],
      [64.0, 18.0],
      [66.0, 21.0],
      [66.0, 25.5],
      [63.0, 27.5],
      [59.0, 26.0],
      [55.5, 27.5],
      [52.0, 25.5],
      [49.0, 23.0],
      [46.5, 19.5],
      [44.8, 16.0],
      [47.5, 13.5],
      [45.2, 10.5]
    ]
  ],
  "isles": [
    [
      [28.0, 29.5],
      [30.0, 28.8],
      [31.6, 30.0],
      [30.2, 31.6],
      [28.2, 31.0]
    ],
    [
      [33.5, 31.0],
      [35.6, 30.2],
      [37.0, 31.6],
      [35.6, 33.2],
      [33.7, 32.6]
    ],
    [
      [39.5, 28.5],
      [41.5, 28.0],
      [42.5, 29.4],
      [41.0, 30.8],
      [39.3, 30.0]
    ],
    [
      [24.9, 31.2],
      [27.0, 30.6],
      [27.9, 32.0],
      [26.6, 33.2],
      [25.0, 33.2]
    ],
    [
      [37.6, 31.6],
      [39.2, 31.2],
      [39.6, 32.8],
      [37.9, 32.8]
    ],
    [
      [43.5, 31.8],
      [45.2, 31.3],
      [45.8, 33.0],
      [44.0, 33.6]
    ]
  ]
}

const RACES = [
  ["人类", "#B7BC86"],
  ["精灵", "#7E9C86"],
  ["矮人", "#A9A093"],
  ["兽人", "#B0A06A"],
  ["树人", "#7C8F5E"],
  ["龙", "#A87E5E"],
  ["鱼人", "#7FA0AE"],
  ["半身人", "#B8BE84"],
  ["巨人", "#BFC3C4"],
  ["亡灵", "#9A93A0"]
]

const NATIONS = [
  [
    "巨人之脊",
    "巨人",
    "west",
    "#BFC3C4",
    [
      [5.5, 7.5],
      [9.0, 6.0],
      [12.0, 7.5]
    ],
    [7.5, 6.8],
    ["石冠城", 6.0, 8.4, 1]
  ],
  [
    "北境霜堡",
    "人类",
    "west",
    "#A8B0B8",
    [
      [14.5, 5.5],
      [15.5, 7.5]
    ],
    [15.0, 5.8],
    ["霜堡", 15.2, 6.9, 2]
  ],
  [
    "银树森林",
    "精灵",
    "west",
    "#7E9C86",
    [
      [13.0, 10.0],
      [15.0, 12.5]
    ],
    [12.5, 9.8],
    ["银树城", 13.6, 11.4, 1]
  ],
  [
    "铁砧山",
    "矮人",
    "west",
    "#A9A093",
    [
      [19.0, 11.0],
      [16.5, 13.5]
    ],
    [19.5, 12.2],
    ["铁砧厅", 18.2, 12.4, 2]
  ],
  [
    "深炉城",
    "矮人",
    "west",
    "#8C8172",
    [
      [20.0, 18.0],
      [22.0, 20.0]
    ],
    [20.5, 18.5],
    ["深炉", 20.6, 19.2, 2]
  ],
  [
    "西岸自由城邦",
    "人类",
    "west",
    "#C6A97A",
    [
      [2.0, 12.0],
      [2.5, 16.0],
      [1.5, 20.0]
    ],
    [4.8, 12.6],
    ["西港", 2.6, 14.4, 1]
  ],
  [
    "河间王国",
    "人类",
    "west",
    "#B7BC86",
    [
      [9.0, 12.0],
      [12.5, 15.0],
      [9.5, 17.5]
    ],
    [10.5, 15.5],
    ["河间城", 10.6, 14.8, 1]
  ],
  [
    "灰港",
    "精灵",
    "west",
    "#93AEB0",
    [
      [2.0, 24.5],
      [5.0, 28.0]
    ],
    [3.6, 25.2],
    ["灰港", 3.8, 25.6, 2]
  ],
  [
    "南境金丘",
    "人类",
    "west",
    "#C9A06A",
    [
      [7.0, 22.0],
      [10.0, 25.0],
      [6.5, 27.0]
    ],
    [7.8, 22.5],
    ["金丘城", 8.4, 23.8, 2]
  ],
  [
    "古林",
    "树人",
    "west",
    "#7C8F5E",
    [
      [14.0, 22.5],
      [16.5, 26.0]
    ],
    [12.8, 25.2],
    ["古林之心", 14.8, 24.4, 1]
  ],
  [
    "裂牙荒原",
    "兽人",
    "west",
    "#B0A06A",
    [
      [18.5, 22.0],
      [20.5, 25.0],
      [17.0, 27.5]
    ],
    [18.5, 22.8],
    ["裂牙堡", 19.4, 23.4, 1]
  ],
  [
    "灰烬之地",
    "亡灵",
    "north",
    "#9A93A0",
    [
      [30.0, 2.8],
      [38.0, 2.8]
    ],
    [34.0, 2.4],
    ["灰烬王庭", 34.0, 5.2, 1]
  ],
  [
    "黑石要塞",
    "兽人",
    "east",
    "#9A7A66",
    [
      [49.5, 7.5],
      [51.5, 10.5]
    ],
    [50.5, 8.2],
    ["黑石", 50.0, 8.0, 1]
  ],
  [
    "夏丘",
    "半身人",
    "east",
    "#B8BE84",
    [
      [56.5, 6.5],
      [59.5, 9.0]
    ],
    [57.5, 7.2],
    ["夏丘镇", 57.8, 7.8, 2]
  ],
  [
    "东岸商盟",
    "人类",
    "east",
    "#C9B27E",
    [
      [63.0, 9.0],
      [64.0, 13.0]
    ],
    [63.0, 10.0],
    ["东岸港", 63.4, 10.8, 1]
  ],
  [
    "龙骨荒漠",
    "龙",
    "east",
    "#A87E5E",
    [
      [50.5, 14.0],
      [53.5, 17.0]
    ],
    [51.2, 21.6],
    ["龙骨城", 50.6, 21.0, 1]
  ],
  [
    "鸦林",
    "树人",
    "east",
    "#6F8A54",
    [
      [54.5, 21.5],
      [57.5, 23.5]
    ],
    [55.5, 22.5],
    ["鸦林堡", 55.8, 22.8, 2]
  ],
  [
    "龙焰半岛",
    "龙",
    "east",
    "#B5735A",
    [
      [61.0, 21.0],
      [63.5, 24.0]
    ],
    [61.5, 22.8],
    ["龙焰", 62.4, 23.8, 2]
  ],
  [
    "珊瑚海国",
    "鱼人",
    "isles",
    "#7FA0AE",
    [
      [29.8, 30.0],
      [40.9, 29.5],
      [37.6, 33.0]
    ],
    [33.2, 26.2],
    ["珊瑚宫", 29.9, 31.0, 1]
  ],
  [
    "深渊港",
    "鱼人",
    "isles",
    "#6E8FA0",
    [
      [26.9, 32.0],
      [44.6, 32.3]
    ],
    [26.9, 30.43],
    ["深渊港", 44.6, 33.4, 2]
  ]
]

const SHORT = {
  "巨人之脊": "巨人",
  "北境霜堡": "北境",
  "银树森林": "银树",
  "铁砧山": "铁砧",
  "深炉城": "深炉",
  "西岸自由城邦": "西岸",
  "河间王国": "河间",
  "灰港": "灰港",
  "南境金丘": "南境",
  "古林": "古林",
  "裂牙荒原": "裂牙",
  "灰烬之地": "灰烬",
  "黑石要塞": "黑石",
  "夏丘": "夏丘",
  "东岸商盟": "东岸",
  "龙骨荒漠": "龙骨",
  "鸦林": "鸦林",
  "龙焰半岛": "龙焰",
  "珊瑚海国": "珊瑚",
  "深渊港": "深渊"
}

const SEAS = [
  ["北海", 34.5, 6.5],
  ["断桥海", 34.0, 16.5],
  ["珍珠湾", 45.9, 13.2],
  ["南海", 23.8, 32.6]
]

const BIOME_COLOR = {
  "grass": "#B7C084",
  "tundra": "#9FAC9C",
  "ice": "#E3EAEB",
  "desert": "#E8CE86",
  "rock": "#A69E8C",
  "swamp": "#8E9C6B",
  "forest": "#7FA05F",
  "jungle": "#7C9C5C",
  "volcanic": "#8F6552"
}

const BIOMES = [
  [
    "tundra",
    [
      [0.0, 9.5],
      [2.0, 6.5],
      [5.0, 5.0],
      [7.5, 6.2],
      [9.5, 4.0],
      [12.5, 4.8],
      [15.0, 3.2],
      [17.5, 5.5],
      [16.5, 8.5],
      [14.0, 9.0],
      [10.0, 9.8],
      [5.0, 10.2],
      [0.0, 11.0]
    ]
  ],
  [
    "rock",
    [
      [15.5, 8.6],
      [19.0, 9.5],
      [20.5, 13.0],
      [21.5, 17.0],
      [20.5, 20.0],
      [17.5, 19.0],
      [16.0, 15.0],
      [14.5, 11.5]
    ]
  ],
  [
    "forest",
    [
      [10.5, 9.5],
      [15.5, 9.0],
      [17.0, 12.0],
      [17.5, 15.5],
      [15.0, 17.5],
      [11.5, 16.5],
      [9.5, 13.0]
    ]
  ],
  [
    "desert",
    [
      [15.5, 19.5],
      [20.5, 20.0],
      [22.5, 23.5],
      [24.0, 26.0],
      [22.0, 28.5],
      [18.5, 27.5],
      [16.0, 24.0]
    ]
  ],
  [
    "forest",
    [
      [10.0, 21.0],
      [15.5, 20.5],
      [17.0, 24.0],
      [16.5, 27.5],
      [13.0, 29.0],
      [10.0, 27.0],
      [8.5, 24.0]
    ]
  ],
  [
    "swamp",
    [
      [2.0, 28.2],
      [7.0, 28.6],
      [11.5, 29.6],
      [10.5, 31.2],
      [6.0, 31.0],
      [2.0, 30.0],
      [0.5, 29.0]
    ]
  ],
  [
    "ice",
    [
      [26.0, 5.0],
      [28.5, 2.5],
      [32.0, 0.0],
      [39.0, 0.0],
      [43.0, 2.0],
      [44.0, 4.5],
      [42.0, 6.2],
      [37.0, 5.2],
      [31.0, 6.0],
      [27.5, 5.8]
    ]
  ],
  [
    "tundra",
    [
      [46.0, 10.5],
      [47.0, 7.0],
      [49.5, 4.0],
      [53.0, 3.0],
      [56.5, 4.8],
      [59.0, 3.2],
      [62.5, 4.5],
      [65.0, 3.0],
      [66.0, 6.0],
      [66.0, 9.0],
      [62.0, 9.5],
      [56.0, 8.5],
      [50.0, 9.5]
    ]
  ],
  [
    "forest",
    [
      [55.0, 5.5],
      [59.0, 5.0],
      [60.5, 8.0],
      [59.5, 11.0],
      [56.0, 11.5],
      [54.0, 9.0]
    ]
  ],
  [
    "rock",
    [
      [47.5, 11.0],
      [50.5, 12.5],
      [53.5, 15.5],
      [56.5, 19.0],
      [55.0, 21.0],
      [51.5, 19.0],
      [48.5, 16.0],
      [46.5, 13.0]
    ]
  ],
  [
    "desert",
    [
      [47.5, 20.5],
      [53.5, 20.0],
      [55.5, 23.0],
      [54.0, 26.5],
      [49.5, 25.5],
      [47.0, 23.0]
    ]
  ],
  [
    "forest",
    [
      [53.5, 20.5],
      [57.5, 20.0],
      [58.5, 23.0],
      [57.0, 25.5],
      [53.5, 25.5],
      [52.5, 23.0]
    ]
  ],
  [
    "volcanic",
    [
      [59.0, 21.5],
      [63.5, 20.5],
      [66.0, 22.0],
      [66.0, 26.0],
      [63.0, 27.5],
      [59.5, 26.0],
      [57.5, 23.5]
    ]
  ],
  [
    "jungle",
    [
      [23.0, 26.5],
      [47.5, 26.5],
      [47.5, 35.0],
      [23.0, 35.0]
    ]
  ]
]

const RIDGES = [
  [
    "霜脊山脉",
    [
      [3.0, 8.0],
      [7.0, 6.2],
      [11.0, 6.8],
      [15.0, 5.2]
    ],
    6,
    1.05
  ],
  [
    "铁砧山脉",
    [
      [17.5, 10.0],
      [19.5, 13.0],
      [21.0, 17.0]
    ],
    5,
    1.0
  ],
  [
    "龙骨山脉",
    [
      [48.0, 12.0],
      [51.0, 14.5],
      [54.0, 18.0]
    ],
    5,
    1.0
  ]
]

const PEAKS = [
  [6.0, 20.5, 0.75],
  [12.5, 18.0, 0.62],
  [23.0, 14.5, 0.7],
  [45.5, 17.0, 0.72],
  [58.0, 12.5, 0.68],
  [60.5, 16.5, 0.62]
]

const FORESTS = [
  ["银树森林", 13.2, 12.5, 3.9, 16],
  ["古林", 13.0, 24.5, 3.9, 15],
  ["鸦林", 55.4, 22.6, 3.0, 11],
  ["夏丘林地", 57.2, 7.8, 2.6, 9],
  ["西岸疏林", 3.2, 18.0, 2.4, 7],
  ["南岸疏林", 8.5, 27.0, 2.2, 6],
  ["北岸疏林", 10.5, 7.5, 2.0, 5],
  ["黑石疏林", 47.5, 7.5, 1.9, 5],
  ["龙焰疏林", 61.0, 25.0, 1.8, 5]
]

const RIVERS = [
  [
    "长河",
    [
      [9.5, 7.5],
      [10.0, 12.0],
      [9.0, 16.0],
      [10.5, 20.5],
      [11.5, 25.0],
      [11.0, 30.5]
    ],
    0.16,
    0.6
  ],
  [
    "西河",
    [
      [18.0, 13.5],
      [14.0, 15.5],
      [9.0, 16.5],
      [4.0, 17.5],
      [0.5, 18.5]
    ],
    0.14,
    0.48
  ],
  [
    "东河",
    [
      [51.0, 15.0],
      [52.5, 19.0],
      [52.0, 23.5],
      [53.5, 27.0]
    ],
    0.14,
    0.44
  ]
]

const LAKES = [
  [12.0, 26.5, 1.35],
  [57.0, 13.0, 1.15],
  [7.5, 24.0, 0.9]
]

const LABELS = [
  ["北海", 34.5, 6.8, "sea"],
  ["断桥海", 34.0, 17.2, "sea"],
  ["珍珠湾", 44.6, 12.6, "sea"],
  ["南海", 22.0, 32.4, "sea"],
  ["霜脊山脉", 8.2, 4.4, "land"],
  ["铁砧山脉", 20.0, 9.6, "land"],
  ["龙骨山脉", 50.6, 14.6, "land"],
  ["银树森林", 13.2, 12.4, "land"],
  ["古林", 12.8, 24.6, "land"],
  ["鸦林", 55.6, 22.8, "land"],
  ["裂牙荒原", 19.6, 23.6, "land"],
  ["龙骨荒漠", 49.4, 22.4, "land"],
  ["灰烬之地", 34.5, 3.2, "land"],
  ["龙焰半岛", 62.4, 24.6, "land"],
  ["珊瑚群岛", 40.5, 27.6, "sea"]
]

const WONDERS = [
  ["tree", 8.2, 29.0, 1.35],
  ["isle", 35.0, 21.6, 1.4],
  ["isle", 31.5, 12.5, 1.05],
  ["tower", 61.5, 5.0, 1.25],
  ["bones", 54.0, 17.8, 1.4],
  ["crystal", 20.0, 15.4, 1.25],
  ["rune", 14.0, 18.5, 0.75],
  ["blight", 40.5, 3.6, 1.15]
]

  return { W, H, WEST, NORTH, EAST, ISLES, LANDS, RACES, NATIONS, SHORT, SEAS, BIOME_COLOR, BIOMES, RIDGES, PEAKS, FORESTS, RIVERS, LAKES, LABELS, WONDERS }
})()

const __mod7 = (() => {
/**
 * 冒险者的事务所 · 这一份世界的样子
 *
 * 2026-10-06 从 `src/client.js` 搬过来的：取景框（`VIEW`）与七个地点的坐标（`PLACES`）。
 * 搬家的理由跟句子一样——**一个世界该是一整个目录**。加一个世界（仙侠、规则怪谈）
 * 不该去改 client.js 里的常量，只要自己带一套地理：地图、框、地点，外加默认主题。
 *
 * 接口（`src/packs/README.md` 有表）：
 *   theme    这套世界默认用哪个主题（`THEMES` 的 id，主题本身还在 client.js 里）
 *   tagline  一句话，悬停「故事风格」那个名字时给他看（不含事实，只是这个世界的一句话）
 *   cover    选包器上的一个记号（一个字，够认就行）
 *   view     地图的取景框 `{x, y, w, h}`，世界单位
 *   places   地图上的地点：`{ id, x, y, door: [x, y], name: { <说法>: 名字 }, wild? }`
 *            `wild: true` = **野地**（地图上真有那么个地方，但没有房子、也没有城里的熟人）——
 *            `client.js` 靠这个标记决定「那地方的熟人跟这件事的开头」要不要并进来。
 *
 * **view 与 places 必须成套**：框是照着一整段画好的 SVG 裁的，地点坐标又是照着同一张图
 * 钉上去的（地图是画出来的、坐标是钉上去的，两边对不上记号就会站在海里）。
 * 所以校验器 R11 要求「要么都给、要么都不给」；两样都不给的世界就退回默认这一套地理
 * （薄世界包可以只给句子，不画地图）。
 */

/** 画进 SVG 的那个框。地图是画在世界坐标里的一整段 SVG（由 `src/map/world.js` 现画），
 *  2026-10-06 起这张图是 `.scratch/terrain.py` 画的（world3：一整块 66×34 的世界），
 *  2026-10-07/08 那套画法移植进了 JS，画出来与当年逐字节相同。
 *  画布本身就等于内容——没有一圈要裁掉的空白，所以框从 0,0 起。
 *
 *  这个框同时也是**记号与地名签的坐标系**：`places[].door` 用的就是世界单位。 */
const view = { x: 0, y: 0, w: 66, h: 34 }

/**
 * 地图上**四块陆地各自的底色**（2026-10-30 地图审计 M-9）。
 *
 * 从前四块陆地铺的是同一张草纹图案：北境的冻土、东岸的旱地、西岸的草原、
 * 珊瑚海的岛，颜色一模一样。远看是一整块绿，读图的人分不出哪块是哪块。
 *
 * 底色写在这里而不是画图的 `src/map/world.js` 里：这是「这个世界长什么样」的
 * 知识，跟 `places` 的坐标一样该跟着世界包走。`base` 是平铺图案的底色，
 * `tint` 是那块地上深浅斑的颜色；西岸那一块保持原来的 `#B7C084`，别的一律
 * 只挪一点，四块并排看得出差别、单独看还是同一张图。
 */
const mapLands = {
  west: { base: '#B7C084', tint: '#9FB46A' },
  north: { base: '#AFBB9E', tint: '#97A786' },
  east: { base: '#C7BD8D', tint: '#B1A573' },
  isles: { base: '#ADC39A', tint: '#93AB80' },
}

/**
 * 地图上的**十三个**地点：屋里七个（城里）＋ 野地六个（见下）。
 *
 * `door` 是他站在城镇门口的位置（也是「他现在在这儿」那个记号钉下去的地方）；
 * 名字有两套，跟说法走——但**地方是同一个地方**（案牍那套收进 `.parked/ledger-voice/`
 * 之后名字表里的 `ledger` 还留着，将来放回来就不用再对一遍坐标）。
 * 野地那六个只有 `adventure` 一套名字：它们本来就长在这个世界的句子里。
 *
 * 坐标是**平面**的：x 向右、y 向下，单位就是画布单位（66×34 那张图里的一格）。
 * 上一版是等距的格坐标，改成正俯视之后就不需要投影了。
 *
 * 2026-10-06（第二版世界图）：地图换成了 `.scratch/terrain.py` 画的那张，
 * 二十座城各有一个记号，坐标得**照着那张图重钉一遍**。规矩是：
 *
 *   · `y` 用**都城记号的地基**（城墙底边），`door` 再往下 0.9——跟上一版同一个偏移；
 *   · 挑城的时候避开「一级国」的首都：那种城头顶挂着一块国名牌，而记号旁边那块
 *     地名签是钉在记号右上方的，两个框会撞上。二级国没有牌子，落上去干净。
 *     这一版只有三个落在一级国上，撞出来的都是一条不到 0.4 单位的缝（约 2px）。
 *
 * 所以这七个点跟 `.scratch/world3.py` 的 `NATIONS` 是**一一对应**的：
 * 西边是人的地界（酒馆、公会、落脚处），东边最远那一站是半身人的货栈，
 * 精灵的高塔存卷轴，古林深处抄咒文，矮人的炉边打法器。
 */
const places = {
  /* 名字一律是**地名**（名字＋种类），不是光秃秃的种类词。
   *
   * 2026-10-08 更晚用户 m12195 第 1 条（贴了面板截图，指着状态行那个「落脚处」）：
   * 「现在如图所示的位置写着角色在落脚处，不可以有落脚处，而是一处地名，比如 XX 旅馆，
   *  或者在自己家里。」——所以「酒馆」「公会」「落脚处」这类词全换掉，
   * 家里那一处改成「他的屋子」（他自己拍的那一档）。
   *
   * 两处读它：状态行「此刻 23:28 · …」与地图上钉子旁边那枚地名签（都在 `src/client.js`
   * 里走 `placeName`）。四个字是有意的：地名签的宽度按字数估（`w = name.length * fs + 1.5`），
   * 四个字跟原来「冒险者公会」差不多宽，不会比从前更容易撞上地图上那些地形名。
   *
   * `ledger` 那一份是**停用的案牍**那一套的名字，没动（它本来就更像公署的说法）。 */
  tavern: { id: 'tavern', x: 3.6, y: 26.77, door: [3.6, 27.67], name: { ledger: '酒馆', adventure: '灰鹳旅店' } },
  guild: { id: 'guild', x: 15, y: 7.37, door: [15, 8.27], name: { ledger: '公会', adventure: '铜盾公会' } },
  home: { id: 'home', x: 10.5, y: 18.09, door: [10.5, 18.99], name: { ledger: '落脚处', adventure: '他的屋子' } },
  market: { id: 'market', x: 57.5, y: 8.77, door: [57.5, 9.67], name: { ledger: '货栈', adventure: '东岸货栈' } },
  archive: { id: 'archive', x: 12.5, y: 12.39, door: [12.5, 13.29], name: { ledger: '档案塔', adventure: '银树书库' } },
  scriptorium: { id: 'scriptorium', x: 12.8, y: 27.79, door: [12.8, 28.69], name: { ledger: '抄写室', adventure: '古林书斋' } },
  workshop: { id: 'workshop', x: 19.5, y: 13.77, door: [19.5, 14.67], name: { ledger: '工坊', adventure: '炉边作坊' } },

  /* ---- 2026-10-08（第三十六版）加的六个野地 ----
   *
   * 上面七个是**屋子里**：门是城镇的城墙底边、`door` 再往下 0.9（记号钉在门口）。
   * 这六个是**野地**，没有房子，所以 `x/y` 就是那一点本身、`door` 跟它重合——
   * 记号直接钉在地上。
   *
   * 为什么非加不可：原来包里六个户外的活（描残咒、送契书、下矿洞、拖法器、翻塔册、
   * 查夜哨）写的是 `place: null`，加上「他出门了」那一条也写 `place: null`——
   * 于是**他常常整场不在图上**，用户看见的是「角色标记不见了，他又跑了界外去了？？」，
   * 他拍的是「**角色必须一直显示在地图上**」。
   *
   * 名字是**地图上真有的地点**，不是「他这会儿不在地图上」的托词。
   * 用户 2026-10-08（逐字）：「角色所有的行为都发生在地图上，所以他的标记永远会在地图上，
   * 他做的事情也是符合地图地点的行为。比如你想表达他去了地下，那么标记点应该是
   * 『地下矿洞』这样，而不是所谓『界外』。」——所以没有兜底的那一枚「界外」，
   * 下矿就写「地下矿洞」、查夜哨就写「夜哨」。
   *
   * 坐标全部过了一遍 `LANDS` 的多边形（`.scratch/land-probe.mjs`），都在 `west` 陆地上，
   * 并且避开了地形标签与奇观的框——挑点时要拿 `world3.js` 的 `LABELS` / `WONDERS` 对着看。
   *
   * **2026-10-08 又扫了一遍**：`.scratch/sweep-label.html` 把每个野地在原落点周围 ±3 格
   * 按 0.5 的格子挪一遍，每次都照 `renderStage` 的规矩摆好地名签，量它跟世界图上
   * **每一个 `<text>`** 的屏幕矩形撞不撞（**不认 class 前缀**——国名牌、地形名一个前缀
   * 都没有，只认 `gf-` 会漏掉「霜脊山脉」这种）。筛出来的干净格子再要求九向探针
   * 全在陆地上（岸线在原始多边形外还抖 0.1~0.2 格，贴边会站到水里）。
   * 结果：`ruin` / `quench` / `tower` / `watch` 原落点就干净；
   * **`frost` 从 (6.0, 7.5) 挪到 (8.0, 7.5)**（原来那签正好盖住「霜脊山脉」那行字）、
   * **`mine` 从 (19.5, 11.2) 挪到 (17.0, 10.2)**（原来贴着海岸线，签还撞「铁砧山脉」）。
   *
   * 「他出门了 / 一条记录都没有」那一支**钉在 `home`**（落脚处），不再另立一枚野地：
   * 记号的意思是「他此刻在这儿」，他的日子本来就都发生在这张图上。 */
  // 2026-10-30 M-5：从 (14.0, 19.8) 往下挪半格到 (14.2, 20.4)——原来那枚记号的边正压在
  // 奇观「符文石」上（`world.check()` 记作 1.92 × 0.34 的一处压住）。
  ruin: { id: 'ruin', x: 14.2, y: 20.4, door: [14.2, 20.4], wild: true, name: { adventure: '乱石岗' } },
  // 2026-10-30 M-5：从 (8.0, 7.5) 往上挪到 (8.0, 6.2)——原来那枚记号压着「石冠城」那枚城牌。
  frost: { id: 'frost', x: 8.0, y: 6.2, door: [8.0, 6.2], wild: true, name: { adventure: '霜原' } },
  mine: { id: 'mine', x: 17.0, y: 10.2, door: [17.0, 10.2], wild: true, name: { adventure: '地下矿洞' } },
  quench: { id: 'quench', x: 11.2, y: 22.0, door: [11.2, 22.0], wild: true, name: { adventure: '河湾' } },
  tower: { id: 'tower', x: 16.5, y: 21.5, door: [16.5, 21.5], wild: true, name: { adventure: '废塔' } },
  watch: { id: 'watch', x: 12.0, y: 5.5, door: [12.0, 5.5], wild: true, name: { adventure: '夜哨' } },
}

/** 这套世界默认用哪个主题。主题（配色与材料）本身还在 `src/client.js` 的 `THEMES` 里，
 *  包里只指一个 id——换主题是面板的事，换世界不该重写一套配色。 */
const theme = 'plain'

/** 悬停「故事风格」那个名字（以及清单里每一项）时浮出来的那一句话。
 *
 *  2026-10-06 傍晚重写过一次：原来那句是「案上的活计，出了门就是路上的一件事。」，
 *  用户说它**不符合「奇幻冒险」的内核**，让照《魔戒》《冰与火之歌》的写法来写。
 *  旧那句讲的是这个插件自己的机锋（案头活计被讲成上路的事），不是这一套说法的质地；
 *  新这句改用这个世界里真有的东西：霜原、路碑、古咒、契书——包里的句子确实讲这些
 *  （「他翻过那道乱石岗，照着墙上那行旧咒往下描」「他把那卷契书揣进怀里，
 *  往霜原上走」），所以不是空话。
 *
 *  一句话，不是事实，只是这个世界的一句话。 */
const tagline = '长夜从霜原上压过来，他揣着古咒与契书往北走。'

/** 选包器上的记号：一个字，够认就行。 */
const cover = '契'

  return { view, mapLands, places, theme, tagline, cover }
})()

const __mod3 = (() => {
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
const { f2, hypot, nlen, plate_rect, plate_text_y, box_overlap, pd: _pd, wob: _wob, organic: _organic, meander: _meander, blob: _blob, ribbon: _ribbon, lerp: _lerp, hit: _hit } = __mod4
const { Random } = __mod5
const { W, H, LANDS, BIOMES, BIOME_COLOR, RIDGES, PEAKS, FORESTS, RIVERS, LAKES, LABELS, NATIONS, WONDERS } = __mod6
// 世界包里的**地理数据**：野地的六个点、四块陆地的取色。2026-10-30 地图审计
// M-5 / M-9 要求「野地符号落在包里的坐标上」「四块陆地的取色写在世界包里，不是
// 写死在渲染器里」——渲染器自己不认识哪块地叫什么，只能问包。这里 import 的是
// 数据模块（不含任何 import），不会跟 `packs/adventure/index.js` 绕成环。
const { places: WORLD_PLACES, mapLands } = __mod7

/* ── 底层图元：显式包装再导出 ─────────────────────────────────────────
 *
 * 不能写 `export { pd } from './geo.js'`——`scripts/build-client.mjs` 的摊平器只认
 * `export const|let|var|function|class`，`export { … }` 一律报错。
 */

function pd(pts, close = true) { return _pd(pts, close) }

function wob(pts, amp = 0.12, seed = 0, n = 4, closed = true) { return _wob(pts, amp, seed, n, closed) }

function organic(pts, amp = 0.30, bend = 0.11, seed = 0, n = 9) { return _organic(pts, amp, bend, seed, n) }

function meander(pts, amp = 0.16, seed = 0, n = 9) { return _meander(pts, amp, seed, n) }

function blob(cx, cy, r, seed, n = 9, ry = 1.0) { return _blob(cx, cy, r, seed, n, ry) }

function ribbon(pts, w0, w1, seed = 0, n = 5) { return _ribbon(pts, w0, w1, seed, n) }

function lerp(a, b, t) { return _lerp(a, b, t) }

function hit(poly, x, y) { return _hit(poly, x, y) }

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
function f3(x) {
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

const SEA = '#243642'
const SEA_LO = '#3A5566'
const SEA_DASH = '#41586A'
const COAST = '#2A2318'
const INK = 0.135
const INK2 = 0.085
const RIVER = '#93B2BC'
const RIVER_IN = '#5E808E'
const ROCK_LIT = '#C6BDA9'
const ROCK_SH = '#7C7466'
const SNOW = '#EFEAE0'
const DUNE = '#B99C63'
const CRACK = '#9FB3BA'

// ---------------------------------------------------------------- 山

/**
 * 一座山。抖动剖面 + 脊线 + 受光/背光两坡 + 背光坡梳齿排线 + 雪盖。
 *
 * 第一版画成干净的等腰三角形加横排线，读出来是金字塔／帐篷——
 * 剖面要抖、背光坡要梳齿，才像岩石。雪盖只在够高的山上才有，
 * 而且下缘是锯齿；雪不用白色去「画」，是留白（不排线）。
 */
function peak(cx, cy, s, seed, idx) {
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

function tree(x, y, s, conifer, seed) {
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

function forest(cx, cy, r, count, seed) {
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

function dunes(poly, seed, count = 26) {
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

function cracks(poly, seed, count = 22) {
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

function marsh(poly, seed, count = 20) {
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
function marks(poly, seed, count, kind) {
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
function compass(cx, cy, r) {
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
function night() {
  return `<rect class="mnight" x="0.00" y="0.00" width="${f2(W)}" height="${f2(H)}"/>`
}

function rect(x, y, w, h, fill, sw = INK2 * 0.8) {
  return `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${fill}" stroke="${COAST}" stroke-width="${f3(sw)}"/>`
}

/** 一座塔：塔身 + 三个城齿。城齿是「这是城堡不是房子」的唯一记号。 */
function tower(x, by, w, h, fill) {
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
function capital(x, y, tier) {
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
function emblem(x, y, s, race) {
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
function crest(x, y, s, race, field) {
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
function nations(mode = 'tier1') {
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
function labels() {
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
function labelRect(name, x, y, fs = 1.15) {
  const [r0, , r2] = plate_rect(0, 0, name, fs)
  const w = r2 - r0
  const px = clampNum(x, w / 2 + 0.4, W - w / 2 - 0.4)
  const py = clampNum(y, fs * 1.05, H - fs * 0.5)
  return plate_rect(px, py, name, fs)
}

/** 都城记号的包围盒（`capital()` 画的那面三角旗 + 底座）。 */
function capital_box(cx, cy, tier) {
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
function labelPlates() {
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
const CAP_OFF = { 1: 2.59, 2: 1.57 }
// 例外：珊瑚海国的名字浮在海上（岛太小，牌子放不下），都城得留在岛上。
const CAP_AT = { '珊瑚宫': [29.9, 31.0] }

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
function _cap_at(cname, nx, ny, tier, cx = null, cy = null) {
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
function nationPlates() {
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
function nationSkips() {
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
function cityPlates() {
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

function _boxes() {
  return _baseBoxes()
}

/**
 * 图上所有**写着字或画着记号**的地方，展开成扁平的矩形表——
 * `[说法, 种类, x0, y0, x1, y1]`（2026-10-30 M-4 用）。
 *
 * 面板上那枚地名签得躲开这张图上已有的字与记号，不然「银树城」三个字会压在
 * 「银树森林」上。世界图与面板是两套坐标系：世界图这张表按 `VIEW` 平移即可。
 */
function textBoxes() {
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
const PLACE_FS = 1.6

function placeLabel(px, py, text, fs, view, opts = {}) {
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
function check() {
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

const TREE_HI = '#6E8C4E'
const TREE_LO = '#3F5A34'
const BONE = '#E6DECA'
const BONE_SH = '#B4AA92'
const CRYSTAL = '#8FBBCB'
const CRYSTAL_HI = '#DDF1F7'
const STONE = '#9C968A'
const STONE_LO = '#6E685E'
const BLIGHT = '#6B6470'
const SLATE = '#5A6B84'

const WONDER_HALO = '<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFE7A8" stop-opacity="0.44"/><stop offset="0.58" stop-color="#FFE7A8" stop-opacity="0.20"/><stop offset="1" stop-color="#FFE7A8" stop-opacity="0"/></radialGradient>'
const WONDER_COLD = '<radialGradient id="halocold" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#B9D6C8" stop-opacity="0.40"/><stop offset="0.58" stop-color="#B9D6C8" stop-opacity="0.17"/><stop offset="1" stop-color="#B9D6C8" stop-opacity="0"/></radialGradient>'

/**
 * 奇观的地界：一圈光晕 + 一圈虚线环。**必须画在奇观自己底下。**
 *
 * 环是给读图的人看的「这里有人特意量过」——1× 下光晕只剩一层淡黄，
 * 真正把「这是个奇观」说出去的是这圈虚线，所以它得够粗、够密。
 */
function wonder_mark(cx, cy, r, cold = false) {
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
function worldtree(cx, cy, s) {
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
function floatisle(cx, cy, s) {
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
function archtower(cx, cy, s) {
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
function dragonbones(cx, cy, s) {
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
function crystalvein(cx, cy, s) {
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
function runestones(cx, cy, s) {
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
function blightland(cx, cy, s) {
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

const WONDER_FN = { tree: worldtree, isle: floatisle, tower: archtower,
  bones: dragonbones, crystal: crystalvein,
  rune: runestones, blight: blightland }

// 自查用：每个奇观相对锚点的半宽/半高（单位＝s 的倍数）＋中文名 ＋该在陆地还是海上。
//
// 这张表量的是**画上去的东西**（骨架、塔身、树冠），不含那圈淡光晕：光晕是 44% 的
// 径向渐变，压在别人底下也不碍读字，可它的外接矩形比实物大一圈。2026-10-31（t24）
// 把龙骸这一项从 [2.42, 1.56] 收到 [2.05, 1.10]：旧值量的是光晕（半径 2.35s 那个圆），
// 于是矩形右下角把龙骨城的都城旗圈了进去，自查报「龙骨城 × 奇观·龙骸」一处——
// 其实旗子站在光晕外头的沙地上，两者没碰着。骨架本身没变。
const WONDER_BOX = { tree: [1.62, 2.32], isle: [1.28, 2.34], tower: [0.78, 2.10],
  bones: [2.05, 1.10], crystal: [1.28, 1.06], rune: [1.28, 1.36],
  blight: [1.32, 1.08] }
const WONDER_CN = { tree: '世界之树', isle: '浮岛', tower: '大法师塔',
  bones: '龙骸', crystal: '水晶脉', rune: '符文石',
  blight: '污染之地' }
const WONDER_SEA = new Set(['isle'])

const WILD_CN = { ruin: '乱石岗', frost: '霜原', mine: '地下矿洞',
  quench: '河湾', tower: '废塔', watch: '夜哨' }

// 自查用：每个野地记号相对锚点的半宽/半高（世界单位，s = 1）
const WILD_BOX = { ruin: [1.02, 0.62], frost: [0.96, 0.54], mine: [0.86, 0.70],
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
function wildMark(kind, cx, cy, s = 1.0) {
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
function wildBoxes() {
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

function wilds() {
  const o = []
  for (const key of Object.keys(WORLD_PLACES)) {
    const place = WORLD_PLACES[key]
    if (!place || !place.wild) continue
    // 一处一个 `<g>`，类名带着两件事：这是野地记号、它是哪一处（自检与冒烟按这个认）。
    o.push(`<g class="gf-wild gf-wild-${place.id}">${wildMark(place.id, place.x, place.y, 1.0).join('')}</g>`)
  }
  return o
}

function wonders() {
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
function landTone(key) {
  const song = mapLands && mapLands[key]
  return (song && song.base) || BIOME_COLOR['grass']
}

function grassPattern(size = 6.0, n = 36, seed = 31337, base = null, id = 'grasstex') {
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
function grassTints(count = 9, seed = 707) {
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

function build() {
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
const MAP_CSS =
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
function mapSvg() {
  if (_svg === null) _svg = build()
  return _svg
}

  return { pd, wob, organic, meander, blob, ribbon, lerp, hit, f3, SEA, SEA_LO, SEA_DASH, COAST, INK, INK2, RIVER, RIVER_IN, ROCK_LIT, ROCK_SH, SNOW, DUNE, CRACK, peak, tree, forest, dunes, cracks, marsh, marks, compass, night, rect, tower, capital, emblem, crest, nations, labels, labelRect, capital_box, labelPlates, CAP_OFF, CAP_AT, _cap_at, nationPlates, nationSkips, cityPlates, _boxes, textBoxes, PLACE_FS, placeLabel, check, TREE_HI, TREE_LO, BONE, BONE_SH, CRYSTAL, CRYSTAL_HI, STONE, STONE_LO, BLIGHT, SLATE, WONDER_HALO, WONDER_COLD, wonder_mark, worldtree, floatisle, archtower, dragonbones, crystalvein, runestones, blightland, WONDER_FN, WONDER_BOX, WONDER_CN, WONDER_SEA, WILD_CN, WILD_BOX, wildMark, wildBoxes, wilds, wonders, landTone, grassPattern, grassTints, build, MAP_CSS, mapSvg }
})()

const __mod8 = (() => {
/**
 * 高光事件：有些日子不该只落一句话。
 *
 * 用户 m06647 第 2 条原话：「战斗项的内容实在太少了，我几乎没看到过任何战斗，对于一个
 * 奇幻故事来说，没有标志性的故事、没有高光时刻，是十分可惜的。比如电视剧《权利的游戏》
 * 里有很多著名的情节：血色婚礼、夜王来袭，我们在这个叙事里面，也需要有这些内容。」
 *
 * 所以有了这一层：**一天最多一件**，条件全是真的——那天撞过几次墙、干到几点、
 * 交出去几件、走过哪一景。一件也没中的日子照旧只落那一句话（那是绝大多数日子）。
 *
 * 读它的机器在 `../rules.js` 的 `momentOf`，接口与红线写在 `../rules.md`。
 * 三条不能破的：
 *
 *   · **只认记录里真有的信号**（`fails` / `minutes` / `deliverables` / `helpers` / 钟点 / 场景）。
 *   · **同一份记录永远得到同一件事**：判据全是数据，没有掷点、不读「现在」、不掷骰子。
 *   · **不是战斗系统**：这是几句描述，落在那一卷下面。没有血量、没有输赢、没有奖励。
 *
 * 写法照句库那几条：陈述句、句号收尾、不用阿拉伯数字、不用现代词、不感叹、不劝，
 * 第三人称「他」，一句只说一件事、一句一行排着往下说；敌人一律无名指代
 * （「那两个人」「那伙人」），不给他们起名字，也不写「怪物」「敌人」这种统称。
 *
 * **顺序就是优先级**：几件的条件同时中的日子，排在前面的那件先讲。所以这个列表的
 * 次序也是行为的一部分，不是随手排的——重的排前面，交割日这种排最后。
 *
 * 2026-10-08 又加了**岔口**（用户 m08146「全做。」里的第 ④ 件「选择点」）：每件事
 * 走到一半会遇上两条路，都是**外头**的路（守到天亮 / 退走、回头把阵填了 / 拎起镐头下山）。
 * 走哪条由那一天真有的东西决定（`choice.roads[i].when`，用的是同一套项语言），
 * **最后一条没有条件**，就是「谁都没轮到的时候他自己落的那一条」——所以永远走得出来一条。
 *
 * 岔口只住在事件里：没有事件的日子没有岔口，也没有哪条路要挑。走的那条会**封在这一件里**
 * （`choiceOf` 判一次，同一份记录看两遍是同一条路），不写回 `records.json`。
 * 两条路的句子同样按「一句一行」排，接在 `steps` 后面、`close` 前面。
 *
 * 2026-10-09（用户 m01903 第 2 条：需要做决定的时刻叫「命运抉择」，「需要有对应的、
 * 具有份量的事件来供用户选择，而不是轻飘飘的，没有任何代价的」）加了三样：
 *
 *   · `weight`：这一件事的**份量**（1–3）。**摆岔口的事件得是 2 或 3**——轻飘飘的事
 *     不该让人做决定（现在八件全是 2 或 3）。
 *   · `roads[i].cost`：这一条路的**代价**，一句完整的话，摆在挑之前给他看。不许零代价。
 *   · `roads[i].marks`：这一条路留下的**痕迹**，一到两个，取自那六个：
 *
 *       伤 `wound` · 账 `debt` · 名声 `fame` · 得着 `gain` · 知道 `lore` · 丢掉 `loss`
 *
 *     痕迹只活当天：挑完以后，今天后面几格的说法会跟着变（见 `src/client.js` 的
 *     `dayMarks`），明天清空。它同样是**推出来的**，不写进 `records.json`。
 *
 * 这四条硬规矩（够格才给选项 / 每条路都得有代价 / 两条路不对称 / 每条路至少留一种痕迹）
 * 是 **R18**，机器读法在 `../rules.js` 的 `checkChoices`。
 *
 * 2026-10-09 同时把四件加到**八件**：通宵硬啃、帮手来了、走岔了、回头找。
 * 八件的次序就是优先级：夜袭 → 塌方 → 桥头 → 通宵 → 帮手 → 走岔 → 回头找 → 交割。
 */
const moments = [
  {
    id: 'night-raid',
    weight: 3,
    // 夜里还在干（二十二点到五点之间有过一格），而且那天撞过好几次墙。
    when: [
      { when: 'hours', in: [[22, 24], [0, 5]] },
      { when: 'fails', gte: 3 },
    ],
    steps: [
      '后半夜他还没吹灯，门框上那道旧符先焦了一角。',
      '他把灯按灭，摸到门边那根抵门的杠子，听着外头踩碎枯枝的动静。',
      '门被撞开的时候他侧身让过去，把头一个掀翻在门槛上。',
      '他退到院子当中背靠着墙，跟扑上来的两个缠了一阵。',
      '墙头有几块瓦片叫那伙人踩掉了，落在院子里的石板上。',
      '天快亮时那伙人退了，他重新把门闩上，坐回灯下把剩下的做完。',
    ],
    // 岔口：那天做得久（四个钟头往上）就守到天亮，否则退走。
    choice: {
      roads: [
        {
          id: 'hold',
          label: '守到天亮',
          when: [{ when: 'minutes', gte: 240 }],
          cost: '第二天一整天睁不开眼，肩背那两下也肿着。',
          marks: ['wound'],
          lines: [
            '他把门闩上，又在门后堆了两条凳子，坐回灯下接着做。',
            '后半夜他没再合眼，天亮前把剩下的那点收了尾。',
            '天亮后他把门后的凳子搬开，院子里的踩痕拿土盖了盖。',
          ],
        },
        {
          id: 'leave',
          label: '退走',
          cost: '他从后墙翻出去，屋里那箱东西没来得及带，全叫翻走了。',
          marks: ['loss', 'fame'],
          lines: [
            '他把箱子拎起来，从后墙翻出去，在邻家借了一宿。',
            '第二天他绕回来看，门框上那道木楔叫人拔走了。',
            '他进屋看见桌子翻倒在地，一叠抄好的纸踩得到处都是。',
          ],
        },
      ],
    },
    close: '那一夜的事他没跟人提过，只在门框上补了一道新的木楔。',
  },
  {
    id: 'mine-cave-in',
    weight: 3,
    // 那天有一格是下矿洞（场景键 `mine`），而且撞过墙。
    when: [
      { when: 'scenes', has: ['mine'] },
      { when: 'fails', gte: 2 },
    ],
    steps: [
      '他在矿道里干到一半，头顶先落下几粒碎石。',
      '他抬头看见梁木弯了，扔下手里的东西就往洞口跑。',
      '他退到石壁跟前，才看清上面刻的是一道封着什么的阵。',
      '身后那一段整个塌下来，风裹着灰从背后推了他一把。',
      '他离洞口不算远，扒开碎石的时候先摸到的是自己的镐把。',
      '他爬出来坐在洞口咳了很久，耳朵里一直响。',
    ],
    // 岔口：那天撞得更狠（四下往上）就回头把洞口封上，否则拎起镐头下山。
    choice: {
      roads: [
        {
          id: 'seal',
          label: '回头把阵填了',
          when: [{ when: 'fails', gte: 4 }],
          cost: '灰吸进肺里，到晚上咳出来的还是黑的。',
          marks: ['wound', 'lore'],
          lines: [
            '他出来以后又折回去，把洞口那几块石头按原样垒上。',
            '石壁上那道阵他没敢碰，只在旁边压了一块新的石头。',
            '下山之前他坐在洞口，把石壁上那几处拐角描在了纸上。',
          ],
        },
        {
          id: 'leave',
          label: '拎起镐头下山',
          cost: '那半天的活白干，镐头也豁了口，那道阵的事他再没提过。',
          marks: ['loss'],
          lines: [
            '他把镐头拎出来，没回头，顺着原路下了山。',
            '那道阵的事他没跟人提，第二天换了另一条矿道。',
            '那条矿道离塌的那处远，他在里头干到天快黑。',
          ],
        },
      ],
    },
    close: '那天回去他把镐头卸下来，第二天又装了回去。',
  },
  {
    id: 'bridge-ambush',
    weight: 3,
    // 那天有一格是问路（场景键 `road`），路上撞过墙。
    when: [
      { when: 'scenes', has: ['road'] },
      { when: 'fails', gte: 2 },
    ],
    steps: [
      '他去问路的那天，走到桥头才看见两个人横在道上。',
      '那两个人不接他的话，其中一个从袖子里抖出一件亮着的东西。',
      '他往后退了半步，把断剑横过来，拍在那人手腕上。',
      '另一个从侧面扑上来，两个人一起把他挤到桥栏边上。',
      '断剑在缠斗里脱了手，顺着桥板滚到水边上。',
      '他挣开的时候肩上挂了一道口子，过桥的路还是让他走通了。',
    ],
    // 岔口：那天做得久（三个钟头往上）就把话带到，否则折回去。
    choice: {
      roads: [
        {
          id: 'cross',
          label: '把话带到',
          when: [{ when: 'minutes', gte: 180 }],
          cost: '肩上那道口子到晚上才止住，那天别的活全停了。',
          marks: ['wound'],
          lines: [
            '他按着肩上那道口子过了桥，把话带到了才往回走。',
            '回去那趟他走的是桥下的浅滩，没再上桥。',
            '浅滩里的石头滑，他到对岸的时候天已经黑透了。',
          ],
        },
        {
          id: 'back',
          label: '折回去',
          cost: '那一趟没走到，话得托别人带，往后他欠了那个人一回。',
          marks: ['debt'],
          lines: [
            '他把断剑捡起来，顺着原路退回去，那一趟没走到。',
            '第二天他换了一条道，把话从别人手里带了过去。',
            '绕那条道多走了小半天，回程他顺着河沿走的。',
          ],
        },
      ],
    },
    close: '过了桥他把衣襟按了按，伤口没止住，路他照旧往前走。',
  },
  {
    id: 'all-nighter',
    weight: 2,
    // 那天坐到后半夜（二十三点到四点之间有过一格），而且总共干了四个钟头往上。
    when: [
      { when: 'hours', in: [[23, 24], [0, 4]] },
      { when: 'minutes', gte: 240 },
    ],
    steps: [
      '那天他一直坐到后半夜，桌上的灯芯剪了两回。',
      '窗纸外头起了风，灯焰歪到一边，他把窗缝塞紧了。',
      '手边那件东西摊开又合上，他一直在改同一处。',
      '砚台里剩的墨不多，他往里兑了点水，接着往下描。',
      '天快亮的时候他停下来，才发觉手指头僵得弯不过来。',
      '他在桌上趴了一阵，起来接着把那处改完。',
    ],
    // 岔口：那天干到六个钟头往上就硬啃到底，否则搁下手。
    choice: {
      roads: [
        {
          id: 'finish',
          label: '硬啃到底',
          when: [{ when: 'minutes', gte: 360 }],
          cost: '那一夜过去，他往后两天都提不起劲，手上的活也慢了。',
          marks: ['wound'],
          lines: [
            '他没睡，天亮以后接着把那一处改到能用。',
            '那件东西交出去的时候，他自己也说不上还差在哪里。',
            '交完那件他往回走，半道上靠着墙歇了两回。',
          ],
        },
        {
          id: 'stop',
          label: '搁下手',
          cost: '那半天算白费，先前改过的几处第二天全划掉了。',
          marks: ['loss'],
          lines: [
            '他把那件东西收进箱子，吹灯躺下。',
            '第二天他重新看了一遍，先前改的那几处又划掉了。',
            '划掉的那几处，他重新照着原先的样子描了回来。',
          ],
        },
      ],
    },
    close: '那几天他睡得不踏实，白天照旧坐在那张桌子跟前。',
  },
  {
    id: 'helpers-come',
    weight: 2,
    // 那天有人搭手，而且中间撞过墙。
    when: [
      { when: 'helpers', gte: 1 },
      { when: 'fails', gte: 1 },
    ],
    steps: [
      '那天来了个人搭手，是先前在镇上认得的。',
      '那个人进门先搓了搓手，才凑到案前看那张图。',
      '两个人把那张图铺在地上，一人按着一头。',
      '中间有一处怎么也对不上，两个人各说了一个法子。',
      '外头下起雨的时候，两个人把那张图往里头挪了半尺。',
      '他们把那处试了两回，屋里的灯一直亮着。',
    ],
    // 岔口：那天撞得更狠（三下往上）就照对方说的改，否则按自己的来。
    choice: {
      roads: [
        {
          id: 'take',
          label: '照他说的改',
          when: [{ when: 'fails', gte: 3 }],
          cost: '他自己那套搁下了，往后几处也照着对方的法子走，心里有几分不服。',
          marks: ['fame'],
          lines: [
            '他把自己那套撇开，照着对方的法子重做了一遍。',
            '那一处合上了，他嘴上没说，手上收得比平常慢。',
            '那个人天没黑就回去了，剩下的半张图他自己接着描完。',
          ],
        },
        {
          id: 'own',
          label: '按自己的来',
          cost: '那一处多花了大半天，那个人后来没再来过。',
          marks: ['loss'],
          lines: [
            '他把自己那套改到能合上，让对方在旁边等着。',
            '那一处是合上了，只是灯点到后半夜。',
            '那个人走的时候没说什么，把带来的东西收走了。',
          ],
        },
      ],
    },
    close: '那张图后来收在箱子底下，两个人的字都在上头。',
  },
  {
    id: 'wrong-turn',
    weight: 2,
    // 那天走过废墟或霜原（场景键 `ruin` / `frost`），路上撞过墙。
    when: [
      { when: 'scenes', has: ['ruin', 'frost'] },
      { when: 'fails', gte: 2 },
    ],
    steps: [
      '他那天往那片地方去，走到一半发觉路不对。',
      '地上的脚印是旧的，风把前面那一段盖住了。',
      '他爬到坡上看了一阵，雾把远处的山尖埋住了。',
      '他往回退的时候天已经暗下来，风比来时硬。',
      '路边的石头上有几道旧刻，看不出是谁留的。',
      '他绕了很远才摸回原路，鞋底磨掉一层。',
    ],
    // 岔口：那天撞得更狠（四下往上）就在岔口立个记号，否则硬往前走。
    choice: {
      roads: [
        {
          id: 'mark',
          label: '在岔口立个记号',
          when: [{ when: 'fails', gte: 4 }],
          cost: '立桩那会儿风把他的手指头冻裂了，回来肿了好几天。',
          marks: ['wound', 'lore'],
          lines: [
            '他在岔口立了根木桩，用刀在上面刻了一道。',
            '往回走的时候他记住了那棵歪树，往后没再走岔。',
            '走过那处的时候他又看了那根木桩一眼，刻痕还清楚。',
          ],
        },
        {
          id: 'push',
          label: '硬往前走',
          cost: '那一趟白走了大半天，回来的路他第二天才认出来。',
          marks: ['loss', 'lore'],
          lines: [
            '他没回头，顺着那条路一直走下去。',
            '走到天黑才看见一处没来过的废屋，那一夜他在里头歇的。',
            '天亮他从废屋里出来，顺着屋后那条小道摸回了原路。',
          ],
        },
      ],
    },
    close: '那一趟他没带回什么，只把路上的几处记在了纸上。',
  },
  {
    id: 'look-back',
    weight: 2,
    // 那天交出去过东西，而且撞得厉害——多半是交出去的东西出了岔子。
    when: [
      { when: 'deliverables', gte: 1 },
      { when: 'fails', gte: 3 },
    ],
    steps: [
      '那天交出去的东西出了岔子，收货的人第二天找回来。',
      '他把先前那几页翻出来，一处一处对过去。',
      '案上摊着底稿与那几页，他拿指头一行一行压过去。',
      '错在一处小的，是他那天赶着交的时候漏下的。',
      '那几页的边角叫收货的人捏出了折痕。',
      '他重做了一遍，亲自送了回去。',
    ],
    // 岔口：那天撞得更狠（五下往上）就认下来，否则推给那天催的人。
    choice: {
      roads: [
        {
          id: 'own',
          label: '认下来',
          when: [{ when: 'fails', gte: 5 }],
          cost: '重做那件他倒贴了工夫，那天别的活全往后挪了。',
          marks: ['debt'],
          lines: [
            '他把错认在自己头上，没提那天赶得多急。',
            '重做那件东西他没要钱，只把字据补了一张。',
            '他把重做的那件送过去，搁在柜上就走了。',
          ],
        },
        {
          id: 'blame',
          label: '推给催的人',
          cost: '那句话传出去，往后找他的人先要问一句期限。',
          marks: ['fame'],
          lines: [
            '他说那天是催得急，漏下的那处没来得及看。',
            '对方没再说什么，字据照旧补了一张。',
            '往后接活他先问一句期限，把日子空出半天。',
          ],
        },
      ],
    },
    close: '那件东西补完，他把先前那几页留着没扔。',
  },
  {
    id: 'delivery-day',
    weight: 2,
    // 那天交出去的不止一件：这一件讲的是把活一次交清的那一天。
    when: [{ when: 'deliverables', gte: 2 }],
    steps: [
      '那天他把几件活一起交了出去，契书盖了印，符纸也点过数。',
      '屋外一直落着雨，水从檐口连成一条线。',
      '收货的人一件一件验过，最后把字据压在他手边。',
      '他把字据折好收进怀里，没多说什么。',
      '柜上的人把几件活收进里屋，门帘随后放下了。',
      '出门的时候天已经擦黑，他扛着空箱子往回走。',
    ],
    // 岔口：那天交出去三样往上，当晚又接了下一件；否则先回家。
    choice: {
      roads: [
        {
          id: 'again',
          label: '当晚又接一件',
          when: [{ when: 'deliverables', gte: 3 }],
          cost: '那一件他做到后半夜才停，第二天照旧得早起。',
          marks: ['debt'],
          lines: [
            '他把空箱子送回去，当晚又去接了下一件。',
            '那几天他手里一直没空过，字据攒了一叠。',
            '那几件活他排在案上，一件一件按着日子送出去。',
          ],
        },
        {
          id: 'home',
          label: '先回家',
          cost: '第二天那件就让别人接了去。',
          marks: ['loss'],
          lines: [
            '他扛着空箱子往回走，到家把灯点上，坐在那儿歇了一阵。',
            '第二天他照旧开工，桌上那几件活排着等他。',
            '他把案上那几件翻了个遍，挑出明天要交的一件。',
          ],
        },
      ],
    },
    close: '那几件活交完，他把空箱子码回墙角，第二天照旧开工。',
  },
]

  return { moments }
})()

const __mod9 = (() => {
/**
 * 交锋：一场仗的**后两拍**（2026-10-08 加，用户 m06647 第 2 条 + 后来的「全做」）。
 *
 * 挨打那一句从前只有一条——「他挨了两下」就完了，读起来不像一场交锋。这一组把那一行补成三拍：
 *   · 主句：`shards[场景].hurt`——他挨了，对手是谁、场地在哪，都在这一句里；
 *   · `hold`：他怎么接住、怎么反手（这一句把「挨打」翻成「交手」）；
 *   · `cost`：这一场付出的代价与收场（伤、丢的东西、脱身的方式）。
 *
 * 门槛只有两条，都是真的（见 `src/client.js` 的 `clashOf`）：
 *   · 这一行**落的是 `hurt` 那一档**——挨打永远只来自真实的 `fails`，没有撞墙就没有这一场；
 *   · 这一天**没有高光事件**——事件本身就是一场仗，一天只讲一件大事，不叠。
 *
 * 键与 `shards` 一一对应（26 个），所以对手与场地必定跟那一行讲的事合得上：抄咒文不会挨马刀。
 * 它跟 `moments` / `dayFrame` 一样**只住在包里**，不在 `src/client.js` 的 `SOURCE_CONTENT` 里抄第二份。
 */
const clash = {
  // 改文件
  spell: {
    hold: [
      '他反手把镇石捺在咒文上，纸面的字立刻平下去，虫子也缩回缝里。',
      '他抄起银墨碗扣住那行字，手腕一沉把它拖进案面的沟里，火头压灭了。',
    ],
    cost: [
      '袖口烧掉半幅，手背那道口子一路裂到腕子，他把断掉的笔杆丢进火里。',
      '他退到门口，把那卷烧剩的咒文塞进怀里，左手三天抬不起来，案上留下一滩黑水。',
    ],
  },
  talisman: {
    hold: [
      '他左手按住符脚，右手把镇石捺下去，那兽在半空散了形，纸面只剩一片焦痕。',
      '他把一叠新符压在那人影身上，反手划亮火折子，连人带影子一并燎成灰。',
    ],
    cost: [
      '肩头的洞烫得发不出声，他把烧到一半的斗篷摔在地上，半叠符纸只剩下一角。',
      '他退到门槛外，用土把案上的火压死，右手指头烧掉一层皮，那罐银墨也洒了。',
    ],
  },
  deed: {
    hold: [
      '他反手把火漆按回缝上，再用尺条压住那片黑，总算把探出来的指头掰了回去。',
      '门里那人劈下一记，他侧身让过，扭住对方腕子，把剑身按在门框上磕开。',
    ],
    cost: [
      '喉口那几道青印肿起来，他把撕坏的契书卷好塞进怀里，门槛上留下一小摊血。',
      '他扶着墙退到巷口，那户人家提剑追出半条街，他丢下一只空囊才走脱，脚踝肿了三天。',
    ],
  },
  map: {
    hold: [
      '他反手把图卷成筒夹在腋下，抬起灯照住那只东西，一步步退到门口才收住。',
      '他把灯油泼在图角那道霜上，火头一窜，霜退了半尺，他抬脚把余下的火星碾灭。',
    ],
    cost: [
      '半截袖子烧穿，手背上的霜痕过了两天才退，他把那卷图压在怀里出了门。',
      '肩头那一记肿成一块硬疙瘩，他缩进柴房挨到天亮，图上那道裂口再没补上。',
    ],
  },
  ruin: {
    hold: [
      '他一记横掼把枯手砸回墙里，随手捡起半块断砖把那个洞口塞死。',
      '石鸦扑到眼前，他抬臂护住脸，另一只手抓了把沙土撒过去，把它们赶回梁上。',
    ],
    cost: [
      '腕上那块皮翻起来，血顺着手背滴进砖缝，他把撕烂的半页残咒塞回袖里。',
      '后颈那几道口子结了痂，他贴着墙根走出废墟，干粮早让石鸦啄光了。',
    ],
  },
  frost: {
    hold: [
      '他一脚把最近那头雪狼踹开，反手抽出鞍边的断剑，横着划开另一头的脖子。',
      '劫道的那人扑到跟前，他偏头让过，抱住对方的腰往桥栏上撞，把人掀下河去。',
    ],
    cost: [
      '肩上那道刀口化了脓，他把受潮的契书摊在火上烤干，字迹还是糊了一半。',
      '他弃了马，拖着腿走进雪里那间塌了半边的石屋，钱袋丢了，那卷东西一直按在胸口。',
    ],
  },
  // 跑命令
  device: {
    hold: [
      '他侧身让开铁翅的一记，反手把石台掀起来压在它身上。',
      '灰影扑到跟前时，他一火把扫进纹路里，顺势把断掉的那截摁回原处。',
    ],
    cost: [
      '他左肩被翅尖豁开，血顺着手腕滴进纹路，他把外套撕了缠上，又把法器扣回石台。',
      '一根手指再也伸不直，纹路补好了，墙根那滩灰里少了他随身带的一块旧符。',
    ],
  },
  gear: {
    hold: [
      '他矮身钻到齿盘底下，一铜锤砸在虫背上，把它钉进齿轮缝里。',
      '石背的东西撞过来时，他横过铁墩架住，顺势把它掀翻在碎石堆上，补了一钳子。',
    ],
    cost: [
      '虎口那道口子裂得更深，他用布条勒紧，把虫尸挑进槽里，机关才重新咬合。',
      '小腿肿起来走不快，他拖着那条腿把矿洞口的碎石码好，铜钳忘在里头没取回。',
    ],
  },
  stove: {
    hold: [
      '他左手压住风箱，右手把铁钳探进去，夹住那截赤红的东西拖出来砸在地上。',
      '赤鳞的兽扑上来时，他抬腿把它踹回炉膛，反手扣上炉门，插销一推到底。',
    ],
    cost: [
      '眉毛烧尽之后他眼皮也合不拢，拿湿布裹住半张脸，还是把那炉火压到青。',
      '一只手背上没有一块好皮，他捡起烧断的钎头，把炉子封住，三天没再点它。',
    ],
  },
  mine: {
    hold: [
      '他把矿灯咬在牙上，两手抓住石梁往上顶，把塌下来的碎石一块块推回缝里。',
      '那个东西再抓过来时，他反手一镐钉进它的掌里，借力把自己拽上高处的岩坎。',
    ],
    cost: [
      '脸上那道口子进了灰，他撕下里衣缠住头，矿灯剩下的油只够照回岔口，他没再往下走。',
      '水没到胸口，他抓住绳索退回坑道，趁那东西沉下去，把塌落的石块填住水口。',
    ],
  },
  quench: {
    hold: [
      '他蹲进浅水里，把缆绳在腕上绕了两圈，绷直了往岸上拖，那件东西跟着挪了半尺。',
      '石桩一歪他就压上身子顶住，另一只手攥紧绳头，硬把那件东西从水里提出水面。',
    ],
    cost: [
      '两只手掌烫得起泡，他把那件东西拖上岸，用沙土埋住，坐到天亮才敢再碰。',
      '小臂上那块皮粘住袖口，他撕开时连血带肉，最后把那件东西扣死在石桩下。',
    ],
  },
  // 翻文件
  scroll: {
    hold: [
      '他等那爪子递到眼前，才把铜尺横过去，一挑断了那截筋。',
      '纸里再拱出一团，他反手拿火折子燎着边角，把它逼回卷轴深处。',
    ],
    cost: [
      '那卷烧掉了半边，他把剩下的纸页按在案上，指腹一层灰。',
      '他退到墙根才觉出腕子发麻，血把绳结浸透了。',
    ],
  },
  shelf: {
    hold: [
      '他反手把最厚的那本砸过去，把虫子压进层板的缝里。',
      '那东西垂下来时他顺势一拽，连人带架掀翻在地，抬脚踩住。',
    ],
    cost: [
      '整层书都塌了，他跪在地上把散开的纸页一本本拢回来。',
      '他扶着墙下到地面，肩上的口子把外衣黏在皮上。',
    ],
  },
  box: {
    hold: [
      '他一手压住箱盖，一手把铁锥楔进缝里，硬把那道口撬了回去。',
      '那东西从底下钻出半截，他抄起火折子点着纸边塞进去，把它堵回箱内。',
    ],
    cost: [
      '箱子烧穿了一个角，他把焦掉的册页一张张揭下来，指尖全黑。',
      '他退到门口才坐下，腿上的口子把布条染透了。',
    ],
  },
  book: {
    hold: [
      '他把灯挪近，就着灯苗烧掉那页角，逼那东西缩回字里去。',
      '亡者扑过来时他侧身让开，反手用手肘把它钉在书架上。',
    ],
    cost: [
      '那页烧没了，他捧着剩下的册子，烟味钻在袖子里散不掉。',
      '他吹熄灯才敢喘气，掌心的口子正一滴滴落在地上。',
    ],
  },
  tower: {
    hold: [
      '他反手把门闩横在阶口，就着那东西冲上来的劲把它别了下去。',
      '那伙人堵住塔门时他掀翻油灯，火顺着木阶烧起来，把路封住。',
    ],
    cost: [
      '塔阶烧塌了两级，他踩着焦木头下到塔底，衣角一路冒烟。',
      '他出塔才停下，膝盖上的血把裤管糊住，走一步拖一步。',
    ],
  },
  watch: {
    hold: [
      '那伙人摸到墙下时他把哨锣砸下去，守夜人从两侧围上，把人按在道上。',
      '他反手用刀背敲在那只东西的颈上，把它掀翻进沟里。',
    ],
    cost: [
      '灯灭了，他摸着墙根退回哨棚，一路数着砖缝。',
      '等到天亮他才低头看，胳膊上的口子已经肿起一道。',
    ],
  },
  // 查资料
  ask: {
    hold: [
      '他一手攥住抡下来的棍子，另一手把最靠前的那个捺到墙上，问出他们替谁看这条巷子。',
      '他认出先前那两个人的走法，趁其中一个转身，从背后按住他的脖子，把话逼到只剩几个字。',
    ],
    cost: [
      '他捂着半边脸挪回住处，箱笼让人翻得底朝天，抄下的东西少了一角。',
      '他把断了的肋骨捆紧，天亮前换了个巷子落脚，再没回那个摆摊的位置。',
    ],
  },
  road: {
    hold: [
      '他抢过拦路的一根棍子，反手扫中那人的膝弯，趁他跪下去的时候冲过岔口。',
      '他把其中一个按在树身上，刀尖抵住下巴，问出往桥头该走哪一条路。',
    ],
    cost: [
      '他拖着一条腿绕开大路走，斗篷削去半边，夜风灌进领口直灌到天亮。',
      '他把肩上的口子拿布条勒紧，走进林子等马蹄声散了才出来。',
    ],
  },
  compare: {
    hold: [
      '他一把抓住吟游诗人挥下来的那只手，腕子反拧过去，压着他把先前的话重说一遍。',
      '他把扑上来的那个捺在地上，膝盖顶住背，问出是谁出的钱要这几张纸闭嘴。',
    ],
    cost: [
      '他捡起被削成碎条的纸，回到灯下拼了半宿，才认出其中几个字。',
      '他手背上那道口子一直淌血，他拿布头缠紧了，仍旧把剩下两家问完。',
    ],
  },
  // 派了活
  crew: {
    hold: [
      '他赶在那头巨兽扑第二下之前横刀挡上去，刃口崩了，人却拦在了那孩子前面。',
      '他把中箭的人甩上自己的背，抽刀割断缠在树上的藤索，一步一步退出了林子。',
    ],
    cost: [
      '回来的时候他肩上两道抓痕见了骨，队里少了两个人，剩下的货他也没有再去取。',
      '他把伤口缠紧，把那头巨兽的尸首留在沟里，第二天照旧点了人出去。',
    ],
  },
  route: {
    hold: [
      '他抽刀挡在最前面，把押货的人一个个拽到身后，硬是把桥口守住了。',
      '他带人回头把堵桥的那伙人冲散，抢回车辕，把断成两截的绳重新接上。',
    ],
    cost: [
      '过桥以后他腿上的箭伤发了炎，押队的少了一个，半车货陷在河滩上没能带走。',
      '他把冻掉半只的耳朵拿布裹住，把死者埋在桥边，当天就带人折回了岔口。',
    ],
  },
  poster: {
    hold: [
      '他把贴出去的纸一把扯下来塞进怀里，回身用扁担压住那人的刀，把人按在墙根。',
      '他追出巷口把人截住，夺回撕走的那半张，反手把火把按在那只兽的眼睛上。',
    ],
    cost: [
      '他的下巴缝了几针，血把前襟糊住，贴出去的纸有一半让人撕走了。',
      '收手的时候他右手腕已经使不上力，村里没人再敢去贴，他换了条路往别处去。',
    ],
  },
  // 聊了聊
  chat: {
    hold: [
      '他抓住醉汉砸下来的酒碗，反手捺住他的脸往桌上磕，磕到桌板响了两声。',
      '他侧身让过那条凳，一把攥住抡凳的手腕，把凳子夺下来磕在柱子上。',
    ],
    cost: [
      '他把掉在地上的牙吐进墙角，捂着肿起来的脸出了门。',
      '他结了自己那份酒钱，扶着墙走到街对面，酒碗让人摔碎在地上。',
    ],
  },
  listen: {
    hold: [
      '他抄起火钳砸在头一个来人手上，又夺下对方手里的短棍反手打在那人小臂上。',
      '他掐住那人的喉咙把他按在墙上，掐到脸紫了才松手，问是谁叫他们来的。',
    ],
    cost: [
      '他扶着讲故事的人从后窗爬出去，背上一片青，弯不下腰来。',
      '断剑在他小臂上划开一道，血顺袖口往下滴，他扯下衣角缠上就走了。',
    ],
  },
  greet: {
    hold: [
      '他一把扯住马缰往回拽，把赶车的从车辕上掀下去，另一个人挨了他一记肘。',
      '他把赶车的胳膊扭到背后，抵在桥栏上，问出他们走夜路惯常往哪边去。',
    ],
    cost: [
      '他胳膊上的口子一直合不上，裹了布头往城外走，回头那兜帽没跟上来。',
      '他把抢下的鞭子扔在地上，扶着树挪出街口，那伙人骂了几句没追。',
    ],
  },
}

  return { clash }
})()

const __mod10 = (() => {
/**
 * 冒险者的事务所 · 方向与比例（2026-10-08 加的，第五十二版）
 *
 * 用户 m07234 第 2 条逐字：
 *
 *   > 比例需要调整，如何才是合理的比例，刚才只是我写的一个例子，请你思考一个方案；
 *
 * 他写的那份例子是「涉险 50 / 攒盘缠 10 / 寻吃食 10 / 过日子 30」。这一版把比例做成
 * **上限**，不是配额——一天落哪个方向由**那天真有没有那件事**决定，上限只负责「不许过多」：
 *
 *   id       label     cap    bias   什么时候轮到它
 *   risk     涉险      50     +7     那天真出过事（fails ≥ 1）
 *   coin     攒盘缠    20      0     那天真交出去东西（deliverables ≥ 1）
 *   food     寻吃食    20      0     那天有过早/晚的钟点（0–8 或 19–24）
 *   hearth   过日子   100     -7     兜底：前面都不轮到，就归它（fallback: true）
 *
 * 三条要点：
 *
 * 1. **`cap` 是天花板**：判的时候看**这一天之前所有日子**里这个方向已经占了多少，
 *    加上这一天会不会超过 `cap`。所以「涉险」最多占一半——日子再多也不会变成连着打仗；
 *    而它也不会被硬凑满（真没事的那天不写涉险）。
 * 2. **`bias` 是一档危险系数**：`risk` 的日子危险加七点、`hearth` 减七点（封顶 55 不变）。
 *    它动的是**世界的规矩**（`src/packs/rules.js` 的 `directionOf`），读的还是记录里真有的东西。
 * 3. **`lines` 是这一天的抬头**：一句话说清这一天朝哪边走，落在日卷那一行的定场句下面。
 *    句子不进 `RULES`，跟 `moments` / `dayFrame` / `clash` / `origin` 一样**只住包里**。
 *
 * 条件用的是**按天看**的项语言（跟高光事件同一套：`hours` / `places` / `scenes` / `outside`
 * 加那几个记录里的信号）。所以这里只挑「一天收得出来」的判据，别拿某一条记录的钟点当门槛。
 */

const directions = [
  {
    id: 'risk',
    label: '涉险',
    // 一半是**上限**：往前所有日子里「涉险」最多占一半，再想涉险也得让给别的方向。
    // 用户 2026-10-08：「我几乎没看到过任何战斗」——所以主档给一半；可一半已经是
    // 「三天两头」，再多就不是日子，是一部连着打的戏了。
    cap: 50,
    bias: 7,
    when: [{ when: 'fails', gte: 1 }],
    lines: [
      '这一天手边总出事。',
      '手上的活返了好几回，做到天黑才收。',
      '一直在补前面的窟窿，补到后半夜。',
      '做的那几样都不顺，一样也没落定。',
    ],
  },
  {
    id: 'coin',
    label: '攒盘缠',
    // 交活拿钱是**真事件**：那天得真交出去东西才轮到它。两成是天花板，
    // 实测里交活的日子远不到两成——上限只是「不许再多」。
    cap: 20,
    bias: 0,
    when: [{ when: 'deliverables', gte: 1 }],
    lines: [
      '这一天他交出去几样东西。',
      '手里进过钱，铜币在袋里响了一路。',
      '把账从头算了一遍，算完又把纸压回抽屉。',
      '手上的活有几样成了，他把做成的摆在案角。',
    ],
  },
  {
    id: 'food',
    label: '寻吃食',
    // 吃得不准时（天还没亮就动手、天黑了还没坐下）是常有的事，两成够用。
    cap: 20,
    bias: 0,
    when: [{ when: 'hours', in: [[0, 8], [19, 24]] }],
    lines: [
      '这一天他吃得不准时。',
      '两顿并成了一顿，剩下的那顿是凉的。',
      '忙到过了饭点才想起吃，碗端起来又放下。',
      '在灶边站了一会儿，又回去接着做。',
    ],
  },
  {
    id: 'hearth',
    label: '过日子',
    // 兜底那一档：**不看条件**（fallback），前面三个都不轮到就归它。
    // 所以它拿到的是「剩下的」，通常是三到五成——正合他写的那份例子里「过日子 30」。
    cap: 100,
    bias: -7,
    fallback: true,
    lines: [
      '这一天跟平常没什么两样。',
      '照旧坐在老地方，一件一件地做。',
      '不急，做到哪儿算哪儿。',
      '没什么事，他做完就歇了。',
    ],
  },
]

  return { directions }
})()

const __mod11 = (() => {
/**
 * 归宿：这一年他是怎么过来的（2026-10-08 加的，第五十四版）。
 *
 * 用户 m08146「全做。」里的第 ⑤ 件，也是这一组的最后一件。前面几层讲的是**一天**
 * （高光事件、岔口、交锋、方向）或者**一个动作**（挨打、交活），这一层讲的是**一整年**：
 * 他这一年干过多少天、撞过多少回、交出去几件、往哪个方向走得多、遇上事的时候多半
 * 走的是哪条路。挑出来的这一件接在**年卷那一行的最下面**，是那一年的收束。
 *
 * 形状：
 *
 *   { id, when?: [...], lines: [...], close: '…' }
 *
 * - `when` 是项语言数组，**每一项都中**才算中；**最后一件不带条件**，前面一件都没轮到
 *   就归它（所以永远挑得出一件）。**顺序就是优先级**，写在下面这个列表里。
 * - `lines` 是这一年的账（三句以上，挑一句说），`close` 是末尾那一句收束——
 *   它**带他的名字**：故事开头那段序曲里叫过一次，这里是第二次，也是最后一次。
 *   所以「名字只在哪儿出现」这条规矩（R15）认的正是这两处。
 *
 * 这一层多认识三个项名（判法见 `../rules.js` 的 `fateHit`）：
 *
 *   { when: 'days', lte: 30 }                            那一年干过多少天
 *   { when: 'direction', has: ['risk'], share: 40 }       那一年落在这个方向的日子占四成以上
 *   { when: 'roads', has: ['hold', 'seal'], share: 50 }   那一年走过的岔口里一半以上是这几条
 *
 * `share` 省掉就是「有这么一天就行」。`hours` / `places` / `scenes` / `outside` 与
 * `fails` / `minutes` / `deliverables` 这些信号照旧认（跟事件那一层同一套）。
 *
 * 条件读的全是**真账**：那一年的年卷自己收出来的东西，加上 `client.js` 按天重算一遍
 * 得到的方向分布与岔口分布。一项都不凭空造，也不读「现在」。
 */
const fate = [
  {
    // 来得少的那一年先说话：一年只落了二三十天，这是那一年最显眼的事。
    id: 'thin-year',
    when: [{ when: 'days', lte: 30 }],
    lines: [
      '这一年他来得少，可每次来都坐到很晚。',
      '来的时候多半是傍晚，桌上的东西还是那几样。',
      '没在这儿待多久，箱子一直没打开。',
    ],
    close: '隔了些日子他又回来了，塔里恩还是坐那个位置。',
  },
  {
    // 撞得最多的那一年：返工、补窟窿，一天一天硬啃下来。
    id: 'kept-at-it',
    when: [{ when: 'fails', gte: 24 }],
    lines: [
      '这一年他撞过不少回，第二天照旧坐下来。',
      '没少返工，桌上的灯常亮到后半夜。',
      '手边的事一件接一件，都是硬啃下来的。',
    ],
    close: '撞得多了也就惯了，塔里恩还在往北的路上。',
  },
  {
    // 地下那一年：矿洞里出过事，他没跟人提。
    id: 'underground',
    when: [{ when: 'scenes', has: ['mine'] }, { when: 'fails', gte: 12 }],
    lines: [
      '这一年他下过几回矿洞，出来的时候身上总是灰的。',
      '往地下跑得多，回来就把自己关在屋里。',
      '矿洞里出过事，那些事他没跟人提。',
    ],
    close: '塌过几回，塔里恩都从底下上来了。',
  },
  {
    // 交出去的东西最多那一年。
    id: 'paid-off',
    when: [{ when: 'deliverables', gte: 10 }],
    lines: [
      '这一年他交出去的东西，够在桌上摆一摞。',
      '手上的活一样样成了，钱也一天天攒起来。',
      '接的活大多做完了，没剩下什么尾巴。',
    ],
    close: '一年下来，塔里恩手里总算攒住了几样东西。',
  },
  {
    // 遇上事多半没退：守到天亮、回头把阵填了、把话带到。
    id: 'held-the-line',
    when: [{ when: 'roads', has: ['hold', 'seal', 'cross'], share: 50 }],
    lines: [
      '遇上事的时候，他多半没退。',
      '守过几回，也把话带到过几回。',
      '撞上的那些事，大半是自己扛下来的。',
    ],
    close: '事都收了尾，塔里恩没留下什么没办的。',
  },
  {
    // 遇上事多半绕开：退走、折回去。
    id: 'walked-away',
    when: [{ when: 'roads', has: ['leave', 'back'], share: 50 }],
    lines: [
      '遇上事的时候，他多半绕开了。',
      '退过几回，退完了照旧回来接着做。',
      '没跟那些事硬碰，换了别的道走。',
    ],
    close: '绕了不少道，塔里恩还是回到了那间屋子。',
  },
  {
    // 往外头去得多那一年（方向分布：涉险占四成以上）。
    id: 'on-the-road',
    when: [{ when: 'direction', has: ['risk'], share: 40 }],
    lines: [
      '往外头去得多，脚上的靴子换了两双。',
      '大半的日子都在路上。',
      '去的地方比往年远。',
    ],
    close: '一直在走，塔里恩把北边那几条道都认熟了。',
  },
  {
    // 守在屋里那一年（方向分布：攒盘缠与过日子合起来占六成以上）。
    id: 'steady',
    when: [{ when: 'direction', has: ['coin', 'hearth'], share: 60 }],
    lines: [
      '大多守在屋里，日子过得不响。',
      '没走远，手上的活一件件做完了。',
      '把桌子坐热了，别处的事没多管。',
    ],
    close: '过得安稳，塔里恩把册子上的圈又描满了几个。',
  },
  {
    // 兜底：前面一件都没轮到，就是平常的一年。它**必须排在最后、不带条件**。
    id: 'quiet-year',
    lines: [
      '没什么大事，他一件一件地做完了。',
      '跟平常一样，天亮动手，天黑收手。',
      '过得不响，桌上的活倒是一件没落下。',
    ],
    close: '没什么可说的，塔里恩照旧坐在灯下。',
  },
]

  return { fate }
})()

const __mod12 = (() => {
/**
 * 痕迹池：那一天挑过的那条路，今天后面每一格怎么说（2026-10-09 加，用户 m01903 第 2、3 条）。
 *
 * 六个痕迹（名字在 `src/packs/rules.js` 的 `MARK_NAMES` 里，一个不许少、也不许多）：
 *   wound 伤 / debt 账 / fame 名声 / gain 得着 / lore 知道 / loss 丢掉
 *
 * 每个痕迹三池，挑的是哪一池由**那一行**决定（见 `src/client.js` 的 `markOf` 与 `rowFor`）：
 *   echo  跟活计无关的那一句——这一行没有世界句也没有生活句时挂它（日卷那一行一定挂一句）
 *   life  掺进起居的那一句——这一行本来要写生活句时，改从这儿挑
 *   world 外头怎么传的那一句——这一行本来要写世界句时，改从这儿挑
 *
 * 三条硬规矩：
 *   一、**只活当天**：痕迹是那一卷（`day:<那天零点>`）挑出来的，一格一格往今天后面铺，
 *       过了午夜就没了——不写进 `records.json`，也不跨天（用户 m01903 第 3 条）。
 *   二、**只从真实行为来**：走的是哪一条路，是 `choiceOf` 按那天真有的信号挑的，这儿只是它的说法。
 *   三、**池子不能薄**：`echo` 至少四句、`life` 与 `world` 各至少两句——同一天十来个格，
 *       薄了就会撞回同一句（规矩 R19 盯着这件事）。
 *
 * 句子口径与别处一样：句号收尾、不带阿拉伯数字、不出现现代词、一句里最多一个「他」。
 */
const marks = {
  wound: {
    echo: [
      '他今天只用一只手干活。',
      '他起身的时候先扶了一下桌沿。',
      '他左肩那处一动就发紧。',
      '他坐着的时候比站着多。',
      '他中间停下来喘了几回。',
      '他握东西时手指头使不上劲。',
      '他今天说话比平常少。',
      '他额角那点热一直没退。',
      '他今天写字的时候肩那处不敢用力。',
      '他抬手之前先活动了一下肩。',
    ],
    life: [
      '他解外衣的时候慢了些，肩那处不敢抬。',
      '他夜里翻了几个身，压着那处就醒了。',
      '他洗漱时避开了伤处，只用凉水擦了擦脸。',
      '他今天睡得早，躺下了也没能立刻合眼。',
      '他解扣子解了好一会儿，屋里灯已经点上了。',
      '他穿衣的时候那只袖子在肩上卡了一会儿。',
    ],
    world: [
      '铺子里的学徒问他那只手是怎么了。',
      '街上有人多看了他两眼，没开口问。',
      '来的人先看了看他的手，才说起自己的事。',
      '隔壁那位妇人让他坐下歇会儿再走。',
      '修书匠看他握笔的姿势，搬了张凳子来。',
      '铺子里的店主瞧见他手上缠的布，先把话头放下了。',
    ],
  },
  debt: {
    echo: [
      '他今天心里压着一件没还的事。',
      '他每回歇下来都要算一算。',
      '他今天不好意思抬头看人。',
      '他手里的东西收得比平常快。',
      '他今天总想着还差着人家一回。',
      '他坐不太住，起来走了两步又坐下。',
      '他今天不敢多耽搁一刻。',
      '他把到了嘴边的话咽了回去。',
      '他今天把该办的事往后挪了又挪。',
      '他今天绕开了那条街，没从人家铺子跟前过。',
    ],
    life: [
      '他吃得很快，像是还要赶去别处。',
      '他夜里躺下又算了算日子，越算越清醒。',
      '他把灯留着没吹，坐在那儿等自己困。',
      '他饭后翻出那张字据又看了一遍。',
      '他洗了脸又坐回灯下，把匣子翻了一遍。',
      '他吹灯之前又朝门那边看了一眼。',
    ],
    world: [
      '镇上有人提起他，说那一件还没交。',
      '铺子里的店主笑着说下回一并算。',
      '街上碰见的那位跟他打了声招呼就先走了。',
      '有人托话过来，让他不必着急。',
      '街上的人说起来，都讲他欠着人家一回。',
      '有人路过门口，问了问他在不在屋里。',
    ],
  },
  fame: {
    echo: [
      '他今天走路的时候背挺得直些。',
      '他听见外头有人提起自己的名字。',
      '他今天对谁都比往常客气。',
      '他做事的时候手比平常稳。',
      '他今天不太愿意出门。',
      '他坐下之前先整了整衣襟。',
      '他心里有点得意，又按了回去。',
      '他今天见了人先点头。',
      '他今天把话说得很慢，像是在挑字。',
      '他今天手上的活做得格外仔细。',
    ],
    life: [
      '他早晨多花了点工夫把胡子刮了。',
      '他睡前把那件外衣叠好压在箱上。',
      '他把屋子收拾了一遍，门口也扫了。',
      '他今天把灯油添满了，屋里一直亮到很晚。',
      '他早上把窗台上的灰擦了一遍，又把凳子摆正。',
      '他今天把外衣翻出来穿上了，衣裳还很新。',
    ],
    world: [
      '街上有人朝他这边指了一下。',
      '铺子里有人说起他，声音压得很低。',
      '有人慕名找上门来，说听过他的名头。',
      '底下几个人交头接耳，看见他便停了。',
      '街口那几个人见了他，把话头转到别处去了。',
      '铺子里的学徒搬了张矮凳，请他到柜台前头坐。',
    ],
  },
  gain: {
    echo: [
      '他今天口袋里多了些份量。',
      '他今天时不时摸一下怀里那件东西。',
      '他今天脚步比平常轻快。',
      '他手里空着的那阵子也在盘算。',
      '他今天吃得比平常饱。',
      '他今天走路的时候手一直没松开。',
      '他今天心里是松的。',
      '他做一会儿就停下来看一眼手边。',
      '他今天总把那件东西挪到手边放着。',
      '他今天做什么都比平常舍得下力。',
    ],
    life: [
      '他晚上把新得的那件东西摆在案上看了半天。',
      '他今天舍得往火里多添两块炭。',
      '他躺下之前把那点东西收到枕边，伸手就能碰到。',
      '他打了点酒回来，就着干肉吃完了。',
      '他把那件东西搁在灯底下，来回翻转着看。',
      '他今天把火盆添得旺，屋里烘得暖。',
    ],
    world: [
      '铺子里的店主问他手里那件东西是从哪儿来的。',
      '有人愿意出价，他摇了摇头没肯出手。',
      '街上有人问他那只牲口喂些什么。',
      '收东西的那位多看了两眼，说这是个好东西。',
      '隔壁的那位来问他肯不肯让出那件。',
      '铺子里的老店主说这东西的油布还是新的。',
    ],
  },
  lore: {
    echo: [
      '他今天想得出神，手上的动作慢了下来。',
      '他今天时不时停下来琢磨一阵。',
      '他低头看了自己的手一会儿。',
      '他心里记下了一样东西，嘴里没提。',
      '他今天走神走了两回。',
      '他嘴上不说，眼里却亮了一下。',
      '他今天把想起的事都攒在心里。',
      '他今天坐得很稳，一坐就是半晌。',
      '他今天做事的时候手停在半道上。',
      '他今天已经跟人说起过那半卷东西。',
    ],
    life: [
      '他睡前在灯下把记得的几处默了一遍。',
      '他起来就着晨光在纸上画了两笔。',
      '他忘了吃饭，碗就搁在手边凉着。',
      '他躺下以后睁着眼想了半宿。',
      '他起来的时候，那本书还摊在昨儿停下的那一页。',
      '他喝了两口汤就放下，抬头看了一会儿梁。',
    ],
    world: [
      '镇上那位老人听他说完，点了点头。',
      '有人来问他认不认得某处的一道阵。',
      '铺子里的学徒说往后有问路的就带来找他。',
      '收东西的那位说这种事得问懂行的人。',
      '来的人问他那半卷东西上写的是什么。',
      '镇上有位妇人说自家孩子认得那种刻痕。',
    ],
  },
  loss: {
    echo: [
      '他今天把屋里翻了两回，也没找着。',
      '他今天手边像是空了一块。',
      '他今天做什么都提不起劲。',
      '他今天提起话头又咽了回去。',
      '他今天坐得比平常久，做得比平常少。',
      '他今天总觉得少了点什么。',
      '他今天把那点气憋在心里。',
      '他今天看什么都不太顺眼。',
      '他今天做什么都要先停一停。',
      '他今天把话说到一半就停住了。',
    ],
    life: [
      '他打翻了一次水，拿布擦了半晌。',
      '他今天没心思生火，就着凉的吃了点干粮。',
      '他把灯点着又吹了，来回两趟。',
      '他坐着一直没动，直到火盆里的炭灭了。',
      '他早起把铺盖叠好了，屋里的灯一直没点。',
      '他把手边那几样东西挪了位置，灯芯一直没拨。',
    ],
    world: [
      '铺子里的店主说那件活已经让别人接了去。',
      '街上有人问起丢的那件东西，他摇了摇头。',
      '来的人说他要的那样已经没了。',
      '隔壁那位问他怎么空着手回来。',
      '来的人说那件东西早让旁人拿了去。',
      '隔壁那位说家里那条狗也不见了。',
    ],
  },
}

  return { marks }
})()

const __mod13 = (() => {
/**
 * 战斗：一场仗怎么打（2026-10-10 加的，用户 m14888「他必须有战斗」）。
 *
 * 用户原话：「唯一的缺点，就是极度缺少战斗，我真的两眼一黑。他必须有战斗。」
 * 查过真存档：三十二条记录、一百零九个「记录 × 动作」对里**挨打的有五十八个**——
 * 战斗并不稀，稀的是它在屏幕上**只有一句话**。所以要改的是**形状**，不是开关：
 * 从前那一层（`clash`，两拍、没有对手、没有胜负）留着不用，这一层顶上来。
 *
 * 一场仗**四到六拍**：
 *
 *   meet   遭遇   —— 他怎么撞上这一伙／这一头
 *   way    应对   —— 他拿什么对付它（断剑当棍子、火、符墨、短咒、地形）
 *   trade  交手   —— 一来一往，会挨（中档两拍、大档三拍）
 *   turn   失算   —— 每场至少有一处是他算错了或没算到（只有大档单说）
 *   end    收场   —— 他退到哪儿、对面退了没有、他留下了什么
 *
 * 三档（`tiers`，兜底那一档排最后、不带条件）：
 *
 *   大  ｜ 撞墙六次以上 ｜ 交手三拍 ＋ 应对 ＋ 失算 ＋ 收场  ⇒ 七拍
 *   中  ｜ 撞墙两次以上 ｜ 交手两拍 ＋ 应对 ＋ 收场          ⇒ 五拍
 *   小  ｜ 兜底         ｜ 交手一拍 ＋ 收场                 ⇒ 三拍
 *
 * 五种对手（`foes`，**顺序即优先级**，最后一个不带条件的是兜底）：
 *
 *   死了的东西  夜里 ＋ 废塔／乱石岗／矿洞底下   —— 不怕刀剑，怕火与碑上的字
 *   拦他的人    交过东西 ＋ 坐够两个钟头        —— 不杀他，只要那本册子
 *   雪狼        霜原那一景                      —— 成群，咬腿
 *   荒原上下来的人  夜里八点到早上六点          —— 成队，用重家伙
 *   劫道的      兜底                            —— 人多，先围后抢
 *
 * 判条件的是 `../rules.js` 的 `fightOf(facts, fights, ctx)`（第十一台机器）——
 * 读的还是记录里真有的东西（撞墙次数、坐了多久、交出去几件、走过哪一景、什么钟点），
 * 没有掷点、不读「现在」：同一份记录永远打同一场仗。校验：R20。
 *
 * `report` 是**日卷那一行的战报**（`{n}` 会换成汉字数字）——折叠之后，
 * 更早的日子收成一卷，战斗要照样看得见，就靠这一句。
 */

const fights = {
  // 五种对手。**最后一个不带 `when`**（谁都没轮到的时候就归它）。
  foes: [
    {
      id: 'dead',
      label: '死了的东西',
      when: [{ when: 'hours', in: [[22, 24], [0, 5]] }, { when: 'scenes', has: ['tower', 'ruin', 'mine'] }],
      meet: [
        '他在废塔底下生火，火头忽然往一边歪，风是从塔里出来的。',
        '他走进乱石岗，脚下那层霜比别处厚，踩下去吱的一声。',
        '一盏灯歪在碎瓦上，他弯腰去捡，手里那盏先灭了。',
        '他闻到一股土腥味，跟着味找过去，看见矿洞口有新鲜的脚印。',
        '他在碑前描字，描到一半笔尖冻住，听见身后有人踩着碎石走过来。',
        '他数了碑上的旧痕，再回头时只看见一片影子挪了过来。',
      ],
      way: [
        '他把火折子甩在青苔上，火顺着草根爬开，那影子退到光外面去。',
        '他照着那道痕描了一道短咒，刚一描上，指尖就冷得像浸在水里。',
        '他把油浇在碑座上点着，火苗立起来一人高，那头的东西停在火圈外头。',
        '他退进石屋顶死门，只当那东西不会开门，墙皮先掉了一片。',
        '他蹲在碑后头照着字念短咒，念到半截嘴皮就咬不住了。',
        '他举着燃着的树枝一步步挪，把它逼回墙角，自己贴着火苗往前蹭。',
      ],
      trade: [
        '他抡起断剑砍过去，剑从它身上穿过去，什么也没碰到。',
        '他低身让开那只手，可脚下一凉，鞋底让什么东西咬住了。',
        '他把火把往它脸上递，它不躲，反倒把那点火吸得矮下去。',
        '他一记短咒拍在它胸口，掌心立刻全白了，胳膊也抬不起来。',
        '他把断剑横在身前顶住，剑身一寸寸结霜，手很快就麻了。',
        '他退了两步才发觉后头是墙，那影子已经贴到墙上。',
        '他侧身闪进石缝，肩头蹭上那东西，整条胳膊立刻没了知觉。',
        '他把剩下的油全泼过去点着，火里那东西站着没有动。',
      ],
      end: [
        '他退回塔底最后一间石室，灯只剩一盏，就搁在门板上。',
        '他把断剑插在门口，拿符墨在门框上描了一道歪的，指头冻得发僵。',
        '天亮前那东西散了架似的缩回墙里，他没敢过去看第二眼。',
        '他守着那点火坐到天亮，油尽了，碑上的字才看清一半。',
        '他摸黑爬出矿洞，洞口那盏灯早就灭了，底下再没有动静。',
        '他退到碑跟前靠住，等到日头出来，那东西没有跟过来。',
      ],
    },
    {
      id: 'hired',
      label: '拦他的人',
      when: [{ when: 'deliverables', gte: 1 }, { when: 'minutes', gte: 120 }],
      meet: [
        '矿洞口有人背着光站着，手里摊开一张写了字的纸。',
        '废弃塔底下拴着三匹马，鞍上还挂着没卸的包袱。',
        '官服那人把话说得很客气，眼睛却落在他腰上。',
        '他推门进旅店，靠里的桌上三个人一齐站起来。',
        '岔口上有人等他，开口先问了名字。',
        '后半夜有人敲了两下窗，他握刀坐起，院里已经站了两个。',
      ],
      way: [
        '他把那本册子压进怀里，先退半步，没有拔剑。',
        '他抽出断剑横在窄口上，把门堵住。',
        '他拧开符笔的盖子，在地上划了半个圈。',
        '他背靠墙角站住，让对面只能一个个上来。',
        '他在墙下喊了一声，说这里出了事，人越聚越多。',
        '凭据被扯到地上，他顺势踩过去，从那道缝里冲了出去。',
      ],
      trade: [
        '刀背磕在他肩上，人撞进墙里，册子却还压在怀里。',
        '他侧身让过一记直刺，回手一肘顶在那人肋下。',
        '册子挡了一下刀锋，封皮上多出一道痕。',
        '符笔被打飞出去，他滚到地上伸手去捞，背上挨了一脚。',
        '一只手从胸前探过来抓册子，他低头咬住，咬到那人不撒手。',
        '他横剑逼退半步，两个人却同时压上来，胳膊让人从背后扣住。',
        '几个人从墙后绕过来，把他从街心挤到檐下。',
        '他往后撤，脚跟踩进坑里，断剑在胳膊上划开一道长口。',
      ],
      end: [
        '册子一直压在怀里，他退到驿站门口用背抵住门扇。',
        '对面看了他一眼就上马走了，没有再动刀。',
        '他在废塔底下过的夜，册子压在背下一直没松手。',
        '那把断剑丢了，册子还锁在怀里。',
        '他拿布条把胳膊绑紧，趁天没亮从后门出去。',
        '那伙人翻过册子认不得字，只扯走一页包着东西的皮纸。',
      ],
    },
    {
      id: 'wolves',
      label: '雪狼',
      when: [{ when: 'scenes', has: ['frost'] }],
      meet: [
        '他在岔道口站住，雪面上绕着一圈爪印，狼群早围上了。',
        '头一头雪狼从坡上走下来，后头又跟出两头，摆开了口子。',
        '回头一看，雪地上一排黄眼睛，最近的那头离他不到十步。',
        '他听见雪里咯吱一声，两头从岔道口绕到背后，路堵住了。',
        '他捡起火把往前照，火光里立着三头雪狼，脊背都弓着。',
        '他以为后头只有一头，回头才看见那几串爪印一直没断过。',
      ],
      way: [
        '他把火把横在身前晃了两下，头一头往后缩了半步。',
        '他退到火堆边上，狼群蹲在光圈外，谁也没敢先动。',
        '他抓了把石头砸过去，打中头一头的嘴，狼群散开一圈。',
        '他把断剑当棍子抡开，砸在头一头的肩上，那截剑又崩掉一块。',
        '他把火把插在雪里，背对着一块大石站定，腿后头有了依托。',
        '他把火把丢进那堆枯枝，火窜起来封住坡口，自己才退开。',
      ],
      trade: [
        '头一头扑到腿上，他拿剑柄往下砸，砸开那张嘴才抽回腿。',
        '另一头咬住小腿不放，他反手把火把按在它鼻子上才松口。',
        '他被两头夹在当中，肩头挨了一记，整个人撞在石头上。',
        '他踢开最前面那头，断剑横着扫过去，只划开一层皮。',
        '狼群转着圈逼他退，火把扫出一条路，袖口让牙扯破了。',
        '他退到坡上才发现雪下面全是冰，一只脚滑出去，膝盖磕在石头上。',
        '他把火把甩进狼群里，火星散开，自己反倒被逼到雪坑边上。',
        '那头咬住小腿就往外拖，他拿火把塞进那张嘴里，才挣出一条腿。',
      ],
      end: [
        '狼群散开以后，他拖着那条腿退到坡上的大石后头。',
        '他退回岔道口，火把只剩半截，狼群远远跟着没再靠近。',
        '天快亮时狼群才走，火堆烧成灰，他扶着石头站起来。',
        '他丢下那半截断剑退进林子里，两头狼留在雪地上没追。',
        '他把火堆重新拨旺，坐到天大亮，狼群在外圈蹲了一夜。',
        '火快弱下去时，那几头雪狼已经被他引到坡的另一边去了。',
      ],
    },
    {
      id: 'orcs',
      label: '荒原上下来的人',
      when: [{ when: 'hours', in: [[20, 24], [0, 6]] }],
      meet: [
        '哨墙上的人先看见北边亮起来，那不是星。',
        '他以为先来的只有一股，坡后却还在往上冒火把。',
        '狗先不叫了，风里飘着灯油味，他才知道来的是谁。',
        '石堡上敲了三下钟，来的那一队却不往堡里去，只往火边凑。',
        '他在坡底听见成片的脚步，火把一串串往哨口压。',
        '头一支火把插在哨门口时，那把断剑还冻在鞘里。',
      ],
      way: [
        '他一脚把火堆踢散，火星子顺着坡往上来的人身上扑。',
        '他把灯油泼在哨门口，火顺着门槛烧成一道线。',
        '断剑只剩半截，他拿它当棍子，专砸膝盖骨。',
        '他在刃上划了道短咒，铁面结起一层白霜，砍上去发涩。',
        '坡太陡，队形散在半坡，他趁机挪到哨墙背风的地方。',
        '他没想到对面也带了火，那罐油泼出去，先烧着的是自家哨墙。',
      ],
      trade: [
        '头一个扑上来，他侧身让过，剑背砸在对方膝弯上。',
        '第二把斧落下来，他抬剑去架，虎口裂了，剑差点脱手。',
        '他被两个人夹在门框里，背上挨了一记锤，半天喘不上气。',
        '火把扫过来，他用胳膊一挡，袖子烧着半幅，滚到地上才压住。',
        '他一脚踹开扑上来的人，自己也跟着摔进灰里。',
        '那半截断剑磕在石头上崩了口，他只剩手里一截木柄。',
        '短咒把门顶住，门外的斧一下接一下，他靠着门板数着数着就数不清了。',
        '他算错了人数，退路被堵死，只能贴着哨墙慢慢挪。',
      ],
      end: [
        '他退进哨里顶死门，天亮时外头只剩两行踩乱的脚印。',
        '火堆只剩一小把红炭，他用土盖住，连烟都压细了。',
        '他缩在哨墙后头挨到天光，数了数剩下的箭，不到十支。',
        '那一伙退回裂牙荒原，火把一路散开，最后并成一点。',
        '石堡的人下来得太晚，他才明白那三下钟不是给堡里报的。',
        '天亮后他捡回那只空油罐，哨墙上留着一道深斧痕。',
      ],
    },
    {
      id: 'brigands',
      label: '劫道的',
      meet: [
        '河湾的芦苇一晃，四个人从两边站起来，领头的伸手要他的囊。',
        '荒路拐过土坡，三把刀已经从坡上下来，正堵在他和灰港之间。',
        '商队刚走，地上剩着草屑和断绳，一伙人把扁担横在他前头。',
        '他在河边洗那把断剑，抬头时岸上多了五条影子，钩竿先伸过来。',
        '他抄近道过桥，桥那头有人吹了声口哨，两边蹲着的人一齐站起来。',
        '他只顾盯住前头那个人，没想到后头还有人，箱笼先被扯住。',
      ],
      way: [
        '那把断剑只剩一截，他抡起来当棍子，磕在头一个人的腕上。',
        '他点着松明往芦苇里一送，枯苇窜起火头，那伙人先往两边散。',
        '他抠开符墨罐，把墨抹在剑身上，那截铁上起了一层暗纹。',
        '他把火把插在土坡上，影子拖得老长，那伙人一时不敢近。',
        '他退到桥栏杆后头，只露半张脸，用那截断剑一下一下往外拨。',
        '他抢过那根长竿当棍使，没料到竿头有倒钩，虎口先被划开。',
      ],
      trade: [
        '头一个扑上来，他侧身让过，剑背砸在那人膝弯上。',
        '他反手一棍打空，肩上挨了一记扁担，人往后坐倒。',
        '两把刀从左右压下来，他矮身滚到车底，车轮先替自己挡了两下。',
        '他一脚踢散火堆，火星子糊了那人一脸，那人的刀也掉了。',
        '钩竿勾住衣领，把整个人往河边拖，他一手抓住桥柱才停住。',
        '他退了两步，后腰撞在摊板上，一罐符墨从怀里滚出去。',
        '他抡断剑扫开一圈，自己胳膊也被划了一道，血滴在土里。',
        '他盯着前头那把刀，没防住旁边那根棍，后脑挨了一下。',
      ],
      end: [
        '他退进河湾的苇丛里，听见有人踏水过来，手心里全是汗。',
        '他把断剑插回腰间，箱笼留在道上，里头那点干粮被人分了。',
        '大路上亮起两盏灯，那伙人先撤了，他扶着桥栏慢慢挪回村子。',
        '他数了数，对面走了四个，地上留着一只钩竿和半根扁担。',
        '他以为天亮前不会再有人来，回头一看，坡上那点火把还亮着。',
        '他空着手回到镇上，守夜的人照见肩上的口子，也没多问。',
      ],
    },
  ],
  // 三档。**最后一个不带 `when`**（兜底）。`trade` 是交手几拍，`way`／`turn` 要不要那两拍。
  tiers: [
      { id: 'big', label: '大',
        when: [{ when: 'fails', gte: 6 }],
        trade: 3, way: true, turn: true },
      { id: 'mid', label: '中',
        when: [{ when: 'fails', gte: 2 }],
        trade: 2, way: true, turn: false },
      { id: 'small', label: '小',
        trade: 1, way: false, turn: false },
  ],
  // 失算那一拍（大档才单说一句）：每场至少有一处是他算错了或没算到。
  turns: [
    '他算错了对面的人数，退路让人先堵上了。',
    '他想着把东西护住，忘了身后那堵墙早塌了一半。',
    '他以为火能把那东西挡在外头，风一转向就吹了回来。',
    '他顾着前头那一个，没听见旁边那道门自己开了。',
    '他伸手去够那罐符墨，才发现罐口在坡上就磕裂了。',
    '他把灯留在外头，等想起来的时候，那点光已经没了。',
  ],
  // 日卷末尾那句战报（`{n}` 是这一天打了几场，走 `countWord`）。
  report: [
    '这一天他打了{n}场，回来的时候身上添了两处伤。',
    '这一天有{n}场仗，没有一场是干净利落地收的。',
    '他这一天遇上{n}回，手里的火把用得只剩一截。',
    '这一天打了{n}场，册子还在，别的东西丢了几样。',
    '{n}场下来，他记着的是哪一处是自己没算到的。',
  ],
}

  return { fights }
})()

const __mod14 = (() => {
/**
 * 当日计划与册子上的路（2026-10-10 加的，用户 m14781/m14933 那一轮）。
 *
 * 用户 m14781：「我们需要按照一个人的一天来写，一个人在一个魔法世界里，他要如何度过一天，
 * 他有怎样的规划，他是什么人设……」m14933 又把根换了：「他有一个终极任务也是人生任务，
 * 一个终局，这一路上，他要生活、要调查、要寻找、要保护，也要一路杀过去。这样他才能走完
 * 整个大陆，到处奔波。」
 *
 * 这一份管的就是**那一天他手上有什么**（见 `叙事/一天的骨架.md` 第四节）：
 *
 *   1. `stations` —— 册子上的**十一站**（路线，也是主线进度条）。顺序即路线。
 *      每站带一个 `when`（同一套项语言），判的是**这一天真到过哪儿**：走得最远的那一站
 *      就是他今天在的那一站。**第一站不带条件**，是兜底——他总得有个起点。
 *   2. `lossAt` —— 每描一处，**他身上少一分**（一年梦见北边 / 十年听不见南边的话 /
 *      一辈子的人最后自己走到那儿去）。分三段：站号到了哪一段，就说哪一段那一句。
 *   3. `plans` —— 那一天他手上那几件事，与**季节**（路有季节性：北边的路只有夏秋能走、
 *      海路看季风、荒路冬天走不得）。这是「一年那条钟」，**日历算出来的，不需要跨天记忆**。
 *
 * 为什么站号能算出来：存档只留今天（用户 m01403「旧日子删除」），所以**不许**靠「昨天走到第
 * 几站」往后推。判法是照方案 A 的老办法——**只看今天**：今天到过银树书库，今天就在册子上
 * 那一站；今天下了矿底，就往后再走一站。走得最远的那一处说了算。
 *
 * 装进面板的是 `JOURNEY`（`../index.js` 的 `applyPack`），判站的是 `../rules.js` 的
 * `stationOf`，攒状态的是 `src/client.js` 的 `dayPlanOf` 与 `stateAt`。
 */
const journey = {
  // 册子上的十一站。**顺序即路线**，第一个不带 when（兜底：他总有个起点）。
  //
  // `label` 必须是**这张地图上真有的地名**：`src/map/world3.js` 那二十国、那几条地貌名里
  // 查得到的那一个（面板上那枚地名签、地图上那块牌子读的是同一份数据）。2026-10-31 修过一处：
  // 第九站原来写「霜脊荒漠」——全仓只有这一处这么写，地图上并没有这个地名，真名是**龙骨荒漠**
  // （`world3.js` 的国家名与地貌名都是「龙骨荒漠」；「霜脊」是北边那道山脉，与荒漠是两处）。
  //
  // `when` 判的是**这一天真到过哪儿 / 真见过哪一景**（`stationOf` 只看今天，不靠跨天记忆）。
  // 早几站可以用镇内那几处——河间城、银树书库、铁砧山本来就在他这一带（他的屋子就在河间王国边上，
  // 书库与作坊是他天天去的两处）；再往后才是出镇之后才走得到的地方。所以口径不是
  // 「只认野地」，而是「**这一站该在哪一处落脚，就挂那一处**」——镇内、野地、某一景都行。
  //
  // 硬规矩：**两站的条件不许等价**。`stationOf` 是**从最后一站往前**找第一个条件全中的，
  // 所以两站条件等价时，靠前那一站**永远轮不到**。2026-10-31 之前 `sunken`（灰港/沉桥）与
  // `sea`（珊瑚海国/海底）都挂 `quench`（河湾）：去一趟河湾两站同时成立，而 `stationOf` 先问
  // 靠后的 `sea`，于是**靠前的 `sunken`（第六站）一次都没出现过**——册子上那一站等于不存在，
  // 人还没出海，海底先亮了。现在十一站各靠一处/一景，没有一站的落点被后面那站整个盖住
  // （冒烟里逐站验「可达」，另有一条判「不许两站被同一组地方绑死」）。
  //
  // 十一站各自的落脚处（左边是册子上的地名，右边是今天真去过的那一处）：
  //   界碑镇（兜底）· 河间城←他的屋子 · 银树书库←档案塔 · 铁砧山←地下矿洞（山底那口竖井）
  //   北境霜堡←霜原 · 灰港←废塔（他在那座塌了半边的塔下过了一夜，往南就是海口）· 东岸商盟←东岸货栈
  //   鸦林←古林书斋（林子里的抄写室）· 龙骨荒漠←乱石岗（骨堆就散在乱石之间）
  //   珊瑚海国←河湾（唯一的水路）· 灰烬之地←撞墙/交出东西
  //
  // ★ 两件事别弄混：**站点的输入**是 `places` / `scenes`（他今天真到过哪儿），**「他此刻在哪」**
  //   是 `src/client.js` 的 `ACTION_PLACE`（改文件→scriptorium、跑命令→workshop……）。
  //   `workshop`（炉边作坊）自 2026-10-31 起**不再挂任何一站**——这不是漏配：铁砧山那处封印
  //   是「井」，竖井直下矿底，挂 `mine` 才是那个地方；作坊只是他白天干活的一处屋子，
  //   用来算「他在哪儿」，不用来推册子。七个地点不必人人都有站，站也不必都落在野地。
  stations: [
    { id: 'stone', label: '界碑镇', seal: '碑' },
    { id: 'bridge', label: '河间城', seal: '石桥', when: [{ when: 'places', has: ['home'] }] },
    { id: 'tree', label: '银树书库', seal: '树', when: [{ when: 'places', has: ['archive'] }] },
    { id: 'well', label: '铁砧山', seal: '井', when: [{ when: 'places', has: ['mine'] }] },
    { id: 'coffin', label: '北境霜堡', seal: '石棺', when: [{ when: 'places', has: ['frost'] }] },
    { id: 'sunken', label: '灰港', seal: '沉桥', when: [{ when: 'places', has: ['tower'] }] },
    { id: 'bell', label: '东岸商盟', seal: '旧钟', when: [{ when: 'places', has: ['market'] }] },
    { id: 'half', label: '鸦林', seal: '半句话', when: [{ when: 'places', has: ['scriptorium'] }] },
    { id: 'bones', label: '龙骨荒漠', seal: '骨堆', when: [{ when: 'scenes', has: ['ruin'] }] },
    { id: 'sea', label: '珊瑚海国', seal: '海底', when: [{ when: 'places', has: ['quench'] }] },
    {
      id: 'ash',
      label: '灰烬之地',
      seal: '总封印',
      when: [{ when: 'fails', gte: 6 }, { when: 'deliverables', gte: 1 }],
    },
  ],
  // 站号到了哪一段，他身上的那一分就说哪一段。这是**弧光**，不是奖励。
  lossAt: [4, 8],
  losses: {
    early: [
      '他这些天夜里总梦见北边，醒来记不住梦见了什么。',
      '他早上起来，手心还留着按过指印的那点墨。',
      '他这两天话少了些，手边的活还是照旧做。',
    ],
    mid: [
      '他近来听南边口音的人说话，得让人再说一遍。',
      '他有时候半夜醒来，先摸一摸枕边那本册子。',
      '他手上的墨印洗不掉了，看着像旧伤。',
    ],
    late: [
      '他近来常想着往北走，也知道走了就回不来。',
      '他不太记得南边那些镇子叫什么了。',
      '他走路的时候总偏着北边那一点。',
    ],
  },
  plans: {
    // 那一天他手上那几件事：{n} 是件数，{place} 是册子上那一站，{seal} 是那一处封印的样子。
    plan: [
      '他今天手上有{n}件事，头一件是把{place}那一处的{seal}描上。',
      '这一天他有{n}件事要办，最要紧的是{place}那一处{seal}。',
      '他把{n}件事排了排，先办{place}，{seal}上的字得重新描一遍。',
      '他手上有{n}件事，头一件在{place}，把{seal}描上。',
      '这一天他记着{n}件事，头一件在{place}，是{seal}那一处。',
      '他今天要办{n}件事，第一件是{place}的{seal}。',
    ],
    // 一年那条钟：路通不通，一半是季节替他定的（见 `叙事/一天的骨架.md` 4.3）。
    season: {
      spring: ['雪化开，路能走了，他挑了条近道。', '开春水涨起来，河湾那一段得绕。'],
      summer: ['日头长，他一天能多走一程。', '夏天路干，正是赶路的时候。'],
      autumn: ['秋天短，他得赶在封路前把北边那一段走完。', '叶落下来，路上的商队比前些日子多了。'],
      winter: ['北边的路封了，这一程他只能先往南绕。', '海路停了，这个冬天没人出海。', '天冷，他走一天也见不着几个人。'],
    },
  },
}

  return { journey }
})()

const __mod15 = (() => {
/**
 * 命运：他走到那儿，事情压下来了，你得替他定一条。
 *
 * 用户 m16528 三条原话（附一张截图，两枚按钮下面各写着一行「代价：…」）：
 *
 *   「1、这种选择，不叫命运。……也就是，代价远远不足以这个选项成为一个需要用户思考的东西，
 *     以至于用户一看就知道随便选就是了，反正没什么影响。什么叫真正的命运？比如决定朝哪个
 *     方向走，一个叫"魔窟"，一个叫"暗堡"，都给一点点环境描述……于是用户完全不知道接下来的
 *     命运，也许一边会遇到巨龙，一边会掉下悬崖；比如遇到一伙人正在追捕某个暗精灵，那么决定
 *     是出手帮助暗精灵，还是干脆也截杀暗精灵。这样的才叫命运，你现在给的都是日常，都很随意，
 *     都无足轻重。
 *    2、其次，代价是不可知的，选都还没选，结果却已经知道了，那么命运就成了既定。
 *    3、命运要影响接下来一整天的后续活动。」
 *
 * 用户 m16534：「你对命运没有想象力，无论是进入魔窟还是暗堡，那么危机是什么？就是轻轻松松
 * 出来了？冲突在哪里，危机在哪里。我们时刻要保持《故事》的写作理念。」
 * 用户 m16541：「我要求你直接写战斗和过程，为什么你总是避免战斗？」
 * 用户 m16548：「可以把角色写死……从用户选完到读完后续，主角就死了，今天后面的时间，都不会
 * 再出现他的冒险了。整个右半边界面，就是已死亡。」
 * 用户 m16552：第二天重新开始、他**不记得**；「我们所有的文案内容，其实是一本书的结构」，
 * 岔口选对了书往下讲，选错了就是**分支**——要么死亡，要么回到主线上来。
 *
 * 所以这一层跟 `moments.js` 里那八件**不是一回事**，两样东西别混：
 *
 *   · `moments`（高光事件）是**日记的取材范围**：他今天在桌子边干了什么，余波落在那一卷下面。
 *   · `forks`（命运）是**路上的危机**：他走到一个岔口，两条路，他得选一条，后面跟着一整段。
 *
 * 六条硬规矩（这是 **R22**，机器读法在 `../rules.js` 的 `checkForks`）：
 *
 *   1. **每条结果都是一场危机**：踏进去 → 撞上阻碍 → 当场得定一件两头都不好的事 → **鸿沟**
 *      → 留下一个新处境。四到九拍。
 *   2. **每一条结果里都得有交手**（塌方、火、河那三种没有对手的危机除外）——「会输」的意思
 *      是**打了而且输了**，不是不打。谁先动手、他拿什么、对方怎么打、他哪里吃亏、谁站着，
 *      都得写出来。
 *   3. **不许轻松收场**：要么付出东西，要么留下一个没解决的问题，要么知道一件让他更走不掉的
 *      事。**他可以输**，也可以死。
 *   4. **危机只能从世界的病与那五种对抗力量里出**（劫道的 / 拦他的人 / 荒原上下来的人 /
 *      雪狼 / 死了的东西），外加火、塌方、河这三种没有对手的。
 *   5. **鸿沟写进句子里**，不许旁白解释——「他以为烧着了就完了，火灭了东西还在黑里站着」。
 *   6. **两条路只有一条是主线那一支**（`kind: 'main'`），另一条是**分支**（`kind: 'branch'`）。
 *      走到分支上，要么**死**（`then.die`），要么**绕回主线**（`then.back`）——绕回来要付代价。
 *
 * **按钮上只写地名与眼前那一句，一个字的账都不写**（用户第 2 条）。所以这里**没有 `cost`**：
 * 旧的那层（`moments.js` 的 `roads[i].cost`）把账摊在挑之前，那是把命运写成算术题。
 *
 * **两边都得有分量，而且都不显然对**（用户 m04344 原话：「现在的命运选择也是没有代价或者叫没有
 * 份量的，因为像现在一个救那箱纸、一个救人，那不是就是让人去救人吗？也就是选择没有意义，因为
 * 根本不会两难。」）。所以：
 *
 *   · 一条路上压着的人或事，得**跟另一条一样重**——「他自己的几页纸」轻不过一条命，那就不是
 *     选择题，是明摆着的答案；重量相当，才有取舍。
 *   · **两边各有一个让他不该走这条的理由**，写进各自那两句 `look` 里：另一条路上那个人，得
 *     有不值得救的具体理由（正是刚才想抢他东西的那伙人）；这一条路上那箱东西，得是不救就真
 *     没了的东西（一整村人托他描的名册）。
 *   · **按钮的词只说去哪儿、做什么，不说该不该**。「别管」「见死不救」这种词等于替用户把答案
 *     写好了（R22 现在会当场报错，见 `scripts/packs.mjs`）。
 *
 * 写法照句库那几条：陈述句、句号收尾、不用阿拉伯数字、不用现代词、不感叹、不劝，第三人称
 * 「他」，一句只说一件事、一句一行排着往下说；对手一律无名指代，不给他们起名字，也不写
 * 「怪物」「敌人」这种统称。**R8 不许引号**，所以对话只能转述。
 *
 * 顺序就是优先级：几件的条件同时中的日子，排在前面的先讲。重的排前面。
 */

const forks = [
  {
    id: 'way',
    // 方向：荒地里走了有一段路，路分了两股。
    weight: 3,
    when: [
      { when: 'scenes', has: ['ruin', 'frost', 'tower', 'watch', 'mine'] },
      { when: 'minutes', gte: 90 },
    ],
    look: ['路到这儿分了两股，一股钻进石堆里，一股贴着一堵塌了半边的墙往里。'],
    roads: [
      {
        id: 'cave',
        kind: 'branch',
        label: '魔窟',
        look: [
          '左边那股口子边上全是碎石，石缝里透出一点湿气。',
          '往里看什么也看不清，只有风从里头出来。',
        ],
        outcomes: [
          {
            id: 'death',
            when: [{ when: 'fails', gte: 4 }],
            beats: [
              '他往里走了半里，风声忽然停了。',
              '火把往前一探，照见一层骨头，码得整整齐齐。',
              '骨头里有一节撑起来，比他高出一头，旧国的号衣上挂着霜。',
              '他把火把往前递，那东西退了半步，他本该趁这一下退出去。',
              '他往前追了一步，那行字就在它背后的石壁上，他想看清。',
              '那东西的手穿过火，抓住他的脖子，火把掉在地上。',
              '他听见自己的骨头响了一声，很轻。',
              '黑下来的最后一瞬，他看见了石壁上那行字的后半句，十一处里，只有这一处不用描。',
            ],
            marks: [],
            then: { die: true },
          },
          {
            id: 'lose-arm',
            when: [{ when: 'fails', gte: 2 }],
            beats: [
              '他往里走了半里，风声忽然停了。',
              '火把往前一探，照见一层骨头，一根压着一根，码得整整齐齐。',
              '骨头上没有啃过的印子，像是有人一块一块摆上去的。',
              '骨头里有一节撑起来，比他高出一头，身上是旧国的号衣。',
              '他把火把往前递，那东西退了半步，原来它怕火。',
              '他抡起断剑劈过去，剑弹回来震得虎口发麻，它一把抓住他的小臂。',
              '他把火把塞进它领口，号衣烧起来，那东西退进黑里；火在地上滚了两下，灭了。',
              '退到洞口他才敢看，小臂上四道口子；那半卷符墨在打的时候丢了。',
            ],
            marks: ['wound', 'loss'],
            then: { tier: 2, lost: ['符墨'] },
          },
          {
            id: 'worse-truth',
            beats: [
              '最里头那面石壁上刻着一行字，是描咒人的路数。',
              '他刚凑近，身后一道黑影压过来，号衣上挂着霜。',
              '他往旁边一滚，火把脱了手，手在石缝里摸到那截断剑。',
              '那东西扑过来，他把剑横着顶上去，剑刃卡在肋骨里。',
              '它一挥胳膊，他撞在石壁上，耳朵里嗡的一声。',
              '他抓着剑柄不撒手，另一只手捞起火把塞进它领口。',
              '火起来，那东西退进黑里，一路撞着石头。',
              '他扶着墙站起来才看清，那行字底下刻着一个小名字，瓦兰，四十天前。',
              '后半句他记住了，十一处里，只有这一处不用描。',
            ],
            marks: ['lore', 'wound'],
            then: { tier: 2 },
          },
        ],
      },
      {
        id: 'keep',
        kind: 'main',
        label: '暗堡',
        look: [
          '右边那股贴着一堵塌了半边的墙，墙后头是个圆形的土堡。',
          '堡子没有顶，里头黑得看不清台阶。',
        ],
        outcomes: [
          {
            id: 'miscount',
            when: [{ when: 'fails', gte: 2 }],
            beats: [
              '火光在第三层，他贴着墙往下挪，脚下踩到一块松的石头，响了一声。',
              '底下的人不说话了，有一个人往上走，脚步很稳，一级一级。',
              '他把火把按灭，摸到石缝里那截断剑，退到拐角后面等。',
              '那人上来，从拐角过去，他从后面一棍砸在后颈上，人倒了。',
              '可那一声闷响在堡里传得很远，底下立刻乱了。',
              '有人往上冲，有人在念咒，一道白亮的光顺着台阶爬上来，照亮了半面墙。',
              '他从侧面那道裂缝挤出去，肩膀蹭掉一块皮。',
              '他后来才知道那道咒是冲他来的。那几个人是商盟雇的，要的是他怀里那本册子。',
            ],
            marks: ['lore', 'wound'],
            then: { tier: 2 },
          },
          {
            id: 'three-out',
            beats: [
              '他摸着墙下到第三层，前头有火光，先到的人不止一个。',
              '他们说的是旧国的话，其中一个转过脸，看见了他。',
              '瘦子举着短棍扑上来，他侧身让过，拿断剑横磕在对方手腕上，刀掉了。',
              '第二个从侧面撞过来，把他顶在墙上，他抬膝顶开，肩膀还是让人划开一道。',
              '第三个没有上来，站在后头念了一句短的，他认得那是符咒的路数。',
              '他抓起地上那根短棍掷过去，念到一半的那句断了。',
              '三个人退进里头那道门，把门带上。',
              '他没有追，门后头的脚步声不止三个。',
              '一路退到堡外的林子里他才敢喘气，那天剩下的路他绕着堡走的。',
            ],
            marks: ['wound', 'fame'],
            then: { tier: 2 },
          },
        ],
      },
    ],
  },
  {
    id: 'meet',
    // 遭遇：林子里有人在追人，他正好撞上。
    weight: 3,
    when: [
      { when: 'scenes', has: ['road', 'quench', 'ruin', 'watch'] },
      { when: 'fails', gte: 1 },
    ],
    look: [
      '前头林子里有动静，一伙人正把一个人按在地上。',
      '按人的那几个袖口上有公会的号衣，绳子和令状都拿在手里。',
    ],
    roads: [
      {
        id: 'stop',
        kind: 'main',
        label: '横到路当中',
        look: [
          '被按住那人脸贴着土，脖子上的绳子已经收紧了一圈。',
          '那几个人是按着令状拿人的，他这一横过去，就是他在拦公会的人。',
        ],
        outcomes: [
          {
            id: 'failed',
            when: [{ when: 'fails', gte: 3 }],
            beats: [
              '他磕开那一刀，第二个已经绕到了他背后。',
              '后背挨了一下，他膝盖磕在地上。',
              '被按住那人趁乱挣开绳子，往林子里跑，跑出去十几步。',
              '后头一支弩箭把他钉在树上。',
              '他爬起来，把断剑抡圆了扫开两个人，退进林子。',
              '那天夜里他坐在树底下，一直听着后头有没有脚步。',
            ],
            marks: ['loss', 'wound'],
            then: { tier: 2 },
          },
          {
            id: 'saved',
            beats: [
              '他横到路当中，把断剑横着端起来。',
              '头一个举刀就劈，他侧身让过，断剑磕在对方手腕上，刀飞出去。',
              '第二个绕到侧面，一根短矛扎过来，他抬手挡，矛尖从袖子里穿过去，把袖子钉在肩膀上。',
              '地上那人挣开绳子，一把火撒在他们中间，火苗贴着地窜起来。',
              '他趁这一下把人拖进路边的沟里，那几个人没有追，站在火那边看着。',
              '他后来才看清，那人袖子底下也有一道烧穿的印子，和傍晚在街口抢他册子的那伙人是同一种。',
            ],
            marks: ['fame', 'wound'],
            then: { tier: 2 },
          },
        ],
      },
      {
        id: 'pass',
        kind: 'branch',
        label: '先看清来路',
        look: [
          '那人手边落着一把刚用过的刀，刀刃上的血还没干。',
          '那人往他这边看，嘴在动，像在喊什么。',
        ],
        outcomes: [
          {
            id: 'turned-back',
            when: [{ when: 'minutes', gte: 180 }],
            beats: [
              '他往路边让了半步，把帽檐压低，看那几个人把人往哪条路上拖。',
              '走出去不到一里，那几个人从后头追上来，把他围在路当中。',
              '他拿断剑挡了两下，胳膊上挨了一记，怀里的册子被扯出去半截。',
              '他死死按住那半截，另一只手把火把按到最近那个人的脸上。',
              '那几个人退开一条缝，他顺着那条缝冲出去，一口气跑过两道坡。',
              '等到没人追了，他才发现册子的封皮被撕掉了一角。',
            ],
            marks: ['wound', 'loss'],
            then: { back: true },
          },
          {
            id: 'dragged',
            beats: [
              '那几个人从他身边过去，追进了林子。',
              '他刚要往前走，那几个人又回来了。',
              '其中一个指着他，说这个也看见了。',
              '他没等对方说完就动了手，断剑磕开最前面那把刀，往路边的沟里退。',
              '滚下沟他爬起来往林子里跑，后头一支弩箭扎在他旁边的树干上，箭杆还在抖。',
              '跑了很久他停下来，才发现怀里那半卷符墨没了。',
            ],
            marks: ['loss'],
            then: { tier: 2, lost: ['符墨'] },
          },
        ],
      },
    ],
  },
  {
    id: 'pick',
    // 取舍：火里有一箱别人的名册，梁底下压着一个人。这一场没有对手，火就是对手。
    weight: 3,
    when: [
      { when: 'places', has: ['home', 'workshop', 'scriptorium', 'archive', 'tavern'] },
      { when: 'hours', in: [[18, 24], [0, 6]] },
    ],
    look: [
      '前头那间屋子已经烧起来了，火从窗口往外舔。',
      '门里有人在喊，喊的不是救命，喊的是名册。',
    ],
    roads: [
      {
        id: 'papers',
        kind: 'main',
        label: '先搬那箱名册',
        look: [
          '箱盖上烙着柳溪村那一处的记号，一村子人的名字都在里头。',
          '梁底下那人袖口的印子跟街口抢他册子那伙人一样，他认得。',
        ],
        outcomes: [
          {
            id: 'papers-out',
            beats: [
              '他冲进去把箱子从火里拖出来，箱子角烧穿了。',
              '里头一沓纸的边都焦了，字还在，柳溪村一百多户的名字都在这上头。',
              '回头再看，那根梁已经塌下去，底下没有动静了。',
              '他跪在箱子边上，把烧焦的边一张一张掐掉。',
              '那天夜里他梦见梁底下那人在叫他的名字，他不知道那人怎么会知道他叫什么。',
              '第二天他把那箱册页摊开，中间有一页只剩半边，那一页写的是柳溪村西头那几十户。',
            ],
            marks: ['loss', 'lore'],
          },
        ],
      },
      {
        id: 'man',
        kind: 'branch',
        label: '先撬那根梁',
        look: [
          '那人半边脸是血，一只手还撑着梁，看着他。',
          '案上那箱册子再烧一阵，柳溪村一整村的名字就没了。',
        ],
        outcomes: [
          {
            id: 'man-out',
            beats: [
              '他把那根梁撬起一条缝，把人拖了出来。',
              '那人的腿断了，一路上没有吭声，眼睛一直盯着他怀里。',
              '他回头去拿那只箱子，火已经把那一角吞了。',
              '他只捞出来半箱，柳溪村西头那几十户的册页卷成了灰。',
              '那人接过箱子翻了两页，说这箱名册本来就该归公会。',
              '他没去抢，站在那儿看着火，把剩下那半箱摊在灯下。',
              '有几页只剩开头两个字，认不出是谁家的。',
            ],
            marks: ['loss', 'gain'],
            then: { back: true },
          },
        ],
      },
    ],
  },
]

  return { forks }
})()

const __mod2 = (() => {
/**
 * 冒险者的事务所· dsh-gameflow 内容包
 *
 * id=adventure  kind=world  voice=adventure  free=true
 *
 * 世界层：场景与拼句池、词表、熟人、世界句、道具词、生活句、动作落在哪个地方。
 * 地理（取景框、七个地点的坐标）在 ./world.js，地图本体**运行时现画**——
 * 从 ../../map/world.js 拿（那是 `.scratch/terrain.py` 的等值移植，跟 `world3` 同一套数据），
 * 不再读 `src/map-data.js` 那份预先画好的 545 KB 内联字符串。见下面 `map` 槽位。
 * 「挨一下」那些句子（HURT_PATCH）已经在模块加载时并进 shards 的各场景 hurt 里，不再单列。
 *
 * 2026-10-06：这一份已经接线（client.js 的顶层 import + 装载块 + build-client 的两层内联）。
 * 只有 `map` 与 `places` 是这一天新加的槽位：以前取景框与地点坐标写死在 client.js 里。
 * 2026-10-07：地图从「内联一张画好的」改成「现画」——`mapSvg()` 记着结果，所以只画一次。
 */

const { mapSvg, MAP_CSS } = __mod3
const { view, places, theme, tagline, cover } = __mod7
// 高光事件（2026-10-08 加，用户 m06647 第 2 条）：有些日子不该只落一句话。
// 数据在 ./moments.js，读它的机器在 ../rules.js 的 `momentOf`。
const { moments } = __mod8
const { clash } = __mod9
const { directions } = __mod10
const { fate } = __mod11
const { marks } = __mod12
const { fights } = __mod13
const { journey } = __mod14
const { forks } = __mod15

const adventure = {
  id: 'adventure',
  name: '冒险者的事务所',
  kind: 'world',
  free: true,
  voice: 'adventure',
  // 界面上写着的那几个字（「故事风格」后面那个名字）。2026-10-06 用户第 2 条：
  // 「现在我们叫『冒险』的这个故事风格，要改名为『奇幻冒险』」——只改这个显示名，
  // id 与 voice 是内部记号（地图、地名、存储里记着的 id 都认它们），一个字不动。
  label: '奇幻冒险',
  // 这个世界的样子：地图、取景框、地点、默认主题。两样地理**必须成套**
  // （框是照着这张图裁的，坐标是照着同一张图钉的），校验器 R11 管这条。
  map: { view, svg: mapSvg(), css: MAP_CSS },
  places,
  theme,
  tagline,
  cover,
  actionLines: {
    改文件: '他在案前抄一段古咒，抄到第三遍又划掉了。',
    跑命令: '他在院子里试那件法器，试了三回还没顺。',
    翻文件: '他在旧卷轴堆里翻一句话。',
    查资料: '他问过三处，说法都不一样。',
    派了活: '他托人出去打探，自己守着摊子。',
    聊了聊: '他在窗边跟人闲聊，没什么正事。',
  },
  words: {
    改文件: ['抄咒文', '誊符纸', '改契书', '补地图', '誊古卷'],
    跑命令: ['试法器', '调机关', '修炉子', '装符石', '开炉'],
    翻文件: ['翻卷轴', '找旧记载', '上架子', '搬箱笼', '查旧册'],
    查资料: ['打听', '问路', '探消息', '访旧人', '对说法'],
    派了活: ['托人跑腿', '捎话', '分派路线', '贴悬赏'],
    聊了聊: ['闲聊', '搭话', '听人说', '叙旧'],
    深夜: ['深夜', '夜里'],
    很晚了: ['入夜', '夜深'],
    坐了很久: ['久坐', '长坐'],
    一小会儿: ['打个转', '片刻'],
  },
  sharedLines: {
    away: '他出门去了，这会儿不在。',
    asleep: '他趴在桌上打盹。',
    lateness: '别人都睡了，他那扇窗还亮着。',
    fleeting: '他回来拿了个东西，转身又走了。',
    longSit: '他从下午一直坐到灯快没油。',
    idle: '他还在那儿，手没停。',
    quiet: '那天他没什么动静。',
    satLong: '他一个人坐了很久。',
  },
  homeLines: [
    '他回去就着黑面包吃了几口，又出门了。',
    '他把斗篷解下来，在门槛上坐了一会儿。',
    '他回去睡了一觉，天没黑就醒了。',
    '他在灶边热了碗汤，顺手把灯拨亮。',
    '他把箱笼里的东西倒出来，重新收拾了一遍。',
    '他回去添了件衣裳，把刀在石头上蹭了两下。',
    '他坐在床边把当天的路在心里过了一遍。',
    '他灌了壶水，靠在门框上歇了歇。',
  ],
  scenes: {
    改文件: [
      {
        key: 'spell',
        w: '抄咒文',
        lead: [
          '他在案前抄一段古咒，笔尖烧得发烫',
          '他把同一段咒文誊到一张新羊皮上',
          '他蘸了银墨从第一行重新往下写',
          '他照着旧抄本把断了的一行补上',
          '他把石板上刻的咒文对到纸上一遍',
          '修书匠把那页羊皮推回来，说缺的那个字他写不上',
          '他从一沓羊皮里挑出最平的那张，铺在案上',
          '他把写废的那几页揭下来，换一张重新起头',
        ],
        tail: [
          '抄到一半，灯油短了一截',
          '划掉的字比留下的多',
          '笔尖顿了顿，又落下去',
          '写完他把纸挪到一边搁着',
          '窗外的光从纸边挪到了案角',
          '写到一半划掉大半行，他把笔搁下又拿起来',
          '银墨用完了，后半页他改用淡墨',
          '灯油熬到见底，最末一行他写得比前头小',
          '案上那盏灯添过两回油，纸面还是发暗',
          '写到后半页，垫在纸下的旧页让笔尖划穿两处',
        ],
      },
      {
        key: 'talisman',
        w: '誊符纸',
        lead: [
          '他在灯下给一张符纸改笔画',
          '他把符纸压在镇石下面照着描',
          '他换一支细笔把符脚补齐',
          '他把画废的符纸揭下来重铺一张',
          '他拿一道旧符样对自己的笔画',
          '镇石底下压着的符纸只剩薄薄一沓',
          '他把符纸一张张按平，数过数目才收进匣子',
          '他挑出还能用的那几张，裁齐了压书的石镇底下',
        ],
        tail: [
          '银墨调得太稀，笔画洇开了',
          '画到后来才有一张像样',
          '他把废的那几张卷起来压住',
          '灯下的纸边卷了个角',
          '风从窗缝进来，纸角抖了抖',
          '画到第四张手才不抖，前几张都烧在了炭盆里',
          '有一张被风掀起，他追到门口才踩住',
          '描到末一笔灯花爆了一下，纸面留下一星焦痕',
          '炭盆里的火快灭了，末一笔是就着灯补完的',
          '画废的那几张单搁在一处，上头压着块小石头',
        ],
      },
      {
        key: 'deed',
        w: '改契书',
        lead: [
          '他把一卷旧契书摊开逐字改',
          '他在契书行间添上漏掉的两个字',
          '他把写错的一行用刀刮掉重写',
          '他对着底稿把契书逐行核过',
          '他在契书末尾落上自己的火漆',
          '行商把契书摊开指着末尾，说这一条得照旧例',
          '他把火漆在火上烤软，重新按了一道印',
          '他借着窗光把契书翻过来，看背面写的什么',
        ],
        tail: [
          '最后留下的是改过的那一版',
          '改到末尾，他把两页对在一起',
          '刮过的地方透光，他换了张纸',
          '写完他把契书压在一摞书下',
          '他把改完的那一卷搁在桌角',
          '封口那枚火漆他按了两回才按圆',
          '写到一半手一抖，墨点落在落款上',
          '对完两遍天已经黑透，还剩末尾三行没核',
          '改到后半晌，纸角让手捏出一圈印子',
          '刮刀钝了，换了片新刃接着刮',
        ],
      },
      {
        key: 'map',
        w: '补地图',
        lead: [
          '他趴在桌上补一张破了角的地图',
          '他沿着旧线把断掉的一段描上',
          '他拿尺子比着把河道往北挪',
          '他在图边补上两个没标名字的村子',
          '他把补好的那块举起来对光看',
          '那张地图在桌上摊了许久，边角压着块石头',
          '他把地图铺开，拿两块石头压住两边',
          '他照着旧图把北边那道山脊重新描了一遍',
        ],
        tail: [
          '图角的破口他用浆糊粘住了',
          '尺子滑了一下，新描的那道歪出纸边',
          '他把新描的线对着旧图比了比',
          '挪过的那一段怎么看都不对',
          '他吹干墨，把图卷起来收进筒里',
          '断掉的那一段他补了三回，还是没接上',
          '描到南边才发现，这一角已经没处落那条支流',
          '对照旧图的时候有两处对不上，他先用炭笔画了个圈',
          '炭条断在纸面上，他只好换一根接着描',
          '尺子挪开以后，新线跟旧线差着半指',
        ],
      },
      {
        key: 'ruin',
        w: '描残咒',
        lead: [
          '他翻过那道乱石岗，照着墙上那行旧咒往下描',
          '他拿炭条把风化掉的那半截咒脚补上',
          '他贴着石壁找那行被苔盖住的起首字',
          '他把墙灰扫开，认底下刻的到底是哪一年的事',
          '他用袖口擦过刻痕，辨出底下还压着一层更旧的笔道',
          '他绕着乱石岗走了半圈，从北边那道缺口翻进去',
          '他把火把插在石缝里，腾出手来描墙上那行字',
          '他顺着墙根摸过去，找那行咒的头一个字',
        ],
        tail: [
          '墙头那层浮土被风刮下来，刚描的那行又糊了',
          '崩掉的一角他够不着，垫着碎石往上探',
          '火把烧到末了，剩下半行他只用指甲划了道浅印',
          '墙根那口枯井里起了响动，他停了手没再往下描',
          '末一笔他手上发颤，歪出了半指，就那样留在墙上',
          '墙上那行咒下面还压着半行更小的字，他没敢描',
          '火把上的火星落进衣领，他抖了抖肩才接着往下描',
          '苔底下那半行描了两回，第二回才认出笔画',
        ],
        place: 'ruin',
      },
      {
        key: 'frost',
        w: '送契书',
        lead: [
          '他把那卷契书揣进怀里，往霜原上走',
          '他牵着驮马踏过结冰的浅滩，往北边那个镇子去',
          '他在霜原上照着车辙走了大半日，天没黑就先扎了营',
          '他把那卷东西裹进油布里，又垫了一层干草',
          '他拿火镰敲了三下才点着篝火，就着火把绳子解开又系紧',
          '他出门那天北边霜脊山脉压着一层云',
          '他把油布裹好的那一卷塞进驮袋，牵着牲口出了镇',
          '他在雪地里踩着前头的脚印走，一步比一步浅',
        ],
        tail: [
          '雪落了一夜，第二天他踩着没膝的雪往北接着走',
          '过河的时候冰裂了一道缝，他把驮袋先拎过去，再回来牵那匹牲口',
          '天黑下来他还没看见镇子的灯，就着背风的石堆歇了一夜',
          '镇子外那道木栅关着，守门的翻过落款才肯开一条缝',
          '交出去的时候封口的火漆路上蹭掉了一角，收货的人捏着看了半天',
          '夜里他在背风处点了一小堆火，火光里雪片是斜着落的',
          '雪又下起来，兜帽压得更低了些',
          '走到后半夜，前头那道车辙让风盖平了',
        ],
        place: 'frost',
      },
    ],
    跑命令: [
      {
        key: 'device',
        w: '试法器',
        lead: [
          '他在院子里试那件法器',
          '他把法器摆上石台再点一次',
          '他用袖子擦过法器的边又试了一回',
          '他把法器翻过来看底下的纹路',
          '他退开三步朝法器抬了抬手',
          '看院子的老人说，这法器少了一道引路的刻线',
          '他把石台周围的雪扫开，把那件法器摆正',
          '他拿燧石敲了两下，石台边上那圈纹路才亮起来',
        ],
        tail: [
          '法器响了一声，光只闪了半下',
          '石台上落了一层薄薄的霜',
          '法器的那一圈热起来，他松了手',
          '试到日头偏西还是没亮',
          '他把法器包进布里抱回屋',
          '燧石敲了三回，那圈纹路才勉强亮起半道',
          '石台裂了道细缝，他蹲下来看了很久',
          '亮过之后那一圈烫得厉害，他倒扣在雪里',
          '亮过一阵又暗下去，石台上只剩一圈白印',
          '试到天黑，院子里落下薄薄一层霜',
        ],
      },
      {
        key: 'gear',
        w: '调机关',
        lead: [
          '他蹲在机关前把齿盘对了一遍',
          '他把机关拆开摊了一地零件',
          '他捏着最小的那块零件往槽里塞',
          '他给齿盘上了油再装回去',
          '他趴在机关上听齿盘咬合的声音',
          '他托人提着灯照了半天，说少了一片垫片',
          '他把齿盘按原位套回去，试着手转了两圈',
          '他在灯下把零件挨个擦过，按大小排开',
        ],
        tail: [
          '齿盘咬上，那件东西安静下来',
          '零件摆了一地，他蹲着挨个认',
          '他把手在围裙上擦了两遍',
          '有块零件掉进缝里，他摸了半天',
          '齿盘转到一半，卡住了',
          '装到一半多出一片，他捏着看了半天',
          '齿盘咬住的那一下他停了手，没敢再往下转',
          '手背让铁屑划了道口子，他用围裙按住接着装',
          '转到第二圈齿盘又卡住，铁屑落了一案',
          '零件排了一桌，到末了还是短一片垫片',
        ],
      },
      {
        key: 'stove',
        w: '修炉子',
        lead: [
          '他蹲在铁匠铺的炉边添了把炭',
          '他把风箱拆下来通了一遍',
          '他拿铁棍把炉膛里的灰捅开',
          '他把炉口那圈松了的砖重新砌上',
          '他在院子里生起火试着烧一炉',
          '老铁匠把风箱递给他，说这炉子漏气',
          '他把炉膛里积的炭灰掏出来，装了半筐',
          '他蹲在炉前拿铁棍把堵住的那块捅松',
        ],
        tail: [
          '炉子凉了，他还盯着看',
          '烟从缝里冒出来，呛得他直咳',
          '火苗窜起来又压下去',
          '他把炭添满，等着水开',
          '炉膛红了一阵，慢慢暗下去',
          '火起来一阵，他半边袖子燎了个口子',
          '炭添到第三筐烟还是倒灌，他退到门外站着',
          '火苗窜了半尺高，他退了半步，没敢再添炭',
          '火起了一阵又压下去，烟还是往屋里倒',
          '风箱拉杆上的皮条断了一截，火苗就没了劲',
        ],
      },
      {
        key: 'mine',
        w: '下矿洞',
        lead: [
          '他顺着矿洞口的木梯下到第二层，脚底下尽是积水',
          '他点起火绳去照底下那台铁家伙，头一截湿了不肯着',
          '他蹲在坑壁边把辘轳上的绳子重新绕好',
          '他拿铁钩去挑卡在轮槽里的碎石',
          '他把矿灯挂在撑木的钉子上，腾出两只手',
          '他顺着矿道往下走，壁上那些旧刻痕一路跟着',
          '他把火绳在矿灯里换了一截，顺着木梯往下',
          '他蹲在坑口把辘轳轮槽里的碎石抠出来',
        ],
        tail: [
          '机关转起来又停在原处，底下的水照旧往上渗',
          '他把塌下来的土培回去，木架还是歪的',
          '灯芯烧到发暗，他就着那点光把铁环又敲紧了些',
          '水没退下去，他先爬上坑口去换了一筐新火绳',
          '他坐在坑沿上听底下的水声，听出下面还有一层是干的',
          '底下那截坑道他走了一半就退回来，灯里的油不多了',
          '底下那层的水又漫上来，干的那截越来越窄',
          '灯里的油下去一半，铁环又敲紧了一道',
        ],
        place: 'mine',
      },
      {
        key: 'quench',
        w: '拖法器',
        lead: [
          '他把那件走火的法器用粗麻布裹住，一路拖到河边',
          '他挑了河湾里水最深的一处，先拿长竿试了深浅',
          '他把两头的绳子拴在岸边的石桩上',
          '他蹲在河滩上听那件东西里的响动，隔着布还烫手',
          '他退到柳树后面，等那圈纹路自己暗下去',
          '他把那件法器拖到河湾，浸到水里试了一回',
          '他把那件东西用麻布多裹了两层，绳扣打紧',
          '他拿长竿把那件东西往河心推，竿头一直烫手',
        ],
        tail: [
          '水面上冒起一串泡，他退回岸上盯着看',
          '那圈光从布底下漏出来，河底的沙一动一动，像底下还压着什么没走',
          '埋进去半尺他就托不住了，绳子在石头上磨出毛边',
          '河面结了薄薄一层冰，第二天早上他把冰面凿开一条口',
          '他把剩下的半卷粗麻布扔在岸上，那件东西还在水里响',
          '水面浮起一层白气，散开以后河湾又跟平常一样',
          '水面上的白气散开，布底下那圈光暗了一格',
          '绳头系在石桩上，人退到河滩那头蹲着',
        ],
        place: 'quench',
      },
    ],
    翻文件: [
      {
        key: 'scroll',
        w: '翻卷轴',
        lead: [
          '他在旧卷轴堆里翻一句话',
          '他把一摞卷轴摊在桌上',
          '他抽出最上面那一卷摊平',
          '他借着窗口的天光挨卷看过去',
          '他把受潮粘住的纸页一张张揭开',
          '常来的行商说，这种卷轴只在南边见过一回',
          '他把架上的卷轴一摞摞搬下来，摊在长案上',
          '他把卷轴上的绳结解开，慢慢往外展开',
        ],
        tail: [
          '翻到一半，窗外起了风',
          '要找的那一句始终没露面',
          '最后把翻出来的都摞回原处',
          '纸页脆得一碰就掉渣',
          '他把挑出来的那几卷抱到亮处',
          '纸边划过指头留了道口子，他在袖口上蹭了蹭接着翻',
          '翻过的那些他没卷回去，桌上堆成一片',
          '找了一下午，最末一卷连绳都没解',
          '纸页发脆，一翻就掉下些碎渣',
          '翻到日头偏西，要找的那一行还是没见着',
        ],
      },
      {
        key: 'shelf',
        w: '上架子',
        lead: [
          '他爬上梯子去够最上面那一层',
          '他钻进藏书塔最里那一排架子',
          '他把架子从上到下捋了一遍',
          '他踩着梯子横档探身往里摸',
          '他把顶层那几只匣子搬到地上',
          '梯子横档上积了一层灰，看着没人踩过',
          '他把梯子往那排架子跟前挪了半步，踩着横档上去',
          '他抱着顶层取下的匣子蹲在架子跟前，逐个翻看',
        ],
        tail: [
          '架子晃了一下，他扶住横档',
          '架上空出来的位置他记住了',
          '梯子挪了半步，他脚尖点地',
          '他从梯子上滑下来磕了膝盖',
          '略高的那一层他够着了才下来',
          '最上一层他踮脚够了三次才够着',
          '挪位的时候脚下一滑，他攥住架子才站稳',
          '顶层那只匣子扣着暗锁，钥匙早不知去向',
          '梯子横档压得吱了一声，架子跟着晃了晃',
          '匣子里装的都是旧纸，绳子一碰就断',
        ],
      },
      {
        key: 'box',
        w: '搬箱笼',
        lead: [
          '他把落了灰的箱笼一只只搬下来',
          '他用绳子把两只箱笼捆在一起',
          '他把箱笼拖到门口就着光翻',
          '他掀开箱盖拍掉上头的灰',
          '他把箱笼一只只码到墙角',
          '新来的短工说，最底下那几只没人动过',
        ],
        tail: [
          '箱笼底下压着一块旧布',
          '灰扬起一片，他眯了眯眼',
          '绳子松了，箱笼砸在地上',
          '最底下那只箱笼上着锁',
          '他拍掉手上的灰才起身',
          '箱笼底磨穿了，铜扣滚到墙根',
          '绳子这次系得牢，他还是多打了一个结',
          '搬到第三只听见里面有响动，他停下来晃了晃',
        ],
      },
      {
        key: 'book',
        w: '查旧册',
        lead: [
          '他抱来一摞旧册坐在门槛上',
          '他一手按着册子一手往下翻',
          '他把册子摊在膝上对着看',
          '他从册子后头往前倒着找',
          '他把折了角的那一页先挑出来',
          '那摞旧册的封皮已经烂了一半',
        ],
        tail: [
          '册子合上，他把页角压平',
          '翻到后半本，字迹淡了',
          '门槛上坐久了，他挪了挪',
          '他把要找的那一页折了个记号',
          '最后一页缺了，他没往下翻',
          '对着看了一晌，页边被他掐出个印子',
          '翻到中间掉出半张旧纸，边上的字他认不出',
          '夹在页间的一条布带露出来，上头的字已经花了',
        ],
      },
      {
        key: 'tower',
        w: '翻塔册',
        lead: [
          '他钻进那座塌了半边的塔，踩着断梁爬上第二层',
          '他扒开一堆碎瓦，底下压着一只没人动过的铁箍木箱',
          '他把旧册一本本抽出来，摊在窗台上翻',
          '他把发霉的那几本搬到亮处摊开',
          '他借着塔顶那道缝漏下来的光辨认封皮上的字',
          '他上废塔那天，塔顶还挂着半盏早就不亮的符灯',
        ],
        tail: [
          '风从塔缝里灌下来，把摊开的册页吹得乱翻，他伸手按住最上面那一页',
          '他翻到一半，塔身又塌下来一层灰，落了满头发',
          '底下那层传来脚步声，他把手里那本合上贴到墙边听',
          '有一页被他揭破了，字迹断在中间，他没敢再往下翻',
          '他把挑出来的那几本塞进箱笼，从塌口翻了出去',
          '翻到末几页，纸边上那些字像是被人用指甲划掉的',
        ],
        place: 'tower',
      },
      {
        key: 'watch',
        w: '查夜哨',
        lead: [
          '他跟守夜人一道沿着墙根走，一格一格看柱子上的刻口',
          '他把木牌搁在膝上，照着往纸上对',
          '他举着火把照墙根，认哪些是新添的',
          '他蹲在那排刻口前看了很久，数到一半又从头数',
          '他问守夜人去年冬天那几夜是谁值的',
          '他跟着巡夜的一路往北，走到城墙拐角',
        ],
        tail: [
          '那一片让雨糊了，他跟守夜人各认出一个',
          '后半夜风大，雪粒子横着打在脸上，他一直没停',
          '守夜人把手里的灯举高了些，说这几夜都没人打这儿过',
          '那只木牌让虫子蛀空了一半，刻痕一碰就掉渣',
          '他把对上的那几处圈出来，剩下的写在纸边',
          '墙上那道旧符已经焦了一半，管这一段的人说入冬前得换',
        ],
        place: 'watch',
      },
    ],
    查资料: [
      {
        key: 'ask',
        w: '打听',
        lead: [
          '他挨个问过镇上的人',
          '他跑了一趟商队营地打听一件事',
          '他在酒馆里坐到半夜等人开口',
          '他拦住一个赶路的行商问了句',
          '他找了好几个走过远路的人问话',
          '旧书贩子说，认得那记号的人早就不在了',
        ],
        tail: [
          '人们各执一词，坚信自己是对的',
          '有人肯说，可说的都是旧年的传闻',
          '天黑了，他还是没问出准信',
          '他请人添了一回酒，话才多起来',
          '问到后来，话题拐到别处去了',
          '问到第五个人，才有人往南边指了指',
          '半袋干粮换回一句实话，剩下的没人肯说',
          '那人说到一半忽然收了口，转身去看别处',
        ],
      },
      {
        key: 'road',
        w: '问路',
        lead: [
          '他照着一张旧图去城外转了一圈',
          '他在岔口站了半晌等过路人',
          '他把三条道都走了一段比快慢',
          '他在旅店里问了个赶车的',
          '他沿路数着路碑往前走了半里',
          '守夜人说，往北那道夜里封了，得等天亮',
        ],
        tail: [
          '有人给他指了条近路',
          '岔口的路牌倒着，他扶正了',
          '路碑到第三块就断了',
          '走了半里，路又绕回原处',
          '赶车的说前头的桥塌了',
          '绕到天黑才看见头一块路碑，字已经磨平了',
          '走了半里遇上倒下的路牌，他扶起来看了半天',
          '第三条道走到一半塌了土，他退了回来',
        ],
      },
      {
        key: 'compare',
        w: '对说法',
        lead: [
          '他把三家说法凑在一张纸上',
          '他把两份笔录摊开逐句比对',
          '他去铺子又问了一遍同样的话',
          '他把听来的话按前后排了顺序',
          '他拿旧年的记载对眼下听来的说法',
          '吟游诗人把同一件事唱了两遍，两遍说的不一样',
        ],
        tail: [
          '说法拢共三种，没有一种对得上',
          '对上了一句，剩下的还差得远',
          '他把对不上的那处圈了出来',
          '比到后来，他自己也糊涂了',
          '他把笔录按前后顺序摞好',
          '对到最后剩一句谁都不肯改口，他就搁下了',
          '两份说法差在时辰上，他没敢挑一个信',
          '越对越乱，到后来他连自己那句都拿不准了',
        ],
      },
    ],
    派了活: [
      {
        key: 'crew',
        w: '托人跑腿',
        lead: [
          '他托街口那孩子去打听一件事',
          '他在门口把话跟跑腿的交代清楚',
          '他把要带的东西数了一遍，够跑两趟',
          '他给跑腿的塞了一份干粮',
          '他站在檐下看那孩子跑远',
          '那孩子的娘说，天黑前回不来就别等了',
        ],
        tail: [
          '自己守着摊子等消息',
          '回话的只带回一半，剩下的没打听着',
          '跑腿的回来说路上不太平',
          '天黑透了，门才又响了一声',
          '他把空椅子摆回原位',
          '隔了一夜门口才回来一个人，捎的东西丢在了路上',
          '干粮分出去大半，他自己那份留到了最后',
          '有人半夜敲窗，说托出去的话没带到',
        ],
      },
      {
        key: 'route',
        w: '分派路线',
        lead: [
          '他把三件事分别托给三个人',
          '他在纸上给每人画了一条路线',
          '他抓了几根草签让孩子抽',
          '他把要走的顺序排好写在纸上',
          '他跟每个人说清回来在哪儿碰头',
          '赶车的说，西边那条溪涨了水，得绕道',
        ],
        tail: [
          '三个人走的方向都不重样',
          '有一个走岔了，天黑才回来',
          '剩下的事他自己留着做',
          '纸上的路线他描粗了一笔',
          '碰头的地方定在城门口老树下',
          '画到一半他把最短的那条划掉了，没往那边托人',
          '纸上排的顺序到第三行就乱了，他重画了一张',
          '抽到长签的那两个人走岔了道，入夜才摸回来',
        ],
      },
      {
        key: 'poster',
        w: '贴悬赏',
        lead: [
          '他在佣兵会的悬赏板上贴了张招人的条子',
          '他写了一叠悬赏条，挨家挨户送',
          '他拿浆糊把悬赏条抹平贴上墙',
          '他把悬赏条上的字重新写了一遍',
          '他站在墙边看人念那张悬赏条',
          '管悬赏板的老兵说，写得越长越没人看',
        ],
        tail: [
          '有人停下来看了两眼就走了',
          '风把悬赏条吹起一个角',
          '纸角翘起来，他伸手按了按',
          '揭下来的旧条子他扔进了筐',
          '到了傍晚条子下添了两个名字',
          '悬赏条贴到入夜，围看的人换了两拨，没一个揭下来',
          '隔了两天板上又添了新的，他这张被压在了底下',
        ],
      },
    ],
    聊了聊: [
      {
        key: 'chat',
        w: '闲聊',
        lead: [
          '他靠在窗边跟人闲聊',
          '他跟旅店的学徒扯了几句',
          '他把酒碗推过去又添了一回',
          '他跟挨着坐的人有一搭没一搭地说',
          '他靠着柜台跟人说了半晌',
          '店主擦着碗说，北边来的人这回绕了远路',
        ],
        tail: [
          '说的没什么正事',
          '说的都是镇上的旧事',
          '天黑了才想起该收摊',
          '话没说完，人先散了',
          '壶里的酒添过几回，他没起身',
          '话说到一半他被叫去招呼客人，杯里的酒还剩半碗',
          '说的都是十来年前的旧事，他听得没接上半句',
          '邻座那人起身走了，桌上还留着一只空碗',
        ],
      },
      {
        key: 'listen',
        w: '听人说',
        lead: [
          '他坐在台阶上听人讲别处的见闻',
          '他搬了个小凳坐在火盆边听',
          '他挤在人堆后面听了半宿',
          '他给弹琴的吟游诗人递了回火',
          '他靠着柱子听两个人争一件旧事',
          '炭盆里的炭只剩下一层白灰',
        ],
        tail: [
          '听来的都是别处的事',
          '火盆灭了，人还没散',
          '说到紧要处，那人停了口',
          '他听到半夜才起身回去',
          '旁边的人接过去把话讲完',
          '唱到一半弦断了一根，那人没再往下弹',
          '火盆边的人换了两拨，他还坐在原处',
          '后半夜风大，讲的人压低了嗓子',
        ],
      },
      {
        key: 'greet',
        w: '搭话',
        lead: [
          '他在路口跟行商搭了句话',
          '他朝树下歇脚的人拱了拱手',
          '他蹲下来跟行商问了两句',
          '他摘下兜帽跟对面的人点了点头',
          '他站在桥头跟过路的人打招呼',
          '牵马的人在桥头勒住缰绳，问他要不要捎一段',
        ],
        tail: [
          '那人回了两句就上路了',
          '说的都是路上的天气',
          '话头断在那儿，他也没接',
          '来人卸下担子跟他聊了会儿',
          '他拱了拱手转身走了',
          '问过之后那人只管往前走，斗篷上的雪抖了一路',
          '兜帽摘到一半，那人已经走远了',
          '那人把箱笼往肩上挪了挪，说了两句就上路了',
        ],
      },
    ],
  },
  shards: {
    spell: {
      w: '抄咒文',
      more: [
        '同一段古咒他誊了{n}遍，笔尖磨秃了两回',
        '那张羊皮改到第{n}回，边角都磨起了毛',
        '案上那盏灯添了{n}回油，咒文还没写到纸尾',
        '他把这段咒文前后抄了{n}回，回回卡在同一个字上',
        '他把那段古咒誊过{n}遍，纸缝里全是刮过的白痕',
      ],
      paid: [
        '他把誊清的咒文交出去，铜币数在案角',
        '雇他抄咒文的人搁下定金，说剩下的等抄完再算',
        '订抄件的人家把工钱封在纸包里送来',
        '人家验过字迹，把说好的工钱又添了几枚',
      ],
      hurt: [
        '抄到第{e}笔，纸上那行咒文立起来扑他，他抬手挡了一记，手背让墨线割开了',
        '誊到第{e}遍，纸缝里钻出一只灰皮的虫，他把银墨碗砸过去才逼退它，案角也让掀翻了',
        '临到第{e}笔，纸上那行咒文缠住他的手腕，他咬断墨线才抽出手，虎口裂开一道口子',
        '灰皮的虫又爬上来咬他手背，他把砚台扣下去砸碎了它，袖口让它啃掉半幅',
        '写到第{e}笔，纸上的字挤成一团拱起半寸，他拿铜尺横着压住，手指让纸边割开一道细口',
        '一只灰皮的虫从笔杆里钻出来，他甩手把笔磕在案角，指节上留下两排细牙印',
        '誊到第{e}笔，银墨碗里浮起一层黑气，他抽身往后退，袖管让那层黑气燎出一片焦',
        '誊到第{e}笔，灯芯上的火落下来，他抬手一挡，手背烫出一小块红',
        '墨碗从案边滑下去，他探手去捞，袖子蘸了一摊黑',
      ],
      again: [
        '那张羊皮还摊在案上，墨迹没干透',
        '抄到一半的咒文还压在旧抄本底下，银墨碗搁在旁边',
        '案上那半张羊皮还摊着，银墨在碗里结了皮',
        '灯还亮着，写到一半的那行字停在纸中间',
      ],
    },
    talisman: {
      w: '誊符纸',
      more: [
        '这道符他重描了{n}遍，笔画才对上',
        '一叠符纸画废了{n}张，镇石底下还压着没干的那几张',
        '他把符脚补了{n}回，银墨调得一回比一回稀',
        '他把这叠符纸前后描了{n}遍，废纸在炭盆边堆成一摞',
        '他换过{n}支笔，符脚那道弯还是描不圆',
      ],
      paid: [
        '主家收下那沓符纸，把工钱搁在门槛上',
        '他交完符纸拿到钱，顺手讨了一小罐银墨',
        '来取符纸的人掀开看了两张，把工钱搁在案上',
        '订符纸的人先付了一半，说剩下的等贴出去再算',
      ],
      hurt: [
        '画到第{e}笔，符脚上窜出一只赤背的兽，他拿镇石把它捺回去，半叠符纸烧成了灰',
        '描到第{e}张，银墨里立起一个没有脸的人影，他扯下斗篷罩住它，自己肩头烧穿了一个洞',
        '描到第{e}笔，符脚上窜出那只赤背的兽，他把镇石推过去压住它，桌沿让撞裂一条缝',
        '银墨里那个人影伸手抓他，他拿斗篷抽开它，手背让它烙出一片印子',
        '符脚上的朱砂自己烧起来，他拿镇石压下去，指缝里落进一片朱砂，烫出一层焦皮',
        '描到第{e}笔，悬在案上的那盏灯自己灭了，黑里有人影扑到跟前，他抬手架住，肩膀让撞得生疼',
        '符纸底下挣开一角，他拿朱砂把符脚补死，腕子让溅开的墨点烫出一串红',
        '纸边窜起一缕蓝火，他拿湿布盖住，指尖还是燎起一个泡',
        '补到第{e}笔，笔杆上的漆皮扎进指缝，他把手一甩，符纸撒了一地',
      ],
      again: [
        '那道没画完的符还贴在案边，银墨碗没盖',
        '符纸还压在镇石下面，只差最后一笔',
        '那沓没描完的符纸还压在石镇底下，边角翘着',
        '炭盆里的灰凉了，画废的那几张还在案边',
      ],
    },
    deed: {
      w: '改契书',
      more: [
        '那卷契书他改了{n}回，末尾只落下三行',
        '契书行间添了{n}处小字，纸面快写满了',
        '那些刮过的地方他重写了{n}遍，羊皮薄得透光',
        '他把这卷契书前后改过{n}回，刮下来的碎屑扫了一案',
        '他把两家的名字核了{n}遍，有一处始终对不上',
      ],
      paid: [
        '买契书的两家把火漆按上，铜币在桌上分成两堆',
        '他把改好的契书交出去，收了这一份的工钱',
        '两家画过押，工钱当场点清搁在案上',
        '中间人验过火漆印，把说好的工钱付了',
      ],
      hurt: [
        '刮到第{e}处，那方火漆裂开，里头伸出一只黑手，他拿刀背砸开它，指节磕出了血',
        '改到第{e}处，押约那户人家提着剑找上门，他把契书按在怀里挨了一记，左肩到现在抬不起来',
        '火漆缝里那只黑手掐住他脖子，他拿尺条撬开，喉口留下几道青印',
        '那户人家提剑堵住门口，他抱紧契书挨了一脚，纸角撕掉半幅',
        '契书上的字自己挪了位，他伸手去按，指甲让纸里钻出的黑线缠出两道血痕',
        '改到第{e}笔，那户人家踹开门板提剑就劈，他抱着契书往旁边闪，门框擦掉半边耳朵',
        '契书边角自己烧起来，他抓着纸角甩到地上，虎口让火苗舔掉一层皮',
        '刀尖打滑划开虎口，他拿袖子压住，纸角让血洇红一小块',
        '那户人家把契书夺过去扯，他攥着另一头不放，指节蹭破了皮',
      ],
      again: [
        '那卷契书还摊在案上，火漆只按了一半',
        '改到一半的契书压在底稿上头，刮刀搁在旁边',
        '改到末尾的那卷契书搁在案角，最后三行还空着',
        '封好的那卷契书压在砚台底下，火漆蹭花了半块',
      ],
    },
    map: {
      w: '补地图',
      more: [
        '那张地图他补了{n}遍，边线描了又擦',
        '河道往北挪过{n}回，怎么摆都不顺眼',
        '他对着旧图量了{n}遍，图角磨得发亮',
        '他把那条河道改过{n}回，回回都往外多拐一段',
        '他在图上添过{n}回支流，回回都添到纸边外头',
      ],
      paid: [
        '买图的人把铜币压在案角，卷起图走了',
        '他把描好的图交出去，收了定金，说剩下的下月来取',
        '买图的人看图看得仔细，把铜币按在图上',
        '买主要的是抄本，工钱先付了一半',
      ],
      hurt: [
        '描到第{e}道路碑，图上那片废墟动了，两只狼大小的东西跨出纸面，他卷起图退到门口，肩上挨了一记',
        '量到第{e}遍，图角上那道霜爬到他手腕，他拿灯油把它烧断，那半张旧图也一并烧没了',
        '图上又跨出一只狼大小的东西，他拿图卷抽它，小腿让划开一道口',
        '那道霜顺着图角爬上他手背，他拿灯油泼上去烧断，半截袖子也烧没了',
        '图上那头狼大小的东西扑下纸面，他伸手去按那张图，肋下让爪子剐开一道',
        '图角的霜爬上案面，他端起灯去烘，指尖贴上去时燎起一层皮',
        '描到第{e}道路碑，笔下的线自己拐了弯，他拿手去捋直，手腕让那条线勒出一道血口',
        '图上那片墨忽然鼓起来，他拿镇纸压下去，手背让纸边割开一道',
        '桌腿一歪，满案的东西倾过来，他护住图挨了一记，膝盖磕在案角',
      ],
      again: [
        '那张图还摊在案上，四角压着图筒',
        '描到一半的河道还留着，尺子横在图边',
        '地图卷到一半就搁下了，图筒盖还敞着',
        '刮下来的碎纸没扫，尺子横在图边上',
      ],
    },
    device: {
      w: '试法器',
      more: [
        '那件法器他试了{n}回，光只亮一下又灭',
        '石台上那圈纹路他擦过{n}遍，还是没动静',
        '他退开又上前，来回{n}趟，霜落了薄薄一层',
        '他在这院子里守着试了{n}夜，那圈纹路亮过半道就灭',
        '他把纹路擦过{n}回，擦完还是原样',
      ],
      paid: [
        '买法器的人把铜币倒在石台上，又多问了一句',
        '他把法器交到买主手上，收下钱，又多叮嘱了两句',
        '买主围着石台转了两圈，把钱数在台面上',
        '他把那件东西包好递过去，买主接过去掂了掂',
      ],
      hurt: [
        '试到第{e}遍，那件法器挣开他的手，光里冲出一只铁翅的东西，他掀翻石台挡了一记，肩膀撞在墙上',
        '退开第{e}回，它自己滚下来，唤出一群灰影，他点起火把把它们逼回纹路里，火把烧到了指头上',
        '那件法器弹开，铁翅的东西从光里扑下，他抡石台顶过去，手背被翅尖划开一道',
        '第{e}回纹路断了一截，灰影从缝里涌出来，他举火把一路撵回去，头发烧焦了一片',
        '那件法器从石台上蹦起来，他伸胳膊把它按回去，指头让纹路里的光烙出一道白痕',
        '光里那只铁翅的东西贴着肩飞过去，他侧身滚到院墙下，耳根让翅尖划开一道',
        '石台底下的灰影顺着地缝往外爬，他抄起铜尺把它们拨回去，脚背让地缝烫出几个泡',
        '纹路里冲出一股热气，他退开两步，手背让燎起一串泡',
        '法器从石台上弹起来，他拿布去接，指头让烫得缩回来',
      ],
      again: [
        '那件法器还摆在石台上，布只解了一半',
        '试了一半的法器还搁在院中，纹路那面朝上',
        '石台上那圈纹路还留着白印，法器扣在布上没包好',
        '院里的霜没扫，燧石搁在台边的雪里',
      ],
    },
    gear: {
      w: '调机关',
      more: [
        '齿盘他对了{n}遍，齿口才咬上',
        '那个机关拆了又装，来回{n}趟，零件摊了满地',
        '他给齿盘上过{n}回油，缝里还是发涩',
        '他把这个机关拆装过{n}趟，多出来的零件攒了一小匣',
        '他对着光比过{n}回齿盘，齿口还是差半分',
      ],
      paid: [
        '来取机关的人验过一遍，把工钱搁在台上',
        '他把修好的机关交出去，工钱照说好的收了',
        '试转那两圈很顺，人家当场数了工钱',
        '取件的人留下一句好话，又把工钱添了几枚',
      ],
      hurt: [
        '拆到第{e}遍，齿盘底下钻出一只铁壳的虫，他拿铜钳夹住它，虎口让它的牙划开了',
        '对到第{e}遍，矿洞那头爬来一只石背的东西，他抡铜锤把它砸翻，小腿上还是挨了一口',
        '齿盘翻过来咬住机轴，铁壳的虫爬上他手背，他拿铜钳磕开它，指节蹭掉一层皮',
        '第{e}回铰链崩了，石背的东西从矿洞那头撞进来，他抡铁墩把它顶在岩壁上，脊背也撞青了',
        '卸下来的齿盘滑了手砸在脚面上，他单脚跳到案边，脚趾甲翻起一片',
        '铁墩滑了一下，他伸手去扶，掌心让墩角磨出一道口',
        '石背的东西从背后扑上来，他抡铜钳把它砸开，胯骨让它的爪子扒开一道',
        '齿盘脱手滑下来砸在脚背上，他抽脚时膝头撞在案腿上',
        '围裙让机轴卷住一角，他挣开时手背蹭掉一块皮',
      ],
      again: [
        '那个机关还拆着摊在案上，零件按次序摆开',
        '齿盘还搁在油碗边上，只装回去一半',
        '拆散的零件还按次序摊在案上，油碗搁在一边',
        '齿盘还卡在机轴上没卸下来，铜钳搭在旁边',
      ],
    },
    stove: {
      w: '修炉子',
      more: [
        '那口炉子他修了{n}回，火还是不稳',
        '炉膛里的灰掏过{n}遍，烟还是从缝里钻',
        '风箱拆开又装上，来回{n}趟，火苗才顺',
        '他给这口炉子换过{n}回砖，砌完还是漏烟',
        '他在这炉子上耗了{n}夜，火头还是起不来',
      ],
      paid: [
        '铁匠验过火色，把工钱搁在铁砧上',
        '他修好炉子拿了钱，顺手把剩下的炭背回去',
        '店主试了一回炉子，看火稳了才把工钱数出来',
        '炉子修好那天，铁匠铺把工钱给了，又饶了一筐炭',
      ],
      hurt: [
        '烧到第{e}回，炉膛炸开，火里走出来一只赤鳞的兽，他抄起铁钳把它捅回去，眉毛燎没了',
        '捅到第{e}遍，风箱倒抽一口，窜出一条赤红的长虫，他抡钎子把它钉在砧上，半边袖子也烧成了灰',
        '炉门让火顶开，赤鳞的兽从灰里立起来，他抡铁钳把它捅回去，额发焦了一缕',
        '第{e}回风箱回火，赤红的长虫顺着钎子爬上来，他把它掼进炉膛，手背燎出一串水泡',
        '炉膛底的炭塌下去，他探铁钳去拨，火苗顺着钳柄蹿上来，小臂上燎出一道红',
        '钎子烫得握不住，他撒手扔在砧上，指头上让烫出一串白泡',
        '第{e}回柴添得急了，一团火星扑到脸上，他抬臂护住眼睛，耳根燎出一小块焦皮',
        '炭堆里爆出一块红炭，他抬手挡在脸前，手背上落了一星焦痕',
        '第{e}回风箱倒抽，火苗顺着缝窜出来，他拿麻布拍下去，指头让烫起一层皮',
      ],
      again: [
        '炉子还凉着，风箱搁在地上没装回去',
        '那口炉子还剩半边砖没砌，炭堆在旁边',
        '炉膛里剩着昨夜的冷灰，火钳插在里头',
        '那口炉子的砖砌了一半，剩下的砖码在墙根',
      ],
    },
    scroll: {
      w: '翻卷轴',
      more: [
        '整排卷轴他挨着摊开过{n}回，指头上全是灰',
        '要找的那一句他翻过{n}遍，羊皮的边都磨亮了',
        '那卷长的他分{n}回看完，纸渣掉了一桌',
        '他把这摞卷轴翻了{n}遍，绳结解了又系回去',
        '他从架子上取下过{n}回，抱到窗边一张张看',
      ],
      paid: [
        '他抄下的一截让人取走了，桌上留了几个铜币',
        '收旧卷的贩子把几个钱搁在柜上，抱走了那一截',
        '有人要的那一截抄清了，铜币当面点过',
        '贩子看过纸色，工钱按页数算清了',
      ],
      hurt: [
        '摊到第{e}卷，卷里伸出一只干枯的爪子，他拿裁刀割断那截纸才挣脱，腕上勒出一道血痕',
        '翻到第{e}回，轴心里爬出一只生着灰翅的虫，他把整卷砸在地上踩住，那半截也碎成了渣',
        '纸缝里钻出一只白蛾样的东西，他用铜尺把那一截压住，小指让翅粉烫起了泡',
        '卷尾的封蜡自己裂开，蹿出一只带爪的东西，他拿压书的石镇把它砸回去，虎口裂了一道',
        '卷轴自己卷回来夹住手指，他拿裁刀撬开轴心，指缝里夹出两道血口',
        '卷轴缝里那团灰翅的虫扑上脸，他抬手挡了一下，鼻梁让翅粉烫出几个点',
        '卷轴末端的封蜡自己化了，他伸手想把它按回去，手心让滚下来的蜡油烫出一层皮',
        '绳结那头爬出一只细脚的东西，他甩手把它抖在地上，手背让它划出两道红',
        '受潮的纸整片粘住，他一使劲撕下一角，指缝让纸边割开一道',
      ],
      again: [
        '那半卷卷轴还摊在案上，绳结没系回去',
        '他挑出来的那几卷还堆在窗边，页角翘着',
        '摊在长案上的卷轴没收，绳结散在一边',
        '窗边的灰又落了一层，翻出来的纸渣扫到案角',
      ],
    },
    shelf: {
      w: '上架子',
      more: [
        '那架梯子他上下爬过{n}回，横档上落满手印',
        '同一层架子他翻过{n}遍，灰落了厚厚一层',
        '从底到顶他捋过{n}轮，匣子搬下来又放回去',
        '他把这排架子清过{n}回，空出来的格子越来越多',
        '他把顶层那些匣子搬下搬上{n}趟，盖子上的灰擦不掉',
      ],
      paid: [
        '藏书塔的管事收下他清出来的那一摞，付了几个铜币',
        '他把腾出来那一格的书交出去，换回几个钱',
        '管事数过交上去的那一摞，工钱当天就给了',
        '顶层的匣子按号对上了，人家把工钱搁在架上',
      ],
      hurt: [
        '爬到第{e}层，高架上扑下来一只带爪的东西，他抱着横档挨了一记，后背让梯子磕青了',
        '摸到第{e}回，顶层那排匣子后面盘着一条灰鳞的长虫，他拿火折子燎它，整排书都熏黑了',
        '抽到第{e}格，书脊后面挤出一只灰壳的虫，他用册页夹住它，肩上让横档剐掉一块皮',
        '梁影里垂下一只带爪的东西，他举着油灯挡了一记，灯油泼了自己半边袖子',
        '爬到第{e}层，脚下的梯档断了一根，他抓着架杆滑下来，小腿让断口划开一道长口',
        '够到第{e}层，架顶那排匣子整片塌下来，他抱着书往旁边让，脚踝让匣角砸肿一块',
        '抽到第{e}格，抽出来的册子里夹着一片碎瓷，他捏着书脊往外拽，虎口让瓷片割开一道',
        '爬到第{e}层，梯子横档断了一根，他抓住架子边沿，膝盖磕在下一格上',
        '架上那摞匣子倒下来，他偏头躲过，肩膀让匣角砸出一片青',
      ],
      again: [
        '梯子还架在半截上，横档的灰被踩掉一块',
        '顶层搬下来的匣子还堆在地上，盖子都敞着',
        '梯子还靠在架子边上，顶上一层没够着',
        '地上摊着几只敞口的匣子，旧纸散在匣沿外头',
      ],
    },
    box: {
      w: '搬箱笼',
      more: [
        '箱笼他来回搬过{n}趟，墙角堆得齐人高',
        '最底下那一只他翻过{n}遍，锁还是没开',
        '绳子换过{n}根，箱盖才总算捆住',
      ],
      paid: [
        '他清出来的那只箱笼让人抬走了，桌上留了几个铜币',
        '收货的人付了几个钱，箱笼让车拉走了',
      ],
      hurt: [
        '抬到第{e}只，箱底的锁自己弹开，窜出一只黑毛的兽，他拿绳子勒住它，手背上添了三道口子',
        '捆到第{e}回，墙角那摞笼子塌下来，一只锈爪的东西从底下爬出，他把空笼扣过去压住，脚背也砸肿了',
        '箱盖缝里挤出几根灰翅的虫，他把粗布蒙上去按住，手背上扎进三根木刺',
        '箱底那层烂纸底下盘着一条黑鳞的长虫，他拿断剑挑开纸页，刃口在腿上划了一道',
        '箱盖自己掀起来，里头那只黑毛的兽咬住小臂，他把箱子连兽一起摔在墙角',
        '绳子崩断弹在手背上，他整个人往后坐倒，后腰撞在另一只箱角上',
        '箱底的木板让里头的东西咬穿，他抡撬棍把它砸回去，胳膊让木刺划开两道',
      ],
      again: [
        '那只箱笼还敞着口搁在墙角，绳子搭在旁边',
        '翻出来的半箱东西还摊在地上，谁也没去收',
      ],
    },
    book: {
      w: '查旧册',
      more: [
        '那本册子他翻过{n}遍，页角全起了毛',
        '同一页他找过{n}回，字迹淡得快看不清',
        '折了角的那几页他先翻过{n}遍，纸边都软了',
      ],
      paid: [
        '他把册子里那一段抄好送出去，回来时袋里沉了几个钱',
        '雇他查旧册的人先付了定金，把册子抱走了',
      ],
      hurt: [
        '翻到第{e}页，那个名字自己浮出来，灯影里站起一个亡者，他把册子砸过去，指缝里全是血',
        '查到第{e}回，纸页间生出一只白蛾样的东西，他用火漆把那一页封死，手背让它的翅扫开一道口子',
        '读到第{e}行，字自己挪了位，灯影里立起一个亡者，他把册子摔过去，手腕拧得生疼',
        '纸背渗出一只灰白的蛾，他用铜镇纸把它摁在案上，指甲掀开半片',
        '灯影里那个亡者抬手抓向面门，他偏头让开半步，耳朵让指甲划开一道口',
        '字缝里渗出的一只白蛾扑上脸，他抓起砚台砸过去，眼皮让翅粉烫出一个点',
        '读到第{e}行，那页纸自己立起来割向手背，他把整本册子扣在案上，指腹让纸边拉出一道细口',
      ],
      again: [
        '那册子还摊在膝头上，折角的那一页没翻回去',
        '看了一半的旧册扣在门槛边，压着块石子',
      ],
    },
    ask: {
      w: '打听',
      more: [
        '一条巷子问下来，{n}个人给了{n}种说法',
        '佣兵会的登记人被他问过{n}遍，末了只说等等看',
        '他在酒馆里等过{n}晚，才等到一个肯开口的',
      ],
      paid: [
        '有人出定金雇他问一件事，钱先搁在柜上',
        '他把问出来的几个名字报过去，收了几枚铜币',
      ],
      hurt: [
        '问到第{e}个人，巷子里那两个兜帽的把话头一断，掀翻了他的摊子，他挨了一棍，肋骨断了一根',
        '问到第{e}回，佣兵会门口那几个披甲的围上来，他退到街上才脱身，箱笼让撕开了一道大口',
        '巷子里那两个兜帽的把他按在墙上，他挨了两拳，嘴里全是血',
        '那两个人跟出巷口，他从人堆里挤出去，左眼肿得睁不开',
        '巷子里那两个兜帽的从背后扑上来，他挣开就往街上跑，胳膊让砖棱剐掉一块皮',
        '街口那几个披甲的伸手夺箱笼，他攥住带子往回拽，指甲让带扣掀开一片',
        '酒馆后巷那两个人按住肩膀，他一肘撞开，出门时鼻血流了半襟',
      ],
      again: [
        '问到一半的话头断在酒馆门口，那人说改日再讲',
        '那个名字还写在纸上没对上人，边角都磨软了',
      ],
    },
    road: {
      w: '问路',
      more: [
        '同一段路他来回走过{n}趟，脚底磨出了泡',
        '岔口上他等过{n}回，过路人指的方向没一次一样',
        '路碑他一道一道数过去，数到{n}块天就黑了',
      ],
      paid: [
        '商队雇他认一段路，说好回来再结',
        '他把走熟的这条道领着人走了一趟，收了几枚铜币',
      ],
      hurt: [
        '走到第{e}个岔口，桥头那两个拦路的把他堵住，他夺下其中一根棍子才冲过去，肩上挨了一记',
        '问到第{e}回，坡上下来一队骑手，他滚进沟里躲过，马刀削掉了半边斗篷',
        '走到第{e}个岔口，那两个人从背后抄上来，他挨了一顿拳脚，倒进路边的沟里',
        '走到第{e}段路，坡上下来一队骑手，他被一记马鞭抽中肩头，滚下坡去',
        '过第{e}道桥，桥头那两个拦路的抡棍就砸，他抬臂架住，小臂上让棍头磕出一道青',
        '半道上让一辆粮车挤到路边，他躲闪不及，肩膀让车轴撞得抬不起来',
        '赶到第{e}段路，迎面一记马鞭抽过来，他偏头躲开，腮帮还是让鞭梢抽出一道口子',
      ],
      again: [
        '那条没走完的道还画在半张旧图上',
        '走了一半的路停在岔口，路牌还歪着',
      ],
    },
    compare: {
      w: '对说法',
      more: [
        '同一份笔录他核过{n}遍，越核越对不上',
        '三家说法他来回比过{n}回，一处也没摁实',
        '抄书人那里他跑过{n}趟，每回说法都多一句',
      ],
      paid: [
        '他把几种说法归成一份誊清，收了几枚铜币',
        '雇他核对旧年记载的人，付了几个钱定金',
      ],
      hurt: [
        '对到第{e}回，吟游诗人不肯认账，抽刀把那两张纸挑成碎片，他挡了一记，手背划开一道',
        '核到第{e}遍，三家说法里有一家派人来封口，他在巷口挨了一拳，抄好的那份也让人抢走了',
        '那伙兜帽的抽刀就劈，他挡下来，肩上还是挨了一记',
        '半路有人从背后一棍打翻他，怀里抄好的东西全让人夺走',
        '吟游诗人把琴凳抡过来，他侧身闪开，后腰还是让凳角磕出一片紫',
        '封口的那伙人堵在巷口，他翻过墙头跑脱，手肘让墙砖蹭掉一块皮',
        '那伙兜帽的从巷子两头围上来，他夺下一把刀才冲出去，小臂上留了一道口子',
      ],
      again: [
        '那两份对不上的说法还摊在桌上，圈过的地方没擦掉',
        '抄书人给的那张纸还压在灯下，边角卷着',
      ],
    },
    crew: {
      w: '托人跑腿',
      more: [
        '这种事他前后托过{n}回，门口等的人换了好几拨',
        '他托人出去{n}趟，回话的从来不是同一个',
        '他把要托的事数了{n}遍，剩下的还是那几件',
      ],
      paid: [
        '他把跑腿钱当面点清，剩下的自己收着',
        '来的人领了钱就走，他把剩下的铜币压在木匣底下',
      ],
      hurt: [
        '托出去的人第{e}回挨了打，他赶过去把人背回来，半路上又挨了一记冷箭',
        '第{e}趟托出去的人没回来，他沿着血迹追进林子，跟一头白毛的巨兽缠斗一场，手臂上留下三道抓痕',
        '第{e}趟托出去的人困在林子里，他摸进去接，让白毛的巨兽撵着摔进了一个雪坑',
        '他第{e}回进林子接应，进去就没了动静，让埋伏的从树后一箭射穿小腿',
        '他扒开碎石把人接出来，手掌磨得全是血口',
        '托出去的人第{e}趟过冰河踩塌了冰，他跳下去把人拽上来，大腿让冰茬割开一道长口',
        '托出去的人第{e}趟让狼群撵散了，他夜里提灯去找，脚背让冻硬的树杈扎穿一个洞',
      ],
      again: [
        '那件事还悬着，回来的人没带回准信',
        '上一趟的人还没消息，门口的椅子空着',
      ],
    },
    route: {
      w: '分派路线',
      more: [
        '这条线他走熟了，前后托过{n}趟',
        '他在图上把路线描了{n}遍，每一遍都多出一个岔口',
        '他把要托的事分作{n}件，各走各的方向',
      ],
      paid: [
        '三个人回来交齐了东西，他把酬劳按路远近分好',
        '他领着一趟走了远路，回来时袋里沉了些',
      ],
      hurt: [
        '第三趟走到第{e}个岔口上出了事，他赶过去时货散了一地，押货的人少了一个，他的腿上也挨了一箭',
        '托出去的第{e}趟让人堵在桥上，他回头去接，只收回来半车东西，自己的左耳冻掉了一块',
        '第{e}趟走到桥心让埋伏截住，他赶去接应，车辕折断，他自己磕破了额角',
        '他托的第{e}趟绕岔口走，半路撞上劫道的，他上前去夺，肩上挨了一记闷棍',
        '第{e}趟过桥时桥板塌了一块，他冲上去拽住缰绳，肩膀让车辕撞得半天抬不起来',
        '接出去的第{e}趟困在桥北，他趟冰过去接，冻硬的绳头在掌心勒出两道血槽',
        '第{e}趟赶夜路翻了车，他扑过去把车辕扛住，腰让翻下来的货砸得直不起来',
      ],
      again: [
        '地图上那一段还没描完，界线只画到第三个岔口',
        '出去的人一个都没回，岔口那盏灯还亮着',
      ],
    },
    poster: {
      w: '贴悬赏',
      more: [
        '这种悬赏条他写过{n}张，墙上没剩几张完整的',
        '他往那块板上贴过{n}回，来应的人一次比一次少',
        '悬赏条上的火漆他按了{n}遍，纸才粘牢在墙上',
      ],
      paid: [
        '揭条子的人跑了趟腿，说好的钱数当面给清了',
        '悬赏条贴出去第三天就有人来应，他把人名一个个记了下来',
      ],
      hurt: [
        '贴到第{e}张，悬赏上画的那只兽真的寻上门来，他把火把塞进它嘴里，胳膊上让它掀掉一块肉',
        '贴出去第{e}天，一个戴兜帽的人来撕纸，两人在墙根动起手，他挨了一记冷刀',
        '戴兜帽的那伙人寻到墙根来，他上前去挡，让一刀划开了半边下巴',
        '贴满第{e}个村口，画上那只兽夜里寻上门来，他一把攥住它的前爪，腕子让它咬穿了',
        '挂到第{e}面墙，画上那只兽当真扑下来，他横过顶门的木杠顶住，手背让獠牙划开三道口',
        '墙根来了两个戴兜帽的撕纸，他上前去夺，耳朵让刀背削掉半个',
        '贴满第{e}个村口，夜里又有东西来撕纸，他一扁担打下去，虎口让爪子抓出血槽',
      ],
      again: [
        '板上那张悬赏条还有半截没揭下来',
        '那面墙上的字让雨冲淡了，一直没人来补',
      ],
    },
    chat: {
      w: '闲聊',
      more: [
        '这样的闲话他扯过{n}回，回回说到半夜',
        '他跟柜台后头那人搭了{n}回话，话头总拐到同一件旧事上',
        '酒碗添到第{n}回，他还没起身',
      ],
      paid: [
        '闲话里替人牵了条线，人家顺手塞给他几个钱',
        '帮人看了半页信，人家塞给他几个钱当谢礼',
      ],
      hurt: [
        '闲聊到第{e}轮，邻桌那两个醉汉把桌子掀到他身上，他挨了一拳，牙掉了一颗',
        '说到第{e}句，靠门那桌一个披斗篷的拿话挤他，他把酒碗砸过去，脸上挨了一记，眼角裂开了',
        '闲聊到第{e}句，邻桌那两个醉汉又扑上来，他挨了一记闷拳，嘴角裂到耳根',
        '说到第{e}轮，靠门那桌的抄起条凳抡过来，他跳开半步，后腰还是被扫中',
        '闹到第{e}轮，邻桌那个醉汉抄起酒碗砸过来，他偏头躲开，额角还是让碗沿磕开一道口',
        '吵到第{e}句，靠门那桌的人掀了桌子，他往旁边让，手撑在桌角上让木刺扎进掌心',
        '说到第{e}轮，两个醉汉把他堵在墙角，扯开一只袖子才挤出门去，肩上让酒坛磕肿一块',
      ],
      again: [
        '那点闲话还没说完，酒碗搁在桌上凉了',
        '上回那个人还没再来，柜台前的凳子空着',
      ],
    },
    listen: {
      w: '听人说',
      more: [
        '他这么坐着听人讲了{n}宿',
        '同一段旧事他听过{n}遍，讲的人换了三个',
        '火盆边他坐了{n}回，听到了不少别处的门道',
      ],
      paid: [
        '他把听来的那段路数说给要出门的人，换回几枚铜币',
        '有人托他把听来的话带到别处，回来时口袋里有几个钱',
      ],
      hurt: [
        '听到第{e}段，讲的那件事上的人寻上门来，火盆边动起手，他护住讲故事的人，背上挨了一记',
        '讲到第{e}回，门外来了一伙要灭口的，他从窗子翻出去，跳下来时崴了脚',
        '听到第{e}句，来的人把火盆踹翻，他护着讲的人往后门退，脊梁磕在桌角上',
        '讲到第{e}段，那伙要灭口的冲进来，他挨了一板凳，趁乱滚出门去',
        '听到第{e}段，炭火被踹得漫了一地，他踩着炭渣往门口挪，脚底让炭渣烫出一层皮',
        '门外那伙灭口的撞开门板，他拉着讲的人往后门退，肩膀让门框磕出一道口子',
        '听到第{e}句，那伙人从窗子翻进来，他一板凳抡倒一个才夺路出去，脚背让门坎磕肿一块',
      ],
      again: [
        '那段话还只讲到一半，火盆里的炭又添了一回',
        '讲故事的人还没回来，台阶上的位置空在那儿',
      ],
    },
    greet: {
      w: '搭话',
      more: [
        '这条路上的行商他搭过{n}回话',
        '他朝歇脚的人拱了{n}回手，认下的脸越来越多',
        '他在桥头站过{n}回，跟来往的人都点过头',
      ],
      paid: [
        '替行商指了段路，人家临走塞给他几枚铜币',
        '有人托他把话捎到下一站，先付了一半的钱',
      ],
      hurt: [
        '搭到第{e}句，桥头那个兜帽底下不是人脸，他退了两步抽出断剑，肩头还是让它抓开了',
        '拱到第{e}回手，对面那伙赶车的翻了脸，他挨了一鞭，躲进树后才脱身',
        '搭到第{e}句，那兜帽往桥栏上一靠，他按着肩头退到桥头的石墩后面',
        '拱到第{e}回手，桥头那两个把斗篷一扯，他夺过一根鞭子才挣开，腿让套马绳拖了半条街',
        '搭到第{e}句，兜帽底下那东西弓身扑上来，他侧身让过半步，肋下让爪子划开三道血印',
        '拱到第{e}回手，桥头那伙赶车的把车横过来堵路，他贴着车帮挤过去，小臂让车轴上的铁刺划开一道',
        '第{e}回马在桥头惊了横冲过来，他贴着桥栏闪身，膝盖让车辕撞得跪倒在地',
      ],
      again: [
        '路口那副担子还搁在老地方',
        '树底下那块石头让人坐热了，又凉下去',
      ],
    },
    ruin: {
      w: '描残咒',
      more: [
        '那面残墙他来回描了{n}遍，每一遍描到拐角就接不上',
        '那截断咒他照到羊皮上{n}回，笔画一回比一回虚',
        '他在这座塌了的镇子上耗了{n}个日头，带来的红土用去大半',
        '他把这面墙前后描了{n}趟，回回都被雨冲掉半边',
        '他把那行残咒描了{n}遍，越描越短，末了只剩几个字',
      ],
      paid: [
        '雇他描咒的人把铜币搁在门槛上，说墙外那一截等开春再描',
        '他把描好的那一卷交出去，收下工钱，顺带讨了一罐墨',
        '来看拓卷的人验过一遍，把铜币搁在石阶上',
        '收货的人照着墙上对了一遍，工钱当面点清',
      ],
      hurt: [
        '他描到第{e}遍，墙里伸出一截枯手抓在他腕上，他甩开时蹭掉一块皮',
        '第{e}回撞上一群在废墟里过夜的石鸦，他护着脸挨了几下啄，怀里的干粮撒了一地',
        '墙缝里又探出一截枯手，他把残咒卷成棒打回去，小臂让抓出几道口',
        '第{e}回他踩进废墟的坑里，石鸦扑下来啄他后颈，他抱头滚出半丈，怀里那页也让水浸烂',
        '墙上那行残咒渗出黑水，他拿布去擦，胳膊让墙皮上的尖石刮开一道',
        '第{e}回蹲在断墙底下描字，一群石鸦扑下来啄手背，他抱着羊皮滚到墙根，拓坏了两张',
        '脚边塌了一块，他栽进碎石堆里，膝盖砸出一片青，卷好的残咒一直没松手',
        '墙头那块石头松了，他侧身躲开，肩上让碎石砸出一片青',
        '石缝里的石鸦扑下来，他拿火把挥开，后颈被抓掉一块皮',
      ],
      again: [
        '那堵墙还立着半截，描到一半的那行让雨冲淡了半边',
        '拓坏的那几张还压在箱笼底下，边角都卷了',
        '墙根那行字还露着半边，火把斜插在石缝里',
        '带来的红土用去大半，剩下的搁在墙脚下',
      ],
    },
    frost: {
      w: '送契书',
      more: [
        '这条道他来回走过{n}趟，霜原上立着的路碑有一半没字',
        '同一趟差事他跑过{n}回，每一回都被雪堵在半道上',
        '北边那个镇子他进过{n}趟，镇上认得他的没剩几个',
        '他把同一卷契书往北送过{n}回，回回都在半道上过夜',
        '他换过{n}匹驮马，走到霜原边上还是得自己扛',
      ],
      paid: [
        '收货的人把铜币摊在柜上，又把回信塞进他怀里',
        '他把契书交到对方手里，收下工钱，顺手讨了一夜的马厩',
        '对过暗记，柜上的人把工钱按数付了',
        '他把那卷东西递过去，对方收下，先付了一半脚钱',
      ],
      hurt: [
        '他在半道上被一群雪狼截住{e}回，马鞍上的箱笼撕开了，干粮撒进雪里',
        '第{e}回他撞上劫道的，肩上挨了一刀，血浸透了领口，那卷东西护在胸口才没让人夺去',
        '他在岔道上让一群雪狼围住{e}回，抡起断剑劈开一头，小腿还是让咬穿了一块',
        '第{e}回他在桥头撞上劫道的，契书塞进石缝，肩背挨了两棍，钱袋也让人抢走',
        '半道上第{e}回遇上劫道的，一记马刀把马鞍削掉半边，他滚下马背，胳膊上让刀锋扫开一道',
        '第{e}回狼群从雪坡上压下来，马受了惊把背上的人掀下去，他摔进雪里，后腰让蹄子踏上一下',
        '第{e}回在雪原上走夜路，狼从马腿下钻出来咬，他抽刀抵住，手腕让獠牙划开一道口',
        '他在半道上让暴雪困住{e}回，手指头冻得握不住缰绳，靠一处背风的石堆挨到天亮',
        '第{e}回冰面裂开，他连人带驮袋掉进水里，爬上来时半条腿没了知觉',
      ],
      again: [
        '那条路还剩半程没走完，缰绳一直绕在他手腕上',
        '另外那封信还压在他怀里，收信的人住在霜原更北头',
        '那卷契书还在怀里，封口的火漆蹭掉一角',
        '回信还压在驮袋底下，得走到霜原北头才能交',
      ],
    },
    mine: {
      w: '下矿洞',
      more: [
        '那台机关他试了{n}回，每回都是转两圈就卡住',
        '坑壁上的水他舀过{n}遍，舀出去的水又渗回来',
        '他在坑里守过{n}夜，辘轳一转他就醒',
        '他去过这口坑{n}趟，回回都在第二层碰见塌方',
        '他堵过{n}回坑壁上的水，堵完第二天又渗出来',
      ],
      paid: [
        '矿上管事把铜币按筐数点给他，说下个月还有一段要抽',
        '他把底下那摊水收住了，收下工钱，顺带要了两把新镐头',
        '矿上的管事按筐数点清了工钱，多留一筐火绳',
        '底下那摊积水收住以后，工钱当天就结清了',
      ],
      hurt: [
        '他在坑道里撞上一窝栖在石缝里的蝙蝠，脸上挨了{e}回扑，被抓开一道口子，手里的矿灯也灭了',
        '第{e}回水漫上来，水底翻上来一头没有眼睛的东西扯住他的脚踝，他挣开时把镐头丢了',
        '往前摸到第{e}处岔口，石缝里又钻出一窝蝙蝠，他挥铁镐赶散它们，耳朵被咬穿一块',
        '下到第{e}处水坑，水里那个没有眼睛的东西缠住他的小腿，他蹬开它时断剑脱手落了水',
        '摸到第{e}处岔口，头顶横木断了一根掉下来，他抬臂架开，小臂让木茬划开一道长口',
        '第{e}回下井的吊绳磨出毛茬，他下到半途滑了一截，膝盖磕在井壁上青了一块',
        '往前探到第{e}段坑道，顶上落下一块碎石砸在肩上，他扶着撑木退到干处，再没往里走',
        '撑木泡软了整根倒下来，他往侧边滚开，肩膀让木头压出一片青',
        '石缝里扑出一群蝙蝠，他抱头蹲下，后颈被抓开一道口子',
      ],
      again: [
        '坑里的水还剩半人深，那台铁家伙还架在泥里',
        '换下来的湿衣裳搭在撑木上，火镰和油布都还在坑口',
        '坑口那把木梯还搭着，另一头浸在水里',
        '辘轳上的绳子松了半圈，碎石堆在轮子边上',
      ],
    },
    quench: {
      w: '拖法器',
      more: [
        '这件走火的法器他拖过{n}趟，每一趟都是半路又烧起来',
        '他在河边守了{n}夜，水落一截他就用长竿往下捅一截',
        '他往那件东西上浇过{n}回水，浇一回就腾起一片白气',
        '他往河里浸过{n}趟，凉不到半天又烫手',
        '他换过{n}根长竿，竿头还是烫得握不住',
      ],
      paid: [
        '雇他的人把铜币撂在河滩上，转身就牵着牲口走了',
        '他把那件东西交出去，收下工钱，只讨了河湾那块地方',
        '他把东西交到对方手里，工钱是当场结的',
        '那群人验过布底下那道纹路，铜币按数结了',
      ],
      hurt: [
        '那件东西第{e}回炸开，他抬手去挡，水里腾起一片白气，小臂上的皮燎掉一块',
        '第{e}回石桩松了，那件东西顺着水漂过来贴住他的腿，他甩开时整个人摔进水里',
        '那件东西在手里发烫，水面腾起一片白雾，他撒手退开，裤脚还是燎穿了',
        '第{e}回水面开裂，水底伸出一只青灰的手扯他的腰带，他掰开那几根指头，缆绳断了一股',
        '水面腾起一片白气，他扭身避开，脖子一侧还是让燎出一层红',
        '第{e}回缆绳滑脱，那件东西撞在腰侧，他一把扶住船帮，肋下让烫出一片紫',
        '第{e}回水底的泥里翻起一股黑水，他弯腰下去捞缆绳，手肘让碎瓷割开两道',
        '第{e}回绳扣松了，那件东西顺着水贴到腿上，他抬脚甩开，小腿上留下一片红',
        '河湾底下翻起一片浑水，他往后退时踩空，手掌撑在石头上擦破一块',
      ],
      again: [
        '那圈水纹还没散，东西压在河底，绳头还搭在岸边的草里',
        '岸边那块地方他用石头压了记号，来往的人绕着走',
        '河湾里那块水面比别处暗，长竿横在岸上',
        '剩下半卷麻布扔在河滩上，石头压的记号还在',
      ],
    },
    tower: {
      w: '翻塔册',
      more: [
        '这座塔他在里头翻过{n}遍，每一遍都多出几本新的',
        '那一摞旧册他翻过{n}回，页边全让手指蹭黑',
        '他在塔上一待就是{n}个时辰，下来时耳朵里全是风声',
      ],
      paid: [
        '收旧册的人把铜币搁在台阶上，抱走一捆，说剩下那半捆明年来取',
        '他把挑出来的那几本交出去，收下工钱，又从里头抽回一本',
      ],
      hurt: [
        '塔里第{e}回有东西从梁上扑下来，他抬手挡了一下，手背被抓开三道',
        '他从塌口滑下去第{e}回，底下那层的东西跟着扑上来，他拿怀里的几本挡了一记，脚踝磕在石阶上',
        '塔中第{e}层有东西从梯口翻上来，他拿铁尺格了一下，爪尖顺着小臂划过去',
        '他从裂口摔到第{e}层，底下的东西整片涌上来，他抱着石栏滚开，膝盖磕出个口子',
        '塔里第{e}回有东西从梁上垂下来，他抱着柱子往下缩，肩头让爪尖带掉一块皮',
        '第{e}层那条窄梯断了两级，他踩空滑下半层，胯骨磕在阶角上青了一块',
        '塔中第{e}层的窗子让风吹开，一只东西从外面扑进来，他抡起椅子打过去，手背让爪尖划开两道',
      ],
      again: [
        '塔上那几本还摊在窗台上，翻到的地方压着块碎砖',
        '他没翻完的那一层还堵着塌下来的木头，梯子早断了',
      ],
    },
    watch: {
      w: '查夜哨',
      more: [
        '这一段墙他跟着走过{n}遍，每一遍都能多认出一个记号',
        '那本册子他核过{n}回，有几页的字跟前面接不上',
        '他在哨棚里守过{n}夜，火盆添到天亮',
      ],
      paid: [
        '管这一段的老兵把铜币搁在台阶上，说往南那一截等雪化了再查',
        '他把核对出来的那份交到公会，收下工钱，多抄了一份留着',
      ],
      hurt: [
        '第{e}回他在墙外那条道上走，一只手从石缝里伸出来抓住他的腕子，他挣开时灯滚进了沟',
        '后半夜起了狼群，他跟守夜人背靠着背退到哨棚门口，挨了{e}下咬，守夜人的胳膊见了血',
        '半道上第{e}次，墙根的砖自己松开，窜出一只灰毛的东西，他抬脚踢开，脚脖子让它啃破了皮',
        '守到第{e}更，沟边那排草里爬出一只带壳的活物，他拿竹竿挑进水里，胳膊让它抓走一条肉',
        '第{e}回贴着墙根走，石缝里的手抓住脚踝，他拿铁尺撬开那几根指头，脚脖子上留下几道印',
        '后半夜第{e}回墙下起了狼嚎，他端灯往外照，一头狼扑上来撕住袖口，甩开时小臂上留下两个牙洞',
        '守到第{e}更，那只带壳的活物顺着墙根爬上来，他拿灯杆把它拨开，手指让钳子夹出一道紫',
      ],
      again: [
        '对到一半就断了，守夜人的灯还挂在墙头',
        '对不上的那几页还夹在册子里，边上他用炭画了个圈',
      ],
    },
  },
  cast: {
    scriptorium: '修书匠',
    workshop: '老铁匠',
    archive: '旧书贩子',
    market: '常来的行商',
    guild: '管悬赏板的老兵',
    tavern: '店主',
  },
  castLines: {
    scriptorium: [
      '{p}跟他说，这一页得从头誊一遍',
      '{p}把座儿往他那边挪了挪',
      '{p}给他腾出一块地方',
      '{p}跟他说今天这屋里太暗，眼睛吃不消',
      '{p}跟他说，法师塔要的那几卷得赶在入冬前交',
    ],
    workshop: [
      '{p}跟他说，那块铁还得再烧一遍',
      '{p}把手上的活让给他，自己去喝水',
      '他蹲下来看{p}怎么下锤',
      '{p}跟他说这活急不得，差一点都不行',
      '{p}把铁块翻过来给他看，说这是从北边那片焦土里捡回来的',
    ],
    archive: [
      '{p}带他上了塔顶那一层',
      '{p}跟他说那几摞早就没人翻过了',
      '他跟着{p}在里面绕了两圈',
      '{p}把最上面那格指给他看',
      '{p}说顶层锁着的那几摞里，有半卷是在霜脊山脉画的',
    ],
    market: [
      '{p}刚从北边过来，跟他多说了两句',
      '他问{p}最近外面好不好走',
      '{p}跟他说这趟不好走',
      '{p}把自己那边挪了挪，给他腾出一块地方',
      '{p}刚从霜脊山脉那头过来，说那道口子雪封得早',
    ],
    guild: [
      '{p}把最新的几张挑出来给他看',
      '{p}跟他说往北那条道这两天没人敢走',
      '他跟{p}核了一遍出去的人',
      '{p}让他再等两天，人还没凑齐',
      '{p}指着板上那张条子，说北边那片焦土上的事没人肯接',
    ],
    tavern: [
      '{p}给他留了个靠里的位置',
      '{p}跟他说这两天来的人比往常多',
      '他坐在柜台边跟{p}搭了两句话',
      '{p}把位置让了让，让他坐近点',
      '{p}跟他说，昨晚塔上的符灯灭了半宿',
    ],
  },
  worldLines: {
    night: [
      '城墙上的火把换过第三轮，更声从塔上落下来。',
      '霜落在路碑上，把那几道刻痕填平了。',
      '远远矿洞那头传来凿石声，天亮前自己停了。',
      '一轮月压在废墟的断墙上，墙根有影子动了一下。',
      '林子里的狼叫了半宿，后半夜只剩风声。',
      '海边的灯塔转了一夜，光每回都从窗上划过去。',
      '渡口的橹声过去两趟，没有一趟靠岸。',
      '他听见墙外有甲片响，走到门口时又没了。',
      '北风把雪从门缝里送进来，地上白了一小片。',
      '山顶那堆火燃到半夜，像是有人守着。',
      '塔上的符灯换过第三轮，光从一排屋脊上扫过去。',
      '北边霜脊山脉那头亮了一下，隔了很久才传过来一声闷响。',
      '巡夜的把街口那几盏符灯一盏盏挑亮，走到巷尾又灭了。',
      '废墟那头有人守着一堆火，火里偶尔炸出一星蓝的。',
      '后半夜起了雾，街口的灯只剩下三团黄。',
      '巡夜的敲过第四下，声音到巷尾就断了。',
      '河面结了一层薄冰，冰底下有水在走。',
      '巷子的灯灭了半宿，没人来添油。',
      '他听见远处有钟响，数到第九下就停了。',
      '屋檐下挂着的那盏灯晃了一夜，天亮前才静。',
      '废墟上头浮着一层灰光，到后半夜才淡下去。',
      '巡夜的鞋底在石板上拖出很长的声。',
      '港口那边有船灯进出三趟，都不靠岸。',
      '雪又落起来，把门口那行脚印盖住了。',
      '他数着墙外的马蹄声，过去十几匹就没了。',
      '井口冒白气，提水的人到天亮才来。',
    ],
    dawn: [
      '天边刚翻出灰白，第一队守夜的人从城墙上下来。',
      '雾从河面上爬过来，把对岸的路碑整个吞了。',
      '霜化了半层，路上留下很多不属于他的脚印。',
      '林子里有斧声，砍了十几下就停了。',
      '远处传来一声长角，是矿洞换班的号。',
      '第一批运货的车从渡口那头过来，轮子陷在泥里。',
      '一群黑鸟从废墟方向飞起来，绕了一圈又落下。',
      '城门刚开，一队穿甲的人往北走了，没回头。',
      '海面上的白气散开，露出两艘没有旗的船。',
      '太阳从山脊上露头，桥面那层白慢慢退了。',
      '法师塔的钟先响，城里的鸡才跟着叫。',
      '雾散的时候，能看见霜脊山脉那道白线横在北边。',
      '城门还没开，守门的先挨个验过进出的符牌。',
      '法师塔上那盏灯亮了一夜，天快亮时才灭。',
      '天刚发青，第一家铺子的门轴响了一声。',
      '霜盖在井沿上，绳子冻得发硬。',
      '头一声鸡叫从磨坊那头传过来，隔了很远。',
      '河上的雾低得贴着水，船影从里面慢慢出来。',
      '东边的天一点点亮起来，屋脊上的雪先见了光。',
      '有人在院子外扫雪，帚声一直没停。',
      '他推开门，台阶上那层霜已经化成水。',
      '巡夜的收起灯，从街口往回走。',
      '几户人家的烟囱先冒了烟，都是直的一条。',
      '鹿从林子边下来，在冻住的水洼上舔了两口。',
      '城门那两扇刚抬起一条缝，外头的人已经排上了。',
      '铁匠铺的风箱声先响起来，天还没亮透。',
    ],
    road: [
      '大路上有几段塌了土，绕路要多走半天。',
      '他过桥的时候，桥下漂着一块带血的门板。',
      '道旁的路碑倒了一块，断口还是新的。',
      '沿路有几个村子空了，窗子都敞着。',
      '林子那头有人烧过营，灰里埋着半截箭杆。',
      '雪线比去年低，翻过去的那道口子封着。',
      '路上有一队人往南走，谁也不看谁。',
      '远处的山脊上滚下来一块石，砸断了两棵树。',
      '渡口的船让人凿穿了一条，船家说要等明天。',
      '走了很远才看见一处人家，烟囱里没有烟。',
      '道旁那排符灯只剩两盏还亮着，别的都让人摘走了。',
      '往北的车辙一直压到那片焦土边上，中间没有岔路。',
      '他在银树森林边上碰见守林人，跟着走了一段近路。',
      '道旁插着一把断剑，刃上还留着半行刻字。',
      '岔路口立着两根木桩，指北的那根让人掰断了。',
      '他牵着驮马走了半日，鞍上的绳磨得起了毛。',
      '半路的旅店关了门，窗纸破着，没人补。',
      '他数着界碑往前走，第三块上刻的字让雨冲淡了。',
      '天阴下来，路上起了风，吹得车辙里的水皱起来。',
      '他下马看了那道车辙，新的，压得很深。',
      '桥头立着块木牌，写着只许空车过，字早让人刮花了。',
      '道旁的枯树上钉着一截断枪，枪头朝着北边。',
      '他走到坡顶回头，来路上没有第二个人。',
      '前面那段路让雪埋了，只能顺着马蹄印走。',
      '有辆板车翻在沟里，车上的柴散了一地。',
      '他过了河就换了条道，老路那头有烟不散。',
    ],
    visitor: [
      '中午来了个牵骡子的人，问往北那道口子封没封。',
      '门外站着个披斗篷的，一直到天黑都没走。',
      '一个收旧符的挑着担子在檐下歇脚，担子一头挂着两只风干的兔。',
      '一个背弓的姑娘来问乱石岗那片废墟的事。',
      '傍晚来了三个生脸，说要雇人走一趟矿洞。',
      '有个瞎眼的老人被牵进来，说听见地下有人在敲。',
      '墙根那匹黑马站了一下午，主人一直没露面。',
      '有个带伤的骑手进来，甲片上还沾着没干的血。',
      '一个吟游诗人路过，在台阶上弹了半支曲子就走了。',
      '有个孩子送来一封信，说是桥头一个戴兜帽的人给的。',
      '来了个披灰斗篷的人，问他认不认得墙上那行旧咒。',
      '有个收旧符的挑着担子过来，把画废的纸一张张翻过。',
      '北边那片焦土过来的两个人在城外扎了营，不进城门。',
      '来了个带剑的年轻人，问他往北那道口子怎么走。',
      '早上来了个卖柴的，把两捆柴靠在墙根就走了。',
      '有个赶车的在门口停下，问他去灰港怎么走。',
      '旧书贩子送来一摞散页，说底下那几页让人撕走了。',
      '货栈管事来过一趟，留下一张条子就走了。',
      '门被敲了三下，开门时门外只剩一个布包。',
      '有个妇人抱着孩子来问他，说自家的男人三天没回。',
      '一个背着画筒的人在门外站了很久，说想看看他描的地图。',
      '有个老人拎着一把锈了的钥匙，问他认不认得这锁。',
      '傍晚来了个穿短褂的人，把一卷麻绳放在桌上就出了门。',
      '修书匠来还他借走的锥子和线，说都还能用。',
      '有个猎户上门，问他要不要一张新剥的鹿皮。',
      '一队人从东岸商盟那边来，在门外讨了口井水就继续走。',
    ],
    news: [
      '渡口的人说，北边那条道夜里封了。',
      '有人从矿洞那头回来，说底下又塌了一段。',
      '码头上传的话是，海里近岸来了两艘不长眼的船。',
      '佣兵会的板子上新添了一张条子，赏的是活捉。',
      '有个守夜人说，城墙外那圈脚印一夜之间多了三倍。',
      '货栈那边都在讲一件事，乱石岗那片废墟里又有了火光。',
      '一个过路的僧人说，河上游的桥让人拆了。',
      '酒馆里最靠里的那桌在传，南边有一整支队伍不见了。',
      '旧书贩子说，古咒里提到的那种东西醒了一回。',
      '雇主那边捎话来，说揭榜的人当天就出了城。',
      '公会门口的人说，法师塔把底下那层封了，不让人靠近。',
      '有人从北边回来，说那片焦土上又开始冒白气。',
      '码头上传的话是，珊瑚海国那两艘船在近岸停了三天。',
      '铁匠铺门口的人说，法师塔新收了几个学徒，这两天街上常能碰见。',
      '告示板上贴了新的，说是天黑后不许出城。',
      '铺子里在讲，磨坊那家的姑娘昨夜没回家。',
      '有人从西岸回来说，那边城邦之间的路让水冲断了。',
      '药草铺的店主说，这两天买伤药的比往常多。',
      '铁匠铺传的话是，有人一口气订了二十把镰刀。',
      '跑船的捎回话来，说这半月出灰港的船少了一半。',
      '街上都在传，城南那口老井昨夜自己冒了热水。',
      '有个赶车的说，北边那座桥底下新堆了石头。',
      '驿站的人说，旧书贩子正找一本缺了角的册子。',
      '卖柴的说，古林边上这几夜有火，不像是烧炭的。',
      '有人在酒馆里讲，黑石要塞换了个管事的。',
      '渡口的人说，河对岸的货栈这两天在连夜装车。',
    ],
    encounter: [
      '他在断墙后面挨了{e}下，才把那只灰皮的兽逼退。',
      '路边窜出{e}只黑影，他跟它们对上了，斗篷被撕开一道。',
      '他在矿洞口被{e}只爪子发白的东西围住，退到火堆边才站住。',
      '桥底下爬上来{e}条青鳞的长虫，他用火把一条条捅回去。',
      '林子深处撞见一头长獠牙的野猪，他绕着树跟它兜了{e}圈。',
      '雪地里{e}只狼跟了他半里路，直到他点着一根松枝。',
      '废墟里那扇门自己开了，他挨了{e}记冷风，脸上像被刀刮过。',
      '他踩进一张网里，割了半天才下来，网上的{e}根绳都断了。',
      '坟头那点动静越来越大，他扔了{e}回石头才压住。',
      '他退到断墙后面，跟那群死物隔着一堵墙对了{e}回。',
      '他在断墙后面挨了{e}下，那具石像才站住不动。',
      '路边窜出{e}只灰皮的兽，他拿符纸拍过去，斗篷被撕开一道。',
      '他从矿道里退出来，身后那{e}个影子跟到洞口才散。',
      '他在断墙后面念了句短的，扑上来的那团影子散成一片灰。',
      '他抽出旧剑挡了一下，刃上立刻爬满了霜。',
      '他进矿道没走多远，前头就传来{e}声拖铁链的响。',
      '雪地里有一串新脚印，他顺着走了半里，脚印忽然断了。',
      '他推那扇木门的时候，门后{e}只乌鸦扑棱棱飞出来。',
      '渡口的船划到河心就不动了，他等了{e}刻才看见有人从水里爬上来。',
      '林子里有人叫他的名字，回头{e}次都没有人。',
      '他点着松枝照了照，那口井里浮着{e}根断绳。',
      '废墟那道门缝里有风出来，他贴着墙走了{e}步才敢喘气。',
      '他在半路让一块滚下来的石头逼到崖边，站了{e}会儿才过去。',
      '他摸黑过桥，桥板上{e}处是断的，只能踩中间。',
      '夜里有东西扒他的窗，扒了{e}下就停了。',
      '他挑着灯往前走，前头那点亮跟着动了{e}回。',
      '有人隔着一道篱笆念了半句，虫声一下全停了。',
    ],
  },
  worldQuiet: [
    '巷口那只猫在墙头趴了一天，谁从底下过都不动。',
    '风从城门那边灌进来，檐下的幌子响了一整个下午。',
    '卖柴的推车从门口过去，木轮压得石板吱了一道。',
    '几只鸦落在对面屋脊上，叫了一阵，又一起飞走了。',
    '河边的水车转得慢，木轴吱嘎吱嘎地响到天黑。',
    '有孩子在巷子里追一只纸鸢，笑声一直闹到日头偏西。',
    '街上的石板被人踩得发亮，边角上还留着昨夜的霜。',
    '守夜的提着灯走过街口，光影在墙上晃了一下就没了。',
    '檐水敲了台阶一夜，天亮时忽然停了。',
    '远城的钟敲了三下，隔着两条街传过来，闷闷的。',
    '街口的符灯亮了一夜，天亮时有人来换灯芯。',
    '法师塔的钟敲过三下，街上的狗跟着叫了一阵。',
    '檐下挂的那道旧符被风吹得翻了个面，又翻回来。',
    '街上有人试法术，檐角那串铜铃响了一路。',
    '巷子深处总响着水声，找不着是哪一家。',
    '猫从檐上下来，踩翻了一只空陶罐。',
    '风把落叶扫到墙根，堆成一小堆。',
    '井边的木桶自己晃了两下，没人来提。',
    '对面铺子把门板上了一半，里面的光窄成一条。',
    '谁家在院里劈柴，斧声隔一会儿来一下。',
    '一群麻雀在石板缝里啄了半天，有人过来就散。',
    '院子里的水缸夜里上了冻，早上裂了一道缝。',
    '河上一条船过去，桨声从这头响到那头。',
    '墙根的青苔湿了一层，是夜里落过雨。',
    '街口那两个说闲话的声音低下去，一会儿又起来。',
    '远处有人家合上院门，动静轻得几乎听不见。',
  ],
  props: [
    ['卷轴', 'scroll'],
    ['卷宗', 'scroll'],
    ['契书', 'deed'],
    ['符纸', 'talisman'],
    ['架子', 'shelf'],
    ['箱子', 'box'],
    ['梯子', 'ladder'],
    ['册子', 'book'],
    ['机关', 'device'],
    ['法器', 'device'],
    ['零件', 'parts'],
    ['齿轮', 'parts'],
    ['炉', 'stove'],
    ['火', 'stove'],
    ['洞窟', 'cave'],
    ['石台', 'bench'],
    ['石阶', 'bench'],
    ['酒馆', 'tavern'],
    ['货栈', 'market'],
    ['公会', 'guild'],
    ['灯', 'lamp'],
    ['纸', 'paper'],
    ['墨', 'ink'],
    ['笔', 'pen'],
    ['窗', 'window'],
    ['门', 'door'],
    ['汤', 'tea'],
    ['地图', 'map'],
    ['图', 'map'],
    ['路', 'road'],
    ['摊子', 'stall'],
    ['椅子', 'chair'],
    ['围裙', 'apron'],
    ['手腕', 'hand'],
    ['羊皮', 'paper'],
    ['银墨', 'ink'],
    ['石板', 'slate'],
    ['镇石', 'slate'],
    ['火漆', 'wax'],
    ['齿盘', 'parts'],
    ['风箱', 'bellows'],
    ['箱笼', 'box'],
    ['匣子', 'box'],
    ['悬赏', 'guild'],
    ['商队', 'market'],
    ['旅店', 'tavern'],
    ['行商', 'trader'],
      ['吟游诗人', 'bard'],
    ['兜帽', 'cloak'],
    ['斗篷', 'cloak'],
    ['路碑', 'road'],
    ['火盆', 'brazier'],
    ['靴子', 'boots'],
    ['面包', 'bread'],
    ['汤', 'soup'],
    ['马', 'horse'],
    ['霜', 'frost'],
    ['干粮', 'ration'],
    ['水壶', 'kettle'],
    ['乱石岗', 'scree'],
    ['残墙', 'wall'],
    ['枯手', 'hand'],
    ['石鸦', 'crow'],
    ['驮马', 'mule'],
    ['浅滩', 'ford'],
    ['车辙', 'rut'],
    ['矿洞', 'mine'],
    ['坑道', 'mine'],
    ['辘轳', 'winch'],
    ['火绳', 'fuse'],
    ['矿灯', 'lamp'],
    ['河湾', 'bend'],
    ['柳树', 'willow'],
    ['断梁', 'beam'],
    ['碎瓦', 'tile'],
    ['哨棚', 'shed'],
      ['墙根', 'rampart'],
    ['石缝', 'crack'],
    ['符灯', 'lamp'],
    ['符牌', 'talisman'],
    ['法师塔', 'tower'],
    ['龙骨', 'bone'],
    ['灰烬', 'ash'],
  ],
  life: {
    morning: [
      '天刚亮他就起来了，炉子上的水还没开。',
      '他起得比左邻右舍都早，先把炉子生上。',
      '他把窗板推开，外面还蒙着一层白。',
      '他在灶上热了碗昨晚的汤，就着黑面包吃完。',
      '他把夜里晾在外头的靴子拿进来，鞋面上一层霜。',
      '他天不亮就醒了，躺着听了一会儿外面的风。',
      '他起来先把火拨旺，屋里这才亮起来一点。',
      '他蹲在门口把鞋带系紧，霜让他的指头有点僵。',
      '他打了桶井水洗脸，冷得直吸气。',
      '昨晚的干粮还剩半块，他就着凉水咽了。',
      '他出去看了一眼天，回来把斗篷搭在椅背上。',
      '他起来的时候，院里那只狗已经在门口等着了。',
      '他把炉子捅了捅，昨天的灰从底下漏下去。',
      '他起来先把檐下那盏符灯灭了，天已经亮开。',
      '他把炉门敞开了一会儿，屋里才慢慢有了热气。',
      '他去井边把水缸添满，回来时袖口湿了一片。',
      '他用指头在窗纸的霜上抹了一道，外头白得看不出路。',
      '他把昨晚留在案上的东西收到一边，扫了扫桌面。',
      '他端起粥碗，站在门口喝了大半。',
      '他起来先把院门闩抽开，让早起的人能进来。',
      '他没点灯，摸黑把水烧上，等天光自己进来。',
      '他把昨晚泡着的碗洗了，水冷得指头僵。',
      '他站在门口活动了下腰，才回屋拿笔。',
      '檐下的水滴得慢了，他抬头看了一眼天。',
    ],
    night: [
      '镇上只剩他这一扇窗还亮着。',
      '他添了两回灯油，还没打算睡。',
      '他把灯芯剪短了一截，屋里暗下去一点。',
      '风从北边过来，他往火盆里添了两块炭。',
      '他打了个哈欠，又把手边的活拿了回来。',
      '外面的风声过去一阵，他还坐着没动。',
      '他把斗篷裹紧了些，炉子里的火已经矮下去。',
      '夜里起了风，窗子被吹得响，他起来扣紧了。',
      '他吹了灯又坐了一会儿，才摸黑躺下。',
      '他睡得晚，睡前把灶里的火压住了。',
      '屋檐上滴着水，他听着听着又坐了起来。',
      '他把靴子摆在床边，省得明早摸黑找。',
      '他起身添了把柴，回来看见火又旺了。',
      '法师塔的钟敲过一遍，他把案边的灯挑亮了些。',
      '他靠着椅背坐了一阵，眼皮沉得抬不起来。',
      '他解开领口，把外衣搭到床脚。',
      '他往灶里塞了根粗柴，好让火留住到天亮。',
      '他前半夜一直在做事，后半夜的灯芯短了又短。',
      '他用袖子擦了擦案子，把纸卷起来收进柜里。',
      '他困得撑不住，就和衣在床上歪着。',
      '他把灯挪远了些，怕明天纸上有烟痕。',
      '外头有狗叫了两声，随后又静下去。',
      '他数了数剩下的灯油，把灯芯又剪短一点。',
      '他把窗子掩上一半，留了条缝透气。',
    ],
    out: [
      '这中间他出去过一趟，回来手里多了个纸包。',
      '他离开了小半天，回来时靴子上还沾着泥。',
      '他出去走了一圈，回来身上带着外面的凉气。',
      '他中途出去了一趟，回来先把窗子推开透气。',
      '他回来时袖口卷着，肩上搭着斗篷。',
      '他出去办了点事，回来给自己倒了碗水，站着喝完。',
      '他出去了一阵，回来头发上还挂着雪。',
      '他回来的时候天已经擦黑，先把灯点上了。',
      '他出去了一趟，回来手里拎着半条干肉。',
      '他中间走开过一会儿，回来把外衣搭在门后。',
      '他回来得晚，脸上让风吹得发红。',
      '他出去走了一趟，回来鞋底上带着草屑。',
      '他离开的时候没关门，回来屋里凉了半截。',
      '他出去过一趟，回来把湿了的斗篷摊在炉边。',
      '他出去过一趟，回来手里捏着一张换来的符牌。',
      '他中途到街上去了一趟，回来袖子里塞着一小卷纸。',
      '他出去看了趟货，回来把靴子上的泥敲在门槛外。',
      '他出去得久了，回来先把外衣挂到钩上。',
      '他出去转了一圈，回来胳肢窝底下夹着一小捆柴。',
      '他回来时鼻尖冻得通红，手在炉边烤了好一会儿。',
      '他出去时天还亮着，回来屋顶上已经响了霜。',
      '他出去问了一趟路，回来把打听到的写在纸角上。',
      '他出去送了一趟东西，回来手上空着。',
      '他离开一阵，回来时扫了一眼案上的纸，才坐下。',
      '他出去躲了会儿屋里那股烟，回来把炉门关小。',
      '他中途回去了一趟，把忘带的东西取来。',
    ],
    // 这一池说的都是「隔过去一段」：头几句刻意不带时间状语，免得十八句一个模子
    // （用户第 3 条：句库读起来不像同一句话换了名词）。
    overnight: [
      '再坐到那个位置时，桌上已经落了层薄灰。',
      '回来时天已经放晴，他把窗板推开，光重新落回桌上。',
      '桌上的汤凉了，他换了碗热的。',
      '窗台上落了一层灰，他抹了一把。',
      '院门被风顶得直响，他回来时先去把门掩上。',
      '窗板上的霜化成水，滴在案子边沿。',
      '隔了一夜，他把布帘挂回钩上，屋里那股冷气还没散，他先添了柴。',
      '中间隔了一天，他回来时门口堆着新落的雪。',
      '隔了一夜，他昨晚留下的那盏灯已经灭了。',
      '中间隔了一天，他把斗篷上的土抖干净才进来。',
      '隔了一夜，他先把炉子生上，才坐下。',
      '中间隔了一天，锅里的水早就凉透了。',
      '隔了一夜，他先扒开炉灰，看底下还有没有火。',
      '隔了一夜，案角那盏灯结了灯花，他拨了拨。',
      '中间隔了一天，他掀开门帘，屋里比外头还冷。',
      '隔了一夜，墙角的柴只剩下一小堆，他先去后院搬了。',
      '隔了一夜，纸上落了灰，他把灰吹干净才动笔。',
      '隔了一夜，他又坐到老位置上。',
      '隔了两天，桌上的纸边翘起来，他伸手压了压。',
      '空了一天，他进屋先把窗子支起来透气。',
      '隔了一夜，水缸上结了层薄冰，他敲开才舀水。',
      '中间隔了一天，他把案上的东西一件件归了位。',
      '隔了一夜，灯芯短了一截，他换了根新的。',
      '空了一天，他回来时门轴响了一声，像有人先来过。',
    ],
    longsit: [
      '他中途歇过一回，啃了块干粮又坐回去。',
      '坐到腿麻，他站起来在屋里走了两圈。',
      '他起来添了一次炭，活动了下肩膀，又坐下。',
      '他起身把水壶坐到炉上，回来接着做。',
      '他坐得太久，起来把窗子推开透了会儿气。',
      '他中间出去站了站，看了看天，又回来坐下。',
      '他起来倒了碗水，喝完把碗搁在一边。',
      '他坐着坐着打起盹来，醒了之后揉了揉脸。',
      '他起身活动了下手腕，把斗篷脱了搭在椅背上。',
      '他中间歇了两回，炉子上的水都烧干了一次。',
      '他坐得久了，起来给灯添了点油。',
      '他停下来揉了揉眼睛，又把手边的东西拿回来。',
      '他做了太久，起来揉了半天手腕才拿得动笔。',
      '他停下来活动了下脖子，把灯往手边挪了挪。',
      '他起身把炭盆挪远了些，屋里那股闷气散了散。',
      '他从案前起来，在门边站了一会儿，听外面的动静。',
      '他中途歇了一回，靠在墙上闭了闭眼。',
      '他起来给灯添了油，回来时手脚都缓过来了。',
      '他坐得腰酸，起来在门口站了会儿，看街上的人。',
      '他停下去把炉门关小，回来时屋里静了些。',
      '他起身洗了把脸，回来接着做。',
      '他揉了揉肩，把椅子往桌前挪近一点。',
      '他歇了一会儿，顺手把散在案上的纸拢齐。',
      '他站起来伸了个懒腰，回来把灯芯挑细。',
    ],
  },
  // 一天的**头尾与那几顿饭**（2026-10-08 加的，用户第 2 条：一天得有头有尾，
  // 而且他那边的时间要跟你那边的钟点对得上——早、中、晚都得吃饭，也可能让活耽误）。
  //
  // 三样：`open` 是这一天怎么起头（按这一天**第一格**的钟点挑）、`close` 是这一天
  // 怎么收（按**最后一格**的钟点挑，只有**过完了**的日子才说）、`meal` 是那顿饭
  // （按钟点挑，`*Late` 是「让活耽误了」那一版）。
  // 六档钟点：dawn 零点到六点、morning 六点到十一点、noon 十一点到十四点、
  // afternoon 十四点到十八点、evening 十八点到二十二点、night 二十二点以后。
  //
  // 这一组**只在包里**（跟 `moments` 一样，不在 `src/client.js` 的 `SOURCE_CONTENT` 里抄一份）：
  // 它跟着说法走，薄包退回世界那一份（`../index.js` 的 `applyPack`）。
  dayFrame: {
    open: {
      dawn: [
        '天还没亮他就动了手，屋里只点着一盏灯。',
        '后半夜他还没躺下，把东西摊开接着做。',
        '这一天的头起在天亮之前。',
        '天还黑着他就起了手，先把炉子拨旺。',
        '鸡鸣过了他才坐到案前，把纸铺开。',
      ],
      morning: [
        '他上午把桌子收拾出来，一天从这儿起头。',
        '天亮之后他先坐了下来。',
        '这一天的头，是他推开窗板那会儿。',
        '他一早就烧上水，把案上的东西摊开。',
        '早上他把窗板推开，干活从这一会儿起。',
      ],
      noon: [
        '他这天的头起得晚，晌午过了才坐下。',
        '晌午那会儿他才把东西摆开。',
        '这一天是从晌午开始的。',
        '日头到了头顶，他才把手边的活接上。',
        '晌午一过他又坐回案前，把活往下接。',
      ],
      afternoon: [
        '午后他才腾出手，把东西一件件摆好。',
        '这一天起在日头偏西的时候。',
        '下午他才坐下来，先把手边清了一遍。',
        '过了晌午他才动手，那阵子日头斜进去。',
        '这一天是从他歇过晌午之后起头的。',
      ],
      evening: [
        '天擦黑他才动手，先把灯点上。',
        '这一天是从掌灯时候起的头。',
        '傍晚他才有空坐下。',
        '天快黑时他才把桌子腾出来，动手做活。',
        '灯点上的时候，他这一天刚起头。',
      ],
      night: [
        '夜里他把灯挑亮，一天从这儿起头。',
        '这一天起在镇上静下来之后。',
        '入夜之后他才动手。',
        '他等镇上的灯都灭了才动手。',
        '入夜以后他把案上的东西抹平，接着做。',
      ],
    },
    close: {
      dawn: [
        '他做到天快亮才停手。',
        '这一天的活收在天亮之前。',
        '快天亮时他把东西归拢好，才算完。',
        '他停手的时候，外头已经泛白了。',
        '这一天的活计停在天要亮的那一阵。',
      ],
      morning: [
        '上午还没过完，他就收了手。',
        '这一天的活到上午为止。',
        '他把手边的东西收好，上午就收了工。',
        '他收手的时候，日头还没到头顶。',
        '前半晌一过，他就把这一天收住了。',
      ],
      noon: [
        '晌午一过，他把这一天收了尾。',
        '这一天的活在晌午前后停了。',
        '他把桌上的东西归拢好，晌午刚过就停了手。',
        '日头刚偏，他把手里的活放下了。',
        '这一天的活到晌午就停了下来。',
      ],
      afternoon: [
        '下午他把东西归拢好，就算收工。',
        '这一天的活停在日头还高的时候。',
        '收工的时候日头还没落。',
        '他没等到天黑就把手里的活收了。',
        '日头还挂在西边，他把这一天收了。',
      ],
      evening: [
        '天黑下来，他把灯点上，一天的活到这儿。',
        '这一天的活收在天黑之后。',
        '他收工的时候，外面的灯已经亮起来了。',
        '天黑之后他又做了好一阵，才把灯挪到一边。',
        '他收手的时候，街上的人声已经散了。',
      ],
      night: [
        '后半夜他才把灯吹了。',
        '这一天的活做到夜里才停。',
        '他吹灯的时候，外面已经没动静了。',
        '他做到后半夜才把东西归到一处。',
        '这一天的活计做到油快见底才停。',
      ],
    },
    meal: {
      breakfast: [
        '他早上热了点东西吃，才坐回去。',
        '早上那顿他吃得简单，就着水咽下去。',
        '他停下来吃了口早饭，手上的东西没挪地方。',
        '早起他吃了两口，就又坐回案前。',
        '这顿早饭他吃得匆忙，凉了也没顾上。',
      ],
      breakfastLate: [
        '早上那顿他拖到过了点才吃，中间一直没起身。',
        '早饭他是等手上那一段做完才吃的。',
        '该吃早饭的时候他正忙，那顿就往后拖了。',
        '早饭他拖到了半晌才吃，前头一直埋着头做。',
        '他把早上那顿往后压了压，手上先做完一段才吃。',
      ],
      lunch: [
        '晌午他停下吃了顿热的。',
        '中午那顿他吃得不急，吃完还坐了一会儿。',
        '他到点吃了午饭，回来接着做。',
        '晌午他拿手边的东西垫了一口。',
        '午饭他吃完把碗推开，又坐回桌边。',
      ],
      lunchLate: [
        '晌午那顿他拖到过了点才吃。',
        '该吃午饭的时候他正忙，那顿就往后拖了。',
        '他是等手上那一段告一段落，才想起吃饭的。',
        '午饭他误了时辰，活计告一段落才吃上。',
        '晌午过了好一阵，他才把手里的东西放下吃饭。',
      ],
      supper: [
        '天黑前他吃了点东西。',
        '傍晚他停下吃了晚饭，顺手把灯点上。',
        '晚上那顿他吃得踏实，吃完才接着做。',
        '天擦黑他把晚饭吃了，缓了一口气。',
        '晚上那顿他是在灯底下吃的。',
      ],
      supperLate: [
        '晚饭他是等手上那一段做完才吃的。',
        '该吃晚饭的时候他正忙，那顿一直拖到夜里。',
        '他忙过那一阵，才想起还没吃饭。',
        '晚饭让手上的活耽误了，一直推到夜里才吃上。',
        '手上的活把晚饭耽误了，他天黑尽了才吃。',
      ],
    },
  },
  // 序曲（2026-10-08 加，用户第 3 条：「他可以有名字，你取一个」，要类魔戒那种音译味）。
  //
  // 一段**固定的**开场，按顺序说，不从池里挑：他叫什么、从哪儿来、落脚处落在哪块地方、
  // 靠什么换饭吃，最后一句把故事钉在这儿。名字**只说这一次**——全篇一千多条句子照旧
  // 一律用「他」；名字一多就变成角色扮演了（`name` 单独一格，将来的归宿那一句还要用它）。
  //
  // 挂在时间轴**最老的那一行**上（见 client.js 的 `ORIGIN` 与 `renderTimeline`），不是挂在
  // 「第 0 天」那个日卷上：折叠梯子越往前越粗，第 0 天那一行迟早被折掉，序曲就跟着没了。
  //
  // 这一组**只在包里**（跟 `moments` / `dayFrame` / `clash` 一样，不在 `SOURCE_CONTENT` 里抄）。
  // 校验：R15（名字在第一句里、序曲至少四句、名字不许在别处再出现）。
  origin: {
    name: '塔里恩',
    lines: [
      '他叫塔里恩，是从南边搭船来的。',
      '船在灰港靠的岸，他背着箱子往北走了三天。',
      '他住的那间屋子在河间王国的边上，北边是霜脊山脉。',
      '他会誊抄，会画图，会修机关，师父留下的手艺够他一路换口饭吃。',
      '他随身只带一只旧箱子，和几份没写完的契书。',
      '往后他要走的路，册子上都画着。',
    ],
  },
  actionPlace: {
    改文件: 'scriptorium',
    跑命令: 'workshop',
    翻文件: 'archive',
    查资料: 'market',
    派了活: 'guild',
    聊了聊: 'tavern',
  },
  // 高光事件：一天最多一件，条件全是真的（见 ./moments.js 的头注）。
  // 装进面板的是 `MOMENTS`（`../index.js` 的 `applyPack`），判条件的是 `../rules.js`。
  clash,
  moments,
  // 方向与比例：一天朝哪边走（上限不是配额），以及这一天的抬头（见 ./directions.js 的头注）。
  // 装进面板的是 `DIRECTIONS`，判的是 `../rules.js` 的 `directionOf`。
  directions,
  // 归宿：一整年收在哪一句上（见 ./fate.js 的头注）。
  // 装进面板的是 `FATES`，判的是 `../rules.js` 的 `fateOf`。
  fate,
  // 痕迹池：那一天挑过的那条路，今天后面每一格怎么说（见 ./marks.js 的头注）。
  // 装进面板的是 `MARKS`；它**只活当天**，不写进 `records.json`，也不跨天（用户 m01903 第 3 条）。
  marks,
  // 战斗：一场仗四到六拍（见 ./fights.js 的头注，用户 m14888「他必须有战斗」）。
  // 装进面板的是 `FIGHTS`，判的是 `../rules.js` 的 `fightOf`（第十一台机器）。
  // 旧的 `clash`（两拍、没有对手）留着不接线——用户 m14810 第 6 条：旧句子留作备用。
  fights,
  // 当日计划与册子上的路：那一天他手上那几件事、走到第几站、这一季的路通不通
  // （见 ./journey.js 的头注，用户 m14781 要的「一个人的一天」）。
  // 装进面板的是 `JOURNEY`，判站的是 `../rules.js` 的 `stationOf`（第九台机器）。
  journey,
  // 命运（2026-10-10 加，用户 m16528「这种选择，不叫命运」／m16552「其实是一本书的结构」）：
  // 他走到一个岔口，两条路——一条主线、一条分支；挑了以后跟着一整段危机，分支上要么死，
  // 要么绕回主线。跟旧的那一层（`moments` 里的 `choice` + `cost`）不是一回事：
  // **代价不可知**，按钮上只写地名与眼前那一句。
  // 装进面板的是 `FORKS`，判的是 `../rules.js` 的 `forkOf` 与 `resultOf`。
  forks,
}

  return { adventure }
})()

const __mod16 = (() => {
/**
 * 冒险者的事务所 · 世界的规矩
 *
 * 这份数据是**人写**的（不是从代码里抽的），数字一处一处对着 `src/client.js` 里
 * 写死的三段抄下来：
 *
 *   danger   src/client.js:3709-3723  `dangerOf`
 *   outcome  src/client.js:3195-3208  四档怎么选（`pickShards` 内）
 *   world    src/client.js:3753-3763  外头那层的桶权重（`worldLine` 内）
 *
 * 「抄对了没有」不靠眼睛看：`.tmp-acp/verify-rules.mjs` 在十万种处境组合上，
 * 逐个比对「这份规矩算出来的」与「client.js 里跑着的那段代码算出来的」。
 * 接线之后那三段代码改成读这份数据，行为一个字节都不变。
 *
 * 改这里的数字 = 改这个世界的性格（多危险、多容易撞上东西），**不改事实**：
 * 事实永远是 records.json 里那些动作、时长、失败与文件名。
 */

const rules = {
  danger: {
    // 平常的一天是 12 点；封顶 55（再糟也不会「必然挨打」，那是抽卡，不是记录）。
    base: 12,
    cap: 55,
    terms: [
      { when: 'fails', per: 9, max: 4 }, // 工具报错的次数：一次九点，最多四点
      { when: 'hour', in: [[23, 24], [0, 5]], add: 14 }, // 深夜
      { when: 'hour', in: [[20, 24], [0, 8]], add: 7, else: true }, // 天黑以后、天刚亮
      { when: 'minutes', gte: 120, add: 8 },
      { when: 'minutes', gte: 60, add: 4, else: true },
      { when: 'place', out: true, add: 8 }, // 位置认不出来（薄世界包才会走到这一档）
      // 野地里的那六件活：从前写 `place: null`，靠上面那条 `out` 加这八点；
      // 2026-10-08 各自有了落点（`ruin` / `frost` / `mine` / `quench` / `tower` / `watch`），
      // 所以改成按落点点名，分数一分不差。
      { when: 'place', is: ['ruin', 'frost', 'mine', 'quench', 'tower', 'watch'], add: 8 },
      { when: 'place', is: ['market', 'guild', 'tavern'], add: 4 },
    ],
  },

  // 四档（paid / hurt / more / tail）怎么落。掷点用 `seed` 的稳定散列，
  // 所以同一份记录每次都是同一场仗，刷新页面不会换个结果。
  outcome: {
    paidAt: 50, // 有交付物时，前 50 点落「交活拿钱」
    numAt: 34, // 剩下的行里约三分之一点「这件活他做了多少遍」
    minRepeat: 2, // 至少两次才提遍数
    hurtFloor: 1, // 没撞过墙也可能挨一下，但次数不能写成「第零遍」
  },

  // 他干活的时候，**外头**发生的事。权重不是概率表，是「这种日子更可能听到哪一种消息」。
  world: {
    minMinutes: 5, // 三五分钟的一段，外头来不及出事
    terms: [
      { when: 'fails', per: 12, max: 3, bucket: 'encounter' }, // 撞过墙的人更容易碰上东西
      { when: 'helpers', gt: 0, bucket: 'visitor', add: 18 },
      { when: 'tags', has: ['派了活', '聊了聊'], bucket: 'visitor', add: 12 },
      { when: 'tags', has: ['查资料', '翻文件', '聊了聊'], bucket: 'news', add: 16 },
      { when: 'minutes', gte: 60, bucket: 'news', add: 8 },
      { when: 'hour', in: [[23, 24], [0, 5]], bucket: 'night', add: 22 },
      { when: 'hour', in: [[5, 8]], bucket: 'dawn', add: 22, else: true },
      { when: 'outside', bucket: 'road', add: 16 },
      // 方向（见 ./directions.js）：这一天朝哪边走，「外头」那层就更可能听见哪一种消息。
      // 读的是**按天算出来的**方向（`entry.direction`），所以同一天里每一行听到的风声是一路的。
      // 涉险的日子更容易撞上东西（这一条也是「战斗要多一点」的正路：它要真的撞过墙才算涉险）。
      { when: 'direction', is: ['risk'], bucket: 'encounter', add: 18 },
      { when: 'direction', is: ['coin'], bucket: 'news', add: 12 }, // 攒盘缠的日子满耳朵是行市
      { when: 'direction', is: ['food'], bucket: 'visitor', add: 12 }, // 寻吃食的日子总碰上街坊
      { when: 'direction', is: ['hearth'], bucket: 'quiet', add: 12 }, // 守着炉子的日子城里没什么事
      { when: 'always', bucket: 'quiet', add: 20 }, // 兜底：总得有一句，宁可平常也不能空着
    ],
  },

  // 这个世界自己的「规矩」：什么算数、什么算禁忌、违约的代价。
  // 现在是空的；故事包（仙侠 / 规则怪谈）该在这一层拉开差别，而不是只换词。
  canon: {},
}

  return { rules }
})()

const __mod17 = (() => {
/**
 * 预留的故事风格（2026-10-06 晚，用户第 3 条）
 *
 * 用户原话：「预留几个风格，为规则怪谈、宫斗心计、谍战潜伏。」
 *
 * 这三套**一个字的内容都还没有**——它们是**占位**：把名字先摆进注册表，于是
 * 「故事风格」那张清单里就列得出它们（列着、点一下摊开它自己那一句、点了不换说法）。
 * 将来真要写的时候，照 `./adventure/`（厚）或旧 `./ferry/`（薄，已收进
 * `.parked/ferry-voice/`）的形状往这个对象里填：`actionLines` 一有，「讲得出话」的
 * 判据 `narrates` 就为真，那一项自己就亮了。
 *
 * **为什么用 `soon` 而不是 `free: false`**：`free` 说的是钱——付费包把 id 塞进
 * `createGameflow` 的 `unlocked` 就能用；这三套是**还没写**，给多少钱都用不了，
 * 所以单列一个字段。面板见到 `soon` 直接判死，**不理会 `unlocked`**。
 *
 * 三套都不给 `voice` 之外的东西：不给词表、不给场景、不给地理（地理只归世界包，
 * 见 README 的 R11）。所以它们进不了 `VOICES`/`SCENES`/`SHARDS`——装载器只收
 * 「有 `actionLines` 的包」，自检里有一条钉着这件事。
 *
 * **`tagline` 是唯一给的一件东西**（2026-10-06 深夜，用户原话：「为这三套写一个面板上的话，
 * 去找参考来写其核心。」）。它不是广告词，是**这一套的核**——一句话，两处都用它：
 * 悬停时浮出的那个框（跟挑得动的那几套一个规矩），以及点一下摊开的那一块。
 * 让一个只有名字的占位项说得出自己是什么。写法照 `./adventure/world.js` 那句：
 * 陈述句、句号收尾、不用阿拉伯数字、不用现代词，一句话里装着这一体的**机制**。
 *
 * 三句的来路（都去看了各体的说法，不是凭印象编的）：
 *   · 规则怪谈——「以规则文本为载体构建矛盾叙事，通过貌似理性的框架植入逻辑裂缝来营造
 *     恐怖氛围」（规则怪谈档案馆《如何写作规则怪谈》），**假规则**是点睛之笔。
 *     所以那一句里同时有「守则」和「红笔添上去的那一条」。
 *   · 宫斗心计——宫斗剧「几乎所有的故事都发生在与世隔绝的后宫中，『斗』是其核心情节和
 *     叙事重心」，一句台词的弦外之音就是刀子。所以那一句落在「只说一半」上。
 *   · 谍战潜伏——传统谍战的核心人物以**双重身份**构建戏剧冲突（《潜伏》的余则成），
 *     情节绕着情报传递与身份甄别转。所以那一句把「名字」与「怀里那份东西」对起来。
 */

const rulesHorror = {
  id: 'rules-horror',
  name: '规则怪谈',
  kind: 'voice',
  free: false,
  soon: true,
  voice: 'rules-horror',
  label: '规则怪谈',
  tagline: '守则贴了满墙，红笔添上去的那一条不在里面。',
}

const palaceIntrigue = {
  id: 'palace-intrigue',
  name: '宫斗心计',
  kind: 'voice',
  free: false,
  soon: true,
  voice: 'palace-intrigue',
  label: '宫斗心计',
  tagline: '宫里的话都只说一半，另一半留给听的人去猜。',
}

const espionage = {
  id: 'espionage',
  name: '谍战潜伏',
  kind: 'voice',
  free: false,
  soon: true,
  voice: 'espionage',
  label: '谍战潜伏',
  tagline: '他的名字是假的，揣在怀里的那半张电文是真的。',
}

/**
 * 注册表按**这个顺序**把它们摊进 `PACKS`——也就是「故事风格」那张清单里的次序
 * （顺序是行为的一部分，见 `./index.js` 的注释）。
 */
const RESERVED = {
  'rules-horror': rulesHorror,
  'palace-intrigue': palaceIntrigue,
  espionage,
}

  return { rulesHorror, palaceIntrigue, espionage, RESERVED }
})()

const __mod1 = (() => {
/**
 * 内容包：注册表 + 装载器。
 *
 * 一句话：**把「这是个什么世界」和「这个故事怎么讲」从代码里挪出来**，代码只剩
 * 「怎么讲」。数据在 `./<id>/index.js`，接口与规矩见 `./README.md`。
 *
 * 现在注册着**一个真包 + 三套预留的名字**：
 *   adventure  世界包（冒险者的事务所）——自带地理（地图、取景框、七处地名）与主题，
 *              同时自己也是一套说法（动作句、场景、拼句池、词表、熟人、世界句、道具、
 *              生活句、规矩、高光事件）。界面「故事风格」那一格上写着的「奇幻冒险」就是它。
 *   rules-horror / palace-intrigue / espionage
 *              三套**预留**的风格（规则怪谈 / 宫斗心计 / 谍战潜伏，见 `./reserved.js`）：
 *              一个字的内容都还没有，只是把名字摆进注册表，于是清单里列得出它们
 *              （列着、悬停浮出它自己那一句、点一下摊开，点了不换说法）。
 *
 * **曾经有两个说法**：`ledger`（第二套说法「案牍」）2026-10-05 被用户摘掉了——
 * 「我们只需要一个作为默认即可了！那么去掉案牍，我们只保留冒险」。它连内容一起收在
 * `.parked/ledger-voice/`（怎么放回来写在那边的 README 里）。
 * **`ferry`（「夜航船 / 船家」）2026-10-06 晚被用户摘掉了**——「新的风格不应该是所谓
 * 船家，去掉所有船家的内容」，它连自带的地理与主题一起收在 `.parked/ferry-voice/`。
 *
 * **已经接线**：`src/client.js` 顶层 import 本文件，启动时 `applyPack` 把那一组填进去，
 * `scripts/build-client.mjs` 会把 `./packs/<id>/index.js` 这种两层的 import 摊平进产物。
 * 所以现在**改包就改面板**，不用动 client.js。
 *
 * 两根轴（2026-10-06 用户第 1、2 条之后定下来的）：
 *   · **世界**给地理、主题、位置、规矩——面板上不再有换世界的入口（那格书架撤了），
 *     但槽位与校验（R11）都还在，将来真要换世界时不用重做。
 *   · **说法**给词——「故事风格」那一行点一下就换，**只换他那边的说法**：地图、地名、
 *     主题、左栏那些数字一个都不动（见 `applyPack` 的注释）。
 */

const { adventure } = __mod2
// 世界的规矩是**人写**的（数字对着 client.js 抄下来，再由 `.tmp-acp/verify-rules.mjs`
// 证明与那段代码一字不差），所以跟抽出来的文案分开放：文案可以重抽，规矩不会被冲掉。
const { rules: adventureRules } = __mod16
// 预留的三套风格（规则怪谈 / 宫斗心计 / 谍战潜伏）：只有名字，没有内容。
// 它们进的是 `PACKS`（于是清单里列得出来），但进不了 `VOICES`——装载器只收
// 「有 actionLines 的包」。面板见到 `soon` 就判死：列着、点不动。
const { RESERVED } = __mod17

/**
 * 全部内容包，键就是 id。
 *
 * **这里的顺序就是 `VOICES` 里说法的顺序**（`applyPack` 按 `Object.values` 装），
 * 也就是界面上「故事风格」那张清单里的次序。顺序是行为的一部分，不是随手排的。
 */
const PACKS = { adventure: { ...adventure, rules: adventureRules }, ...RESERVED }

const DEFAULT_WORLD = 'adventure'
const DEFAULT_VOICE = 'adventure'

// 给界面看的字段：`tagline` / `cover` 是「故事风格」那一格（2026-10-06 之前是门后那格
// 书架）上要用的两样；`narrates` 是「这个包讲不讲得出话」——面板拿它决定这一格摆不摆，
// **不必等说法表装进来**（刚注册的包也能立刻出现在清单里）；`soon` 是「预留」——名字
// 先摆上、内容还没写，面板照样列出来但点不动（2026-10-06 晚加，见 `./reserved.js`）。
// 句子本身一律不进清单——清单是给「挑哪个包」用的，不是给渲染用的。
const FACE = ['id', 'name', 'kind', 'free', 'soon', 'voice', 'label', 'tagline', 'cover']

/** 给界面用的清单（不含句子本身）。 */
function listPacks() {
  return Object.values(PACKS).map((p) => Object.fromEntries(
    FACE.map((k) => [k, p[k]]).concat([['narrates', !!p.actionLines]]),
  ))
}

function getPack(id) {
  return PACKS[id] || null
}

function worldIds() {
  return Object.values(PACKS).filter((p) => p.kind === 'world').map((p) => p.id)
}

function voiceIds() {
  return Object.values(PACKS).filter((p) => p.kind === 'voice').map((p) => p.id)
}

/**
 * 能不能用这个包。付费包在这里返回 false——**收款不归这个插件管**，
 * 授权（许可证文件 / 激活码）校验完之后把 id 传进 `unlocked` 就行。
 */
function isUnlocked(id, unlocked = []) {
  const pack = PACKS[id]
  if (!pack) return false
  return pack.free === true || unlocked.includes(id)
}

/**
 * 换包：世界包进 `world`、讲述者包进 `voice`。锁着的不切（原样返回）。
 * 纯函数——真正的切换要等接线之后由面板把结果交给 `applyPack`。
 */
function setPack(choice = { world: DEFAULT_WORLD, voice: DEFAULT_VOICE }, id, unlocked = []) {
  const pack = PACKS[id]
  if (!pack || !isUnlocked(id, unlocked)) return choice
  return pack.kind === 'world' ? { ...choice, world: id } : { ...choice, voice: id }
}

const copy = (v) => structuredClone(v)

/**
 * 把一个世界包 + 一个讲述者包的内容填进 `target`（就是 client.js 里那一组对象），
 * 缺字段会补上。返回 `target`；不传就新建一个（验证脚本用）。
 *
 * 2026-10-06 用户第 1、2 条之后分成了两根轴（原话：「切换的方式只能放在故事风格后面，
 * 也就是现在点击『冒险』这个地方进行切换」「切换的时候，不要改变其他内容，只改变叙事
 * 风格，也就是对应的他的冒险的下面的内容」）：
 *
 *   · **世界**（`worldId`）给的是「这是个什么地方」——地理（地图、取景框、七处地名）、
 *     主题、动作落在哪个地方（`ACTION_PLACE`）、规矩（危险与收获怎么算）。换说法时
 *     这些**一个字都不动**：记号不会挪、地图不会重画、配色不会变。
 *   · **说法**（`voiceId`）给的是「他那边怎么讲」——动作句、场景、收尾句、熟人、世界句、
 *     生活句、道具、落脚处那几句。凡是它没写的，退回这个世界自己的那一份。
 *
 * 填进去的都是**副本**：包本身永远是只读的。
 */
function applyPack(target = {}, worldId = DEFAULT_WORLD, voiceId = DEFAULT_VOICE) {
  const packs = Object.values(PACKS)
  const world = PACKS[worldId] && PACKS[worldId].kind === 'world' ? PACKS[worldId] : PACKS[DEFAULT_WORLD]
  // 谁在讲：挑中的那套说法（只要它有动作句）。**按 voice 在注册表里找**，不是按 id——
  // 一个包的名字（id）与它那套说法的名字（voice）可以不一样（薄包常常直接同名）。
  // 挑不出来就还是这个世界自己在讲。
  const narrator = packs.find((p) => p.voice === voiceId && p.actionLines) || world
  const voiceOf = (pack) => ({
    label: pack.label,
    lines: copy(pack.actionLines),
    words: copy(pack.words),
  })

  // 每套说法、每个世界的句子都留在里面：切语气只是换一个键，不用重新装载
  const voices = {}
  for (const pack of packs) if (pack.actionLines) voices[pack.voice] = voiceOf(pack)

  const scenes = {}
  const shards = {}
  const life = {}
  for (const pack of packs) {
    // 场景：**每套说法自己那一份**（一件事用这套说法讲，是哪几件、各叫什么）。
    // 挑哪一件事跟着当前说法走，但**位置不跟着它走**——`pickShards` 里有一道闸：
    // 说法给的地方要是这个世界没有（`PLACES` 里查不到），就退回动作对应的那个地方。
    // 于是切说法绝不会把记号挪到地图外面去，而每套说法都能带着自己的场景词进来。
    if (pack.scenes) scenes[pack.voice] = copy(pack.scenes)
    if (pack.shards) shards[pack.voice] = copy(pack.shards)
    for (const [bucket, lines] of Object.entries(pack.life || {})) {
      life[bucket] = life[bucket] || {}
      life[bucket][pack.voice] = copy(lines)
    }
  }

  // 这个世界的样子：地图、取景框、地点、默认主题。
  //
  // **两样地理必须成套**（校验器 R11）：框是照着一整段画好的 SVG 裁的，地点坐标又是
  // 照着同一张图钉上去的。所以一个包要么两样都给，要么两样都不给——**都不给就退回
  // 默认世界（adventure）那一套地理**：薄世界包可以只带句子、不画地图，切过去地图不动，
  // 这也让「换个包」永远是纯函数（跟历史、跟当前时间都无关）。
  const geo = world.map && world.places ? world : PACKS[DEFAULT_WORLD]

  // 户外的活＝场景里那些**落点是野地**的（`places[key].wild`），另外还写着
  // `place: null` 的也算。
  //
  // 2026-10-08（第三十六版）改的判据。原来只认 `place === null`——那六个户外的活
  // （描残咒、送契书、下矿洞、拖法器、翻塔册、查夜哨）正是这么标的，于是记号整场
  // 不在图上（用户：「角色标记不见了，他又跑了界外去了？？」），所以给它们配了
  // 野地里的落点（`wild: true`）。**但 `OUT_KEYS` 是从 `place === null` 反推出来的**，
  // 一改就整只 Set 空了——而 `OUT_KEYS` 还管着「外头多容易出事」（`worldWeights`），
  // 空了就等于那些活不再算「在外头」。所以判据跟着落点走。
  const outdoors = new Set()
  for (const list of Object.values(scenes)) {
    for (const items of Object.values(list || {})) {
      for (const scene of items || []) {
        if (scene.place === null || geo.places?.[scene.place]?.wild) outdoors.add(scene.key)
      }
    }
  }

  target.SCENES = scenes
  target.SHARDS = shards
  target.VOICES = voices
  target.LIFE_POOLS = life
  target.OUT_KEYS = outdoors
  // 现在是谁在讲。**任何一套说法都能讲任何一个世界**（说法借世界的地方说话），
  // 所以这里不再问「这套说法是不是这个世界的」——那是 2026-10-06 之前的老规矩。
  target.VOICE = voices[narrator.voice] ? narrator.voice : world.voice
  // 面板的默认语气也从这里定：`applyPack` 不传 voiceId 时用的就是它。
  // 这样「默认是谁在讲」只有一处（这个文件的 DEFAULT_VOICE），
  // client.js 里那个字面量只是装载之前的占位。
  target.DEFAULT_VOICE = target.VOICE
  target.PLACES = copy(geo.places)
  target.VIEW = copy(geo.map.view)
  target.MAP_SVG = geo.map.svg
  target.MAP_CSS = geo.map.css
  // 这套世界默认用哪个主题（`THEMES` 的 id）。只给 id：主题本身还在 client.js 里，
  // 换世界不该顺带重写一套配色。
  target.WORLD_THEME = world.theme || null
  target.WORLD_ID = world.id
  target.WORLD_LABEL = world.label
  // 这个世界自己那套说法的 id。面板拿它挑「哪一件事、记号落在哪儿」——
  // 那两样**只跟世界与记录有关**，换说法不动（用户 2026-10-06 第 2 条）。
  target.WORLD_VOICE = world.voice
  // 位置（`ACTION_PLACE`）与规矩：**世界的**，跟谁在讲无关。
  target.ACTION_PLACE = copy(world.actionPlace)
  // 世界的规矩：接线之后 client.js 里那三段（dangerOf / 四档 / 世界句权重）读它，
  // 而不是把数字写死在函数里。读法见 ./rules.js。
  target.RULES = copy(world.rules || {})
  // 剩下的全是**词**：谁在讲就用谁那一份；那套说法没写的（薄包只写动作句），
  // 退回这个世界自己的那一份，于是永远有话说。
  const words = (key) => copy(narrator[key] === undefined || narrator[key] === null ? world[key] : narrator[key])
  target.WORLD_LINES = words('worldLines')
  target.WORLD_QUIET = words('worldQuiet')
  // 兜底桶得是 `WORLD_LINES` 里真有的一个桶：`worldLine` 挑不到具体桶时落到 `quiet`，
  // 自检（`scripts/verify-rules.mjs`）也按「桶名 → WORLD_LINES[桶名]」查。句子只有一份，
  // 就是上面那批 `worldQuiet`——这里把同一个数组接成 `quiet` 桶，不在包里抄第二遍文本。
  if (target.WORLD_LINES && target.WORLD_QUIET && !target.WORLD_LINES.quiet) {
    target.WORLD_LINES.quiet = target.WORLD_QUIET
  }
  target.SHARED_LINES = words('sharedLines')
  target.HOME_LINES = words('homeLines')
  target.CAST = words('cast')
  target.CAST_LINES = words('castLines')
  target.PROP_WORDS = words('props')
  // 高光事件（2026-10-08 加）：跟句子一样归**说法**管——谁在讲，就讲谁的那几件事；
  // 那套说法没写（薄包）就退回这个世界自己的那一份，两边都没有就是空表。
  // 判条件的是 `./rules.js` 的 `momentOf`，一句一句排着说的句子在包里的 `moments`。
  target.MOMENTS = words('moments') || []
  // 一天的框（2026-10-08 加）：`open` 这一天怎么起头、`close` 怎么收、`meal` 那顿饭。
  // 跟 `MOMENTS` 一样归**说法**管，薄包退回世界那一份；两边都没有就是空的三样
  // （空表＝这一天没有定场句、没有收尾句、也不说饭，见 client.js 的 `dayFrameOf` / `mealOf`）。
  target.DAY_FRAME = words('dayFrame') || { open: {}, close: {}, meal: {} }
  // 交锋（2026-10-08 加，用户 m06647 第 2 条 + 后来的「全做」）：一场仗的后两拍，
  // 键与 `shards` 一一对应（26 个）。跟 `MOMENTS` / `DAY_FRAME` 一样归**说法**管，
  // 薄包退回世界那一份；两边都没有就是空表（空表＝挨打那一行照旧只有一句，见 `clashOf`）。
  target.CLASHES = words('clash') || {}
  // 序曲（2026-10-08 加，用户第 3 条「他可以有名字，你取一个」）：他叫什么、从哪儿来。
  // 跟 `MOMENTS` / `DAY_FRAME` / `CLASHES` 一样归**说法**管，薄包退回世界那一份；
  // 两边都没有就是空表（空表＝不说道开场，见 client.js 的 `ORIGIN` 与 `renderTimeline`）。
  target.ORIGIN = words('origin') || { name: '', lines: [] }
  // 方向与比例（2026-10-08 加，用户 m07234 第 2 条「比例需要调整」）：一天朝哪边走、
  // 上限多少、危险系数动几档、抬头那一句是什么。跟上面几组一样归**说法**管，
  // 薄包退回世界那一份；两边都没有就是空表（空表＝不说方向，见 client.js 的 `DIRECTIONS`）。
  target.DIRECTIONS = words('directions') || []
  // 归宿（2026-10-08 加，用户 m08146「全做。」第 ⑤ 件）：一整年收在哪一句上。
  // 跟上面几组一样归**说法**管，薄包退回世界那一份；两边都没有就是空表
  // （空表＝年卷末尾不说什么，见 client.js 的 `FATES` 与 `fatesFor`）。
  target.FATES = words('fate') || []
  // 痕迹池（2026-10-09 加，用户 m01903 第 2、3 条）：那一天挑过的那条路，今天后面每一格怎么说。
  // 跟上面几组一样归**说法**管，薄包退回世界那一份；两边都没有就是空表
  // （空表＝今天后面不回声，见 client.js 的 `MARKS` 与 `markOf`）。
  target.MARKS = words('marks') || {}
  // 战斗（2026-10-10 加，用户 m14888「他必须有战斗」）：这一天打哪一场、打多大、怎么收。
  // 跟上面几组一样归**说法**管，薄包退回世界那一份；两边都没有就是空表
  // （空表＝不打架，见 client.js 的 `FIGHTS` 与 `fightOf`）。
  target.FIGHTS = words('fights') || null
  // 当日计划与册子上的路（2026-10-10 加，用户 m14781「按照一个人的一天来写」）：
  // 那一天他手上那几件事、走到第几站、这一季的路通不通。
  // 跟上面几组一样归**说法**管，薄包退回世界那一份；两边都没有就是空表
  // （空表＝不摆计划、不挂少一分那一句，见 client.js 的 `JOURNEY` 与 `dayPlanOf`）。
  target.JOURNEY = words('journey') || null
  // 命运（2026-10-10 加，用户 m16528/m16534/m16541/m16548/m16552）：他走到一个岔口，
  // 两条路（一条主线、一条分支），挑了以后跟着一整段危机——分支上要么死，要么绕回主线。
  // 跟上面几组一样归**说法**管，薄包退回世界那一份；两边都没有就是空表
  // （空表＝这一天没有命运，见 client.js 的 `FORKS` 与 `forksFor`）。
  target.FORKS = words('forks') || null
  return target
}

  return { PACKS, DEFAULT_WORLD, DEFAULT_VOICE, listPacks, getPack, worldIds, voiceIds, isUnlocked, setPack, applyPack }
})()

const __mod18 = (() => {
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
function hash(seed, len) {
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
const SIGNALS = {
  fails: (e) => Math.round(Number(e?.fails) || 0),
  minutes: (e) => Math.round(Number(e?.minutes) || 0),
  hour: (e) => hourOf(e),
  helpers: (e) => (e?.helpers || []).length,
  deliverables: (e) => (e?.deliverables || []).length,
  actions: (e) => Object.values(e?.counts || {}).reduce((sum, v) => sum + (Math.round(Number(v)) || 0), 0),
  files: (e) => (e?.files || []).length,
}

const SIGNAL_NAMES = Object.keys(SIGNALS)
const WHEN_NAMES = [...SIGNAL_NAMES, 'always', 'outside', 'place', 'tags', 'direction']

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
function dangerOf(entry, place = null, rules = null) {
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
function worldWeights(entry, place = null, sceneKey = '', rules = null, outdoors = null) {
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
function worldBucket(entry, place = null, sceneKey = '', rules = null, outdoors = null) {
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
function outcomeOf(entry, act, rules = null, options = {}) {
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
const MOMENT_WHEN_NAMES = [...SIGNAL_NAMES, 'always', 'outside', 'place', 'tags', 'hours', 'places', 'scenes']
/** 方向那一层按天看，用的是同一套项语言。**不认 `direction`**——方向不能拿自己当条件。 */
const DIRECTION_WHEN_NAMES = MOMENT_WHEN_NAMES

/**
 * 命运抉择留下的**痕迹**（2026-10-09 加的，用户 m01903 第 2 条）。
 *
 * 一条路走完，会在**当天**留下几种痕迹；今天后面几格的说法跟着它变，明天清空。
 * 六个名字是固定的——「伤」在身上，「账」欠着人，「名声」在别人嘴里，
 * 「得着」是多出来的东西，「知道」是他往后认得出的东西，「丢掉」是没了的东西。
 *
 * 它只活在这一层与面板那一层（`src/client.js` 的 `dayMarks`），不进 `records.json`。
 */
const MARK_NAMES = ['wound', 'debt', 'fame', 'gain', 'lore', 'loss']

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
function momentOf(facts, moments = null, ctx = {}) {
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
function choiceOf(facts, choice, ctx = {}) {
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
const FATE_WHEN_NAMES = [...MOMENT_WHEN_NAMES, 'days', 'roads', 'direction']

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
function fateOf(facts, fates = null, ctx = {}) {
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
function checkFates(fates, where = 'fate') {
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
function directionOf(facts, directions = null, ctx = {}) {
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
function checkDirections(directions, where = 'directions') {
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
function checkMoments(moments, where = 'moments') {
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
function checkChoices(moments, where = 'moments') {
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
function checkMarks(marks, where = 'marks') {
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
function checkRules(rules, where = 'rules') {
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
function fightOf(facts, fights = null, ctx = {}) {
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
function checkFights(fights, where = 'fights') {
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
function stationOf(facts, stations = null, ctx = {}) {
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
function checkJourney(journey, where = 'journey') {
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

const FORK_WHEN_NAMES = MOMENT_WHEN_NAMES

/**
 * 这一天压下来的是哪一件命运。按顺序找第一件**每一项都中**的；一件都没中返回 `null`
 * （那一天照常过，没有岔口）。`facts` 跟 `momentOf` 是同一份。
 */
function forkOf(facts, forks = null, ctx = {}) {
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
function resultOf(facts, road, ctx = {}) {
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
function checkForks(forks, where = 'forks') {
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

  return { hash, SIGNALS, SIGNAL_NAMES, WHEN_NAMES, dangerOf, worldWeights, worldBucket, outcomeOf, MOMENT_WHEN_NAMES, DIRECTION_WHEN_NAMES, MARK_NAMES, momentOf, choiceOf, FATE_WHEN_NAMES, fateOf, checkFates, directionOf, checkDirections, checkMoments, checkChoices, checkMarks, checkRules, fightOf, checkFights, stationOf, checkJourney, FORK_WHEN_NAMES, forkOf, resultOf, checkForks }
})()

const __mod19 = (() => {
/*
 * 地方图渲染器——`.scratch/local.py` 第 21~942 行的逐行移植。
 *
 * 画的是世界图的一扇放大镜：同一个 `world3` 数据、同一个坐标系，取景框缩到
 * **22 × 11.35 世界单位**（世界图的九分之一面积、三倍线性分辨率）。二十座城各一扇。
 * 世界图那边看不见的东西——城墙街道房子、田、镇心地标、全名城名——是这一层的事。
 *
 * 唯一的验收标准是 `node .scratch/local-js.mjs --all` 之后
 * `node .scratch/local-diff.mjs --all` 打印「二十座全部逐字节相同」——
 * 不是「看起来一样」，是跟 Python 画出来的逐字节相同。所以这个文件里：
 *   · 进 SVG 的每个数字都走 `f2()`（＝ `'{:.2f}'.format`），三位小数的走 `f3()`
 *   · 每个随机数都走 `new Random(seed)`（CPython 的 MT19937，见 `rng.js`）
 *   · 开方走 `geo.js` 的 `hypot`，**不用** `Math.hypot`（跟 Python 差 1 ulp）
 *   · 下标取模一律写 `((i - 1) % m + m) % m`——JS 的 `%` 对负数给负结果，Python 恒非负
 *   · 字符串一个字不改，包括分隔符、空格、属性顺序
 * 不要「改进」画面——这是一次翻译，不是重画。
 *
 * 底层图元（`pd` / `wob` / `organic` / `meander` / `blob` / `ribbon` / `lerp` / `hit`）
 * 与 `COAST` / `INK` / `INK2` / `SEA` … 这些常量来自 `world.js`（它把 `geo.js` 包成了
 * 一个门面，正是为了让地方图只认这一个来源）。`f2` / `hypot` 在 `world.js` 里没有导出，
 * 所以从 `geo.js` 直接取。
 *
 * 下面两行 import 必须**各占一行且全是具名导入**：`scripts/build-client.mjs` 的摊平器
 * 用 `^import\s*\{…\}\s*from\s*'./x.js'$` 逐行认，换行写法它认不出来。
 */
const { f2, hypot, plate_rect, plate_text_y } = __mod4
const { pd, wob, organic, meander, blob, ribbon, lerp, hit, f3, SEA, SEA_LO, COAST, INK, INK2, RIVER, RIVER_IN, DUNE, CRACK, peak, tree, dunes, cracks, marsh, rect, tower, WONDER_HALO, WONDER_COLD, wonders, _cap_at, MAP_CSS } = __mod3
const { Random } = __mod5
const { W, H, LANDS, BIOMES, BIOME_COLOR, RIDGES, PEAKS, FORESTS, RIVERS, LAKES, LABELS, NATIONS } = __mod6

/* ── 取景框与分辨率 ──────────────────────────────────────────────────── */

// 世界图的九分之一面积、三倍线性分辨率（66/3 = 22）
const WIN_W = 22.0
const WIN_H = 11.35

/** Python 的 `len(str)`：按**码点**数，不是 UTF-16 码元。 */
function nlen(s) { return Array.from(s).length }

/**
 * Python 的元组比较：逐项比，不是减法。`sort` 两边都是稳定排序。
 *
 * `house_row` / `hamlet` 排的是 `(by, 一串 SVG)`——Python 只在 `by` 打平时才会去比
 * 那个列表（真打平会 TypeError，所以基准跑得通就说明没有打平过）。这里对打平返回 0，
 * 稳定排序给出的次序跟 Python 一致。
 */
function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

/* ── 地方图自己的一套颜色（房子、墙、街、田） ───────────────────────── */

const WALL = '#CBB99A'
const WALL_LO = '#A8997C'
const ROOF_HU = '#B65E3E'                 // 人类：红瓦
const ROOF_HU_LO = '#8E452B'
const ROOF_EL = '#54777A'                 // 精灵：青瓦（压暗过——浅青瓦压在林子上是一片糊）
const ROOF_EL_LO = '#3C5A5E'
const ROOF_DW = '#6E6250'                 // 矮人：石板
const ROOF_DW_LO = '#4E4538'
const ROOF_OR = '#8A6538'                 // 兽人：皮帐
const ROOF_OR_LO = '#66492A'
const ROOF_TR = '#5E7346'                 // 树人：树皮棚
const ROOF_TR_LO = '#43542F'
const ROOF_GI = '#A8ADAF'                 // 巨人：巨石
const WASH = ['#D2D6A2', '#9DA96C', '#C4CB88', '#AEB97A']    // 草地水彩底那几团色
const SEA_WASH = ['#2E4657', '#1F3240', '#3A5568']           // 海面水彩底那几团色
const STREET = '#C4B183'
const STREET_LO = '#A89670'
const FIELD = '#CBBC72'
const FIELD_LO = '#AFA256'
const FURROW = '#8C7B3C'         // 犁沟（丙那一版：比 FIELD_LO 深一档，垄才看得出来）
const WELL = '#9C968A'
const WELL_LO = '#6E685E'
const ELF_WHITE = '#E4E8E0'
const ELF_DOME = '#7FA79B'
const CLIFF = '#8A7E6C'
const CLIFF_LO = '#5A5045'
const TENT = '#A8814E'
const FIRE = '#E8A24C'
const WOOD = '#8A6A42'

const ROOF = {
  '人类': [ROOF_HU, ROOF_HU_LO],
  '精灵': [ROOF_EL, ROOF_EL_LO],
  '矮人': [ROOF_DW, ROOF_DW_LO],
  '兽人': [ROOF_OR, ROOF_OR_LO],
  '树人': [ROOF_TR, ROOF_TR_LO],
  '龙': [ROOF_HU, ROOF_HU_LO],
  '鱼人': [ROOF_EL, ROOF_EL_LO],
  '半身人': [ROOF_HU, ROOF_HU_LO],
  '巨人': [ROOF_GI, ROOF_DW_LO],
  '亡灵': [ROOF_DW, ROOF_DW_LO]
}

/** `ROOF.get(race, ROOF['人类'])`。 */
function roof_of(race) {
  return Object.prototype.hasOwnProperty.call(ROOF, race) ? ROOF[race] : ROOF['人类']
}

/** 取景框：以 (cx, cy) 为心，**夹在世界里面**（不许出界）。 */
function win_around(cx, cy) {
  const wx = Math.max(0.0, Math.min(W - WIN_W, cx - WIN_W / 2))
  const wy = Math.max(0.0, Math.min(H - WIN_H, cy - WIN_H / 2))
  return [wx, wy]
}

/* ── 撒点 ────────────────────────────────────────────────────────────── */

/**
 * 在**取景框 ∩ 这个多边形**里撒点。
 *
 * `terrain.marks` / `forest` 是在整个多边形里撒的——地方图只画窗口这一块，
 * 照搬会撒出八九倍用不上的笔触（体积白涨，还拖慢渲染）。
 */
function sample_in(poly, wx, wy, count, seed, tries_mul = 80) {
  const rnd = new Random(seed)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const lo_x = Math.max(Math.min(...xs), wx)
  const hi_x = Math.min(Math.max(...xs), wx + WIN_W)
  const lo_y = Math.max(Math.min(...ys), wy)
  const hi_y = Math.min(Math.max(...ys), wy + WIN_H)
  if (lo_x >= hi_x || lo_y >= hi_y) return []
  const out = []
  let tries = 0
  while (out.length < count && tries < count * tries_mul) {
    tries += 1
    const x = rnd.uniform(lo_x, hi_x)
    const y = rnd.uniform(lo_y, hi_y)
    if (hit(poly, x, y)) out.push([x, y])
  }
  return out
}

/** 这一点在不在陆地上。**田、磨坊、散树都得先过这一关**——不然田会浮在海面上。 */
function on_land(x, y) {
  for (const rings of Object.values(LANDS)) {
    for (const ring of rings) {
      if (hit(ring, x, y)) return true
    }
  }
  return false
}

/**
 * 草地上的点。
 *
 * **`BIOMES` 里没有 grass 这一条**——草地是陆地底色，`BIOMES` 只列特出的那几种。
 * 所以在草上撒东西不能走 `sample_in`，得先在陆地里撒、再把落在别的群系里的丢掉。
 */
function grass_points(wx, wy, count, seed, tries_mul = 60) {
  const rnd = new Random(seed)
  const special = BIOMES.map(([, poly]) => poly)
  const out = []
  let tries = 0
  while (out.length < count && tries < count * tries_mul) {
    tries += 1
    const x = rnd.uniform(wx, wx + WIN_W)
    const y = rnd.uniform(wy, wy + WIN_H)
    if (!on_land(x, y)) continue
    if (special.some((p) => hit(p, x, y))) continue
    out.push([x, y])
  }
  return out
}

/**
 * 草地的水彩底：几团边缘发虚的淡色，把大片平色打散。
 *
 * 世界图上草地本来就只占一小块；放大到 3× 之后，一块草就是半张图。
 * 不铺这一层，取景框中间会是一片死板的平色——这是地方图最显眼的毛病。
 */
function grass_wash(wx, wy) {
  const rnd = new Random(77)
  const o = []
  let i = 0
  for (const [x, y] of grass_points(wx, wy, 34, 500)) {
    const r = rnd.uniform(1.5, 3.2)
    o.push(`<path d="${pd(blob(x, y, r, 700 + i * 7, 12, rnd.uniform(0.48, 0.78)))}" fill="${WASH[i % WASH.length]}" filter="url(#wash)" opacity="0.46"/>`)
    i += 1
  }
  for (const [name, poly] of BIOMES) {
    if (name !== 'forest' && name !== 'jungle') continue
    let j = 0
    for (const [x, y] of sample_in(poly, wx, wy, 10, 500 + Math.trunc(poly[0][0] * 11))) {
      const r = rnd.uniform(1.4, 2.8)
      o.push(`<path d="${pd(blob(x, y, r, 760 + j * 7, 12, rnd.uniform(0.48, 0.78)))}" fill="${WASH[j % WASH.length]}" filter="url(#wash)" opacity="0.40"/>`)
      j += 1
    }
  }
  return o
}

/**
 * 地貌笔触，只在取景框里撒。密度是世界图的三倍（同样粗细的线，三倍的点）。
 *
 * 草地上世界图什么也不撒——那里一块草地本来就不大。到了 3× 的取景框里，
 * 草占了半张图，不撒就成了大片死板的平色，所以这里给草地补上一层草簇。
 */
function local_marks(wx, wy) {
  const rnd = new Random(31)
  const o = []
  for (const [x, y] of grass_points(wx, wy, 320, 800)) {
    for (let k = 0; k < 3; k++) {
      const gx = x + (k - 1) * 0.09 + rnd.uniform(-0.03, 0.03)
      o.push(`<line class="mg1" x1="${f2(gx)}" y1="${f2(y + 0.05)}" x2="${f2(gx + rnd.uniform(-0.06, 0.06))}" y2="${f2(y - rnd.uniform(0.16, 0.28))}"/>`)
    }
  }
  for (const [name, poly] of BIOMES) {
    const base = { tundra: 260, rock: 460, swamp: 130, volcanic: 90 }[name] || 0
    if (!base) continue
    for (const [x, y] of sample_in(poly, wx, wy, Math.trunc(base * 3.0 / 9.0), 900 + Math.trunc(poly[0][0] * 13))) {
      if (name === 'tundra') {
        o.push(`<circle class="md" cx="${f2(x)}" cy="${f2(y)}" r="${f3(rnd.uniform(0.05, 0.09))}"/>`)
      } else if (name === 'rock') {
        for (let k = 0; k < 3; k++) {
          const a = -0.85 + k * 0.42
          const dx = Math.cos(a) * 0.30
          const dy = Math.sin(a) * 0.30
          o.push(`<line class="mg2" x1="${f2(x - dx)}" y1="${f2(y - dy)}" x2="${f2(x + dx)}" y2="${f2(y + dy)}"/>`)
        }
      } else if (name === 'swamp') {
        for (let k = 0; k < 2; k++) {
          const rx = x + (k - 0.5) * 0.22
          o.push(`<line class="mg3" x1="${f2(rx)}" y1="${f2(y)}" x2="${f2(rx + rnd.uniform(-0.08, 0.08))}" y2="${f2(y - rnd.uniform(0.30, 0.50))}"/>`)
        }
      }
    }
  }
  // 沙丘与冰裂（第六十九版补）。世界图上这两样由 `dunes()` / `cracks()` 撒满整块
  // 多边形（沙漠 120 处、冰原 90 处），而它们**不在**上面那张表里——于是到了 3× 的
  // 取景框里，沙漠与冰原的笔触就比草、苔原、山地、沼泽稀三倍。数按「世界图那份的
  // 三分之一」取（窗是世界的九分之一面积、密度要三倍，正好三分之一），画法跟世界图
  // 那两件逐字一样，只是位置改成窗内撒。
  for (const [name, poly] of BIOMES) {
    if (name === 'desert') {
      for (const [x, y] of sample_in(poly, wx, wy, 40, 1500 + Math.trunc(poly[0][0] * 13))) {
        const w = rnd.uniform(0.55, 1.25)
        o.push(`<path d="M${f2(x - w)} ${f2(y)} Q${f2(x)} ${f2(y - 0.30)} ${f2(x + w)} ${f2(y)}" fill="none" stroke="${DUNE}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.55"/>`)
      }
    } else if (name === 'ice') {
      for (const [x0, y0] of sample_in(poly, wx, wy, 30, 1600 + Math.trunc(poly[0][0] * 13))) {
        const pts = [[x0, y0]]
        let x = x0
        let y = y0
        let a = rnd.uniform(0, 2 * Math.PI)
        for (let k = 0; k < 2; k++) {
          a += rnd.uniform(-0.7, 0.7)
          x += Math.cos(a) * rnd.uniform(0.35, 0.7)
          y += Math.sin(a) * rnd.uniform(0.35, 0.7)
          pts.push([x, y])
        }
        o.push(`<path d="${pd(pts, false)}" fill="none" stroke="${CRACK}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.5"/>`)
      }
    }
  }
  return o
}

/* ── 房子 ────────────────────────────────────────────────────────────── */

/**
 * 一间房子：**正面看**，跟世界图上那些记号是同一个视角，只是大了三倍。
 *
 * 世界图上一个都城就是「一块墙 + 三个城齿 + 一面旗」；这里同一套语言放大到
 * 能看见屋顶、窗、门、烟囱。屋顶要压一道脊线、两三道瓦垄，不然是一块色板。
 */
function house(x, by, w, h, race, seed, door = true, chimney = null) {
  const rnd = new Random(seed)
  const [hi, lo] = roof_of(race)
  const o = []
  const eave = w * rnd.uniform(0.10, 0.22)
  const rh = h * rnd.uniform(0.58, 0.82)
  // 屋顶（正面看的两坡）
  o.push(`<path d="${pd([[x - w / 2 - eave, by - h], [x - w * 0.30, by - h - rh * 0.52], [x, by - h - rh], [x + w * 0.30, by - h - rh * 0.52], [x + w / 2 + eave, by - h]])}" fill="${hi}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.75)}" stroke-linejoin="round"/>`)
  // 背光那一坡压暗：屋顶不该是一块平色
  o.push(`<path d="${pd([[x, by - h - rh], [x + w * 0.30, by - h - rh * 0.52], [x + w / 2 + eave, by - h], [x + w * 0.16, by - h]])}" fill="${lo}" opacity="0.55"/>`)
  // 墙
  o.push(rect(x - w / 2, by - h, w, h, WALL, INK2 * 0.7))
  // 墙根一道暗
  o.push(`<rect x="${f2(x - w / 2)}" y="${f2(by - h * 0.22)}" width="${f2(w)}" height="${f2(h * 0.22)}" fill="${WALL_LO}" opacity="0.35"/>`)
  if (door) {
    const dw = w * 0.22
    const dh = h * 0.52
    o.push(rect(x - dw / 2, by - dh, dw, dh, '#4A3A28', INK2 * 0.6))
  }
  // 窗
  const nwin = rnd.randint(1, 3)
  for (let k = 0; k < nwin; k++) {
    if (w < 0.34) break
    const ww = w * 0.13
    const wx = x - w * 0.32 + w * 0.30 * k + rnd.uniform(-0.03, 0.03)
    o.push(rect(wx, by - h * 0.78, ww, h * 0.26, '#5E5040', INK2 * 0.5))
  }
  if (chimney === null) chimney = rnd.random() < 0.45
  if (chimney) {
    const cw = w * 0.13
    const cxp = x + w * rnd.uniform(0.14, 0.36)
    o.push(rect(cxp, by - h - rh - 0.14, cw, rh * 0.44 + 0.14, WALL_LO, INK2 * 0.6))
  }
  return o
}

/** 沿一条街摆房子。`side` = 1 / -1，决定摆在街的哪一边。 */
function house_row(pts, side, count, race, seed, gap = 0.22) {
  const rnd = new Random(seed)
  const o = []
  const m = pts.length
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const seg = t * (m - 1)
    const j = Math.min(m - 2, Math.trunc(seg))
    const [px, py] = lerp(pts[j], pts[j + 1], seg - j)
    const a = pts[Math.max(0, j - 1)]
    const b = pts[Math.min(m - 1, j + 2)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = hypot(dx, dy) || 1e-9
    const ux = -dy / L * side
    const uy = dx / L * side
    const w = rnd.uniform(0.42, 0.68)
    const h = rnd.uniform(0.34, 0.54)
    const off = w * 0.62 + gap
    const bx = px + ux * off
    const by = py + uy * off * 0.6
    o.push([by, house(bx, by, w, h, race, seed + i * 7)])
  }
  return o
}

/* ── 镇子的零件 ──────────────────────────────────────────────────────── */

/** 一口井：石头圈 + 两根柱子 + 一个小顶。广场上有它才像广场。 */
function well(x, y, s = 1.0) {
  return [
    `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(0.13 * s)}" ry="${f2(0.075 * s)}" fill="${WELL}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`,
    `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(0.075 * s)}" ry="${f2(0.040 * s)}" fill="${WELL_LO}"/>`,
    `<line x1="${f2(x - 0.11 * s)}" y1="${f2(y - 0.02 * s)}" x2="${f2(x - 0.11 * s)}" y2="${f2(y - 0.30 * s)}" stroke="${WOOD}" stroke-width="${f3(INK2 * 0.8)}"/>`,
    `<line x1="${f2(x + 0.11 * s)}" y1="${f2(y - 0.02 * s)}" x2="${f2(x + 0.11 * s)}" y2="${f2(y - 0.30 * s)}" stroke="${WOOD}" stroke-width="${f3(INK2 * 0.8)}"/>`,
    `<path d="${pd([[x - 0.19 * s, y - 0.30 * s], [x, y - 0.44 * s], [x + 0.19 * s, y - 0.30 * s]])}" fill="${ROOF_HU_LO}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`
  ]
}

/** 一个摊位：一块斜篷 + 两个筐。 */
function stall(x, y, s, seed) {
  const rnd = new Random(seed)
  const o = [`<path d="${pd([[x - 0.24 * s, y], [x - 0.18 * s, y - 0.26 * s], [x + 0.18 * s, y - 0.30 * s], [x + 0.24 * s, y - 0.02 * s]])}" fill="#C9B27E" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`]
  for (let k = 0; k < 2; k++) {
    const bx = x + rnd.uniform(-0.16, 0.16) * s
    o.push(`<circle cx="${f2(bx)}" cy="${f2(y + 0.04 * s)}" r="${f2(0.045 * s)}" fill="#A8814E" stroke="${COAST}" stroke-width="${f3(INK2 * 0.55)}"/>`)
  }
  return o
}

/** 货栈广场：一块空场 + 井 + 三四个摊 + 两堆货。 */
function market(cx, cy, s, seed) {
  const rnd = new Random(seed)
  const o = [`<path d="${pd(blob(cx, cy, 0.62 * s, seed, 11, 0.66))}" fill="${STREET}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.6)}" stroke-linejoin="round"/>`]
  o.push(...well(cx - 0.06 * s, cy + 0.06 * s, s * 0.9))
  for (let k = 0; k < 4; k++) {
    const a = 2 * Math.PI * k / 4 + rnd.uniform(-0.3, 0.3)
    o.push(...stall(cx + Math.cos(a) * 0.40 * s, cy + Math.sin(a) * 0.28 * s, s, seed + k * 11))
  }
  return o
}

/**
 * 一块田：一块犁歪的地，里面**顺着一排犁沟**。
 *
 * 丙那一版（用户 m22497 说旧的田丑）。老写法是一块 `fill-opacity 0.72` 的四边形、
 * 边线用橄榄色的 `FIELD_LO`——在 3× 下读起来像贴了一地脏补丁。这张图的画法是
 * 「墨线 + 平色」，田没有墨线就不是「东西」。
 *
 * 第二版（同日）：先试过「三条并排的长条 + 深墨勾边」，结果 3× 下读成「一捆木板」。
 * 田的通用记号是**细密的平行犁沟**，不是粗条纹——所以现在是一块地 + 七道细沟，
 * 填色压淡、边线压细。
 */
function field_patch(cx, cy, w, h, seed, rot, tone) {
  let quad = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]
  if (rot) {
    const ca = Math.cos(rot)
    const sa = Math.sin(rot)
    quad = quad.map(([px, py]) => [cx + (px - cx) * ca - (py - cy) * sa, cy + (px - cx) * sa + (py - cy) * ca])
  }
  const shape = pd(wob(quad, 0.06, seed, 6))
  const o = [`<path d="${shape}" fill="${tone}" fill-opacity="0.34"/>`]
  for (let k = 1; k <= 7; k++) {
    const t = k / 8
    const a = lerp(quad[0], quad[1], t)
    const b = lerp(quad[3], quad[2], t)
    o.push(`<line class="lf" x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}"/>`)
  }
  o.push(`<path d="${shape}" fill="none" stroke="${COAST}" stroke-width="${f3(INK2 * 0.5)}" stroke-linejoin="round" opacity="0.85"/>`)
  return o
}

/**
 * 一片田庄：两三块田错着角挨在一起，地头两捆禾。
 *
 * 丙那一版。`ang` 是它在镇子外圈上的方位角——田的长轴取**切向**（顺着镇子那一圈），
 * 于是整片田贴着圈走；几块之间错开十几度，像拼布一样，不是一块块孤零零的补丁。
 */
function field_block(cx, cy, ang, seed) {
  const rnd = new Random(seed)
  const tx = -Math.sin(ang)
  const ty = Math.cos(ang) * 0.62
  const td = hypot(tx, ty) || 1e-9
  const lx = tx / td
  const ly = ty / td
  const nx = -ly
  const ny = lx
  const base = Math.atan2(ly, lx)
  const o = []
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * 0.42
    const rot = base + rnd.uniform(-0.22, 0.22)
    o.push(...field_patch(cx + nx * off + lx * rnd.uniform(-0.10, 0.10), cy + ny * off + ly * rnd.uniform(-0.10, 0.10), rnd.uniform(1.05, 1.35), rnd.uniform(0.58, 0.76), seed + k * 7, rot, k % 2 === 0 ? FIELD : FIELD_LO))
  }
  // 地头两捆禾：三根斜线
  for (const t of [-0.55, 0.58]) {
    const px = cx + lx * t - nx * 0.62
    const py = cy + ly * t - ny * 0.62
    for (const dx of [-0.05, 0.0, 0.05]) {
      o.push(`<line x1="${f2(px + dx)}" y1="${f2(py)}" x2="${f2(px + dx * 1.8)}" y2="${f2(py - 0.19)}" stroke="${FURROW}" stroke-width="${f3(INK2 * 0.75)}" stroke-linecap="round"/>`)
    }
  }
  return o
}

/** 磨坊：一个圆筒身子 + 四片风车。田边没有它，田就只是色块。 */
function mill(x, by, s, seed) {
  const o = [`<path d="${pd([[x - 0.20 * s, by], [x - 0.14 * s, by - 0.62 * s], [x + 0.14 * s, by - 0.62 * s], [x + 0.20 * s, by]])}" fill="${WALL}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.75)}"/>`]
  const hub = [x, by - 0.72 * s]
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2
    const ex = hub[0] + Math.cos(a) * 0.52 * s
    const ey = hub[1] + Math.sin(a) * 0.52 * s
    o.push(`<line x1="${f2(hub[0])}" y1="${f2(hub[1])}" x2="${f2(ex)}" y2="${f2(ey)}" stroke="${WOOD}" stroke-width="${f3(INK2 * 1.1)}" stroke-linecap="round"/>`)
    o.push(`<path d="${pd([[hub[0] + (ex - hub[0]) * 0.22, hub[1] + (ey - hub[1]) * 0.22], [hub[0] + (ex - hub[0]) * 0.88 + 0.07 * s, hub[1] + (ey - hub[1]) * 0.88], [hub[0] + (ex - hub[0]) * 0.88 - 0.07 * s, hub[1] + (ey - hub[1]) * 0.88]])}" fill="#D8CBB0" fill-opacity="0.85" stroke="${COAST}" stroke-width="${f3(INK2 * 0.6)}"/>`)
  }
  return o
}

/* ── 镇外：码头、船（第六十九版；路在 2026-10-09 撤了） ─────────────── */

/**
 * 镇与镇之间的土路——**2026-10-09 试过一版，当天就撤了，只留这段教训**。
 *
 * 撤的理由是用户 m22948 那句：「这个路不好看，还不如不要。而且你的路透视是有问题的，
 * 直接横在山的表面了。」——这张图上的山、树、房子都是**立起来的物件**（有受光面、
 * 有影子），而路是平铺在地面的一根线；两者画在同一个平面里，线就会横着压过山体，
 * 看着像贴在山坡上。要让它不压山，得先有「哪块地是坡、哪块地是平地」的高度场，
 * 再让路绕开坡走——这一版没有高度场，所以宁可不画。
 * （`ROAD` / `ROAD_BED` 两个颜色也跟着删了；这里不留死代码。）
 */

/**
 * 一小段木栈桥：**从岸边**伸进水里。
 *
 * 丙那一版（用户 m22497）。老写法从镇心 `r * 1.70` 处起画，可岛城的镇子小、
 * `r * 1.70` 已经在海里，于是栈桥成了「悬在海上的一小节梯子」。现在桥根由调用方
 * **沿方向走到第一处水面**再退回岸上一点（见 `build_local`），这里只管画：
 * 两根侧梁 + 六块桥板 + 两根桥桩。
 */
function jetty(x, y, ux, uy, s) {
  const L = 1.05 * s
  const hw = 0.10 * s
  const o = []
  for (const side of [-1, 1]) {
    o.push(`<line x1="${f2(x + uy * hw * side)}" y1="${f2(y - ux * hw * side)}" x2="${f2(x + ux * L + uy * hw * side)}" y2="${f2(y + uy * L - ux * hw * side)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}" stroke-linecap="round"/>`)
  }
  for (let k = 0; k <= 5; k++) {
    const t = k / 5
    const px = x + ux * L * t
    const py = y + uy * L * t
    o.push(`<line x1="${f2(px - uy * hw)}" y1="${f2(py + ux * hw)}" x2="${f2(px + uy * hw)}" y2="${f2(py - ux * hw)}" stroke="${WOOD}" stroke-width="${f3(INK2 * 1.1)}" stroke-linecap="round"/>`)
  }
  for (const side of [-1, 1]) {
    const px = x + ux * (L - 0.12 * s) + uy * hw * 0.8 * side
    const py = y + uy * (L - 0.12 * s) - ux * hw * 0.8 * side
    o.push(`<line x1="${f2(px)}" y1="${f2(py)}" x2="${f2(px)}" y2="${f2(py + 0.17 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.6)}" opacity="0.75"/>`)
  }
  return o
}

/**
 * 一条渔船：实心船身 + 桅 + 帆 + 一面小旗。
 *
 * 丙那一版（用户 m22497）：老写法是一道不闭合的折线，3× 下只是水上一枚棕色小三角。
 * 现在船身填实、勾墨，帆也大了一圈，靠海的镇子一眼能认出「这是船」。
 */
function boat(x, y, s, seed) {
  const rnd = new Random(seed)
  const tilt = rnd.uniform(-0.40, 0.40)
  const ca = Math.cos(tilt)
  const sa = Math.sin(tilt)
  const put = (px, py) => [x + (px - x) * ca - (py - y) * sa, y + (px - x) * sa + (py - y) * ca]
  const o = []
  o.push(`<path d="${pd([put(x - 0.42 * s, y - 0.06 * s), put(x - 0.26 * s, y + 0.15 * s), put(x + 0.30 * s, y + 0.15 * s), put(x + 0.44 * s, y - 0.06 * s)])}" fill="${WOOD}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" stroke-linejoin="round"/>`)
  const mast = put(x + 0.02 * s, y - 0.52 * s)
  o.push(`<line x1="${f2(put(x + 0.02 * s, y - 0.02 * s)[0])}" y1="${f2(put(x + 0.02 * s, y - 0.02 * s)[1])}" x2="${f2(mast[0])}" y2="${f2(mast[1])}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.75)}"/>`)
  o.push(`<path d="${pd([put(x + 0.05 * s, y - 0.50 * s), put(x + 0.40 * s, y - 0.08 * s), put(x + 0.05 * s, y - 0.08 * s)])}" fill="#D8CBB0" stroke="${COAST}" stroke-width="${f3(INK2 * 0.6)}"/>`)
  o.push(`<path d="${pd([put(x + 0.02 * s, y - 0.52 * s), put(x - 0.16 * s, y - 0.44 * s), put(x + 0.02 * s, y - 0.36 * s)], false)}" fill="#B4523F" stroke="none"/>`)
  return o
}

/* ── 各族的镇心地标 ─────────────────────────────────────────────────── */

/**
 * 望楼：一座瘦高的塔，顶上一圈垛口、一根旗杆。
 *
 * 丙那一版（用户 m22497 说「地点」丑）。第六十九版给一级镇加了「第二处地标」，
 * 但加的是**同一座建筑的小一号复制品**——两座一模一样的灰白方堡在 3× 下读起来
 * 就是「两块板子」。改成望楼：跟镇心那座不同形、又比房子高，镇子的天际线才立得住。
 */
function watch(x, by, s) {
  const w = 0.36 * s
  const h = 1.30 * s
  const o = [rect(x - w / 2, by - h, w, h, WALL)]
  for (let k = 1; k <= 3; k++) {
    const yy = by - h + (h * k) / 4
    o.push(`<line x1="${f2(x - w / 2)}" y1="${f2(yy)}" x2="${f2(x + w / 2)}" y2="${f2(yy)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.5)}" opacity="0.45"/>`)
  }
  for (let k = 0; k < 3; k++) {
    o.push(rect(x - w / 2 + k * (w / 3), by - h - 0.16 * s, w / 3, 0.16 * s, WALL, INK2 * 0.6))
  }
  o.push(`<line x1="${f2(x)}" y1="${f2(by - h - 0.16 * s)}" x2="${f2(x)}" y2="${f2(by - h - 0.62 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`)
  o.push(`<path d="M${f2(x)} ${f2(by - h - 0.60 * s)} L${f2(x + 0.30 * s)} ${f2(by - h - 0.49 * s)} L${f2(x)} ${f2(by - h - 0.38 * s)} Z" fill="#B4523F"/>`)
  return o
}

/** 镇心的那一座：一族的记号放大成一座建筑。跟世界图上的族徽是同一个形。 */
function landmark(cx, by, s, race, seed) {
  // 丙那一版：脚下一块淡淡的影子，不然这座建筑像是「浮」在草地上
  const o = [`<ellipse cx="${f2(cx)}" cy="${f2(by + 0.02 * s)}" rx="${f2(0.98 * s)}" ry="${f2(0.26 * s)}" fill="${COAST}" opacity="0.15"/>`]
  if (race === '精灵') {
    // 白塔 + 洋葱顶（世界图上精灵那一族就是这个）
    o.push(`<path d="${pd([[cx - 0.26 * s, by], [cx - 0.19 * s, by - 1.10 * s], [cx + 0.19 * s, by - 1.10 * s], [cx + 0.26 * s, by]])}" fill="${ELF_WHITE}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    for (let k = 0; k < 3; k++) {
      o.push(`<line x1="${f2(cx - 0.20 * s)}" y1="${f2(by - (0.24 + k * 0.28) * s)}" x2="${f2(cx + 0.20 * s)}" y2="${f2(by - (0.24 + k * 0.28) * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}" opacity="0.5"/>`)
    }
    o.push(`<path d="${pd([[cx - 0.30 * s, by - 1.10 * s], [cx - 0.20 * s, by - 1.30 * s], [cx, by - 1.52 * s], [cx + 0.20 * s, by - 1.30 * s], [cx + 0.30 * s, by - 1.10 * s]])}" fill="${ELF_DOME}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    o.push(`<line x1="${f2(cx)}" y1="${f2(by - 1.52 * s)}" x2="${f2(cx)}" y2="${f2(by - 1.72 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    o.push(rect(cx - 0.09 * s, by - 0.34 * s, 0.18 * s, 0.34 * s, '#4A3A28', INK2 * 0.6))
  } else if (race === '矮人') {
    // 峭壁 + 大拱门（山门要塞）
    o.push(`<path d="${pd([[cx - 0.78 * s, by], [cx - 0.66 * s, by - 0.92 * s], [cx - 0.30 * s, by - 1.22 * s], [cx + 0.26 * s, by - 1.16 * s], [cx + 0.62 * s, by - 0.78 * s], [cx + 0.78 * s, by]])}" fill="${CLIFF}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}" stroke-linejoin="round"/>`)
    for (let k = 0; k < 5; k++) {
      const t = k / 5.0
      o.push(`<line x1="${f2(cx - 0.60 * s + t * 1.20 * s)}" y1="${f2(by - 1.05 * s)}" x2="${f2(cx - 0.52 * s + t * 1.20 * s)}" y2="${f2(by - 0.10 * s)}" stroke="${CLIFF_LO}" stroke-width="${f3(INK2 * 0.9)}" opacity="0.5"/>`)
    }
    o.push(`<path d="M${f2(cx - 0.24 * s)} ${f2(by)} L${f2(cx - 0.24 * s)} ${f2(by - 0.44 * s)} Q${f2(cx)} ${f2(by - 0.72 * s)} ${f2(cx + 0.24 * s)} ${f2(by - 0.44 * s)} L${f2(cx + 0.24 * s)} ${f2(by)} Z" fill="#3A3226" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}"/>`)
    for (const dx of [-0.30, 0.30]) {
      o.push(...tower(cx + dx * s, by, 0.18 * s, 0.62 * s, WALL))
    }
  } else if (race === '兽人') {
    // 圆顶大帐
    o.push(`<path d="${pd([[cx - 0.52 * s, by], [cx - 0.52 * s, by - 0.46 * s], [cx + 0.52 * s, by - 0.46 * s], [cx + 0.52 * s, by]])}" fill="${TENT}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    o.push(`<path d="${pd([[cx - 0.54 * s, by - 0.46 * s], [cx - 0.34 * s, by - 0.82 * s], [cx, by - 1.00 * s], [cx + 0.34 * s, by - 0.82 * s], [cx + 0.54 * s, by - 0.46 * s]])}" fill="${ROOF_OR_LO}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    o.push(`<path d="M${f2(cx - 0.66 * s)} ${f2(by)} L${f2(cx + 0.66 * s)} ${f2(by - 1.06 * s)}" stroke="${WOOD}" stroke-width="${f3(INK2 * 0.9)}"/>`)
    o.push(`<path d="M${f2(cx + 0.66 * s)} ${f2(by)} L${f2(cx - 0.66 * s)} ${f2(by - 1.06 * s)}" stroke="${WOOD}" stroke-width="${f3(INK2 * 0.9)}"/>`)
    o.push(`<path d="M${f2(cx + 0.52 * s)} ${f2(by - 1.02 * s)} L${f2(cx + 0.86 * s)} ${f2(by - 0.88 * s)} L${f2(cx + 0.52 * s)} ${f2(by - 0.74 * s)} Z" fill="#B4523F"/>`)
  } else if (race === '树人') {
    o.push(...tree(cx, by, 1.55 * s, false, seed))
    o.push(...tree(cx - 0.70 * s, by, 1.05 * s, false, seed + 5))
    o.push(...tree(cx + 0.72 * s, by, 1.12 * s, false, seed + 9))
  } else if (race === '半身人') {
    o.push(...mill(cx, by, s * 1.5, seed))
  } else if (race === '巨人') {
    const hhs = [0.86, 1.14, 0.78]
    const dxs = [-0.46, 0.0, 0.46]
    for (let k = 0; k < 3; k++) {
      const dx = dxs[k]
      const hh = hhs[k]
      o.push(`<path d="${pd([[cx + dx * s - 0.13 * s, by], [cx + dx * s - 0.09 * s, by - hh * s], [cx + dx * s + 0.09 * s, by - hh * s], [cx + dx * s + 0.13 * s, by]])}" fill="${ROOF_GI}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.75)}"/>`)
    }
    o.push(`<path d="M${f2(cx - 0.46 * s)} ${f2(by - 0.74 * s)} L${f2(cx + 0.46 * s)} ${f2(by - 0.74 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
  } else {
    // 人类（其余种族兜底）：方堡 + 三塔 + 朱红旗
    o.push(rect(cx - 0.46 * s, by - 0.86 * s, 0.92 * s, 0.86 * s, WALL))
    for (let k = 0; k < 4; k++) {
      o.push(rect(cx - 0.46 * s + k * 0.23 * s, by - 1.00 * s, 0.12 * s, 0.14 * s, WALL, INK2 * 0.6))
    }
    for (const [dx, hh] of [[-0.42, 0.62], [0.0, 0.96], [0.42, 0.62]]) {
      o.push(...tower(cx + dx * s, by, 0.20 * s, hh * s, WALL))
    }
    o.push(`<line x1="${f2(cx)}" y1="${f2(by - 1.10 * s)}" x2="${f2(cx)}" y2="${f2(by - 1.44 * s)}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.8)}"/>`)
    o.push(`<path d="M${f2(cx)} ${f2(by - 1.42 * s)} L${f2(cx + 0.40 * s)} ${f2(by - 1.30 * s)} L${f2(cx)} ${f2(by - 1.18 * s)} Z" fill="#B4523F"/>`)
  }
  return o
}

/* ── 镇子 ────────────────────────────────────────────────────────────── */

/**
 * 一座镇子：城墙 + 两条街 + 几十间房子 + 广场 + 镇心地标。
 *
 * `(cx, cy)` 是平面中心，`r` 是半径（世界单位）。一级都城 r ≈ 1.9，二级 ≈ 1.35。
 */
function town(cx, cy, r, race, seed, wall = true) {
  const rnd = new Random(seed)
  const o = []
  // —— 城墙：一圈不规则的边。有墙才读得出「这是一座城，不是一堆房子」
  const n = 9
  const wp = []
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n - Math.PI / 2
    const rr = r * (1 + rnd.uniform(-0.13, 0.13))
    wp.push([cx + Math.cos(a) * rr * 1.18, cy + Math.sin(a) * rr * 0.70])
  }
  if (wall) {
    o.push(`<path d="${pd(wp)}" fill="${STREET}" fill-opacity="0.22" stroke="${COAST}" stroke-width="${f3(INK * 0.85)}" stroke-linejoin="round"/>`)
    // 墙上的塔：每两个顶点之间一座
    for (let i = 0; i < n; i += 2) {
      o.push(...tower(wp[i][0], wp[i][1], 0.16 * r, 0.34 * r, WALL))
    }
  }
  // —— 街：南北一条主街 + 一条横街 + 两条巷
  const main = [[cx + rnd.uniform(-0.14, 0.14) * r, cy - r * 0.78],
    [cx + rnd.uniform(-0.10, 0.10) * r, cy - r * 0.20],
    [cx + rnd.uniform(-0.10, 0.10) * r, cy + r * 0.34],
    [cx + rnd.uniform(-0.16, 0.16) * r, cy + r * 0.86]]
  const cross = [[cx - r * 0.92, cy + rnd.uniform(-0.10, 0.10) * r],
    [cx - r * 0.22, cy + rnd.uniform(-0.08, 0.08) * r],
    [cx + r * 0.34, cy + rnd.uniform(-0.08, 0.08) * r],
    [cx + r * 0.92, cy + rnd.uniform(-0.10, 0.10) * r]]
  const lanes = [[[cx - r * 0.62, cy - r * 0.58], [cx - r * 0.28, cy - r * 0.24], [cx - r * 0.10, cy]],
    [[cx + r * 0.58, cy - r * 0.52], [cx + r * 0.26, cy - r * 0.18], [cx + r * 0.12, cy]],
    [[cx - r * 0.58, cy + r * 0.60], [cx - r * 0.24, cy + r * 0.34], [cx - r * 0.06, cy + r * 0.12]],
    [[cx + r * 0.56, cy + r * 0.62], [cx + r * 0.24, cy + r * 0.36], [cx + r * 0.08, cy + r * 0.14]]]
  const streets = [main, cross].concat(lanes)
  for (const s of streets) {
    o.push(`<path d="${pd(s, false)}" fill="none" stroke="${STREET}" stroke-width="${f3(0.22 * r)}" stroke-linecap="round"/>`)
  }
  for (const s of streets) {
    o.push(`<path d="${pd(s, false)}" fill="none" stroke="${STREET_LO}" stroke-width="${f3(0.26 * r)}" stroke-linecap="round" opacity="0.5"/>`)
  }
  // —— 房子：沿街摆，两边各一排
  let items = []
  items = items.concat(house_row(main, 1, 6, race, seed + 11, 0.14 * r))
  items = items.concat(house_row(main, -1, 6, race, seed + 23, 0.14 * r))
  items = items.concat(house_row(cross, 1, 5, race, seed + 31, 0.14 * r))
  items = items.concat(house_row(cross, -1, 5, race, seed + 41, 0.14 * r))
  for (let i = 0; i < lanes.length; i++) {
    items = items.concat(house_row(lanes[i], i % 2 ? 1 : -1, 2, race, seed + 51 + i * 13, 0.12 * r))
  }
  // 镇心地标与广场
  o.push(...market(cx + r * 0.02, cy + r * 0.52, r * 0.62, seed + 7))
  items.push([cy - r * 0.30, landmark(cx, cy - r * 0.30, r * 0.70, race, seed + 3)])
  // 第二处地标（第六十九版；丙那一版换了东西）：一级镇在 3× 下摊得很大，只有镇心
  // 那一座建筑显得空。原来这里画的是**同一座建筑的小号复制品**——两座一样的灰白方堡
  // 读起来就是两块板子（用户 m22497 说的「地点丑」）。改成望楼，只给有墙的镇加。
  if (wall) {
    items.push([cy + r * 0.26, watch(cx - r * 0.50, cy + r * 0.26, r * 0.44)])
  }
  items.sort(cmpTuple)
  for (const [, hh] of items) {
    o.push(...hh)
  }
  return o
}

/**
 * 小聚落：没有墙，七八间房子围着一口井。世界图上它连记号都没有。
 *
 * **第五十五版起没人调用它了**：用户定的「乙」要求窗里的城一律按城画，
 * 于是原来那些「非焦点城画成小村」的地方全部改走 `town`。留着是为了以后
 * 真要在镇子之间摆几座村子（世界图上那些没有名字的记号）时直接接上。
 */
function hamlet(cx, cy, r, race, seed) {
  const rnd = new Random(seed)
  const items = []
  for (let i = 0; i < 8; i++) {
    const a = 2 * Math.PI * i / 8 + rnd.uniform(-0.3, 0.3)
    const rr = r * (0.55 + rnd.uniform(0, 0.45))
    const bx = cx + Math.cos(a) * rr
    const by = cy + Math.sin(a) * rr * 0.62
    const w = rnd.uniform(0.24, 0.40)
    const h = rnd.uniform(0.20, 0.34)
    items.push([by, house(bx, by, w, h, race, seed + i * 9)])
  }
  const o = []
  items.sort(cmpTuple)
  for (const [, hh] of items) {
    o.push(...hh)
  }
  o.push(...well(cx, cy + r * 0.10, r * 0.55))
  return o
}

/* ── 世界那一层（3× 细度） ──────────────────────────────────────────── */

/** 海面的水彩底。岛城那一扇取景框里三分之二都是海，不铺这层就是一片死蓝。 */
function sea_wash(wx, wy) {
  const rnd = new Random(99)
  const o = []
  let n = 0
  let tries = 0
  while (n < 26 && tries < 26 * 40) {
    tries += 1
    const x = rnd.uniform(wx, wx + WIN_W)
    const y = rnd.uniform(wy, wy + WIN_H)
    if (on_land(x, y)) continue
    n += 1
    o.push(`<path d="${pd(blob(x, y, rnd.uniform(2.0, 4.5), 900 + n * 13, 12, rnd.uniform(0.40, 0.70)))}" fill="${SEA_WASH[n % SEA_WASH.length]}" filter="url(#wash)" opacity="0.34"/>`)
  }
  return o
}

/* ── 世界固定层：跟取景框无关的那几层，建一次就留着 ────────────────────
 *
 * 实测一扇地方图 **32.5 ms**（f2 缓存已满、换窗口），其中只有 **8.4 ms** 是真正
 * 跟这扇窗有关的新内容，另外 **24.1 ms** 是每换一扇窗就重算一遍的旧东西。
 * 而旧东西里有一半压根不看 `wx` / `wy`——它们的输入只有世界数据，输出字节也一样：
 *
 *   · 海岸线（描边 ＋ 陆地填充 ＋ 墨线）——原来同一批线还 `pd` 了两遍（`:588` / `:590`）
 *   · 生物群系填充
 *   · 三条河（横跨整块世界，原来**一处窗口裁剪都没有**，只有 `LAKES` 裁了）
 *   · 地貌笔触 dunes / cracks / marsh（整块世界的沙漠冰原沼泽，也没裁）
 *   · 岸外短须（整块世界）
 *
 * 五样加起来 **8.3 ms**。这里各自建一次、把**拼好的字符串**留着——只是省掉重算，
 * 拼出来的字节与原来逐字相同，`local-diff.mjs --all` 二十座城一个字节都不该变。
 *
 * 缓存的是**数组**（调用方用 `o.push(...x)` 展开）；只读，别改里面的元素。
 * 这些函数全是纯函数（输入只有 `world3` 的数据和 `Random` 的固定种子），
 * 所以「建一次」跟「每次重建」在语义上完全等价。
 */

/** 海岸线那一圈：`wob` 之后的点列，以及每个圈对应的 `path d`。 */
let _coastLines = null
function coast_lines() {
  if (_coastLines !== null) return _coastLines
  const lines = []
  let si = 0
  for (const rings of Object.values(LANDS)) {
    let ri = 0
    for (const ring of rings) {
      lines.push(wob(ring, 0.10, 11 + si * 31 + ri * 7, 10))
      ri += 1
    }
    si += 1
  }
  _coastLines = lines
  return lines
}

/** 海岸那几层：描边、陆地填充、墨线、生物群系、岸外短须。 */
let _coastLayers = null
function coast_layers() {
  if (_coastLayers !== null) return _coastLayers
  const lines = coast_lines()
  const d = lines.map((line) => pd(line))
  const stroke = []
  const grass = []
  const ink = []
  for (const one of d) {
    stroke.push(`<path d="${one}" fill="none" stroke="${SEA_LO}" stroke-width="1.35" stroke-linejoin="round"/>`)
    grass.push(`<path d="${one}" fill="${BIOME_COLOR['grass']}"/>`)
    ink.push(`<path d="${one}" fill="none" stroke="${COAST}" stroke-width="${f3(INK)}" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  const bio = []
  for (const [name, poly] of BIOMES) {
    if (name === 'jungle') continue
    bio.push(`<path d="${pd(organic(poly, 0.26, 0.12, 300 + nlen(name) * 7 + Math.trunc(poly[0][0] * 10), 26))}" fill="${BIOME_COLOR[name]}" clip-path="url(#land)" filter="url(#soft)"/>`)
  }
  // 岸外短须：世界图每圈取 34 处，这里取 110 处。
  // 点列直接复用 `coast_lines()` 里那一批（原来这里又 `wob` 了一遍，参数一样、结果一样）。
  const whisk = []
  let k = 0
  for (const rings of Object.values(LANDS)) {
    for (let ri = 0; ri < rings.length; ri++) {
      const line = lines[k]
      k += 1
      const m = line.length
      const step = Math.max(1, Math.floor(m / 110))
      for (let i = 0; i < m; i += step) {
        const x = line[i][0]
        const y = line[i][1]
        // JS 的 `%` 对负数给负结果：i = 0 时 Python 给 m - 1、JS 给 -1
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
        const ln = 0.26 + 0.26 * ((i * 13) % 7) / 7.0
        whisk.push(`<line x1="${f2(x + ux * 0.18)}" y1="${f2(y + uy * 0.18)}" x2="${f2(x + ux * (0.18 + ln))}" y2="${f2(y + uy * (0.18 + ln))}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linecap="round" opacity="0.6"/>`)
      }
    }
  }
  _coastLayers = { d, stroke, grass, bio, ink, whisk }
  return _coastLayers
}

/** 三条河：整块世界的河，跟取景框无关。 */
let _riverLayers = null
function river_layers() {
  if (_riverLayers !== null) return _riverLayers
  const o = []
  for (const [name, pts, w0, w1] of RIVERS) {
    const line = meander(pts, 0.10, 700 + nlen(name), 30)
    const band = ribbon(line, w0 + 0.30, w1 + 0.30, 700 + nlen(name), 8)
    const core = ribbon(line, w0 * 0.42, w1 * 0.42, 800 + nlen(name), 8)
    o.push(`<path d="${pd(band)}" fill="${RIVER}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
    o.push(`<path d="${pd(core)}" fill="${RIVER_IN}" fill-opacity="0.85"/>`)
    // 河岸短须
    const m = line.length
    const step = Math.max(1, Math.floor(m / 90))
    for (let i = 0; i < m; i += step) {
      const x = line[i][0]
      const y = line[i][1]
      const a = line[Math.max(0, i - 1)]
      const b = line[Math.min(m - 1, i + 1)]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const L = hypot(dx, dy) || 1e-9
      const ux = -dy / L
      const uy = dx / L
      for (const sg of [1, -1]) {
        const ln = 0.16 + 0.18 * ((i * 7) % 5) / 5.0
        o.push(`<line x1="${f2(x + ux * sg * 0.42)}" y1="${f2(y + uy * sg * 0.42)}" x2="${f2(x + ux * sg * (0.42 + ln))}" y2="${f2(y + uy * sg * (0.42 + ln))}" stroke="${COAST}" stroke-width="${f3(INK2 * 0.85)}" stroke-linecap="round" opacity="0.5"/>`)
      }
    }
  }
  _riverLayers = o
  return o
}

/** 地貌笔触：整块世界的沙漠／冰原／沼泽，跟取景框无关。 */
let _markLayers = null
function mark_layers() {
  if (_markLayers !== null) return _markLayers
  const o = []
  for (const [name, poly] of BIOMES) {
    if (name === 'desert') {
      o.push(...dunes(poly, 500 + Math.trunc(poly[0][0] * 7), 120))
    } else if (name === 'ice') {
      o.push(...cracks(poly, 600 + Math.trunc(poly[0][0] * 7), 90))
    } else if (name === 'swamp') {
      o.push(...marsh(poly, 650 + Math.trunc(poly[0][0] * 7), 60))
    }
  }
  _markLayers = o
  return o
}

/** 海、浅滩、陆地、生物群系、海岸墨线——都是世界图那几层，只是加密了。 */
function sea_and_land(wx, wy) {
  const x1 = wx + WIN_W
  const y1 = wy + WIN_H
  const o = []
  o.push(`<rect x="${f2(wx)}" y="${f2(wy)}" width="${f2(WIN_W)}" height="${f2(WIN_H)}" fill="${SEA}"/>`)
  o.push(...sea_wash(wx, wy))
  // 波纹：世界图网格 2.1 × 1.7，这里 0.72 × 0.58（密三倍）
  const rnd = new Random(7)
  let gx = Math.floor(wx / 0.72) * 0.72
  while (gx < x1) {
    let gy = Math.floor(wy / 0.58) * 0.58
    while (gy < y1) {
      const x = gx + rnd.uniform(-0.12, 0.12)
      const y = gy + rnd.uniform(-0.12, 0.12)
      let onLand = false
      for (const rings of Object.values(LANDS)) {
        for (const r of rings) {
          if (hit(r, x, y)) { onLand = true; break }
        }
        if (onLand) break
      }
      if (!onLand) {
        const w = rnd.uniform(0.30, 0.58)
        o.push(`<line class="mw" x1="${f2(x - w / 2)}" y1="${f2(y)}" x2="${f2(x + w / 2)}" y2="${f2(y)}"/>`)
      }
      gy += 0.58
    }
    gx += 0.72
  }
  // 海岸线、陆地、生物群系、墨线、岸外短须：全是世界固定层，见 coast_layers()。
  // 顺序与原来一字不差：描边 → 陆地填充 → clipPath → 生物群系 → 窗内的草与地物 → 墨线 → 短须。
  const cl = coast_layers()
  o.push(...cl.stroke)
  o.push(...cl.grass)
  o.push(`<clipPath id="land"><path d="${cl.d.join(' ')}"/></clipPath>`)
  o.push(...cl.bio)
  // 地貌笔触：只在取景框里撒（世界图那套撒满整块多边形，这里会白撒九倍）
  o.push('<g clip-path="url(#land)">')
  o.push(...grass_wash(wx, wy))
  o.push(...local_marks(wx, wy))
  o.push('</g>')
  o.push(...cl.ink)
  o.push(...cl.whisk)
  return o
}

/** 河与湖：世界图上的河在 3× 下是一根细面条，所以蜿蜒加密、河岸加须。 */
function water(wx, wy) {
  // 三条河横跨整块世界，跟取景框无关——见 river_layers()。原来这里一处裁剪都没有，
  // 一扇窗就要把全世界三条河（含河岸短须）重画一遍，实测 4.6 ms。
  const o = [...river_layers()]
  for (let i = 0; i < LAKES.length; i++) {
    const [x, y, r] = LAKES[i]
    if (!(wx - 3 < x && x < wx + WIN_W + 3 && wy - 3 < y && y < wy + WIN_H + 3)) continue
    o.push(`<path d="${pd(blob(x, y, r, 400 + i * 9, 20))}" fill="${RIVER}" stroke="${COAST}" stroke-width="${f3(INK2)}" stroke-linejoin="round"/>`)
    o.push(`<path d="${pd(blob(x, y, r * 0.62, 500 + i * 9, 16))}" fill="none" stroke="${RIVER_IN}" stroke-width="${f3(INK2)}" opacity="0.35"/>`)
  }
  return o
}

/**
 * 跟 `terrain.forest` 一模一样，只多一件事：**落在镇子里的树不画**。
 *
 * 世界图上没有这个问题（一个都城就是一枚 2.5 单位的记号）；到了 3×，
 * 林子会把整座镇子埋掉——墙、街、广场全都读不出来。所以镇子要从林子里挖出来。
 */
function forest_here(cx, cy, r, count, seed, clear) {
  const rnd = new Random(seed)
  const items = []
  for (let i = 0; i < count; i++) {
    const a = rnd.uniform(0, 2 * Math.PI)
    const rr = r * Math.sqrt(rnd.random())
    const tx = cx + Math.cos(a) * rr
    const ty = cy + Math.sin(a) * rr * 0.62
    if (!clear(tx, ty)) continue
    items.push([ty, tx, rnd.uniform(0.52, 0.84), rnd.random() < 0.58, seed + i * 3])
  }
  items.sort(cmpTuple)
  const o = []
  for (const [y, x, s, con, sd] of items) {
    o.push(...tree(x, y, s, con, sd))
  }
  return o
}

/* 散树那两个随机数：种子都是 `(x, y)` 的纯函数，所以按种子记住抽出来的值就够。
 * 上限只是防着长会话里无限长——满了整个倒掉，跟 `f2` 一个规矩。 */
const TREE_RND_MAX = 1 << 14
const _treeScale = new Map()
const _treeConifer = new Map()

/** `new Random(Math.trunc(x * 91 + y * 37)).uniform(0.34, 0.60)`，按种子记住。 */
function tree_scale(sd) {
  const hit = _treeScale.get(sd)
  if (hit !== undefined) return hit
  const out = new Random(sd).uniform(0.34, 0.60)
  if (_treeScale.size >= TREE_RND_MAX) _treeScale.clear()
  _treeScale.set(sd, out)
  return out
}

/** `new Random(Math.trunc(x * 13)).random() < 0.5`，按种子记住。 */
function tree_conifer(sd) {
  const hit = _treeConifer.get(sd)
  if (hit !== undefined) return hit
  const out = new Random(sd).random() < 0.5
  if (_treeConifer.size >= TREE_RND_MAX) _treeConifer.clear()
  _treeConifer.set(sd, out)
  return out
}

/**
 * 山、林、沙丘、冰裂、沼泽——只画取景框附近的。
 *
 * `holes` 是聚落（平面中心 + 半径），落在里面的树、零散树一律不画。
 */
function terrain_layer(wx, wy, holes = []) {
  const x0 = wx - 4.0
  const y0 = wy - 4.0
  const x1 = wx + WIN_W + 4.0
  const y1 = wy + WIN_H + 4.0
  const near = (x, y) => x0 < x && x < x1 && y0 < y && y < y1

  const clear = (x, y) => {
    for (const [hx, hy, hr] of holes) {
      const dx = (x - hx) / hr
      const dy = (y - hy) / (hr * 0.64)
      if (dx * dx + dy * dy < 1.0) return false
    }
    return true
  }

  // 沙丘／冰裂／沼泽：整块世界的沙漠、冰原、沼泽，跟取景框无关——见 mark_layers()。
  // 实测 1.7 ms，原来每换一扇窗都重算。
  const o = [...mark_layers()]
  const peaks = []
  for (const [, line, cnt, sc] of RIDGES) {
    for (let k = 0; k < cnt * 3; k++) {
      const t = k / Math.max(1, cnt * 3 - 1)
      const seg = t * (line.length - 1)
      const i = Math.min(line.length - 2, Math.trunc(seg))
      const p = lerp(line[i], line[i + 1], seg - i)
      const px = p[0] + Math.sin(k * 2.3 + peaks.length) * 0.28
      const py = p[1] + Math.cos(k * 1.7 + peaks.length) * 0.24
      peaks.push([px, py, sc * (0.62 + 0.22 * ((k * 7) % 3)), 900 + peaks.length * 17])
    }
  }
  for (const [x, y, s] of PEAKS) {
    peaks.push([x, y, s, 900 + peaks.length * 17])
  }
  for (let idx = 0; idx < peaks.length; idx++) {
    const [x, y, s, sd] = peaks[idx]
    if (near(x, y)) o.push(...peak(x, y, s, sd, idx))
  }
  for (let i = 0; i < FORESTS.length; i++) {
    const [, cx, cy, r, cnt] = FORESTS[i]
    if (near(cx, cy)) o.push(...forest_here(cx, cy, r, Math.trunc(cnt * 5.5), 200 + i * 23, clear))
  }
  // 零散的树：草地上的散树，落在镇子里的不画。
  // 每棵树原来要构造**两个** `Random`（几百棵就是几百次 MT19937 `init_by_array`，
  // 随机数合计占一扇图 18.6%）。两处的种子都是 `(x, y)` 的纯函数，所以按种子
  // 记住**抽出来的那个值**，跟原来完全等价——注意不能缓存 `Random` 实例本身，
  // 因为调用方会往下继续抽。
  for (const [x, y] of grass_points(wx, wy, 90, 4242)) {
    if (!clear(x, y)) continue
    const sd = Math.trunc(x * 91 + y * 37)
    o.push(...tree(x, y, tree_scale(sd), tree_conifer(Math.trunc(x * 13)), sd))
  }
  return o
}

/* ── 地名与城名 ─────────────────────────────────────────────────────── */

// 名字挪不动、只好丢掉的那些（给 check() 用）
const DROPPED = []

/**
 * 一块名牌的矩形。**算式已经搬到 `geo.js` 的 `plate_rect`**（2026-10-30 审计 M-14：
 * 世界图、地方图、面板三处各写一套，改一处另外两处不知道）。这里留一个薄壳，
 * 只是因为老代码与自检都按这个名字调它。
 */
function plate_box(x, y, text, fs) {
  return plate_rect(x, y, text, fs)
}

/** 一块牌子：奶油底 + 墨字。跟世界图上国名/地貌名同一套。 */
function plate(x, y, text, fs, fill = '#3B2E20', bg = '#EFE7D3', op = 0.84, bold = false) {
  const [x0, y0, x1, y1] = plate_rect(x, y, text, fs)
  const w = x1 - x0
  const h = y1 - y0
  const o = []
  if (bg) {
    o.push(`<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(fs * 0.14)}" fill="${bg}" opacity="${f2(op)}"/>`)
  }
  o.push(`<text x="${f2(x)}" y="${f2(plate_text_y(y, fs))}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" letter-spacing="0.05" font-size="${f2(fs)}" fill="${fill}"${bold ? ' font-weight="600"' : ''}>${text}</text>`)
  return o
}

function overlaps(a, b) {
  return (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.04
    && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.04)
}

// 名字挪位的次序：先试原位，再上下，再左右，最后斜着——都不成就丢掉这个名字。
//
// 第七十九版（M-2）：候选从 13 个加到 25 个（多出 ±5.2 与 ±1.3 的斜向）。原来 20 扇
// 地方图里有 15 扇连焦点城的名字都摆不下，光"挪一步"不够——名字得先往远处挪三回。
const SHIFTS = [[0, 0], [0, -1.3], [0, 1.3], [-2.6, 0], [2.6, 0], [0, -2.6], [0, 2.6],
  [-3.8, -1.3], [3.8, -1.3], [-3.8, 1.3], [3.8, 1.3], [0, -4.0], [0, 4.0],
  [-5.2, 0], [5.2, 0], [-5.2, -2.6], [5.2, -2.6], [-5.2, 2.6], [5.2, 2.6],
  [0, -5.2], [0, 5.2], [-1.3, -3.8], [1.3, -3.8], [-1.3, 3.8], [1.3, 3.8]]

/** 城名牌先按这个字号摆，摆不下就缩一档再摆（0.70 → 0.60 → 0.52）。 */
const CITY_FS = [0.70, 0.60, 0.52]

/** 题名框里那个名字管得着多远：离最近的城超过这么多世界单位，就算这一带没有国家管着。 */
const REGION_REACH = 10
/** 城就在窗心旁边（岛上的城、海港都会这样）时，不管窗心踩在水上还是陆上，都算它的国。 */
const REGION_CLOSE = 4

/** 离 (x, y) 最近的那块地貌名或海域名，连距离一起回；给了 `kind` 就只在那一种里挑。 */
function nearest_label(x, y, kind) {
  let best = ''
  let bd = Infinity
  for (const [name, lx, ly, k] of LABELS) {
    if (kind && k !== kind) continue
    const d = hypot(lx - x, ly - y)
    if (d < bd) { bd = d; best = name }
  }
  return [best, bd]
}

/**
 * 左上角那块名牌写什么——**这一幅画的是哪儿**（第六十六版；第六十七版起会看地方）。
 *
 * 站在陆地上、离最近的城不超过 `REGION_REACH` ⇒ 写那座城的**国家名**（他截图里那一格
 * 写的就是「河间王国」）；远海、以及没有城管着的荒原 ⇒ 写离得最近的**大区域名**：
 * 海上是海名（北海 / 断桥海 / 珍珠湾 / 南海 / 珊瑚群岛），陆上是地貌名（霜脊山脉 /
 * 裂牙荒原 / 灰烬之地…）。国家名与地貌名同名的（古林 / 银树森林 / 裂牙荒原 /
 * 龙骨荒漠 / 鸦林 / 龙焰半岛）两条路写出来是同一个名字。
 *
 * 老地图上角落的题名框写的本来就是「这一幅画的是哪儿」，不是压在城上的城名；
 * 城名一律贴在自己城旁边（见 `label_layer`），焦点城也不例外——所以他站的那座城
 * 在图上永远找得到自己的名字牌。
 */
function region_title(wx, wy, city, nation) {
  const cx = wx + WIN_W / 2
  const cy = wy + WIN_H / 2
  const [sea, dSea] = nearest_label(cx, cy, 'sea')
  const f = focusAt(cx, cy)
  if (!on_land(cx, cy)) {
    // 窗心在水上：海名比城近就是海（北海 / 断桥海 / 珍珠湾 / 南海 / 珊瑚群岛），
    // 城就在旁边（岛上的城、海港）还是写它的国，其余写海名。
    if (dSea < f.dist) return sea || nation || city
    if (f.dist <= REGION_CLOSE) return nation || city
    return sea || nation || city
  }
  if (f.dist <= REGION_REACH) return nation || city
  return nearest_label(cx, cy, 'land')[0] || nation || city
}

function cartouche(wx, wy, title) {
  const fs = 1.15
  const w = nlen(title) * fs + 0.86
  const h = fs * 1.22 + 0.42
  const x0 = wx + 0.42
  const y0 = wy + 0.36
  const o = [`<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(0.20)}" fill="#EFE7D3" fill-opacity="0.90" stroke="${COAST}" stroke-width="${f3(INK2 * 1.1)}"/>`]
  o.push(`<rect x="${f2(x0 + 0.10)}" y="${f2(y0 + 0.10)}" width="${f2(w - 0.20)}" height="${f2(h - 0.20)}" rx="${f2(0.14)}" fill="none" stroke="${COAST}" stroke-width="${f3(INK2 * 0.7)}" opacity="0.45"/>`)
  o.push(`<text x="${f2(x0 + 0.34)}" y="${f2(y0 + 0.24 + fs * 0.92)}" font-family="Microsoft YaHei, sans-serif" letter-spacing="0.06" font-size="${f2(fs)}" font-weight="600" fill="#3B2E20">${title}</text>`)
  return [o, [x0, y0, x0 + w, y0 + h]]
}

/**
 * 地方图上写着**全名**——世界图写不下的那一层。
 *
 * 摆位是解出来的：每个名字先算一个框，按优先级贪心落位，撞上就按 SHIFTS 挪，
 * 挪不动就丢掉。世界图上那套是手写的坐标 + 事后机器自查；这里名字多，
 * 直接让机器排。
 *
 * 第六十六版起**每座城都贴自己的名字牌**，焦点城（他站的那座）也不例外——
 * 左上角那块题名框写的是这一带的**大名**（有国家管着就是国家名，远海与荒原写区域名），
 * 城名不再挤在角落里。
 */
function label_layer(wx, wy, taken, title) {
  const cands = []
  // 只跳过**题名框里已经写过的那个名字**（同一个名字不写两遍）；城名不再跳，
  // 焦点城也要有自己那块牌子（第六十六版）。
  const skip = new Set([title])
  for (const [name, x, y, kind] of LABELS) {
    // 只看**真在窗里**的名字（M-7）：原来留了 ±1 的富余，窗外一点点的名字被夹到窗边上，
    // 看着像钉在框沿上的一块多余牌子。海名例外——海比陆大，压着窗边反而对。
    if (kind === 'sea'
      ? !(wx - 1 < x && x < wx + WIN_W + 1 && wy - 1 < y && y < wy + WIN_H + 1)
      : !(wx < x && x < wx + WIN_W && wy < y && y < wy + WIN_H)) continue
    if (skip.has(name)) continue
    cands.push([1, name, x, y, 0.86, kind === 'sea' ? '#8FB0BC' : '#3B2E20',
      kind === 'sea' ? null : '#EFE7D3', false])
  }
  for (const [, , , , , [nx, ny], cap] of NATIONS) {
    const cname = cap[0]
    const tier = cap[3]
    // 焦点城不再跳过（第六十六版）：他站的那座城也要在城旁边写出自己的名字。
    // 判据只看**城在哪**，不看国名锚点——锚点在窗外、城在窗里的那种（M-2 里 6 扇就是这样
    // 被漏掉的）也该有名字。
    const [cxp, cyp] = _cap_at(cname, nx, ny, tier, cap[1], cap[2])
    if (!(wx - 1 < cxp && cxp < wx + WIN_W + 1 && wy - 1 < cyp && cyp < wy + WIN_H + 1)) continue
    // 城名排在最前面（权重 2）：国名与地貌名撞上它时让路，而不是反过来（M-2）。
    cands.push([2, cname, cxp, cyp - (tier === 1 ? 1.62 : 0.78) - 0.34,
      CITY_FS[0], '#5A4A34', '#EFE7D3', true])
  }
  cands.sort((a, b) => b[0] - a[0])
  const o = []
  for (const [, text, x, y, fs, fill, bg, isCity] of cands) {
    let placed = false
    // 城名摆不下就缩一档再摆；地貌名也留一档缩小（M-2：20 扇里有 6 扇的"银树森林"、
    // "霜脊山脉"这种大字被挤掉，缩一档就进去了）。
    const sizes = isCity ? CITY_FS : [fs, fs * 0.86]
    for (const size of sizes) {
      for (const [dx, dy] of SHIFTS) {
        const bx = Math.max(wx + 0.3 + size * nlen(text) * 0.5, Math.min(wx + WIN_W - 0.3 - size * nlen(text) * 0.5, x + dx))
        const by = Math.max(wy + 0.9, Math.min(wy + WIN_H - 0.6, y + dy))
        const box = plate_box(bx, by, text, size)
        if (!taken.some((t) => overlaps(box, t))) {
          taken.push(box)
          o.push(...plate(bx, by, text, size, fill, bg))
          placed = true
          break
        }
      }
      if (placed) break
    }
    // 最后一票否决：名字比房子重要（M-2）。挪完所有候选仍撞 ⇒ 挑**压得最少**的那个落点
    // 照画，不丢名字；`DROPPED` 因此空着，`check()` 改用「该出现的城名有没有出现」来盯。
    if (!placed) {
      const size = sizes[sizes.length - 1]
      let best = null
      for (const [dx, dy] of SHIFTS) {
        const bx = Math.max(wx + 0.3 + size * nlen(text) * 0.5, Math.min(wx + WIN_W - 0.3 - size * nlen(text) * 0.5, x + dx))
        const by = Math.max(wy + 0.9, Math.min(wy + WIN_H - 0.6, y + dy))
        const box = plate_box(bx, by, text, size)
        let area = 0
        for (const t of taken) {
          const w = Math.min(box[2], t[2]) - Math.max(box[0], t[0])
          const h = Math.min(box[3], t[3]) - Math.max(box[1], t[1])
          if (w > 0 && h > 0) area += w * h
        }
        if (!best || area < best[0]) best = [area, bx, by]
      }
      taken.push(plate_box(best[1], best[2], text, size))
      o.push(...plate(best[1], best[2], text, size, fill, bg))
    }
  }
  return o
}

/* ── 组装 ────────────────────────────────────────────────────────────── */

const RE_LINE = /^<line\s+([^>]*?)\s*\/>$/
const RE_XY = /\s*\b(?:x1|y1|x2|y2)="[^"]*"/g
const RE_AT = /\b(x1|y1|x2|y2)="([^"]*)"/g

/**
 * 丙（第七十五版）：把**连着**的同款 `<line>` 并成一条 `<path>`。
 *
 * 一扇地方图里 3161 条 `<line>`（元素总数 4702），绝大多数是同色同宽、一条挨着
 * 一条发出来的（草簇 960 / 水纹 255 / 犁沟 98 / 栅栏 86…）。并起来之后浏览器
 * 少解析三千个节点、少插三千个节点、少排一次版，光栅化也少一批——实测一扇图的
 * 元素数从 4702 掉到约 1500。**只并连着的同款**（除坐标外的属性串一模一样），
 * 所以画出来的先后次序一个字节都没动；圆头 `stroke-linecap="round"` 在一条
 * `<path>` 的每一段子路径上一样生效，看不出差别；坐标一律照抄 `f2` 写好的那串，
 * 不重算（免得动到浮点那套规矩）。
 */
function line_run_to_path(run) {
  let d = ''
  const at = {}
  for (const s of run) {
    RE_AT.lastIndex = 0
    let m = RE_AT.exec(s)
    while (m !== null) {
      at[m[1]] = m[2]
      m = RE_AT.exec(s)
    }
    d += `M${at.x1} ${at.y1}L${at.x2} ${at.y2}`
  }
  return `<path d="${d}"${run[0].replace(RE_LINE, '$1').replace(RE_XY, '')}/>`
}

function merge_lines(parts) {
  const out = []
  let run = null
  let key = ''
  const flush = () => {
    if (!run) return
    out.push(run.length > 1 ? line_run_to_path(run) : run[0])
    run = null
    key = ''
  }
  for (const s of parts) {
    const m = typeof s === 'string' ? RE_LINE.exec(s) : null
    if (!m) {
      flush()
      out.push(s)
      continue
    }
    const k = m[1].replace(RE_XY, '')
    if (run && k === key) {
      run.push(s)
      continue
    }
    flush()
    run = [s]
    key = k
  }
  flush()
  return out
}

/** 画一扇地方图（**并线之前**的原样；面板走 `build_local`，这一支留给 A/B 对照与排查）。 */
function build_local_raw(wx, wy, focus) {
  return assemble_local(wx, wy, focus).join('\n')
}

/** 画一扇地方图，返回 SVG 正文（不含 `<svg>` 外壳）。 */
function build_local(wx, wy, focus) {
  return merge_lines(assemble_local(wx, wy, focus)).join('\n')
}

function assemble_local(wx, wy, focus) {
  const o = ['<defs>']
  o.push(WONDER_HALO)
  o.push(WONDER_COLD)
  o.push('<filter id="soft" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="0.05"/></filter>')
  o.push('<filter id="wash" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="0.42"/></filter>')
  o.push('</defs>')
  // 先把聚落算出来——山水的画法要绕开它们（见 terrain_layer 的 holes）
  //
  // 第五十五版（用户定的「乙」）：**窗里的城一律按城画，大小只按等级分**。
  // 以前只有被聚焦的那一座是镇子、别的按小村画（八间房一口井），而 `focusAt`
  // 取的是鼠标最近的那座城——于是同一块地会随鼠标挪半格就从「三十间房的大镇」
  // 缩成「八间房的小村」。现在 `focus` 只决定题名框写谁、谁的名字让位给题名框。
  const here = []
  for (const [, race, , , , [nx, ny], cap] of NATIONS) {
    const cname = cap[0]
    const tier = cap[3]
    const [cxp, cyp] = _cap_at(cname, nx, ny, tier, cap[1], cap[2])
    if (!(wx - 3 < cxp && cxp < wx + WIN_W + 3 && wy - 3 < cyp && cyp < wy + WIN_H + 3)) continue
    const r = tier === 1 ? 2.55 : 1.75
    const cy = cyp - r * 0.55
    here.push([cname, race, tier, cxp, cy, r])
  }
  const holes = here.map(([, , , cx, cy, r]) => [cx, cy, r * 1.55])
  o.push(...sea_and_land(wx, wy))
  o.push(...water(wx, wy))
  o.push(...terrain_layer(wx, wy, holes))
  // 田（丙那一版，用户 m22497）：镇子外面总得有养活它的东西，**田是绕着镇子一圈的**。
  // 两块讲究：① 田画在聚落**之前**——田是地，房子压在田上才对；第六十九版把田画在
  // 聚落之后，岛城的镇子铺满整座小岛，田就盖在房顶上了。② 岛上的镇子一圈全是海，
  // 每一块田都要过 `on_land`，不然田会浮在水面上。一级三块、二级两块，只看等级。
  const rnd = new Random(555)
  for (const [cname, , tier, cx, cy, r] of here) {
    const nb = tier === 1 ? 3 : 2
    for (let k = 0; k < nb; k++) {
      const a = 2 * Math.PI * k / nb + rnd.uniform(-0.30, 0.30)
      const d = r * (1.40 + rnd.uniform(0, 0.28))
      const fx = cx + Math.cos(a) * d
      const fy = cy + Math.sin(a) * d * 0.62
      if (!on_land(fx, fy)) continue
      o.push(...field_block(fx, fy, a, 6000 + k * 13 + Math.trunc(fx * 7)))
    }
  }
  // 聚落。`taken` 从这一刻开始记：**名字不许压在房子上**，先占好位再排名字。
  const taken = []
  for (const [cname, race, tier, cx, cy, r] of here) {
    o.push(...town(cx, cy, r, race, 9000 + nlen(cname) * 31, tier === 1))
    taken.push([cx - r * 1.35, cy - r * 0.78 - 0.62, cx + r * 1.35, cy + r * 0.85])
  }
  // 磨坊：一级镇一座，画在聚落之后——它是「东西」，不是地。
  for (const [cname, , tier, cx, cy, r] of here) {
    const mx = cx + r * 1.5
    const my = cy + r * 0.2
    if (tier === 1 && on_land(mx, my)) o.push(...mill(mx, my, 1.0, 3000 + nlen(cname)))
  }
  // 码头与船（第六十九版；丙那一版改了根在哪）：岛上的镇子一圈全是海，田要过
  // `on_land`、常常只剩一两块，那就补一小段栈桥与一条渔船——靠海吃海的镇子总得有个
  // 出海口。12 个方向里挑第一个「走到水里」的，**从镇边一路走到第一处水面**（步长 0.10），
  // 桥根退回岸上一点，船停在桥那一头的水里。
  for (const [cname, , , cx, cy, r] of here) {
    let dir = null
    let shore = 0
    for (let k = 0; k < 12; k++) {
      const a = 2 * Math.PI * k / 12
      const ux = Math.cos(a)
      const uy = Math.sin(a) * 0.62
      const d = hypot(ux, uy) || 1e-9
      const nx = ux / d
      const ny = uy / d
      let hit = null
      for (let t = r * 0.90; t <= r * 3.20; t += 0.10) {
        if (!on_land(cx + nx * t, cy + ny * t)) { hit = t; break }
      }
      if (hit !== null) { dir = [nx, ny]; shore = hit; break }
    }
    if (!dir) continue
    const nx = dir[0]
    const ny = dir[1]
    const rx = cx + nx * (shore - 0.20)
    const ry = cy + ny * (shore - 0.20)
    o.push(...jetty(rx, ry, nx, ny, 1.0))
    const bx = rx + nx * 1.55
    const by = ry + ny * 1.55
    if (!on_land(bx, by)) o.push(...boat(bx, by, 1.4, 4000 + nlen(cname) * 17))
  }
  // 奇观
  o.push(...wonders())
  // 名字：左上角那块题名框写这一带的**大名**——有国家管着就是国家名，远海与荒原写
  // 区域名（第六十六版；第六十七版起会看地方）。城名与地貌名交给贪心解算器。
  const title = region_title(wx, wy, focus, FOCUS_MAP.get(focus) || '')
  const cart = cartouche(wx, wy, title)
  o.push(...cart[0])
  taken.push(cart[1])
  o.push(...label_layer(wx, wy, taken, title))
  // 夜罩：正好铺满取景框
  o.push(`<rect class="mnight" x="${f2(wx)}" y="${f2(wy)}" width="${f2(WIN_W)}" height="${f2(WIN_H)}"/>`)
  return o
}

// 地方图自己那条 `.lf`（田里的犁沟）规则。**跟 `MAP_CSS` 分开导出**——
// 面板只灌 `MAP_CSS`（见 `src/client.js` 里那行 `style.textContent`），而这条住在
// `LOCAL_CSS` 里，一直没人灌：镜内那 98 条 `<line class="lf">` 上没有 inline style，
// 于是 SVG 默认 `stroke:none`，犁沟**一条都看不见**（第四十三版补上）。
// 拆成 `LF_CSS` 是为了让面板能只补这一条、不把 `MAP_CSS` 再灌一遍（包可能自带别的 map.css）。
// **拼出来**，不要写成模板串——CSS 注释里一个反引号
// 就会让 `scripts/build-client.mjs` 把注释提前收尾。
const LF_CSS = '.gf-map .lf{stroke:' + FURROW + ';stroke-width:0.035;opacity:0.5}'
const LOCAL_CSS = MAP_CSS + LF_CSS

/**
 * 机器自查——跟世界图那套 `_boxes()` / `check()` 一个意思，判据换成地方图的。
 *
 * ① 被聚焦的镇子要踩在陆地上（岛上那两座尤其容易翻车）；
 * ② 取景框不许出世界、被聚焦的城必须在框里；
 * ③ 夜罩必须是最后一条、尺寸正好等于取景框；
 * ④ 窗口里每个名字都得摆下（挪不动就丢，丢了要报出来）。
 */
function check(focus) {
  const bad = []
  const nname = FOCUS_MAP.get(focus)
  const nat = NATIONS.filter((n) => n[0] === nname)[0]
  const nx = nat[5][0]
  const ny = nat[5][1]
  const tier = nat[6][3]
  const [cx, cy] = _cap_at(focus, nx, ny, tier, nat[6][1], nat[6][2])
  const [wx, wy] = win_around(cx, cy)
  const r = tier === 1 ? 2.55 : 1.75
  if (!on_land(cx, cy - r * 0.55)) bad.push('镇子不在陆地上')
  if (!(wx >= -1e-6 && wy >= -1e-6 && wx + WIN_W <= W + 1e-6 && wy + WIN_H <= H + 1e-6)) {
    bad.push('取景框出了世界（' + f2(wx) + ',' + f2(wy) + '）')
  }
  if (!(wx < cx && cx < wx + WIN_W && wy < cy && cy < wy + WIN_H)) bad.push('城不在自己的取景框里')
  DROPPED.length = 0
  const body = build_local(wx, wy, focus)
  const tail = '<rect class="mnight" x="' + f2(wx) + '" y="' + f2(wy) + '" width="' + f2(WIN_W) + '" height="' + f2(WIN_H) + '"/>'
  if (!body.endsWith(tail)) bad.push('夜罩不在最后一条')
  for (const t of DROPPED) bad.push('名字「' + t + '」没摆下')
  // ⑤ 窗口里每一座城都得有自己的名字牌（M-2）。名字挪位时不再"丢"，所以上面那条
  // `DROPPED` 常年是空的——这里改成数**画出来的字**：城在框里、名字却一个都没写出来，
  // 就报出来。删掉 / 改坏一块城名牌，这一条会立刻红。
  const said = new Set()
  for (const m of body.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) said.add(m[1])
  for (const [, , , , , [nx, ny], cap] of NATIONS) {
    const [cxp, cyp] = _cap_at(cap[0], nx, ny, cap[3], cap[1], cap[2])
    if (!(wx - 1 < cxp && cxp < wx + WIN_W + 1 && wy - 1 < cyp && cyp < wy + WIN_H + 1)) continue
    if (!said.has(cap[0])) bad.push('城名「' + cap[0] + '」没画出来')
  }
  return [bad, body.length]
}

/** 二十座城与它们所属的国。 */
const FOCUS = [['银树城', '银树森林'], ['霜堡', '北境霜堡'], ['石冠城', '巨人之脊'],
  ['西港', '西岸自由城邦'], ['河间城', '河间王国'], ['铁砧厅', '铁砧山'],
  ['古林之心', '古林'], ['裂牙堡', '裂牙荒原'], ['灰港', '灰港'],
  ['金丘城', '南境金丘'], ['深炉', '深炉城'], ['灰烬王庭', '灰烬之地'],
  ['黑石', '黑石要塞'], ['夏丘镇', '夏丘'], ['东岸港', '东岸商盟'],
  ['龙骨城', '龙骨荒漠'], ['鸦林堡', '鸦林'], ['龙焰', '龙焰半岛'],
  ['珊瑚宫', '珊瑚海国'], ['深渊港', '深渊港']]

const FOCUS_MAP = new Map(FOCUS)

/** 地方图的取景框尺寸（世界单位）——世界图 66×34 的九分之一面积。 */
const LOCAL_W = WIN_W
const LOCAL_H = WIN_H

// 二十座城的落脚点。跟 `check()` 用的是同一套算法：国名落点 + `_cap_at`。
let _CITY = null
function cities() {
  if (_CITY === null) {
    _CITY = FOCUS.map(([cn, nn]) => {
      const nat = NATIONS.filter((n) => n[0] === nn)[0]
      const [cx, cy] = _cap_at(cn, nat[5][0], nat[5][1], nat[6][3], nat[6][1], nat[6][2])
      return { cn, nn, cx, cy, tier: nat[6][3] }
    })
  }
  return _CITY
}

/**
 * 这个世界坐标属于哪座城——**取最近的一座**。
 *
 * 面板那边只知道他在哪个「地点」（`scriptorium` / `guild` …），要换成城名才知道
 * 该放大到哪一扇。七个地点都钉在城里，所以最近的那座就是他的城。
 */
function focusAt(x, y) {
  let best = null
  let bd = Infinity
  for (const c of cities()) {
    const d = hypot(x - c.cx, y - c.cy)
    if (d < bd) { bd = d; best = c }
  }
  return { focus: best.cn, nation: best.nn, cx: best.cx, cy: best.cy, tier: best.tier, dist: bd }
}

  return { win_around, DROPPED, plate_box, build_local_raw, build_local, LF_CSS, LOCAL_CSS, check, FOCUS, LOCAL_W, LOCAL_H, focusAt }
})()

/**
 * 回望厅 · 浏览器半边
 * dsh-gameflow
 *
 * 这个文件是**源码**，刻意写成零打包的纯 ES module：
 *   - 不 import 任何裸包名（不依赖 DSH 的模块表提供 react 之类的东西）；
 *   - 预览页和冒烟测试可以直接 `import` 它。
 *
 * 地图那一整段世界图**不在这个文件里**，也不住在任何产物文件里：它由世界包在装载时
 * 给过来（`src/packs/adventure/index.js` 调 `src/map/world.js` 的 `mapSvg()`，
 * **运行时现画**、结果记着，一张 480300 字）。它从前是 `.scratch/ground2.py --ship`
 * 生成的死数据（`./map-data.js`，545 KB），2026-10-06 改成现画，2026-10-08 那份死数据
 * 搬去 `.scratch/map-data.js`（不在包里），只留下一个身份：自检里「现画的结果
 * 跟当年那张图一字不差」的物证。
 *
 * 但 DSH 运行时不用 ES module 加载客户端 bundle——它注入的是不带
 * `type="module"` 的经典 script。所以 `scripts/build-client.mjs` 会把这个文件
 * 转成 `lib/client.js`（`window.__ModuleLoader__.load({id, factory})` 形态），
 * `exports["./client"]` 指向的是那个产物。**这个文件仍然是唯一真相**，
 * 改了它记得跑一次 `node scripts/build-client.mjs`（`npm test` 会顺带跑）。
 *
 * 整个界面挂在一个 Shadow DOM 里：DSH 的样式漏不进来，我们的样式也漏不出去。
 * 主题色板靠 CSS 自定义属性，所以 DSH 的亮/暗色底子不会把面板染花。
 */

const { applyPack, isUnlocked, listPacks } = __mod1
const { choiceOf: rulesChoiceOf, dangerOf: rulesDangerOf, directionOf: rulesDirectionOf, fateOf: rulesFateOf, fightOf: rulesFightOf, forkOf: rulesForkOf, momentOf: rulesMomentOf, outcomeOf: rulesOutcome, resultOf: rulesResultOf, stationOf: rulesStationOf, worldWeights: rulesWeights } = __mod18
// 地方图：**世界图的第二级**。同一套 `world3` 数据、同一个坐标系，只是取景框缩到
// 22×11.35（世界图 66×34 的九分之一面积、三倍线性分辨率）。点一下全图就进这一级——
// 见 buildStage 底下 zoomEnter / zoomDraw / zoomSwap。
// `build_local` 是 `.scratch/local.py` 的等值移植（逐字节对过二十座城），
// `focusAt` 是「这个世界坐标属于哪座城」，`LF_CSS` 是地方图那一条 `.lf`（田里的犁沟）——
// 它住在 `LOCAL_CSS` 里，面板得自己接上，不然镜内犁沟一条都不画。
const { build_local, focusAt, LF_CSS } = __mod19
// 地名签往哪儿摆：跟地图自己那块牌子用**同一条算式**（`plate_rect`），
// 并且要躲开图上已有的字与记号（2026-10-30 地图审计 M-4/M-14）。
const { placeLabel, PLACE_FS } = __mod3
// 地图那边的数字格式化（Python `'{:.2f}'.format` 的等值版）——`toFixed` 在恰好一半时
// 的进位方向跟 Python 不一样，取景框的补间要用同一套。
const { f2 } = __mod4

/* 地图与地点：**不再从这里 import**。
 *
 * 2026-10-06 起地图归世界包管（`src/packs/adventure/world.js` 给取景框与十三个地点，
 * 地图本体由 `src/map/world.js` 现画、经包给过来），装载块把
 * `MAP_SVG` / `MAP_CSS` / `VIEW` / `PLACES` 一起填进来。理由：加一个世界（仙侠、规则怪谈）该是加一个目录，而不是回来改这里的常量。
 * 四个都是 `let`——装载块从包里把它们填进来（见 createGameflow 上面那个装载块）。
 * 2026-10-06 起**换说法不会动它们**：地图、取景框、地名、配色都只跟世界走（用户第 2 条）。
 *
 * 底下的占位值是装载之前的：`MAP_SVG` 空着，地图那一格就是空的（一闪而过，不是状态）。
 * 导出是为了让自检能单独钉住「面板读的地图就是包里那一份」——跟那几组句子同一个理由。
 */
let MAP_SVG = ''
let MAP_CSS = ''

/* ------------------------------------------------------------------ *
 * 主题：功能完全一样，只换一层皮
 * ------------------------------------------------------------------ */

const THEMES = {
  /* 免费 · 默认 */
  plain: {
    id: 'plain',
    name: '朴素的书房',
    locked: false,
    tokens: {
      '--gf-edge': '18px',
      '--gf-radius': '6px',
      /* 2026-10-07 用户从三张试片里挑了「B 木与铜」：面板不再是一块半透明玻璃，
         而是桌上一只木盒——实色深木 + 一层极淡的木纹，配黄铜的线与字。
         门本来就是木色 + 铜把手的，现在两者是同一块料。
         凡是「换材料」的地方都走 token（含 --gf-grain / --gf-backdrop），
         所以别的主题一个字都不用改（见 CSS 里的 var(--x, 旧值) 写法）。 */
      '--gf-bg': '#241A12',
      '--gf-grain': 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.16)), repeating-linear-gradient(90deg, rgba(255,255,255,0.022) 0 1px, rgba(0,0,0,0.03) 1px 3px, rgba(255,255,255,0.014) 3px 4px, rgba(0,0,0,0.034) 4px 8px), repeating-linear-gradient(88deg, rgba(255,255,255,0.02) 0 3px, transparent 3px 15px)',
      '--gf-backdrop': 'none',
      '--gf-blur': '18px',
      '--gf-saturate': '1.4',
      '--gf-fg': '#F0E4CC',
      '--gf-fg-dim': '#B79E78',
      '--gf-line': 'rgba(214, 178, 112, 0.20)',
      '--gf-card': 'rgba(214, 178, 112, 0.06)',
      '--gf-fold': 'rgba(214, 178, 112, 0.14)',
      '--gf-tag-bg': 'rgba(214, 178, 112, 0.10)',
      '--gf-tag-fg': '#D8B879',
      '--gf-tag-radius': '2px',
      '--gf-tag-pad': '2px 7px',
      '--gf-tag-size': '11px',
      '--gf-tag-ls': '0.02em',
      '--gf-tag-line': 'rgba(214, 178, 112, 0.34)',
      /* 左栏那几枚（改文件 ×12）是**账**，不是按钮：同一套签，颜色压淡一点。
         2026-10-08 用户第 3 条要的是两栏的签一模一样（形状、字号、内距），
         差别只该在颜色上——见下面 .gf-you 那两条。 */
      '--gf-tag-bg-dim': 'rgba(214, 178, 112, 0.06)',
      '--gf-tag-line-dim': 'rgba(214, 178, 112, 0.22)',
      '--gf-seal': '#B4523F',
      '--gf-spine': 'rgba(44, 58, 85, 0.0)',
      '--gf-shadow': '0 22px 48px rgba(0, 0, 0, 0.55), 0 2px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 226, 170, 0.18), inset 0 -1px 0 rgba(0, 0, 0, 0.45)',
      /* 门后面那块地图。颜色全是 token，所以「把它压进木头里」＝换这一组颜色，
         不是给它盖一层滤镜——滤镜会把记号、灯、地名签一起弄脏。 */
      '--gf-stage-bg': 'rgba(0, 0, 0, 0.30)',
      /* 地图是**嵌**在木头里的一块：内圈一道铜线、上沿压深、底下再收一道，
         最后在槽口外沿留一线高光——有这一线，凹槽才读得出来是「凹」的。
         都是内阴影，不碰地图自己画的任何东西（记号、灯、地名签一个都不沾）。 */
      '--gf-stage-shadow': 'inset 0 0 0 1px rgba(214, 178, 112, 0.26), inset 0 1px 0 rgba(0, 0, 0, 0.5), inset 0 3px 14px rgba(0, 0, 0, 0.6), inset 0 -2px 6px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 226, 170, 0.1)',
      '--gf-room-line': 'rgba(214, 178, 112, 0.30)',
      '--gf-room-edge': 'rgba(214, 178, 112, 0.45)',
      /* 2026-10-07 第二层（版式）：木与铜那一轮只做了材质，这一层补的是「东西的样子」
         ——行与行之间那条极淡的分隔线、门的框与地面影、面板底下那道下沿。
         四个都走 token，别的主题不写就是透明，等于没加。 */
      '--gf-row-line': 'rgba(214, 178, 112, 0.08)',
      '--gf-room-foot': 'rgba(0, 0, 0, 0.4)',
      /* 滚动条把手单独一个色。它原来跟分隔线共用那个 20% 的淡金，
         压在深木上几乎看不见——2026-10-08 用户说「不够直观」，
         见闻录能不能滚，得让人一眼看出来。 */
      '--gf-scroll': 'rgba(214, 178, 112, 0.34)',
      '--gf-door-frame': 'rgba(214, 178, 112, 0.5)',
      '--gf-door-shadow': 'rgba(0, 0, 0, 0.52)',
      /* 地图上那枚地名签：签是旧纸色，字必须是深色。2026-10-07 在放大的截图上抓到过
         浅字压浅签——因为这套主题里 --gf-fg 是浅的，签却还是纸色。 */
      '--gf-place-fg': '#2B2018',
      '--gf-land': '#6F7B52',
      '--gf-land-2': '#616C46',
      '--gf-water': '#5E7A85',
      '--gf-roof-hi': '#B0654A',
      '--gf-roof-mid': '#95503A',
      '--gf-roof-lo': '#783E2C',
      '--gf-wood-hi': '#B08A55',
      '--gf-wood-mid': '#94703F',
      '--gf-wood-lo': '#775830',
      '--gf-paper-hi': '#E4D6B4',
      '--gf-paper-mid': '#C9B98F',
      '--gf-paper-lo': '#A89770',
      '--gf-cloth-hi': '#7B86A0',
      '--gf-cloth-mid': '#66708A',
      '--gf-cloth-lo': '#4E5670',
      // 他的斗篷单独一套：屋子是暖木色，他得沉一点才不像贴着墙的家具
      '--gf-cloak-hi': '#6E7883',
      '--gf-cloak-mid': '#5A636E',
      '--gf-cloak-lo': '#454D57',
      '--gf-stone-hi': '#A79C8C',
      '--gf-stone-mid': '#8E8476',
      '--gf-stone-lo': '#736B60',
      '--gf-ink': 'rgba(20, 14, 9, 0.45)',
      '--gf-cave': '#241C15',
      '--gf-skin': '#DDB894',
      '--gf-leaf': '#668049',
      /* 同色系深一档的描边色。2026-10-03 定了地图走「代码画的精致矢量插画」这条路，
         第一招就是它：描边不再是中性灰，而是各自材料的深一档——色块拼贴立刻变成插画。 */
      '--gf-land-line': '#4A5535',
      '--gf-water-line': '#3E5A66',
      '--gf-roof-line': '#5A2A1E',
      '--gf-wood-line': '#5C4224',
      '--gf-paper-line': '#8A7A57',
      '--gf-cloth-line': '#3A4157',
      '--gf-stone-line': '#5A5348',
      '--gf-leaf-line': '#4C6335',
      '--gf-leaf-elf': '#86A886',
      /* 四个区域的地表：同一块地，四个地方长得不一样（用户点的「骑马与砍杀 2」那一招）。 */
      '--gf-land-farm': '#8A8750',
      '--gf-land-elven': '#5E8570',
      '--gf-land-rock': '#8A8478',
      '--gf-land-sand': '#B09E72',
      '--gf-lamp': '#F3C96E',
      /* 夜里往哪儿掺色：木头上当然掺暖黑。掺原来那个夜蓝会让整块木板发青。 */
      '--gf-dusk-color': '#140D07',
      '--gf-dusk': '0',
      '--gf-glow': '0',
      '--gf-door-1': '#B98A5A',
      '--gf-door-2': '#A87A4C',
      '--gf-door-edge': '#6F4E33',
      '--gf-door-knob': '#E0B96E',
      '--gf-door-opacity': '1',
      '--gf-door-filter': 'saturate(0.9) brightness(0.95)',
      /* 「回望」那两个字浮在 DSH 自己的界面上（不在面板里），所以它要跟**页面**比，
         不是跟木板比——挑一个在浅色和深色页面上都还看得见的中间调。 */
      '--gf-door-label-fg': '#8C6A3F',
      /* 字分两工：故事句跟正文同一支黑体，数字与时间用等宽（像是刻上去的）。
         2026-10-07 晚他看过真机：楷体在 12.5px 的深木上笔画太细，根本看不清，
         所以故事句回到黑体——直接指 --gf-font，一处改全都改。
         教训：挑字体要看一比一的字，别在缩过的截图上判断。 */
      '--gf-font': '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
      '--gf-title-font': 'inherit',
      '--gf-story-font': 'var(--gf-font)',
      '--gf-num-font': 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace',
      '--gf-k-size': '11px',
      /* 中文字距：0.26em 那种拉法是给拉丁小标题的，压在两三个汉字上就成了贴纸。
         2026-10-08 收到 0.08em——汉字靠字号和颜色分级，不靠字距。 */
      '--gf-k-ls': '0.08em',
      '--gf-k-fg': '#C9A96A',
      '--gf-head-ls': '0.08em',
      /* 表头、周标签、文件名原来是跟「此刻」同一个金——金色处处在，就等于没有强调。
         金只留给他和此刻（--gf-k-fg、印章、门），其余全部退回暖灰。 */
      '--gf-head-fg': 'var(--gf-fg-dim)',
      '--gf-week-fg': 'var(--gf-fg-dim)',
      '--gf-v-ls': '0.06em',
      '--gf-when-font': 'var(--gf-num-font)',
      '--gf-when-size': '12px',
      '--gf-when-ls': '0.04em',
      '--gf-files-font': 'var(--gf-num-font)',
      '--gf-files-size': '11.5px',
      '--gf-files-fg': 'var(--gf-fg-dim)',
      '--gf-remark-lh': '1.72',
      '--gf-remark-opacity': '1',
      /* 世界句（外头发生的事，见 worldLine）：同属「他那边」，但比活计句小半号、暗一点，
         免得两句一样重、读起来像同一件事说了两遍。它不缩进也不加竖线——那是生活层的长相。 */
      '--gf-world-size': '12.5px',
      '--gf-world-opacity': '0.86',
      /* 痕迹那一句回声（见 MARKS 与 markLine）：跟世界句同一个字号台阶，再暗一档——
         它是那一天留下的余音，不是又一件事。 */
      '--gf-mark-opacity': '0.74',
      /* 高光事件那几行（见 src/packs/adventure/moments.js）：跟他手上那句话同一个字号台阶
         （它不是另一层，是同一段故事往下走），只比主句轻一点点；收束那句再轻一点。 */
      '--gf-moment-size': '13px',
      '--gf-moment-opacity': '0.94',
      '--gf-moment-close-opacity': '0.86',
      /* 岔口那两行（见 choiceOf）：他走的那条路。跟事件同一个台阶，比经过略淡一点点——
         它是那一天往前走的一段，不是另一件事。2026-10-08 加（用户 m08146「全做。」第 ④ 件）。 */
      '--gf-choice-opacity': '0.92',
      /* 交锋那两句（见 clashOf）：挨打那一行往下补的。跟事件同一个台阶，只比它轻一点点——
         它是那一行的延续，不是这一天的大事。2026-10-08 加。 */
      '--gf-clash-opacity': '0.9',
      /* 战斗（见 fightOf / fightsFor）：一整场仗那几拍，以及日卷末尾那句战报。
         正文比事件略淡一点点（同一台阶）；战报是账，再轻一档。2026-10-10 加（用户 m14888）。 */
      '--gf-fight-opacity': '0.92',
      '--gf-fight-report-opacity': '0.78',
      '--gf-fight-rule': 'rgba(180, 140, 80, 0.5)',
      /* 一天的框（见 dayFrameOf）：定场句与收尾句。它们是这一天的边，不是正文，
         所以各比主句轻一档，收尾再轻一点。2026-10-08 加（用户 m07599 第 2 条与 C1）。 */
      '--gf-day-open-opacity': '0.82',
      '--gf-day-close-opacity': '0.8',
      /* 序曲（见 ORIGIN）：故事开头那一段，只挂在最老的那一行上。它是正文，
         所以不压暗，只是底下压一条虚线把它和那一天的事分开。2026-10-08 加。 */
      '--gf-origin-opacity': '0.92',
      /* 方向（见 DIRECTIONS）：这一天朝哪边走。跟定场句一个台阶，略淡一点。
         2026-10-08 加（用户 m07234 第 2 条「比例需要调整」）。 */
      '--gf-direction-opacity': '0.86',
      /* 当日计划（见 JOURNEY）：今天手上那几件事与这一季的路。跟方向一个台阶，略淡一点。
         2026-10-10 加（用户 m14781：「我们需要按照一个人的一天来写」）。 */
      '--gf-plan-opacity': '0.88',
      /* 他今天身上少了什么（见 JOURNEY.losses）：每描一处少一分。跟收尾句一个台阶。
         2026-10-10 加（用户 m14933：「他有一个终极任务也是人生任务，一个终局」）。 */
      '--gf-loss-opacity': '0.8',
      /* 归宿（见 FATES 与 fatesFor）：一整年的收束，只挂在年卷那一行的最下面。
         它是那一年的账，不是一天的边，所以比日卷的收尾句实一档；末尾那一句再轻一点。
         2026-10-08 加（用户 m08146「全做。」第 ⑤ 件）。 */
      '--gf-fate-opacity': '0.88',
      '--gf-fate-close-opacity': '0.78',
      '--gf-life-size': '12px',
      '--gf-life-lh': '1.7',
      '--gf-life-opacity': '1',
      '--gf-life-line': '1px solid rgba(214, 178, 112, 0.30)',
    },
    /* DSH 切到深色时压一层：还是那块木板，只是更暗一点。
       2026-10-07 之前这里是「整份夜里的书房色板」（连地图一起换成夜景），
       木与铜定下来之后就不再换材料了——同一块木板夜里更暗，而不是变成另一种东西。
       所以它现在是一份**覆盖层**（只写要改的那几个键），自检比对的是叠完之后的色板。
       地图不在这一层里：DSH 的深色是界面偏好，不是天黑；地图该暗的时候由
       applyDaylight / dimForDusk 按钟点去压（那才是「天黑了」）。 */
    tokensDark: {
      '--gf-bg': '#1B120C',
      '--gf-fg': '#E7D9BE',
      '--gf-fg-dim': '#A98F6C',
      '--gf-line': 'rgba(214, 178, 112, 0.16)',
      '--gf-shadow': '0 20px 44px rgba(0, 0, 0, 0.62), inset 0 1px 0 rgba(255, 226, 170, 0.12)',
      '--gf-door-opacity': '0.9',
      '--gf-tag-fg': '#C9A96A',
      '--gf-files-fg': '#C9A96A',
      '--gf-k-fg': '#BC9C5E',
      '--gf-head-fg': '#BC9C5E',
      '--gf-week-fg': '#BC9C5E',
      '--gf-stage-bg': 'rgba(0, 0, 0, 0.32)',
    },
  },

  /* 付费主题 · 第一版只做到「定义好、还没上锁」 */
  classics: {
    id: 'classics',
    name: '古籍图书馆',
    locked: true,
    tokens: {
      '--gf-edge': '18px',
      '--gf-radius': '4px',
      '--gf-bg': 'rgba(42, 33, 26, 0.94)',
      /* 2026-10-09：这一套也不再要那层毛玻璃。底色本身就是 94% 不透明的，
         背后糊那 4px 的模糊几乎看不见，可它按帧计价——量出来滚动时它值任务时间的 18%
         （古籍主题滚动 1031ms Paint / 2462ms Layerize，把 backdrop-filter 关掉就掉到 1016ms / 2200ms）。
         默认那套「木与铜」早就写着 `--gf-backdrop: none`，因为它是实色木盒；这一套同理。 */
      '--gf-backdrop': 'none',
      '--gf-blur': '4px',
      '--gf-saturate': '1',
      '--gf-fg': '#E8DCC0',
      '--gf-fg-dim': '#A08F73',
      '--gf-line': 'rgba(232, 220, 192, 0.16)',
      '--gf-card': 'rgba(232, 220, 192, 0.05)',
      '--gf-fold': 'rgba(232, 220, 192, 0.16)',
      '--gf-tag-bg': 'transparent',
      '--gf-tag-fg': '#D9A79C',
      '--gf-tag-radius': '2px',
      /* 界面审计 U1/U7/U8：这一套从前**少定义**了几枚 token，于是它们静静落到兜底值上——
         地名的字色落回 `--gf-fg`（浅奶油压浅纸，1.16:1，整枚签读不出来）、
         小标题与表头落回 `--gf-fg-dim`（一片统一的灰，没有金色层次）、
         地名签的细边与地图的凹槽干脆 `none`。补上，值都按这一套的纸与印来配：
         地名字用 `src/map/local.js` 题名框那个同一个墨色（纸上的字是墨，不是奶油）。 */
      '--gf-place-fg': '#3B2E20',
      '--gf-k-fg': '#C9A96A',
      '--gf-head-fg': '#B79E78',
      '--gf-week-fg': '#B79E78',
      '--gf-glow': '0',
      '--gf-num-font': 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace',
      '--gf-room-line': 'rgba(158, 59, 50, 0.26)',
      '--gf-stage-shadow': 'inset 0 0 0 1px rgba(120, 96, 56, 0.30), inset 0 2px 10px rgba(0, 0, 0, 0.26)',
      /* 木纹、门的滤镜这一套维持 none——古籍图书馆的材质是纸与绢，不是木头。
         这是**故意**的，不是漏项（审计 U8 的提醒）；写成显式的 none，好让
         「某套主题少一个变量」这种洞以后在自检里一眼看得出来。 */
      '--gf-grain': 'none',
      '--gf-door-filter': 'none',
      '--gf-seal': '#9E3B32',
      '--gf-spine': 'rgba(44, 58, 85, 0.85)',
      '--gf-shadow': '0 10px 34px rgba(0, 0, 0, 0.5)',
      /* 古籍图书馆：同一张地图，深胡桃木 + 旧纸黄 + 一点朱红。 */
      '--gf-stage-bg': 'rgba(232, 220, 192, 0.06)',
      '--gf-land': '#3A3226',
      '--gf-land-2': '#332C21',
      '--gf-water': '#2A3038',
      '--gf-roof-hi': '#7A3B2E',
      '--gf-roof-mid': '#5E2E24',
      '--gf-roof-lo': '#47231B',
      '--gf-room-edge': 'rgba(232, 220, 192, 0.24)',
      '--gf-wood-hi': '#6A4C2C',
      '--gf-wood-mid': '#573D22',
      '--gf-wood-lo': '#3F2B18',
      '--gf-paper-hi': '#DCCDA6',
      '--gf-paper-mid': '#C4B48D',
      '--gf-paper-lo': '#A2916D',
      '--gf-cloth-hi': '#8A3F35',
      '--gf-cloth-mid': '#6E2F27',
      '--gf-cloth-lo': '#52221C',
      '--gf-cloak-hi': '#7C4A3C',
      '--gf-cloak-mid': '#63382D',
      '--gf-cloak-lo': '#4A2921',
      '--gf-stone-hi': '#7A7166',
      '--gf-stone-mid': '#665E54',
      '--gf-stone-lo': '#4F4840',
      '--gf-ink': 'rgba(42, 33, 26, 0.6)',
      '--gf-cave': '#120E0A',
      '--gf-skin': '#DEC3A0',
      '--gf-leaf': '#5A6B45',
      '--gf-land-line': '#241F16',
      '--gf-water-line': '#191E24',
      '--gf-roof-line': '#331710',
      '--gf-wood-line': '#2C1D10',
      '--gf-paper-line': '#8A7B5C',
      '--gf-cloth-line': '#3A1712',
      '--gf-stone-line': '#3C362F',
      '--gf-leaf-line': '#37412A',
      '--gf-leaf-elf': '#4E6248',
      '--gf-land-farm': '#443D26',
      '--gf-land-elven': '#2F3C2E',
      '--gf-land-rock': '#403A30',
      '--gf-land-sand': '#4B4229',
      '--gf-lamp': '#E8B85E',
      '--gf-door-1': '#7A5434',
      '--gf-door-2': '#66452B',
      '--gf-door-edge': '#2A211A',
      '--gf-door-knob': '#C9A45F',
      '--gf-door-opacity': '0.8',
      '--gf-font': '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
      '--gf-title-font': '"Songti SC", "SimSun", "Noto Serif SC", serif',
    },
  },
}

/* ------------------------------------------------------------------ *
 * 样式
 * ------------------------------------------------------------------ */

const CSS = `
*, *::before, *::after { box-sizing: border-box; }

.gf-root {
  position: fixed;
  right: var(--gf-edge);
  bottom: var(--gf-edge);
  z-index: 2147483000;
  /* 2026-10-06 用户报的 bug：面板收起来时只是 opacity 0，那块 560x700 的矩形
     照样吃鼠标——压在下面的 DSH 界面点不动、悬停也没反应，看着像「界面坏了」。
     所以根节点自己不吃事件，只有真正看得见的门和展开的面板把事件打开。 */
  pointer-events: none;
  font-family: var(--gf-font);
  color: var(--gf-fg);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* 地图上那枚地名的字。SVG 的 <text> 默认用浏览器的衬线字体，得跟着面板走。
   字号走属性（自渲染管线只认属性），这里只管字体和字距。 */
.gf-place-text {
  font-family: var(--gf-font);
  letter-spacing: 0.02em;
  /* 2026-10-31：这一行是补的，之前**没有**。代码把 x 写成牌子中心
     （rect[0] 与 rect[2] 的平均值），却没写 text-anchor —— SVG 默认是 start，
     于是字从牌子正中起笔、往右挤出牌子：用户 2026-10-31 截图里「他的屋子」
     右半截压在别的东西上，就是这 6 个字只坐了半个牌子。
     实测（.scratch/label-probe.mjs，1440×900）：牌子 21.5→29.2、字 25.27→31.98，
     右边溢出 2.78 个世界单位（约 21px）。补上之后字心与牌子心对齐。 */
  text-anchor: middle;
}

/* ---------- 两级地图：全图（L0）↔ 细节版（L1） ---------- */

/* 细节版是**换 viewBox** 换出来的，不是 scale：viewBox 一收成 22×11.35 那扇窗，
   世界图那层（借同一份 DOM 的 <use>）自动就是 3 倍，现画的地方图那层天然就是 1:1。
   所以内容那两层一个 transform 都不用写——只有记号/灯/地名签那一层要一个反缩放
   （见 zoomOverlay），好让他的记号在两级里位置、大小都一模一样。 */
.gf-zoom { pointer-events: none; }
.gf-zoom-pan { will-change: transform; }
.gf-zoom-local { opacity: 0; transition: opacity .16s ease-out; }
.gf-zoom-local[data-on] { opacity: 1; }

/* 拖动中（[data-drag]）那层地方图是**真的不画**，不是压透明度。
   2026-10-08 量出来的：只压透明度时它那 5686 个元素每帧照样重画一遍，
   拖动一帧 32–40ms（14 帧里 10–11 帧超过 25ms）；display:none 之后
   一帧回到 20–24ms。 */
.gf-zoom-local[data-drag] { display: none; }

/* 乙：拖动期间换一套省事的画法。shape-rendering: optimizeSpeed 让浏览器别做
   抗锯齿、text-rendering: optimizeSpeed 让它别做精细字距——都是每帧都要付的钱，
   而拖动本来就看不清笔画。松手 [data-drag] 一撤，立刻恢复精细的那一套。 */
.gf-zoom[data-drag] .gf-zoom-world { shape-rendering: optimizeSpeed; }
.gf-zoom[data-drag] text { text-rendering: optimizeSpeed; }

/* 丙（2026-10-08）：拖动期间地面换成一张**预先烘好的位图**（见 zoomShotBake）。
   跟手的那层矢量是 2056 个元素，每帧都要重画一遍——真浏览器里一帧 20.5ms、
   13 帧里掉 2 帧；一张位图挪一下只是一次贴图。没烘好（或者烘不出来）就退回矢量那层，
   退路写在 zoomMove 里。 */
.gf-zoom-bit { display: none; }
.gf-zoom-bit[data-on] { display: block; }

/* 拖动的时候只有世界图那层在挪（2026-10-08 量：252 帧里掉 1 帧），地方图那层先藏起来
   （真挪它那 4700 个元素要掉 21 帧）。松手以后再画地方图、淡进来。 */

/* 那 93 道 feGaussianBlur（80 个草斑 + 13 块地）在细节版里**一道都不画**。
   2026-10-08 量出来的：一帧 80 个离屏层就是那 75 帧掉帧（252 帧里 91 → 16），
   而软硬边在 3 倍里几乎看不出来——整扇窗逐像素比，平均差 0.86/255，
   只有 0.19% 的像素差过 12/255。CSS 的 filter 盖得住属性上的 filter。
   只摘细节版这一份：全图那张世界图、别处的地方图，一道都不动。 */
.gf-zoom-local [filter] { filter: none; }

/* 细节版里那 98 条犁沟（田里的 .lf）。这条样式住在 src/map/local.js 的 LF_CSS 里，
   而面板一直只灌 MAP_CSS——.lf 上没有 inline style，SVG 默认 stroke:none，
   于是细节版那块地一直是光板、一条犁沟都看不见。装载块把 LF_CSS 接在 MAP_CSS
   后面补上（第四十三版），颜色不在这儿重写一遍。 */

/* 提灯照地：夜罩不再是一块盖满地图的黑，而是一圈以他为中心的暗——
   脚下约 3 个世界单位透亮，到 9 个单位渐回原样（渐变见 buildStage 里的 gf-night，
   圆心跟着记号走）。两级**都吃这一套**，而且吃的是**同一条世界坐标的渐变**：
   细节版是换 viewBox 换出来的，地方图那层的坐标系就是世界坐标，直接铺就对齐。
   （第四十三～四十七版那套「按镜子的映射倒推」的第二条渐变，在两级地图里整个删了。） */
#gf-world .mnight { fill: url(#gf-night); opacity: calc(var(--gf-dusk,0) * 0.52); }
#gf-zoom .mnight { fill: url(#gf-night); opacity: calc(var(--gf-dusk,0) * 0.52); }
.gf-map.gf-zoom-local .mnight { fill: url(#gf-night); opacity: calc(var(--gf-dusk,0) * 0.52); }
/* 界面审计 U16：--gf-dusk 是每 30 秒按钟点现算的，从前它一改，夜罩就**硬跳**一格
   （天说黑就黑，像被人拽了一下）。给 opacity 一条 1.6s 的过渡，让黄昏是漫上来的。
   单列一条规则是有意的：上面那三行据说是「夜罩的凭据」（smoke 有两条断言逐字比它们），
   别把过渡写进去搅浑。只过渡 opacity——fill 是同一支世界坐标渐变，不动。 */
#gf-world .mnight,
#gf-zoom .mnight,
.gf-map.gf-zoom-local .mnight { transition: opacity 1.6s ease; }
#gf-night stop { stop-color: var(--gf-dusk-color, #140D07); }

/* 角落那张小全图（用户 m19416 定的第四条）：永远看得见自己在哪儿，点一下跳过去。
   **选择器里必须带上 .gf-stage**：上面有一条 .gf-stage svg { display:block; width:100%; height:auto }
   （那条是给大地图用的），它的特异性 (0,1,1) 压得过单写一个 .gf-mini (0,1,0)——
   宽高会被撑成整幅；而且 **display 属性也压不过它**（属性是样式表里最低的一档，
   CSS 只要写了 display 就盖掉属性），于是这张小图回全图之后收不起来。所以这里自己写
   display：默认 none，属性不是 none 的时候才 block。 */
.gf-stage svg.gf-mini {
  display: none;
  position: absolute;
  right: 10px;
  /* 小全图原来钉在右下角，正好压住罗盘（地图审计 M-8：罗盘画在世界坐标 62.0, 30.6，
     也就是整张图的右下角）。挪到右上——那一角是画框边上那片空海，没有记号、没有地名签，
     压不着东西。 */
  top: 10px;
  width: 112px;
  height: 58px;
  border: 1px solid rgba(214,178,112,.5);
  border-radius: 4px;
  background: #0E161B;
  box-shadow: 0 2px 10px rgba(0,0,0,.5);
  opacity: .94;
  cursor: pointer;
}
.gf-stage svg.gf-mini:not([display="none"]) { display: block; }
/* 乙（2026-10-08）：小全图是第二张 <svg>，里面那个 <use> 又是一整份世界图
   （2056 个元素），而它**不参与拖动**——拖动期间先收起来，松手就回来。
   必须排在上面那条 :not(...) 之后：两条特异性一样（0,2,2），靠顺序赢。 */
.gf-stage svg.gf-mini[data-drag] { display: none; }
.gf-mini-view { fill: rgba(240,221,176,.14); stroke: #E8CE96; stroke-width: 0.35; }
.gf-mini-dot { fill: var(--gf-seal); }

/* 灯/记号/地名签那一层住的**自己那张 SVG**（2026-10-10，用户 m23060 报「角色标记上下
   动态，但一卡一卡」）。搬出来的理由写在 buildStage 里那段注释上：那三处动画改的是
   SVG 里的 transform / r，交给不了合成器，每帧都要重画它所在的那张 SVG——住在地图那张
   SVG 里时，重画的是整张地图（5817 个形状）。
   **选择器里必须带上 .gf-stage**：上面那条「.gf-stage svg { display:block; width:100%;
   height:auto }」是 (0,1,1)，单写一个「.gf-overlay-svg」(0,1,0) 会被它撑成整幅
   （跟「.gf-mini」是同一个坑，见上面那段）。 */
.gf-stage svg.gf-overlay-svg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  /* 它铺满整张地图：不吃事件，点击照旧落到下面那张地图上。 */
  pointer-events: none;
  /* 自己一层：每帧动的就是它，重画的也只有它。 */
  will-change: transform;
}

/* 回全图那颗小按钮（双击 / Esc 也算，见 buildStage 里的监听）。 */
.gf-back {
  position: absolute;
  right: 10px;
  /* 跟着小全图挪到右上（M-8）：小全图占 10 + 58 高，按钮从它下沿再落 6。 */
  top: 74px;
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  color: #F0E2C4;
  background: rgba(20,14,8,.72);
  border: 1px solid rgba(214,178,112,.5);
  border-radius: 4px;
  cursor: pointer;
}
.gf-back:hover { background: rgba(40,28,16,.88); }
.gf-back[hidden] { display: none; }


/* ---------- 收起态：一扇小木门 ---------- */

/* 门与门上那枚记号**是兄弟**，不是父子：门自己就是一枚按钮，里面再套一枚按钮，
   键盘与读屏都要绕一遍（2026-10-08 更晚 b259 里数出来的四条之一）。这一层只做定位。 */
.gf-door-wrap {
  position: relative;
}

.gf-door {
  position: relative;
  display: block;
  width: 64px;
  height: 64px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  /* 门是收起来时唯一该被点到的东西（根节点已经 pointer-events: none）。 */
  pointer-events: auto;
  opacity: var(--gf-door-opacity);
  filter: var(--gf-door-filter, none);
  transition: opacity 200ms ease;
}
.gf-door:hover { opacity: 1; }
.gf-door:focus-visible { outline: 2px solid var(--gf-fg-dim); outline-offset: 3px; border-radius: 6px; }

/* 2026-10-07 第二层：门是钉在墙上的，所以给它一个门框和一道地面影。
   门框照着 SVG 里那道拱描（拱在 64px 里占 x17~47 / y10~55），比它大 4px，
   中间留出那道缝——不然就跟门自己的边线糊成一条双线了。
   地面影是门底下那一小片压暗，让它不像浮在空气里。
   两样都放在门的后面（z-index: -1）、都不吃事件——门是收起来时唯一该被点到的东西。 */
.gf-door::before {
  content: '';
  position: absolute;
  left: 11px;
  right: 11px;
  top: 4px;
  bottom: 5px;
  border: 1px solid var(--gf-door-frame, transparent);
  border-radius: 21px 21px 4px 4px;
  pointer-events: none;
  z-index: -1;
}
.gf-door::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 54px;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--gf-door-shadow, transparent), transparent);
  pointer-events: none;
  z-index: -1;
}

/* 门缝里透出来的光：平时藏着，手放上去才亮 */
.gf-door-crack {
  opacity: 0;
  filter: drop-shadow(0 0 3px var(--gf-door-knob));
  transition: opacity 420ms ease-out;
}
.gf-door:hover .gf-door-crack,
.gf-door:focus-visible .gf-door-crack { opacity: var(--gf-crack-dim); }

/* 门后有事等你挑的时候（m11003 第 2 条）：门缝里的光一直亮着，别只等人把手放上去。
   跟那枚惊叹号一个意思——关着门也看得见「里面还留着一件事没走完」。 */
.gf-door-has-choice .gf-door-crack { opacity: var(--gf-crack-dim); }

/* 「回望」二字浮在门的左边 */
.gf-door-label {
  position: absolute;
  right: calc(100% + 13px);
  top: 50%;
  transform: translate(4px, -50%);
  white-space: nowrap;
  font-size: 13.5px;
  letter-spacing: 0.14em;
  color: var(--gf-door-label-fg, var(--gf-fg-dim));
  /* 界面审计 U14：从前常态是 opacity: 0，只有 hover/focus 才浮出「门后」二字——
     新用户第一眼只看见右下角一枚 64px 的木门，不知道那是什么；触屏更是永远没有 hover。
     常态给它 .55（读得见、不抢），手放上去或键盘聚焦时到 1。 */
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 200ms ease, transform 200ms ease;
}
.gf-door:hover .gf-door-label,
.gf-door:focus-visible .gf-door-label { opacity: 1; transform: translate(0, -50%); }

/* 门上的提醒记号。2026-10-08 晚用户 m11003 第 2 条：「如果用户不选，那么会自动随机选一个，
   但是我们要给用户选择的提醒，那么就是现在门上给一个提醒的符号」。
   2026-10-08 更晚用户 m11602 第 2 条否掉了原来那枚小金菱：「这个标记不够游戏性，也不像
   一个事件提醒，我们应该换一个符号」——现在是一枚圆牌，里面一个惊叹号（游戏里最
   通用的「有件事等你」），轻轻脉动；**只有真有得挑的时候才亮**，而且**点得动**：
   点一下推开面板、直接落到那一行（见 jumpToOpenFork）。
   2026-10-08 再晚一点用户 m11863 第 1 条：「你这感叹号不红色吗？试试金色。」——圆牌
   从印色换成门把手那一支**金色**（--gf-door-knob，门把手那一支），惊叹号仍是深褐（金底深字，
   在羊皮纸上比金底金字读得清），外面那圈晕也是金的。
   2026-10-08 更晚用户 m12444 第 4 条：「现在门上感叹号，也不够明显，感觉暗淡下去了，是需要
   增亮的，因为是提醒用户有选项。」——整枚放大一号（15px → 18px）、笔画加粗加长（竖 5.4 → 7、
   点 2.4 → 3）、静态那圈晕从 6px 提到 9px、脉动 7↔16px，**看见过那一档也从 0.36 提到 0.68**：
   它是一枚提醒，压暗是「你已经看见了」，不是「它本来就该暗」。 */
.gf-door-badge {
  position: absolute;
  right: 2px;
  top: -2px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--gf-door-knob, #E0B96E);
  box-shadow: 0 0 9px var(--gf-door-knob, #E0B96E), 0 0 0 1px rgba(24, 16, 9, 0.55);
  cursor: pointer;
  /* 它从门的子节点挪出来之后，得自己把事件打开（根节点与这一层都是 pointer-events: none 见上）。 */
  pointer-events: auto;
  animation: gf-badge-pulse 2.6s ease-in-out infinite;
}
/* 它是一枚按钮，键盘走得到它就得看得见自己在哪儿（2026-10-08 更晚 b259 里数出来的四条之一）。 */
.gf-door-badge:focus-visible {
  outline: 2px solid var(--gf-fg-dim);
  outline-offset: 2px;
}
/* 惊叹号：上面一竖、下面一点，都用伪元素画（不占 DOM，也不进任何一句台词） */
.gf-door-badge::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 4.6px;
  width: 3.2px;
  height: 9px;
  margin-left: -1.6px;
  border-radius: 1.6px;
  background: var(--gf-badge-fg, #2A1E12);
}
.gf-door-badge::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: var(--gf-badge-fg, #2A1E12);
}
.gf-door-badge[hidden] { display: none; }
.gf-door-badge:hover { transform: scale(1.14); }
/* 那一行就在眼前了：压暗一档、脉动也停（提醒只在「你还没看见」的时候最亮）。
   0.68 而不是更低：压到 0.36 时它在木门上几乎看不见了（用户 m12444 第 4 条）。 */
.gf-door-badge.gf-badge-seen { opacity: 0.68; animation: none; }
@keyframes gf-badge-pulse {
  0%, 100% { box-shadow: 0 0 7px var(--gf-door-knob, #E0B96E); }
  50% { box-shadow: 0 0 16px var(--gf-door-knob, #E0B96E); }
}

/* 地图右上角那枚图钉（「留住」）也得看得见焦点——它跟别的几处不一样，原来是漏的
   （2026-10-08 更晚 b259 里数出来的四条之一）。 */
.gf-always:focus-visible {
  outline: 2px solid var(--gf-fg-dim);
  outline-offset: 2px;
}

/* 常驻按钮「始终显示」。2026-10-08 晚用户 m11003 第 3 条：「在界面上，我们需要做一个常驻按钮，
   即是让门后的事情可以一直浮现」；2026-10-08 更晚他报了第二条（用户 m19425 第 1 条）：按钮
   挪到**地图右上角**，按常见的那种「始终显示 / 钉住」的样子做——一枚图钉，按下去是实心、亮印色。
   点一下 = 这一页不自己收（鼠标移开不收、点外面也不收），再点一下放开。
   根节点自己 pointer-events: none，所以它得自己把事件打开。
   选择器必须带上 .gf-stage：底下有一条 .gf-stage svg { display: block; width: 100% }（(0,1,1)），
   不带上它这枚 15px 的小图钉会被撑成整幅宽——第五十七版的小全图踩过同一个坑。 */
.gf-always {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font: inherit;
  /* 界面审计 U5：从前是 --gf-door-label-fg + opacity .6 → 2.14:1，26px 的方框里
     一枚 15px 的金图钉，在深木上看起来像一块污渍，谁也不知道那是唯一能钉住面板的开关。
     改成金（--gf-k-fg，两套主题都定义了），不透明，28px 方框里 18px 的图标，
     再加一道极淡的外描边把它从地形里「抬」出来。 */
  color: var(--gf-k-fg, var(--gf-door-label-fg, var(--gf-fg-dim)));
  background: rgba(20, 14, 8, 0.72);
  border: 1px solid rgba(214, 178, 112, 0.35);
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  pointer-events: auto;
  opacity: 1;
  transition: opacity 200ms ease, color 200ms ease, border-color 200ms ease, background 200ms ease;
}
.gf-always:hover { background: rgba(40, 28, 16, 0.92); border-color: var(--gf-k-fg, rgba(214, 178, 112, 0.35)); }
.gf-always[aria-pressed='true'] {
  opacity: 1;
  /* 用户 m12444 第 3 条：「常驻按钮按了之后也是红色的，这是不对的，不符合我们颜色梯度的，
     可以换位感叹号一样的金色。」——按下去原来是印色（--gf-seal，红），现在跟门上那枚惊叹号
     同一支金（--gf-door-knob）。**状态是「亮起来」，不是「变成另一个颜色」**：整幅面板里
     红只有一处意义（印色 = 落定 / 印上去），按钮的「开」不该借它。 */
  color: var(--gf-door-knob, #E0B96E);
  border-color: var(--gf-door-knob, #E0B96E);
  background: rgba(40, 28, 16, 0.9);
}
.gf-stage svg.gf-always-icon { display: block; width: 18px; height: 18px; }
.gf-pin-filled { display: none; }
.gf-always[aria-pressed='true'] .gf-pin-filled { display: block; }
.gf-always[aria-pressed='true'] .gf-pin-outline { display: none; }

/* ---------- 展开态：一间小书房 ---------- */

.gf-room {
  position: absolute;
  right: 0;
  bottom: 84px;
  /* 窗口窄的时候别让面板左边被切掉（面板是贴着右边长的） */
  width: min(560px, calc(100vw - 44px));
  /* 高度跟着内容走：记录少的时候不留一大块空，记录多的时候到 700 就收住、里面自己滚。
     原来是写死 700px——四条记录的面板会在第三行齐腰切断，看着像是画坏了
     （2026-10-08 用户：「不够简洁」）。 */
  height: auto;
  max-height: min(700px, calc(100vh - 118px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--gf-line);
  border-radius: var(--gf-radius);
  /* 木与铜：底是一块实木，木纹走 --gf-grain；--gf-backdrop 默认 none，
     只有还想保留玻璃的那套主题才把它写成 blur(...)。两者都带兜底值，
     所以别的主题一个字都不用改。 */
  background-color: var(--gf-bg);
  background-image: var(--gf-grain, none);
  box-shadow: var(--gf-shadow);
  -webkit-backdrop-filter: var(--gf-backdrop, blur(var(--gf-blur)) saturate(var(--gf-saturate)));
  backdrop-filter: var(--gf-backdrop, blur(var(--gf-blur)) saturate(var(--gf-saturate)));
  transform-origin: bottom right;
  opacity: 0;
  /* 2026-10-07 第二层：开合改成「掀板」。原来是平平地推上来 12px，像网页弹窗；
     现在收起来的时候歪着 0.9 度、往里缩一点，打开时顺着右下角这个轴摆正，
     240ms 走一条前快后慢的曲线——像一块板子被掀开、落定。 */
  transform: translateY(14px) rotate(0.9deg) scale(0.97);
  /* 收起来 = 不排版、不吃事件。只靠 opacity: 0 是 2026-10-06 那个
     「界面点不动」的根源：看不见不等于不在那儿。
     visibility 的延迟（280ms）比过渡（240ms）长一点，收起来时那一段淡出还看得见。 */
  visibility: hidden;
  pointer-events: none;
  transition: opacity 240ms cubic-bezier(0.2, 0.8, 0.3, 1), transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1), visibility 0s linear 280ms;
}
.gf-room.gf-open {
  opacity: 1;
  transform: none;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 240ms cubic-bezier(0.2, 0.8, 0.3, 1), transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1), visibility 0s;
}
/* 2026-10-07 第二层：底下收一道口。一块木板总得有个下沿，
   不然最下面那一行像是被截断的。
   界面审计 U9：18px 太浅，滚到底时最后一行下面那排标签会被**从中间**横切
   （四个圆角框只露出上半截，像排版坏了）。30px 让半截元素化得开一些，
   配合 .gf-timeline 加大的 padding-bottom，切口落在空白里。 */
.gf-room::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 30px;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, var(--gf-room-foot, transparent) 86%);
  border-bottom: 1px solid var(--gf-room-edge, transparent);
}
/* hidden 属性本来该管这事，但 .gf-room 上的 display: flex 把它盖过去了
   （类选择器赢过浏览器自带的 [hidden]），于是收起来的面板一直占着那块地方吃鼠标。
   这一条把 hidden 按回去。 */
.gf-room[hidden] { display: none; }

/* 面板里已经没有一个「头」了。
   2026-10-03 用户：「（问候）并掉，最上方就是地图，不需要别的文字，
   这样可以使所有文字都在地图下方。」所以最上面就是地图，文字全在它下面。 */

.gf-timeline {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 22px 36px;
  /* 滚动条的位置**永远留着**（scrollbar-gutter），这样有滚动条和没滚动条时
     文字宽度都是一个数——地图那边（.gf-stage）才敢去对齐。
     注意这里不能再写 scrollbar-width: thin：Chromium 一旦看到它就会忽略下面
     那条 ::-webkit-scrollbar，滚动条宽度变成引擎自己定的。
     而且「留多宽」这件事在不同环境里不一样（预览页 6px、真的 DSH 面板 15px），
     所以真正对齐用的那个数由 JS 量出来，写进 --gf-sb（见 syncGutter）。 */
  scrollbar-gutter: stable;
  scrollbar-color: var(--gf-scroll, var(--gf-line)) transparent;
}
.gf-timeline::-webkit-scrollbar { width: 6px; }
.gf-timeline::-webkit-scrollbar-thumb { background: var(--gf-scroll, var(--gf-line)); border-radius: 3px; }
.gf-timeline::-webkit-scrollbar-track { background: transparent; }

.gf-week { margin-top: 22px; }
.gf-week:first-child { margin-top: 6px; }
/* 周标签只在记录跨了周的时候才画，而且画成一条分隔线——
   2026-10-03 用户问「为什么这里要出现一个这一周？」，因为它原来紧贴着表头，
   看起来像第三列表头。现在它是一条带字的横线，一眼知道是分段。 */
.gf-week-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  font-size: 11px;
  letter-spacing: var(--gf-head-ls, 0.16em);
  color: var(--gf-week-fg, var(--gf-fg-dim));
  opacity: 0.9;
}
.gf-week-label::after { content: ''; flex: 1; height: 1px; background: var(--gf-week-line, var(--gf-line)); }

/* ---------- 见闻录：左边你做了什么，右边他做了什么 ---------- */

/* 一条竖线把两个世界分开，两栏一样宽。
   2026-10-02 用户反馈原文：「在文字层面，我希望从中间分割，左边是用户做了
   什么，右边是主人公做了什么，这样避免用户需要挨个点击。」
   所以这里没有可以点的东西——翻面卡片连同折角和提示行整个拆掉了。 */
.gf-cols-head {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
  /* 右边那块空档跟见闻录的滚动条对齐（见 .gf-stage 上的说明与 syncGutter）：
     表头是见闻录的兄弟节点、不在滚动容器里，不补这一下，右栏标题就会比下面
     那一栏的字往右偏半个字。 */
  padding: 6px calc(22px + var(--gf-sb, 0px)) 10px 22px;
  font-size: 11px;
  letter-spacing: var(--gf-head-ls, 0.14em);
  color: var(--gf-head-fg, var(--gf-fg-dim));
  opacity: 0.85;
}
.gf-cols-head span:last-child { padding-left: 16px; border-left: 1px solid var(--gf-line); }
/* hidden 属性对 display: grid 那一条不管用（它只是 UA 样式里的 display: none，被这里的
   display 盖掉了）——空态与「还没按过开始冒险」那两种情形下，抬头一直没真收起来过
   （2026-10-24 用户 m29218 那张截图上就摆着两个空抬头）。 */
.gf-cols-head[hidden] { display: none; }

/* 2026-10-07 第二层：行与行之间加一条极淡的分隔线。原来只靠 margin-bottom 拉开，
   一整列看起来是一片没有缝的字、找不到一行从哪里开始。
   线走 --gf-row-line（别的主题不写就是透明），每段的第一行不画——
   它上面已经是周标签或者表头，再画一条就重复了。 */
.gf-row {
  margin-bottom: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--gf-row-line, transparent);
}
.gf-row:last-child { margin-bottom: 4px; }
/* 空着的那一格矮一点、安静一点：它只有一枚点加一句话，撑不起一整行的版式。
   一格一行之后空格子会占掉半屏（实测两成多的格子是空的），所以要收一收。 */
.gf-row-quiet {
  margin-bottom: 10px;
  padding-top: 8px;
}
/* 一卷淡一档：抬头与左栏（那几枚签、动过的文件名）压暗一点，**字号不动**——像书页边上
   的一行小注，一眼看出它是一卷，又不抢今天那几格的注意力。用户 2026-10-06 从三个选项里
   挑的「淡一档就好」。右栏（他的冒险）**不压**：那是他真干过的事，不该因为被折起来就变淡。 */
.gf-row-roll .gf-when { opacity: 0.66; }
.gf-row-roll .gf-you .gf-tag { opacity: 0.8; }
.gf-row-roll .gf-files { opacity: 0.62; }
.gf-week > .gf-row:first-child,
.gf-week-label + .gf-row { padding-top: 0; border-top: 0; }
.gf-when {
  margin-bottom: 7px;
  font-family: var(--gf-when-font, inherit);
  font-size: var(--gf-when-size, 11.5px);
  letter-spacing: var(--gf-when-ls, 0.06em);
  color: var(--gf-when-fg, var(--gf-fg-dim));
}
/* 最新那一行是活的：左边一小截金线，抬头提到纸色。
   2026-10-08：「此刻」那两个字现在挂在地图下面那块状态里当锚点，
   这一行不再跟着重复一遍——它是活的，靠颜色说，不靠字说。 */
.gf-when-now {
  position: relative;
  color: var(--gf-fg);
}
.gf-when-now::before {
  content: '';
  position: absolute;
  left: -11px;
  top: 0.3em;
  width: 3px;
  height: 0.8em;
  border-radius: 1px;
  background: var(--gf-k-fg, var(--gf-fg-dim));
  opacity: 0.8;
}
/* 空着的那一格：左栏只留一枚淡淡的点。
   那五分钟里你确实什么都没做（实测两成多的格子是这样），所以不写「无数据」这种现代词，
   也不拿右栏那句安静话去填空——一枚点就是它的全部。
   2026-10-08 之前这里画的是一排小刻度（.gf-cells / .gf-cell）：一格一行之后，
   梯子本身就是那条刻度，再画一排就是自己重复自己。 */
.gf-quiet-dot {
  width: 4px;
  height: 4px;
  margin: 5px 0 0 1px;
  border-radius: 50%;
  background: var(--gf-line);
  opacity: 0.55;
}
.gf-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
  align-items: start;
}
.gf-you, .gf-him-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.gf-him-col { padding-left: 16px; border-left: 1px solid var(--gf-line); }

/* ---------- 那扇门后面的地图 ---------- */

.gf-stage {
  flex: none;
  /* **不许再写 align-self: center**。面板是竖排 flex，align-self 管的是横轴，
     center 会让这一块缩到「内容那么宽」而不是撑满——而里面的 SVG 只写了
     width: 100%（没有固有宽高），父容器宽度又变成看内容定的，百分比就没有了参照，
     浏览器只好退回给 SVG 的默认尺寸。结果就是地图比下面两栏窄一大截、居中浮着。
     2026-10-05 用户第 1 条说的就是它：「地图和下面的内容在左右上对不齐」。
     现在改成撑满，并且左右留白跟下面两栏的字对死（左边 22px 见 .gf-timeline
     的 padding；右边多让 6px，那是滚动条的位置，见 scrollbar-gutter）。 */
  align-self: stretch;
  /* ::after 那圈槽口阴影要贴着这块定位（见下面 .gf-stage::after）。 */
  position: relative;
  /* 拖地图的时候不许起选区。2026-10-08 用户报第 2 条「拖动的时候会选中我们的
     字节」，截图里国名和地形名被选成蓝底——那是浏览器自己的选中，跟我们的代码
     无关，只能在这儿关掉。user-select 会继承给里面的 SVG 文字；只关地图这一块，
     面板里别的字照样能选。 */
  user-select: none;
  -webkit-user-select: none;
  /* 右边不再写死 28px。见闻录是个滚动容器，它留出的滚动条空档
     （scrollbar-gutter）在预览页量出来是 6px，在真的 DSH 面板里是 15px
     ——2026-10-05 用真面板的量尺寸钩子量到：见闻录里的内容宽 499，
     而它的 padding box 是 514。所以这个数改成由 JS 量出来写进 --gf-sb
     （见 syncGutter），地图和字才在任何一台机器上都对得上。 */
  margin: 12px calc(22px + var(--gf-sb, 0px)) 0 22px;
  padding: 0;
  border-radius: calc(var(--gf-radius) - 2px);
  background: var(--gf-stage-bg);
  box-shadow: var(--gf-stage-shadow, none);
}
/* 地图是一张 96×54 的**平面**世界地图：一整块大陆、四块领地染色、
   山脊、森林、河、路、罗盘，七座城镇按各自的文化画成小符号。
   2026-10-03 用户说「这是一个小镇的地图，而不是世界地图」，
   所以它从等距 22×15 换成了正俯视。
   2026-10-05 用户又说「地图的内容还是不够大，需要更大，也就是继续缩小比例」：
   面板 424 → 560px，地图不再写死 360px 而是撑满整行（见 .gf-stage svg），
   viewBox 同时裁掉四周那圈用不上的海（见 buildStage 里的 VIEW）。 */
.gf-stage svg { display: block; width: 100%; height: auto; touch-action: none; }
/* 界面审计 U3：地图现在是一个能聚焦、能按的东西（见 buildStage 里那条 keydown），
   那它得看得出「可以按」，也得让人看见「焦点在我身上」。
   全图点一下进细节版 ⇒ 全图给 pointer（细节版拖动中由 [data-drag] 那几条接管）。 */
.gf-stage svg[role='application'] { cursor: pointer; }
.gf-stage svg[role='application']:focus-visible { outline: 2px solid var(--gf-fg-dim); outline-offset: 2px; border-radius: 6px; }

/* 第一次开门那一下，地图还在铺（2026-10-31，t28）：这行字顶在正中间，
   底子是同一块纸色，所以看起来像「地图正被摊开」，不像空框或坏掉。
   它只活到 buildMap 灌完那一刻（见 setOpen 里的 afterPaint），之后 hidden。
   **这段是模板字符串，注释里不许出现反引号。** */
.gf-stage-note {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--gf-fg-dim);
  background: var(--gf-stage-bg);
  border-radius: inherit;
  pointer-events: none;
}
.gf-stage-note[hidden] { display: none; }

/* 凹槽：地图是**嵌**在木头里的一块，所以槽口那一圈阴影得画在**地图上面**。
   2026-10-10 试出来的：这条规则原来写在 .gf-stage 自己的 box-shadow 上，
   而 box-shadow 的 inset 是贴着背景画的，会被不透明的 SVG 整个盖住，等于白写。
   改用 ::after 盖一层——只画线、不画底色、事件全穿透，
   地图自己画的东西（记号、灯、地名签）一个都不沾。
   注意：这整段是模板字符串，注释里**不许出现反引号**，一出现就把 CSS 断开了。 */
.gf-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--gf-stage-shadow, none);
  pointer-events: none;
}

/* 描边不在这里写：每一块的颜色和描边都是画的时候按材质定死的（见 poly）。
   CSS 的 stroke 会盖掉 SVG 属性，那样「他看见的图」和自渲染管线出的图就不是
   同一张了——而这台机器截不了图，那张图是唯一能核对的眼睛。 */

/* 「他现在在这儿」的那枚记号，轻轻地一起一落。
   地图大了之后他自己就不画了——一枚记号更好认，也不用为一套动作准备美术。
   **动画挂在内层的 gf-pin-bob，不是外层的 gf-pin**：外层的位置写在 transform 属性上，
   而 CSS 的 transform 会整个盖掉属性上的 transform，挂错层 = 记号被画到画布左上角、整个朝上长出画布。
   灯那圈光同理（它闪的是 opacity，而外层要用属性控「他不在就没光」）。

   **2026-10-09：这三处都改成 steps(4, end)，为了「跟手」。**
   用户报「滑动界面和地图都很卡、不跟手、有延迟」，量出来（.scratch/perf.mjs，无头 Edge，
   窗口 1440×900，每场量两秒的主线程任务时间）：
     面板开着什么都不动   原样 750–810ms（其中 Paint 218ms ＋ Layerize 327ms，每帧都在重画这张 5576 个形状的地图）
                        ↓ steps 之后 85ms
     滚两秒见闻录         原样 7.5 秒的活（Layerize 2048ms / 318 帧）
                        ↓ steps 之后 677ms
   三处动作都还在，只是**不再每帧改值**（每秒改几次）。查出来的三件事，都写在这儿免得下次再试一遍：
     ① 贵的是「每帧改值」，不是「动得多快」：动画时长放慢十倍（26s）量出来 99%，一点没省。
     ② 提层救不了：SVG 里的 transform / r 在 Chromium 里交给不了合成器——
        will-change: transform 与 will-change: opacity 各种挂法都在 89%–106%，白搭。
     ③ **关键是灯那一处**：只把 bob 与 ring 改成 steps、灯留着光滑，滚动照样 8.3 秒（111%）；
        灯一跳，滚动立刻回到 9%。门框上那枚惊叹号（.gf-door-badge）不用跳——它不在那张 SVG 里，
        量出来留着光滑不影响滚动，所以它还是老老实实脉动。

   **2026-10-10：改回光滑了。** 用户 m23060 报「角色标记上下动态，但掉帧太严重了，感觉是一卡一卡的」
   ——那一卡一卡就是 steps(4, end)：2.6 秒里只改四次值，约每 650ms 跳一格。
   根子是第 ② 条那句「提层救不了」，它只在**同一张 SVG 内部**成立。把灯、记号、地名签
   搬进**自己的一张 SVG**（.gf-overlay-svg，见 buildStage）之后，这一层有了自己的合成层，
   每帧改值只重画那一层。实测（同样两秒空闲，任务时间 / Paint / Layerize）：
     光滑、层还在地图里   1909ms / 1223 / 472      ← 这就是当年被逼成 steps 的那个数
     跳、层还在地图里      282ms /   81 /  41
     跳、搬到自己的层       74ms /   11 /  29
     光滑、搬到自己的层    587ms /  135 / 260
   所以：搬家是必须的（否则 1909ms），搬完再改回光滑要付约 500ms 两秒的代价——
   比原来光滑的 1909ms 省下三分之二，而用户要的是「连贯不掉帧」，这一档是它换来的。
   仍然守着的一条：**拖动地图时把这三处按停**（见下面 .gf-zooming 那三条）——
   拖动那两秒本来就是最忙的，不能让它再叠上去。 */
/* **2026-10-31（t29）：这三处搬出了 SVG，住进 HTML 那一层。**
   上面那些年份写的是「同一条路越走越窄」的过程：搬进自己的 SVG 只省掉「重画整张
   地图」，每帧改值照样要把那一层重新光栅一遍（8 秒空闲实测 1551ms，其中 Paint 405
   ＋ Layerize 821）。根子在于 SVG 里的 transform / r / opacity **Chromium 一律交给
   不了合成器**（A/B：will-change 各种挂法 89%–106%、纯 opacity 版光环 102%）——
   也就是说，只要它还坐在 SVG 里，就只能靠「少改几次」换 CPU。
   现在改成 HTML 元素：transform 与 opacity 都归合成器，主线程一个字节都不用重画。
   三处各自的成本（8 秒空闲，关掉一处看省多少）：光环 ≈ 990ms、记号 ≈ 450ms、
   灯 ≈ 56ms——搬完之后 8 秒只剩约 90ms。

   尺寸单位仍是**世界单位**：外层「.gf-live」用「transform: scale(每单位多少 px)」
   把子元素那些 px 解释成世界单位（见 placeLive）。这样下面这些数字跟当年 SVG 里
   写的那些是一个东西，改的时候不用换算。 */
.gf-live {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
  pointer-events: none;
}
.gf-live-pin,
.gf-live-lamp {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
}

@keyframes gf-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1.2px); }
}
.gf-pin-bob {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  animation: gf-bob 2.6s ease-in-out infinite;
}

/* 一圈往外扩的光环，让记号在 360px 宽的地图上第一眼就能找到。
   从前动的是 SVG 的「r」（半径）——最贵的那一种，每帧都要重画；现在是一个 div 的
   「scale」，合成器自己会放大，主线程零成本。描边不再像原来那样保持 0.4 不变，而是
   跟着一起放大（合成器是把那一圈光栅好再放大，这是它便宜的原因），看着更像水波。 */
@keyframes gf-ping {
  0% { transform: scale(1); opacity: 0.75; }
  70%, 100% { transform: scale(2.9); opacity: 0; }
}
.gf-pin-ring {
  position: absolute;
  left: 0;
  top: 0;
  box-sizing: border-box;
  width: 2.2px;
  height: 2.2px;
  margin: -3.5px 0 0 -1.1px;
  border: 0.4px solid var(--gf-seal);
  border-radius: 50%;
  animation: gf-ping 2.6s ease-out infinite;
}
/* 记号那枚图钉本身（不动的部分）：一张小小的内联 SVG，铺进 HTML 之后就不再改动，
   光栅一次，之后全靠合成器搬。viewBox 用的还是当年的世界单位。

   **选择器必须带 .gf-stage**：上面有一条 .gf-stage svg（display:block; width:100%;
   height:auto，特异度 0,1,1），只写 .gf-pin-glyph（0,1,0）会被它压掉——
   width 100% 落在一个 0×0 的父层上就是 0，整枚图钉被算成 0×0、一个像素都不画。
   2026-10-31 用户看到「他的标记变成纯原色圆」就是这件事：图钉没了，只剩那圈涟漪。 */
.gf-stage svg.gf-pin-glyph {
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 5px;
  margin: -4.4px 0 0 -2px;
  overflow: visible;
}

/* 他那儿的灯会晃。晃动幅度很小，小到说不清是不是看错了。 */
@keyframes gf-flicker {
  0%, 100% { opacity: 1; }
  42% { opacity: 0.86; }
  63% { opacity: 0.95; }
}
.gf-lamp-flicker {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  animation: gf-flicker 5.4s ease-in-out infinite;
}
.gf-lamp-glow-1 {
  position: absolute;
  left: 0;
  top: 0;
  width: 8px;
  height: 4.8px;
  margin: -2.4px 0 0 -4px;
  border-radius: 50%;
  background: var(--gf-lamp);
  opacity: calc(var(--gf-glow) * 0.10);
}
.gf-lamp-glow-2 {
  position: absolute;
  left: 0;
  top: 0;
  width: 4.6px;
  height: 2.8px;
  margin: -1.4px 0 0 -2.3px;
  border-radius: 50%;
  background: var(--gf-lamp);
  opacity: calc(var(--gf-glow) * 0.16);
}
.gf-lamp-glow-3 {
  position: absolute;
  left: 0;
  top: 0;
  width: 2.3px;
  height: 1.44px;
  margin: -0.72px 0 0 -1.15px;
  border-radius: 50%;
  background: var(--gf-lamp);
  opacity: calc(var(--gf-glow) * 0.32);
}

/* 正在滚见闻录的时候，把上面那三处动画按停（类由滚动处理器挂上、停下 180ms 后摘掉，
   见 「timeline.addEventListener('scroll', …)」那一处）。

   为什么不是「让动画更快/更慢」而是「按停」：这三处都在那张 5817 个形状的地图里，
   只要它们还在改值，浏览器就得每帧把那张地图重新画一遍——滚的明明是下面那半页字。
   滚的时候地图本来就在视野上方一动不动，停掉它谁也看不出来；手一停就接着走。
   （「animation-play-state: paused」会保住当前那一格的值，所以不会「跳一下」。） */
.gf-room.gf-scrolling .gf-stage .gf-pin-bob,
.gf-room.gf-scrolling .gf-stage .gf-pin-ring,
.gf-room.gf-scrolling .gf-stage .gf-lamp-flicker { animation-play-state: paused; }

/* 按住拖地图的时候也按停（类由 zoomDown / zoomUp 挂在那张记号 SVG 上、摘掉）。
   拖动那两秒本来就在满负荷重画世界图那一层，不能再让记号那三个动画叠上去。
   这里只是按停、不改成 steps：手一松就接着光滑地走。
   2026-10-31（t29）：记号那三处搬进 HTML 层之后，它们不再住在「.gf-overlay-svg」里，
   所以那个类现在同时挂在「.gf-live」上（见 zoomDown / zoomUp），两条都留着。 */
.gf-overlay-svg.gf-zooming .gf-pin-bob,
.gf-overlay-svg.gf-zooming .gf-pin-ring,
.gf-overlay-svg.gf-zooming .gf-lamp-flicker,
.gf-live.gf-zooming .gf-pin-bob,
.gf-live.gf-zooming .gf-pin-ring,
.gf-live.gf-zooming .gf-lamp-flicker { animation-play-state: paused; }

/* 傍晚之后整张地图往夜色里退——靠给每种材料掺夜色的方式做，
   不糊一层蒙版（蒙版会把陆地外面那块地方也染黑，看着像个灰方块）。 */

/* 地图下面第一块：一行说完「此刻 · 几点 · 他在哪儿」。
   2026-10-03 的写法是「时间 / 位置」两个标签各带一行值；2026-10-08 用户说整块界面
   「不够直观、简洁」——标签是多余的（值本身就是答案），而且「位置」跟地图上那枚
   记号旁边的地名说了一遍又一遍。现在只剩一个金色的「此刻」当锚点。 */
.gf-now {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 8px;
  /* 左边 22px 跟地图、跟见闻录的字对死（原来是 20px，比它们左出去 2px）；
     右边那块空档同 .gf-stage。 */
  padding: 9px calc(22px + var(--gf-sb, 0px)) 0 22px;
}
.gf-k {
  font-size: var(--gf-k-size, 11px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  color: var(--gf-k-fg, var(--gf-fg-dim));
  opacity: 0.85;
}
/* 「此刻」这一个是锚点：不跟着上面那条 0.85 的透明度淡下去，前面还带一枚小圆点，
   让它在整块板子上第一眼就被看见（整块界面里只有它是活的）。 */
.gf-k-now { opacity: 1; }
.gf-k-now::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: 1.5px;
  opacity: 0.9;
}
.gf-v {
  font-family: var(--gf-num-font, inherit);
  font-size: 12px;
  letter-spacing: var(--gf-v-ls, 0.02em);
  color: var(--gf-fg-dim);
}
/* 地名是汉字，不走等宽那套：等宽里的汉字是被拉开的，念得出五个字却要占七个字的地方。 */
.gf-v-place {
  font-family: var(--gf-story-font, inherit);
  font-size: 13px;
  letter-spacing: 0;
  color: var(--gf-fg);
}
.gf-sep { color: var(--gf-fg-dim); opacity: 0.55; }

/* 故事风格：这个世界用哪一套说法讲。
   2026-10-05 用户先点了「入口放门后那扇窗里」，同一轮又把它从「谁在讲」改名成
   **故事风格**，并摘掉了第二套说法「案牍」——「我们只需要一个作为默认即可了」。
   它挤在「此刻」那一行的右端：那一行本来右边就是空的，所以一行都没多占。
   2026-10-06 用户第 1 条把它改成**一个名字 + 一张清单**：「故事风格并不是并行点击切换，
   而是只有一个冒险，然后点击冒险，会弹出来一个小界面，小界面往下就可以选择其他故事风格。」
   ——所以这里只有一个按钮（写着当前那一套的名字），点它才弹出下面那张清单（.gf-styles），
   清单里**只列其他几套**（用户 m05151 第 1 条：「只列其他几套」）。
   **只有一套说法的时候仍是一个不可点的名字**（没得选的就不摆假开关）。
   注：这一段里不许出现反引号——整块 CSS 是一个模板字符串，一个反引号就把字符串断开了。 */
.gf-voice {
  margin-left: auto;
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
  /* 清单是绝对定位挂在这一格下面的，锚在它身上 */
  position: relative;
}
/* hidden 属性本来该管这事，但 .gf-voice 上的 display 会把它盖过去（同 .gf-room）。 */
.gf-voice[hidden] { display: none; }
.gf-voice-k {
  font-size: var(--gf-k-size, 11px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  color: var(--gf-fg-dim);
  /* 界面审计 U7：从前这里是 0.55，11px 的字再打对折只剩 2.96:1（classics 2.28:1）——
     小字本来就细，半透明是奢侈。0.85 之后仍是「次要文字」的调子，但读得清。 */
  opacity: 0.85;
}
/* 当前那一套的名字：它就是那个开关。用正文的颜色写着——不描金、不加框，
   只在底下压一条**很淡的虚线**：旧书里夹了折角、表示「这儿能翻」的那个意思。
   鼠标移上去虚线变实、字微微提亮。（2026-10-06 傍晚用户说单看一个「船家」太单调、
   看不出能点，于是加了这条记号。） */
.gf-voice-b {
  font: inherit;
  font-size: var(--gf-k-size, 11px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  padding: 0 0 2px;
  border: 0;
  border-bottom: 1px dashed var(--gf-line);
  background: none;
  color: var(--gf-fg);
  cursor: pointer;
}
.gf-voice-b[hidden] { display: none; }
.gf-voice-b:hover { opacity: 0.85; border-bottom-style: solid; border-bottom-color: var(--gf-fg-dim); }
.gf-voice-b:focus-visible { outline: 2px solid var(--gf-fg-dim); outline-offset: 2px; border-radius: 3px; }
/* 只有一套说法时那个不可点的名字：跟那个开关一个颜色，读起来就是「现在是这样」。 */
.gf-voice-name {
  font-size: var(--gf-k-size, 11px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  color: var(--gf-fg);
}
/* 清单：从名字下面垂下来的一小片纸，右边跟名字对齐（它在面板最右端）。
   竖着列其余几套，一行一个；点一下就换，换完自己收起来。 */
.gf-styles {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 3;
  margin-top: 7px;
  /* 宽度按内容算：不加这一句，这片纸会被**装它的那一格**（名字那一小格）卡住，
     名字底下那句「它的核」就折成一列竖排的字。 */
  width: max-content;
  min-width: 84px;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--gf-line);
  border-radius: 3px;
  background-color: var(--gf-bg);
  background-image: var(--gf-grain, none);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.gf-styles[hidden] { display: none; }
/* 清单顶上那行小字：说明这一列是什么（2026-10-06 傍晚挑的措辞，当天最晚按用户
   第 1 条从「换一种讲法」改成「换一种风格」——说的是点下去会发生的事：
   换的是风格，不是地图、不是主题）。
   只有一项时它尤其要紧——不然那一项读起来像一个孤零零的标签。 */
.gf-styles-head {
  font-size: calc(var(--gf-k-size, 11px) - 1px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  color: var(--gf-fg-dim);
  /* 界面审计 U7：10px + 0.7 只有 3.94:1；0.85 抬到 AA 线以上。 */
  opacity: 0.85;
  white-space: nowrap;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--gf-line);
}
/* 一列条目，不是一个浮着的标签：左对齐，每项前面一个小记号。 */
.gf-style-item {
  font: inherit;
  font-size: var(--gf-k-size, 11px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  color: var(--gf-fg-dim);
  opacity: 0.8;
  cursor: pointer;
  white-space: nowrap;
}
.gf-style-item::before { content: '·'; margin-right: 6px; opacity: 0.7; }
.gf-style-item:hover { color: var(--gf-fg); opacity: 1; }
/* 没解锁的照样列出来（看得见才谈得上想不想要），只是点不动。 */
.gf-style-item[aria-disabled='true'] { opacity: 0.4; cursor: default; }
.gf-style-item:focus-visible { outline: 2px solid var(--gf-fg-dim); outline-offset: 2px; border-radius: 3px; }

/* 预留的那几套（soon）：名字看着比能换的淡一点——点它不换说法，是**摊开它那一句**
   （2026-10-06 深夜用户：「为这三套写一个面板上的话，去找参考来写其核心」，随后又说
   「我希望点击了再显示描述，而不是全体展示在这里，有点密集了就」；句子住在
   src/packs/reserved.js 各自的 tagline 里）。摊开的那一个读满色，看得出点中了谁。
   点得动的那几项**不摆这一块**：它们悬停时浮出自己那一句，清单里不必再占地方。
   注：这一段里不许出现反引号——整块 CSS 是一个模板字符串，一个反引号就把字符串断开了。 */
/* 预留的那几套（soon）：名字比能换的淡一点，但**不是禁用**的样子（界面审计 U13：
   从前 .62 的不透明度跟 [aria-disabled] 的 .4 只差一点，看着像点不动，可它偏偏点得动
   ——点开是摊出那一句「它的核」）。现在两件事分开说：淡归淡，前面那个小记号和右端
   的箭头明说「这一行能展开」。 */
.gf-style-cell { display: flex; flex-direction: column; gap: 3px; }
.gf-style-item.gf-style-soon { opacity: 0.72; }
/* 可展开的记号：合着是 ▸，摊开是 ▾（跟展开状态同一个属性，不用再加状态） */
.gf-style-item.gf-style-soon::after { content: '▸'; margin-left: 6px; opacity: 0.75; }
.gf-style-item.gf-style-soon[aria-expanded='true']::after { content: '▾'; }
.gf-style-item.gf-style-soon[aria-expanded='true'] { opacity: 1; color: var(--gf-fg); }
/* 点一下才摊开的那一块（默认收着）。里面就是它那一句「它的核」。 */
.gf-style-note {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 名字前面那个小记号连同它的外边距一共这么宽——这一块要跟名字的字对齐，不是跟记号对齐。 */
  padding-left: calc(1em + 6px);
  max-width: 15em;
}
.gf-style-note[hidden] { display: none; }
.gf-style-core {
  font-size: calc(var(--gf-k-size, 11px) - 1px);
  letter-spacing: var(--gf-k-ls, 0.08em);
  color: var(--gf-fg-dim);
  opacity: 0.62;
  line-height: 1.5;
}

/* 故事包那一格书架（.gf-shelf / .gf-shelf-b / .gf-shelf-c / .gf-shelf-n）2026-10-06 撤掉了。
   它原本紧挨着地图，挑的是**整个世界**（地图、地名、主题、句子一起换）。用户第 1 条：
   「故事包位置错误，切换的方式只能放在故事风格后面，也就是现在点击『冒险』这个地方进行
   切换」；第 2 条又要求切换只换叙事、别的都不动。于是换说法的入口只剩「此刻」那一行
   右端那一条（见 .gf-voice-b），书架连 DOM 一起删了——**不是藏起来**。
   注：这一段里不许出现反引号——整块 CSS 是一个模板字符串，一个反引号就把字符串断开了。 */

/* 那句话是一个字一个字浮出来的——这是他唯一会做的「动作」。
   字本身立刻就在，只是先透明、再上浮，所以关掉动画也不会丢字。
   2026-10-05：这句话原来单独占地图下面的一整行（.gf-caption）。
   用户说「他现在的行为被单独显示在上面了，我觉得不需要这个显示，
   就放在他的冒险下面，和你的工作的时间对齐」——于是它搬进了见闻录最新
   那一行的右栏，字还是一个个浮出来，只是位置换到了本来就该在的地方。 */
@keyframes gf-type {
  from { opacity: 0; transform: translateY(2px); }
}
.gf-type {
  display: inline-block;
  animation: gf-type 260ms ease-out both;
}

/* 帮手那一行（「有四个帮手还在外面」）**属于活计那一层**，所以它穿的是 .gf-remark 那套样式，
   这里只剩一个钩子类：量尺寸（「help 帮手那一行」）和自检都靠它认人，样式一个字都不给。
   2026-10-07 用户看图说「格式不一致」——同样挂在活计句下面的位置，生活层缩进挂竖线、帮手这行
   却是一行没头没尾的淡字，看起来像第三层。它本来就不是第三层（红线 13：蓝框只有生活），
   现在跟活计句同一个字号、同一个透明度、同样不缩进，两层各归各位。 */
/* 生活层：比那句话轻一档，颜色也淡——它是一句补白，不该跟他的冒险抢。
   2026-10-07 用户要「两层更有区别」：不只是一小一大，还缩进一格、左边挂一条淡竖线，
   一眼看得出它是挂在活计旁边的一句旁白，而不是又一段冒险。（这条线用 ::before 也行，
   但 border 不占文本，右栏那句 textContent 断言照样干净。） */
.gf-life {
  margin-top: 5px;
  padding-left: 9px;
  border-left: var(--gf-life-line, 2px solid var(--gf-line));
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-life-size, 11px);
  line-height: var(--gf-life-lh, 1.55);
  color: var(--gf-fg-dim);
  opacity: var(--gf-life-opacity, 0.85);
}
.gf-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.gf-tag {
  padding: var(--gf-tag-pad, 3px 9px);
  border: 1px solid var(--gf-tag-line, transparent);
  border-radius: var(--gf-tag-radius);
  background: var(--gf-tag-bg);
  color: var(--gf-tag-fg);
  font-size: var(--gf-tag-size, 11px);
  letter-spacing: var(--gf-tag-ls, normal);
  line-height: 1.4;
}
[data-theme='classics'] .gf-tag {
  border-radius: 2px;
  border-color: var(--gf-seal);
  font-family: var(--gf-title-font);
}
/* 上面这一条**故意没有 color**（界面审计 U2）：从前这里有「color: var(--gf-seal)」，
   朱红朱红——可签底是深棕，朱红压上去只有 1.97:1，整排标签成了暗红幽灵，
   而 classics 自己定义的「--gf-tag-fg: #D9A79C」反倒成了死 token。
   朱红细框 + 宋体是「印章」的味道，留着；**字色回落到 .gf-tag 的 --gf-tag-fg**。 */
/* 左栏那几枚（改文件 ×12 / 跑命令 ×9）和右边他冒险里的那几枚**是同一套签**：
   同样的内距、边框、圆角、字号、间距——两栏的行盒因此一样高、横着能对上。
   用户 2026-10-08 第 3 条：「在左右的标签和字体上，完全不一致，左边翻文件、改文件、
   跑文件不是应该也是右侧入抄咒文、查旧册、装符石一样的标签吗？」
   上午那次「去按钮化」把左栏的框和内距整个收掉了，于是左边那一栏更重、两栏也对不齐
   （同一天第 1 条：「这样排列就无法对齐两边了，会导致左边更重一些」）。
   现在**只把颜色压淡一点**，形状照旧：凭什么不能点由颜色回答，不由缺框回答。
   数字（×12）仍然只出现在左栏，这是硬规矩；古籍图书馆那套里它们还是朱红方印。 */
.gf-root:not([data-theme='classics']) .gf-you .gf-tag {
  color: var(--gf-fg-dim);
  border-color: var(--gf-tag-line-dim, rgba(214, 178, 112, 0.22));
  background: var(--gf-tag-bg-dim, rgba(214, 178, 112, 0.06));
}
.gf-meta { font-size: 11px; color: var(--gf-fg-dim); letter-spacing: 0.04em; }
/* 动过手的那几个文件名：左栏里唯一「具体」的东西，所以给它一点点颜色。
   2026-10-03 用户：「用户这边的内容加上英文在视角上就变成很厚重，左边右边不一样。」
   所以这里最多两个名字、去掉扩展名、中文名排在前面，全名单挂在 title 上。 */
.gf-files {
  font-family: var(--gf-files-font, inherit);
  font-size: var(--gf-files-size, 11.5px);
  line-height: 1.55;
  color: var(--gf-files-fg, var(--gf-tag-fg));
  opacity: 0.9;
  /* 界面审计 U12：从前是 nowrap + 省略号，一个 40 字的长英文名在 246px 里只露出前
     12 个字（title 属性里有全名，但不悬停就看不见）。改成最多两行、超了才收，
     行高仍是 1.55——look.mjs 那条「两栏 7 行不被挤断」靠的就是这个行高。 */
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.gf-remark {
  font-family: var(--gf-story-font, inherit);
  /* 一句话是这个面板真正的内容：它得比抬头（12px）和标签（11px）明显大一号，
     否则整块板子看上去是一片一样大的字（2026-10-08 用户：「不够直观」）。 */
  font-size: 13.5px;
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-remark-opacity, 0.92);
}
/* 「此刻」那一行——他此刻正在做的事就写在见闻录最新那一行的右栏里（不再单独占一行），
   所以这一行不换字号、不换色，只是它身上挂着逐字浮现的动画。 */
.gf-remark.gf-nowish { opacity: 1; }

/* 世界句：外头发生的事（见 worldLine）。
   它穿的是活计那一层的衣裳（同一套字号台阶、同样不缩进），只是小半号、暗一点——
   读起来是「他那边」的第二句，而不是另起一层（生活层那种缩进加竖线才是另一层）。 */
.gf-world {
  margin-top: 2px;
  font-size: var(--gf-world-size, 12.5px);
  opacity: var(--gf-world-opacity, 0.86);
}

/* 痕迹那一句回声（见 MARKS 与 markLine）：这一天挑过的那条路，今天后面每一格都跟着。
   它跟世界句穿同一件衣裳（同一台阶、同样不缩进），只再暗一档——那是背景里的余音，
   不是又一件事。一行最多一处，过了午夜就没了（2026-10-09 加，用户 m01903 第 3 条）。 */
.gf-mark-line {
  margin-top: 2px;
  font-size: var(--gf-world-size, 12.5px);
  opacity: var(--gf-mark-opacity, 0.74);
}

/* 高光事件（见 src/packs/adventure/moments.js）：有些日子多出来的那几行。
   它**接着他手上那句话往下说**，所以跟主句同一个字号台阶、不缩进、不加竖线——
   那是生活层的长相，事件不是旁白。行与行之间只留一点点空，读起来是一口气讲完的一段。
   2026-10-08 加（用户 m06647 第 2 条：要有标志性的故事、高光时刻）。 */
.gf-moment {
  margin-top: 5px;
}
.gf-moment-line {
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-moment-size, 13px);
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-moment-opacity, 0.94);
}
.gf-moment-line + .gf-moment-line {
  margin-top: 2px;
}
/* 收束那一句是事后的一句，比经过轻一点——不是又一段经过。 */
.gf-moment-close {
  opacity: var(--gf-moment-close-opacity, 0.86);
}

/* 岔口（见 choiceOf）：这件事走到一半他走的那条路。
   穿事件那一层的衣裳（同一台阶、不缩进）——那一天他就是这么走的。
   2026-10-08 加（用户 m08146「全做。」第 ④ 件「选择点」）。 */
.gf-choice-line {
  opacity: var(--gf-choice-opacity, 0.92);
}

/* 这一段叙事里有个岔口——**得看得出来**。2026-10-08 晚用户 m11003 第 1 条：
   「有交互的一段叙事里，要有新的区别方式，让用户在翻阅刚才的时候，知道自己错过了一个选项」。
   整块往左挪一格、左边压一道金线：翻回去的时候一眼认得出哪一段是要挑的。 */
.gf-moment-fork {
  border-left: 1px solid var(--gf-fork-rule, rgba(214, 178, 112, 0.34));
  padding-left: 9px;
  margin-left: -10px;
}

/* 点门上那枚惊叹号跳过来的时候，那一行短暂亮一下——记号得**有作用**（用户 m11602 第 1 条）。
   只亮一下，一个字都不改；关掉动画（prefers-reduced-motion）时 JS 直接不亮（见 jumpToOpenFork）。 */
.gf-fork-flash { animation: gf-fork-flash 1.4s ease-out; }
@keyframes gf-fork-flash {
  0% { background: var(--gf-fork-flash-bg, rgba(224, 185, 110, 0.16)); }
  100% { background: transparent; }
}

/* 已落定的岔口：把**原来那两枚选项**再摆一次——走的那条亮着、没走的那条压暗。
   2026-10-08 更晚用户 m11863 第 2 条：「不写『你没挑，他自己走了一条』而显示两条原来的选项，
   然后一条显亮、一条显暗，表示用户进行了选择或者用户没选，而他进行了选择，那么就是
   『他选择了 XX』。」——原来那行记号（实心「你挑的」／空心「你没挑…」）整个删掉了。
   亮暗说明走的是哪条；**他自己走的那一档**另起一行写「他选择了 XX」（见 .gf-choice-said）。
   两样都只在**面板记得住**的时候写（预览页与自检里没给 storage 的那一档不摆、也不说：
   屏幕上从来没有选项可挑，摆出来就是替他认一件没发生过的事）。 */
.gf-choice-done {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 7px;
}
.gf-choice-road {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  font-size: var(--gf-moment-size, 13px);
  line-height: 1.45;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: var(--gf-radius, 4px);
}
.gf-choice-road::before {
  content: '◇';
  font-size: 9px;
  color: var(--gf-fg-dim);
  opacity: 0.9;
}
/* 走的那条：亮——金框、实心菱、字照旧 */
.gf-choice-road.gf-choice-took {
  color: var(--gf-fg);
  background: var(--gf-pick-bg, rgba(214, 178, 112, 0.06));
  border-color: var(--gf-pick-line, rgba(214, 178, 112, 0.45));
}
.gf-choice-road.gf-choice-took::before {
  content: '◆';
  color: var(--gf-door-knob, #E0B96E);
}
/* 没走的那条：暗 */
.gf-choice-road.gf-choice-left {
  color: var(--gf-fg-dim);
  opacity: 0.38;
}
/* 他自己走的那一档：说清这一条不是你挑的 */
.gf-choice-said {
  margin-top: 2px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--gf-fg-dim);
  opacity: 0.85;
}

/* 岔口还没挑过的时候：**选项**。2026-10-08 晚用户 m10670 第 2 条「我要的交互选项在哪？」，
   当晚他又报（m11003 第 1 条）：「目前你给的这两个…不像一个交互的选项，而是一个标签，
   所以需要换一个显示效果」。所以它不再跟左栏那几枚签同一套：一枚一枚竖着排开、整行宽、
   左边一枚空心菱、悬停时底色亮起来——这是一条能按下去的路，不是一枚标签。 */
.gf-choice {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 7px;
}
.gf-choice-head {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--gf-fg-dim);
  opacity: 0.8;
}
.gf-choice-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: var(--gf-moment-size, 13px);
  line-height: 1.45;
  padding: 5px 10px;
  color: var(--gf-fg);
  background: var(--gf-pick-bg, rgba(214, 178, 112, 0.06));
  border: 1px solid var(--gf-pick-line, rgba(214, 178, 112, 0.45));
  border-radius: var(--gf-radius, 4px);
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}
/* 代价那一句（2026-10-09，用户 m01903 第 2 条）：摆在选项里**挑之前就看得见**——
   「需要有对应的、具有份量的事件来供用户选择，而不是轻飘飘的，没有任何代价的」。
   它自己占一行（flex-basis 100%），字号小一档、压暗，跟招牌一样宽。 */
.gf-choice-cost {
  flex-basis: 100%;
  font-size: 11px;
  line-height: 1.6;
  opacity: 0.72;
}
.gf-choice-pick::before {
  content: '◇';
  font-size: 9px;
  /* 用户 m12444 第 3 条：原来是印色（红），换成一色金——跟门上那枚、跟「走的那条」同一个金。 */
  color: var(--gf-door-knob, #E0B96E);
  opacity: 0.9;
}
/* 停在哪儿（2026-10-10，用户 m14810 第 5 条）：没定下来的时候后面的行不往下写，
   这一句压在按钮下面，说明「不是你坏了，是在等你」。跟抬头同一档小字，压得更暗一点。 */
.gf-wait {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--gf-fg-dim);
  opacity: 0.62;
  margin-top: 2px;
}
.gf-choice-pick:hover {
  background: var(--gf-pick-bg-hover, rgba(214, 178, 112, 0.16));
  border-color: var(--gf-door-knob, #E0B96E);
}
.gf-choice-pick:focus-visible {
  outline: 2px solid var(--gf-fg-dim);
  outline-offset: 2px;
}

/* 现在这一会儿摆着的那一对选项（用户 m12444 第 1、3 条）：它长在**最新那一格**那一行上，
   不在折叠落盘的那一段小节里——那一格才是「此刻」。跟 .gf-moment-fork 同一道金线：
   翻回来的时候一眼认得出「这一会儿这里有得挑」。 */
.gf-choice-live {
  border-left: 1px solid var(--gf-fork-rule, rgba(214, 178, 112, 0.34));
  padding-left: 9px;
  margin-left: -10px;
}
/* 命运（2026-10-10，用户 m16528 第 1 条）：这一天的正文——两条路、他走的那条、落的那一种结果。
   跟高光事件同一台阶，只是自己占一段，抬头写一个「命运」。 */
.gf-fork {
  margin-top: 7px;
}
.gf-fork-head {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--gf-fg-dim);
  opacity: 0.8;
  margin-bottom: 4px;
}
/* 按钮上面那句眼前的话（用户 m16528 第 1 条：「都给一点点环境描述」）：
   跟正文同一档字号，压暗一点点——它是摆在那儿的景，不是他的话。 */
.gf-choice-look {
  font-size: var(--gf-moment-size, 13px);
  line-height: 1.5;
  opacity: 0.86;
  margin-bottom: 2px;
}
/* 每条路眼前那一句：压在招牌下面，字号小一档。**不是代价**——代价不可知
   （用户 m16528 第 2 条），这里只写他此刻看得见的那点东西。 */
.gf-choice-hint {
  flex-basis: 100%;
  font-size: 11px;
  line-height: 1.6;
  opacity: 0.72;
}
/* 死亡（用户 m16548）：右半边只剩这一块。不缩进、不换台阶——它就长在这一行里。 */
.gf-death {
  margin-top: 2px;
}
.gf-death-line {
  font-size: var(--gf-moment-size, 13px);
  line-height: 1.5;
}
.gf-death-mark {
  margin-top: 9px;
  font-size: 12px;
  letter-spacing: 0.34em;
  color: var(--gf-fg-dim);
  opacity: 0.9;
}
.gf-death-tail {
  margin-top: 3px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--gf-fg-dim);
  opacity: 0.62;
}
[data-theme='classics'] .gf-choice-pick {
  border-radius: 2px;
  font-family: var(--gf-title-font);
}

/* 交锋（见 clashOf）：挨打那一行往下补的两句——他怎么接住、这一场付出什么。
   穿高光事件那一层的衣裳（同一台阶、不缩进、不另起一层），因为读起来是同一段仗往下打；
   只是比事件略淡一档：它是那一行的延续，不是这一天的大事。
   2026-10-08 加（用户 m06647 第 2 条「战斗项的内容实在太少了」）。 */
.gf-clash {
  margin-top: 4px;
}
.gf-clash-line {
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-moment-size, 13px);
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-clash-opacity, 0.9);
}
.gf-clash-line + .gf-clash-line {
  margin-top: 2px;
}

/* 战斗（见 fightOf / fightsFor）：挨打那一行往下铺的一整场仗——遭遇、应对、交手、失算、收场。
   2026-10-10 加（用户 m14888「他必须有战斗」）：换掉了上面那道两拍的交锋（那两句留在包里
   不接线，备用）。穿高光事件那一层的衣裳（同一台阶、不缩进），前面挂一道**竖线**：
   它是插进来的**一场**，不是这一行往下续的一句，得看得出边界在哪儿。
   抬头那一行（gf-fight-head）比正文小一档、压暗——它是标签（对手·档位），不是句子。 */
.gf-fight {
  margin-top: 5px;
  padding-left: 9px;
  border-left: 2px solid var(--gf-fight-rule, var(--gf-line));
}
.gf-fight-head {
  font-family: var(--gf-title-font);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--gf-fg-dim);
  opacity: 0.72;
  margin-bottom: 3px;
}
.gf-fight-line {
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-moment-size, 13px);
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-fight-opacity, 0.92);
}
.gf-fight-line + .gf-fight-line {
  margin-top: 2px;
}
/* 日卷末尾那一句战报：这一天打了几场、身上添了什么。比正文再轻一档——它是账，不是叙述。 */
.gf-fight-report {
  font-size: 12px;
  opacity: var(--gf-fight-report-opacity, 0.78);
}

/* 一天的框（见 dayFrameOf）：**定场句**在那一天第一句上面，**收尾句**压在最下面。
   两处都穿活计那一层的衣裳（同一套字号台阶、不缩进、不加竖线），只是各轻一档：
   定场句略淡，收尾句更淡——它们是这一天的边，不是这一天的正文。
   2026-10-08 加（用户 m07599 第 2 条与 C1：一天要有头有尾）。 */
.gf-day-open {
  margin-bottom: 2px;
  opacity: var(--gf-day-open-opacity, 0.82);
}
.gf-day-close {
  margin-top: 3px;
  opacity: var(--gf-day-close-opacity, 0.8);
}

/* 方向（见 DIRECTIONS）：这一天朝哪边走，写在定场句下面、主句上面。
   穿活计那一层的衣裳（同一个字号台阶、不缩进、不加竖线），跟定场句一样轻一档。
   只有日卷那一档有；五分钟的格不挂它。
   2026-10-08 加（用户 m07234 第 2 条「比例需要调整」）。 */
.gf-direction {
  margin-bottom: 2px;
  opacity: var(--gf-direction-opacity, 0.86);
}

/* 当日计划（见 JOURNEY / dayPlanOf / planLines）：**今天手上那几件事**与**这一季的路**。
   写在方向下面、主句上面——先说打算，再讲他手上那一件怎么走。穿活计那一层的衣裳
   （同一个字号台阶、不缩进、不加竖线），跟方向一样轻一档。只有日卷那一档有。
   2026-10-10 加（用户 m14781：「我们需要按照一个人的一天来写……他有怎样的规划」）。 */
.gf-plan {
  margin-bottom: 3px;
}
.gf-plan-line {
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-moment-size, 13px);
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-plan-opacity, 0.88);
}
.gf-plan-line + .gf-plan-line {
  margin-top: 2px;
}

/* 他今天身上少了什么（见 JOURNEY.losses 与 lossLine）：每描一处少一分。
   摆在收尾句**之前**——它是这一天的一部分（他做完这一处的代价），不是这一天的边。
   2026-10-10 加（用户 m14933 换的那根：「他有一个终极任务也是人生任务，一个终局」）。 */
.gf-loss {
  margin-top: 3px;
  opacity: var(--gf-loss-opacity, 0.8);
}

/* 序曲（见 ORIGIN）：故事的开头，**只挂在最老的那一行**上。
   它在那一天第一句**上面**，穿活计那一层的衣裳（同一个字号台阶、不缩进、不加竖线），
   底下压一条虚线：往上是开场那一段（他的名字只说这一次），往下才是那一天的事。
   2026-10-08 加（用户第 3 条：「他可以有名字，你取一个」）。 */
.gf-origin {
  padding-bottom: 7px;
  margin-bottom: 7px;
  border-bottom: 1px dashed var(--gf-line);
}
.gf-origin-line {
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-moment-size, 13px);
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-origin-opacity, 0.92);
}
.gf-origin-line + .gf-origin-line {
  margin-top: 2px;
}

/* 归宿（见 FATES 与 fatesFor）：这一年的收束，**只挂在年卷那一行的最下面**。
   穿活计那一层的衣裳（同一个字号台阶、不缩进、不加竖线），比日卷的收尾句实一档——
   它是一年的账，不是一天的边。上面压一条虚线，跟序曲那条呼应：一头一尾。
   末尾那一句（close）比前一句再轻一点：它是事后的一句，不是又一段账。
   2026-10-08 加（用户 m08146「全做。」第 ⑤ 件）。 */
.gf-fate {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--gf-line);
}
.gf-fate-line {
  font-family: var(--gf-story-font, inherit);
  font-size: var(--gf-moment-size, 13px);
  line-height: var(--gf-remark-lh, 1.6);
  opacity: var(--gf-fate-opacity, 0.88);
}
.gf-fate-line + .gf-fate-line {
  margin-top: 2px;
}
.gf-fate-close {
  opacity: var(--gf-fate-close-opacity, 0.78);
}

/* ---------- 空 ---------- */

.gf-empty {
  padding: 48px 10px;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--gf-fg-dim);
}

/* 开场那一下（2026-10-09，用户 m01903 第 1 条）：一台刚开机的机器上什么都没有，
   先给他一个「从哪儿开始」，点完按钮就没了；接着两条说明一直挂到**今天第一个五分钟格
   落盘**为止。这一段破了老红线「空的时候只说明状态，不邀请、不催促」，所以守三条：
   不计数、不红点、不响铃——他点过一次，当天就不再问。 */
.gf-start-box {
  margin-top: -20px;
  padding: 0 10px 44px;
  text-align: center;
}
/* 还没按过「开始冒险」的那一天（用户 m19218）：整条见闻录就这一颗，一格都不铺。
   给他一点上边距，别贴着顶。 */
.gf-list-before-start {
  padding-top: 56px;
}
.gf-start {
  padding: 7px 24px;
  font: inherit;
  font-size: 13px;
  letter-spacing: 0.16em;
  color: var(--gf-fg);
  background: var(--gf-pick-bg, rgba(214, 178, 112, 0.06));
  border: 1px solid var(--gf-pick-line, rgba(214, 178, 112, 0.45));
  border-radius: var(--gf-radius, 4px);
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}
.gf-start:hover {
  background: var(--gf-pick-bg-hover, rgba(214, 178, 112, 0.16));
  border-color: var(--gf-door-knob, #E0B96E);
}
.gf-start:focus-visible {
  outline: 2px solid var(--gf-fg-dim);
  outline-offset: 2px;
}
.gf-hint {
  max-width: 24em;
  margin: 0 auto;
  font-size: 11px;
  line-height: 1.85;
  letter-spacing: 0.06em;
  color: var(--gf-fg-dim);
  opacity: 0.8;
}
.gf-hint + .gf-hint {
  margin-top: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .gf-room, .gf-door, .gf-door-label, .gf-door-crack, .gf-always, .gf-choice-pick, .gf-door-badge, .gf-start { transition-duration: 1ms; }
  .gf-lamp-flicker, .gf-pin-bob, .gf-pin-ring, .gf-type, .gf-door-badge { animation: none; }
  /* U16 那条天色过渡在「减少动态」里也不该走 1.6 秒 */
  .mnight { transition-duration: 0s !important; }
}
`

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60 * 1000

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 本地日历上的加减天数。
 *
 * 不能用 `ts ± n * DAY`：那是「毫秒减法」，而本地一天在夏令时开关那两天只有
 * 23 或 25 小时。差的这一小时会让周卷标签（「这一周」/「上一周」）在换季那周偏一整天。
 * 插件是要装到别人机器上的，别人在不在夏令时区我们不知道，所以一律走本地日历。
 */
function addDays(ts, n) {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/**
 * 一条记录上的「一串东西」：`files`、`deliverables`、`helpers` 这些。
 *
 * 老记录、手写样本、别人塞进来的数据里，这个字段可能写成**字符串**而不是数组
 * （`files: "a.js"`）。直接 spread 会把它拆成一个个单字，屏幕上就出现
 * 「a · . 等 5 个」这种东西（报告 B-07）。这里收成一个诚实的小工具：
 * 是数组就用，是字符串就当只有一项，其余一律当没有。
 */
function listOf(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value !== '') return [value]
  return []
}

/** 那一周的周一零点 */
function startOfWeek(ts) {
  const d = new Date(startOfDay(ts))
  const dow = (d.getDay() + 6) % 7 // 周一 = 0
  return addDays(d.getTime(), -dow)
}

/** 那个月的月首零点。`back` 是往前推几个月（折叠阶梯用它定「最近十二个月」的界）。 */
function startOfMonth(ts, back = 0) {
  const d = new Date(startOfDay(ts))
  d.setDate(1)
  if (back) d.setMonth(d.getMonth() - back)
  return d.getTime()
}

/** 那一年的年首零点。 */
function startOfYear(ts) {
  const d = new Date(startOfDay(ts))
  d.setMonth(0, 1)
  return d.getTime()
}

function formatDate(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

function weekLabel(weekStart, now) {
  const thisWeek = startOfWeek(now)
  if (weekStart === thisWeek) return '这一周'
  if (weekStart === addDays(thisWeek, -7)) return '上一周'
  const d = new Date(weekStart)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日那周`
}

/** 卷首那半句：日卷照旧「昨天」，周/月/年卷说清自己有多粗（见 foldLadder）。 */
function rollLabel(unit, now = Date.now()) {
  const entry = unit?.entry || {}
  const ts = Number(entry.startedAt) || 0
  if (unit?.tier === 'week') return weekLabel(startOfWeek(ts), now)
  if (unit?.tier === 'month') {
    const d = new Date(ts)
    const nowYear = new Date(now).getFullYear()
    // 月卷最多只覆盖到十二个月前，所以年份只可能是今年或去年。
    if (d.getFullYear() === nowYear) return `${d.getMonth() + 1} 月`
    if (d.getFullYear() === nowYear - 1) return `去年 ${d.getMonth() + 1} 月`
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
  }
  if (unit?.tier === 'year') return `${new Date(ts).getFullYear()} 年`
  return dayText(ts, now)
}

/**
 * 周卷抬头写「那几天干了活」，不重复上面那条周标签。
 * 分组标签（`.gf-week-label`）本来就是 `weekLabel(weekStart)`——两周以前那一组的标签
 * 与周卷自己的 `rollLabel` 是同一句话（`9 月 21 日那周`），一行里说两遍。
 * 日卷/月卷/年卷没有这个问题（分组标签只在周这一层画），所以只改周卷这一档。
 */
function rollDays(unit) {
  const days = Array.isArray(unit?.entry?.days) ? unit.entry.days : []
  if (!days.length) return ''
  const earliest = days[days.length - 1]
  const latest = days[0]
  return earliest === latest ? formatDate(earliest) : `${formatDate(earliest)} – ${formatDate(latest)}`
}

function timeSlot(ts) {
  const h = new Date(ts).getHours()
  if (h < 5) return '凌晨'
  if (h < 11) return '早上'
  if (h < 18) return '下午'
  return '晚上'
}

/* 钟点：用户 2026-10-03 定的格式——「09:47」，24 小时、两位、不带时段词。
   时段词（凌晨/早上/下午/晚上）从这一版起只留给分类标签用，不再出现在界面上。 */
function clockText(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 见闻录行首那半句。用户 2026-10-03 定的：近两天说「今天 / 昨天」，
 * 更早才写月日——一眼能认出「这是刚发生的事」比写全年月日有用。
 *
 * 基准是**现在**，不是这一行的开始时间：昨天 23:50 开的那一段，
 * 今天看就该是「昨天」。
 */
function dayText(ts, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days === 2) return '前天'
  return formatDate(ts)
}

function durationText(minutes) {
  if (!minutes || minutes < 1) return '不到一分钟'
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

/* 见闻录里的时刻都落在整五分钟上。
   用户 2026-10-07 晚：「蓝框的时间是需要按 5 分钟计数并每 5 分钟落定一次的。」
   （他 2026-10-03 也说过「都是 5 的倍数在增加」——宿主落盘就是这么落的：
   src/index.js 的 PERSIST_INTERVAL_MS 先睡到下一个整五分，之后每次掐下一个整五分。）
   所以面板上写的时刻，正是他真正落定的那一刻：18:26 写成 18:25、17:03 写成 17:00。

   只有表头那个「时间」不在此列——那是此刻的真实钟点，要实时（同一条里的红框）。 */
const LAND_MS = 5 * 60 * 1000

function landedStamp(ts) {
  return Math.floor(ts / LAND_MS) * LAND_MS
}

/* 时长也按 5 分钟计：49 分钟写成 50 分钟。
   不到 5 分钟的短段保持原数——「一小会儿」不该被写成 5 分钟。 */
function landedMinutes(minutes) {
  const m = Math.round(Number(minutes) || 0)
  if (m < 5) return m
  return Math.round(m / 5) * 5
}

/**
 * 「此刻」那一行到现在一共坐了多久。
 *
 * 记录里那几分钟是宿主按「真正在动的时间」算的（见 src/index.js 的 activeMinutes），
 * 只算到**落盘那一刻**为止——宿主每五分钟才写一次盘。所以面板还得自己把
 * 「最后一个事件到现在」这几分钟加上去，否则你会看见「现在 17:00」配着一个
 * 停在 16:55 的时长，两个数互相打架。
 *
 * 只有这一行这么算：别的行的时刻是已经过去的事实，不会再变。
 */
function liveMinutes(entry, now = Date.now()) {
  const base = Number(entry?.minutes) || 0
  const ended = lastEnded(entry)
  if (!Number.isFinite(ended) || now <= ended) return base
  return base + Math.round((now - ended) / 60000)
}

/* ------------------------------------------------------------------ *
 * 「每 5 分钟落定一次」的那条刻度
 *
 * 用户 2026-10-08：「我要的是，每5分钟落定一次时间，即记录在案。」宿主落的
 * 是记录里的 `cells`（见 src/index.js 的 landedCells）：那一段里**有动作**的
 * 整五分钟格子。这里负责把它摊成一条完整的刻度——从起点那格到终点那格、一格
 * 不漏，在案的填实、空着的留一道影子。于是「中间那段时间去哪了」有了答案：
 * 它就在那儿，是空格；不是没记。
 *
 * 老记录没有这个字段（版本 5 及以前），于是没有刻度——不编。
 * ------------------------------------------------------------------ */

/** 记录里「在案的那几格」。 */
function landedCellsOf(entry) {
  const list = Array.isArray(entry?.cells) ? entry.cells : []
  return list.filter((t) => Number.isFinite(t))
}

/* 一段最长两小时（见 src/index.js 的 MAX_STRETCH_MS），所以最多二十五格左右。
   超过这个数说明数据不对劲，宁可不画，也不画一条读不出来的尺子。 */
const MAX_GRID_CELLS = 32

/** 这一段覆盖到的每一格整五分钟：起点那格 → 终点那格。 */
function landedGrid(entry) {
  // 老记录（版本 5 及以前）根本没有 `cells` 这个字段：那就**不画**。
  // 「一格都不在案」（空数组）是另一回事——那种要画成一排空格子。
  if (!Array.isArray(entry?.cells)) return []
  const from = landedStamp(entry?.startedAt)
  const to = landedStamp(lastEnded(entry))
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
  const cells = []
  for (let at = from; at <= to; at += LAND_MS) {
    cells.push(at)
    if (cells.length > MAX_GRID_CELLS) return []
  }
  return cells
}

/* ------------------------------------------------------------------ *
 * 一行 = 五分钟一格
 *
 * 用户 2026-10-08 第 2 条：「时间落盘是错误的，我要的是每5分钟落一次，不要折叠。
 * 也就是说，时间从上而下应该是 10:00，9:55,9:50,9:45,9:40……」
 *
 * 宿主从记录格式 7 起给出 `ticks`（那一格里的动作、文件名、撞墙次数，见 src/index.js
 * 的 ticksOf）：于是见闻录**一行就是一格整五分钟**，空格也占一行，只是矮、安静、
 * 不许编动作。老记录（版本 6 及以前）没有 `ticks`——退化成一张卡一行，也就是它原来的样子。
 * ------------------------------------------------------------------ */

/**
 * 同一格里几份明细相加。
 *
 * 见 `rowUnits` 里那段「同一时刻的格并成一行」：几个会话会在同一个整五分钟边界上
 * 各写一格，并起来读的时候，数、文件、动作、撞墙都要相加——**相加是事实**，
 * 相加出来的还是那一格里真实发生过的事，不是编的。
 */
function mergeTick(a, b) {
  const counts = { ...(a.counts || {}) }
  for (const [key, n] of Object.entries(b.counts || {})) counts[key] = (counts[key] || 0) + (Number(n) || 0)
  const files = [...(a.files || [])]
  for (const file of b.files || []) if (!files.includes(file)) files.push(file)
  const tags = [...(a.tags || [])]
  for (const tag of b.tags || []) if (!tags.includes(tag)) tags.push(tag)
  return {
    at: a.at,
    actions: (Number(a.actions) || 0) + (Number(b.actions) || 0),
    fails: (Number(a.fails) || 0) + (Number(b.fails) || 0),
    counts,
    files,
    tags,
  }
}

/**
 * 按下「开始冒险」之后，今天从**下一格整五分钟**起铺（8 → 9，用户 m04200 逐字：
 * 「不是，我刚刚点开，就已经存在2条冒险在里面了，这是不对的。当用户点开的时候，
 * 才会开始计算时间，并到下一个5分钟的时候才会落盘。」）。
 *
 * 起点落在 20:07 时，20:05–20:10 那一格里既有按下之前的几十秒、也有按下之后的活：
 * 半格不能算，可整格又还没到。所以第一格是**跨过下一个整五分钟**那一格（20:10）
 * ——他原话里「到下一个5分钟」说的就是这个边界。
 *
 * 三件事，缺一件那半格就会漏出来：
 *   · 在起点之前就结束的记录整条不铺（宿主的 `pruneStore` 已经把它们从盘上删了，
 *     这里再挡一次：预览页、自检、别人写的老存档都可能有）；
 *   · 还没走到那一格时，今天一格都不铺（先摆一行「上一格」到点再跳，比空着更像错）；
 *   · 第一格之前的格子（`startedAt`、`cells`、`ticks`）一律往上推到这一格。
 *     记录还是那条记录，只是「这一场从哪一格开始讲」由按下那一刻决定——
 *     那半格里的活不丢，落在他真正开始的那一格里。
 */
function clipToStart(entries, dayStart, now = Date.now()) {
  const at = Number(dayStart) || 0
  if (!at) return entries
  const first = Math.ceil(at / LAND_MS) * LAND_MS
  if (!(Number(now) >= first)) return []
  const out = []
  for (const entry of entries) {
    if (entry && entry.seam === true) {
      out.push(entry)
      continue
    }
    const ended = Number(lastEnded(entry)) || 0
    if (!(ended >= at)) continue
    const started = Number(entry?.startedAt) || 0
    if (started >= first && (ended >= first)) {
      out.push(entry)
      continue
    }
    const next = { ...entry, startedAt: Math.max(started, first), endedAt: Math.max(ended, first) }
    if (Array.isArray(entry?.ticks)) {
      const moved = []
      const kept = []
      for (const tick of entry.ticks) {
        const tickAt = Number(tick?.at)
        if (!Number.isFinite(tickAt)) continue
        if (tickAt >= first) kept.push(tick)
        else moved.push(tick)
      }
      if (moved.length) {
        let merged = { ...moved[0], at: first }
        for (const tick of moved.slice(1)) merged = mergeTick(merged, tick)
        kept.push(merged)
      }
      kept.sort((a, b) => Number(a.at) - Number(b.at))
      next.ticks = kept
      // `cells` 与 `ticks` 同源（宿主是同一把尺子造的），推到同一格上才不打架。
      next.cells = kept.map((tick) => Number(tick.at))
    } else if (Array.isArray(entry?.cells)) {
      next.cells = entry.cells.map((cell) => Math.max(Number(cell) || 0, first))
    }
    out.push(next)
  }
  return out
}

/**
 * 一行的清单，**从新到旧**。
 *
 * @returns `{ key, entry, at, tick, head }`
 *   `key`  这一行的身份：句子按它去查（见 composeSequence）
 *   `at`   这一行代表的时刻（整五分钟）
 *   `tick` 这一格里的东西；老记录是 null
 *   `head` 这一张卡里最新那一格——世界句、生活句、帮手这些整段才有的东西挂在它上面
 */
function rowUnits(entries, now = Date.now()) {
  const units = []
  for (const entry of entries) {
    const ticks = Array.isArray(entry?.ticks) ? entry.ticks.filter((t) => Number.isFinite(t?.at)) : []
    if (!ticks.length) {
      const started = landedStamp(Number(entry?.startedAt) || 0)
      const ended = landedStamp(lastEnded(entry))
      // 老记录没有 `ticks`：一张卡就是一行（见 rowFor 的 `grid`）。
      //
      // 跨午夜那张卡（昨晚 23:30 上手、今天 05:30 收工）**按收工那一天落行**：
      // 见闻录只讲今天之后（用户 2026-10-09），按开工时刻落行会让整张卡掉在今天零点以前，
      // 连人带事整段消失——可他今天早上确实在干这件事，那不算「过去的事」。
      const todayFrom = startOfDay(now)
      const intoToday = Number.isFinite(ended) && ended >= todayFrom && started < todayFrom
      units.push({
        key: String(entry?.id ?? ''),
        entry,
        at: intoToday ? ended : started,
        tick: null,
        grid: false,
        head: true,
      })
      continue
    }
    const byAt = new Map(ticks.map((tick) => [tick.at, tick]))
    // 一张卡覆盖的时段要连续铺满：起点那格 → 终点那格，每隔五分钟一格。
    // 卡片之间（中间停过四十五分钟以上，见 src/index.js 的 SPLIT_GAP_MS）照旧断开、
    // 不铺空格——那是两件事，不是一件事里空了几格。
    const from = landedStamp(entry?.startedAt)
    const to = landedStamp(lastEnded(entry))
    let tooLong = false
    const marks = []
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      for (let at = from; at <= to; at += LAND_MS) {
        if (marks.length >= MAX_GRID_CELLS) {
          tooLong = true
          break
        }
        marks.push(at)
      }
    }
    // 铺不满（跨度长得不像话）就只画**在案的那几格**：宁可不铺，也不编出一堆空格子。
    const list = marks.length && !tooLong ? marks : ticks.map((tick) => tick.at)
    const newest = list[list.length - 1]
    for (const at of list) {
      units.push({ key: `${entry.id}#${at}`, entry, at, tick: byAt.get(at) || null, grid: true, head: at === newest })
    }
  }
  // 同一时刻的格并成一行（用户 2026-10-06 第 3 条：「为什么会出现 2 个一样的时间」）。
  // 一行就是一格整五分钟，可**几个会话会在同一个整五分钟边界上各写一格**——本对话、
  // 地图那个对话、还有别的会话同时开着的时候，`at` 一样、内容各是各的，于是同一时刻
  // 冒出两三行。记录里没有重复（`.tmp-acp/dupe.mjs` 查过：相邻两条同一分钟的有 0 处），
  // 是**铺行**的时候按每条记录各铺一遍才重出来的。所以这里把 `at` 相同的格并起来：
  // 数、文件、动作、撞墙相加（见 mergeTick），卡片事实取**最新那一张**（`entry` 换过去，
  // `key` 也跟着换成它的——句子按 key 查，得跟读出来的那些数同一张卡）。
  // 老记录（`grid === false`，一张卡一行）照旧不并。
  const byCell = new Map()
  const laid = []
  for (const unit of units) {
    if (unit.grid !== true) {
      laid.push(unit)
      continue
    }
    const hit = byCell.get(unit.at)
    if (!hit) {
      const copy = { ...unit, tick: unit.tick ? { ...unit.tick } : null }
      byCell.set(unit.at, copy)
      laid.push(copy)
      continue
    }
    // 空白的格也并：一个会话在这五分钟里什么都没记（`tick === null`），另一个会话记了，
    // 那也是**同一格**——不并的话抬头会出现两条一样的时刻，一行有账一行空着，
    // 正是用户截图里那两条。空格并进来等于没并，只是这一行不再多出一条。
    if (unit.tick) hit.tick = hit.tick ? mergeTick(hit.tick, unit.tick) : { ...unit.tick }
    hit.head = hit.head || unit.head === true
    if (Number(unit.entry?.startedAt) >= Number(hit.entry?.startedAt)) {
      hit.entry = unit.entry
      hit.key = unit.key
    }
  }
  // 今天最近那半小时一格一格地讲，今天更早的那几段收成一卷；**再往前一概不讲**（见 foldLadder）。
  return foldLadder(laid, now)
}

/**
 * 折叠：今天最近半小时一格一格地讲，今天更早的那几段收成一卷；**再往前一概不讲**。
 *
 * 用户 2026-10-09（逐字）：「除了今天之外，全部去掉。每天都新鲜事，而不要保存过去的事。」
 * ——所以这一层现在只认「今天」这一天，昨天起的一切**不进见闻录**：不是折起来藏起来，
 * 是压根不出现。面板上从此只有今天，明天打开时今天是新的一天。
 *
 * 原来这里是一条四级折叠梯（缘起：用户 2026-10-05「会出现很多很多落盘……按日期来折叠」，
 * 第二天又补「收录的内容会越来越多，翻也翻不完」）。那条梯子是 `格 6 / 日卷 7 / 周卷 8 /
 * 月卷 12 / 年卷每年一行`，越往前越粗，行数上限跟历史长短无关。**2026-10-09 拆掉**：
 * 用户看过之后不要「过去」，只要今天。
 *
 * 拆掉的是**显示**，不是存档（用户 2026-10-05 选的「甲：只折显示」那条到现在还成立）：
 * `records.json` 里那些格子一个字没动，`rowUnits` 照旧从它铺出来，所以要把梯子装回来，
 * 只要把这个 `continue` 换回原来的三档判据（`.backup/2026-10-08-210603/` 里有一版能读）。
 *
 * 两条留下来的不变量：
 *   · **行数上限跟历史长短无关**——现在是「≤ 6 格 + 一卷日卷」，跟存档多久一点关系都没有。
 *   · **存档一个字不动**：将来要落盘折卷、要日卷周卷、要导出全书，都还在。
 *
 * 折叠放在这一层而不是渲染层，是因为 `narrationFor` 也走这条函数——
 * 「此刻」与见闻录必须是同一份行的清单，不然两边会各说各的。
 */
function foldLadder(units, now) {
  const kept = []
  const buckets = new Map()
  const today = startOfDay(now)
  const cellFloor = now - FOLD_CELL_MS
  const put = (tier, from, partial, unit) => {
    const key = `${tier}:${from}`
    if (!buckets.has(key)) buckets.set(key, { tier, from, partial, list: [] })
    buckets.get(key).list.push(unit)
  }
  for (const unit of units) {
    // 昨天起的一切都不讲（用户 2026-10-09）——这一行就是那条线。
    if (unit.at < today) continue
    // 今天：只把最近半小时铺成五分钟格，更早的今天也收成一卷。
    // 连着干一整天时今天是 288 格——不封住它，一天就能把见闻录撑到一百屏。
    if (unit.at >= cellFloor) kept.push(unit)
    else put('day', today, true, unit)
  }
  for (const bucket of buckets.values()) kept.push(rollUnit(bucket.tier, bucket.from, bucket.list, bucket.partial))
  return kept.sort((a, b) => b.at - a.at)
}

/** 今天铺成五分钟格的那一段（半小时 = 6 格；用户 2026-10-06 第 4 条：只铺最近 30 分钟）。 */
const FOLD_CELL_MS = 30 * 60 * 1000

/** 一卷里最多留几个文件名（跟宿主的 MAX_FILES 一个数，不是同一个常量——那份在 src/index.js）。 */
const MAX_ROLL_FILES = 5
/** 一卷里最多认几件交付物（够 `paid` 那一档认出「这一段交过活」就行）。 */
const MAX_ROLL_DEEDS = 3

/**
 * 一段那么多格子，收成一张卡：一段 = 一行。
 *
 * 收出来的是一个**记录形状**的东西，`unitOf` / `pickShards` / `dangerOf` / `worldLine`
 * 一行都不用改就能读它——读到的每一样都还是那一段真实发生过的：各动作的次数、动过的文件、
 * 撞过的墙、交付物，全是加起来的，不是编的。
 *
 * 三处要留神：
 *   · `minutes` 是**各张卡的 minutes 之和**，不是按格数算——`unitOf` 给每格的 minutes 大多是 0
 *     （免得每行都说「一小会儿」）。跨午夜那张卡按它落在这一档里的格数摊。
 *   · `endedAt` 用 `lastEnded(record)` 取，不能用「格 + 五分钟」——老记录没有 ticks，
 *     那一段真正的收工时间在卡上。
 *   · `startedAt` 取这一段**最早**的时刻：抬头写「昨天 08:55 – 22:45」，`dayText` 也读它。
 */
function rollUnit(tier, fromAt, list, partial = false) {
  const counts = {}
  const files = new Map()
  const tags = new Map()
  const deeds = new Set()
  const cards = new Map()
  const days = new Set()
  let actions = 0
  let fails = 0
  let from = Infinity
  let to = -Infinity
  let cwd = null
  let project = null
  for (const unit of list) {
    // 铺出来但没有明细的那一格（`tick === null` 而 `grid === true`）**什么都不算**：
    // 那五分钟里没有记过事。`unitOf` 对 `tick === null` 一律退回整张卡（那是给老记录的），
    // 拿它来加总会把同一张卡按格数重复算进去（实测「跑命令 ×42」）
    const record = unit.tick === null && unit.grid === true ? null : unitOf(unit)
    if (record) {
      for (const [act, n] of Object.entries(record.counts || {})) counts[act] = (counts[act] || 0) + (Number(n) || 0)
      actions += Number(record.actions) || 0
      fails += Number(record.fails) || 0
      for (const tag of listOf(record.tags)) tags.set(tag, (tags.get(tag) || 0) + 1)
      for (const file of listOf(record.files)) files.set(file, (files.get(file) || 0) + 1)
      for (const deed of listOf(record.deliverables)) deeds.add(deed)
      from = Math.min(from, Number(record.startedAt) || unit.at)
      to = Math.max(to, Number(lastEnded(record)) || unit.at)
    } else {
      from = Math.min(from, unit.at)
      to = Math.max(to, unit.at + LAND_MS)
    }
    if (!cwd && record?.cwd) cwd = record.cwd
    if (!project && record?.project) project = record.project
    if (unit.entry) cards.set(unit.entry, (cards.get(unit.entry) || 0) + 1)
    // 这一卷里有哪几天（悬停时列给他看，见 rollHint）——按格所在的那一天算。
    days.add(startOfDay(unit.at))
  }
  let minutes = 0
  for (const [card, here] of cards) {
    const all = Array.isArray(card?.ticks) && card.ticks.length ? card.ticks.length : here
    minutes += (Number(card?.minutes) || 0) * Math.min(1, here / all)
  }
  const rank = (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))
  const ranked = Object.entries(counts).sort(rank)
  const named = ranked.slice(0, 3).map(([act]) => act)
  // 前三个是主动作（左栏那几个词），剩下的补时间标签——世界句会看它们（「查资料」偏消息那一类）。
  for (const [tag] of [...tags.entries()].sort(rank)) if (!named.includes(tag)) named.push(tag)
  const entry = {
    id: `${tier}:${fromAt}`,
    startedAt: from === Infinity ? fromAt : from,
    endedAt: to === -Infinity ? fromAt : to,
    minutes: Math.round(minutes),
    tags: named.slice(0, 3),
    counts,
    actions,
    files: [...files.entries()].sort(rank).slice(0, MAX_ROLL_FILES).map(([file]) => file),
    fails,
    cwd,
    project,
    deliverables: [...deeds].slice(0, MAX_ROLL_DEEDS),
    helpers: [],
    // 这一行是「一段」不是一次坐下干活——渲染层据此挂 gf-row-roll（与 gf-row-<档>），
    // 也不再当它是「此刻」。`day` 留着：日卷那一档仍然叫这个名字。
    tier,
    partial,
    days: [...days].sort((a, b) => b - a),
    day: tier === 'day',
    roll: true,
  }
  // `at` 取这一段**最早**的那一刻，不取 `endedAt`：跨午夜的那张卡（起点在昨天 23:50、
  // 收工在今天 00:40）要是按收工时间排，就会排到「前天」那一卷前头去——一行代表的
  // 是它**从哪一刻开始**的那一段。
  //
  // `list` 是这一卷收进去的那些格（原样带着，见 `foldLadder` 的 `bucket.list`）。
  // 年卷那一档要用它**再算一遍**这一年的账（见 `fatesFor`）：那一卷底下只有主句，
  // 看不出这一年他走过哪些景、遇上事走的哪条路，得拿这些格按天重算。别处不用它。
  return { key: entry.id, entry, at: entry.startedAt, from: fromAt, tick: null, grid: false, head: true, roll: true, tier, partial, list }
}

/** 卷那一行悬停时浮出来的小字：这一卷里到底有哪几天（用户 2026-10-05 选的「悬停浮一行」）。 */
function rollHint(unit) {
  const entry = unit.entry || {}
  const days = Array.isArray(entry.days) ? entry.days : []
  if (unit.tier === 'day') {
    if (unit.partial) return `今天早些时候的那几格也收在这一卷里`
    return `这一卷是 ${formatDate(entry.startedAt)} 那一天`
  }
  const what = rollLabel(unit)
  if (!days.length) return what
  const names = days.slice(0, 5).map((d) => formatDate(d))
  const more = days.length > names.length ? `、等 ${days.length} 天` : ''
  return `${what}里有 ${days.length} 天干了活：${names.join('、')}${more}`
}

/**
 * 一行交给翻译层的那份「记录」。
 *
 * 翻译层（pickShards / dangerOf / worldLine）只认记录的形状，所以一格也照记录的样子
 * 喂进去：五分钟那一格的 counts / files / fails / tags 就是它的。
 * 两处是**整张卡**的事实，不能按格算，所以只在最新那一格上带：
 *   · 短段（≤5 分钟）：他就是在落脚处（用户 2026-10-04 第 1 条），整段一样；
 *   · 久坐（≥180 分钟）：坐了很久。
 * 交付物和帮手也是整段的（不是每五分钟的），同样只挂在最新那一格。
 */
function unitOf(unit) {
  const card = unit.entry
  if (unit.tick === null) return card // 老记录：整张卡就是这一行
  const cardMinutes = Math.round(Number(card?.minutes) || 0)
  // 一格只有五分钟：`minutes` 给 0，免得每一行都说「一小会儿」；整段那两条特例只在头一格带。
  const whole = unit.head && (cardMinutes <= 5 || cardMinutes >= 180) ? cardMinutes : 0
  return {
    id: unit.key,
    startedAt: unit.at,
    endedAt: unit.at + LAND_MS,
    minutes: whole,
    tags: unit.tick.tags || [],
    counts: unit.tick.counts || {},
    actions: unit.tick.actions || 0,
    files: unit.tick.files || [],
    fails: unit.tick.fails || 0,
    cwd: card?.cwd,
    project: card?.project,
    deliverables: unit.head ? card?.deliverables || [] : [],
    helpers: unit.head ? card?.helpers || [] : [],
    // 方向（见 `DIRECTIONS`）：这一格属于哪一天，就带着那一天的方向——
    // `dangerOf` 与 `worldLine` 读的就是它。整张卡那一档直接返回 `card`（上面那行），
    // 字段在 `renderTimeline` 里已经挂上去了。
    direction: card?.direction,
  }
}

/**
 * 整条见闻录的话一次拼完。
 *
 * `composeSequence` 要的是**从旧到新**（顺序不能乱：每一行都要躲前面几行讲过的物件），
 * `rowUnits` 给的是从新到旧，所以这里翻一下。句子按 `key` 存（见 unitOf 里的 id）。
 */
function sequenceOfUnits(units, voice = DEFAULT_VOICE) {
  return composeSequence(units.slice().reverse().map(unitOf), voice)
}

/**
 * 一格空着时右栏说什么。
 *
 * 「空着」是**事实**（实测占两成多的格子），但它不能空着——那一格里他还是过着日子。
 * 从已有的安静句池里挑：他还在那儿（`SHARED_LINES.idle`），或者外头那点动静
 * （`WORLD_QUIET`，城里的日常）。不写「无数据」这种现代词，也不编一个动作。
 * `avoid` 是最近几行用过的那几句（一句一行）——连着二十行说同一句话最扎眼，
 * 隔三行再撞见一次也一样（七格子的梯子上真撞见过，2026-10-08 的 smoke 抓到的）。
 */
function quietLine(unit, avoid = '') {
  const pool = [SHARED_LINES.idle, ...WORLD_QUIET].filter(Boolean)
  const used = String(avoid).split('\n').filter(Boolean)
  const fresh = pool.filter((line) => !used.includes(line))
  const list = fresh.length ? fresh : pool
  return pick(list, `${unit.key}|quiet`) || list[0]
}

/** 那一行没人拼出句子时的兜底：老记录是那张卡的老话，空着的一格是一句安静的话。 */
function unitLine(unit, voice = DEFAULT_VOICE) {
  return unit.tick === null ? dayLine(unit.entry, voice) : quietLine(unit)
}

/* ------------------------------------------------------------------ *
 * 他那边
 *
 * 这一整块是「另一个世界的他」的全部翻译层：你这边真实发生过的元数据
 * （工具分类、时刻、时长、交付物、帮手）进来，他那边的一句话和一个小动作出去。
 *
 * 词表必须和宿主半边 src/index.js 的 TOOL_TAGS 对齐——对不齐就会永远落到
 * 最后一行，每张卡片都写着同一句废话（这个 bug 真出现过一次）。
 * ------------------------------------------------------------------ */

/**
 * 一个动作 = 他那边的一句话。
 *
 * 他站在哪儿不在这里——见 ACTION_PLACE。位置跟语气无关：换一套说法，
 * 他还是站在同一栋房子门口，不会跑到别的角落去。
 */

/** 跟语气无关的那几句：天亮天黑、坐久了、刚回来。两个世界说的是同一句话。
    导出是给自检用的：红线自动扫要把这些句子一句句拿出来过一遍禁用词。 */
let SHARED_LINES = {
  away: '他出门去了，这会儿不在。',
  asleep: '他趴在桌上打盹。',
  lateness: '别人都睡了，他那扇窗还亮着。',
  fleeting: '他回来拿了个东西，转身又走了。',
  longSit: '他从下午一直坐到灯快没油。',
  idle: '他还在那儿，手没停。',
  quiet: '那天他没什么动静。',
  satLong: '他一个人坐了很久。',
}

/**
 * 他人在**落脚处**时该干的事。
 *
 * 用户 2026-10-04 第 1 条：「现在他的位置在落脚点，那么需要做符合落脚点的事情，
 * 比如吃饭、睡觉、休息、做一些准备工作等等」。位置是「落脚处」而句子还在讲
 * 翻了几个箱子，就是因为短段（≤5 分钟）本来只走一句写死的话；现在这里有几条
 * 各不相同的「回家干了什么」，按种子挑一条。
 *
 * 只有「冒险」这一套说法有这一池——当年第二套说法（案牍）就是沿用
 * `SHARED_LINES.fleeting`，所以买另一套语气的人看到的短段永远是同一句。
 * 哪天真要按说法分这一池，跟着 `LIFE_POOLS` 一起并进包（见 `.parked/README.md`）。
 */
let HOME_LINES = [
  '他回去就着黑面包吃了几口，又出门了。',
  '他把斗篷解下来，在门槛上坐了一会儿。',
  '他回去睡了一觉，天没黑就醒了。',
  '他在灶边热了碗汤，顺手把灯拨亮。',
  '他把箱笼里的东西倒出来，重新收拾了一遍。',
  '他回去添了件衣裳，把刀在石头上蹭了两下。',
  '他坐在床边把当天的路在心里过了一遍。',
  '他灌了壶水，靠在门框上歇了歇。',
]

/**
 * 说法表：**这个世界**用哪一套词说他做的事。
 *
 * - `adventure` 冒险：咒文、法器、卷轴、打听。同一件事，听上去像在另外一个世界。
 *
 * 表里原来还有第二套 `ledger`（案牍：卷宗、机关、旧案），2026-10-05 被用户摘掉了——
 * 「我们只需要一个作为默认即可了！那么去掉案牍，我们只保留冒险」。它连内容一起收在
 * `.parked/ledger-voice/`，要放回来见那边的 README。
 *
 * 共同点（这才是不能动的）：一句话只描述**一个**动作，永远是第三人称现在时，
 * 不夸、不劝、不感叹。差别只在名词。**每一张表都要覆盖每一个动作键**
 * （见 ACTION_PLACE）——缺一个，那天的卡片就会说废话。
 */

/* ------------------------------------------------------------------ *
 * 世界句：他干活的时候，外头发生的事
 *
 * 2026-10-08 用户原话：「我希望的是，我能看过更多奇幻内容，而不是主角
 * 整天都在修修补补。」——世界本身够奇幻（精灵城的大银树、矮人的矿洞、
 * 人类帝国的城堡、海边的灯塔），但面板里读到的全是抄书、刮刀、磨齿轮。
 * 这一层把「外头」补回来：他看见的、听见的、路上遇上的。
 *
 * 六桶（night 深夜 / dawn 清晨 / road 在路上 / visitor 有人来 /
 * news 听来的消息 / encounter 碰上了东西）各十条，由子代理写成、另有单独
 * 自检（.scratch/check-fight.mjs）。挑桶的逻辑在 worldLine()：按**真实处境**
 * 加权——撞过墙的人更容易碰上东西，深夜、出门、有过帮手各有各的说法。
 * ------------------------------------------------------------------ */
/**
 * 任务 B —— 外头的事（世界句），2026-10-08。
 *
 * 用户那句「我能看过更多奇幻内容，而不是主角整天都在修修补补」指的是：句子一直在写
 * 他手上那件活计，没有人写**外面正在发生什么**。这一池就是补这一层——他看见的、听见的、
 * 路上遇上的，**不是他自己手上的活**。句式比他自己的活计句更短、更冷。
 *
 * 六个桶，每个十条，按真实记录里本来就有的条件分流：
 *   night      这一段起于二十三点后，或五点前
 *   dawn       起于五点到八点
 *   road       这一段很长，或他干的活本来就在外面
 *   visitor    有帮手，或派了活、聊了聊
 *   news       查资料、翻文件、聊了聊——听得见的消息
 *   encounter  那天撞过墙（工具报过错），外头就有东西跟他照面；只有这一桶可以用 {e}
 *
 * 规矩（与 hurt 同一套）：句号收尾的陈述句；不许感叹号、问号、引号；不许阿拉伯数字；
 * 不许现代词；不许起居词（吃 / 睡 / 枕 / 被褥 / 哈欠 / 打盹 / 起床 / 面包 / 汤 / 靴 / 晾 / 灶 / 宵夜）；
 * **同一桶内不许反复用同一样东西**——一桶十句，十样东西各说各的。
 * 奇幻度照《魔戒》《冰与火之歌》：荒野、霜、荒原、废墟、矿洞、亡者、巨兽、火把、甲片。
 */
let WORLD_LINES = {
  night: [
    '城墙上的火把换过第三轮，更声从塔上落下来。',
    '霜落在路碑上，把那几道刻痕填平了。',
    '远远矿洞那头传来凿石声，天亮前自己停了。',
    '一轮月压在废墟的断墙上，墙根有影子动了一下。',
    '林子里的狼叫了半宿，后半夜只剩风声。',
    '海边的灯塔转了一夜，光每回都从窗上划过去。',
    '渡口的橹声过去两趟，没有一趟靠岸。',
    '他听见墙外有甲片响，走到门口时又没了。',
    '北风把雪从门缝里送进来，地上白了一小片。',
    '山顶那堆火燃到半夜，像是有人守着。',
    '塔上的符灯换过第三轮，光从一排屋脊上扫过去。',
    '北边霜脊山脉那头亮了一下，隔了很久才传过来一声闷响。',
    '巡夜的把街口那几盏符灯一盏盏挑亮，走到巷尾又灭了。',
    '废墟那头有人守着一堆火，火里偶尔炸出一星蓝的。',
  ],
  dawn: [
    '天边刚翻出灰白，第一队守夜的人从城墙上下来。',
    '雾从河面上爬过来，把对岸的路碑整个吞了。',
    '霜化了半层，路上留下很多不属于他的脚印。',
    '林子里有斧声，砍了十几下就停了。',
    '远处传来一声长角，是矿洞换班的号。',
    '第一批运货的车从渡口那头过来，轮子陷在泥里。',
    '一群黑鸟从废墟方向飞起来，绕了一圈又落下。',
    '城门刚开，一队穿甲的人往北走了，没回头。',
    '海面上的白气散开，露出两艘没有旗的船。',
    '太阳从山脊上露头，桥面那层白慢慢退了。',
    '法师塔的钟先响，城里的鸡才跟着叫。',
    '雾散的时候，能看见霜脊山脉那道白线横在北边。',
    '城门还没开，守门的先挨个验过进出的符牌。',
    '法师塔上那盏灯亮了一夜，天快亮时才灭。',
  ],
  road: [
    '大路上有几段塌了土，绕路要多走半天。',
    '他过桥的时候，桥下漂着一块带血的门板。',
    '道旁的路碑倒了一块，断口还是新的。',
    '沿路有几个村子空了，窗子都敞着。',
    '林子那头有人烧过营，灰里埋着半截箭杆。',
    '雪线比去年低，翻过去的那道口子封着。',
    '路上有一队人往南走，谁也不看谁。',
    '远处的山脊上滚下来一块石，砸断了两棵树。',
    '渡口的船让人凿穿了一条，船家说要等明天。',
    '走了很远才看见一处人家，烟囱里没有烟。',
    '道旁那排符灯只剩两盏还亮着，别的都让人摘走了。',
    '往北的车辙一直压到那片焦土边上，中间没有岔路。',
    '他在银树森林边上碰见守林人，跟着走了一段近路。',
    '道旁插着一把断剑，刃上还留着半行刻字。',
  ],
  visitor: [
    '中午来了个牵骡子的人，问往北那道口子封没封。',
    '门外站着个披斗篷的，一直到天黑都没走。',
    '一个收旧符的挑着担子在檐下歇脚，担子一头挂着两只风干的兔。',
    '一个背弓的姑娘来问乱石岗那片废墟的事。',
    '傍晚来了三个生脸，说要雇人走一趟矿洞。',
    '有个瞎眼的老人被牵进来，说听见地下有人在敲。',
    '墙根那匹黑马站了一下午，主人一直没露面。',
    '有个带伤的骑手进来，甲片上还沾着没干的血。',
    '一个吟游诗人路过，在台阶上弹了半支曲子就走了。',
    '有个孩子送来一封信，说是桥头一个戴兜帽的人给的。',
    '来了个披灰斗篷的人，问他认不认得墙上那行旧咒。',
    '有个收旧符的挑着担子过来，把画废的纸一张张翻过。',
    '北边那片焦土过来的两个人在城外扎了营，不进城门。',
    '来了个带剑的年轻人，问他往北那道口子怎么走。',
  ],
  news: [
    '渡口的人说，北边那条道夜里封了。',
    '有人从矿洞那头回来，说底下又塌了一段。',
    '码头上传的话是，海里近岸来了两艘不长眼的船。',
    '佣兵会的板子上新添了一张条子，赏的是活捉。',
    '有个守夜人说，城墙外那圈脚印一夜之间多了三倍。',
    '货栈那边都在讲一件事，乱石岗那片废墟里又有了火光。',
    '一个过路的僧人说，河上游的桥让人拆了。',
    '酒馆里最靠里的那桌在传，南边有一整支队伍不见了。',
    '旧书贩子说，古咒里提到的那种东西醒了一回。',
    '雇主那边捎话来，说揭榜的人当天就出了城。',
    '公会门口的人说，法师塔把底下那层封了，不让人靠近。',
    '有人从北边回来，说那片焦土上又开始冒白气。',
    '码头上传的话是，珊瑚海国那两艘船在近岸停了三天。',
    '铁匠铺门口的人说，法师塔新收了几个学徒，这两天街上常能碰见。',
  ],
  encounter: [
    '他在断墙后面挨了{e}下，才把那只灰皮的兽逼退。',
    '路边窜出{e}只黑影，他跟它们对上了，斗篷被撕开一道。',
    '他在矿洞口被{e}只爪子发白的东西围住，退到火堆边才站住。',
    '桥底下爬上来{e}条青鳞的长虫，他用火把一条条捅回去。',
    '林子深处撞见一头长獠牙的野猪，他绕着树跟它兜了{e}圈。',
    '雪地里{e}只狼跟了他半里路，直到他点着一根松枝。',
    '废墟里那扇门自己开了，他挨了{e}记冷风，脸上像被刀刮过。',
    '他踩进一张网里，割了半天才下来，网上的{e}根绳都断了。',
    '坟头那点动静越来越大，他扔了{e}回石头才压住。',
    '他退到断墙后面，跟那群死物隔着一堵墙对了{e}回。',
    '他在断墙后面挨了{e}下，那具石像才站住不动。',
    '路边窜出{e}只灰皮的兽，他拿符纸拍过去，斗篷被撕开一道。',
    '他从矿道里退出来，身后那{e}个影子跟到洞口才散。',
    '他在断墙后面念了句短的，扑上来的那团影子散成一片灰。',
    '他抽出旧剑挡了一下，刃上立刻爬满了霜。',
  ],
}

/**
 * 世界句的兜底桶：城里的日常。
 *
 * 为什么还要一桶：上面六桶都有条件，一条平平静静坐在城里的记录六桶全不沾。
 * 用户要的是「每一行都能看到外头」，所以留这一桶——保证每行都有世界句，
 * 同时不让它变成套话：它讲街上、屋顶上、水面上的动静，不写他手上的活。
 */
let WORLD_QUIET = [
  '巷口那只猫在墙头趴了一天，谁从底下过都不动。',
  '风从城门那边灌进来，檐下的幌子响了一整个下午。',
  '卖柴的推车从门口过去，木轮压得石板吱了一道。',
  '几只鸦落在对面屋脊上，叫了一阵，又一起飞走了。',
  '河边的水车转得慢，木轴吱嘎吱嘎地响到天黑。',
  '有孩子在巷子里追一只纸鸢，笑声一直闹到日头偏西。',
  '街上的石板被人踩得发亮，边角上还留着昨夜的霜。',
  '守夜的提着灯走过街口，光影在墙上晃了一下就没了。',
  '檐水敲了台阶一夜，天亮时忽然停了。',
  '远城的钟敲了三下，隔着两条街传过来，闷闷的。',
  '街口的符灯亮了一夜，天亮时有人来换灯芯。',
  '法师塔的钟敲过三下，街上的狗跟着叫了一阵。',
  '檐下挂的那道旧符被风吹得翻了个面，又翻回来。',
  '街上有人试法术，檐角那串铜铃响了一路。',
]

// 兜底桶在表里得有个位置（**同一个数组，不抄第二份文本**）：`worldLine` 挑不到具体桶时
// 落到 `quiet`，而自检（`scripts/verify-rules.mjs`）与 `worldBucket` 都是按「桶名 →
// `WORLD_LINES[桶名]`」查的。所以这里把上面那份 `WORLD_QUIET` 接成第七个桶；
// 包里同理（`src/packs/index.js` 的 `applyPack` 从 `worldQuiet` 派生），别在文案里抄两遍。
WORLD_LINES.quiet = WORLD_QUIET

let VOICES = {
  adventure: {
    label: '奇幻冒险',
    lines: {
      改文件: '他在案前抄一段古咒，抄到第三遍又划掉了。',
      跑命令: '他在院子里试那件法器，试了三回还没顺。',
      翻文件: '他在旧卷轴堆里翻一句话。',
      查资料: '他问过三处，说法都不一样。',
      派了活: '他托人出去打探，自己守着摊子。',
      聊了聊: '他在窗边跟人闲聊，没什么正事。',
    },
    words: {
      改文件: ['抄咒文', '誊符纸', '改契书', '补地图', '誊古卷'],
      跑命令: ['试法器', '调机关', '修炉子', '装符石', '开炉'],
      翻文件: ['翻卷轴', '找旧记载', '上架子', '搬箱笼', '查旧册'],
      查资料: ['打听', '问路', '探消息', '访旧人', '对说法'],
      派了活: ['托人跑腿', '捎话', '分派路线', '贴悬赏'],
      聊了聊: ['闲聊', '搭话', '听人说', '叙旧'],
      深夜: ['深夜', '夜里'],
      很晚了: ['入夜', '夜深'],
      坐了很久: ['久坐', '长坐'],
      一小会儿: ['打个转', '片刻'],
    },
  },
}

/**
 * 默认语气是**冒险**。
 *
 * 这是用户拍的板：他一开始举的例子就是「正在闯地下城、在 XX 学院学习魔法、
 * 钓鱼中、赚到了 2 个铜币」，而这一版要的是**轻冒险手记**那个调子——
 * 具体的动作加一个小结果，不加形容词。（原来还有一套「案牍」——同一个人的另一种说法，
 * 2026-10-05 被用户摘掉，收在 `.parked/ledger-voice/`。）
 *
 * `let`：装载内容包时（见下面 `applyPack` 那一段）由包里的 `DEFAULT_VOICE` 覆盖。
 * 这个字面量只是装载之前的占位——「默认是谁在讲」的准头在
 * `src/packs/index.js` 的 `DEFAULT_VOICE`，一处定，两处不再各说各的。
 */
let DEFAULT_VOICE = 'adventure'

function voiceOf(id) {
  return VOICES[id] || VOICES[DEFAULT_VOICE]
}

/* ------------------------------------------------------------------ *
 * 叙事：片段组合（用户 2026-10-03 拍板的「2+1」）
 *
 * 用户的原话是把「他打听了三处，说法都不一样」扩写成
 * 「他打听到了三处地下城的入口，但人们各执一词，坚信自己才是对的」——
 * 要的是**阅读性**，但要它仍然零 token。
 *
 * 所以不写死整句，改成拼：
 *     他{做了什么}，{结果}。
 * 每个动作三句起头 × 三句结果（+ 三句带数字的收尾），六个动作合起来
 * 一百多种组合。**数字是真的**：「同一页他抄了十二遍」里的十二，
 * 就是那天 records.json 里的 `counts.改文件`。
 *
 * 选哪一句由「会话 id + 动作 + 次数」散列决定：同一天不管看多少遍，
 * 都是同一句；换一天才换。没有随机数——自检要能断言同一份记录出同一句话。
 *
 * 一句话仍然只描述**一个**动作，第三人称现在时，不夸、不劝、不感叹。
 * ------------------------------------------------------------------ */
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 次数写成汉字。**只用在右栏的句子里**（「抄了十二遍」「有两个帮手」）——
    左栏那几行（改文件 ×12、动了几件）本来就该是数字，那里是尺子，不是故事。 */
function numWord(n) {
  const v = Math.round(Number(n) || 0)
  if (v <= 0) return '几'
  if (v > 999) return '上千'
  if (v < 10) return DIGITS[v]
  if (v === 10) return '十'
  if (v < 20) return `十${DIGITS[v % 10]}`
  if (v < 100) {
    const t = Math.floor(v / 10)
    const o = v % 10
    return `${DIGITS[t]}十${o ? DIGITS[o] : ''}`
  }
  const h = Math.floor(v / 100)
  const r = v % 100
  if (!r) return `${DIGITS[h]}百`
  return `${DIGITS[h]}百${r < 10 ? `零${DIGITS[r]}` : numWord(r)}`
}

/** 稳定散列挑片段时用的次数。**不说「五十六遍」**——真到了几十次，
    写成「几十遍」才像话，写实数像在算账。
    两遍说「两」不说「二」：数东西和数次数都这么讲。 */
function countWord(n) {
  const v = Math.round(Number(n) || 0)
  if (v === 2) return '两'
  if (v >= 20) return '几十'
  if (v >= 10) return '十几'
  return numWord(v)
}

/** 稳定的散列：同一个种子永远挑同一句。 */
function pickIndex(seed, len) {
  let h = 2166136261
  const text = String(seed)
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % len
}

function pick(list, seed) {
  const arr = Array.isArray(list) ? list : []
  if (!arr.length) return null
  return arr[pickIndex(seed, arr.length)]
}

/**
 * 冒险语气的片段表。
 *
 * - `lead`  他怎么开这个头（同一件事的六种开场）
 * - `tail`  没有次数可说时的结果（老记录、次数少于 2）
 * - `more`  有次数时的结果，`{n}` 会被替换成汉字数字。**一半是「成了」**——
 *           用户 2026-10-03 说「都是这种翻找无果的」，问题不在词不够，在结局只有一种。
 * - `paid`  那天交出了东西（`deliverables` 非空）时的结局：交活、拿钱。
 *           红线照旧：**只写这一句，不记账**，没有余额、没有等级、没有物价表。
 * - `hurt`  那天撞过墙（`fails`，工具报错的次数）时的结局，`{e}` 是那次数。
 *           这是他那边唯一诚实的「战斗」来源——你在这一头撞墙，他在那一头挨了两下。
 *
 * 场景**仍然由「你那天做了什么」决定**：改文件就在案前，不会跑去打龙。
 * 变的只是同一件事的出路——成了、没成、交了活、挨了打。
 */
/**
 * 场景库（2026-10-05）：一个动作底下再分几件**不一样的事**。
 *
 * 用户看完第九版说「在他的冒险上，这里的行为也是具有重复性的，就感觉在卷轴塔
 * 做的事情差不多」。根因是：一个动作只有一句话的说法，翻文件就永远是翻卷轴。
 * 现在改文件底下有四件不同的事（抄咒文 / 誊符纸 / 改契书 / 补地图），各自有自己的
 * 物件与收尾；挑哪一件由行号散列决定，**连着几行不会挑到同一件**。
 *
 * 分工：`SHARDS` 说「这件事最后怎么收场」（成了 / 没成 / 交了活 / 挨了打），
 * 场景说「他到底在做什么」。
 */
let SCENES = {
  adventure: {
    // 改文件：咒文 / 符纸 / 契书 / 疆域图，四样纸上的活各用各的物件
    改文件: [
      {
        key: 'spell',
        w: '抄咒文',
        lead: [
          '他在案前抄一段古咒，笔尖烧得发烫',
          '他把同一段咒文誊到一张新羊皮上',
          '他蘸了银墨从第一行重新往下写',
          '他照着旧抄本把断了的一行补上',
          '他把石板上刻的咒文对到纸上一遍',
                '修书匠把那页羊皮推回来，说缺的那个字他写不上',
],
        tail: [
          '抄到一半，灯油短了一截',
          '划掉的字比留下的多',
          '笔尖顿了顿，又落下去',
          '写完他把纸挪到一边搁着',
          '窗外的光从纸边挪到了案角',
                '写到一半划掉大半行，他把笔搁下又拿起来',
        '银墨用完了，后半页他改用淡墨',
        '灯油熬到见底，最末一行他写得比前头小',
],
      },
      {
        key: 'talisman',
        w: '誊符纸',
        lead: [
          '他在灯下给一张符纸改笔画',
          '他把符纸压在镇石下面照着描',
          '他换一支细笔把符脚补齐',
          '他把画废的符纸揭下来重铺一张',
          '他拿一道旧符样对自己的笔画',
                '镇石底下压着的符纸只剩薄薄一沓',
],
        tail: [
          '银墨调得太稀，笔画洇开了',
          '画到后来才有一张像样',
          '他把废的那几张卷起来压住',
          '灯下的纸边卷了个角',
          '风从窗缝进来，纸角抖了抖',
                '画到第四张手才不抖，前几张都烧在了炭盆里',
        '有一张被风掀起，他追到门口才踩住',
        '描到末一笔灯花爆了一下，纸面留下一星焦痕',
],
      },
      {
        key: 'deed',
        w: '改契书',
        lead: [
          '他把一卷旧契书摊开逐字改',
          '他在契书行间添上漏掉的两个字',
          '他把写错的一行用刀刮掉重写',
          '他对着底稿把契书逐行核过',
          '他在契书末尾落上自己的火漆',
                '行商把契书摊开指着末尾，说这一条得照旧例',
],
        tail: [
          '最后留下的是改过的那一版',
          '改到末尾，他把两页对在一起',
          '刮过的地方透光，他换了张纸',
          '写完他把契书压在一摞书下',
          '他把改完的那一卷搁在桌角',
                '封口那枚火漆他按了两回才按圆',
        '写到一半手一抖，墨点落在落款上',
        '对完两遍天已经黑透，还剩末尾三行没核',
],
      },
      {
        key: 'map',
        w: '补地图',
        lead: [
          '他趴在桌上补一张破了角的地图',
          '他沿着旧线把断掉的一段描上',
          '他拿尺子比着把河道往北挪',
          '他在图边补上两个没标名字的村子',
          '他把补好的那块举起来对光看',
                '那张地图在桌上摊了许久，边角压着块石头',
],
        tail: [
          '图角的破口他用浆糊粘住了',
          '尺子滑了一下，新描的那道歪出纸边',
          '他把新描的线对着旧图比了比',
          '挪过的那一段怎么看都不对',
          '他吹干墨，把图卷起来收进筒里',
                '断掉的那一段他补了三回，还是没接上',
        '描到南边才发现，这一角已经没处落那条支流',
        '对照旧图的时候有两处对不上，他先用炭笔画了个圈',
],
      },
    ],
    // 跑命令：法器 / 机关 / 熔炉，三样东西的动静各不相同
    跑命令: [
      {
        key: 'device',
        w: '试法器',
        lead: [
          '他在院子里试那件法器',
          '他把法器摆上石台再点一次',
          '他用袖子擦过法器的边又试了一回',
          '他把法器翻过来看底下的纹路',
          '他退开三步朝法器抬了抬手',
                '看院子的老人说，这法器少了一道引路的刻线',
],
        tail: [
          '法器响了一声，光只闪了半下',
          '石台上落了一层薄薄的霜',
          '法器的那一圈热起来，他松了手',
          '试到日头偏西还是没亮',
          '他把法器包进布里抱回屋',
                '燧石敲了三回，那圈纹路才勉强亮起半道',
        '石台裂了道细缝，他蹲下来看了很久',
        '亮过之后那一圈烫得厉害，他倒扣在雪里',
],
      },
      {
        key: 'gear',
        w: '调机关',
        lead: [
          '他蹲在机关前把齿盘对了一遍',
          '他把机关拆开摊了一地零件',
          '他捏着最小的那块零件往槽里塞',
          '他给齿盘上了油再装回去',
          '他趴在机关上听齿盘咬合的声音',
                '他托人提着灯照了半天，说少了一片垫片',
],
        tail: [
          '齿盘咬上，那件东西安静下来',
          '零件摆了一地，他蹲着挨个认',
          '他把手在围裙上擦了两遍',
          '有块零件掉进缝里，他摸了半天',
          '齿盘转到一半，卡住了',
                '装到一半多出一片，他捏着看了半天',
        '齿盘咬住的那一下他停了手，没敢再往下转',
        '手背让铁屑划了道口子，他用围裙按住接着装',
],
      },
      {
        key: 'stove',
        w: '修炉子',
        lead: [
          '他蹲在铁匠铺的炉边添了把炭',
          '他把风箱拆下来通了一遍',
          '他拿铁棍把炉膛里的灰捅开',
          '他把炉口那圈松了的砖重新砌上',
          '他在院子里生起火试着烧一炉',
                '老铁匠把风箱递给他，说这炉子漏气',
],
        tail: [
          '炉子凉了，他还盯着看',
          '烟从缝里冒出来，呛得他直咳',
          '火苗窜起来又压下去',
          '他把炭添满，等着水开',
          '炉膛红了一阵，慢慢暗下去',
                '火起来一阵，他半边袖子燎了个口子',
        '炭添到第三筐烟还是倒灌，他退到门外站着',
        '火苗窜了半尺高，他退了半步，没敢再添炭',
],
      },
    ],
    // 翻文件：卷轴 / 高架 / 箱笼 / 旧册，各是各的落脚处
    翻文件: [
      {
        key: 'scroll',
        w: '翻卷轴',
        lead: [
          '他在旧卷轴堆里翻一句话',
          '他把一摞卷轴摊在桌上',
          '他抽出最上面那一卷摊平',
          '他借着窗口的天光挨卷看过去',
          '他把受潮粘住的纸页一张张揭开',
                '常来的行商说，这种卷轴只在南边见过一回',
],
        tail: [
          '翻到一半，窗外起了风',
          '要找的那一句始终没露面',
          '最后把翻出来的都摞回原处',
          '纸页脆得一碰就掉渣',
          '他把挑出来的那几卷抱到亮处',
                '纸边划过指头留了道口子，他在袖口上蹭了蹭接着翻',
        '翻过的那些他没卷回去，桌上堆成一片',
        '找了一下午，最末一卷连绳都没解',
],
      },
      {
        key: 'shelf',
        w: '上架子',
        lead: [
          '他爬上梯子去够最上面那一层',
          '他钻进藏书塔最里那一排架子',
          '他把架子从上到下捋了一遍',
          '他踩着梯子横档探身往里摸',
          '他把顶层那几只匣子搬到地上',
                '梯子横档上积了一层灰，看着没人踩过',
],
        tail: [
          '架子晃了一下，他扶住横档',
          '架上空出来的位置他记住了',
          '梯子挪了半步，他脚尖点地',
          '他从梯子上滑下来磕了膝盖',
          '略高的那一层他够着了才下来',
                '最上一层他踮脚够了三次才够着',
        '挪位的时候脚下一滑，他攥住架子才站稳',
        '顶层那只匣子扣着暗锁，钥匙早不知去向',
],
      },
      {
        key: 'box',
        w: '搬箱笼',
        lead: [
          '他把落了灰的箱笼一只只搬下来',
          '他用绳子把两只箱笼捆在一起',
          '他把箱笼拖到门口就着光翻',
          '他掀开箱盖拍掉上头的灰',
          '他把箱笼一只只码到墙角',
                '新来的短工说，最底下那几只没人动过',
],
        tail: [
          '箱笼底下压着一块旧布',
          '灰扬起一片，他眯了眯眼',
          '绳子松了，箱笼砸在地上',
          '最底下那只箱笼上着锁',
          '他拍掉手上的灰才起身',
                '箱笼底磨穿了，铜扣滚到墙根',
        '绳子这次系得牢，他还是多打了一个结',
        '搬到第三只听见里面有响动，他停下来晃了晃',
],
      },
      {
        key: 'book',
        w: '查旧册',
        lead: [
          '他抱来一摞旧册坐在门槛上',
          '他一手按着册子一手往下翻',
          '他把册子摊在膝上对着看',
          '他从册子后头往前倒着找',
          '他把折了角的那一页先挑出来',
                '那摞旧册的封皮已经烂了一半',
],
        tail: [
          '册子合上，他把页角压平',
          '翻到后半本，字迹淡了',
          '门槛上坐久了，他挪了挪',
          '他把要找的那一页折了个记号',
          '最后一页缺了，他没往下翻',
                '对着看了一晌，页边被他掐出个印子',
        '翻到中间掉出半张旧纸，边上的字他认不出',
        '夹在页间的一条布带露出来，上头的字已经花了',
],
      },
    ],
    // 查资料：问人 / 走路 / 对说法，三种问法各留各的痕迹
    查资料: [
      {
        key: 'ask',
        w: '打听',
        lead: [
          '他挨个问过镇上的人',
          '他跑了一趟商队营地打听一件事',
          '他在酒馆里坐到半夜等人开口',
          '他拦住一个赶路的行商问了句',
          '他找了好几个走过远路的人问话',
                '旧书贩子说，认得那记号的人早就不在了',
],
        tail: [
          '人们各执一词，坚信自己是对的',
          '有人肯说，可说的都是旧年的传闻',
          '天黑了，他还是没问出准信',
          '他请人添了一回酒，话才多起来',
          '问到后来，话题拐到别处去了',
                '问到第五个人，才有人往南边指了指',
        '半袋干粮换回一句实话，剩下的没人肯说',
        '那人说到一半忽然收了口，转身去看别处',
],
      },
      {
        key: 'road',
        w: '问路',
        lead: [
          '他照着一张旧图去城外转了一圈',
          '他在岔口站了半晌等过路人',
          '他把三条道都走了一段比快慢',
          '他在旅店里问了个赶车的',
          '他沿路数着路碑往前走了半里',
                '守夜人说，往北那道夜里封了，得等天亮',
],
        tail: [
          '有人给他指了条近路',
          '岔口的路牌倒着，他扶正了',
          '路碑到第三块就断了',
          '走了半里，路又绕回原处',
          '赶车的说前头的桥塌了',
                '绕到天黑才看见头一块路碑，字已经磨平了',
        '走了半里遇上倒下的路牌，他扶起来看了半天',
        '第三条道走到一半塌了土，他退了回来',
],
      },
      {
        key: 'compare',
        w: '对说法',
        lead: [
          '他把三家说法凑在一张纸上',
          '他把两份笔录摊开逐句比对',
          '他去铺子又问了一遍同样的话',
          '他把听来的话按前后排了顺序',
          '他拿旧年的记载对眼下听来的说法',
                '吟游诗人把同一件事唱了两遍，两遍说的不一样',
],
        tail: [
          '说法拢共三种，没有一种对得上',
          '对上了一句，剩下的还差得远',
          '他把对不上的那处圈了出来',
          '比到后来，他自己也糊涂了',
          '他把笔录按前后顺序摞好',
                '对到最后剩一句谁都不肯改口，他就搁下了',
        '两份说法差在时辰上，他没敢挑一个信',
        '越对越乱，到后来他连自己那句都拿不准了',
],
      },
    ],
    // 派了活：托人跑腿 / 分路线 / 贴悬赏，出门的人各有各的去向
    派了活: [
      {
        key: 'crew',
        w: '托人跑腿',
        lead: [
          '他托街口那孩子去打听一件事',
          '他在门口把话跟跑腿的交代清楚',
          '他把要带的东西数了一遍，够跑两趟',
          '他给跑腿的塞了一份干粮',
          '他站在檐下看那孩子跑远',
                '那孩子的娘说，天黑前回不来就别等了',
],
        tail: [
          '自己守着摊子等消息',
          '回话的只带回一半，剩下的没打听着',
          '跑腿的回来说路上不太平',
          '天黑透了，门才又响了一声',
          '他把空椅子摆回原位',
                '隔了一夜门口才回来一个人，捎的东西丢在了路上',
        '干粮分出去大半，他自己那份留到了最后',
        '有人半夜敲窗，说托出去的话没带到',
],
      },
      {
        key: 'route',
        w: '分派路线',
        lead: [
          '他把三件事分别托给三个人',
          '他在纸上给每人画了一条路线',
          '他抓了几根草签让孩子抽',
          '他把要走的顺序排好写在纸上',
          '他跟每个人说清回来在哪儿碰头',
                '赶车的说，西边那条溪涨了水，得绕道',
],
        tail: [
          '三个人走的方向都不重样',
          '有一个走岔了，天黑才回来',
          '剩下的事他自己留着做',
          '纸上的路线他描粗了一笔',
          '碰头的地方定在城门口老树下',
                '画到一半他把最短的那条划掉了，没往那边托人',
        '纸上排的顺序到第三行就乱了，他重画了一张',
        '抽到长签的那两个人走岔了道，入夜才摸回来',
],
      },
      {
        key: 'poster',
        w: '贴悬赏',
        lead: [
          '他在佣兵会的悬赏板上贴了张招人的条子',
          '他写了一叠悬赏条，挨家挨户送',
          '他拿浆糊把悬赏条抹平贴上墙',
          '他把悬赏条上的字重新写了一遍',
          '他站在墙边看人念那张悬赏条',
                '管悬赏板的老兵说，写得越长越没人看',
],
        tail: [
          '有人停下来看了两眼就走了',
          '风把悬赏条吹起一个角',
          '纸角翘起来，他伸手按了按',
          '揭下来的旧条子他扔进了筐',
          '到了傍晚条子下添了两个名字',
                '悬赏条贴到入夜，围看的人换了两拨，没一个揭下来',
        '隔了两天板上又添了新的，他这张被压在了底下',
],
      },
    ],
    // 聊了聊：闲聊 / 听人说 / 搭话，嘴上的三种分寸
    聊了聊: [
      {
        key: 'chat',
        w: '闲聊',
        lead: [
          '他靠在窗边跟人闲聊',
          '他跟旅店的学徒扯了几句',
          '他把酒碗推过去又添了一回',
          '他跟挨着坐的人有一搭没一搭地说',
          '他靠着柜台跟人说了半晌',
                '店主擦着碗说，北边来的人这回绕了远路',
],
        tail: [
          '说的没什么正事',
          '说的都是镇上的旧事',
          '天黑了才想起该收摊',
          '话没说完，人先散了',
          '壶里的酒添过几回，他没起身',
                '话说到一半他被叫去招呼客人，杯里的酒还剩半碗',
        '说的都是十来年前的旧事，他听得没接上半句',
        '邻座那人起身走了，桌上还留着一只空碗',
],
      },
      {
        key: 'listen',
        w: '听人说',
        lead: [
          '他坐在台阶上听人讲别处的见闻',
          '他搬了个小凳坐在火盆边听',
          '他挤在人堆后面听了半宿',
          '他给弹琴的吟游诗人递了回火',
          '他靠着柱子听两个人争一件旧事',
                '炭盆里的炭只剩下一层白灰',
],
        tail: [
          '听来的都是别处的事',
          '火盆灭了，人还没散',
          '说到紧要处，那人停了口',
          '他听到半夜才起身回去',
          '旁边的人接过去把话讲完',
                '唱到一半弦断了一根，那人没再往下弹',
        '火盆边的人换了两拨，他还坐在原处',
        '后半夜风大，讲的人压低了嗓子',
],
      },
      {
        key: 'greet',
        w: '搭话',
        lead: [
          '他在路口跟行商搭了句话',
          '他朝树下歇脚的人拱了拱手',
          '他蹲下来跟行商问了两句',
          '他摘下兜帽跟对面的人点了点头',
          '他站在桥头跟过路的人打招呼',
                '牵马的人在桥头勒住缰绳，问他要不要捎一段',
],
        tail: [
          '那人回了两句就上路了',
          '说的都是路上的天气',
          '话头断在那儿，他也没接',
          '来人卸下担子跟他聊了会儿',
          '他拱了拱手转身走了',
                '问过之后那人只管往前走，斗篷上的雪抖了一路',
        '兜帽摘到一半，那人已经走远了',
        '那人把箱笼往肩上挪了挪，说了两句就上路了',
],
      },
    ],
  },
}

/**
 * 四档结局。场景库管「他今天在做什么」，这里管「这件事怎么了结」——
 * 导出是给自检用的：红线自动扫要逐档确认钱只出现在 paid 那一档里。
 *
 * **键是场景（`SCENES` 里那二十件的 `key`），不是动作**。用户 2026-10-07 抓到
 * 「他拿尺子比着把河道往北挪，写到第几十遍，忽然对上了」——量河道配了「写到第几十遍」。
 * 根子是按动作分档：一个动作底下所有场景共用一套收尾，于是「抄咒文」的收尾会跑到
 * 「补地图」身上。改成按场景分之后，每一档都只讲这一件事自己的东西。
 * （动作级那层已经删掉；`pickShards` 里仍留 `SHARDS[id]?.[act]` 当兜底，
 * 给将来没有场景库的语气用。）
 *
 * `again` 是**承接句**，不在这儿当收尾用：一件事隔几行又回来做的时候，
 * 它被放到**句子开头**，接上当天那一句（见 `pickShards` 里 `back` 那一段）。
 */
let SHARDS = {
  adventure: {
    spell: {
      w: '抄咒文',
      more: [
        '同一段古咒他誊了{n}遍，笔尖磨秃了两回',
        '那张羊皮改到第{n}回，边角都磨起了毛',
        '案上那盏灯添了{n}回油，咒文还没写到纸尾',
      ],
      paid: [
        '他把誊清的咒文交出去，铜币数在案角',
        '雇他抄咒文的人搁下定金，说剩下的等抄完再算',
      ],
      hurt: [
        '他抄错了{e}处，最后那张纸还是撕了',
        '写到第{e}遍，灯花炸开，烫了他手背一下',
      ],
      again: [
        '那张羊皮还摊在案上，墨迹没干透',
        '抄到一半的咒文还压在旧抄本底下，银墨碗搁在旁边',
      ],
    },
    talisman: {
      w: '誊符纸',
      more: [
        '这道符他重描了{n}遍，笔画才对上',
        '一叠符纸画废了{n}张，镇石底下还压着没干的那几张',
        '他把符脚补了{n}回，银墨调得一回比一回稀',
      ],
      paid: [
        '主家收下那沓符纸，把工钱搁在门槛上',
        '他交完符纸拿到钱，顺手讨了一小罐银墨',
      ],
      hurt: [
        '他描坏{e}张符，最后一张撕破在手里',
        '画到第{e}遍，那块镇石从架上摔下来，压住了半张符',
      ],
      again: [
        '那道没画完的符还贴在案边，银墨碗没盖',
        '符纸还压在镇石下面，只差最后一笔',
      ],
    },
    deed: {
      w: '改契书',
      more: [
        '那卷契书他改了{n}回，末尾只落下三行',
        '契书行间添了{n}处小字，纸面快写满了',
        '那些刮过的地方他重写了{n}遍，羊皮薄得透光',
      ],
      paid: [
        '买契书的两家把火漆按上，铜币在桌上分成两堆',
        '他把改好的契书交出去，收了这一份的工钱',
      ],
      hurt: [
        '他改坏{e}处，索性把那张契书撕了重写',
        '刮到第{e}遍，刀滑了一下，他手上擦伤了',
      ],
      again: [
        '那卷契书还摊在案上，火漆只按了一半',
        '改到一半的契书压在底稿上头，刮刀搁在旁边',
      ],
    },
    map: {
      w: '补地图',
      more: [
        '那张地图他补了{n}遍，边线描了又擦',
        '河道往北挪过{n}回，怎么摆都不顺眼',
        '他对着旧图量了{n}遍，图角磨得发亮',
      ],
      paid: [
        '买图的人把铜币压在案角，卷起图走了',
        '他把描好的图交出去，收了定金，说剩下的下月来取',
      ],
      hurt: [
        '他描错{e}处，最后那张图撕成了两半',
        '量到第{e}遍，尺子滑脱，手背划伤一道',
      ],
      again: [
        '那张图还摊在案上，四角压着图筒',
        '描到一半的河道还留着，尺子横在图边',
      ],
    },
    device: {
      w: '试法器',
      more: [
        '那件法器他试了{n}回，光只亮一下又灭',
        '石台上那圈纹路他擦过{n}遍，还是没动静',
        '他退开又上前，来回{n}趟，霜落了薄薄一层',
      ],
      paid: [
        '买法器的人把铜币倒在石台上，又多问了一句',
        '他把法器交到买主手上，收下钱，又多叮嘱了两句',
      ],
      hurt: [
        '他试了{e}回，一道光扑在脸上',
        '试到第{e}遍，法器炸开，烫穿了半边袖子',
      ],
      again: [
        '那件法器还摆在石台上，布只解了一半',
        '试了一半的法器还搁在院中，纹路那面朝上',
      ],
    },
    gear: {
      w: '调机关',
      more: [
        '齿盘他对了{n}遍，齿口才咬上',
        '那个机关拆了又装，来回{n}趟，零件摊了满地',
        '他给齿盘上过{n}回油，缝里还是发涩',
      ],
      paid: [
        '来取机关的人验过一遍，把工钱搁在台上',
        '他把修好的机关交出去，工钱照说好的收了',
      ],
      hurt: [
        '拆到第{e}遍，一块零件弹起来砸在指头上',
        '对到第{e}遍，齿盘卡死，他指上挂彩',
      ],
      again: [
        '那个机关还拆着摊在案上，零件按次序摆开',
        '齿盘还搁在油碗边上，只装回去一半',
      ],
    },
    stove: {
      w: '修炉子',
      more: [
        '那口炉子他修了{n}回，火还是不稳',
        '炉膛里的灰掏过{n}遍，烟还是从缝里钻',
        '风箱拆开又装上，来回{n}趟，火苗才顺',
      ],
      paid: [
        '铁匠验过火色，把工钱搁在铁砧上',
        '他修好炉子拿了钱，顺手把剩下的炭背回去',
      ],
      hurt: [
        '烧到第{e}回才出对颜色，手上烫出个泡',
        '捅到第{e}遍，火星从炉口扑出来，燎了半边袖子',
      ],
      again: [
        '炉子还凉着，风箱搁在地上没装回去',
        '那口炉子还剩半边砖没砌，炭堆在旁边',
      ],
    },
    scroll: {
      w: '翻卷轴',
      more: [
        '整排卷轴他挨着摊开过{n}回，指头上全是灰',
        '要找的那一句他翻过{n}遍，羊皮的边都磨亮了',
        '那卷长的他分{n}回看完，纸渣掉了一桌',
      ],
      paid: [
        '他抄下的一截让人取走了，桌上留了几个铜币',
        '收旧卷的贩子把几个钱搁在柜上，抱走了那一截',
      ],
      hurt: [
        '脆羊皮撕了{e}回，他指尖也带了口子',
        '灰呛了他{e}回，手里那卷还是接着摊开',
      ],
      again: [
        '那半卷卷轴还摊在案上，绳结没系回去',
        '他挑出来的那几卷还堆在窗边，页角翘着',
      ],
    },
    shelf: {
      w: '上架子',
      more: [
        '那架梯子他上下爬过{n}回，横档上落满手印',
        '同一层架子他翻过{n}遍，灰落了厚厚一层',
        '从底到顶他捋过{n}轮，匣子搬下来又放回去',
      ],
      paid: [
        '藏书塔的管事收下他清出来的那一摞，付了几个铜币',
        '他把腾出来那一格的书交出去，换回几个钱',
      ],
      hurt: [
        '梯子晃了{e}回，他从半截上摔下来',
        '{e}回匣子从顶上砸下来，他抬手挡了一下',
      ],
      again: [
        '梯子还架在半截上，横档的灰被踩掉一块',
        '顶层搬下来的匣子还堆在地上，盖子都敞着',
      ],
    },
    box: {
      w: '搬箱笼',
      more: [
        '箱笼他来回搬过{n}趟，墙角堆得齐人高',
        '最底下那一只他翻过{n}遍，锁还是没开',
        '绳子换过{n}根，箱盖才总算捆住',
      ],
      paid: [
        '他清出来的那只箱笼让人抬走了，桌上留了几个铜币',
        '收货的人付了几个钱，箱笼让车拉走了',
      ],
      hurt: [
        '绳子断了{e}回，箱笼砸在他脚背上',
        '{e}回他抬箱笼时手一滑，摔在地上磕掉了角',
      ],
      again: [
        '那只箱笼还敞着口搁在墙角，绳子搭在旁边',
        '翻出来的半箱东西还摊在地上，谁也没去收',
      ],
    },
    book: {
      w: '查旧册',
      more: [
        '那本册子他翻过{n}遍，页角全起了毛',
        '同一页他找过{n}回，字迹淡得快看不清',
        '折了角的那几页他先翻过{n}遍，纸边都软了',
      ],
      paid: [
        '他把册子里那一段抄好送出去，回来时袋里沉了几个钱',
        '雇他查旧册的人先付了定金，把册子抱走了',
      ],
      hurt: [
        '{e}回脆纸页撕开时划了他手指',
        '烛花烫了他{e}回，灯芯剪短了接着看',
      ],
      again: [
        '那册子还摊在膝头上，折角的那一页没翻回去',
        '看了一半的旧册扣在门槛边，压着块石子',
      ],
    },
    ask: {
      w: '打听',
      more: [
        '一条巷子问下来，{n}个人给了{n}种说法',
        '佣兵会的登记人被他问过{n}遍，末了只说等等看',
        '他在酒馆里等过{n}晚，才等到一个肯开口的',
      ],
      paid: [
        '有人出定金雇他问一件事，钱先搁在柜上',
        '他把问出来的几个名字报过去，收了几枚铜币',
      ],
      hurt: [
        '{e}回他问错了话，挨了一顿骂，人被撵出门',
        '{e}回他凑过去搭话，兜帽叫人撕了一道口',
      ],
      again: [
        '问到一半的话头断在酒馆门口，那人说改日再讲',
        '那个名字还写在纸上没对上人，边角都磨软了',
      ],
    },
    road: {
      w: '问路',
      more: [
        '同一段路他来回走过{n}趟，脚底磨出了泡',
        '岔口上他等过{n}回，过路人指的方向没一次一样',
        '路碑他一道一道数过去，数到{n}块天就黑了',
      ],
      paid: [
        '商队雇他认一段路，说好回来再结',
        '他把走熟的这条道领着人走了一趟，收了几枚铜币',
      ],
      hurt: [
        '{e}回他在岔口走岔了，摔进路边的沟里',
        '{e}回夜里的风硬，他挨了半宿冻',
      ],
      again: [
        '那条没走完的道还画在半张旧图上',
        '走了一半的路停在岔口，路牌还歪着',
      ],
    },
    compare: {
      w: '对说法',
      more: [
        '同一份笔录他核过{n}遍，越核越对不上',
        '三家说法他来回比过{n}回，一处也没摁实',
        '抄书人那里他跑过{n}趟，每回说法都多一句',
      ],
      paid: [
        '他把几种说法归成一份誊清，收了几枚铜币',
        '雇他核对旧年记载的人，付了几个钱定金',
      ],
      hurt: [
        '{e}回他当面被人顶了回来，挨了几句难听的',
        '{e}回吟游诗人的话他不肯信，两人撕破了脸',
      ],
      again: [
        '那两份对不上的说法还摊在桌上，圈过的地方没擦掉',
        '抄书人给的那张纸还压在灯下，边角卷着',
      ],
    },
    crew: {
      w: '托人跑腿',
      more: [
        '这种事他前后托过{n}回，门口等的人换了好几拨',
        '他托人出去{n}趟，回话的从来不是同一个',
        '他把要托的事数了{n}遍，剩下的还是那几件',
      ],
      paid: [
        '他把跑腿钱当面点清，剩下的自己收着',
        '来的人领了钱就走，他把剩下的铜币压在木匣底下',
      ],
      hurt: [
        '派出去的人挨了{e}回打，回来还得他给包扎',
        '有{e}个同伴在半道上挂彩，是让人抬回来的',
      ],
      again: [
        '那件事还悬着，回来的人没带回准信',
        '上一趟的人还没消息，门口的椅子空着',
      ],
    },
    route: {
      w: '分派路线',
      more: [
        '这条线他走熟了，前后托过{n}趟',
        '他在图上把路线描了{n}遍，每一遍都多出一个岔口',
        '他把要托的事分作{n}件，各走各的方向',
      ],
      paid: [
        '三个人回来交齐了东西，他把酬劳按路远近分好',
        '他领着一趟走了远路，回来时袋里沉了些',
      ],
      hurt: [
        '有{e}队人在半道上摔进了沟里，货也散了一半',
        '派出去的人挨了{e}回黑手，路条都被撕了',
      ],
      again: [
        '地图上那一段还没描完，界线只画到第三个岔口',
        '出去的人一个都没回，岔口那盏灯还亮着',
      ],
    },
    poster: {
      w: '贴悬赏',
      more: [
        '这种悬赏条他写过{n}张，墙上没剩几张完整的',
        '他往那块板上贴过{n}回，来应的人一次比一次少',
        '悬赏条上的火漆他按了{n}遍，纸才粘牢在墙上',
      ],
      paid: [
        '揭条子的人跑了趟腿，说好的钱数当面给清了',
        '悬赏条贴出去第三天就有人来应，他把人名一个个记了下来',
      ],
      hurt: [
        '有{e}回悬赏条让人撕了，他重贴的时候挨了一顿数落',
        '他贴条子时从凳子上摔下来{e}回，膝盖磕青了',
      ],
      again: [
        '板上那张悬赏条还有半截没揭下来',
        '那面墙上的字让雨冲淡了，一直没人来补',
      ],
    },
    chat: {
      w: '闲聊',
      more: [
        '这样的闲话他扯过{n}回，回回说到半夜',
        '他跟柜台后头那人搭了{n}回话，话头总拐到同一件旧事上',
        '酒碗添到第{n}回，他还没起身',
      ],
      paid: [
        '闲话里替人牵了条线，人家顺手塞给他几个钱',
        '帮人看了半页信，人家塞给他几个钱当谢礼',
      ],
      hurt: [
        '他把话说岔了{e}回，挨了几记冷眼',
        '有{e}回他多嘴，让人拿话呛了一顿',
      ],
      again: [
        '那点闲话还没说完，酒碗搁在桌上凉了',
        '上回那个人还没再来，柜台前的凳子空着',
      ],
    },
    listen: {
      w: '听人说',
      more: [
        '他这么坐着听人讲了{n}宿',
        '同一段旧事他听过{n}遍，讲的人换了三个',
        '火盆边他坐了{n}回，听到了不少别处的门道',
      ],
      paid: [
        '他把听来的那段路数说给要出门的人，换回几枚铜币',
        '有人托他把听来的话带到别处，回来时口袋里有几个钱',
      ],
      hurt: [
        '他插了{e}回嘴，挨了顿骂，让人赶出火盆边',
        '有{e}回他听错了话，往回走的时候摔进了沟里',
      ],
      again: [
        '那段话还只讲到一半，火盆里的炭又添了一回',
        '讲故事的人还没回来，台阶上的位置空在那儿',
      ],
    },
    greet: {
      w: '搭话',
      more: [
        '这条路上的行商他搭过{n}回话',
        '他朝歇脚的人拱了{n}回手，认下的脸越来越多',
        '他在桥头站过{n}回，跟来往的人都点过头',
      ],
      paid: [
        '替行商指了段路，人家临走塞给他几枚铜币',
        '有人托他把话捎到下一站，先付了一半的钱',
      ],
      hurt: [
        '他搭了{e}回话，挨过两回白眼，也没少听难听的',
        '有{e}回他还没摘兜帽，就让人绊了一跤，摔在泥里',
      ],
      again: [
        '路口那副担子还搁在老地方',
        '树底下那块石头让人坐热了，又凉下去',
      ],
    },
  },
}

/**
 * 一句话里提到的物件。
 *
 * 用户 2026-10-04 的第 3 条：「上一次如果是和箱子有关，下一次就不要再在箱子上
 * 磨蹭了」。做法是给每句话认一下它讲的是什么东西，排下一行时把这些东西避开——
 * 于是连着两行不会都围着箱子转。
 *
 * 只是一张关键词表，认错了也不要紧：它的唯一用途是「别连着讲同一样东西」。
 */

/* ------------------------------------------------------------------ *
 * 2026-10-08：两份新句库并进老句库
 *
 * 一、OUT_SCENES —— 三类偏室内的活各多两件「走出去」的活：描残咒、送契书、
 *     下矿洞、拖法器、翻塔册、查夜哨（乱石岗、霜原、地下矿洞、河湾、废塔、夜哨）。
 * 二、HURT_PATCH —— 把「碰壁」那一档从手工失误改成**真的打起来**：原来那批
 *     写的是抄错、刀滑、尺子脱手，输赢都在桌子上；用户说他从来没看到过战斗。
 *
 * 两份都由子代理写成、各带自检（.scratch/check-fight.mjs 与 check-outdoor.mjs，
 * 286 + 114 条断言全绿），这里只做并入。
 * ------------------------------------------------------------------ */
/* 门外那六件活：偏室内那三类活，各补两件在外面的。
 *
 * 为什么补：用户说这一栏的文案还是不够奇幻，而且从来没看到过战斗；他要的是
 * 更多奇幻内容，不是主角整天在修补。改法不是给老场景加形容词，而是给
 * 改文件 / 跑命令 / 翻文件 这三类**各添两件走到外面去的事**——荒野、霜原、
 * 乱石岗、地下矿洞、废塔、夜哨，每一件事自己带一套开头、收尾和四档结局。
 *
 * 与 src/client.js 的关系：这两张表的**数据格式逐字对齐** SCENES / SHARDS。
 * - `OUT_SCENES` 是动作底下那两件事，要**追加**到 SCENES.adventure 里同名动作的数组尾巴上。
 * - `OUT_SHARDS` 是六件新事各自的四档结局，要并进 SHARDS.adventure（键就是场景 key）。
 * 子代理交付时一个字节都没往 src/client.js 里写。
 *
 * 句子末尾不带句号：跟老句库一样，句号由拼句那边补（fill() 之后统一加句号），
 * 所以这里的每一条都是句号前面那半句。自检是按句尾补上句号之后的整句判的。
 * 全份文件里一个阿拉伯数字、一个引号都没有，连注释里也没写，省得被朴素扫描误判。
 *
 * 物件不重复：一件事里，除了它自己的主题物件（咒 / 契书 / 抽水的机关 / 那件法器 /
 * 旧册 / 刻痕这几个），别的具体物件一个只许出现一处，一件事总共不超过两处。
 * 泛称（墙 / 水 / 雪 / 风 / 石 / 灰 / 土 / 光）和地名、人都不算物件——跟老句库
 * PROP_WORDS 的做法一样，只认具体名词：横档、梯子、匣子各算一样。
 *
 * 四档结局：`tail` 没次数可说（只做过一两次）、`more` 当天做了不止一次（`{n}`）、
 * `paid` 那天交出了东西（只写交活拿钱这一句，不记账）、`hurt` 那天撞过墙（`{e}`）。
 * 这一次 `hurt` 是真的挨打：有对手（枯手 / 石鸦 / 雪狼 / 劫道的 / 蝙蝠 / 水底的东西 /
 * 塔梁上那个东西 / 墙外伸进来的手 / 狼群），有来回（抓、甩、扑、挡、挣、咬），
 * 有代价（伤、烧掉的东西、散的干粮、丢的镐头、滚进沟的灯）。
 */

const OUT_SCENES = {
  // 改文件：走到乱石岗去描、抱着契书过霜原，两件都在门外
  改文件: [
    {
      key: 'ruin',
      w: '描残咒',
      // 2026-10-08（第三十六版）：这六件活原来一律 `place: null`（下面那道循环写死的），
      // 记号因此整场不在图上。现在各自有野地里的落点（包里标 `wild: true`）。
      place: 'ruin',
      lead: [
        '他翻过那道乱石岗，照着墙上那行旧咒往下描',
        '他拿炭条把风化掉的那半截咒脚补上',
        '他贴着石壁找那行被苔盖住的起首字',
        '他把墙灰扫开，认底下刻的到底是哪一年的事',
        '他用袖口擦过刻痕，辨出底下还压着一层更旧的笔道',
        '他绕着乱石岗走了半圈，从北边那道缺口翻进去',
      ],
      tail: [
        '墙头那层浮土被风刮下来，刚描的那行又糊了',
        '崩掉的一角他够不着，垫着碎石往上探',
        '火把烧到末了，剩下半行他只用指甲划了道浅印',
        '墙根那口枯井里起了响动，他停了手没再往下描',
        '末一笔他手上发颤，歪出了半指，就那样留在墙上',
        '墙上那行咒下面还压着半行更小的字，他没敢描',
      ],
    },
    {
      key: 'frost',
      w: '送契书',
      place: 'frost',
      lead: [
        '他把那卷契书揣进怀里，往霜原上走',
        '他牵着驮马踏过结冰的浅滩，往北边那个镇子去',
        '他在霜原上照着车辙走了大半日，天没黑就先扎了营',
        '他把那卷东西裹进油布里，又垫了一层干草',
        '他拿火镰敲了三下才点着篝火，就着火把绳子解开又系紧',
        '他出门那天北边霜脊山脉压着一层云',
      ],
      tail: [
        '雪落了一夜，第二天他踩着没膝的雪往北接着走',
        '过河的时候冰裂了一道缝，他把驮袋先拎过去，再回来牵那匹牲口',
        '天黑下来他还没看见镇子的灯，就着背风的石堆歇了一夜',
        '镇子外那道木栅关着，守门的翻过落款才肯开一条缝',
        '交出去的时候封口的火漆路上蹭掉了一角，收货的人捏着看了半天',
        '夜里他在背风处点了一小堆火，火光里雪片是斜着落的',
      ],
    },
  ],
  // 跑命令：下矿洞、拖法器，两件都是手上的活挪到了外头
  跑命令: [
    {
      key: 'mine',
      w: '下矿洞',
      place: 'mine',
      lead: [
        '他顺着矿洞口的木梯下到第二层，脚底下尽是积水',
        '他点起火绳去照底下那台铁家伙，头一截湿了不肯着',
        '他蹲在坑壁边把辘轳上的绳子重新绕好',
        '他拿铁钩去挑卡在轮槽里的碎石',
        '他把矿灯挂在撑木的钉子上，腾出两只手',
        '他顺着矿道往下走，壁上那些旧刻痕一路跟着',
      ],
      tail: [
        '机关转起来又停在原处，底下的水照旧往上渗',
        '他把塌下来的土培回去，木架还是歪的',
        '灯芯烧到发暗，他就着那点光把铁环又敲紧了些',
        '水没退下去，他先爬上坑口去换了一筐新火绳',
        '他坐在坑沿上听底下的水声，听出下面还有一层是干的',
        '底下那截坑道他走了一半就退回来，灯里的油不多了',
      ],
    },
    {
      key: 'quench',
      w: '拖法器',
      place: 'quench',
      lead: [
        '他把那件走火的法器用粗麻布裹住，一路拖到河边',
        '他挑了河湾里水最深的一处，先拿长竿试了深浅',
        '他把两头的绳子拴在岸边的石桩上',
        '他蹲在河滩上听那件东西里的响动，隔着布还烫手',
        '他退到柳树后面，等那圈纹路自己暗下去',
        '他把那件法器拖到河湾，浸到水里试了一回',
      ],
      tail: [
        '水面上冒起一串泡，他退回岸上盯着看',
        '那圈光从布底下漏出来，河底的沙一动一动，像底下还压着什么没走',
        '埋进去半尺他就托不住了，绳子在石头上磨出毛边',
        '河面结了薄薄一层冰，第二天早上他把冰面凿开一条口',
        '他把剩下的半卷粗麻布扔在岸上，那件东西还在水里响',
        '水面浮起一层白气，散开以后河湾又跟平常一样',
      ],
    },
  ],
  // 翻文件：废塔里的旧册、夜哨的刻口，两件都得自己走过去
  翻文件: [
    {
      key: 'tower',
      w: '翻塔册',
      place: 'tower',
      lead: [
        '他钻进那座塌了半边的塔，踩着断梁爬上第二层',
        '他扒开一堆碎瓦，底下压着一只没人动过的铁箍木箱',
        '他把旧册一本本抽出来，摊在窗台上翻',
        '他把发霉的那几本搬到亮处摊开',
        '他借着塔顶那道缝漏下来的光辨认封皮上的字',
        '他上废塔那天，塔顶还挂着半盏早就不亮的符灯',
      ],
      tail: [
        '风从塔缝里灌下来，把摊开的册页吹得乱翻，他伸手按住最上面那一页',
        '他翻到一半，塔身又塌下来一层灰，落了满头发',
        '底下那层传来脚步声，他把手里那本合上贴到墙边听',
        '有一页被他揭破了，字迹断在中间，他没敢再往下翻',
        '他把挑出来的那几本塞进箱笼，从塌口翻了出去',
        '翻到末几页，纸边上那些字像是被人用指甲划掉的',
      ],
    },
    {
      key: 'watch',
      w: '查夜哨',
      place: 'watch',
      lead: [
        '他跟守夜人一道沿着墙根走，一格一格看柱子上的刻口',
        '他把木牌搁在膝上，照着往纸上对',
        '他举着火把照墙根，认哪些是新添的',
        '他蹲在那排刻口前看了很久，数到一半又从头数',
        '他问守夜人去年冬天那几夜是谁值的',
        '他跟着巡夜的一路往北，走到城墙拐角',
      ],
      tail: [
        '那一片让雨糊了，他跟守夜人各认出一个',
        '后半夜风大，雪粒子横着打在脸上，他一直没停',
        '守夜人把手里的灯举高了些，说这几夜都没人打这儿过',
        '那只木牌让虫子蛀空了一半，刻痕一碰就掉渣',
        '他把对上的那几处圈出来，剩下的写在纸边',
        '墙上那道旧符已经焦了一半，管这一段的人说入冬前得换',
      ],
    },
  ],
}

const OUT_SHARDS = {
  ruin: {
    w: '描残咒',
    more: [
      '那面残墙他来回描了{n}遍，每一遍描到拐角就接不上',
      '那截断咒他照到羊皮上{n}回，笔画一回比一回虚',
      '他在这座塌了的镇子上耗了{n}个日头，带来的红土用去大半',
    ],
    paid: [
      '雇他描咒的人把铜币搁在门槛上，说墙外那一截等开春再描',
      '他把描好的那一卷交出去，收下工钱，顺带讨了一罐墨',
    ],
    hurt: [
      '他描到第{e}遍，墙里伸出一截枯手抓在他腕上，他甩开时蹭掉一块皮',
      '第{e}回撞上一群在废墟里过夜的石鸦，他护着脸挨了几下啄，怀里的干粮撒了一地',
      '墙缝里又探出一截枯手，他把残咒卷成棒打回去，小臂让抓出几道口',
      '第{e}回他踩进废墟的坑里，石鸦扑下来啄他后颈，他抱头滚出半丈，怀里那页也让水浸烂',
    ],
    again: [
      '那堵墙还立着半截，描到一半的那行让雨冲淡了半边',
      '拓坏的那几张还压在箱笼底下，边角都卷了',
    ],
  },
  frost: {
    w: '送契书',
    more: [
      '这条道他来回走过{n}趟，霜原上立着的路碑有一半没字',
      '同一趟差事他跑过{n}回，每一回都被雪堵在半道上',
      '北边那个镇子他进过{n}趟，镇上认得他的没剩几个',
    ],
    paid: [
      '收货的人把铜币摊在柜上，又把回信塞进他怀里',
      '他把契书交到对方手里，收下工钱，顺手讨了一夜的马厩',
    ],
    hurt: [
      '他在半道上被一群雪狼截住{e}回，马鞍上的箱笼撕开了，干粮撒进雪里',
      '第{e}回他撞上劫道的，肩上挨了一刀，血浸透了领口，那卷东西护在胸口才没让人夺去',
      '他在岔道上让一群雪狼围住{e}回，抡起断剑劈开一头，小腿还是让咬穿了一块',
      '第{e}回他在桥头撞上劫道的，契书塞进石缝，肩背挨了两棍，钱袋也让人抢走',
    ],
    again: [
      '那条路还剩半程没走完，缰绳一直绕在他手腕上',
      '另外那封信还压在他怀里，收信的人住在霜原更北头',
    ],
  },
  mine: {
    w: '下矿洞',
    more: [
      '那台机关他试了{n}回，每回都是转两圈就卡住',
      '坑壁上的水他舀过{n}遍，舀出去的水又渗回来',
      '他在坑里守过{n}夜，辘轳一转他就醒',
    ],
    paid: [
      '矿上管事把铜币按筐数点给他，说下个月还有一段要抽',
      '他把底下那摊水收住了，收下工钱，顺带要了两把新镐头',
    ],
    hurt: [
      '他在坑道里撞上一窝栖在石缝里的蝙蝠，脸上挨了{e}回扑，被抓开一道口子，手里的矿灯也灭了',
      '第{e}回水漫上来，水底翻上来一头没有眼睛的东西扯住他的脚踝，他挣开时把镐头丢了',
      '往前摸到第{e}处岔口，石缝里又钻出一窝蝙蝠，他挥铁镐赶散它们，耳朵被咬穿一块',
      '下到第{e}处水坑，水里那个没有眼睛的东西缠住他的小腿，他蹬开它时断剑脱手落了水',
    ],
    again: [
      '坑里的水还剩半人深，那台铁家伙还架在泥里',
      '换下来的湿衣裳搭在撑木上，火镰和油布都还在坑口',
    ],
  },
  quench: {
    w: '拖法器',
    more: [
      '这件走火的法器他拖过{n}趟，每一趟都是半路又烧起来',
      '他在河边守了{n}夜，水落一截他就用长竿往下捅一截',
      '他往那件东西上浇过{n}回水，浇一回就腾起一片白气',
    ],
    paid: [
      '雇他的人把铜币撂在河滩上，转身就牵着牲口走了',
      '他把那件东西交出去，收下工钱，只讨了河湾那块地方',
    ],
    hurt: [
      '那件东西第{e}回炸开，他抬手去挡，水里腾起一片白气，小臂上的皮燎掉一块',
      '第{e}回石桩松了，那件东西顺着水漂过来贴住他的腿，他甩开时整个人摔进水里',
      '那件东西在手里发烫，水面腾起一片白雾，他撒手退开，裤脚还是燎穿了',
      '第{e}回水面开裂，水底伸出一只青灰的手扯他的腰带，他掰开那几根指头，缆绳断了一股',
    ],
    again: [
      '那圈水纹还没散，东西压在河底，绳头还搭在岸边的草里',
      '岸边那块地方他用石头压了记号，来往的人绕着走',
    ],
  },
  tower: {
    w: '翻塔册',
    more: [
      '这座塔他在里头翻过{n}遍，每一遍都多出几本新的',
      '那一摞旧册他翻过{n}回，页边全让手指蹭黑',
      '他在塔上一待就是{n}个时辰，下来时耳朵里全是风声',
    ],
    paid: [
      '收旧册的人把铜币搁在台阶上，抱走一捆，说剩下那半捆明年来取',
      '他把挑出来的那几本交出去，收下工钱，又从里头抽回一本',
    ],
    hurt: [
      '塔里第{e}回有东西从梁上扑下来，他抬手挡了一下，手背被抓开三道',
      '他从塌口滑下去第{e}回，底下那层的东西跟着扑上来，他拿怀里的几本挡了一记，脚踝磕在石阶上',
      '塔中第{e}层有东西从梯口翻上来，他拿铁尺格了一下，爪尖顺着小臂划过去',
      '他从裂口摔到第{e}层，底下的东西整片涌上来，他抱着石栏滚开，膝盖磕出个口子',
    ],
    again: [
      '塔上那几本还摊在窗台上，翻到的地方压着块碎砖',
      '他没翻完的那一层还堵着塌下来的木头，梯子早断了',
    ],
  },
  watch: {
    w: '查夜哨',
    more: [
      '这一段墙他跟着走过{n}遍，每一遍都能多认出一个记号',
      '那本册子他核过{n}回，有几页的字跟前面接不上',
      '他在哨棚里守过{n}夜，火盆添到天亮',
    ],
    paid: [
      '管这一段的老兵把铜币搁在台阶上，说往南那一截等雪化了再查',
      '他把核对出来的那份交到公会，收下工钱，多抄了一份留着',
    ],
    hurt: [
      '第{e}回他在墙外那条道上走，一只手从石缝里伸出来抓住他的腕子，他挣开时灯滚进了沟',
      '后半夜起了狼群，他跟守夜人背靠着背退到哨棚门口，挨了{e}下咬，守夜人的胳膊见了血',
      '半道上第{e}次，墙根的砖自己松开，窜出一只灰毛的东西，他抬脚踢开，脚脖子让它啃破了皮',
      '守到第{e}更，沟边那排草里爬出一只带壳的活物，他拿竹竿挑进水里，胳膊让它抓走一条肉',
    ],
    again: [
      '对到一半就断了，守夜人的灯还挂在墙头',
      '对不上的那几页还夹在册子里，边上他用炭画了个圈',
    ],
  },
}

/**
 * 户外那六件活的位置：它们都落在**野地**里（乱石岗、霜原、地下矿洞、河湾、
 * 废塔、夜哨），所以位置写的是包里的野地 key，面板上就写那个地名。
 * 不去动 PLACES：图上那七处是城镇，地标（矿洞口、灯塔、废墟）是画着看的，
 * 自检里钉着「地标不是他能去的地方」，那是另一条线上早就定下的事。
 */
for (const [act, list] of Object.entries(OUT_SCENES)) {
  // 2026-10-08（第三十六版）：不再一律写成 `null`。这六件活现在各自有野地里的落点
  // （`place: 'ruin'` 等，包里也标了 `wild: true`），所以「他人在外面」这件事改由
  // 落点自己说；没写 `place` 的老场景仍然算在外面（跟从前一样）。
  for (const scene of list) if (scene.place === undefined) scene.place = null
  const pool = SCENES.adventure[act] || (SCENES.adventure[act] = [])
  pool.push(...list)
}
for (const [key, shard] of Object.entries(OUT_SHARDS)) SHARDS.adventure[key] = shard

/** 这六件事发生在野地里——世界句要用它判断人是不是在外面。 */
let OUT_KEYS = new Set(Object.values(OUT_SCENES).flat().map((s) => s.key))

/**
 * 任务 A —— 二十件事的「碰壁」那一档，全部改成真正的战斗（2026-10-08）。
 *
 * 起因是用户看完面板说的一句：「文案部分还是不够奇幻，也从来没看到过战斗。」
 * 诊断出来的事实：`src/client.js` 全篇四千多行里搜不到一个 龙 / 怪 / 兽 / 鬼 / 尸 / 血 / 战，
 * 而承担「碰壁」的 `hurt` 写的是手工失误——「他改坏{e}处，索性把那张契书撕了重写」。
 * 世界是奇幻的（地图上有精灵树、矮人矿洞、城堡、灯塔），句子却全在室内做手工。
 *
 * 这一版给每件事两条真打起来的话，三条硬要求：
 *  ① **有对手**——对面得是一个会动的东西，不是他手上的活计出错；
 *  ② **有来回**——他做了一件事，对面才退（挡、砸、捺、钉、割、夺）；
 *  ③ **有代价**——血、烧伤、断骨、少掉的人、烧掉的东西。
 * 而且**对手与场地必须合得上那件事**：抄咒文是纸上那行字立起来，修炉子是炉膛炸开，
 * 问路是在桥头被拦路的那两个堵住。交给用户看的反例：
 * `他抄错了{e}处，最后那张纸还是撕了`——那不是战斗，那是校对。
 *
 * 键与 `src/client.js` 里 `SHARDS.adventure` 的那二十个场景 key 一一对应，一个不漏、一个不错。
 * 本文件只是草稿池，不参与打包；要落地得走一次 splice（切进 SHARDS 的 hurt）。
 */
const HURT_PATCH = {
  spell: [
    '抄到第{e}笔，纸上那行咒文立起来扑他，他抬手挡了一记，手背让墨线割开了。',
    '誊到第{e}遍，纸缝里钻出一只灰皮的虫，他把银墨碗砸过去才逼退它，案角也让掀翻了。',
    '临到第{e}笔，纸上那行咒文缠住他的手腕，他咬断墨线才抽出手，虎口裂开一道口子。',
    '灰皮的虫又爬上来咬他手背，他把砚台扣下去砸碎了它，袖口让它啃掉半幅。',
  ],
  talisman: [
    '画到第{e}笔，符脚上窜出一只赤背的兽，他拿镇石把它捺回去，半叠符纸烧成了灰。',
    '描到第{e}张，银墨里立起一个没有脸的人影，他扯下斗篷罩住它，自己肩头烧穿了一个洞。',
    '描到第{e}笔，符脚上窜出那只赤背的兽，他把镇石推过去压住它，桌沿让撞裂一条缝。',
    '银墨里那个人影伸手抓他，他拿斗篷抽开它，手背让它烙出一片印子。',
  ],
  deed: [
    '刮到第{e}处，那方火漆裂开，里头伸出一只黑手，他拿刀背砸开它，指节磕出了血。',
    '改到第{e}处，押约那户人家提着剑找上门，他把契书按在怀里挨了一记，左肩到现在抬不起来。',
    '火漆缝里那只黑手掐住他脖子，他拿尺条撬开，喉口留下几道青印。',
    '那户人家提剑堵住门口，他抱紧契书挨了一脚，纸角撕掉半幅。',
  ],
  map: [
    '描到第{e}道路碑，图上那片废墟动了，两只狼大小的东西跨出纸面，他卷起图退到门口，肩上挨了一记。',
    '量到第{e}遍，图角上那道霜爬到他手腕，他拿灯油把它烧断，那半张旧图也一并烧没了。',
    '图上又跨出一只狼大小的东西，他拿图卷抽它，小腿让划开一道口。',
    '那道霜顺着图角爬上他手背，他拿灯油泼上去烧断，半截袖子也烧没了。',
  ],
  device: [
    '试到第{e}遍，那件法器挣开他的手，光里冲出一只铁翅的东西，他掀翻石台挡了一记，肩膀撞在墙上。',
    '退开第{e}回，它自己滚下来，唤出一群灰影，他点起火把把它们逼回纹路里，火把烧到了指头上。',
    '那件法器弹开，铁翅的东西从光里扑下，他抡石台顶过去，手背被翅尖划开一道。',
    '第{e}回纹路断了一截，灰影从缝里涌出来，他举火把一路撵回去，头发烧焦了一片。',
  ],
  gear: [
    '拆到第{e}遍，齿盘底下钻出一只铁壳的虫，他拿铜钳夹住它，虎口让它的牙划开了。',
    '对到第{e}遍，矿洞那头爬来一只石背的东西，他抡铜锤把它砸翻，小腿上还是挨了一口。',
    '齿盘翻过来咬住机轴，铁壳的虫爬上他手背，他拿铜钳磕开它，指节蹭掉一层皮。',
    '第{e}回铰链崩了，石背的东西从矿洞那头撞进来，他抡铁墩把它顶在岩壁上，脊背也撞青了。',
  ],
  stove: [
    '烧到第{e}回，炉膛炸开，火里走出来一只赤鳞的兽，他抄起铁钳把它捅回去，眉毛燎没了。',
    '捅到第{e}遍，风箱倒抽一口，窜出一条赤红的长虫，他抡钎子把它钉在砧上，半边袖子也烧成了灰。',
    '炉门让火顶开，赤鳞的兽从灰里立起来，他抡铁钳把它捅回去，额发焦了一缕。',
    '第{e}回风箱回火，赤红的长虫顺着钎子爬上来，他把它掼进炉膛，手背燎出一串水泡。',
  ],
  scroll: [
    '摊到第{e}卷，卷里伸出一只干枯的爪子，他拿裁刀割断那截纸才挣脱，腕上勒出一道血痕。',
    '翻到第{e}回，轴心里爬出一只生着灰翅的虫，他把整卷砸在地上踩住，那半截也碎成了渣。',
    '纸缝里钻出一只白蛾样的东西，他用铜尺把那一截压住，小指让翅粉烫起了泡。',
    '卷尾的封蜡自己裂开，蹿出一只带爪的东西，他拿压书的石镇把它砸回去，虎口裂了一道。',
  ],
  shelf: [
    '爬到第{e}层，高架上扑下来一只带爪的东西，他抱着横档挨了一记，后背让梯子磕青了。',
    '摸到第{e}回，顶层那排匣子后面盘着一条灰鳞的长虫，他拿火折子燎它，整排书都熏黑了。',
    '抽到第{e}格，书脊后面挤出一只灰壳的虫，他用册页夹住它，肩上让横档剐掉一块皮。',
    '梁影里垂下一只带爪的东西，他举着油灯挡了一记，灯油泼了自己半边袖子。',
  ],
  box: [
    '抬到第{e}只，箱底的锁自己弹开，窜出一只黑毛的兽，他拿绳子勒住它，手背上添了三道口子。',
    '捆到第{e}回，墙角那摞笼子塌下来，一只锈爪的东西从底下爬出，他把空笼扣过去压住，脚背也砸肿了。',
    '箱盖缝里挤出几根灰翅的虫，他把粗布蒙上去按住，手背上扎进三根木刺。',
    '箱底那层烂纸底下盘着一条黑鳞的长虫，他拿断剑挑开纸页，刃口在腿上划了一道。',
  ],
  book: [
    '翻到第{e}页，那个名字自己浮出来，灯影里站起一个亡者，他把册子砸过去，指缝里全是血。',
    '查到第{e}回，纸页间生出一只白蛾样的东西，他用火漆把那一页封死，手背让它的翅扫开一道口子。',
    '读到第{e}行，字自己挪了位，灯影里立起一个亡者，他把册子摔过去，手腕拧得生疼。',
    '纸背渗出一只灰白的蛾，他用铜镇纸把它摁在案上，指甲掀开半片。',
  ],
  ask: [
    '问到第{e}个人，巷子里那两个兜帽的把话头一断，掀翻了他的摊子，他挨了一棍，肋骨断了一根。',
    '问到第{e}回，佣兵会门口那几个披甲的围上来，他退到街上才脱身，箱笼让撕开了一道大口。',
    '巷子里那两个兜帽的把他按在墙上，他挨了两拳，嘴里全是血。',
    '那两个人跟出巷口，他从人堆里挤出去，左眼肿得睁不开。',
  ],
  road: [
    '走到第{e}个岔口，桥头那两个拦路的把他堵住，他夺下其中一根棍子才冲过去，肩上挨了一记。',
    '问到第{e}回，坡上下来一队骑手，他滚进沟里躲过，马刀削掉了半边斗篷。',
    '走到第{e}个岔口，那两个人从背后抄上来，他挨了一顿拳脚，倒进路边的沟里。',
    '走到第{e}段路，坡上下来一队骑手，他被一记马鞭抽中肩头，滚下坡去。',
  ],
  compare: [
    '对到第{e}回，吟游诗人不肯认账，抽刀把那两张纸挑成碎片，他挡了一记，手背划开一道。',
    '核到第{e}遍，三家说法里有一家派人来封口，他在巷口挨了一拳，抄好的那份也让人抢走了。',
    '那伙兜帽的抽刀就劈，他挡下来，肩上还是挨了一记。',
    '半路有人从背后一棍打翻他，怀里抄好的东西全让人夺走。',
  ],
  crew: [
    '托出去的人第{e}回挨了打，他赶过去把人背回来，半路上又挨了一记冷箭。',
    '第{e}趟托出去的人没回来，他沿着血迹追进林子，跟一头白毛的巨兽缠斗一场，手臂上留下三道抓痕。',
    '第{e}趟托出去的人困在林子里，他摸进去接，让白毛的巨兽撵着摔进了一个雪坑。',
    '他第{e}回进林子接应，进去就没了动静，让埋伏的从树后一箭射穿小腿。',
  ],
  route: [
    '第三趟走到第{e}个岔口上出了事，他赶过去时货散了一地，押货的人少了一个，他的腿上也挨了一箭。',
    '托出去的第{e}趟让人堵在桥上，他回头去接，只收回来半车东西，自己的左耳冻掉了一块。',
    '第{e}趟走到桥心让埋伏截住，他赶去接应，车辕折断，他自己磕破了额角。',
    '他托的第{e}趟绕岔口走，半路撞上劫道的，他上前去夺，肩上挨了一记闷棍。',
  ],
  poster: [
    '贴到第{e}张，悬赏上画的那只兽真的寻上门来，他把火把塞进它嘴里，胳膊上让它掀掉一块肉。',
    '贴出去第{e}天，一个戴兜帽的人来撕纸，两人在墙根动起手，他挨了一记冷刀。',
    '戴兜帽的那伙人寻到墙根来，他上前去挡，让一刀划开了半边下巴。',
    '贴满第{e}个村口，画上那只兽夜里寻上门来，他一把攥住它的前爪，腕子让它咬穿了。',
  ],
  chat: [
    '闲聊到第{e}轮，邻桌那两个醉汉把桌子掀到他身上，他挨了一拳，牙掉了一颗。',
    '说到第{e}句，靠门那桌一个披斗篷的拿话挤他，他把酒碗砸过去，脸上挨了一记，眼角裂开了。',
    '闲聊到第{e}句，邻桌那两个醉汉又扑上来，他挨了一记闷拳，嘴角裂到耳根。',
    '说到第{e}轮，靠门那桌的抄起条凳抡过来，他跳开半步，后腰还是被扫中。',
  ],
  listen: [
    '听到第{e}段，讲的那件事上的人寻上门来，火盆边动起手，他护住讲故事的人，背上挨了一记。',
    '讲到第{e}回，门外来了一伙要灭口的，他从窗子翻出去，跳下来时崴了脚。',
    '听到第{e}句，来的人把火盆踹翻，他护着讲的人往后门退，脊梁磕在桌角上。',
    '讲到第{e}段，那伙要灭口的冲进来，他挨了一板凳，趁乱滚出门去。',
  ],
  greet: [
    '搭到第{e}句，桥头那个兜帽底下不是人脸，他退了两步抽出断剑，肩头还是让它抓开了。',
    '拱到第{e}回手，对面那伙赶车的翻了脸，他挨了一鞭，躲进树后才脱身。',
    '搭到第{e}句，那兜帽往桥栏上一靠，他按着肩头退到桥头的石墩后面。',
    '拱到第{e}回手，桥头那两个把斗篷一扯，他夺过一根鞭子才挣开，腿让套马绳拖了半条街。',
  ],
}

/** 「碰壁」那一档换成真打：每个场景两条，二十个场景一条不漏（子代理逐 key 核过）。 */
for (const [key, list] of Object.entries(HURT_PATCH)) {
  const shard = SHARDS.adventure[key]
  // 末尾那个句号由拼句那边补（拼句是 `${lead}，${body}。`），句库片段自带句号就会
  // 拼出「。。」——子代理那批 hurt 有一半带了句号，2026-10-08 在探针输出里实测到。
  if (shard && Array.isArray(list) && list.length) shard.hurt = list.map((t) => String(t).replace(/。$/, ''))
}

/**
 * 新的户外物件补进 PROP_WORDS（子代理点名要补的那一批）。
 * 不补的话运行时认不出乱石岗、火绳、枯手这些东西，
 * 「一句话的两半不重复用同一个物件」那道闸门对户外那六件活就等于没装。
 */
const OUT_PROPS = [
  ['乱石岗', 'scree'],
  ['残墙', 'wall'],
  ['枯手', 'hand'],
  ['石鸦', 'crow'],
  ['驮马', 'mule'],
  ['浅滩', 'ford'],
  ['车辙', 'rut'],
  ['矿洞', 'mine'],
  ['坑道', 'mine'],
  ['辘轳', 'winch'],
  ['火绳', 'fuse'],
  ['矿灯', 'lamp'],
  ['河湾', 'bend'],
  ['柳树', 'willow'],
  ['断梁', 'beam'],
  ['碎瓦', 'tile'],
  ['哨棚', 'shed'],
  ['墙根', 'rampart'],
  ['石缝', 'crack'],
  ['符灯', 'lamp'],
  ['符牌', 'talisman'],
  ['法师塔', 'tower'],
  ['龙骨', 'bone'],
  ['灰烬', 'ash'],
]

let PROP_WORDS = [
  ['卷轴', 'scroll'],
  ['卷宗', 'scroll'],
  ['契书', 'deed'],
  ['符纸', 'talisman'],
  ['架子', 'shelf'],
  ['箱子', 'box'],
  ['梯子', 'ladder'],
  ['册子', 'book'],
  ['机关', 'device'],
  ['法器', 'device'],
  ['零件', 'parts'],
  ['齿轮', 'parts'],
  ['炉', 'stove'],
  ['火', 'stove'],
  ['洞窟', 'cave'],
  ['石台', 'bench'],
  ['石阶', 'bench'],
  ['酒馆', 'tavern'],
  ['货栈', 'market'],
  ['公会', 'guild'],
  ['灯', 'lamp'],
  ['纸', 'paper'],
  ['墨', 'ink'],
  ['笔', 'pen'],
  ['窗', 'window'],
  ['门', 'door'],
  ['汤', 'tea'],
  ['地图', 'map'],
  ['图', 'map'],
  ['路', 'road'],
  ['摊子', 'stall'],
  ['椅子', 'chair'],
  ['围裙', 'apron'],
  ['手腕', 'hand'],
  // 2026-10-07 魔幻调子带进来的一批新物件。不补进这张表，「别连着两行讲同一样东西」就认不出它们。
  ['羊皮', 'paper'],
  ['银墨', 'ink'],
  ['石板', 'slate'],
  ['镇石', 'slate'],
  ['火漆', 'wax'],
  ['齿盘', 'parts'],
  ['风箱', 'bellows'],
  ['箱笼', 'box'],
  ['匣子', 'box'],
  ['悬赏', 'guild'],
  ['商队', 'market'],
  ['旅店', 'tavern'],
  ['行商', 'trader'],
  ['吟游诗人', 'bard'],
  ['兜帽', 'cloak'],
  ['斗篷', 'cloak'],
  ['路碑', 'road'],
  ['火盆', 'brazier'],
  ['靴子', 'boots'],
  ['面包', 'bread'],
  ['汤', 'soup'],
  ['马', 'horse'],
  ['霜', 'frost'],
  ['干粮', 'ration'],
  ['水壶', 'kettle'],
]
// 户外的活带进来的那批物件（乱石岗、枯手、火绳、河湾……）。
// 合并必须落在这张表**定义之后**——放在前面会撞上「cannot access before initialization」。
for (const pair of OUT_PROPS) if (!PROP_WORDS.some(([w]) => w === pair[0])) PROP_WORDS.push(pair)

function propsOf(text) {
  const out = []
  const s = String(text || '')
  for (const [word, id] of PROP_WORDS) {
    if (s.includes(word) && !out.includes(id)) out.push(id)
  }
  return out
}

/**
 * 一句话里**原样出现**的那些物件词（不合并同义：卷轴与卷宗算两个词）。
 *
 * 用途只有一个——`pickShards` 里挡住「同一句话的两半用同一个词」：
 * 2026-10-05 抓到过「他把架子从上到下捋了一遍，那排架子他来回翻了几十趟」。
 * 这里按**词**而不按物件 id，是因为按 id 太狠：地图那一场的开头句句都带「图 / 线」，
 * 收尾句也带，一按 id 就整场比赛全灭，只能放宽到最后那档，反而开始重复。
 */
function wordsOf(text) {
  const s = String(text || '')
  return PROP_WORDS.filter(([word]) => s.includes(word)).map(([word]) => word)
}

function composeLine(entry, voice = DEFAULT_VOICE, recent = null) {
  const picked = pickShards(entry, voice, recent)
  return picked ? picked.line : null
}

/**
 * 地方 → 熟人。
 *
 * 用户 2026-10-07 第 2 条：「世界还是谁都不认识谁」——句子里早就出现过修书匠、守夜人、
 * 店主，但那些人是**按句子随机撒的**，不住在任何地方：今天在咒文室碰上修书匠，
 * 明天在法器坊又碰上他，读起来就是一群路人甲。
 *
 * 现在每个地方住一个**固定的**人：他到哪儿，碰上谁都是同一个。
 * 不给名字、不给身世（红线：他不是剧情人物，只是一个一直在那儿的人），
 * 身份是地方给的——所以「熟人」这件事不需要编造，它是地图上那栋房子本来就有的。
 */
let CAST = {
  scriptorium: '修书匠',
  workshop: '老铁匠',
  archive: '旧书贩子',
  market: '常来的行商',
  guild: '管悬赏板的老兵',
  tavern: '店主',
}

/**
 * 那个地方的人会说的话（**开头**，不带句号）。
 *
 * `{p}` 就是 `CAST` 里那个地方的人——用占位符而不是把名字写死，
 * 是为了「一个地方只有一个人」这件事只写在 `CAST` 一张表里，改名字只改一处。
 * 这些句子跟场景的开头放在同一个池子里挑，所以「最近几行说过的开头」那几道闸门照样管着它们。
 *
 * 为什么不会串场：**地方本来就是动作的函数**（见 `ACTION_PLACE`）——改文件必在咒文室、
 * 跑命令必在法器坊，所以咒文室那个修书匠不会跑到法器坊去。
 *
 * 还有一条约束：**这些句子里不提物件**（`propsOf` 认得出的一律不用）。
 * 因为「最近几行讲过的物件」是跨行避让的窗口（见 `pickShards` 里的 `clash`），
 * 熟人那句话要是带着灯、架子、摊子，就会把后面几行的场景筛空、逼出一堆重复。
 * 熟人出场讲的是**人**，不是东西——这条约束正好也是这个意思。
 */
let CAST_LINES = {
  // 咒文室：抄写、誊清、眼力
  scriptorium: [
    '{p}跟他说，这一页得从头誊一遍',
    '{p}把座儿往他那边挪了挪',
    '{p}给他腾出一块地方',
    '{p}跟他说今天这屋里太暗，眼睛吃不消',
    '{p}跟他说，法师塔要的那几卷得赶在入冬前交',
  ],
  // 法器坊：炉边的老手，急不得
  workshop: [
    '{p}跟他说，那块铁还得再烧一遍',
    '{p}把手上的活让给他，自己去喝水',
    '他蹲下来看{p}怎么下锤',
    '{p}跟他说这活急不得，差一点都不行',
    '{p}把铁块翻过来给他看，说这是从北边那片焦土里捡回来的',
  ],
  // 卷轴塔：旧书贩子，塔顶和没人翻过的那些
  archive: [
    '{p}带他上了塔顶那一层',
    '{p}跟他说那几摞早就没人翻过了',
    '他跟着{p}在里面绕了两圈',
    '{p}把最上面那格指给他看',
    '{p}说顶层锁着的那几摞里，有半卷是在霜脊山脉画的',
  ],
  // 打听铺：路上来的消息
  market: [
    '{p}刚从北边过来，跟他多说了两句',
    '他问{p}最近外面好不好走',
    '{p}跟他说这趟不好走',
    '{p}把自己那边挪了挪，给他腾出一块地方',
    '{p}刚从霜脊山脉那头过来，说那道口子雪封得早',
  ],
  // 冒险者公会：悬赏板、出去的人
  guild: [
    '{p}把最新的几张挑出来给他看',
    '{p}跟他说往北那条道这两天没人敢走',
    '他跟{p}核了一遍出去的人',
    '{p}让他再等两天，人还没凑齐',
    '{p}指着板上那张条子，说北边那片焦土上的事没人肯接',
  ],
  // 酒馆：来往的人、靠里的位置
  tavern: [
    '{p}给他留了个靠里的位置',
    '{p}跟他说这两天来的人比往常多',
    '他坐在柜台边跟{p}搭了两句话',
    '{p}把位置让了让，让他坐近点',
    '{p}跟他说，昨晚塔上的符灯灭了半宿',
  ],
}

/**
 * 拼一句他那边的话：**一句开头 + 一句收尾**。
 *
 * 两件事各有一个来源：
 * 一、**他在做什么** —— 动作底下的「场景」（`SCENES`：改文件底下有抄咒文 / 誊符纸 / 改契书 / 补地图）。
 * 二、**这件事怎么收场** —— `SHARDS` 的四档：交出过东西 / 撞过墙 / 做了很多遍 / 只说一次。
 *
 * 两边都从**同一个动作**里取，所以场景始终跟着你那天做的事走。
 */
function pickShards(entry, voice = DEFAULT_VOICE, recent = null) {
  // 认不出的语气先落到默认——不然「认不出的语气」会走一条既不是它、也不是默认的路。
  const id = VOICES[voice] ? voice : DEFAULT_VOICE
  const table = voiceOf(id)
  const tags = entry?.tags || []
  const mins = Math.round(Number(entry?.minutes) || 0)
  const ranked = rankedActions(tags, entry?.counts)
  let act = mainAction(tags, entry?.counts)

  // 连着三行都在同一件事上，就让第二件事顶上来。
  // 用户 2026-10-05 的裁决：「要，但要跟位置一起动」——换了事就换了地方，
  // 于是记号会走过去，走路的动画才有活干。
  if (recent && recent.streak >= 2 && ranked.length > 1) {
    const alt = ranked.find((a) => a !== recent.act)
    if (alt) act = alt
  }
  // `let`：户外的活会把位置改到地图外面去（见下面 `scene.place` 那一段）。
  let place = act ? ACTION_PLACE[act] : 'home'

  // **先看地方**：短段（≤5 分钟）的位置是落脚处，句子就得是落脚处的事——
  // 用户 2026-10-04 第 1 条：「现在他的位置在落脚点，那么需要做符合落脚点的事情，
  // 比如吃饭、睡觉、休息、做一些准备工作」。
  //
  // 2026-10-06：原来这里写死 `id === 'adventure'`（案牍那套只配说一句）。现在
  // `HOME_LINES` 归**世界包**管（`applyPack` 从选中的世界填），所以判据换成
  // 「这份家里话是不是空的」——薄世界包不给 `homeLines` 就退回共享句，不会崩。
  if (mins > 0 && mins <= 5) {
    const home = Array.isArray(HOME_LINES) && HOME_LINES.length ? HOME_LINES : [SHARED_LINES.fleeting]
    const line = pick(home, `${entry?.id || ''}|home`) || SHARED_LINES.fleeting
    return { line, props: propsOf(line), act, place, clause: null }
  }

  // 没有动作可讲：位置也在落脚处附近，说一句屋里的话。
  if (!act) {
    const line = tags.includes('深夜')
      ? SHARED_LINES.lateness
      : (mins >= 120 ? SHARED_LINES.satLong : SHARED_LINES.idle)
    return { line, props: propsOf(line), act: null, place, clause: null }
  }

  // 动作级那套（一个动作共用的）留作兜底：案牍语气没有场景库，只能走这一层。
  const byAct = SHARDS[id]?.[act]
  const fallback = table.lines[act]
  const n = Math.round(Number(entry?.counts?.[act]) || 0)
  const seed = `${entry?.id || ''}|${act}|${n}`

  // 最近几行讲过的物件和用过的开头，这一行避开。
  // 分两级放宽：先按「最近几行的物件 + 最近几行的开头」筛，筛空了只躲上一行，
  // 再空了就用全表——**保证永远有句子**，宁可重复也不能空着。
  const props = recent && Array.isArray(recent.props) ? recent.props : []
  const leads = recent && Array.isArray(recent.leads) ? recent.leads : []
  // 「地方 → 熟人」：每个地方住着一个固定的人（见 CAST）。他到哪儿，碰上谁都是同一个。
  // `fill` 把 `{p}` 换成那个人的身份。注意 `recent.leads` 里存的是**填好**的开头
  // （`composeSequence` 存的是拼出来的整句前半），所以下面几道闸门比的也得是填好的——
  // 不然熟人那几句永远匹配不上「最近说过没有」，同一个修书匠会连着两行出场。
  const who = place ? CAST[place] : ''
  const castPool = (who && CAST_LINES[place]) || []
  const fill = (t) => String(t == null ? '' : t).replace(/\{p\}/g, who)
  /**
   * 一句话的「开场」——`composeSequence` 记的是**第一个逗号之前**那半句。
   * 所以这里比的也得是同一个东西：pass2 那批「有人出场」的开头自己带一个逗号
   * （「新来的短工说，最底下那几只没人动过」），不这么切，这道闸门对它们等于没装
   * （2026-10-07 撞见的实况：同一个短工隔三行又说了一遍）。
   */
  const headOf = (t) => {
    const s = fill(t)
    const i = s.indexOf('，')
    return i > 0 ? s.slice(0, i) : s
  }
  const said = (t) => (recent && recent.leadSet ? recent.leadSet.has(headOf(t)) : leads.includes(headOf(t)))
  /**
   * 最近八行用过的**收尾句**（带占位符的原文）。
   * 定义放在 `pickFrom` 之前：兜底那一档也要用它，而 `pickFrom` 挑开头时就会被调用。
   */
  const usedClauses = recent && Array.isArray(recent.clauses) ? recent.clauses : []
  const reused = (t) => usedClauses.includes(t)
  const clash = (t) => props.length > 0 && propsOf(fill(t)).some((p) => props.includes(p))
  const prev = (t) => leads[0] !== undefined && leads[0] === headOf(t)

  /**
   * 按「先严后宽」依次试几档条件，**第一档筛得出东西就用第一档**。
   * 都筛空时还有两级：先挑「最近几行没用过的」，再退到全池——
   * 重复是最后才让的东西（用户最先抱怨的就是重复），但句子永远有。
   */
  const pickFrom = (list, preds, key) => {
    const all = (list || []).filter(Boolean)
    if (!all.length) return null
    for (let i = 0; i < preds.length; i += 1) {
      const got = all.filter(preds[i])
      if (got.length) return pick(got, `${seed}|${key}${i}`) || got[0]
    }
    // 兜底也要**先躲用过的**：2026-10-08 实测 `deed`（改契书）那三条 `more` 里两条总被
    // clash 排掉，于是同一句「那卷契书他改了{n}回」在八行里冒了两次。
    // 顺序仍然是「先舍用词不精，最后才舍字面重复」——用户最先抱怨的正是重复。
    const fresh = all.filter((t) => !reused(t))
    if (fresh.length) return pick(fresh, `${seed}|${key}z`) || fresh[0]
    return pick(all, `${seed}|${key}z`) || all[0]
  }

  /**
   * 今天这一行讲的是这个动作底下的**哪一件事**（见 SCENES）。
   *
   * 挑法：先用最近几行没讲过的，再看谁的物件不跟最近撞；两样都排掉才退回全池。
   */
  const sceneOf = (v) => {
    const p = SCENES[v]?.[act]
    if (!p || !p.length) return null
    const used = recent && Array.isArray(recent.scenes) ? recent.scenes : []
    // 记的是场景的**说法**（`w`），不是 `key`：`composeSequence` 里存的就是它。
    // 两个库的说法都记着（世界的 + 当前说法的），所以这里对哪一套库都有效。
    const rest = p.filter((s) => !used.includes(s.w))
    const cand = rest.length ? rest : p
    const fresh = cand.filter((s) => !(s.lead || []).some(clash))
    return pick(fresh.length ? fresh : cand, `${seed}|scene`) || p[0]
  }
  // **挑哪一件事、记号落在哪儿：只按这个世界那一套库**（`SCENES[WORLD_VOICE]`）。
  // 用户 2026-10-06 第 2 条（「切换的时候，不要改变其他内容，只改变叙事风格」）：
  // 换一套说法，地图上那枚记号一动不动，读起来还是同一天同一件事；
  // 「上一次讲的是哪件事」也按这一套记（见 `placeW` / `placeKey`）。
  const placeScene = sceneOf(WORLD_VOICE)
  // **怎么说这件事：当前说法自己那一套库**（它有几件事、各叫什么，是它的事）。
  // 它没给这一套库（薄包只写 `actionLines`）就用世界那一套，于是永远有话说。
  const scene = sceneOf(id) || placeScene
  // 收尾句跟着**场景**走，不跟着动作走。
  // 用户 2026-10-07 抓到的原句：「他拿尺子比着把河道往北挪，写到第几十遍，忽然对上了」——
  // 量河道配了「写到第几十遍」，两件事根本不是一件事。根子就在这儿：`more` / `paid` / `hurt`
  // 这三档原来是**动作级**的（一个动作底下所有场景共用），于是「抄咒文」的收尾会跑到
  // 「补地图」身上。现在按场景取（`SHARDS[id][scene.key]`，一件事自己一套），
  // 动作级那层只当兜底。
  // 户外的活（并入的 OUT_SCENES：描残咒、送契书、下矿洞、拖法器、翻塔册、查夜哨）
  // 把位置改到地图外面去。面板对这种情况有现成的说法——「地图外面」，
  // 比让记号假装还留在城里诚实。用户 2026-10-08 要的就是更多外面的活。
  if (placeScene) place = placeScene.place === undefined ? place : placeScene.place
  // 兜一道：世界要是没给这个地名（改世界包时写错了键），退回这个动作常去的地方，
  // 而不是让记号去找一个地图上不存在的房子。
  if (place && !PLACES[place]) place = ACTION_PLACE[act] || 'home'
  // **怎么说这一件事：当前说法自己那一条**——它按场景的键写的那份 `shards`
  // （`{ w, lead, tail, more, paid, hurt, again }`）。世界挑事、说法造句。
  // 这套说法没写这个场景键 → 退回动作级 → 再退回 `actionLines`。
  const says = (scene && SHARDS[id]?.[scene.key]) || null
  const shards = says || byAct
  // 那个地方的熟人跟这件事的开头**放在一起挑**：不是每行都有人出场（大约三四成），
  // 但出场的那些行里，来的人是这个地方的人。跟场景开头同一个池子，于是「最近几行
  // 说过的开头 / 撞过的物件 / 上一行」那几道闸门对它一样有效。
  // 他人在野地的时候例外：城里的熟人不跟着出门（`CAST[null]` 本来就是空的，
  // 但并进来的 `castPool` 还留着动作对应城镇的那个人——乱石岗那行冒出「修书匠跟他说」
  // 就是这么来的，2026-10-08 抓到的）。
  // 2026-10-08（第三十六版）改判据：原来只看 `placeScene.place === null`，现在六个
  // 户外的活都改成有落点了（`'ruin'` / `'frost'` …），所以改成**看那个落点是不是野地**
  // （包里标了 `wild: true` 的）。原来那一条留着，世界包要是还写 `place: null` 也照样管用。
  const at = PLACES[place]
  const cast = placeScene && (placeScene.place === null || (at && at.wild)) ? [] : castPool
  const leadPool = ((says && says.lead) || (scene && scene.lead) || (shards && shards.lead) || []).concat(cast)
  const tailPool = (says && says.tail) || (scene && scene.tail) || (shards && shards.tail) || []
  // 标签上那两个字也跟着**说法**走：同一件事，冒险叫「补地图」，船家可以叫「修船单」。
  const w = (says && says.w) || (scene ? scene.w : '')
  // 「上一行讲的是哪件事」记的是**位置那一套**的说法（见 composeSequence）：
  // 说法不该影响挑到哪件事，不然切个说法记号就换地方了（自检里那条「同一天同一件事在同一个地方」）。
  const placeW = placeScene ? placeScene.w : ''
  const placeKey = placeScene ? placeScene.key : ''
  if (!shards || !leadPool.length || !tailPool.length) {
    return {
      line: fallback, props: propsOf(fallback), act, place, w, clause: null,
      placeW, sceneKey: scene ? scene.key : '', placeKey,
    }
  }

  // 挑完开头才知道收尾句要躲哪样东西（`self` 的注释在后面）：先用空的占位，
  // 声明必须放在挑开头**之前**，否则 `wordsOf(lead)` 那句会撞上暂时性死区。
  let leadWords = []
  // 「他手上那件事还摊着」：最近几行里讲过**同一件事**，这一行就让它接着往下走。
  // 承接句（`shards.again`）放在**句子开头**，读起来才是「上次没做完，这次接着做」；
  // 放在收尾会变成「他今天干了 X，上次那件事还没完」——后半句像补注，不像过日子。
  // 这一档不动「不重复」那几道闸门：`again` 池本身就是「同一件事的延续」，
  // 撞的是它自己的词，正是要的效果；只要求别和上一行一字不差。
  const thread = recent && Array.isArray(recent.threads) ? recent.threads : []
  const again = shards && Array.isArray(shards.again) ? shards.again : null
  const back = !!(scene && again && again.length && thread.includes(scene.key))
  let lead = null
  if (back && pickIndex(`${seed}|again`, 100) < 55) {
    // 承接句也要躲「最近几行说过的开头」：`again` 每件事只有两条，只躲上一行的话，
    // 同一句承接会在八行里冒两次（2026-10-08 的冒烟抓到的就是 `那册子还摊在膝头上`）。
    // 两条都用过时宁可不承接，让下面的开头池子接手——字面重复比「没有后来」更难看。
    const fresh = again.filter((t) => !prev(t) && !said(t))
    lead = fresh.length ? pick(fresh, `${seed}|againline`) || null : null
  }
  if (!lead) {
    lead = pickFrom(leadPool, [
      (t) => !said(t) && !clash(t) && !prev(t), // 没说过、不撞物件、不接上一行
      (t) => !said(t) && !prev(t),              // 退一步：允许撞物件，但不许重复开场
      (t) => !clash(t) && !prev(t),             // 再退：允许重复开场，但不撞物件
      (t) => !prev(t),                          // 只求别和上一行一字不差
    ], 'lead') || fallback.replace(/。$/, '')
  }
  // 开头定了，才知道收尾句要躲哪个词（见上面 `self` 的注释）。
  leadWords = wordsOf(fill(lead))

  /**
   * 收尾句**也**要躲「最近几行刚用过的**那一句**」。
   *
   * 只躲物件是不够的：`more` 那一档每个动作只有六条，配上场景的 `fit` 之后可选更少，
   * 于是「那张纸他改了九回，边角都磨毛了」会在八行里冒出三次——用户第一次提的就是
   * 「同样的行为重复太多」。物件是意思上的撞车，这一道管的是字面上的撞车。
   * 仍然遵守「先严后宽」：`pickFrom` 会一档一档放宽，绝不会因此拼不出句子。
   * （`usedClauses` / `reused` 的定义挪到了 `pickFrom` 之前，兜底那一档也要用它。）
   */
  /**
   * 还有第三种撞车：**同一句话里的两半共用同一个词**。
   * 2026-10-05 出图时抓到的实例：「他把架子从上到下捋了一遍，那排架子他来回翻了几十趟。」
   * ——前半句和后半句都在讲架子。`leadWords` 在挑开头之前声明、挑完开头立刻填上，
   * 所以这里用闭包读：调用时读到的已经是填好的值。
   */
  const self = (t) => leadWords.length > 0 && wordsOf(t).some((w) => leadWords.includes(w))
  const clean = (t) => !clash(t) && !self(t)
  const clauseOf = (list, key) => pickFrom(list, [
    // 放宽的次序是**有讲究的**：用户最先抱怨的是重复，所以「这几行用过」要留到
    // 一切没用过的候选（哪怕跟场景不太贴合）都试完以后才舍——最后两档才是让步。
    (t) => !reused(t) && clean(t),
    (t) => !reused(t) && !clash(t),
    (t) => !reused(t),
    clean,
    (t) => !clash(t),
  ], key)

  /**
   * 四档的收尾句是**按动作**分的，场景是按**事**分的，两边不一定对得上
   * （比如「交活」那一档里有「他把改完的契书卷起来」——只有改契书那一件才对得上）。
   * 所以先挑「跟这一行的场景提到同一样东西」的那些；一条都没有，才退回整档。
   * 这样「他爬上梯子……他把改完的契书卷起来」这种串场就不会出现。
   */
  const sceneProps = scene
    ? [...new Set((scene.lead || []).concat(scene.tail || []).flatMap(propsOf))]
    : []
  const fit = sceneProps.length
    ? (t) => propsOf(t).some((p) => sceneProps.includes(p))
    : null
  /**
   * 「中性」= 这一条里一个具体物件都不提。
   * 为什么需要它：`fit` 全灭时退回来的那一句可能带着**别的**物件——
   * 2026-10-05 真机截图抓到的实例是 `device`（试法器）那一场配上跑命令的 paid
   * 「他把修好的机关交出去，收了工钱」：同一句里一半是法器、一半是机关。
   * 所以每一档在每个动作下都留一条不提物件的兜底句，`fit` 全灭时优先用它。
   * （中性的句子必然 `clean` 也不 `clash`：那两个判断都是按物件词算的。）
   */
  const neutral = (t) => propsOf(t).length === 0
  const clauseWith = (list, key) => pickFrom(list, fit
    ? [
      // **不许重复排在「贴合场景」前面**：`more` 那一档每个动作只有六条，
      // 配上 `fit` 之后常常只剩一两条可选，于是同一句会在八行里冒三次。
      // 所以先排掉用过的，`fit` 只在「不重复的候选」里当偏好。
      (t) => fit(t) && !reused(t) && clean(t),
      (t) => fit(t) && !reused(t) && !clash(t),
      (t) => neutral(t) && !reused(t),
      (t) => !reused(t) && clean(t),
      (t) => !reused(t) && !clash(t),
      (t) => !reused(t),
      (t) => fit(t) && clean(t),
      (t) => fit(t) && !clash(t),
      clean,
      (t) => !clash(t),
    ]
    : [(t) => !reused(t) && clean(t), (t) => !reused(t) && !clash(t), (t) => !reused(t), clean, (t) => !clash(t)], key)

  // 一、那天交出了东西 → 交活、拿钱（交付物是真实记录，钱只是描述）
  const paid = (entry?.deliverables || []).length
  // 二、那天撞过墙 → 他挨了几下（工具报错的次数）
  const fails = Math.round(Number(entry?.fails) || 0)

  let clause
  // 四档里挑哪一档，也走同一套稳定散列。
  // **不能简单按优先级硬排**——真实记录里大多数段落都交出过东西，
  // 硬排的结果是每行都在「交活拿钱」（2026-10-03 实测 6 行里 4 行全是钱），
  // 于是又变单调。所以交活只占一半，剩下的让给「成了 / 没成 / 挨了两下」。
  // 那天他那边有多不太平（0–100，见 dangerOf）。用户 2026-10-08 选了「每天都有可能」，
  // 所以挨打不再要求「先撞墙三次」——但仍然只落在 hurt 那一档，而且由真实处境加权：
  // 撞过墙、走夜路、坐得太久、人在外面，才更容易出事。同一条记录每次都得到同一场仗。
  // 四档怎么选不在这里了：它属于**世界的规矩**，住在 src/packs/<世界>/rules.js 里
  // （`.tmp-acp/verify-rules.mjs` 在十万种处境组合上逐格证明与原样写死的一字不差）。
  const { slot, tries } = rulesOutcome(entry, act, RULES, { place, shards })
  if (slot === 'paid') {
    clause = clauseWith(shards.paid, 'paid')
  } else if (slot === 'hurt') {
    // `tries` 至少是一：没撞过墙的那天也可能挨一下，但次数不能写成「第零遍」。
    clause = clauseWith(shards.hurt, 'hurt')?.replace(/\{e\}/g, countWord(tries))
  } else if (slot === 'more') {
    // 2026-10-04 收紧：只有约三分之一的行才提「做了多少遍」。
    // 用户原话「此类数字描写重复性太多了……不要每次都写数字内容」。
    clause = clauseWith(shards.more, 'more')
  } else {
    clause = clauseOf(tailPool, 'tail')
  }
  if (!clause) {
    return {
      line: fallback, props: propsOf(fallback), act, place, w, clause: null,
      placeW, sceneKey: scene ? scene.key : '', placeKey,
    }
  }
  // 「他」只留一个。开头已经以「他」起头，收尾那句要是也以「他」起头，拼出来就是
  // 「他把小凳搬到火盆边，他听到半夜才起身回去」——两句一个主语，读着像结巴。
  // 收尾接在逗号后面，主语还是同一个，把它开头那个「他」拿掉。
  const body = clause.replace(/^他(?=[^，。])/, '')
  // 这一行讲的是**他**。2026-10-07 放开句式之后（多了「物作主语」和「看院子的老人说……」这种
  // 间接引语）偶尔会拼出头尾都没有「他」的句子——老人出场的那条开头，配上一条不带「他」的收尾，
  // 读起来像贴在墙上的告示，不像他的日子。这时回头换一条带「他」的开头重拼。
  // 换不到就照原来的用：宁可这一行少一个「他」，也不能空着。
  if (!`${fill(lead)}${fill(body)}`.includes('他')) {
    // 换一条**带「他」**的开头重拼。2026-10-08 修：原来这里只躲上一行
    // （`!prev(t)`），于是**最近几行已经说过的开头**会被重新捡回来——承接句那半句
    // 不带「他」（「那半卷卷轴还摊在案上，绳结没系回去」）正好落进这道兜底，
    // 实测 `翻文件` 八行里「旧书贩子带他上了塔顶那一层」冒了两次。
    // 次序照旧「先严后宽」：先躲「说过的 + 上一行」，实在没有才只躲上一行。
    const him = (leadPool || []).filter((t) => String(t).includes('他'))
    const fresh = him.filter((t) => !said(t) && !prev(t))
    const pool = fresh.length ? fresh : him.filter((t) => !prev(t))
    const alt = pool.length ? pick(pool, `${seed}|him`) : null
    if (alt) lead = alt
  }
  const line = `${fill(lead)}，${fill(body).replace(/\{n\}/g, countWord(n))}。`
  // `clause` 回的是**带占位符的原文**（`{n}` / `{e}`），因为下一行要比的是「同一句收尾」，
  // 而占位符换成的字数每行都不同——拿换过的那句去比就永远比不上。
  // `slot` 也交出去：面板要知道这一行落的是哪一档，才决定要不要补一场交锋（见 `clashOf`）。
  return { line, props: propsOf(line), act, place, w, clause, slot, placeW, sceneKey: scene ? scene.key : '', placeKey }
}

/**
 * 一次把整个见闻录的话都拼出来。
 *
 * 顺序走一遍，把**最近几行**讲过的物件和用过的开头递给下一行——所以顺序不能乱，
 * 也不能只给某一行单独拼（那样就不知道它前面几行讲了什么）。
 * 顶上「他此刻」那一句和见闻录里最新那一行都从这里取，两处才永远一致。
 *
 * 窗口取「最近三行」是用户 2026-10-04 第 2 条逼出来的：只躲上一行时，
 * 隔一行的两行还会一模一样地开场（他截图里两行都是「他把落了灰的箱子一只只搬下来」）。
 */
/**
 * 缺 id 的记录（演示数据、手写的样本）在这里补一个**稳定**的 id。
 *
 * 为什么需要：见闻录每一行都要靠 id 去问「上一行讲了什么」「这一行该说什么」——
 * `composeSequence` 拿不到 id 就整个跳过它（那一行只剩 `dayLine` 兜底，行与行之间
 * 不再互相避让），`renderTimeline` 的 `prevOf` 也会把好几行挤在同一个键上，
 * 生活层（「隔了一夜」那些）就永远不出现。2026-10-05 在 preview.html 上撞见的
 * 就是这个：演示数据四条都没有 id，于是四行一句生活层都没有。
 * 用 `startedAt` 生成，跟数组顺序无关：两个调用方各跑一遍也得到同一个键。
 */
function withIds(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry, i) => {
    if (!entry || entry.id != null) return entry
    // 带上位置 i 当兜底：同一份演示数据里两条记录的 `startedAt` 常常一模一样（手写的样本、
    // 同一次落盘切出来的两段），只按时间生成就会撞成同一个键——`prevOf` 把两行挤到一起，
    // 「隔了一夜」那句就永远不出现（报告 B-11）。数组顺序对同一个调用方是稳定的，
    // 所以两个调用方各跑一遍仍然得到同一组键。
    return { ...entry, id: `anon-${Number(entry.startedAt) || 0}-${i}` }
  })
}

function composeSequence(entries, voice = DEFAULT_VOICE) {
  const list = withIds(entries)
    .slice()
    .sort((a, b) => (Number(a?.startedAt) || 0) - (Number(b?.startedAt) || 0))
  const out = new Map()
  // `streak` 数的是**连着几行都是同一件事**：到第三行就让第二件事顶上来（见 pickShards）。
  // `scenes` 记的是最近两行讲过的场景（存的是场景的说法，一说就认得出是哪一件），
  // 免得隔一天又翻回同一个箱子。
  // `threads` 记的是最近六行的场景 key：一件事隔几天又回来做，就该有「承接句」把它接上
  // （用户 2026-10-07：「每行都是独立事件，没有『后来呢』」）。只记在内存里、每次从记录
  // 重算，所以「连续性只存在于句子里」这条红线还在——不落盘、不编造，只是把同一件事的
  // 前后两行接起来说。
  const recent = { props: [], leads: [], leadSet: new Set(), act: '', streak: 0, scenes: [], clauses: [], threads: [] }
  const rowProps = []
  for (const e of list) {
    const picked = pickShards(e, voice, recent)
    const key = e?.id != null ? String(e.id) : ''
    if (key) out.set(key, picked)
    if (picked && picked.line) {
      // 只说开头那半句（不含逗号），因为候选表里存的就是不带标点的那半句——
      // 带着逗号存会让「用过的开场」永远匹配不上，等于这道闸门根本没装。
      const cut = picked.line.indexOf('，')
      const head = cut > 0 ? picked.line.slice(0, cut) : picked.line.replace(/。$/, '')
      recent.leads.unshift(head)
      recent.leadSet.add(head)
      if (recent.leads.length > 64) recent.leads.pop()
    }
    if (picked && picked.act) {
      if (picked.act === recent.act) recent.streak += 1
      else {
        recent.act = picked.act
        recent.streak = 1
      }
    } else {
      recent.act = ''
      recent.streak = 0
    }
    // 记的是**说法**（`w`）：两行之内不许重讲同一件事（那是「没话说」）。
    // 2026-10-06 起**两个库的都记**（世界的 `placeW` + 当前说法的 `w`）：
    // 位置与「最近讲的是哪件事」按世界那一套（换说法不该把记号挪走），
    // 但当前说法自己那套库也要能认出「这件事刚讲过」——两样都得在名单上。
    // 同一套库时两个值一样，去重后跟从前一字不差（默认世界那条路不受影响）。
    if (picked && (picked.placeW || picked.w)) {
      for (const t of [picked.placeW, picked.w]) {
        if (t && !recent.scenes.includes(t)) recent.scenes.unshift(t)
      }
      if (recent.scenes.length > 2) recent.scenes.pop()
    }
    // 场景 key 记六行，比 `scenes`（两行）远得多：两行之内不许重讲同一件事（那是「没话说」），
    // 隔三到六行又回到同一件事，那是「这件事还没完」——正是要承接的地方。
    // 两个库的 key 都记，理由同上（`again` 那一档是**按场景 key** 认「同一件事还摊着」的）。
    if (picked && (picked.placeKey || picked.sceneKey)) {
      for (const k of [picked.placeKey, picked.sceneKey]) {
        if (k && !recent.threads.includes(k)) recent.threads.unshift(k)
      }
      if (recent.threads.length > 6) recent.threads.pop()
    }
    // 最近八行用过的**收尾句**（带占位符的原文）：躲的是「同一句收尾又冒出来」。
    // 八行是因为 `more` 那一档每个动作有八条、场景的 tail 每个事有五条而事会轮换——
    // 窗口再大就只剩「放宽」这一条路，等于没装。
    if (picked && picked.clause) {
      recent.clauses.unshift(picked.clause)
      if (recent.clauses.length > 8) recent.clauses.pop()
    }
    // 物件只躲最近三行——躲太多会把表筛空，反而开始重复。
    rowProps.unshift(picked && picked.props.length ? picked.props : [])
    if (rowProps.length > 3) rowProps.pop()
    recent.props = [...new Set(rowProps.flat())]
  }
  return out
}

/**
 * 同一行的第二句话，**只讲生活，不讲活计**。
 *
 * 这是「日常」那条线：吃什么、什么时候起、什么时候歇、中间出去过没有。
 * 它不编造——每一个条件都来自真实记录里已经有的东西：
 * 这一段的钟点、它的长度、以及它跟上一段之间隔着多久（那正是你走开的时间）。
 * 条件不成立就没有这一行（大多数行没有），所以不会变成又一句套话。
 * （实现放在 `dayLine` 后面，因为 `export` 要和别的导出排在一起。）
 */

/**
 * 2026-10-05：原来这里有一张 `ACTION_ORDER = ['派了活','查资料','翻文件','跑命令','改文件']`
 * 的固定偏好表，用它挑那天的主线。删掉了——它让右栏永远压过左栏的次数排序
 * （详见下面 mainAction 的注释）。
 */

/**
 * 他此刻**在哪儿**。
 *
 * 位置跟语气无关：换一套说法，他还是站在同一栋房子门口。所以才要
 * 「地图 + 一栋房子」——多一个地点就是多一栋小房子，不是多画一整套美术。
 */
let ACTION_PLACE = {
  改文件: 'scriptorium',
  跑命令: 'workshop',
  翻文件: 'archive',
  查资料: 'market',
  派了活: 'guild',
  聊了聊: 'tavern',
}

/**
 * 你这边的小标签，翻成他那边的说法。
 *
 * 2026-10-04：用户说「标签上的描述也不丰富，几乎都是翻卷轴、抄咒文、试法器」。
 * 现在每个动作有好几个说法（`words` 里是数组），按 seed 取一个——同一个动作
 * 在不同日子里叫法不同，但左右两栏的顺序仍然一一对应。
 *
 * 2026-10-05：`first` 是那一行**句子里真正在讲的那件事**（见 SCENES：抄咒文 / 搬箱笼 / 修炉子……）。
 * 它排在第一枚，因为它才是这一行在讲的事；后面几枚还是那个动作的别的说法。
 * 这样标签就从「六个动作」变成「二十件事」——用户第 4 条要的丰富度在这里。
 */
function hisTags(tags, voice = DEFAULT_VOICE, seed = '', first = '') {
  const words = voiceOf(voice).words
  const out = first ? [first] : []
  for (const t of tags || []) {
    const w = words[t]
    if (!w) continue
    const list = Array.isArray(w) ? w : [w]
    const got = pick(list, `${seed}|word|${t}`)
    if (got && !out.includes(got)) out.push(got)
  }
  return out.slice(0, 3)
}

const IDLE_MS = 10 * 60 * 1000 // 十分钟内算「人还在」
const AWAY_MS = 3 * 60 * 60 * 1000 // 三小时以上算「出门了」

/**
 * 那天的主线是哪件事。
 *
 * 2026-10-05 用户第 3 条：「在他的冒险上，这里的行为也是具有重复性的，就感觉
 * 在卷轴塔做的事情差不多。」查出来的第一个根因就在这一行：
 *
 * 原来这里是 `ACTION_ORDER.find(...)`——一张**固定的偏好表**，`翻文件` 排在
 * `改文件` 前面。于是**只要那一段碰过翻文件，句子就永远讲翻找，位置也永远是卷轴塔**，
 * 哪怕左栏明明白白写着「改文件 ×103 / 翻文件 ×101」。
 * 左栏按次数排、右栏按偏好表排，两栏自己打架。
 *
 * 现在按 `tags` 的顺序挑——宿主写记录时已经按次数排好序了（见 src/index.js），
 * 所以左栏的第一名就是右栏的主线。老记录万一一个动作标签都没有，再看次数表。
 */
function mainAction(tags, counts = null) {
  const list = Array.isArray(tags) ? tags : []
  for (const t of list) if (ACTION_PLACE[t]) return t
  if (list.includes('聊了聊')) return '聊了聊'
  for (const [t] of rankedActions(list, counts)) return t
  return null
}

/** 按次数排好的动作名（`tags` 已经是排好序的，次数表只用来兜底）。 */
function rankedActions(tags, counts = null) {
  const out = []
  for (const t of Array.isArray(tags) ? tags : []) {
    if (ACTION_PLACE[t] && !out.includes(t)) out.push(t)
  }
  const table = counts && typeof counts === 'object' ? counts : {}
  for (const [t] of Object.entries(table).sort((a, b) => b[1] - a[1])) {
    if (ACTION_PLACE[t] && !out.includes(t)) out.push(t)
  }
  if (!out.length && (Array.isArray(tags) ? tags : []).includes('聊了聊')) out.push('聊了聊')
  return out
}

function lastEnded(entry) {
  return Number.isFinite(entry?.endedAt) ? entry.endedAt : entry?.startedAt
}

/** 那天的日子（本地时区），只用来判断「是不是隔天了」。 */
function dayKey(stamp) {
  const d = new Date(stamp)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 连续性**只存在于句子里**，不存在于数字里。
 *
 * 他已经出门了的时候，如果上一段收工是另一天的事，就顺口提一句上次在哪儿。
 * 这样门后面接得上，但屏幕上永远不会出现等级、天数、进度条、章节号——
 * 三天没来，他也不会停在原地等你。
 *
 * 同一段和上一段是同一天的话什么都不说：同一天的事不算「上次」。
 */
function carryOver(entries, voice) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && Number.isFinite(lastEnded(e)))
    .sort((a, b) => lastEnded(b) - lastEnded(a))
  if (list.length < 2) return ''
  const [latest, prev] = list
  if (dayKey(lastEnded(latest)) === dayKey(lastEnded(prev))) return ''
  const place = placeOf(prev)
  if (place === null || place === undefined) return ''
  return `上次见到他是在${placeName(place, voice)}。`
}

/**
 * 他**此刻**在做什么。
 *
 * 只看现在，不看昨天——这是「不催你」的全部实现。你三天没来，他也不会
 * 变得落魄、委屈或者荒废；他只是在过他自己的日子。
 *
 * 唯一的例外是「他出门了」那一句会带一句「上次见到他是在……」（见 carryOver）：
 * 那是**一句话**，不是状态，不累计、不显示天数。
 */
function narrationFor(entries, now, voice = DEFAULT_VOICE) {
  const lines = voiceOf(voice).lines
  const hour = new Date(now).getHours()
  // 他出门了 / 一条记录都没有：**钉在 `home`**（落脚处），不再写 `place: null`。
  // 用户 2026-10-08：「角色必须一直显示在地图上」——记号消失过太多次，
  // 看见的是「角色标记不见了，他又跑了界外去了？？」。
  // 他的日子本来就都发生在这张图上，所以没有「他这会儿不在地图上」这一档，
  // 也不再另立一枚兜底的野地（原来那枚叫 `road`／「界外」，2026-10-08 已删）。
  const away = { line: SHARED_LINES.away + carryOver(entries, voice), place: 'home', act: null, hour }
  const list = withIds(entries).filter((e) => e && Number.isFinite(e.startedAt))
  if (!list.length) return away

  let last = list[0]
  for (const e of list) if (lastEnded(e) > lastEnded(last)) last = e

  const since = now - lastEnded(last)
  if (!Number.isFinite(since) || since < 0 || since > AWAY_MS) return away
  if (since > IDLE_MS) return { line: SHARED_LINES.asleep, place: 'home', act: null, hour }

  // 此刻那一句必须和见闻录**最新那一行**一字不差，所以走同一套分行、同一套拼句：
  // 一行 = 五分钟一格（见 rowUnits），最新那一格就是此刻这一格。
  const units = rowUnits(list, now)
  const newest = units[0]
  if (!newest) return away
  const hit = sequenceOfUnits(units, voice).get(newest.key) || null
  const unit = unitOf(newest)
  const tags = unit.tags || []
  const mins = unit.minutes || 0
  const act = mainAction(tags, unit.counts)
  const place = act ? ACTION_PLACE[act] : 'home'
  const line = (hit && hit.line) || unitLine(newest, voice)

  // 「他此刻在哪」一律以**挑中的那一件活**为准：户外的活（描残咒 / 下矿洞 / 送契书…）
  // 自己带落点，只有挑不中（`hit` 为空）才退回动作那间屋子。
  // 不能写 `hit.place || place`：`null` 会被 `||` 当成「没值」，就会变成顶上说他站在
  // 法器坊、底下那句话讲的是矿洞（2026-10-08 渲染截图里抓到的正是这一处）。
  // 2026-10-08 晚（第三十六版）：原来只有最下面那一条分支看 `hit.place`，于是
  // 「凌晨那盏灯还亮着」与「一口气坐太久」这两支会把户外的记号悄悄换成城里的屋子——
  // 夜里打开面板，他明明在野地里，记号却回到卷轴塔。用户拍的是「角色必须一直显示在地图上」。
  const spot = hit && hit.place !== undefined ? hit.place : place

  // 最新那一行可能是一**卷**而不是一格：今天最近半小时里没有格子、今天更早却有
  // （见 foldLadder——2026-10-09 起只收今天，昨天起一概不进见闻录，所以这里不会再碰上
  // 昨天/上一周/去年那几档）。那一卷讲的是已经过完的一段，不是此刻：拿它当「此刻」会把
  // 今天早些时候那件事说成现在，记号也会往那件事的地方钉（`act` 给 null 就没这回事）。
  if (newest.roll === true) return { line: SHARED_LINES.asleep, place: 'home', act: null, hour }
  if (hour < 5) return { line: SHARED_LINES.lateness, place: spot, act, hour }
  if (mins > 0 && mins <= 5) {
    // 短段：他在落脚处，所以这一句也走 `composeSequence`（那是「回家干了什么」那一池），
    // 免得顶上说他歇着、底下列表还在讲翻了几个箱子。
    return { line, place: 'home', act: null, hour }
  }
  if (mins >= 180) return { line: SHARED_LINES.longSit, place: spot, act, hour }
  if (act) {
    // 走 composeSequence，不走单句：不然顶上这一句会和见闻录里最新那一行不一样
    // （那一行会避开它前面那行讲过的物件，单独拼就不知道前面讲了什么）。
    // 位置也从这里取：连着几段都是同一件事时他会换一件事做（也就换了地方），
    // 记号得跟着那句话走，不能句子讲改卷宗、人还钉在卷轴塔。
    return {
      line: line || composeLine(last, voice) || lines[act],
      // `spot` 可能是 `null`——见上头那段注释：户外的活他人在野地里，
      // 不能写 `|| place`，`null` 会被 `||` 当成「没值」。
      place: spot,
      act: (hit && hit.act) || act,
      hour,
    }
  }
  return { line: SHARED_LINES.idle, place, act: null, hour }
}

/** 那天他在哪儿（见闻录两栏里用）。跟 narrationFor 同一套判断，只是没有「现在」。 */
function placeOf(entry) {
  const mins = entry?.minutes || 0
  if (mins > 0 && mins <= 5) return 'home'
  const act = mainAction(entry?.tags || [], entry?.counts)
  return act ? ACTION_PLACE[act] : 'home'
}

/** 见闻录里那一天的他 */
function dayLine(entry, voice = DEFAULT_VOICE) {
  const tags = entry?.tags || []
  const mins = entry?.minutes || 0
  const act = mainAction(tags, entry?.counts)
  // 先看地方：短段（≤5 分钟）他在落脚处，说的就是落脚处的事。
  if (mins > 0 && mins <= 5) {
    const picked = pickShards(entry, voice)
    return (picked && picked.line) || SHARED_LINES.fleeting
  }
  if (act) return composeLine(entry, voice) || voiceOf(voice).lines[act]
  if (tags.includes('深夜')) return SHARED_LINES.lateness
  if (mins >= 120) return SHARED_LINES.satLong
  return SHARED_LINES.quiet
}

/** 生活层的句库，按条件分、按**说法**分。
 *
 * 2026-10-06 扩写（用户点的「扩写生活层」）。起因是句子库存盘点：
 * 生活层出现在 **78% 的行**上，可行前只有 9 句话——200 天里最多的四句各出现
 * 73 / 65 / 56 / 53 次，比任何一句活计都重复。现在五个条件各自 4~13 种说法。
 * 表里按说法分组（`morning.adventure`、曾经的 `morning.ledger` 也是这样）：
 * 换一个世界，这里就该有另一套说日子的词（冒险说窗板、灯芯、靴子）。
 * 谁没有自己那一池，那一行就不说生活句（见下面的 `lifeLine`）——宁可不写，
 * 也不拿别的世界的词去糊它。生活层不许提活计里的东西、也不许提钱：
 * 它是「日子」，不是「生意」。
 */
let LIFE_POOLS = {
  // 这一段开始于 5–8 点
  morning: {
    adventure: [
      '天刚亮他就起来了，炉子上的水还没开。',
      '他起得比左邻右舍都早，先把炉子生上。',
      '他把窗板推开，外面还蒙着一层白。',
      '他在灶上热了碗昨晚的汤，就着黑面包吃完。',
      '他把夜里晾在外头的靴子拿进来，鞋面上一层霜。',
      '他天不亮就醒了，躺着听了一会儿外面的风。',
      '他起来先把火拨旺，屋里这才亮起来一点。',
      '他蹲在门口把鞋带系紧，霜让他的指头有点僵。',
      '他打了桶井水洗脸，冷得直吸气。',
      '昨晚的干粮还剩半块，他就着凉水咽了。',
      '他出去看了一眼天，回来把斗篷搭在椅背上。',
      '他起来的时候，院里那只狗已经在门口等着了。',
      '他把炉子捅了捅，昨天的灰从底下漏下去。',
      '他起来先把檐下那盏符灯灭了，天已经亮开。',
    ],
  },
  // 这一段开始于 23 点后或 5 点前
  night: {
    adventure: [
      '镇上只剩他这一扇窗还亮着。',
      '他添了两回灯油，还没打算睡。',
      '他把灯芯剪短了一截，屋里暗下去一点。',
      '风从北边过来，他往火盆里添了两块炭。',
      '他打了个哈欠，又把手边的活拿了回来。',
      '外面的风声过去一阵，他还坐着没动。',
      '他把斗篷裹紧了些，炉子里的火已经矮下去。',
      '夜里起了风，窗子被吹得响，他起来扣紧了。',
      '他吹了灯又坐了一会儿，才摸黑躺下。',
      '他睡得晚，睡前把灶里的火压住了。',
      '屋檐上滴着水，他听着听着又坐了起来。',
      '他把靴子摆在床边，省得明早摸黑找。',
      '他起身添了把柴，回来看见火又旺了。',
      '法师塔的钟敲过一遍，他把案边的灯挑亮了些。',
    ],
  },
  // 与上一段隔了 3–20 小时（正是你走开的时间）
  out: {
    adventure: [
      '这中间他出去过一趟，回来手里多了个纸包。',
      '他离开了小半天，回来时靴子上还沾着泥。',
      '他出去走了一圈，回来身上带着外面的凉气。',
      '他中途出去了一趟，回来先把窗子推开透气。',
      '他回来时袖口卷着，肩上搭着斗篷。',
      '他出去办了点事，回来给自己倒了碗水，站着喝完。',
      '他出去了一阵，回来头发上还挂着雪。',
      '他回来的时候天已经擦黑，先把灯点上了。',
      '他出去了一趟，回来手里拎着半条干肉。',
      '他中间走开过一会儿，回来把外衣搭在门后。',
      '他回来得晚，脸上让风吹得发红。',
      '他出去走了一趟，回来鞋底上带着草屑。',
      '他离开的时候没关门，回来屋里凉了半截。',
      '他出去过一趟，回来把湿了的斗篷摊在炉边。',
      '他出去过一趟，回来手里捏着一张换来的符牌。',
    ],
  },
  // 与上一段隔了 20 小时以上
  overnight: {
    adventure: [
      '再坐到那个位置时，桌上已经落了层薄灰。',
      '回来时天已经放晴，他把窗板推开，光重新落回桌上。',
      '桌上的汤凉了，他换了碗热的。',
      '窗台上落了一层灰，他抹了一把。',
      '院门被风顶得直响，他回来时先去把门掩上。',
      '窗板上的霜化成水，滴在案子边沿。',
      '隔了一夜，他把布帘挂回钩上，屋里那股冷气还没散，他先添了柴。',
      '中间隔了一天，他回来时门口堆着新落的雪。',
      '隔了一夜，他昨晚留下的那盏灯已经灭了。',
      '中间隔了一天，他把斗篷上的土抖干净才进来。',
      '隔了一夜，他先把炉子生上，才坐下。',
      '中间隔了一天，锅里的水早就凉透了。',
    ],
  },
  // 一口气坐下超过 150 分钟
  longsit: {
    adventure: [
      '他中途歇过一回，啃了块干粮又坐回去。',
      '坐到腿麻，他站起来在屋里走了两圈。',
      '他起来添了一次炭，活动了下肩膀，又坐下。',
      '他起身把水壶坐到炉上，回来接着做。',
      '他坐得太久，起来把窗子推开透了会儿气。',
      '他中间出去站了站，看了看天，又回来坐下。',
      '他起来倒了碗水，喝完把碗搁在一边。',
      '他坐着坐着打起盹来，醒了之后揉了揉脸。',
      '他起身活动了下手腕，把斗篷脱了搭在椅背上。',
      '他中间歇了两回，炉子上的水都烧干了一次。',
      '他坐得久了，起来给灯添了点油。',
      '他停下来揉了揉眼睛，又把手边的东西拿回来。',
    ],
  },
}

/* ── 内容包：世界的句子与规矩从 src/packs/ 来 ────────────────────────────────
 *
 * 上面那些字面量是**地基**（装载前的旧底子，`SOURCE_CONTENT` 留着给自检对照）；
 * 运行时真正被读的是下面这一份——`src/packs/index.js` 把选中的世界与说法填进来。
 *
 * 为什么要有这一层：加一个世界（仙侠、规则怪谈）不该改这个文件的逻辑，加一个目录
 * 就行。规矩（什么算危险、什么算收获、外头多容易出事）也一样住在包里，
 * 只有「怎么讲」还留在这里。
 *
 * 判据是「只换来源、不换行为」：`.tmp-acp/golden-diff.mjs` 在 2304 格危险、
 * 576 条整句、288 条世界句、32 条生活句、12 条真实记录上逐条比较接线前后。
 */
const SOURCE_CONTENT = {
  SCENES, SHARDS, VOICES, WORLD_LINES, WORLD_QUIET, SHARED_LINES, HOME_LINES,
  CAST, CAST_LINES, PROP_WORDS, LIFE_POOLS, ACTION_PLACE, OUT_KEYS,
}

/** 这一套世界的规矩（`src/packs/<世界>/rules.js`），由 `applyPack` 填。 */
let RULES = null

/**
 * 这一套说法的高光事件（`src/packs/<说法>/moments.js`），由 `applyPack` 填。
 *
 * 2026-10-08 加（用户 m06647 第 2 条：要有标志性的故事、高光时刻）。**一天最多一件**，
 * 判条件的是 `momentOf`（读的仍是记录里真有的信号），落在日卷那一行下面。
 * 面板不掷点、不读「现在」：同一份记录永远得到同一件事。空表＝这一套不说事件。
 *
 * 导出来是为了让自检能对一眼「装上的就是包里那一份」（跟 `PLACES` 同样的理由）。
 */
let MOMENTS = []

/**
 * 这一套说法的**一天的框**（包里的 `dayFrame`），由 `applyPack` 填。
 *
 * 2026-10-08 加（用户 m07599 第 2 条：「角色时间要和用户的时间对得上，比如早上、中午、
 * 晚上都得吃饭，但有可能因为什么事而耽误」，以及他选的 C1「一天要有头有尾」）。
 *
 * 三样：
 *   `open`  这一天怎么起头——按这一天**第一格**的钟点挑，落在日卷那一行主句**上面**；
 *   `close` 这一天怎么收——按**最后一格**的钟点挑，落在这一行**最下面**（主句、高光事件、
 *           世界句、生活句之后），而且只有**过完了**的日子才说：今天那半截卷不该由他
 *           替你把话说完（见 `dayFrameOf` 的 `partial`）；
 *   `meal`  那顿饭——按钟点挑，`*Late` 是「让活耽误了」那一版，落在蓝框生活句那一格。
 *
 * 它跟 `MOMENTS` 一样**只住在包里**：不在 `SOURCE_CONTENT` 里抄第二份（那一份是装载前的
 * 旧底子，留着给自检对照）。薄包不给这一组时，`applyPack` 退回世界那一份。
 */
let DAY_FRAME = { open: {}, close: {}, meal: {} }

/**
 * 这一套说法的**交锋**（包里的 `clash`），由 `applyPack` 填。
 *
 * 2026-10-08 加（用户 m06647 第 2 条：「战斗项的内容实在太少了，我几乎没看到过任何战斗」，
 * 以及他后来的「全做」）。**挨打那一句从前只有一条**——「他挨了两下」就完了，读起来不像
 * 一场交锋。这一组把那一行补成**三拍**：主句（他挨了）之后，再补两句——
 * `hold` 是他怎么接住、怎么反手，`cost` 是这一场付出的代价与收场。
 *
 * 门槛只有两条，都是真的：
 *   · 这一行**落的是 `hurt` 那一档**（见 `outcomeOf`——挨打永远只来自真实的 `fails`）；
 *   · 这一天**没有高光事件**（事件本身就是一场仗，再叠一场就重了，一天只讲一件大事）。
 *
 * 形状：`{ [场景键]: { hold: [两句], cost: [两句] } }`，场景键与 `shards` 一一对应，
 * 所以交锋里的对手与场地跟那一行讲的事**必定合得上**（抄咒文不会挨马刀）。
 * 它跟 `MOMENTS` / `DAY_FRAME` 一样**只住在包里**，不在 `SOURCE_CONTENT` 里抄第二份。
 */
let CLASHES = {}

/**
 * 这一套说法的**序曲**（包里的 `origin`），由 `applyPack` 填。
 *
 * 2026-10-08 加（用户第 3 条：「他可以有名字，你取一个」，名字要类魔戒那种音译味）。
 * 一段**固定的**开场，按顺序说，不从池里挑：他叫什么、从哪儿来、落脚处落在哪块地方、
 * 靠什么换饭吃，最后一句把故事钉在这儿。名字**只说这一次**——全篇 1450 条句子照旧
 * 一律用「他」；名字一多就变成角色扮演了。
 *
 * 挂在**时间轴最老的那一行**上（`renderTimeline` 里挑），不是挂在「第 0 天」那个日卷上：
 * 折叠梯子越往前越粗（7 天收日卷、8 周收周卷、12 月收月卷），第 0 天那一行**迟早会被折掉**，
 * 序曲就跟着没了；挂在最老那一行则永远待在故事的开头，梯子粗到年卷也还在。
 *
 * 起点**不另存一份日期**：最早那条记录所在的那一天就是第 0 天。`records.json` 是唯一的
 * 权威（回填会把起点往前挪），另存一份只会跟它打架。
 *
 * 形状：`{ name: '塔里恩', lines: [六句] }`。它跟 `MOMENTS` / `DAY_FRAME` / `CLASHES`
 * 一样**只住在包里**，不在 `SOURCE_CONTENT` 里抄第二份。
 */
let ORIGIN = { name: '', lines: [] }

/**
 * 这一套说法的**方向与比例**（包里的 `directions`），由 `applyPack` 填。
 *
 * 2026-10-08 加（用户 m07234 第 2 条：「比例需要调整，如何才是合理的比例……请你思考一个方案」）。
 * 一天朝哪边走（涉险 / 攒盘缠 / 寻吃食 / 过日子），由**那天真有没有那件事**决定；
 * 表里那个 `cap` 是**上限不是配额**——判的时候看这一天之前所有日子里它已经占了多少，
 * 加上这一天会不会超过上限，所以「涉险」最多占一半，也不会被硬凑满。
 *
 * 它管三件事：① 这一天的抬头（`lines` 里挑一句，落在日卷那行的定场句下面）；
 * ② 危险系数动一档（`bias`，`rules.js` 的 `{ when: 'direction', … }` 读它）；
 * ③ 让「外头」那层按方向加权（同一张表，`rules.js` 的 `world.terms` 里那几项）。
 *
 * 算出来的方向**挂在记录上**（`entry.direction`）：`dangerOf` / `worldLine` 读的就是它。
 * 那是个**推出来的字段**，每次渲染都按同一份记录重算一遍，一个字节都不写回 `records.json`。
 *
 * 形状：`[{ id, label, cap, bias, when?, fallback?, lines: [...] }]`，顺序就是优先级。
 * 它跟 `MOMENTS` / `DAY_FRAME` / `CLASHES` / `ORIGIN` 一样**只住在包里**。
 */
let DIRECTIONS = []

/**
 * 这一套说法的**归宿**（包里的 `fate`），由 `applyPack` 填。
 *
 * 2026-10-08 加（用户 m08146「全做。」第 ⑤ 件：「归宿（年卷末尾一句收束，由聚合事实＋
 * 方向＋选择分布算出来）」）。前面几层算的都是**一天**的账，这一层算的是**一整年**：
 * 干过多少天、撞过多少回、交出去几件、那一年往哪个方向走得多、遇上事的时候多半走的是
 * 哪条路。挑中的那一件接在**年卷那一行的最下面**，是那一年的收束（见 `fatesFor`）。
 *
 * 形状：`[{ id, when?, lines: [...], close: '…' }]`，顺序就是优先级，**最后一件不带条件**。
 * `close` 是末尾那一句收束，**带他的名字**——那是全篇第二处、也是最后一处（第一处是
 * 开头那段序曲，见 `ORIGIN`；规矩 R15 认的就是这两处）。
 *
 * 它跟 `MOMENTS` / `DAY_FRAME` / `CLASHES` / `ORIGIN` / `DIRECTIONS` 一样**只住在包里**。
 */
let FATES = []

/**
 * 痕迹池：那一天挑过的那条路，**今天后面每一格**怎么说（2026-10-09 加，用户 m01903 第 2、3 条）。
 *
 * 用户第 3 条的原话是「用户当天的这些命运抉择，会在当天影响后续的日常事件」。做法：
 * 挑完那条路留下的东西记在**那一卷**上（`momentsFor` 把 `road.marks` 一并交出来），
 * 今天后面每一格再照它挑说法——**一格一句回声，过了午夜就没了**。
 *
 * 形状：`{ wound: { echo: [...], life: [...], world: [...], }, … }`，六个痕迹一个不许少
 * （名字在 `src/packs/rules.js` 的 `MARK_NAMES` 里）。三池挑哪一池，由**那一行**决定：
 *   - `echo`  跟活计无关的那一句：这一行本来没有世界句也没有生活句，挂它；日卷那一行一定挂一句
 *   - `life`  掺进起居的那一句：这一行本来要写生活句，改从这儿挑
 *   - `world` 外头怎么传的那一句：这一行本来要写世界句，改从这儿挑
 *
 * 三条：**只活当天**（不写进 `records.json`，也不跨天）、**只从真实行为来**（走的是哪条路
 * 是 `choiceOf` 按那天真有的信号挑的）、**一行最多一处回声**（免得同一行三句都在说痕迹）。
 *
 * 它跟 `MOMENTS` / `DAY_FRAME` / `CLASHES` / `ORIGIN` / `DIRECTIONS` / `FATES` 一样**只住在包里**。
 */
let MARKS = {}

/**
 * 一场仗（见 `FIGHTS` 与 `fightOf`）。用户 m14888：「唯一的缺点，就是极度缺少战斗，
 * 我真的两眼一黑。他必须有战斗。」
 *
 * 为什么要**一整层**、而不是给旧的那两句加几句：查过真存档，三十二条记录、一百零九个
 * 「记录 × 动作」对里 `hurt` 有 **58** 个——挨打一点都不稀。稀的是**它在屏幕上出现的
 * 机会**：一行只有一句（`${lead}，${body}。`），每个场景只有两条真打句，而且折叠之后
 * 日卷那行只剩一句概括。所以旧的那一层（`CLASHES`，见 `clashOf`）只能算「挨了一下之后
 * 补两拍」，没有对手、没有胜负、没有开头也没有收场。这一层改的是**形状**：
 *
 *   - **五种对手**（`foes`，顺序即优先级，最后一个不带条件的是兜底「劫道的」）：
 *     死了的东西 / 拦他的人 / 雪狼 / 荒原上下来的人 / 劫道的。**在哪儿遇上谁**由
 *     `scenes` 与 `hours` 定，跟记录里真有的信号对得上；
 *   - **三档**（`tiers`）：大（撞墙六次以上，七拍，收场常是「没死」而不是「赢了」）/
 *     中（两次以上，五拍）/ 小（兜底，三拍）；
 *   - **一场四到七拍**：遭遇（`meet`）→ 应对（`way`，中档以上才有）→ 交手（`trade`，
 *     中档两拍、大档三拍）→ 失算（`turn`，只有大档，从共用的 `turns` 里挑）→ 收场（`end`）；
 *   - **日卷末尾一句战报**（`report`）：说这一天打了几场、身上添了什么。折叠把
 *     具体的句子吞掉之后，靠它照样看得见「这一天打过」。
 *
 * 三条：**只在真挨打那一行挂**（门槛是这一行落的是 `hurt` 那一档，而 `hurt` 只来自
 * 记录里真撞过的墙，见 `outcomeOf`）、**梯子上那五分钟一格不挂**（那是刻度，在那儿铺
 * 一场打斗会把梯子读成别的东西）、**一天最多三场**（`MAX_FIGHTS_PER_DAY`）。
 * 挑句用这一行自己的种子：同一份记录看两遍，这一场仗一字不变。
 *
 * 它跟 `MOMENTS` / `DAY_FRAME` / `CLASHES` / `ORIGIN` / `DIRECTIONS` / `FATES` / `MARKS`
 * 一样**只住在包里**（`src/packs/adventure/fights.js`），不进 `SOURCE_CONTENT`。
 * 旧的 `CLASHES` 留着不接线——用户 m14810 第 6 条：旧句子留作备用。
 */
let FIGHTS = null

/**
 * 当日计划与册子上的路（2026-10-10 加，用户 m14781「我们需要按照一个人的一天来写」）。
 *
 * 用户 m14781 说现在这套「是随机的、不可预见的……只是在无序填充」，要的是「一个人在一个
 * 魔法世界里，他要如何度过一天，他有怎样的规划」。所以**先有打算，再有什么被看见**：
 *
 *   `JOURNEY.stations`（十一站，顺序即路线）＋ `JOURNEY.plans`（今天手上那几件事、这一季
 *   路通不通）＋ `JOURNEY.losses`（每描一处他身上少一分）。
 *
 * 算它的是下面两个：`dayPlanOf`（这一天在哪一站、手上有几件事、赶路还是歇脚）与
 * `stateAt`（**每五分钟**一个状态：在哪、在做什么、那件事到哪一步、册子到第几站、
 * 身上少了什么、带着什么、什么钟点）。判站在 `src/packs/rules.js` 的 `stationOf`
 * （第九台机器）——**走得最远的那一站说了算**，一个都没到过就是第一站。
 *
 * 它跟 `MOMENTS` / `DAY_FRAME` / `FIGHTS` 一样**只住在包里**
 * （`src/packs/adventure/journey.js`），不进 `SOURCE_CONTENT`。
 */
let JOURNEY = null

/**
 * 命运：他走到那儿，两条路，你得替他定一条（2026-10-10 加，用户 m16528 / m16534 / m16541 /
 * m16548 / m16552）。
 *
 * 用户 m16528 把旧的那一层否掉了：「这种选择，不叫命运……你现在给的都是日常，都很随意，
 * 都无足轻重。」他要的是**魔窟 / 暗堡**那样的岔口：各给一点环境描述，谁也猜不到后面是什么；
 * 而且**代价不可知**——「选都还没选，结果却已经知道了，那么命运就成了既定」。m16534 又拿
 * 《故事》的标准压了一遍（对抗力量、两难、鸿沟），m16541 要**直接写交手**（「为什么你总是
 * 避免战斗？」），m16548 允许**把他写死**，m16552 把整件事定成**一本书**：岔口选对了书往下讲，
 * 选错了就是分支——要么死，要么绕回主线；第二天册子把他收回来，**他不记得**。
 *
 * 所以这一层跟 `MOMENTS` 里那八件不是一回事：那八件是**日记的取材范围**（他今天在桌子边
 * 干了什么），这一层是**路上的危机**。内容在 `src/packs/adventure/forks.js`，
 * 判它的是 `src/packs/rules.js` 的 `forkOf`（哪一件压下来）与 `resultOf`（落哪一种结果）。
 *
 * 三条跟旧那层不一样：
 *   · **没有 `cost`**：按钮上只有地名与眼前那一句，一个字的账都不写；
 *   · 两条路里**只有一条是主线那一支**（`kind: 'main'`），走到分支上要么死（`then.die`），
 *     要么绕回主线（`then.back`）；
 *   · **死就是今天的终点**：右栏换成那一整块死亡页，今天剩下的时间不再写他任何一行。
 *
 * 它跟 `MOMENTS` / `JOURNEY` 一样**只住在包里**，不进 `SOURCE_CONTENT`。
 */
let FORKS = null

/** 一天最多几场仗（战斗.md 里定死的数）：再多就成了打斗集锦，不是一个人的日子。 */
const MAX_FIGHTS_PER_DAY = 3

/** 一天里那六档钟点（`dayFrame.open` / `dayFrame.close` 的键）。 */
const DAY_HOURS = [
  ['dawn', 0, 6],
  ['morning', 6, 11],
  ['noon', 11, 14],
  ['afternoon', 14, 18],
  ['evening', 18, 22],
  ['night', 22, 24],
]

/**
 * 那三顿饭的窗口（`dayFrame.meal` 的键）。
 *
 * 早饭从 **8 点**起，不是 6 点：5–8 点那一格已经由生活层的 `morning` 那一池说着
 * （「他在灶上热了碗昨晚的汤」），两处都说就重了。
 */
const MEALS = [
  ['breakfast', 8, 10],
  ['lunch', 11, 14],
  ['supper', 17, 20],
]

/** 钟点 → 档名（24 点归 night；负数与跨天也照旧落到某一档）。 */
function hourBucket(hour) {
  const h = ((Math.round(hour) % 24) + 24) % 24
  for (const [name, from, to] of DAY_HOURS) if (h >= from && h < to) return name
  return 'night'
}

/** 一个钟点落在哪顿饭的窗口里（不在窗口里返回 null）。 */
function mealWindow(hour) {
  const h = ((Math.round(hour) % 24) + 24) % 24
  for (const [name, from, to] of MEALS) if (h >= from && h < to) return name
  return null
}

/**
 * 这一天该说的「起头」与「收尾」（没有就返回空串）。
 *
 * 起头按这一天**第一格**的钟点挑，收尾按**最后一格**的钟点挑。挑法跟别的池子一样是
 * `pickIndex(seed, 池子长度)`，所以同一份记录看几眼都是同一句。
 *
 * 跨午夜那一段（晚上开工、过了零点才收）的收尾按 `night` 说：`endedAt` 落在 0–6 点，
 * 但这一天是从傍晚起的头，说「他做到天快亮才停手」就不对了。
 *
 * `partial` 是「今天还没过完」那半截卷（见 foldLadder）——那种卷不给收尾。
 */
function dayFrameOf(entry, partial = false) {
  if (!entry || !Number.isFinite(entry.startedAt)) return { open: '', close: '' }
  const seed = `${entry.id || ''}|day`
  const say = (pool, key) => {
    const list = ((pool || {})[key] || []).filter(Boolean)
    return list.length ? pick(list, `${seed}|${key}`) : ''
  }
  const from = new Date(entry.startedAt)
  const to = new Date(Number.isFinite(entry.endedAt) ? entry.endedAt : entry.startedAt)
  const open = say(DAY_FRAME.open, hourBucket(from.getHours()))
  const closeKey = to.getHours() < 6 && from.getHours() >= 18 ? 'night' : hourBucket(to.getHours())
  const close = partial ? '' : say(DAY_FRAME.close, closeKey)
  return { open, close }
}

/**
 * 这一格有没有一顿饭该说（没有就返回 `null`）。
 *
 * 用户 m07599 第 2 条：「早上、中午、晚上都得吃饭，但有可能因为什么事而耽误」。
 * 判据全来自记录里真有的钟点：把这一段的 `startedAt → endedAt` 按半小时走一遍，看它
 * 盖住了哪几顿的窗口（跨午夜也对）。盖住好几顿时，先报**被耽误的那一顿**（那是这一格
 * 里最有信息的一句），否则报最后盖住的那一顿。
 *
 * 「耽误」＝这一顿落在窗口的后半段（饭点正忙，拖到过了点才吃），或者这一段一口气坐下
 * 一百五十分钟以上。
 *
 * **一顿饭一格只说一次**：上一格（`prev`）也盖住同一顿的话，这一格就安静着——
 * 一整天连着三行都在吃饭，最像套话。
 */
function mealOf(entry, prev = null) {
  if (!entry || !Number.isFinite(entry.startedAt)) return null
  const start = entry.startedAt
  const end = Math.max(start, Number.isFinite(entry.endedAt) ? entry.endedAt : start)
  const mins = Math.round(Number(entry.minutes) || 0)
  // 半小时一步：这一顿头一次落进窗口的那个钟点也记下来（判断是不是拖过了点）。
  const at = new Map()
  const note = (t) => {
    const h = new Date(t).getHours()
    const name = mealWindow(h)
    if (name && !at.has(name)) at.set(name, h)
  }
  for (let t = start; t < end; t += 30 * 60 * 1000) note(t)
  note(start)
  if (!at.size) return null
  const lateOf = (name) => {
    const win = MEALS.find((m) => m[0] === name)
    // 「拖过了点」＝头一次落进这一顿的钟点是窗口的**最后一小时**（早饭 9 点、午饭 13 点、
    // 晚饭 19 点），或者这一段一口气坐了一百五十分钟以上（饭点正忙，压根没起身）。
    // 注意 `MEALS` 那三元组是 [名字, 起点, 终点]——最后一小时是 `win[2] - 1`。
    return mins >= 150 || at.get(name) >= win[2] - 1
  }
  const names = [...at.keys()]
  const delayed = names.filter(lateOf)
  const key = delayed.length ? delayed[delayed.length - 1] : names[names.length - 1]
  // 上一格也在这顿饭的窗口里 → 这一格不说（一顿饭只说一次）。
  if (prev && Number.isFinite(prev.startedAt)) {
    const pEnd = Math.max(prev.startedAt, Number.isFinite(prev.endedAt) ? prev.endedAt : prev.startedAt)
    for (let t = prev.startedAt; t < pEnd; t += 30 * 60 * 1000) {
      if (mealWindow(new Date(t).getHours()) === key) return null
    }
    if (mealWindow(new Date(prev.startedAt).getHours()) === key) return null
  }
  return { key, late: lateOf(key) }
}

/** 现在装的是哪个世界（包 id 与它在界面上那个名字）。 */
let WORLD_ID = ''
let WORLD_LABEL = ''

/**
 * 这个世界**自己那套说法**的 id（`world.voice`），由 `applyPack` 填。
 *
 * 2026-10-06 加的，是用户第 2 条（「切换的时候，不要改变其他内容，只改变叙事风格」）
 * 在地理之外的第二个锚点：**挑哪一件事、记号落在哪儿，一律按这个世界那一套库**
 * （`SCENES[WORLD_VOICE]`）；换说法只换「这件事怎么说」（见 `pickShards` 里的
 * `placeScene` 与 `scene` 两个变量）。所以它跟 `voiceId` 是两件事，不跟着说法走。
 */
let WORLD_VOICE = ''

/** 这个世界默认的主题 id（`THEMES` 的键），由 `applyPack` 填。 */
let WORLD_THEME = null

// ⚠️ 装载块不在这里，在下面地图那一节之后（`PLACES` 声明之后）。
// 原因很硬：它给 `PLACES` / `VIEW` / `MAP_SVG` / `MAP_CSS` 赋值，而 `let` 是**暂时性死区**的
// ——在这几行之前跑就会 `ReferenceError: Cannot access 'PLACES' before initialization`。
// 那四样（地理）跟句子不住在同一个地方：句子在地基那一节，地理在地图那一节。

/** 生活层那句话（可能没有，大多数行没有）。导出是为了让自检能单独钉住它。
 *
 * `avoid` 是上一行用过的那句——相邻两行说同一句最扎眼，所以往下递一道。
 */
function lifeLine(entry, voice = DEFAULT_VOICE, prev = null, avoid = '', mark = '') {
  const id = VOICES[voice] ? voice : DEFAULT_VOICE
  if (!entry || !Number.isFinite(entry.startedAt)) return ''
  const hour = new Date(entry.startedAt).getHours()
  const seed = `${entry.id || ''}|life`
  const gap = prev ? entry.startedAt - Number(prev.endedAt ?? prev.startedAt) : NaN
  // 同一个条件底下有好几种说法，先用上一行没用过的那几种。
  //
  // 只读**这套说法自己**那一池（按说法分组：`LIFE_POOLS[name][id]`）。原来这里写死
  // 「只有 adventure 与 ledger 说生活句」，并且少了哪一池就退到冒险那套去——
  // 那会让一个新世界用别的世界的词说自己的日子。现在谁没有那一池，这一行就安静着。
  const say = (name) => {
    const list = (LIFE_POOLS[name] && LIFE_POOLS[name][id]) || null
    if (!list || !list.length) return ''
    const fresh = list.filter((t) => t !== avoid)
    return pick(fresh.length ? fresh : list, seed)
  }
  if (hour >= 5 && hour < 8) return say('morning')
  if (hour >= 23 || hour < 5) return say('night')
  if (Number.isFinite(gap) && gap >= 3 * 60 * 60 * 1000 && gap < 20 * 60 * 60 * 1000) return say('out')
  if (Number.isFinite(gap) && gap >= 20 * 60 * 60 * 1000) return say('overnight')
  // 饭：到点了就得吃（用户 m07599 第 2 条）。`DAY_FRAME.meal` 是**已经按说法分好的**
  // 那一份（`applyPack` 填的），所以这里不用再按 `voice` 分组。
  // 排在 `out`/`overnight` 后面：出门回来那一句比「他停下吃了顿热的」更具体。
  const meal = mealOf(entry, prev)
  if (meal) {
    const list = ((DAY_FRAME.meal || {})[meal.late ? `${meal.key}Late` : meal.key] || []).filter(Boolean)
    if (list.length) {
      const fresh = list.filter((t) => t !== avoid)
      return pick(fresh.length ? fresh : list, `${seed}|meal`)
    }
  }
  // 痕迹：这一天挑过的那条路留下的东西，掺进起居里（2026-10-09 加，用户 m01903 第 3 条）。
  // 排在**饭后面**——到点了就得吃，那是硬事实；排在 `longsit` 前面——坐在那儿不动，
  // 不如「他今天只用一只手干活」具体。只活当天：`mark` 是这一格所属那一卷挑出来的。
  if (mark) {
    const list = (((MARKS[mark] || {}).life) || []).filter(Boolean)
    if (list.length) {
      const fresh = list.filter((t) => t !== avoid)
      return pick(fresh.length ? fresh : list, `${seed}|mark-life`)
    }
  }
  if (Math.round(Number(entry.minutes) || 0) >= 150) return say('longsit')
  return ''
}

/**
 * 痕迹那一句回声（`MARKS[mark].echo`）：跟活计无关的那一句。
 *
 * 一天里挑过一条路之后，今天后面每一格都在说这件事——可又不能每一格都提一遍，
 * 所以一行最多挂一处（见 `rowFor`：本来有世界句或生活句的行，那两句自己就带着痕迹了）。
 * 种子是**这一格自己**，所以同一份记录看两遍，这一句也一字不变。
 */
function markLine(entry, mark = '') {
  const list = (((MARKS[mark] || {}).echo) || []).filter(Boolean)
  if (!list.length || !entry) return ''
  return pick(list, `${entry.id || ''}|mark`)
}

/**
 * 那天他那边有多不太平（0–100）。
 *
 * 2026-10-08：用户看过面板之后说「从来没看到过战斗」，并且在选项里明确选了
 * 「每天都有可能」。旧门槛是 `fails >= 3`——而那条红线（2026-10-03 用户原话
 * 「没有 fails 他一下都不会挨，否则就成了随机故事机」）要防的是**挨打变成随机**，
 * 不是「非得先撞墙三次」。所以这里保留了它的精神：战斗仍然只落在 hurt 那一档，
 * 只是入场由真实处境加权，而不是一道写死的门槛。
 *
 * 确定性：同一个 `entry` 永远算出同一个数，所以同一条记录每次都是同一场仗，
 * 刷新页面不会换个结果。
 */
function dangerOf(entry, place = null) {
  // 那几个数字不在这里了：它们属于**世界的规矩**，住在 src/packs/<世界>/rules.js
  // （`.tmp-acp/verify-rules.mjs` 逐格证明与原样写死的一字不差）。
  const base = rulesDangerOf(entry, place, RULES)
  const bias = directionBias(entry)
  if (!bias) return base
  // 方向那一档在世界的分数**上面**加减（见 `DIRECTIONS` 的 `bias`）：涉险 +7、过日子 −7。
  // 世界那几项封顶 55，加完最多 62——仍然只是六成，不是必然（掷点是 0–99，
  // 到 100 才必然挨打；「上限不是配额」不该变成「必然挨打」）。
  return Math.max(0, Math.min(99, base + bias))
}

/**
 * 世界层那句话：他干活的时候，**外头**发生的事。
 *
 * 2026-10-08 用户原话：「我希望的是，我能看过更多奇幻内容，而不是主角整天都在
 * 修修补补。」在那之前，面板里只有他手上的活和生活层那点起居——世界再奇幻
 * （精灵树、矮人矿洞、城堡、灯塔），读到的也全是抄书和磨刀。这一层把「外头」
 * 补回来：他看见的、听见的、路上遇上的，**一句都不写他手上的活**。
 *
 * 桶按**真实处境**加权，不按时间硬排：撞过墙的人更容易碰上东西（encounter），
 * 深夜与清晨各有一套，有帮手或出过门就有 visitor，查过东西听过消息就有 news，
 * 人在外面走才有 road；都轮不上就从 quiet 里取一句城里的日常——**每一行都有一句**。
 *
 * 2026-10-05：第二套说法「案牍」被用户摘掉，收在 .parked/ledger-voice/。它当年没有
 * 自己的一份世界句词库，所以这里不许拿冒险这套去糊它。现在改判**这份词库是不是空的**：
 * 将来自带世界句的新世界不会被这道闸拦死，而真没有词库的世界仍旧安静着。
 */
function worldLine(entry, voice = DEFAULT_VOICE, place = null, avoid = '', sceneKey = '', mark = '') {
  if (!WORLD_LINES || !Object.keys(WORLD_LINES).length) return ''
  if (!entry || !Number.isFinite(entry.startedAt)) return ''
  const mins = Math.round(Number(entry.minutes) || 0)
  // 三五分钟的一段，外头来不及出事——那时候他连门槛都没出去。
  if (mins > 0 && mins <= 5) return ''
  // 痕迹：这一天挑过的那条路，外头是怎么传的（2026-10-09 加，用户 m01903 第 3 条）。
  // 排在**桶权重之前**：那天已经出过一件有代价的事，外头那句话就该是那件事的回声，
  // 而不是「卖柴的推车从门口过去」这种日常消息。三五分钟那一档仍旧安静（上面那道闸）。
  if (mark) {
    const list = (((MARKS[mark] || {}).world) || []).filter(Boolean)
    if (list.length) {
      const fresh = list.filter((t) => t !== avoid)
      const line = pick(fresh.length ? fresh : list, `${entry.id || ''}|mark-world`)
      return line ? String(line).replace(/\{e\}/g, countWord(Math.max(Math.round(Number(entry.fails) || 0), 1))) : ''
    }
  }
  const hour = new Date(entry.startedAt).getHours()
  const fails = Math.round(Number(entry.fails) || 0)
  const helpers = (entry.helpers || []).length
  const tags = Array.isArray(entry.tags) ? entry.tags : []
  // 「他人在外头」这件事的判据不在这里了——`worldWeights` 拿 `OUT_KEYS` 与 sceneKey 自己算
  // （`place === null` 或者这一行挑中的是户外的活）。
  const seed = `${entry.id || ''}|world`
  // 权重不是概率表，是「这种日子更可能听到哪一种消息」——由**世界的规矩**给
  // （src/packs/rules.js 的 worldWeights，数字与原样写死的一字不差）。
  const weights = rulesWeights(entry, place, sceneKey, RULES, OUT_KEYS)
  const total = weights.reduce((s, [, w]) => s + w, 0)
  let roll = pickIndex(`${seed}|bucket`, total)
  let key = 'quiet'
  for (const [k, w] of weights) {
    if (roll < w) { key = k; break }
    roll -= w
  }
  // `avoid` 是上一行用过的那句：相邻两行讲同一件事最扎眼，跟生活层一样往下递一道。
  const say = (k) => {
    const list = (WORLD_LINES[k] || []).filter(Boolean)
    if (!list.length) return ''
    const fresh = list.filter((t) => t !== avoid)
    return pick(fresh.length ? fresh : list, `${seed}|${k}`)
  }
  const line = say(key) || say('quiet')
  return line ? String(line).replace(/\{e\}/g, countWord(Math.max(fails, 1))) : ''
}

/**
 * 那天谁帮过他
 */
function helpersFor(entry) {
  // 导出的函数对 null 不设防：预览页、自检、以及别处手写的样本都可能传半截数据进来，
  // 一个 `TypeError` 会把整块右栏连坐掉（报告 B-10）。
  const n = (Array.isArray(entry?.helpers) ? entry.helpers : []).length
  // 写成汉字，不写阿拉伯数字：右栏（他那一栏）一个数字都不许有，
  // 数字全归左栏那几行「改文件 ×12」——这是这一版的分界线，自检里有一条红线盯着。
  return n ? `有${countWord(n)}个帮手还在外面。` : null
}

/**
 * 屋里的光：跟 DSH 的亮/暗色无关，只跟现在几点有关。
 * 白天是白天的样子，夜里只有一盏灯——这比任何一句「现在是晚上」都直接。
 */
function daylight(hour) {
  if (hour >= 8 && hour < 17) return { dusk: 0, glow: 0 }
  if (hour >= 17 && hour < 19) return { dusk: 0.3, glow: 0.45 }
  if (hour >= 19 && hour < 22) return { dusk: 0.55, glow: 0.85 }
  // 2026-10-30 地图审计 M-12：深夜那层从前只有 0.78 × 0.45 = 0.351，黑得不彻底——
  // 「深夜」看着像「傍晚晚一点」。现在 0.86，CSS 那边系数提到 0.52，合起来 0.447，
  // 路灯那一圈也更收（见 renderStage 的 `nightR`）。
  if (hour >= 22) return { dusk: 0.86, glow: 1 }
  if (hour >= 5) return { dusk: 0.45, glow: 0.6 }
  return { dusk: 0.86, glow: 1 }
}

/* ------------------------------------------------------------------ *
 * 天黑了：把屋子里的每种材料往夜色里掺一点
 *
 * 早先是拿一个半透明矩形盖在整间屋子上。那会把屋子外面那块地方也染黑，
 * 在面板里就是一个突兀的灰方块。改成掺色之后，屋子自己变暗，
 * 而灯还照样亮得出来。
 * ------------------------------------------------------------------ */

const DIM_KEYS = [
  '--gf-room-edge',
  '--gf-land', '--gf-land-2', '--gf-water',
  '--gf-land-farm', '--gf-land-elven', '--gf-land-rock', '--gf-land-sand',
  '--gf-roof-hi', '--gf-roof-mid', '--gf-roof-lo',
  '--gf-wood-hi', '--gf-wood-mid', '--gf-wood-lo',
  '--gf-paper-hi', '--gf-paper-mid', '--gf-paper-lo',
  '--gf-cloth-hi', '--gf-cloth-mid', '--gf-cloth-lo',
  '--gf-cloak-hi', '--gf-cloak-mid', '--gf-cloak-lo',
  '--gf-stone-hi', '--gf-stone-mid', '--gf-stone-lo',
  '--gf-skin', '--gf-leaf', '--gf-leaf-elf',
]

function parseColor(value) {
  const s = String(value || '').trim()
  const h = s.match(/^#([0-9a-f]{6})$/i)
  if (h) {
    return [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16), 1]
  }
  const r = s.match(/^rgba?\(([^)]+)\)$/i)
  if (!r) return null
  const p = r[1].split(',').map((x) => Number(x.trim()))
  if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}

/** 掺色。纯函数——所以反复调用不会一次比一次黑。 */
function dimForDusk(tokens, dusk) {
  const out = {}
  if (!(dusk > 0)) return out
  const night = parseColor(tokens['--gf-dusk-color']) || [27, 35, 64, 1]
  const t = Math.min(dusk, 1) * 0.55
  for (const key of DIM_KEYS) {
    const base = parseColor(tokens[key])
    if (!base) continue
    const c = [0, 1, 2].map((i) => Math.round(base[i] + (night[i] - base[i]) * t))
    const a = Math.round((base[3] + (night[3] - base[3]) * t) * 1000) / 1000
    out[key] = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 那扇门后面的地图：简笔等距，用代码画的
 *
 * 不加载任何图片。整张地图是几十个等距方块拼的，颜色全走 CSS 变量，所以
 * 「古籍图书馆」这类主题是**换一组颜色**，不是重画一套美术。
 *
 * 为什么是地图不是一间屋子（2026-10-02 用户反馈原文）：「门背后是一个房间，
 * 而小人在房间里。这是不对的，因为这样的话，我们需要有很多房间，准备很多
 * 美术素材。所以我希望房间后面是一张地图，然后显示主人公在哪个地方进行
 * 活动即可。」——一张地图 + 七栋小房子，多一个地点就是多一栋房子。
 * ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * 地图的那一层。
 *
 * 2026-10-03 用户看完等距那一版（22×15）之后说：「确实你修改了图块颜色，但是，
 * 在用户眼中的理解其实是：这是一个小镇的地图，而不是世界地图。因为它的比例看起来
 * 非常小镇化，可能需要更加缩放，有更多内容。你是否明白一张平面世界地图模样，
 * 并且我们加上现在的这些建筑来充当重要的城镇」——还贴了两张参考：一张《权游》的
 * 政治地图（整块大陆、各国染色），一张羊皮纸世界地图（河流、山脉、森林、道路、罗盘）。
 *
 * 之后走了很长一段弯路：把地图交给代码**现画**——山、林、河、城全是一个个函数
 * 算出来的多边形，光形状就从 637 个堆到九千多。那条路后来被用户否了
 * （「是不真实，和我给的参考图不是一个东西」），根因是**画种**：
 * 带统一描边的多边形是图表的语言，参考图是画出来的。
 *
 * 2026-10-06 定案：地图是**画好的一整段 SVG**——先由 `.scratch/ground2.py --ship`
 * 在 Python 里画出来，内联成一段死数据，进面板时灌进一个 `<g>` 就完事。
 * 好处是它不再跟任何公式绑在一起——**哪一笔不对就改哪一笔**。
 * 代价是它不跟着主题变量走色（地图有自己的配色，切主题只影响面板本身）。
 *
 * 2026-10-07/08：那套 Python 渲染器被**等值移植**进 `src/map/`（`world.js` 画、
 * `world3.js` 只有 15 KB 数据），于是地图改成**运行时现画**——画法与当年那段死数据
 * 逐字节相同（`scripts/smoke.mjs` 拿 `.scratch/map-data.js` 钉着这件事）。
 * 它跟 2026-10-06 被否掉的那种「代码现画」不是一回事：画法是画出来的（笔触、排线、
 * 明暗都在 `world.js` 里逐笔写死），由数据铺开的只是「哪儿有什么」。
 *
 * 下面这一层（`VIEW`、`PLACES`、记号、地名签、灯）是**叠在地图上**的东西，
 * 它们跟地图共用同一套世界坐标，所以对得上；地图不动，动的只有它们。
 */

/**
 * 画进 SVG 的那个框。地图现在是一整段画在世界坐标里的 SVG（由世界包带来），
 * 有东西的地方是 x 16~82、y 11.5~45.5——西边那片海从 16 起，东边那两座离岛
 * 到 81.4，南北各留一点。框就按这个开，地图正好撑满，不留白。
 *
 * 这个框同时也是**记号与地名签的坐标系**：`PLACES[].door` 用的就是世界单位。
 * x/y/宽/高，单位跟画布一样。
 *
 * 2026-10-06：值搬到 `src/packs/adventure/world.js`（跟地图、地点一起，**必须成套**），
 * 这里是装载前的占位。谁的地图配谁的框，校验器 R11 管这条。
 */
let VIEW = { x: 16, y: 11.5, w: 66, h: 34 }

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

/**
 * 值没变就不写属性。
 *
 * 写一次 SVG 属性就是一次重算——夜罩那条 `radialGradient` 尤其贵：改它的圆心，
 * 用它铺满整张世界图（或整扇地方图）的那个矩形就得整块重栅格化。鼠标在地图上划的
 * 时候圆心每帧都会被算一遍，可它其实只在「换地方」和「换时辰」时才真的变（第四十四版）。
 */
function setAttr(node, key, value) {
  if (node && node.getAttribute(key) !== value) node.setAttribute(key, value)
}

/**
 * 地图上的地点。
 *
 * `door` 是他站在城镇门口的位置（也是「他现在在这儿」那个记号钉下去的地方）；
 * 名字按说法给——但**地方是同一个地方**。
 *
 * 坐标是**平面**的：x 向右、y 向下，单位就是画布单位（96×54 那张图里的一格）。
 * 上一版是等距的格坐标，改成正俯视之后就不需要投影了。
 *
 * 2026-10-06：**值搬到 `src/packs/adventure/world.js`**（跟地图、取景框一起）。
 * 地图换成手绘那一版（`.scratch/world2.py` 重排过的世界）之后，大陆在世界坐标
 * x 18~80 之间，七个点整体挪过一轮——**城镇画在哪儿，坐标就得跟到哪儿**
 * （地图是画出来的，坐标是钉上去的，两边对不上记号就会站在海里）。
 * 这里是装载前的占位（空表），`applyPack` 把选中世界那一份填回来。
 *
 * 西边是人类帝国的草原与镇子（酒馆、公会、打听铺、落脚处都在这一片），
 * 东北是精灵的林子（卷轴塔、咒文室），东南是矮人的矿洞（法器坊在山脚下）。
 */
let PLACES = {}

/* ── 装载：世界的句子、规矩、地理一次填进来 ──────────────────────────────────
 *
 * 上面那些字面量是**地基**（装载前的旧底子，`SOURCE_CONTENT` 留着给自检对照）；
 * 运行时真正被读的是这一份——`src/packs/index.js` 把选中的世界与说法填进来。
 *
 * 为什么要有这一层：加一个世界（仙侠、规则怪谈）不该改这个文件的逻辑，加一个目录
 * 就行。规矩（什么算危险、什么算收获、外头多容易出事）与**地理**（地图、取景框、
 * 地点坐标）也一样住在包里，只有「怎么讲」还留在这里。
 *
 * 判据是「只换来源、不换行为」：`.tmp-acp/golden-diff.mjs` 在 2304 格危险、
 * 576 条整句、288 条世界句、32 条生活句、12 条真实记录上逐条比较接线前后。
 *
 * **位置是有讲究的**：这一段必须排在它要填的每一个 `let` 之后（`PLACES` / `VIEW` /
 * `MAP_SVG` / `MAP_CSS`），否则就是暂时性死区——句子那一节在地基后面，地理这一节
 * 在地图后面，所以装载落在这里。
 */
{
  const content = applyPack({})
  ;({
    SCENES, SHARDS, VOICES, WORLD_LINES, WORLD_QUIET, SHARED_LINES, HOME_LINES,
    CAST, CAST_LINES, PROP_WORDS, LIFE_POOLS, ACTION_PLACE, OUT_KEYS, RULES, MOMENTS, DAY_FRAME,
    CLASHES, ORIGIN, DIRECTIONS, FATES, MARKS, FIGHTS, JOURNEY, FORKS,
    // 地理四件套跟句子一起来：**世界包里就带着它这个世界的样子**。
    PLACES, VIEW, MAP_SVG, MAP_CSS, WORLD_THEME, WORLD_ID, WORLD_LABEL, WORLD_VOICE,
  } = content)
  // 默认语气也归包管（`src/packs/index.js` 的 `DEFAULT_VOICE`）：这里只是接过来。
  DEFAULT_VOICE = content.DEFAULT_VOICE || DEFAULT_VOICE
}

/**
 * 他现在这个地方叫什么。
 *
 * 2026-10-06 用户第 2 条（「切换的时候，不要改变其他内容，只改变叙事风格」）之后
 * **地名跟世界走**：地图上写着哪个名字，就是这个世界给的那个名字（`place.name[WORLD_ID]`）。
 * 换一套说法，地图上那七个名字一个字都不动——只有他嘴里的话变了。
 *
 * `voice` 参数留着当退路（某个世界包没给这个地名时按它找），也留着当这条规矩的读法：
 * 名字是按「哪个世界」取的，不是按「谁在讲」取的。于是夜航船自带的那套河上地名
 * （渡口酒棚、水文楼…）眼下用不上——那套名字留在包里，等将来真有「换世界」的入口再说。
 */
function placeName(id, voice = DEFAULT_VOICE) {
  const place = PLACES[id]
  if (!place) return ''
  const names = place.name || {}
  return names[WORLD_ID] || names[voice] || names[DEFAULT_VOICE] || Object.values(names)[0] || ''
}

/** 地图本身。建一次就够了，它不会变。 */
function buildMap(g) {
  // 2026-10-06：地图整个换成**画好的一整段 SVG**；2026-10-08 起那套画法移植进了
  // `src/map/world.js`，由 `world3` 那点数据在**运行时现画**（结果与当年那张图逐字节相同）。
  //
  // 上一版是**代码现画**的：山、林、河、城全是一个个函数算出来的多边形。那套东西
  // 每一处都要用公式描述（「这座塔窄 2px 更好看」也得改公式），改一处等于改整张图，
  // 用户每次只能回一句「不好看」，我也无从知道是五十个决定里的哪几个错了。
  //
  // 现在这版走的是第三条路：**画法是画出来的（笔触、排线、明暗都在 `src/map/world.js`
  // 里逐笔写死），但由 `world3` 那点数据在运行时铺开**。一张世界图 480 KB 的 SVG
  // 由此得来（`node .scratch/render-diff.mjs` 验过与 Python 逐字节相同），
  // 地方图那二十张同理——二十张 14.4 MB 塞不进产物，现画反而更省。
  // 代价是它不跟着主题变量走色（地图有自己的配色，见 `src/map/README.md`）。
  //
  // 灌进这个 <g> 就完了——里面只有国名与地貌名两类文字，没有位图。红针、地名签、
  // 夜里那盏灯都是 buildStage 另外叠上去的：**地图不动，动的只有它们**。
  //
  // 2026-10-31（t28）：这 554 KB、两千多个形状的 innerHTML 解析，实测在挂载那一次要
  // 260ms ParseHTML + 340ms EvaluateScript（trace 里就是这两个数），而挂载的时候面板
  // 是 display:none 的——为一扇可能永远不开的门先付全价。现在面板那一路改成
  // **第一次打开时才铺**（`buildStage({ deferMap: true })` + `stage.fillMap()`），
  // 自检里那些直接调 `buildStage()` 的地方照旧立刻铺（默认不延后）。
  g.setAttribute('class', 'gf-map')
  g.innerHTML = MAP_SVG
}

/** 地图建一次；灯和那枚记号每次刷新时挪。 */
function buildStage(options) {
  // 2026-10-31（t28）：`deferMap` 只给真面板用——地图那一坨等到第一次开门再灌，
  // 见 buildMap 末尾那段注释。默认 false，自检里 `buildStage()` 的行为一个字没变。
  const deferMap = !!(options && options.deferMap === true)

  // viewBox 就是内容本身，四周不留白——空白会按比例变成面板里的高度。
  //
  // 2026-10-05：用户说「地图的内容还是不够大，需要更大，也就是继续缩小比例」。
  // 画布是 96×54，可是真正有东西的地方是 x 2.4～93.5、y 6.3～52.6
  // （最西那两座小岛和西南角的罗盘也要算进去，所以左边只切掉 2 个单位）。
  // 裁掉那圈用不上的海之后，同样的面板宽度里陆地大了约 5%，
  // 剩下的大头靠面板从 424 长到 560px（见 .gf-room）。
  const svg = svgEl('svg', { viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`, 'aria-hidden': 'true' })

  // 这张地图要有个名字，放大镜底下那层才能用 `<use>` 把它借过去——
  // 借的是同一份 DOM，**不复制一个字节**（镜内那 3 倍就是这么来的，零成本）。
  // 类名在这里就给上（2026-10-31，t28）：地图可以晚一点灌，但「图在这儿」这件事
  // 从建的那一刻就得成立——`.gf-map` 是版面、图层与自检认它的唯一凭据。
  const map = svgEl('g', { id: MAP_ID, class: 'gf-map' })
  if (!deferMap) buildMap(map)
  svg.appendChild(map)

  // 提灯照地（2026-10-08，第四十二版）：夜罩用的那圈渐变。
  // 圆心每帧跟着记号走（`renderStage` 的 paint 里写 cx/cy），半径随时辰变——
  // 傍晚铺得开、深夜只剩脚下那一圈。颜色走 CSS（`#gf-night stop`），跟夜罩同一个令牌。
  // 用户在 m17683 里要的就是这个：「用效果来告知用户现在是晚上，所以地图变暗了。」
  //
  // **全图和细节版共用这一条**：它是世界坐标里的渐变，细节版又是换 viewBox 换出来的，
  // 所以同一块地在两级里都是同一片光，不需要任何倒推。
  const defs = svgEl('defs')
  const night = svgEl('radialGradient', { id: NIGHT_ID, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 9 })
  night.appendChild(svgEl('stop', { offset: '0', 'stop-opacity': '0' }))
  night.appendChild(svgEl('stop', { offset: '0.30', 'stop-opacity': '0.06' }))
  night.appendChild(svgEl('stop', { offset: '0.55', 'stop-opacity': '0.52' }))
  night.appendChild(svgEl('stop', { offset: '1', 'stop-opacity': '1' }))
  defs.appendChild(night)
  svg.appendChild(defs)

  // 细节版那一层。**它没有任何 transform**——`viewBox` 一换成 22×11.35 那扇窗，
  // 里面这两层就自动是 3 倍：底下是世界图自己（`<use>` 借的是同一份 DOM，零成本），
  // 上面是现画的地方图（坐标系就是世界坐标，天然 1:1）。
  //
  // 分两层是为了拖动。2026-10-08 量出来的：按住拖的时候只挪世界图那层，
  // 252 帧里掉 1 帧；真挪那张 4700 个元素的地方图要掉 21 帧（8%）。
  // 所以拖动时把地方图那层收起来、让世界图跟手走，松手以后再画地方图（见 zoomSwap）。
  const zoom = svgEl('g', { class: 'gf-zoom', id: ZOOM_ID, display: 'none' })
  const zoomPan = svgEl('g', { class: 'gf-zoom-pan' })
  const zoomWorld = svgEl('g', { class: 'gf-zoom-world' })
  zoomWorld.appendChild(svgEl('use', { href: `#${MAP_ID}` }))
  // 地方图那一层**一开始不带 `gf-map` 类**，等真画进去才加。
  // 自检里「换世界不重画地图」数的是 `gf-map` 的张数，一开头就带类会当场打红；
  // 而 `src/map/local.js` 的样式跟世界图共用同一批类名（`.mw` 海浪、`.mh` 排线…），
  // 全都挂在 `.gf-map` 底下，所以画的时候必须带上。
  const zoomLocal = svgEl('g', { class: 'gf-zoom-local' })
  // 丙：拖动时顶上来的一张位图（整张世界图的 3 倍）。默认藏着，只在拖动且烘好时才露。
  // 它必须排在 `zoomWorld` **前面**——同一层里后画的盖住先画的，位图是地面。
  const zoomBit = svgEl('g', { class: 'gf-zoom-bit' })
  const zoomShot = svgEl('image', { class: 'gf-zoom-shot', x: 0, y: 0, width: f2(VIEW.w), height: f2(VIEW.h) })
  zoomBit.appendChild(zoomShot)
  // 夜罩：烘出来的是白天的图，夜里那一层得自己补——同一个类名、同一条 CSS
  // （`#gf-zoom .mnight`），圆心还是他脚下那块地（见 renderStage 的 paint）。
  zoomBit.appendChild(svgEl('rect', { class: 'mnight', x: 0, y: 0, width: f2(VIEW.w), height: f2(VIEW.h) }))
  zoomPan.appendChild(zoomBit)
  zoomPan.appendChild(zoomWorld)
  zoomPan.appendChild(zoomLocal)
  zoom.appendChild(zoomPan)
  svg.appendChild(zoom)

  // 灯、记号、地名签**都包在这一层里**，浮在细节版上面——地图是地面，
  // 界面不该被它盖住。
  //
  // **这一层在细节版里写一个反缩放**：`translate(p) scale(1/3) translate(-p)`，
  // `p` 就是他脚下那块地（`nightAt`，见 zoomOverlay）。细节版的 viewBox 小了三分之一，
  // 这一层要是不管，记号会跟着放大三倍、看上去像「他离开了自己站的地方」——
  // 用户 2026-10-08 报过这个（「角色标记就被放大镜的边缘挤压走了」）。
  // 补上反缩放之后，记号的位置与大小跟全图时**逐像素一样**：±3 个世界单位的偏移
  // × 1/3 × 23.09px 还是 ±23px，跟全图里的 ±3 × 7.697 一样。
  // 谁再想给它加位移，先把那两次报错看一遍。
  // **2026-10-31（t29）：灯、记号、涟漪搬出了这张 SVG，住进下面那层 HTML（`live`）。**
  // 原因见 CSS 里那段长注释：SVG 里的 transform / r 交给不了合成器，每帧改值就得把
  // 那一层重新光栅一遍（8 秒空闲 1551ms，其中光环 990ms、记号 450ms）。
  // 这一层（`overlay`）现在只留地名签——它是**静的**，从不改值，留在 SVG 里最省事：
  // 位置跟着 viewBox 走，缩放也不会错位。
  const overlay = svgEl('g', { class: 'gf-overlay', id: OVERLAY_ID })

  // 那一层 HTML：铺在面板里、盖在地图上面（`.gf-live` 的绝对定位与 `scale` 见 CSS）。
  // 子元素的 px 全被外层 `transform: scale(每单位多少 px)` 解释成世界单位 ⇒ 下面
  // 那些数字跟当年 SVG 里写的一模一样，不必换算。
  const live = el('div', 'gf-live')
  live.setAttribute('aria-hidden', 'true')

  // 他那儿亮着的那点光：天一黑就只有这一处是亮的。
  // 位置和「亮不亮」放在外层，会闪的那一层放在内层——
  // **CSS 动画的 opacity 会盖掉写在同一层上的 opacity**，两者同层的话，他出门了灯还亮着。
  const glow = el('div', 'gf-live-lamp gf-lamp-glow')
  const flick = el('div', 'gf-lamp-flicker')
  // 尺寸是照着**世界单位**定的（仍是当年那三个同心椭圆：4.0×2.4 / 2.3×1.4 / 1.15×0.72）。
  flick.appendChild(el('div', 'gf-lamp-glow-1'))
  flick.appendChild(el('div', 'gf-lamp-glow-2'))
  flick.appendChild(el('div', 'gf-lamp-glow-3'))
  glow.appendChild(flick)
  live.appendChild(glow)

  // 「他现在在这儿」那个记号。
  // **两层仍然是必需的**：外层（`.gf-pin`）写着位置与「亮不亮」，内层（`.gf-pin-bob`）
  // 挂着一起一落的动画——CSS 的 transform 会整个盖掉外层写的位置（当年在 SVG 里
  // 就是这个坑，2026-10-03 那枚记号被画到画布左上角、整个朝上长出画布）。
  const pin = el('div', 'gf-live-pin gf-pin')
  const bob = el('div', 'gf-pin-bob')
  // 一圈会往外扩的光环，让记号在 360px 宽的地图上第一眼就能找到（动的是 scale，不是 r）
  bob.appendChild(el('div', 'gf-pin-ring'))
  // 图钉本身：一张内联的小 SVG，铺进来之后**再不改动**，光栅一次就够。
  // viewBox 用的还是世界单位（-2..2 × -4.4..0.6），所以里面那几个形状一个字没改。
  const glyph = svgEl('svg', { class: 'gf-pin-glyph', viewBox: '-2 -4.4 4 5', 'aria-hidden': 'true' })
  glyph.appendChild(svgEl('ellipse', { cx: 0, cy: 0.2, rx: 1.0, ry: 0.42, fill: 'var(--gf-ink)', 'fill-opacity': 0.28 }))
  glyph.appendChild(svgEl('circle', { cx: 0, cy: -2.4, r: 1.4, fill: 'var(--gf-seal)', 'fill-opacity': 0.16 }))
  glyph.appendChild(svgEl('polygon', { points: '0,-0.3 -0.7,-1.75 0.7,-1.75', fill: 'var(--gf-seal)' }))
  glyph.appendChild(svgEl('circle', { cx: 0, cy: -2.4, r: 0.74, fill: 'var(--gf-seal)' }))
  glyph.appendChild(svgEl('circle', { cx: 0, cy: -2.4, r: 0.27, fill: 'var(--gf-paper-hi)' }))
  bob.appendChild(glyph)
  pin.appendChild(bob)
  live.appendChild(pin)

  // 记号旁边那个地名。用户 2026-10-03：「地图上看不到他在哪，需要一个标注。」
  // 用 `<text>` 而不是 HTML 浮层：位置跟着记号走，不用自己算百分比，缩放也不会错位。
  // `font-size` 同样走属性不走 CSS——自渲染管线只认属性。
  const label = svgEl('g', { class: 'gf-place', opacity: '0' })
   /* 界面审计 U15：这枚签从前比地图自己的城名大 1.7 倍（16.8px vs 9.7px），
      底下还是一块 0.9 不透明的纸色实心块——在 1024 宽下它正好压住世界图那枚
      「古林」城名签，只剩一个「林」露在外面，看着像字画坏了。
      现在字号降到 1.75（≈14px，差 1.45 倍）、签底让地形透一点；
      记号的偏移（3.0）一个字没动——「靠右边翻到左边」那条断言咬的是它。

      2026-10-31：透明度从 0.72 提回 **0.9**。0.72 是当年怕它太实压住地形定的，
      可现在 `placeLabel` 只许它落在离记号 6 格以内——那一带字密，签子常常得压着
      城名放。0.72 时底下的字透上来，两行字叠着看更像坏了；0.9 之后压住的那点字
      基本看不见，地形还剩一点透。这两件事是连着的，改要一起改。 */
  const labelBg = svgEl('rect', { class: 'gf-place-bg', rx: 0.7, height: 2.7, fill: 'var(--gf-paper-hi)', 'fill-opacity': 0.9, stroke: 'var(--gf-room-line)', 'stroke-width': 0.11 })
  /* 2026-10-31：这里原来还有一个 `'dominant-baseline': 'middle'`，**去掉了**。
     它和下面那句 `y = 牌子上边 + size × 1.37` 是两套算法叠在一起：
     `plate_text_y` 那条式子算的是**基线**（默认 `dominant-baseline: auto`），
     再挂一个 `middle` 等于把字又往下摁了 0.56 个字高（实测低 0.9 个世界单位，≈7px，
     字在牌子里偏下、下沿蹭到牌子边）。地图上其余每一块牌子（国名、城名、地貌名）
     用的都是基线那套，这里跟着它们走。 */
  const labelText = svgEl('text', { class: 'gf-place-text', 'font-size': 1.75, fill: 'var(--gf-place-fg, var(--gf-fg))' })
  label.appendChild(labelBg)
  label.appendChild(labelText)
  overlay.appendChild(label)
  // 次序：地图 → 细节版。灯/记号/地名签**不在这张 SVG 里**，见下面那张 overlaySvg。
  // **`svg.appendChild(zoom)` 这一句不能少**：少了细节版就只在内存里、画布上没有——
  // 2026-10-06 真浏览器里正是这样（`defs` 在、`g.gf-zoom` 不在），自检的垫片看不出来，
  // 因为断言问的都是 stage 上的引用，不是画布上的父子。
  svg.appendChild(zoom)

  // 灯/记号/地名签那一层住**自己的一张 SVG**（2026-10-10，用户 m23060 报「角色标记
  // 上下动态，但一卡一卡」）。
  //
  // 为什么非搬不可：那三处动画（记号上下浮、光环往外扩、灯在晃）改的是 SVG 里的
  // `transform` / `r`，Chromium **交给不了合成器**，于是每帧都要重画**它所在的那张 SVG**。
  // 住在地图那张 SVG 里时，每帧重画的就是整张地图——5817 个形状，实测两秒烧掉 1909ms
  // 主线程（Paint 1223 ＋ Layerize 472，`.scratch/perf-anim5.txt`），所以 2026-10-09
  // 才把动画改成一跳一跳的 `steps(4)` 换 CPU，代价就是用户看到的一卡一卡。
  // 搬进这张 SVG 之后，每帧重画的只有这一层（同样三个动画都光滑：511ms，同一台机器、
  // 同一套软件光栅）。**它自己成一层（CSS 里的 `will-change: transform`）**。
  //
  // 几何一个字没改：viewBox 跟地图那张**同步写**（`zoomSetWin` / `zoomExit` 两处），
  // 世界坐标还是同一套，所以记号的位置与大小逐像素不变。
  // 它铺满整张地图 ⇒ `pointer-events` 在 CSS 里关掉，点击照旧落到下面那张地图上
  // （地图上的 pointerdown 是挂在**那张** svg 上的）。
  const overlaySvg = svgEl('svg', {
    class: 'gf-overlay-svg',
    viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`,
    'aria-hidden': 'true',
  })
  overlaySvg.appendChild(overlay)

  // 角落那张小全图（用户 m19416 定的第四条）：永远看得见自己在哪儿，点一下跳过去。
  // 它是**另一张 <svg>**，借的还是同一份 DOM（`<use>`），所以不要钱。
  const mini = svgEl('svg', { class: 'gf-mini', viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`, display: 'none' })
  mini.appendChild(svgEl('use', { href: `#${MAP_ID}` }))
  const miniView = svgEl('rect', { class: 'gf-mini-view', x: 0, y: 0, width: ZOOM_W, height: ZOOM_H, rx: 0.4 })
  mini.appendChild(miniView)
  const miniDot = svgEl('circle', { class: 'gf-mini-dot', cx: 0, cy: 0, r: 0.85 })
  mini.appendChild(miniDot)

  // 回全图那颗小按钮（双击 / Esc 也算，见下面的监听）。
  const back = el('button', 'gf-back', '全图')
  back.setAttribute('type', 'button')
  back.setAttribute('aria-label', '回到全图')
  back.setAttribute('hidden', '')

  const stage = {
    svg, map, overlay, overlaySvg, live, glow, pin, label, labelBg, labelText, night,
    zoom, zoomPan, zoomWorld, zoomLocal, zoomBit, zoomShot, mini, miniView, miniDot, back,
    // 在不在细节版、当前这扇窗（viewBox 的左上角）、已经画进去的那一扇。
    zoomOn: false,
    zoomWin: null,
    zoomAt: null,
    // 松手之后那次「画地方图」的计时器。
    zoomTimer: 0,
    // 甲：已经排下的那一帧（`requestAnimationFrame` 的号）。拖动时位置攒到它上面一起写。
    zoomRaf: 0,
    // 拖动中：{ id, x, y, dx, dy, moved }。
    drag: null,
    // 上一次他是不是在视野里——决定「他走出去了」要不要把视野挪过去（见 zoomFollow）。
    pinIn: false,
    // 记号画在哪儿（他脚下那块地）与那圈光池的半径。
    nightAt: null,
    nightR: 9,
    // 2026-10-31（t29）：HTML 那一层（记号、涟漪、灯）钉在世界坐标的哪一点。
    // 与 nightAt 同步写；placeLive 拿它算像素位置。
    pinAt: null,
    // 取景框与屏幕上的位置：按下时读一次，之后一直用（见 zoomBox）。
    zoomBox: null,
    // 一.1：面板画过第一笔没有。第一次画的时候把他所在那一扇排进空闲队列（见 zoomWarm）。
    warm: false,
    // 2026-10-31（t28）：地图那一坨灌进去了没有。默认值是「建的时候就灌」
    // （自检里直接调 buildStage() 的地方就是这个值，行为一个字没变）；
    // 真面板传 deferMap，于是这里一开始是 false，等第一次开门才灌。
    mapBuilt: !deferMap,
    // 第一次开门时才灌地图（只灌一次，之后每次开门零成本）。真灌了返回 true。
    fillMap: () => {
      if (stage.mapBuilt) return false
      buildMap(map)
      stage.mapBuilt = true
      return true
    },
  }
  // 全图点一下 → 进细节版（以点的那处为中心）；细节版按住拖 → 平移；
  // 双击 / Esc / 角落那颗「全图」→ 回全图（用户 m19416 定的四条）。
  // 挂 `svg` 上（不是某一张纸）：事件沿 DOM 树冒泡，地图里的任何一笔都会冒到这里。
  // 按下那一下要把位置重读一遍（面板可能刚改过宽窄），动着的时候不用。
  svg.addEventListener('pointerdown', (ev) => { stage.zoomBox = null; zoomDown(stage, ev) })
  svg.addEventListener('pointermove', (ev) => zoomMove(stage, ev))
  svg.addEventListener('pointerup', (ev) => zoomUp(stage, ev))
  svg.addEventListener('pointercancel', (ev) => zoomUp(stage, ev))
  svg.addEventListener('dblclick', () => { if (stage.zoomOn) zoomExit(stage) })
  mini.addEventListener('pointerdown', (ev) => zoomMiniJump(stage, ev))
  back.addEventListener('click', () => zoomExit(stage))
  // Esc 回全图。挂在 document 上：焦点可能在面板里任何一处。
  // 自检的垫片没有 document.addEventListener，所以要挡一下。
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', (ev) => {
      if (stage.zoomOn && ev && (ev.key === 'Escape' || ev.key === 'Esc')) zoomExit(stage)
    })
  }
  /* 界面审计 U3：这块地图本来是**纯鼠标**的——点一下进细节、按住拖、双击回来。
     能动手却进不了 Tab 序列，键盘用户就完全够不着它（连「这里能点」都不知道）。
     给它一个落脚点：tabindex + 名字 + 方向键（平挪 1/4 扇窗）、回车进细节版；
     回全图那颗按钮本来是进入细节版之后才露面，键盘也能 Tab 到它。
     「aria-hidden」要摘掉——一个能被聚焦、能按的东西不该对读屏隐身。 */
  svg.removeAttribute('aria-hidden')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('role', 'application')
  svg.setAttribute('aria-label', '地图：方向键挪动，回车进细节版，Esc 回全图')
  svg.addEventListener('keydown', (ev) => {
    const key = ev && ev.key
    if (!key) return
    if (key === 'Enter' || key === ' ') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (!stage.zoomOn) zoomEnter(stage, VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2)
      return
    }
    if (key === 'Escape' || key === 'Esc') {
      if (stage.zoomOn) zoomExit(stage)
      return
    }
    if (zoomNudge(stage, key)) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
    }
  })
  return stage
}

/**
 * 键盘挪地图（界面审计 U3）：方向键按 1/4 扇窗走一格，走法与拖动松手之后一样
 * （`zoomSwap`：取景框夹在世界图里、吸附到 1/4 格、缓存命中就当场换）。
 * 按的不是手势，没有「手还按着」这回事，但地方图那 36ms 的活还是让它晚一帧画
 * （`ZOOM_HOLD_MS`），免得连按方向键时一帧里建好几张。
 */
function zoomNudge(stage, key) {
  if (!stage.zoomOn) return false
  const win = stage.zoomWin
  if (!win) return false
  const dx = key === 'ArrowLeft' ? -ZOOM_W / 4 : key === 'ArrowRight' ? ZOOM_W / 4 : 0
  const dy = key === 'ArrowUp' ? -ZOOM_H / 4 : key === 'ArrowDown' ? ZOOM_H / 4 : 0
  if (!dx && !dy) return false
  const [wx, wy] = zoomOrigin(win[0] + ZOOM_W / 2 + dx, win[1] + ZOOM_H / 2 + dy)
  if (win[0] === wx && win[1] === wy) return true // 已经贴到边上：吃下这一下，别让页面跟着滚
  zoomSwap(stage, wx, wy, ZOOM_HOLD_MS)
  return true
}

// 细节版的放大倍数。世界图 66×34、取景框 22×11.35——九分之一面积、三倍线性分辨率，
// 所以 66 / 22 = 3。两个方向算出来是 3 与 2.9956（11.35 不是 34 的整三分之一），
// 差 0.15%，肉眼看不出来，就用同一个 3。
// **它只用来算记号那一层的反缩放**：真正的放大是换 viewBox 换出来的，不是 scale。
const ZOOM_K = 3
// HTML 那一层量到的「面板有多宽」最多信这么久（毫秒）。开门那一帧面板还会变窄
// （见闻录的滚动条随后才出现），量早了记号就偏一个多像素——300ms 之后重新量一次。
const LIVE_BOX_TTL = 300
// 细节版那扇窗，跟面板上的地方图是同一扇（`src/map/local.js` 的 WIN_W / WIN_H）。
const ZOOM_W = 22.0
const ZOOM_H = 11.35
const ZOOM_ID = 'gf-zoom'
// 提灯照地那圈光用的径向渐变（见 buildStage 的 defs 与 renderStage 的 paint）。
const NIGHT_ID = 'gf-night'
const MAP_ID = 'gf-world'
// 记号、灯、地名签那一层。给它一个名字是为了自检和探针能一眼抓住这一层
// （`.gf-overlay` 那个类名也够用，这个 id 是留着给外面按 id 找的）。
const OVERLAY_ID = 'gf-overlay'
// 窗心能贴到世界图外多少。**零**（第六十六版）：取景框整扇必须落在世界图里面。
// 原来留了 3 个世界单位的余量，于是贴边时露出来的那一角底下会冒出全图那张世界图
// ——看着就是「两张地图叠在一起」（用户 2026-10-08 报的）。
const ZOOM_EDGE = 0
// 窗心吸附到 1/4 个世界单位。拖动松手时窗心要落在一个稳的格子上——一是不让画面
// 在吸附那一下跳（最多挪 0.125 个世界单位 ≈ 3px），二是缓存键才认得出「同一扇窗」。
const ZOOM_QUANT = 0.25
// 松手之后隔多久画地方图（甲：2026-10-08 从 90 降到 30）。拖动中地面那层照旧跟手走，
// 停下来才建细的那张；**缓存里已经有这一扇时根本不等**（见 `zoomSwap`）——那点等待本来
// 是为了躲开手势里的同步建图，命中时没有建图，白等。
const ZOOM_HOLD_MS = 30
// 画过的那几扇留着。它画在世界坐标上，窗挪回去就不用重画。
// 一扇约 700 KB 字符串（十六扇约 11 MB），换来的是「在同一片区域里来回挪」一次都不重画。
const ZOOM_CACHE_MAX = 16
const zoomCache = new Map()
// 空闲预建：一次空闲片最多花这么久（毫秒）。其实不设 timeout，见 `zoomPump`。
const ZOOM_IDLE_MS = 10
// 静默期：停稳这么久之后才开始预建。**这一条是量出来的**——
// 一扇图建起来是 36ms 的同步块，拆不开；`requestIdleCallback` 又不等于「真的空」，
// 它照样插在帧与帧之间。所以只在真停下来之后才动。
// 2026-10-08 从 700ms 拉到 2000ms：用户报「比较卡顿」，量出来挂机不动那 155 帧里
// 就有 7 次 57–188ms 的长任务，全是预建落下来的。
const ZOOM_QUIET_MS = 2000
// 预建的那一队（先进先出），挂着的那一次空闲回调，以及那个静默计时器。
const zoomQueue = []
let zoomIdle = 0
let zoomQuiet = 0
// 一.2／乙：拖动里「手停了」多久算停。手一直动就不排（排了就是在他拖得最起劲时插 36ms），
// 一停下来就把「松手多半会落的那一扇」先建好——他摆好位置、松手，那一下就是缓存命中。
// 2026-10-08 从 160 降到 90：还有一道更快的判据（`ZOOM_DRAG_GAP_MS`）在看「上一次
// pointermove 过去多久」，这个计时器只是兜底（空闲回调链万一断了还有它）。
const ZOOM_DRAG_QUIET_MS = 90
// 乙：离上一次 pointermove 超过这么久就算「手停了」，空闲片可以建一扇。
// 人手拖动时事件是每 16ms 一个，所以 24ms 只会在真的停顿（哪怕只停一帧半）时才成立——
// 该掉的那一帧只在手停的时候掉，手一直在动时一帧都不多掉。
const ZOOM_DRAG_GAP_MS = 24
let zoomDragQuiet = 0
// 乙：拖动里按当前位移算出来的「松手会落的那一扇」（没建过才有值），空闲片优先建它。
let zoomDragJob = null
// 乙：上一次 pointermove 的时刻，用来判断「手停了没有」。
let zoomMoveAt = 0
// 丙：烘那张位图的分辨率——整张世界图的 3 倍（66 个世界单位 × 23.09px ≈ 1524）。
const ZOOM_SHOT_W = 1524
const ZOOM_SHOT_H = 786
// 那张位图烘到哪一步了：0 还没烘 / 1 正在烘 / 2 好了。一直是 0 就一直走矢量。
let zoomShotState = 0

/* ---------- 两级地图：全图（L0）↔ 细节版（L1） ---------- */

/**
 * 丙：把整张世界图烘成一张位图，拖动时只挪它。
 *
 * 为什么值得烘：跟手的那层是世界图的矢量（2056 个元素），每帧都得重画一遍——
 * 2026-10-08 在真浏览器里量到一帧 20.5ms、13 帧里掉 2 帧，用户还是觉得不顺滑。
 * 换成一张贴图，挪一下就是一次 blit。
 *
 * 怎么烘：把世界图那段标记（`MAP_SVG`）连同 `MAP_CSS` 包成一份独立的 SVG，交给 `<img>`
 * 解成图，画进画布，再 `toBlob` 成 PNG。**画布那一步不能省**：直接拿 SVG 的 blob 当
 * `<image>` 用的话，浏览器每次变换都可能重新栅格化那份 SVG，又回到矢量那条老路上。
 *
 * 什么时候烘：面板建好之后的空闲里烘一次（见 `zoomShotSoon`）。它是一次 100–200ms 的活，
 * 放在空闲里、放在他还没进细节版之前，谁也不挡；真烘不出来（或者还没烘好）就退回矢量，
 * 退路在 `zoomMove` 里。
 *
 * 自检的垫片里没有 Blob / Image / 画布，这一整段会直接跳过——所以自检只查结构，
 * 「到底烘出来没有」由真浏览器的探针说话。
 */
function zoomShotBake(stage) {
  if (zoomShotState) return
  if (typeof Blob !== 'function' || typeof Image !== 'function') return
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  zoomShotState = 1
  let src = ''
  try {
    // `<g class="gf-map">` 这一层**不能省**：`MAP_CSS` 里每一条选择器都挂在 `.gf-map`
    // 底下（`.gf-map .mw` 这样）。少了它，整张图一条样式都套不上，全按默认的黑色画出来
    // ——2026-10-08 就是这么烘出一张黑图的（真浏览器探针抓到的）。
    const doc =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ZOOM_SHOT_W}" height="${ZOOM_SHOT_H}"` +
      ` viewBox="0 0 ${f2(VIEW.w)} ${f2(VIEW.h)}"><style>${MAP_CSS}</style>` +
      `<g class="gf-map">${MAP_SVG}</g></svg>`
    src = URL.createObjectURL(new Blob([doc], { type: 'image/svg+xml;charset=utf-8' }))
  } catch (e) {
    zoomShotState = 0
    return
  }
  const img = new Image()
  img.onload = () => {
    try {
      const cv = document.createElement('canvas')
      cv.width = ZOOM_SHOT_W
      cv.height = ZOOM_SHOT_H
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0, ZOOM_SHOT_W, ZOOM_SHOT_H)
      URL.revokeObjectURL(src)
      cv.toBlob((png) => {
        if (!png) {
          zoomShotState = 0
          return
        }
        setAttr(stage.zoomShot, 'href', URL.createObjectURL(png))
        stage.zoomBit.setAttribute('data-ready', '')
        zoomShotState = 2
      }, 'image/png')
    } catch (e) {
      try { URL.revokeObjectURL(src) } catch (e2) { /* 已经撤销过就算了 */ }
      zoomShotState = 0
    }
  }
  img.onerror = () => {
    try { URL.revokeObjectURL(src) } catch (e) { /* 已经撤销过就算了 */ }
    zoomShotState = 0
  }
  img.src = src
}

/** 丙：空闲里烘一次。没有 requestIdleCallback 就退到一次定时器（自检里两样都没有，不烘）。 */
function zoomShotSoon(stage) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => zoomShotBake(stage))
    return
  }
  if (typeof setTimeout === 'function') setTimeout(() => zoomShotBake(stage), 1500)
}

/**
 * 取景框在屏幕上的位置与大小。**按下时读一次，之后一直用。**
 *
 * `getBoundingClientRect()` 会逼浏览器把布局算完，一次拖动里读一次是白花的钱；
 * 面板宽度变了才会变（`pointerdown` 时重读）。
 * 自检的垫片没有 `getBoundingClientRect`，所以一路都有兜底：
 * 拿不到 rect 就当它从 (0,0) 起、尺寸用 `clientWidth` / `offsetWidth`（垫片给 350）。
 */
function zoomBox(svg) {
  const rect = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null
  const w = (rect && rect.width) || svg.clientWidth || svg.offsetWidth || 360
  const h = (rect && rect.height) || svg.clientHeight || svg.offsetHeight || (w * VIEW.h) / VIEW.w
  return {
    left: rect && Number.isFinite(rect.left) ? rect.left : 0,
    top: rect && Number.isFinite(rect.top) ? rect.top : 0,
    w,
    h,
  }
}

/** 画布现在的 viewBox。全图是 VIEW，细节版是那扇窗——两条路都走这一个。 */
function zoomViewBox(svg) {
  const box = String(svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
  return box.length === 4 && box.every((v) => Number.isFinite(v)) ? box : [VIEW.x, VIEW.y, VIEW.w, VIEW.h]
}

/** 屏幕坐标 → 世界坐标（用**当前**的 viewBox：两级共用这一条）。 */
function zoomWorldAt(stage, ev) {
  const b = stage.zoomBox || (stage.zoomBox = zoomBox(stage.svg))
  const vb = zoomViewBox(stage.svg)
  const cx = Number(ev && ev.clientX)
  const cy = Number(ev && ev.clientY)
  return [
    vb[0] + (((Number.isFinite(cx) ? cx : b.left) - b.left) / b.w) * vb[2],
    vb[1] + (((Number.isFinite(cy) ? cy : b.top) - b.top) / b.h) * vb[3],
  ]
}

/**
 * 窗心（世界坐标）→ 取景框左上角：夹在世界图里面，再吸附到 1/4 格。
 *
 * 夹的是**整扇窗**：`ZOOM_EDGE = 0`（第六十六版），取景框整个落在世界图里面。
 * 早先留了 3 个世界单位的余量，贴边时露出来的那一角底下就是全图那张世界图
 * ——拖动时推得够远还会整片露出来，看着像两张地图叠在一起。
 */
function zoomOrigin(cx, cy) {
  const q = (v) => Math.round(v / ZOOM_QUANT) * ZOOM_QUANT
  // 两头都先取整到格子上再夹：吸附那一下会把值往外挪最多半格（34 − 11.35 = 22.65
  // 吸成 22.75），底边就又露出 0.1 个世界单位——那一点点也够看见底下那张全图。
  const loX = Math.ceil((VIEW.x - ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  const hiX = Math.floor((VIEW.x + VIEW.w - ZOOM_W + ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  const loY = Math.ceil((VIEW.y - ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  const hiY = Math.floor((VIEW.y + VIEW.h - ZOOM_H + ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  return [
    q(Math.min(Math.max(cx - ZOOM_W / 2, loX), hiX)),
    q(Math.min(Math.max(cy - ZOOM_H / 2, loY), hiY)),
  ]
}

/**
 * HTML 那一层（记号、涟漪、灯）的世界→像素换算（2026-10-31，t29）。
 *
 * 它不在 SVG 里，viewBox 变了就得自己算。两件事分开算：
 *   ① 位置按**当前**这一档（细节版是 3 倍，记号跟着地面一起走）；
 *   ② 大小按**全图**那一档（`u = 面板宽 / VIEW.w`）。细节版的 viewBox 只有三分之一宽，
 *      大小要是也按那一档放大，记号会大出三倍、看上去像「他离开了自己站的地方」
 *      （2026-10-08 用户报过）；从前靠给那一层写反缩放，现在直接把大小钉死在全图那一档。
 *
 * 自检那套最小 DOM 垫片没有 `getBoundingClientRect`，`clientWidth` 给的是 350
 * （见 smoke.mjs 里 PXU / PXZ 那两个常数）；两边都取不到就按「不换算」退。
 */
function liveScale(stage) {
  const svg = stage && stage.svg
  const clock = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
  const box0 = stage && stage.liveBox && clock - stage.liveBox.at < LIVE_BOX_TTL ? stage.liveBox : null
  let w = box0 ? box0.w : 0
  let h = box0 ? box0.h : 0
  // 量一次就记住一小会儿：拖动那一路每帧都要问位置，`getBoundingClientRect` 是布局读，
  // 每帧读一次会把刚写下去的样式逼着当场结算（见 zoomBox 那段同一个道理）。
  // 但**记不了太久**：2026-10-31（t29）第一次量它的时候，面板还在开门那一帧，
  // 见闻录的滚动条随后才占掉五个多像素，宽度从 508 变成 502 却没重新量，
  // 记号就偏出去一个多像素（t29 的位置探针抓到的）。所以再加一个 300ms 的上限，
  // 并让面板在尺寸变化时（ResizeObserver）当场清掉这个缓存。
  if (!box0) {
    if (svg && typeof svg.getBoundingClientRect === 'function') {
      const box = svg.getBoundingClientRect()
      w = Number(box && box.width) || 0
      h = Number(box && box.height) || 0
    }
    if (!w) w = Number(svg && svg.clientWidth) || 0
    if (!h) h = w ? w * (VIEW.h / VIEW.w) : 0
    if (stage && w) stage.liveBox = { w, h, at: clock }
  }
  const vb = String((stage && stage.overlaySvg && stage.overlaySvg.getAttribute('viewBox')) || '')
    .trim()
    .split(/\s+/)
    .map(Number)
  const ok = vb.length === 4 && vb.every((v) => Number.isFinite(v))
  const vw = ok && vb[2] > 0 ? vb[2] : VIEW.w
  const vh = ok && vb[3] > 0 ? vb[3] : VIEW.h
  return {
    x0: ok ? vb[0] : VIEW.x,
    y0: ok ? vb[1] : VIEW.y,
    sx: w ? w / vw : 0,
    sy: h ? h / vh : 0,
    u: w ? w / VIEW.w : 0,
  }
}

/** 把那一层挪到他脚下那块地（`pinAt`）。拖动中 `ddx/ddy` 是地面平移的那一段。 */
function placeLive(stage, ddx = 0, ddy = 0) {
  const live = stage && stage.live
  const at = stage && stage.pinAt
  if (!live || !at) return
  const s = liveScale(stage)
  const x = (at[0] - s.x0 + ddx) * s.sx
  const y = (at[1] - s.y0 + ddy) * s.sy
  const u = s.u > 0 ? s.u : 1
  // 写一次就是一次样式重算：他站着不动时那串字一个字节都不变，挡掉。
  const key = `${x.toFixed(2)}|${y.toFixed(2)}|${u.toFixed(4)}`
  if (key === stage.liveKey) return
  stage.liveKey = key
  live.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${u.toFixed(4)})`
  // 灯在记号上方一个世界单位，记号本身贴在门口再往上 0.3（都是当年 SVG 里那两个数）。
  stage.glow.style.transform = 'translate3d(0, -1px, 0)'
  stage.pin.style.transform = 'translate3d(0, -0.3px, 0)'
  // 自检要知道记号钉在哪：世界坐标直接记在元素上（HTML 没有 transform 属性，别去咬那个）。
  stage.pin.setAttribute('data-at', `${at[0].toFixed(1)},${at[1].toFixed(1)}`)
}

/** 把这扇窗写进 viewBox，并把小全图上那个框、那个点跟着挪。 */
function zoomSetWin(stage, wx, wy) {
  stage.zoomWin = [wx, wy]
  stage.svg.setAttribute('viewBox', `${f2(wx)} ${f2(wy)} ${ZOOM_W} ${ZOOM_H}`)
  // 记号那张 SVG 的 viewBox **必须同步**：它跟地图那张盖在同一块地方，
  // 世界坐标得是同一个取景框，不然记号会按旧框换算、跑到别处去。
  setAttr(stage.overlaySvg, 'viewBox', `${f2(wx)} ${f2(wy)} ${ZOOM_W} ${ZOOM_H}`)
  setAttr(stage.miniView, 'x', f2(wx))
  setAttr(stage.miniView, 'y', f2(wy))
  const p = stage.nightAt
  if (p) {
    setAttr(stage.miniDot, 'cx', f2(p[0]))
    setAttr(stage.miniDot, 'cy', f2(p[1]))
  }
}

/** 他现在在不在这一扇窗里（留一点边距，别让他贴着框沿反复触发）。 */
function zoomInView(stage, p) {
  const w = stage.zoomWin
  if (!w || !p) return false
  return p[0] > w[0] + 1.2 && p[0] < w[0] + ZOOM_W - 1.2 && p[1] > w[1] + 1.2 && p[1] < w[1] + ZOOM_H - 1.2
}

/**
 * 记号/灯/地名签那一层的反缩放。
 *
 * 细节版把 viewBox 收成 22×11.35，那一层要是跟着放大，记号就会大一圈、还会
 * 看上去「离开自己站的地方」。以**他脚下那块地**为中心补一个 1/3 的缩放，
 * 他的记号位置与大小就跟全图时逐像素一样（±3 个世界单位的偏移 × 1/3 × 23.09px
 * 还是 ±23px，跟全图里的 ±3 × 7.697 一样）。
 */
function zoomOverlay(stage, ddx = 0, ddy = 0) {
  const p = stage.nightAt
  if (!stage.zoomOn || !p) {
    stage.overlay.removeAttribute('transform')
    // 2026-10-31（t29）：记号、涟漪、灯在 HTML 那一层，viewBox 回了全图也要跟着回去。
    placeLive(stage)
    return
  }
  // 拖动中（`ddx/ddy` 非零）记号、地名签、提灯要跟地面一起走：位移写在最外面，
  // 跟挪地面那层用的是同一个数。松手时取景框补上同一段（见 zoomSwap 里那次
  // `zoomOverlay`），位置连续、不会跳。
  const head = ddx || ddy ? `translate(${f2(ddx)} ${f2(ddy)}) ` : ''
  setAttr(stage.overlay, 'transform', `${head}translate(${f2(p[0])} ${f2(p[1])}) scale(${1 / ZOOM_K}) translate(${f2(-p[0])} ${f2(-p[1])})`)
  setAttr(stage.miniDot, 'cx', f2(p[0]))
  setAttr(stage.miniDot, 'cy', f2(p[1]))
  // 地名签留在 SVG 里，靠上面那个反缩放；记号与灯在 HTML 里，自己按 viewBox 重算一次。
  placeLive(stage, ddx, ddy)
}

/**
 * 他走出细节版那扇窗了没有。走出去了就把视野挪到他身上（用户 m19416 定的第三条）。
 *
 * 只在**上一个位置还在窗里**、这一个位置出去了的时候才挪一次——不然每次重画都跟着
 * 他走，地图就没法自己看了（他想看看别处，视野却一直被拽回去）。
 */
function zoomFollow(stage, px, py) {
  if (!stage.zoomOn) {
    stage.pinIn = false
    return
  }
  const inNow = zoomInView(stage, [px, py])
  if (stage.pinIn && !inNow) {
    const [wx, wy] = zoomOrigin(px, py)
    zoomSwap(stage, wx, wy, ZOOM_HOLD_MS)
  }
  stage.pinIn = inNow
}

/** 进细节版：以 (cx, cy) 为中心。全图里点一下走这一条。 */
function zoomEnter(stage, cx, cy) {
  const [wx, wy] = zoomOrigin(cx, cy)
  stage.zoomOn = true
  stage.zoom.removeAttribute('display')
  stage.mini.removeAttribute('display')
  stage.back.removeAttribute('hidden')
  stage.zoomPan.removeAttribute('transform')
  zoomSetWin(stage, wx, wy)
  stage.pinIn = zoomInView(stage, stage.nightAt)
  // 先把便宜那层顶上来（世界图自己的 3 倍，零成本），地方图当场就画——他点了，等得起。
  stage.zoomWorld.removeAttribute('display')
  zoomDraw(stage, wx, wy)
  zoomOverlay(stage)
  // 一.3：丙那张位图在这里才排（原来在 buildStage 末尾排）。他要拖了才用得上它，
  // 放在「他刚点进来」这一刻排，空闲里烘完，面板刚出现那几秒就不用陪这一次长任务。
  zoomShotSoon(stage)
}

/** 回全图。双击 / Esc / 角落那颗按钮都走这一条。 */
function zoomExit(stage) {
  stage.zoomOn = false
  stage.drag = null
  zoomDragging = false
  zoomDragQuietDrop()
  zoomDragJob = null
  stage.pinIn = false
  if (stage.zoomTimer) clearTimeout(stage.zoomTimer)
  stage.zoomTimer = 0
  stage.zoomAt = null
  stage.zoomWin = null
  stage.svg.setAttribute('viewBox', `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`)
  // 记号那张 SVG 的取景框跟着回全图（见 zoomSetWin 里那段）。
  setAttr(stage.overlaySvg, 'viewBox', `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`)
  stage.zoom.setAttribute('display', 'none')
  stage.mini.setAttribute('display', 'none')
  stage.back.setAttribute('hidden', '')
  stage.zoomPan.removeAttribute('transform')
  stage.zoomLocal.setAttribute('class', 'gf-zoom-local')
  stage.zoomLocal.removeAttribute('data-on')
  stage.zoomLocal.removeAttribute('data-drag')
  stage.zoom.removeAttribute('data-drag')
  stage.mini.removeAttribute('data-drag')
  stage.zoomBit.removeAttribute('data-on')
  // 退出时把「拖动中」那个类摘掉（也可能是在拖动里按 Esc / 双击出去的）。
  if (stage.overlaySvg) stage.overlaySvg.setAttribute('class', 'gf-overlay-svg')
  if (stage.live) stage.live.setAttribute('class', 'gf-live')
  zoomFrameDrop(stage)
  // 一张地方图 800 KB，不看了就别占着。
  stage.zoomLocal.innerHTML = ''
  stage.zoomWorld.removeAttribute('display')
  stage.overlay.removeAttribute('transform')
  // 预建那一队不撤（缓存留着，下次进来直接命中），但把「排过哪扇窗」忘掉：
  // 面板可能整个重建过，下次进来要重新排一遍。
  zoomPrewarmKey = ''
  zoomQuietDrop()
}

/**
 * 一扇窗的缓存键（`focusAt` 取窗心最近的那座城）。
 *
 * `zoomDraw` / `zoomSwap`（甲：判断「这一扇建过没有」）／两处预建，四处共用这一条，
 * 免得哪一处算出来的键跟别处差一点点、永远命不中。
 */
function zoomKey(wx, wy) {
  const focus = focusAt(wx + ZOOM_W / 2, wy + ZOOM_H / 2).focus
  return { focus, key: `${wx}:${wy}:${focus}` }
}

/** 拖动收工：把拖动期间收起来、降级的那几层还原（`zoomSwap` 早退与 `zoomDraw` 都走这一条）。 */
function zoomDragOff(stage) {
  stage.zoomLocal.removeAttribute('data-drag')
  stage.zoom.removeAttribute('data-drag')
  stage.mini.removeAttribute('data-drag')
}

/**
 * 换一扇窗：地面**不换**（用户 m22080「甲乙都上」里的甲），细的那张隔 `hold` 毫秒再画。
 *
 * 甲（2026-10-08 量的，松手→看见内容从 234ms 降到约 110ms）：原来这里一上来做三件事——
 * 把地方图那层的 `[data-drag]` 摘掉（3752 个节点当场重排一次版面）、把拖动期间垫着的位图
 * 关掉、把 5817 个元素的世界图矢量层重新露出来，紧接着换 viewBox ⇒ **松手那一下先花 80ms
 * 重光栅化**，然后才轮到画。三件全是白付的：
 *   · 位图本来就是整张世界图的 3 倍（1524×786，23.09px/单位，正好是细节版的尺度），
 *     画在世界坐标上 ⇒ **任何一扇窗都能直接拿它当地面**。留着它，松手那一帧一次重画都没有；
 *   · 地方图那层继续藏着（`[data-drag]` 就是 `display:none`），等新内容换好了再露
 *     （见 `zoomDraw` 里那次顺序调换）。
 *
 * `hold = 0` 就是当场画。**缓存里已经有这一扇时一律 0**——那点等待本来是为了躲开手势里的
 * 同步建图，命中时根本没有建图，白等。
 */
function zoomSwap(stage, wx, wy, hold) {
  if (!stage.zoomOn) return
  stage.zoomPan.removeAttribute('transform')
  zoomDragging = false
  zoomDragJob = null
  zoomSetWin(stage, wx, wy)
  // 取景框已经补上了同一段位移，记号那一层立刻退回「不带位移」——它在屏幕上
  // 一步都不动，看上去就是松手之后地面接着刚才继续挪。
  zoomOverlay(stage)
  if (stage.zoomAt && stage.zoomAt[0] === wx && stage.zoomAt[1] === wy) {
    // 落点就是原来那一扇：内容本来就是对的，只把拖动期间收起来的那几层露回来。
    zoomDragOff(stage)
    stage.pinIn = zoomInView(stage, stage.nightAt)
    return
  }
  // 视野是手动挪过来的（拖动、小全图、他走出去了）——重新记一次他在不在窗里。
  // 不记的话，他明明已经在窗外的下一次重画会照旧把他当「刚走出去」，把视野硬拽回他那儿。
  stage.pinIn = zoomInView(stage, stage.nightAt)
  // 旧的那张先撤（它画的是另一扇窗，留着就是错位）——地面那两层照旧垫着（甲）。
  stage.zoomAt = null
  stage.zoomLocal.removeAttribute('data-on')
  if (stage.zoomTimer) clearTimeout(stage.zoomTimer)
  stage.zoomTimer = 0
  const wait = zoomCache.has(zoomKey(wx, wy).key) ? 0 : hold
  if (wait > 0) {
    stage.zoomTimer = setTimeout(() => {
      stage.zoomTimer = 0
      zoomDraw(stage, wx, wy)
    }, wait)
  } else {
    zoomDraw(stage, wx, wy)
  }
  // 邻居立刻排进空闲队列：等细的那张真画出来时，它们已经建好了。
  zoomPrewarm(wx, wy)
}

/**
 * 真画一扇地方图，淡进来。**那 36ms 的同步建图就落在这里。**
 *
 * 聚到哪座城：取**窗心**最近的那一座（`zoomKey` 就是干这个的）。城名也进缓存键——
 * 窗心由窗的位置唯一决定，所以同一扇窗永远是同一座城（上一版放大镜里「同一扇窗两座城」
 * 那种事这一版不会发生）。
 *
 * 甲：**趁那层还藏着（`[data-drag]` 就是 `display:none`）先把内容换掉**，换完再露出来。
 * 顺序反过来就是「先让 3752 个旧节点重排一次版、再换成新的」，白付一次版面。
 */
function zoomDraw(stage, wx, wy) {
  if (!stage.zoomOn) return
  const { focus, key } = zoomKey(wx, wy)
  let html = zoomCache.get(key)
  if (html == null) {
    html = build_local(wx, wy, focus)
    zoomCache.set(key, html)
    if (zoomCache.size > ZOOM_CACHE_MAX) zoomCache.delete(zoomCache.keys().next().value)
  }
  // 先在**离屏**的组里把这一扇拼好、解析完，再整体换上去。直接往挂着的那层写
  // innerHTML，浏览器要一边解析一边给 4700 个新节点算版面，那一下就是一次
  // 57–190ms 的长任务（2026-10-08 量到的）。
  const holder = svgEl('g')
  holder.innerHTML = html
  stage.zoomLocal.setAttribute('class', 'gf-map gf-zoom-local')
  // 甲：换内容这一步让它在 `display:none` 里做（本来就是拖动中那层的样子）。
  const wasHidden = stage.zoomLocal.getAttribute('data-drag') !== null
  if (!wasHidden) stage.zoomLocal.setAttribute('data-drag', '')
  if (typeof stage.zoomLocal.replaceChildren === 'function') {
    stage.zoomLocal.replaceChildren(...holder.childNodes)
  } else {
    // 自检垫片里既没有 replaceChildren 也没有 firstChild，直接搬 children 数组。
    const kids = [...holder.children]
    stage.zoomLocal.innerHTML = ''
    for (const k of kids) stage.zoomLocal.appendChild(k)
  }
  stage.zoomLocal.setAttribute('data-focus', focus)
  zoomDragOff(stage)
  stage.zoomLocal.setAttribute('data-on', '')
  // 有地方图可看了，垫着的那两层才关：位图（拖动期间的地面）与世界图矢量层
  // （它跟着挪一格都要重栅格化整张世界图）。
  stage.zoomBit.removeAttribute('data-on')
  stage.zoomWorld.setAttribute('display', 'none')
  stage.zoomAt = [wx, wy]
  zoomPrewarm(wx, wy)
}

/** 全图里点一下：进细节版，以点的那处为中心。 */
function zoomDown(stage, ev) {
  if (!stage.zoomOn) {
    const [mx, my] = zoomWorldAt(stage, ev)
    zoomEnter(stage, mx, my)
    return
  }
  // 细节版里按住拖。记下起点，`pointermove` 里只写一层 transform。
  const x = Number(ev && ev.clientX)
  const y = Number(ev && ev.clientY)
  stage.drag = {
    id: ev && ev.pointerId,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    dx: 0,
    dy: 0,
    moved: false,
  }
  if (ev && ev.pointerId != null && typeof stage.svg.setPointerCapture === 'function') {
    try {
      stage.svg.setPointerCapture(ev.pointerId)
    } catch (e) {
      // 垫片里没有指针捕获，忽略。
    }
  }
}

/**
 * 拖动中：把「现在看得见的那块地」整个挪过去——**只写一层 transform**。
 *
 * 挪的是世界图那层（实测 252 帧掉 1 帧）；地方图那层那 4700 个元素一挪就是 21 帧，
 * 所以一进拖动就把它收起来，松手以后再画（见 zoomUp）。
 *
 * 甲（2026-10-08）：位置**一帧只写一次**。`pointermove` 在高回报鼠标上一秒能来上千次，
 * 而屏幕一秒只要 60 次——每来一次就写一遍 transform，等于让浏览器一秒重排上千次。
 * 现在只把最新位移记下来，攒到下一帧一起写（没有 rAF 的环境——自检那个垫片——
 * 直接当场写，跟从前一样）。
 */
function zoomMove(stage, ev) {
  const d = stage.drag
  if (!d || !stage.zoomOn) return
  const box = stage.zoomBox || (stage.zoomBox = zoomBox(stage.svg))
  const k = box.w / ZOOM_W // 屏幕像素 / 世界单位（细节版里就是这个比例）
  d.dx = (Number(ev && ev.clientX) - d.x) / (k || 1)
  d.dy = (Number(ev && ev.clientY) - d.y) / (k || 1)
  // 甲（第六十六版）：位移**夹住**——取景框整扇必须留在世界图里面。
  // 不夹的话地面会被推出世界图（往上推十几二十个单位就够了），露出来的那一大片
  // 底下压着全图那张世界图，看着就是两张地图叠着（用户 2026-10-08 报的）。
  //
  // **符号**：`d` 是**指针**的位移，窗往反方向走（松手时 `zoomOrigin(w − d)`）。
  // 所以窗左上角 `w0 − d` 必须落在 `[lo, hi]` 里 ⇒ `d ∈ [w0 − hi, w0 − lo]`。
  // 这里用跟 `zoomOrigin` 同一套取整过的 `lo`/`hi`，免得拖动中比落定后多露出半格。
  const w0 = stage.zoomWin || [VIEW.x, VIEW.y]
  const loX = Math.ceil((VIEW.x - ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  const hiX = Math.floor((VIEW.x + VIEW.w - ZOOM_W + ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  const loY = Math.ceil((VIEW.y - ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  const hiY = Math.floor((VIEW.y + VIEW.h - ZOOM_H + ZOOM_EDGE) / ZOOM_QUANT) * ZOOM_QUANT
  d.dx = Math.min(Math.max(d.dx, w0[0] - hiX), w0[0] - loX)
  d.dy = Math.min(Math.max(d.dy, w0[1] - hiY), w0[1] - loY)
  if (!d.moved && Math.abs(d.dx) + Math.abs(d.dy) > 0.06) {
    d.moved = true
    zoomDragging = true
    // 真拖起来才按停记号那三处动画（见 CSS 里 `.gf-zooming` 那六条）：
    // 拖动这两秒在满负荷重画世界图，不能再叠上记号自己的动画。
    // 2026-10-31（t29）：记号那三处搬进 HTML（`.gf-live`）之后不再住在这张 SVG 里，
    // 所以这个类两边都挂——按停的规矩对哪一边都能生效。
    if (stage.overlaySvg) stage.overlaySvg.setAttribute('class', 'gf-overlay-svg gf-zooming')
    if (stage.live) stage.live.setAttribute('class', 'gf-live gf-zooming')
  }
  if (!d.moved) return
  if (stage.zoomAt) {
    stage.zoomAt = null
    stage.zoomLocal.removeAttribute('data-on')
    // 那层地方图**真的不画**（display:none），不是压透明度：压着它照样每帧重画
    // 5686 个元素，拖动一帧 32–40ms；真藏掉回到 20–24ms。
    stage.zoomLocal.setAttribute('data-drag', '')
    // 乙：整组挂上 [data-drag]，换快速栅格化；小全图那张也一起收起来。
    stage.zoom.setAttribute('data-drag', '')
    stage.mini.setAttribute('data-drag', '')
  }
  // 丙：拖动期间地面上该露哪一层。
  zoomGround(stage)
  if (stage.zoomTimer) {
    clearTimeout(stage.zoomTimer)
    stage.zoomTimer = 0
  }
  zoomQuietDrop()
  // 一.2：手停了就先把「松手多半会落的那一扇」建起来（手还在动就一直往后推）。
  zoomDragQuietPoke(stage)
  // 松手乙：每一次 pointermove 都重算一遍「松手会落的那一扇」，并让空闲片自己看
  // 「手停了没有」（`zoomDragReady`）——手一直在动时它一片都不建，手一停就建。
  // 上一版预建的是「整扇窗错开一格」的八个邻居（`zoomPrewarm`），跟一次拖动真正会落的
  // 那一扇对不上：窗心吸附到 1/4 个世界单位，一次拖十几个单位落点就在两扇窗之间，排了也用不上。
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    zoomMoveAt = performance.now()
  }
  zoomDragJob = zoomDragTarget(stage)
  zoomPump()
  zoomFrame(stage)
}

/**
 * 丙：拖动期间地面上露哪一层。
 *
 * 烘好的位图顶上来（挪一张 1524×786 的图＝一次贴图），矢量那层收起来；
 * 还没烘好（或者这台环境烘不出来）就退回矢量——功能一模一样，只是慢一些。
 */
function zoomGround(stage) {
  if (zoomShotState === 2) {
    stage.zoomBit.setAttribute('data-on', '')
    stage.zoomWorld.setAttribute('display', 'none')
  } else {
    stage.zoomWorld.removeAttribute('display')
  }
}

/** 把这一帧的位置写下去：地面那层、记号那层。 */
function zoomPaint(stage, d) {
  setAttr(stage.zoomPan, 'transform', `translate(${f2(d.dx)} ${f2(d.dy)})`)
  // 记号、地名签、提灯跟地面走同一个位移。它们原来是钉在屏幕上不动的，
  // 地面一滑就「记号跟脚下的地对不上」（用户 2026-10-08 第 3 条）。
  zoomOverlay(stage, d.dx, d.dy)
  // 小全图上那个框这一帧**不写**：拖动期间那张小图整个收起来了（乙的 [data-drag]），
  // 写了也是白写一次重算；松手时 `zoomSetWin` 会把框画到落定那扇窗上。
}

/** 甲：这一帧还没排过就排一次；排过就让它去。没有 rAF 的垫片当场写。 */
function zoomFrame(stage) {
  if (typeof requestAnimationFrame !== 'function') {
    if (stage.drag) zoomPaint(stage, stage.drag)
    return
  }
  if (stage.zoomRaf) return
  stage.zoomRaf = requestAnimationFrame(() => {
    stage.zoomRaf = 0
    if (stage.drag && stage.zoomOn) zoomPaint(stage, stage.drag)
  })
}

/** 甲：把还没落下来的那一帧撤掉（松手、退出时用；位置已经记在 d 上了）。 */
function zoomFrameDrop(stage) {
  if (!stage.zoomRaf) return
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(stage.zoomRaf)
  stage.zoomRaf = 0
}

/** 松手：落定一扇窗（吸附到 1/4 格），再画地方图。 */
function zoomUp(stage, ev) {
  const d = stage.drag
  stage.drag = null
  zoomDragging = false
  zoomDragQuietDrop()
  zoomDragJob = null
  zoomFrameDrop(stage)
  // 手一松就让记号那三处动画接着走（拖动中按停的，见 CSS 里那段）。
  if (stage.overlaySvg) stage.overlaySvg.setAttribute('class', 'gf-overlay-svg')
  if (stage.live) stage.live.setAttribute('class', 'gf-live')
  if (!d || !stage.zoomOn) return
  if (ev && ev.pointerId != null && typeof stage.svg.releasePointerCapture === 'function') {
    try {
      stage.svg.releasePointerCapture(ev.pointerId)
    } catch (e) {
      // 垫片里没有指针捕获，忽略。
    }
  }
  // 点了一下（不是拖）：细节版里什么都不做——出去靠双击 / Esc / 那颗按钮。
  if (!d.moved) return
  const w = stage.zoomWin || [VIEW.x, VIEW.y]
  const [wx, wy] = zoomOrigin(w[0] + ZOOM_W / 2 - d.dx, w[1] + ZOOM_H / 2 - d.dy)
  zoomSwap(stage, wx, wy, ZOOM_HOLD_MS)
}

/** 小全图上点一下：把细节版挪过去（点哪儿看哪儿）。 */
function zoomMiniJump(stage, ev) {
  if (!stage.zoomOn) return
  const b = typeof stage.mini.getBoundingClientRect === 'function' ? stage.mini.getBoundingClientRect() : null
  const cx = Number(ev && ev.clientX)
  const cy = Number(ev && ev.clientY)
  const px = VIEW.x + (((Number.isFinite(cx) ? cx : 0) - (b ? b.left : 0)) / ((b && b.width) || 112)) * VIEW.w
  const py = VIEW.y + (((Number.isFinite(cy) ? cy : 0) - (b ? b.top : 0)) / ((b && b.height) || 58)) * VIEW.h
  const [wx, wy] = zoomOrigin(px, py)
  zoomSwap(stage, wx, wy, ZOOM_HOLD_MS)
}

// 这里原来住着「丙」那套几何（`lensShift` / `lensApplyZoom` / `nightLensAt`，第四十七版，
// 用户 m18983 定的）：镜子是钉在鼠标底下的一个圆，得按镜子的映射把「他脚下那块地」
// 偏到镜心里、再倒推出镜内那圈光池的圆心与半径。第五十六版换成两级地图之后，
// 这一整套都不需要了——细节版是**换 viewBox** 换出来的，记号那一层补一个反缩放
// （见 zoomOverlay）就落在原地，光池吃的又是同一条世界坐标的渐变（见 buildStage）。

/** 上一次按哪扇窗排过预建，避免在同一扇窗里反复重排。 */
let zoomPrewarmKey = ''

/** 正在拖地图。拖动期间**一个预建都不许落下来**——建一扇是 36ms 的同步块。 */
let zoomDragging = false

/**
 * 把当前这扇窗周围那八扇排进空闲队列。
 *
 * 一扇地方图在浏览器里 36ms（拼字符串）+ 23ms（解析），松手那 90ms 里根本画不完；
 * 但**停稳之后**的空闲时段很多（他在看、在念）。邻居先建好，等他真拖过去就是缓存命中，
 * `zoomDraw` 当场就换上去，「拖一下顿一下」大半就没了。
 *
 * **「邻居」是整扇窗错开一格**（`±ZOOM_W / ±ZOOM_H`）：这一版的窗是拖出来的，
 * 一次拖过头就是好几扇窗——按整扇窗排比按「安全区」排更贴下一步真会走到的地方。
 *
 * 排进队里不算数，还要过一道**静默期**才真开始建（见 `zoomQuietPoke`）。
 *
 * **只在真有 `requestIdleCallback` 的浏览器里跑**：自检的垫片没有这个，
 * 断言跑的是同步那条路，不能被一串后台建图搅了。
 */
function zoomPrewarm(wx, wy) {
  const here = `${wx}:${wy}`
  if (here === zoomPrewarmKey) return
  zoomPrewarmKey = here
  zoomQueue.length = 0
  if (typeof requestIdleCallback !== 'function') return
  // 窗心是夹在世界里面的，贴边时好几个「邻居」会挤成同一扇，按键去个重。
  const seen = new Set()
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      // 一整扇窗错开一格之后**还是**一扇合法的窗（夹边、吸附都跟 `zoomOrigin` 一样），
      // 算出来的键才跟将来真拖过去时那个键一致。
      const [cx, cy] = zoomOrigin(wx + ZOOM_W / 2 + dx * ZOOM_W, wy + ZOOM_H / 2 + dy * ZOOM_H)
      const focus = focusAt(cx + ZOOM_W / 2, cy + ZOOM_H / 2).focus
      const key = `${cx}:${cy}:${focus}`
      if (seen.has(key) || zoomCache.has(key)) continue
      seen.add(key)
      zoomQueue.push([key, cx, cy, focus])
    }
  }
  zoomQuietPoke()
}

/**
 * 一.1：面板刚画出来的时候，把他所在那一扇先排进空闲队列。
 *
 * 为什么：点进细节版那一下是**必付**的——那一扇地方图在浏览器里 36ms 拼串 ＋ 23ms 解析，
 * 加起来约 60ms 的同步块。原来只有「画过一次之后」才开始预建周围（`zoomDraw` 末尾那次
 * `zoomPrewarm`），所以第一次点进去永远是现建。他站在哪儿面板一上来就知道，趁空闲先建好，
 * 那一下就是缓存命中、当场换上去。
 *
 * 排的是**他那一扇自己**（`zoomPrewarm` 排的是周围八扇、不含自己），所以插到队头。
 * 静默期那道闸（`zoomQuietPoke`）照样过——面板刚出现时他多半正在看，不该抢这一下。
 */
function zoomWarm(px, py) {
  if (typeof requestIdleCallback !== 'function') return
  const [wx, wy] = zoomOrigin(px, py)
  const { focus, key } = zoomKey(wx, wy)
  if (zoomCache.has(key)) return
  zoomQueue.unshift([key, wx, wy, focus])
  zoomQuietPoke()
}

/** 乙：按当前位移算「松手会落的那一扇」（算式跟 `zoomUp` 里那句一模一样），没建过才有值。 */
function zoomDragTarget(stage) {
  const d = stage.drag
  if (!d || !d.moved || !stage.zoomOn) return null
  const w = stage.zoomWin || [VIEW.x, VIEW.y]
  const [wx, wy] = zoomOrigin(w[0] + ZOOM_W / 2 - d.dx, w[1] + ZOOM_H / 2 - d.dy)
  const { focus, key } = zoomKey(wx, wy)
  if (zoomCache.has(key)) return null
  return [key, wx, wy, focus]
}

/** 乙：手停了没有——离上一次 `pointermove` 够久就算停（垫片里没有 `performance`，就当停了）。 */
function zoomDragReady() {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') return true
  if (!zoomMoveAt) return true
  return performance.now() - zoomMoveAt >= ZOOM_DRAG_GAP_MS
}

/** 一.2：拖动里手停了 `ZOOM_DRAG_QUIET_MS` 就把「松手多半会落的那一扇」排上（见 zoomDragWarm）。 */
function zoomDragQuietPoke(stage) {
  if (zoomDragQuiet) clearTimeout(zoomDragQuiet)
  zoomDragQuiet = setTimeout(() => {
    zoomDragQuiet = 0
    zoomDragWarm(stage)
  }, ZOOM_DRAG_QUIET_MS)
}

/** 一.2：手停了——把松手要落的那扇窗算出来先建好（乙：改走 `zoomDragTarget`）。 */
function zoomDragWarm(stage) {
  const job = zoomDragTarget(stage)
  if (!job) return
  if (typeof requestIdleCallback !== 'function') return
  zoomDragJob = job
  // 拖动期间那道闸是关着的，所以这一次要 force 才落得下来（见 zoomPump）。
  zoomPump(true)
}

/** 一.2：那次计时器作废（松手、退出、又动了一下）。 */
function zoomDragQuietDrop() {
  if (!zoomDragQuiet) return
  clearTimeout(zoomDragQuiet)
  zoomDragQuiet = 0
}

/**
 * 静默期计时：一动就把它按掉，停稳 `ZOOM_QUIET_MS` 才放预建开工。
 *
 * 这不是「优雅」——是量出来的：预建是 36ms 的同步块，拆不开，
 * 只要它在拖动的时候落下来，就是一次实打实的掉帧。
 */
function zoomQuietPoke() {
  // 正在拖就根本不排：静默期再短也可能在他松手前落下来。
  if (zoomDragging) return
  if (zoomQuiet) clearTimeout(zoomQuiet)
  zoomQuiet = setTimeout(() => {
    zoomQuiet = 0
    zoomPump()
  }, ZOOM_QUIET_MS)
}

/** 动了一下：静默期作废。 */
function zoomQuietDrop() {
  if (!zoomQuiet) return
  clearTimeout(zoomQuiet)
  zoomQuiet = 0
}

/**
 * 空闲片里建一扇，建完接着排下一个。
 *
 * **不设 `timeout`**：真空闲才建。设了 timeout 就等于「页面忙起来也照建」，
 * 那正好会在用户拖得最起劲的时候插进一个 36 ms 的同步块——跟优化的目的反着。
 * 排不动就算了，退化成没有预建，只是少一层便宜。
 *
 * `force`（一.2）：拖动里他手停了那一下要的那一扇，允许落下来一次。
 *
 * 乙（用户 m22080 那一版的第二件，2026-10-08）：拖动期间**不再一律禁掉**。原来第一句就是 `if (zoomDragging && !force) return`，
 * 于是「手停 160ms 那一次 force」几乎不触发（人拖动时手停不到 160ms），松手那一扇永远冷。
 * 现在判据换成 `zoomDragReady()`——离上一次 `pointermove` 够久就算手停，哪怕只停一帧半。
 * 手一直在动时那一片让掉（**一帧都不多掉**），手一停就建；排队优先建 `zoomDragJob`
 * （按当前位移算出来的「松手会落的那一扇」），建完再回到平时的邻居预建。
 */
function zoomPump(force) {
  if (zoomIdle) return
  if (!zoomQueue.length && !zoomDragJob) return
  if (typeof requestIdleCallback !== 'function') return
  zoomIdle = requestIdleCallback(() => {
    zoomIdle = 0
    // 手还在动：这一片让掉，等它停了再来（每次 pointermove 都会重新排一次）。
    if (zoomDragging && !force && !zoomDragReady()) {
      if (zoomDragJob || zoomQueue.length) zoomPump()
      return
    }
    const job = zoomDragJob || zoomQueue.shift()
    zoomDragJob = null
    if (job) {
      const [key, cx, cy, focus] = job
      if (!zoomCache.has(key)) {
        zoomCache.set(key, build_local(cx, cy, focus))
        if (zoomCache.size > ZOOM_CACHE_MAX) zoomCache.delete(zoomCache.keys().next().value)
      }
    }
    zoomPump()
  })
}

/**
 * 从这栋房子走到那栋房子要多久。
 *
 * 用户 2026-10-05：「他移动得太快了，我们这个地图是大地图，他不应该移动得这么快，
 * 而是从一个点到另外一个点，上一分钟还在落脚处，下一分钟就到了卷轴塔，这简直是在飞。」
 *
 * 地图是 96×54 的世界，两座城之间隔二三十个单位，所以走一趟本来就有远近之分：
 * 隔壁镇十几秒，从落脚处横穿到卷轴塔要走两秒多。记号不再是「刷」地跳过去，
 * 而是沿着一条线慢慢挪过去——**这就是这一版里他会做的第二个动作**。
 *
 * 2026-10-06：地图换了一版，大陆在世界坐标里从 96 宽缩到 66 宽（同样的一块地），
 * 所以同样的格数变少了、走过去会显得快。按 93/66 ≈ 1.41 把每格的时间补回来，
 * 「从落脚处横穿到卷轴塔」还是那两秒多。
 */
const WALK_MS_PER_TILE = 78
function travelMs(fromId, toId) {
  const a = PLACES[fromId]
  const b = PLACES[toId]
  if (!a || !b || a.id === b.id) return 0
  const d = Math.hypot(a.door[0] - b.door[0], a.door[1] - b.door[1])
  // 最近的两个镇（12 格）也要走 1.2 秒——不能有「一闪就到了」这种走法；
  // 最远的一对（酒馆 ↔ 卷轴塔，58 格）走 3.2 秒，仍然短于界面每 5 秒一次的重画。
  return Math.max(1200, Math.min(3600, Math.round(d * WALK_MS_PER_TILE)))
}

/**
 * 走一小段路。**没有 requestAnimationFrame 就一步走到**——自检里那套最小 DOM
 * 垫片没有它，测试要能断言「落在终点」而不是「停在半路」。
 * 缓动是 smoothstep：起步和落脚都慢，中间快，像人走路。
 */
function walk(from, to, ms, onFrame) {
  const raf =
    typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : null
  if (!raf || !(ms > 0)) {
    onFrame(1)
    return
  }
  const t0 = Date.now()
  onFrame(0)
  const step = () => {
    const k = Math.min(1, (Date.now() - t0) / ms)
    onFrame(k * k * (3 - 2 * k))
    if (k < 1) raf(step)
  }
  raf(step)
}

/**
 * 把「他此刻在哪」画进去：记号挪到那个城镇门口，灯跟过去，地名贴在旁边。
 * 出门了就都不在——地图上找不到他，这句话是真的。
 *
 * `fromPlace` 是上一次画的落脚点。给了、而且跟这次不是同一个地方，
 * 就从那儿走过去（见 walk）；没给就直接站到终点，一次都不多动。
 *
 * 标签会自动躲开画布边缘：靠右边就把字放到记号左边，靠上边就放到下面。
 *
 * `warm` 是「要不要顺手把他那一扇地方图排进空闲队列」。面板收着的时候给 false——
 * 见 `zoomWarm` 那一处的算法：那一次预建是开机后一次 111ms 的空闲长任务，
 * 而插件挂上来的那一刻正好是 DSH 自己在启动的时候，收着时没人看得见那扇图。
 */
function renderStage(stage, narration, voice = DEFAULT_VOICE, fromPlace = null, warm = true) {
  // 面板可能刚改过宽窄：那一层（HTML）的尺寸缓存清掉，下一次 placeLive 重新量。
  stage.liveBox = null
  // 用户 2026-10-08（逐字）：「角色必须一直显示在地图上。」所以位置认不出来的时候
  // **不再把记号收起来**——退回落脚处（`home`），至少他还在图上、还有个名字。
  // 一个地点都没有的薄世界包（地理四件套全不给）才会走到 `!at`，那时候连地图都没有。
  const at = PLACES[narration.place] || PLACES.home
  const on = at ? '1' : '0'
  // 2026-10-31（t29）：灯与记号现在是 HTML 元素，亮不亮走 `style`（原来是属性）。
  // 属性 opacity 在 HTML 上不起作用，写成属性只会让「他出门了灯还亮着」这种老毛病
  // 变成一次沉默的失效——自检里那几条读的也是 style。
  stage.glow.style.opacity = on
  stage.pin.style.opacity = on
  if (!at) {
    stage.pin.removeAttribute('data-place')
    stage.pin.removeAttribute('data-from')
    stage.label?.setAttribute('opacity', '0')
    // 连一张地图都没有——记号与灯都灭，放大镜也举不起来。
    return
  }

  const paint = (px, py) => {
    stage.pinAt = [px, py]
    // 记号与灯的位置换算写在 placeLive 里（它同时管「细节版里大小不跟着放大」那件事）。
    // 灯在记号上方一个世界单位，记号本身贴在门口再往上 0.3——都在 placeLive 里加。
    placeLive(stage)
    // 提灯照地（第四十二版）：那圈光池的中心就是他的脚下，半径随时辰收放——
    // 傍晚（dusk 0.3）铺到 8.6 个世界单位，深夜只剩 6 出头（2026-10-30 地图审计 M-12：
    // 夜里天黑得彻底了，光池也不能还照那么远，不然「深夜」跟「傍晚」一个样）。
    // 圆心是**他脚下那块地**（`nightAt`），**不跟「记号画在哪儿」走**：记号本来就画在
    // 那里，甲案之后它哪儿都不去（见上面 `.gf-overlay` 那段）。`setAttr` 再把同值写入
    // 挡掉——换地方、换时辰才真写下去；他走起来的时候每帧都在算，但只有位置真变了
    // 的那几帧才落笔。
    const dusk = daylight(narration.hour).dusk
    const nightR = 9.2 - 4.0 * dusk
    stage.nightAt = [px, py]
    stage.nightR = nightR
    setAttr(stage.night, 'cx', f2(px))
    setAttr(stage.night, 'cy', f2(py))
    setAttr(stage.night, 'r', f2(nightR))
    // 记号那一层在细节版里要一个反缩放（以他脚下那块地为中心），
    // 他走起来、或者刚进出细节版，都得跟着重算一次。写一次属性就是一次样式重算，
    // 所以 `setAttr` 挡掉同值写入——他站着不动时那串 transform 一个字节都不变。
    zoomOverlay(stage)
    // 他走出细节版那扇窗了就把视野挪到他身上（见 zoomFollow）。
    zoomFollow(stage, px, py)
    // 一.1：面板画第一笔的时候，把他所在那一扇排进空闲队列——第一次点进细节版就不必现建。
    // 2026-10-09：**面板收着的时候不排**（`warm` 由刷新那一头传进来，见 renderStage 的头注释）。
    // 量出来的账：那一次预建是一次 111ms 的空闲长任务（CDP 里的 FireIdleCallback，占满那一拍的主线程），
    // 而插件挂上来的那一刻正是 DSH 自己在启动的时候。收着的时候面板整个不排版，那一扇建了也没人看得见；
    // 掀开面板这一路照样会走到这儿（setOpen(true) → refresh → renderStage），缓存还是热的。
    if (!stage.warm && warm) {
      stage.warm = true
      zoomWarm(px, py)
    }

    if (stage.label) {
      const name = placeName(at.id, voice)
      if (name === '') {
        stage.label.setAttribute('opacity', '0')
      } else {
        // 字宽只能估：这台机器量不了文本。中日韩按整字宽算，够用。
        // （字号见上面 U15：1.75，与 labelText 的 font-size 是同一个数）
        // 2026-10-30 M-4：落点交给 `placeLabel()`——四个方向各试一次，挑压得最少的，
        // 压的是图上真有的那些字与记号（世界图自己那块牌子用的是同一条 `plate_rect`）。
        // 字号统一走 `PLACE_FS`：1.75 时十三枚里有十枚压在图上别的字上，1.6 时剩两枚；
        // 挤不下时 `placeLabel` 还会再收一档，返回的第五项就是实际用的那个字号。
        const fs = PLACE_FS
        const rect = placeLabel(px, py, name, fs, VIEW)
        const size = rect[4] || fs
        const x = rect[0]
        const y = rect[1]
        const w = rect[2] - rect[0]
        stage.label.setAttribute('opacity', '1')
        stage.labelBg.setAttribute('x', x.toFixed(1))
        stage.labelBg.setAttribute('y', y.toFixed(1))
        stage.labelBg.setAttribute('width', w.toFixed(1))
        stage.labelBg.setAttribute('height', (rect[3] - rect[1]).toFixed(1))
        stage.labelText.setAttribute('x', ((rect[0] + rect[2]) / 2).toFixed(1))
        stage.labelText.setAttribute('font-size', size.toFixed(2))
        // 2026-10-31：跟 `plate_text_y` 一起正过来（0.42→0.28 的同一笔）。
        // 原来落 1.37，字贴着底板下沿；落 1.23 两边空当才相等。
        stage.labelText.setAttribute('y', (y + size * 1.23).toFixed(1))
        stage.labelText.textContent = name
      }
    }
  }

  const [px, py] = at.door
  const prev = PLACES[fromPlace]
  if (prev && prev.id !== at.id) {
    stage.pin.setAttribute('data-from', prev.id)
    const lerp = (a, b, k) => a + (b - a) * k
    const a = prev.door
    walk(a, at.door, travelMs(prev.id, at.id), (k) => paint(lerp(a[0], px, k), lerp(a[1], py, k)))
  } else {
    stage.pin.removeAttribute('data-from')
    paint(px, py)
  }
  stage.pin.setAttribute('data-place', at.id)
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function doorSvg() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 1024 1024')
  svg.setAttribute('width', '64')
  svg.setAttribute('height', '64')
  svg.setAttribute('aria-hidden', 'true')
  const paths = [
    ['M752 880V400a240 240 0 0 0-480 0v480z', 'var(--gf-door-1)', null],
    ['M712 840V400a200 200 0 0 0-400 0v440z', 'var(--gf-door-2)', null],
    ['M752 880V400a240 240 0 0 0-480 0v480', 'none', 'var(--gf-door-edge)'],
    ['M312 840V400a200 200 0 0 1 400 0v440', 'none', 'var(--gf-door-edge)'],
    ['M272 880h480', 'none', 'var(--gf-door-edge)'],
  ]
  const widths = [0, 0, 30, 14, 42]
  paths.forEach(([d, fill, stroke], i) => {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    p.setAttribute('fill', fill)
    if (stroke) {
      p.setAttribute('stroke', stroke)
      p.setAttribute('stroke-width', String(widths[i]))
      p.setAttribute('stroke-linecap', 'round')
    }
    svg.appendChild(p)
  })
  const knob = document.createElementNS(ns, 'circle')
  knob.setAttribute('cx', '650')
  knob.setAttribute('cy', '576')
  knob.setAttribute('r', '30')
  knob.setAttribute('fill', 'var(--gf-door-knob)')
  svg.appendChild(knob)

  // 门缝里透出来的那道光。平时完全看不见，手放上去才亮——
  // 门后面是有人在的，这一句不用说出口。
  const cracks = [
    ['250', '880', '524', '20', '0.55'],
    ['300', '868', '424', '28', '1'],
  ]
  cracks.forEach(([x, y, w, h, dim]) => {
    const r = document.createElementNS(ns, 'rect')
    r.setAttribute('x', x)
    r.setAttribute('y', y)
    r.setAttribute('width', w)
    r.setAttribute('height', h)
    r.setAttribute('rx', String(Number(h) / 2))
    r.setAttribute('fill', 'var(--gf-door-knob)')
    r.setAttribute('class', 'gf-door-crack')
    r.setAttribute('style', `--gf-crack-dim:${dim}`)
    svg.appendChild(r)
  })

  return svg
}

/**
 * 地图右上角那枚「始终显示」的图钉（用户 m19425 第 1 条）。
 * 两枚路径叠在同一个 svg 里，按没按下去交给 CSS（见 `.gf-always` 那一段）：
 * 没按是空心钉，按下去是实心钉加印色——常见的那种「钉住 / 始终显示」就是这两副样子。
 */
function pinSvg() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'gf-always-icon')
  svg.setAttribute('aria-hidden', 'true')
  const paths = [
    ['gf-pin-outline',
      'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z'],
    ['gf-pin-filled', 'M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z'],
  ]
  for (const [cls, d] of paths) {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('class', cls)
    p.setAttribute('d', d)
    p.setAttribute('fill', 'currentColor')
    svg.appendChild(p)
  }
  return svg
}

/**
 * 那一天收出来的那份「记录」——高光事件判条件用的（见 `src/packs/adventure/moments.js`）。
 *
 * 日卷那一行（`rollUnit`）本来就把这一天的次数、时长、动作、交出去的东西收好了，
 * 所以这里只补**只有按天看才有的三样**：
 *   · `hours`  这一天里出现过的钟点（按格算）——「后半夜还在干」靠它；
 *   · `places` 这一天到过的地方（面板上那七处，取 `pickShards` 挑出来的 `place`）；
 *   · `scenes` 这一天出现过的景（26 个场景键）——「下过矿洞」「问过路」靠它。
 *
 * 地方与景**只能从 `seq` 取**：那是「这句话讲的是哪一件事」的同一份答案，
 * 另挑一次就会跟屏幕上那句话对不上（见 `pickShards` 的 `sceneOf`）。
 */
function dayFacts(roll, list, seq) {
  const hours = new Set()
  const places = new Set()
  const scenes = new Set()
  for (const unit of list) {
    hours.add(new Date(unit.at).getHours())
    const picked = seq.get(unit.key)
    if (!picked) continue
    if (picked.place) places.add(picked.place)
    if (picked.sceneKey) scenes.add(picked.sceneKey)
  }
  return { ...(roll.entry || {}), hours, places, scenes }
}

/**
 * 方向那一档的危险加减（见 `DIRECTIONS` 的 `bias`）：涉险的日子危险高一档、过日子低一档。
 *
 * 这是**方向唯一直接改数字的地方**，而且改的是「这一天他会不会撞上事」，
 * 不改任何事实：撞墙次数、时长、动作次数都是记录里的真数。没有方向（老记录、
 * 周/月/年卷、或者薄包没写方向）就是 0，跟从前一字不差。
 */
function directionBias(entry) {
  const id = entry && entry.direction
  if (!id) return 0
  const dir = (DIRECTIONS || []).find((one) => one && one.id === id)
  const bias = dir ? Number(dir.bias) : 0
  return Number.isFinite(bias) ? bias : 0
}

/**
 * 每一天朝哪边走：`Map`，key 是那一天的零点，值是 `DIRECTIONS` 里那一格（判不出来就是 `null`）。
 *
 * 用户 m07234 第 2 条问的是「比例」。这里的比例是**上限，不是配额**：
 * 一天落哪个方向，由**那天真有没有那件事**决定（条件写在包里），`cap` 只管「不许过多」——
 * 判的时候看这一天**之前所有日子**里这个方向已经占了多少，加上这一天会不会超过上限。
 * 所以「涉险」最多占一半；真没事的那天也不会被硬写成涉险。
 *
 * **只看更早的日子**是有意的：明天多了一条记录，昨天、上个月的方向一个都不许变
 * （历史不能被重写）。所以这里从最早的一天往后走一遍，边算边把结果记成 `before`。
 *
 * 顺带把结果**挂回记录上**（`entry.direction`）：`dangerOf` 与 `worldLine` 读的就是它。
 * 那是个推出来的字段——每次渲染按同一份记录重算，`records.json` 一个字节都不动。
 */
function directionsFor(entries) {
  const out = new Map()
  if (!Array.isArray(DIRECTIONS) || !DIRECTIONS.length) return out
  const byDay = new Map()
  for (const entry of entries) {
    if (!entry || !Number.isFinite(Number(entry.startedAt))) continue
    const day = startOfDay(entry.startedAt)
    if (!byDay.has(day)) byDay.set(day, { hours: new Set(), fails: 0, minutes: 0, deliverables: [], counts: {} })
    const box = byDay.get(day)
    box.hours.add(new Date(Number(entry.startedAt)).getHours())
    box.fails += Math.round(Number(entry.fails) || 0)
    box.minutes += Math.round(Number(entry.minutes) || 0)
    for (const thing of entry.deliverables || []) box.deliverables.push(thing)
    for (const [act, n] of Object.entries(entry.counts || {})) box.counts[act] = (box.counts[act] || 0) + (Math.round(Number(n)) || 0)
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const before = []
  for (const day of days) {
    const dir = rulesDirectionOf(byDay.get(day), DIRECTIONS, { before })
    out.set(day, dir)
    if (dir) before.push(dir.id)
  }
  for (const entry of entries) {
    if (!entry || !Number.isFinite(Number(entry.startedAt))) continue
    const dir = out.get(startOfDay(entry.startedAt))
    entry.direction = dir ? dir.id : undefined
  }
  return out
}

/**
 * 岔口挑过哪一条（2026-10-08 加的，用户 m10670 第 2 条：「我要的交互选项在哪？」）。
 *
 * 到这一版之前，那件事走到一半他走的是哪条路是**机器按真事实挑的**，只叙述出来。
 * 现在它是一件**你能点的事**：两条路摆成两个可点的胶囊，点一下那条路就定下来。
 *
 * 三条规矩：
 *   · **只记在本地**（跟挑说法同一个 `store`，另一个键），**不写 `records.json`**——
 *     记录里仍然只有你真做的事；
 *   · 键是「哪一天 + 哪件事」（`day:<那天零点>|night-raid`），所以挑的那条**封在那一件里**：
 *     同一份记录看两遍、换一套说法再回来看，都是你挑的那条；
 *   · 没挑过的，照旧由 `choiceOf` 按真事实自己落一条（用户 ④ 的原话：「不选当天自己落一个」）。
 *
 * 挑的机会就是**那件事正在眼前的时候**（用户 m11863 第 2 条：「我们所说的让用户进行交互的
 * 选项，不是一直显示，只会显示最新的一条，如果最新的一条不是选项，那么就没有选项让用户选，
 * 我们的选项只有在用户刚好在这个5分钟内还没有落定的时候才会显示给他，否则就自动选择其中
 * 一条进行描述了。」）：只有**最新那一卷日卷**（日卷从新到旧排，`rank === 0`）摆选项，
 * 而且**只有当格还没落定**（`now` 还在最新那一格的五分钟里）时才摆。干着活的时候每五分钟
 * 落一格，窗口就一直开着；停下来超过五分钟，窗口关上，那一天就照机器自己落的那条算。
 */
const CHOICE_STORE_KEY = 'dsh.gameflow.choices'

/* 册子的进度：**两个整数**，别的什么都不存（用户 m16552）。
 *
 * 他第 1 条把整件事定成「一本书」：主线是册子上那十一处，现实里一到七天讲完；岔口选对了
 * 书往下讲，选错了就死（第二天册子把他收回来、**他不记得**）。存档只留今天（用户 m01403
 * 「旧日子删除」），所以**不存这两个数，第二天就不知道讲到第几章**——书接不上。
 *
 *   `seals`  —— 册子上按了几个指印（描过几处，也就是书的第几章）
 *   `deaths` —— 死过几次（第二天册子把他收回来一次，就多一个）
 *
 * 这是**破例**：方案 A 原本不加跨天记忆（用户 m14810 第 4 条），可是书要跨天就得有进度。
 * 破的限度划得很死——**不存记录、不存句子、不存钟点**，就两个整数，跟 `since` / `seam`
 * 那两个标量同一个量级；`records.json` 一个字不写，全在本地 `store` 里。 */
const LEDGER_STORE_KEY = 'dsh.gameflow.ledger'

/** 册子上的进度。没记过 / 坏了当第一天的头一章。 */
function readLedger(store) {
  if (!store || typeof store.getItem !== 'function') return { seals: 0, deaths: 0 }
  try {
    const data = JSON.parse(store.getItem(LEDGER_STORE_KEY) || 'null')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { seals: 0, deaths: 0 }
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0)
    return { seals: n(data.seals), deaths: n(data.deaths) }
  } catch {
    return { seals: 0, deaths: 0 }
  }
}

/** 记下进度。存储坏了就算了——记不住不该把面板弄崩。 */
function writeLedger(store, ledger) {
  if (!store || typeof store.setItem !== 'function') return
  try {
    store.setItem(LEDGER_STORE_KEY, JSON.stringify({ seals: ledger.seals | 0, deaths: ledger.deaths | 0 }))
  } catch { /* 记不住就算了，这一次照样按算出来的显示 */ }
}

/* 「留住」那个常驻按钮的开关（用户 m11003 第 3 条：「让门后的事情可以一直浮现」）。
   跟挑说法、挑岔口同一个 `store`、又一个键：它记的是**这一页要不要一直开着**。
   记不住的存储（预览页）就当没留住——那一档照旧鼠标移开就收。 */
const PIN_STORE_KEY = 'dsh.gameflow.pinned'

/** 上次留住了没有。 */
function readPin(store) {
  if (!store || typeof store.getItem !== 'function') return false
  try {
    return store.getItem(PIN_STORE_KEY) === '1'
  } catch {
    return false
  }
}

/** 记住留不留住。存储坏了就算了。 */
function writePin(store, on) {
  if (!store || typeof store.setItem !== 'function') return
  try {
    store.setItem(PIN_STORE_KEY, on ? '1' : '0')
  } catch {
    /* 记不住就算了——不该因为记不住把面板弄崩 */
  }
}

/* 开场那一颗「开始冒险」按过没有（用户 m01903 第 1 条）。记的是**那一天的零点**，
   不是「按过一次就永远不再问」——他第 2 条要的是每天都有一场新的命运抉择，所以每天
   开机都该有这一下。跟别的键同一个 `store`，`records.json` 一个字不写。 */
const START_STORE_KEY = 'dsh.gameflow.started'

/* 那两条说明（用户 m01903 第 1 条逐字：「每5分钟会更新一次事件；极少数情况下需要您来
   做出选择。」）。照原话留阿拉伯数字——这是界面上的话，不进包，也就不过那几条规矩。 */
const START_HINTS = ['每5分钟会更新一次事件。', '极少数时候，需要你来定一件大事。']

/** 上次按「开始冒险」是哪一天（那一天的零点）。没记过 / 坏了当没按过。 */
function readStarted(store) {
  if (!store || typeof store.getItem !== 'function') return 0
  try {
    return Number(store.getItem(START_STORE_KEY)) || 0
  } catch {
    return 0
  }
}

/** 记住今天是按过的。存储坏了就算了。 */
function writeStarted(store, dayFrom) {
  if (!store || typeof store.setItem !== 'function') return
  try {
    store.setItem(START_STORE_KEY, String(dayFrom))
  } catch {
    /* 记不住就算了——不该因为记不住把面板弄崩 */
  }
}

/** 存储里那一份「挑过哪几条」：读不出来（没记过 / 坏了）就当没挑过。 */
function readChoices(store) {
  if (!store || typeof store.getItem !== 'function') return {}
  try {
    const raw = store.getItem(CHOICE_STORE_KEY)
    const data = raw ? JSON.parse(raw) : null
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/** 记下一条。存储坏了就算了——挑不动不该把面板弄崩。 */
function writeChoices(store, choices) {
  if (!store || typeof store.setItem !== 'function') return
  try {
    store.setItem(CHOICE_STORE_KEY, JSON.stringify(choices))
  } catch { /* 记不住就算了，这一次照样按你挑的显示 */ }
}

/**
 * 「命运压下来那一刻」那枚钉子，也落一份在本地（2026-10-31，用户报「命运变了」）。
 *
 * 原来它只活在内存里（`forkPin = { value: null }`），DSH 一重启就没了；而「哪一件压下来」
 * 是拿**当下这一整天的账**判的（`rulesForkOf`），账一直在长，于是重启之后重算会换人——
 * 用户眼睁睁看着它从「先搬那箱名册 / 先撬那根梁」变成「横到路当中 / 先看清来路」，
 * 而这时候他一个字都还没挑。**没挑之前，压下来的那一件必须钉死。**
 *
 * 存的只有三个数：哪一天（`day`）、哪一件（`id`）、压在哪个时刻（`at`）。
 * 记录里一个字都不写——跟挑法一样，是界面这边的事。
 */
const FORK_PIN_STORE_KEY = 'dsh.gameflow.forkpin'

function readForkPin(store) {
  if (!store || typeof store.getItem !== 'function') return null
  try {
    const raw = store.getItem(FORK_PIN_STORE_KEY)
    const data = raw ? JSON.parse(raw) : null
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const day = Number(data.day)
    const at = Number(data.at)
    if (!Number.isFinite(day) || !Number.isFinite(at) || typeof data.id !== 'string' || !data.id) return null
    return { day, id: data.id, at }
  } catch {
    return null
  }
}

function writeForkPin(store, pin) {
  if (!store || typeof store.setItem !== 'function') return
  try {
    if (!pin) store.removeItem(FORK_PIN_STORE_KEY)
    else store.setItem(FORK_PIN_STORE_KEY, JSON.stringify({ day: pin.day, id: pin.id, at: pin.at }))
  } catch { /* 记不住就算了，这一次照样按钉住的显示 */ }
}

/** 「哪一天 + 哪件事」——挑的那条就封在这个键上。 */
function choiceKey(entry, moment) {
  return `${(entry && entry.id) || ''}|${(moment && moment.id) || ''}`
}

/** 你挑过的那条路（没有挑过 / 挑的那条现在不在表里，都返回 null）。 */
function pickedRoadOf(moment, entry, choices) {
  const id = choices ? choices[choiceKey(entry, moment)] : ''
  if (!id) return null
  const roads = (moment && moment.choice && moment.choice.roads) || []
  return roads.find((r) => r && r.id === id) || null
}

/**
 * 这件事走到一半他走的是哪条路：**你挑过的优先**，没挑过才由 `choiceOf` 按真事实挑。
 *
 * 两层都用同一份事实（`momentsFor` 手上那份 `dayFacts`），所以屏幕上那件事与那条路永远配套。
 */
function roadOf(moment, entry, facts, choices) {
  return pickedRoadOf(moment, entry, choices) || rulesChoiceOf(facts, moment.choice, { outdoors: OUT_KEYS })
}

/** 这一件事的岔口里有几条**真能走**的路（有 id、有句子）。不够两条就不算岔口。 */
function roadsOf(moment) {
  const roads = moment && moment.choice && Array.isArray(moment.choice.roads) ? moment.choice.roads : []
  return roads.filter((one) => one && one.id && Array.isArray(one.lines) && one.lines.length)
}

/**
 * 「这一天到现在为止」的那份账（第二期 `stateAt` 的第一版，2026-10-10）。
 *
 * 从前判一件事看的是**这一天的总数**：`dayFacts` 拿日卷那一份账，所以「这一天出了什么事」
 * 一整天只有一个答案，而且是在这一天过完之后才成立的。用户 m14781 要的是「按照一个人的一天来
 * 写」——那就得知道**每一格上他手上是什么**：撞了几回、坐了多久、交出去几样、带着谁、在哪个景里。
 *
 * 这里只**累**、不判；判的还是机器（`momentOf` / `fightOf` 那一层）。累的这几样跟
 * `SIGNALS`（`src/packs/rules.js`）读的**同一套名字**，一个不多一个不少：`fails` / `minutes` /
 * `helpers` / `deliverables` / `actions`（走 `counts`）/ `files` / `hour`（走 `hours` 那个集合）。
 *
 * `helpers` / `deliverables` / `files` 照旧是**数组**——`SIGNALS` 读的是 `.length`，
 * 换成数字会让「有人帮手」那一项永远不中（`(3 || []).length` 是 `undefined`）。
 */
function emptyFacts() {
  return {
    fails: 0, minutes: 0, counts: {}, hours: new Set(), places: new Set(), scenes: new Set(),
    helpers: [], deliverables: [], files: [],
  }
}

function stepFacts(facts, unit, seq) {
  const entry = (unit && unit.entry) || {}
  facts.fails += Math.round(Number(entry.fails) || 0)
  facts.minutes += Math.round(Number(entry.minutes) || 0)
  for (const [act, n] of Object.entries(entry.counts || {})) {
    facts.counts[act] = (facts.counts[act] || 0) + (Math.round(Number(n)) || 0)
  }
  for (const key of ['helpers', 'deliverables', 'files']) {
    if (Array.isArray(entry[key])) for (const one of entry[key]) facts[key].push(one)
  }
  const at = Number(unit && unit.at)
  if (Number.isFinite(at)) facts.hours.add(new Date(at).getHours())
  const picked = seq && typeof seq.get === 'function' ? seq.get(unit.key) : null
  if (picked) {
    if (picked.place) facts.places.add(picked.place)
    if (picked.sceneKey) facts.scenes.add(picked.sceneKey)
  }
  return facts
}

/**
 * 命运起头的那一格：**今天最早的那一格**。
 *
 * 为什么不跟高光事件用同一台 `forkCellOf`：事件的条件能落在具体那一格上（钟点、做满多久），
 * 命运的条件全是**按天**判的（这一天走了多久、撞过几次、走过哪些景）——落在哪一格上本来
 * 就分不出来。所以一开场就算成立：起头就是今天的第一格，比它晚的那些格一个字都不写，
 * 界面停在那一行等你定（用户 m14810 第 5 条）。今天一格都没有（最后一段已经收了半小时
 * 以上）返回 `null`，按钮就长在日卷那一行上。
 */
function forkStartCell(units, todayFrom) {
  if (todayFrom === null) return null
  const cells = units
    .filter((u) => u.grid === true && startOfDay(u.at) === todayFrom)
    .sort((a, b) => a.at - b.at)
  return cells[0] || null
}

/**
 * 这一天的**每一段**，按时刻从旧到新：日卷收进去的那些段（`dayUnit.list`）＋ 屏幕上还铺着的那几格。
 *
 * 命运那一层要按这一份算**整天的账**（见 `forksFor` 与它那枚钉子）。只看屏幕上那几格是不够的：日卷收进去的
 * 段才是这一天的大半，少了它们，「这一天走过哪些景」就只剩最近半小时，命运永远只压得下来在
 * 最新那一格上——屏幕上就永远看不出「停住了」（用户 m17334 逮到的就是这个）。
 */
function dayRows(dayUnit, units, todayFrom) {
  const cells = units.filter((u) => u.grid === true && startOfDay(u.at) === todayFrom)
  const before = Array.isArray(dayUnit && dayUnit.list) ? dayUnit.list : []
  // 两截各自有序、合起来不一定有序（日卷收的那些段是从新到旧攒的）——**按时刻排一遍**，
  // 不然「第一次成立」会落在错的那一段上。
  return [...before, ...cells].sort((a, b) => Number(a.at) - Number(b.at))
}

/**
 * 往前挪一段：把这一段并进这一天那一份账里。
 *
 * 数字照旧一段一段加，**地方与景另取**——而且**只认这一段自己那一件事**（`pickShards` 不带
 * 上下文 = 一份记录一份答案）。
 *
 * 为什么不借 `seq`（屏幕上那一层）：`seq` 只认**当时铺着**的那一层。同一段记录，当格的时候
 * 取得到、被收进日卷之后就取不到了，而且两份答案还不一样（`seq` 是逐行带上文挑的，一张卡
 * 自己挑又是另一份）。于是**折叠状态一变，这一天的账就变**——命运会忽有忽无。用户 m18197
 * 逐字逮到的就是这个：「你修改完毕的时候，感叹号是存在的……但是我没有选，我挪走了鼠标，
 * 于是感叹号就消失了」。根子在 `refresh` 的两遍：第一遍照「现在」算，定出停在哪一刻；
 * 第二遍把「现在」也钉在那一刻重画——那一刻那些段又成了格、取景的口径跟着换，账一差，
 * 这一件就没了，可面板已经冻住，于是「冻着、没有按钮、记号也灭」。
 *
 * 也不借日卷那一行自己的景：那是**整天的总结**，从早上起就是那个景，命运一早就压下来、
 * 一整天都冻在开头（2026-10-11 试过）。
 *
 * 同一张卡铺了好几格时**只并一次**：`fails` / `minutes` 是**卡**上的数，不是格上的数
 * （见 `rollUnit` 里那句「铺出来但没有明细的那一格什么都不算」）。
 */
function forkStep(facts, seen, unit) {
  const card = (unit && unit.entry) || null
  const key = card && card.id ? String(card.id) : unit.key
  if (seen.has(key)) return facts
  seen.add(key)
  // `seq` 传 `null`：数字照加，地方与景由下面那一句自己补（不借屏幕上那一层）。
  stepFacts(facts, unit, null)
  const picked = card ? pickShards(card, WORLD_VOICE, null) : null
  if (picked && picked.place) facts.places.add(picked.place)
  if (picked && picked.sceneKey) facts.scenes.add(picked.sceneKey)
  return facts
}

/** 这一天累到底那一份账：**命运挑哪一件看的就是它**（含被收进日卷的那些段）。 */
function forkDayFacts(rows) {
  const facts = emptyFacts()
  const seen = new Set()
  for (const unit of rows) forkStep(facts, seen, unit)
  return facts
}

/**
 * 还没定下来的那一件命运，**钉在哪一刻**（用户 m18547 第 1、2 条）。
 *
 * 用户 m18547 逐字：「1、我们的命运选择必须是当下这个时间点的；2、在用户没有进行命运选择的
 * 时候，界面要一直停在命运选择上，并且不再有任何落盘的进程和发展，必须等用户选择之后，再开始
 * 发展。」⇒ 两件事：**哪一刻**压下来，与压下来之后**不动**。
 *
 * 「哪一刻」＝**第一次看见它的那一刻**，也就是当时屏幕上**最新那一行**（`rows` 的最后一格）。
 * 从前那一版给的是「这一天的账**第一次**让它成立的那一段」——真存档实测下来那是 12:00，而
 * 「此刻」是 12:56：用户挑的是**五十六分钟以前**那一刻，挑完往下翻，日卷那一行早把后面的事
 * 讲完了（用户 m18547：「我选择完毕之后，往下翻才发现，它属于过去时间的命运选择。那还选择
 * 什么呢？？」）。
 *
 * 「压下来之后不动」＝这个时刻**钉住**：钉住之后不重算、不跟着时钟漂，屏幕停在它上面，后面的
 * 格一个字都不写（用户 m17334：「中间所有的内容，都暂停」），直到用户定下来才解开。钉在内存里
 * 就够：同一份记录看几遍都在同一刻上；页面重开一次，它会照那时的「当下」重新钉。
 *
 * 命运挂在**日卷**那一行上（`forksFor` 只认 `unit.tier === 'day'`），而日卷要等这一天最早那一段
 * 过了半小时才成形——所以钉的那一格至少落在那一刻之后，它那一行上才有一行日卷可站。
 *
 * **它住在哪一个实例里**（报告 B-09 之后顺手收掉的债，队长第 5 条）：从前这是一个模块级的
 * `let pendingPin = null`，于是同一个页面上开两块面板（预览页 + 真面板、自检里连着 mount 几个）
 * 会共用同一枚钉子——这边钉在 14:00、那边画出来也停在 14:00，两块屏幕互相拽。现在它由
 * `createGameflow()` 造一个 holder（`{ value: null }`）自己拿着，`forksFor` 只往里读写、
 * `renderTimeline` 原样递下去：一个实例一枚钉子，页面重开一次照样重新钉。
 */

/**
 * 这一件「命运」是在**哪一格**上起头的（`momentsFor` 的 `live` 用它，用户 m14810 第 5 条）。
 *
 * 为什么要算它：那一件一旦摆出来，**后面的故事就不往下讲了**——比它晚的那些格一个字都不写，
 * 界面上就停在它那一行等你定。所以得知道「从哪一格起算」。
 *
 * 判法是拿**这一天一格一格累出来的账**（`stepFacts`）去问同一台机器：日卷那一份账先垫底
 * （`dayUnit.list` 是今天更早那些段），然后从早到晚加上每一格，**第一次**让这一件事成立的那一格
 * 就是它。所以同一份记录看几遍都在同一格上——不掷点、不读「现在」、也不写回 `records.json`。
 *
 * 一格都没有（今天最后一段已经收了半小时以上）返回 `null`：那种时候按钮长在日卷那一行上，
 * 见 `momentsFor` 的 `cellKey`。
 */
function forkCellOf(dayUnit, units, seq, momentId, todayFrom, machine = rulesMomentOf, table = MOMENTS) {
  const cells = units
    .filter((u) => u.grid === true && startOfDay(u.at) === todayFrom)
    .sort((a, b) => a.at - b.at)
  if (!cells.length) return null
  const before = Array.isArray(dayUnit && dayUnit.list) ? dayUnit.list : []
  const facts = emptyFacts()
  let opened = false
  for (const unit of [...before, ...cells]) {
    stepFacts(facts, unit, seq)
    const hit = machine(facts, table, { outdoors: OUT_KEYS })
    if (hit && hit.id === momentId) opened = true
    if (opened && unit.grid === true) return unit
  }
  return cells[cells.length - 1]
}

/**
 * 哪几行上有一件值得单讲的事：`{ map, live }`。
 *
 *   `map`  —— 行 → 那一件高光事件（跟以前一样），key 是那一行的 key（只有日卷是 `day:<那一天>`）；
 *   `live` —— **屏上正摆着的那一对选项**（没有就是 `null`）：它长在**最新那一格**那一行上。
 *
 * 只有**日卷**这一档有事件——周/月/年卷说的是「那一段」，一天的事挂在上面不合身。
 * 判条件的是 `momentOf`，读的全是记录里真有的信号：同一份记录永远得到同一件事，
 * 面板不掷点、不读「现在」。
 *
 * 岔口那一层分两处（用户 m12444 第 1、3 条；2026-10-10 按用户 m14810 第 5 条改过）：
 *
 *   - **日卷那一行**（折叠落盘的小节）只讲这一天出了什么事，**一个字都不提前说他往哪条路走**。
 *     2026-10-08 更晚他报过一次截图：那一卷是昨天的，屏幕上却摆着「挑一条路」——那是「在给昨天
 *     补一个等你挑」。现在日卷只在 `pending` 时跟着记一笔（还没落定），不摆按钮。
 *   - **选项**摆在**这一件事起头的那一格**那一行上（见 `forkCellOf`），而且**不随着五分钟过去消失**：
 *     没定下来就一直摆着，**后面的行也一直不往下写**——用户 m14810 第 5 条：「如果用户不选，
 *     后面的故事就不会继续发生，界面就停在这个地方等用户来选择」。定下来之后整条又铺开，
 *     那一卷照你定下的那条把两枚一亮一暗摆出来。
 *   - 今天最后一格已经收了半小时以上（一格都不剩）的时候按钮长在日卷那一行上：不然这一件
 *     永远摆不出来、也永远定不了，那一页就锁死了。
 */
function momentsFor(units, seq, choices = null, now = null, canPick = false) {
  const out = new Map()
  // 值从「一张 Map」改成 `{ map, live }`：`map` 是老样子，`live` 是屏上那一对选项。
  // 为什么不挂在日卷那一行上（用户 m12444）：「折叠落盘时一段小节式地描述，不能弹出选项，任何选项」
  // ＋「只有当时间处于用户目前的『此刻』且还没有落盘的时候，才给用户选项，也就是在21:40~21:45之间，
  // 才给出这个选项，并且用户可以点击进行选择，那么它会在21:45的时候落盘」。
  // 2026-10-10（用户 m14810 第 5 条）改掉的正是最后那半句：**不再有那个五分钟的窗口**，
  // 没定下来就一直等（见下面的 `pending`）。
  const result = { map: out, live: null }
  if (!Array.isArray(MOMENTS) || !MOMENTS.length) return result
  const byDay = new Map()
  for (const unit of units) {
    // 卷按它**收的那一天**归档（`unit.from`），不能拿 `unit.at` 反推：跨午夜那张卡（昨晚 23:30
    // 上手、今天 05:30 收工）的 `at` 是昨晚 23:30，反推会把今天这一卷归到昨天，
    // 于是下面 `byDay.get(unit.from)` 取到空表、钟点与地方全丢——跟 6761 行那句提醒是同一件事。
    const day = unit.roll === true ? Number(unit.from) : startOfDay(unit.at)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(unit)
  }
  const todayFrom = now === null ? null : startOfDay(Number(now))
  for (const unit of units) {
    if (unit.tier !== 'day') continue
    // 卷的键就是那一天（`rollUnit` 拿 `fromAt` 收的）。别拿 `unit.at` 反推：
    // 跨午夜那张卡的起点在昨天，反推会把这一天认成前一天。
    const list = byDay.get(unit.from) || []
    const facts = dayFacts(unit, list, seq)
    const moment = rulesMomentOf(facts, MOMENTS, { outdoors: OUT_KEYS })
    if (!moment) continue
    // 岔口（选择点）：这件事走到一半，他走的是哪条路。判据跟事件同一份事实，
    // 所以「屏幕上那件事」与「那条路」永远配套；走的那条封在这一件里（不掷点、不读现在）。
    // 2026-10-08 起**你挑过的优先**（见 `pickedRoadOf`）——挑过就把你那条封进来。
    const picked = pickedRoadOf(moment, unit.entry, choices)
    const roads = roadsOf(moment)
    // 这一件**正等着你定**吗（用户 m14810 第 5 条）：今天的事、还没定过、真有两条路，
    // 而且面板记得住你的挑（记不住就没法等——等了也定不了，那是把人锁在门外）。
    // 从前这里还要求「此刻那一格的五分钟还没走完」，停一会儿它就自己走一条；现在不走了。
    const pending = canPick && !picked && roads.length >= 2 && unit.from === todayFrom
    if (pending) {
      const stop = forkCellOf(unit, units, seq, moment.id, todayFrom)
      // 停在哪儿：算得出那一格就停那一格；**一格都没有**（今天还没铺格，或者这一件事靠
      // 更早那些段就成立了）就停在**这一卷自己那一行**（`unit.at` 是那一天零点）。
      // 这里**不许留 `null`**：`renderTimeline` 拿 `Number.isFinite(Number(stopAt))` 判空，
      // 而 `Number(null)` 是 `0`——那会把整条梯子全滤掉，屏幕上变成一行都没有。
      result.live = {
        key: choiceKey(unit.entry, moment),
        dayKey: unit.key,
        cellKey: stop ? stop.key : unit.key,
        at: stop ? Number(stop.at) : Number(unit.at),
        roads,
        road: null,
      }
      // 还没定：**一个字都不说他往哪条路走**，连 `marks` 都不给（这一天的账还没结）。
      out.set(unit.key, { ...moment, pending: true })
      continue
    }
    const road = picked || rulesChoiceOf(facts, moment.choice, { outdoors: OUT_KEYS })
    if (road && unit.entry) unit.entry.choice = road.id
    // `marks` 一并交出来（2026-10-09 加）：今天后面每一格的说法照它挑（见 `markOf` 与 `MARKS`）。
    // 摆在岔口上还没挑的时候**不算**——那时候这一天的账还没结，说了就成了替他认一件事。
    out.set(unit.key, road
      ? { ...moment, road, marks: Array.isArray(road.marks) ? road.marks.slice() : [], picked: !!picked, pending: false }
      : moment)
  }
  return result
}

/**
 * 你替他在这个岔口上定过哪一条（没有定过 / 定的那条现在不在表里，都返回 `null`）。
 *
 * 跟 `pickedRoadOf` 是同一件事，只是路的来路不一样：命运的路写在 `fork.roads` 上，
 * 高光事件的路写在 `moment.choice.roads` 上。
 */
function pickedForkRoad(fork, entry, choices) {
  const id = choices ? choices[choiceKey(entry, fork)] : ''
  if (!id) return null
  const roads = fork && Array.isArray(fork.roads) ? fork.roads : []
  return roads.find((r) => r && r.id === id) || null
}

/**
 * 这一天压下来的是哪一件**命运**，以及他走了哪条路、落的是哪一种结果：`{ map, live, death }`。
 *
 *   `map`   —— 行 → `{ fork, roads, road, result, picked, pending, marks, die }`（只有日卷那一档）
 *   `live`  —— **屏上正摆着的那一对选项**（没有就是 `null`）：长在**这一件起头的那一格**那一行上
 *   `death` —— 今天死过（挑到分支上带 `then.die` 的那一种结果）：右栏换成那一整块死亡页
 *
 * 跟 `momentsFor` 同一套骨架（一天一份账、同一份事实、同一套项语言），两处不一样：
 *
 *   · 判的是 `forkOf` 与 `resultOf`，表是 `FORKS`（`src/packs/adventure/forks.js`）；
 *   · 没定下来就**一直等**（用户 m14810 第 5 条），而且**代价不可知**——按钮上只有地名与
 *     眼前那一句，一个字的账都不写（用户 m16528 第 2 条）。
 *
 * 面板记不住你的挑（预览页、自检里没给 `storage`）时，**书自己往下讲**：走主线那一支。
 * 那是唯一一处不由你定的地方，也是唯一说得通的一处——没有挑的人，书就照它自己的线走。
 *
 * `seq` 这个参数留着只为跟 `momentsFor` 同一个调用形状：这一层**一个字的景都不借它**——
 * 借了就会跟着折叠状态变，命运会忽有忽无（见 `forkStep`）。
 */
function forksFor(units, seq, choices = null, now = null, canPick = false, pin = null) {
  // 没给钉子就自己造一枚：`forksFor` 是内部函数，敢直接调它的地方（自检、预览页）不该拿到
  // 半路崩掉的结果——只是那一枚钉子活不过这一次调用，跟从前「模块级」的区别正是我们要的。
  const hold = pin || { value: null }
  // DSH 重启之后 `value` 是空的——先把落盘的那一枚捞回来（见 `readForkPin` 的头注）：
  // 没挑之前，压下来的那一件不许跟着当天长出来的账换人。
  if (!hold.value && typeof hold.load === 'function') hold.value = hold.load()
  const out = new Map()
  const result = { map: out, live: null, death: null }
  const table = Array.isArray(FORKS) ? FORKS : []
  if (!table.length) return result
  const todayFrom = now === null ? null : startOfDay(Number(now))
  for (const unit of units) {
    if (unit.tier !== 'day') continue
    // 这一天那一份账按**整天的段**重放（含被收进日卷的那些段）——只看屏幕上那几格，
    // 命运就只压得下来在最新那一格上，屏幕上永远看不出「停住了」（用户 m17334）。
    const rows = dayRows(unit, units, Number(unit.from))
    if (!rows.length) continue
    const facts = forkDayFacts(rows)
    // 「哪一件」按**当下这一份账**判（用户 m18547 第 1 条）。两样例外：
    //   · 已经定下来的那一件，从存下的挑法里**找回来**——不然账一长，「哪一件」会换人，
    //     用户挑过的那一件就白挑了；
    //   · 已经压下来还没定的那一件，钉在 `hold.value` 上不重算（见上）。
    const chosen = choices
      ? table.find((one) => one && Array.isArray(one.roads) && pickedForkRoad(one, unit.entry, choices))
      : null
    const pinned = hold.value && hold.value.day === Number(unit.from)
      ? table.find((one) => one && one.id === hold.value.id) || null
      : null
    const fork = chosen || pinned || rulesForkOf(facts, FORKS, { outdoors: OUT_KEYS })
    if (!fork) continue
    const roads = Array.isArray(fork.roads) ? fork.roads : []
    if (roads.length < 2) continue
    const picked = pickedForkRoad(fork, unit.entry, choices)
    if (picked && hold.value && hold.value.id === fork.id) {
      // 挑过了：钉子连同落盘那一份一起拔掉，这一天后面再压下来的由机器自己判。
      if (typeof hold.clear === 'function') hold.clear()
      else hold.value = null
    }
    const pending = canPick && !picked && unit.from === todayFrom
    if (pending) {
      // 停在**它压下来那一刻**——那一刻就是「当下」：第一次看见它的时候，屏幕上最新那一行
      // （用户 m18547 第 1 条）。钉住之后不重算、不跟着时钟漂（第 2 条；用户 m17334：
      // 「中间所有的内容，都暂停」）。
      const at = hold.value && hold.value.id === fork.id
        ? hold.value.at
        : (hold.value = { day: Number(unit.from), id: fork.id, at: Number(rows[rows.length - 1].at) }).at
      // 第一次看见它就把钉子落盘：DSH 重启之后还得是这一件、还得停在这一刻。
      if (typeof hold.save === 'function') hold.save(hold.value)
      // 那一刻落在哪一行上：今天**不晚于它**的最新那一行（格或日卷）。
      // 这里**不许留 `null`**——`Number(null)` 是 `0`，会把整条梯子滤空（2026-10-10 撞过一次）。
      const on = units
        .filter((u) => (u.roll === true ? Number(u.from) : startOfDay(u.at)) === todayFrom
          && Number(u.at) <= at)
        .sort((a, b) => Number(b.at) - Number(a.at))[0] || null
      result.live = {
        key: choiceKey(unit.entry, fork),
        dayKey: unit.key,
        cellKey: on ? on.key : unit.key,
        at,
        // 那一刻：`renderTimeline` 拿它把整块面板按那一刻重画一遍，`refresh` 拿它把地图
        // 也停在同一刻上（用户 m17334）。走到这儿那一刻一定是个真数——它是屏幕上最新那一行的
        // 时刻（`hold.value`），**更不能落成 `0`**（`Number(null)` 是 0，见上面那一句）。
        freeze: at,
        fork,
        roads,
        road: null,
        // 这一天的账（点下那一颗时要拿它算落的是哪一种结果，好记进度）。
        facts,
      }
      // 还没定：一个字都不说他往哪条路走，连痕迹都不给（这一天的账还没结）。
      out.set(unit.key, { fork, roads, pending: true, road: null, result: null, marks: [], die: false, picked: false })
      continue
    }
    const road = picked || roads.find((one) => one && one.kind === 'main') || roads[0]
    const res = rulesResultOf(facts, road, { outdoors: OUT_KEYS })
    const info = {
      fork,
      roads,
      road,
      result: res,
      picked: !!picked,
      pending: false,
      marks: res && Array.isArray(res.marks) ? res.marks.slice() : [],
      die: !!(res && res.then && res.then.die === true),
    }
    out.set(unit.key, info)
    // 死就是今天的终点（用户 m16548）：右栏只剩那一整块死亡页，今天后面那几行一个字都不写。
    // 停在哪一格跟「等你定」用的是同一台机器（`forkCellOf`）——他死在他踏进去的那一格上。
    if (info.die && !result.death) {
      const stop = todayFrom === null ? null : forkStartCell(units, todayFrom)
      result.death = {
        key: unit.key,
        entry: unit.entry,
        cellKey: stop ? stop.key : unit.key,
        at: stop ? Number(stop.at) : Number(unit.at),
        ...info,
      }
    }
  }
  return result
}

/**
 * 老式的一整张卡那一路的事实（见 `FIGHTS`）。
 *
 * 日卷那边有 `dayFacts` 把一整天的格合起来；一张卡自己就是「那一天的那一件事」，
 * 事实全在 `unit.entry` 上，只要补三样按行看才有的：钟点、地方、景——后两样**只能
 * 从 `seq` 取**（那是「这句话讲的是哪一件事」的同一份答案，另挑一次就跟屏幕上那句话对不上）。
 */
function cardFacts(unit, seq) {
  const hours = new Set([new Date(unit.at).getHours()])
  const places = new Set()
  const scenes = new Set()
  const picked = seq && typeof seq.get === 'function' ? seq.get(unit.key) : null
  if (picked) {
    if (picked.place) places.add(picked.place)
    if (picked.sceneKey) scenes.add(picked.sceneKey)
  }
  return { ...(unit.entry || {}), hours, places, scenes }
}

/**
 * 这一天哪几行打得起来（见 `FIGHTS` 与 `fightOf`）。
 *
 * 门槛三条，跟从前那道交锋一模一样，只是换了一台机器：
 *   · 这一行落的是 `hurt` 那一档（挨打只来自真实的 `fails`，见 `outcomeOf`）；
 *   · 这一行是「一天」那一档（日卷，或老式的一整张卡）——梯子上那五分钟一格不挂；
 *   · `fightOf` 认得出对手与档位（对手最后一支是兜底，所以安静的日子也有对手，
 *     只是那多半是「劫道的」遇上小档）。
 *
 * 一天最多 `MAX_FIGHTS_PER_DAY` 场：按行序（新的在前）截，超出的那些行不挂战斗。
 * **赶路的日子放宽到三场，歇脚的日子只留一场**（《战斗》里定死的数：赶路一天一到两场、
 * 歇脚一天最多一场、一天最多三场）——这一天是赶路还是歇脚由 `dayPlansFor` 算，见 `dayPlanOf`。
 * 挑出来的每一场都带上 `dayCount`——日卷末尾那句战报要说的是**这一天一共**打了几场，
 * 所以得等一天里的都数完了再回填。
 */
function fightsFor(units, seq, plans = null) {
  const out = new Map()
  if (!FIGHTS || !Array.isArray(FIGHTS.foes) || !FIGHTS.foes.length) return out
  const byDay = new Map()
  for (const unit of units) {
    // 跟 `momentsFor` 同一个道理：卷按它**收的那一天**归档（`unit.from`），
    // 不能拿 `unit.at` 反推——跨午夜那张卡的起点在昨天。
    const day = dayOfUnit(unit)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(unit)
  }
  const capOf = (day) => {
    const plan = plans && typeof plans.get === 'function' ? plans.get(day) : null
    return plan && plan.kind === 'rest' ? 1 : MAX_FIGHTS_PER_DAY
  }
  const hits = []
  for (const unit of units) {
    const picked = seq && typeof seq.get === 'function' ? seq.get(unit.key) : null
    if (!picked || picked.slot !== 'hurt') continue
    const dayish = unit.roll === true ? unit.tier === 'day' : unit.grid !== true
    if (!dayish) continue
    const day = dayOfUnit(unit)
    const facts = unit.roll === true ? dayFacts(unit, byDay.get(day) || [], seq) : cardFacts(unit, seq)
    const hit = rulesFightOf(facts, FIGHTS, { outdoors: OUT_KEYS })
    if (!hit) continue
    hits.push({ unit, day, hit })
  }
  const used = new Map()
  for (const one of hits) {
    const n = used.get(one.day) || 0
    if (n >= capOf(one.day)) continue
    used.set(one.day, n + 1)
    out.set(one.unit.key, { ...one.hit, day: one.day, dayCount: 0 })
  }
  for (const one of out.values()) one.dayCount = used.get(one.day) || 1
  return out
}

/**
 * 把一场仗铺成几拍（见 `FIGHTS` 的 `foes` / `tiers`）。
 *
 * 拍数：遭遇一句，中档以上加一句应对，交手按档位来（小一、中二、大三），
 * 大档再加一句失算（从共用的 `turns` 里挑），最后收场一句。小档三拍、中档五拍、大档七拍。
 *
 * 挑句的种子是「这一行 ＋ 这个对手」：同一份记录看两遍，这一场仗一字不变。
 * 同一场里不重句（`lines` 里有的不再挑）——交手中档要挑两句，撞回同一句最扎眼。
 */
function fightBeats(unit, fight) {
  if (!fight || !fight.foe || !fight.tier) return null
  const seed = `${(unit.entry && unit.entry.id) || ''}|fight|${fight.foe.id}`
  const lines = []
  const take = (pool, key) => {
    const list = (pool || []).filter((t) => t && !lines.includes(t))
    const one = list.length ? pick(list, `${seed}|${key}`) : null
    if (one) lines.push(one)
  }
  take(fight.foe.meet, 'meet')
  if (fight.tier.way) take(fight.foe.way, 'way')
  const rounds = Math.max(0, Math.round(Number(fight.tier.trade) || 0))
  for (let i = 0; i < rounds; i++) take(fight.foe.trade, `trade${i}`)
  if (fight.tier.turn) take(FIGHTS && FIGHTS.turns, 'turn')
  take(fight.foe.end, 'end')
  return lines.length ? lines : null
}

/**
 * 日卷末尾那一句战报（见 `FIGHTS` 的 `report`）：这一天打了几场、身上添了什么。
 *
 * 折叠把具体的句子吞掉之后，靠它照样看得见「这一天打过」——那句话里的 `{n}` 走
 * `countWord`，所以是一句汉字数字（「这一天他打了**一**场」），不出现阿拉伯数字。
 */
function fightReport(unit, fight) {
  if (!fight || !fight.dayCount || !FIGHTS) return ''
  const list = (FIGHTS.report || []).filter(Boolean)
  if (!list.length) return ''
  const seed = `${(unit.entry && unit.entry.id) || ''}|fight|report`
  const one = pick(list, seed)
  return one ? String(one).replace(/\{n\}/g, countWord(fight.dayCount)) : ''
}

/**
 * 这一行属于哪一天（卷按它收的那一天，格与卡按它自己那一刻）。
 *
 * 三处（`fightsFor` / `dayPlansFor` / `renderTimeline`）都得用同一个答案：跨午夜那张卡
 * 的起点在昨天，拿 `unit.at` 反推会把它算到今天来（见 `momentsFor` 那句注释）。
 */
function dayOfUnit(unit) {
  if (!unit) return 0
  return unit.roll === true ? Number(unit.from) : startOfDay(unit.at)
}

/** 这一天的季节（日历算出来的，不需要跨天记忆——见《一天的骨架》4.3）。 */
function seasonOf(at) {
  const month = new Date(Number(at) || 0).getMonth() + 1
  if (month === 12 || month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'autumn'
}

/**
 * 这一天他手上是什么（见 `JOURNEY` 与《一天的骨架》第四节）。
 *
 * 三样都是**算出来的**，不写盘：
 *   · 在册子上的哪一站——`stationOf` 拿今天这一天真到过哪儿判，**走得最远的说了算**；
 *   · 手上有几件事——两件起，交出去一样、有人帮手各加一件，最多四件；
 *   · 赶路还是歇脚——今天走过野地（`OUT_KEYS`）、或者交出去过东西，就是赶路的日子。
 *
 * 同一份记录看两遍得到同一份计划：没有掷点、不读「现在」，也不看昨天（存档只留今天，
 * 用户 m01403「旧日子删除」——方案 A 的老办法就是**只看今天**）。
 */
function dayPlanOf(roll, list, seq, journey = JOURNEY) {
  if (!journey || !Array.isArray(journey.stations) || !journey.stations.length) return null
  const facts = dayFacts(roll, list, seq)
  const station = rulesStationOf(facts, journey.stations, { outdoors: OUT_KEYS })
  const index = Math.max(0, journey.stations.indexOf(station))
  const at = Number((roll && roll.entry && roll.entry.startedAt) || (roll && roll.at) || 0)
  const scenes = facts.scenes instanceof Set ? facts.scenes : new Set()
  const out = Array.isArray(facts.deliverables) ? facts.deliverables.length : 0
  const helped = Array.isArray(facts.helpers) ? facts.helpers.length : 0
  const travel = [...scenes].some((key) => OUT_KEYS.has(key)) || out > 0
  const lossAt = Array.isArray(journey.lossAt) ? journey.lossAt : [4, 8]
  const step = index + 1
  return {
    station,
    index,
    place: (station && station.label) || '',
    seal: (station && station.seal) || '',
    count: Math.min(4, Math.max(2, 2 + (out ? 1 : 0) + (helped ? 1 : 0))),
    kind: travel ? 'travel' : 'rest',
    season: seasonOf(at),
    loss: step >= lossAt[1] ? 'late' : step >= lossAt[0] ? 'mid' : 'early',
  }
}

/** 一天一份计划：`Map<那天的零点, plan>`（表没写、或者这一段不是一天那一档，就没有）。 */
function dayPlansFor(units, seq, journey = JOURNEY) {
  const out = new Map()
  if (!journey) return out
  // 同 `helpersFor`：导出函数，外面可能传 null 进来（自检、预览页）。
  const list = Array.isArray(units) ? units : []
  const byDay = new Map()
  for (const unit of list) {
    const day = dayOfUnit(unit)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(unit)
  }
  // 同一天里可能既有整张卡（老记录）又有日卷：**日卷说了算**——它把这一天合在一起，
  // 一张卡只知道那一次坐下干活的事（交付、撞墙、时长都只是那一次的）。所以先把日卷
  // 收下，剩下那些天再拿卡兜底。顺序也重要：`out` 按天去重，先到先得。
  const rolls = []
  const cards = []
  for (const unit of list) {
    if (unit.roll === true) {
      if (unit.tier === 'day') rolls.push(unit)
    } else if (unit.grid !== true) {
      cards.push(unit)
    }
  }
  for (const unit of [...rolls, ...cards]) {
    const day = dayOfUnit(unit)
    if (out.has(day)) continue
    const plan = dayPlanOf(unit, byDay.get(day) || [], seq, journey)
    if (plan) out.set(day, plan)
  }
  return out
}

/**
 * 日卷那一行上要摆的两句：**今天手上那几件事**，与**这一季的路**。
 *
 * 用户 m14781 要的是「他有怎样的规划」——所以这两句在**主句上面**：先说打算，再说他手上
 * 那一件怎么走。挑句的种子是这一天自己的 id，同一份记录看两眼一字不变。
 */
function planLines(plan, entry) {
  if (!plan || !JOURNEY || !JOURNEY.plans) return []
  const seed = `${(entry && entry.id) || ''}|plan`
  const out = []
  const head = pick(JOURNEY.plans.plan, `${seed}|head`)
  if (head) {
    out.push(String(head)
      .replace(/\{n\}/g, countWord(plan.count))
      .replace(/\{place\}/g, plan.place)
      .replace(/\{seal\}/g, plan.seal))
  }
  const season = JOURNEY.plans.season ? JOURNEY.plans.season[plan.season] : null
  const road = pick(season, `${seed}|season`)
  if (road) out.push(road)
  return out
}

/**
 * 他今天身上少了什么（见 `JOURNEY.losses`）：每描一处少一分。
 *
 * 站号到了哪一段就说哪一段那一句——这是**弧光**，不是奖励：先只是夜里梦见北边，
 * 再是听不清南边的话，最后是走路总偏着北边那一点。
 */
function lossLine(plan, entry) {
  if (!plan || !JOURNEY || !JOURNEY.losses) return ''
  const list = JOURNEY.losses[plan.loss]
  const one = pick(list, `${(entry && entry.id) || ''}|loss`)
  return one || ''
}

/**
 * **每五分钟**一个状态（见《一天的骨架》第六节）：在哪、在做什么、那件事到哪一步、
 * 册子到第几站、身上少了什么、带着什么、什么钟点。
 *
 * 第二期只把它**算出来**：摆出来的还是日卷那一行末尾那句少一分（`lossLine`）、
 * 一天打几场（`fightsFor` 按赶路／歇脚收口）、以及自检里那一格一格的读数。
 * **换掉最后一跳**（从槽位名下挑同义说法）在第三期——那时候 2426 条句子要重新归档。
 */
function stateAt(unit, plan = null, picked = null, mark = '') {
  const entry = (unit && unit.entry) || {}
  const one = picked && typeof picked === 'object' ? picked : null
  const counts = entry.counts || {}
  const doing = Object.keys(counts).sort((a, b) => (Number(counts[b]) || 0) - (Number(counts[a]) || 0))[0] || '歇着'
  const where = (one && one.place) || ACTION_PLACE[doing] || 'home'
  const out = Array.isArray(entry.deliverables) ? entry.deliverables.length : 0
  const fails = Math.round(Number(entry.fails) || 0)
  const minutes = Math.round(Number(entry.minutes) || 0)
  return {
    where,
    doing,
    step: out > 0 ? 'done' : fails >= 2 ? 'broke' : minutes > 0 ? 'half' : 'still',
    station: plan ? plan.index + 1 : 0,
    loss: plan ? plan.loss : '',
    carry: mark || '',
    clock: { hour: new Date(Number(unit && unit.at) || 0).getHours(), season: plan ? plan.season : '' },
    road: (one && one.sceneKey) || '',
  }
}

/**
 * 哪几卷年卷末尾该说一句收束（见 `FATES` 与 `src/packs/adventure/fate.js`）。
 *
 * 前面几层算的都是**一天**的账（事件、岔口、交锋、方向），这一层算的是**一整年**：
 * 干过多少天、撞过多少回、交出去几件、那一年往哪个方向走得多、遇上事的时候多半走的
 * 是哪条路。只有**年卷**这一档有归宿——周卷、月卷说的是「那一段」，一年的事挂在上面不合身。
 *
 * 难处在于年卷那一行底下只有一句主句，看不出这一年的景与岔口。所以这里拿 `rollUnit`
 * 带出来的 `list`（那一年的全部格）**按天重算一遍**，用的还是屏幕上这套机器：
 * `rollUnit('day', …)` 收成一天 → `dayFacts` 攒钟点/地方/景 → `momentOf` 挑事件 →
 * `choiceOf` 挑岔口。跑这一遍要按时间顺序（每一行都要躲前面几行讲过的物件），所以先
 * `sequenceOfUnits` 一次。
 *
 * 方向**不重算**：`directionsFor` 给的是全历史的、精确的按天方向（`Map<那天的零点, 方向>`），
 * 直接取那一天的就行。
 *
 * 判条件的是 `fateOf`，读的全是真账；挑中的那一件封在这一卷里（不掷点、不读「现在」）。
 *
 * 岔口那一份账**要跟着你挑的那条走**（`choices`）：否则屏幕上写着你挑了退走，
 * 年底那句收束却按机器自己落的那条算，两处自己打自己。
 */
function fatesFor(units, dirs, voice = DEFAULT_VOICE, choices = null) {
  const out = new Map()
  if (!Array.isArray(FATES) || !FATES.length) return out
  for (const unit of units) {
    if (unit.tier !== 'year') continue
    const list = Array.isArray(unit.list) ? unit.list : []
    if (!list.length) continue
    const seq = sequenceOfUnits(list, voice)
    const byDay = new Map()
    for (const one of list) {
      const day = startOfDay(one.at)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push(one)
    }
    const hours = new Set()
    const places = new Set()
    const scenes = new Set()
    const direction = {}
    const roads = {}
    let days = 0
    let moments = 0
    for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
      const dayUnits = byDay.get(day)
      const dayRoll = rollUnit('day', day, dayUnits)
      const facts = dayFacts(dayRoll, dayUnits, seq)
      days += 1
      for (const h of facts.hours) hours.add(h)
      for (const p of facts.places) places.add(p)
      for (const k of facts.scenes) scenes.add(k)
      const dir = dirs.get(day)
      if (dir && dir.id) direction[dir.id] = (direction[dir.id] || 0) + 1
      const moment = rulesMomentOf(facts, MOMENTS, { outdoors: OUT_KEYS })
      if (!moment) continue
      moments += 1
      const road = roadOf(moment, dayRoll.entry, facts, choices)
      if (road && road.id) roads[road.id] = (roads[road.id] || 0) + 1
    }
    // 这一年的账：年卷自己收出来的那几样（分钟、撞墙、交付、动作）照旧，
    // 外加这里按天算出来的几天、几档钟点、走过哪些地方与景、方向与岔口的分布。
    const facts = { ...(unit.entry || {}), days, hours, places, scenes, direction, roads, moments }
    const fate = rulesFateOf(facts, FATES, { outdoors: OUT_KEYS })
    if (fate) out.set(unit.key, fate)
  }
  return out
}

/**
 * 这一行要不要补一场交锋（见 `CLASHES`）。
 *
 * **2026-10-10 起不再接线**（用户 m14888「他必须有战斗」）：面板上那一场改由 `FIGHTS` 与
 * `fightOf` 铺（见 `fightsFor` / `fightBeats`），一整套有对手、有胜负、有开头与收场的仗。
 * 这一层只有两拍、没有对手，所以只当**备用**留着——用户 m14810 第 6 条：「旧句子留作备用，
 * 用做修修改改」。句子（`CLASHES`，26 个场景 × 2 句）照旧装在包里，`verify-packs` 也照旧比它。
 *
 * 后两拍：`hold` 是他怎么接住、怎么反手，`cost` 是这一场付出的代价与收场。
 * 门槛两条，都是真的：这一行**落的是 `hurt` 那一档**（挨打只来自真实的 `fails`），
 * 而且这一行是「一天」那一档（日卷、含今天那半截卷，或老式的一整张卡）。
 *
 * 2026-10-09（用户 m01903 第 2、3 条）拆掉了原来的第三条门槛「这一天没有高光事件」：
 * 事件只有四件时它没什么害处，加到八件之后**最该开打的日子全被它挡住了**——
 * 夜袭、塌方、桥头、走岔、回头找这几件的条件本来就要 `fails ≥ 2`，正是挨打最多的日子。
 * 现在两件事讲的是同一天：事件是这一天的大事，交锋只是那一行挨打之后的两拍，不冲突。
 *
 * 挂在哪种行上：**日卷**（含今天那半截卷）与老式的一整张卡；梯子上那五分钟一格不挂
 * （那是刻度，一句安静的话就够了，在那儿铺两行打斗会把梯子读成别的东西）。
 *
 * 挑句用这一行自己的种子（`entry.id`）：同一份记录看两遍，这一场仗一字不变。
 */
function clashOf(unit, picked) {
  if (!picked || picked.slot !== 'hurt') return null
  const dayish = unit.roll === true ? unit.tier === 'day' : unit.grid !== true
  if (!dayish) return null
  const pool = picked.sceneKey ? CLASHES[picked.sceneKey] : null
  if (!pool) return null
  const seed = `${unit.entry.id || ''}|clash`
  const hold = pick((pool.hold || []).filter(Boolean), `${seed}|hold`)
  const cost = pick((pool.cost || []).filter(Boolean), `${seed}|cost`)
  const lines = [hold, cost].filter(Boolean)
  return lines.length ? lines : null
}

/**
 * `loadRecords` 交回来的东西有两种形状，都收：**一数组**（老写法、预览页、自检里那些
 * `loadRecords: () => demo`）或者**一份存档** `{ records, since, seam }`（宿主那条路由，
 * 见 src/index.js 的 `/dsh-gameflow/records`）。数组那种没有两个标量，退回 0/null，
 * 于是序曲与「隔了一夜」按老规矩从记录里自己数——自检里那些夹具正是这么喂的。
 */
function readStore(next) {
  if (Array.isArray(next)) return { records: next, since: 0, seam: null, dayStart: 0 }
  const records = next && Array.isArray(next.records) ? next.records : []
  const seam = next && next.seam && Number(next.seam.startedAt) ? next.seam : null
  return {
    records,
    since: Number(next && next.since) || 0,
    seam,
    // 8 → 9：按下「开始冒险」那一刻（用户 m04200）。没按过 / 老存档是 0，
    // 那时退回「今天零点」的老规矩（见 renderTimeline）。
    dayStart: Number(next && next.dayStart) || 0,
  }
}

/* 开场那一下（用户 m01903 第 1 条）：一台上什么都没有的机器上，先摆一颗「开始冒险」；
   他按过之后那一天改摆两条说明，一直挂到**今天第一个五分钟格落盘**——那时这个分支就
   不走了，说明跟着自己退场（见 foldLadder：今天最近半小时才铺格）。
   两条都在 `meta` 上：`started` 是上次按过哪一天（那天零点），`onStart` 是「按了」这件事
   怎么做（写本地那份标记 ＋ 重画）；没有 `canPress` 就一个字都不摆（比如没有存储、
   也没有内存可记的时候——不该摆一颗按了没反应的按钮）。 */
function paintStart(listEl, meta, now) {
  const dayFrom = startOfDay(now)
  // 8 → 9：「今天开过场没有」在宿主给了整份存档的场合只认 `dayStart`（见 refresh 里的
  // `dayStartKnown`）。本地那枚 `meta.started` 是 8 时代的旧账——升级当天它写着今天、
  // 存档里却没有 `dayStart`，若拿它当数，这里就只铺那两条说明、连按钮都不给了，
  // 人再也没法重新开场（用户 m04200：他要的就是「点开之后按下那一下才开始算」）。
  const started = meta && meta.dayStartKnown
    ? Number(meta.dayStart) > 0 && startOfDay(Number(meta.dayStart)) === dayFrom
    : Number(meta && meta.started) === dayFrom
  const canPress = !started && !!(meta && typeof meta.onStart === 'function')
  if (!started && !canPress) return
  const box = el('div', 'gf-start-box')
  if (canPress) {
    const btn = el('button', 'gf-start', '开始冒险')
    btn.setAttribute('type', 'button')
    btn.addEventListener('click', () => meta.onStart(btn))
    box.appendChild(btn)
  } else {
    for (const text of START_HINTS) box.appendChild(el('div', 'gf-hint', text))
  }
  listEl.appendChild(box)
}

function renderTimeline(listEl, entries, now, voice = DEFAULT_VOICE, narration = null, picks = null, meta = null, frozenAt = null, live = null, forkPin = null) {
  listEl.textContent = ''
  listEl.classList.remove('gf-list-before-start')
  // 缺 id 的记录先补上临时 id（见 withIds）：见闻录靠 id 找上一行与这一行的句子。
  const all = withIds(entries)
  // 上一段（`seam`）只为了「隔了一夜」那一句而混进来：它比今天早，下面的过滤会把它挡在
  // 见闻录外面，**只有 `prevOf` 看得见它**。旧日子真删之后，记录里问不到「上一段」了，
  // 所以宿主在删之前把它的起止记下来（见 src/index.js 的 pruneStore）。
  if (meta && meta.seam && Number(meta.seam.startedAt)) {
    // `seam: true` 是给自己看的记号（报告 B-09）：它**只**参与下面 `prevOf` 那次比较，
    // 绝不铺成一行。宿主的 `pruneStore` 保证 `seam.endedAt` 在昨天以前，可存档是别人写的、
    // 老版本也写过——万一这条落到了今天，只按时刻过滤就会把它当一张记录铺出来：
    // 抬头一行「10:00 – 10:00 · 不到一分钟」，左栏空着、右栏一句安静话，还跟着多算一次
    // 岔口（`units` 一变，命运那一对选项就重算）。那不是他的日子，是裁剪留下的接缝。
    all.push({
      id: 'seam',
      seam: true,
      startedAt: Number(meta.seam.startedAt),
      endedAt: Number(meta.seam.endedAt) || Number(meta.seam.startedAt),
      minutes: 0,
      tags: [],
    })
  }
  // 见闻录只讲今天（用户 2026-10-09：「除了今天之外，全部去掉。每天都新鲜事，
  // 而不要保存过去的事。」）。裁在这一层而不是只裁在 foldLadder 里，是因为下面还有几处
  // 按整份 `entries` 走（方向、高光、归宿、上一段）——留着去年的记录就是白算一整年。
  //
  // 留着**跨午夜那一张**：它从昨晚铺到今天来，今天那几格要讲，昨晚那几格由 foldLadder 丢掉。
  // `all` 留着不扔，只给 `prevOf` 用：今天第一行上面那句「隔了一夜」说的正是它跟昨天末一行的
  // 距离，把它一起裁了，每天的头一行就变成凭空起头。
  const todayFrom = startOfDay(now)
  // 8 → 9：今天从**按下「开始冒险」那一刻**算起（用户 m04200）。没有它（没按过、老存档、
  // 预览页）就退回「今天零点」这条老规矩——那时行为与从前一字不差。
  const dayStart = Number(meta && meta.dayStart) || 0
  const floorFrom = dayStart > 0 && startOfDay(dayStart) === todayFrom ? dayStart : 0
  const edge = floorFrom || todayFrom
  // `entry.seam !== true`：接缝不是记录（见上面 `all.push` 那一段）。
  entries = all.filter((entry) => entry.seam !== true
    && (Number(lastEnded(entry)) >= edge
      || landedStamp(Number(entry?.startedAt) || 0) >= edge))
  // 起点之前就结束的不铺，第一格之前的格子推到下一格（见 clipToStart）。
  entries = clipToStart(entries, floorFrom, now)

  if (!entries.length) {
    // 空的时候只说明状态，不邀请、不催促——**只有一台刚开机的机器例外**：
    // 那一天他还没按过「开始冒险」，就先摆那一颗（用户 m01903 第 1 条，见 paintStart）。
    listEl.appendChild(el('p', 'gf-empty', '他还没走过多远。'))
    paintStart(listEl, meta, now)
    return { remark: null, when: null, pending: 0 }
  }

  // 开场那一下（用户 m01903 第 1 条、用户 m19006、用户 m19218）：**每天第一次打开都要有这一下**，
  // 不论今天有没有已经落下的活。从前它只长在上面空态那一支上，傍晚才打开面板的人就永远
  // 看不见那颗按钮（用户 m19006 逐字：「今天我打开，并没有让我点击开始冒险呢，直接就是一个，
  // 命运选择？」）。
  //
  // 而这道幕布盖的是**整条见闻录**（用户 m19218 逐字：「你看今天我并没有点开始冒险，却有如此
  // 显示」）——今天的账是真的（上午就在干活），可这一天还没开始讲：按下之前一格都不铺，只摆
  // 那一颗；按下之后照常从第一格讲起。命运与门上那枚记号认同一个判据（见下面的 `canPick`
  // 与 `refreshBadge`）。
  //
  // 从前我只把「命运」挡在后面、行照旧铺，理由是用户 m18735 那句「左侧是用户的"你的日常"
  // 不能停」——那句话说的是**命运压下来**那一刻（停的只是右栏），不是这一天开头：还没开场
  // 的一天，左栏也不是「停」，是还没到。
  //
  // 没有存储、也没有内存可记（`meta.onStart` 不是一个函数）、或者面板根本记不住
  // （`picks.canSave` 假，比如预览页 `storage: null`）的时候不设这道幕布——摆一颗按了
  // 没反应的按钮，比照旧铺着更坏；预览页要看的也正是「铺开之后」的样子。
  // 8 → 9：「今天开过场」有两个来源——宿主存档里的 `dayStart`（按下那一刻，权威），
  // 和本地那枚 `meta.started`（老规矩）。**宿主在场时只认 `dayStart`**（`meta.dayStartKnown`）：
  // 本地那枚是 8 时代的旧账，它记的是「按下过按钮」，不是「这一天从哪儿开始」。
  // 升级当天正是这个区别最要紧的时候：本地标记是今天、存档里却还没有 `dayStart` ⇒
  // 认旧账就会把按下之前那几行又铺出来（用户 m04200 报的就是这个）。
  const startedToday = floorFrom > 0
    || (!(meta && meta.dayStartKnown) && Number(meta && meta.started) === todayFrom)
  const canCurtain = !!(picks && picks.canSave) && !!(meta && typeof meta.onStart === 'function')
  if (!startedToday && canCurtain) {
    listEl.classList.add('gf-list-before-start')
    paintStart(listEl, meta, now)
    // `curtain` 给 `refresh` 看：两栏的抬头也一起收起来（那两栏都是空的，只剩一个抬头很奇怪）。
    return { remark: null, when: null, curtain: true, pending: 0 }
  }

  // 一行 = 五分钟一格（用户 2026-10-08 第 2 条；老记录没有 ticks，退化成一张卡一行）。
  // 今天最近半小时一格一格，今天更早的那几段收成一卷，**再往前一概不讲**（见 foldLadder）。
  //
  // 停住那一刻（`frozenAt`，见 `refresh` 与 `pendingPin`）要铺**两条梯子**：
  //   · `units`＝照**那一刻**铺的那一条。右栏（他的冒险）与所有机器（`seq` / `plans` /
  //     `fights` / `moments` / `forks` / `fates`）一律照它算——那一刻之后铺出来的格
  //     一概不进来。它们本来就不显示，可它们会参与挑句（`sequenceOfUnits` 从新到旧走一遍，
  //     每行避开前面几行讲过的物件）——留着会让上面几行莫名其妙地避开一个没露过面的词。
  //   · `tail`＝照**当下**铺的那一条里，冻住那一刻之后、而且冻住那一遍没有的那些行。
  //     它们**只建左栏**（见 `rowFor` 的 `muted`）：用户 m18735 逐字「停的只是右侧"他的冒险"，
  //     左侧是用户的"你的日常"不能停」——他停住了，你干的活照旧一行一行往下铺。
  //     按 key 去重：冻住那一遍与当下这一遍的格会重叠（命运刚压下来时几乎全部重叠）。
  // 两条梯子都只折**屏幕上铺的这一遍**，`records.json` 一个字不动（跟折叠同一个规矩）。
  const units = frozenAt === null ? rowUnits(entries, now) : rowUnits(entries, Number(frozenAt))
  const liveUnits = frozenAt !== null && live ? rowUnits(live.entries || entries, live.now || now) : []
  const frozenKeys = new Set(units.map((u) => u.key))
  const tail = liveUnits.filter((u) => Number(u.at) > Number(frozenAt) && !frozenKeys.has(u.key))
  // 尾巴那几行认这个记号（不认时刻——`frozenAt` 为 null 时 `Number(null)` 是 0，那会认错）。
  for (const unit of tail) unit.tail = true
  if (!units.length) {
    // 今天还什么都没记（记录都是昨天的）：跟「一次都没记过」同一句话，不催、不请。
    listEl.appendChild(el('p', 'gf-empty', '他还没走过多远。'))
    paintStart(listEl, meta, now)
    return { remark: null, when: null, pending: 0 }
  }
  // 方向与比例（见 `DIRECTIONS`）：一天朝哪边走。**先算这个再拼句子**——危险系数与
  // 「外头」那层都读 `entry.direction`，所以要赶在 `sequenceOfUnits` 造句子之前挂上。
  // 每条记录挂在它自己那一天上（`directionsFor` 直接写回记录，格由 `unitOf` 带出来）。
  const dirs = directionsFor(entries)
  // 卷要另说：日卷就是一天，取它收的那一天（`unit.from` 就是那天的零点）；
  // 周/月/年卷是许多天合起来的，没有「那一天」可言，所以不带方向（危险系数与抬头都不动）。
  for (const unit of units) {
    if (unit.roll !== true || !unit.entry) continue
    const dir = unit.tier === 'day' ? dirs.get(unit.from) || null : null
    unit.entry.direction = dir ? dir.id : undefined
  }
  // 一次把整条见闻录的话都拼出来：顺序走一遍，每行避开前面几行讲过的物件（见 composeSequence）。
  const seq = sequenceOfUnits(units, voice)
  // 当日计划（见 `JOURNEY` 与 `dayPlanOf`，用户 m14781「他有怎样的规划」）：这一天在册子上
  // 的哪一站、手上有几件事、赶路还是歇脚。**先算它再算战斗**——一天打几场由赶路／歇脚收口。
  const plans = dayPlansFor(units, seq)
  // 战斗：这一天的哪几行打得起来（见 `FIGHTS` 与 `fightsFor`）。跟高光事件同一份 `seq`，
  // 所以「这一行讲的是哪件事」与「遇上的对手」永远配套。梯子上那五分钟一格不挂。
  const fights = fightsFor(units, seq, plans)
  // 高光事件：哪几个日卷上有一件值得单讲的事（见 momentsFor）。它读的就是上面这一份 `seq`，
  // 所以判条件用的「地方与景」跟屏幕上那句话是同一个答案。
  // 岔口挑过的那些（`picks`）也在这儿生效：挑过就把你那条封进那一件里。
  const choices = picks && picks.map ? picks.map : null
  // 面板记得住你的挑，才谈得上「等你定」（`canSave`）：记不住就摆不了按钮，等了也定不了。
  // 这一天还没按过「开始冒险」，命运就先不摆（用户 m19006 第 2 问）；按过之后照旧
  // （`startedToday` 与上面那颗按钮同一个判据）。
  const canPick = !!(picks && picks.canSave) && startedToday
  // 高光事件（见 momentsFor）：这一天的经过与收束。**它不再摆选项**——从前的岔口（守到天亮 /
  // 退走那种）2026-10-10 按用户 m16528 第 1 条退成叙述：机器（或你从前挑过）的那条照旧写成
  // 两句，可那一对按钮与「代价：…」不再出现——代价不可知（第 2 条），摆出来命运就成了既定。
  const momentHits = momentsFor(units, seq, choices, now, false)
  const moments = momentHits.map
  // 命运（见 `FORKS` 与 `forksFor`，用户 m16528 第 1 条「这种选择，不叫命运」）：这一天压下来的
  // 那一件大事、两条路各是什么、他落的是哪一种结果。**只有这一层摆选项**，也只有这一层会停住。
  // 它跟高光事件同一份 `seq`、同一份按天的账，所以「屏幕上那件事」与「这一件命运」永远配套。
  const forkHits = forksFor(units, seq, choices, now, canPick, forkPin)
  const forkMap = forkHits.map
  // 屏上正摆着的那一对选项（2026-10-10 按用户 m14810 第 5 条改过）：它长在**这一件命运起头的
  // 那一格**那一行上（见 forkCellOf），而且**只要没定就一直摆着**。
  const liveFork = forkHits.live
  // 今天死过（用户 m16548）：右栏只剩那一整块死亡页，今天后面那几行一个字都不写。
  const death = forkHits.death
  // 「停在这一格等你定」（用户 m14810 第 5 条：「如果用户不选，后面的故事就不会继续发生，
  // 界面就停在这个地方等用户来选择」）。折的**不是记录、也不是那一卷**——只折屏幕上往下铺的
  // 那一截，所以 `records.json` 一个字不动，定下来之后整条又照原样铺开。
  // 死也是同一个道理：他死在哪一格，屏幕就停在哪一格（用户 m16548「今天后面的时间，
  // 都不会再出现他的冒险了」）。
  const stopFrom = liveFork || (death && Number.isFinite(Number(death.at)) ? death : null)
  const stopAt = stopFrom && Number.isFinite(Number(stopFrom.at)) ? Number(stopFrom.at) : null
  let shown = stopAt === null ? units : units.filter((u) => Number(u.at) <= stopAt)
  // 死了以后，右半边**只剩**那一整块死亡页（用户 m16548 逐字：「整个右半边界面，就是已死亡」）。
  // 今天那一卷（日卷）本来会把这一天的账从头讲一遍——定场、方向、计划、那件事，连命运那几拍
  // 都会再讲一次；它跟死亡页并排摆着，读起来像他还在。所以那一卷一起撤掉。
  // 只有死亡页就落在那卷自己身上时（今天一格都没有，`forkStartCell` 返回 null）才留着它——
  // 不然那一页没有地方挂。
  if (death) {
    shown = shown.filter((u) => !(u.roll === true && u.tier === 'day'
      && Number(u.from) === todayFrom && u.key !== death.cellKey))
  }
  // 他停住之后你干的活永远摆在最上面，一行都不撤（用户 m18735：「左侧是用户的"你的日常"不能停」）。
  // 摆在这儿而不是更早，是因为上面那两处滤的只该是「他的冒险」那一遍；尾巴那几行本来就在
  // 冻住那一刻之后，跟 `stopAt`、跟死亡那一卷都无关。
  if (tail.length) shown = [...tail, ...shown]
  // 归宿：哪几卷年卷末尾该说一句收束（见 fatesFor）。它要那一年的全部格，所以得在
  // `foldLadder` 收完之后算；判条件用的还是屏幕上这套机器算出来的账。
  const fates = fatesFor(units, dirs, voice, choices)
  // 序曲（见 `ORIGIN` 的头注）：故事的开头，全篇只说一次。
  //
  // 原来它挂在**最老的那一行**上（`units` 是从新到旧排的，所以最后那一行就是故事的开头），
  // 因为折叠梯子越往前越粗，第 0 天那一行迟早会被折掉——挂得够老，粗到年卷也还在。
  // 2026-10-09 见闻录只讲今天之后，`units` 里最老的那一行变成了**今天最早那一行**，
  // 照旧挂上去，序曲就会每天重播一遍。所以改成认存档：**只有今天就是这份存档的头一天**，
  // 才说那一段（新装、或者头一天，打开时故事从这儿开始）。历史更早的人，这六句不再出现——
  // 那正是用户 2026-10-09 要的「除了今天之外，全部去掉」。
  const oldestKey = shown[shown.length - 1].key
  const firstAt = all.reduce((min, entry) => {
    const at = landedStamp(Number(entry?.startedAt) || 0)
    return at && at < min ? at : min
  }, Infinity)
  // 头一天认宿主记下的那个标量（`since`）；没有（自检里那些数组夹具）就照老规矩从记录里数。
  const since = Number(meta && meta.since) || 0
  // 序曲**只在第一天讲**（用户 m16552 第 1 条：这一整套文案是一本书）。两个条件都要：
  //   · 今天就是这份存档的头一天（见上面那一段）；
  //   · 册子上还没有指印、也没死过（`meta.ledger`）——按过指印就是「这本书已经开过头了」，
  //     他那天是在接着走，不该再把开头那六句重念一遍。
  // 自检里那些夹具不给 `meta.ledger`，那时当第一天（照旧）。
  const led = (meta && meta.ledger) || { seals: 0, deaths: 0 }
  const fresh = !(Number(led.seals) > 0 || Number(led.deaths) > 0)
  const originHere = fresh && startOfDay(since || (Number.isFinite(firstAt) ? firstAt : 0)) === todayFrom
  const pickOf = (unit) => seq.get(unit.key) || null
  const lineOf = (unit) => {
    const hit = pickOf(unit)
    return (hit && hit.line) || unitLine(unit, voice)
  }

  // 最新那一段：他此刻正在做的事就写在**这一行的右栏里**，不再单独占地图下面一行。
  // 2026-10-05 用户：「他现在的行为被单独显示在上面了，我觉得不需要这个显示，
  // 就放在他的冒险下面，和你的工作的时间对齐」——所以那一行不写「就是现在」，
  // 直接把那句话写出来（逐字浮现的动画也搬到了这里），抬头补一个「此刻」。
  //
  // 最新那一行就是**最新那一格**（见 rowUnits）；`narrationFor` 也是照这套分行算的，
  // 所以两边一句不差的时候，就把这一格认成「此刻」。
  let nowKey = null
  if (narration && narration.act && shown.length) {
    if (lineOf(shown[0]) === narration.line) nowKey = shown[0].key
  }

  const groups = new Map()
  for (const unit of shown) {
    const key = startOfWeek(unit.at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(unit)
  }

  const weeks = [...groups.keys()].sort((a, b) => b - a)
  // 生活层要拿「上一段」跟自己比，才知道中间隔了多久（那正是你走开的时间）。
  // 按时间倒序走一遍，顺手记下每一段后面紧跟着的那一段。**按卡算，不按格算**：
  // 「隔了一夜」说的是两段日子之间的事，不是五分钟。
  // 这一处走的是 `all` 而不是今天那一份：今天第一行的「上一段」就在昨天，
  // 按今天那一份算，每天的头一行都会变成凭空起头（见上面 `all` 那一段注释）。
  const order = [...all].sort((a, b) => b.startedAt - a.startedAt)
  const prevOf = new Map()
  for (let i = 0; i < order.length; i += 1) prevOf.set(order[i].id, order[i + 1] || null)
  // 交回「就是现在」那一行的右栏节点：他此刻那句话要落在它里面，一个字一个字浮出来。
  let nowRemark = null
  // 还有它抬头那个节点和「现在该写什么」——面板开着的时候每分钟重写一次（见 tickClock）。
  let nowWhen = null
  // 上一行用过的那句生活层。相邻两行说同一句最扎眼（盘点里四句话各出现五十几次），
  // 所以往下递一道，让 lifeLine 换一种说法。
  let lastLife = ''
  // 世界句也一样：上一行讲过的外头那件事，这一行避开。
  let lastWorld = ''
  // 空格子那句安静话同理：一层楼二十格，同一句连着出现最扎眼、隔着两行出现也扎眼
  // （见 quietLine）。这里记最近八句，往下递一道——池子一共二十句，
  // 避开八句还剩十二句可挑；窗口太窄会漏（原来记四句，七格子的梯子上第七格
  // 撞回了第二格，2026-10-08 的 smoke 抓到过）。
  let lastQuiet = []
  // 顺便数一件事：屏幕上还摆着几条没挑的岔口。门框上那枚提醒记号要的就是这个数
  // （用户 m11003 第 2 条），而这里正好已经算过一遍，不必再走一趟折叠梯子。
  let pending = 0
  // 屏幕上第一条还等着挑的那一行——门上那枚惊叹号点一下就落到它那儿（见 jumpToOpenFork）。
  let openRow = null
  // 那一对选项本身（`.gf-choice-live`）：惊叹号要落的是**它**，不是整行——「点击感叹号，并不能定位到
  // 这篇描述开始或者显露出2个选项的位置，即是无法完全看到2个选项，我需要在点击感叹号后，
  // 让页面显示到2个选项中心」（用户 m12444 第 2 条）。
  let openFork = null
  // 这一天挑过的那条路留下的痕迹（见 `MARKS` 与 `momentsFor`）：**只活当天**。
  // 每一格回头找**它所属那一卷**（`day:<那天零点>`）——那一卷挑过哪条路，这一格就带着什么。
  // 摆在岔口上还没挑（`pending`）的时候不算：这一天的账还没结。
  // 跨午夜那张卡的第二处裁切会落在昨天，昨天那一卷已经折没了 ⇒ 没有痕迹（它本来就属于昨天）。
  const markOf = (unit) => {
    if (!unit) return ''
    // 卷自己那一份（那一卷就是这件事发生的地方）；格子回头找它所属的那一卷。
    const dayKey = `day:${startOfDay(unit.at)}`
    // 命运那一层是**唯一**的出处（用户 m16528 第 1 条：命运就是这一天的正事，第 3 条：
    // 「命运要影响接下来一整天的后续活动」）——他走的那条路落的是哪一种结果，今天后面
    // 每一行就带着那种痕迹。
    //
    // 高光事件那一层那两条路（守到天亮 / 退走那种）2026-10-10 退成叙述、不再摆选项了，
    // 它从前留下的痕迹也一并作废：已经不在屏幕上的那条路不该再替今天说话，两处都算
    // 会变成一天两份痕迹。
    const fate = forkMap.get(unit.key) || forkMap.get(dayKey)
    // 摆在岔口上还没定（`pending`）的时候一句都不给：这一天的账还没结。
    if (!fate || fate.pending) return ''
    const list = Array.isArray(fate.marks) ? fate.marks : []
    return list.length ? list[0] : ''
  }
  for (const weekStart of weeks) {
    const week = el('section', 'gf-week')
    // 只有一段、或者全在同一周里，就不画周标签——那时候它是一个多余的抬头。
    if (weeks.length > 1) week.appendChild(el('p', 'gf-week-label', weekLabel(weekStart, now)))
    for (const unit of groups.get(weekStart)) {
      const row = rowFor(
        unit,
        voice,
        nowKey,
        now,
        prevOf.get(unit.entry.id) || null,
        pickOf(unit),
        lastLife,
        lastWorld,
        lastQuiet.join('\n'),
        moments.get(unit.key) || null,
        unit.key === oldestKey && originHere ? ORIGIN : null,
        fates.get(unit.key) || null,
        picks,
        liveFork && liveFork.cellKey === unit.key ? liveFork : null,
        markOf(unit),
        fights.get(unit.key) || null,
        plans.get(dayOfUnit(unit)) || null,
        forkMap.get(unit.key) || null,
        death && death.cellKey === unit.key ? death : null,
        unit.tail === true,
      )
      if (row.choicePicks && row.choicePicks.length >= 2 && !row.deathHere) {
        pending += 1
        if (!openRow) openRow = row
        if (!openFork && row.forkEl) openFork = row.forkEl
      }
      if (row.lifeText) lastLife = row.lifeText
      if (row.worldText) lastWorld = row.worldText
      if (row.quietText) {
        lastQuiet.unshift(row.quietText)
        if (lastQuiet.length > 8) lastQuiet.pop()
      }
      if (row.nowRemark) nowRemark = row.nowRemark
      // 走钟只改「此刻」那一行的抬头：别的行的时刻是已经过去的事实，不该跟着动。
      if (row.isNow && row.whenEl) nowWhen = { el: row.whenEl, text: row.whenText }
      week.appendChild(row)
    }
    listEl.appendChild(week)
  }
  return {
    remark: nowRemark,
    when: nowWhen,
    // **唯一的事实**（用户 m04298）：屏幕上真摆出来了几对可点的选项（`.gf-choice-live`）。
    // 它是在下面那圈 `for` 里、`rowFor` 真把按钮建出来之后才 +1 的（见 `row.choicePicks`），
    // 不是先算一个「应该有」再指望它出现。门上那枚记号只认这个数（见 `paintDoorBadge`），
    // 「记号亮着」与「按钮在」于是同生同死。
    pending,
    openRow,
    openFork,
    // 命运压下来那一刻（没有正等着的命运就是 `null`）：`refresh` 拿它把地图与「他在哪儿」
    // 也停在同一刻上（用户 m17334「中间所有的内容，都暂停」）。
    freeze: liveFork && liveFork.freeze !== null && Number.isFinite(Number(liveFork.freeze))
      ? Number(liveFork.freeze) : null,
  }
}

/**
 * 一行 = 五分钟一格（老记录是一整张卡）：你这边做了什么、他那边做了什么。
 *
 * 左边是你自己的记录，**只用名词和数字**：哪个动作、几次、动了哪几个文件、
 * 待了多久。右边才是句子。分界线就是这一条——左边是尺子，右边是故事。
 * 两栏一样宽，中间一条竖线，不用点任何东西就能同时看到两边。
 *
 * 一格空着的时候（那五分钟里没有动作）也占一行，只是矮、安静：左栏只留一枚淡淡的点，
 * 右栏说一句安静的话（见 quietLine）——不编动作，也不写「无数据」那种现代词。
 */
function rowFor(unit, voice = DEFAULT_VOICE, nowKey = null, now = Date.now(), prev = null, picked = null, avoidLife = '', avoidWorld = '', avoidQuiet = '', moment = null, origin = null, fate = null, picks = null, liveFork = null, mark = '', fight = null, plan = null, forkInfo = null, death = null, muted = false) {
  const entry = unit.entry
  // 面板**记不记得住**他的挑（见下面 `liveFork` 与 `moment.pending`）：`picks.canSave` 假的时候
  // （预览页、自检里 `storage: null`）屏幕上从来没有选项可挑，所以那件事不能算「等你挑」——
  // 该照机器走的那条叙述。这一条在事件块与选项块两处都要用，所以提到这里来。
  const canPick = !!(picks && picks.canSave && typeof picks.save === 'function')
  // 这一张卡铺成梯子了吗（见 rowUnits 的 `grid`）。
  // 老记录（版本 6 及以前）没有 `ticks`，一张卡就是一行：`tick` 是 null、`grid` 是 false。
  // 反过来，有 `ticks` 的卡里**没有明细的那一格**也是 `tick === null`，可它照样是梯子上
  // 的一行：抬头写一个时刻、左栏空着、右栏一句安静的话（见下）。
  // 所以「是不是梯子」不能看 `tick === null`，要看 `grid`——否则空格子会退回成一整张卡。
  const grid = unit.grid === true
  const tick = unit.tick
  // 整段才有的东西（世界句、生活句、帮手）只挂在**最新那一格**上，不然一层楼二十格会重复二十遍。
  const head = !grid || unit.head
  const row = el('div', 'gf-row')
  const isNow = nowKey != null && unit.key === nowKey
  // 这一格有没有事情可讲：`counts` 是认得出的动作（见 src/index.js 的 TOOL_TAGS）。
  const quiet = grid && mainAction(tick?.tags || [], tick?.counts || {}) === null
  // 空着的那一格矮一点（见 CSS 的 .gf-row-quiet）。
  if (quiet) row.classList.add('gf-row-quiet')
  // 这一行是一卷（见 foldLadder）：抬头写的是那一段的首末，左栏是那一段的总数。
  // 类名挂两个：`gf-row-roll` 是「这是一卷」，`gf-row-<档>` 是它有多粗（day / week / month / year）。
  // 样式在 CSS 里那条 `.gf-row-roll`：抬头与左栏压暗一点、字号不动（用户 2026-10-06
  // 从三个选项里挑了「淡一档就好」），右栏照旧；另外挂一条悬停浮出来的小字（`title`），
  // 列这一卷里到底有哪几天。
  if (unit.roll === true) {
    row.classList.add('gf-row-roll')
    if (unit.tier) row.classList.add(`gf-row-${unit.tier}`)
    row.setAttribute('title', rollHint(unit))
  }
  // 抬头：一格只写**这一个时刻**（用户 2026-10-08 第 2 条：「时间从上而下应该是
  // 10:00，9:55,9:50,9:45,9:40……」）。梯子本身就是那段时间，再写一遍区间和时长
  // 就是自己折叠自己。老记录没有格子，照旧写「起点 – 终点 · 时长」。
  //
  // 时刻都落在整五分钟上（见 landedStamp）——18:26 写成 18:25、17:03 写成 17:00。
  // 「此刻」那一行是例外：老记录那张卡写的是**现在**（见下面 row.whenText 与 tickClock）。
  // 系统钟往回跳过时区间会倒着写，所以那种时候只写起点。
  const start = landedStamp(entry.startedAt)
  // 跨午夜的区间要写清终点是**哪一天**：老记录没有格子、只有首末两个时刻，
  // 「昨天 23:30 – 00:00」读起来像是倒着走了半小时（报告 B-06）。同一天照旧只写钟点
  // ——抬头前半句已经把日子说过了。
  const span = (stamp) => {
    if (!(stamp > start)) return clockText(start)
    if (startOfDay(stamp) === startOfDay(start)) return `${clockText(start)} – ${clockText(stamp)}`
    return `${clockText(start)} – ${dayText(stamp, now)} ${clockText(stamp)}`
  }
  const whenText = grid
    ? `${dayText(unit.at, now)} ${clockText(unit.at)}`
    : (isNow
      ? `${dayText(entry.startedAt, now)} ${span(now)} · ${durationText(landedMinutes(liveMinutes(entry, now)))}`
      : unit.roll
        // 一卷：头半句按档位说（日卷「昨天」，月卷「7 月」，年卷「2025 年」——见 rollLabel）。
        // 日卷还写首末两个钟点；周/月/年卷不写钟点，只留合计时长——「7 月 14:00 – 14:35」
        // 读起来像某一天，不像一个月。周卷那一档写的是**这一周里哪几天干了活**（rollDays），
        // 因为紧挨着它上面那条分组标签已经把「哪一周」说过了。
        ? (unit.tier === 'day'
          ? `${rollLabel(unit, now)} ${span(landedStamp(lastEnded(entry)))} · ${durationText(landedMinutes(entry.minutes))}`
          : `${(unit.tier === 'week' ? rollDays(unit) : '') || rollLabel(unit, now)} · ${durationText(landedMinutes(entry.minutes))}`)
        : `${dayText(entry.startedAt, now)} ${span(landedStamp(lastEnded(entry)))} · ${durationText(landedMinutes(entry.minutes))}`)
  const whenEl = el('div', isNow ? 'gf-when gf-when-now' : 'gf-when', whenText)
  row.appendChild(whenEl)
  // 一格一行之后，原来那排「每五分钟一格」的小刻度（.gf-cells / .gf-cell）就没有意义了：
  // 梯子就在底下，**一格恰恰是一行**。2026-10-08 删掉。
  // 交给 refresh()：面板开着的时候，每跨一个整五分钟拿它重写一次抬头。
  // 只有「此刻」那一行跟着走（其余行的时刻是过去的事实，见 renderTimeline）。
  row.whenEl = whenEl
  row.whenText = (stamp) => (!grid && isNow
    ? `${dayText(entry.startedAt, now)} ${span(stamp)} · ${durationText(landedMinutes(liveMinutes(entry, stamp)))}`
    : whenText)
  row.isNow = isNow

  const cols = el('div', 'gf-cols')

  // 左：你。记录里本来就有的那些词和数，一个都不翻译、一个都不编。
  const you = el('div', 'gf-you')
  const counts = grid
    ? (tick && tick.counts && typeof tick.counts === 'object' ? tick.counts : null)
    : (entry.counts && typeof entry.counts === 'object' ? entry.counts : null)
  const byCount = (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))
  // 一格不退回 `tags` 里那几个词：那一格的「深夜」是钟点、不是动作——一层楼二十格
  // 全挂着同一枚「深夜」就成了噪音。老记录照旧退回（它原来就是这么写的）。
  // 「空对象」也算没有：收出来的卷（见 rollUnit）总是带着 `counts`，可老式卡本来就没有，
  // 不能因为它是个 `{}` 就把「一小会儿」这类词也吞掉。
  const ranked = grid
    ? Object.entries(counts || {}).sort(byCount)
    : (counts && Object.keys(counts).length ? Object.entries(counts).sort(byCount) : (entry.tags || []).map((tag) => [tag, 0]))
  if (ranked.length) {
    const tags = el('div', 'gf-tags')
    // 有次数就写成「改文件 ×12」；老记录没这个字段，就退回只写词。
    // 最多三个，跟右边一样多——两栏一样厚，才不会有哪边压着哪边。
    for (const [tag, n] of ranked.slice(0, 3)) {
      tags.appendChild(el('span', 'gf-tag', n > 0 ? `${tag} ×${n}` : tag))
    }
    you.appendChild(tags)
  } else if (quiet) {
    // 空着的一格：不写「无数据」（现代词，也不是他的日子），只留一枚淡淡的点。
    you.appendChild(el('span', 'gf-quiet-dot'))
  }
  const names = []
  const rawFiles = grid
    ? [...listOf(tick?.files), ...(head ? listOf(entry.deliverables) : [])]
    : [...listOf(entry.files), ...listOf(entry.deliverables)]
  for (const raw of rawFiles) {
    const name = String(raw).split(/[\\/]/).pop()
    if (name && !names.includes(name)) names.push(name)
  }
  if (names.length) {
    // 中文名排前面，然后才是 client.js 这种。拉丁字母在小字号下笔画均匀、占位实，
    // 同样长度看起来比中文重——左边显厚重的头一个原因就是它。
    const isCn = (n) => /[\u4e00-\u9fa5]/.test(n)
    const ordered = [...names.filter(isCn), ...names.filter((n) => !isCn(n))]
    const stem = (n) => n.replace(/\.[^.]+$/, '')
    const shown = ordered.slice(0, 2).map(stem)
    const more = ordered.length > shown.length ? ` 等 ${ordered.length} 个` : ''
    const files = el('div', 'gf-files', shown.join(' · ') + more)
    // 名字全在，只是收在悬停里——不用点，也不占版面。
    files.setAttribute('title', ordered.join('\n'))
    you.appendChild(files)
  }

  // 他停住之后你干的活：**这一行只建左栏**（`muted`，见 renderTimeline 的 `tail`）。
  // 用户 m18735 逐字：「停的只是右侧"他的冒险"，左侧是用户的"你的日常"不能停。」
  // 右栏一个字都不往下写——故事停在上面那个命运上，可你的日子照旧一行一行铺出来。
  if (muted) {
    row.classList.add('gf-row-tail')
    cols.appendChild(you)
    row.appendChild(cols)
    const youSaid = ranked.length
      ? ranked.map(([tag, n]) => (n > 0 ? `${tag} ${n} 次` : tag)).join('、')
      : (quiet ? '没动手' : '忙')
    row.quietText = ''
    const labelAt = grid ? unit.at : entry.startedAt
    row.setAttribute('aria-label', `${formatDate(labelAt)} ${clockText(labelAt)}，你在${youSaid}；他还没走到这儿`)
    return row
  }

  // 右：他。先是他那边的短标签（**跟左边同一顺序**，好让两行横着对上），然后是那句话。
  // 第一枚是这一行句子里真正在讲的那件事（抄咒文 / 搬箱笼 / 修炉子……），
  // 后面几枚才轮到那个动作的别的说法。
  const him = el('div', 'gf-him-col')
  const hisTagList = hisTags(ranked.map(([tag]) => tag), voice, String(unit.key || ''), picked ? picked.w : '')
  if (hisTagList.length) {
    const tags2 = el('div', 'gf-tags')
    for (const tag of hisTagList) tags2.appendChild(el('span', 'gf-tag', tag))
    him.appendChild(tags2)
  }
  // 空着的那一格说的是那句安静的话（不编动作）；有事的格子才是他手上那件事。
  const remark = quiet
    ? quietLine(unit, avoidQuiet)
    : ((picked && picked.line) || unitLine(unit, voice))
  // 序曲（见 ORIGIN）：只有**最老的那一行**会带它进来。它是故事的开头，所以挂在这一行
  // 最上面（定场句与主句之前），底下压一条虚线把开场与那一天的事分开。
  // 用 div 不用 p：p 会自己撑出一行空来，一段开场就读散了（跟高光事件那次一样的坑）。
  if (origin && Array.isArray(origin.lines) && origin.lines.length) {
    const block = el('div', 'gf-origin')
    for (const text of origin.lines) block.appendChild(el('div', 'gf-origin-line', text))
    him.appendChild(block)
    row.originText = origin.lines.join('\n')
  }
  // 一天的框（见 dayFrameOf）：**定场句**挂在主句上面，**收尾句**挂在最下面。
  // 只有日卷那一档有；今天那半截卷只给定场，不给收尾——那等于替他把话说完。
  const frame = unit.tier === 'day' ? dayFrameOf(entry, unit.partial === true) : null
  if (frame && frame.open) him.appendChild(el('div', 'gf-remark gf-day-open', frame.open))
  row.dayOpenText = (frame && frame.open) || ''
  // 方向（见 `DIRECTIONS`）：这一天朝哪边走，写在定场句**下面**、主句上面。
  // 只有日卷那一档有——五分钟的格不挂它（一天说一次就够，格格都说就成了口头禅）。
  // 挑哪一句由这一天自己定（`entry.id` 当种子），所以同一份记录看两眼一字不变。
  const dir = unit.tier === 'day' && entry.direction
    ? DIRECTIONS.find((one) => one && one.id === entry.direction) || null
    : null
  const dirLines = (dir && Array.isArray(dir.lines)) ? dir.lines.filter((t) => typeof t === 'string' && t) : []
  if (dirLines.length) {
    him.appendChild(el('div', 'gf-remark gf-direction', dirLines[pickIndex(`${entry.id || ''}|direction`, dirLines.length)]))
  }
  row.directionText = dirLines.length ? dirLines[pickIndex(`${entry.id || ''}|direction`, dirLines.length)] : ''
  // 当日计划（见 `JOURNEY` / `dayPlanOf` / `planLines`，用户 m14781「他有怎样的规划」）：
  // **今天手上那几件事**与**这一季的路**，写在方向下面、主句上面——先说打算，再讲他手上
  // 那一件怎么走。只有日卷那一档有：五分钟的格上格格都说「他今天手上有几件事」就成了口头禅。
  const planText = unit.tier === 'day' ? planLines(plan, entry) : []
  if (planText.length) {
    const block = el('div', 'gf-plan')
    for (const text of planText) block.appendChild(el('div', 'gf-plan-line', text))
    him.appendChild(block)
  }
  row.planText = planText.join('\n')
  // 他此刻那句话就在这一行里（原来单独挂在地图下面），先把节点交出去，
  // 由 refresh() 往里填字、逐字浮现——见 typeInto。
  const remarkEl = el('div', isNow ? 'gf-remark gf-nowish' : 'gf-remark', isNow ? '' : remark)
  if (isNow) row.nowRemark = remarkEl
  him.appendChild(remarkEl)
  // 高光事件：这一天有一件值得单讲的事（见 momentsFor 与 src/packs/adventure/moments.js）。
  //
  // 它**接着他手上那句话往下说**，所以不缩进、不换字号台阶、也不另起一层——
  // 只是多几行，读起来是同一段故事往下走（生活层那种缩进加竖线才是另一层）。
  // 只有日卷那一档会带它进来；一句话的日子照旧只有那一句。
  if (moment && Array.isArray(moment.steps) && moment.steps.length) {
    const block = el('div', 'gf-moment')
    // 用 div 不用 p：面板没给 p 的默认外边距做归零，p 会自己撑出一行空来，
    // 一段经过读起来就散成好几段了（2026-10-08 截图里撞见的）。
    for (const text of moment.steps) block.appendChild(el('div', 'gf-moment-line', text))
    // 岔口（选择点）从前接在**经过之后、收束之前**（先讲完这一场，再讲他往哪边走，最后才是
    // 事后那句收束），2026-10-10（用户 m16528 三条）起整段撤了：见下面那几句。
    // 2026-10-10（用户 m16528 三条）起，**这一层不再摆路**：高光事件是**日记的取材范围**
    // （他今天在桌子边干了什么，余波落在这一卷下面），路与代价归 `forks`（命运）那一层管。
    // 从前的两枚一亮一暗、那句「你定下的：XX」、两句 `road.lines` 与 `cost` 全撤了——
    // 包里 `moments.js` 的 `choice` 照旧留着（R18 照旧管它），旧内容备用（用户 m14810 第 6 条）。
    // 收束那一句比经过轻一点：它是事后的一句，不是又一段经过。
    if (moment.close) block.appendChild(el('div', 'gf-moment-line gf-moment-close', moment.close))
    him.appendChild(block)
    row.momentText = [...moment.steps, moment.close].filter(Boolean).join('\n')
  }
  // 命运（见 `FORKS` 与 `forksFor`）：这一天压下来的那一件大事、他走了哪条路、落的是哪一种结果。
  //
  // 这是**这一天的正文**（用户 m16528 第 3 条「命运要影响接下来一整天的后续活动」）：他走的那条路
  // 落的是哪一种结果，接下来那几行带着什么痕迹、这一天的仗打得多凶，全从它出来（见 markOf）。
  // 接在高光事件后面，不缩进、不换台阶——读起来是同一段故事往下走。
  //
  // 还没定（`pending`）时这一段一个字都不写：那一对选项在更上面那一格上（见下面 `liveFork`）。
  if (forkInfo && !forkInfo.pending && forkInfo.road) {
    const block = el('div', 'gf-fork')
    block.appendChild(el('div', 'gf-fork-head', '命运'))
    // 那两枚再摆一次：走的那条亮、没走的那条暗（用户 m12195 第 2 条）。
    const done = el('div', 'gf-choice-done')
    for (const one of forkInfo.roads) {
      const took = one.id === forkInfo.road.id
      done.appendChild(el('div', took ? 'gf-choice-road gf-choice-took' : 'gf-choice-road gf-choice-left',
        one.label || one.id))
    }
    block.appendChild(done)
    // 这一条是不是你定下的：没定的时候书自己往下讲，走的是主线那一支。
    const said = forkInfo.picked ? `你定下的：${forkInfo.road.label || forkInfo.road.id}` : '这条是他自己走的'
    block.appendChild(el('div', 'gf-choice-said', said))
    const steps2 = forkInfo.result && Array.isArray(forkInfo.result.beats) ? forkInfo.result.beats : []
    for (const text of steps2) block.appendChild(el('div', 'gf-moment-line gf-fork-line', text))
    him.appendChild(block)
    row.forkText = steps2.join('\n')
    row.fateId = forkInfo.fork.id
    row.fateRoadId = forkInfo.road.id
    row.fateResultId = forkInfo.result ? forkInfo.result.id : ''
    row.fateMark = forkInfo.picked ? 'picked' : 'missed'
    row.fateDone = forkInfo.roads.map((one) => `${one.label || one.id}:${one.id === forkInfo.road.id ? 'took' : 'left'}`)
    row.fateSaid = said
  }
  // 「命运」（2026-10-09 叫「命运抉择」，2026-10-10 按用户 m14810 第 5 条改成「命运」）：
  // 这一对按钮长在**这一件起头的那一格**那一行上（`liveFork`，见 forksFor 的 `live`）——
  // 那一格才是「他走到这儿，事情压下来了」。**没定就一直摆着**，后面的行也一直不往下写；
  // 定下来之后整条又铺开，那一卷再照你定下的那条把两枚一亮一暗摆出来（见上面那一段）。
  // 没有存储就不摆（摆了点了记不住，下一次刷新又变回原样，那是骗人）。
  //
  // 按钮上**只有地名与眼前那一句**（用户 m16528 第 1 条：「魔窟看起来怪石嶙峋，暗堡可见度很低」）
  // ——**一个字的账都不写**：代价不可知（第 2 条），写出来命运就成了既定。
  if (liveFork && canPick) {
    const bar = el('div', 'gf-choice gf-choice-live')
    // 眼前那一句：路到这儿分了两股（「都给一点点环境描述」）。
    const look = Array.isArray(liveFork.fork && liveFork.fork.look)
      ? liveFork.fork.look.filter((t) => typeof t === 'string' && t)
      : []
    if (look.length) bar.appendChild(el('div', 'gf-choice-look', look.join('')))
    bar.appendChild(el('div', 'gf-choice-head', '命运'))
    for (const one of liveFork.roads) {
      const btn = el('button', 'gf-choice-pick')
      btn.type = 'button'
      btn.setAttribute('data-road', one.id)
      btn.appendChild(el('span', 'gf-choice-name', one.label || one.id))
      const first = Array.isArray(one.look) ? one.look.find((t) => typeof t === 'string' && t) || '' : ''
      if (first) btn.appendChild(el('span', 'gf-choice-hint', first))
      // 悬停先看一眼这条路怎么走（原生 title，跟「故事风格」那一格同一个做法）。
      btn.setAttribute('title', String(first).replace(/。$/, ''))
      btn.addEventListener('click', () => {
        // 存的键和读的键是同一个（见 `choiceKey`）：认的是**那一卷**（`day:<那天>`），不是这一格。
        picks.save(liveFork.key, one.id)
        // 把这一挑的账记进册子（用户 m16552：整本书的进度）。死在分支上多记一次，
        // 走主线那一支就按一个指印。**只记两个整数**，记录一个字不写。
        const res = rulesResultOf(liveFork.facts || emptyFacts(), one, { outdoors: OUT_KEYS })
        if (typeof picks.note === 'function') picks.note(one, res)
        // 挑完整块重画一遍：那一格那一对按钮下去，那一卷那一段换成「这条路落的那一种结果」，
        // 顺带把这一年那份账（fatesFor 里的岔口分布）一起算对。
        if (typeof picks.repaint === 'function') picks.repaint()
      })
      bar.appendChild(btn)
    }
    him.appendChild(bar)
    // 停在哪儿、为什么停：这一行下面往下的故事都还没讲（用户 m14810 第 5 条）。这一句是给他看的，
    // 不然屏幕上「少了半天」看着像坏了。等他定下来，这一句跟着按钮一起下去。
    bar.appendChild(el('div', 'gf-wait', '往下的事，等你定了再讲。'))
    row.choicePicks = liveFork.roads.map((one) => one.label || one.id)
    row.choiceId = ''
    row.choiceLook = look.join('')
    row.forkMark = 'open'
    row.forkEl = bar
    row.liveText = liveFork.roads.map((one) => one.label || one.id).join('\n')
  }
  // 战斗（见 `FIGHTS` 与 `fightsFor`）：这一行落的是挨打那一档，就把「他挨了一下」
  // 铺成一场有头有尾的仗——遭遇、应对、交手、失算、收场。
  // 2026-10-10（用户 m14888「他必须有战斗」）换掉了从前那道两拍的交锋（`clashOf`）：
  // 一场仗得有对手、有胜负、有开头与收场，才叫一场。旧的两句留在包里不接线（备用）。
  // 梯子上那五分钟一格不挂（见 `fightsFor`），一天最多三场。
  const beats = fight ? fightBeats(unit, fight) : null
  if (beats) {
    const block = el('div', 'gf-fight')
    block.appendChild(el('div', 'gf-fight-head', `${fight.foe.label}·${fight.tier.label}`))
    for (const text of beats) block.appendChild(el('div', 'gf-fight-line', text))
    him.appendChild(block)
    row.fightText = beats.join('\n')
    row.fightFoe = fight.foe.id
    row.fightTier = fight.tier.id
  }
  // 世界层：他干活的时候外头发生的事（见 worldLine）。整段才有的东西，只挂在最新那一格。
  // 与生活层正好相反——生活层宁可不写，世界层**每一段都有一句**：用户 2026-10-08
  // 要看的就是外头，不是他手上那件活。句号收尾、不带数字，读着像同一本日记里的另一笔。
  //
  // 卷越粗，能说的越少（见 foldLadder）：日卷照旧两边都挂，周卷只挂世界句，
  // 月卷与年卷两边都不挂——「卖柴的推车从门口过去」挂在一年那一卷上不合身，
  // 那是某一天外头的事，不是那一年的。
  const tier = unit.tier || null
  const worldOk = !tier || tier === 'day' || tier === 'week'
  const lifeOk = !tier || tier === 'day'
  const world = isNow || !head || !worldOk
    ? ''
    : worldLine(entry, voice, picked ? picked.place : placeOf(entry), avoidWorld, picked ? picked.sceneKey : '', mark)
  if (world) him.appendChild(el('div', 'gf-remark gf-world', world))
  // 交回这一行讲过的外头那件事，好让下一行避开它。
  row.worldText = world
  // 生活层：只在他那一栏，而且大多数行没有——条件不成立就不写，免得又成一句套话。
  // 「此刻」那一行也不写：它上面那句话就是此刻，再补一句反而把此刻说糊了。
  const life = isNow || !head || !lifeOk ? '' : lifeLine(entry, voice, prev, avoidLife, mark)
  if (life) him.appendChild(el('div', 'gf-life', life))
  // 交回这一行用的生活层，好让下一行避开它（相邻两行同一句最扎眼）。
  row.lifeText = life
  // 痕迹那一句回声（见 `markLine` 与 `MARKS`）：这一天挑过的那条路，今天后面每一格都跟着。
  // **一行最多一处**——上面那句世界句、这句生活句，本来就是照痕迹那一池挑的（`mark` 递进去了），
  // 所以它们已经在说这件事；这一行两样都没有的时候，才另挂一句跟活计无关的回声。
  // 日卷那一行**一定挂一句**：那是「今天到现在为止的账」，压在这一天那件事下面正好。
  const echo = !isNow && head && mark && (tier === 'day' || (!world && !life)) ? markLine(entry, mark) : ''
  if (echo) him.appendChild(el('div', 'gf-remark gf-mark-line', echo))
  row.markText = echo
  const help = head ? helpersFor(entry) : null
  if (help) him.appendChild(el('div', 'gf-remark gf-help', help))
  // 日卷末尾那一句战报（见 `FIGHTS` 的 `report` 与 `fightReport`）：这一天打了几场、
  // 身上添了什么。折叠把具体的句子吞掉之后，靠它照样看得见「这一天打过」。
  // 只有日卷那一档有（`dayCount` 是那一天的总数），今天那半截卷也有——他今天真打过就得说。
  const report = fight && unit.tier === 'day' ? fightReport(unit, fight) : ''
  if (report) him.appendChild(el('div', 'gf-remark gf-fight-report', report))
  row.fightReportText = report
  // 他今天身上少了什么（见 `JOURNEY.losses` 与 `lossLine`）：每描一处少一分——这是弧光。
  // 摆在收尾句**之前**：它是这一天的一部分（他做完这一处的代价），不是这一天的边。
  // 只有日卷那一档有；今天那半截卷也挂（今天真到过哪儿，那一分今天就少了）。
  const lost = unit.tier === 'day' ? lossLine(plan, entry) : ''
  if (lost) him.appendChild(el('div', 'gf-remark gf-loss', lost))
  row.lossText = lost
  // 收尾句压在最下面：这一天到这儿为止（今天那半截卷没有这一句，见 dayFrameOf）。
  if (frame && frame.close) him.appendChild(el('div', 'gf-remark gf-day-close', frame.close))
  row.dayCloseText = (frame && frame.close) || ''
  // 每五分钟一个状态（见 `stateAt`）：第二期先把它算出来给自检读，屏幕上还没换掉最后一跳。
  const state = stateAt(unit, plan, picked, mark)
  row.stateText = [state.where, state.doing, state.step, state.station, state.loss, state.carry, state.clock.hour, state.clock.season, state.road].join('|')
  // 归宿：这一年收在哪一句上（见 `FATES` 与 `fatesFor`）。只有**年卷**那一档有，
  // 挂在**这一行最下面**——它是一整年的收束，压在所有别的句子之后（年卷本来也没有
  // 世界句与生活句，见上面的 worldOk / lifeOk，所以它底下正好空着）。
  // 那一句从这一件里挑（种子是这一卷自己，看两遍一字不变），末尾的 `close` 是定死的
  // 一句收束，**带他的名字**——全篇第二处、也是最后一处（第一处是开头那段序曲）。
  if (fate && Array.isArray(fate.lines)) {
    const lines = fate.lines.filter((t) => typeof t === 'string' && t)
    if (lines.length) {
      const said = lines[pickIndex(`${entry.id || ''}|fate`, lines.length)]
      const block = el('div', 'gf-fate')
      block.appendChild(el('div', 'gf-fate-line', said))
      const close = typeof fate.close === 'string' ? fate.close : ''
      if (close) block.appendChild(el('div', 'gf-fate-line gf-fate-close', close))
      him.appendChild(block)
      row.fateText = [said, close].filter(Boolean).join('\n')
      row.fateId = fate.id
    }
  }

  // 死（用户 m16548 逐字：「整个右半边界面，就是已死亡」）：右栏清空，只留那一整块。
  // 左栏**不停**（用户 m16552 第 2 条：「左栏不停」）——他真做过的事照旧一行一行列着，
  // 那是记录，不因为故事里他死了就把用户的活抹掉。
  if (death) {
    const page = el('div', 'gf-death')
    const last = death.result && Array.isArray(death.result.beats) ? death.result.beats : []
    for (const text of last) page.appendChild(el('div', 'gf-death-line', text))
    page.appendChild(el('div', 'gf-death-mark', '已死亡'))
    page.appendChild(el('div', 'gf-death-tail', '今天到这里为止。'))
    him.textContent = ''
    him.appendChild(page)
    // 今天后面那几行本来就被 `stopAt` 滤掉了，这几行是这一格自己身上的别的句子——一并撤掉，
    // 右半边**只剩**这一块（不然「已死亡」下面还挂着一句生活句，读起来像他还在）。
    row.momentText = ''
    row.forkText = last.join('\n')
    row.fateText = ''
    row.choiceText = ''
    row.choiceId = ''
    row.choiceCost = ''
    row.choiceLook = ''
    row.choicePicks = []
    row.forkMark = ''
    row.forkDone = []
    row.forkSaid = ''
    row.worldText = ''
    row.lifeText = ''
    row.markText = ''
    row.planText = ''
    row.directionText = ''
    row.dayOpenText = ''
    row.dayCloseText = ''
    row.lossText = ''
    row.fightText = ''
    row.fightReportText = ''
    row.deathText = last.join('\n')
    row.deathHere = true
  }

  cols.appendChild(you)
  cols.appendChild(him)
  row.appendChild(cols)
  // 空着那一格不写「你在忙」——那五分钟他确实什么都没做。
  const youSaid = ranked.length
    ? ranked.map(([tag, n]) => (n > 0 ? `${tag} ${n} 次` : tag)).join('、')
    : (quiet ? '没动手' : '忙')
  // 空着那一格的安静句也要往下递一道：连着两行说同一句话最扎眼。
  row.quietText = quiet ? remark : ''
  const labelAt = grid ? unit.at : entry.startedAt
  row.setAttribute('aria-label', `${formatDate(labelAt)} ${clockText(labelAt)}，你在${youSaid}；${remark}`)
  return row
}

/* ------------------------------------------------------------------ *
 * 挑过的说法记在哪儿
 * ------------------------------------------------------------------ */

/**
 * 「故事风格」那一行挑过的那一套说法记在这里，下次打开还是它。
 *
 * **只记一个 id**：不碰宿主的任何存储——不写 `records.json`、不写 `~/.dsh`。
 * 换说法换的是「他那边怎么讲」，跟你的记录一个字都没关系，所以也不需要宿主知道。
 * 读不到（自检垫片、无痕窗口、存储被禁）就当作没选过，照旧装默认那一套。
 *
 * 2026-10-06 之前这个键叫 `dsh.gameflow.world`（那时候门后摆着一格书架，挑的是世界）。
 * 用户第 1 条把入口搬到「故事风格」后面之后，挑的就成了说法：同一个位置上的同一个
 * 选择，名字跟着它现在的意思走，所以键也换了——旧键不再读。
 */
const STYLE_STORE_KEY = 'dsh.gameflow.style'

/** 默认的存储：浏览器的 localStorage。拿不到就是 null（那种环境下就当没记过）。 */
function defaultStore() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 读上次挑的说法。存储坏了、被禁了都不该让面板打不开，所以一律吞掉。 */
function keptStyleId(store) {
  try {
    if (!store || typeof store.getItem !== 'function') return ''
    return store.getItem(STYLE_STORE_KEY) || ''
  } catch {
    return ''
  }
}

/** 记下这次挑的说法（`id` 为空就抹掉）。存不下就算了：记不住一个选择不值得打扰他。 */
function rememberStyle(store, id) {
  try {
    if (!store || typeof store.setItem !== 'function') return
    if (id) store.setItem(STYLE_STORE_KEY, id)
    else if (typeof store.removeItem === 'function') store.removeItem(STYLE_STORE_KEY)
  } catch {
    /* 满了、被禁了——都不是这一屏该操心的事 */
  }
}

/* ------------------------------------------------------------------ *
 * 主体
 * ------------------------------------------------------------------ */

/**
 * @param {object}   [options]
 * @param {string}   [options.theme='plain']            主题 id
 * @param {Function} [options.loadRecords]              取记录：() => Promise<Entry[]> | Entry[]
 * @param {Element}  [options.container=document.body]  挂在哪里
 * @param {object}   [options.storage=localStorage]     记「挑过哪一套说法」的地方，传 null 就不记
 *
 * Entry = { startedAt: number, endedAt?: number, minutes: number, tags: string[] }
 */
function createGameflow(options = {}) {
  const {
    theme = 'plain',
    // 语气：案牍还是冒险。同一份记录，换的是他那边的名词。
    voice = DEFAULT_VOICE,
    loadRecords = async () => [],
    // 8 → 9：按下「开始冒险」时**通知宿主**（`(at) => Promise<boolean>`，见 src/index.js 的
    // `POST /dsh-gameflow/start`）。不传（预览页、自检里那些夹具）就只记在本地那枚标记上，
    // 行为跟从前一样——那颗按钮在这些地方本来也按不出什么结果来。
    startSession = null,
    container = document.body,
    // 时间的接缝：问候语、屋里的光、他此刻在干什么，全都读它。
    // 留着是为了测试能钉死「现在是几点」，不然一到傍晚断言就会飘。
    now = Date.now,
    // 量尺寸的防抖延迟。面板刚打开时过渡还没跑完，量到的是中间态，
    // 所以要等一拍再量；自检里传 0，就不用真等四百毫秒。
    measureDelay = 420,
    // 跟着钟走的节拍：面板开着时每分钟把抬头改成现在几点（见 tickClock）。
    // 自检把它压到几十毫秒，就不用真等一分钟才看得见它走。
    clockTickMs = 60 * 1000,
    // 每多久重新读一次记录。默认跟宿主写盘同一班（src/index.js 的 PERSIST_INTERVAL_MS）。
    landEveryMs = 5 * 60 * 1000,
    // 已经解锁的故事包 id（2026-10-06 加）。这个插件不管收款——将来许可证（或激活码）
    // 把 id 塞进这个数组，说法清单里那一项自己就亮了；不传就是只有免费的那几个能用。
    unlocked = [],
    // 挑过的说法记在哪儿（2026-10-06 加）。默认是浏览器的 `localStorage`；
    // 传 `null` 就完全不记（预览页 / 自检），也可以塞一个自己的存储对象进来。
    storage,
  } = options
  const store = storage === undefined ? defaultStore() : storage

  // 主题的两层：调用方指定的 > 这个世界包自带的（`WORLD_THEME`）> 兜底 `plain`。
  // 中间那一层是 2026-10-06 加的——世界包可以自带一套材料，但主题本身（配色）
  // 仍然住在 `THEMES` 里，包里只指一个 id。换说法不动这一层（用户第 2 条）。
  let themeId = THEMES[theme] ? theme : (THEMES[WORLD_THEME] ? WORLD_THEME : 'plain')
  let voiceId = VOICES[voice] ? voice : DEFAULT_VOICE
  let entries = []
  /**
   * 存档里那两个标量（用户 m01403 第 2 条「旧日子删除」之后才需要的东西）。
   *
   * 旧日子真删了以后，记录里就只剩今天，于是有两件事**没处可问**了：
   *   · `since`——这份存档的**头一天**。序曲（「他叫塔里恩」那六句）认它：
   *     只有今天就是头一天才说，不然每天重播一遍。旧记录在的时候是数出来的，
   *     现在由宿主在删之前记下（见 src/index.js 的 pruneStore）。
   *   · `seam`——**上一段**（最近那一条被删掉的坐下来的那一段）的起止。
   *     今天第一行上面那句「隔了一夜」认它，不然每天的头一行都是凭空起头。
   * 两个都不是「日子」，是接缝：留着不算「保存过去的事」。
   *
   * 8 → 9 又多了一个 `dayStart`：按下「开始冒险」那一刻（用户 m04200）。它不是接缝，
   * 是「今天从哪儿开始讲」——`renderTimeline` 只铺它之后的格子（见 clipToStart）。
   */
  let archive = { since: 0, seam: null, dayStart: 0, dayStartKnown: false }
  // 命运「压下来那一刻」那枚钉子（见 `forksFor` 的头注）：**一个实例一枚**，从前它是
  // 模块级的 `pendingPin`，同一个页面上两块面板会互相拽（报告里那条设计债）。
  const forkPin = {
    value: null,
    // 落盘的那一份（见 `readForkPin` 的头注）：DSH 重启之后要能把它捞回来。
    load() {
      return picks.canSave ? readForkPin(store) : null
    },
    save(pin) {
      if (picks.canSave) writeForkPin(store, pin)
    },
    clear() {
      forkPin.value = null
      if (picks.canSave) writeForkPin(store, null)
    },
  }
  // 岔口挑过的那些（2026-10-08 晚加的，用户 m10670 第 2 条：「我要的交互选项在哪？」）。
  // 跟挑说法**同一个存储、另一个键**：挑的是「哪一天、哪件事、走哪条路」，记在本地，
  // **不写 `records.json`**——记录里仍然只有他真做的事（这是这个插件的底线）。
  // 面板里那两个胶囊点一下就落到这儿，然后整块重画一遍。
  const picks = {
    map: {},
    // 记不住就不给挑：摆了胶囊、点了却存不下来，下一次刷新又变回原样，那是骗人。
    // 真面板里有 `localStorage`，预览页与自检里没有（那时照旧由机器自己落一条）。
    canSave: !!store && typeof store.setItem === 'function' && typeof store.getItem === 'function',
    reload() {
      picks.map = readChoices(store)
      return picks.map
    },
    save(key, id) {
      if (!key || !id) return
      picks.map[key] = id
      writeChoices(store, picks.map)
    },
    /**
     * 把这一挑的账记进册子（用户 m16552：整本书的进度）。**只记两个整数**
     * （见 `LEDGER_STORE_KEY` 的头注），记录、句子、钟点一个字都不写。
     *
     *   · 挑到分支上带 `then.die` 的那一种结果 ⇒ 死过几次 +1（今天到此为止）；
     *   · 走的是主线那一支 ⇒ 册子上多按一个指印（书往下讲一程）。
     *
     * 绕回主线（`then.back`）的那一支**不加也不减**：他回到主线上了，可这一程没走完。
     */
    note(road, result) {
      const cur = readLedger(store)
      const die = !!(result && result.then && result.then.die === true)
      if (die) writeLedger(store, { seals: cur.seals, deaths: cur.deaths + 1 })
      else if (road && road.kind === 'main') writeLedger(store, { seals: cur.seals + 1, deaths: cur.deaths })
    },
    // 点完那一颗之后重画一遍。走的是同一个 `refresh()`，所以时刻、滚动位置、
    // 逐字浮现那些事全照旧——那句话一个字都没变，`typeInto` 自己就不重放了。
    repaint() {
      if (!mounted) return
      Promise.resolve(refresh()).catch(() => { /* 重画失败不该把面板弄崩 */ })
    },
  }
  // 上一次把记号画在哪栋房子门口。位置变了就从那儿走过去，而不是瞬间跳过去。
  let drawnPlace = null
  // 开场那一颗「开始冒险」（2026-10-09，用户 m01903 第 1 条）。跟 `picks` 一样是**面板自己
  // 的一份状态**，不写 `records.json`。没有存储（预览页、自检里那些 `storage: null`）时
  // 退到**内存里记一次**：不然每一次重画按钮都会回来一次，那就成了催。
  let startedMemory = 0
  function startedOn() {
    return Number(readStarted(store)) || startedMemory
  }
  /**
   * 按下「开始冒险」。8 → 9 起它不只是「记下按过」（用户 m04200）：
   * **按下那一刻就是这一天的起点**，所以先通知宿主把起点记进存档、
   * 把之前攒的记录删掉，**成了之后**才掀幕布（本地那枚标记、按钮换说明、重画）。
   *
   * 没连上（宿主那条路由没成、或这儿根本没有传输层）就什么都不做：
   * 按钮留着、再按一下——宁可让他多按一次，也不能让幕布先掀开、
   * 底下却还是「按下之前的那一天」。
   */
  function pressStart(btn) {
    const at = now()
    const dayFrom = startOfDay(at)
    // 先把按钮就地换成那两条说明：重画是异步的，不这样会先闪一下空。
    const commit = () => {
      startedMemory = dayFrom
      writeStarted(store, dayFrom)
      const box = btn && btn.parentNode
      if (box) {
        btn.remove()
        for (const text of START_HINTS) box.appendChild(el('div', 'gf-hint', text))
      }
      if (mounted) Promise.resolve(refresh()).catch(() => { /* 重画失败不该把面板弄崩 */ })
    }
    if (typeof startSession !== 'function') {
      commit()
      return
    }
    if (btn && 'disabled' in btn) btn.disabled = true
    Promise.resolve(startSession(at)).then((ok) => {
      if (!mounted) return
      if (!ok) {
        if (btn && 'disabled' in btn) btn.disabled = false
        if (btn) btn.title = '没连上，稍后再按一下'
        return
      }
      commit()
    }, () => {
      if (btn && 'disabled' in btn) btn.disabled = false
      if (btn) btn.title = '没连上，稍后再按一下'
    })
  }
  // 屏幕上第一条还等着挑的那一行（门上那枚惊叹号点一下就落到它那儿，见 jumpToOpenFork）。
  let openRowEl = null
  // 那一对选项本身：惊叹号点一下要把**它**摆到滚动框正中（用户 m12444 第 2 条）。见 jumpToOpenFork。
  let openForkEl = null
  // 上一次**真画出来**、屏幕上正摆着的那几对选项（`renderTimeline` 交回来的 `pending`）。
  // 这是门上那枚记号的唯一来源（用户 m04298）：记号不自己算，只读它。
  let drawnPending = 0
  let isOpen = false
  let mounted = false
  let closeTimer = 0
// 开门之后「等面板排完版再量一次」的那一下（见 setOpen 打开那一支）。
let liveSettleTimer = 0
  // 鼠标移开之后一秒自动收。用户 2026-10-06 第 1 条定的是两秒（「移走 2 秒就消失」），
  // 2026-10-07 第 3 条嫌慢：「2 秒之后自动关闭太慢了，改为 1 秒」。
  // 写成函数声明是为了提升：`setOpen` 定义在前面，却要调 `cancelLeave`。
  let leaveTimer = 0
  function cancelLeave() {
    if (!leaveTimer) return
    window.clearTimeout(leaveTimer)
    leaveTimer = 0
  }
  function scheduleLeave() {
    cancelLeave()
    // 留住了就不自己收（用户 m11003 第 3 条：让门后的事情一直浮现）。
    if (pinned) return
    if (!isOpen) return
    leaveTimer = window.setTimeout(() => {
      leaveTimer = 0
      setOpen(false)
    }, 1000)
  }

  // 「始终显示」那个常驻按钮的状态（用户 m11003 第 3 条，m19425 第 1 条挪到地图右上角）。
  // 钉住 = 这一页不自己收：鼠标移开不收，点到外面也不收；再点一下放开，回到一秒自动收。
  let pinned = false
  function setPinned(on) {
    pinned = !!on
    pinBtn.setAttribute('aria-pressed', String(pinned))
    pinBtn.setAttribute('title', pinned ? '始终显示：这一页不自己收了（再点一下放开）' : '始终显示：这一页一直开着')
    writePin(store, pinned)
    if (pinned) {
      cancelLeave()
      setOpen(true)
    } else {
      scheduleLeave()
    }
  }
  let observer = null
  // 系统深色偏好的那条查询（界面审计 U11）：mount 时挂上，destroy 时摘掉。
  let schemeWatch = null
  const onSchemeChange = () => {
    if (!mounted) return
    retheme()
  }
  // 「此刻」那一行的抬头节点 + 「现在该写什么」。面板开着时每分钟重写一次（见 tickClock）。
  let nowWhen = null
  // 量尺寸：开关由宿主回答一次，之后每次刷新版面都量一遍（防抖）。
  let measureOn = false
  let measureTimer = null

  const host = document.createElement('div')
  host.setAttribute('data-dsh-gameflow', '')
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  // 地图那一段 SVG 用的是自己的类（`.ink`、`.wall`、`.mink`…），
  // 它们全挂在 `.gf-map` 底下（见 `src/map/world.js` 的 `MAP_CSS`），不会漏到面板上。
  // `LF_CSS` 是地方图那一条 `.lf`（田里的犁沟）——它住在 `LOCAL_CSS` 里，
  // 而面板只灌 `MAP_CSS`，所以镜内那 98 条犁沟一直是隐形的（见上面那两段注释）。
  style.textContent = CSS + MAP_CSS + LF_CSS

  const root = el('div', 'gf-root')

  const door = el('button', 'gf-door')
  door.type = 'button'
  door.setAttribute('aria-label', '推开门看看')
  door.setAttribute('aria-expanded', 'false')
  door.appendChild(doorSvg())
  door.appendChild(el('span', 'gf-door-label', '门后'))
  // 门上那枚提醒记号（用户 m11003 第 2 条）：有岔口等着挑的时候亮起来。
  // 它是一枚**按钮**（用户 m11602 第 1 条：「这个标记没有作用」）——一枚印色小圆牌 + 一个
  // 惊叹号，里面不带字（门自己那一行字不会因为它多一个字），点一下推开面板并落到那一行。
  const doorBadge = el('button', 'gf-door-badge')
  doorBadge.type = 'button'
  doorBadge.hidden = true
  doorBadge.setAttribute('aria-label', '门后有一件事等你定')
  // 2026-10-08 更晚（b259 数出来的四条之一）：原来这枚记号是**门的子节点**——门自己是
  // `<button>`，里面再套一枚 `<button>`，键盘与读屏都要绕一遍。现在外面套一层只做定位的
  // `.gf-door-wrap`，门与记号是**兄弟**：门只管开/关，记号只管「带我过去」。
  const doorWrap = el('div', 'gf-door-wrap')
  doorWrap.appendChild(door)
  doorWrap.appendChild(doorBadge)

  const room = el('section', 'gf-room')
  room.hidden = true
  room.setAttribute('role', 'dialog')
  room.setAttribute('aria-label', '门后面')
  // 它是一扇对话窗：打开之后焦点要能落进来（见 setOpen 里那一句 focusInto）——
  // `-1` 是「可以用程序聚焦，但不进 Tab 的顺序」。
  room.setAttribute('tabindex', '-1')

  // 最上面就是地图，地图下面才是字。
  const stage = el('div', 'gf-stage')
  // 2026-10-31（t28）：地图那一坨（554 KB、两千多个形状）**等到第一次开门再灌**
  // ——挂载那会儿面板是 display:none，灌进去谁也看不见，白付 260ms 解析 + 340ms 脚本，
  // 而 DSH 每次启动/刷新页面都要付一遍。为什么不是「挂上之后的空闲时刻灌」（另一条路）：
  // 宿主常在流式生成，空闲时刻可能被饿到用户正在读的那一刻才来，那才是真的卡；
  // 而且面板默认收起，多数启动根本不打开它——为一扇可能永远不开的门先付全价不划算。
  // 开门是用户自己按的，代价放在这里正好，配一行「正在铺开地图…」，不是白屏。
  const stageHandle = buildStage({ deferMap: true })
  stage.appendChild(stageHandle.svg)
  // 灯、记号、地名签那张**自己的** SVG（用户 m23060 报记号一卡一卡 ⇒ m23080 批甲）：
  // 它跟地图那张盖在同一块地方、同一套世界坐标，但**自己成一层**——记号上下动只重画这一小层，
  // 不用每帧重画地图上那 5817 个形状（实测：光滑动画在整张地图里 1909ms，搬到这张里 587ms）。
  // 它也得绝对定位在地图上，所以同样挂在 `.gf-stage` 上。
  stage.appendChild(stageHandle.overlaySvg)
  // 2026-10-31（t29）：记号、涟漪、灯那一层是 HTML（见 buildStage 里的 `live`）。
  // 它必须挂在 `.gf-stage` 这个定位容器里，盖在两张 SVG 上面——但 `pointer-events`
  // 在 CSS 里关掉了，点击照旧落到下面的地图上。
  stage.appendChild(stageHandle.live)
  // 面板一变宽窄，那一层「一个世界单位等于多少像素」就得重新量（见 LIVE_BOX_TTL 那段）。
  // 自检那套最小垫片没有 ResizeObserver，所以有就用、没有就靠那 300ms 的保质期兜住。
  let stageWatch = null
  if (typeof ResizeObserver === 'function') {
    stageWatch = new ResizeObserver(() => {
      stageHandle.liveBox = null
      stageHandle.liveKey = ''
      placeLive(stageHandle)
    })
    stageWatch.observe(stageHandle.svg)
  }
  // 角落那张小全图与「全图」按钮（用户 m19416 定的第四、第二条）：
  // 它们要绝对定位在地图上，所以得挂在 `.gf-stage` 上、跟 svg 做兄弟。
  stage.appendChild(stageHandle.mini)
  stage.appendChild(stageHandle.back)
  // 地图右上角那枚「始终显示」（用户 m11003 第 3 条要常驻按钮、m19425 第 1 条定它挂在这儿）：
  // 它得跟 svg 做兄弟、绝对定位在地图右上角，所以跟小全图、全图按钮一样挂在 `.gf-stage` 上。
  const pinBtn = el('button', 'gf-always')
  pinBtn.type = 'button'
  pinBtn.setAttribute('aria-pressed', 'false')
  pinBtn.setAttribute('title', '始终显示：这一页一直开着')
  pinBtn.setAttribute('aria-label', '始终显示')
  pinBtn.appendChild(pinSvg())
  stage.appendChild(pinBtn)

  // 第一次开门那一下，地图还没铺好：这行字先顶上（见 setOpen 里那段 afterPaint）。
  // 它是**文字**不是空框——「正在铺开」读起来像他正在把地图摊开，不像坏了。
  const stageNote = el('div', 'gf-stage-note', '正在铺开地图…')
  stageNote.hidden = true
  stage.appendChild(stageNote)

  // 状态块：一行说完「此刻 · 几点 · 他在哪儿」。
  // 原来这里是「时间 / 位置」两行标签加两行值（标签文案是 2026-10-03 定的）。
  // 2026-10-08 用户说整块界面「不够直观、简洁」——两个标签是多余的，值本身就是
  // 答案；「位置」又和地图上那枚记号旁边的地名重复了一次。现在只剩一个金色的
  // 「此刻」当锚点：它是这块板子上唯一还活着的数字（每分钟走一次）。
  const nowBox = el('div', 'gf-now')
  const valueTime = el('span', 'gf-v gf-v-time')
  const valuePlace = el('span', 'gf-v gf-v-place')
  nowBox.appendChild(el('span', 'gf-k gf-k-now', '此刻'))
  nowBox.appendChild(valueTime)
  nowBox.appendChild(el('span', 'gf-sep', '·'))
  nowBox.appendChild(valuePlace)

  // 故事风格：同一份记录、同一张地图、同一个世界，换的只是他那边的名词。
  //
  // 2026-10-05 用户裁决：入口放「门后」这一行里（点门打开的那扇窗）。放在这儿是因为
  // 「此刻 · 几点 · 他在哪儿」那一行的右边本来就是空的——**一行都没多占**，
  // 见闻录能看见的行数不变（那个窗口有 700px 上限，多一行就得从底下扣一行出来）。
  // 同一轮他还把这块的标题从「谁在讲」改成**故事风格**，并把第二套说法「案牍」摘掉了
  // （连内容一起收在 `.parked/ledger-voice/`）——「我们只需要一个作为默认即可了」。
  //
  // 2026-10-06 用户第 1、2 条（原话）：「切换的方式只能放在故事风格后面，也就是现在
  // 点击『冒险』这个地方进行切换」「切换的时候，不要改变其他内容，只改变叙事风格，
  // 也就是对应的他的冒险的下面的内容」。于是：
  //   ① 原先摆在地图下面那一格「故事包」书架撤掉了——**换说法整个界面只有这一个入口**
  //   ② 这一格只写**当前那一套**的名字（2026-10-06 晚些时候用户第 1 条原话：「故事风格
  //      并不是并行点击切换，而是只有一个冒险，然后点击冒险，会弹出来一个小界面，小界面
  //      往下就可以选择其他故事风格。」）——点这个名字才弹出下面那张清单
  // 名字从注册表里长出来：包里多一套说法，清单里自动多一项（将来卖「换个人讲」时，
  // 这一层不用改）。**只有一个的时候显示成一个不可点的名字**（没得选的就不摆假开关）。
  const voiceBox = el('div', 'gf-voice')
  voiceBox.setAttribute('role', 'group')
  voiceBox.setAttribute('aria-label', '故事风格')
  voiceBox.appendChild(el('span', 'gf-voice-k', '故事风格'))
  // 一个开关（写着当前那一套的名字）＋ 一张清单（其余几套）。两者都只建一次，
  // paintStyles 里重填——换过说法之后清单要跟着重算。
  const voiceBtn = el('button', 'gf-voice-b')
  voiceBtn.type = 'button'
  voiceBtn.hidden = true
  const styleMenu = el('div', 'gf-styles')
  styleMenu.hidden = true
  // 清单顶上那行小字（2026-10-06 傍晚用户说「单显示船家有点单调了，应该在前面加一个措辞，
  // 表示可以切换」；当天最晚他第 1 条把措辞定成「换一种风格」）：只建一次，
  // paintStyles 只管往它后面添条目。
  styleMenu.appendChild(el('div', 'gf-styles-head', '换一种风格'))
  // 名字与清单都挂在这一格里（清单绝对定位，就贴在名字下面）。
  voiceBox.appendChild(voiceBtn)
  voiceBox.appendChild(styleMenu)
  const styleItems = new Map()
  // 每一格的外壳（`.gf-style-cell`：名字 + 预留那一块）——重摆时连壳一起收掉，
  // 不然换过说法之后旧的那些块会留在清单里。
  const styleCells = []
  // 预留那几套摊开的那一块（`.gf-style-note`，默认收着，点一下才摊开）。
  const styleNotes = new Map()
  let voiceName = null

  /**
   * 能挑的说法：注册表里所有**讲得出话的**包（顺序＝注册表顺序），按说法去重；
   * 外加**预留的那几套**（`soon`，2026-10-06 晚用户第 3 条：「预留几个风格，
   * 为规则怪谈、宫斗心计、谍战潜伏」）——它们没有内容，所以列出来是**点不动**的，
   * 但名字得先摆上（清单里看得见，才谈得上将来写它）。
   *
   * 判据是 `listPacks()` 给的 `narrates`（＝那个包有没有动作句），**不是** `VOICES` 里
   * 有没有它——说法表是装载时按当时的注册表装的，注册表后来多一个包，`VOICES` 里还没有
   * 它；拿 `VOICES` 当判据的话，`refreshStyles()` 就得先偷偷装一遍才能把它摆出来。
   */
  function stylePacks() {
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

  /**
   * 清单开着没有。点名字开；再点一次、点别处、按 Esc、**鼠标移开一秒**都收
   * （用户 m05151 第 2 条：「除了你说的收起方式，还需要有鼠标移开1秒后自动关闭」）。
   */
  let menuOpen = false
  let menuLeaveTimer = null

  function setMenu(next) {
    if (menuLeaveTimer) { clearTimeout(menuLeaveTimer); menuLeaveTimer = null }
    if (next === menuOpen) return
    menuOpen = next
    styleMenu.hidden = !next
    voiceBtn.setAttribute('aria-expanded', String(next))
    // 清单收起来时，摊开的那一句也收起来——下次点开又是一列干净的名字。
    if (!next) foldNotes()
  }

  /**
   * 摊开／收起预留那一套的「它的核」（`.gf-style-note`）。**一次只摊一个**：摊开新的那个，
   * 别的都合上；再点同一个就合上；`id` 传 `null` 就是全合上（清单收起来时走这条）。
   * 点它不换说法——`switchVoice` 见到 `soon` 直接早退，这里也不碰 `voiceId`。
   */
  function toggleNote(id) {
    const note = id ? styleNotes.get(id) : null
    const openId = note && note.hidden ? id : null
    for (const [voice, each] of styleNotes) {
      const on = voice === openId
      each.hidden = !on
      const item = styleItems.get(voice)
      if (item) item.setAttribute('aria-expanded', String(on))
    }
  }
  const foldNotes = () => toggleNote(null)

  /** 把那一格按注册表重新摆一遍：开关上写当前那一套，清单里列其余几套。 */
  function paintStyles() {
    for (const item of styleItems.values()) item.remove()
    styleItems.clear()
    for (const cell of styleCells) cell.remove()
    styleCells.length = 0
    styleNotes.clear()
    if (voiceName) { voiceName.remove(); voiceName = null }
    const packs = stylePacks()
    const nameOf = (pack) => (VOICES[pack.voice] && VOICES[pack.voice].label) || pack.label || pack.voice
    const mine = packs.find((p) => p.voice === voiceId) || packs[0] || null
    voiceBox.hidden = packs.length === 0
    if (!mine) { voiceBtn.hidden = true; setMenu(false); paintVoice(); return }
    // 只有一套说法：一个不可点的名字（没得选的就不摆假开关）。
    if (packs.length < 2) {
      voiceBtn.hidden = true
      voiceName = el('span', 'gf-voice-name', nameOf(mine))
      voiceBox.appendChild(voiceName)
      setMenu(false)
      paintVoice()
      return
    }
    voiceBtn.hidden = false
    voiceBtn.textContent = nameOf(mine)
    voiceBtn.setAttribute('data-voice', mine.voice)
    voiceBtn.setAttribute('aria-expanded', String(menuOpen))
    if (mine.tagline) voiceBtn.setAttribute('title', mine.tagline)
    for (const pack of packs) {
      // **只列其他几套**（用户 m05151 第 1 条）：当前这一套已经在开关上写着，
      // 清单里再列一遍是白说。
      if (pack.voice === mine.voice) continue
      const item = el('button', 'gf-style-item', nameOf(pack))
      item.type = 'button'
      item.setAttribute('data-voice', pack.voice)
      // 预留的那几套（`soon`，2026-10-06 晚用户第 3 条）：名字先摆上、内容还没写。
      // 它跟「锁着」不是一回事——锁着是钱的事（授权完就能用），预留是**还没写**（给多少钱
      // 都用不了），所以 `unlocked` 在这里不理会。**点它不换说法，是摊开它那一句**
      // （用户 m06227 第 2 条：「我希望点击了再显示描述，而不是全体展示在这里，有点密集了就」）。
      // 悬停浮出的那句话跟挑得动的项一样（用户 m06529 第 1 条：「现在这三个的风格，也要用
      // 奇幻冒险悬停时浮出的那个白框」）——挂的是**它自己那一句**，不再是「还没写好」。
      if (pack.soon) {
        item.classList.add('gf-style-soon')
        item.setAttribute('aria-expanded', 'false')
        if (pack.tagline) item.setAttribute('title', pack.tagline)
        item.addEventListener('click', () => toggleNote(pack.voice))
      } else if (!isUnlocked(pack.id, unlocked)) {
        // 没解锁的照样列出来，只是点不动——看得见才谈得上想不想要（收款不归这个插件管，
        // 授权校验完之后把 id 放进 createGameflow 的 unlocked 里，它自己就亮了）。
        item.setAttribute('aria-disabled', 'true')
        item.setAttribute('title', `${pack.name}还没解锁`)
      } else {
        if (pack.tagline) item.setAttribute('title', pack.tagline)
        // 每一项自己挂自己的事：不用事件委托（`closest`/`dataset` 这些在自检的垫片
        // 里不一定有，挂在自己身上两条路都走得通）。
        item.addEventListener('click', () => switchVoice(pack.voice))
      }
      // 预留的那几套除了名字还要一句「它是什么」——那一句**默认收着**，点名字才摊开
      // （一次只摊一个，清单收起时一起收起）。用户 m06529 第 2 条「去掉所有的还没写好」：
      // 这块里现在**只有**那一句，没有别的交代了（点它不换说法这件事，由名字的淡与
      // 摊开读满色这两档自己说明）。
      const cell = el('div', 'gf-style-cell')
      cell.appendChild(item)
      if (pack.soon && pack.tagline) {
        const note = el('div', 'gf-style-note')
        note.appendChild(el('div', 'gf-style-core', pack.tagline))
        note.hidden = true
        cell.appendChild(note)
        styleNotes.set(pack.voice, note)
      }
      styleItems.set(pack.voice, item)
      styleCells.push(cell)
      styleMenu.appendChild(cell)
    }
    if (!styleItems.size) setMenu(false)
    paintVoice()
  }
  nowBox.appendChild(voiceBox)
  // 点名字开合清单。移开一秒自动收那件事挂在这一格上（见下面 pointerleave）。
  voiceBtn.addEventListener('click', () => setMenu(!menuOpen))
  /* 鼠标从名字上移开一秒就把清单收起来（用户 m05151 第 2 条）。**从名字挪进清单里不算离开**
     （清单也在 voiceBox 里，pointerenter 会把那个计时取消），否则你想往上挑一项，
     清单正好在你手底下收掉。触摸屏上 pointerenter 紧挨着 click 触发，直接不管。 */
  voiceBox.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return
    if (menuLeaveTimer) { clearTimeout(menuLeaveTimer); menuLeaveTimer = null }
  })
  voiceBox.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return
    if (!menuOpen) return
    if (menuLeaveTimer) clearTimeout(menuLeaveTimer)
    menuLeaveTimer = setTimeout(() => {
      menuLeaveTimer = null
      setMenu(false)
    }, 1000)
  })

  /** 现在讲的是哪一套：开关按着，清单里那些不按（清单开合不影响这两个状态）。 */
  function paintVoice() {
    voiceBtn.setAttribute('aria-pressed', voiceBtn.hidden ? 'false' : 'true')
    for (const item of styleItems.values()) item.setAttribute('aria-pressed', 'false')
  }

  /**
   * 换一套说法。**只换他那边的词**（用户 2026-10-06 第 2 条：「切换的时候，不要改变
   * 其他内容，只改变叙事风格，也就是对应的他的冒险的下面的内容」）。
   *
   * 怎么保证「别的都不动」——这里只做三件事：
   *   ① `applyPack` 重填**说法那几组**：句子、场景、拼句池、熟人、道具、生活句、规矩。
   *      解构列表里**没有**地理四件套（`PLACES` / `VIEW` / `MAP_SVG` / `MAP_CSS`）、
   *      没有 `WORLD_THEME` / `WORLD_ID` / `WORLD_LABEL`——所以地图不重画、地名不换、
   *      配色不变、记号不动、位置也不动。**这份解构列表就是那条约束的写法**：
   *      想「顺手多换一样」得先在这儿加一个名字，加之前必然看一眼这句话。
   *   ② 这一格重摆一遍（开关上换成新那套的名字，清单里换成其余几套），**清单自己收起来**
   *   ③ `refresh()` 用新说法把见闻录重讲一遍
   *
   * 挑过的说法会记下来（`store`，默认 `localStorage`），下次打开还是它——`remember: false`
   * 用在启动时那次回填上（那一次本来就是照记着的 id 装的，不必再写一遍），`reload: false`
   * 用在启动时（紧接着 `mount()` 自己会刷）。
   */
  function switchVoice(id, { remember = true, reload = true } = {}) {
    const pack = listPacks().find((p) => p.narrates && p.voice === id)
    // 认不认这套说法，看的是**注册表里有没有它**（`applyPack` 马上会把它的说法表装进来），
    // 不是 `VOICES` 里有没有——所以刚注册的包也能立刻点得动。
    if (!pack || id === voiceId) return
    // 预留的那几套（`soon`）没有内容，给多少钱都换不过去——`unlocked` 在这条路上不理会。
    if (pack.soon) return
    if (!isUnlocked(pack.id, unlocked)) return
    const content = applyPack({}, WORLD_ID, id)
    ;({
      SCENES, SHARDS, VOICES, WORLD_LINES, WORLD_QUIET, SHARED_LINES, HOME_LINES,
      CAST, CAST_LINES, PROP_WORDS, LIFE_POOLS, ACTION_PLACE, OUT_KEYS, RULES, MOMENTS, DAY_FRAME,
      CLASHES, ORIGIN, DIRECTIONS, FATES, MARKS, FIGHTS, JOURNEY, FORKS,
    } = content)
    voiceId = content.VOICE
    paintStyles()
    setMenu(false)
    if (remember) rememberStyle(store, id)
    if (reload) refresh()
  }

  paintStyles()

  const colsHead = el('div', 'gf-cols-head')
  colsHead.appendChild(el('span', 'gf-col-you', '你的日常'))
  colsHead.appendChild(el('span', 'gf-col-him', '他的冒险'))
  colsHead.hidden = true
  const timeline = el('div', 'gf-timeline')
  /* 界面审计 U4：记录多的时候这一栏要自己滚，可它只是一个 div（没有 tabindex）——
     键盘用户推到面板里，焦点从上面那张地图直接跳到下面那些按钮，**永远滚不动这一栏**。
     给它一个落脚点、说清它是什么；浏览器对带 tabindex 的滚动容器本来就认方向键/翻页键。 */
  timeline.setAttribute('tabindex', '0')
  timeline.setAttribute('role', 'region')
  timeline.setAttribute('aria-label', '今天记下的那些事（可以滚动）')

  room.appendChild(stage)
  room.appendChild(nowBox)
  room.appendChild(colsHead)
  room.appendChild(timeline)
  root.appendChild(doorWrap)
  root.appendChild(room)

  // 上次挑过的说法还在，就还用它（装载块只装了默认那一套）。
  // 记着的那套说法要是已经不在注册表里、或者已经上了锁，`switchVoice` 自己会放过去——
  // 那就照旧用默认那一套，**也不去动记着的那一行**（那个包以后解锁了还认得回来）。
  // 刷新留给紧接着的 `mount()`（所以这里 `reload: false`）。
  const keptStyle = keptStyleId(store)
  if (keptStyle && keptStyle !== voiceId) switchVoice(keptStyle, { remember: false, reload: false })
  shadow.appendChild(style)
  shadow.appendChild(root)

  /**
   * DSH 用 `body[data-ds-dark-theme]` 表示深色。shadow DOM 里选不到 body，
   * 所以这里把「现在是深色吗」读成一个布尔，用来挑色板。
   *
   * 界面审计 U11：从前只认那个属性，宿主哪天改成跟着系统走、不再写属性，面板就永远
   * 停在亮色（用户开着系统深色，面板白得刺眼）。现在是三道闸，**宿主说什么最优先**：
   *   ① 有 `data-ds-dark-theme` → 深色（这是宿主的明话，永远算数）；
   *   ② 没有的话，看宿主自己的底色（`<html>` 的 background-color），暗的算深色——
   *      「宿主没表态」多半就是「跟着系统走」，而系统深色时页底通常已经是暗的；
   *   ③ 还读不出来，才问 `prefers-color-scheme`。
   * 这样「亮色宿主 + 深色系统」不会被我们自作主张染黑（②会把它判成亮），
   * 而「宿主不表态 + 系统深色」终于也能暗下来。
   */
  function isDark() {
    const body = document.body
    if (body) {
      const on = typeof body.hasAttribute === 'function'
        ? body.hasAttribute('data-ds-dark-theme')
        : 'data-ds-dark-theme' in (body.attributes || {})
      if (on) return true
    }
    // ② 宿主自己的底色（读不到就是 null，不猜）
    const hostDark = hostBackgroundDark()
    if (hostDark !== null) return hostDark
    // ③ 系统偏好
    try {
      const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
      if (mq) return mq.matches === true
    } catch (e) {
      // 垫片里没有 matchMedia，当作亮色
    }
    return false
  }

  /** `<html>` 的底色是不是暗的。读不出来（垫片、透明）返回 null——「不知道」，别瞎猜。 */
  function hostBackgroundDark() {
    try {
      if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null
      const el = document.documentElement
      if (!el) return null
      const raw = String(getComputedStyle(el).backgroundColor || '')
      const hit = raw.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i)
      if (!hit) return null
      // 透明 = 这层没画底色，读不出「宿主的暗」
      if (hit[4] != null && Number(hit[4]) < 0.5) return null
      // 按人眼权重算亮度（0 黑 255 白）
      const lum = 0.2126 * Number(hit[1]) + 0.7152 * Number(hit[2]) + 0.0722 * Number(hit[3])
      return lum < 128
    } catch (e) {
      return null
    }
  }

  function applyTheme() {
    const t = THEMES[themeId]
    // 先铺基础色板（这一遍总会跑，所以从深色切回亮色时会被它覆盖回去）
    for (const [k, v] of Object.entries(t.tokens)) root.style.setProperty(k, v)
    // 深色覆盖层叠在后面。没写 tokensDark 的主题就自然还是原样（古籍图书馆本来就是暗的）。
    // 注意别对同名的属性做 removeProperty——那会把刚铺好的基础色一起抹掉。
    if (isDark()) {
      for (const [k, v] of Object.entries(t.tokensDark || {})) root.style.setProperty(k, v)
    }
    root.setAttribute('data-theme', themeId)
    // 色板会把 --gf-dusk / --gf-glow 重置回 0，所以必须重新按现在几点盖上去
    applyDaylight(now())
  }

  /** 几点决定屋子里的光。跟 DSH 的亮暗色是两回事，两个都要叠。 */
  function applyDaylight(stamp) {
    const { dusk, glow } = daylight(new Date(stamp).getHours())
    root.style.setProperty('--gf-dusk', String(dusk))
    root.style.setProperty('--gf-glow', String(glow))
    // 从「主题本来的颜色」算，不从当前样式算——不然每刷一次就更暗一点
    const t = THEMES[themeId]
    const base = { ...t.tokens, ...(isDark() ? t.tokensDark || {} : {}) }
    for (const [k, v] of Object.entries(dimForDusk(base, dusk))) root.style.setProperty(k, v)
  }

  /**
   * 换一套皮（换主题 / 系统亮暗变了）：重铺色板，再重画一遍。
   * 这一趟**不浮字**（界面审计 U6，见 typeInto 里的 quietType）——
   * 只是颜色变了，那句话不该从头再演一遍。
   */
  function retheme() {
    applyTheme()
    quietType = true
    const done = refresh()
    const off = () => { quietType = false }
    Promise.resolve(done).then(off, off)
    return done
  }

  /**
   * 把「他此刻在干什么」那句话一个字一个字浮出来。
   *
   * 一个字一个 span，靠 CSS 的 animation-delay 错开——不是真的打字，
   * 字一放进去就都在 DOM 里，只是先透明再上浮。所以：读屏软件读到的是完整
   * 一句话，关掉动画（prefers-reduced-motion）也不会丢字，测试断言 textContent
   * 拿到的还是原文。整句最多花 0.9 秒，长句子不会拖成打字机。
   *
   * 2026-10-05：这一句不再单独占地图下面那一行，它落在见闻录最新一行的右栏里
   * （`renderTimeline` 把那个节点交回来），所以「就是现在」那行和被顶替掉的那句
   * 不再是两处重复，只有一处。
   *
   * 界面审计 U6：换主题 / 系统深色变了一下，整块面板会重排，这一行的节点是新的
   * （空的）⇒ 同一句话又从第一个字开始浮 2.7 秒，用户只是换了套颜色，画面却像重新
   * 讲了一遍。所以给「换皮」这一类刷新一个开关（`quietType`）：这一类重画只把字落进去，
   * 不浮。**推开门那一次不算**——那时候他是刚坐下，浮一遍正是要的效果。
   */
  let quietType = false
  function typeInto(node, text) {
    if (!node || typeof text !== 'string') return
    // 面板开着的时候每五分钟会重排一次，句子里只要还是这句话就别重放动画——
    // 那句话每分钟原地重浮一次，比停住更让人分心。
    if (node.textContent === text) return
    // 换皮引起的重画：字照落，不浮（见上面 U6 那段）
    if (quietType) { node.textContent = text; return }
    node.textContent = ''
    Array.from(text).forEach((ch, i) => {
      const span = el('span', 'gf-type')
      // 空格在 inline-block 里会被折叠成零宽，换成不换行空格
      span.textContent = ch === ' ' ? '\u00a0' : ch
      span.style.animationDelay = `${Math.min(i * 24, 900)}ms`
      node.appendChild(span)
    })
  }

  /**
   * 门上那枚提醒记号（用户 m11003 第 2 条：「如果用户不选，那么会自动随机选一个，
   * 但是我们要给用户选择的提醒，那么就是现在门上给一个提醒的符号」）。
   *
   * 数的是**屏幕上还摆着几条没挑的岔口**：有就亮一枚惊叹号小圆牌、门缝里的光也一直亮着。
   * 关着门也看得见——不然得先推开门才知道里面有没有事。
   *
   * 2026-10-31（用户 m04298 第 2 条）把语义钉死在这里：
   *
   *   **亮 = 有一处命运正等你决定，且见闻录为此停住。** 三件事同生同死——
   *   记号亮着、屏幕上真摆着一对可点的选项、见闻录不再往下铺新行。
   *
   * 所以这个数**只能有一个来源**：`renderTimeline` 真把 `.gf-choice-live` 建出来之后
   * 数出来的那个 `pending`（见它的返回处）。本函数不再算、也不许别处再算一遍——
   * 从前 `refreshBadge` 自己走一趟折叠梯子，闸门与画面对不上，就出现过
   * 「门上有感叹号，推开门却没有选项」与「记号亮着，可那一挑早跑完了。」（同一条反馈）。
   *
   * `canSave` 是同一道闸（用户 m11602 第 1 条：「这个标记没有作用」）：面板记不住的时候
   * （预览页、自检里没给 storage）**一个记号都不亮**——那时候面板里根本不摆选项，亮了就是骗人。
   * 面板收着走钟那一支也走这里（见 refreshBadge），两条路同一个数、同一个闸。
   */
  function paintDoorBadge(n) {
    const count = Math.max(0, Math.round(Number(n) || 0))
    const on = count > 0 && picks.canSave
    doorBadge.hidden = !on
    door.classList.toggle('gf-door-has-choice', on)
    doorBadge.setAttribute('aria-label', count > 1 ? `门后有 ${count} 件事等你定` : '门后有一件事等你定')
    // 悬停那一行说清楚有几处（原生 title，跟「故事风格」那一格同一个做法）。
    // 2026-10-10（用户 m14810 第 5 条）：改口叫「命运」，而且它现在是**挡住往下讲**的东西。
    door.setAttribute('title', on ? (count === 1 ? '门后有一处命运' : `门后还有 ${count} 处命运`) : '推开门看看')
    if (!on) doorBadge.classList.remove('gf-badge-seen')
    refreshBadgeSeen()
  }

  /**
   * 那一行是不是就在眼前：面板开着，而且它真在滚动框里。
   *
   * 提醒只在「你还没看见」的时候最亮（用户 m11602 那一轮选的），所以这里量一下；
   * 量不到（自检的垫片没有排版引擎，`getBoundingClientRect` 全是 0）就当没看见——
   * 记号照旧亮着，不会因为量不出来就灭。
   */
  function refreshBadgeSeen() {
    const row = openForkEl || openRowEl
    let seen = false
    if (isOpen && row && typeof row.getBoundingClientRect === 'function'
      && typeof timeline.getBoundingClientRect === 'function') {
      const a = row.getBoundingClientRect()
      const b = timeline.getBoundingClientRect()
      seen = a.bottom > b.top && a.top < b.bottom
    }
    doorBadge.classList.toggle('gf-badge-seen', seen)
  }

  /**
   * 点那枚惊叹号：推开面板、落到那一行、让它亮一下——记号得**有作用**（用户 m11602 第 1 条）。
   * 关掉动画的时候不亮，直接到位（见 prefers-reduced-motion 那一段）。
   */
  function jumpToOpenFork() {
    const row = openRowEl
    if (!row) return
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!calm) {
      row.classList.add('gf-fork-flash')
      window.setTimeout(() => row.classList.remove('gf-fork-flash'), 1500)
    }
    // 用户 m12444 第 2 条：「点击感叹号，并不能定位到这篇描述开始或者显露出2个选项的位置，
    // 即是无法完全看到2个选项，我需要在点击感叹号后，让页面显示到2个选项中心。」
    // 所以这里落的是**那一对选项**本身（`.gf-choice-live`），不是整行：`block: 'center'` 是相对
    // 最近的滚动容器（`.gf-timeline`）把它摆到正中——两枚都在正中那一带，一眼看得全。
    // 量不到它（旧版本、量不出排版的自检垫片）就退回整行，行为跟以前一样。
    const target = openForkEl || row
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    }
    refreshBadgeSeen()
  }

  /**
   * 面板打开之后把焦点挪进去：有选项就落在最上面那颗（那一对按钮才是这一会儿要你做的事），
   * 没有就落在面板本身（`room` 上给了 `tabindex="-1"`）。键盘用户推开门才有落脚点。
   *
   * 2026-10-31（用户：「我还没把鼠标放上去，为什么第一个选择会有一个明显的边框？」）：
   * 焦点是**鼠标推门时也挪了**，而 Chromium 只要上一次交互是键盘，就会把这种
   * 程序化焦点也算成 `:focus-visible`——于是第一颗按钮自己套了一圈框，看着像已经选中了。
   * 现在只在**上一次操作是键盘**时才挪焦点：鼠标点开的门，焦点留在原地，那颗框就不会凭空出现。
   */
  function focusInto() {
    if (!inputWasKeyboard) return
    const first = openForkEl && typeof openForkEl.querySelector === 'function'
      ? openForkEl.querySelector('.gf-choice-pick')
      : null
    if (first && typeof first.focus === 'function') {
      first.focus()
      return
    }
    if (typeof room.focus === 'function') room.focus()
  }

  /** 上一次操作是键盘还是指针（只用来决定「开门要不要把焦点挪进去」，见上面的 focusInto）。 */
  let inputWasKeyboard = false

  /**
   * 面板收着的时候重算门上那枚记号——**它不自己算，它照见闻录那台机器真画一遍、读它的数**。
   *
   * 用户 m04298 第 2 条把这件事定成一条规矩：
   * 「当有感叹号的时候，意味着有一个命运选择的时候需要用户来做出，界面会一直停在这个地方
   * 等待用户做出选择，否则不会有新的落盘。」——所以：
   *
   *   **记号亮着 ⇔ 屏幕上真摆着一对可点的选项，且见闻录为此停住。**
   *
   * 从前这里自己走一趟 `rowUnits` → `forksFor` 再数 `today.live`，那是**第二份判定**。
   * 两份判定的闸门不一样（这里不认「今天按过开始冒险没有」，也不认幕布），于是出现过
   * 「门上有感叹号，推开门却一个选项都没有」（用户 m04298 报的正是它）。现在只留一处：
   * `renderTimeline` 把「真画出几对 `.gf-choice-live`」当唯一事实交回来（`pending`），
   * 这里照着它画——画在离屏的一份容器里，要的只是那个数。
   *
   * 面板开着的时候连这一遍都省了：`refresh` 画完就把数记在 `drawnPending` 里，读它即可。
   * 两处读的是同一个数，所以「门收着」与「推开门」不会各说各的。
   */
  async function refreshBadge() {
    if (!mounted) return
    // 面板开着：记号只认上一次**真画出来**的那一份（屏幕上的按钮就是那个数）。
    if (isOpen) {
      paintDoorBadge(drawnPending)
      refreshBadgeSeen()
      return
    }
    let next = null
    try {
      next = loadRecords()
      if (next && typeof next.then === 'function') next = await next
    } catch {
      next = null
    }
    // 同 refresh()：读不到就保留上一份，别把门上那枚记号闪没（报告 B-08）。
    if (next !== null) {
      const store = readStore(next)
      // 顺手把 `entries` 与那几个标量换新：下一次 `refresh()` 之前，手上不该是一份更旧的记录。
      // 这里必须跟 `refresh` 记下同样的几样（`ledger` / `started` / `onStart`）：少一样，
      // 画出来的那一遍就跟真画面不是同一份（幕布尤其要看 `onStart`）。
      archive = {
        since: store.since,
        seam: store.seam,
        dayStart: store.dayStart,
        // 宿主给的整份存档带着 `version`（见 refresh 里同一处判断）：那时「开过场」只认 `dayStart`。
        dayStartKnown: Boolean(next && !Array.isArray(next) && 'version' in next),
        ledger: readLedger(store),
        started: startedOn(),
        onStart: pressStart,
      }
      entries = store.records
    }
    const real = now()
    const stamp = landedNow(real)
    // 岔口挑过的那几条先读出来：手里那份 `picks.map` 要是旧的，「已经挑过」就会算成
    // 「还没挑」——记号亮着，可那一挑早跑完了（用户 m04298 第 2 条后半句）。不依赖时序。
    picks.reload()
    const narration = narrationFor(entries, stamp, voiceId)
    // 离屏画一遍：要的是它的 `pending`（屏幕上真摆出来的那几对选项），不是版面。
    // 用 `renderTimeline` 同一台机器，所以这一遍算出来的东西就跟推开门看到的一模一样。
    const probe = document.createElement('div')
    const shown = renderTimeline(probe, entries, stamp, voiceId, narration, picks, archive, null, null, forkPin)
    openRowEl = shown.openRow || null
    openForkEl = shown.openFork || null
    drawnPending = shown.pending || 0
    paintDoorBadge(drawnPending)
  }

  async function refresh() {
    // 两个时刻分清楚（用户 2026-10-07 晚：「红框的时间是需要实时显示的。蓝框的时间是
    // 需要按 5 分钟计数并每 5 分钟落定一次的。」）：
    //   real  —— 表头那个「时间」，此刻的真实钟点，实时；
    //   stamp —— 见闻录里的时刻，落在整五分钟上（见 landedStamp）。
    const real = now()
    const stamp = landedNow(real)
    applyDaylight(real)
    let next = null
    try {
      next = loadRecords()
      // 同步返回就地渲染，不要白白闪一下空状态
      if (next && typeof next.then === 'function') next = await next
    } catch {
      // 读不到就当没有——陪伴类插件不该因为自己坏了而打扰用户。
      next = null
    }
    const fresh = next === null ? null : readStore(next)
    // 读不到（`loadRecords` 交回 null，见 fetchStore）时**别当成空存档**：一瞬间的网络抖动
    // 会把见闻录擦成「他还没走过多远。」，下一次刷新又长回来——闪一下白屏（报告 B-08）。
    // 保留上一份，画还是照画（钟点、地图、此刻那句都跟着走）。
    const store = fresh || {
      records: entries,
      since: archive?.since || 0,
      seam: archive?.seam || null,
      dayStart: archive?.dayStart || 0,
    }
    // 宿主给的整份存档（GET /records）带着 `version`；夹具 / 老写法给的数组或手写对象没有。
    // 两种「按过没有」要分开：**宿主在场时只认 `dayStart`**——本地那枚标记是 8 时代的旧账，
    // 它记的只是「按下过这颗按钮」，不是「这一天的起点」。升级当天尤其要紧：本地标记是今天、
    // 存档里却没有 `dayStart`，那时若认旧账，他打开就又看见按下之前的那些行（用户 m04200）。
    const fromHost = Boolean(fresh && next && !Array.isArray(next) && 'version' in next)
    archive = {
      since: store.since,
      seam: store.seam,
      // 8 → 9：按下「开始冒险」那一刻（见 renderTimeline 的 clipToStart）。
      dayStart: store.dayStart,
      dayStartKnown: fromHost,
      // 册子上的进度（用户 m16552）：序曲**只在第一天讲**——「第一天」认的就是这个。
      // 按过指印、死过，都算这本书已经开过头了（见 LEDGER_STORE_KEY）。
      ledger: readLedger(store),
      // 开场那一下要的两件事（见 paintStart）：上次按过哪一天，和「按了」怎么做。
      started: startedOn(),
      onStart: pressStart,
    }
    entries = store.records
    const narration = narrationFor(entries, stamp, voiceId)
    // 面板开着的时候每五分钟会自己重排一次（见 tickClock）。重排别把用户滚到的地方弹回顶上。
    const keepScroll = Number(timeline.scrollTop) || 0
    // 岔口挑过的那几条先读出来（挑完 `repaint()` 会再走一遍这里，所以是每一次重画都读）。
    picks.reload()
    // **先画见闻录，再画地图**：见闻录算得出「命运压下来那一刻」（`shown.freeze`，见 `pendingPin`），
    // 那一刻之后一个字都不铺——他在地图上也就该停在那一刻的位置，两处不能各说各的
    // （用户 m17334：「中间所有的内容，都暂停」）。所以顺序从这一版起调过来了。
    //
    // 用户 m17334 逐字：「如果15:00发生了命运选择，那么发展就停在这个地方，不会出任何新的落盘，
    // 直到用户给出选择。如果用户在16:59才进行选择，那么新的落盘就是17:00，中间所有的内容，都暂停。」
    //
    // 所以第一遍只是**问一句**：这一件命运压在几点上？真压下来了（那一刻比现在早）就照那一刻
    // 重画第二遍——**那一刻之后的记录一概不进这一遍**：梯子不长、日卷那一行的账不涨、
    // 「此刻」那一行的钟点也不走（见 `nowWhen`），连地图上那个记号都停在那一刻。
    // 定下来之后下一遍就没有 `freeze` 了，照「现在」重画，中间那一段已经并进日卷那一行——不补格。
    //
    // 两处要留神：
    //   · **第二遍连「现在」也要挪到那一刻**（`now = frozenAt`）：那一刻的梯子才长得对——
    //     「最近半小时是格、更早收成日卷」，停点才落在**一格**上（用户 m12444 第 1 条：折叠
    //     落盘那一卷上不摆任何选项）。第一版挪过一次、撞了四条红：那时停点会落到这一天
    //     **第一段**上，那一刻的梯子上连日卷都还没有（`forksFor` 只认日卷）⇒ 按钮全没了。
    //     2026-10-18 起钉的是**屏幕上最新那一行**（`pendingPin`，用户 m18547 第 1 条：命运必须
    //     是当下这个时间点的），它一定晚于这一天第一段半小时，日卷一定在，这条才立得住。
    //   · 边界取 `<=`：**把命运顶起来的那一张卡自己要留着**（起手就在那一刻上的卡也留着），
    //     不然这一遍算出来这一件命运根本还没成立。
    let shown = renderTimeline(timeline, entries, stamp, voiceId, narration, picks, archive, null, null, forkPin)
    const frozenAt = shown.freeze !== null && Number(shown.freeze) < Number(stamp)
      ? Number(shown.freeze) : null
    // 「此刻」那一句、地图上那个记号、左上角那个地名，都跟着同一条线走。
    let live = narration
    if (frozenAt !== null) {
      // 裁到那一刻的**记录**：一条记录只要有一格落在那一刻之前（`ticks` 里那一下，或者它起手
      // 就在那一刻之前），它就还在。**只按 `startedAt` 裁是不够的**：宿主的记录里「起手」与
      // 「第一格」能差上几分钟（实测一条 18:04:15 起手、第一格却在 18:00），只按起手裁，会把
      // **顶起这一件命运的那一条**裁掉——第二遍就算不出它，屏幕上冻着、一颗按钮都没有，可门
      // 上的记号还亮着（用户 m18204 逮到的就是这个）。
      const cut = entries.filter((entry) => Number(entry?.startedAt) <= frozenAt
        || (Array.isArray(entry?.ticks) && entry.ticks.some((t) => Number((t && t.at) || t) <= frozenAt)))
      const liveCut = narrationFor(cut, frozenAt, voiceId) || narration
      // 第九个参数是**当下那一份**（`{ entries, now }`）：停住那一刻之后你干的活照旧一行一行
      // 往下铺（用户 m18735「左侧是用户的"你的日常"不能停」）——那几行只建左栏，见 `rowFor`
      // 的 `muted` 与 `renderTimeline` 的 `tail`。冻住那一遍仍照 `cut` 与 `frozenAt` 算。
      const second = renderTimeline(timeline, cut, frozenAt, voiceId, liveCut, picks, archive, frozenAt, { entries, now: stamp }, forkPin)
      if (second.freeze !== null) {
        shown = second
        live = liveCut
      } else {
        // 第二遍要是**还是把这一件算丢了**（`freeze` 空了）：照第一遍**重画一遍**。
        // 光把 `shown` 换回去是不够的——第二遍已经把 DOM 擦掉重画过了，屏幕上摆的是它的画
        // （用户 m18204 那一张就是这个：面板冻着、没有按钮、记号却亮着）。
        shown = renderTimeline(timeline, entries, stamp, voiceId, narration, picks, archive, null, null, forkPin)
        live = narration
      }
    }
    // 上一次画在哪儿：位置变了就走过去，不刷地跳过去（见 renderStage 的 fromPlace）。
    // 第五个参数是「要不要顺手预建他那一扇地方图」——面板收着的时候不建（见 renderStage 与 zoomWarm）。
    renderStage(stageHandle, live, voiceId, drawnPlace, isOpen)
    // 跟着 `renderStage` 的兜底走：位置认不出来时它把记号钉在 `home`，
    // 这里也要记 `home`，否则下一次重画会以为「上一次没地方」而直接跳过去。
    drawnPlace = live.place || 'home'
    // 标签式的两行：先把「现在几点」写死，再报他在哪儿。
    // 位置认不出来的时候跟记号走同一套兜底（退回落脚处），**不再写「地图外面」**——
    // 用户 2026-10-08：「角色必须一直显示在地图上。」那一行写「地图外面」而记号还在图上，
    // 就是两处自己打自己。
    valueTime.textContent = clockText(real)
    valuePlace.textContent = placeName(live.place || 'home', voiceId) || '地图外面'
    openRowEl = shown.openRow || null
    openForkEl = shown.openFork || null
    // 屏幕上摆着几条没挑的岔口——门框上那枚记号跟着它亮（见 paintDoorBadge）。
    // 记下来的这个数就是**「按钮在不在」本身**（见 renderTimeline 返回处）：门收着的时候
    // 那一支（refreshBadge）读的也是它，不再自己走一遍折叠梯子（用户 m04298）。
    drawnPending = shown.pending || 0
    paintDoorBadge(drawnPending)
    // 他此刻那句话写在见闻录最新一行的右栏里，落进去之后再让它一个字一个字浮出来。
    typeInto(shown.remark, live.line)
    // 记住「此刻」那一行的抬头，好让 tickClock 每分钟把它改成现在几点。
    // **停在那一刻的时候不记**：那一行的抬头写的就是那一刻，不该跟着钟往后走（用户 m17334）。
    nowWhen = frozenAt === null ? shown.when : null
    if (keepScroll > 0) timeline.scrollTop = keepScroll
    // 两栏的抬头只在真有行的时候摆；今天还没按过「开始冒险」（幕布）时也不摆（见 renderTimeline）。
    colsHead.hidden = entries.length === 0 || shown.curtain === true
    syncGutter()
    scheduleMeasure()
  }

  /* 见闻录那个滚动容器到底给滚动条留了多宽——写进 CSS 变量 --gf-sb，
     地图、状态块、表头用它跟见闻录的字对齐（见 .gf-stage 上的说明）。
     为什么非得用 JS 量：同一份 CSS，预览页留 6px、真的 DSH 面板留 15px
     （2026-10-05 真面板实测：见闻录内容宽 499，padding box 514），
     写死哪一边另一边就错。 */
  function syncGutter() {
    // 面板收起来时它整个不排版，量出来是 0——那不是在说「滚动条不占位」，
    // 是在说「量不到」。别拿这个 0 去覆盖上次量对的值。
    if (room.hidden) return
    const sb = Math.max(0, Math.round((timeline.offsetWidth || 0) - (timeline.clientWidth || 0)))
    if (!Number.isFinite(sb)) return
    root.style.setProperty('--gf-sb', `${sb}px`)
  }

  /* ------------------------------------------------------------------ *
   * 跟着钟走
   *
   * 用户 2026-10-07 第 1 条：「时间落地还是没做对，现在已经 17:00 了，上面的时间
   * 还停在 16:38，我们不是说好 5 分钟一落地吗？」——说得对。宿主确实每五分钟把进度
   * 写进 records.json（见 src/index.js 的 PERSIST_INTERVAL_MS），可面板只在**打开
   * 那一刻**读了一次，开着不动它就一直是打开那一刻的样子。现在两件事分开：
   *
   *   · 每分钟：把「时间」和「此刻」那一行的抬头改成现在几点。只改字，不重排——
   *     不然那句逐字浮现的话每分钟重浮一次，比停住更分心。
   *   · 每五分钟：跟宿主同一班，重新读一次记录。左栏的次数、他那边的话、
   *     地图上的记号都跟着更新（重排时保住滚动位置，见 refresh）。
   *
   * 面板收起来也还走——**只走上面第三条**（2026-10-08 晚用户 m11003 第 2 条要的那枚
   * 门上提醒记号得自己亮，所以那一条不能等人推开门）：收着的时候每分钟什么也不做，
   * 跨过整五分钟才重读一次记录、重画一次记号，版面一动不动。
   * ------------------------------------------------------------------ */
  let clockTimer = 0
  let clockSlot = 0
  let clockHour = -1

  /* 「现在」在见闻录里显示成最近一个整五分钟：12:00 → 12:05 → 12:10，中间那几分钟
     不抖出来。用户 2026-10-07 晚第 2 条：「应该是每5分钟一落」（见 landedStamp）。
     宿主也是整五分钟把进度写进 records.json（src/index.js 的 PERSIST_INTERVAL_MS），
     所以「此刻」那一行的右端写的正是他真正落定的那一刻。
     **表头那个「时间」不用它**——那是此刻的真实钟点，要实时。 */
  function landedNow(stamp = now()) {
    return Math.floor(stamp / landEveryMs) * landEveryMs
  }

  function stopClock() {
    if (!clockTimer) return
    window.clearTimeout(clockTimer)
    clockTimer = 0
  }

  /** 睡到下一个整分钟，最多不超过一个节拍。至少 1 秒——自检里 `now` 是钉死的，别排成死循环。 */
  function msToNextMinute(stamp) {
    const rest = 60000 - (((stamp % 60000) + 60000) % 60000)
    return Math.min(Math.max(rest, 1000), clockTickMs)
  }

  function scheduleClock() {
    stopClock()
    // 收着的时候也走（用户 m11003 第 2 条要的那枚门上记号得自己亮起来）：
    // 那一支只重读记录、重画记号，不做版面重排（见 tickClock）。
    clockTimer = window.setTimeout(tickClock, msToNextMinute(now()))
  }

  function tickClock() {
    clockTimer = 0
    const real = now()
    // 屋里的光按钟点走。整点才重算一次颜色，不必每分钟重铺一遍色板。
    const hour = new Date(real).getHours()
    if (hour !== clockHour) {
      clockHour = hour
      applyDaylight(real)
    }
    // 面板收着（或者正在收的那 320ms 里）：只把门上那枚记号算一遍，不动版面。
    // 跨过整五分钟才算一次——记录本来就是那时候才变的（宿主同一班写进去）。
    if (!isOpen || room.hidden) {
      const slot = Math.floor(real / landEveryMs)
      if (slot !== clockSlot) {
        clockSlot = slot
        void refreshBadge()
      }
      scheduleClock()
      return
    }
    // 表头那个「时间」是此刻的真实钟点，每分钟走（用户 2026-10-07 晚：「红框的时间是
    // 需要实时显示的」）；见闻录里的时刻落在整五分钟上，跨过整五分钟才动。
    const landed = landedNow(real)
    valueTime.textContent = clockText(real)
    if (nowWhen && nowWhen.el) nowWhen.el.textContent = nowWhen.text(landed)
    // 跟宿主同一班：跨过整五分钟就重新读一次记录（宿主就是那时候把进度写进去的）。
    const slot = Math.floor(real / landEveryMs)
    if (slot !== clockSlot) {
      clockSlot = slot
      void refresh()
    }
    scheduleClock()
  }

  /* ------------------------------------------------------------------ *
   * 量尺寸（开发钩子）
   *
   * 我自己看不见这个面板——这台机器起不了无头浏览器。改完版面，我能拿到的只有
   * 「用户截图 + 他说『对不齐』」，而截图里读不出「差 6px」。量尺寸把回路缩短成：
   * 我放一个开关文件、用户刷新一次页面、我读 `.scratch` 外面的那个 JSON。
   * 对着数字改版面，比对着图猜准得多。
   *
   * 量的东西里**最要紧的一条**是 `.gf-stage svg` 与 `.gf-when` / `.gf-col-you`
   * 的 x：地图那条边和下面文字那条边是不是同一条竖线，一减就知道。
   * ------------------------------------------------------------------ */

  /** 一圈小数就够了——差 6px 和差 6.34px 对我是一回事。 */
  const round1 = (v) => Math.round(Number(v) * 10) / 10

  const px = (v) => round1(parseFloat(v) || 0)

  /** 量一块：位置（相对面板左上角）、宽高、字号行高颜色、内外边距、头四十个字。 */
  function boxOf(name, node, base) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null
    const r = node.getBoundingClientRect()
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null
    const out = {
      name,
      x: round1(r.left - base.left),
      y: round1(r.top - base.top),
      w: round1(r.width),
      h: round1(r.height),
      text: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    }
    if (cs) {
      out.font = cs.fontSize
      out.line = cs.lineHeight
      out.color = cs.color
      out.pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px).join(' ')
      out.margin = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].map(px).join(' ')
    }
    return out
  }

  /** shadow 里按 class 挑第一个。挑不到就算了——量尺寸不该有副作用。 */
  function pickInShadow(cls) {
    try {
      if (typeof shadow.querySelector !== 'function') return null
      return shadow.querySelector(`.${cls}`)
    } catch {
      return null
    }
  }

  /** 把面板量一份出来。垫片里没有排版引擎，量不出东西就返回 null。 */
  function measureNow() {
    if (!measureOn) return null
    // 收起来的面板不排版，量出来全是 0；那不是版面数字，是没量到。
    if (room.hidden) return null
    if (!room || typeof room.getBoundingClientRect !== 'function') return null
    const base = room.getBoundingClientRect()
    if (typeof base.left !== 'number') return null
    const mapSvg = stageHandle && stageHandle.svg ? stageHandle.svg : null
    const items = [
      boxOf('room 面板', room, base),
      boxOf('stage 地图框', stage, base),
      boxOf('stage svg 地图', mapSvg, base),
      boxOf('now 状态块', nowBox, base),
      boxOf('k 状态标签', pickInShadow('gf-k'), base),
      boxOf('v 状态值', pickInShadow('gf-v'), base),
      boxOf('cols-head 两列表头', colsHead, base),
      boxOf('col-you 表头左', pickInShadow('gf-col-you'), base),
      boxOf('col-him 表头右', pickInShadow('gf-col-him'), base),
      boxOf('timeline 见闻录', timeline, base),
      boxOf('when 第一行的时间', pickInShadow('gf-when'), base),
      boxOf('you 左栏', pickInShadow('gf-you'), base),
      boxOf('him-col 右栏', pickInShadow('gf-him-col'), base),
      boxOf('remark 右栏那句话', pickInShadow('gf-remark'), base),
      boxOf('tags 标签', pickInShadow('gf-tags'), base),
      boxOf('help 帮手那一行', pickInShadow('gf-help'), base),
      boxOf('life 生活那一行', pickInShadow('gf-life'), base),
      boxOf('files 文件名那一行', pickInShadow('gf-files'), base),
    ].filter(Boolean)
    return {
      at: new Date(now()).toISOString(),
      theme: themeId,
      voice: voiceId,
      dark: isDark(),
      dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : null,
      viewport: typeof innerWidth === 'number' ? { w: innerWidth, h: innerHeight } : null,
      panel: {
        w: round1(base.width),
        h: round1(base.height),
        scrollTop: room.scrollTop ?? null,
        scrollHeight: room.scrollHeight ?? null,
        clientHeight: room.clientHeight ?? null,
      },
      items,
      map: mapSvg && typeof mapSvg.outerHTML === 'string' ? mapSvg.outerHTML : null,
    }
  }

  /** 等一拍再量：面板刚打开时那一百多毫秒的过渡里量到的是中间态。 */
  function scheduleMeasure() {
    if (!measureOn || measureTimer !== null) return
    const wait = Number(measureDelay)
    measureTimer = window.setTimeout(() => {
      measureTimer = null
      const body = measureNow()
      if (body) void sendMeasure(body)
    }, Number.isFinite(wait) && wait >= 0 ? wait : 420)
  }

  /* ------------------------------------------------------------------ *
   * 翻文案卡顿的取证（开发钩子，跟量尺寸共用同一个开关）
   *
   * 用户 m01403 第 1 条与 m01811：「滚动文案内容依然卡顿」「**没有生成任何回复**，
   * 然后是**手指停了，它才往下滑**」。这两句排除了「DSH 正在生成回复抢主线程」，
   * 剩下的是「滚动本身被主线程拖住」——**跟手的那种滚动在合成器上做，
   * 不跟手就说明这一次滚动落在了主线程上**，而主线程忙着的时候事件只能排到最后一起算。
   *
   * 我这边的无头量具（`.scratch/perf.mjs`）量不出来：滚两秒见闻录 447ms、
   * 一帧都没掉（`>25ms` 占 0%），而且同一份代码开 GPU 与软件光栅差一倍。
   * **它分辨不了。** 所以这一节把量具搬到他那台真机器上：
   *
   *   · 长动画帧（Chrome 123+ 的 LoAF）：一次卡顿里**谁在跑**、跑了多久、
   *     其中多少毫秒花在**强制排版**上——`scripts[].invoker` 直接点出函数名。
   *   · longtask：这一坨到底是不是 JS 任务（LoAF 只说「这一帧长」，longtask 说「谁欠的」）。
   *   · 滚动事件的**轨迹**（时刻 + scrollTop）：一格格跟手，还是攒到最后跳一下。
   *
   *   2026-10-31（t28）修了三个把读数读歪的地方：
   *   ① 从前是 `if (有 LoAF) … else if (有 longtask)`——真机 Chromium 123+ 都走第一支，
   *      longtask 观察器**从没装上**，`tasks` 永远是空的，于是「说是 JS 的长任务」这条
   *      线索永远拿不到。现在两个都装。
   *   ② 从前两套时间原点混着记：`frames[].at` 是**文档原点**（performance.now()），
   *      而 `path[].t` / `first` / `last` 是**墙钟**（Date.now()，因为 `now()` 是那个）。
   *      t27 就是拿这两种数比大小，得出「60 帧全在滚动之后」的假结论。现在这一节里
   *      **所有时刻都是文档原点**（`perfNow()`），墙钟只留一个 `at` 当信封；
   *      哪些字段是什么原点，写进了交回去的 JSON（`origin` / `timeOrigin` / 字段旁的注释）。
   *   ③ 缓冲只留最近 60 帧、丢了不知道多少——「只有 60 帧」和「只看到最近 60 帧」
   *      在文件里长得一样。现在 `dropped` 里记累计丢掉的条数（只增不减）。
   *
   * 默认对装上插件的人完全不存在（开关是宿主主目录里的那个文件）。
   * 自检那套垫片没有 PerformanceObserver，`scrollWatch` 一直是 null，
   * 所以 `noteScroll` 一路早退，冒烟里这条路径等于不存在。
   * ------------------------------------------------------------------ */
  let scrollWatch = null

  // 这一节里所有时刻用它：**文档原点**，与 LoAF / longtask 的 startTime 同一个钟。
  // 没有 performance（自检垫片）就退回 now()——那时也只有它一个钟，不存在混记。
  const perfNow = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : now()

  function startScrollWatch() {
    if (scrollWatch) return
    const watch = {
      path: [],
      frames: [],
      tasks: [],
      events: [],
      scrolls: 0,
      first: 0,
      last: 0,
      timer: 0,
      // 2026-10-31（t28）：缓冲有上限（下面几处 splice），从前丢了就丢了。
      dropped: { frames: 0, tasks: 0, path: 0, events: 0 },
    }
    scrollWatch = watch
    try {
      if (typeof PerformanceObserver !== 'function') return
      const types = PerformanceObserver.supportedEntryTypes || []
      const has = (t) => Array.isArray(types) && types.indexOf(t) >= 0
      // 输入延迟：`processingStart - startTime` 就是「手指已经动了，到有人开始处理它」
      // 中间等了多久。**这一条最贴近那句「手指停了，它才往下滑」。**
      if (has('event')) {
        watch.event = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.name !== 'wheel' && e.name !== 'pointermove' && e.name !== 'scroll') continue
            watch.events.push({
              n: e.name,
              // 文档原点（与 frames[].at 同一个钟）
              at: Math.round(e.startTime),
              wait: Math.round((e.processingStart || e.startTime) - e.startTime),
              run: Math.round((e.processingEnd || e.processingStart || 0) - (e.processingStart || e.startTime)),
              dur: Math.round(e.duration),
            })
          }
          if (watch.events.length > 80) {
            watch.dropped.events += watch.events.length - 80
            watch.events.splice(0, watch.events.length - 80)
          }
        })
        watch.event.observe({ type: 'event', buffered: true, durationThreshold: 8 })
      }
      // 2026-10-31（t28）：两件**都装**，不再是 if/else（见上面 ①）。
      if (has('long-animation-frame')) {
        watch.loaf = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const scripts = e.scripts || []
            watch.frames.push({
              // 文档原点（performance.now()）
              at: Math.round(e.startTime),
              dur: Math.round(e.duration),
              block: Math.round(e.blockingDuration || 0),
              render: Math.round(e.renderStart || 0),
              style: Math.round(e.styleAndLayoutStart || 0),
              ui: Math.round(e.firstUIEventTimestamp || 0),
              // 这一帧里一共跑了几个脚本（下面 scripts 只留前三个）。t27 要的就是这个数：
              // 「只有三个」和「有三个以上」是两件事。
              scriptsN: scripts.length,
              scripts: scripts.slice(0, 3).map((s) => ({
                f: s.invoker || s.name || '?',
                src: String(s.sourceURL || '').split('/').pop(),
                dur: Math.round(s.duration || 0),
                force: Math.round(s.forcedStyleAndLayoutDuration || 0),
              })),
            })
          }
          if (watch.frames.length > 60) {
            watch.dropped.frames += watch.frames.length - 60
            watch.frames.splice(0, watch.frames.length - 60)
          }
        })
        watch.loaf.observe({ type: 'long-animation-frame', buffered: true })
      }
      if (has('longtask')) {
        watch.task = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            // attribution 从前只留了 name。t27 §7 要的三样（容器类型/名字/来源）是判断
            // 「这一坨是插件自己，还是宿主那个 iframe / 滚动容器」的唯一凭据。
            const a = (e.attribution && e.attribution[0]) || null
            watch.tasks.push({
              at: Math.round(e.startTime),
              dur: Math.round(e.duration),
              n: (a && a.name) || '?',
              ctype: (a && a.containerType) || '',
              cname: (a && a.containerName) || '',
              csrc: String((a && a.containerSrc) || '').split('/').pop(),
            })
          }
          if (watch.tasks.length > 60) {
            watch.dropped.tasks += watch.tasks.length - 60
            watch.tasks.splice(0, watch.tasks.length - 60)
          }
        })
        watch.task.observe({ type: 'longtask', buffered: true })
      }
    } catch { /* 取证坏了不该惊动界面 */ }
  }

  /** 每来一个滚动事件记一格（文档原点的毫秒 + 位置）。攒多了丢老的——我只要看形状。 */
  function noteScroll() {
    const watch = scrollWatch
    if (!watch) return
    const t = perfNow()
    if (!watch.first) watch.first = t
    watch.last = t
    watch.scrolls += 1
    watch.path.push({ t: Math.round(t), y: Math.round(Number(timeline.scrollTop) || 0) })
    if (watch.path.length > 200) {
      watch.dropped.path += watch.path.length - 200
      watch.path.splice(0, watch.path.length - 200)
    }
    if (watch.timer) window.clearTimeout(watch.timer)
    watch.timer = window.setTimeout(flushScrollWatch, 1200)
  }

  /** 手停下来 1.2 秒就把这一趟交回去。交完清空，下一次滚动是另一趟。 */
  function flushScrollWatch() {
    const watch = scrollWatch
    if (!watch || !watch.scrolls) return
    watch.timer = 0
    const body = {
      kind: 'scroll',
      // 信封上的墙钟只用来对日历；**下面所有毫秒都是文档原点**。
      at: new Date(now()).toISOString(),
      theme: themeId,
      voice: voiceId,
      open: isOpen === true,
      origin: 'document',
      timeOrigin: typeof performance !== 'undefined' && performance.timeOrigin ? Math.round(performance.timeOrigin) : null,
      visibilityState: typeof document !== 'undefined' && document.visibilityState ? document.visibilityState : null,
      hasFocus: typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : null,
      dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : null,
      viewport: typeof innerWidth === 'number' ? { w: innerWidth, h: innerHeight } : null,
      rows: entries.length,
      content: Math.round(Number(timeline.scrollHeight) || 0),
      view: Math.round(Number(timeline.clientHeight) || 0),
      top: Math.round(Number(timeline.scrollTop) || 0),
      scrolls: watch.scrolls,
      // `spanMs` 是**这一趟的时长**（末次减首次），不是时刻；两个端点另给 firstAt/lastAt。
      // 从前它跟 frames[].at 混着比，才有了「60 帧全在滚动之后」那个假结论。
      spanMs: Math.round(watch.last - watch.first),
      firstAt: Math.round(watch.first),
      lastAt: Math.round(watch.last),
      dropped: { ...watch.dropped },

      // 这一页跑的是不是**这一版**？（这是界面审计里那条「假证人」：原来这里读
      // `.gf-lamp-flicker` 的 animation-timing-function、等它等于 'steps(4, end)'，
      // 可那三处动画 2026-10-09 之后早改回光滑了 ⇒ 这个证人**天天报「旧 bundle」**，
      // 每次取证都得先怀疑它一句。现在改查一个只有这一版才有的东西：地图那张 svg 上的
      // role="application"（界面审计 U3 加的键盘落脚点），旧 bundle 里没有。）
      bundle: (() => {
        try {
          return room.querySelector("svg[role='application']") ? 'application' : null
        } catch {
          return null
        }
      })(),
      path: watch.path.splice(0),
      frames: watch.frames.splice(0),
      tasks: watch.tasks.splice(0),
      events: watch.events.splice(0),
    }
    watch.scrolls = 0
    watch.first = 0
    watch.last = 0
    void sendMeasure(body)
  }

  function setOpen(next) {
    if (next === isOpen) return
    isOpen = next
    door.setAttribute('aria-expanded', String(next))
    window.clearTimeout(closeTimer)
    cancelLeave()
    // 面板收起来的时候，那张说法清单不该还开着（下次掀开板子是一张干净的）。
    setMenu(false)
    if (next) {
      // 先把 hidden 摘掉再 refresh：面板收起来时整个不排版，
      // 这时候量出来的 --gf-sb 会是 0（见 syncGutter）。
      room.hidden = false
      // 返回这一趟重画的承诺：门上那枚惊叹号点一下要**等排完版**才跳得到那一行
      // （见 jumpToOpenFork）——早一步跳，那一行还没在版面上。
      const done = refresh()
      void room.offsetWidth // 先让浏览器认下初始态，过渡才会跑
      room.classList.add('gf-open')
      // 2026-10-31（t28）：第一次开门才灌地图。顺序是「先让这一帧画出来（那行
      // 「正在铺开地图…」+ 面板推开的过渡），再灌」——所以用 rAF 里再 setTimeout，
      // 保证中间**真的有过一次绘制**，不是灌完才第一次上屏。
      // 灌一次就够（`fillMap()` 第二次返回 false），之后再开门零成本。
      if (stageHandle && !stageHandle.mapBuilt) {
        stageNote.hidden = false
        const fill = () => {
          if (!stageHandle.fillMap()) return
          stageNote.hidden = true
        }
        const painted =
          typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function'
        if (painted) window.requestAnimationFrame(() => window.setTimeout(fill, 0))
        else fill()
      }
      // 开始跟钟走：每分钟改抬头，跨整五分钟重新读一次记录（见 tickClock）。
      // 先记下「现在是哪一格、哪个钟点」，免得刚打开就白刷一次。
      clockSlot = Math.floor(now() / landEveryMs)
      clockHour = new Date(now()).getHours()
      scheduleClock()
      // 2026-10-31（t29）：HTML 那一层的「一个世界单位多少像素」在开门那一帧还量不准
      // （见闻录的滚动条要等行都排完才占位，508 里少掉的那 11px 就是这么来的）。
      // 过渡结束之后再量一次、把记号挪准——位置探针抓到过 1.8px 的偏差。
      window.clearTimeout(liveSettleTimer)
      liveSettleTimer = window.setTimeout(() => {
        if (!isOpen || !stageHandle) return
        stageHandle.liveBox = null
        stageHandle.liveKey = ''
        placeLive(stageHandle)
      }, 420)
      // 无障碍（2026-10-08 更晚 b259 数出来的四条之一）：面板是一扇对话窗，打开之后焦点该进去。
      // 有选项就落在最上面那颗选项上，没有就落在面板本身（它上面给了 tabindex="-1"）。见 focusInto。
      Promise.resolve(done).then(focusInto).catch(() => { /* 聚焦失败不该把面板弄崩 */ })
      document.addEventListener('keydown', onKeydown, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      return done
    } else {
      // 收起来也还走钟：门框上那枚提醒记号得自己亮（用户 m11003 第 2 条）。
      // 那一支只重读记录、重画记号，不碰版面（见 tickClock）。
      scheduleClock()
      room.classList.remove('gf-open')
      // 收起面板时顺手退出细节版（界面审计 U10）：下次推开门该是一张干净的全图，
      // 而不是「上次拖到天边」的那一扇（那颗「全图」按钮也一起收走）。
      if (stageHandle && stageHandle.zoomOn) zoomExit(stageHandle)
      document.removeEventListener('keydown', onKeydown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      closeTimer = window.setTimeout(() => {
        if (!isOpen) room.hidden = true
      }, 320)
    }
  }

  function onKeydown(e) {
    inputWasKeyboard = true
    if (e.key !== 'Escape') return
    /* 界面审计 U10（与地图审计 M-1 是同一个 bug）：细节版开着的时候，Esc 的第一层意思
       是「回全图」——从前这里不管三七二十一先 setOpen(false)，一巴掌把整块面板关掉，
       连带着他刚拖到的位置一起没了。和上面那条清单的规矩一样：一层一层往回退。 */
    if (stageHandle && stageHandle.zoomOn) {
      e.stopPropagation()
      zoomExit(stageHandle)
      return
    }
    // 清单开着的时候，Esc 先收清单（面板还留着）——再按一次才收面板。
    if (menuOpen) {
      e.stopPropagation()
      setMenu(false)
      return
    }
    e.stopPropagation()
    setOpen(false)
    door.focus()
  }

  function onPointerDown(e) {
    inputWasKeyboard = false
    const path = e.composedPath()
    // 点面板外关掉；点门由门自己处理。留住了就谁点都不收（用户 m11003 第 3 条）。
    if (pinned) return
    if (!path.includes(host)) setOpen(false)
    // 点在面板里、但不在「故事风格」那一格上：把说法清单收起来（点它自己那一格不算）
    else if (!path.includes(voiceBox)) setMenu(false)
  }

  door.addEventListener('click', () => setOpen(!isOpen))
  // 门上那枚惊叹号跟门不是一件事：门是开/关，这一枚是「带我过去」（用户 m11602 第 1 条
  // 「这个标记没有作用」）——推开面板、滚到那一行、让它亮一下。
  doorBadge.addEventListener('click', (ev) => {
    ev.stopPropagation()
    const done = setOpen(true)
    Promise.resolve(done).then(jumpToOpenFork).catch(() => { /* 跳不过去不该把面板弄崩 */ })
  })
  // 滚动的时候那一行可能进来、也可能出去：记号跟着亮暗（提醒只在「你还没看见」时最亮）。
  //
  // 2026-10-09（用户 m01403 第 1 条「滚动文案内容依然卡顿」）这个处理器改过一次：
  // 以前是**每个滚动事件都同步量一次**——`refreshBadgeSeen` 里两次 `getBoundingClientRect`，
  // 而滚动事件一秒能来几十上百个。每一次都在浏览器刚要排版的那一刻插进去问「它在哪儿」，
  // 于是每一帧都被迫先排版再画（forced reflow），滚动就被这些测量切碎了。
  // 现在一帧只量一次（`requestAnimationFrame` 合并，同一帧里来多少事件都只算一次）。
  //
  // 顺带：滚动期间把**地图上那三处永不停的动画**按停（`.gf-room.gf-scrolling`）。
  // 滚的是见闻录，旁边那张地图跟着重画没有意义；手停下来 180ms 之后动画自己接着走。
  // 没有 requestAnimationFrame（自检里那套最小 DOM 垫片）就退回老做法，一步到位。
  let scrollFrame = 0
  let scrollIdle = 0
  const raf =
    typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : null
  timeline.addEventListener('scroll', () => {
    room.classList.add('gf-scrolling')
    // 量尺寸开着的时候顺带记一格轨迹（见 startScrollWatch）；默认它是 null，等于没有。
    noteScroll()
    if (raf) {
      if (!scrollFrame) {
        scrollFrame = raf(() => {
          scrollFrame = 0
          refreshBadgeSeen()
        })
      }
    } else {
      refreshBadgeSeen()
    }
    window.clearTimeout(scrollIdle)
    scrollIdle = window.setTimeout(() => room.classList.remove('gf-scrolling'), 180)
  }, { passive: true })
  pinBtn.addEventListener('click', () => setPinned(!pinned))

  /* 2026-10-05 用户要的：「我希望我鼠标移动到门的时候，它就自动浮现，
     而不是需要我点击。」
     留一小段犹豫的时间（140ms）：鼠标只是从门旁边划过去不该把面板弹出来。
     2026-10-06 用户补的第二条：「移走 2 秒就消失」——鼠标离开门和面板之后
     一秒自动收（2026-10-07 第 3 条把两秒改成了一秒）；**从门挪进面板里不算离开**
     （面板自己也挂了 pointerenter 取消它），
     否则你想把鼠标往上移去看内容，面板正好在你手底下关掉。
     触摸屏上 pointerenter 会紧挨着 click 触发，所以 pointerType 是 touch 时直接不管，
     免得一次点击被算成开关两下。 */
  let hoverTimer = null
  door.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return
    cancelLeave()
    if (isOpen) return
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      setOpen(true)
    }, 140)
  })
  door.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }
    scheduleLeave()
  })
  room.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') cancelLeave()
  })
  room.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') scheduleLeave()
  })

  function mount() {
    if (mounted) return
    container.appendChild(host)
    mounted = true
    applyTheme()
    refresh()
    // 上次留住了，这次打开也还留住（用户 m11003 第 3 条那个常驻按钮记着）。
    if (readPin(store)) setPinned(true)
    // 钟从挂上就开始走：门关着的时候它只负责那枚提醒记号（见 tickClock）。
    clockSlot = Math.floor(now() / landEveryMs)
    clockHour = new Date(now()).getHours()
    scheduleClock()

    // 问一次宿主：量尺寸开着吗。开着的话，之后每次刷新版面都会量一遍。
    // 这是**唯一**会往外说话的路径，而它默认是关的（开关是主目录里的一个文件）。
    void measureEnabled().then((on) => {
      measureOn = on === true
      if (measureOn) {
        scheduleMeasure()
        // 同一个开关：把「翻文案跟不跟手」这件事也量下来（见 startScrollWatch）。
        startScrollWatch()
      }
    })

    // 有些宿主会重排 body，被摘掉就自己挂回去；顺便盯着深色开关。
    observer = new MutationObserver(() => {
      if (mounted && !document.body.contains(host)) document.body.appendChild(host)
      applyTheme()
    })
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      attributeFilter: ['data-ds-dark-theme'],
    })

    // 窗口一变宽窄，滚动条的空档可能变（0 或 15px），对齐用的那个数跟着重算。
    // 用可选调用：冒烟里的 window 垫片只给了定时器，没有事件。
    window.addEventListener?.('resize', syncGutter)
    // 界面审计 U11：深色开关也可能来自系统（见 isDark 的第 ③ 道闸），
    // 系统那边一变，色板得跟着换一套，不能等他重开页面。
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        // 老 WebView 只有 addListener
        if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSchemeChange)
        else if (typeof mq.addListener === 'function') mq.addListener(onSchemeChange)
        schemeWatch = mq
      }
    } catch (e) {
      // 读不到系统偏好就算了，色板照旧
    }
  }

  function destroy() {
    setOpen(false)
    cancelLeave()
    stopClock()
    nowWhen = null
    observer?.disconnect()
    observer = null
    // 那一层的尺寸监听也要摘（见 stage.appendChild(stageHandle.live) 之后那段）
    try {
      stageWatch?.disconnect()
    } catch (e) {
      // 摘不掉也不该把面板弄崩
    }
    stageWatch = null
    // 系统深色那条监听也要摘（见 mount 里的 schemeWatch）
    try {
      if (schemeWatch) {
        if (typeof schemeWatch.removeEventListener === 'function') schemeWatch.removeEventListener('change', onSchemeChange)
        else if (typeof schemeWatch.removeListener === 'function') schemeWatch.removeListener(onSchemeChange)
      }
    } catch (e) {
      // 摘不掉也不该把面板弄崩
    }
    schemeWatch = null
    window.removeEventListener?.('resize', syncGutter)
    host.remove()
    mounted = false
  }

  return {
    mount,
    destroy,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    refresh,
    // 面板收着时走钟那一支（见 refreshBadge）：只重算门上那枚记号，不动版面。
    // 自检要验「门收着与门开着对同一份记录得出同一个结果」，得能单独叫它一次。
    refreshBadge,
    setTheme(id) {
      if (!THEMES[id]) return
      themeId = id
      retheme()
    },
    // 跟窗里那两个小按钮走同一条路（`paintVoice` 会把选中的那个画出来）。
    setVoice(id) {
      switchVoice(id)
    },
    // 说法那一行重摆一次。为什么要有这个口子：解锁是**外面**的事（许可证 / 激活码），
    // 激活完不用重新挂面板，调一下这个，刚才还点不动的那一项就亮了（见 paintStyles）。
    refreshStyles: paintStyles,
    // 换一套说法，跟点「故事风格」里那一项是同一条路。第二个参数透传给 switchVoice
    // （`{ remember, reload }`）。
    // 写成箭头函数：方法简写会给函数自己绑一个 `setStyle` 的名字，里面再调 `setStyle(id)`
    // 就是无限递归（踩过）。箭头函数没有这个名字绑定，指的就是外面那个。
    setStyle: (id, opts) => switchVoice(id, opts),
    get theme() {
      return themeId
    },
    get voice() {
      return voiceId
    },
    get style() {
      return voiceId
    },
    get world() {
      return WORLD_ID
    },
  }
}

/* ------------------------------------------------------------------ *
 * 给 DSH 的入口
 * ------------------------------------------------------------------ */

const inject = []

/** 宿主半边把记录挂在这条路由上（见 src/index.js）。 */
const RECORDS_URL = '/dsh-gameflow/records'
/** 8 → 9：按下「开始冒险」那条写路由（见 postStart 与 src/index.js 的 startDay）。 */
const START_URL = '/dsh-gameflow/start'

/**
 * 「量尺寸」的路由（见 `src/index.js` 里那一节）。
 *
 * 这是给改版面用的开发钩子：面板把自己每一块的位置、字号、颜色量下来交给宿主落盘，
 * 我读那个 JSON 就能回答「地图和下面的字到底差几个像素」——这台机器起不了无头浏览器，
 * 截图里读不出「差 6px」，数字能。**开关在宿主那边（主目录里的一个文件），
 * 所以对装上插件的人完全不存在这个行为。**
 */
const MEASURE_URL = '/dsh-gameflow/measure'

/** 能不能够到宿主：桌面上是相对 URL，`file://` 打开时（比如 preview.html）够不到。 */
function canReachHost() {
  if (typeof fetch !== 'function') return false
  if (typeof location !== 'undefined' && location.protocol === 'file:') return false
  return true
}

/** 问宿主：量尺寸的开关开了吗？问不到就当没开。 */
async function measureEnabled() {
  if (!canReachHost()) return false
  try {
    const res = await fetch(MEASURE_URL, { headers: { accept: 'application/json' } })
    if (!res.ok) return false
    const payload = await res.json()
    return payload?.on === true
  } catch {
    return false
  }
}

/** 把量下来的东西交回去。失败一律咽下去——量尺寸绝不该惊动界面。 */
async function sendMeasure(body) {
  if (!canReachHost()) return false
  try {
    const res = await fetch(MEASURE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok === true
  } catch {
    return false
  }
}

/**
 * 向宿主半边要记录。
 *
 * 走的是同源回环 HTTP：浏览器里 `location.origin` 就是宿主，相对 URL 直接命中
 * `src/index.js` 注册的那条路由。**桌面壳也是一样的**——2026-10-02 实测过，
 * 桌面壳并没有用 `file://` 加载界面，这条相对路径在真机上拿到了数据、卡片
 * 也正常画了出来（先前的注释猜反了，已改）。
 *
 * 仍然留着 `file:` 早退这一道：万一哪天真的以 `file://` 打开（比如双击
 * `preview.html`），相对 URL 会解析到 file: 源上，`fetch` 会抛或返回不可用的
 * 东西，那就不如干脆不请求，直接当一间空屋子。那种环境要走传输层
 * （`__DSH_TRANSPORT__` / `connection.rpc`），是后面的事。
 *
 * 任何失败都返回空数组——宁可显示「他还没走过多远。」，也不该在界面上弹错误、
 * 更不该自己编数据出来。
 *
 * @returns {Promise<Array<object>>}
 */
async function fetchRecords() {
  // 老契约不变：只认数组，要不到就是空的（界面那条路走 `fetchStore`，见它的注释）。
  const store = await fetchStore()
  return store ? store.records : []
}

/**
 * 向宿主半边要**整份存档**：记录 + 那两个标量（`since` / `seam`，见 `archive` 那段注释）。
 *
 * `fetchRecords` 是它剥出记录那一半的老写法，留着给自检与 e2e 用（它们只认数组）。
 *
 * **两种「没有」要分清楚**（报告 B-08）：
 *   · 压根没有传输层（没有 `fetch`、`file://` 打开预览页）——那间屋子本来就是空的，
 *     交回一份空存档；
 *   · 真去要了、但要不到（非 2xx、网络断了、回的 JSON 坏了）——交回 **null**。
 *     调用方拿到 null 就**保留上一份**：宿主抖一下不该把见闻录擦掉重画。
 *     老写法 `fetchRecords` 两种都摊平成空数组（它的契约一直是「只认数组」）。
 *
 * @returns {Promise<{records: Array<object>, since: number, seam: object|null}|null>}
 */
async function fetchStore() {
  const empty = { records: [], since: 0, seam: null, dayStart: 0 }
  if (typeof fetch !== 'function') return empty
  if (typeof location !== 'undefined' && location.protocol === 'file:') return empty
  try {
    const res = await fetch(RECORDS_URL, { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    return readStore(await res.json())
  } catch {
    return null
  }
}

/**
 * 告诉宿主「他开始冒险了」：从这一刻起算这一天（8 → 9，用户 m04200，见 src/index.js 的 startDay）。
 *
 * 成功的判据只有一条：宿主回 2xx 且 `{ ok: true }`。没有传输层、连不上、宿主回 4xx/5xx
 * 一律交回 false——`pressStart` 只在 true 的时候才掀幕布，所以这条必须诚实。
 *
 * @returns {Promise<boolean>}
 */
async function postStart(at) {
  if (typeof fetch !== 'function') return false
  if (typeof location !== 'undefined' && location.protocol === 'file:') return false
  const time = Number(at) || Date.now()
  try {
    const res = await fetch(START_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ at: time }),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !!(data && data.ok === true)
  } catch {
    return false
  }
}

function apply(ctx) {
  const gf = createGameflow({
    loadRecords: fetchStore,
    // 按下「开始冒险」要落到宿主的存档里（见 postStart）：只在真写成时才掀幕布。
    startSession: postStart,
  })

  if (ctx && typeof ctx.effect === 'function') {
    ctx.effect(() => {
      gf.mount()
      return () => gf.destroy()
    }, 'dsh-gameflow')
  } else {
    gf.mount()
  }
}


    exports.MAP_SVG = MAP_SVG
    exports.MAP_CSS = MAP_CSS
    exports.THEMES = THEMES
    exports.SHARED_LINES = SHARED_LINES
    exports.HOME_LINES = HOME_LINES
    exports.WORLD_LINES = WORLD_LINES
    exports.WORLD_QUIET = WORLD_QUIET
    exports.VOICES = VOICES
    exports.DEFAULT_VOICE = DEFAULT_VOICE
    exports.SCENES = SCENES
    exports.SHARDS = SHARDS
    exports.OUT_SCENES = OUT_SCENES
    exports.OUT_SHARDS = OUT_SHARDS
    exports.OUT_KEYS = OUT_KEYS
    exports.HURT_PATCH = HURT_PATCH
    exports.CAST = CAST
    exports.CAST_LINES = CAST_LINES
    exports.composeSequence = composeSequence
    exports.hisTags = hisTags
    exports.narrationFor = narrationFor
    exports.placeOf = placeOf
    exports.dayLine = dayLine
    exports.SOURCE_CONTENT = SOURCE_CONTENT
    exports.MOMENTS = MOMENTS
    exports.DAY_FRAME = DAY_FRAME
    exports.CLASHES = CLASHES
    exports.ORIGIN = ORIGIN
    exports.DIRECTIONS = DIRECTIONS
    exports.FATES = FATES
    exports.MARKS = MARKS
    exports.FIGHTS = FIGHTS
    exports.JOURNEY = JOURNEY
    exports.FORKS = FORKS
    exports.dayFrameOf = dayFrameOf
    exports.mealOf = mealOf
    exports.WORLD_ID = WORLD_ID
    exports.WORLD_LABEL = WORLD_LABEL
    exports.WORLD_VOICE = WORLD_VOICE
    exports.WORLD_THEME = WORLD_THEME
    exports.lifeLine = lifeLine
    exports.markLine = markLine
    exports.dangerOf = dangerOf
    exports.worldLine = worldLine
    exports.helpersFor = helpersFor
    exports.daylight = daylight
    exports.dimForDusk = dimForDusk
    exports.VIEW = VIEW
    exports.PLACES = PLACES
    exports.placeName = placeName
    exports.buildStage = buildStage
    exports.travelMs = travelMs
    exports.renderStage = renderStage
    exports.fightsFor = fightsFor
    exports.seasonOf = seasonOf
    exports.dayPlanOf = dayPlanOf
    exports.dayPlansFor = dayPlansFor
    exports.planLines = planLines
    exports.lossLine = lossLine
    exports.stateAt = stateAt
    exports.createGameflow = createGameflow
    exports.inject = inject
    exports.fetchRecords = fetchRecords
    exports.fetchStore = fetchStore
    exports.postStart = postStart
    exports.apply = apply
    return module.exports
  },
})
