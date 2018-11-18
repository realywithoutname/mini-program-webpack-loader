const { dirname, relative, join, basename } = require('path')
const { ConcatSource } = require('webpack-sources')
const { DomUtils, parseDOM } = require('htmlparser2')

let getDistPath = null
let assets = null
let $plugin = null
let eventSet = new Set()

module.exports = async function (compilation, plugin) {
  let rootXmlEntrys = []

  $plugin = plugin
  assets = compilation.assets
  getDistPath = (src) => plugin.getDistFilePath(src).replace(/\.wxml$/, '.axml')

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
  plugin.xmlDepsMap.forEach((val, key) => {
    if (val.isRoot) {
      rootXmlEntrys.push(key)
    }

    /**
     * 减少下面的 parse
     */
    if (!val.isRoot || val.deps.size === 0) {
      plugin.xmlDepsMap.delete(key)
    }
  })

  /**
   * 对依赖 template 的 wxml 处理
   */
  let xmlDepsTree = parseMap(plugin.xmlDepsMap, true)
  let xmlEntrys = Object.keys(xmlDepsTree)

  for (const file of xmlEntrys) {
    let distPath = getDistPath(file)
    let content = loadXmlContent(file, file, xmlDepsTree[file])
    assets[distPath] = formatComponent(file, content)
  }

  /**
   * 对于没有依赖 template 的 wxml 处理
   */
  let rootXmls = []
  for (const file of rootXmlEntrys) {
    let distPath = getDistPath(file)
    rootXmls.push(distPath)
    assets[distPath] = formatComponent(file, assets[distPath])
  }

  /**
   * 对不依赖 wxml 的处理
   */
  Object.keys(assets).forEach(path => {
    /**
     * 对于 template 的输出文件删除
     */
    if (rootXmls.indexOf(path) === -1 && /\.axml$/.test(path)) {
      // delete assets[path]
    }
  })

  /**
   * 外部传入的事件只支持 onXXX，catch 要处理
   */
  let events = []
  for (let eventName of eventSet) {
    events.push(`'${eventName}': function () {}`)
  }

  assets['mixin.js'] = new ConcatSource(`
    var _afAppx = __webpack_require__( /*! @alipay/af-appx */ '@alipay/af-appx');
    var global = _afAppx.bridge.global = _afAppx.bridge.global || {};
    module.exports = global._mixins = {
      props: {${
  events
}}
    }
  `)
  // console.log('\n', JSON.stringify(xmlDepsTree, null, 2))
  // console.log(plugin.xmlDepsMap, Object.keys(compilation.assets))
}

/**
 * 处理 WXML 的自定义组件
 * @param {*} file
 * @param {*} buff
 */
function formatComponent (file, buff) {
  let baseName = join(dirname(file), basename(file, '.wxml'))
  let content = buff.source().toString()

  if ($plugin.componentSet.has(baseName) || $plugin.pagesSet.has(baseName)) {
    const { usingComponents } = require(baseName + '.json')
    const componnets = Object.keys(usingComponents || {})

    if (componnets.length) {
      let dom = parseDOM(content, {
        recognizeSelfClosing: true,
        lowerCaseAttributeNames: false
      })
      DomUtils.find(function ({ name, attribs }) {
        /**
         * 自定义组件上的 class 移动到自定义组件内
         */
        if (name && attribs.class && componnets.indexOf(name) !== -1) {
          attribs['root-class'] = attribs.class
          delete attribs.class
        }

        /**
         * 找到自定义组件使用的事件
         */
        if (name && componnets.indexOf(name) !== -1) {
          let attrs = Object.keys(attribs)
          let events = attrs.filter(attr => {
            if (/^catch.+?=/.test(attr)) {
              attribs[attr.replace(/^catch/, 'on')] = attribs[attr]
              console.log(attr, attr.replace(/^catch/, 'on').replace(/[^a-zA-Z]/, ''))
              delete attribs[attr]
            }
            let isEv = false
            if (isEv = /^(on|catch).+?/.test(attr)) {
              let _attr = attr

              _attr = attr.replace(/^catch/, 'on').replace(/[^a-zA-Z]/g, '')

              attribs[_attr] = attribs[attr]

              if (_attr !== attr) {
                console.log(attr, _attr)
                delete attribs[attr]
              }
            }

            return isEv
          })
          events.forEach(ev => {
            ev = ev.replace(/^catch/, 'on').replace(/[^a-zA-Z]/g, '')
            eventSet.add(ev)
          })
          // if (events.length) {
          // let mapKey = `${file}#${usingComponents[name]}`
          // if (!componentMap.has(usingComponents[name])) {
          //   componentMap.set(mapKey, new Set())
          // }

          // let componentEventSet = componentMap.get(mapKey)

          // componentEventSet.add(...events)
          // }
        }
      }, dom, true)

      content = DomUtils.getInnerHTML({ children: dom })
    }
  }

  return new ConcatSource(content)
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

    loaded[dep] = true
    buff.add(depContent)
  })

  buff.add(content)

  return buff
}

function parseMap (map, isRoot) {
  let tree = {}
  for (const [key, val] of map) {
    tree[key] = parseMap(val.deps)
  }
  return tree
}
