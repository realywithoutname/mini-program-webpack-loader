const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const { ConcatSource } = require('webpack-sources')

module.exports = class AliPluginHelper {
  constructor (miniPlugin) {
    this.$plugin = miniPlugin
  }

  apply (compiler) {
    new webpack.DefinePlugin({
      wx: 'my',
      Page: '_afAppx.Page',
      getApp: `
      (function () {
        const app = _afAppx.getApp() || {}
        global.globalData = app.globalData = Object.assign({}, app.globalData, global.globalData)
        Object.assign(app, global)
        return Object.assign(global, app)
      })
      `,
      Component: '(_afAppx.WorkerComponent || function () {})',
      Behavior: '(function (args) { return args })'
    }).apply(compiler)
  }

  setCompilation (compilation) {
    const header = '/******/ const _afAppx = __webpack_require__(/*! @alipay/af-appx */ "@alipay/af-appx");\n'
    const global = '/******/ var global = my.global = my.global || {};\n'

    compilation.hooks.optimizeChunkAssets.tapAsync('MiniPlugin', (chunks, callback) => {
      chunks.forEach(chunk => {
        chunk.files.forEach(file => {
          compilation.assets[file] = new ConcatSource(
            header,
            global,
            compilation.assets[file]
          )
        })
      })
      callback()
    })
  }

  getAppJsonCode () {
    return new ConcatSource(JSON.stringify(this.$plugin.getAppJson(), null, 2))
  }

  getAppJsCode (content) {
    // const libCode = fs.readFileSync(this.$plugin.options.wxLib, 'utf8')

    return new ConcatSource(
      `require('${
        path.relative(this.$plugin.outputPath, path.resolve(__dirname, './lib/my.js'))
      }')\n`,
      content
    )
  }
}
