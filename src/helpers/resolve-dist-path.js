const { join, dirname } = require('path')
const { relative } = require('../utils')
/**
 * 资源目录排序，在计算路径时优先根据子路径计算
 * [
 *  'path/to/src/',
 *  'path/to/src1/',
 *  'path/to/src/dir1',
 *  'path/to/src/dir2',
 *  'path/to/src/dir1/333',
 *  'path/to/src/dir2/333',
 * ]
 *    =>
 * [
 *  'path/to/src/dir1/333',
 *  'path/to/src/dir1',
 *  'path/to/src/dir2/333',
 *  'path/to/src/dir2',
 *  'path/to/src1/',
 *  'path/to/src/'
 * ]
 */
module.exports.orderSource = function orderSource (resources = []) {
  /**
   * 项目依赖的目录列表，会根据这些目录计算出最后输出路径
   */
  const sourceSet = new Set([...resources])
  const sources = Array.from(sourceSet)

  /**
   * {
   *   path: {
   *     isEndPoint: false,
   *     to: {
   *       isEndPoint: false,
   *       src: {
   *         isEndPoint: true,
   *       },
   *       src1: {
   *         isEndPoint: true,
   *       },
   *     }
   *   }
   * }
   */
  const tree = {}

  sources.forEach((source, index) => {
    let parent = tree
    let splited = source.split('/')
    splited.forEach((val, index) => {
      if (val === '') val = '/'

      const child = parent[val] || { isEndPoint: index === splited.length - 1 }
      parent = parent[val] = child
    })
  })

  function resolvePath (tree, key) {
    let keys = Object.keys(tree)

    let paths = []

    keys.forEach(key => {
      if (key === 'isEndPoint') return

      let res = resolvePath(tree[key], key)
      if (res.length === 0) {
        res = [key]
      } else {
        res = res.map(item => join(key, item))
      }
      paths = paths.concat(res)
    })

    if (tree.isEndPoint) {
      paths.push('')
    }

    return paths
  }

  return resolvePath(tree)
}

module.exports.resolveDepDistPath = function resolveDepDistPath (originDist, additionDist, depdist) {
  const relPath = relative(originDist, depdist)
  const depDist = join(dirname(additionDist), relPath)

  return depDist
}
