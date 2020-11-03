const { dirname, basename, extname, join } = require('path')

module.exports = class ModuleHelper {
  constructor (miniLoader) {
    this.miniLoader = miniLoader
    this.fileTree = miniLoader.fileTree
    this.fileEntryPlugin = miniLoader.FileEntryPlugin
    this.chunks = new Map()
    this.deps = new Map()
  }

  /**
   * 给模块添加使用者，记录这个模块被哪些 chunk 使用
   * @param {*} module
   * @param {*} dep
   * @param {*} chunkName
   */
  addDep (chunkName, dep) {
    let deps = this.chunks.get(chunkName)
    if (!deps) {
      deps = new Set()
      this.chunks.set(chunkName, deps)
    }

    let used = this.deps.get(dep)

    if (!used) {
      used = new Set()
      this.deps.set(dep, used)
    }

    used.add(chunkName)
    deps.add(dep)
  }

  tree () {
    let tree = {}

    for (const [key, val] of this.chunks) {
      tree[key] = [...val]
    }

    return tree
  }

  toUsed () {
    let tree = {}

    for (const [key, val] of this.deps) {
      tree[key] = [...val]
    }

    return tree
  }

  toJson () {
    return {
      chunks: this.tree(),
      deps: this.toUsed()
    }
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
    if (!module._usedModules) return false

    const users = module._usedModules

    if (!users.size) return false

    const reg = new RegExp(`^${root}`)

    return !Array.from(users).some((source) => !reg.test(source))
  }

  onlyUsedInSubPackagesReturnRoots (file) {
    const { packages } = this.fileEntryPlugin
    // 如果只有一个且是主包，直接跳过
    const firstPackage = packages[0] || {}
    if (Object.keys(packages).length === 1 && !firstPackage.root) {
      return []
    }

    const fileMeta = this.fileTree.getFile(file)
    const { used } = fileMeta
    const roots = []

    /**
     * 对于没有被使用的自定义组件应该被删除
     */
    if (!used.size && fileMeta.isComponentFile) {
      return roots
    }

    // 假设该自定义组件只是在分包使用
    let usedInMainPackage = false
    for (const meta of used) {
      const stack = [meta]
      // 标记使用这个文件的单个文件是不是在分包。如果是在分包则该文件也在这个分包使用
      let usedInSubPackages = false
      while (stack.length && !usedInMainPackage) {
        const meta = stack.pop()
        const { source, used } = meta
        const matched = this.fileIsInSubPackage(source) // source.match(reg)
        if (matched) {
          roots.push(matched)
          usedInSubPackages = true
          continue
        }
        /**
         * 没有被使用的自定义组件（全局自定义组件），可以不用管
         * 设置 usedInSubPackages 为 true
         */
        if (!used.size && meta.isComponentFile) {
          usedInSubPackages = true
          continue
        } else if (!used.size) {
          // 非自定义组件文件，没有被使用，说明是顶级文件，一定在主包
          usedInMainPackage = true
          break
        }

        /**
         * 其他如果 used 还有则继续向上判断
         * 如果 used.size 为 0，则表示页面，页面则如果是分包会被 match 到
         */
        stack.unshift(...used)
        usedInSubPackages = false
      }

      // 如果有不在分包中使用，则表示在主包有使用
      if (!usedInSubPackages) {
        usedInMainPackage = true
        break
      }
    }

    return !usedInMainPackage && [...new Set(roots)]
  }

  /**
   * 文件在子包
   * @param {*} file
   */
  fileIsInSubPackage (file) {
    const dist = this.miniLoader.outputUtil.get(file)
    const { packages } = this.fileEntryPlugin
    const reg = new RegExp(
      Object.keys(packages).filter(root => !!root).map(root => `/${root}/`).join('|')
    )

    const matched = file.match(reg)

    if (matched) {
      const packName = matched[0].substring(1, matched[0].length - 1)
      const matchedPack = packages[packName]

      // 检查文件确实属于分包
      if (matchedPack && dist.indexOf(packName) === 0) {
        return matched[0].substr(1)
      }
    }
    return false
  }
}
