// 统一下载任务编排：解析所选作品 -> 生成下载单元（图片页 / 动图）-> 并发执行 -> 记录历史。
import path from 'path'
import * as pixiv from './pixiv.js'
import { downloadImage, sanitize, fileNameFromUrl } from './downloader.js'
import { downloadUgoiraGif } from './ugoira.js'
import * as history from './history.js'

/**
 * @param works [{ id, illustType, userId }]  用户勾选的作品
 * @param baseDir 保存根目录
 * @param opts { concurrency, overwrite }
 * @param onProgress (p) => void   p = { phase, done, processed, total, failed, current }
 * 返回 { total, done(成功数), processed(已处理数), failed, errors, baseDir }
 */
export async function runDownloadJob(
  works,
  baseDir,
  opts = {},
  onProgress = () => {},
  shouldCancel = () => false,
  signal
) {
  const concurrency = opts.concurrency || 4

  // ---- 阶段一：解析原图 / 动图，构建下载单元 ----
  onProgress({ phase: 'resolve', done: 0, total: works.length, failed: 0, current: '正在解析原图地址…' })
  const units = []
  const errors = []
  let resolved = 0

  await runPool(
    works,
    Math.min(concurrency, 6),
    async (w) => {
      try {
        if (Number(w.illustType) === 2) {
          // 动图：一个作品 = 一个 GIF 单元
          units.push({
            kind: 'ugoira',
            illustId: w.id,
            userId: String(w.userId || ''),
            title: w.title || ''
          })
        } else {
          const info = await pixiv.getIllustPages(w.id, signal)
          if (info.illustType === 2) {
            units.push({
              kind: 'ugoira',
              illustId: info.id,
              userId: info.userId || String(w.userId || ''),
              title: info.title
            })
          } else {
            info.pages.forEach((pg, i) => {
              units.push({
                kind: 'image',
                url: pg.urlOriginal,
                illustId: info.id,
                userId: info.userId || String(w.userId || ''),
                title: info.title,
                pageIndex: i
              })
            })
          }
        }
      } catch (e) {
        errors.push({ id: w.id, message: e.message })
      } finally {
        resolved++
        onProgress({
          phase: 'resolve',
          done: resolved,
          total: works.length,
          failed: errors.length,
          current: `解析中 ${resolved}/${works.length}`
        })
      }
    },
    shouldCancel
  )

  // 解析阶段被取消：直接返回，不进入下载
  if (shouldCancel()) {
    return { total: 0, done: 0, processed: 0, failed: errors.length, errors, baseDir }
  }

  // ---- 阶段二：并发下载所有单元 ----
  const total = units.length
  let done = 0
  let processed = 0
  let failed = 0
  const succeeded = []

  const buildImageDest = (u) => {
    const folder = path.join(baseDir, sanitize(u.userId || 'unknown'))
    const ext = path.extname(fileNameFromUrl(u.url)) || '.jpg'
    return path.join(folder, `${u.illustId}_p${u.pageIndex}${ext}`)
  }

  onProgress({ phase: 'download', done: 0, processed: 0, total, failed: 0, current: '开始下载…' })

  await runPool(units, concurrency, async (u) => {
    try {
      if (u.kind === 'ugoira') {
        const folder = path.join(baseDir, sanitize(u.userId || 'unknown'))
        const r = await downloadUgoiraGif(u.illustId, folder, {
          overwrite: opts.overwrite,
          signal,
          onFrame: (f, t) =>
            onProgress({
              phase: 'download',
              done,
              processed,
              total,
              failed,
              current: `动图 ${u.illustId} 转GIF ${f}/${t}`
            })
        })
        succeeded.push({
          illustId: u.illustId,
          userId: u.userId,
          title: u.title,
          file: r.file,
          kind: 'ugoira'
        })
      } else {
        const dest = buildImageDest(u)
        await downloadImage(u.url, dest, { overwrite: opts.overwrite, signal })
        succeeded.push({
          illustId: u.illustId,
          userId: u.userId,
          title: u.title,
          file: dest,
          kind: 'image'
        })
      }
      done++
    } catch (e) {
      failed++
      errors.push({ id: u.illustId, message: e.message })
    } finally {
      processed++
      onProgress({
        phase: 'download',
        done,
        processed,
        total,
        failed,
        current: u.kind === 'ugoira' ? `${u.illustId}.gif` : `${u.illustId}_p${u.pageIndex}`
      })
    }
  }, shouldCancel)

  // ---- 记录历史 ----
  let warning = ''
  try {
    history.add(succeeded)
  } catch (e) {
    warning = `下载文件已保存，但历史记录写入失败：${e?.message || e}`
  }

  return { total, done, processed, failed, errors, baseDir, warning }
}

/** 简单并发池：对 items 以最多 n 个并发跑 worker(item)。shouldStop() 为真时停止派发新任务 */
async function runPool(items, n, worker, shouldStop = () => false) {
  let cursor = 0
  const run = async () => {
    while (cursor < items.length) {
      if (shouldStop()) return
      const i = cursor++
      await worker(items[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) || 1 }, run)
  )
}
