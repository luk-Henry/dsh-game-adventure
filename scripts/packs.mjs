/**
 * 内容包校验：`node scripts/packs.mjs`（可加 `--show` 打印违规样本）。
 *
 * 把《门后的人-对照表》里那几条**能给机器判**的规矩，逐条压在 `src/packs/*` 上。
 * 写新包之前先跑这个，比人眼快；机器判不了的（这句话是不是好听、这个场景贴不贴）
 * 仍然要人看。
 *
 * 现在压的规矩：
 *   R1 没有阿拉伯数字（次数写 {n} / {e}，时长由面板自己算）
 *   R2 没有现代词（文件、代码、项目……）
 *   R3 片段不带句号：场景的 lead/tail、拼句池的 more/paid/hurt/again 都是**半句**，
 *      句号由拼句那边补（2026-10-08 修过一批重复句号）
 *   R4 完整句带句号：动作句、世界句、生活句、共享句、家里那句——都是一句完整的话
 *   R5 蓝框生活句里不许出现行当词（他过日子的时候不提手里的活）
 *   R6 活计句里不许出现起居词（干活的时候不吃饭不睡觉）——只管动作句、世界句、场景与结局；
 *      共享句（打盹、别人都睡了）和家里那句本来就是生活那一侧，不算
 *   R7 同一句话里同一件物件不许出现两次（「同一个物件不要连着用」是运行时的规矩，
 *      靠 PROP_WORDS 与 avoid 列表管，静态判不了；这里只判一句话内部的重复）
 *   R8 气泡与标点：陈述句，不出 ！？ 与引号
 *   R9 结构：动作在两套 lines/words 里都有键、每个**世界包**的场景都有四档结局、
 *      讲述者包的 `shards` 键必须是某个世界包里真有的场景键、
 *      池内无完全重复、没有空数组、props 是 [词, 键] 对
 *   R10 世界的规矩：这台机器读不读得懂（项的名字认不认识、时段写得对不对、桶有没有名字、
 *      概率是不是 0–100）——读法见 `src/packs/rules.js`，设计见 `src/packs/rules.md`
 *   R11 地理成套：`map`（view/svg/css）与 `places` 要么都给、要么都不给；给了就得
 *      自洽——框是四个数、每个地点都在框里、`actionPlace` 指到的每个地方都在 `places` 里、
 *      有「落脚处」这一处（夜里那句与安静行都钉在 home）、`theme` 得是 `THEMES` 里真有的 id
 *   R12 高光事件：`moments` 里每件事的**条件这台机器读不读得懂**（项名、时段、阈值）、
 *      经过与收束写全了没有、条件里点到的场景键与地名真不真、
 *      **岔口**（选择点）是不是正好两条路（前一条带条件、最后一条不带）
 *      （读法见 `src/packs/rules.js` 的 `checkMoments`）
 *   R13 一天的框：`dayFrame` 里那六档钟点与那六顿饭**名字对不对**（写错一个字母不会报错，
 *      只会静默地「那个钟点没有定场句、那顿饭永远不说」——跟 R10/R12 同一种危险）
 *   R14 交锋：`clash` 的键与 `shards` 一一对应、每个场景的 hold 与 cost 各至少两句
 *      （键写错一个字母，那一行挨打时就静默地只剩一句，看起来像「这一套没写交锋」）
 *   R15 序曲：`origin` 里有名字、至少四句、**第一句就得说出名字**，而且名字全篇只说两次
 *      ——序曲那一句，加上每一卷年卷末尾那句收束（`fate[*].close`，见 R17）；
 *      别处一次都不许再出现（名字一多就从「他」变成了一个到处报家门的角色）
 *   R16 方向与比例：`directions` 里那几档方向**这台机器读不读得懂**——`cap` 是不是
 *      1–100 的数、`bias` 是不是数、兜底正好一个（cap 100、不带条件、排在最后）、
 *      非兜底必须带条件、项名认不认得（读法见 `src/packs/rules.js` 的 `checkDirections`）；
 *      抬头那一句至少三句（少了同一天会连着撞同一句）
 *   R17 归宿：`fate` 里那几件**这台机器读不读得懂**——`days` / `direction` / `roads`
 *      这几个项名与 `share` 写对没有、兜底正好一个（不带条件、排在最后）、
 *      每一件的账至少三句、末尾那句收束里得用一次他的名字；条件里点到的方向 id
 *      与岔口 id 得真有（读法见 `src/packs/rules.js` 的 `checkFates`）
 *   R18 命运抉择的份量：摆了岔口的事件 `weight` 得是 2 或 3（轻的事不该让人做决定）、
 *      每条路都得有 `cost`（一句完整的话，不许零代价）、两条路的 `marks` 不能一模一样、
 *      每条路至少留一种痕迹（一到两个，取自伤 / 账 / 名声 / 得着 / 知道 / 丢掉 六个）
 *      （读法见 `src/packs/rules.js` 的 `checkChoices`）
 *   R19 痕迹池：`marks` 里那六个痕迹**一个不许少、也不许多**，每个都得有 `echo` / `life` /
 *      `world` 三池，`echo` 至少四句、另两池各至少两句（池子太薄，同一天里会撞回同一句）
 *      （读法见 `src/packs/rules.js` 的 `checkMarks`）
 *   R20 战斗：`fights` 里对手与档位各**正好一个不带条件、而且排在最后**（兜底），
 *      对手四池各至少三句、`turns` 与 `report` 各至少三句、`report` 每句都得带 `{n}`
 *      （读法见 `src/packs/rules.js` 的 `checkFights`）
 *   R21 当日计划与册子上的路：`journey` 里那八站以上、**第一个不带条件**（兜底：他总有个起点，
 *      走得最远的那一站说了算）、站名与封印的名字都不空、`lossAt` 是两个递增的整数、
 *      少一分那三段各至少两句、`plans.plan` 每句都得带 `{n}` `{place}` `{seal}`、
 *      四个季节各至少两句（读法见 `src/packs/rules.js` 的 `checkJourney`）
 *   R22 命运：`forks` 里那几件**够不够叫命运**——`weight` 至少 3（轻的事不配让人做决定）、
 *      `when` 非空、眼前那一句一到两句、**正好两条路**、两条路里**正好一条是主线那一支**
 *      （`kind: 'main'`，另一条 `branch`）、**一条路都不许带 `cost`**（代价是不可知的，
 *      用户 m16528 第 2 条）、每种结果至少四拍、`marks` 最多两样且名字认得出、
 *      **死只能落在分支上、而且那种路最多一种结果带 `die`**、绕回主线（`back`）也只能在分支上、
 *      `tier` 只能是 2 或 3、**每条路的兜底正好一种、而且排在最后**
 *      （读法见 `src/packs/rules.js` 的 `checkForks`）。
 *      2026-10-31 又加两条（用户 m04344「一个救那箱纸、一个救人，那不是就是让人去救人吗？」）：
 *      **按钮上不许出现自带审判的词**（别管/不管/见死不救/袖手/少管闲事/自扫门前雪/事不关己——
 *      那种标签等于替用户把答案写好了），**每条路那两句 `look` 至少两句、且不许出现
 *      「代价」「风险」「会失去」**（把账摊开的句子，用户 m16528 第 2 条）。
 *      （读法见本文件的 `scanForkRoads`；`node scripts/packs.mjs --probe-forks` 可自检）
 *   R23 红线 14 的禁词（2026-10-27 加，文案审计 copy.md 第一节）：README 红线 14 点名禁用的
 *      那几样东西（集市、货郎、招条、挑担的、咸菜、茶棚、背包、走镖……）过去**一条都没进断言**
 *      ——`MODERN` 只收现代技术词，于是「二十二条规矩全过」也说明不了这条红线守住了。
 *      现在把禁词写成一张显式表，扫**整个包的每一条字符串**（含 `rules` 与 `map`：地名签就住在
 *      `map` 里，那是每天都会看见的位置）。红线 14 同时明文允许「收旧符的挑担人」这一种说法，
 *      所以命中之后先把它从文本里摘掉再判——不是硬禁，是「除了这一种以外都不许」。
 */
