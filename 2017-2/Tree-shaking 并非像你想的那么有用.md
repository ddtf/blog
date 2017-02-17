#  为什么webpack2的Tree Shaking并非像你想的那么高效？

原文链接   [Why Webpack 2's Tree Shaking is not as effective as you think](https://advancedweb.hu/2017/02/07/treeshaking/)

  随着webpack2不断发展，Tree Shaking通过静态分析技术去除exports中没有用到的方法，正逐渐成为主流。开发者对它期待挺高，期待能解决package过大这个迫切的问题。通常情况，我们只需要某个依赖的部分代码片段，但是整个包却被打包到bundle中，导致了包体积增大。
  
  Tree Shaking目的就是消除这种干扰，允许开发者添加依赖不必过分担心用户体验。
  
  
  但是这个[问题](https://github.com/webpack/webpack/issues/2867)暗示实际项目中这种技术不是那么奏效。
  
  是什么导致了这种差异，让我们继续探索
  
  
# Tree Shaking 基础


让我们用下面的demo看它如何工作。为了方便导出，增加一个导出两个变量的`lib.js`


```

export const a = "A_VAL_ES6";

export const b = "B_VAL_ES6";


```


增加入口文件`entry.js`,并且导入`lib.js`中导出的两个变量，但仅仅使用`a`变量

```

import {a, b} from "./lib.js";

console.log(a);


```


因为`b`变量未被使用，可以被移除掉，但是这不是什么新鲜事，`UglifyJS `已经实现。

但是因为`b`变量在`lib.js`也未被使用过，所以也应当被移除掉。检测`bundle`文件，*`A_VAL_ES6`* 还在，*`B_VAL_ES6 `*不存在。



### Rollup


每当谈及 Tree Shaking，不得不说 [rollup](http://rollupjs.org/)。据我所知，它是第一个成熟支持“去除无用导出”概念的打包工具。它投入使用有一年了多，我也听说过许多用该工具大幅度减少文件大小的成功案例


### Test setup

如果你想复现结果，[代码](https://github.com/sashee/treeshaking-test/tree/master/lodash-test)在这里


Load-es 是 Loahsh的 ES6兼容版本。它具备同样的功能，但是他并不是用UMD方式而是用ES6方式导出。它的[主文件](https://github.com/lodash/lodash/blob/es/lodash.js)只是重复导出了一下各个模块，Loahsh是一个工具类函数集合，所以该模块部分或整体打包没甚关系。

因此， `import {map} from "lodash-es";`和`import map from "lodash-es/map"`是等价的


为了开始测试，在`package.json`中添加`Webpack`,`Babel`,`loadsh-es`等依赖


```
{
	...
	"devDependencies": {
		"webpack": "2.2.0",
		"babel-core": "6.16.0",
		"babel-loader": "6.2.7",
		"babel-preset-es2015": "6.22.0",
		"lodash-es": "4.17.4"
	},
	...
}
```

添加` webpack.config.js `，添加最小`WebPack `配置

```
...
	loader: 'babel-loader',
	options: {
		presets: [['es2015', {modules: false}]]
	}
	...
	plugins: [
		new webpack.LoaderOptionsPlugin({
			minimize: true
		}),
		new webpack.optimize.UglifyJsPlugin({
		})
	]
...
```

注意` {modules: false}`。`Babel`默认将所有代码转化成`CommonJS `格式，这是一个达到最大兼容目的的好办法，它没有采用导出分析。该配置可关闭此功能，`WebPack 2`原生支持ES6模块。


像模版工程那样，添加一个入口文件`entry.js`， 并导入`lodash-es`


```
import {map} from "lodash-es";

console.log(map([1, 2], function(i) {return i + 1}));
```

运行 `npm run build`,看到bundle文件大小是 `139，224` 比特（**我测试是137，683 byte，估计是webpack的版本不一致，我用的是2.2.1**）

然后更改`import`方法，单独引入用到的模块。

```
import map from "lodash-es/map";
```

bundle大小变为 25，531 bytes（**我这里测试是22918 bytes**）


比起手动优化，Tree Shaking在实际项目里效率并不高


## Modules

这里的[代码](https://github.com/sashee/treeshaking-test/tree/master/modules-test)可以测试不同模块化方案

### CommonJS


为了理解静态分析的局限性，我们需要深入看下 `CommonJS `和 `ES6 `模块的区别。


小注：大多数库为了更好的兼容性通常采用`UMD`的方式，这种方式通常也可解释为`AMD`而非 `CommonJS `。但是因为它们通常具有相似的行为，所以用`CommonJS `阐述说明。


在CommonJS的环境中，导出的对象是关键所在。运行代码之后，对象指向的内容会被导出。

对于简单的例子，通常简单设置其属性：



```

exports.a = "A_VAL_COMMONJS";

exports.b = "B_VAL_COMMONJS";


```
a和b属性将会被导出


但是 CommonJS 可以动态设置要导出的内容：

```

for(let i = 0; i < 5; i++) {
	exports["i" + i] = i;
}

```

将会导出 `i0, i1, i2, i3, and i4.`

甚至它导出的内容可以是不确定的

```

if (Math.random() < 0.5) {
	exports.rand = "RANDOM";
}

```


导出的内容要看你的运气了


`CommonJS `这种动态性非常符合`JavaScript `本身的动态特性，但是根本没办法做静态分析

为了进一步说明，`lib_commonjs `中增加两个导出的变量

```
exports.a = "A_VAL_COMMONJS";
exports.b = "B_VAL_COMMONJS";
```

然后在入口文件`entry.js'中导入这两个变量，但是只使用其中一个



```

import {a as a_commonjs, b as b_commonjs} from "./lib_commonjs.js";

console.log("Hello world:" + a_commonjs);

```

重新构建并察看结果，`A_VAL_COMMONJS `和`B_VAL_COMMONJS `都在，并未被移除掉。

这个结果说明 Tree Shaking 对任何 `CommonJS `模块没作用


大多数的类库都是AMD/CommonJS形式的，所以用此技术并未有多少收益，直到ES6出现


ES6模块本身是静态性质的。它们必须是明确设置而不允许动态设置要导出的内容。这个为静态分析开了扇天窗。


为了验证个，在`lib.js`中导出两个值

```
export const a = "A_VAL_ES6";
export const b = "B_VAL_ES6";

```

然后在入口文件`entry.js'中导入这两个变量，但是只使用其中一个


```
import {a as a_es6, b as b_es6} from "./lib.js";

console.log("Hello world:" + a_es6);
```

重新编译查看结果 ，仅`A_VAL_ES6 `保留，b的值被移除了


### 存在问题

问题的根本是其副作用。通常情况下导入一个类库，并不一定会打包成一个看起来和整个app其他部分完全隔离的代码片段。例如，使用`css-loader`从'file.css'中引入css，其中变量内容不是重要的，但是里面的样式确实已经应用到文档中。


在`WebPack `会不计后果的移除所有无用的依赖，类似这样的导入被中断，因此所有的副作用被保留下来；这样可以提供一些可预料的功能，如编写console代码、增加样式标签，或者以其他方式修改HTML，或者给全局变量赋值等

但是有另外一类代码，被错误的标识为副作用； Object.freeze不会修改任何东西，所以函数调用必需是纯函数，这些可以被移除掉


作为验证，修改'lib.js'导出一个被Object.freeze修饰过的值`"B_VAL_ES6"`

```
export const b = Object.freeze("B_VAL_ES6");

```
这个修改导致 `B_VAL_ES6 `出现了在bundle包中

同样的，简单的函数也会触发这个行为：

```
Object.freeze(b);

```
这会导致整个库被打包，即使没有副作用

副作用很难甄别，但是我们仍在努力[解决](https://github.com/mishoo/UglifyJS2/issues/1261)

### Conclusion

构建工具选择比较安全的方法，即使包含整个无用代码也不是破坏app的完整性。导致的结果就是导致bundle文件变大并且增加了一些无用代码

但是Shaking might仍会使包文件减少一些，它是一件好事。任何能使app减少对带宽要求的改变都是正确的方向。但是在实际项目中它带来的效率提升比期望中差了一些。

人们正在研究消除副作用的更好方案。但是由于代码的动态特性使得找出一个适用于所有代码库的普实方案更加困难。相反，我门可以收到一些启发。这里建议使用纯函数，社区大范围的支持还不可能很快到来。

Tree Shaking可能会有一点帮助，但是减少bundle大小仍旧任重道远。

-------

后记，tres shaking确实能带来一点收益，实际项目中如果想从中获取更大的收益，在exports时候尽量注意以下几点：

1）尽量用纯函数，不要用IIFE方式，如

```
var V6Engine = (function () {
    function V6Engine() {
    }
    V6Engine.prototype.toString = function () {
        return 'V6';
    };
    return V6Engine;
}());
```

2)re-export中

可参见lodash的例子，但是这种情况不可避免，尤其在一些基础类库，可能在不同层次结构的文件中使用。


3）尽量避免  `import * as ...`，用到什么就导入什么


4）在es6模块中用amd/commonjs的语法

比如在支持es6环境中就表再用 modulex.exports导出

5）import()方法导入的文件

这个也不太可能，对于异步加载来说，也比较困难，webpack 2中用import实现异步文件加载




