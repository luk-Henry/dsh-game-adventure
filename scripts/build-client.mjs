/**
 * 把 src/client.js（ES module，供预览页和测试直接 import）
 * 转成 lib/client.js（DSH 运行时要的经典 script 形态）。
 *
 * 为什么必须转：DSH 的客户端 bundle 是**经典 script**，用
 * `<script src=… async>` 注入、**不带 `type="module"`**
 * （依据 `dsh-client-modules/lib/client.js` 的 `defaultLoadBundle`）。
 * 所以顶层出现 `export` 就是 SyntaxError，插件会以
 * `client-modules: bundle script <url> failed to load` 收场。
 *
 * 运行时真正要的形状是：
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { … return module.exports } })
 *
 * 这里做的就是把 `export function apply` 变成 `function apply`，
 * 再在 factory 末尾统一把名字挂到 `exports` 上——所以**源码仍是唯一真相**，
 * 不需要维护两份，也不需要任何打包器。
 *
 *   node scripts/build-client.mjs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const SRC = join(root, 'src', 'client.js')
const OUT = join(root, 'lib', 'client.js')

/** 包名，同时也是 ModuleLoader 的行 id。 */
const ID = 'dsh-gameflow'

/** 匹配顶层导出行，把 `export ` 摘掉并记下名字。 */
const RE_FN = /^export\s+(async\s+function|function|class)\s+([A-Za-z_$][\w$]*)/
const RE_DECL = /^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/
const RE_LIST = /^export\s*\{([^}]*)\}/

/** `import { X, Y as Z } from './file.js'` —— 只认相对路径 + 具名导入这一种写法。
 *  路径可以是 `./x.js` 也可以是 `../x.js`：世界包要往上一层去拿地图渲染器
 *  （`src/packs/adventure/index.js` import `../../map/world.js`）。 */
const RE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'(\.\.?\/[\w./-]+)'\s*$/

/** 一个文件顶层声明了哪些名字（用来核对 import 的东西真的存在）。 */
function declaredNames(raw) {
  const names = new Set()
  for (const l of raw.split('\n')) {
    const d = RE_DECL.exec(l) || RE_FN.exec(l)
    if (d) names.add(d[2])
  }
  return names
}

/**
 * 读一个要被摊平的文件，顺手把「块注释的收尾」和紧跟其后的 `export` / `import` 拆到两行。
 *
 * 为什么要有这一步（2026-10-06）：`src/map-data.js` 是 `.scratch/terrain.py --ship`
 * 生成的，它的文件头是一段块注释，**注释收尾那两个字符（星号加斜杠）和
 * `export const MAP_SVG` 挤在同一行**——而下面那几条规则（`RE_DECL` / `RE_IMPORT`）
 * 都是按「一行以 export/import 开头」认的，于是会报「`../../map-data.js` 里
 * 没有导出 MAP_SVG」。生成器那边改一行就得重新出一版图，所以在读入这一侧认掉它，
 * 规矩一个字没放松。
 *
 * 那份死数据 2026-10-08 搬去了 `.scratch/`（包里不再有它），这一条**留着**：
 * 一次 `replace`，防止哪天又有生成的文件进了摊平链。
 */
async function readSource(path) {
  const raw = await readFile(path, 'utf8')
  return raw.replace(/\*\/(?=(?:export|import)\s)/g, '*/\n')
}

