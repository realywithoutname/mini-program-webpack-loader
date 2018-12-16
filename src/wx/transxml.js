const FileTree = require('../FileTree')
const Xml = require('../helpers/wxml')

let tree = new FileTree()

module.exports = async function (compilation, plugin) {
  let assetkeys = Object.keys(compilation.assets)

  assetkeys.forEach(key => {
    let { source } = tree.getFileByDist(key)
    if (tree.wxmls.indexOf(source) > -1) {
      new Xml(compilation, source, 'wx').formatComponent()
    }
  })
}
