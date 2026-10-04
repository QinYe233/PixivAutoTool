// 极简本地配置存储：把设置写到 userData/config.json
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { writeJsonAtomic } from './atomic-json.js'

let cache = null
let filePath = null

function file() {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'config.json')
  return filePath
}

function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf-8'))
  } catch {
    cache = {}
  }
  return cache
}

export function get(key, def) {
  const data = load()
  return key in data ? data[key] : def
}

export function set(key, value) {
  const data = { ...load() }
  data[key] = value
  writeJsonAtomic(file(), data)
  cache = data
}

export function remove(key) {
  const data = { ...load() }
  if (!(key in data)) return
  delete data[key]
  writeJsonAtomic(file(), data)
  cache = data
}
