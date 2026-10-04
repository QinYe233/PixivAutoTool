// 下载历史记录：追加到 userData/history.json
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { writeJsonAtomic } from './atomic-json.js'

let filePath = null
function file() {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'history.json')
  return filePath
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf-8'))
  } catch {
    return []
  }
}

function writeAll(list) {
  writeJsonAtomic(file(), list)
}

/**
 * 追加记录。records: [{ illustId, userId, title, file, kind }]
 * 自动加 time 时间戳；按 illustId+file 去重（重复下载更新时间置顶）。
 */
export function add(records) {
  if (!records || !records.length) return
  const list = readAll()
  const now = Date.now()
  for (const r of records) {
    const key = `${r.illustId}|${r.file}`
    const idx = list.findIndex((x) => `${x.illustId}|${x.file}` === key)
    const entry = { ...r, time: now }
    if (idx >= 0) list.splice(idx, 1)
    list.unshift(entry)
  }
  // 最多保留 5000 条
  writeAll(list.slice(0, 5000))
}

export function list(limit = 500) {
  return readAll().slice(0, limit)
}

export function clear() {
  writeAll([])
}
