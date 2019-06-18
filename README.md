## mini-program-webpack-loader

基于 webpack 4.0 的小程序打包工具。

**项目依赖 async/await, Set/Map, spread 等 es6+ 语法**

## 安装

``` bash
  $ npm i mini-program-webpack-loader --dev
```

## 示例

[小程序插件项目和普通小程序项目打包示例](https://github.com/realywithoutname/mini-loader-plugin-demo)，插件开发可以 clone 该仓库进行开发。
普通小程序项目可以使用其中的 `build/webpack.comfig.mini.js` 配置来配置自己的项目，也可以直接使用这个仓库作为模板进行开发。

## 介绍

该工具主要解决小程序难以集成更多的成熟工具的问题。其次支持多个小程序项目共建。

该工具由两部分组成，loader 和 plugin。

### 能力
- 支持在小程序项目中使用 webpack 的所有能力
- 支持在 wxml, wxss, wxs, json 文件中使用模块别名
- 支持全局注册自定义组件
- 支持多小程序项目合并
- 支持小程序项目分析

### 插件

#### 使用

``` javascript
  const MiniPlugin = require('mini-program-webpack-loader').plugin;

  module.exports = {
    ..., // webpack 其他设置
    plugins: [
      new MiniPlugin({
        ... // 参数
      })
    ],
    ... // webpack 其他设置
  }
```

#### 参数
<table>
  <tbody>
    <tr>
      <td rowspan="3">extfile</td>
      <td colspan="1">`true`</td>
      <td colspan="1">打包主包下的 ext.json(默认值)</td>
    </tr>
    <tr>
      <td>`false`</td>
      <td>
        不打包 ext.json
      </td>
    </tr>
    <tr>
      <td>`String`</td>
      <td>
        extfile 文件路径
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <p>commonSubPackages</p>
      </td>
      <td colspan="1">`Boolean`</td>
      <td colspan="1">
        <p>自动把 subpackages 中子包独自使用的 js 文件打包到子包内。默认值为
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">`true`</span></p>
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <p>resources</p>
        <br data-mce-bogus="1"></td>
      <td colspan="1">`Array`</td>
      <td colspan="1">
        <p>提供资源的目录。</p>
        <p>除了所有入口所在的目录，src目录，node_modules，其他目录需要在这里添加否则可能导致路径计算错误。</p>
        <p>
          <br>如
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">`path/to/src/pages/one/index.json`</span>依赖了一个绝对路径
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">`
            <span style="color: #ce9178;" data-mce-style="color: #ce9178;">path/to/shared/conponents/List/index.json</span>`
            <span style="color: rgb(0, 51, 102);">。</span></span>
        </p>
        <p>其中
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">`path/to/src`</span>为项目目录，
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">`path/to/shared`</span>
          <span></span>为多个项目公用的目录。</p>
        <p>
          <br>则必须设置
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">`resources: ['path/to/shared']`</span>。则最终打包会把
          <span style="color: #ce9178;" data-mce-style="color: #ce9178;">path/to/shared/conponents 和
            <span style="color: #ce9178;" data-mce-style="color: #ce9178;">path/to/src/pages 输出到同级目录。</span></span>
        </p>
        <br data-mce-bogus="1"></td>
    </tr>
    <tr>
      <td colspan="1">entry</td>
      <td colspan="1">`Object`</td>
      <td colspan="1">每个 key 必须为 webpack 对应的 entry 配置的绝对路径。值为一个对象。</td></tr>
    <tr>
      <td colspan="1">
        <span>`entry.accept`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Object`</span>
        <br></td>
      <td colspan="1">
        <p>accept 会从对应的入口配置中读取对应的字段，进行保留。即如果 entry 中设置了入口文件配置，则不在 accept 中的字段，都会被直接删除。</p>
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`entry.accept[property]`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`any`</span>
        <br></td>
      <td colspan="1">
        <p>对于非特殊说明的字段，因为对应入口有了配置就会删除不在 accept 对应中的字段，如果希望保留其中部分字段可以通过设置对应 key 的值为 `true`</p>
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`entry.accept.pages`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Array` | `true`</span>
        <br></td>
      <td colspan="1">
        <p>如果值是数组，则会从当前入口文件的 `pages` 字段获取对应的页面，其他页面会被丢弃。`true` 值会保留所有的页面，配合 `ignore.pages` 可以丢弃其中部分不用的页面</p>
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`entry.accept.usingComponents`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Array` | `true`</span>
        <br></td>
      <td colspan="1">
        <p>如果值是数组，元素的值应该是入口文件的 `usingConponents` 字段对应的key，表示要保留的组件，不在数组中的其他组件会被丢弃。`true` 值会保留所有的组件，配合 `ignore.usingComponents` 可以丢弃其中部分不用的组件</p>
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`entry.ignore`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">`Object`</td>
      <td colspan="1">
        <p>ignore 配置用于删除通过 accept 保留的配置。目前仅支持 pages。</p>
      </td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`entry.ignore.pages`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Array`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">可以删除 pages 和 subpackages 里面的页面</td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`entry.ignore.usingComponents`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Array`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">不加载对应入口文件 `usingConponents` 字段对应组件</td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`beforeEmit(compilation, miniLoader)`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Function`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">打包完成，输出到目录前回调，你可以在这里对内容进行最后的修改</td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`compilationFinish(err, stat, appJson)`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Function`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">打包完成后回调</td>
    </tr>
    <tr>
      <td colspan="1">
        <span>`forPlugin`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">
        <span>`Boolean`</span>
        <br data-mce-bogus="1"></td>
      <td colspan="1">以插件方式构建，入口文件和普通 app.json 一致</td>
    </tr>
  </tbody>
</table>

关于插件的其他介绍可以访问 [这里](https://github.com/realywithoutname/mini-program-webpack-loader/wiki/%E5%85%B3%E4%BA%8E-loader)

### Loader
关于 loader 的其他介绍可以访问 [这里](https://github.com/realywithoutname/mini-program-webpack-loader/wiki/%E5%85%B3%E4%BA%8E-loader)

关于 loader 的配置可以查看 [这个示例](https://github.com/realywithoutname/mini-loader-plugin-demo/blob/master/build/webpack.config.base.loaders.js)

### 关于多项目共建
在这里共建的意思是：多个小程序项目的功能共用。其中包括页面，组件，工具函数的共用。

#### 页面共用
通过 webpack 的 entry 设置多个 json 配置文件，插件根据这些文件进行解析依赖的页面和组件。对于不需要的配置可以通过插件配置来进行管理。

```JavaScript
  module.exports = {
    entry: [
      'path/dir-one/src/app.json',
      'path/dir-two/src/app.json'
    ],
    ...,
    plugins: [
      new MiniPlugin({})
    ],
    ...
  }
```
在有多个不同的小程序项目，我们称第一个入口为主入口，像 ext.json 这样的文件将从从这个主入口对应的目录进行读取。

#### 组件共用
组件共用主要借用 webpack 的 resolve.alias 的能力，在开发中我们只需要在 webpack 配置中设置相应的配置，即可在代码中使用绝对的路径加载文件。
下面以使用 `path/dir-two` 这个项目中的 `base-component` 组件为例，展示如何在另外个项目中使用它。

``` JavaScript
  const DIR_TWO = resolve(__dirname, 'DIR_TWO')
  module.exports = {
    entry: [
      'path/dir-one/app.json'
    ],
    resolve: {
      alias: {
        'project-two': DIR_TWO
      }
    },
    ...,
    plugins: [
      new MiniPlugin({
        // 这个配置即可保证 `dir-two` 目录下的文件正确的输出到希望输出的目录中
        resources: [
          DIR_TWO
        ]
      })
    ],
    ...
  }
```

在需要使用这个组件的地方使用即可

``` json
  {
    "usingComponents": {
      "base-component": "project-two/path/to/project-two/index"
    }
  }
```

### 辅助方法
- `moduleOnlyUsedBySubpackages(module): Boolean` 查询模块是否只在子包中使用
- `moduleUsedBySubpackage(module, root): Boolean` 查询模块是否在特定子包中使用
- `moduleOnlyUsedBySubPackage(module, root): Boolean` 查询模块是否只在特定子包使用
- `pathInSubpackage(path): Boolean` 查询指定路径是否在子包中
- `getAssetContent(file, compilation): String` 获取某个文件的内容
- `getAppJson(): Object` 获取最终的 app.json 内容
