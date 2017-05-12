# 自动化部署利器－shipit

> 半年以来一直在做基于webpack的［蛋液］应用，为什么想自动化部署呢，主要之前做了一blog，每次上线都要吭哧吭哧登录到机器，pull下代码，cp到线上目录，我想着tm要是100台机器，劳资还不得累死啊，此是背景。
> 
> 最开始想到的是git hook，尝试了一番，发现没搞懂，这个后续再研究


# 一、基于git hook的部署

最开始的思路是，开发机push到origin仓库master分支，能主动通知线上机器进行pull，并且产出到部署目录

![](https://raw.githubusercontent.com/ddtf/blog/master/2017-5/shipit/git_hook_flow.png)

实际上我tm只能这样

![](https://raw.githubusercontent.com/ddtf/blog/master/2017-5/shipit/shipit-flow-1.png)


## 1、具体流程
实际上git hook只查阅到了一些办法，还是只能通push到服务端的一个裸仓库，进行操作;推送到代码仓库和服务端是两个独立的步骤，之间没有任何关系，这也合情合理，git只负责代码管理，和服务器之间的联系和部署步骤是

1、) 线上服务器

有三个目录，一个是hook钩子的空仓库，负责接收push之后触发动作；一个是git代码存放目录，是代码实际存放地方，流程如下

![](https://raw.githubusercontent.com/ddtf/blog/master/2017-5/shipit/git_hook_flow_my.png)


假设我远程仓库目录为

https://wwww.github.com/gitname/gitproject.git


在服务端机器上，创建`/root/deploy/code/`,`/root/deploy/`repos/两个文件夹，分别对应裸仓库和代码库存放位置

2、）创建裸仓库

`cd /root/deploy/repos/` ,执行 `git init --bare gitproject.git`

--bare  参数是裸仓库，不存储实际代码，但是有`.git`文件夹，可以执行hook

3、）代码仓库

`cd /root/deploy/code/`,执行 
` git clone /root/deploy/repos/gitproject.git`

4、)创建部署目录

如果已经存在不用创建

`mkdir -p /root/www/static/gitproject`

5、) 添加hook文件

`cd /root/deploy/repos/gitproject.git/hooks/`

`vi post-update`

至于为什么是`post-update` 而不是`post-receive` 可以看网上，我试了一下`pull`代码只能拉取上一次提交的提交。

`post-update`代码如下：

```
#!/bin/sh
#
# An example hook script to prepare a packed repository for use over
# dumb transports.
#
# To enable this hook, rename this file to "post-update".

unset GIT_DIR 
CODE_PATH=/root/deploy/code/gitproject
DEPLOY_PATH=/root/www/static/gitproject
cd $CODE_PATH
git add . -A && git stash
git pull origin master

cp -rf output/dist_online/* $DEPLOY_PATH
echo "deploy done"
#git remote add origin /root/deploy/repos/spb_fe.git

```
更改权限

`chmod +x post-update`

6、)本地开发机器

本地开发机器，添加远端推送

`git remote add prod root@server_ip:/root/deploy/repos/gitproject.git`


7、）推送

此操作之前和远端git仓库隔离，先推送到origin，再执行此操作

`git push prod master`

会提示你输入机器密码，只后会自动触发钩子，部署到线上目录

## 2 遗留问题

1、）账户问题
  最好不要用root，增加一个专门的deploy账户
  
2、）推送问题

需要在本地，增加每个线上机器的remote，输入密码，机器多了太麻烦

3、）ssh免密码问题

这个后来安装了一个 ssh-copy-id ，可以通过线上机器部署ssh授权解决

参考文献

[使用 Git Hook 实现网站的自动部署](http://www.tuicool.com/articles/3QRB7jU)

[利用Git搭建自动部署的Laravel环境](http://blog.csdn.net/kbkaaa/article/details/70943401?utm_source=itdadao&utm_medium=referral)

[使用Git自动更新实现本地一键推送到正式服务器项目中](http://www.jianshu.com/p/5c7ce1b02100)

# 二、shipit


1、 shipit 

[github](https://github.com/shipitjs/shipit)

shipit 可以实现部署高度定制化，小而全的一个工具。可以先看官网，再看这篇文章[使用shipit-deploy实现自动化的多服务器部署](https://cnodejs.org/topic/584545bd4c17b38d354363af);通过简单配置，可以实现从仓库到服务端到部署，并且支持多机器部署，支持部署中各个阶段的远端命令，还支持回滚～～哦耶，对于没有上线机制的公司来说，简直低廉高效～


2、准备工作

全局安装

'npm i -g shipit-cli'


本地目录安装

`npm i shipit-utils shipit-deploy --D`

3、新建

跟目录新建 `shipitfile.js`，内容如下


```
var utils = require('shipit-utils');

module.exports = function (shipit) {
  require('shipit-deploy')(shipit);
  shipit.initConfig({
    default: {
        workspace: '拉取代码临时存储目录，放到/tmp下',
        deployTo: '服务端部署目录',
        repositoryUrl: '远端仓库目录',
        ignores: ['.git', 'node_modules'],
        keepReleases: 2,
        deleteOnRollback: false,
        key: '/root/username/.ssh/id_rsa', //本地rsa私钥
        shallowClone: true
    },
    prod: {
        servers: ['root@serverip'], //要推送的服务器，多台
        branch: 'master'
    }
  });

   
};

```
上面代码就可以将制定仓库代码推送到服务器指定目录，但是我的产出资源还需要手动cp到部署目录

所以增加如下代码,在部署完成之后，执行指定指令

```

 require('./shipit/copy-to-www')(shipit);
    shipit.on('published', function () { // 监听published事件，触发后就执行do_something任务。
        shipit.start('copy-to-www');
    });
    
```

跟目录下，建立`shipit` 文件夹，新建`copy-to-www.js`,内容如下：

```
var utils = require('shipit-utils');
module.exports = function(shipit) {
  	utils.registerTask(shipit, 'copy-to-www', task);
  	function task() {
    	shipit.config = shipit.config || {}; // 读取相关配置
    	var cmd = 'cp -rf 你的部署目录/current/output/dist_online/* /root/www/static/gitproject'; // 你想要执行的命令
    	return shipit.remote(cmd); // 当触发部署完成后，就会在服务器上执行cmd。
  	}
}
```

4、添加命令到`npm`

 ```
 "deploy": "shipit prod deploy",
  "rollback": "shipit prod rollback"
 ```
5、ssh免登录

因为要登录服务，要在本地和服务点之间建立联系，不需要每次都登录，这里用的是 ssh-copy-id,具体可参考

[mac安装ssh-copy-id](http://www.01happy.com/mac-install-ssh-copy-id/)

[ssh免密码和ssh-copy-id命令](http://blog.csdn.net/wind520/article/details/38421359)
[使用ssh-keygen和ssh-copy-id三步实现SSH无密码登录 ](http://blog.chinaunix.net/uid-26284395-id-2949145.html)


# 三、结束语 

 只是闲来没事搞一下，对于自己梳理这些上线流程（op的事）啥的还是有好处的，git的那一套ci没搞懂，有时间再研究一下






