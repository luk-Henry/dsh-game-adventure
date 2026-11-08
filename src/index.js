/**
 * dsh-game-adventure —— host 半边。
 *
 * 它在 DSH 宿主进程里安静地做两件事：
 *
 *   1. 听会话的开始、事件和结束，攒下「哪天、坐了多久、在哪个项目、大概在忙什么」；
 *   2. 把攒下的东西用一条只读路由交给界面（`/dsh-game-adventure/records`）。
 *
 * 记录只落在本机，不联网，不上传。
 *
 * 关于「不读对话内容」：本文件里的分类只看**工具名、事件条数、时刻和时长**，
 * 不读任何消息文本。工具名（`read`/`edit`/`bash`…）是动作的名字，不是你说的话。
 * 这是刻意的：设计文档承诺过不做语义分析。
 *
 * 零依赖：只 import `node:` 内置模块。这样它不跟框架的构建管线绑定，也不会
 * 因为框架包名解析不到而在加载期就炸掉。
 */

import { mkdir, open, readFile, readdir, rename, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import zlib from 'node:zlib'

/**
 * 用默认导入取 zstd，**不要**写成 `import { zstdDecompressSync } from 'node:zlib'`：
 * 具名导入在模块链接期就解析，Node 版本低一点会直接把整个插件炸在加载阶段；
 * 走默认导入再就地判存在，最坏也只是没有回填功能。
 */
const zstd = typeof zlib.zstdDecompressSync === 'function' ? zlib.zstdDecompressSync : null

/** Cordis 插件名。 */
const name = 'dsh-game-adventure'

/**
 * 声明依赖的服务。
 *
 * `webServer` 是界面取数据的那条路由的宿主（`dsh-host-webserver` 注册的服务）。
 * 代价：在没有任何 web 宿主的进程里，本插件会一直等，不激活，也就不记录。
 * 换来的是不用赌 `ctx.inject(...)` 的调用形态——那是骨架阶段不值得赌的东西。
 */
const inject = ['webServer']

/** 界面取数据的路由前缀。 */
const ROUTE_PATH = '/dsh-game-adventure'

/** 本机回环地址的几种写法（IPv4、IPv6、以及 Node 在双栈上给的那种）。 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * 记录文件的落点（相对 DSH 主目录）：`~/.dsh/gameflow/records.json`。
 *
 * 刻意**不写进 `~/.dsh/storages/`**——那是 storage 后端（`dsh-storage-json`）的地盘，
 * 它按 `unit`/`table` 组织并带自己的版本号，塞私货进去会跟它打架。
 * 插件自己的数据放自己的目录，这是 `dsh-home-paths` 的用法。
 */
const STORE_SEGMENTS = ['gameflow', 'records.json']

/**
 * 开关（2026-11-01，用户：「给我一个开关，让我随时可以打开或者完全关闭」）。
 *
 * 这枚标记在 = **关着**：不记录、界面那边把整扇门摘掉。
 * 它故意做成「一个空文件」，因为翻它的那个人不是我们——是桌面上那个快捷方式
 * （`scripts/game-onoff.mjs`），它只 `writeFile` / `rm` 这一个文件，**不碰 profile、
 * 不用重启 DSH**，插件这边最多 15 秒就跟着变。
 *
 * 跟 `measure.on` 同一个脾气：文件在就是开，简单到不可能出错。
 */
const OFF_SEGMENTS = ['gameflow', 'off']

/** 现在关着吗？读不到（文件不在）就是开着。 */
async function offNow() {
  try {
    await stat(join(resolveDshHome(), ...OFF_SEGMENTS))
    return true
  } catch {
    return false
  }
}

/**
 * 「量尺寸」是给**改版面**用的开发钩子，不是插件功能。
 *
 * 浏览器那半边把面板上每一块的位置、字号、颜色量下来，连同地图 SVG 一起交回来，
 * 宿主落成两个文件：
 *
 *   `~/.dsh/gameflow/measure/layout.json`   每一块的 x/y/宽/高/字号/颜色 + 关键文本
 *   `~/.dsh/gameflow/measure/map.svg`       地图本体（好离线出图看）
 *
 * 为什么需要它：这台开发机上起不了无头浏览器，改完版面看不见结果。
 * 「地图和下面的字左右差 6px」这种问题，截图里读不出那个 6——数字能。
 *
 * **开关是主目录里的一个文件，不是插件里的常量**：
 *
 *   `~/.dsh/gameflow/measure.on`            存在就量，删掉就停
 *
 * 插件是要发给别人的东西，绝不能带一个「每次打开都往外报自己的尺寸」的行为；
 * 而宿主半边改一次要重启 DSH，做成文件开关就能随时开关。
 */
const MEASURE_SEGMENTS = [STORE_SEGMENTS[0], 'measure.on']

/** 量下来的东西写在哪（相对 DSH 主目录）。 */
const MEASURE_DIR_SEGMENTS = [STORE_SEGMENTS[0], 'measure']

/** 一次量尺寸最多收多少字节——防的是把整棵 DOM 塞回来。 */
const MAX_MEASURE_BYTES = 2 * 1024 * 1024

/** 「开始冒险」那一条只收一个时刻，给足余量即可（`{ "at": 1792845300000 }`）。 */
const MAX_START_BYTES = 4 * 1024

/** 最多保留多少条记录，防止文件无限长。 */
const MAX_RECORDS = 5000

/**
 * 记录文件的格式版本。
 *
 * 2 → 3 加了 `counts`（每个动作各做了几次）和 `files`（动过手的文件名）。
 * 3 → 4 改成**按「坐下来的那一段」切**：一场会话不再等于一行见闻录，中间停久了就另起一行
 *        （一个会话 id 因此会派生出 `#2`、`#3` 这样的分段 id）。
 * 4 → 5 加 `fails`（工具报错的次数）。右栏那句「他在洞窟口挨了两下」就靠它——
 *        战斗是唯一没有数据来源的场景，失败次数是唯一诚实的那个来源。
 * 5 → 6 加 `cells`（这一段**落在案上的那几格五分钟**，见 landedCells）。
 *        用户 2026-10-08：「我要的是，每5分钟落定一次时间，即记录在案。」
 * 6 → 7 加 `ticks`（那几格**各自**里落了什么：动作、文件名、撞墙次数，见 ticksOf）。
 *        用户 2026-10-08 第 2 条：「时间落盘是错误的，我要的是每5分钟落一次，不要折叠。
 *        也就是说，时间从上而下应该是 10:00，9:55,9:50,9:45,9:40……」——一格要能
 *        单独成行，就得知道那一格里发生了什么；`cells` 只有时刻，不够。
 * 7 → 8 **旧日子真删**（用户 m01403 第 2 条）。记录只剩今天，另外记两个标量：
 *        `since`（这份存档的头一天，序曲认它）与 `seam`（最近被删掉的那一段的起止，
 *        今天第一行上面那句「隔了一夜」认它）。见 pruneStore。
 * 8 → 9 **按下「开始冒险」才算开场**（用户 m04200 逐字：「不是，我刚刚点开，就已经存在
 *        2 条冒险在里面了，这是不对的。当用户点开的时候，才会开始计算时间，并到下一个
 *        5 分钟的时候才会落盘。」）。多记一个标量 `dayStart`：他按下那一刻的钟点。
 *        按下之前攒的记录在这一刻被删掉（不是藏起来），见 startDay 那一段。
 * 每次加字段就 +1：装上插件的人盘上已经有一份旧格式，**版本号是让回填重跑的唯一开关**
 * ——只在文件里加字段而不升版本，旧记录永远不会补上新的那几栏。
 *
 * 7 → 8 这一跳会让回填重跑一遍（把所有历史会话重新读成记录），紧接着被 `pruneStore`
 * 裁到只剩今天——白读一趟，换来的是那两个标量从**全部历史**里算出来，而不是从盘上
 * 还留着的那几条里算。这一步只在升级那一次发生。
 */
const STORE_VERSION = 9

/**
 * 隔多久把内存里的东西落一次盘。
 *
 * 一场对话可能开好几个小时，而进程被硬杀（关窗口、崩溃、断电）时内存里的记录全没了。
 * 五分钟是「最坏情况丢掉的工作量」和「白写文件的次数」之间的折中，
 * 成本是零——落盘只是算术加一次写文件，**不调用任何模型，不花 token**。
 */
const PERSIST_INTERVAL_MS = 5 * 60 * 1000

/**
 * 离下一个「整五分钟」还有多久。
 *
 * 落盘要对齐钟面（`:00 :05 :10 …`），不是从插件启动起算——见 `apply()` 里
 * 「注册定时落盘」那一段和用户 2026-10-04 第 3 条。导出来是为了能单测：
 * 一个纯函数，给个时刻就知道下一次该睡多久。
 */
function msToTick(now = Date.now(), span = PERSIST_INTERVAL_MS) {
  const at = Number(now)
  if (!Number.isFinite(at) || !(span > 0)) return span
  const rest = at % span
  return rest === 0 ? span : span - rest
}

/** 一条记录里最多留几个动过手的文件名。证据够用就行，不做清单。 */
const MAX_FILES = 5

// ---------------------------------------------------------------------------
// 主目录与文件
// ---------------------------------------------------------------------------

/**
 * 解析 DSH 主目录。优先级与 `@deepseek-ai/dsh-home-paths` 一致：
 * `$DSH_HOME` → `~/.dsh`。空白的 `$DSH_HOME` 视为未设置。
 */
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

/** 记录文件的绝对路径。 */
function storeFile(home = resolveDshHome()) {
  return join(home, ...STORE_SEGMENTS)
}

/**
 * 先写临时文件、刷到盘上，再改名——半截的 JSON 不会覆盖掉上一次的好数据，
 * 断电时也不会留下一份「名字对、内容空」的存档（那是 `rename` 之后才 `fsync`
 * 的做法会有的毛病）。
 */
async function writeTextAtomic(file, text) {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  let handle = null
  try {
    handle = await open(tmp, 'w')
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } finally {
    await handle?.close()
  }
  await rename(tmp, file)
}

async function writeJsonAtomic(file, value) {
  await writeTextAtomic(file, JSON.stringify(value, null, 2))
}

/** 坏存档改名留档用的后缀：`20261027-211305`。 */
function corruptStamp(now = Date.now()) {
  const d = new Date(now)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * 从**读不懂的原文**里尽量把 `since`/`seam` 捞回来。
 *
 * 整份 JSON 坏了，但这两个标量往往还完整地躺在文本里；而它们正是「序曲别再重播」
 * 与「隔了一夜」的唯一来源。捞不到就落回默认值——不猜、不造。
 */
function salvageMeta(raw) {
  const text = typeof raw === 'string' ? raw : ''
  const since = Number((/"since"\s*:\s*(-?\d+)/.exec(text) || [])[1]) || 0
  // 8 → 9 加的那个标量也照同样办法捞：它决定「今天从哪儿开始讲」，捞不到就退回今天零点
  // （见 src/client.js 的 renderTimeline）——比把用户今天已经看见的几行全抹掉要稳。
  const dayStart = Number((/"dayStart"\s*:\s*(\d+)/.exec(text) || [])[1]) || 0
  const seamAt = /"seam"\s*:\s*\{[^}]*?"startedAt"\s*:\s*(\d+)/s.exec(text)
  const seamEnd = /"seam"\s*:\s*\{[^}]*?"endedAt"\s*:\s*(\d+)/s.exec(text)
  const startedAt = Number(seamAt?.[1]) || 0
  const seam = startedAt
    ? { startedAt, endedAt: Number(seamEnd?.[1]) || startedAt }
    : null
  return { since, seam, dayStart }
}

/**
 * 读**整份存档**：记录，外加 7 → 8 加的那两个标量（见 STORE_VERSION 与 pruneStore）。
 *
 * 写盘那条路要的是「记录 + 上次记下的 `since`/`seam`」，光拿记录会把两个标量越写越小
 * ——`since` 一旦丢了，序曲每天都会重播一遍。
 *
 * 三种「读不到」必须分开：
 *   · 文件不在（ENOENT）——正常的第一次，当空存档；
 *   · 文件读不动（权限、锁、磁盘）——`blocked`，调用方**这一轮不许写盘**；
 *   · 文件读得动但解析不出来——坏存档，改名留成 `records.json.corrupt-<时间戳>`
 *     再从原文里捞 `since`/`seam`。少了这一步，一次坏档会被当成「空存档」，
 *     下一次落盘就把用户攒的记录整份覆盖掉（报告 B-02）。
 */
async function readStore(file, warn) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { records: [], since: 0, seam: null, dayStart: 0 }
    warn?.(`dsh-game-adventure: 读不了 ${file}，这一轮不落盘：${String(error)}`)
    return { records: [], since: 0, seam: null, dayStart: 0, blocked: true }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const meta = salvageMeta(raw)
    let saved = null
    try {
      saved = `${file}.corrupt-${corruptStamp()}`
      await rename(file, saved)
      warn?.(`dsh-game-adventure: ${file} 读不懂（${String(error)}），已改名留档：${saved}`)
    } catch (renameError) {
      warn?.(`dsh-game-adventure: ${file} 读不懂，改名留档也失败，这一轮不落盘：${String(renameError)}`)
    }
    return { records: [], ...meta, corrupt: true, blocked: saved === null }
  }
  const seam = parsed?.seam && Number(parsed.seam.startedAt)
    ? { startedAt: Number(parsed.seam.startedAt), endedAt: Number(parsed.seam.endedAt) || Number(parsed.seam.startedAt) }
    : null
  return {
    records: Array.isArray(parsed?.records) ? parsed.records : [],
    since: Number(parsed?.since) || 0,
    seam,
    // 按下「开始冒险」那一刻（8 → 9）。没有它（老存档、没按过）就是 0，
    // 界面退回「今天零点」的老规矩。
    dayStart: Number(parsed?.dayStart) || 0,
  }
}

