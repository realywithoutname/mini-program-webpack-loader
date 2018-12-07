const { ConcatSource } = require('webpack-sources')
const { transform } = require('lebab')
const { DomUtils } = require('htmlparser2')
const utils = require('../utils')
const FileTree = require('../FileTree')
const Xml = require('../helpers/wxml')
const { getAssetContent } = require('../helpers/compilation')
const { toTargetPath } = require('../helpers/path')

let tree = new FileTree()

let eventSet = new Set()

function componentHandle (forEachAttr) {
  return (componnets, el, inComponents, file) => {
    let { name, attribs = {}, parent } = el
    let componentFileMeta = null
    if (componnets.has(name)) {
      componentFileMeta = tree.getFile(componnets.get(name))
    }
    /**
     * 自定义组件上的 class 移动到自定义组件内
     */
    if (name && attribs.class && inComponents) {
      attribs['root-class'] = attribs.class

      delete attribs.class
    }

    /**
     * 对使用了自定义组件的节点进行处理
     */
    if (name && inComponents) {
      let attrs = Object.keys(attribs)

      let data = ''

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

        if (/data-/.test(attr)) {
          let key = utils.camelCase(attr.substr(5))
          let val = attribs[attr]

          data += key
          data += ': '
          data += /[{}\s]/.test(val) ? val.replace(/[{}\s]/g, '') : `'${val}'`
          data += ','

          delete attribs[attr]
        }

        if (/generic:/.test(attr)) {
          let genericComponentPath = componnets.get(attribs[attr])
          let genericKey = attr.replace(/generic:/, '')
          if (componentFileMeta) {
            if (!componentFileMeta.generics.has(genericKey)) {
              componentFileMeta.generics.set(genericKey, new Set())
            }
            let genericSet = componentFileMeta.generics.get(genericKey)

            genericSet.add({
              value: attribs[attr],
              path: genericComponentPath
            })
          }

          attribs[genericKey] = attribs[attr]

          delete attribs[attr]
        }

        forEachAttr(name, attr, attribs[attr])
      })

      if (data.length) {
        data = data.substr(0, data.length - 1)
        attribs['parent-data'] = `{{ ${data} }}`
      }
    }

    /**
     * 对所有的没有值的属性设置为 true
     */
    Object.keys(attribs).forEach(attr => {
      if (!attribs[attr] && attribs.hasOwnProperty(attr)) {
        attribs[attr] = 'true'
      }
    })

    if (name === 'import-sjs') {
      if (!attribs.src) {
        console.error(file, '文件中内联了 wxs，将不会生效')
      } else {
        attribs.from = attribs.src
        attribs.name = attribs.module
        delete attribs.src
        delete attribs.module
      }
    }
    /**
     * 自定义组件 ID 选择
     */
    if (name && inComponents) {
      attribs['onComponentMounted'] = 'componentMounted'
    }
  }
}

function transClass (exteralClasses, attribs) {
  const updateClassAttr = (classAttr = '') => {
    let classes = classAttr.split(/\s/).map(c => c.trim())

    classes.forEach((c) => {
      if (exteralClasses.has(c)) {
        // 不能直接替换，万一在自定义组件内还定义了样式呢
        classes.push(`{{ ${utils.camelCase(c)} }}`)
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
      let attrValue = utils.camelCase(attribs[key])

      attribs[key] = `{{ ${attrValue} }}`
    }
  })
}

function updateWxmlGeneric (generics, content) {
  let genericKeys = Object.keys(generics)

  let dom = Xml.find(content, (el) => {
    let { name, attribs, children, parent } = el
    if (~genericKeys.indexOf(name) && generics[name].length) {
      let prop = utils.camelCase(name, {
        recognizeSelfClosing: true,
        lowerCaseAttributeNames: false
      })

      generics[name].forEach(propName => {
        let index = parent.children.indexOf(el)

        let genericDom = Xml.find(`<block a:if="{{ ${prop} === '${propName}' }}">
          <${propName} />
        </block>`, (el) => {
          if (el.name === propName) {
            el.attribs = { ...attribs }
            el.children = children
          }
        })

        parent.children.splice(index, 0, genericDom[0])
      })

      attribs['a:else'] = 'true'
    }
  })

  DomUtils.getInnerHTML({ children: dom })
  return new ConcatSource(DomUtils.getInnerHTML({ children: dom }))
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

    let distPath = toTargetPath(utils.getDistPath(file))
    let content = assets[distPath].source().toString()

    let dom = Xml.find(content, function ({ name, attribs = {} }) {
      // 处理这个 class 属性上用到的 exteralclass
      ;
      (attribs['class'] || attribs['root-class']) && transClass(exteralClasses, attribs)

      // 自定义组件处理
      coms.get(name) && transComClass(exteralClasses, attribs, coms.get(name))
    })

    let comPath = file.replace('.wxml', '.json')

    /**
     * 给自定义组件添加属性
     * class="{{ rootClass }}" id="{{ id }}" onTap="$_tap" data-attrs="{{ parentData }}"
     */
    if (tree.components.has(comPath)) {
      let firstTag = dom[0]

      if (dom.length === 1) {
        firstTag.class = (firstTag.class || '') + '{{ rootClass }}'
        firstTag.id = '{{ id }}'
        firstTag.onTab = firstTag.onTab || '$_tap'
        firstTag['data-parent'] = '{{ parentData }}'
      }

      if (dom.length > 1) {
        dom = [{
          type: 'tag',
          name: 'view',
          attribs: {
            class: '{{ rootClass }}',
            id: '{{ id }}',
            onTap: '$_tap',
            'data-parent': '{{ parentData }}'
          },
          children: dom
        }]
      }
    }

    content = DomUtils.getInnerHTML({
      children: dom
    })

    assets[distPath] = new ConcatSource(content)
  }

  for (const file of tree.jsons) {
    let fileMeta = tree.getFile(file)

    if (fileMeta.generics.size) {
      let wxmlPath = file.replace('.json', '.wxml')
      let distJsonPath = toTargetPath(utils.getDistPath(file))
      let distWxmlPath = toTargetPath(utils.getDistPath(wxmlPath))
      let jsonFileContent = JSON.parse(getAssetContent(file, compilation))
      let wxmlFileContent = assets[distWxmlPath].source().toString()

      jsonFileContent.usingComponents = jsonFileContent.usingComponents || {}

      let { componentGenerics, usingComponents } = jsonFileContent

      Object.keys(componentGenerics).forEach(key => {
        if (typeof componentGenerics[key] === 'object') {
          usingComponents[key] = componentGenerics[key].default
        }
      })

      let genericMap = {}
      for (const [key, genericSet] of fileMeta.generics) {
        let generics = genericMap[key] = []
        for (const { value, path } of genericSet) {
          let comPath = utils.relative(
            utils.getDistPath(file),
            utils.getDistPath(path)
          ).replace('.json', '')

          if (comPath !== usingComponents[value] && usingComponents[value]) throw new Error('存在相同的组件名引用不同的组件')
          usingComponents[value] = comPath

          generics.push(value)
        }
      }

      assets[distJsonPath] = new ConcatSource(JSON.stringify(jsonFileContent))
      assets[distWxmlPath] = updateWxmlGeneric(genericMap, wxmlFileContent)
    }
  }

  for (const file of tree.wxs) {
    let distPath = toTargetPath(
      utils.getDistPath(file)
    )
    let code = getAssetContent(file, compilation)
    let result = transform(code, ['commonjs'])

    // console.log(result.code, distPath)
    assets[distPath] = new ConcatSource(result.code)
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
