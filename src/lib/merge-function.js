const noop = () => {}

function toCamelCase (string) {
  return string.trim().replace(/[\s_-](\w)/, function ($, val) {
    return val.toUpperCase()
  })
}

function getKey (namespace, key, isData) {
  if (namespace) return namespace + (isData ? '.' : '') + key

  return key
}

function getDepNode (depTree, namespace, parentNamespace) {
  const deps = depTree.filter(dep => dep.namespace === namespace && dep.parentNamespace === parentNamespace)

  console.assert(deps.length <= 1, '组件在同一个组件中不能被依赖两次')

  return deps.pop()
}

function reduceKeys (obj, cb) {
  if (!obj) return {}

  const keys = Array.isArray(obj) ? obj : Object.keys(obj)

  return keys
}

function createMockComponent (component, namespace, parentNamespace) {
  return {
    getComponentMethods () {
      return Object.assign({}, component, component.methods, {
        init (ctx) {
          this.ctx = ctx
        },

        setData (data, cb) {
          data = Object.keys(data).reduce((res, key) => {
            res[`${getKey(namespace, key)}`] = data[key]

            return res
          }, {})

          this.ctx.setData(data, cb)
        },

        triggerEvent (eventName, playload) {
          this.ctx[parentMethod]({ detail: playload })
        }
      })
    },

    createComponent (useByPage, ctx) {
      const newComponent = Object.keys(component).reduce((res, key) => {
        const el = component[key]

        if (key === 'properties') {
          component.data = component.data || {}

          Object.keys(el).forEach(key => {
            component.data[key] = el[key].value || null
          })
        } else if (key === 'methods') {
          let ctx = el
          if (useByPage) {
            ctx = res
          }

          Object.keys(el).forEach(key => {
            ctx[getKey(namespace, key)] = ctx[key].bind(ctx)
          })
        } else if (typeof el === 'function') {
          component[getKey(namespace, key)] = ctx[key].bind(ctx)
        } else {
          res[key] = el
        }

        return res
      }, {})

      const { created = noop, attached = noop, ready = noop, data = {} } = newComponent

      newComponent.state = newComponent.state.reduce((res, key) => {
        res[key]
      }, {})

      Object.keys(data).forEach(key => {
        data[getKey(namespace, key, true)] = data[key]
      })

      if (useByPage) {
        newComponent.onLoad = function (query) {
          ctx.init(this)
          created.call(this, query)
          attached.call(this, query)
          this.setData(data)
        }

        newComponent.onReady = function () {
          ready.call(this)
        }
      } else {
        newComponent.created = function () {
          ctx.init(this)
          created.call(this)
        }

        newComponent.ready = function () {
          ready.call(this)
          this.setData(data)
        }
      }

      newComponent.data = {}

      return newComponent
    }
  }
}

function wrapComponent ({ component = {}, namespace, parent: parentNamespace, isPage }, depTree, mainIsPage) {
  if (isPage) return component

  const parentDep = getDepNode(depTree, namespace, parentNamespace)
  const mockComponent = createMockComponent(component, namespace, parentNamespace)
  const componentMethods = mockComponent.getComponentMethods()
  const copyComponent = mockComponent.createComponent(mainIsPage, componentMethods)

  let watchers = []
  let events = {}

  if (parentDep) {
    const node = JSON.parse(parentDep.node)
    const properties = component

    Object.keys(node).forEach((key) => {
      const matched = /(catch|bind)[:](.+)/.exec(key)
      if (matched && matched[2]) {
        const eventName = matched[2]

        console.assert(['tap'].indexOf(eventName) === -1, '不要在自定义组件上添加 tap 事件')
        events[eventName] = getKey(parentDep.parentNamespace, node[key])
        return
      }
      key = toCamelCase(key)
    })
  }

  return copyComponent
}
export default function mergeFunction (constructor, mergeFn, depTree, mainIsPage) {
  let __addedConponents = []

  return function (component, namespace, parent, isPage) {
    if (arguments.length > 0) {
      __addedConponents.push(wrapComponent({ component, namespace, parent, isPage }, depTree, mainIsPage))
    } else {
      constructor(
        mergeFn(__addedConponents, mainIsPage)
      )
    }
  }
}
