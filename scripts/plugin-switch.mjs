// 门后（dsh-gameflow）的开关：改 profile 里那一小段，把插件挂上去 / 摘下来。
//
//   node scripts/plugin-switch.mjs            ← 不带参数：开 ⇄ 关 来回切
//   node scripts/plugin-switch.mjs on|off     ← 直接指定
//   node scripts/plugin-switch.mjs status     ← 只看现在是什么状态
//   node scripts/plugin-switch.mjs --patch <另一个 cordis.patch.yml 的路径>
//
// 为什么改这里而不是插件内部：DSH 是在**启动时**读 profile 的 patch 层决定加载哪些
// 插件的。所以「不运行」只有一条真路——把这一条 insert 摘掉。插件自己写的
// 「本次不显示」那种开关不是同一个东西：宿主半边照样在监听会话、照样往 records.json
// 写盘，只是界面不画而已。
//
// 这一段用两条标记行圈起来，脚本整段重写，所以可以反复跑、不会越跑越乱：
//
//   # >>> dsh-gameflow 开关 >>>
//   # [gameflow:ON]
//   - insert:
//       - id: dsh-gameflow
//         name: "file:///D:/…/src/index.js"
//   # <<< dsh-gameflow 开关 <<<
//
// 关掉的时候那三行会被注释起来（不是删掉），所以开回来一个字都不会错。
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HEAD = '# >>> dsh-gameflow 开关 >>>'
const TAIL = '# <<< dsh-gameflow 开关 <<<'
const FLAG_ON = '# [gameflow:ON]'
const FLAG_OFF = '# [gameflow:OFF]'
const ENTRY_ID = 'dsh-gameflow'
const DEFAULT_ENTRY = 'file:///D:/文档合集/插件/dsh-gameflow/src/index.js'

const args = process.argv.slice(2)
const patchAt = (() => {
  const i = args.indexOf('--patch')
  if (i >= 0 && args[i + 1]) return args[i + 1]
  return process.env.DSH_PROFILE_PATCH
    || join(homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')
})()
const wanted = args.find((a) => ['on', 'off', 'status'].includes(a)) || ''

const blockOf = (on, entry) => {
  const lines = [
    HEAD,
    on ? FLAG_ON : FLAG_OFF,
    on
      ? `- insert:
    - id: ${ENTRY_ID}
      name: "${entry}"`
      : `# - insert:
#     - id: ${ENTRY_ID}
#       name: "${entry}"`,
    TAIL,
  ]
  return lines.join('\n')
}

if (!existsSync(patchAt)) {
  console.error(`找不到 profile 的 patch 文件：${patchAt}`)
  console.error('用 --patch <路径> 指定一个。')
  process.exit(1)
}

// 铁律：DSH **只在启动时**读 profile 的这一层。运行期间改它 = 触发 HMR 重载，
// 而官方插件文档把「在会话运行期间改 profile 的 cordis.patch.yml」列为禁止事项
// （实测会丢光 preset 工具、杀掉在途的 turn，最坏把 sessionController 永久废掉）。
// 所以这里默认**在 DSH 开着的时候拒绝改动**；真要硬来才加 --force。
function dshRunning() {
  if (process.platform !== 'win32') return false
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/NH'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return /DeepSeek Harness\.exe/i.test(out)
  } catch {
    return false
  }
}

if (wanted !== 'status' && dshRunning() && !args.includes('--force')) {
  console.error('')
  console.error('  ⛔ DSH 现在开着，不能改这个文件。')
  console.error('')
  console.error('  它只在**启动时**读一次 profile 的 patch 层；开着的时候改，会触发')
  console.error('  HMR 重载——轻则工具消失、正在跑的那一轮被打断，重则要把 profile 修回来。')
  console.error('')
  console.error('  请先**完全退出 DSH**（关窗口不算；任务栏右下角托盘也要退掉），')
  console.error('  确认没有 DeepSeek Harness 进程了，再跑一次这条命令。')
  console.error('')
  console.error('  只是想看现在是什么状态：node scripts/plugin-switch.mjs status')
  console.error('')
  process.exit(2)
}

