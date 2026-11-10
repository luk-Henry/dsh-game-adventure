/**
 * 判定本体：红线 14 的禁词表（R23）与命运那两条（R22）。
 *
 * 2026-11-10 从 `scripts/packs.mjs` 抽出来。抽出来的理由和 2026-10-31 那次抽
 * `scanRedline14` 一样——**同一份判定要被好几处用**：扫整个包的 `packs.mjs`、
 * 命令行自检（`node scripts/packs.mjs --probe ...`）、以及 `scripts/smoke.mjs` 的断言。
 *
 * 这次又多了一个理由：冒烟以前是 `spawnSync` 起子进程去跑 `--probe` 的。DSH 插件
 * 市场的静态预检会把 `node:child_process` 记成「命令执行能力」，整个插件因此进不了
 * 自动核验（见 dsh.store/standards）。判定搬到这个文件之后，冒烟直接 import 函数，
 * **分发面**（npm 包里真正发出去的那些文件）里不再有任何一处子进程调用；
 * `look.mjs` / `plugin-switch.mjs` 这两个本机调试脚本仍有，但它们不随包发布。
 *
 * 词表、判定、命中格式与 2026-10-31 那版逐字一致，只搬家，不改行为。
 */

/**
 * 红线 14 的禁词（2026-10-27 加，R23）。原话见 README：「抄书吏的镇子、集市、茶棚、
 * 挑担的、货郎、招条、咸菜、背包都不许再出现」，最后一句又禁了「走镖」那一路。
 * 这张表**只加不删**：删一条等于把一条红线换成一句注释。
 */
export const REDLINE14 = [
  // 集市那一族：地名签也在这条线上（`东岸集市` 每天出现在地图与状态行里）
  // ——改法是改地名（换成「东岸货栈」，那是世界上真有的说法），不是把词从表里划掉
  '集市', '货场',
  // 挑担 / 货郎 / 行囊那一族
  '挑担', '货郎', '行囊', '背囊', '背包', '咸菜', '茶棚',
  // 招条（红线 14 明令）：该用的是「悬赏条」
  '招条',
  // 走镖那一路
  '走镖', '镖局', '镖师',
  // 现代物与中式市井（文案审计 M7–M11）：同一包里的窗只有窗板/窗纸/布帘，
  // 报时只有巡夜与法师塔的钟，路只有大路与岔路
  '窗玻璃', '钟头', '限重', '官道', '打听铺', '更夫', '打更', '梆子', '更鼓',
  // 中式铺面与人情世故（2026-10-31 加，用户 m04298 第 1 条：「我们采用的是西幻写法，
  // 怎么会有『掌柜的』这种称呼」）。这条红线本来就是「这个镇子该长什么样」，
  // 称呼是其中最扎眼的一层——店铺里那个人叫店主，跟手的是学徒，住的地方是旅店，
  // 雇主是店主，钱是铜币，官府是公署，荒野里只有石屋没有庙。
  // 与前面几族一样：**只加不删**，改法是改句子（改成世界上真有的说法），不是划词。
  '掌柜', '伙计', '客栈', '药铺', '东家', '破庙', '衙门', '银两', '小二',
  '财主', '员外', '郎中', '茶楼', '酒楼', '铜板',
]

// 红线 14 明文允许的那一种说法（「收旧符的挑担人」）。命中之前先把它摘掉，
// 剩下的文本里再出现「挑担」就是禁词——这样做比给「挑担」开白名单更严：
// 「挑担的货郎」里那个「挑担」照样会被抓出来。
const REDLINE14_OK = ['收旧符的挑担人']
const stripAllowed = (text) => REDLINE14_OK.reduce((t, ok) => t.split(ok).join(''), text)

// 遍历每一个字符串（判定共用）。
export const eachString = (value, path, fn) => {
  if (typeof value === 'string') return fn(path, value)
  if (Array.isArray(value)) value.forEach((v, i) => eachString(v, `${path}[${i}]`, fn))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) eachString(v, `${path}.${k}`, fn)
}

