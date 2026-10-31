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
import { f2, hypot, plate_rect, plate_text_y } from './geo.js'
import { pd, wob, organic, meander, blob, ribbon, lerp, hit, f3, SEA, SEA_LO, COAST, INK, INK2, RIVER, RIVER_IN, DUNE, CRACK, peak, tree, dunes, cracks, marsh, rect, tower, WONDER_HALO, WONDER_COLD, wonders, _cap_at, MAP_CSS } from './world.js'
import { Random } from './rng.js'
import { W, H, LANDS, BIOMES, BIOME_COLOR, RIDGES, PEAKS, FORESTS, RIVERS, LAKES, LABELS, NATIONS } from './world3.js'

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
export function win_around(cx, cy) {
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
export const DROPPED = []

/**
 * 一块名牌的矩形。**算式已经搬到 `geo.js` 的 `plate_rect`**（2026-10-30 审计 M-14：
 * 世界图、地方图、面板三处各写一套，改一处另外两处不知道）。这里留一个薄壳，
 * 只是因为老代码与自检都按这个名字调它。
 */
export function plate_box(x, y, text, fs) {
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
export function build_local_raw(wx, wy, focus) {
  return assemble_local(wx, wy, focus).join('\n')
}

/** 画一扇地方图，返回 SVG 正文（不含 `<svg>` 外壳）。 */
export function build_local(wx, wy, focus) {
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
export const LF_CSS = '.gf-map .lf{stroke:' + FURROW + ';stroke-width:0.035;opacity:0.5}'
export const LOCAL_CSS = MAP_CSS + LF_CSS

/**
 * 机器自查——跟世界图那套 `_boxes()` / `check()` 一个意思，判据换成地方图的。
 *
 * ① 被聚焦的镇子要踩在陆地上（岛上那两座尤其容易翻车）；
 * ② 取景框不许出世界、被聚焦的城必须在框里；
 * ③ 夜罩必须是最后一条、尺寸正好等于取景框；
 * ④ 窗口里每个名字都得摆下（挪不动就丢，丢了要报出来）。
 */
export function check(focus) {
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
export const FOCUS = [['银树城', '银树森林'], ['霜堡', '北境霜堡'], ['石冠城', '巨人之脊'],
  ['西港', '西岸自由城邦'], ['河间城', '河间王国'], ['铁砧厅', '铁砧山'],
  ['古林之心', '古林'], ['裂牙堡', '裂牙荒原'], ['灰港', '灰港'],
  ['金丘城', '南境金丘'], ['深炉', '深炉城'], ['灰烬王庭', '灰烬之地'],
  ['黑石', '黑石要塞'], ['夏丘镇', '夏丘'], ['东岸港', '东岸商盟'],
  ['龙骨城', '龙骨荒漠'], ['鸦林堡', '鸦林'], ['龙焰', '龙焰半岛'],
  ['珊瑚宫', '珊瑚海国'], ['深渊港', '深渊港']]

const FOCUS_MAP = new Map(FOCUS)

/** 地方图的取景框尺寸（世界单位）——世界图 66×34 的九分之一面积。 */
export const LOCAL_W = WIN_W
export const LOCAL_H = WIN_H

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
export function focusAt(x, y) {
  let best = null
  let bd = Infinity
  for (const c of cities()) {
    const d = hypot(x - c.cx, y - c.cy)
    if (d < bd) { bd = d; best = c }
  }
  return { focus: best.cn, nation: best.nn, cx: best.cx, cy: best.cy, tier: best.tier, dist: bd }
}
