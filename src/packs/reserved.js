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

export const rulesHorror = {
  id: 'rules-horror',
  name: '规则怪谈',
  kind: 'voice',
  free: false,
  soon: true,
  voice: 'rules-horror',
  label: '规则怪谈',
  tagline: '守则贴了满墙，红笔添上去的那一条不在里面。',
}

export const palaceIntrigue = {
  id: 'palace-intrigue',
  name: '宫斗心计',
  kind: 'voice',
  free: false,
  soon: true,
  voice: 'palace-intrigue',
  label: '宫斗心计',
  tagline: '宫里的话都只说一半，另一半留给听的人去猜。',
}

export const espionage = {
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
export const RESERVED = {
  'rules-horror': rulesHorror,
  'palace-intrigue': palaceIntrigue,
  espionage,
}
