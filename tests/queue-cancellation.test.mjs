import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'

test('cancelling a running job aborts its in-flight request', async () => {
  const source = await fs.readFile(new URL('../src/main/queue.js', import.meta.url), 'utf8')
  const mod = new SourceTextModule(source)
  let started
  const running = new Promise(resolve => { started = resolve })
  const fake = { './job.js': { runDownloadJob: async (_works, baseDir, _opts, _progress, _cancel, signal) => {
    started()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    return { done: 0, processed: 0, total: 1, failed: 0, errors: [], baseDir }
  } } }
  await mod.link(async specifier => new SyntheticModule(Object.keys(fake[specifier]), function () {
    for (const [key, value] of Object.entries(fake[specifier])) this.setExport(key, value)
  }))
  await mod.evaluate()
  const queue = mod.namespace
  let completed
  const done = new Promise(resolve => { completed = resolve })
  queue.init({ baseDirResolver: () => 'C:/Pictures', onDone: completed })
  const { id } = queue.enqueue([{ id: '42' }])
  await running
  queue.cancel(id)
  const result = await done
  assert.equal(result.status, 'cancelled')
})