import { readFile } from 'node:fs/promises'
import { writeSync } from 'node:fs'
import { PACKS, listPacks } from '../src/packs/index.js'
import { checkChoices, checkDirections, checkFates, checkFights, checkForks, checkJourney, checkMarks, checkMoments, checkRules } from '../src/packs/rules.js'
// 主题 id 的真名单在 client.js 里（主题是面板的材料，不是包的内容），所以拿它来对一眼：
// 写错一个字母不会报错，只会静默地用默认主题——那正是 R11 要挡的。
import { THEMES } from '../src/client.js'

const SHOW = process.argv.includes('--show')
const out = []
const add = (rule, pack, path, text) => out.push({ rule, pack, path, text })

const MODERN = ['文件', '代码', '项目', '系统', '数据', '网络', '程序', '任务', '成就', '打卡',
  '通知', '性能', '费用', 'token', '插件', '目录', '脚本', '日志', '终端', '版本', '模型',
  '编译', '部署', '服务', '接口', '配置', '进度', '统计', '用户', '功能', '渲染', '缓存']
// 红线 14 的禁词（2026-10-27 加，R23）。原话见 README：「抄书吏的镇子、集市、茶棚、挑担的、
// 货郎、招条、咸菜、背包都不许再出现」，最后一句又禁了「走镖」那一路。
// 这张表**只加不删**：删一条等于把一条红线换成一句注释。
const REDLINE14 = [
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

/**
 * 红线 14 的判定本身（2026-10-31 从 R23 里抽出来）。
 *
 * 抽出来只有一个理由：**同一条判定要被两处用**——扫整个包的那一处，和 `--probe`
 * 自检那一处。如果各写一遍，冒烟验的就不是规则本身，而是「我抄得对不对」。
 *
 * 返回 `[{ path, text, word }]`，空数组就是干净。
 */
const scanRedline14 = (value, packId) => {
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
const ROAD_JUDGE_WORDS = ['别管', '不管', '见死不救', '袖手', '少管闲事', '自扫门前雪', '事不关己']
const ROAD_LEDGER_WORDS = ['代价', '风险', '会失去']
const scanForkRoads = (forks, where = 'forks') => {
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
const LIFE_WORDS = ['吃', '睡', '枕', '被褥', '哈欠', '打盹', '起床', '面包', '汤', '靴', '晾', '灶', '宵夜']
const WORK_WORDS = ['卷宗', '符纸', '契书', '誊', '咒', '法器', '机关', '图纸', '卷轴', '路碑',
  '矿', '火漆', '销子', '齿轮', '抄', '描', '翻', '查', '跑', '改']

const FRAGMENTS = ['lead', 'tail', 'more', 'paid', 'hurt', 'again']
const SENTENCES = ['actionLines', 'sharedLines', 'homeLines', 'worldLines', 'worldQuiet', 'life', 'tagline', 'steps', 'close', 'dayFrame', 'hold', 'cost', 'lines',
  // 战斗那几池（2026-10-10 加，R20）：`meet` / `way` / `trade` / `end` / `turns` / `report`
  // 都是给人看的完整句，句号收尾这一条由 R4 管。
  'meet', 'way', 'trade', 'end', 'turns', 'report',
  // 当日计划那几池（2026-10-10 加，R21）：`plan`（今天手上那几件事）、`season`（这一季的路）、
  // `losses`（每描一处少一分）。三样都是给人看的完整句，句号收尾这一条由 R4 管。
  'plan', 'season', 'losses',
  // 命运那两池（2026-10-10 加，R22）：`look`（岔口眼前那一点点环境描写，每件一件、
  // 每条路也各一句）与 `beats`（落下来的那一种结果，一拍一句）。同样是给人看的完整句。
  'look', 'beats']
// 一天的框那两套名字（R13 用；与 client.js 的 `DAY_HOURS` / `MEALS` 是同一份口径）。
const DAY_FRAME_KEYS = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night']
const MEAL_KEYS = ['breakfast', 'lunch', 'supper', 'breakfastLate', 'lunchLate', 'supperLate']

/**
 * 所有世界包里的场景键。
 * 讲述者包（`kind: 'voice'`）自己不给 `scenes`——它按**世界包**那些 `key` 写 `shards`，
 * 也就是「这件事用我这句话怎么讲」（见 README 的包接口）。所以它的 `shards` 键
 * 该对着**全部世界包**认，不是对着自己（自己一个场景都没有）。
 */
const ALL_SCENE_KEYS = new Set(
  Object.values(PACKS).flatMap((p) => Object.values(p.scenes || {}).flat().map((s) => s.key)),
)

// 归宿的条件里点到的方向 id 与岔口 id：也认**全部包**里的（理由同上一行——说法包可能
// 只有归宿、没有方向表；岔口更是住在别个包的事件里）。写错一个字母不会报错，只会静默地
// 「那一年永远归到兜底那一件」，所以这里对一眼。
const ALL_DIRECTION_IDS = new Set(
  Object.values(PACKS).flatMap((p) => (Array.isArray(p.directions) ? p.directions : []).map((d) => d && d.id).filter(Boolean)),
)
const ALL_ROAD_IDS = new Set(
  Object.values(PACKS).flatMap((p) => (Array.isArray(p.moments) ? p.moments : [])
    .flatMap((m) => ((m && m.choice && m.choice.roads) || []).map((r) => r && r.id).filter(Boolean))),
)

const eachString = (value, path, fn) => {
  if (typeof value === 'string') return fn(path, value)
  if (Array.isArray(value)) value.forEach((v, i) => eachString(v, `${path}[${i}]`, fn))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) eachString(v, `${path}.${k}`, fn)
}

// 自检模式（2026-10-31 加，给冒烟用）：`node scripts/packs.mjs --probe "一段文本"`。
// 只跑红线 14 那一条判定，把命中逐条打印出来，然后立刻收工——不扫包、不判别的规矩。
// 冒烟拿它证明「这张禁词表真有牙」：塞一句带禁词的进去必须报命中（并且退出码非零），
// 塞一句干净的必须报 0。没有这个入口，冒烟就只能验「表非空」，那什么都证明不了。
const PROBE_AT = process.argv.indexOf('--probe')
if (PROBE_AT >= 0) {
  const text = process.argv[PROBE_AT + 1] || ''
  const hits = scanRedline14(text, 'probe')
  const lines = hits.map((hit) => `R23 自检：${hit.word} ← ${hit.text}`)
  lines.push(`R23 自检：${hits.length} 处`)
  // 写 fd 1 是同步的：接着就退出，管道里的字不会丢。
  writeSync(1, `${lines.join('\n')}\n`)
  process.exit(hits.length ? 1 : 0)
}

// 同一个道理，命运那两条也要能自检（2026-10-31 加）：冒烟拿两件**故意写的**fork 喂它，
// 一件坏（按钮写「别管」、`look` 只有一句、句子里把代价说了）一件干净，两边的数都得对上。
// 不这么验，冒烟只能证明「表里有这几个词」，证明不了「写回坏东西会当场红」。
const PROBE_FORKS_AT = process.argv.indexOf('--probe-forks')
if (PROBE_FORKS_AT >= 0) {
  const rigged = [{
    id: 'rigged',
    roads: [
      { id: 'a', label: '别管', look: ['他往路边让了半步。'] },
      { id: 'b', label: '先看清来路', look: ['他站在檐下看。', '代价是那箱纸烧个干净。'] },
    ],
  }]
  const clean = [{
    id: 'clean',
    roads: [
      { id: 'a', label: '横到路当中', look: ['被按住那人脸贴着土。', '那几个人是按着令状拿人的。'] },
      { id: 'b', label: '先看清来路', look: ['那人手边落着一把刚用过的刀。', '那人往他这边看，嘴在动。'] },
    ],
  }]
  const bad = scanForkRoads(rigged, 'rigged')
  const ok = scanForkRoads(clean, 'clean')
  const lines = bad.map((hit) => `R22 自检：${hit.path} ← ${hit.why}`)
  lines.push(`R22 自检：坏样本 ${bad.length} 处 / 干净样本 ${ok.length} 处`)
  writeSync(1, `${lines.join('\n')}\n`)
  // 坏样本一条都抓不到、或者干净样本被误伤，都算这张网不灵。
  process.exit(bad.length >= 3 && ok.length === 0 ? 0 : 1)
}

for (const pack of Object.values(PACKS)) {
  const at = (p) => `${pack.id}/${p}`

  // R1 R2 R8：所有字符串
  eachString(pack, pack.id, (path, text) => {
    // `rules` 那一支不按文风审：它引用的是动作名与地方键（「翻文件」里带「文件」，
    // 那是事实层的真名，不是文案里的现代词）。它由 R10 与 src/packs/rules.js 管。
    if (path.startsWith(`${pack.id}.rules`)) return
    // `map` 那一支更不按文风审：地图是一整段画好的 SVG（几千个坐标数字、十六进制颜色）
    // 加一份它的 CSS。它由 R11 判结构，不判标点。2026-10-06 加。
    if (path.startsWith(`${pack.id}.map`)) return
    // 数组元素的 path 段是带下标的（`tail[0]`），不剥掉的话 R3/R4 对池子里的句子
    // **一条都不生效**——只对 `actionLines` 这种整串字段生效。2026-10-08 发现。
    const field = path
      .split('.')
      .slice(1)
      .map((k) => k.replace(/\[\d+\]$/, ''))
      .find((k) => FRAGMENTS.includes(k) || SENTENCES.includes(k))
    if (/\d/.test(text)) add('R1 阿拉伯数字', pack.id, path, text)
    for (const w of MODERN) if (text.includes(w)) add('R2 现代词', pack.id, path, `${text}（${w}）`)
    if (/[！!？?]/.test(text)) add('R8 气泡与标点', pack.id, path, text)
    if (/["'「」『』]/.test(text)) add('R8 气泡与标点', pack.id, path, text)
    if (FRAGMENTS.includes(field) && text.endsWith('。')) add('R3 片段不该带句号', pack.id, path, text)
    if (SENTENCES.includes(field) && !text.endsWith('。')) add('R4 完整句该带句号', pack.id, path, text)
  })

  // R5 R6：生活句 / 活计句
  eachString(pack.life, at('life'), (path, text) => {
    for (const w of WORK_WORDS) if (text.includes(w)) add('R5 生活句里的行当词', pack.id, path, `${text}（${w}）`)
  })
  // 那顿饭也落在蓝框生活句那一格（见 client.js 的 `lifeLine` / `mealOf`），所以同一把尺子。
  eachString(pack.dayFrame && pack.dayFrame.meal, at('dayFrame.meal'), (path, text) => {
    for (const w of WORK_WORDS) if (text.includes(w)) add('R5 生活句里的行当词', pack.id, path, `${text}（${w}）`)
  })
  for (const key of ['actionLines', 'worldLines', 'worldQuiet', 'scenes', 'shards', 'clash']) {
    eachString(pack[key], at(key), (path, text) => {
      for (const w of LIFE_WORDS) if (text.includes(w)) add('R6 活计句里的起居词', pack.id, path, `${text}（${w}）`)
    })
  }
  // 定场句与收尾句说的是他手上的活（活计那一栏），所以也按 R6 判。
  for (const part of ['open', 'close']) {
    eachString(pack.dayFrame && pack.dayFrame[part], at(`dayFrame.${part}`), (path, text) => {
      for (const w of LIFE_WORDS) if (text.includes(w)) add('R6 活计句里的起居词', pack.id, path, `${text}（${w}）`)
    })
  }

  // R7：一句话里同一件物件只提一次（只算两字以上的道具——纸、笔、图、火这些单字
  // 是别处的子串，判了全是假警：`图角`、`篝火`、`路牌`）
  for (const [key, shard] of Object.entries(pack.shards || {})) {
    for (const slot of FRAGMENTS) {
      for (const text of shard[slot] || []) {
        for (const [word] of pack.props || []) {
          if (word.length < 2) continue
          const hits = text.split(word).length - 1
          if (hits > 1) add('R7 同一句话里重复的物件', pack.id, `${key}.${slot}`, `${text}（${word}×${hits}）`)
        }
      }
    }
  }
  for (const [act, list] of Object.entries(pack.scenes || {})) {
    for (const scene of list) {
      for (const slot of FRAGMENTS) {
        for (const text of scene[slot] || []) {
          for (const [word] of pack.props || []) {
            if (word.length < 2) continue
            const hits = text.split(word).length - 1
            if (hits > 1) add('R7 同一句话里重复的物件', pack.id, `scenes.${act}.${scene.key}.${slot}`, `${text}（${word}×${hits}）`)
          }
        }
      }
    }
  }

  // R23：红线 14 的禁词（2026-10-27 加，2026-10-31 抽成 scanRedline14）。**整包扫**，
  // 一个字段都不放过——这次是被「规矩全过、红线却是空的」教出来的：禁词住在 `props`、
  // `words`、`places` 的名字、地图的地名签、乃至 `fights` 的动作句里，只审「句子池」审不到。
  for (const hit of scanRedline14(pack, pack.id)) add('R23 红线14禁词', pack.id, hit.path, `${hit.text}（${hit.word}）`)

  // R9：结构
  const acts = Object.keys(pack.actionLines || {})
  for (const act of acts) {
    if (!pack.words || !pack.words[act]) add('R9 结构', pack.id, `words.${act}`, '词表里缺这个动作')
  }
  for (const act of Object.keys(pack.words || {})) {
    if (!acts.includes(act) && !['深夜', '很晚了', '坐了很久', '一小会儿'].includes(act)) {
      add('R9 结构', pack.id, `actions.${act}`, '词表里多出一个动作')
    }
  }
  for (const [act, list] of Object.entries(pack.scenes || {})) {
    if (!acts.includes(act)) add('R9 结构', pack.id, `scenes.${act}`, '这个动作没有动作句')
    for (const scene of list) {
      if (!scene.key || !scene.w) add('R9 结构', pack.id, `scenes.${act}`, '场景缺 key/w')
      if (!Array.isArray(scene.lead) || scene.lead.length === 0) add('R9 结构', pack.id, `scenes.${act}.${scene.key}`, '没有 lead')
      if (!Array.isArray(scene.tail) || scene.tail.length === 0) add('R9 结构', pack.id, `scenes.${act}.${scene.key}`, '没有 tail')
      if (!pack.shards || !pack.shards[scene.key]) add('R9 结构', pack.id, `scenes.${act}.${scene.key}`, '没有对应的四档结局')
    }
  }
  for (const [key, shard] of Object.entries(pack.shards || {})) {
    for (const slot of ['more', 'paid', 'hurt', 'again']) {
      if (!Array.isArray(shard[slot]) || shard[slot].length === 0) add('R9 结构', pack.id, `shards.${key}.${slot}`, '这一档是空的')
    }
    const known = ALL_SCENE_KEYS.has(key)
    if (!known) add('R9 结构', pack.id, `shards.${key}`, '这个场景不在任何世界包的 scenes 里')
  }
  for (const [path, list] of poolEntries(pack)) {
    if (!Array.isArray(list)) continue
    const dup = list.filter((t, i) => typeof t === 'string' && list.indexOf(t) !== i)
    for (const t of new Set(dup)) add('R9 结构', pack.id, path, `池子里重复：${t}`)
  }
  for (const [word, key] of pack.props || []) {
    if (!word || !key) add('R9 结构', pack.id, 'props', '道具要写成 [词, 键]')
  }

  // R10：世界的规矩有没有写错（读不懂的规矩比松的规矩更危险——它会静默地什么都不做）
  if (pack.rules) for (const bad of checkRules(pack.rules, pack.id)) add('R10 世界的规矩', pack.id, 'rules', bad)

  // R12：高光事件（2026-10-08 加，用户 m06647 第 2 条）。
  // 「什么时候发生」也是规矩，跟 R10 同一台机器读——读不懂的条件比松的条件更危险：
  // 它会静默地一件都不发生，而屏幕上看起来跟「这一天本来就没大事」一模一样。
  if (pack.moments) for (const bad of checkMoments(pack.moments, pack.id)) add('R12 高光事件', pack.id, 'moments', bad)
  // 条件里点到的名字得真有：`scenes` 认**全部世界包**的场景键（说法包自己没有场景），
  // `places` 认这个包自己的地方（地理只归世界包，见 R11）。
  if (Array.isArray(pack.moments)) {
    for (const [i, moment] of pack.moments.entries()) {
      for (const [j, term] of (moment?.when || []).entries()) {
        const where = `moments[${i}].when[${j}].has`
        if (term?.when === 'scenes') for (const key of term.has || []) {
          if (!ALL_SCENE_KEYS.has(key)) add('R12 高光事件', pack.id, where, `没有这个场景：${key}`)
        }
        if (term?.when === 'places') for (const key of term.has || []) {
          if (!(pack.places || {})[key]) add('R12 高光事件', pack.id, where, `没有这个地点：${key}`)
        }
      }
    }
  }

  // R18：命运抉择的份量（2026-10-09 加，用户 m01903 第 2 条）。
  // 四条硬规矩：够格才给选项（weight ≥ 2）/ 每条路都得有代价（`cost` 一句完整的话）/
  // 两条路不对称（痕迹不能一模一样）/ 每条路至少留一种痕迹（`marks` 一到两个）。
  // 危险跟 R12 同一种：写漏了不会报错，只会静默地「选项轻飘飘、选哪条都一样」。
  if (pack.moments) for (const bad of checkChoices(pack.moments, pack.id)) add('R18 命运抉择', pack.id, 'moments', bad)

  // R19：痕迹池（2026-10-09 加，用户 m01903 第 2、3 条）。
  // 六个痕迹一个不许少、也不许多；每个都得有 echo / life / world 三池，池子太薄同一天里会撞回同一句。
  // 危险跟 R12 / R13 同一种：名字写错一个字母不会报错，只会在屏幕上安静地少一处回声。
  if (pack.marks) for (const bad of checkMarks(pack.marks, pack.id)) add('R19 痕迹池', pack.id, 'marks', bad)

  // R20：战斗（2026-10-10 加，用户 m14888「他必须有战斗」）。
  // 两层兜底（对手最后那一个、档位最后那一档）与池子的厚度都由 `checkFights` 判；
  // 这里再对一眼条件里点到的场景键——跟 R12 同一个道理：写错一个字母不会报错，
  // 只会静默地「那一景永远打不起来」。
  if (pack.fights) for (const bad of checkFights(pack.fights, pack.id)) add('R20 战斗', pack.id, 'fights', bad)
  if (pack.fights && Array.isArray(pack.fights.foes)) {
    for (const [i, foe] of pack.fights.foes.entries()) {
      for (const [j, term] of (foe?.when || []).entries()) {
        if (term?.when !== 'scenes') continue
        for (const key of term.has || []) {
          if (!ALL_SCENE_KEYS.has(key)) add('R20 战斗', pack.id, `fights.foes[${i}].when[${j}].has`, `没有这个场景：${key}`)
        }
      }
    }
  }

  // R21：当日计划与册子上的路（2026-10-10 加，用户 m14781「按照一个人的一天来写」）。
  // 站齐不齐、兜底对不对（**第一个不带 when**，走得最远的那一站说了算）、少一分那三段在不在、
  // 句子里的占位符齐不齐，都由 `checkJourney` 判；这里再对一眼条件里点到的场景键与地名——
  // 跟 R12 / R20 同一个道理：写错一个字母不会报错，只会静默地「永远走不到那一站」。
  if (pack.journey) {
    for (const bad of checkJourney(pack.journey, pack.id)) add('R21 当日计划', pack.id, 'journey', bad)
    if (Array.isArray(pack.journey.stations)) {
      for (const [i, one] of pack.journey.stations.entries()) {
        for (const [j, term] of (one?.when || []).entries()) {
          if (term?.when === 'scenes') {
            for (const key of term.has || []) {
              if (!ALL_SCENE_KEYS.has(key)) add('R21 当日计划', pack.id, `journey.stations[${i}].when[${j}].has`, `没有这个场景：${key}`)
            }
          }
          if (term?.when === 'places') {
            for (const key of term.has || []) {
              if (!(pack.places && pack.places[key])) add('R21 当日计划', pack.id, `journey.stations[${i}].when[${j}].has`, `没有这个地点：${key}`)
            }
          }
        }
      }
    }
  }

  // R22：命运（2026-10-10 加，用户 m16528 三条批评与 m16548「可以把角色写死」）。
  // 「够不够叫命运」这件事全由 `checkForks` 判（两条路、正好一条主线、一条路都不许带代价、
  // 死只能落在分支上、每种路最多一种结果带 `die`…）；这里再对一眼条件里点到的场景键与地名——
  // 跟 R12 / R20 / R21 同一个道理：写错一个字母不会报错，只会静默地「这件命运永远不出现」。
  if (pack.forks) {
    for (const bad of checkForks(pack.forks, pack.id)) add('R22 命运', pack.id, 'forks', bad)
    // 两难那两条（2026-10-31 加，用户 m04344）：按钮不许自带审判、每条路的 `look` 两句且不摊账。
    for (const bad of scanForkRoads(pack.forks, pack.id)) add('R22 命运', pack.id, bad.path, bad.why)
    if (Array.isArray(pack.forks)) {
      for (const [i, fork] of pack.forks.entries()) {
        for (const [j, term] of (fork?.when || []).entries()) {
          if (term?.when === 'scenes') {
            for (const key of term.has || []) {
              if (!ALL_SCENE_KEYS.has(key)) add('R22 命运', pack.id, `forks[${i}].when[${j}].has`, `没有这个场景：${key}`)
            }
          }
          if (term?.when === 'places') {
            for (const key of term.has || []) {
              if (!(pack.places && pack.places[key])) add('R22 命运', pack.id, `forks[${i}].when[${j}].has`, `没有这个地点：${key}`)
            }
          }
        }
      }
    }
  }

  // R13：一天的框（2026-10-08 加，用户 m07599 第 2 条与 C1「一天要有头有尾」）。
  // 键名写错一个字母不会报错，只会静默地「那个钟点没有定场句、那顿饭永远不说」——
  // 跟 R10/R12 同一种危险，所以这里把六档钟点、六顿饭的名字逐个对一遍。
  if (pack.dayFrame) {
    const frame = pack.dayFrame
    for (const part of ['open', 'close', 'meal']) {
      if (!frame[part] || typeof frame[part] !== 'object') add('R13 一天的框', pack.id, `dayFrame.${part}`, '缺这一样')
    }
    for (const part of ['open', 'close']) {
      const pool = frame[part] || {}
      for (const key of DAY_FRAME_KEYS) {
        if (!Array.isArray(pool[key]) || !pool[key].length) add('R13 一天的框', pack.id, `dayFrame.${part}.${key}`, '这一档没有句子')
      }
      for (const key of Object.keys(pool)) {
        if (!DAY_FRAME_KEYS.includes(key)) add('R13 一天的框', pack.id, `dayFrame.${part}.${key}`, `不认识的钟点（认得的：${DAY_FRAME_KEYS.join('/')}）`)
      }
    }
    for (const key of MEAL_KEYS) {
      if (!Array.isArray((frame.meal || {})[key]) || !frame.meal[key].length) add('R13 一天的框', pack.id, `dayFrame.meal.${key}`, '这一顿没有句子')
    }
    for (const key of Object.keys(frame.meal || {})) {
      if (!MEAL_KEYS.includes(key)) add('R13 一天的框', pack.id, `dayFrame.meal.${key}`, `不认识的饭（认得的：${MEAL_KEYS.join('/')}）`)
    }
  }

  // R14：交锋（2026-10-08 加，用户 m06647 第 2 条「战斗项的内容实在太少了」+ 后来的「全做」）。
  // 它跟 `shards` 一一对应：键写错一个字母，那一行挨打时就**静默地只有一句**——
  // 看起来跟「这一套说法没写交锋」一模一样，所以这里把键逐个对一遍。
  if (pack.clash) {
    for (const [key, pair] of Object.entries(pack.clash)) {
      const where = `clash.${key}`
      if (!ALL_SCENE_KEYS.has(key)) add('R14 交锋', pack.id, where, '这个场景不在任何世界包的 scenes 里')
      if (!pair || typeof pair !== 'object') { add('R14 交锋', pack.id, where, '得是 {hold, cost}'); continue }
      for (const part of ['hold', 'cost']) {
        const list = pair[part]
        if (!Array.isArray(list) || list.length < 2) {
          add('R14 交锋', pack.id, `${where}.${part}`, '这一拍至少要两句（不然一行里同一个场景连着撞两回就重了）')
        }
      }
      for (const part of Object.keys(pair)) {
        if (!['hold', 'cost'].includes(part)) add('R14 交锋', pack.id, `${where}.${part}`, '只认 hold 与 cost 两拍')
      }
    }
    // 有 shards 的场景就得有交锋：缺一个就是那一处「挨打了却只有一句」。
    for (const key of Object.keys(pack.shards || {})) {
      if (!pack.clash[key]) add('R14 交锋', pack.id, `clash.${key}`, '这个场景有 shards 却没有交锋')
    }
  }

  // R15：序曲（2026-10-08 加，用户第 3 条「他可以有名字，你取一个」）。
  //
  // 名字全篇只说两次：**开头**（序曲第一句）与**每一卷年卷末尾那句收束**（`fate[*].close`，
  // 见 R17）。它要是出现在别处（比如某句世界句里），他就从「他」变成了一个到处报家门的
  // 角色——那是角色扮演，不是这一套说法在做的事。所以这里两头都钉：第一句里必须有名字，
  // 除了序曲与归宿那一句，包里别处一句都不许有。
  if (pack.origin) {
    const { name, lines } = pack.origin
    if (typeof name !== 'string' || !name.trim()) add('R15 序曲', pack.id, 'origin.name', '名字不能是空的')
    if (!Array.isArray(lines) || lines.length < 4) {
      add('R15 序曲', pack.id, 'origin.lines', '序曲至少四句（他叫什么、从哪儿来、落脚处、靠什么吃饭）')
    } else if (name && !String(lines[0]).includes(name)) {
      add('R15 序曲', pack.id, 'origin.lines[0]', `第一句里就得说出他的名字（${name}）`)
    }
    if (name && name.trim()) {
      // 归宿那一句（`fate[*].close`）是名字的**第二处**，也是最后一处。它要真有名字——
      // 那是「用一次他的名字」这句话的落点；别处再出现就报错。
      const closes = Array.isArray(pack.fate)
        ? pack.fate.map((one, i) => [one, i]).filter(([one]) => one && typeof one.close === 'string')
        : []
      for (const [one, i] of closes) {
        if (!one.close.includes(name)) {
          add('R17 归宿', pack.id, `fate[${i}].close`, `末尾那一句收束里要用一次他的名字（${name}）`)
        }
      }
      eachString(pack, pack.id, (path, text) => {
        if (path.startsWith(`${pack.id}.origin`)) return
        if (path.startsWith(`${pack.id}.map`)) return
        if (/^[^.]+\.fate\[\d+\]\.close$/.test(path)) return
        if (text.includes(name)) add('R15 序曲', pack.id, path, `名字只在序曲与归宿那一句里出现，这里又出现了（${name}）`)
      })
    }
  }

  // R16：方向与比例（2026-10-08 加，用户 m07234 第 2 条「比例需要调整」）。
  //
  // 这一套的危险跟 R10 / R12 / R13 同一种：项名写错一个字母、`cap` 忘了给、
  // 或者**两个兜底**，都不会报错——只会静默地「这一天永远不落这一档」或者
  // 「一天里落了两档」。所以结构交给 `checkDirections` 逐条判（读法见 rules.js）。
  //
  // 另外三条只在包这一层说得清：
  //   ① 顺序即优先级：兜底必须排在最后（前面几档都不中才轮到它）；
  //   ② `lines`（抬头那一句）是**完整句**，由 R4 按字段名管；这里只判至少三句，
  //      免得同一天连着两天撞同一句；
  //   ③ 上限的账：非兜底的 `cap` 加起来**允许**超过一百（上限不是配额，
  //      凑不满就让给兜底），但不许出现 cap 比兜底还大的怪事。
  if (pack.directions) {
    if (!Array.isArray(pack.directions)) {
      add('R16 方向与比例', pack.id, 'directions', '得是一列方向')
    } else {
      for (const bad of checkDirections(pack.directions, pack.id)) add('R16 方向与比例', pack.id, 'directions', bad)
      const fallbacks = pack.directions.filter((d) => d && d.fallback)
      const last = pack.directions[pack.directions.length - 1]
      if (fallbacks.length === 1 && !(last && last.fallback)) {
        add('R16 方向与比例', pack.id, 'directions', '兜底那一档要排在最后（顺序就是优先级）')
      }
      for (const [i, dir] of pack.directions.entries()) {
        if (!dir || typeof dir !== 'object') continue
        const where = `directions[${i}]`
        if (!Array.isArray(dir.lines) || dir.lines.length < 3) {
          add('R16 方向与比例', pack.id, `${where}.lines`, '抬头那一句至少给三句（同一天连着两天会撞）')
        }
      }
    }
  }

  // R17：归宿（2026-10-08 加，用户 m08146「全做。」第 ⑤ 件）。
  //
  // 危险跟 R12 / R16 同一种：项名写错一个字母、`share` 写成别的字、兜底忘了留，
  // 都不会报错——只会静默地「那一年永远归到兜底那一件」，而屏幕上看起来
  // 跟「那一年本来就没什么可说」一模一样。所以结构交给 `checkFates` 逐条判
  // （读法见 rules.js），条件里点到的名字这里对一眼：方向 id 与岔口 id 认**全部包**里的
  // （跟 R12 认场景键同一个道理——说法包可能只有归宿、没有方向表）。
  if (pack.fate !== undefined && pack.fate !== null) {
    if (!Array.isArray(pack.fate)) {
      add('R17 归宿', pack.id, 'fate', '得是一列归宿')
    } else {
      for (const bad of checkFates(pack.fate, pack.id)) add('R17 归宿', pack.id, 'fate', bad)
      for (const [i, one] of pack.fate.entries()) {
        for (const [j, term] of (one?.when || []).entries()) {
          const where = `fate[${i}].when[${j}].has`
          const ids = Array.isArray(term?.has) ? term.has : (Array.isArray(term?.is) ? term.is : [])
          if (term?.when === 'direction') for (const id of ids) {
            if (!ALL_DIRECTION_IDS.has(id)) add('R17 归宿', pack.id, where, `没有这个方向：${id}`)
          }
          if (term?.when === 'roads') for (const id of ids) {
            if (!ALL_ROAD_IDS.has(id)) add('R17 归宿', pack.id, where, `没有这条路：${id}`)
          }
          if (term?.when === 'scenes') for (const key of ids) {
            if (!ALL_SCENE_KEYS.has(key)) add('R17 归宿', pack.id, where, `没有这个场景：${key}`)
          }
          if (term?.when === 'places') for (const key of ids) {
            if (!(pack.places || {})[key]) add('R17 归宿', pack.id, where, `没有这个地点：${key}`)
          }
        }
      }
    }
  }

  // R11：地理成套（2026-10-06 加）。
  //
  // 一个世界的样子是**三样一起**的：地图（那段画好的 SVG）、取景框（照这张图裁的框）、
  // 地点坐标（照同一张图钉的）。少给一样就会出「记号站在海里」这种静默的错，
  // 所以要么两样都给、要么两样都不给（都不给就退回默认世界那一套地理）。
  if (pack.kind === 'world') {
    const hasMap = !!pack.map
    const hasPlaces = !!pack.places
    if (hasMap !== hasPlaces) {
      add('R11 地理成套', pack.id, hasMap ? 'places' : 'map', '给了地图就得给地点，反之亦然（框与坐标是同一张图的两半）')
    }
    if (hasMap) {
      const v = pack.map.view
      const nums = (o) => o && ['x', 'y', 'w', 'h'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]))
      if (!nums(v)) add('R11 地理成套', pack.id, 'map.view', '取景框要是 {x, y, w, h} 四个数')
      if (v && nums(v) && !(v.w > 0 && v.h > 0)) add('R11 地理成套', pack.id, 'map.view', '框的宽高得是正的')
      if (typeof pack.map.svg !== 'string' || !pack.map.svg.trim()) add('R11 地理成套', pack.id, 'map.svg', '地图不能是空的')
      if (typeof pack.map.css !== 'string' || !pack.map.css.trim()) add('R11 地理成套', pack.id, 'map.css', '地图的 CSS 不能是空的')
      // 地图里不许出现会跑出去污染面板的写法（这条与冒烟的「样式全挂在 .gf-map 底下」同源）
      if (typeof pack.map.css === 'string' && !pack.map.css.includes('.gf-map')) {
        add('R11 地理成套', pack.id, 'map.css', '地图的样式得挂在 .gf-map 底下')
      }
    }
    if (hasPlaces) {
      const seen = new Set()
      for (const [key, place] of Object.entries(pack.places || {})) {
        const at2 = `places.${key}`
        if (!place || typeof place !== 'object') { add('R11 地理成套', pack.id, at2, '地点得是个对象'); continue }
        if (place.id !== key) add('R11 地理成套', pack.id, at2, `id 与键不一致（${place.id}）`)
        if (typeof place.x !== 'number' || typeof place.y !== 'number') add('R11 地理成套', pack.id, at2, '缺 x/y')
        if (!Array.isArray(place.door) || place.door.length !== 2 || place.door.some((n) => typeof n !== 'number')) {
          add('R11 地理成套', pack.id, at2, 'door 要写成 [x, y]')
        }
        const names = Object.values(place.name || {}).filter((s) => typeof s === 'string' && s)
        if (!names.length) add('R11 地理成套', pack.id, at2, '地点至少要有一个名字')
        if (place.door && place.door.some((n) => typeof n !== 'number')) seen.add(key)
        // 记号钉的地方得在框里——出框就是站在海里（地图是画出来的，框是照它裁的）
        const v = pack.map && pack.map.view
        if (v && typeof place.x === 'number' && typeof place.y === 'number'
          && (place.x < v.x || place.x > v.x + v.w || place.y < v.y || place.y > v.y + v.h)) {
          add('R11 地理成套', pack.id, at2, `这个点（${place.x}, ${place.y}）在取景框外面`)
        }
      }
      // 每一处「活计落在哪儿」都得真有那个地方，否则记号无处可钉
      for (const [act, place] of Object.entries(pack.actionPlace || {})) {
        if (!(pack.places || {})[place]) add('R11 地理成套', pack.id, `actionPlace.${act}`, `指到了不存在的地方：${place}`)
      }
      // 夜里那句与安静行都钉在 home（`narrationFor` 的 asleep 分支），少了它记号会掉
      if (!(pack.places || {}).home) add('R11 地理成套', pack.id, 'places', '缺 home 这一处（夜里与安静行都钉在它上面）')
    }
    if (pack.theme != null) {
      if (typeof pack.theme !== 'string') add('R11 地理成套', pack.id, 'theme', '主题要写成 id 字符串')
      else if (!THEMES[pack.theme]) add('R11 地理成套', pack.id, 'theme', `THEMES 里没有这个主题：${pack.theme}`)
    }
  }
}

/** 所有「一串句子」的池子，用来查重复。 */
function* poolEntries(pack) {
  for (const field of ['sharedLines', 'homeLines', 'worldLines', 'worldQuiet']) {
    const v = pack[field]
    if (Array.isArray(v)) yield [field, v]
    else if (v) for (const [k, list] of Object.entries(v)) yield [`${field}.${k}`, list]
  }
  // actionLines 每个动作只有一句（是字符串，不是池子）
  for (const [bucket, list] of Object.entries(pack.life || {})) yield [`life.${bucket}`, list]
  for (const [act, list] of Object.entries(pack.scenes || {})) {
    for (const scene of list) {
      yield [`scenes.${act}.${scene.key}.lead`, scene.lead || []]
      yield [`scenes.${act}.${scene.key}.tail`, scene.tail || []]
    }
  }
  for (const [key, shard] of Object.entries(pack.shards || {})) {
    for (const slot of ['more', 'paid', 'hurt', 'again']) yield [`shards.${key}.${slot}`, shard[slot] || []]
  }
  // 高光事件的经过与收束（2026-10-08 加）：一件事里两句一样也是重复。
  for (const [i, moment] of (pack.moments || []).entries()) {
    const at = `moments.${moment?.id || i}`
    yield [`${at}.steps`, moment?.steps || []]
    yield [`${at}.close`, moment?.close ? [moment.close] : []]
    // 岔口那两条路（2026-10-08 加，选择点）：一条路里两句一样、两条路互相抄，都算重复。
    for (const [j, road] of ((moment?.choice && moment.choice.roads) || []).entries()) {
      yield [`${at}.choice.roads[${j}].lines`, (road && road.lines) || []]
      // 代价那一句（2026-10-09 加，R18）：它也是给人看的句子，抄来抄去同样算重复。
      yield [`${at}.choice.roads[${j}].cost`, road && road.cost ? [road.cost] : []]
    }
  }
  // 一天的框（2026-10-08 加）：定场句、收尾句、那几顿饭，各自一池。
  for (const part of ['open', 'close', 'meal']) {
    for (const [key, list] of Object.entries((pack.dayFrame && pack.dayFrame[part]) || {})) {
      yield [`dayFrame.${part}.${key}`, list]
    }
  }
  // 交锋（2026-10-08 加）：一场仗的后两拍，每个场景各自一池。
  for (const [key, pair] of Object.entries(pack.clash || {})) {
    yield [`clash.${key}.hold`, pair?.hold || []]
    yield [`clash.${key}.cost`, pair?.cost || []]
  }
  // 序曲（2026-10-08 加）：开场那几句，一句话说两遍也是重复。
  yield ['origin.lines', (pack.origin && pack.origin.lines) || []]
  // 方向（2026-10-08 加）：每一档的抬头各自一池。
  for (const [i, dir] of (pack.directions || []).entries()) {
    yield [`directions.${dir?.id || i}.lines`, (dir && dir.lines) || []]
  }
  // 归宿（2026-10-08 加）：每一件的账各自一池；末尾那句收束也一样，一句话说两遍也是重复。
  for (const [i, one] of (pack.fate || []).entries()) {
    const at = `fate.${one?.id || i}`
    yield [`${at}.lines`, (one && one.lines) || []]
    yield [`${at}.close`, one && one.close ? [one.close] : []]
  }
  // 痕迹池（2026-10-09 加，R19）：六个痕迹各三池，一天里回声撞回同一句最扎眼。
  for (const [name, one] of Object.entries(pack.marks || {})) {
    for (const key of ['echo', 'life', 'world']) yield [`marks.${name}.${key}`, (one && one[key]) || []]
  }
  // 战斗（2026-10-10 加，R20）：五种对手各四池，加上两池共用的（失算与日卷战报）。
  // 一场仗里同一拍撞回同一句、或两个对手说同一句话，都算重复。
  for (const [i, foe] of (pack.fights?.foes || []).entries()) {
    const at = `fights.foes.${foe?.id || i}`
    for (const key of ['meet', 'way', 'trade', 'end']) yield [`${at}.${key}`, (foe && foe[key]) || []]
  }
  yield ['fights.turns', (pack.fights && pack.fights.turns) || []]
  yield ['fights.report', (pack.fights && pack.fights.report) || []]
  // 当日计划（2026-10-10 加，R21）：今天手上那几件事、四个季节的路、少一分那三段。
  yield ['journey.plans.plan', (pack.journey?.plans && pack.journey.plans.plan) || []]
  for (const [key, list] of Object.entries(pack.journey?.plans?.season || {})) {
    yield [`journey.plans.season.${key}`, list || []]
  }
  for (const [key, list] of Object.entries(pack.journey?.losses || {})) {
    yield [`journey.losses.${key}`, list || []]
  }
  // 命运（2026-10-10 加，R22）：岔口眼前那一点点环境描写（每件一件、每条路各一句）、
  // 以及每种结果落下来的那几拍。两条路抄同一句、或两种结果说同一句话，都算重复。
  for (const [i, fork] of (pack.forks || []).entries()) {
    const at = `forks.${fork?.id || i}`
    yield [`${at}.look`, (fork && fork.look) || []]
    for (const [j, road] of ((fork && fork.roads) || []).entries()) {
      yield [`${at}.roads[${j}].look`, road && road.look ? [road.look] : []]
      for (const [k, out] of ((road && road.outcomes) || []).entries()) {
        yield [`${at}.roads[${j}].outcomes[${k}].beats`, (out && out.beats) || []]
      }
    }
  }
}

const byRule = new Map()
for (const v of out) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, [])
  byRule.get(v.rule).push(v)
}

