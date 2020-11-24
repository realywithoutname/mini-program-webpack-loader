const { orderSource } = require('../helpers/resolve-dist-path')
const { join, relative, isAbsolute } = require('path')
const { getFile } = require('../helpers/get-files')

module.exports = class OutPutPath {
  constructor (context, resources, outPath) {
    this.sourceSet = orderSource(resources)
    this.outputPath = outPath
    this.compilerContext = context
  }

  get (path) {
    let fullPath = this.compilerContext
    let npmReg = /node_modules/g

    path = getFile(path)

    if (path === this.outputPath) return path

    path = path.replace(/(\.\.\/)?/g, ($1) => $1 ? '_/' : '')

    if (isAbsolute(path)) {
      fullPath = path
    } else {
      // 相对路径：webpack 最好生成的路径，打包入口外的文件都以 '_' 表示上级目录
      let pDirReg = /_\//g
      /**
       * 在 context 目录外的文件，会被处理为 _/_/ 这样的路径
       * 这里把以 _/ 开头的替换为 ../ 形式以计算输出路径。
       * pDirReg.lastIndex === 2 判断是以 _/ 开头，否则会存在如果目录名为 xxx_/xxx.xx 的时候也会被匹配，导致输出异常
       */

      while (pDirReg.test(path) && pDirReg.lastIndex === 2) {
        path = path.substr(pDirReg.lastIndex)
        pDirReg.lastIndex = 0
        fullPath = join(fullPath, '../')
      }

      if (fullPath !== this.compilerContext) {
        fullPath = join(fullPath, path)
      }
    }

    if (fullPath !== this.compilerContext) {
      for (let index = 0; index < this.sourceSet.length; index++) {
        const source = this.sourceSet[index]
        let outPath = relative(source, fullPath).replace(/\\/g, '/')

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
}
