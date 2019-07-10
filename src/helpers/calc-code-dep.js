const { ConcatSource } = require('webpack-sources')
const { basename, dirname, join } = require('path')
const { relative } = require('../utils')
const { updateJsCode } = require('./update-code')
const { resolveTargetPath } = require('./resolve-target-path')

/**
 * 重写文件的依赖
 */
module.exports.calcCodeDep = function calcCodeDep (miniLoader, dist, meta, codeSource, checkAndCalcDep) {
  const source = new ConcatSource()

  let code = codeSource.source().toString()

  let { isWxml, isWxss, isWxs, isJson, isJs, components, usedComponents = [], deps } = meta

  /**
   * 更新 js 中的 require
   */
  if (isJs) {
    return updateJsCode(codeSource, meta.dist, dist)
  }

  /**
   * 小程序文件处理
   */
  if ((isWxml || isWxss || isWxs) && deps.size) {
    for (const dep of deps) {
      const reg = `('|")${dep.depPath.get(meta.source)}('|")`
      const relativePath = resolveTargetPath(
        checkAndCalcDep ? checkAndCalcDep(dep.source) : relative(dist, dep.dist)
      )
      code = code.replaceAll(reg, `"${relativePath}"`)
    }
  }

  /**
   * json 文件处理，主要处理自定义组件的 json 文件
   */
  if (isJson && components.size) {
    code = JSON.parse(code)

    const canUseComponents = miniLoader.fileTree.getCanUseComponents(meta.source, dist)
    const { usingComponents = {}, componentGenerics = {} } = code

    /**
     * 统计定义未使用的组件
     */
    const definedComponents = [
      ...Object.keys(usingComponents),
      ...Object.keys(componentGenerics)
    ].reduce((res, key) => {
      res[key] = 0
      return res
    }, {})
    /**
     * 统计未定义的组件
     */
    const ignoredComponents = []
    for (const componentName of usedComponents) {
      const component = canUseComponents.get(componentName)

      delete definedComponents[componentName]

      if (!component) {
        ignoredComponents.push(componentName)
        continue
      }

      // 插件使用插件地址
      if (component.type === 'plugin') {
        usingComponents[componentName] = component.distPath
        continue
      }

      // 无默认值抽象组件
      if (component.type === 'generics' && component.distPath === true) {
        componentGenerics[componentName] = true
        continue
      }

      /**
       * 普通自定义组件和有默认值的抽象组件，先计算依赖的相对路径
       * 如果有自定义的计算方法，则使用自定义计算方法。
       */
      let distPath = checkAndCalcDep && checkAndCalcDep(component.originPath)

      // 自定义计算方法只是给了相对路径，需要去掉 .json
      distPath = !distPath ? component.distPath : (
        './' + join(
          dirname(distPath),
          basename(distPath, '.json')
        )
      )

      if (component.type !== 'generics') {
        usingComponents[componentName] = distPath
      } else {
        componentGenerics[componentName] = {
          default: distPath
        }
      }
    }

    const definedAndNotUsed = Object.keys(definedComponents)

    definedAndNotUsed.forEach(componentName => {
      usingComponents[componentName] && delete usingComponents[componentName]
      componentGenerics[componentName] && delete componentGenerics[componentName]
    })

    miniLoader.pushUndefinedTag(meta.source, ignoredComponents)
    miniLoader.pushDefinedNotUsedTag(meta.source, definedAndNotUsed)

    /**
     * 有些自定义组件一开始没有定义 componentGenerics，usingComponents
     */
    !code.usingComponents && Object.keys(usingComponents).length && (code.usingComponents = usingComponents)
    !code.componentGenerics && Object.keys(componentGenerics).length && (code.componentGenerics = componentGenerics)

    code = JSON.stringify(code, null, 2)
  }

  source.add(code)

  return source
}
