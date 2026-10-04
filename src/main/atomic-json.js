import fs from 'fs'

export function writeJsonAtomic(file, value, io = fs) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    io.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
    io.renameSync(temp, file)
  } catch (error) {
    try { io.rmSync(temp, { force: true }) } catch { /* preserve original error */ }
    throw error
  }
}
