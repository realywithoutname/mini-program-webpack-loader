const {
  ConcatSource
} = require('webpack-sources')
const { get: getAppJson, getPlugin: getPluginJson } = require('../helpers/app')
const transXml = require('./transxml')

module.exports = class WxPluginHelper {
  constructor (miniPlugin) {
    this.$plugin = miniPlugin
  }

  apply (compiler) {

  }

  getAppJsonCode () {
    return new ConcatSource(JSON.stringify(getAppJson(), null, 2))
  }

  getPluginJsonCode () {
    const { main, pages, publicComponents } = getPluginJson(this.$plugin.mainEntry).config

    return new ConcatSource(
      JSON.stringify({
        main,
        pages,
        publicComponents
      }, null, 2)
    )
  }

  getAppJsCode (content) {
    return content
  }

  emitHook (compilation, callback) {
    transXml(compilation, this.$plugin)
      .then(() => this.$plugin.options.beforeEmit(compilation, this.$plugin))
      .then(() => callback())
      .catch(callback)
  }
}