/** 摘掉 `export `（只摘后面真跟着声明的那一种，注释里的 `export` 不动）。 */
function stripExport(line) {
  if (/^export\s*\{/.test(line)) {
    throw new Error(`摊平不支持 \`export { … }\` 写法：${line.trim()}`)
  }
  return line.replace(/^export\s+(?=(async\s+function|function|class|const|let|var)\s)/, '')
}

/**
 * 一个被 import 的文件摊平之后长什么样：
 *
 *   const __mod1 = (() => { …那个文件的正文… return { applyPack } })()
 *
 * 然后每个 import 它的地方只写一行 `const { X } = __mod1`。
 *
 * **为什么要编号 + 记名字**（2026-10-06 的实测）：同一个文件被两条路 import 时
 * （当时世界包从 `../../map-data.js` 拿地图、`client.js` 也从 `./map-data.js` 拿），
 * 摊平两次会把 288 KB 的地图带进来两遍——产物 675 KB → 1002 KB。所以同一个文件
 * 只摊平一次：定义按后序（依赖在前）堆在 factory 顶部的 `defs` 里，import 那一行
 * 只留一个引用。（那条双路现在没了，但 `src/map/geo.js` 这类被多处 import 的文件
 * 一样吃这条规矩。）
 *
 * 裹一层 IIFE 的老理由没变：摊平之后所有文件共享一个作用域，而内容包与 client.js
 * 都会有 `DEFAULT_VOICE`、`dangerOf` 这种同名（原文各自模块里井水不犯河水）。
 * 裹起来之后重名互不干扰，也顺带把「包里没被用到的导出」挡在外面。
 * 路径可以套多层（`./packs/adventure/rules.js` 是两层）。
 */
const defs = []
const seen = new Map()

async function inlineFile(file, dir, stack) {
  const path = join(dir, file)
  if (stack.includes(path)) throw new Error(`循环 import：${[...stack, path].join(' → ')}`)
  if (seen.has(path)) return seen.get(path)
  const raw = await readSource(path)
  if (/^export default/m.test(raw)) {
    throw new Error(`${file} 里有 \`export default\`——摊平只支持具名导出。`)
  }
  const name = `__mod${seen.size + 1}`
  seen.set(path, name)
  const out = []
  // 下一层的 `./x.js` 是相对**这个文件**所在的目录，不是相对 client.js（包是两层：
  // `packs/index.js` 里的 `./adventure/rules.js` 在 `packs/adventure/` 下）。
  const here = dirname(path)
  for (const line of raw.split('\n')) {
    const m = RE_IMPORT.exec(line.trim())
    out.push(m ? await fromImport(m, here, [...stack, path]) : stripExport(line))
  }
  defs.push([
    `const ${name} = (() => {`,
    out.join('\n'),
    `  return { ${[...declaredNames(raw)].join(', ')} }`,
    `})()`,
  ].join('\n'))
  return name
}

/** 把一句 import 变成「从前奏里取那几个名字」的一行。 */
async function fromImport(m, dir, stack) {
  const pairs = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [from, to] = s.split(/\s+as\s+/).map((t) => t.trim())
      return [from, to || from]
    })
  const file = m[2]
  const declared = declaredNames(await readSource(join(dir, file)))
  for (const [from] of pairs) {
    if (!declared.has(from)) throw new Error(`${file} 里没有导出 ${from}`)
  }
  const bind = pairs.map(([from, to]) => (from === to ? from : `${from}: ${to}`)).join(', ')
  const name = await inlineFile(file, dir, stack)
  return `const { ${bind} } = ${name}`
}

/** client.js 这一层：只把它自己 import 的那些摊平，别的行原样留着。 */
async function flatten(source, dir) {
  const out = []
  for (const line of source.split('\n')) {
    const m = RE_IMPORT.exec(line.trim())
    out.push(m ? await fromImport(m, dir, []) : line)
  }
  return out.join('\n')
}

const source = await flatten(await readFile(SRC, 'utf8'), join(root, 'src'))
const lines = source.split('\n')
const exported = []
const body = []

for (const line of lines) {
  if (line.startsWith('export default')) {
    throw new Error('src/client.js 里有 `export default`——运行时的 ModuleLoader 没有 default interop，别用。')
  }

  const fn = RE_FN.exec(line)
  if (fn) {
    body.push(line.replace(/^export\s+/, ''))
    exported.push(fn[2])
    continue
  }

  const decl = RE_DECL.exec(line)
  if (decl) {
    body.push(line.replace(/^export\s+/, ''))
    exported.push(decl[2])
    continue
  }

  const list = RE_LIST.exec(line)
  if (list) {
    // `export { a, b as c }` —— 只支持不改名的写法
    for (const raw of list[1].split(',')) {
      const name = raw.trim()
      if (name === '') continue
      if (name.includes(' as ')) {
        throw new Error(`src/client.js 里的 \`export { ${name} }\` 用了 as 改名，构建脚本不支持。`)
      }
      exported.push(name)
    }
    continue // 这一行本身不进 body
  }

  body.push(line)
}

if (exported.length === 0) {
  throw new Error('src/client.js 里一个顶层导出都没找到——构建脚本会产出空壳。')
}

const assignments = exported.map((n) => `    exports.${n} = ${n}`).join('\n')

const out = `/*
 * dsh-gameflow · 浏览器半边（运行时装）
 *
 * ⚠️ 这个文件是 scripts/build-client.mjs 从 src/client.js 生成的，不要手改。
 * 改 src/client.js，然后跑 \`node scripts/build-client.mjs\`。
 *
 * 形态说明：DSH 用不带 type="module" 的经典 script 加载客户端 bundle，
 * 所以这里必须是 __ModuleLoader__.load({id, factory}) 包起来的样子，
 * 而不是一个 ES module。
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

${defs.join('\n\n')}

${body.join('\n')}

${assignments}
    return module.exports
  },
})
`

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, out, 'utf8')

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1)
console.log(`lib/client.js  ${kb} KB  摊平 ${defs.length} 个文件  导出 ${exported.length} 个：${exported.join(', ')}`)