/** 文件在不在。开关文件就用它判断——「存在即开」，不需要读内容。 */
async function fileExists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

/**
 * 把请求体读完（带上限）。超了直接 reject，调用方回 413。
 *
 * 手写而不是用现成的 body 解析器：这条路由是零依赖的，而 `node:` 里没有
 * 「读 body」这个内置件。`req.destroy()` 只在有这个方法时调（测试里的假请求没有）。
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk?.length ?? 0
      if (size > limit) {
        reject(new Error('body too large'))
        if (typeof req.destroy === 'function') req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 统一的 JSON 回包。 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

// ---------------------------------------------------------------------------
// 分类：只用非内容信号
// ---------------------------------------------------------------------------

/** 工具名 → 标签。按前缀匹配，命中第一个就算。 */
const TOOL_TAGS = [
  [/^(edit|write|multiedit|apply_patch|str_replace|notebook_edit)/i, '改文件'],
  [/^(bash|pwsh|powershell|shell|exec|run_command)/i, '跑命令'],
  [/^(read|glob|grep|rg|list_dir|ls)/i, '翻文件'],
  [/^web_(search|fetch)$/i, '查资料'],
  [/^(task|subagent|agent|workflow)/i, '派了活'],
]

/**
 * 从一个会话累积出的信号里推出卡片标签。
 *
 * @param signals - 纯计数与时刻，不含任何消息内容：
 *   `{ startedAt, endedAt, minutes, toolCalls, userMessages, assistantMessages, toolResults }`
 *   （`toolCalls` 是 `{ 工具名: 次数 }`）
 * @returns 最多三条标签，按「先时间、后动作」排。
 */
