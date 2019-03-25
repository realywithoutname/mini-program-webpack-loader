const utils = require('../utils')
const { toTargetPath } = require('./path')

module.exports.getAssetContent = function (file, compilation) {
  let distPath = utils.getDistPath(file)
  let { assets, cache } = compilation

  distPath = toTargetPath(distPath)

  if (assets[distPath]) return assets[distPath].source().toString()

  for (const key in cache) {
    if (cache.hasOwnProperty(key)) {
      const module = cache[key]

      if (module.buildInfo && module.buildInfo.assets) {
        for (const assetName of Object.keys(module.buildInfo.assets)) {
          if (module.resource === file) {
            return module.buildInfo.assets[assetName].source().toString()
          }
        }
      }
    }
  }
}
