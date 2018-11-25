const {
  ConcatSource
} = require('webpack-sources')
const { get: getAppJson } = require('../helpers/app')

module.exports = class WxPluginHelper {
  constructor (miniPlugin) {
    this.$plugin = miniPlugin
  }

  apply (compiler) {

  }

  getAppJsonCode () {
    return new ConcatSource(JSON.stringify(getAppJson(), null, 2))
  }

  getAppJsCode (content) {
    return content
  }

  emitHook (compilation, callback) {
    callback()
  }
}