/**
 * 红线 14 的判定本身（2026-10-31 从 R23 里抽出来）。
 *
 * 返回 `[{ path, text, word }]`，空数组就是干净。
 */
export const scanRedline14 = (value, packId) => {
  const hits = []
  eachString(value, packId, (path, text) => {
    const rest = stripAllowed(text)
    for (const w of REDLINE14) if (rest.includes(w)) hits.push({ path, text, word: w })
  })
  return hits
}

/**
 * 命运那两件事的判定（2026-10-31 加，R22 的另外两条，用户 m04344 那句
 * 「一个救那箱纸、一个救人，那不是就是让人去救人吗？也就是选择没有意义，因为根本不会两难」）。
 *
 * 只判两样，都在按钮与那两句 `look` 上：
 *
 *   1. **按钮的词不许自带审判**。「别管」「见死不救」这种词，等于替用户把答案写好了——
 *      按钮只说去哪儿、做什么（「横到路当中」「先看清来路」）。
 *   2. **每条路的那两句 `look` 都得给这条路一个成立的理由，而且一个字都不许把账摊开**。
 *      用户 m16528 第 2 条：代价不可知，选都还没选就别把结果说出来。`checkForks`
 *      （`src/packs/rules.js`）已经卡了「`look` 最多两句」；这里卡的是「最少两句」与措辞。
 *
 * 返回 `[{ path, why }]`，空数组就是干净。
 */
export const ROAD_JUDGE_WORDS = ['别管', '不管', '见死不救', '袖手', '少管闲事', '自扫门前雪', '事不关己']
export const ROAD_LEDGER_WORDS = ['代价', '风险', '会失去']
export const scanForkRoads = (forks, where = 'forks') => {
  const bad = []
  if (!Array.isArray(forks)) return bad
  for (const [i, fork] of forks.entries()) {
    for (const [j, road] of ((fork && fork.roads) || []).entries()) {
      const at = `${where}[${i}].roads[${j}]`
      const label = String((road && road.label) || '')
      for (const word of ROAD_JUDGE_WORDS) {
        if (label.includes(word)) bad.push({ path: `${at}.label`, why: `「${label}」把答案写好了（命中「${word}」）——按钮只说去哪儿、做什么，不说该不该` })
      }
      const look = Array.isArray(road && road.look) ? road.look : []
      if (look.length < 2) bad.push({ path: `${at}.look`, why: `得有两句（这一条路凭什么成立、另一条路凭什么不该走），现在只有 ${look.length} 句` })
      for (const text of look) {
        const line = String(text)
        for (const word of ROAD_LEDGER_WORDS) {
          if (line.includes(word)) bad.push({ path: `${at}.look`, why: `「${line}」把账摊开了（命中「${word}」）——代价不可知（用户 m16528 第 2 条）` })
        }
      }
    }
  }
  return bad
}

/* 自检样本：`packs.mjs --probe` 与 `smoke.mjs` 共用同一份，免得两边写岔。 */

export const PROBE_REDLINE_BAD = '他推门进客栈，柜上的掌柜抬起头。'
export const PROBE_REDLINE_GOOD = '店主擦着碗说，北边来的人这回绕了远路。'

export const PROBE_FORKS_RIGGED = [{
  id: 'rigged',
  roads: [
    { id: 'a', label: '别管', look: ['他往路边让了半步。'] },
    { id: 'b', label: '先看清来路', look: ['他站在檐下看。', '代价是那箱纸烧个干净。'] },
  ],
}]

export const PROBE_FORKS_CLEAN = [{
  id: 'clean',
  roads: [
    { id: 'a', label: '横到路当中', look: ['被按住那人脸贴着土。', '那几个人是按着令状拿人的。'] },
    { id: 'b', label: '先看清来路', look: ['那人手边落着一把刚用过的刀。', '那人往他这边看，嘴在动。'] },
  ],
}]
