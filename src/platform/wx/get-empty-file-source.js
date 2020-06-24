const { RawSource } = require('webpack-sources')

module.exports.getEmptyFileSource = function (fileMeta) {
  if (fileMeta.isWxml) {
    return new RawSource('<view></view>')
  }

  if (fileMeta.isJs) {
    return new RawSource('Component({})')
  }

  if (fileMeta.isJson) {
    return new RawSource('{ "component": true }')
  }

  return new RawSource('')
}
