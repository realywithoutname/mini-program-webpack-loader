const { basename, dirname, join } = require('path')
const { resolveTargetPath } = require('../helpers/resolve-target-path')
const { relative } = require('../utils')

/**
FileNode: {
  source: String, // 文件绝对路径
  dist: String, // 文件输出路径
  deps: Set([FileNode]), // 文件依赖的文件
  used: Set([FileNode]), // 文件被依赖的文件（使用到这个文件）
  isXXX: Boolean, // 文件类型
  components: Map([componentName, path]), // json 文件才有的，组件名和组件的路径
  generics: Map(), // 暂时没用
}

PageNode: {
  isSub: Boolean, // 是不是分包
  files: Set([FileNode]) // 页面依赖的文件
}

ComponentNode: {
  files: Set([FileNode]), // 自定义组件依赖的文件
  used: Set([file]), // 自定义组件被使用的文件
  type: Map([file, type]), // 依赖的自定义组件的类型，在输出时需要用到
  json: Function => fileMeta // 方便快速的找到依赖文件中的 json 文件
}
*/

const set = (target, key, val) => {
  target[key] = val
  return target
}

let regRules = {
  '.js$': meta => set(meta, 'isJs', true),
  '.json$': meta => set(meta, 'isJson', true) &&
    set(meta, 'components', new Map()) &&
    set(meta, 'generics', new Map()),
  '.wxml$': meta => set(meta, 'isWxml', true) && set(meta, 'exteralClasses', new Set()),
  '.wxs$': meta => set(meta, 'isWxs', true),
  '.wxss$': meta => set(meta, 'isWxss', true),
  '.scss$': meta => set(meta, 'isScss', true),
  '.pcss$': meta => set(meta, 'isPcss', true),
  '.less$': meta => set(meta, 'isLess', true)
  // '.less$': meta => set(meta, 'isLess', true),
}

function getFileMeta (file, outputUtil) {
  let meta = {
    source: file,
    dist: resolveTargetPath(
      outputUtil.get(file)
    ),
    deps: new Set(),
    used: new Set()
  }

  meta.updateHash = function (hash) {
    meta.hash = hash
  }

  meta.clone = function () {
    return { ...meta }
  }

  for (const key in regRules) {
    if (new RegExp(`${key}`).test(file)) {
      regRules[key].call(null, meta)
      break
    }
  }

  return meta
}

class FileTree {
  constructor (miniLoader) {
    this.tree = new Map()
    this.tree.set('entry', new Set())
    this.tree.set('pages', new Map())
    this.tree.set('files', new Map())
    this.tree.set('components', new Map())
    this.tree.set('globalComponents', new Map())

    this.outputMap = {}
    this.miniLoader = miniLoader
    this.id = 0
  }

  get size () {
    return this.files.size
  }

  /**
   * 普通文件结构
   * Map {
   *  path: {
   *    source: FilePath,
   *    deps: FileSet,
   *    [FILE TYPE]: true
   *  }
   * }
   */
  get files () {
    return this.tree.get('files')
  }

  get pageSize () {
    return this.pages.size
  }

  get subPageSize () {
    let pageMap = this.pages
    let size = 0

    for (const page of pageMap.values()) {
      if (page.isSub) {
        size++
      }
    }

    return size
  }

  /**
   * pages Map {
   *  page: {
   *    isSub: true/false,
   *    files: FileSet
   *  }
   * }
   */
  get pages () {
    return this.tree.get('pages')
  }

  get comSize () {
    return this.components.size
  }

  /**
   * path: {
   *  source: FilePath,
   *  isJson: true,
   *  components: Map {tag: FilePath },
   *  files: FileSet, // 有完整的链
   *  used: Set { FilePath } // 该文件被其他哪些文件引用
   * }
   */
  get components () {
    return this.tree.get('components')
  }

  get entry () {
    return this.tree.get('entry')
  }

  addEntry (entry, files) {
    this.entry.has(entry) && this.clearFiles(
      this.getFile(entry)
    )

    if (!this.entry.has(entry)) {
      this.setFile(entry, null, true)
      const entryMeta = this.getFile(entry)

      const depFiles = this.setFile(files, entryMeta)
      this.tree.set(entry, entryMeta)

      entryMeta.files = depFiles
      this.entry.add(entry)
    }
  }

  /**
   * @param {*} pagePath
   * @param {*} pageFiles
   * @param {*} isSubPkg
   */
  addPage (pagePath, pageFiles, inSubPkg, isIndependent, entry) {
    let pagesMap = this.pages
    this.clearFiles(pagesMap.get(pagePath))

    let pageFileSet = this.setFile(pageFiles, this.getFile(entry), false, isIndependent)

    pagesMap.set(pagePath, {
      isSub: inSubPkg,
      files: pageFileSet
    })
  }

  /**
   * json 文件树结构
   * @param {*} file
   * @param {*} tag
   * @param {*} componentPath 组件的绝对路径
   * @param {*} componentFiles
   * 自定义组件 json 文件
   * {
   *  source: file,
   *  dist: resolveTargetPath(
   *    outputUtil.get(file)
   *  ),
   *  deps: new Set(),
   *  used: new Set(),
   *  isJson: true,
   *  components: new Map([componentName, componentAbsolutePath]),
   *  generics: new Map
   * }
   *
   * Component 结构
   * {
   *  files: Set([fileMeta]),
   *  used: Set([file]),
   *  type: Map([file, type]),
   *  json: Function => fileMeta
   * }
   */
  addComponent (file, tag, componentPath, componentFiles, type) {
    const fileMap = this.files
    const fileMeta = fileMap.get(file)
    const { components, isIndependent } = fileMeta
    const componentFileSet = this.setFile(componentFiles, fileMeta, false, isIndependent)
    let component = this.components.get(componentPath)

    this.clearFiles(component)

    if (!component) {
      component = {
        files: new Set(),
        used: new Set(),
        type: new Map(),
        get json () {
          const jsonFile = componentFiles.find(item => /\.json/.test(item))
          return fileMap.get(jsonFile)
        }
      }
      this.components.set(componentPath, component)
    }

    component.type.set(file, type)
    component.files = componentFileSet
    component.used.add(file)

    // 全局自定义组件不需要放在 json 文件上，应该单独管理，否则会导致解析后的入口 json 文件内容不对
    const entry = this.tree.get('entry')
    if (entry.has(file)) {
      this.tree.get('globalComponents').set(tag, componentPath)
      return
    }

    components.set(tag, componentPath)
  }

