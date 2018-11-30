const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const { ConcatSource, OriginalSource } = require('webpack-sources')
const transXml = require('./transxml')
const { get: getAppJson } = require('../helpers/app')

module.exports = class AliPluginHelper {
  constructor (miniPlugin) {
    this.$plugin = miniPlugin
  }

  apply (compiler) {
    new webpack.DefinePlugin({
      wx: 'my',
      App: '_afAppx.App',
      Page: 'global.Page',
      getApp: `
      (function () {
        const app = _afAppx.getApp() || {}
        global.globalData = app.globalData = Object.assign({}, app.globalData, global.globalData)
        Object.assign(app, global)
        return Object.assign(global, app)
      })
      `,
      __wxConfig: JSON.stringify(null),
      Component: `global.Component`,
      Behavior: '(function (args) { return args })'
    }).apply(compiler)
  }

  setCompilation (compilation) {
    const header = '/******/ const _afAppx = __webpack_require__(/*! @alipay/af-appx */ "@alipay/af-appx");\n'
    const global = '/******/ var global = _afAppx.bridge.global = _afAppx.bridge.global || {};\n'

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

    // compilation.hooks.optimizeModulesBasic.tap('MiniPlugin', modules => {
    //   modules.forEach(module => {
    //     let code = module.source()
    //     code = code.replace(/this\.setData/g, 'this.setAliData')
    //     module._source = new OriginalSource(code)
    //   })
    // })

    compilation.hooks.buildModule.tap('MiniPlugin', module => {
      // console.log(module.source())
      // modules.forEach(module => {
      // let code = module.source()
      // code = code.replace(/this\.setData/g, 'this.setAliData')
      // module._source = new OriginalSource(code)
      // })
    })
  }

  getAppJsonCode () {
    const app = getAppJson()
    const {
      subPackages,
      tabBar,
      pages: originPages
    } = JSON.parse(JSON.stringify(app))

    subPackages.forEach(({ root, pages }) => {
      pages.forEach(page => {
        originPages.push(path.join(root, page))
      })
    })

    tabBar.textColor = tabBar.color
    tabBar.items = tabBar.list.map(item => {
      item.name = item.text
      item.icon = item.iconPath
      item.activeIcon = item.selectedIconPath
      delete item.text
      delete item.iconPath
      delete item.selectedIconPath

      return item
    })

    delete tabBar.list

    return new ConcatSource(JSON.stringify(app, null, 2))
  }

  getAppJsCode (content) {
    // const libCode = fs.readFileSync(this.$plugin.options.wxLib, 'utf8')

    return new ConcatSource(
      `require('${
        path.relative(this.$plugin.outputPath, path.resolve(__dirname, './lib/my.js'))
      }');\n`,
      `require('./mixin.js');\n`,
      `require('${
        path.relative(this.$plugin.outputPath, path.resolve(__dirname, './lib/component.js'))
      }');\n`,
      `require('${
        path.relative(this.$plugin.outputPath, path.resolve(__dirname, './lib/page.js'))
      }');\n`,
      content
    )
  }

  emitHook (compilation, callback) {
    transXml(compilation, this.$plugin)
      .then(() => callback())
      .catch(err => console.log(err))
  }
}