function classify(signals) {
  const tags = []
  const minutes = signals.minutes || 0
  const hour = new Date(signals.startedAt).getHours()

  if (hour < 5) tags.push('深夜')
  else if (hour >= 22) tags.push('很晚了')

  if (minutes >= 120) tags.push('坐了很久')
  else if (minutes > 0 && minutes <= 5) tags.push('一小会儿')

  // 动作标签按出现次数排序，只取最突出的一个——卡片上不堆东西。
  const ranked = Object.entries(signals.toolCalls || {})
    .sort((a, b) => b[1] - a[1])
    .map(([tool]) => TOOL_TAGS.find(([re]) => re.test(tool))?.[1])
    .filter((tag) => tag !== undefined)

  for (const tag of ranked) {
    if (!tags.includes(tag)) tags.push(tag)
    if (tags.length >= 3) break
  }

  // 一个工具都没用过，但确实说了话——那就是单纯的聊天。
  if (ranked.length === 0 && (signals.userMessages || 0) > 0) tags.push('聊了聊')

  return tags.slice(0, 3)
}

// ---------------------------------------------------------------------------
// 记录器：纯内存，可单独测试
// ---------------------------------------------------------------------------

/** 把 cwd 的最后一段当作项目名。 */
function projectOf(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return undefined
  const parts = cwd.split(/[\\/]/).filter((part) => part !== '')
  return parts.at(-1)
}

/**
 * 这是不是一个子代理会话？
 *
 * 子代理是主会话派出去干活的临时会话，它也在 `session/created` 里出现。
 * 不挡掉的话，每派一次活时间线里就多一张「你坐了 2 分钟」的卡片——那是纯噪音，
 * 而且会把真正那段记忆淹掉。证据在会话 header 上：`origin: "subagent"`、
 * `delegationDepth > 0`、以及指向母会话的 `parentSession`。
 */
function isSubagentHeader(header) {
  if (header === null || typeof header !== 'object') return false
  if (header.origin === 'subagent') return true
  return Number(header.delegationDepth ?? 0) > 0
}

/**
 * 两件事之间超过这么久，就当作你走开了，不记进时长。
 * 十分钟：比一次最长的心算/思考停顿宽裕，又足够把「挂着过夜」切掉。
 */
const ACTIVE_GAP_MS = 10 * 60 * 1000

/**
 * 中间停了这么久，就当他起来走开了——下一件事**另起一段**。
 *
 * 一场会话可以跨天（实测：从昨天下午开到今天中午，一次没关），
 * 而见闻录一行应该是「一次坐下干活」，不是「一个进程活了多久」。
 * 四十五分钟：比一顿饭短，比一次走神长。
 */
const SPLIT_GAP_MS = 45 * 60 * 1000

/**
 * 一段最长这么久。
 *
 * 连着干一下午的人不该被钟表切成好几行——四十五分钟那条已经能切开真正的停顿了；
 * 这条只是兜底：一口气干超过两小时，就在两小时处收尾另起一行，
 * 免得某一天变成一整块读不完的长条。
 */
const MAX_STRETCH_MS = 2 * 60 * 60 * 1000

/**
 * 真正坐了多久——不是「会话从开到关跨了多久」。
 *
 * 一个昨晚开着、今天下午才接着说两句的会话，按首尾相减能算出 44 个小时，
 * 写到卡片上就成了一句谁也读不懂的胡话。所以改成：把相邻两个事件之间
 * **不超过 `ACTIVE_GAP_MS` 的空隙**加起来，剩下的当作离开。
 *
 * 拿不到事件时刻（老数据、或者上游没给 time）时，退回首尾相减。
 */
/**
 * 一段「坐着的时长」最多算 8 小时。
 *
 * 这是**防护，不是业务规则**：正常路径根本够不着这条线——`MAX_STRETCH_MS` 让一段
 * 最多铺两小时，`ACTIVE_GAP_MS` 又把十分钟以上的空档扣掉。它兜的是最后那条退化
 * 路径：事件一个都没带 `time` 的时候只能拿首尾相减，而一个跨了两天的会话能算出
 * 44 小时，写到卡片上就是一句谁也不信的话。
 */
const MAX_ACTIVE_MINUTES = 8 * 60

function activeMinutes(times, startedAt, endedAt) {
  const marks = (Array.isArray(times) ? times : []).filter((t) => Number.isFinite(t)).sort((a, b) => a - b)
  if (marks.length === 0) {
    const span = Math.max(0, Math.round((endedAt - startedAt) / 60000))
    return Math.min(MAX_ACTIVE_MINUTES, span)
  }
  let active = 0
  for (let i = 1; i < marks.length; i++) {
    const gap = marks[i] - marks[i - 1]
    if (gap > 0 && gap <= ACTIVE_GAP_MS) active += gap
  }
  return Math.min(MAX_ACTIVE_MINUTES, Math.max(0, Math.round(active / 60000)))
}

/**
 * 这一段**落在案上的那几格**——一格五分钟，去重、升序、不合并。
 *
 * 用户 2026-10-08：「我要的是，每5分钟落定一次时间，即记录在案。」所以记录里除了
 * 「真正坐了多久」（`minutes`，见 activeMinutes）还要有「哪几格是在案的」：把每个
 * 事件的时刻往下取整到整五分钟。于是 `08:57–10:57` 那一段在案的是 24 格；而
 * `10:57–12:21` 那一段跨了 17 格、只在案几格——**空着的那几格也照样画出来**
 * （客户端按首尾补齐整条刻度，见 src/client.js 的 landedGrid），
 * 「中间那段时间去哪了」就不再是一个只能靠猜的问题。
 *
 * 用的是**落盘那一格**（`PERSIST_INTERVAL_MS`）而不是另立一个常数：钟面上每五分钟
 * 既是落盘的刻度，也是在案的刻度，一件事只有一条钟。三分钟这种短段照样算一格。
 */
function landedCells(times, span = PERSIST_INTERVAL_MS) {
  const step = Number(span) > 0 ? Number(span) : PERSIST_INTERVAL_MS
  const cells = new Set()
  for (const at of Array.isArray(times) ? times : []) {
    if (!Number.isFinite(at)) continue
    cells.add(Math.floor(at / step) * step)
  }
  return [...cells].sort((a, b) => a - b)
}

/**
 * 那一格整五分钟里落下的东西。
 *
 * 一个事件属于哪一格，由**它到达的时刻**决定：往下取整到整五分钟——和 `landedCells`
 * 同一把尺子（都是 `PERSIST_INTERVAL_MS`：钟面上每五分钟既是落盘的刻度，也是在案的刻度）。
 * 计数方式与整段完全一样（同一张 `TOOL_TAGS`、同一个 `touchedPath`、同一个 `MAX_FILES`），
 * 只是钟面小了一格——不另立一套口径，否则左栏的数字会和见闻录的格子对不上。
 */
