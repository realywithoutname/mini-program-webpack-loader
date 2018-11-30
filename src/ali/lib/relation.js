function resolve (a, b) {
  let bs = b.split('/')
  let as = a.split('/')

  let c = bs.shift()
  while (c === '..') {
    as.pop()
    c = bs.shift()
  }

  c && bs.unshift(c)

  return (as.concat(bs)).join('/')
}

module.exports = function componentEntry (com, target) {
  target._coms.push(com)
  let relations = com._relations
  let comKeys = Object.keys(relations || {})

  comKeys.forEach(key => {
    let is = resolve(com.is, key)
    let parent = (target.getRelationNodes(is) || [])[0]

    if (!parent) throw new Error('...')

    let {
      type,
      linked
    } = relations[key]

    if (type === 'parent' || parent._relations[key]) {
      linked && linked.call(com, parent)
      parent._rels[key] = parent._rels[key] || []

      parent._rels[key].push(com)
    }

    if (type === 'descendant' && !parent._relations[key]) {
      parent.props.onComponentMounted(com)
    }

    let { childLined } = parent._relations[key] || {}

    childLined && childLined.call(parent, com)
  })
}
