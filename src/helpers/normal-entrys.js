const { join, isAbsolute } = require('../lib/path')
const { existsSync } = require('fs')

/**
 * 标准化入口
 * @param {any} entry webpack config entry
 * 1. entry: 'path/entry.json' => ['path/entry.json']
 * 2. entry: [ 'path/entry1.json', 'path/entry2.json', 'path/index.js' ] => [ 'path/entry1.json', 'path/entry2.json' ]
 * 3. entry: { app1: 'path/entry1.json', app2: 'path/entry2.json', index: 'path/index.js' } => [ 'path/entry1.json', 'path/entry2.json' ]
 * @param {Array} chunkNames 被忽略的 chunk
 */
exports.normalEntry = function normalEntry (context = process.cwd(), entry = []) {
  let miniEntrys = []

  let getEntry = entry => {
    entry = isAbsolute(entry) ? entry : join(context, entry)
    if (!existsSync(entry)) throw new Error('找不到文件：', entry)

    return entry
  }

  if (Array.isArray(entry)) {
    entry.forEach(item => {
      if (/\.json/.test(item)) {
        miniEntrys.push(getEntry(item))
      }
    })
  } else if (typeof entry === 'object' && entry !== null) {
    Object.keys(entry).forEach((key) => {
      const _entry = Array.isArray(entry[key]) ? entry[key] : [entry[key]]

      _entry.forEach(entry => {
        if (/\.json/.test(entry)) {
          miniEntrys.push(getEntry(entry))
        }
      })
    })
  }

  if (typeof entry === 'string' && /\.json/.test(entry)) miniEntrys = [entry]

  if (!miniEntrys.length) throw new Error('找不到一个有效的入口文件')

  return [...new Set(miniEntrys)]
}
