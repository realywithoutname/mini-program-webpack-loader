var _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')
var global = _afAppx.bridge.MNTG = _afAppx.bridge.global || {}

module.exports = global.Page = function (page) {
  const Page = (_afAppx.Page || function () {})

  page.componentMounted = function (com) {
    this._coms = this._coms || []
    this._coms.push(com)
    console.log(this._coms)
  }

  page.selectComponent = function (id) {
    return this._coms.filter(com => `#${com.id}` === id)
  }

  Page(page)
}
