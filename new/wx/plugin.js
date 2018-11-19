const {
  ConcatSource
} = require('webpack-sources')

module.exports = class WxPluginHelper {
  constructor (miniPlugin) {
    this.$plugin = miniPlugin
  }

  apply (compiler) {

  }

  getAppJsonCode () {
    return new ConcatSource(JSON.stringify(this.$plugin.getAppJson(), null, 2))
  }

  getAppJsCode (content) {
    return content
  }

  emitHook(compilation, callback) {
    callback()
  }
}
