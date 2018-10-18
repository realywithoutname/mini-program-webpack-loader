const { dirname, relative } = require('path')
const { ConcatSource } = require('webpack-sources')

let getDistPath = null
let assets = null

module.exports = function (compilation, plugin) {
  let rootXmlEntrys = []
  
  assets = compilation.assets
  getDistPath = (src) => plugin.getDistFilePath(src).replace(/\.wxml$/, '.axml')

  plugin.xmlDepsMap.forEach((val, key) => {
    if (!val.isRoot || val.deps.size === 0) {
      plugin.xmlDepsMap.delete(key)
    }

    if (val.isRoot) {
      let distPath = getDistPath(key)
      rootXmlEntrys.push(distPath)
    }
  })
  let xmlDepsTree = parseMap(plugin.xmlDepsMap, true)

  let xmlEntrys = Object.keys(xmlDepsTree)
  for (const file of xmlEntrys) {
    let distPath = getDistPath(file)
    assets[distPath] = loadXmlContent(file, file, xmlDepsTree[file])
  }

  Object.keys(assets).forEach(path => {
    if (rootXmlEntrys.indexOf(path) === -1 && /\.axml$/.test(path)) {
      delete assets[path]
    }
  })
  // console.log('\n', JSON.stringify(xmlDepsTree, null, 2))
  // console.log(plugin.xmlDepsMap, Object.keys(compilation.assets))
}

function loadXmlContent (entry, file, deps, loaded = {}) {
  let distPath = getDistPath(file)
  let content = assets[distPath].source().toString()
  let buff = new ConcatSource()
  
  let depFiles = Object.keys(deps)
  depFiles.forEach(dep => {
    if (/\.wxs$/.test(dep)) {
      dep = dep.replace(/\.wxs$/, '.sjs')

      let originPath = './' + relative(dirname(file), dep)
      let newPath = './' + relative(dirname(entry), dep)
      content = content.replace(originPath, newPath)
      return
    }

    if (loaded[dep]) return
    let depContent = loadXmlContent(entry, dep, deps[dep], loaded)
    let depDistPath = getDistPath(dep)

    loaded[dep] = true
    buff.add(depContent)
  })

  buff.add(content)

  return buff
}

function parseMap(map, isRoot) {
  let tree = {}
  for (const [key, val] of map) {
    tree[key] = parseMap(val.deps)
  }
  return tree
}