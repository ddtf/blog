# useEffect异步之痛


## 1、前言-Hooks

hooks是React 16.8版本推出一种具有状态的函数组件所使用的的一系列方法。

和之前的类组件相比hooks有以下几个好处：

* 简化类组件方式开发的心智负担。提供内置的方法来模拟类组件生命周期

* 函数组件更轻量级，通过提供的use*处理方法实现逻辑层的复用

* 可以和类组件混合使用

```hooks``` 提供了如下几个主要函数：

* ```useState/useReducer```
* ```useEffect/useLayoutEffect```
* ```useMemo/useCallback```
* ```useRef```

```hooks```本身是```react```的语法糖，利用闭包来保存中间态。内部是按照书写的顺序来定义中间态的，所以书写hooks代码时，要保证每次渲染都会按照相同的执行顺序并且都被执行到，比如hooks的代码不能放到```if```语句中。

下面简单说下各自的用法，着重说下```useEffect``` 

*  ```useState``` 和 ```useReducer``` 可以来存储简单和复杂的数据结构。```useReducer```其实就是一个简版的Redux，做一些局部复杂数据结构实现合并操作数据。

* ```useEffect```,副作用管理;通常用来模拟 ```componentDidMount```，```componentDidUpdate```和```componentWillUnmount```生命周期；
其中 ```useLayoutEffect``` 可以在执行期间对dom 进行一些操作。
* ```useCallback ``` 对一些事件函数做引用缓存；防止每次渲染组件都生成新的函数引用，类似于类组件中```this.xxxEvent = this.xxxEvent.bind(this)```，当每次组件渲染时保持```props``` 对函数引用一致。```useMemo ```实现组件props不变的时候不进行渲染

* ```useRef```，保证引用一致,存储中间变量时非常有用


# Effect 副作用管理

着重看下```useEffect``` 是如何模拟类组件生命周期的

```useEffect```基本用法

```javascript
useEffect(() => {},[])
```
执行时间点是组件渲染或者更新之后。