function tickOf(draft, at) {
  const step = PERSIST_INTERVAL_MS
  const key = Math.floor(at / step) * step
  let tick = draft.ticks.get(key)
  if (tick === undefined) {
    tick = {
      at: key,
      toolCalls: {},
      fails: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolResults: 0,
      files: [],
      fileSeen: new Set(),
    }
    draft.ticks.set(key, tick)
  }
  return tick
}

/**
 * 这一段落在案上的每一格，连同那一格里的东西——**一格一条**，升序。
 *
 * 见闻录要一格一行（用户 2026-10-08 第 2 条），所以面板得知道每一格里发生了什么，
 * 而 `cells` 只有时刻。两样东西出自同一张表（`draft.ticks`），不会打架：
 * `cells` 就是 `ticks.map((tick) => tick.at)`。
 *
 * **只列有事件的那几格**：中间空着的五分钟不在里面，由客户端按首尾补齐
 * （见 src/client.js 的 rowUnits）——「在案」是事实，「铺满整条梯子」是渲染的事。
 */
function ticksOf(draft) {
  const have = draft?.ticks instanceof Map ? [...draft.ticks.values()] : []
  return have
    .filter((tick) => Number.isFinite(tick?.at))
    .sort((a, b) => a.at - b.at)
    .map((tick) => ({
      at: tick.at,
      // 这一格里有几次工具调用。认不出来的工具也数进去——那是「你做了什么」的总数。
      actions: Object.values(tick.toolCalls ?? {}).reduce((sum, n) => sum + n, 0),
      counts: countsOf(tick),
      files: [...tick.files],
      fails: tick.fails ?? 0,
      // 这一格自己的标签。`minutes` 给 0：一格只有五分钟，说「一小会儿」「坐了很久」
      // 都是胡说；动作标签和钟点标签（深夜 / 很晚了）照旧。
      tags: classify({ ...tick, minutes: 0, startedAt: tick.at, endedAt: tick.at }),
    }))
}

/** 从会话事件里尽量抠出工具名。字段名各版本可能不同，所以逐个试。 */
function toolNameOf(event) {
  const data = event?.data
  if (data === null || typeof data !== 'object') return undefined
  for (const key of ['name', 'toolName', 'tool']) {
    if (typeof data[key] === 'string' && data[key] !== '') return data[key]
  }
  return undefined
}

/**
 * 这次工具调用碰的是哪个文件。
 *
 * **只看路径，绝不看参数里的其它内容**——比如 `edit` 的 `old_string`/`new_string`
 * 就是真代码，那是纯粹的对话内容，一个字节都不碰。这里做的事情和读交付物文件名
 * 是同一类：把宿主本来就在台面上的元数据记下来。
 *
 * 只对「改文件」类的工具感兴趣：翻文件那种读一眼就走的不算「你动过的东西」。
 * 路径字段各版本可能不同（`path` / `file_path` / `filePath`），逐个试。
 */
function touchedPath(tool, rawArguments) {
  const tag = TOOL_TAGS.find(([re]) => re.test(tool))?.[1]
  if (tag !== '改文件') return undefined
  let args = rawArguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return undefined
    }
  }
  if (args === null || typeof args !== 'object') return undefined
  for (const key of ['path', 'file_path', 'filePath', 'notebook_path']) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

/**
 * 每个动作各做了几次——左栏「你做了什么」的原料。
 *
 * 与 `classify` 共用同一张 `TOOL_TAGS` 表，所以左栏的数字和标签永远对得上；
 * 认不出的工具直接丢掉，不硬编一个「其它」出来。
 */
function countsOf(signals) {
  const tally = new Map()
  for (const [tool, n] of Object.entries(signals?.toolCalls ?? {})) {
    if (!Number.isFinite(n) || n <= 0) continue
    const tag = TOOL_TAGS.find(([re]) => re.test(tool))?.[1]
    if (tag === undefined) continue
    tally.set(tag, (tally.get(tag) ?? 0) + n)
  }
  // 次数多的排前面：左栏第一眼看到的是那天最花力气的那件事。
  return Object.fromEntries([...tally.entries()].sort((a, b) => b[1] - a[1]))
}

/**
 * 创建一个记录器。它不认识 Cordis，也不碰磁盘——所有 I/O 由调用方负责，
 * 这样它可以用假事件直接测。
 *
 * @param options.now - 取当前时间，默认 `Date.now`（可注入以便测试）。
 */
