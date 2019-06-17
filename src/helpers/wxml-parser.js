const { DomUtils, parseDOM } = require('htmlparser2')

module.exports.find = function find (content, test) {
  let dom = parseDOM(content, {
    recognizeSelfClosing: true,
    lowerCaseAttributeNames: false
  })
  DomUtils.find(test, dom, true)
  return dom
}
