// 动图(ugoira)下载并转为 GIF。
// 流程：取 ugoira_meta -> 下载帧 zip -> 解压 -> 逐帧编码 GIF（保留每帧 delay）。
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { Jimp } from 'jimp'
import GIFEncoder from 'gif-encoder-2'
import { getUgoiraMeta } from './pixiv.js'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let cookieProvider = () => ''
export function setCookieProvider(fn) {
  cookieProvider = fn
}

function sanitize(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://www.pixiv.net/',
      Cookie: cookieProvider() || ''
    }
  })
  if (!res.ok) throw new Error(`下载失败 (${res.status}) ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * 下载单个动图并转 GIF，写入 <destDir>/<illustId>.gif
 * @param illustId
 * @param destDir  目标目录（外部已按作者ID建好）
 * @param opts { overwrite, onFrame(done,total) }
 * 返回 { file, frames }
 */
export async function downloadUgoiraGif(illustId, destDir, opts = {}) {
  const dest = path.join(destDir, `${sanitize(illustId)}.gif`)
  if (!opts.overwrite && fs.existsSync(dest)) {
    return { file: dest, skipped: true }
  }

  const meta = await getUgoiraMeta(illustId)
  if (!meta.frames.length || !meta.originalSrc) {
    throw new Error('未获取到动图帧信息')
  }

  // 下载帧 zip 并解压到内存
  const zipBuf = await fetchBuffer(meta.originalSrc)
  const zip = new AdmZip(zipBuf)
  const fileMap = {}
  for (const entry of zip.getEntries()) {
    fileMap[entry.entryName] = entry.getData()
  }

  // 用第一帧确定尺寸
  const firstBuf = fileMap[meta.frames[0].file]
  if (!firstBuf) throw new Error('动图帧缺失')
  const firstImg = await Jimp.read(firstBuf)
  const width = firstImg.bitmap.width
  const height = firstImg.bitmap.height

  const encoder = new GIFEncoder(width, height, 'neuquant', false)
  encoder.setRepeat(0) // 无限循环
  encoder.setQuality(10)
  encoder.start()

  const total = meta.frames.length
  for (let i = 0; i < total; i++) {
    const f = meta.frames[i]
    const buf = fileMap[f.file]
    if (!buf) continue
    const img = i === 0 ? firstImg : await Jimp.read(buf)
    encoder.setDelay(f.delay || 100)
    encoder.addFrame(img.bitmap.data) // RGBA
    if (opts.onFrame) opts.onFrame(i + 1, total)
  }
  encoder.finish()

  await fs.promises.mkdir(destDir, { recursive: true })
  await fs.promises.writeFile(dest, encoder.out.getData())
  return { file: dest, frames: total }
}
