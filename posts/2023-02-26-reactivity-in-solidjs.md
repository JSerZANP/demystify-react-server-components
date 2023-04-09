---
layout: post
title: "First look at fine-grained reactivity in Solid - SolidJS Source Code Walkthrough 1"
date: 2023-02-26 18:21:10 +0900
categories: React
image: /static/solidjs1.png
---

> This is a series of me trying to understand how Solid works internally. Watch [me explaining this on Youtube](https://www.youtube.com/watch?v=blUzNvx1sGA)

Solid claims to have good performance out from [fine-grained reactivity](https://www.solidjs.com/guides/reactivity), let's take a rough look at the basic idea of Solid.

This post is based on the [original post](https://dev.to/ryansolid/building-a-reactive-library-from-scratch-1i0p) from Solid's author [Ryan](https://twitter.com/RyanCarniato).

- [1. First of all, how does React "react"?](#1-first-of-all-how-does-react-react)
- [2. First look at the fine-grained reactivity in Solid](#2-first-look-at-the-fine-grained-reactivity-in-solid)
- [3. How does fine-grained reactivity work?](#3-how-does-fine-grained-reactivity-work)
  - [3.1 How to notify others when data changes](#31-how-to-notify-others-when-data-changes)
  - [3.2 How to subscribe the changes?](#32-how-to-subscribe-the-changes)
  - [3.3 How to update the DOM properly?](#33-how-to-update-the-dom-properly)
- [4. How to compile the code to avoid manual effect creation](#4-how-to-compile-the-code-to-avoid-manual-effect-creation)
- [5. Summary](#4-summary)

## 1. First of all, how does React "react"?

I've covered this in my youtube series [React Source Code Walkthrough](https://www.youtube.com/watch?v=0GM-1W7i9Tk) but simply put:

1. React holds an internal tree structure of the app (called fiber tree)
2. For a node (fiber), if its state changes, it will be marked as "needs to re-render" and a full re-render from root will be scheduled.
3. React re-renders the whole tree (well it skips the untouched subtree for obvious performance reason) and marks the nodes that needs to be inserted/updated/deleted by diffing the old and new one.
4. React reflects(called `commit) the changes to make into the DOM.

You can see that **React basically re-renders everything unless you manually try to improve it with useMemo() .etc**, and this is something Andrew Clark mentioned [in his tweet](https://twitter.com/acdlite/status/1628811935088013314) that React tries to hold on to, in order to offer developers a simpler mental model.

Honestly I kind of agree with him, but the hooks are indeed a pain in the ass.

## 2. First look at the fine-grained reactivity in Solid

Solid thinks that it is not quite performant to "re-render" everything, rather we are already able to run minimum tasks based on the automatic dependency tracking, which means without the internal fiber tree and no [reconciliation](https://reactjs.org/docs/reconciliation.html).

The idea is actually pretty straightforward, let's take a look at following code.

```jsx
import { render } from "solid-js/web";
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(1);
  const increment = () => setCount(count() + 1);

  return (
    <button type="button" onClick={increment}>{count()}</button>
  );
}

render(() => <Counter />, document.getElementById("app")!);
```

> Try out above code [here](https://playground.solidjs.com/anonymous/5e237842-3fc8-4b2f-b359-a8f535bbfc79).

When button is clicked, the text on the `<button>` is updated directly without fiber tree whatsoever in React, to put it in another way **the effect of updating the button text subscribes the changes of `count`**.

Above code looks similar to React code, with an important difference, notice that `count()` rather than `count` is put in JSX.

## 3. How does fine-grained reactivity work?

> You can find it out from [original post](https://dev.to/ryansolid/building-a-reactive-library-from-scratch-1i0p), below is my understanding and some effort to implement it.

There are (at least) 3 puzzles that needs to be cleared.

1. how to notify others when data changes
2. how to subscribe the changes
3. how to update the DOM properly

Let's figure them out step by step.

🚧🚧🚧🚧🚧🚧🚧🚧🐛🐛🐛🐛🐛🐛🐛🐛🐛

> Warning: Code below are just for demo purpose created by me, they are full of bugs.

> The full code is on my repo [unsolid](https://github.com/JSerZANP/unsolid)

🚧🚧🚧🚧🚧🚧🚧🚧🐛🐛🐛🐛🐛🐛🐛🐛🐛

### 3.1 how to notify others when data changes?

The one is kind of simple, the syntax of `createSignal()` already gives us a hint that we need to return a getter and setter, we can trigger callbacks in the setter.

```ts
const [count, setCount] = createSignal(1);
```

Here is some skeleton code.

```ts
function createSingal(initialValue) {
  let value = initialValue;

  const getter = () => {
    return value;
  };

  const setter = (newValue) => {
    if (value !== newValue) {
      value = newValue;
      // TODO: notify
    }
  };

  return [getter, setter];
}
```

## 3.2 How to subscribe the changes?

From the syntax we can see that the subscription is done when `getter` is called.

This is reasonable and obvious, **we only need to notify the change of the value where the value is actually used(or we can say it is dependent upon)**.

So we can alter the getter a little bit to let createSignal hold a set of subscriptions.

```ts
function createSingal(initialValue) {
  let value = initialValue;

  const subscriptions = new Set();

  const getter = () => {
    // TODO where does the callback come from?
    subscriptions.add(callback);
    return value;
  };

  const setter = (newValue) => {
    if (value !== newValue) {
      value = newValue;
      for (const subscription of subscriptions) {
        subscription();
      }
    }
  };

  return [getter, setter];
}
```

One thing to notice is that we cannot just set up subscription every time `getter` is called, since there are calls that are not required to be reactive.

```ts
function Component() {
  const [count, setCount] = createSignal(1)
  const times2 = count() * 2
  ...
}
```

For example, above getter call is purely to get the initial value, we should not suppose it has subscription unless it is used during the render. By which we mean, we need to **explicitly declare that we want reactivity**.

One of the API provided by Solid for this is `createEffect()`, which means to run side effect when dependency changes.

The argument of `createEffect()` is the callback, these info to the getter is something not directly passed, we can use a global variable to hold them, with the name - `context`.

```ts
let context = null;

function createSignal(initialValue) {
  let value = initialValue;

  const subscriptions = new Set();

  const getter = () => {
    // the context is where the getter is called
    const callback = context;
    if (callback != null) {
      subscriptions.add(callback);
    }
    return value;
  };

  const setter = (newValue) => {
    if (value !== newValue) {
      value = newValue;
      for (const subscription of subscriptions) {
        subscription();
      }
    }
  };

  return [getter, setter];
}

function createEffect(callback) {
  // when this function is called, we put the callback into context
  // when it is done, we remove it from the context
  let prevContext = context;
  context = callback;
  // execute
  callback();
  context = prevContext;
}
```

Now let's give it a try at above code about reactivity.

```ts
function Counter() {
  const [count, setCount] = createSignal(1);
  setInterval(() => setCount(count() + 1), 1000);
  createEffect(() => {
    console.log("count updated:", count());
  });
}
Counter();
```

> Try it out [here](https://stackblitz.com/edit/web-platform-jgozpc?file=script.js)

We can see that it works pretty well - it prints incrementing number in the console every second.

### 3.3 How to update the DOM properly?

The initial render is easy we can just create the DOM node and return.

```ts
function Counter() {
  const [count, setCount] = createSignal(1);
  const button = document.createElement("button");
  const increment = () => setCount(count() + 1);
  button.onclick = increment;
  return button;
}
```

For the update, we can follow the same pattern and add the effect.

```ts
function Counter() {
  const [count, setCount] = createSignal(1);
  const button = document.createElement("button");
  const increment = () => setCount(count() + 1);
  button.onclick = increment;
  createEffect(() => (button.textContent = `${count()}`));
  return button;
}
```

> Try it [here](https://stackblitz.com/edit/web-platform-uajdea?file=script.js), click the button to see it increments.

This means that every time count is updated, the button text is updated as well.

This is basically what fine-grained reactivity means - when DOM is first created, the dependencies are collected and later changes only trigger minimum updates.

But we don't want to manually add the effect every time, we don't have this in the Solid example as well.

Well this is because the Solid compiler automatically adds them for us.

## 4. How to compile the code to avoid manual effect creation

```jsx
<button>{count()}</button>
```

From the JSX syntax, `count()` is used as children of `button` node, it seems possible for us to set up the effect automatically based on such information.

But for JSX in the React sense, above code is compiled to something like below

```js
{
  type: 'button',
  props: {
    children: 1
  }
}
```

This is normal jsx in React, the `count()` will be executed during the element creation, so it would be some primitive value here, (`1` here as an example).

This clearly is not gonna work, because `count()` is executed to early that we lose the context information for `button`. We want to delay the evaluation `count()` to the creation of `button`.

We can solve this by wrapping JSX expression (things inside of`{...}`) into a function.

```js
{
  type: 'button',
  props: {
    children: () => count()
  }
}
```

Also we need some help from runtime, because we don't know exactly what is returned in `count()` from compiler, it could be some more JSX elements.

So in all what we want to do is to transform the code into something as below

```jsx
// from
function Counter() {
  const [count, setCount] = createSignal(1);
  const increment = () => setCount(count() + 1);

  return (
    <button type="button" onClick={increment}>
      {count()}
    </button>
  );
}

// to
function Counter() {
  const [count, setCount] = createSignal(1);
  const increment = () => setCount(count() + 1);
  return (() => {
    const button = document.createElement("button");
    button.onclick = increment;
    insert(() => count(), button)
  })();
}


function insert(element, container) {
  // if it is function, recursively insert it until meeting intrinsic HTML elements
  // if it is intrinsic elements, create them
  // if it is primitive values, we can treat them as text node and set up effects after creation.
  ...
}
```

OK to be honest it took me some time to figure things out with the help of [AST Explorer](https://astexplorer.net/#/gist/0a1f18dca96efeef93e04e51a76d9f64/87f2da320f13ea62c2448c2f1d4b7733f585dfcd)

Eventually I managed to create the compiler as below, the code is just tedious AST creations nothing fancy.

> The code is on [github](https://github.com/JSerZANP/unsolid/blob/main/scripts/compile.js)

```js
import generator from "@babel/generator";
import { parse } from "@babel/parser";
import template from "@babel/template";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import fs from "fs";

const tplIIFE = template.default(`
  (() => {
    %%body%%
  })()
`);

const tplCreateChild = template.default(`
  const %%identifier%% = %%child%%;
`);

const tplCreateNode = template.default(`
  const node = document.createElement(%%tagName%%);
  %%children%%;
  return node;
`);

const tplInsertExpression = template.default(`
  insert(() => %%expression%%, node);
`);

const tplCreateCustomElement = template.default(`
  %%node%%(%%props%%)
`);

const tplAppendChild = template.default(`
  node.appendChild(%%child%%);
`);

const tplCreateTextNode = template.default(`
  const %%identifier%%  = document.createTextNode(%%expression%%);
`);

const tplSetUpAttribute = template.default(`
  node[%%name%%] = %%expression%%
`);

// Our goal is to transform JSX into function calls
// in which special function call `insert()` is automatically inserted
// so that the JSXExpression like `{count()}` could be reactive.
const transformJSXElement = (element) => {
  const tagName = element.openingElement.name.name;
  // for intrinsic elements we can just create DOM nodes
  // but for custom components we need to run it first to know what it is
  // so we handle them differently
  if (tagName[0].toLowerCase() === tagName[0]) {
    return transformJSXIntrinsicElement(element);
  } else {
    return transformJSXCustomElement(element);
  }
};

// for custom components
// we return something similar to the default JSX internals in React
// e.g. <T>...</T> => T({children:...})
const transformJSXCustomElement = (element) => {
  const tagName = element.openingElement.name.name;
  const attributes = element.openingElement.attributes ?? [];
  const children = element.children != null ? [...element.children] : [];
  // since this is custom component we don't know how to create DOM nodes
  // so just recursively transform the children and keep the rest untouched
  const transformedChildren = children.flatMap((child) => {
    // for JSXElement, transform and append
    if (child.type === "JSXElement") {
      const expression = transformJSXElement(child).expression;
      return [expression];
    } else if (child.type === "JSXExpressionContainer") {
      return [child.expression];
    } else if (child.type === "JSXText") {
      return [t.stringLiteral(child.value)];
    } else {
      throw new Error("TODO: unsupported jsx children type:" + child.type);
    }
  });

  return tplCreateCustomElement({
    node: t.identifier(tagName),
    props: t.objectExpression([
      ...attributes.map((attribute) =>
        t.objectProperty(
          t.stringLiteral(attribute.name.name),
          attribute.value.expression
        )
      ),
      t.objectProperty(
        t.stringLiteral("children"),
        t.arrayExpression(transformedChildren)
      ),
    ]),
  });
};

// for intrinsic elements, we just create the DOM node
// use `insert()` for expression
// <p><button>{count()}</button></p>
// ↓
// (() => {
//  const node = document.createElement('p')
//  const node1 = (() => {
//     const node = document.createElement('button')
//     insert(() => count(), node)
//     return node
//  })()
//  node.appendChild(node1)
//  return node
// })()
const transformJSXIntrinsicElement = (element) => {
  let nodeCount = 0;

  const tagName = element.openingElement.name.name;
  // children could be string, or some other jsxlement
  const children = element.children != null ? [...element.children] : [];
  const transformedChildren = children.flatMap((child) => {
    nodeCount += 1;
    if (child.type === "JSXElement") {
      const expression = transformJSXElement(child).expression;
      const createChild = tplCreateChild({
        identifier: `node${nodeCount}`,
        child: expression,
      });
      const appendChild = tplAppendChild({
        child: t.identifier(`node${nodeCount}`),
      });
      return [createChild, appendChild];
    } else if (child.type === "JSXExpressionContainer") {
      return [
        tplInsertExpression({
          expression: child.expression,
        }),
      ];
    } else if (child.type === "JSXText") {
      return [
        tplCreateTextNode({
          identifier: `node${nodeCount}`,
          expression: t.stringLiteral(child.value),
        }),
        tplAppendChild({
          child: t.identifier(`node${nodeCount}`),
        }),
      ];
    } else {
      throw new Error("TODO: unsupported jsx children type: " + child.type);
    }
  });

  // attributes set up
  const attributes = element.openingElement.attributes ?? [];
  const updateAttributes = attributes.map((attribute) =>
    tplSetUpAttribute({
      name: t.stringLiteral(attribute.name.name.toLowerCase()),
      expression: attribute.value.expression ?? attribute.value,
    })
  );
  return tplIIFE({
    body: tplCreateNode({
      tagName: t.stringLiteral(tagName),
      children: [...updateAttributes, ...transformedChildren],
    }),
  });
};

function compile(code) {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  traverse.default(ast, {
    JSXElement: function (path) {
      path.replaceWith(transformJSXElement(path.node));
    },
  });

  const imports = `
import { insert } from '../lib/dom';
  `;
  return imports + generator.default(ast).code;
}

function readFiles() {
  return new Promise((resolve) => {
    fs.readdir("./demo", (err, files) => {
      resolve(files);
    });
  });
}

async function start() {
  const files = await readFiles();
  for (const file of files) {
    const code = fs.readFileSync("demo/" + file, "utf8");
    fs.writeFileSync("built/" + file, compile(code));
  }
}

start();
```

One part of the code that needs to be pointed out is:

```js
const tplInsertExpression = template.default(`
  insert(() => %%expression%%, node);
`);
...
if (child.type === "JSXExpressionContainer") {
  return [
    tplInsertExpression({
      expression: child.expression,
    }),
  ];
}
```

This basically transform `{count()}` into `insert(() => count(), node)`. `insert()` from runtime code `dom.js` will take it from here.

Try out the compiler [here](https://stackblitz.com/edit/vite-bdttj6?file=index.html,src%2Fmain.js,dist%2Fmain.js), you can edit the JSX and run `npm run compile` to see how it gets built under `dist/`.

Now for the runtime code - `dom.js`, I doubt it is something like what Solid does, but yeah, this is for demo purpose so I assume the nodes are stable so that I can use position to target the previous rendered node during updating.

```js
import { createEffect } from "./reactivity";

export function render(renderer, container) {
  // over-simplified render function
  insert(renderer(), container);
}

/** the basic operation to create the DOM tree
 * element could be anything, see the if/else
 *
 * One convention is that if **a function is passed, then we make it reactive**
 */
export function insert(element, container, position) {
  const type = typeof element;

  let currentPosition = null;

  if (Array.isArray(element)) {
    element.forEach((el) => insert(el, container, position));
  } else if (element == null || type === "string" || type === "number") {
    // use text node for primitive values
    // notice that we use an empty textnode even if element is null/undefined
    // this is to keep the position stable
    // Well this assumption doesn't hold I guess, but this is for demo purpose so ....
    const textNode = document.createTextNode(element);
    if (position == null) {
      container.append(textNode);
    } else {
      container.childNodes[position].replaceWith(textNode);
    }
    return container.childNodes.length - 1;
  } else if (type === "function") {
    // if a function is passed, it means that this needs to be reactive
    createEffect(() => {
      if (currentPosition == null) {
        currentPosition = insert(element(), container, position);
      } else {
        insert(element(), container, currentPosition);
      }
    });
  } else if (element instanceof HTMLElement) {
    if (position == null) {
      container.append(element);
    } else {
      container.childNodes[position].replaceWith(element);
    }
  }
}
```

You can try out the final demo on [stackblitz](https://stackblitz.com/edit/vite-bdttj6?file=index.html,src%2Fmain.js,dist%2Fmain.js) or from my repo [unsolid](https://github.com/JSerZANP/unsolid).

![](https://jser.dev/static/unsolid-demo1.gif)

## 4. Summary

This is the first episode of me figuring out the Solid source code but actually we haven't touched any source code yet. 😭😭

But we managed to create some working code (though very buggy) out of the basic Solid syntax to have a rough image about what it means by fine-grained reactivity.

There are still many problems to be addressed though, hang on and stay tuned for next episode.

Hope it helps.
