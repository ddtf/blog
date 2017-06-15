# 基于webpack2的项目过程构建

> 本文结合最近几个项目的实践，分享一些自己使用心得；不讲解基础的api，需要的话自行查阅。

> 感谢组内小伙伴 [francis-su](https://github.com/francis-su)、[A.我大概是只，成功的猫](https://github.com/opendb2) ，两位都做了许多基础工作，逐步完善了现在的这套流程，感谢你们～同时欢迎加粉[changfuguo](https://github.com/changfuguo);另外[A.我大概是只，成功的猫](https://github.com/opendb2)是一位很帅气很潮的帅哥，欢迎妹子勾搭～

# 一、前言

基本用法网上介绍的够多了，webpack2和1之间的差异也不是很大，该懂比较大的是loader写法，参考api即可。本文从开发整个流程出发：开发环境（开发、测试，沙盒、线上）以及应用环境（web、hybird）进行总结，如图

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/webpack2.png)

发布上线后，运行环境可能是web浏览器也可能是app端内，目前根据是否依赖jsbdrige归结为以下三种情况：

1） 只跑在端内，web不支持，可以将编译后的文件打包在端内；该类型请求数据必需依赖app，也就是必须要有jsbdrige

2）既在web上又跑在端内，这种运行环境，数据请求不依赖jsbridge，其他功能还对jsbridge有弱依赖，如分享调起其他app

3）只在web上运行，是最简单的方式，对端无依赖

 
归结流程如下

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/webpack.arc.png)

对于其他环境，不依赖本地服务的（mock 或proxy 服务），编译时全部注入jsbdrige（如果需要的话）

综合上述不同开发环境和运行环境，我门这里用到的webpack开发流程如下：

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/flow.png)

# 二、目录结构

 当前目录规范结构如下，dist_*产出目录
 
![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/arc.png)

*  build  build配置文件
*  dist_[local/test/pre/online] 打包后地址，供不同环境使用
*  serve.js 本地开发服务文件，支持mock和proxy
*  src  开发源文件
*  test 测试相关 

对应package.json的命令如下：

```
 "scripts": {
    "build": "node webpack.config.js --env=online && node webpack.config.js --env=pre",
    "qa": "node webpack.config.js --env=test",
    "pre": "node webpack.config.js --env=pre",
    "start": "node server.js/index.js --env=local",
    "start-test": "node server.js/index.js --env=local --bridge=test"
  },
```

build:对应线上环境，由于现在沙盒和线上一起上线，pre环境在沙盒上指向project_pre,线上指向project（上线会把编译后的产出copy到项目文件夹下）

pre: 预览环境，这个目前在我门这没单独上线步骤，需要和online一起上线部署到沙盒

qa: 单独给qa部署到包

start：开发环境用

start-test: 本地启动的开发环境，需要注入bridge，在端内开发使用


# 三、构建过程

构建目录结构如下：

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/build.png)
 
**prebuild**：编译之前做的一些操作：如复制运行环境的变量，如api接口地址，在不同环境是不一样的

**tools**: 

1）buildLibrary 独立构建lib用；

2）buildPage 构建注入到template的一些脚本，如独立构建完lib后要写入html文件

**vendors**： lib缓存用；每次构建完lib后，在git库存一份，保存的规则是当前用到的lib ＋version 做md5，下次查找如果当前lib的md5指纹存在，则直接复制到产出目录，并返回当前lib和对应manifest.json

**webpack.lib.js**: 独立构建lib使用，在构建前会通过buildLibrary检查对应的lib指纹是否存在，是直接复制，返回对应路径；

**webpack.base.js**: webpack的基本配置

**webpack.[local/test/pre/online].js**: 各个环境配置


## 3.1 入口文件

入口文件根目录webpack.config.js

