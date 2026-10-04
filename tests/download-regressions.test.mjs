import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { downloadImage } from '../src/main/downloader.js'

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixiv-auto-test-'))
  try { await fn(dir) } finally { await fs.rm(dir, { recursive: true, force: true }) }
}

function response(status, body = '', headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: Readable.toWeb(Readable.from([Buffer.from(body)]))
  }
}

test('HTTP 416 does not promote an oversized partial file', async () => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, 'image.jpg')
    await fs.writeFile(`${dest}.part`, 'stale-long-part')
    const originalFetch = globalThis.fetch
    const ranges = []
    globalThis.fetch = async (_url, opts) => {
      ranges.push(opts.headers.Range || null)
      return ranges.length === 1
        ? response(416, '', { 'content-range': 'bytes */5' })
        : response(200, 'fresh')
    }
    try {
      await downloadImage('https://i.pximg.net/image.jpg', dest)
      assert.equal(await fs.readFile(dest, 'utf8'), 'fresh')
      assert.deepEqual(ranges, ['bytes=15-', null])
    } finally { globalThis.fetch = originalFetch }
  })
})

test('mismatched 206 range restarts instead of appending corrupt bytes', async () => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, 'image.jpg')
    await fs.writeFile(`${dest}.part`, 'old')
    const originalFetch = globalThis.fetch
    const ranges = []
    globalThis.fetch = async (_url, opts) => {
      ranges.push(opts.headers.Range || null)
      return ranges.length === 1
        ? response(206, 'wrong', { 'content-range': 'bytes 0-4/5' })
        : response(200, 'fresh')
    }
    try {
      await downloadImage('https://i.pximg.net/image.jpg', dest)
      assert.equal(await fs.readFile(dest, 'utf8'), 'fresh')
      assert.deepEqual(ranges, ['bytes=3-', null])
    } finally { globalThis.fetch = originalFetch }
  })
})

test('matching 206 range resumes a partial file', async () => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, 'image.jpg')
    await fs.writeFile(`${dest}.part`, 'old')
    const originalFetch = globalThis.fetch
    const ranges = []
    globalThis.fetch = async (_url, opts) => {
      ranges.push(opts.headers.Range || null)
      return response(206, 'new', { 'content-range': 'bytes 3-5/6' })
    }
    try {
      await downloadImage('https://i.pximg.net/image.jpg', dest)
      assert.equal(await fs.readFile(dest, 'utf8'), 'oldnew')
      assert.deepEqual(ranges, ['bytes=3-'])
    } finally { globalThis.fetch = originalFetch }
  })
})

test('image download passes cancellation signal to fetch', async () => {
  await withTempDir(async dir => {
    const controller = new AbortController()
    const originalFetch = globalThis.fetch
    let observedSignal
    globalThis.fetch = async (_url, options) => {
      observedSignal = options.signal
      controller.abort()
      throw options.signal.reason
    }
    try {
      await assert.rejects(downloadImage('https://i.pximg.net/a.jpg', path.join(dir, 'a.jpg'), { signal: controller.signal }))
      assert.equal(observedSignal?.aborted, true)
    } finally { globalThis.fetch = originalFetch }
  })
})

test('failed download counts as processed but not successful', async () => {
  const source = await fs.readFile(new URL('../src/main/job.js', import.meta.url), 'utf8')
  const job = new SourceTextModule(source)
  const fake = {
    './pixiv.js': { getIllustPages: async (id) => ({ id, userId: '42', pages: [{ urlOriginal: 'https://i.pximg.net/fail.jpg' }] }) },
    './downloader.js': { downloadImage: async () => { throw new Error('network failure') }, sanitize: String, fileNameFromUrl: () => 'fail.jpg' },
    './ugoira.js': { downloadUgoiraGif: async () => {} },
    './history.js': { add: () => {} },
    path: { default: path }
  }
  await job.link(async (specifier) => {
    const exports = fake[specifier]
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    })
  })
  await job.evaluate()
  const progress = []
  const result = await job.namespace.runDownloadJob([{ id: '7', userId: '42' }], '/tmp', {}, p => progress.push(p))
  assert.equal(result.done, 0)
  assert.equal(result.processed, 1)
  assert.equal(result.failed, 1)
  assert.equal(progress.at(-1).done, 0)
  assert.equal(progress.at(-1).processed, 1)
})

test('history write failure is returned as a task warning', async () => {
  const source = await fs.readFile(new URL('../src/main/job.js', import.meta.url), 'utf8')
  const job = new SourceTextModule(source)
  const fake = {
    './pixiv.js': { getIllustPages: async (id) => ({ id, userId: '42', pages: [{ urlOriginal: 'https://i.pximg.net/ok.jpg' }] }) },
    './downloader.js': { downloadImage: async () => 'downloaded', sanitize: String, fileNameFromUrl: () => 'ok.jpg' },
    './ugoira.js': { downloadUgoiraGif: async () => {} },
    './history.js': { add: () => { throw new Error('disk full') } },
    path: { default: path }
  }
  await job.link(async specifier => new SyntheticModule(Object.keys(fake[specifier]), function () {
    for (const [key, value] of Object.entries(fake[specifier])) this.setExport(key, value)
  }))
  await job.evaluate()
  const result = await job.namespace.runDownloadJob([{ id: '7', userId: '42' }], os.tmpdir())
  assert.equal(result.done, 1)
  assert.match(result.warning, /disk full/)
})
