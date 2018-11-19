module.exports = require('./loader')
module.exports.plugin = require('./MiniPlugin')
module.exports.transformPlugin = require('./Transform')

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error)
})
