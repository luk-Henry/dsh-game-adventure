/**
 * 快照备份：把这一版的源码与文档整份拷进 .backup/时间戳/。
 *
 * 为什么需要它：这台机器上没有 git（没有 .git，也没装 git），而 src/client.js
 * 现在已经是十四万字节、几千行手写的等距地图与句库。任何一次 edit 出差错都没有
 * 「回到上一个提交」这条路，只有「昨天那个文件长什么样」这种问题需要答案时才发现
 * 无处可查。这个脚本就是最朴素的替身：一次拷贝 + 一份带 sha256 的清单。
 *
 * 不进快照的东西（都写过理由）：
 *   node_modules/  .backup/         —— 依赖与旧快照本身
 *   .scratch/asar*  .scratch/edge-profile  .scratch/client  .scratch/shots
 *                                    —— 解包出来的 DSH 源码、浏览器 profile、截图
 *   *.png  *.json（除 package.json）—— 出图与 scene.json，一张几百 KB，且都能重画
 * .scratch 里的小脚本（*.mjs / *.py）会进 —— 出图管线与探针脚本是资产，不是垃圾。
 *
 * 用法：
 *   node scripts/snapshot.mjs               // 没变化就跳过，有变化就存一份
 *   node scripts/snapshot.mjs --force       // 不管有没有变化都存
 *   node scripts/snapshot.mjs --list        // 只列已有的快照
 *   node scripts/snapshot.mjs --keep 40     // 改保留份数（默认 20）
 *   node scripts/snapshot.mjs --restore 2026-10-05-120000
 *                                           // 把某一份拷回原位（覆盖前先自动存一份）
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BACKUP = join(ROOT, '.backup')

/* --- 要备份的东西 --------------------------------------------------- */

// 整份拷的目录
const DIRS = ['src', 'lib', 'scripts', 'locale']

// 整份拷的文件（都在仓库根上）
const FILES = [
  'package.json',
  'cordis.patch.yml',
  'icon.svg',
  'LICENSE',
  '.gitignore',
  'preview.html',
  'README.md',
  '回望厅-设计文档.md',
  '门后的人-对照表.md',
]

// 只在 .scratch 里挑小脚本，不碰图片与 scene.json
const SCRATCH_EXT = ['.mjs', '.py', '.cjs', '.yml', '.bak']

const SKIP_SCRATCH_DIRS = new Set(['asar', 'asar2', 'client', 'edge-profile', 'shots', 'node_modules'])

/* --- 收集 ----------------------------------------------------------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function collect() {
  const list = []
  for (const d of DIRS) {
    const full = join(ROOT, d)
    if (!existsSync(full)) continue
    for (const f of walk(full)) list.push(f)
  }
  for (const f of FILES) {
    const full = join(ROOT, f)
    if (existsSync(full)) list.push(full)
  }
  const scratch = join(ROOT, '.scratch')
  if (existsSync(scratch)) {
    for (const name of readdirSync(scratch)) {
      const full = join(scratch, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        if (SKIP_SCRATCH_DIRS.has(name)) continue
        for (const f of walk(full)) if (SCRATCH_EXT.includes(ext(f))) list.push(f)
      } else if (SCRATCH_EXT.includes(ext(name))) {
        list.push(full)
      }
    }
  }
  return list.sort()
}

const ext = (p) => {
  const i = p.lastIndexOf('.')
  return i < 0 ? '' : p.slice(i)
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12)

function manifestOf(files) {
  return files.map((f) => {
    const buf = readFileSync(f)
    return `${sha(buf)}  ${String(buf.length).padStart(8)}  ${relative(ROOT, f).replace(/\\/g, '/')}`
  })
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function snapshots() {
  if (!existsSync(BACKUP)) return []
  return readdirSync(BACKUP)
    .filter((n) => statSync(join(BACKUP, n)).isDirectory())
    .sort()
}

function manifestPath(name) {
  return join(BACKUP, name, 'MANIFEST.txt')
}

function readManifest(name) {
  const p = manifestPath(name)
  if (!existsSync(p)) return null
  // 只要形如「12 位十六进制 + 空格 + 字节数 + 空格 + 路径」的行，文件头那几行说明不算
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => /^[0-9a-f]{12}\s+\d+\s+\S/.test(l))
}

/* --- 命令 ----------------------------------------------------------- */

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const say = (...a) => console.log(...a)

