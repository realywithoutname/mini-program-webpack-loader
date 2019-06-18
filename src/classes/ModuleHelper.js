const { dirname, basename, extname, join } = require('path')

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

    return join(dir, `${name}.json`)
  }

  isComponentFile (file) {
    const jsonFile = this.getJsonFile(file)
    const component = this.fileTree.components.get(jsonFile)

    return !!component
  }

  moduleOnlyUsedBySubPackage (module, root) {
    const file = module.resource
    if (!/\.js$/.test(file) || module.isEntryModule()) return false
    if (!module._usedModules) throw new Error('非插件提供的 module 不支持')

    const users = module._usedModules

    if (!users.size) return false

    const reg = new RegExp(`^${root}`)

    return !Array.from(users).some((source) => !reg.test(source))
  }

  onlyUsedInSubPackagesReturnRoots (file) {
    if (!this.isComponentFile(file)) return false

    const { packages } = this.fileEntryPlugin
    const reg = new RegExp(
      Object.keys(packages).filter(root => !!root).map(root => `/${root}/`).join('|')
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
          root: matched[0].substr(1)
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
      Object.keys(packages).filter(root => !!root).map(root => `/${root}/`).join('|')
    )

    return reg.test(file)
  }
}
