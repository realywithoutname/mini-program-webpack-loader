require('colors')
require('console.table')

const MiniLoader = require('./classes/Loader')

/* eslint-disable */
String.prototype.replaceAll = function (str, replacement) {
  if (str === replacement) return this.toString();

  str = str.replace(/\./g, '\\.')
  return this.replace(new RegExp(str, 'gm'), replacement)
}

module.exports = function (content) {
  this.cacheable && this.cacheable()
  return new MiniLoader(this, content)
}

module.exports.plugin = require('./plugin/MiniProgramPlugin')

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error)
})