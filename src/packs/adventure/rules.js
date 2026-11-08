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

export const rules = {
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