// 三档说清楚：免费（现在就能用）/ 付费（授权完能用）/ 预留（**还没写**，给多少钱都用不了）。
// 2026-10-06 晚用户第 3 条之后多出第三档，打印时不能只按 free 二分成「免费/付费」。
const stage = (p) => (p.soon ? '/预留' : p.free ? '/免费' : '/付费')
console.log(`内容包：${listPacks().map((p) => `${p.name}(${p.id}/${p.kind}${stage(p)})`).join('、')}\n`)
for (const [rule, list] of [...byRule].sort()) {
  const packs = [...new Set(list.map((v) => v.pack))].join('/')
  console.log(`${rule.padEnd(22)} ${String(list.length).padStart(3)} 处   ${packs}`)
  if (SHOW) for (const v of list.slice(0, 12)) console.log(`    ${v.path}  ${v.text}`)
  if (SHOW && list.length > 12) console.log(`    …… 还有 ${list.length - 12} 处`)
}
if (!out.length) console.log('二十三条规矩全过 ✓')

// R3/R4 这两条与「句子有没有收尾」有关，单独把规模印出来便于对照
const count = (value) => { let n = 0; eachString(value, '', () => { n++ }); return n }
for (const pack of Object.values(PACKS)) {
  const n = count(pack)
  // 预留的包只有名字与一句「它的核」（`tagline`），不必印一行「6 条」占版面
  // （它们由 R9/R11 与冒烟那几条看着）。那一句本身照样要过 R1/R2/R4 那几条。
  if (!n || pack.soon) continue
  console.log(`\n${pack.id}: 字符串 ${n} 条（其中生活句 ${count(pack.life)} 条）`)
}
process.exitCode = out.length ? 1 : 0
