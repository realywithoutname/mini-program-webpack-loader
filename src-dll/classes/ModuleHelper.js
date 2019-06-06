const { dirname, basename, extname, join } = require('path')
const { PROGRAM_ACCEPT_FILE_EXTS } = require('../config/constant')
module.exports = class ModuleHelper {
  constructor (miniLoader) {
    this.miniLoader = miniLoader
    this.fileTree = miniLoader.fileTree
    this.fileEntryPlugin = miniLoader.FileEntryPlugin
    this.deps = new Map()
    this.modules = new Map()
  }

  /**
   * 给模块添加使用者，记录这个模块被哪些 chunk 使用
   * @param {*} module
   * @param {*} dep
   * @param {*} chunkName
   */
  addUser (module, chunkName) {
    const resource = module.resource
    let chunks = this.deps.get(resource)
    if (!chunks) {
      chunks = new Set()
      this.deps.set(resource, chunks)
    }

    chunks.add(chunkName)

    module.beUsedChunks = chunks

    this.modules.set(resource, module)
  }

  getJsonFile (file) {
    const dir = dirname(file)
    const ext = extname(file)
    const name = basename(file, ext)

    // if (PROGRAM_ACCEPT_FILE_EXTS.indexOf(ext) === -1) throw new Error(`文件 ${file} 必须有一个合法的扩展名`)

    return join(dir, `${name}.json`)
  }

  isComponentFile (file) {
    const jsonFile = this.getJsonFile(file)
    const component = this.fileTree.components.get(jsonFile)

    return !!component
  }

  onlyUsedInSubPackagesReturnRoots (file) {
    if (!this.isComponentFile(file)) return false

    const { packages } = this.fileEntryPlugin
    const reg = new RegExp(
      Object.keys(packages).filter(root => !!root).join('|')
    )

    const fileMeta = this.fileTree.getFile(file)
    const { used } = fileMeta
    const roots = []

    let isTrue = false
    for (const { source } of used) {
      const matched = source.match(reg)
      if (matched) {
        roots.push({
          usedFile: source, // 在分包中这个文件被使用
          root: matched[0]
        })
        continue
      }
      isTrue = true
    }
    return !isTrue && roots
  }

  /**
   * 文件在子包
   * @param {*} file
   */
  fileIsInSubPackage (file) {
    const { packages } = this.fileEntryPlugin
    const reg = new RegExp(
      Object.keys(packages).filter(root => !!root).join('|')
    )

    return reg.test(file)
  }
}
