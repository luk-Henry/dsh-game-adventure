# `src/map/` —— 地图是**现画**的

面板里那张世界地图（以及它的放大镜「地方图」）不是预先渲染好的图，是运行时用
这里的数据和代码画出来的。这一段解释为什么、以及改它的时候必须守住什么。

## 为什么改成现画

以前地图是**画好的一整段 SVG**，内联在 `src/map-data.js`（545 KB），由
`.scratch/terrain.py --ship` 生成。那样做有两条硬伤：

1. **地方图塞不进去**。地方图是世界图的放大镜（同一个坐标系，取景框缩到 22×11.35，
   三倍线性分辨率），二十座城各一张，合计 **14.4 MB**——没有任何理由内联。
2. **改一笔要重跑生成器**。地图上的东西写死在 545 KB 的字符串里，动一座山就得回
   `.scratch/` 改 Python、重跑、再发运。

现画之后，地理数据只有约 15 KB，两张图共用它。插件的产物因此**小了约 480 KB**。

## 这里的文件

| 文件 | 是什么 |
| --- | --- |
| `rng.js` | CPython 的 MT19937 原样移植。地图上每一处抖动都走它。 |
| `geo.js` | 底层图元：`f2` / `p2` / `hypot` / `pd` / `hit` / `wob` / `organic` / `meander` / `blob` / `ribbon` / `lerp`。 |
| `world3.js` | 地理数据，**由 `.scratch/world3.py` 导出，不要手改**。 |
| `world.js` | 世界图（66×34 全景）：地貌、二十座城的记号与国名、八处奇观。 |
| `local.js` | 地方图（22×11.35 放大镜）：城墙街道房子、田、镇心地标、题名框。 |

## 移植的三条铁律

这一整套是从 `.scratch/terrain.py`（1317 行）与 `.scratch/local.py`（1029 行）
**逐字节等价**地翻过来的，不是重写。验收标准是两边画出来的 SVG 一字不差。为此：

1. **每一个进 SVG 的数字都要走 `f2()`**（等价于 Python 的 `'{:.2f}'.format`）。
   不能用 `toFixed`：JS 在「恰好一半」时进位，Python 是四舍六入五成双——
   `(0.125).toFixed(2)` 是 `"0.13"`，Python 给 `'0.12'`。`f2` 走的是
   `toFixed(40)` 拿到精确十进制展开、再在字符串上做半偶取整。
2. **不能用 `Math.hypot`**。它跟 Python 的 `math.hypot` 在 27% 的输入上差 1 ulp；
   `geo.js` 的 `hypot` 用双字（double-double）算到正确取整，实测 391 个样本零误差。
   同理，随机数一律走 `new Random(seed)`，不许 `Math.random()`。
3. **`Math.sin` / `Math.cos` 跟 Python 对不齐**（1125 个样本里差 16 / 18 个，1 ulp）。
   这个没办法修。好在它们只影响中间坐标，最终都以两位小数出现——所以对表时
   「含三角函数的图元」比的是**格式化之后的 `d` 串**，实测 2762 项零误差。

## 怎么验证

```powershell
$py   = 'C:\Users\1\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$node = 'C:\Users\1\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'

# 底座（改了 rng.js / geo.js 就跑这个）
& $py .scratch/rng-dump.py ;  & $node .scratch/rng-diff.mjs     # 2664 项，应报 0
& $py .scratch/geo-dump.py ;  & $node .scratch/geo-diff.mjs     # 2762 项，应报 0

# 世界图
& $py .scratch/render-py.py ; & $node .scratch/render-js.mjs ; & $node .scratch/render-diff.mjs

# 地方图
& $py .scratch/local-dump.py ; & $node .scratch/local-js.mjs ; & $node .scratch/local-diff.mjs
```

两个解释器都不在 PATH 上。所有命令都在仓库根目录跑。

## 谁是准绳

**移植完成、两边对上之后，JS 是唯一准绳**，`.scratch/` 里的 Python 就冻结成
「当年的参照物」——以后要挪一座山、加一条河，改的是 `world.js` / `world3.js`，
不再回 Python 改。上面那几条对表命令留着当回归测试：它们证明这套移植当年是对的。

唯一的例外是 **`world3.js` 仍然是生成的**（`python .scratch/w3-dump.py`）。
要改地理数据本身，就改 `.scratch/world3.py` 再重跑——因为地方图的二十座城、
取景框、国名落点、奇观的机器自查（`check()`）全都挂在那一份数据上，手工改
JS 那份会立刻跟 Python 那边的自查脱节。

`map-data.js`（当年那张世界图，532 KB）**还在，但住在 `.scratch/` 里**：它是
`.scratch/terrain.py --ship` 的产物，留着当「现画的结果跟当年那张图一模一样」的物证
（`scripts/smoke.mjs` 里有一条断言就是拿它跟包里现画的那份比）。

2026-10-08 它从 `src/` 搬了出来：`package.json` 的 `files` 含 `"src"`，于是这 532 KB
一直在跟着包发给别人，而包里根本没有任何东西 import 它。夹具不在时，钉它的那几条
断言会**出声跳过**（打印一行「跳过了 N 条」，不算失败、也不装哑巴），其余六百多条照跑。

## 2026-10-30：两套坐标并成一套（M-15）

上一轮审计在图上量出：二十座城里有几座「画在哪儿」和「数据写着在哪儿」差得离谱，
最大 **17.76** 个世界单位（深渊港画在 (26.90,32.00)，数据里是 (44.6,33.4)，离珊瑚宫
只隔 3.2）。根因是 `_cap_at()` 一直是「国名落点 + 固定偏移」（一级 +2.59、二级 +1.57，
珊瑚宫另有一条 `CAP_AT` 例外），而 `src/packs/adventure/world.js` 里那七个镇内点
**是照这个结果手抄的**——于是同一座城有两套数，改一份另一份不会跟着动。

现在 `_cap_at(cname, nx, ny, tier, cx, cy)` **数据坐标优先**：传了城坐标就用城坐标
（只夹进图内），没传的（`local.js` 里只认国名的几处老调用）照旧走偏移。改完实测
二十座城偏差 **0.00 格**，`world.check()` 里「都城落在海里」这一类也一并没了。

同一轮顺手统一的：地名签与世界图那块牌子现在共用一个算式（`geo.js` 的
`plate_rect` / `plate_text_y`），所以「字号、内边距、基线」只有一处；面板那枚签挤不下
时会自动收一档字号（`PLACE_FS` 1.6 → 1.41 → 1.25），落点由 `world.js` 的
`placeLabel()` 挑——它躲的正是 `textBoxes()` 这张表（地貌名、都城、奇观、野地、国名、城名）。

顺带记两条改数据时的坑：

1. **`world3.js` 改完必须重烘夹具。** 改 `.scratch/world3.py` → `python .scratch/w3-dump.py`
   → `node .scratch/ship-map.mjs`（后者把现画的 SVG / CSS 写进 `.scratch/map-data.js`）。
   `scripts/smoke.mjs` 有一条逐字节断言比「包里那份」与「夹具那份」，少一步就红。
2. **`_cap_at` 的「没给」是 `null` / `undefined`，不是 `0`。** `Number(null)` 是 0，
   第一版就是这么把二十座都城全部夹到左上角的（`local.js` 二十条自查当场报「镇子不在
   陆地上」）。判据写成 `cx !== null && cx !== undefined && …` 才对。

