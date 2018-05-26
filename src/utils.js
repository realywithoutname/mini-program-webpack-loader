const {
  join,
  isAbsolute
} = require('path')

const {
  existsSync
} = require('fs');

const EXTS = ['.js', '.json', '.wxml', '.wxss', '.wxs', '.scss']

exports.getDistPath = (compilerContext, entryContexts) => {
  /**
   * webpack 以 config 所在目录的 src 为打包入口
   * 所以可以根据该目录追溯源文件地址
   */
  return (path) => {
    let fullPath = compilerContext
    let npmReg = /node_modules/g
    let pDirReg = /^[_|\.\.]\//g

    if (isAbsolute(path)) {
      fullPath = path
    } else {
      // 相对路径：webpack 最好生成的路径，打包入口外的文件都以 '_' 表示上级目录

      while (pDirReg.test(path)) {
        path = path.substr(pDirReg.lastIndex)
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