function createRecorder(options = {}) {
  const now = options.now ?? (() => Date.now())

  /** @type {Map<string, object>} 会话 id → **当前那一段**的记录 */
  const drafts = new Map()
  /** @type {Map<string, object>} 记录 id → 已经收尾的那几段 */
  const done = new Map()

  /** @type {Map<string, number>} 会话 id → 已经发出过几段（见 `startDraft`） */
  const seqOf = new Map()

  /** 开一段新的。第 1 段沿用会话 id，之后的段派生 `#2`、`#3`…… */
  function startDraft(session, seq, startedAt) {
    const sessionId = String(session?.id ?? 'unknown')
    return {
      id: seq === 1 ? sessionId : `${sessionId}#${seq}`,
      sessionId,
      seq,
      startedAt,
      endedAt: startedAt,
      cwd: session?.header?.cwd,
      userMessages: 0,
      assistantMessages: 0,
      toolResults: 0,
      toolCalls: {},
      // 工具报错了几回。见 event() 里 tool/result 那一段。
      fails: 0,
      // 每一个事件到达的时刻。用来算「真正坐了多久」——见 activeMinutes。
      times: [],
      // 每一格整五分钟里落下的东西：`Map<对齐后的时刻, 那一格的计数>`（见 tickOf / ticksOf）。
      // `times` 是「什么时候有事」，这里是「那一格里有什么」——见闻录一格一行就靠它。
      ticks: new Map(),
      // 动过手的文件名（只留路径）。左栏那句「动了 src/client.js」的原料。
      files: [],
      fileSeen: new Set(),
      // 下面是「让卡片像一段记忆」的四样东西。全都是宿主已经算好、摆在那儿的元数据，
      // 没有一样需要我们去理解对话内容。
      title: undefined,
      titleSource: undefined,
      deliverables: [],
      helpers: [],
      helperIds: new Set(),
    }
  }

  function draftFor(session) {
    const id = String(session?.id ?? 'unknown')
    let draft = drafts.get(id)
    if (draft === undefined) {
      const startedAt = Number(session?.header?.createdAt) || now()
      // 序号只能往前走：同一个会话 id 被 `disposed` 之后再 `created` 一次（恢复旧会话、
      // 宿主重开），从 1 重来的话新记录会顶着旧记录的 id，`mergeRecords` 里「新的赢」
      // 就把先前那一整段吃掉（报告 B-04）。
      const seq = (seqOf.get(id) ?? 0) + 1
      seqOf.set(id, seq)
      draft = startDraft(session, seq, startedAt)
      drafts.set(id, draft)
    }
    return draft
  }

  /**
   * 这一段到此为止，新的一件事另起一段。
   *
   * 触发条件有两条，见 `SPLIT_GAP_MS` / `MAX_STRETCH_MS`。
   * 收尾的那一段如果一句话没说、一个工具没用过，会被 `finalizeDraft` 丢成 `null`。
   */
  function rollOver(session, draft, at) {
    const record = finalizeDraft(draft)
    if (record !== null) done.set(record.id, record)
    const sessionId = String(session?.id ?? 'unknown')
    const seq = Math.max(seqOf.get(sessionId) ?? 0, draft.seq ?? 1) + 1
    seqOf.set(sessionId, seq)
    const next = startDraft(session, seq, at)
    drafts.set(sessionId, next)
    return next
  }

  function finalizeDraft(draft) {
    const toolCalls = Object.values(draft.toolCalls ?? {}).reduce((sum, n) => sum + n, 0)
    if ((draft.userMessages ?? 0) === 0 && toolCalls === 0) return null
    const minutes = activeMinutes(draft.times, draft.startedAt, draft.endedAt)
    // 一格一条：见闻录一行就是一格（用户 2026-10-08 第 2 条）。
    const ticks = ticksOf(draft)
    return {
      id: draft.id,
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      minutes,
      // 每五分钟一格，落在案上的那几格（用户 2026-10-08 的要求）。
      // 与下面的 `ticks` 同源，`cells` 只是它们的时刻（旧版客户端和别处还在读它）。
      cells: landedCells(draft.times),
      // 那一格里各自发生了什么。面板按这条梯子铺成一行一行（见 src/client.js 的 rowUnits）。
      ticks,
      cwd: draft.cwd,
      project: projectOf(draft.cwd),
      title: draft.title,
      deliverables: [...(draft.deliverables ?? [])],
      helpers: [...(draft.helpers ?? [])],
      // 「你做了什么」的忠实版本：每个动作各几次、动了哪些文件。
      // 只有数字和路径，没有任何一句你说过的话。
      actions: toolCalls,
      counts: countsOf(draft),
      files: [...(draft.files ?? [])],
      // 撞了几回墙。右栏「他在洞窟口挨了两下」的来源。
      fails: draft.fails ?? 0,
      tags: classify({ ...draft, minutes }),
    }
  }

  return {
    /** 会话建好了，开始计时。子代理不算。 */
    created(session) {
      if (isSubagentHeader(session?.header)) return
      draftFor(session)
    },

    /**
     * 来了一个事件，累加计数。
     * **这里从不读 `user/message` / `assistant/message` 的正文**——它只数条数。
     * 读到的三样东西都不是对话内容：会话标题（宿主起的名字）、交付物文件名、帮手标签。
     */
    event(session, event) {
      if (isSubagentHeader(session?.header)) return
      let draft = draftFor(session)
      const type = String(event?.type ?? '')
      const at = Number(event?.time)
      // 这一格（整五分钟）里的账。事件没有时刻就算不进去——那几格本来也没法落定。
      let tick = null
      if (Number.isFinite(at)) {
        // 这一段真正的起点是**第一件事**，不是会话的 `createdAt`。
        //
        // `createdAt` 只说明「这个会话开过」：昨天 09:00 开的会话，今天 10:00 才接着说
        // 完全正常（实测里跨 52 小时的都有）。拿它当起点会造出一条「开始昨天 09:00、
        // 结束今天 10:00、minutes 0、actions 1」的幽灵记录——横跨两天、却没有一刻在坐着。
        // 所以第一件事一到，起点就落到它身上；切段判据 `times.length > 0` 也就有了
        // 正确的含义：「已有一件事 ⇒ 起点已定，才谈得上停下来」。
        if (draft.times.length === 0) {
          draft.startedAt = at
          draft.endedAt = at
        }
        // 停久了、或者这一段已经够长了 → 收尾，从这一件事开始另起一段。
        const stale = draft.times.length > 0
          && (at - draft.endedAt > SPLIT_GAP_MS || at - draft.startedAt >= MAX_STRETCH_MS)
        if (stale) draft = rollOver(session, draft, at)
        draft.endedAt = Math.max(draft.endedAt, at)
        draft.times.push(at)
        tick = tickOf(draft, at)
      }

      if (type === 'user/message') {
        draft.userMessages += 1
        if (tick !== null) tick.userMessages += 1
      } else if (type === 'assistant/message') {
        draft.assistantMessages += 1
        if (tick !== null) tick.assistantMessages += 1
      } else if (type === 'tool/result') {
        draft.toolResults += 1
        if (tick !== null) tick.toolResults += 1
        // 工具报错了几回。这是他那边唯一一样诚实的「麻烦」：
        // 你在这一头撞了墙，他在那一头挨了两下——不读结果正文，只看那个布尔。
        if (event?.data?.message?.isError === true) {
          draft.fails += 1
          if (tick !== null) tick.fails += 1
        }
      } else if (type === 'tool/call') {
        const tool = toolNameOf(event)
        if (tool !== undefined) {
          draft.toolCalls[tool] = (draft.toolCalls[tool] ?? 0) + 1
          if (tick !== null) tick.toolCalls[tool] = (tick.toolCalls[tool] ?? 0) + 1
          const path = touchedPath(tool, event?.data?.arguments)
          if (path !== undefined && !draft.fileSeen.has(path)) {
            draft.fileSeen.add(path)
            if (draft.files.length < MAX_FILES) draft.files.push(path)
          }
          // 那一格动过手的文件名：同一套规矩——只记路径、同一个上限、不许重复。
          if (tick !== null && path !== undefined && !tick.fileSeen.has(path)) {
            tick.fileSeen.add(path)
            if (tick.files.length < MAX_FILES) tick.files.push(path)
          }
        }
      } else if (type === 'session/title') {
        const data = event?.data ?? {}
        const title = typeof data.title === 'string' ? data.title.trim() : ''
        if (title !== '') {
          const kind = data.source?.kind ?? 'unknown'
          // 后面来的标题盖掉前面的——但别让「兜底标题」（第一句话的截断，又长又生硬）
          // 盖掉真正起好的那个名字。
          const downgrade = kind === 'fallback' && draft.titleSource !== undefined && draft.titleSource !== 'fallback'
          if (!downgrade) {
            draft.title = title
            draft.titleSource = kind
          }
        }
      } else if (type === 'deliverables/presented') {
        const files = event?.data?.files
        if (Array.isArray(files)) {
          for (const file of files) {
            const path = file?.path
            if (typeof path === 'string' && path !== '' && !draft.deliverables.includes(path)) {
              draft.deliverables.push(path)
            }
          }
        }
      } else if (type === 'subagent/catalog') {
        const data = event?.data ?? {}
        const key = String(data.childId ?? data.label ?? draft.helpers.length)
        if (!draft.helperIds.has(key)) {
          draft.helperIds.add(key)
          draft.helpers.push(typeof data.label === 'string' && data.label !== '' ? data.label : key)
        }
      }
    },

    /**
     * 会话结束了，把这间屋子收起来。
     * 开门看了一眼就走的那种会话收不出卡片，返回 `undefined`。
     *
     * 注意：会话中途停久了会自动切段（见 `rollOver`），先前那几段早已在 `done` 里；
     * 这里收的是**最后一段**，返回值只代表它。
     */
    disposed(session) {
      if (isSubagentHeader(session?.header)) return undefined
      const id = String(session?.id ?? 'unknown')
      const draft = drafts.get(id) ?? draftFor(session)
      const record = finalizeDraft(draft)
      drafts.delete(id)
      if (record !== null) done.set(record.id, record)
      return record ?? undefined
    },

    /**
     * 把一份草稿收成一张卡片。
     *
     * **一句话都没说、一个工具也没用过，就返回 `null`——那不算一段时光。**
     * 实测里那些「进门看了一眼就退出去」的会话只留下 `session` / `permission/preset` /
     * `sandbox/mode` / `session/end-seed` 这几条开机事件，收成卡片就是一张
     * 只有日期、背面写着「那天你在。」的空壳。时间线上多几张这种东西，
     * 整间屋子就从「记忆」变成了「日志」。
     */
    finalize(draft) {
      return finalizeDraft(draft)
    },

    /** 已经收尾的那几段 + 现在还开着的那一段（崩了也不至于一张都不剩）。 */
    snapshot() {
      const live = [...drafts.values()]
        .map((draft) => finalizeDraft(draft))
        .filter((record) => record !== null)
      return [...done.values(), ...live]
    },
  }
}