```
const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const argv = require('yargs').argv;
const fs = require('fs');
const path = require('path');



// 获取运行参数
const env = argv.env;

let bridge = argv.bridge;

const ENVS = ['local', 'test' ,'pre' ,'online'];

if (ENVS.indexOf(env) < 0) {
	console.log(`env '${env}' is not valid of ['local', 'test' ,'pre' ,'online']`);
	return;
}

// 在构建过程中默认和env一致，但是为了保持开发的灵活性
// 开发过程中可能到手机上调试, bridge在copy 配置文件时，可以参选
if (!bridge) {
	bridge = env;
} else {
	if (ENVS.indexOf(bridge) < 0) {
		console.log(`bridge '${bridge}' is not valid of ['local', 'test' ,'pre' ,'online']`);
		return;
	}
}


//构建路径
const BUILD_PATH  = path.join(__dirname, 'build');

//辅助参数
const {basePath, sourcePath} = require(`${BUILD_PATH}/webpack.base`)
const BuildPage = require(`${BUILD_PATH}/tools/buildPage`);
const preCopyConfig = require(`${BUILD_PATH}/preBuild/preCopyConfig`);
/**
* 构建lib类型的文件，一次只构建一次
* @param{String} name
* @return{Object} Promise
*/

function compileLibrary(name = 'lib', env = 'local') {
	let compile = require(`${BUILD_PATH}/webpack.${name}.js`);
	return compile(env);
}

/**
* 构建业务类型文件类型的文件，一次只构建一次
* @param{String} env 当前build的环境
* @return{Object} Promise
*/

const url = require('url');
function getWebpackConfig(env) {
	let webpackConfig = {};
	if (!env) {
		throw new Error('请指定运行或者构建的环境');
	} else if (fs.existsSync(`${BUILD_PATH}/webpack.${env}.js`)) {
		webpackConfig = require(`${BUILD_PATH}/webpack.${env}.js`);
	} else {
		throw new Error(`不存在指定的构建配置文件dev:${env}`);
	}

	return Promise.all([compileLibrary('lib', env), preCopyConfig.compile(bridge)])
		.then(([libStats]) => {
			// 1、把构建好的lib的js塞入本次构建的资源数组中

			['static/js/polyfill.min.js', 'static/js/js-bridge-native.js', 'static/js/js-bridge-h5.js', libStats.lib].map(function(script) {
					BuildPage.addScript(url.resolve(webpackConfig.output.publicPath, script));
			})
			// 2、修改config文件
			//console.log(webpackConfig)
			webpackConfig = webpackMerge(webpackConfig, {
				plugins: [
					new webpack.DllReferencePlugin({
		                context: basePath,
		                manifest: require(libStats.mainifest),
		            }),
		            ...BuildPage.buildHtmlWebpackPlugin()
				]
			});


			return webpackConfig;
		}, (err) => {
			console.log(err);
		})
}


// 如果是local 则跳过,否则则执行

if (env != 'local') {
	getWebpackConfig(env)
		.then((logicConfig) => {
	    	let startTime  = + new Date();
	    	console.log('Start build logic code!');
	    	return new Promise((resolve, reject) => {
				let compiler = webpack(logicConfig, (err, stats) => {
		            let endTime  = + new Date();
		            let wasteTime = Math.floor((endTime - startTime) / 1000);
		            if(err) {
		            	reject(err);
		            } else{
		            	resolve(compiler);
		                console.log(`Logic code build over! all ${wasteTime}s`)
		            }
	        	})
	    	})
	}, (err) => {
		console.log(err)
	})
}


module.exports = {
	compile() {
		//如果是内置的local即dev开发环境，直接
		return getWebpackConfig(env)
	},
	DIST_PATH: path.resolve(basePath, `dist_${env}`)
};



```
 有三部分东西：
 
 1、如果不是local开发环境，直接走webpack打包
 
 2、如果是local环境，在node中手动打包，并导出compiler句柄到node本地服务的热更新插件
 
 3、编译业务代码之前，先编译lib，再copy运行时变量，得到返回的lib信息加上要注入的其它js， 通过BuildPage写入到HtmlWebpackPlugin插件
 
 
