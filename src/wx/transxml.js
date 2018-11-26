const {
  ConcatSource
} = require('webpack-sources')

const FileTree = require('../FileTree')
const Xml = require('../helpers/wxml')

let tree = new FileTree()

let eventSet = new Set()

function componentHandle ({
  name,
  attribs,
  inComponents
}) {
  /**
   * 自定义组件上的 class 移动到自定义组件内
   */
  if (name && attribs.class && inComponents) {
    attribs['root-class'] = attribs.class

    delete attribs.class
  }

  /**
   * 自定义组件 ID 选择
   */
  if (name && attribs.id && inComponents) {
    attribs['onComponentMounted'] = 'componentMounted'
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
          console.log(attr, event)
          delete attribs[attr]
        }

        eventSet.add(event)
      }
    })
  }
}

module.exports = async function (compilation, plugin) {
  let wxmls = []

  for (const { files } of tree.pages.values()) {
    for (const fileMeta of files) {
      fileMeta.isWxml && wxmls.push(fileMeta.source)
    }
  }

  for (const { files } of tree.components.values()) {
    for (const fileMeta of files) {
      fileMeta.isWxml && wxmls.push(fileMeta.source)
    }
  }
  wxmls.forEach(file => new Xml(compilation, file, null, 'wx'))
}