/**
 * 把新记录并进旧记录里，按 id 去重（新的赢），按开始时间倒序，只留最近若干条。
 */
function mergeRecords(existing, incoming) {
  const byId = new Map()
  for (const record of existing) if (record?.id) byId.set(String(record.id), record)
  for (const record of incoming) if (record?.id) byId.set(String(record.id), record)
  return [...byId.values()]
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    .slice(0, MAX_RECORDS)
}

/** 当地零点。`keepToday` 用它划「今天」这条线。 */
function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 把记录分成「今天」与「更早」。
 *
 * 一条记录算哪一天，看它**最后一次动**（`endedAt`）：跨午夜的那一张卡是从昨晚一路铺到
 * 今天来的，它属于今天——按 `startedAt` 划的话，今天早上会平白少掉半截。
 */
function keepToday(records, now = Date.now()) {
  const todayFrom = startOfDay(now)
  const kept = []
  const gone = []
  for (const record of records) {
    const last = Number(record?.endedAt) || Number(record?.startedAt) || 0
    if (last >= todayFrom) kept.push(record)
    else gone.push(record)
  }
  return { kept, gone }
}

/**
 * 旧日子真删（用户 m01403 第 2 条：「旧日子删除」）。
 *
 * 交出去、写回盘的记录**只有今天**。但删掉的东西里有两件是「接缝」不是「日子」，
 * 得留下来，否则每天都会缺一句话：
 *   · `since`——这份存档的**头一天**。序曲（「他叫塔里恩」那六句）认它：只有今天就是
 *     头一天才说。不留它，序曲每天都会重播一遍。
 *   · `seam`——**最近那一段被删掉的**（`{ startedAt, endedAt }`）。今天第一行上面那句
 *     「隔了一夜」认它。不留它，每天的头一行都是凭空起头。
 * 两个都从**全部历史**里算：升级到 8 那一次回填会把所有会话重新读成记录，所以拿到的是
 * 真头一天与真上一段，而不是盘上还留着的那几条。
 *
 * 只记两个标量、不记内容——「不保存过去的事」这条底线还在。
 *
 * 8 → 9 又多了第三个标量 `dayStart`（按下「开始冒险」那一刻，见下面那一段）：它不是内容，
 * 是「今天从哪一刻开始算」的一个时刻。
 */
function pruneStore(records, meta = {}, now = Date.now()) {
  const { kept, gone } = keepToday(records, now)
  let since = Number(meta?.since) || 0
  for (const record of records) {
    const at = Number(record?.startedAt) || 0
    if (at && (!since || at < since)) since = at
  }
  let seam = meta?.seam && Number(meta.seam.startedAt) ? meta.seam : null
  // 挑「上一段」按**结束**算，不按开始：昨天 08:00–23:59 与 22:00–22:10 两段并存时，
  // 后者开始得晚、结束得早；真正「最后坐下的那一刻」是 23:59。按 startedAt 挑会把
  // seam 记成 22:10，今天第一行上面那句「隔了一夜」就凭空长出 1 小时 49 分（报告 B-03）。
  const seamEnd = (one) => Number(one?.endedAt) || Number(one?.startedAt) || 0
  for (const record of gone) {
    const at = Number(record?.startedAt) || 0
    if (!at) continue
    const end = Number(record?.endedAt) || at
    if (!seam || end > seamEnd(seam)) {
      seam = { startedAt: at, endedAt: end }
    }
  }
  // 按下「开始冒险」那一刻（8 → 9，用户 m04200）。它只对**当天**有意义：跨过零点，
  // 昨天那个起点跟今天没关系了，清成 0，等他今天再按一次（界面认出 0 就摆那颗按钮）。
  // 留着一条陈旧时刻比清掉更坏——今天的记录会被昨天的起点「放行」，
  // 而那正是这一版要修掉的东西（打开就见几行不属于今天的冒险）。
  const pressed = Number(meta?.dayStart) || 0
  const dayStart = pressed && startOfDay(pressed) === startOfDay(now) ? pressed : 0
  // 起点之前就结束的那些，一条都不留（不是藏起来）。写盘、GET、下一次落盘都走这里，
  // 所以内存里那几段按旧起点攒出来的草稿不会在下一轮被写回盘上（用户 m04200）。
  const fresh = dayStart
    ? kept.filter((record) => (Number(record?.endedAt) || Number(record?.startedAt) || 0) >= dayStart)
    : kept
  return { version: STORE_VERSION, records: fresh, since, seam, dayStart }
}

// ---------------------------------------------------------------------------
// 回填：第一次推开门的时候，屋里不该是空的
// ---------------------------------------------------------------------------

/** zstd frame 的魔数。会话文件是**多个独立 frame 拼接**的，不是一个 frame。 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * 把一个 `session.v4.jsonl.zstd` 解成事件数组。
 *
 * `zlib.zstdDecompressSync` **只解第一个 frame**，而 header 恰好独占第一个 frame——
 * 只调一次的话，你会以为每个会话都只有 206 字节、零个事件。所以要自己按魔数
 * 切帧、逐帧解、再拼起来。解不开的帧直接跳过：半截的尾帧或者将来格式变了，
 * 都不该让整段记忆丢掉。
 */
function decodeSessionFile(buf) {
  const offsets = []
  let at = buf.indexOf(ZSTD_MAGIC, 0)
  while (at !== -1) {
    offsets.push(at)
    at = buf.indexOf(ZSTD_MAGIC, at + 1)
  }
  let text = ''
  for (let i = 0; i < offsets.length; i++) {
    const slice = buf.subarray(offsets[i], i + 1 < offsets.length ? offsets[i + 1] : buf.length)
    try {
      text += zstd(slice).toString('utf8')
    } catch {
      /* 跳过这一帧 */
    }
  }
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      /* 跳过这一行 */
    }
  }
  return events
}

/**
 * 把一串事件喂给**同一个** `createRecorder`，得到和实时记录一模一样的卡片。
 * 复用是关键：回填不引入第二套逻辑，也就不会和实时记录长出两套口径。
 *
 * 返回的是**数组**：一场会话中间停久了会被切成好几段，每一段都是一行见闻录。
 * 全是空段（进门看了一眼就走）时返回 `[]`。
 */
function recordFromEvents(events) {
  const header = events.find((event) => event?.type === 'session')
  if (header === undefined || isSubagentHeader(header)) return []
  const session = { id: header.id, header }
  const recorder = createRecorder()
  recorder.created(session)
  for (const event of events) {
    if (event === header) continue
    recorder.event(session, event)
  }
  recorder.disposed(session)
  return recorder.snapshot()
}

/**
 * 把本机已经存在的会话日志整个翻一遍。单个文件出问题不影响其他文件。
 *
 * `options.mtimeFrom`：只要**改过的时间不早于**它的会话文件。升级、重装时若存档里
 * 已经有 `since`，真头一天与上一段接缝都已经记在盘上，回填只需要把**今天**的会话补
 * 成记录——把整棵 `sessions/` 重新解一遍（几百个 zstd 文件）纯粹是白烧启动时间。
 * 没有 `since` 的那一次必须全量扫：序曲要的是真实最早那天（报告 B-04 那一节）。
 */
