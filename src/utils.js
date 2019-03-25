const {
  join,
  isAbsolute,
  dirname,
  relative
} = require('path')

/**
 * 计算文件输出路径
 */
let sourceSet = []
let outputPath = ''
let compilerContext = process.cwd()

exports.setDistParams = function (context, entryContexts = [], resources = [], outPath) {
  /**
   * 项目依赖的目录列表，会根据这些目录计算出最后输出路径
   */
  sourceSet = exports.formatSource(entryContexts, resources)

  outputPath = outPath
  compilerContext = context
}

exports.camelCase = (str) => {
  let words = str.split(/[^a-zA-Z]/)

  return words.reduce((str, val) => {
    str += (val[0].toUpperCase() + val.substr(1))
    return str
  }, words.shift())
}

exports.getDistPath = function (path) {
  let fullPath = compilerContext
  let npmReg = /node_modules/g

  if (path === outputPath) return path

  path = path.replace(/(\.\.\/)?/g, ($1) => $1 ? '_/' : '')

  if (isAbsolute(path)) {
    fullPath = path
  } else {
    // 相对路径：webpack 最好生成的路径，打包入口外的文件都以 '_' 表示上级目录
    let pDirReg = /_\//g

    while (pDirReg.test(path)) {
      path = path.substr(pDirReg.lastIndex)
      pDirReg.lastIndex = 0
      fullPath = join(fullPath, '../')
    }

    if (fullPath !== compilerContext) {
      fullPath = join(fullPath, path)
    }
  }

  if (fullPath !== compilerContext) {
    for (let index = 0; index < sourceSet.length; index++) {
      const source = sourceSet[index]
      const outPath = relative(source, fullPath)

      if (outPath && outPath.indexOf('..') === -1) {
        path = outPath
        console.assert(!npmReg.test(path), `文件${path}路径错误：不应该还包含 node_modules`)
        break
      }
    }
  }

  /**
   * 如果有 node_modules 字符串，则去模块名称
   * 如果 app.json 在 node_modules 中，那 path 不应该包含 node_modules
   */

  if (npmReg.test(path)) {
    path = path.substr(npmReg.lastIndex + 1)
  }

  return path
}

/**
 * 获取文件路径
 * @param {*} base
 * @param {*} path
 * @param {*} exts
 */
const { existsSync } = require('fs')
const EXTS = ['.js', '.json', '.wxml', '.wxss', '.wxs', '.scss', '.pcss', '.less']

exports.getFiles = (base, path = '', exts) => {
  let files = []

  path = join(base, path)

  for (const ext of (exts || EXTS)) {
    let file = path + ext
    if (existsSync(file)) files.push(file)
  }

  return files
}

/**
 * 扁平数组
 * @param {Array} arr 输入数组
 */
exports.flattenDeep = (arr) => {
  while (arr.some(item => Array.isArray(item))) {
    arr = [].concat(...arr)
  }
  return arr
}

exports.setMapValue = (origin, protertyName, value) => {
  let proterty = origin[protertyName]
  if (!proterty) {
    let proterty = origin[protertyName] = new Set()
    proterty.add(value)
  } else {
    proterty.add(value)
  }
}

/**
 * 标准化入口
 * @param {any} entry webpack config entry
 * 1. entry: 'path/entry.json' => ['path/entry.json']
 * 2. entry: [ 'path/entry1.json', 'path/entry2.json', 'path/index.js' ] => [ 'path/entry1.json', 'path/entry2.json' ]
 * 3. entry: { app1: 'path/entry1.json', app2: 'path/entry2.json', index: 'path/index.js' } => [ 'path/entry1.json', 'path/entry2.json' ]
 * @param {Array} chunkNames 被忽略的 chunk
 */
exports.formatEntry = (context = process.cwd(), entry = [], chunkNames = []) => {
  let miniEntrys = []

  let getEntry = entry => {
    entry = isAbsolute(entry) ? entry : join(context, entry)
    if (!existsSync(entry)) throw new Error('找不到文件：', entry)

    return entry
  }

  if (Array.isArray(entry)) {
    entry.forEach(item => {
      if (/\.json/.test(item)) {
        miniEntrys.push(getEntry(item))
      }
    })
  } else if (typeof entry === 'object' && entry !== null) {
    Object.keys(entry).forEach((key) => {
      if (/\.json/.test(entry[key])) {
        chunkNames.push(key)
        miniEntrys.push(getEntry(entry[key]))
      }
    })
  }

  if (typeof entry === 'string' && /\.json/.test(entry)) miniEntrys = [entry]

  if (!miniEntrys.length) throw new Error('找不到一个有效的入口文件')

  return miniEntrys
}

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
exports.formatSource = function (entryContexts = [], resources = []) {
  /**
   * 项目依赖的目录列表，会根据这些目录计算出最后输出路径
   */
  const entryDirs = entryContexts.map(entry => dirname(entry))
  const sourceSet = new Set([...entryDirs, ...resources])
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

exports.relative = (from, to) => {
  return './' + relative(dirname(from), to).replace(/\\/g, '/')
}

exports.noop = () => {}

/**
 * 插件中使用的 resolver，获取真实路径
 */
const {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} = require('enhanced-resolve')

module.exports.createResolver = function (compiler) {
  const resolver = ResolverFactory.createResolver(
    Object.assign(
      {
        fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
        extensions: ['.js', '.json']
      },
      compiler.options.resolve
    )
  )

  return (context, request) => {
    return new Promise((resolve, reject) => {
      resolver.resolve({}, context, request, {}, (err, res) => err ? reject(err) : resolve(res))
    })
  }
}
