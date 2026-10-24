# 上架 dsh-market · 流程、规范、与我们要补的东西

写于 2026-10-11。依据是 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的 `contributing.md` 全文（223 行，已存 `.scratch/market-contributing.md`），以及仓库里实际有的东西。

市场那个「申请收录插件」按钮，指向的就是这份贡献指南。

---

## 一、结论先说

**上架不是一次提交，是两件事：先有一个 GitHub 公开仓库，再往那个列表里加一行。**

我们现在的状态是：**插件本身已经合格，仓库还不存在。**

| 门槛 | 我们的状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle` | ✅ 已有（`dsh.bundle.patch: ./cordis.patch.yml`） |
| 仓库根有 `cordis.patch.yml` | ✅ 已有，形态正确 |
| 仓库里有真实可用的代码 | ✅ 有（不是占位、不是纯 README） |
| 无第三方依赖，源码可安装 | ✅ 零依赖，只用 `node:` 内置模块 |
| 仓库创建满 1 天 | ❌ **仓库还没有** |
| 仓库带 `dsh-plugin` topic | ❌ 同上 |
| 这台机器上有 git | ❌ **没有**（不在 PATH，常见安装路径也没有） |
| 截图 | ⚠️ README 里一张图都没有，必须自己声明 `screenshots.json` |

**最常见被打回的原因，我们已经避开了**：指南原文——「Most rejected submissions declare only `dsh.client` — that alone is **not** installable.」我们 `dsh.bundle` 和 `dsh.client` 都声明了。

---

## 二、流程：从现在到市场里的一行

### 第 1 步 · 把插件放进一个 GitHub 公开仓库

- 必须是**公开**仓库——CI 会去拉你仓库里的 `package.json`。
- 仓库名建议就叫 `dsh-gameflow`（跟包名一致，最省事）。
- 建好之后在仓库设置里加 topic：**`dsh-plugin`**。
- **仓库创建满 1 天**才能提 PR（CI 自动查）。这是为了过滤「PR 前几分钟才建好」的仓库；不满就第二天再提，重新提交不留记录。

### 第 2 步 · 确认仓库根的三样东西

```
package.json          ← 必须声明 dsh.bundle（我们已有）
cordis.patch.yml      ← 必须与 package.json 并排（我们已有）
lib/client.js         ← 预构建产物，必须一起提交（我们已有，900KB）
```

`cordis.patch.yml` 的正确形态：

```yaml
- insert:
    - id: dsh-gameflow
      name: dsh-gameflow
```

### 第 3 步 · （可选，但推荐）截图与 npm

- **截图**：在自己仓库根放 `screenshots.json`，列 1–8 张图。路径相对于这个文件，不能以 `/` 开头、不能含 `..`。市场会自动读，下次夜间构建生效——**以后换图推自己的仓库就行，不用再来提 PR**。
- **npm**：发不发都**不影响收录**，只是市场能显示下载量。发的话包的 `repository` 字段必须指回被收录的那个仓库（防冒挂）。
- **不想发 npm**：可以把预构建 tarball 挂到 GitHub Release，用可选的 `tarball:` 字段指过去。**只有「仓库根本无法从源码安装」时这一项才必需**——我们不是这种情况。

### 第 4 步 · 在列表仓库开一个 PR，只加一个文件

文件路径：`data/plugins/<owner>__dsh-gameflow.yml`

我们的内容（把 `<owner>` 换成你的 GitHub 用户名）：

```yaml
url: https://github.com/<owner>/dsh-gameflow
name: <owner>/dsh-gameflow
category: fun
description:
  en: "A small wooden door in the corner of the DSH window: opening it shows a runtime-drawn world map and a two-column journal that turns local tool-call metadata into a companion's day, reading no conversation content and spending no model tokens."
  zh: "DSH 窗口角落里的一扇小木门：点开是一张运行时画出的世界地图和两栏见闻录，把你本地的工具调用元数据变成一个同伴的一天；不读对话内容，也不花任何模型 token。"
```

⚠️ **一个 PR 最多 3 条。** 我们只有一条，不涉及。

⚠️ **描述里出现 `: `（英文冒号 + 空格）必须加引号**，否则 YAML 会把它当成嵌套键——上面那句英文里就有 `window: opening`，所以 **en 那句必须带引号**（这里用双引号；若改用单引号，`companion's` 里的撇号要写成两个）。

### 第 5 步 · 等 CI（四关，按顺序）

见下面第四节。绿了只是**前置条件**。

### 第 6 步 · 维护者读代码核对描述

见下面第五节。**这一关才是真正的关。**

### 第 7 步 · 合并，网站自动重建

不需要跑任何命令，也**不要手工编辑那两个 README**（它们是生成的；手工编辑正是历史上改动落到邻居身上的原因）。

---

## 三、规范：条目文件的每一个字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `url` | ✅ | 必须与仓库**完全一致** |
| `name` | ✅ | 列表里显示的链接文字，`owner/repo` |
| `category` | ✅ | 取贴合插件实际做的事的分类 |
| `description.en` | ✅ | 一句话，**以句号结尾** |
| `description.zh` | 可选 | 不写维护者会补；缺翻译不是打回的理由 |
| `tarball` | 可选 | 必须是 GitHub Release 托管的 https `.tgz` |

