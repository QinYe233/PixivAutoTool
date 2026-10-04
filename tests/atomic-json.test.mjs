import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomic } from '../src/main/atomic-json.js'

test('failed temporary write preserves the existing JSON file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-json-'))
  const file = path.join(dir, 'history.json')
  fs.writeFileSync(file, '[1]')
  const fakeFs = {
    writeFileSync() { throw new Error('disk full') },
    renameSync() { throw new Error('should not rename') },
    rmSync() {}
  }
  try {
    assert.throws(() => writeJsonAtomic(file, [2], fakeFs), /disk full/)
    assert.equal(fs.readFileSync(file, 'utf8'), '[1]')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