async function backfillSessions(home = resolveDshHome(), options = {}) {
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024
  const mtimeFrom = Number(options.mtimeFrom) || 0
  const records = []
  if (zstd === null) return records
  const root = join(home, 'sessions')
  let workspaces = []
  try {
    workspaces = await readdir(root, { withFileTypes: true })
  } catch {
    return records
  }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    let sessions = []
    try {
      sessions = await readdir(join(root, workspace.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const file = join(root, workspace.name, session.name, 'session.v4.jsonl.zstd')
      try {
        const info = await stat(file)
        if (!info.isFile() || info.size > maxBytes) continue
        if (mtimeFrom > 0 && info.mtimeMs < mtimeFrom) continue
        for (const record of recordFromEvents(decodeSessionFile(await readFile(file)))) {
          records.push(record)
        }
      } catch {
        /* 这个会话读不动，跳过 */
      }
    }
  }
  return records
}

// ---------------------------------------------------------------------------
// Cordis 插件入口
// ---------------------------------------------------------------------------

/**
 * 按下「开始冒险」：**这一刻**才算这一天的起点（8 → 9，用户 m04200 逐字：
 * 「不是，我刚刚点开，就已经存在2条冒险在里面了，这是不对的。当用户点开的时候，
 * 才会开始计算时间，并到下一个5分钟的时候才会落盘。」）。
 *
 * 做两件事，缺一件都不算数：
 *   · 记下 `dayStart = at`（与 `since`/`seam` 并列的第三个标量）。GET 会把它交回去，
 *     界面据此决定「今天铺不铺、从哪一格起铺」；
 *   · 把**在 at 之前就结束**的记录删掉。不是藏起来——按下的那一刻之前，这一天还没开场，
 *     那几行本来就不属于这一场（用户要的正是「刚点开却已经有 2 条冒险」不再出现）。
 *
 * `since`/`seam` 原样带着走：前者是序曲的，后者是「隔了一夜」的，都跟这一下无关。
 * 内存里那几段草稿不在这里清——写盘与 GET 都会走 `pruneStore`，它按同一个 `dayStart`
 * 把「在起点之前就结束」的记录一并滤掉（见 pruneStore），所以不会被下一次落盘复活。
 *
 * @returns {Promise<{dayStart: number, dropped: number}>}
 */
async function startDay(file, at, recorder, warn, now = Date.now()) {
  const store = await readStore(file, warn)
  // 读不动就别按：宁可这一下没成，也不能把读不出来的记录当成「起点之前的」删掉。
  if (store.blocked) throw new Error(`存档读不动，这一下不记：${file}`)
  const merged = mergeRecords(store.records, recorder.snapshot())
  const next = pruneStore(merged, { ...store, dayStart: at }, now)
  const dropped = merged.length - next.records.length
  await writeJsonAtomic(file, next)
  return { dayStart: next.dayStart, dropped }
}

/**
 * 挂上会话监听和取数据的路由。
 *
 * @param ctx - Cordis 上下文（已保证 `webServer` 可用，见 `inject`）。
 */
function apply(ctx) {
  const file = storeFile()
  const recorder = createRecorder()
  /** 只在有事要说的时候出声：坏存档、读不动、写失败。 */
  const warn = (message) => ctx.logger?.warn?.(message)

  /**
   * 推开门之前先把屋子布置好：把本机已有的会话日志整个翻一遍，补成卡片。
   *
   * 只在「文件不存在」或「版本低于 2」时跑。**版本判断是关键**——你第一次装这个插件
   * 的时候，磁盘上多半已经躺着一份 version 1 的记录（那阵子只记时间，没有标题、
   * 交付物和帮手），如果只按「文件存不存在」判断，回填永远不会发生，屋子就一直是空的。
   *
   * 这个 promise 同时是写盘链条的头：之后的每一次 persist 都排在它后面，
   * 于是回填的底座一定先落稳，增量再往上叠。
   */
  const bootstrap = (async () => {
    const store = await readStore(file, warn)
    // 存档读不动（不是坏、不是没有，就是这一下读不到）：这一轮什么都别写。
    // 回填与裁剪都可以等下一次，用户的记录不能因为一次读失败而清零。
    if (store.blocked) return
    let version = 0
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      version = Number(parsed?.version ?? 0)
    } catch {
      version = 0 // 文件不在、或者是坏的——两种情况都按「从零开始」处理
    }
    // 两件事都要做，而且理由不同：
    //   · 版本老了 ⇒ 回填（版本号是让回填重跑的唯一开关）；
    //   · 盘上还留着昨天（或更早）⇒ 裁。**隔夜再开门时版本号没变**，
    //     但「只有今天」这条规矩得重新执行一遍，否则昨天那一整页还挂在墙上。
    const needsBackfill = version < STORE_VERSION
    // 盘上已经记着「这份存档的头一天」时，今天之前的会话早就被裁掉了，`since`/`seam`
    // 也在存档里躺着——这一次回填只要今天的，不必把整棵 sessions/ 重新解一遍。
    // 反过来，`since` 缺失（第一次装、存档被清过）就必须全量扫：只有全量才能算出真头一天，
    // 少了它序曲每天都会重播一遍。
    const mtimeFrom = store.since > 0 ? startOfDay(Date.now()) : 0
    const backfilled = needsBackfill ? await backfillSessions(resolveDshHome(), { mtimeFrom }) : []
    const merged = mergeRecords(store.records, backfilled)
    const pruned = pruneStore(merged, store)
    if (!needsBackfill && pruned.records.length === merged.length) return
    // 一条记录、一个标量都没有，就别凭空造个空文件出来
    if (pruned.records.length === 0 && !pruned.since && !pruned.seam) return
    await writeJsonAtomic(file, pruned)
  })().catch((error) => {
    ctx.logger?.warn?.(`dsh-game-adventure: 回填出错：${String(error)}`)
  })

  let writing = bootstrap

  /**
   * 有没有新东西要写。定时落盘靠它决定要不要动文件——
   * 一晚上没事发生就不该每五分钟重写一遍同一份 JSON。
   */
  let dirty = false

  /** 串行落盘：任何时刻只有一个写操作在跑，后写的等前一个。 */
  function persist({ force = false } = {}) {
    if (!force && !dirty) return writing
    dirty = false
    writing = writing
      .then(async () => {
        // 2026-11-01（开关）：关着的时候一律不落盘——「完全关闭」是连记录都不再长。
        if (await offNow()) return
        const store = await readStore(file, warn)
        // 读不动就别写：宁可这一轮不落盘，也不能把读不出来的记录覆盖成空的。
        if (store.blocked) throw new Error(`存档读不动，这一轮不落盘：${file}`)
        const merged = mergeRecords(store.records, recorder.snapshot())
        await writeJsonAtomic(file, pruneStore(merged, store))
      })
      .catch((error) => {
        dirty = true // 写失败就把「要写」的旗子插回去，下一次定时器再试
        ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)))
      })
    return writing
  }

  // 记录这件事本身绝不能把宿主搞崩：任何一次写盘/分类的意外都只写进日志。
  const guard = (label, fn) => {
    try {
      return fn()
    } catch (error) {
      ctx.logger?.warn?.(`dsh-game-adventure: ${label} 出错：${String(error)}`)
      return undefined
    }
  }

  guard('监听 session/created', () => ctx.on('session/created', (session) => {
    guard('created', () => recorder.created(session))
    dirty = true
  }))

  guard('监听 session/event', () => ctx.on('session/event', (session, event) => {
    guard('event', () => recorder.event(session, event))
    dirty = true
  }))

  // `session/flush` 是框架的「可以落盘了」检查点——顺手把还开着的会话也存一次，
  // 这样即使进程被硬杀，也不会整段记忆都留在内存里。
  guard('监听 session/flush', () => ctx.on('session/flush', () => {
    void persist({ force: true })
  }))

  guard('监听 session/disposed', () => ctx.on('session/disposed', (session) => {
    guard('disposed', () => recorder.disposed(session))
    void persist({ force: true })
  }))

  /**
   * 定时落盘。
   *
   * 一场对话可以开好几个小时，而进程被硬杀时内存里的记录全没了——那时候
   * `session/disposed` 永远不会到。每五分钟存一次，最坏丢掉五分钟。
   *
   * **对齐到整五分钟**（用户 2026-10-04 第 3 条：「我们落盘的时间总是不固定的，
   * 要么我们固定为5分钟落定一次，这样在时间上比较好看，都是5的倍数在增加，
   * 也有秩序」）。`setInterval` 是从插件启动那一刻起算的，所以落盘时刻会落在
   * 12:03、12:08 这种零头上；这里改成先睡到下一个整五分（`:00 :05 :10 …`），
   * 之后每次再掐下一个整五分，钟面上就是一条整齐的刻度。
   *
   * `unref()` 是必须的：一个永远不结束的定时器会把宿主进程钉住不退出。
   * `ctx.effect` 里清掉它，插件被卸载时不留下一个野定时器。
   */
  guard('注册定时落盘', () => {
    let timer = null
    const arm = () => {
      timer = setTimeout(() => {
        void persist()
        arm()
      }, msToTick(Date.now(), PERSIST_INTERVAL_MS))
      if (timer && typeof timer.unref === 'function') timer.unref()
    }
    arm()
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => clearTimeout(timer), 'dsh-game-adventure.persist-timer')
    }
  })

  const route = {
    kind: 'prefix',
    path: ROUTE_PATH,
    async handler(req, res) {
      const url = new URL(req.url ?? '/', 'http://localhost')

      // --- 量尺寸（开发钩子，开关是一个文件；见 MEASURE_SEGMENTS） ---------
      if (url.pathname === `${ROUTE_PATH}/measure`) {
        // 只认本机回环：这是一个取证通道，永远不该从外面打得进来。
        // 不做签名、不做 token——它不是对外接口，加一套鉴权只是给自己添维护面。
        const remote = String(req.socket?.remoteAddress ?? '')
        if (!LOOPBACK.has(remote)) {
          sendJson(res, 403, { ok: false, why: '量尺寸只接受本机回环来源' })
          return
        }
        const on = await fileExists(join(resolveDshHome(), ...MEASURE_SEGMENTS))
        if (req.method === 'GET') {
          sendJson(res, 200, { on })
          return
        }
        if (req.method === 'POST') {
          if (!on) {
            sendJson(res, 403, { ok: false, why: '量尺寸的开关没开（要在 DSH 主目录里放一个 gameflow/measure.on）' })
            return
          }
          let raw = ''
          try {
            raw = await readBody(req, MAX_MEASURE_BYTES)
          } catch {
            sendJson(res, 413, { ok: false, why: 'body too large' })
            return
          }
          let payload = null
          try {
            payload = JSON.parse(raw)
          } catch {
            sendJson(res, 400, { ok: false, why: 'body is not JSON' })
            return
          }
          const dir = join(resolveDshHome(), ...MEASURE_DIR_SEGMENTS)
          // 交回来的是哪一份：版面（默认）还是「翻文案跟不跟手」那一份。
          // 分开落盘，免得一次取证把上一次的版面数字覆盖掉（见 client.js 的 startScrollWatch）。
          const file = payload?.kind === 'scroll' ? 'scroll.json' : 'layout.json'
          try {
            await writeJsonAtomic(join(dir, file), payload)
            if (typeof payload?.map === 'string' && payload.map !== '') {
              await writeTextAtomic(join(dir, 'map.svg'), payload.map)
            }
          } catch (error) {
            sendJson(res, 500, { ok: false, why: String(error) })
            return
          }
          sendJson(res, 200, { ok: true, dir, file, items: Array.isArray(payload?.items) ? payload.items.length : 0 })
          return
        }
      }

      // --- 按下「开始冒险」：这一天从这一刻算起（8 → 9，用户 m04200） -------------
      if (url.pathname === `${ROUTE_PATH}/start`) {
        // 同 measure：只认本机回环。它改的是盘上的存档，比取证通道还该拦在外面。
        const remote = String(req.socket?.remoteAddress ?? '')
        if (!LOOPBACK.has(remote)) {
          sendJson(res, 403, { ok: false, why: '开始冒险只接受本机回环来源' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, why: '这一条只收 POST' })
          return
        }
        let raw = ''
        try {
          raw = await readBody(req, MAX_START_BYTES)
        } catch {
          sendJson(res, 413, { ok: false, why: 'body too large' })
          return
        }
        let payload = null
        try {
          payload = JSON.parse(raw === '' ? '{}' : raw)
        } catch {
          sendJson(res, 400, { ok: false, why: 'body is not JSON' })
          return
        }
        const at = Number(payload?.at)
        if (!Number.isFinite(at) || at <= 0) {
          sendJson(res, 400, { ok: false, why: 'at 得是一个时刻（毫秒）' })
          return
        }
        // 排进写盘链条：这一下也在改同一份文件，不能和定时落盘、回填抢。
        const task = writing.then(() => startDay(file, at, recorder, warn))
        writing = task.catch((error) => {
          warn(`dsh-game-adventure: 记下开始冒险失败：${String(error)}`)
        })
        try {
          const next = await task
          sendJson(res, 200, { ok: true, ...next })
        } catch (error) {
          sendJson(res, 500, { ok: false, why: String(error) })
        }
        return
      }

      if (req.method !== 'GET' || url.pathname !== `${ROUTE_PATH}/records`) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end()
        return
      }
      // 磁盘上的是权威；内存里的草稿只是还没落盘的部分。
      // **应答这一条也裁**（不只是写盘时裁）：这样界面立刻就不见旧日子了，
      // 不必等到下一次整五分落盘。旧日子删掉之后，盘上留着的本来也只剩今天。
      const store = await readStore(file, warn)
      const merged = mergeRecords(store.records, recorder.snapshot())
      const pruned = pruneStore(merged, store)
      const body = JSON.stringify({
        version: STORE_VERSION,
        records: pruned.records,
        since: pruned.since,
        seam: pruned.seam,
        // 8 → 9：他按下「开始冒险」那一刻（见 startDay）。界面据此决定今天铺不铺、
        // 从哪一格起铺——没有它（没按过、老存档）就退回「今天零点」的老规矩。
        dayStart: pruned.dayStart,
        // 2026-11-01：开关。界面据此把整扇门摘掉 / 挂回来（见 client 的 setEnabled）。
        enabled: !(await offNow()),
      })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    },
  }

  // `ctx.effect` 是 Cordis 的「可清理副作用」注册口。万一它不在（比如更老的运行时），
  // 就直接注册——路由少一次自动清理，也总好过插件加载失败拖垮整个 boot。
  guard('注册取数据的路由', () => {
    if (typeof ctx.effect === 'function') ctx.effect(() => ctx.webServer.register(route), 'dsh-game-adventure.route')
    else ctx.webServer.register(route)
  })
}

export {
  PERSIST_INTERVAL_MS,
  STORE_VERSION,
  activeMinutes,
  apply,
  backfillSessions,
  classify,
  countsOf,
  createRecorder,
  decodeSessionFile,
  inject,
  isSubagentHeader,
  keepToday,
  landedCells,
  mergeRecords,
  msToTick,
  name,
  pruneStore,
  recordFromEvents,
  resolveDshHome,
  startOfDay,
  storeFile,
  touchedPath,
}
