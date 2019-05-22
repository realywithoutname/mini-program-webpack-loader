const moduleHelpers = require('./module')
const { get: getAppJson } = require('./app')
const { getAssetContent } = require('./compilation')

module.exports = {
  ...moduleHelpers,
  getAssetContent,
  getAppJson
}
