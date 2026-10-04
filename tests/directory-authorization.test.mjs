import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createDirectoryAuthorizer } from '../src/main/directory-authorization.js'

test('only a dialog-selected directory can be saved or used for a job', () => {
  const defaultDir = path.resolve('C:/Pictures/PixivAutoTool')
  const chosen = path.resolve('C:/Pictures/Selected')
  const arbitrary = path.resolve('C:/Windows/Temp')
  const auth = createDirectoryAuthorizer(defaultDir, '')
  assert.equal(auth.resolveJobDir(undefined), defaultDir)
  assert.throws(() => auth.saveDirectory(arbitrary), /未授权/)
  auth.authorizeSelection(chosen)
  assert.equal(auth.saveDirectory(chosen), chosen)
  assert.equal(auth.resolveJobDir(chosen), chosen)
  assert.equal(createDirectoryAuthorizer(defaultDir, chosen).saveDirectory(chosen), chosen)
  assert.throws(() => auth.resolveJobDir(arbitrary), /未授权/)
  assert.equal(auth.saveDirectory(''), '')
  assert.equal(auth.resolveJobDir(undefined), defaultDir)
})
