import path from 'path'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])

function normalized(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return ''
  const result = path.normalize(value)
  return process.platform === 'win32' ? result.toLowerCase() : result
}

// 仅接受主进程已经登记的目录和图片文件；禁止由渲染层直接指定任意路径。
export function isAllowedOpenPath(target, jobs, records, defaultDir) {
  const candidate = normalized(target)
  if (!candidate) return false
  const directories = [defaultDir, ...jobs.map(job => job.baseDir)]
  if (directories.some(dir => normalized(dir) === candidate)) return true
  if (!IMAGE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return false
  return records.some(record => normalized(record.file) === candidate)
}
