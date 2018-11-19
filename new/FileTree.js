const set = (target, key, val) => {
  target[key] = val
  return target
}

let regRules = {
  '.js$': meta => set(meta, 'isJS', true),
  '.json$': meta => set(meta, 'isJSON', true) && set(meta, 'components', new Map()),
  '.wxml$': meta => set(meta, 'isWxml', true),
  '.wxss$': meta => set(meta, 'isWxss', true)
  // '.scss$': meta => set(meta, 'isScss', true),
  // '.pcss$': meta => set(meta, 'isPcss', true),
  // '.less$': meta => set(meta, 'isLess', true),
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

  addEntry (entry) {
    this.tree.set(entry, this.setFile([entry]))
  }

  addPage (pagePath, pageFiles) {
    let pagesMap = this.tree.get('pages')
    let pageFileSet = this.setFile(pageFiles)

    pagesMap.set(pagePath, pageFileSet)
  }

  /**
   * Map {
   *  files: FileSet, // 有完整的链
   *  used: FileSet // 没有链
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

  addDeps (file, depFiles) {
    let fileMap = this.tree.get('files')
    let fileMeta = fileMap.get(file)

    !fileMeta && console.log(fileMeta, file)
    fileMeta.deps = this.setFile(depFiles)
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

  clearDepComponents (file) {
    let fileMap = this.tree.get('files')
    let { components } = fileMap.get(file)

    components.clear()
  }
}

module.exports = FileTree
