const { getFiles, flattenDeep } = require('../utils')
const { dirname, basename } = require('path')
const FileTree = require('../FileTree')

let tree = new FileTree()

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

function getConponentFiles (absPath) {
  // 获取依赖的实际文件列表
  let dir = dirname(absPath)
  let name = basename(absPath, '.json')

  let files = getFiles(dir, name)

  // 新增到编译的组件以及组件对应的文件
  return files
}

async function componentFiles (resolver, request, content, options = {}, normalCallBack, genericsCallBack) {
  let context = dirname(request)
  let { componentGenerics, usingComponents, publicComponents } = content

  tree.clearDepComponents(request)

  if (!usingComponents && !componentGenerics && !publicComponents) return []

  let asserts = []

  const handelComponent = async (key, component) => {
    const { replaceFile } = options
    // let rFiles = []

    /**
     * 这里可以优化，如果文件中已经有了依赖列表，则可以直接用，不用异步取
     */
    let componentPath = await resolveComponent(resolver, context, component)

    // // 获取可能替换的文件
    // if (replaceSrc && componentPath.indexOf('/src/') > -1) {
    //   const replaceComponentPath = componentPath.replace('src', replaceSrc)
    //   rFiles = getConponentFiles(replaceComponentPath)
    // }

    let files = getConponentFiles(componentPath)

    if (Array.isArray(replaceFile) && typeof replaceFile[0] === 'function') {
      files = files.map(replaceFile[0])
    }

    /**
     * 这里实际上是不能确定文件是不是成功添加到编译中的
     */
    files.forEach(file => {
      if (!tree.has(file)) asserts.push(file)
    })
    tree.addComponent(request, key, componentPath, files)

    return componentPath
  }

  /**
   * 自定义组件
   */
  let normalPromises = forEachUsingComponent(usingComponents, async (key, item) => {
    if (/^plugin:\/\//.test(item)) {
      return tree.addComponent(request, key, '', [])
    }
    let componentPath = await handelComponent(key, item)
    normalCallBack && normalCallBack(componentPath, key, usingComponents)
  })

  /**
  * 插件组件处理和普通插件处理一样
  */
  let pluginPromises = forEachUsingComponent(publicComponents, async (key, item) => {
    let componentPath = await handelComponent(key, item)
    normalCallBack && normalCallBack(componentPath, key, publicComponents)
  })

  /**
   * 抽象组件
   */
  let genericesPromises = forEachComponentGenerics(componentGenerics, async (key, element) => {
    if (componentGenerics[element] === true) {
      return tree.addComponent(request, element, '', [])
    }

    let componentPath = await handelComponent(element, componentGenerics[element][key])

    genericsCallBack && genericsCallBack(componentPath, key, componentGenerics[element])
  })

  await Promise.all([
    ...normalPromises,
    ...pluginPromises,
    ...genericesPromises
  ])

  return asserts
}

/**
 * 提供给 插件 使用来获取自定义组件或者页面依赖的自定义组件文件列表
 */
module.exports.resolveFilesForPlugin = async function (resolver, jsonFiles, componentSet, options) {
  for (const request of jsonFiles) {
    const content = require(request)
    let files = await componentFiles(resolver, request, content, options)

    files = flattenDeep(files)

    componentSet.add(files)

    await module.exports.resolveFilesForPlugin(
      resolver,
      files.filter(file => tree.getFile(file).isJson),
      componentSet,
      options
    )
  }
}

/**
 * 提供给 loader 使用来获取自定义组件或者页面依赖的自定义组件文件列表
 */
module.exports.resolveFilesForLoader = async function (resolver, request, content, getRelativePath, options) {
  /**
   * 写回组件的相对路径
   * @param {*} componentPath 组件的绝对路径
   * @param {*} key 组件的 key
   * @param {*} obj json 中的组件列表，普通组件和抽象组件传入不一致
   */
  let setRelComponent = (componentPath, key, obj) => {
    let relPath = getRelativePath(componentPath)
    obj[key] = relPath.substr(0, relPath.length - 5)
  }

  return await componentFiles(
    resolver,
    request,
    content,
    options,
    setRelComponent,
    setRelComponent
  )
}
