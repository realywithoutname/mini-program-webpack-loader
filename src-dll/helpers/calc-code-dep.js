const { join, dirname, basename } = require('path')
const { relative } = require('../utils')
const { ConcatSource } = require('webpack-sources')
const { resolveTargetPath } = require('./resolve-target-path')

/**
 * 重写文件的依赖
 */
module.exports.calcCodeDep = function calcCodeDep (miniLoader, dist, codeSource) {
  const fileTree = miniLoader.fileTree
  const source = new ConcatSource()

  const fileMeta = fileTree.getFileByDist(dist)

  let code = codeSource.source().toString()

  let { isWxml, isWxss, isWxs, isJson, components, deps } = fileMeta

  if ((isWxml || isWxss || isWxs) && deps.size) {
    for (const dep of deps) {
      const reg = `('|")${dep.depPath.get(fileMeta.source)}('|")`
      const relativePath = resolveTargetPath(
        relative(dist, dep.dist)
      )
      code = code.replaceAll(reg, `"${relativePath}"`)
    }
  }

  if (isJson && components.size) {
    code = JSON.parse(code)

    for (const [key, value] of components) {
      const { usingComponents, componentGenerics } = code
      // 抽象组件的自定义组件路径可能为空的
      if (!value) {
        componentGenerics[key] = true
        continue
      }
      const { type, json: jsonFileMeta } = fileTree.components.get(value)
      const componentType = type.get(fileMeta.source)
      // 插件不需要处理
      if (componentType === 'plugin') {
        usingComponents[key] = value
        continue
      }

      const relPath = relative(dist, jsonFileMeta.dist)
      const componentPath = './' + join(
        dirname(relPath),
        basename(relPath, '.json')
      )

      if (componentType === 'normal') {
        usingComponents[key] = componentPath
      }

      if (componentType === 'generics') {
        if (value) {
          componentGenerics[key] = {
            default: componentPath
          }
        }
      }
    }

    code = JSON.stringify(code, null, 2)
  }

  source.add(code)

  return source
}
