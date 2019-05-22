const { ConcatSource } = require('webpack-sources')

module.exports.calcCodeDep = function calcCodeDep (miniLoader, dist, codeSource) {
  const fileTree = miniLoader.fileTree
  const codeString = codeSource.source().toString()
  const source = new ConcatSource()
  const fileMeta = fileTree.getFileByDist(dist)

  try {
    if (!fileMeta.isJson && fileMeta.deps.size()) {
      for (const dep of fileMeta.deps) {
        console.log(dep)
      }
    }
  } catch (error) {
    console.log(fileMeta, error)
  }

  return source
}
