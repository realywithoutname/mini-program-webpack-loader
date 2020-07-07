const { dirname } = require('path')
const { readFileSync } = require('fs')

async function resolveComponent (resolver, context, component) {
  component = component + '.json'
  // 获取自定义组件的绝对路径
  return await resolver(context, component)
}

function forEachUsingComponent (usingComponents, fn) {
  let ps = []

  for (const key in usingComponents || {}) {
    let element = usingComponents[key]

    ps.push(fn(key, element))
  }

  return ps
}

function forEachComponentGenerics (componentGenerics, fn) {
  let ps = []

  for (const key in componentGenerics) {
    if (typeof componentGenerics[key] === 'object') {
      for (const _key in componentGenerics[key]) {
        ps.push(fn(_key, key))
      }
    } else if (componentGenerics[key]) {
      fn(key, key)
    }
  }

  return ps
}

async function resolveComponentsPath (resolver, request) {
  const content = JSON.parse(
    readFileSync(request, { encoding: 'utf8' })
  )
  const context = dirname(request)
  const components = new Map()
  const { componentGenerics, usingComponents, publicComponents } = content

  if (!usingComponents && !componentGenerics && !publicComponents) return components

  /**
   * 自定义组件
   */
  let normalPromises = forEachUsingComponent(usingComponents, async (key, item) => {
    if (/^plugin:\/\//.test(item) || /^plugin-private:\/\//.test(item)) {
      components.set(key, {
        request,
        origin: item,
        absPath: item,
        type: 'plugin'
      })
      return
    }
    let component = await resolveComponent(resolver, context, item)

    components.set(key, {
      request,
      origin: item,
      absPath: component,
      type: 'normal'
    })
  })

  /**
  * 插件组件处理和普通插件处理一样
  */
  let pluginPromises = forEachUsingComponent(publicComponents, async (key, item) => {
    let component = await resolveComponent(resolver, context, item)
    components.set(key, {
      request,
      origin: item,
      absPath: component,
      type: 'normal'
    })
  })

  /**
   * 抽象组件
   */
  let genericesPromises = forEachComponentGenerics(componentGenerics, async (key, element) => {
    if (componentGenerics[element] === true) {
      return components.set(element, {
        request,
        origin: '',
        absPath: '',
        type: 'generics'
      })
    }
    let relPath = componentGenerics[element].default
    let component = await resolveComponent(resolver, context, relPath)
    components.set(element, {
      request,
      origin: relPath,
      absPath: component,
      type: 'generics'
    })
  })

  await Promise.all([
    ...normalPromises,
    ...pluginPromises,
    ...genericesPromises
  ])

  return components
}

function findComponent (parentPath, componentSet) {
  // 取最后加入到集合的组件
  for (const component of [...componentSet.values()].reverse()) {
    if (component.component.absPath === parentPath) {
      return component
    }
  }
}

module.exports.resolveComponentsFiles = async function (jsons, componentSet, resolver, emptyComponent, canBeTemplateTest, newComponentSet) {
  let nextJsons = []
  for (const json of jsons) {
    if (emptyComponent && emptyComponent.test(json)) {
      continue // 对于需要处理为空组件的不再加载其子组件
    }

    newComponentSet = newComponentSet || componentSet
    const parentComponent = findComponent(json, newComponentSet)

    let components = await resolveComponentsPath(resolver, json)

    // 该自定义组件是否能进行自定义组件合并
    const canBeTemplate = canBeTemplateTest({ ...parentComponent.component, tag: parentComponent.tag })

    // 确定该组件是不是可以作为主组件，如果父组件有 mainComponentPath 则，该组件只能是模版或者不能合并的自定义组件
    let mainComponentPath = parentComponent.parent && parentComponent.parent.mainComponentPath

    // 只有能够作为模版的组件才设置标示
    if (canBeTemplate) {
      if (parentComponent.component.type === 'normal' || parentComponent.component.type === 'page') {
        // 如果能够进行合并，如果该自定义组件可以被合并，并且不是合并到其他自定义组件，则该自定义组件可以合并其他自定义组件
        parentComponent.useTemplate = !mainComponentPath

        // 需要转换为模版
        parentComponent.beTemplate = !!mainComponentPath
      }
      // 作为自定义组件，则修改 mainComponentPath
      if (parentComponent.useTemplate) {
        mainComponentPath = parentComponent.mainComponentPath = json
      }
    } else {
      // 不能作为模版的组件
      delete parentComponent.mainComponentPath
      // 子组件都依赖该组件
      mainComponentPath = json
    }

    for (const [key, component] of components) {
      const childComponent = {
        tag: key,
        component: component,
        mainComponentPath,
        children: new Set(),
        parent: parentComponent // 这个在关系上不一定是真正使用他的父组件，但是数据是一致的
      }

      componentSet.add(childComponent)
      parentComponent.children.add(childComponent)

      if (component.type === 'normal' || (component.type === 'generics' && component.absPath)) {
        nextJsons.push(component.absPath)
      }
    }
  }

  nextJsons.length && await module.exports.resolveComponentsFiles(nextJsons, componentSet, resolver, emptyComponent, canBeTemplateTest)
}
