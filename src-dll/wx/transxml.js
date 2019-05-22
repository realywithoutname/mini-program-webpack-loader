const Xml = require('../helpers/wxml')

module.exports = async function (compilation, miniLoader) {
  let assetkeys = Object.keys(compilation.assets)
  const tree = miniLoader.fileTree
  assetkeys.forEach(key => {
    let { source } = tree.getFileByDist(key)
    if (tree.wxmls.indexOf(source) > -1) {
      new Xml(compilation, source, 'wx').formatComponent()
    }
  })
}
