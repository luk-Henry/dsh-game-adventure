/**
 * 本地预览：把仓库根目录当静态站点伺候，然后打开 preview.html。
 *
 *   node scripts/preview.mjs          # http://127.0.0.1:5180
 *   node scripts/preview.mjs 5200     # 换个端口
 *
 * 之所以需要一个服务器：preview.html 用 <script type="module"> 去 import
 * src/client.js，浏览器在 file:// 下会因为 CORS 拒绝加载 ES module。
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.argv[2] || 5180)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const rel = url.pathname === '/' ? '/preview.html' : url.pathname
  const target = join(ROOT, normalize(rel))

  // 别让 ../ 跑出仓库
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }

  try {
    const body = await readFile(target)
    res.writeHead(200, {
      'content-type': TYPES[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`回望厅预览： http://127.0.0.1:${PORT}`)
})
