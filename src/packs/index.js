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

import { adventure } from './adventure/index.js'
// 世界的规矩是**人写**的（数字对着 client.js 抄下来，再由 `.tmp-acp/verify-rules.mjs`
// 证明与那段代码一字不差），所以跟抽出来的文案分开放：文案可以重抽，规矩不会被冲掉。
import { rules as adventureRules } from './adventure/rules.js'
// 预留的三套风格（规则怪谈 / 宫斗心计 / 谍战潜伏）：只有名字，没有内容。
// 它们进的是 `PACKS`（于是清单里列得出来），但进不了 `VOICES`——装载器只收
// 「有 actionLines 的包」。面板见到 `soon` 就判死：列着、点不动。
import { RESERVED } from './reserved.js'

/**
 * 全部内容包，键就是 id。
 *
 * **这里的顺序就是 `VOICES` 里说法的顺序**（`applyPack` 按 `Object.values` 装），
 * 也就是界面上「故事风格」那张清单里的次序。顺序是行为的一部分，不是随手排的。
 */
export const PACKS = { adventure: { ...adventure, rules: adventureRules }, ...RESERVED }

export const DEFAULT_WORLD = 'adventure'
export const DEFAULT_VOICE = 'adventure'

// 给界面看的字段：`tagline` / `cover` 是「故事风格」那一格（2026-10-06 之前是门后那格
// 书架）上要用的两样；`narrates` 是「这个包讲不讲得出话」——面板拿它决定这一格摆不摆，
// **不必等说法表装进来**（刚注册的包也能立刻出现在清单里）；`soon` 是「预留」——名字
// 先摆上、内容还没写，面板照样列出来但点不动（2026-10-06 晚加，见 `./reserved.js`）。
// 句子本身一律不进清单——清单是给「挑哪个包」用的，不是给渲染用的。
const FACE = ['id', 'name', 'kind', 'free', 'soon', 'voice', 'label', 'tagline', 'cover']

/** 给界面用的清单（不含句子本身）。 */
export function listPacks() {
  return Object.values(PACKS).map((p) => Object.fromEntries(
    FACE.map((k) => [k, p[k]]).concat([['narrates', !!p.actionLines]]),
  ))
}

export function getPack(id) {
  return PACKS[id] || null
}

export function worldIds() {
  return Object.values(PACKS).filter((p) => p.kind === 'world').map((p) => p.id)
}

export function voiceIds() {
  return Object.values(PACKS).filter((p) => p.kind === 'voice').map((p) => p.id)
}

/**
 * 能不能用这个包。付费包在这里返回 false——**收款不归这个插件管**，
 * 授权（许可证文件 / 激活码）校验完之后把 id 传进 `unlocked` 就行。
 */
export function isUnlocked(id, unlocked = []) {
  const pack = PACKS[id]
  if (!pack) return false
  return pack.free === true || unlocked.includes(id)
}

/**
 * 换包：世界包进 `world`、讲述者包进 `voice`。锁着的不切（原样返回）。
 * 纯函数——真正的切换要等接线之后由面板把结果交给 `applyPack`。
 */
export function setPack(choice = { world: DEFAULT_WORLD, voice: DEFAULT_VOICE }, id, unlocked = []) {
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
export function applyPack(target = {}, worldId = DEFAULT_WORLD, voiceId = DEFAULT_VOICE) {
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
