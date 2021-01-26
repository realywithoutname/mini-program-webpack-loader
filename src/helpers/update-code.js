const { dirname, join } = require('path')
const { ConcatSource } = require('webpack-sources')
const { relative } = require('../utils')
const { parse } = require('@babel/parser')
const traverse = require('@babel/traverse')
const t = require('@babel/types')
const generator = require('@babel/generator')

module.exports.updateJsCode = function updateJsCode (codeSource, originDist, additionDist) {
  // 路径一致就返回，没必要计算
  if (originDist === additionDist) return codeSource

  let code = codeSource.source().toString()
  const ast = parse(code, { scourceType: 'module' })
  /**
   * 原来正则情况会导致匹配到注释中的 require，然后进行替换，导致输出路径可能不对
   * 比如模块 A 依赖模块 B，模块 B 中有注释 require('module-b-path')，进行替换
   * 时，bundle 中的模块 B 路径变为了相对路径，更复杂时就可能出现替换后的路径和实际
   * bundle 中路径不一致
   */
  traverse.default(ast, {
    CallExpression (path) {
      if (t.isIdentifier(path.node.callee, { name: 'require' })) {
        if (path.node.arguments.length !== 1) {
          console.log(
            generator.default(path.parent).code
          )
          throw Error('require 表达式错误')
        }
        const filePath = path.node.arguments[0].value
        const fileDist = join(dirname(originDist), filePath)
        const relPath = relative(additionDist, fileDist)

        path.node.arguments[0].value = relPath
      }
    }
  })

  code = generator.default(ast).code

  //  有点危险，为了解决 webpack require 如果已经加载模块就不执行导致报 Component 为定义的问题
  code = code.replaceAll(originDist, additionDist)

  return new ConcatSource(code)
}
