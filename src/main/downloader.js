// 单张图片下载：支持断点续传（.part 临时文件 + HTTP Range），跳过已存在文件。
import fs from 'fs'
import path from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { throttle } from './net.js'

// 全局限速节流：每个数据块按大小向 net.throttle 预约发送时机（不限速时几乎零开销）。
function createThrottleStream() {
  return new Transform({
    async transform(chunk, _enc, cb) {
      try {
        await throttle(chunk.length)
        cb(null, chunk)
      } catch (e) {
        cb(e)
      }
    }
  })
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let cookieProvider = () => ''
export function setCookieProvider(fn) {
  cookieProvider = fn
}

export function sanitize(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}

function fileNameFromUrl(url) {
  return url.split('/').pop().split('?')[0]
}
export { fileNameFromUrl }

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true })
}

/**
 * 下载单张图片到 destPath，支持断点续传。
 * @returns 'downloaded' | 'skipped'
 */
export async function downloadImage(url, destPath, opts = {}) {
  // 最终文件已存在 -> 跳过
  if (!opts.overwrite && fs.existsSync(destPath)) return 'skipped'

  await ensureDir(path.dirname(destPath))
  const partPath = destPath + '.part'

  // 已有 .part -> 尝试从断点续传
  let start = 0
  if (fs.existsSync(partPath)) {
    try {
      start = fs.statSync(partPath).size
    } catch {
      start = 0
    }
  }

  const headers = {
    'User-Agent': USER_AGENT,
    Referer: 'https://www.pixiv.net/',
    Cookie: cookieProvider() || ''
  }
  if (start > 0) headers['Range'] = `bytes=${start}-`

  const res = await fetch(url, { headers })

  // 416：请求范围超出 -> .part 已是完整文件
  if (res.status === 416) {
    await fs.promises.rename(partPath, destPath)
    return 'downloaded'
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`下载失败 (${res.status}) ${url}`)
  }

  // 服务器忽略了 Range（返回 200 完整内容）-> 从头覆盖写
  let flags = 'w'
  if (start > 0 && res.status === 206) {
    flags = 'a'
  }

  const ws = fs.createWriteStream(partPath, { flags })
  // res.body 是 Web ReadableStream，显式转成 Node 流以兼容不同 Node 版本；
  // 中间串一个节流 Transform，实现全局下载限速（不限速时透明直通）。
  await pipeline(Readable.fromWeb(res.body), createThrottleStream(), ws)
  await fs.promises.rename(partPath, destPath)
  return 'downloaded'
}
