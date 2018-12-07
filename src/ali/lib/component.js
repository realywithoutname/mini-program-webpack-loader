var _afAppx = __webpack_require__(/*! @alipay/af-appx */ '@alipay/af-appx')
var global = _afAppx.bridge.MNTG = _afAppx.bridge.global || {}
let { componentEntry } = require('./relation')

function camelCase (str) {
  let words = str.split(/[^a-zA-Z]/)

  return words.reduce((str, val) => {
    str += (val[0].toUpperCase() + val.substr(1))
    return str
  }, words.shift())
}
function resolvePropsAndObservers (properties = {}, exteralClasses = []) {
  let props = {}
  let observers = Object.keys(properties).reduce((res, key) => {
    const prop = properties[key] || {}
    if (prop !== null && typeof prop === 'object' && prop.observer) {
      res[key] = prop.observer
    }

    props[key] = [Array, String, Boolean, Object, Number].indexOf(prop) === -1
      ? prop.value || null // 定义了一个对象的处理默认值: { a: { type: Number } }
      : prop === Array // 只是定义了类型的处理默认值: { a: Number }
        ? []
        : prop('') // 其他类型直接用对应的构造函数处理为对应的值

    return res
  }, {})

  // exteralClasses 全部处理为 prop
  ;(exteralClasses || []).forEach(key => {
    key = camelCase(key)
    props[key] = '' // 默认值为空
  })
  return { props, observers }
}
var mergeComponentBehaviors = function (target) {
  let {
    properties,
    ready,
    created,
    attached,
    detached,
    didUpdate,
    behaviors = [],
    exteralClasses
  } = target
  let data = {}
  let props = {}
  let methods = {}
  let readys = []
  let createds = []
  let attacheds = []
  let didUpdates = []
  let didUnmounts = detached ? [detached] : []

  behaviors.forEach(behavior => {
    /**
     * 还有些乱七八糟的东西不兼容
     */
    Object.assign(data, behavior.data)
    Object.assign(props, behavior.properties)
    Object.assign(methods, behavior.methods)

    behavior.ready && readys.push(behavior.ready)
    behavior.created && createds.push(behavior.created)
    behavior.attached && attacheds.push(behavior.attached)
    behavior.didUpdate && didUpdates.push(behavior.didUpdate)
    behavior.detached && didUnmounts.push(behavior.detached)
  })

  ready && readys.push(ready)
  created && createds.push(created)
  attached && attacheds.push(attached)
  didUpdate && didUpdates.push(didUpdate)

  const $didCreate = function () {
    createds.forEach(created => created.call(this))
  }

  const $didAttach = function () {
    attacheds.forEach(attached => attached.call(this))
  }

  const $didReady = function () {
    readys.forEach(ready => ready.call(this))
  }

  const $didUpdate = function (prevProps, prevData) {
    didUpdates.forEach(didUpdate => didUpdate.call(this, prevProps, prevData))
  }

  const didUnmount = function () {
    didUnmounts.forEach(detached => detached.call(this))
  }

  data = Object.assign({}, data, target.data)
  properties = Object.assign({}, props, properties)
  methods = Object.assign({}, methods, target.methods, { $didUpdate, $didAttach, $didCreate, $didReady })

  return {
    didUnmount,
    data,
    properties,
    methods,
    exteralClasses
  }
}
/**
 * 支持自定义组件的 triggerEvent 方法
 */
var triggerEvent = {
  props: {
    parentData: Object // 组件数据
  },
  didMount () {
    this.properties = {}
  },

  methods: {
    triggerEvent: function (eventName, detail, options) {
      eventName = eventName.replace(/[^a-zA-Z]/, '').toLowerCase()

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
      this.props.onTap && console.log(e, this.is)
      this.props.onTap && this.props.onTap(e)
    },
    $merge: function (prevProps, prevData) {
      let propsIsUpdate = prevData === this.data
      if (propsIsUpdate) {
        let observers = this.$_observers
        let props = Object.keys(this.props)

        let fns = []
        props.forEach((prop) => {
          if ((prevProps && prevProps[prop] === this.props[prop])) return

          this.data[prop] = this.props[prop]
          this.properties[prop] = this.props[prop]
          if (!observers[prop]) return

          let fn = observers[prop]

          if (typeof observers[prop] === 'string') {
            fn = this[observers[prop]]
          }

          if (typeof fn !== 'function') {
            throw new Error('找不到 observer 对应的方法', prop)
          }

          fns.push(() => fn.call(this, this.props[prop], prevProps ? prevProps[prop] : undefined))
        })

        fns.forEach(fn => fn())
      }
    }
  }
}

function resloveComponentNodesMixin (relations) {
  var selectComponentMixin = {
    props: {
      id: '',
      onComponentMounted () {}
    },

    didMount () {
      this.id = this.props.id
      this._relations = relations
      this._rels = {}
      this._coms = []

      setTimeout(() => this.props.onComponentMounted(this), 0)
    },

    didUnmount () {
      this.$leave && this.$leave()
    },

    methods: {
      componentMounted (com) {
        componentEntry(com, this)
      },
      selectComponent (id) {
        return this._coms.filter(com => `#${com.id}` === id)
      },
      getRelationNodes (selector) {
        return this._rels[selector] || []
      },
      getComponents (is) {
        return this._coms.filter(com => com.is === is)
      }
    }
  }

  return selectComponentMixin
}
module.exports = global.Component = function (com) {
  const Component = (_afAppx.WorkerComponent || function () {})
  let {
    relations,
    exteralClasses
  } = com

  // 这里获取到的 com 是一个新对象
  com = mergeComponentBehaviors(com)
  const {
    props,
    observers
  } = resolvePropsAndObservers(com.properties, exteralClasses)
  const componentNodesMixin = resloveComponentNodesMixin(relations)
  // 可能有组件有 id
  if (props.id !== undefined) delete componentNodesMixin.props['id']

  com.mixins = [global._mixins, triggerEvent, componentNodesMixin]

  com.props = props || {}

  com.props.rootClass = String

  com.didMount = function () {
    /**
     * 第一次把所有的 props 都传给 data
     */
    this.$_observers = observers
    this.$didCreate()
    this.$merge(null, this.data)
    this.$didAttach()
    this.$didReady()
    this.$didUpdate(this.props, this.data)
  }
  com.didUpdate = function (prevProps, prevData) {
    this.$merge(prevProps, prevData)
    this.$didUpdate(this, prevProps, prevData)
  }

  Component(com)
}
