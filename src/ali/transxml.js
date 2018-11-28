const { ConcatSource } = require('webpack-sources')
const { DomUtils } = require('htmlparser2')
const utils = require('../utils')
const FileTree = require('../FileTree')
const Xml = require('../helpers/wxml')

let tree = new FileTree()

let eventSet = new Set()

function componentHandle (forEachAttr) {
  return ({ name, attribs, inComponents }) => {
    /**
     * 自定义组件上的 class 移动到自定义组件内
     */
    if (name && attribs.class && inComponents) {
      attribs['root-class'] = attribs.class

      delete attribs.class
    }

    /**
     * 找到自定义组件使用的事件
     */
    if (name && inComponents) {
      let attrs = Object.keys(attribs)

      attrs.forEach(attr => {
        let match = attr.match(/^(on|catch)/)
        if (match) {
          let event = attr.substr(match.index + match[1].length)

          event = event.replace(/[^a-zA-Z]/g, '').toLowerCase()

          event = 'on' + event.substr(0, 1).toUpperCase() + event.substr(1)

          attribs[event] = attribs[attr]

          if (event !== attr) {
            // DEBUG console.log(attr, event)
            delete attribs[attr]
          }

          eventSet.add(event)
        }
        forEachAttr(name, attr, attribs[attr])
      })
    }

    /**
     * 自定义组件 ID 选择
     */
    if (name && attribs.id && inComponents) {
      attribs['onComponentMounted'] = 'componentMounted'
    }
  }
}

function camelCase (str) {
  let words = str.split(/[^a-zA-Z]/)

  return words.reduce((str, val) => {
    str += (val[0].toUpperCase() + val.substr(1))
    return str
  }, words.shift())
}

function transClass (exteralClasses, attribs) {
  const updateClassAttr = (classAttr = '') => {
    let classes = classAttr.split(/\s/).map(c => c.trim())

    classes.forEach((c, index) => {
      if (exteralClasses.has(c)) {
        classes[index] = `{{ ${camelCase(c)} }}`
      }
    })
    return classes
  }

  if (attribs['class']) {
    attribs['class'] = updateClassAttr(attribs['class']).join(' ')
  }

  if (attribs['root-class']) {
    attribs['root-class'] = updateClassAttr(attribs['root-class']).join(' ')
  }
}

function transComClass (exteralClasses, attribs, depComPath) {
  let xmlPath = depComPath.replace('.json', '.wxml')
  let depExteralClasses = tree.getFile(xmlPath).exteralClasses

  if (!depExteralClasses.size) return

  let attrKeys = Object.keys(attribs)

  attrKeys.forEach(key => {
    // if (/goods-buy/.test(depComPath)) {
    //   console.log(depExteralClasses, exteralClasses)
    // }
    // 应用的组件有定义这个 exteralcalss 并且用的也是外部传入的 exteralcalss
    if (depExteralClasses.has(key) && exteralClasses.has(attribs[key])) {
      let attrValue = camelCase(attribs[key])

      attribs[key] = `{{ ${attrValue} }}`
    }
  })
}

module.exports = async function (compilation, plugin) {
  let wxmls = tree.wxmls
  let assets = compilation.assets

  for (const file of wxmls) {
    let xml = new Xml(compilation, file, 'ali')
    let distPath = xml.getDistPath(file)

    let coms = Xml.getCanUseComponents(file, false)

    const handle = componentHandle(function forEachAttr (name, attr, value) {
      /**
           * 把所有的 externalClasses 属性添加到这个组件的属性中，
           * 方便在后边对这个文件处理，以便支持 externalClasses
           */
      if (/-class/.test(attr) && coms.has(name)) {
        let comWxmlPath = coms.get(name).replace('.json', '.wxml')
        let fileMeta = tree.getFile(comWxmlPath)

        fileMeta.exteralClasses.add(attr)
      }
    })

    assets[distPath] = xml.formatComponent(handle)
  }

  for (const file of wxmls) {
    let exteralClasses = tree.getFile(file).exteralClasses
    if (!exteralClasses.size) {
      continue
    }

    let coms = Xml.getCanUseComponents(file, false)

    let distPath = utils.getDistPath(file).replace(/\.wxml$/, '.axml')
    let content = assets[distPath].source().toString()

    const dom = Xml.find(content, function ({ name, attribs = {} }) {
      // 处理这个 class 属性上用到的 exteralclass
      ;
      (attribs['class'] || attribs['root-class']) && transClass(exteralClasses, attribs)

      // 自定义组件处理
      coms.get(name) && transComClass(exteralClasses, attribs, coms.get(name))
    })

    content = DomUtils.getInnerHTML({
      children: dom
    })

    assets[distPath] = new ConcatSource(content)
  }
  // TODO 删除 template
  // Object.keys(assets).forEach(path => {
  //   if (rootXmlEntrys.indexOf(path) === -1 && /\.axml$/.test(path)) {
  //     // delete assets[path]
  //   }
  // })

  /**
   * 外部传入的事件只支持 onXXX，catch 要处理
   */
  let events = []
  for (let eventName of eventSet) {
    events.push(`'${eventName}': function () {}`)
  }

  compilation.assets['mixin.js'] = new ConcatSource(`
    var _afAppx = __webpack_require__( /*! @alipay/af-appx */ '@alipay/af-appx');
    var global = _afAppx.bridge.global = _afAppx.bridge.global || {};
    module.exports = global._mixins = {
      props: {${
  events
}}
    }
  `)
}
