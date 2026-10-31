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

import { applyPack, isUnlocked, listPacks } from './packs/index.js'
import { choiceOf as rulesChoiceOf, dangerOf as rulesDangerOf, directionOf as rulesDirectionOf, fateOf as rulesFateOf, fightOf as rulesFightOf, forkOf as rulesForkOf, momentOf as rulesMomentOf, outcomeOf as rulesOutcome, resultOf as rulesResultOf, stationOf as rulesStationOf, worldWeights as rulesWeights } from './packs/rules.js'
// 地方图：**世界图的第二级**。同一套 `world3` 数据、同一个坐标系，只是取景框缩到
// 22×11.35（世界图 66×34 的九分之一面积、三倍线性分辨率）。点一下全图就进这一级——
// 见 buildStage 底下 zoomEnter / zoomDraw / zoomSwap。
// `build_local` 是 `.scratch/local.py` 的等值移植（逐字节对过二十座城），
// `focusAt` 是「这个世界坐标属于哪座城」，`LF_CSS` 是地方图那一条 `.lf`（田里的犁沟）——
// 它住在 `LOCAL_CSS` 里，面板得自己接上，不然镜内犁沟一条都不画。
import { build_local, focusAt, LF_CSS } from './map/local.js'
// 地名签往哪儿摆：跟地图自己那块牌子用**同一条算式**（`plate_rect`），
// 并且要躲开图上已有的字与记号（2026-10-30 地图审计 M-4/M-14）。
import { placeLabel, PLACE_FS } from './map/world.js'
// 地图那边的数字格式化（Python `'{:.2f}'.format` 的等值版）——`toFixed` 在恰好一半时
// 的进位方向跟 Python 不一样，取景框的补间要用同一套。
import { f2 } from './map/geo.js'

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
export let MAP_SVG = ''
export let MAP_CSS = ''

/* ------------------------------------------------------------------ *
 * 主题：功能完全一样，只换一层皮
 * ------------------------------------------------------------------ */