## 3.2 lib构建 
 
 构建lib流程如下
 

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/lib.png)

没代码说个xx，看，

```

const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const CompressionWebpackPlugin = require('compression-webpack-plugin')

const {basePath, sourcePath} = require('./webpack.base');
const path = require('path');
const BuildLibrary =  require('./tools/buildLibrary');
const vendors = [
    'vue',
    'vue-router',
    'vuex'
];
const LIBRARY_NAME = 'lib';
var buildLibrary = new BuildLibrary({
    name: LIBRARY_NAME,
    vendors: vendors,
    output: path.resolve(basePath, 'build', 'vendors')
})
var webpackLibConfig = {
    output: {
        path: basePath,
        filename: '[name][hash].js',
        library: '[name][hash]',
    },
    entry: {
        [LIBRARY_NAME]: vendors,
    },
    plugins: [
        new webpack.optimize.UglifyJsPlugin({
            compress: {
                warnings: false
            },
            output: {
                comments: false,
            }
        }),
         new webpack.DefinePlugin({
            'process.env': {
              'NODE_ENV': `"production"`
            }
        })
    ],
};

/**
* @desc 导出可编程的构建，只和env有关系，导出函数,导出的目录路径为
* basePath + dist_{env}
* 导出的文件名为{manifest-[name].json}
* @param{String} env  local | test| pre| online 
**/
var a = + new Date();
function webpacklib(env = 'local') {
    let startTime  = + new Date();
    let outPath = path.join(basePath, `dist_${env}`);

    let libInfo = buildLibrary.findLibrary({
        manifile: `manifest-${LIBRARY_NAME}.json`
    });
    
    if (libInfo) {
        console.log(`当前lib指纹[${buildLibrary.md5Key}]已经存在，开始复制...`)
        let files = Object.keys(libInfo).map((key) => {
                return libInfo[key];
        });
        return buildLibrary
            .copyVendor(files, outPath)
            .then((flag) => {
                if (flag) {
                    return {
                        lib: libInfo.lib, 
                        mainifest: libInfo.mainifest
                    }
                }
                throw new Error('文件已经存在，但复制失败')
            })
            .then((libInfo) => {
                let endTime  = + new Date();
                let wasteTime = Math.floor((endTime - startTime)/1000);
                console.log(`当前lib指纹[${buildLibrary.md5Key}]复制完毕,耗时${wasteTime}s`);
                return {
                    lib: `${path.basename(libInfo.lib)}`,
                    mainifest: `${outPath}/${path.basename(libInfo.mainifest)}`
                }
            }, (err) => {
                console.log(`copy library fail:${err}`);
            })
            
    }

    
    let libConfig = webpackMerge(webpackLibConfig,{
        output: {
            path: `./dist_${env}`
        },
        plugins:[
            new webpack.DllPlugin({
                path: `${outPath}/manifest-[name].json`,
                name: '[name][hash]',
                context: basePath,
            })
        ]
    });

    console.log('Start build library code!')

    return new Promise((resolve, reject) => {
        webpack(libConfig, (err, stats) => {
            let endTime  = + new Date();
            let wasteTime = Math.floor((endTime - startTime)/1000);
            if (err) {
                console.log(`Library code error:${err}`);
                reject();
            } else {
                console.log(`Library code build over! all ${wasteTime}s`);
                resolve({
                    lib: `${LIBRARY_NAME}${stats.hash}.js`,
                    mainifest: `${outPath}/manifest-${LIBRARY_NAME}.json`
                });
            }
        })  
    })

    .then((libInfo) => {

        return buildLibrary.writeVendor([path.resolve(outPath, libInfo.lib), libInfo.mainifest])
            .then((flag) => {
                return libInfo;
            })
            .then((s) => {
                console.log(s)
            })  
    })
  
}
module.exports = webpacklib;

```