划重点，首先，不会阻塞浏览器的执行；其次，会返回一个函数，当下次由于其他原因更新时，先执行上次```effect```返回的函数，来消除一些由于副作用带来的副作用，官方文档看这里[传送门](https://zh-hans.reactjs.org/docs/hooks-effect.html)，这也是为什么```hooks``` 要求用到的方法都必须在每次渲染按照相同的顺序执行到并且保证都会执行，具体是怎么实现的，还没来得及看源码，大概的流程我按照自己的理解画了下

![](https://pt-starimg.didistatic.com/static/starimg/img/o3pTBffhkc1605366719593.jpeg)

当组件更新时，如果effect的依赖中有变化，需要再次执行时，会先执行上一次```effect``` 返回的清除函数


* 第二个参数不指定依赖时每次都会执行
* 第二个参数为空数组时，组件挂载完成后执行一次，模拟```componentDidMount``` 
* 第二个具体的参数依赖时，当指定的依赖更新时可再次执行副作用，可用来模拟```componentDidUpdate```
* ```effect```的返回函数，如上所说，依赖变化时可以再次执行，用来模拟```componentWillUnmount```



# Effect 中异步函数如何处理

先看下下面的一个```case```

```javascript
import React, { useEffect, useState, useCallback } from "react";
import "./styles.css";

const fetchData = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve([{ name: "cfg" }, { name: "lyl" }]);
    }, 8000);
  });
};

const Parent = (props) => {
  const [list, setList] = useState([]);

  useEffect(() => {
    fetchData().then((list) => setList(list));
  }, [props.title]);
  return (
    <>
      <h1>{props.title}</h1>
      {list.map((user) => {
        return <div key={user.name}>~ {user.name} </div>;
      })}
    </>
  );
};
export default function App() {
  const [title, setTitle] = useState("默认title ");
  const [v, setV] = useState(true);
  const handleClick = useCallback(() => {
    // setTitle("new Title " + new Date());
    setV(false);
  }, []);

  return (
    <div className="App">
      <button onClick={handleClick}>更新title</button>
      {!v || <Parent title={title}></Parent>}
    </div>
  );
}
```

在```effect``` 中使用异步报了一个错误

![](https://pt-starimg.didistatic.com/static/starimg/img/MwnZtkyuTh1605367833280.png)

很明显，告诉你当组件卸载的时候你去更新了组件，按正常的写法来说，不会出现这种问题。但是Parent组件所处上下文中，对于```Parent```组件本身来说无法控制，比如```Parent```组件上下文中有大量更新，导致```Parent```组件频繁更新（当然这个可以根据具体情况具体解决，比如用useMemo缓存组件），或者如上面的例子，当组件```fetchData```还没拿回来数据之前，父组件被更新导致父组件间内部更新就出错了；

问题如何解决，这里就用到```effect```的返回函数时，如何阻止数据更新```Parent```内部状态，第一个想到的时```useRef```，保存一个不变的引用来指示数据取回来时是否更新数据，代码如下

```
import React, { useEffect, useState, useCallback, useRef } from "react";
import "./styles.css";

const fetchData = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve([{ name: "cfg" }, { name: "lyl" }]);
    }, 8000);
  });
};

const Parent = (props) => {
  const [list, setList] = useState([]);
  const dataSetRef = useRef(true);
  useEffect(() => {
    dataSetRef.current = true;
    fetchData().then((list) => {
      if (dataSetRef.current) {
        setList(list);
      }
    });

    return () => {
      dataSetRef.current = false;
    };
  }, [props.title]);
  return (
    <>
      <h1>{props.title}</h1>
      {list.map((user) => {
        return <div key={user.name}>~ {user.name} </div>;
      })}
    </>
  );
};
export default function App() {
  const [title, setTitle] = useState("默认title ");
  const [v, setV] = useState(true);
  const handleClick = useCallback(() => {
    // setTitle("new Title " + new Date());
    setV(false);
  }, []);

  return (
    <div className="App">
      <button onClick={handleClick}>更新title</button>
      {!v || <Parent title={title}></Parent>}
    </div>
  );
}

```

获取数据之前，```dataSetRef.current```设置为```true```，如果组件没有更新，则正常显示；如果```title``` 更新，则设置为```false``` 阻止上一次数据回来更新组件；同时进行本次的获取数据逻辑，将该逻辑提取出来则作为一个复用的逻辑```hook```，

```
function useIsMountedRef(){
  const isMountedRef = useRef(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => isMountedRef.current = false;
  });
  return isMountedRef;
}

```

更新后的代码如下

```
import React, { useEffect, useState, useCallback, useRef } from "react";
import "./styles.css";

const fetchData = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve([{ name: "cfg" }, { name: "lyl" }]);
    }, 8000);
  });
};
function useIsMountedRef() {
  const isMountedRef = useRef(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => (isMountedRef.current = false);
  });
  return isMountedRef;
}
const Parent = (props) => {
  const [list, setList] = useState([]);
  const isMountedRef = useIsMountedRef();

  useEffect(() => {
    fetchData().then((list) => {
      if (isMountedRef.current) {
        setList(list);
      }
    });

    return () => {};
  }, [props.title, isMountedRef]);
  return (
    <>
      <h1>{props.title}</h1>
      {list.map((user) => {
        return <div key={user.name}>~ {user.name} </div>;
      })}
    </>
  );
};
export default function App() {
  const [title, setTitle] = useState("默认title ");
  const [v, setV] = useState(true);
  const handleClick = useCallback(() => {
    // setTitle("new Title " + new Date());
    setV((v) => !v);
  }, []);

  return (
    <div className="App">
      <button onClick={handleClick}>更新title</button>
      {!v || <Parent title={title}></Parent>}
    </div>
  );
}

```


可以进一步封装，类似于```props render``` 实现，利用```hooks``` 透传一个当前组件的状态给到Parent，

```
function useAbortableEffect(effect, dependencies) {
  const status = {}; // mutable status object
  useEffect(() => {
    status.aborted = false;
    // pass the mutable object to the effect callback
    // store the returned value for cleanup
    const cleanUpFn = effect(status);
    return () => {
      // mutate the object to signal the consumer
      // this effect is cleaning up
      status.aborted = true;
      if (typeof cleanUpFn === "function") {
        // run the cleanup function
        cleanUpFn();
      }
    };
  }, [...dependencies]);
}
```

更新的代码如下

```
import React, { useEffect, useState, useCallback, useRef } from "react";
import "./styles.css";

const fetchData = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve([{ name: "cfg" }, { name: "lyl" }]);
    }, 8000);
  });
};
function useIsMountedRef() {
  const isMountedRef = useRef(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => (isMountedRef.current = false);
  });
  return isMountedRef;
}

function useAbortableEffect(effect, dependencies) {
  const status = {}; // mutable status object
  useEffect(() => {
    status.aborted = false;
    // pass the mutable object to the effect callback
    // store the returned value for cleanup
    const cleanUpFn = effect(status);
    return () => {
      // mutate the object to signal the consumer
      // this effect is cleaning up
      status.aborted = true;
      if (typeof cleanUpFn === "function") {
        // run the cleanup function
        cleanUpFn();
      }
    };
  }, [...dependencies]);
}

const Parent = (props) => {
  const [list, setList] = useState([]);
  useAbortableEffect(
    (status) => {
      fetchData().then((list) => {
        if (!status.aborted) {
          setList(list);
        }
      });

      return () => {};
    },
    [props.title]
  );
  return (
    <>
      <h1>{props.title}</h1>
      {list.map((user) => {
        return <div key={user.name}>~ {user.name} </div>;
      })}
    </>
  );
};
export default function App() {
  const [title, setTitle] = useState("默认title ");
  const [v, setV] = useState(true);
  const handleClick = useCallback(() => {
    // setTitle("new Title " + new Date());
    setV((v) => !v);
  }, []);

  return (
    <div className="App">
      <button onClick={handleClick}>更新title</button>
      {!v || <Parent title={title}></Parent>}
    </div>
  );
}

```

这个也是[react-use（useMountedState.md）](https://github.com/streamich/react-use/blob/master/docs/useMountedState.md)中实现的一个背景和方法


# useEffect实现Promise使用

其实上面的case 已经实现了一个异步的方案，同样适用于```Promise```。但是```Promise```返回时有两种状态```resolve```，```reject```，如何更优雅的实现promise的逻辑呢？


看下下面的

```
export function usePromise(promiseOrFunction, defaultValue) {
  const [state, setState] = React.useState({ value: defaultValue, error: null, isPending: true })

  React.useEffect(() => {
    const promise = (typeof promiseOrFunction === 'function')
      ? promiseOrFunction()
      : promiseOrFunction

    let isSubscribed = true
    promise
      .then(value => isSubscribed ? setState({ value, error: null, isPending: false }) : null)
      .catch(error => isSubscribed ? setState({ value: defaultValue, error: error, isPending: false }) : null)

    return () => (isSubscribed = false)
  }, [promiseOrFunction, defaultValue])

  const { value, error, isPending } = state
  return [value, error, isPending]
}
```

但是上面的实现有一个缺点就是promiseOrFunction类型为function时，无法为其传入参数，其实还不如直接收一个已经有的Promise，如[react-use(usePromise)](https://github.com/streamich/react-use/blob/master/src/usePromise.ts)的实现

```
import { useCallback } from 'react';
import useMountedState from './useMountedState';

export type UsePromise = () => <T>(promise: Promise<T>) => Promise<T>;

const usePromise: UsePromise = () => {
  const isMounted = useMountedState();
  return useCallback(
    (promise: Promise<any>) =>
      new Promise<any>((resolve, reject) => {
        const onValue = (value) => {
          isMounted() && resolve(value);
        };
        const onError = (error) => {
          isMounted() && reject(error);
        };
        promise.then(onValue, onError);
      }),
    []
  );
};

export default usePromise;
```
react-use 中的实现返回一个useCallback，将要执行的promise 作为一个执行时才传入的参数，在promise 状态更改之前进行劫持，看组件是否已经卸载来决定是否进行状态机的更改.这种实现更优雅，也能将promise的初始化交给使用时的上下文.

好了，本文到这就结束了，主要探讨下effect副作用在异步处理中遇到的一些坑以及解决办法，以及在promise上的一些扩展。要想深入了解hooks 还需要进一步了解hooks是如何在react 内部进行存储和调度的。

# [同步git地址](https://github.com/ddtf/blog)
# 参考文献


* [React state update on an unmounted component](https://www.debuggr.io/react-update-unmounted-component/)


* [Cancelling a Promise with React.useEffect](https://juliangaramendy.dev/use-promise-subscription/)


* [函数式组件与类组件有何不同？
](https://overreacted.io/zh-hans/how-are-function-components-different-from-classes/)
