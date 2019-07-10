const { dirname, join } = require('path')
const { ConcatSource } = require('webpack-sources')
const { relative } = require('../utils')

module.exports.updateJsCode = function updateJsCode (codeSource, originDist, additionDist) {
  const reg = /require\(['"](.+?)["']\)/g
  const files = []
  let code = codeSource.source().toString()
  let matched = null

  while ((matched = reg.exec(code)) !== null) {
    let file = matched[1]

    file && files.push(file)
  }

  files.forEach(file => {
    const fileDist = join(dirname(originDist), file)
    const relPath = relative(additionDist, fileDist)

    code = code.replaceAll(file, relPath)
  })

  //  有点危险，为了解决 webpack require 如果已经加载模块就不执行导致报 Component 为定义的问题
  code = code.replaceAll(originDist, additionDist)

  return new ConcatSource(code)
}