**可用分类（23 个）**：
`agi` `ui` `usage` `theme` `model` `identity` `session` `memory` `tools` `wsl` `browser` `vision` `voice` `docs` `skill` `workflow` `git` `notify` `dev` `security` `remote` `market` `fun`

**我们选 `fun`。** 理由：我们做的是「陪伴 + 叙事」，不是界面增强也不是皮肤。直接邻居是 [`LeemanCheung/dsh-whale-companion`](https://github.com/LeemanCheung/dsh-whale-companion)，就在 `fun` 里，描述是「Draggable whale companion with local progress, achievements, skins, and privacy-safe activity tracking.」——同一类东西。

**不要选 `theme`**：那个分类下的条目会自动进市场的「主题 Tab」，供一键安装/切换/卸载，那是给皮肤准备的，我们不是皮肤。

分类选不准**不会被打回**，维护者会直接改。

### 描述的四条硬规矩

1. **只说功能，不带营销词、不带最高级。** 没有「最好的」「革命性的」。
2. **必须属实，会被对着代码核。** 写了「46 个工具、六大领域」就得真有 46 个和六个；提到某个命令或 API，它就必须存在。**夸大是让一个本来不错的插件被打回的主要原因。**
3. **以句号结尾，一句话。**
4. 含 `: ` 必须加引号。

---

## 四、CI 会查什么（四条，按顺序）

1. **条目数量** —— 一个 PR 最多 3 条。最先查，早于任何网络请求。
2. **`dsh.bundle`** —— 从你仓库的 `package.json` 读（根包，或 `packages/` · `plugins/` · `apps/` 子包）。**只声明 `dsh.client` 会死在这一关。** ✅ 我们有。
3. **仓库年龄** —— 创建满 1 天。
4. **`awesome-lint` + 站点构建** —— 双语一致性、分隔符、日期、截图。

失败会**明确指出要改什么**，在同一个分支上推送修复即可，不用重开 PR。

---

## 五、维护者评审会看什么（八条）

1. **代码是否与条目声明一致**——包括描述里的数字与 API 名称。
2. **分类是否合理**（不会因此被打回）。
3. **是不是真实可用的代码**，而非占位或空壳。
4. **是否已被现有条目覆盖**——两个插件做同一件事时，规则不是先来后到，是**谁更好**。
5. **源码里有没有可疑之处**——混淆代码、凭据外传、异常的安装期行为。（收录 ≠ 安全审查。）
6. **PR 有没有动与它无关的条目。**
7. **是不是纯聚合包**（只有依赖清单、自己不带行为）——不收。我们不是。
8. **依赖是否指向原作者**——我们不涉及（零依赖）。

### 对我们最要紧的两条

**第 5 条 · 异常的安装期行为。**
我们 `package.json` 里的 `prepublishOnly` 会跑 build + smoke + verify + e2e——那**只在 `npm publish` 时触发，不在安装时**。我们没有 `install` / `prepare` / `postinstall` 脚本，所以从源码装不会有任何构建步骤。这一条我们是干净的，值得在 PR 描述里主动说明。

**第 1 条 · 描述属实。**
我们的描述里有三个可核对的声明，都经得起查：
- 「runtime-drawn world map」——地图是运行时由 `src/map/` 画出来的，不是内联 SVG。
- 「reading no conversation content」——只读工具名、时刻、次数、文件路径；`edit` 的 `old_string` 一个字节不碰，冒烟里有断言守着。
- 「spending no model tokens」——零 token，只做加减法写 JSON。

---

## 六、我们这边还差什么

### ❌ 硬缺口

1. **没有 GitHub 仓库。** 这是一切的前提。
2. **这台机器上没有 git。** `git` 不在 PATH，`C:\Program Files\Git\cmd\git.exe`、`%LOCALAPPDATA%\Programs\Git\`、scoop 路径都不存在。`gh` CLI 也没有。（可能用 GitHub Desktop / VS Code 的内置 git，待确认。）
3. **仓库卫生**：根目录有五个**字节完全相同**的文件（SHA256 `F4D6D636AA867F1FAB3A9537867FCA0F19453F96D6FEE7EB182F354BA1EC8DE1`），每个 1,154,674 字节，合计 5.8MB：

   ```
   asar-index.json
   dsh-agent-preset
   dsh-hmr
   plugin
   plugin-manager
   ```

   内容是一份 DSH `app.asar` 的索引（`{"baseOffset":3392064,"lines":[["dsh/desktop-runtime.json",…`）。**它们不被 `package.json` 的 `files` 引用，从来没进过包**——是误拷贝。**已加进 `.gitignore`**，不会进仓库。

4. **README 里一张图都没有**（`![](...)` 零命中），所以市场的「从 README 自动抽图」兜底对我们无效——`screenshots.json` 是必需的，不是锦上添花。

### ⚠️ 该改但不阻塞

5. `package.json` 没有 **`repository`** 字段。发 npm 时必须有，且要指回被收录的那个仓库。
6. 版本还停在 **`0.0.1`**。
7. `dsh.compatibility.dshReleases` 只列了 **`0.2.0-rc.2`**。
8. `dsh.client.inject: []` 是空的。

### ✅ 已经好的

9. `dsh.bundle` + `cordis.patch.yml` 齐全且形态正确——**最常见的被拒原因已避开**。
10. **零第三方依赖**：`src/index.js` 只 import `node:fs/promises` / `node:os` / `node:path` / `node:zlib`；`src/client.js` 只 import 包内模块。没有 `dependencies`，没有 `peerDependencies`，指南里那条「peer 范围静默排除预发布版」的坑我们碰不到。
11. **无密钥泄漏**：全仓扫过 `sk-*`、`ghp_*`、`github_pat_`、`api_key=` 等模式，零命中。
12. **`scripts/verify-packs.mjs`（15,988B）与 `scripts/verify-rules.mjs`（31,824B）已经归位在 `scripts/`**，`package.json` 里的 `verify` 脚本指向真实存在的文件。
13. **提交体积健康**：去掉 `.backup/`（24MB）、`.scratch/`、`.tmp-acp/` 和那五个垃圾文件之后，**55 个文件 / 约 2.8MB**。

---

## 七、我已经做了的（本地，可回退）

- `.gitignore` —— 加进那五个误拷贝文件。
- `screenshots.json` —— 声明 `assets/screenshots/panel.png`。
- `assets/screenshots/panel.png` —— 560×702，从 `.scratch/look-1440x900.png` 里按暗色块自动框出来的一块，**正好是 560px 宽的面板本体**（地图 + 两栏见闻录），没有预览页那圈说明文字。

---

## 八、需要你定的四件事

1. **GitHub 用户名和仓库名**（决定 `url` / `name` / 文件名 / `repository` 字段里的 `<owner>`）。
2. **这台机器上怎么用 git**——装 Git for Windows？用 GitHub Desktop？还是你在别处有开发环境？
3. **发不发 npm**——不发也能收录，只是没有下载量数字。
4. **截图要不要用真机那张**——我裁的这张是预览页里的面板，够干净；但你自己 DSH 窗口里截的（带小木门和真实记录）更有说服力。要的话丢一两张 PNG 给我，我一起声明进去。

---

## 附：两个最接近的已收录条目（照抄形态用）

**`LeemanCheung/dsh-whale-companion`（fun，最接近我们）**

```yaml
url: https://github.com/LeemanCheung/dsh-whale-companion
name: LeemanCheung/dsh-whale-companion
category: fun
description:
  en: Draggable whale companion with local progress, achievements, skins, and privacy-safe activity tracking.
  zh: 可拖拉的鲸鱼伴侣，提供本地进度、成就、皮肤和隐私安全的活动追踪。
```

**`KylinQ01/dsh-startup-animation`（ui，长描述 + 引号的写法）**

```yaml
url: https://github.com/KylinQ01/dsh-startup-animation
name: KylinQ01/dsh-startup-animation
category: ui
description:
  en: 'Startup splash for DeepSeek Harness: an animated avatar with aurora, stardust, pointer parallax and a module-assembly entrance, plus the same image as the main-UI wallpaper; both images can be swapped from a settings page that previews the animation live.'
  zh: 'DSH 启动动画 + 主界面壁纸：头像、极光、星尘、指针视差与模块拼装入场，同一张图作为主界面壁纸；两张图都在能实时预览动画的设置页里换。'
```

---

## 附二：两条流传的说法是假的（2026-10-18 核实）

网上/别的 AI 会给出两条「要求」，都是错的，照着做只会白等：

**① 「仓库至少要有 10 次真实 commit，用空提交凑数会被拒」——假的。**
贡献指南 `contributing.md:75` 原文：

> The repo is at least **1 day old**. (**There is no commit-count bar**: history length measures development habit, not quality — see #4196.)

它明说**没有提交数门槛**。只有「创建满 1 天」这一条。

**② 「有官方 Hub 自动扫描收录通道，填个仓库地址机器人就抓取收录」——不存在。**
`dsh-market` 自己的 README（`https://github.com/dsh-market/dsh-market`）原文：

> **This repo is the market app, not the catalog.** The plugin list comes from the curated [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry — to get your plugin listed in the market, open a PR **there** (one entry in the list; the site and this market pick it up automatically, usually within a day). Please don't PR plugin entries against this repo.

同一份 README 还写着「Installs are restricted to sources listed in the curated awesome-dsh-plugin registry — **anything else is rejected**」。

⇒ **市场里的插件列表就是 awesome-dsh-plugin 那份列表**，没有第二条通道。`dshmarket.com` 与 `awesome-dsh-plugin.com` 上的条目、以及插件详情页的评论区，都是同一份数据（`https://awesome-dsh-plugin.com/plugins.json`，每天由 CI 刷新）。

**③ 顺带**：「必须声明 `dsh.bundle`」这条**是对的**——而我们**已经有了**，所以不用管。
