## mini-program-webpack-loader

基于 webpack 4.0 的小程序打包工具。

支持 node v6 及以上版本

## 介绍

该工具由两部分组成，loader 和 plugin。

该工具主要解决以下问题：
- 小程序不支持 npm
- 目录嵌套太深，路劲难以管理
- 旧项目太大，想要使用新工具成本太高

### 插件
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
        <span>`compilationFinish`</span>
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


插件主要做了以下几件事情：
- 小程序项目依赖加载
- 多个小程序项目的合并打包
- 文件输出路径计算
- 输出支持小程序的模板
- 支持全局注册自定义组件

#### 文件加载
1. 加载单个入口所有的 pages 对应 wxml,wxss,json,js,scss 文件
2. 加载单个入口文件名称对应的 wxss 文件
3. 加载主入口文件名称对应的 js 文件
4. 加载主入口对应的 project.config.json，ext.json
5. 加载 TabBar 对应的 icon 文件

#### 合并规则
1. 以数组中第一个元素为主入口
2. 结果的 app.json 中 pages 内容为多个入口合并的结果（去重，先后顺序去第一个的位置，后面重复的会被丢弃）
3. 结果的 app.json 中 subPackages 内容为多个入口合并的结果（不去重）
4. 结果的 app.json 中 plugins 内容为多个入口合并的结果
5. 结果的 app.json 中其他属性以入口中顺序取，如果取到值就不会取后面入口内容
6. 结果的 app.js 内容为主入口对应 js 文件，如果不存在，将打包失败
7. 结果的 app.wxss 内容为多个入口对应 wxss 文件内容，可以没有相应 wxss 文件
8. 结果的 project.config.json 内容为主入口所在目录的 project.config.json
9. 结果的 ext.json 内容为主入口所在目录的 ext.json (extfile 为 true 时生效)

#### 路径计算 - 输出打包后路径
1. 如果是相对路径，会以当前打包环境目录（即 webpack context）的 src 目录为目标，计算出真实路径。
2. 根据真实路径，对所有入口文件所在目录进行匹配，如果是某个目录下的文件则以该目录为目标计算相对路径。
3. 匹配 node_modules，以 node_modules 后的路径为相对路径。

#### 全局注册自定义组件
在 app.json 中使用 `usingComponents` 定义全局自定义组件，插件在输出时会自动进行注册到页面或者组件的 json 文件内。（微信支持的全局注册会导致包变大，不建议直接使用）

### Loader
- mini-loader 

loader 主要做了以下几件事情：
- 解析 wxss，wxml，wxs 依赖，添加到打包任务（**会对注释中的依赖进行解析，所以不要注释**）
- 解析 json 中的自定义组件，添加到打包任务
- 计算依赖的相对路径，回写相对路径到代码

#### loader 能力
  - 支持 wxss，wxml，wxs 小程序格式文件的转换
  - 支持 wxss，wxml，wxs 文件中以项目根目录为绝对路径根目录查找依赖（**对老代码支持**）
  - 支持 wxss，wxml，wxs 中使用 webpack resolve.alias

#### 注意点
  - app.json（或其他入口）文件在打包过程中添加 page 时，需要先创建对应的文件，否则不会打包新的 page
  - 为了减小包体积，使用 css 预处理的脚本必须以 `.scss` 结尾，如果同时需要引入其他 wxss 文件，最好在 wxss 文件内 `import` wxss 和 scss
  - 由于 sass-loader 不支持 resolve.alias，所以 `.scss` 文件必须使用相对路径
  - 由于 sass-loader 会把 import 的内容直接打包到一个文件，所以不要在 `.scss` 文件中 import `.wxss`

  使用示例：
  ~~~ css
    /* a.wxss */
    @import "a/b.wxss";
    @import "a/c.scss"; /* 这里 a/c.scss 将被转换为 a/c.wxss */

    /* a/c.scss 使用 sass-loader 处理后需要使用 file-loader 处理文件名为 [name].wxss */
    @import "./variables.scss"
    .class {
      border: $border solid #000;
    }
  ~~~