> 1、对于lib来说，更新频率最少；对整个团队开发，由于生成缓存文件的依据是name+version,所以package.json的依赖必须是指定某个版本，在安装时才能保证整个团队版本一致，否则有可能出现每个人提交的代码不一致；

-------
> 2、buildLibrary.findLibrary负责根据传入到vendors名称及版本号生成的md5去build/vendeos查找当前lib名称文件夹是否存在，如果存在则查找对应md5文件夹是否存在,如果存在返回lib构建信息以及manifest.json地址；

> 3、对于lib构建，不区分环境，直接按照线上要求来构建，直接压缩


**buildlibaray代码如下：**


```
/**
* @file  构建lib时用的工具函数，可以按照lib的某种规则来打包，并且在git持久存储
* 		   下次构建的时候线根据md5计算对应的hash是否存在
*/

const utils = require('./util');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const execPath = process.cwd();
class BuildLibrary {

	constructor({name = 'lib', output = path.resolve(execPath, 'build','vendors'), vendors = [], rule = `{vendor}_{version}`}) {
		this.vendors = vendors;
		this.libPath = path.resolve(output, name);
		this.output = output;
		this.name = name;

		this.__md5key = 'webpack_md5_lib';
		// 计算开始路径
		this.vendors = vendors;
		this.rule = rule;
		let nodeModulePath = path.resolve(execPath,'node_modules');
		if (fs.existsSync(nodeModulePath)) {
			this.nodeModulePath = nodeModulePath;
		} else {
			let startPath = __dirname;
			while(startPath != '/') {
				nodeModulePath = path.resolve(startPath, 'node_modules');
				if (fs.existsSync(nodeModulePath)) {
					this.nodeModulePath = nodeModulePath;
				}else {
					startPath = path.resolve(startPath, '..');
				}
			}
		}

		if(!fs.existsSync(this.output)) {
			fs.mkdirSync(this.output);
		}


		if(!fs.existsSync(this.libPath)) {
			fs.mkdirSync(this.libPath);
		}
	}
	
	//得到单个vendor的版本号
	getVendorVerion(vendor) {
		let vendorPackagePath = path.resolve(this.nodeModulePath, vendor);
		if (!fs.existsSync(vendorPackagePath)) {
			throw new Error(`verdor : ${vendor} path is not exists!`)
		}
		return require(path.resolve(vendorPackagePath, 'package.json')).version;
	}
    
   //  去依赖查找当前vendors的版本号
	getVendorsVersion(vendors) {
		 //....
	}
    //返回vendor的名称和版本拼接的字符串
	getVendorsOrignalInput(vendors) {
		//....
	}
	makeMD5(str){
		if(!str) {
			throw new Error('字符串为空');
			return ;
		}

		var decipher = crypto.createHash('md5');
		decipher.update(str);
		return decipher.digest('hex');
	}
	// 得到vendors的md5值
	getVendorsMD5() {
		 //....
	}
	// 查找当前lib的指纹是否存在，根据manifest文件来查找
	findLibrary({manifile =''}) {
	  //....
	}

	// 不存在vendor编译后要写入
	writeVendor(files) {
		//....
	}
	// 如果存在vendor，要复制到对应的编译产出文件中
	copyVendor(sources, to) {
		
	}
}


module.exports = BuildLibrary;
```

对应的vendors目录结构如下

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/vendors.png?x)

## 3.3配置文件复制

文件复制，主要指根据不同开发环境配置api接口（目前主要是这个需求，其他需求可以一同配置），在有jsbdrige的情况下，抹平通过bridge和ajax数据请求的差异；

### 3.3.1 配置文件

配置文件有两种做法；

第一将所有环境配置放倒一个文件里，在webpack编译通过设置环境变量读取配置，省事，用if语句判断的话，没用到的else语句会被uglify插件干掉；

第二方法，编译时根据配置文件动态写入文件到固定地址，麻烦一点但是可配置性高，比较统一