const raw = readFileSync(patchAt, 'utf8')
const hadMarkers = raw.includes(HEAD) && raw.includes(TAIL)

/** 现在这一段长什么样、是开是关。 */
function readState(text) {
  const from = text.indexOf(HEAD)
  const to = text.indexOf(TAIL)
  if (from < 0 || to < 0) {
    // 还没有标记：看看老的写法里有没有一条 dsh-gameflow 的 insert（第一次跑要做迁移）
    const legacy = new RegExp(`- insert:\\n\\s+- id: ${ENTRY_ID}\\n\\s+name: "([^"]+)"`)
    const hit = text.match(legacy)
    if (hit) return { state: 'on', entry: hit[1], legacy: true, span: null }
    // 老的注释式写法（`# - insert:` 那一版）
    if (new RegExp(`#\\s+- insert:\\n#\\s+- id: ${ENTRY_ID}`).test(text)) {
      return { state: 'off', entry: DEFAULT_ENTRY, legacy: true, span: null }
    }
    return { state: 'absent', entry: DEFAULT_ENTRY, legacy: true, span: null }
  }
  const block = text.slice(from, to + TAIL.length)
  const entry = (block.match(/name: "([^"]+)"/) || [])[1] || DEFAULT_ENTRY
  const state = block.includes(FLAG_ON) ? 'on' : block.includes(FLAG_OFF) ? 'off' : '?'
  return { state, entry, legacy: false, span: [from, to + TAIL.length] }
}

const now = readState(raw)
const label = { on: '已开启（插件在运行）', off: '已关闭（插件不运行）', absent: '还没装（profile 里没有它）', '?': '状态看不出来（标记被改坏了）' }

if (wanted === 'status') {
  console.log(`门后：${label[now.state]}`)
  console.log(`  开关文件：${patchAt}`)
  console.log(`  入口：${now.entry}`)
  process.exit(0)
}

const nextOn = wanted === 'on' ? true : wanted === 'off' ? false : now.state !== 'on'
const entry = now.entry || DEFAULT_ENTRY

// 迁移：老写法（直接一条 insert、或整段注释）先收进标记里，再按目标状态重写。
let text = raw
if (!hadMarkers) {
  if (now.state === 'on') {
    const legacy = new RegExp(`- insert:\\n\\s+- id: ${ENTRY_ID}\\n\\s+name: "[^"]+"\\n?`)
    text = text.replace(legacy, `${blockOf(true, entry)}\n`)
  } else if (now.state === 'off') {
    const legacyOff = new RegExp(`(?:#\\s*- insert:\\n#\\s+- id: ${ENTRY_ID}\\n#\\s+name: "[^"]+"\\n?)`)
    text = text.replace(legacyOff, '')
  }
  if (!text.includes(HEAD)) text = `${text.replace(/\s*$/, '')}\n\n${blockOf(nextOn, entry)}\n`
}

const current = readState(text)
if (current.span) {
  text = `${text.slice(0, current.span[0])}${blockOf(nextOn, entry)}${text.slice(current.span[1])}`
} else {
  text = `${text.replace(/\s*$/, '')}\n${blockOf(nextOn, entry)}\n`
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const backup = `${patchAt}.bak-switch-${stamp}`
copyFileSync(patchAt, backup)
writeFileSync(patchAt, text, 'utf8')

const after = readState(text)
console.log(`门后：${label[now.state]} → ${label[after.state]}`)
console.log(`  开关文件：${patchAt}`)
console.log(`  备份：${backup}`)
console.log('')
console.log('这一步只改了配置文件——要让开关生效，得把 DSH **完全退出再重开**')
console.log('（关掉窗口不算退出；要确认进程真的没了）。')
