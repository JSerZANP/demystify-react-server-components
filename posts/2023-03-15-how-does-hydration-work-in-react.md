---
layout: post
title: "How basic hydration works internally in React? - React Source Code Walkthrough 27"
date: 2023-03-17 18:21:10 +0900
categories: React
image: /static/hydration.png
---

> ⚠️ This post was created in 2023, by the time you read it, the implementation inside React might have already changed.

> This is part of [React Source Code Walkthrough](https://jser.dev/series/react-source-code-walkthrough.html), watch [the episode for this post](https://www.youtube.com/watch?v=1HPYd9nm18w).

- [1. Let’s recall how the DOM tree is constructed in the first render (mount)](#1-lets-recall-how-the-dom-tree-is-constructed-in-the-first-render-mount)
- [2. Ok, now what is hydration ?](#2-ok-now-what-is-hydration-)
- [3. How does hydration works in React?](#3-how-does-hydration-works-in-react)
  - [3.1. hydration in beginWork()](#31-hydration-in-beginwork)
  - [3.2. hydration in completeWork()](#32-hydration-in-completework)
    - [3.2.1 prepareToHydrateHostInstance() does the actual hydration](#321-preparetohydratehostinstance-does-the-actual-hydration)
    - [3.2.2 Cursor in existing DOM is updated in popHydrationState().](#322-cursor-in-existing-dom-is-updated-in-pophydrationstate)
- [4. handling of mismatched nodes.](#4-handling-of-mismatched-nodes)
- [5. Summary](#5-summary)

While everybody is talking about React Server Component, I have to do one episode before I can jump into that, so today let's take a look at hydration.

## 1. Let's recall how the DOM tree is constructed in the first render (mount)

I've talked about how React does [the initial mount](https://www.youtube.com/watch?v=EakHciGG3SM), here are some key takeaways.

1. Each fiber node which needs a backing DOM node has a property to the DOM node under the name - `stateNode`
2. React recursively process each fiber node with 2 step - `beginWork()` and `completeWork()`, in a DFS manner. This is explained in my blog post [how does React traverse Fiber tree](https://jser.dev/react/2022/01/16/fiber-traversal-in-react.html). It could be summarized into 4 steps: `beginWork()` on self → `beginWork()` on child → `completeWork()` on self → `beginWork()` on sibling / `completeWork()` on parent (return)
3. in `completeWork()` phase, React creates the real DOM node, set the `stateNode`, and append the created children into it, below is the [code](https://github.com/facebook/react/blob/62e6c4612ec704cf07c99b318bc8f26d3ec3f588/packages/react-reconciler/src/ReactFiberCompleteWork.js#L1018-L1091).

```js
function completeWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes
): Fiber | null {
  switch (workInProgress.tag) {
    case HostComponent: {
      if (wasHydrated) {
        ...
      } else {
        const rootContainerInstance = getRootHostContainer();
        const instance = createInstance(
          type,
          newProps,
          rootContainerInstance,
          currentHostContext,
          workInProgress
        );
        appendAllChildren(instance, workInProgress, false, false);
        workInProgress.stateNode = instance;
        ...
      }
    }
  }
}
```

`HostComponent` means native components of DOM, we can clearly see that it

1. DOM is created by `createInstance()`
2. children are appended by `appendAllChildren()`.

> Notice there is a if branch of `wasHydrate`, which seems to be related to hydration - our topic today, we'll come back to it soon.

With above step, React translates a fiber tree into a DOM tree.

![](https://jser.dev/static/fiber-dom.png)

Notice that there are fiber nodes like Context which doesn't need a backing DOM node, how does `appendAllChildren()` knows which children to append ?

Well, from the [code](https://github.com/facebook/react/blob/62e6c4612ec704cf07c99b318bc8f26d3ec3f588/packages/react-reconciler/src/ReactFiberCompleteWork.js#L207) we can see that it again traverse the fiber tree to find the top-level nodes, simple as that.

## 2. Ok, now what is hydration ?

> **hydration** - the process of causing something to absorb water.

I have to say that the naming is awesome, it vividly depicts what actually happens. Following [the official guide of hydrateRoot()](https://beta.reactjs.org/reference/react-dom/client/hydrateRoot), we can easily see that **hydration means render React components based on pre-rendered DOM**. This makes SSR(Server Side Rendering) possible. Server can output HTML that is non-interactive(dehydrated), then we can hydrate it on the client-side so the app becomes interactive.

Let's take a look a an example, here is a [demo of normal render](https://jser.dev/demos/react/hydration/normal-render.html) without hydration.

```html
<div id="container"><button>0</button></div>
<script type="text/babel">
  const useState = React.useState;

  function App() {
    const [state, setState] = useState(0);
    return (
      <button onClick={() => setState((state) => state + 1)}>{state}</button>
    );
  }

  const rootElement = document.getElementById("container");
  const originalButton = rootElement.firstChild;
  ReactDOM.createRoot(rootElement).render(<App />);
  setTimeout(
    () =>
      console.assert(
        originalButton === rootElement.firstChild,
        "DOM is reused?"
      ),
    0
  );
</script>
```

Notice that the button is already inside the container, and we have an assertion to see if the `<button>` DOM node is reused. Open the console in the demo page, we can see an error which shows that it is not reused, meaning the DOM is discarded.

![](https://jser.dev/static/normal-render-1.png)

Now let's switch to `hydrateRoot()`.

```html
<div id="container"><button>0</button></div>
<script type="text/babel">
  const useState = React.useState;
  const hydrateRoot = ReactDOM.hydrateRoot;

  function App() {
    const [state, setState] = useState(0);
    return (
      <button onClick={() => setState((state) => state + 1)}>{state}</button>
    );
  }

  const rootElement = document.getElementById("container");
  const originalButton = rootElement.firstChild;
  hydrateRoot(rootElement, <App />);
  setTimeout(
    () =>
      console.assert(
        originalButton === rootElement.firstChild,
        "DOM is reused"
      ),
    0
  );
</script>
```

Open the [demo page](https://jser.dev/demos/react/hydration/basic-hydrate.html) and we don't see the error again, meaning the pre-existing DOM is reused.

This is hydration - trying to reuse the pre-exisiting DOM nodes.

## 3. How does hydration works in React?

The idea is quite straightforward, we already have a process of creating the DOM tree, and also an pre-existing DOM tree, all we need is:

**keeping a cursor on the pre-existing DOM tree, then compare against it every time a new DOM node needs to be created, then use it directly as `stateNode` without creating new**.

As we mentioned above, since every fiber node is traversed twice - `beginWork()` and `completeWork()`, which means `entering` and `leaving`, we also need to keep the cursor in the pre-existing DOM tree synced.

### 3.1. hydration in `beginWork()`

And we can easily target this line of code in `updateHostComponent()` ([code](https://github.com/facebook/react/blob/8e2bde6f2751aa6335f3cef488c05c3ea08e074a/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1558-L1591)).

```js

function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {
  ...
  switch (workInProgress.tag) {
    case HostComponent:
      return updateHostComponent(current, workInProgress, renderLanes);
  }
  ...
}

function updateHostComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes
) {
  pushHostContext(workInProgress);

  if (current === null) {
    tryToClaimNextHydratableInstance(workInProgress);
  }
  ....
  return workInProgress.child;
}
```

HostComponent means it is client native component - DOM. As the function name implies, `tryToClaimNextHydratableInstance()` ([code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberHydrationContext.js))tries to **reuse next pre-existing DOM node**.

```js
function tryToClaimNextHydratableInstance(fiber: Fiber): void {
  if (!isHydrating) {
    return;
  }
  if (enableFloat) {
    if (!isHydratableType(fiber.type, fiber.pendingProps)) {
      // This fiber never hydrates from the DOM and always does an insert
      fiber.flags = (fiber.flags & ~Hydrating) | Placement;
      isHydrating = false;
      hydrationParentFiber = fiber;
      return;
    }
  }
  const initialInstance = nextHydratableInstance;
  if (rootOrSingletonContext) {
    // We may need to skip past certain nodes in these contexts
    advanceToFirstAttemptableInstance(fiber);
  }
  const nextInstance = nextHydratableInstance;
  if (!nextInstance) {
    if (shouldClientRenderOnMismatch(fiber)) {
      warnNonhydratedInstance((hydrationParentFiber: any), fiber);
      throwOnHydrationMismatch(fiber);
    }
    // Nothing to hydrate. Make it an insertion.
    insertNonHydratedInstance((hydrationParentFiber: any), fiber);
    isHydrating = false;
    hydrationParentFiber = fiber;
    nextHydratableInstance = initialInstance;
    return;
  }
  const firstAttemptedInstance = nextInstance;
  if (!tryHydrateInstance(fiber, nextInstance)) {
    if (shouldClientRenderOnMismatch(fiber)) {
      warnNonhydratedInstance((hydrationParentFiber: any), fiber);
      throwOnHydrationMismatch(fiber);
    }
    // If we can't hydrate this instance let's try the next one.
    // We use this as a heuristic. It's based on intuition and not data so it
    // might be flawed or unnecessary.
    nextHydratableInstance = getNextHydratableSibling(nextInstance);
    const prevHydrationParentFiber: Fiber = (hydrationParentFiber: any);
    if (rootOrSingletonContext) {
      // We may need to skip past certain nodes in these contexts
      advanceToFirstAttemptableInstance(fiber);
    }
    if (
      !nextHydratableInstance ||
      !tryHydrateInstance(fiber, nextHydratableInstance)
    ) {
      // Nothing to hydrate. Make it an insertion.
      insertNonHydratedInstance((hydrationParentFiber: any), fiber);
      isHydrating = false;
      hydrationParentFiber = fiber;
      nextHydratableInstance = initialInstance;
      return;
    }
    // We matched the next one, we'll now assume that the first one was
    // superfluous and we'll delete it. Since we can't eagerly delete it
    // we'll have to schedule a deletion. To do that, this node needs a dummy
    // fiber associated with it.
    deleteHydratableInstance(prevHydrationParentFiber, firstAttemptedInstance);
  }
}
```

`tryHydrateInstance()` compares against the pre-existing DOM and set up `stateNode`.

```js
function tryHydrateInstance(fiber: Fiber, nextInstance: any) {
  // fiber is a HostComponent Fiber
  const instance = canHydrateInstance(
    nextInstance,
    fiber.type,
    fiber.pendingProps
  );
  if (instance !== null) {
    fiber.stateNode = (instance: Instance);
    hydrationParentFiber = fiber;
    nextHydratableInstance = getFirstHydratableChild(instance);
    rootOrSingletonContext = false;
    return true;
  }
  return false;
}

export function canHydrateInstance(
  instance: HydratableInstance,
  type: string,
  props: Props
): null | Instance {
  if (
    instance.nodeType !== ELEMENT_NODE ||
    instance.nodeName.toLowerCase() !== type.toLowerCase()
  ) {
    return null;
  } else {
    return ((instance: any): Instance);
  }
}
```

Above [code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberHydrationContext.js#L347) is pretty simple.

Pay attention to the last few lines

1. `fiber.stateNode = (instance: Instance);` `stateNode` is set at this stage if possible
2. `nextHydratableInstance = getFirstHydratableChild(instance);` the cursor in the pre-existing DOM is moved to its child. This holds, again, as explained in [how does React traverse Fiber tree](https://jser.dev/react/2022/01/16/fiber-traversal-in-react.html).

### 3.2. hydration in `completeWork()`

At the beginning of this post, we omitted some code in `completeWork()` ([code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberCompleteWork.js#L819)), let's see more code.

```js
function completeWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {
   switch (workInProgress.tag) {
    case HostComponent: {
      ...
      if (current !== null && workInProgress.stateNode != null) {
       ...
      } else {
        ...
        const wasHydrated = popHydrationState(workInProgress);
        if (wasHydrated) {
          if (
            prepareToHydrateHostInstance(workInProgress, currentHostContext)
          ) {
            // If changes to the hydrated node need to be applied at the
            // commit-phase we mark this as such.
            markUpdate(workInProgress);
          }
        } else {
          const rootContainerInstance = getRootHostContainer();
          const instance = createInstance(
            type,
            newProps,
            rootContainerInstance,
            currentHostContext,
            workInProgress,
          );
          appendAllChildren(instance, workInProgress, false, false);
          workInProgress.stateNode = instance;
        }
      }
      return null;
    }
   }
  ...
}
```

If the fiber was successfully hydrated `wasHydrated`, `prepareToHydrateHostInstance()` is called, then `markUpdate()` will update the flags of the fiber node, which in commit phase will have the DOM node updated.

#### 3.2.1 `prepareToHydrateHostInstance()` does the actual hydration

In `prepareToHydrateHostInstance()` is where the hydration is actually done, by `hydrateInstance()`.

```js
function prepareToHydrateHostInstance(
  fiber: Fiber,
  hostContext: HostContext
): boolean {
  if (!supportsHydration) {
    throw new Error(
      "Expected prepareToHydrateHostInstance() to never be called. " +
        "This error is likely caused by a bug in React. Please file an issue."
    );
  }

  const instance: Instance = fiber.stateNode;
  const shouldWarnIfMismatchDev = !didSuspendOrErrorDEV;
  const updatePayload = hydrateInstance(
    instance,
    fiber.type,
    fiber.memoizedProps,
    hostContext,
    fiber,
    shouldWarnIfMismatchDev
  );
  // TODO: Type this specific to this type of component.
  fiber.updateQueue = (updatePayload: any);
  // If the update payload indicates that there is a change or if there
  // is a new ref we mark this as an update.
  if (updatePayload !== null) {
    return true;
  }
  return false;
}
```

`hydrateInstance()` > `diffHydratedProperties()` handles the updates of properties, see [the code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-dom-bindings/src/client/ReactDOMComponent.js#L888).

#### 3.2.2 Cursor in existing DOM is updated in `popHydrationState()`.

```js
function popHydrationState(fiber: Fiber): boolean {
  ...
  popToNextHostParent(fiber);
  if (fiber.tag === SuspenseComponent) {
    nextHydratableInstance = skipPastDehydratedSuspenseInstance(fiber);
  } else {
    nextHydratableInstance = hydrationParentFiber
      ? getNextHydratableSibling(fiber.stateNode)
      : null;
  }
  return true;
}
```

[popToNextHostParent()](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberHydrationContext.js#L813) looks up and set `hydrationParentFiber` to the nearest host component along the path.

## 4. handling of mismatched nodes.

In `tryToClaimNextHydratableInstance()`, there are a few lines of code handling such case.

```js
const nextInstance = nextHydratableInstance;
if (!nextInstance) {
  if (shouldClientRenderOnMismatch(fiber)) {
    warnNonhydratedInstance((hydrationParentFiber: any), fiber);
    throwOnHydrationMismatch(fiber);
  }
  // Nothing to hydrate. Make it an insertion.
  insertNonHydratedInstance((hydrationParentFiber: any), fiber);
  isHydrating = false;
  hydrationParentFiber = fiber;
  nextHydratableInstance = initialInstance;
  return;
}
```

First example as above is when we have unmatched node, after `shouldClientRenderOnMismatch()` check, warning is out and error is thrown.

![](https://jser.dev/static/hydration-mismatch.png)

> note that there is a `shouldClientRenderOnMismatch()` check, which seems to be related to Suspense, which we'll cover in the future.

But we can see it actually get rendered in the end, that's because React tries to recover for this kind of error. [code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1087-L1094)

```js
if (exitStatus === RootErrored) {
  // If something threw an error, try rendering one more time. We'll
  // render synchronously to block concurrent data mutations, and we'll
  // includes all pending updates are included. If it still fails after
  // the second attempt, we'll give up and commit the resulting tree.
  const originallyAttemptedLanes = lanes;
  const errorRetryLanes = getLanesToRetrySynchronouslyOnError(
    root,
    originallyAttemptedLanes
  );
  if (errorRetryLanes !== NoLanes) {
    lanes = errorRetryLanes;
    exitStatus = recoverFromConcurrentError(
      root,
      originallyAttemptedLanes,
      errorRetryLanes
    );
  }
}
```

```js
function recoverFromConcurrentError(
  root: FiberRoot,
  originallyAttemptedLanes: Lanes,
  errorRetryLanes: Lanes,
) {
  // If an error occurred during hydration, discard server response and fall
  // back to client side render.
  ...
}
```

## 5. Summary

Overall with the knowledge of how React traverse through the fiber tree, the basic hydration is not difficult to understand.

First of all, fiber nodes that have backing DOM nodes have `stateNode` set to the real DOM nodes, for the purpose of hydration, we want to reuse the pre-existing DOM node rather than creating new ones.

We simply keeps a cursor at pre-existing DOM, and move it around the DOM tree while we walk around the fiber tree, instead of creating new DOM node we try to use existing DOM node if it matches, set up `stateNode`, then mark the fiber as needed to update.

Hydration is best effort, React falls back to client-side rendering if mismatch happens, of course this heavily affects the rendering performance.

There are still a lot of stuff not mentioned here, for example, how Suspense copes with hydration? I'll leave it to another episode, stay tuned.
