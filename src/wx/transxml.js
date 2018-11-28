const FileTree = require('../FileTree')
const Xml = require('../helpers/wxml')

let tree = new FileTree()

module.exports = async function (compilation, plugin) {
  tree.wxmls.forEach(file => new Xml(compilation, file, null, 'wx'))
}