### 3.3.2 数据请求文件

对于不依赖jsbdrige的可以略过此步；对于依赖jsbdrige的，需要准备两份底层的数据请求文件，如request.bridge.js,request.web.js分别代表用ajax和bridge发请求，根据需求决定将那个复制为request.js 供运行时调用（注：即使是hybird程序依赖jsbdrige，在开发期间可能由于app壳没准备好，可能需要本地请求，这个是后来才加进去的，同时为兼顾标准的web请求，所以建议两份文件都准备)



## 3.4 开始构建吧

上述基础工作完成后，收益是整个team开发编译效率提高了，lib不用编译，瞬间完成，并且依赖的lib变了或版本改变，都能很快的在编译期间生成新的指纹，供整个team使用；


到这就简单了，需要对local环境做一个特殊配置，因为它是由node启动的；其他环境配置只需要根据当前环境在对应的webpack配置文件中设置即可，如在local和test无需压缩，需要制定环境为"developemnt",在pre和online环境需要指定为"production"

#4 本地server

本地server是开发环境必须的东西，现在大多数的项目是前后端分离，接口尚未ready之前，可以根据mock来，测试接口ready之后，通过proxy切换到rd的后台地址，目前这块做的比较挫，但是能满足基本要求，其目录结构如下

![](https://raw.githubusercontent.com/changfuguo/share/master/images/webpack2_arc/server.png?x)

主要干了三件事：

1、载入webpack配置文件，编译，加入dev插件，实现热更新
2、开发前期，能使用mock数据
3、接口ready能切换到rd联调机器

# 4.1 index.js

入口文件，核心代码如下：

```
 const testServer = 'http://1270.0.0.1/';
 app.use('/v2/*', function(req, res) {
   var url = testServer + req.originalUrl.replace('/v2/','');
   console.log(url);
   req.pipe(request(url)).pipe(res);
});
compile()
    .then((webpackConfig) => {
      let startTime = + new Date;
        console.log('Start build logic code!');
      let compiler = webpack(webpackConfig, (err, stats) => {
            let endTime  = + new Date();
            let wasteTime = Math.floor((endTime - startTime) / 1000);
            if(err) {
              console(err);
            } else{
                console.log(`Logic code build over! all ${wasteTime}s`);
                var open = require("open");
                open("http://" + getIPAdress() + ':' + port + '/driver_hire.html');
            }
      })
        console.log('connect to dev and hot server')
        app.use(WebpackDevMiddleware(compiler, {
            stats: { colors: true },
            noInfo: true,
            publicPath: webpackConfig.output.publicPath
        }))
        app.use(WebpackHotMiddleware(compiler, {
            path: '/__webpack_hmr',
            timeout: 20000,
            reload: true,
            log: console.log,
            heartbeat: 10 * 1000
        }))

    })
```

# 4.2 数据mock

数据mock这里实现优点low，直接写配置文件，读取本地对应的js，路由规则和正式的一样，
mock的路有配置如下：config/route.js

```

/**
*	@decription mock file config
*	
*	该文件实现路由的配置，在没有test准备好的情况下可以直接走这个mock数据
*	key：			为要匹配的路由
*	value：			为对应的参数配置
*		method：		get或者post，router的方法
*		filename: 	对应的mock文件
*/

module.exports = {
	'/api/realtime': {
		method: "post",
		filename: "realtime.js"
	}
}

```
载入路由routers.js代码如下：


```

/**
*	@description 统一的路由配置
*	
*
*/
var path = require('path');
var fs = require('fs');
var MOCK_DIR = path.join(__dirname, './mock')
var ROUTE_CONFIG = require('./config/route');
module.exports = function(router) {

	Object.keys(ROUTE_CONFIG).forEach(function (value, index) {

		var routerItem = ROUTE_CONFIG[value];
		var method = routerItem.method || 'get';
		var filename = routerItem.filename;

		if (fs.existsSync(path.join(MOCK_DIR, filename))) {

			var mocker = require('./mock/' + filename);
			router[method](value, function(req, res, next){
				mocker(req, res, next)
			})
		} else {
			console.log('filename is not exists [' + path.join(MOCK_DIR, filename) + ']');
		}
	})
}

```
最后 filename 对应的数据文件放在mock下面，例子realtime.js,还可以模拟延时请求，哈哈

```

var RETURN = 
	{
    errno: "0",
    error: "",
    data: {
    }
}


module.exports = function (req, res, next) {
    setTimeout(function(){
        res.json(RETURN);
    },1000)
}
```

# 4.3 数据代理

数据代理到rd的开发机器上，这个是可选的，index.js中已经开启，要求在webpack复制前置步骤中，能区分出来，如这里加/v2/区分转发

```
 const testServer = 'http://1270.0.0.1/';
 app.use('/v2/*', function(req, res) {
   var url = testServer + req.originalUrl.replace('/v2/','');
   console.log(url);
   req.pipe(request(url)).pipe(res);
});
```

# 5 关于优化

本文的实现思路在webpack1中也同样能用，相关的一些优化其实比较固定，可参考下面的

[ webpack 2.2 中文文档](http://www.css88.com/doc/webpack2/)


[ webpack2-webpack.config.js配置](http://blog.csdn.net/i0048egi/article/details/56673032)

[webpack2 终极优化](http://www.open-open.com/lib/view/open1483317889255.html)

## 5.1 tree shaking 

tree shaking 是webpack2的主打亮点，实现思路是根据es导出的静态性质，分析无用代码
首先在.bablerc配置 preset如下，告诉babel采用es6的模块导出方法

```
{
 "presets": [
    ["latest", {
      "es2015": { "modules": false }
    }],
    "stage-2"
  ]
}
```
其次要配置UglifyJsPlugin插件

```
 new webpack.optimize.UglifyJsPlugin({
             compress: {
                unused: true,    // Enables tree shaking
                dead_code: true, // Enables tree shaking
                pure_getters: true,
                warnings: false,
                screw_ie8: true,
                conditionals: true,
                comparisons: true,
                sequences: true,
                evaluate: true,
                join_vars: true,
                if_return: true,
            },
            output: {
                comments: false
            },
        })
```
  
## 5.2 开发环境的hash

开发环境不需要hash，直接用name，免得计算浪费时间

## 5.3 对于异步加载

webpack2支持import方法来实现异步加载，但是项目中使用了extract-text-webpack-plugin插件来抽取css，异步的时候该插件会报错，就没使用异步来加载；刚看了下，作者的回复应该是在2.1版本中解决了，大家可自行尝试，扔几个issue出去

[我的issue-webpack2 code split error with `import` when use extract-text-webpack-plugin](https://github.com/webpack-contrib/extract-text-webpack-plugin/issues/406)

[Bugs in extract-text-webpack-plugin](https://github.com/facebookincubator/create-react-app/issues/1668)

[css extracted incorrectly when using split chunks](https://github.com/webpack-contrib/extract-text-webpack-plugin/issues/436)

## 5.4 gzip压缩插件

这个功能通过CompressionWebpackPlugin来做的，写文章的时候刚看到这个插件，还没来的及看怎么用，如果用过的可以留言告诉我。

```
new CompressionWebpackPlugin({
    asset: '[path].gz[query]',
    algorithm: 'gzip',
    test: new RegExp(
    '\\.(' +
        ['js', 'css'].join('|') +
    ')$'
    ),
    threshold: 10240,
    minRatio: 0.8
})
```

## 5.5 开启缓存，设置查找路径，设置alias

这个可以参考上文中文章，不再赘述

## 5.6 关于HtmlWebpackPlugin

HtmlWebpackPlugin插件根据模版来生成最后的入口文件，该插件默认支持ejs的语法，所以在编译期间可根据不同环境来写入一些变量生成不同的入口文件；文件存放于build/tools/buildPage.js

主要实现如下：

```
const objectAssign = require('object-assign');
const HtmlWebpackPlugin = require('html-webpack-plugin');

//html页面
var htmlTemplate = './src/views/template.html';
var htmlConfig = [
    {
        filename: 'index.html',
        chunks: ['driver_hire'],
        chunksSortMode: 'none',
        template: htmlTemplate
    }
]
htmlConfig.map((item) => {
    item.assets ={
        js:[]
        css:[]
    }
})

const toString =  Object.prototype.toString;
const utils = {};
let typeArray = ['Function', 'RegExp', 'String'];
typeArray.map((type) => {
    utils['is' + type] = function(obj) {
        return toString.call(obj) == '[object ' + type +']';
    }
})

const BuildEntries = {
    getEntryConfig : function() {
        return objectAssign({}, htmlConfig)
    },
    addScript: function(script, key) {
        htmlConfig.map((item) => {
            if((!key)
                || (utils.isFunction(key) && key(item))
                || (utils.isString(key) && key == item.filename)
                || (utils.isRegExp(key) && key.test(item.filename)))
            {
               item.assets.js.push(script);
            }
        })
        return BuildEntries;
    },
    addStyle: function(style, key) {
        htmlConfig.map((item) => {
            if((!key)
                || (utils.isFunction(key) && key(item))
                || (utils.isString(key) && key == item.filename)
                || (utils.isRegExp(key) && key.test(item.filename)))
            {
               item.assets.css.push(style);
            }
        })
        return BuildEntries;
    },

    buildHtmlWebpackPlugin: function() {
        var pages = [];
        htmlConfig.map((v) => {
            pages.push(
                new HtmlWebpackPlugin(v)
            );
        })
        return pages;
    }
}
module.exports = BuildEntries;


```

主要用在注入生成的lib以及其他一些依赖的库，调用的时候见webpack.config.js 中

```
['static/js/polyfill.min.js', 'static/js/js-bridge-native.js', 'static/js/js-bridge-h5.js', libStats.lib].map(function(script) {
	BuildPage.addScript(url.resolve(webpackConfig.output.publicPath, script));
})
```
在对应的tempatel.html中,从options中读取，个人感觉这快可以设置其他东西，比如运行时一些参数和配置

```
<% _.forEach(htmlWebpackPlugin.options.assets.js, function(js) { %>
	<script type="text/javascript" src="<%- js %>"></script>
<% }); %>
```


# 6 待优化的地方

## 6.1 bem


本来这次要加上的了，之前用的是sass，本次项目用postcss的插件没搞好rem的用法，下次再解决

## 6.2 异步加载
抽取css的插件有问题，写文章的时候看了下给作者提的issue已经在新版本解决了，下次加上

## 6.3 脚手架

其实按照现在的程序基本算是一套完整的脚手架了，可以直接走cli

## 6.4 组件

其实在框架的支持下，web开发变的比较机械化，要准备一套适合自己风格的ui需要ue、pm尤其是领导的大力支持，这样才能阻止人力真对项目有的放矢，本次的几个项目实践中，参考了公司的魔方组件和***饿了吗***[mint-ui](https://github.com/ElemeFE/mint-ui)，对其表示感谢；

## 6.5 日志

日志对于web优化是一项不可缺少的工作，只有有数据的对比才能有说话的权力，本次项目只用公司omega，做了简单的pv、uv统计，详细的日志后续迭代上。

## 6.6 同构

目前是在服务端nginx做的静态proxy，没有经过服务端，如果对seo以及速度有要求，目前的vue/react在服务端渲染也是一个不错的优化方法（这个实现程度看领导对目前速度的忍受程度，自行实践吧，目前不好推，如果以后上node服务了，可以考虑）

## 6.7 单测

在之前的react项目，[francis-su](https://github.com/francis-su)已经加上了，本次的vue项目准备逐步启动；