  /**
   * @param {*} file
   * @param {*} depFiles
   */
  addDeps (file, deps) {
    let fileMap = this.files
    let fileMeta = fileMap.get(file)
    const depMetas = new Set()

    for (const item of deps) {
      const meta = this.setFile(item.sourcePath, fileMeta, item.ignore)

      meta.forEach(meta => {
        // 一个文件可能被多个地方引用，在每个文件中使用的路径不同
        meta.depPath = meta.depPath || new Map()
        meta.depPath.set(file, item.origin)
        if (/\.wxml$/.test(meta.source)) meta.isTemplate = true
      })

      depMetas.add(...meta)
    }

    fileMeta.deps = depMetas
  }

  has (file) {
    return this.files.has(file)
  }

  hasPage (page) {
    return this.pages.has(page)
  }

  /**
   * 添加文件
   * @param {*} files 要添加的文件
   * @param {*} user 文件使用者
   * @param {*} ignore 是否检查输出路径
   * @param {*} isIndependent 是否在独立分包
   */
  setFile (files, user, ignore, isIndependent, dist) {
    let fileMap = this.files
    let fileSet = new Set()

    files = Array.isArray(files) ? files : [ files ]

    for (const file of files) {
      if (fileMap.has(file)) {
        const meta = fileMap.get(file)

        fileSet.add(meta)
        user && meta.used.add(user)
        continue
      }

      let meta = getFileMeta(file, this.miniLoader.outputUtil)
      let distFile = dist || this.outputMap[meta.dist]

      user && meta.used.add(user)
      meta.id = ++this.id
      meta.isIndependent = isIndependent

      // 允许引用不同的 node_modules 下的文件
      if (!ignore && distFile && (!/node_modules/.test(distFile) || !/node_modules/.test(file))) {
        throw new Error(`
          项目存在不同文件输出到一个文件的情况：
          ${this.outputMap[meta.dist]} 以及 ${file}
        `)
      }

      this.outputMap[meta.dist] = file

      fileSet.add(meta)
      fileMap.set(file, meta)
    }

    return fileSet
  }

  getFile (file, safe) {
    let fileMap = this.files
    let fileMeta = fileMap.get(file)

    if (!fileMeta) {
      if (!safe) {
        throw new Error('Can`t find file: ' + file)
      }

      this.setFile(file)

      return this.files.get(file)
    }

    return fileMeta
  }

  getFileByDist (dist) {
    if (this.outputMap[dist]) {
      dist = this.outputMap[dist]
    }

    return this.getFile(dist, true)
  }

  getCanUseComponents (wxmlFile, dist) {
    if (!/\.wxml/.test(wxmlFile)) throw new Error('只能获取 wxml 文件类型可使用组件')

    const jsonFile = wxmlFile.replace('.wxml', '.json')

    let usingComponents = new Map()
    let components = null

    // 文件本身定义的自定义组件
    let fileMeta = this.getFile(jsonFile, true)
    components = fileMeta.components

    const merge = (components) => {
      for (const [tag, path] of components) {
        if (usingComponents.has(tag) || !path) continue

        const { type, json: componentJson } = this.components.get(path)
        const conponentType = type.get(jsonFile)

        if (conponentType === 'generics') {
          continue
        }
        if (conponentType === 'plugin') {
          usingComponents.set(tag, path)
          continue
        }

        const relPath = relative(dist, componentJson.dist)

        usingComponents.set(
          tag,
          join(
            dirname(relPath),
            basename(relPath, '.json')
          )
        )
      }
    }

    merge(components)

    const globalComponents = this.tree.get('globalComponents')

    merge(globalComponents)

    return usingComponents
  }

  clearFiles (depConfig = { files: new Set() }) {
    // TODO 清理依赖的文件
  }

  removeFile (file) {
    let fileMap = this.files
    let fileMeta = fileMap.get(file)

    fileMap.delete(file)

    return fileMeta
  }

  clearDepComponents (file) {
    let fileMap = this.files
    let { components } = fileMap.get(file)

    components.clear()
  }

  get wxmls () {
    let wxmls = []

    for (const { files } of this.pages.values()) {
      for (const fileMeta of files) {
        fileMeta.isWxml && wxmls.push(fileMeta.source)
      }
    }

    for (const { files } of this.components.values()) {
      for (const fileMeta of files) {
        fileMeta.isWxml && wxmls.push(fileMeta.source)
      }
    }

    return wxmls
  }

  get jsons () {
    let jsons = []

    for (const { files } of this.pages.values()) {
      for (const fileMeta of files) {
        fileMeta.isJson && jsons.push(fileMeta.source)
      }
    }

    for (const { files } of this.components.values()) {
      for (const fileMeta of files) {
        fileMeta.isJson && jsons.push(fileMeta.source)
      }
    }

    return jsons
  }

  get wxs () {
    let wxs = []

    for (const fileMeta of this.files.values()) {
      fileMeta.isWxs && wxs.push(fileMeta.source)
    }

    return wxs
  }
}

module.exports = FileTree
