// 门后 · 开关。双击这个脚本（桌面那个快捷方式指的就是它）就换一次状态。
//
//   · 关：在 `~/.dsh/gameflow/` 里放一枚空的 `off` 文件。插件那边 15 秒之内
//         把整扇门从页面上摘掉，并且不再落盘。
//   · 开：把 `off` 删掉。门在下一次轮询（≤15 秒）挂回来，记录接着走。
//
// **它不碰 profile、不改 cordis.patch.yml、不用重启 DSH**——这是它跟
// `scripts/plugin-switch.mjs` 的分工：那一个是「把插件从进程里摘掉/装回去」（要重启），
// 这一个是「马上闭嘴」（不用重启）。
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const dir = join(home, 'gameflow')
const marker = join(dir, 'off')

const exists = async (file) => {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

const on = await exists(marker)
if (on) {
  await rm(marker, { force: true })
  console.log('门后：已打开。')
  console.log('整扇门会在 15 秒内挂回右下角，记录接着走。')
} else {
  await mkdir(dir, { recursive: true })
  await writeFile(marker, '1', 'utf8')
  console.log('门后：已完全关闭。')
  console.log('15 秒内那扇门会从页面上消失，并且不再落盘（记录停在这里，不会丢）。')
}
console.log(`标记：${marker}${on ? '（已删除）' : '（已写入）'}`)
console.log('再双击一次就换回来。不用重启 DSH。')
