// electron-builder 打包完成后，对 Electron 二进制烧写「保险丝」(fuses)。
// 这是二进制层面的加固：改环境变量也绕不过去。
// 参考：https://www.electronjs.org/docs/latest/tutorial/fuses
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context
  const productName = context.packager.appInfo.productFilename

  // 定位可执行文件
  let electronBinary
  if (electronPlatformName === 'win32') {
    electronBinary = path.join(appOutDir, `${productName}.exe`)
  } else if (electronPlatformName === 'darwin') {
    electronBinary = path.join(
      appOutDir,
      `${productName}.app`,
      'Contents',
      'MacOS',
      productName
    )
  } else {
    electronBinary = path.join(appOutDir, productName)
  }

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    // 禁止把 Electron 当普通 Node 跑（否则可 ELECTRON_RUN_AS_NODE=1 直接 require 你的代码）
    [FuseV1Options.RunAsNode]: false,
    // 禁止 NODE_OPTIONS 注入（挡住 --require 之类的启动期注入）
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    // 禁止 --inspect / --inspect-brk 等调试参数（挡住附加调试器扒主进程）
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // 只允许从 asar 加载 app，且校验 asar 完整性（篡改/重打包直接启动失败）
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true
  })

  console.log(`[afterPack] fuses 已烧写: ${electronBinary}`)
}
