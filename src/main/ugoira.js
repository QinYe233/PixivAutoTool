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
const MAX_ZIP_BYTES = 256 * 1024 * 1024
const MAX_FRAME_BYTES = 512 * 1024 * 1024
export function setCookieProvider(fn) {
  cookieProvider = fn
}

function sanitize(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}

async function fetchBuffer(url, signal) {
  const res = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000),
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://www.pixiv.net/',
      Cookie: cookieProvider() || ''
    }
  })
  if (!res.ok) throw new Error(`下载失败 (${res.status}) ${url}`)
  if (Number(res.headers?.get('content-length')) > MAX_ZIP_BYTES) {
    await res.body?.cancel()
    throw new Error('动图压缩包过大')
  }
  let buffer
  if (res.body?.getReader) {
    const reader = res.body.getReader()
    const chunks = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_ZIP_BYTES) throw new Error('动图压缩包过大')
        chunks.push(Buffer.from(value))
      }
    } catch (e) {
      await reader.cancel().catch(() => {})
      throw e
    }
    buffer = Buffer.concat(chunks, size)
  } else {
    buffer = Buffer.from(await res.arrayBuffer())
  }
  if (buffer.length > MAX_ZIP_BYTES) throw new Error('动图压缩包过大')
  return buffer
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

  const meta = await getUgoiraMeta(illustId, opts.signal)
  if (!meta.frames.length || !meta.originalSrc) {
    throw new Error('未获取到动图帧信息')
  }

  // 下载帧 zip 并解压到内存
  const zipBuf = await fetchBuffer(meta.originalSrc, opts.signal)
  const zip = new AdmZip(zipBuf)
  const fileMap = new Map()
  let expandedBytes = 0
  for (const entry of zip.getEntries()) {
    expandedBytes += Number(entry.header?.size || 0)
    if (expandedBytes > MAX_FRAME_BYTES) throw new Error('动图解压后过大')
    fileMap.set(entry.entryName, entry)
  }

  for (const frame of meta.frames) {
    if (!fileMap.has(frame.file)) throw new Error(`动图帧缺失: ${frame.file}`)
  }

  // 用第一帧确定尺寸
  const firstBuf = fileMap.get(meta.frames[0].file)?.getData()
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
    if (opts.signal?.aborted) throw opts.signal.reason || new Error('任务已取消')
    const buf = i === 0 ? firstBuf : fileMap.get(f.file)?.getData()
    if (!buf) throw new Error(`动图帧缺失: ${f.file}`)
    const img = i === 0 ? firstImg : await Jimp.read(buf)
    encoder.setDelay(f.delay || 100)
    encoder.addFrame(img.bitmap.data) // RGBA
    if (opts.onFrame) opts.onFrame(i + 1, total)
  }
  encoder.finish()

  await fs.promises.mkdir(destDir, { recursive: true })
  const part = `${dest}.part`
  try {
    await fs.promises.writeFile(part, encoder.out.getData())
    await fs.promises.rename(part, dest)
  } catch (e) {
    await fs.promises.rm(part, { force: true }).catch(() => {})
    throw e
  }
  return { file: dest, frames: total }
}
