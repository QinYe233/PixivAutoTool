import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import JavaScriptObfuscator from 'javascript-obfuscator'

// 只在生产构建(electron-vite build)时混淆主进程/预加载脚本；dev 保持明文可调试。
const IS_PROD = process.env.NODE_ENV === 'production'

// 混淆参数（标准强度，兼顾体积/启动与可读性防护）：
// - transformObjectKeys 关闭：保住 contextBridge 暴露的 API 名与 IPC 频道名，否则渲染层调不到
// - selfDefending/debugProtection 关闭：反调试交给运行时加固，避免这类特性引发的偶发崩溃
const OBF_OPTIONS = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 8,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  selfDefending: false,
  debugProtection: false
}

// rollup 插件：在打包末尾对每个 JS chunk 做混淆
function obfuscate() {
  return {
    name: 'js-obfuscator',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (!IS_PROD) return
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.fileName.endsWith('.js')) {
          file.code = JavaScriptObfuscator.obfuscate(
            file.code,
            OBF_OPTIONS
          ).getObfuscatedCode()
        }
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), obfuscate()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.js') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), obfuscate()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.js') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
