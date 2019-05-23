const FileTree = require('../FileTree')
const Xml = require('../helpers/wxml')
const utils = require('../utils')
const { getAssetContent } = require('../helpers/compilation')
const { toTargetPath } = require('../helpers/path')
const { ConcatSource } = require('webpack-sources')
const { DomUtils } = require('htmlparser2')

let tree = new FileTree()
let generics = []
function componentHandle (request) {
  return (componnets, el, inComponents, file) => {
    let { name, attribs = {} } = el
    let componentFileMeta = null
    if (componnets.has(name) && componnets.get(name)) {
      componentFileMeta = tree.getFile(componnets.get(name))
    }
    /**
     * 对使用了自定义组件的节点进行处理
     */
    if (name && inComponents) {
      let attrs = Object.keys(attribs)

      attrs.forEach(attr => {
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
          generics.push(genericKey)
          attribs[genericKey] = attribs[attr]
          delete attribs[attr]
        }
      })
    }
  }
}

module.exports = async function (compilation, plugin) {
  let assets = compilation.assets
  let wxmls = tree.wxmls

  for (const file of wxmls) {
    let xml = new Xml(compilation, file, 'wx')
    let distPath = xml.getDistPath(file)

    const handle = componentHandle()

    assets[distPath] = xml.formatComponent(handle)
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
          if (!path) {
            break
          }
          let comPath = utils.relative(
            utils.getDistPath(file),
            utils.getDistPath(path)
          ).replace('.json', '')

          if (comPath !== usingComponents[value] && usingComponents[value]) {
            // throw new Error('存在相同的组件名引用不同的组件')
          }
          usingComponents[value] = comPath

          generics.push(value)
        }
      }
      assets[distJsonPath] = new ConcatSource(JSON.stringify(jsonFileContent))
      assets[distWxmlPath] = updateWxmlGeneric(genericMap, wxmlFileContent)
    }
  }

  console.log('所有用到的抽象节点，在自定义组件手动添加这些 props:\n', Array.from(new Set(generics)))
}

function updateWxmlGeneric (generics, content) {
  let genericKeys = Object.keys(generics)

  let foundEls = []

  let dom = Xml.find(content, (el) => {
    let { name, attribs } = el
    if (~genericKeys.indexOf(name) && generics[name].length) {
      let prop = utils.camelCase(name, {
        recognizeSelfClosing: true,
        lowerCaseAttributeNames: false
      })

      foundEls.push({
        el,
        nodeName: prop,
        nodeGenerics: generics[name]
      })

      attribs['a:else'] = 'true'
    }
  })

  foundEls.forEach(({ el, nodeName, nodeGenerics }) => {
    let { name, attribs, children, parent } = el

    generics[name].forEach(propName => {
      let index = parent.children.indexOf(el)

      let genericDom = Xml.find(`<block wx:if="{{ ${nodeName} === '${propName}' }}">
        <${propName} />
      </block>`, (el) => {
        if (el.name === propName) {
          el.attribs = { ...attribs }
          el.children = children
        }
      })

      parent.children.splice(index, 0, genericDom[0])
    })
  })

  DomUtils.getInnerHTML({ children: dom })
  return new ConcatSource(DomUtils.getInnerHTML({ children: dom }))
}
