const cheerio = require('cheerio')
const htmlparser = require('htmlparser2')
const { join, dirname, basename } = require('path')

module.exports = class AliLoaderHelper {
  constructor (loader, plugin) {
    this.loader = loader
    this.$plugin = plugin
    this.baseName = join(dirname(loader.resourcePath), basename(loader.resourcePath, '.wxml'))
  }

  transformWxss (content) {
    return content
  }

  transformWxml (content) {
    // wx
    content = content.replace(/wx:/g, 'a:')
    content = content.replace(/<wxs/g, '<import-sjs')
    content = content.replace(/wxs>/g, 'import-sjs>')
    // 事件
    content = content.replace(/\s+(bind|catch)[:]?([^\s]+?)=/g, ($0, $1, $2) => {
      return ` ${$1 === 'bind' ? 'on' : 'catch'}${$2[0].toUpperCase()}${$2.substr(1)}=`
    })

    content = content.replace(/<import.+?src=.+?[/>.+?</import]>\n/g, '')

    if (this.$plugin.componentSet.has(this.baseName)) {
      /**
       * 自定义组件事件不冒泡
       */
      content = `<view class="{{ rootClass }}" onTap="$_tap">
        ${content}
      </view>`
    }

    return content
  }

  TWxs (path) {
    return path.replace('.wxs', '.sjs')
  }

  TWxml (path) {
    return path.replace('.wxml', '.axml')
  }

  TWxss (path) {
    return path.replace('.wxss', '.acss')
  }

  TScss (path) {
    return path.replace('.scss', '.acss')
  }

  TPcss (path) {
    return path.replace('.pcss', '.acss')
  }
}
