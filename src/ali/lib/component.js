var _afAppx = __webpack_require__( /*! @alipay/af-appx */ "@alipay/af-appx");
var global = _afAppx.bridge.global = _afAppx.bridge.global || {};

module.exports = global.Component = function (com) {
  const Component = (_afAppx.WorkerComponent || function () {})
  const observers = Object.keys(com.properties || {}).reduce((res, key) => {
    if (typeof com.properties[key] === 'object' && com.properties[key].observer) {
      res[key] = com.properties[key].observer
    }
    return res
  }, {})

  com.props = com.properties
  com.didMount = function () {
    com.attached && com.attached.call(this)
    com.ready && com.ready.call(this)
  }
  com.didUpdate = function (prevProps, prevData) {
    let _this = this
    if (prevProps) {
      console.log(prevProps, prevData)
      let props = Object.keys(prevProps)
      props.forEach(function (prop) {
        if (!observers[prop]) return;

        let fn = observers[prop]

        if (typeof observers[prop] === 'string') {
          fn = this[prop]
        }

        this[prop] && fn.call(this, prevProps[prop])
      })
    }
  } 
  com.didUnmount = com.detached
  com.mixins = com.behaviors
  Component(com)
}