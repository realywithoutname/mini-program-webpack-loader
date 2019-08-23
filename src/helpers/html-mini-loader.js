const DomHandler = require('domhandler')
const { DomUtils, Parser } = require('htmlparser2')
const ElementType = require('domelementtype')

function trimWhitespace (str) {
  return str && str.replace(/^[ \n\r\t\f]+/, '').replace(/[ \n\r\t\f]+$/, '')
}

function parseDOM (data, options) {
  const handler = new DomHandler(options)
  const parser = new Parser(handler, options)

  parser.onattribend = function () {
    if (this._cbs.onattribute) { this._cbs.onattribute(this._attribname, this._attribvalue) }
    if (
      this._attribs &&
        !Object.prototype.hasOwnProperty.call(this._attribs, this._attribname)
    ) {
      this._attribs[this._attribname] = this._attribvalue
    }
    this._attribname = ''
    this._attribvalue = '' // 没有值的属性不会触发 onattribdata 事件，就不会有 EMPTY_ATTRI_VALUE 值，最后在替换掉这个值
  }

  parser.onattribdata = function (value) {
    if (this._attribvalue === '') {
      this._attribvalue = 'EMPTY_ATTRI_VALUE'
    }

    this._attribvalue += value
  }

  parser.end(data)
  return handler.dom
}

module.exports = function (content, fileMeta) {
  let dom = parseDOM(content, {
    recognizeSelfClosing: true,
    lowerCaseAttributeNames: false,
    xmlMode: true
  })

  const stack = [{ children: dom }]

  while (stack.length) {
    const node = stack.pop()
    const { children = [], type, data, attribs = {} } = node

    if (type === ElementType.Comment) {
      let parent = node.parent
      if (parent === null) {
        parent = { children: dom }
      }
      const index = parent.children.indexOf(node)
      if (index === -1) throw Error('...')

      parent.children.splice(index, 1)
    }

    if (type === ElementType.Text) {
      node.data = trimWhitespace(data)
      // wxml 文本存在 <= 符号，会被解释为开始进入一个标签，解析会出错，如 {{ a <= 444 }}，只是小于符号不会有问题
      if (/{{/.test(data) && node.next && node.next.name === '=') {
        console.log(`\n${fileMeta.dist} 文件中存在 [<=] 符号，文件不会被压缩`)
        return content
      }
    }

    Object.keys(attribs).forEach(key => {
      // 属性没有值会被处理为 ""，在小程序中表示 false，所以这里需要手动设置为true
      if (attribs[key] === '') {
        attribs[key] = `{{ true }}`
      } else {
        attribs[key] = attribs[key].replace(`EMPTY_ATTRI_VALUE`, '')
      }

      if (/"/.test(attribs[key])) {
        console.log('')
        console.log(
          fileMeta.dist,
          `文件中 ${node.name} 元素的 ${key} 属性 ${attribs[key]} 包含["]`
        )
      }

      if (/\\/.test(attribs[key])) {
        console.log('')
        console.log(
          fileMeta.dist,
          `文件中 ${node.name} 元素的 ${key} 属性 ${attribs[key]} 包含[\\]`
        )
      }
    })

    if (!children.length) continue

    for (const child of children) {
      stack.push(child)
    }
  }
  return DomUtils.getInnerHTML({ children: dom }, { xmlMode: true })
}
