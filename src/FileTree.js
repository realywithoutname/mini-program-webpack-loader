const set = (target, key, val) => {
  target[key] = val
  return target
}

let regRules = {
  '.js$': meta => set(meta, 'isJs', true),
  '.json$': meta => set(meta, 'isJson', true) && set(meta, 'components', new Map()),
  '.wxml$': meta => set(meta, 'isWxml', true),
  '.wxs$': meta => set(meta, 'isWxs', true),
  '.wxss$': meta => set(meta, 'isWxss', true),
  '.scss$': meta => set(meta, 'isScss', true),
  '.pcss$': meta => set(meta, 'isPcss', true),
  '.less$': meta => set(meta, 'isLess', true)
  // '.less$': meta => set(meta, 'isLess', true),
}

function getFileMeta (file) {
  let meta = {
    source: file,
    deps: new Set()
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
  constructor () {
    if (FileTree._tree) return FileTree._tree

    this.tree = new Map()
    this.tree.set('pages', new Map())
    this.tree.set('files', new Map())
    this.tree.set('components', new Map())

    FileTree._tree = this
  }

  get size () {
    return this.tree.get('files').size
  }

  get pageSize () {
    return this.tree.get('pages').size
  }

  get subPageSize () {
    let pageMap = this.tree.get('pages')
    let size = 0

    for (const page of pageMap.values()) {
      if (page.isSub) {
        size++
      }
    }

    return size
  }

  get comSize () {
    return this.tree.get('components').size
  }

  addEntry (entry) {
    this.tree.set(entry, this.setFile([entry]))
  }

  /**
   * pages Map {
   *  page: {
   *    isSub: true/false,
   *    files: FileSet
   *  }
   * }
   * @param {*} pagePath
   * @param {*} pageFiles
   * @param {*} isSubPkg
   */
  addPage (pagePath, pageFiles, inSubPkg) {
    let pagesMap = this.tree.get('pages')
    let pageFileSet = this.setFile(pageFiles)

    pagesMap.set(pagePath, {
      isSub: inSubPkg,
      files: pageFileSet
    })
  }

  /**
   * json 文件树结构
   * path: {
   *  source: FilePath,
   *  isJson: true,
   *  components: Map {tag: FilePath },
   *  files: FileSet, // 有完整的链
   *  used: Set { FilePath } // 该文件被其他哪些文件引用
   * }
   * @param {*} file
   * @param {*} tag
   * @param {*} componentPath
   * @param {*} componentFiles
   */
  addComponent (file, tag, componentPath, componentFiles) {
    let componentFileSet = this.setFile(componentFiles)

    let fileMap = this.tree.get('files')
    let { components } = fileMap.get(file)

    components.set(tag, componentPath)

    let componentsMap = this.tree.get('components')
    let component = componentsMap.get(componentPath)

    if (!component) {
      component = { files: new Set(), used: new Set() }
      componentsMap.set(componentPath, component)
    }

    component.files = componentFileSet
    component.used.add(file)
  }

  /**
   * 普通文件结构
   * path: {
   *  source: FilePath,
   *  deps: FileSet,
   *  [FILE TYPE]: true
   * }
   * @param {*} file
   * @param {*} depFiles
   */
  addDeps (file, depFiles) {
    let fileMap = this.tree.get('files')
    let fileMeta = fileMap.get(file)

    fileMeta.deps = this.setFile(depFiles)
  }

  has (file) {
    return this.tree.get('files').has(file)
  }

  hasPage (page) {
    return this.tree.get('pages').has(page)
  }

  setFile (files) {
    let fileMap = this.tree.get('files')
    let fileSet = new Set()

    files = Array.isArray(files) ? files : [ files ]

    for (const file of files) {
      if (fileMap.has(file)) {
        fileSet.add(fileMap.get(file))
        continue
      }

      let meta = getFileMeta(file)

      fileSet.add(meta)
      fileMap.set(file, meta)
    }

    return fileSet
  }

  getFile (file) {
    let fileMap = this.tree.get('files')
    let fileMeta = fileMap.get(file)

    if (!fileMeta) throw new Error('Can`t find file: ' + file)

    return fileMeta
  }

  removeFile (file) {
    let fileMap = this.tree.get('files')
    let fileMeta = fileMap.get(file)

    fileMap.delete(file)

    return fileMeta
  }

  clearDepComponents (file) {
    let fileMap = this.tree.get('files')
    let { components } = fileMap.get(file)

    components.clear()
  }
}

module.exports = FileTree
