const { dirname, join } = require('path')
const { ConcatSource } = require('webpack-sources')
const { relative, removeExt } = require('../utils')

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
/**
 * 替换依赖文件中被依赖文件的位置
 * @param {*} file
 * @param {*} dist
 * @param {*} additionDist
 */
module.exports.updatePathOfCode = function updateCode (source, fileMeta, dist, additionDist) {
  // 最原始的依赖关系：相对路径
  const relPath = relative(fileMeta.dist, dist)
  // 新的依赖关系
  const depPath = relative(fileMeta.dist, additionDist)

  let code = source.source().toString()

  code = code.replaceAll(
    removeExt(relPath),
    removeExt(depPath)
  )

  return new ConcatSource(code)
}
