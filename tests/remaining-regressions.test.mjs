import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { isAllowedOpenPath } from '../src/main/open-path.js'

test('only known download directories and history files may be opened', () => {
  const root = path.resolve('C:/Pictures/PixivAutoTool')
  const file = path.join(root, '42', '123_p0.jpg')
  const state = [{ baseDir: root }]
  const records = [{ file }]
  assert.equal(isAllowedOpenPath(root, state, records, root), true)
  assert.equal(isAllowedOpenPath(file, state, records, root), true)
  assert.equal(isAllowedOpenPath(path.resolve('C:/Windows/System32/calc.exe'), state, records, root), false)
  assert.equal(isAllowedOpenPath(path.join(root, '..', 'other'), state, records, root), false)
  assert.equal(isAllowedOpenPath('https://example.com', state, records, root), false)
})

test('ugoira missing a later frame fails without writing a GIF', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ugoira-test-'))
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
  try {
    const source = await fs.readFile(new URL('../src/main/ugoira.js', import.meta.url), 'utf8')
    const mod = new SourceTextModule(source)
    const fake = {
      fs: { default: await import('node:fs').then(m => m.default) },
      path: { default: path },
      'adm-zip': { default: class { getEntries() { return [{ entryName: 'first.jpg', getData: () => Buffer.from('first') }] } } },
      jimp: { Jimp: { read: async () => ({ bitmap: { width: 1, height: 1, data: Buffer.alloc(4) } }) } },
      'gif-encoder-2': { default: class { setRepeat() {} setQuality() {} start() {} setDelay() {} addFrame() {} finish() {} } },
      './pixiv.js': { getUgoiraMeta: async () => ({ originalSrc: 'https://i.pximg.net/a.zip', frames: [{ file: 'first.jpg', delay: 100 }, { file: 'missing.jpg', delay: 100 }] }) }
    }
    await mod.link(async specifier => new SyntheticModule(Object.keys(fake[specifier]), function () {
      for (const [key, value] of Object.entries(fake[specifier])) this.setExport(key, value)
    }))
    await mod.evaluate()
    await assert.rejects(mod.namespace.downloadUgoiraGif('123', dir), /动图帧缺失/)
    await assert.rejects(fs.stat(path.join(dir, '123.gif')), { code: 'ENOENT' })
  } finally {
    globalThis.fetch = originalFetch
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('ugoira rejects an oversized archive before decoding', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, headers: new Headers({ 'content-length': String(300 * 1024 * 1024) }), body: { cancel: async () => {} }, arrayBuffer: async () => new ArrayBuffer(1) })
  try {
    const source = await fs.readFile(new URL('../src/main/ugoira.js', import.meta.url), 'utf8')
    const mod = new SourceTextModule(source)
    const fake = {
      fs: { default: await import('node:fs').then(m => m.default) }, path: { default: path },
      'adm-zip': { default: class {} }, 'jimp': { Jimp: {} }, 'gif-encoder-2': { default: class {} },
      './pixiv.js': { getUgoiraMeta: async () => ({ originalSrc: 'https://i.pximg.net/a.zip', frames: [{ file: 'a.jpg' }] }) }
    }
    await mod.link(async specifier => new SyntheticModule(Object.keys(fake[specifier]), function () {
      for (const [key, value] of Object.entries(fake[specifier])) this.setExport(key, value)
    }))
    await mod.evaluate()
    await assert.rejects(mod.namespace.downloadUgoiraGif('123', os.tmpdir()), /过大/)
  } finally { globalThis.fetch = originalFetch }
})