if (has('--list')) {
  const all = snapshots()
  if (all.length === 0) say('还没有任何快照。')
  else {
    say(`${all.length} 份快照（新的在下）：\n`)
    for (const name of all) {
      const lines = readManifest(name) || []
      const bytes = lines.reduce((n, l) => n + Number(l.split(/\s+/)[1] || 0), 0)
      say(`  ${name}   ${String(lines.length).padStart(3)} 个文件   ${(bytes / 1024).toFixed(1)} KB`)
    }
  }
  process.exit(0)
}

if (has('--restore')) {
  const name = valueOf('--restore', '')
  if (!name || !existsSync(join(BACKUP, name))) {
    say(`找不到快照 ${name || '(没给名字)'}。用 --list 看看有哪些。`)
    process.exit(1)
  }
  const lines = readManifest(name) || []
  say(`先把当前这一版存一份（安全网）：`)
  writeSnapshot(collect(), { force: true, quiet: true })
  let n = 0
  for (const line of lines) {
    const rel = line.split(/\s+/).slice(2).join(' ')
    const from = join(BACKUP, name, 'files', rel)
    const to = join(ROOT, rel)
    if (!existsSync(from)) continue
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to)
    n++
  }
  say(`已从 ${name} 恢复 ${n} 个文件。`)
  process.exit(0)
}

writeSnapshot(collect(), {
  force: has('--force'),
  keep: Number(valueOf('--keep', '20')),
})

function writeSnapshot(files, opts) {
  const manifest = manifestOf(files)
  const all = snapshots()
  const newest = all[all.length - 1]
  const prev = newest ? readManifest(newest) : null

  if (!opts.force && prev && prev.join('\n') === manifest.join('\n')) {
    say(`跟最新那份（${newest}）一字不差，跳过。要强行存就加 --force。`)
    return null
  }

  const name = stamp()
  const dir = join(BACKUP, name)
  for (const f of files) {
    const rel = relative(ROOT, f)
    const to = join(dir, 'files', rel)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(f, to)
  }

  const bytes = files.reduce((n, f) => n + statSync(f).size, 0)
  const head = [
    `快照 ${name}`,
    `来源 ${ROOT}`,
    `时间 ${new Date().toISOString()}`,
    `文件 ${manifest.length} 个，共 ${(bytes / 1024).toFixed(1)} KB`,
    prev ? `上一份的变化：${diff(prev, manifest)}` : '这是第一份快照',
    '',
    'sha256(前12位)      字节  路径',
  ]
  writeFileSync(manifestPath(name), [...head, ...manifest].join('\n') + '\n', 'utf8')

  if (!opts.quiet) {
    say(`存了一份快照：.backup/${name}/`)
    say(`  ${manifest.length} 个文件，${(bytes / 1024).toFixed(1)} KB`)
    if (prev) say(`  跟上一份的差别：${diff(prev, manifest)}`)
    else say('  这是第一份快照。')
  }

  const keep = opts.keep || 20
  const list = snapshots()
  if (list.length > keep) {
    for (const old of list.slice(0, list.length - keep)) {
      rmSync(join(BACKUP, old), { recursive: true, force: true })
      if (!opts.quiet) say(`  删掉太老的：${old}`)
    }
  }
  return name
}

// 只看「哪几个文件变了」，不比内容（内容差异要看的话打开两份 MANIFEST 自己 diff）
function diff(prev, next) {
  const map = new Map(prev.map((l) => [l.split(/\s+/).slice(2).join(' '), l.split(/\s+/)[0]]))
  const now = new Map(next.map((l) => [l.split(/\s+/).slice(2).join(' '), l.split(/\s+/)[0]]))
  const changed = []
  for (const [path, h] of now) {
    if (!map.has(path)) changed.push(`+${path}`)
    else if (map.get(path) !== h) changed.push(`~${path}`)
  }
  for (const path of map.keys()) if (!now.has(path)) changed.push(`-${path}`)
  return changed.length === 0 ? '没有变化' : changed.join('  ')
}
