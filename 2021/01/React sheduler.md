# React sheduler调度

首发[blog](https://github.com/ddtf/blog)
## 1、为什么需要调度

复杂的任务为了充分利用机器的资源完成最终任务，一般都会拆分为若干个子任务。而这些子任务之间存在依赖关系，什么时间调用哪个子任务就显得尤为重要。

所以需要一个类似于任务大脑的指令中心，保证任务能够有序的执行，也能够保证机器资源得到充分利用。关于什么是调度可以参考这里[5分钟了解调度系统](https://zhuanlan.zhihu.com/p/76617275)、[开源的调度系统有哪些？
](https://www.zhihu.com/question/37436027)

对于React来说，需要通过调度完成数据更新、页面重绘；如当我们进行setState时，react会做什么？

可以看下图
![](https://pt-starimg.didistatic.com/static/starimg/img/hFPFzD7hZt1608602289668.jpeg)

render阶段增量更新执行，commit阶段是不可打断，所以render会按照’执行-暂停-执行‘去实现。react将复杂的任务拆分为许多可执行的单元，最小的单元就是fiber，真实dom 和fiber之间存在映射，当diff之后存在更新，则执行渲染过程，更新UI。

调度在整个过程中负责整个fiber的调用执行、高优任务插入、暂停等，从源代码中可以看出，fiber的批量更新最后是通过调度来实现。比较详细的分析可以参考这个[fiber reconciler 漫谈
](https://zhuanlan.zhihu.com/p/266564150),其中涉及到的东西比较多reconciler如何实现批量更新，更新的几种模式、以及和调度之间的关系，从源代码中也可以看出，react和调度的链路：

![](https://pt-starimg.didistatic.com/static/starimg/img/zVqJGcHZGu1608610532701.jpg)

```Scheduler_scheduleCallback```则是整个调度的入口，实现fiber的更新、调度任务优先级调整，只不过他会根据自己的lane设置的任务优先级来实现任务的插入和优先级调整。关于lan可以参考这里[如何看待React源码中调度优先级使用lane取代expirationTime？
](https://www.zhihu.com/question/405268183/answer/1330719468)，还有司徒大大写的一篇文章 [React Fiber的优先级调度机制与事件系统
](https://zhuanlan.zhihu.com/p/95443185),调度之所以有优先级，是和事件相关的，而事件又是和用户不同操作绑定。高优的、或者长时间未得到执行需要执行的都是通过调度来实现。



## 2、事件发射器

浏览器有两个API可以实现平滑的任务调用，```requestAnimationFrame```和```requestIdleCallback```，

* requestAnimationFrame 是操作系统级别的调用，跟系统的刷新频率有关，如系统刷新频率是60HZ，则一帧刷新时长为 1000/60 = 16.7,每一帧开始的时候会执行。

 	* 每次重绘开始会执行

 	* 运行于后台的时候不执行

 	* 除了Opera Mini，其他浏览器支持都还不错，IE从10开始支持

* requestIdleCallback 是浏览器在空闲时间希望为用户做一些事情，本意是好的，有如下缺陷
	* 一秒钟只调用20次 
	
	>requestIdleCallback is called only 20 times per second - Chrome on my 6x2 core Linux machine, it's not really useful for UI work.


	* 兼容性不好，Safari好IE几乎不支持
	* 无法控制调度任务插入、终止等，也就没办法细粒度控制调度策略

	
另外一个setTimeout，也不完美，setTimeout是宏任务，执行开始的时机完全不确定，所以也无法用于精确控制调度，所以react团队自己实现了基于MessageChannel通信机制的调度中心，可以实现如下几个特性：

* 任务队列维护和执行在两个不同的宏任务中

* 任务队列基于栈实现的，在插入和取出任务时，会按照执行优先级或者过期时间对栈中任务进行重新排序

* 任务执行会被打断，当规定的时间间隔超过时或者有浏览器占用主线程时（比如input变化）终端当前任务



## 3、调度预备知识

调度入口是unstable_scheduleCallback，文件位于```/packages/scheduler/src/forks/SchedulerDOM.js```，以及是几个了解调度的预备知识

### 3.1、调度任务生成和派发、调度任务执行

调度分为两个过程：调度任务生成和派发、调度任务执行

* 调度任务生成和派发：新任务进来时，会根据当前任务优先级设置过期时间即调度优先级，按照过期时间距离当前最近的偏移量进行堆排序，并取出优先级最高的任务，任务的执行时放到下一个宏任务中

* 执行当前选出的优先级最高的任务，执行完当前任务出栈同时按照任务优先级重新排序，保证下一次出栈执行的任务是优先级最高的任务

 第一步和第二步并不是同步执行的，第一步找到最高优先任务后，基于MessageChannel实现了一个消息通道，在下一个宏任务进行任务的真正执行。顺便提一句，react采用 MessageChannel作为消息通信的手段，基于以下考量：

* 浏览器中宏任务中的```MessageChannel```优先级高于```setTimeout / setInterval```

如下：主代码块 > ```setImmediate（node）``` >``` MessageChannel``` > ```setTimeout / setInterval```

* 兼容性出奇的好，如下

![](https://pt-starimg.didistatic.com/static/starimg/img/mlKWSODTlZ1610850488218.jpeg)

这里有一个总体的概念，当前任务生成调度任务和派发，下一个宏任务执行任务调度,看下图

![](https://pt-starimg.didistatic.com/static/starimg/img/7EIGdKa28M1612754023842.jpg)

### 3.2、调度优先级

调度优先级分有如下几种，数字越小表示任务越紧急，文件位于```/packages/scheduler/src/SchedulerPriorities.js```

```
export const NoPriority = 0;
export const ImmediatePriority = 1;
export const UserBlockingPriority = 2;
export const NormalPriority = 3;
export const LowPriority = 4;
export const IdlePriority = 5;

```
对应的任务过期时间加权如下（IMMEDIATE_PRIORITY_TIMEOUT和ImmediatePriority对应），优先级越高，任务开始的时间就越应该提前，时间加权越小

```
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;

```

### 3.3、调度进程和待执行任务间通信

调度任务生成和派发是同步执行，新任务插入堆栈之后，会按照优先级重新排序，之后取出最高优先级的任务异步执行，每次任务执行时通过MessageChannel的port 信道来调用

```
const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

```
一旦消息有消息发出，下一个宏任务中会执行```performWorkUntilDeadline```

```performWorkUntilDeadline```即为真正执行调度任务的回调入口

### 3.4、暂停和终止的标志位


* ```isHostCallbackScheduled```: 表示第二阶段中宏任务要执行的回调函数是否被执行了；如果为true，表明第二阶段的回调正在执行，有任务正在调度，第一阶段生成的新任务只入栈，不调用；否则，生成新任务后立即设置第二阶段的回调函数入口，当执行时此函数时，关闭该标志，该参数横跨了两个任务阶段
* ```isHostTimeoutScheduled```: 和	```isHostCallbackScheduled```一样，表示是否正在延时队列里进行任务进行调度（包含从延时队列找出最需要的执行的延时任务到待执行的任务队列中）


* ```isPerformingWork```:当前是否有正在执行的任务，该参数主要用在第二个阶段，调度任务执行期间会设置为true，表示是否待调度的任务正在执行；作用于第二阶段flushWork内部，用来控制是否正在执行workLoop


* ```isMessageLoopRunning```:是否有批量任务在执行，在react 规定的时间片范围内是否还有待调度的执行任务；第一阶段锁定，（第一阶段锁定，表明当前有任务在第二阶段要循环取出任务执行，独占），第二阶段flushWork之后释放；用来控制是否正在执行flushWork。这样设置主要是任务生成和执行时异步的，中间有时间差，防止在时间差范围内有新任务请求执行做的优化

### 4、调度前任务

新任务进入调度程序时，根据优先级生成任务的过期时间，这里有两个队列，一个是timerQueue,延后执行的任务队列；一个是taskQueue，需要立即执行的任务队列；是否需要立即执行，根据传入的用户任务权重来设置一个任务的过期时间，由这个时间来判定进入到那个队列。


### 4.1 、生成任务的优先级规则

 过期时间生成规则则是：

```var expirationTime = currentTime + delay + timeout;```

```currentTime```:当前时间
```delay```:用户延迟执行的时间，可以不设置

```timeout```:不同任务优先级设置的延迟时间

对应任务的两个时间：```startTime```和```expirationTime```，```startTime```设置为```currentTime + delay```，```expirationTime```设置为```startTime + timeout```；根据开始时间是否大于当前时间，来决定新添加的任务是放入```timerQueue```还是```taskQueue```;
而一旦放入到```taskQueue```中，则会设定其任务优先级的比较值： ```newTask.sortIndex = expirationTime;```,放入```timerQueue```过期的比较值为```newTask.sortIndex = startTime;```,前者用来表示任务过期时间，即待执行任务的权重，后者表示从timerQueue取出来放入taskQueue的依据



### 4.2 taskQueue执行
taskQueue 和timerQueue 是一个最小堆结构，对应的文件为 ```	packages/scheduler/src/SchedulerMinHeap.js```,堆结构是个完全二叉树，每当有任务压入或者取出时都会按照之前的sotredIndex即expirationTime 进行排序，过期时间表明优先级越高；

taskQueue取出的任务是在下一个宏任务中立即要被执行的任务队列，如果还没有任务被调度并且当前也非持续从队列取出任务去执行，则进行任务调度

```
 	 newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }
   
    // isHostCallbackScheduled表示是否有任务呗安排进去了
    // isPerformingWork有任务安排了，并且在持续循环安排中
    // 前者负责一开始的调度，后者负责调度开始了，在允许的时间范围内是否持续调度
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
```

### 4.3 timerQueue执行

timerQueue中存放的非立即要执行的任务队列，插入队列时，按照开始时间作为执行的时间；通过定时器方式，延迟到要执行的时间点再去执行

```
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    // taskQueue 没可执行的任务了
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
     // 之前有等待从timerQueue 取任务的定时器
      if (isHostTimeoutScheduled) {
        // 取消掉
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // 开始延迟执行调度timerQueue中任务
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
```
 
#### 4.3.1 任务转移

```advanceTimers ```负责从```timerQueue```中查找已经到开始时间的任务，取出来放入```taskQueue```，并设置```sortedIndex```为当前任务的```expirationTime```；
实现的主要逻辑如下：

```
function advanceTimers (currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  let timer = peek(timerQueue);
  while (timer !== null) {
    if (timer.callback === null) {
      // 取消的话直接callback 设置为null，出堆即可
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // 任务的开始时间理论上开始的时间小于现在的时间,以为这急需要执行,
      // 延时队列出栈，并且放入到要执行的对列当中，指到吧小于当前时间的待执行任务都取出来
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer); //当push的时候就实现了插队的功能，延时的队列插入到当前待执行的任务队列之后,会重新按照sortindex的大小实现一次排序

      if (enableProfiling) {
        markTaskStart(timer, currentTime);
        timer.isQueued = true;
      }
    } else {
      // Remaining timers are pending.
      return;
    }
    // 如果还有执行的任务则一直循环取出来为止，注意这里的currentTime是不变的，程序本身也会占用时间，要以一个固定的时间为准
    timer = peek(timerQueue);
  }
}

```
当从延时队列中取出任务后就和执行taskQueue的任务一样了，如果任务转移之后还没有待执行的任务，则继续查找timerQueue直到有一个任务可以执行。

处理的函数```handleTimeout```实现


```
function handleTimeout (currentTime) {
  isHostTimeoutScheduled = false;
  // 从延时队列里取了一个出来到执行任务队列当中
  advanceTimers(currentTime);

  if (!isHostCallbackScheduled) { 
  	//为什么这里不用判定isPerformingWork，应该是都从延时队列里取了，肯定没有任务在调度
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork); // 下一轮
    } else {
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

```

### 4.4 调度任务分发

无论是从```timerQueue```转移到```taskQueue```还是```taskQueue```本身有任务执行,最终都会走到任务派发等到调度的阶段，即```requestHostCallback(flushWork)```

在调用```requestHostCallback```之前设置```isHostCallbackScheduled```，有任务被调度了，在；
```requestHostCallback```内部，如```isMessageLoopRunning```为false，没有在循环处理的任务，则设置标记为true，同时将```flushWork```设置为下一轮异步的全局回调。通过```MessageChannel```的port消息通知，进入到下一个宏任务中处理flushWork

主要实现如下

```
const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

function requestHostCallback (callback) {

  // 下一步要工作的状态flushWork 放入到待执行的callback中
  scheduledHostCallback = callback;
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true;
    // port 发送消息 通知另外一个消息异步去处理，即执行 performWorkUntilDeadline
    port.postMessage(null);
  }
}
```

```port.postMessage(null)```  之后，会进入到```performWorkUntilDeadline```，来处理上一步的```scheduledHostCallback```，即flushWork。到此同步执行的任务队列处理就结束了，接下来会进入到调度的实体，总结下以上第一阶段的流程

![](https://pt-starimg.didistatic.com/static/starimg/img/pIacYEEnzd1612768070179.jpg)


总结一下第一阶段的事情

* 1 调度任务分为延时任务和立即执行任务
* 2 当前为延时任务，插入timerQueue找到优先级高的，定时器去执行
	* 2.1 定时器执行，因为过去了一段时间，有可能新任务插入，重新查找timerQueue，并找到过期任务插入立即执行任务队列中；
	* 2.2 如果taskQueue中有任务则执行
	* 2.3 taskQueue无任务，继续执行2
* 3 插入的任务为新任务则立即从taskQueue取出优先级最高的执行
* 4 执行调度任务非同步，之前说过，通过MessageChanel机制在下一轮宏任务中执行


## 5、调度任务执行

```performWorkUntilDeadline``` 作为react内部下一轮宏任务的入口，此函数在其允许的时间片范围内会循环执行，直到时间片使用完或遇到浏览器正在绘制就退出

## 5.1、调度入口

```performWorkUntilDeadline```作为下一轮宏任务的调度入口，主要做了几件事

* 设置当前的时间戳作为接下来批量调度任务执行的是否过期依据
* 控制当前任务时间片内批量调度任务的流转：
	* 如果当前时间片内要调度的都执行完毕，则结束，重置isMessageLoopRunning以及scheduledHostCallback
	* 当前时间片用完，但还有要执行的任务，则继续 port.postMessage(null)通过宏任务进入下一轮performWorkUntilDeadlined
	* 如果出错，则继续下一轮调度


## 5.2、单次批量调度任务

之所以称之为单次批量调度，在一个时间片内或者浏览器主线程无绘制请求，调度任务持续进行，无法被中断，同时通过isMessageLoopRunning锁定调度状态，避免出现等待（从这里可以看出单次批量调度开始时，isMessageLoopRunning为true锁定；单次批量调度结束时，isMessageLoopRunning释放，用来标志是否处于单次批量调度的过程中）

flushWork是单次批量调度的入口，执行时，先释放isMessageLoopRunning标志（从这里可以看出，
scheduledHostCallback被重新赋值时，isHostCallbackScheduled为true锁定；当scheduledHostCallback被使用了，isHostCallbackScheduled释放，允许下一次使用；

flushWork主要流程如下

* 设置调度作业状态 isPerformingWork为true（很奇怪和isMessageLoopRunning之间的 关系；isMessageLoopRunning是在上一个宏任务中被设置，和真正执行flushWork还有一个时间差，所以真正控制是否执行的是isPerformingWork， 也即当isPerformingWork为true时，isMessageLoopRunning必定为true）
* 保存当前任务优先级currentPriorityLevel，以便任务调度出错时进行优先级恢复
* 执行批量循环 ，函数为workLoop

## 5.3 批量调度

workLoop作为批量循环调度入口，入参有两个参数hasTimeRemaining以及initialTime，hasTimeRemaining每次批量开始之前设置为true，initialTime记录开始之前的时间

每次开始之前都会调用advanceTimers函数，该函数负责从timerQueue中转移应当开始但还没开始的任务到taskQueue中，以便接下来的循环取任务都能取到优先级最高的任务

其主要流程如下：

* taskQueue取出任务不出栈
* 如果当前任务未过期或者浏览器主线程有绘制需求，则退出
* 取出当前任务的callback，计算是否过期并执行callback，同时更新currentTime
* 如果上一步返回了function，则将返回值赋值给当前任务的回调；否则当前任务从taskQueue出栈
* advanceTimers调用，从延时队列取出来优先级高的转移到taskQueue，currentTime是更新过的时间戳
* 继续从taskQueue中取出任务进行循环
来看下主要函数的代码：

```
function workLoop (hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  // 先去timerQuene中检查下有没有可以执行的任务：标准就是开始时间是否过期

  advanceTimers(currentTime);  
  currentTask = peek(taskQueue); // 读取出来第一个，值最小
  while (
    currentTask !== null &&
    !(enableSchedulerDebugging && isSchedulerPaused) // 当前任务存在且没有暂停
  ) {
    if (
      currentTask.expirationTime > currentTime &&
      // 当前任务还可以往后延迟执行
      // 且
      // 没有剩余时间了或者应该交给主程序执行了，退出当前循环
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      break;
    }
    const callback = currentTask.callback; // 取出来当前任务的回调 执行体
    if (typeof callback === 'function') {
      currentTask.callback = null; // 先置空当前的任务的回调
      currentPriorityLevel = currentTask.priorityLevel; // 取出来当前任务的

      // 过期时间是否已经到了，表明当前任务需要进入到下一个队列中去执行了
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      markTaskRun(currentTask, currentTime);
      // 执行用户任务本体，传入的参数表示是否过期，所以这里传给回调的执行机制就是 是否已经过期这个参数可用了
      // 这里是这样的，传入是否过期，在callback里如果过期返回一个function 下次执行，否则就不执行了
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime(); //获取下执行后的时间

      // 如果任务本体返回一个函数
      if (typeof continuationCallback === 'function') {
        // 则吧回调给到当前任务
        currentTask.callback = continuationCallback;
        markTaskYield(currentTask, currentTime);
      } else {
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      // 再去延时队列里取出来一个任务到待执行的队列中
      advanceTimers(currentTime);
    } else {
      // 否则直接出栈即可
      pop(taskQueue);
    }
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  // currentTask 有几种情况可能不为null，
  // 1、取出来之后，过期了&& (或者没执行时间|| 或者释放占用)
  // 2、取出来之后也执行了但是返回的callback还有继续执行时重复1返回
  // 总之就是currentTask 还需要继续执行
  if (currentTask !== null) {
    return true;
  } else { // 当前执行的任务用完了，去延时队列中取出来一个
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
    	//算出来下一个需要执行的任务多久以后执行，
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}
```

其中shouldYieldToHost表明是否交出当前调度的控制权，这个函数比较有意思可以参考下

```
function shouldYieldToHost () {
 // 如果浏览器支持绘制状态的API，则调用
  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    const scheduling = navigator.scheduling;
    //当前执行时间
    const currentTime = getCurrentTime();
    // deadline是任务调度入口设置的时间标志，改标志是react认为设定的一个过期时间
    // 计算方式见performWorkUntilDeadline
    // deadline = currentTime + yieldInterval; yieldInterval 为5ms，这个可以设置
    if (currentTime >= deadline) {
    	// 没有剩余时间了，移交控制权给浏览器执行高优任务，如浏览器绘制或者用户输入事件
      
      if (needsPaint || scheduling.isInputPending()) {
        // There is either a pending paint or a pending input.
        return true;
      }
      // There's no pending input. Only yield if we've reached the max
      // yield interval.
      return currentTime >= maxYieldInterval;
    } else {
      // There's still time left in the frame.
      return false;
    }
  } else {
    
    // 看这里 就是说当前时间偏移量超过了 最小间隔时间 deadline是 上一步的偏移量加上 + 5ms
    return getCurrentTime() >= deadline;
  }
}

```

shouldYieldToHost里判断了当前浏览器有绘制相关的API则侦测是否浏览器正在绘制或者是否用户正在输入，有则直接移交控制权否则；否则根据设置的deadline和当前时间比较判断是否过期来控制是否移交给浏览器主线程控制权；React 有相关的文档阐述 [设计理念中的 Scheduling 部分所阐释](https://reactjs.org/docs/design-principles.html#scheduling)



循环结束时，如果currentTask为空，则表明当前taskQueue 还有任务要执行，但是时间没有了或者浏览器有绘制请求，则退出交给浏览器主线程运行；
否则，从timerQueue中读取最需要执行的任务，放入到下一个setTimeout中等到调度执行


到这里，调度相关的主要流程已经走完，上面按照代码逻辑梳理的主要流程，对于第二部分调度真正执行的流程，我们也用下面的图来总结一下：


![](https://pt-starimg.didistatic.com/static/starimg/img/d9MZ8xAPWi1612774633701.jpg)


## 6、总结

这里只分析了调度的主流程，从代码中可以看出，react的调度实现了自己的时间片控制(5ms)，并且按照任务类型（延时和实时任务）加上任务优先级，通过消息通信类型宏任务实现了一套自己的调度方案，并且可以根据策略来终端和继续任务的执行，这里借用[调度精髓分析](https://segmentfault.com/a/1190000022942008)的一张图来总结下，整体调度的的一个架构图
![](https://pt-starimg.didistatic.com/static/starimg/img/YKJo49hNeB1612775388204.png)


或者看下 [ReqeustIdleCallback解析](https://my.oschina.net/u/3025852/blog/4493869)的图示 ![](https://pt-starimg.didistatic.com/static/starimg/img/Dgd23izljt1612775538502.png)

