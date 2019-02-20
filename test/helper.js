const { join } = require('path')

function formatSource (sources) {
  const result = []

  /**
   * [
   *  'path/to/src/',
   *  'path/to/src1/',
   *  'path/to/src/dir1',
   *  'path/to/src/dir2',
   *  'path/to/src/dir1/333',
   *  'path/to/src/dir2/333',
   * ]
   * =>
   * [
   *  'path/to/src/dir1/333',
   *  'path/to/src/dir1',
   *  'path/to/src/dir2/333',
   *  'path/to/src/dir2',
   *  'path/to/src1/',
   *  'path/to/src/'
   * ]
   */

  /**
    * {
    *   path: {
    *     deep: 1,
    *     to: {
    *       deep: 2,
    *       src: {
    *         deep: 3
    *       },
    *       src1: {
    *         deep: 3
    *       },
    *     }
    *   }
    * }
    */
  const tree = {}

  sources.forEach((source, index) => {
    let parent = tree
    let splited = source.split('/')
    console.log(splited)
    splited.forEach((val, index) => {
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
  console.log(JSON.stringify(tree, null, 2), resolvePath(tree))
}

formatSource([
  'path/to/src/',
  'path/to/src1/',
  'path/to/src/dir1',
  'path/to/src/dir2',
  'path/to/src/dir1/333',
  'path/to/src/dir2/444'
])
