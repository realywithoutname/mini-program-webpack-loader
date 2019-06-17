const { get: getAppJson } = require('./app')

module.exports.moduleOnlyUsedBySubpackages = function (module) {
  if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false
  if (!module._usedModules) throw new Error('非插件提供的 module，不能调用这个方法')

  let { subPackages } = getAppJson()
  let subRoots = subPackages.map(({ root }) => root) || []
  let subReg = new RegExp(subRoots.join('|'))
  let usedFiles = Array.from(module._usedModules)

  return !usedFiles.some(moduleName => !subReg.test(moduleName))
}

module.exports.moduleUsedBySubpackage = function (module, root) {
  if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false
  if (!module._usedModules) throw new Error('非插件提供的 module，不能调用这个方法')

  let reg = new RegExp(root)

  let usedFiles = Array.from(module._usedModules)

  return usedFiles.some(moduleName => reg.test(moduleName))
}

module.exports.moduleOnlyUsedBySubPackage = function (module, root) {
  if (!/\.js$/.test(module.resource) || module.isEntryModule()) return false

  let usedFiles = module._usedModules

  if (!usedFiles) return false

  let reg = new RegExp(`^${root}`)

  return !Array.from(usedFiles).some(moduleName => !reg.test(moduleName))
}

/**
   * 判断所给的路径在不在自定义组件内
   * @param {String} path 任意路径
   */
module.exports.pathInSubpackage = function (path) {
  let { subPackages } = getAppJson()

  for (const { root } of subPackages) {
    let match = path.match(root)

    if (match !== null && match.index === 0) {
      return true
    }
  }

  return false
}

/**
 * 判断所给的路径集合是不是在同一个包内
 * @param {Array} paths 路径列表
 */
module.exports.pathsInSamePackage = function (paths) {
  // 取第一个路径，获取子包 root，然后和其他路径对比
  let firstPath = paths[0]
  let root = this.getPathRoot(firstPath)

  // 路径不在子包内
  if (!root) {
    return ''
  }

  let reg = new RegExp(`^${root}`)
  for (const path of paths) {
    if (!reg.test(path)) return ''
  }

  return root
}

/**
 * 判断列表内数据是不是在同一个目录下
 * @param {*} paths
 */
module.exports.pathsInSameFolder = function (paths) {
  let firstPath = paths[0]
  let folder = firstPath.split('/')[0]
  let reg = new RegExp(`^${folder}`)

  for (const path of paths) {
    if (!reg.test(path)) return ''
  }

  return folder
}
