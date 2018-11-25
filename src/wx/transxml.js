const {
  dirname,
  relative,
  join,
  basename
} = require('path')
const {
  ConcatSource
} = require('webpack-sources')
const {
  DomUtils,
  parseDOM
} = require('htmlparser2')

const nativeTags = ['view', 'scroll-view', 'swiper', 'movable-view', 'movable-aera', 'cover-view', 'cover-image', 'icon', 'text', 'rich-text', 'progress', 'button', 'checkbox', 'checkbox-group', 'form', 'input', 'label', 'picker', 'picker-view', 'picker-view-column', 'swiper-item', 'radio', 'slider', 'switch', 'textarea', 'navigator', 'functional-page-navigator', 'audio', 'image', 'video', 'camera', 'live-player', 'live-pusher', 'map', 'canvas', 'open-data', 'web-view', 'ad', 'official-account', 'template', 'wxs', 'import', 'include', 'block', 'slot']

let getDistPath = null
let assets = null
let $plugin = null

module.exports = async function (compilation, plugin) {
  let rootXmlEntrys = []

  plugin.xmlDepsMap.forEach((val, key) => {
    if (val.isRoot) {
      rootXmlEntrys.push(key)
    }
  })

  $plugin = plugin
  assets = compilation.assets
  getDistPath = (src) => plugin.getDistFilePath(src)

  /**
   * 对依赖 template 的 wxml 处理
   */
  let xmlDepsTree = parseMap(plugin.xmlDepsMap, true)
  let xmlEntrys = Object.keys(xmlDepsTree)

  for (const file of xmlEntrys) {
    let content = loadXmlContent(file, file, xmlDepsTree[file])

    findAndWirteTags(file, content)
  }

  for (const file of rootXmlEntrys) {
    let distPath = getDistPath(file)

    findAndWirteTags(file, assets[distPath])
  }
}

function findAndWirteTags (file, content) {
  let filePath = join(dirname(file), basename(file, '.wxml'))
  content = content.source().toString()

  const componentCode = getComponents(filePath + '.json')

  if (!componentCode) return

  const globalComponents = $plugin.getGlobalComponents()
  const { usingComponents = {}, componentGenerics = {} } = componentCode

  let fileTags = findTags(file, content)

  let componentTagKeys = Object.keys(usingComponents).concat(Object.keys(componentGenerics))
  let globalTagKeys = Object.keys(globalComponents)
  let undefinedTags = []

  let hasChange = false

  for (const tag of fileTags) {
    if (componentTagKeys.indexOf(tag) !== -1) {
      continue
    }

    if (globalTagKeys.indexOf(tag) !== -1) {
      usingComponents[tag] = getComponentRelativePath(filePath, globalComponents[tag])
      hasChange = true
      continue
    }
    undefinedTags.push(tag)
  }

  if (hasChange) {
    let jsonDistPath = getDistPath(filePath + '.json')
    assets[jsonDistPath] = new ConcatSource(JSON.stringify(componentCode, null, 2))
  }

  undefinedTags.length && console.log('\n', getDistPath(file), '中使用了未定义的自定义组件:', Array.from(new Set(undefinedTags)).toString().yellow)
}

function getComponentRelativePath (file, componentPath) {
  let outputPath = $plugin.outputPath
  let distPath = getDistPath(file)

  let componentFile = join(outputPath, distPath)
  componentPath = join(outputPath, componentPath)

  let relPath = relative(dirname(componentFile), componentPath)
  return relPath
}

function getComponents (file) {
  let dist = getDistPath(file)

  /**
   * 有些页面没有 json 文件
   */
  if (!assets[dist]) return

  let code = assets[dist].source().toString()

  let json = JSON.parse(code)

  json.usingComponents = json.usingComponents || {}
  return json
}
/**
 * 处理 WXML 的自定义组件
 * @param {*} file
 * @param {*} buff
 */
function findTags (file, buff) {
  let tags = []

  let dom = parseDOM(buff, {
    recognizeSelfClosing: true,
    lowerCaseAttributeNames: false
  })

  DomUtils.find(function ({ name, attribs }) {
    /**
     * 非原生 tag
     */
    if (name && nativeTags.indexOf(name) === -1) {
      tags.push(name)
    }
  }, dom, true)

  return tags
}

/**
 * 合并页面的 template
 * @param {*} entry
 * @param {*} file
 * @param {*} deps
 * @param {*} loaded
 */
function loadXmlContent (entry, file, deps, loaded = {}) {
  let distPath = getDistPath(file)
  let buff = new ConcatSource('')

  if (!assets[distPath]) return buff

  let content = assets[distPath].source().toString()

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

    loaded[dep] = true
    buff.add(depContent)
  })

  buff.add(content)

  return buff
}

/**
 * Map {
 *    path: Map {
 *      isRoot: true,
 *      deps: {
 *        path: ...
 *      }
 *    }
 * }
 */
function parseMap (map, isRoot) {
  let tree = {}
  for (const [key, val] of map) {
    // 跳过不依赖 template 的自定义组件
    if (!val.isRoot || val.deps.size) {
      tree[key] = parseMap(val.deps)
    }
  }
  return tree
}
