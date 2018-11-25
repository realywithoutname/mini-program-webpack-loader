var _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')
var global = _afAppx.bridge.MNTG = _afAppx.bridge.global || {}

var mergeComponentBehaviors = function (target) {
  let {
    properties,
    ready,
    attached,
    detached,
    behaviors = []
  } = target
  let data = {}
  let props = {}
  let methods = {}
  let readys = []
  let attacheds = []
  let didUnmounts = detached ? [detached] : []

  behaviors.forEach(behavior => {
    /**
     * 还有些乱七八糟的东西不兼容
     */
    Object.assign(data, behavior.data)
    Object.assign(props, behavior.properties)
    Object.assign(methods, behavior.methods)

    behavior.ready && readys.push(behavior.ready)
    behavior.attached && attacheds.push(behavior.attached)

    behavior.didUnmount && didUnmounts.push(behavior.detached)
  })

  ready && readys.push(ready)
  attached && attacheds.push(attached)

  const $_didMount = function () {
    attacheds.forEach(attached => attached.call(this))
    readys.forEach(ready => ready.call(this))
  }

  const didUnmount = function () {
    didUnmounts.forEach(detached => detached.call(this))
  }

  data = Object.assign({}, data, target.data)
  properties = Object.assign({}, props, properties)
  methods = Object.assign({}, methods, target.methods)

  return {
    $_didMount,
    didUnmount,
    data,
    properties,
    methods
  }
}
/**
 * 支持自定义组件的 triggerEvent 方法
 */
var triggerEvent = {
  methods: {
    triggerEvent: function (eventName, detail, options) {
      eventName = eventName.replace(/[^a-zA-Z]/, '')

      eventName = eventName.substr(0, 1).toUpperCase() + eventName.substr(1)
      /**
       * 事件处理还有问题，js 和 wxml 处理不一致
       */
      this.props[`on${eventName}`] && this.props[`on${eventName}`]({
        detail
      })
    },
    /**
     * 支持 tap 冒泡
     * @param {*} e
     */
    $_tap: function (e) {
      this.props.onTap && this.props.onTap(e)
    },
    $_merge: function (isDataUpdate) {
      this.data = this.properties = this.props = isDataUpdate ? Object.assign(this.props, this.data) : Object.assign(this.data, this.props)
    }
  }
}

var selectComponentMixin = {
  props: {
    id: ''
  },
  methods: {
    componentMounted (id, com) {
      if (this._coms[id]) throw new Error('组件内已经存在 id 为' + id + '的组件')
      this._coms[`#${id}`] = com
    },
    selectComponent (id) {
      return this._coms[id]
    }
  }
}
module.exports = global.Component = function (com) {
  com = mergeComponentBehaviors(com)

  const props = {}
  const Component = (_afAppx.WorkerComponent || function () {})
  const observers = Object.keys(com.properties || {}).reduce((res, key) => {
    const prop = com.properties[key] || {}
    if (prop !== null && typeof prop === 'object' && prop.observer) {
      res[key] = prop.observer
    }

    props[key] = [Array, String, Boolean, Object, Number].indexOf(prop) === -1 ? prop.value || null : prop === Array ? [] : prop('')
    return res
  }, {})

  com.mixins = [global._mixins, triggerEvent, selectComponentMixin]

  com.props = props || {}

  com.props.rootClass = String

  com.didMount = function () {
    this._coms = {}
    if (this.props.id) {
      setTimeout(() => this.props.onComponentMounted(this.props.id, this), 0)
    }
    /**
     * 第一次把所有的 props 都传给 data
     */
    this.$_observers = observers
    this.$_merge(null, this.data)
    com.$_didMount.call(this)
  }
  com.didUpdate = function (prevProps, prevData) {
    // console.log(prevProps === this.props, prevData === this.data)
    // console.log(this.props.list, prevData === this.data)
    this.$_merge(prevData === this.data)
    if (prevData !== this.data) {
      let props = Object.keys(prevProps)
      props.forEach((prop) => {
        if (!observers[prop]) return

        let fn = observers[prop]

        if (typeof observers[prop] === 'string') {
          fn = this[prop]
        }

        if (typeof fn !== 'function') throw new Error('找不到 observer 对应的方法', prop)

        fn.call(this, prevProps[prop])
      })
    }
  }

  Component(com)
}
