const pathLib = require('path')

const path = process.platform !== 'win32' ? pathLib : pathLib.posix;

module.exports = path;
