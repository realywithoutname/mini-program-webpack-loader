module.exports = class AliLoaderHelper {
  constructor (file) {
    this.file = file
    this.componentPath = file.replace('.wxml', '.json')
  }

  transformWxss (content) {
    return content
  }

  transformWxml (content) {
    // wx
    content = content.replace(/wx:/g, 'a:')
    // 事件
    content = content.replace(/\s+(bind|catch)[:]?([^\s]+?)=/g, ($0, $1, $2) => {
      return ` ${$1 === 'bind' ? 'on' : 'catch'}${$2[0].toUpperCase()}${$2.substr(1)}=`
    })

    content = content.replace(/<import.+?src=.+?[/>.+?</import]>\n/g, '')

    content = content.replace(/<wxs/g, '<import-sjs')
    content = content.replace(/wxs>/g, 'import-sjs>')

    // if (tree.components.has(this.componentPath)) {
    //   /**
    //    * 自定义组件事件不冒泡
    //    */
    //   content = `<view class="{{ rootClass }}" id="{{ id }}" onTap="$_tap" data-attrs="{{ parentData }}">
    //     ${content}
    //   </view>`
    // }

    return content
  }
}
