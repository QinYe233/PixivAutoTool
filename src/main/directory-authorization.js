import path from 'path'

function normalize(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || dir.includes('\0')) return ''
  const value = path.normalize(dir)
  return process.platform === 'win32' ? value.toLowerCase() : value
}

export function createDirectoryAuthorizer(defaultDir, savedDir) {
  const selected = new Set()
  let current = normalize(savedDir) ? path.normalize(savedDir) : ''
  const fallback = path.normalize(defaultDir)
  return {
    authorizeSelection(dir) {
      const key = normalize(dir)
      if (!key) throw new Error('下载目录必须是绝对路径')
      selected.add(key)
    },
    saveDirectory(dir) {
      if (dir === '') { current = ''; return '' }
      const key = normalize(dir)
      if (!key || (!selected.has(key) && key !== normalize(current))) throw new Error('未授权的下载目录')
      current = path.normalize(dir)
      return current
    },
    resolveJobDir(dir) {
      const expected = current || fallback
      if (dir === undefined || dir === null || dir === '') return expected
      if (normalize(dir) !== normalize(expected)) throw new Error('未授权的下载目录')
      return expected
    }
  }
}
