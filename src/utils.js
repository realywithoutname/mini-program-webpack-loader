const {
  join,
  isAbsolute,
  dirname,
  basename
} = require('path')

const {
  existsSync
} = require('fs');

const EXTS = ['.js', '.json', '.wxml', '.wxss', '.wxs', '.scss', '.pcss', '.less']

async function setConponentFiles(resolver, context, component) {
  component = component + '.json'

  // 获取自定义组件的绝对路径
  let absPath = await resolver(context, component)

  // 获取依赖的实际文件列表
  let dir = dirname(absPath)
  let name = basename(absPath, '.json')

  // 新增到编译的组件以及组件对应的文件
  return exports.getFiles(dir, name)
}

exports.componentFiles = async (resolver, jsonFile) => {
  let componentJOSN = require(jsonFile)
  let context = dirname(jsonFile)
  let {
    componentGenerics,
    usingComponents
  } = componentJOSN

  if (!usingComponents && !componentGenerics) return []

  let filePromise = []
  /**
   * 自定义组件
   */
  for (const key in usingComponents || {}) {
    let component = usingComponents[key]
    if (/^plugin:\/\//.test(component)) {
      continue
    }
    filePromise.push(
      setConponentFiles(resolver, context, component)
    )
  }

  /**
   * 抽象组件
   */
  for (const key in componentGenerics) {
    if (typeof componentGenerics[key] === 'object') {
      for (const _key in componentGenerics[key]) {
        let element = componentGenerics[key][_key];
        filePromise.push(
          setConponentFiles(resolver, context, element)
        )
      }
    }
  }

  return await Promise.all(filePromise)
}

exports.getAbsolutePath = async (resolver, context, path) => {
  return await resolver()
}

exports.getDistPath = (compilerContext, entryContexts, outPath) => {
  /**
   * webpack 以 config 所在目录的 src 为打包入口
   * 所以可以根据该目录追溯源文件地址
   */
  return (path) => {
    let fullPath = compilerContext
    let npmReg = /node_modules/g

    if (path === outPath) return path

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

    // 根据 entry 中定义的 json 文件目录获取打包后所在目录，如果不能获取就返回原路径
    let contextReg = new RegExp(entryContexts.join('|'), 'g')
    if (fullPath !== compilerContext && contextReg.exec(fullPath)) {
      path = fullPath.substr(contextReg.lastIndex + 1)
      console.assert(!npmReg.test(path), `文件${path}路径错误：不应该还包含 node_modules`)
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
}


/**
 * 获取文件路径
 * @param {*} base 
 * @param {*} path 
 * @param {*} exts 
 */
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
    arr = [].concat(...arr);
  }
  return arr;
};

exports.setMapValue = (origin, protertyName, value) => {
  let proterty = origin[protertyName]
  if (!proterty) {
    let proterty = origin[protertyName] = new Set()
    proterty.add(value)
  } else {
    proterty.add(value)
  }
}

exports.formatEntry = (entry, chunkNames) => {
  let miniEntrys = []
  if (typeof entry === 'object' && entry !== null) {
    Object.keys(entry).forEach((key) => {
      if (/\.json/.test(entry[key])) {
        chunkNames.push(key)
        miniEntrys.push(entry[key])
      }
    })
  }

  if (Array.isArray(entry)) miniEntrys = entry
  if (typeof entry === 'string') miniEntrys = [entry]
  
  return miniEntrys
}