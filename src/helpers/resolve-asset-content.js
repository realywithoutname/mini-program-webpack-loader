const { resolveTargetPath } = require('./resolve-target-path')
const { getFile } = require('./get-files')

module.exports.resolveAssetContent = function (file, distPath, compilation) {
  let { assets, cache } = compilation

  distPath = resolveTargetPath(distPath)

  if (assets[distPath]) return assets[distPath].source().toString()

  for (const key in cache) {
    if (cache.hasOwnProperty(key)) {
      const module = cache[key]

      if (module.buildInfo && module.buildInfo.assets) {
        for (const assetName of Object.keys(module.buildInfo.assets)) {
          if (getFile(module.resource) === file) {
            return module.buildInfo.assets[assetName].source().toString()
          }
        }
      }
    }
  }
}