export const THEMES = {
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
   光栅一次，之后全靠合成器搬。viewBox 用的还是当年的世界单位。 */
.gf-pin-glyph {
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
export let SHARED_LINES = {
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
export let HOME_LINES = [
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
export let WORLD_LINES = {
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
export let WORLD_QUIET = [
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

export let VOICES = {
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
export let DEFAULT_VOICE = 'adventure'

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
export let SCENES = {
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
export let SHARDS = {
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

export const OUT_SCENES = {
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

export const OUT_SHARDS = {
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
export let OUT_KEYS = new Set(Object.values(OUT_SCENES).flat().map((s) => s.key))

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
export const HURT_PATCH = {
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
export let CAST = {
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
export let CAST_LINES = {
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

export function composeSequence(entries, voice = DEFAULT_VOICE) {
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
export function hisTags(tags, voice = DEFAULT_VOICE, seed = '', first = '') {
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
export function narrationFor(entries, now, voice = DEFAULT_VOICE) {
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
export function placeOf(entry) {
  const mins = entry?.minutes || 0
  if (mins > 0 && mins <= 5) return 'home'
  const act = mainAction(entry?.tags || [], entry?.counts)
  return act ? ACTION_PLACE[act] : 'home'
}

/** 见闻录里那一天的他 */
export function dayLine(entry, voice = DEFAULT_VOICE) {
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
export const SOURCE_CONTENT = {
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
export let MOMENTS = []

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
export let DAY_FRAME = { open: {}, close: {}, meal: {} }

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
export let CLASHES = {}

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
export let ORIGIN = { name: '', lines: [] }

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
export let DIRECTIONS = []

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
export let FATES = []

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
export let MARKS = {}

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
export let FIGHTS = null

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
export let JOURNEY = null

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
export let FORKS = null

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
export function dayFrameOf(entry, partial = false) {
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
export function mealOf(entry, prev = null) {
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
export let WORLD_ID = ''
export let WORLD_LABEL = ''

/**
 * 这个世界**自己那套说法**的 id（`world.voice`），由 `applyPack` 填。
 *
 * 2026-10-06 加的，是用户第 2 条（「切换的时候，不要改变其他内容，只改变叙事风格」）
 * 在地理之外的第二个锚点：**挑哪一件事、记号落在哪儿，一律按这个世界那一套库**
 * （`SCENES[WORLD_VOICE]`）；换说法只换「这件事怎么说」（见 `pickShards` 里的
 * `placeScene` 与 `scene` 两个变量）。所以它跟 `voiceId` 是两件事，不跟着说法走。
 */
export let WORLD_VOICE = ''

/** 这个世界默认的主题 id（`THEMES` 的键），由 `applyPack` 填。 */
export let WORLD_THEME = null

// ⚠️ 装载块不在这里，在下面地图那一节之后（`PLACES` 声明之后）。
// 原因很硬：它给 `PLACES` / `VIEW` / `MAP_SVG` / `MAP_CSS` 赋值，而 `let` 是**暂时性死区**的
// ——在这几行之前跑就会 `ReferenceError: Cannot access 'PLACES' before initialization`。
// 那四样（地理）跟句子不住在同一个地方：句子在地基那一节，地理在地图那一节。

/** 生活层那句话（可能没有，大多数行没有）。导出是为了让自检能单独钉住它。
 *
 * `avoid` 是上一行用过的那句——相邻两行说同一句最扎眼，所以往下递一道。
 */
export function lifeLine(entry, voice = DEFAULT_VOICE, prev = null, avoid = '', mark = '') {
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
export function markLine(entry, mark = '') {
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
export function dangerOf(entry, place = null) {
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
export function worldLine(entry, voice = DEFAULT_VOICE, place = null, avoid = '', sceneKey = '', mark = '') {
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
export function helpersFor(entry) {
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
export function daylight(hour) {
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
export function dimForDusk(tokens, dusk) {
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
export let VIEW = { x: 16, y: 11.5, w: 66, h: 34 }

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
export let PLACES = {}

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
export function placeName(id, voice = DEFAULT_VOICE) {
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
export function buildStage(options) {
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
     现在字号降到 1.75（≈14px，差 1.45 倍）、签底 0.72 让地形透一点；
     记号的偏移（3.0）一个字没动——「靠右边翻到左边」那条断言咬的是它。 */
  const labelBg = svgEl('rect', { class: 'gf-place-bg', rx: 0.7, height: 2.7, fill: 'var(--gf-paper-hi)', 'fill-opacity': 0.72, stroke: 'var(--gf-room-line)', 'stroke-width': 0.11 })
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
export function travelMs(fromId, toId) {
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
export function renderStage(stage, narration, voice = DEFAULT_VOICE, fromPlace = null, warm = true) {
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
        stage.labelText.setAttribute('y', (y + size * 1.37).toFixed(1))
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
    if (picked && hold.value && hold.value.id === fork.id) hold.value = null
    const pending = canPick && !picked && unit.from === todayFrom
    if (pending) {
      // 停在**它压下来那一刻**——那一刻就是「当下」：第一次看见它的时候，屏幕上最新那一行
      // （用户 m18547 第 1 条）。钉住之后不重算、不跟着时钟漂（第 2 条；用户 m17334：
      // 「中间所有的内容，都暂停」）。
      const at = hold.value && hold.value.id === fork.id
        ? hold.value.at
        : (hold.value = { day: Number(unit.from), id: fork.id, at: Number(rows[rows.length - 1].at) }).at
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
export function fightsFor(units, seq, plans = null) {
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
export function seasonOf(at) {
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
export function dayPlanOf(roll, list, seq, journey = JOURNEY) {
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
export function dayPlansFor(units, seq, journey = JOURNEY) {
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
export function planLines(plan, entry) {
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
export function lossLine(plan, entry) {
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
export function stateAt(unit, plan = null, picked = null, mark = '') {
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
export function createGameflow(options = {}) {
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
  const forkPin = { value: null }
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
   */
  function focusInto() {
    const first = openForkEl && typeof openForkEl.querySelector === 'function'
      ? openForkEl.querySelector('.gf-choice-pick')
      : null
    if (first && typeof first.focus === 'function') {
      first.focus()
      return
    }
    if (typeof room.focus === 'function') room.focus()
  }

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

export const inject = []

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
export async function fetchRecords() {
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
export async function fetchStore() {
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
export async function postStart(at) {
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

export function apply(ctx) {
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
