const path = require('path')
const vueUtils = require('@vue/component-compiler-utils')
const compiler = require('vue-template-compiler')

module.exports = function (content) {
  let { sourcePath } = this
  let fileName = path.baseName(sourcePath)
  let descriptor = vueUtils({
    source: content,
    compiler,
    fileName
  })
}