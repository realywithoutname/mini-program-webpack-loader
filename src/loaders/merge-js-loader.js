const { parseQuery } = require('loader-utils')
const jscodeshift = require('jscodeshift')
const { relative } = require('../utils')
const { debug } = require('webpack')

function transCodeToMerge (code, constructors, mergeFunctionName) {
  const codeShift = jscodeshift(code)
  let hasFound = null
  let constructor = null
  let constructorPath = null

  constructors.forEach(cst => {
    const path = codeShift.find(jscodeshift.CallExpression, { callee: { name: cst } })
    console.assert(path.length <= 1, '构造函数被多次调用')
    console.assert(!(hasFound && path.length), '存在两个一样构造函数')

    if (path.length) {
      constructor = cst
      constructorPath = path
      hasFound = true
    }
  })

  if (!constructorPath || !constructorPath.length) {
    debugger
  }
  console.assert(constructorPath.length, '没有找到组件代码')

  return [constructor, codeShift, constructorPath]
}

module.exports = function (code) {
  const query = parseQuery(this.resourceQuery)
  const callComponenScripts = []
  const scriptCode = []
  let { deps = '[]', constructors = '[]', namespace = '', isEntry, depTreeFile } = query
  deps = JSON.parse(deps)
  constructors = JSON.parse(constructors)
  // 获取构造函数和替换构造函数后的代码
  let [constructorName, codeShift, constructorPath] = transCodeToMerge(code, constructors, 'mergeFunction')

  deps.forEach(({ path, name }) => {
    path = path.replace('???', '!')
    // 加载依赖脚本
    scriptCode.push(`import ${name} from '${path}'`)
    callComponenScripts.push( // conponent(mergeFunction, 'namespace')
      `${name}(
        mergeFunction,
        '${namespace}' // 父组件 namespace
      )`
    )
  })

  // 主组件
  if (isEntry) {
    const depTreeFile = relative(this.resourcePath, query['depTree'])
    // 加载合并脚本
    scriptCode.push(`import customMergeFunction from '${query['mergeScript']}';`)
    scriptCode.push(`import mergeFunctionConstructor from '${require.resolve('../lib/merge-function.js')}'`)
    scriptCode.push(`const depTreeFile = ${deps.length ? `__non_webpack_require__('${depTreeFile}')` : '[]'}`)
    // 生成合并函数
    scriptCode.push(`const mergeFunction = mergeFunctionConstructor(${constructorName}, customMergeFunction, depTreeFile, ${!!query.isPage});`)

    constructorPath.forEach(path => {
      path.node.callee = jscodeshift.identifier('mergeFunction')
      console.assert(path.node.arguments.length === 1, '构造函数只能接受一个参数')
      path.node.arguments = path.node.arguments.concat(
        jscodeshift.identifier(`'${query.namespace}'`),
        jscodeshift.identifier('undefined'),
        jscodeshift.identifier(`${!!query.isPage}`)
      )
    })

    scriptCode.push(`
/* 替换构造函数的原始代码 */
${codeShift.toSource()}
/* 添加依赖组件 */
${callComponenScripts.length > 0 ? `${callComponenScripts.join(';\n')}` : ''}
/* 合并组件，运行实例 */
mergeFunction()
    `)
  } else {
    constructorPath.forEach(path => {
      path.node.arguments = path.node.arguments.concat(jscodeshift.identifier('true'))
      if (constructorName === 'Component') {
        path.node.callee = jscodeshift.identifier(`((component) => component)`)
      } else {
        const exp = jscodeshift.callExpression(
          jscodeshift.identifier('mergeFunction'),
          [
            path.value,
            jscodeshift.identifier(`'${namespace}'`),
            jscodeshift.identifier('parentNamespace')
          ]
        )
        jscodeshift(path).replaceWith(exp)
      }
    })

    const imports = codeShift.find(jscodeshift.ImportDeclaration)
    const importsCode = []

    imports.forEach(path => {
      importsCode.push(
        jscodeshift(path).toSource()
      )
      jscodeshift(path).replaceWith()
    })

    // 模版组件脚本
    scriptCode.push(`
    ${importsCode.join(';')}
  export default function (mergeFunction, parentNamespace) {
    ${codeShift.toSource()}
    /* 添加依赖组件 */
    ${callComponenScripts.length > 0 ? `${callComponenScripts.join(',')}` : ''}
  }
    `)
  }

  return scriptCode.join('\n')
}
