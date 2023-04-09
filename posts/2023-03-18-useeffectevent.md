---
layout: post
title: "How does useEffectEvent() work internally in React? - React Source Code Walkthrough 28"
date: 2023-03-18 18:21:10 +0900
categories: React
image: /static/useeffectevent.png
---

> ⚠️ This post was created in 2023, by the time you read it, the implementation inside React might have already changed.

> This is part of [React Source Code Walkthrough](https://jser.dev/series/react-source-code-walkthrough.html)

- [1. About Effect Event](#1-about-effect-event)
- [2. How does useEffectEvent() work internally?](#2-how-does-useeffectevent-works-internally)
  - [2.1 mountEvent()](#21-mountevent)
  - [2.2 updateEvent()](#22-updateevent)
  - [2.3 updates happen in committing](#23-updates-happen-in-committing)
  - [2.4. it is NOT stable.](#24-it-is-not-stable)
- [3. Summary](#3-summary)

In [An alternative(?) to React.useEvent()]({% post_url 2022-05-07-alternatives-to-useevent %}), I've briefly looked at the proposal of `useEvent()`, now it is renamed to `useEffectEvent()`, let's dive into the source code to see what it does under the hood.

## 1. About Effect Event

From [the official doc](https://react.dev/learn/separating-events-from-effects#declaring-an-effect-event), Effect Event is part of Effect logic but behaves more like an event handler, **it is not reactive**.

This is the first time I saw **reactive** in the React doc, I got a better understanding after [First look at fine-grained reactivity in Solid]({% post_url 2023-02-26-reactivity-in-solidjs %}).

To be short, the problem `useEffectEvent()` tries to solve is the caveat of hooks.

1. because of what `useEffect()` tries to achieve, we have to put non-stable values in to dependency array, so the callback could use the latest value
2. but items in dependency array are reactive, meaning changes of them trigger effect callback. (For how `useEffect()` works, refer to [The lifecycle of effect hooks in React]({% post_url 2022-01-17-lifecycle-of-effect-hook %}))

Dependency array has these 2 effects, and we cannot seperate them. The example listed on the [the official doc](https://react.dev/learn/separating-events-from-effects#declaring-an-effect-event) is a nice one to understand the dilemma.

One way of solving it would be stopping reactivity inside of the effect callback, something like this

```js
useEffect(() => {
  if (some condition is true) {
    return // do no run
  }
}, [a, b, c])
```

But this is very easy to mess up, another way is stopping the reactivity by stablize the value

```js
const refC = useRef(c)
// have to update refC inside useLayoutEffect
useEffect(() => {
  const c = refC.current
  ...
}, [a, b])
```

Guess `useEffectEvent()` is more like the second approach, but different in the implementation, especially how to update it. Let's dive into it.

## 2. How does useEffectEvent() works internally?

Just like how we explained [how useRef() works internally]({% post_url 2021-12-05-how-does-useRef-work %}), hooks have 2 internal implementation, one for initial render(mount), one for update, let's take a look at both of them.

### 2.1 mountEvent()

[code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberHooks.js#L2086)

```js
function mountEvent<Args, Return, F: (...Array<Args>) => Return>(
  callback: F
): F {
  const hook = mountWorkInProgressHook();
  const ref = { impl: callback };
  hook.memoizedState = ref;
  // $FlowIgnore[incompatible-return]
  return function eventFn() {
    if (isInvalidExecutionContextForEventFunction()) {
      throw new Error(
        "A function wrapped in useEffectEvent can't be called during rendering."
      );
    }
    return ref.impl.apply(undefined, arguments);
  };
}
```

`mountEvent()` is quite simple.

1. create a new hook by `mountWorkInProgressHook()`
2. the hook state is just the ref object which holds the callback.
3. it returns the closure which executes the callback without `this`, which is almost the same as returning the callback itself.

### 2.2 updateEvent()

This relates to why we mentioned that we need `useLayoutEffect()` if we want to implement it by ourself,

for example

```js
const event = useEvent(props.callback);
```

If the callback from props changes, we need to update the internal callback inside the ref object as well.

[code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberHooks.js#L2103)

```js
function updateEvent<Args, Return, F: (...Array<Args>) => Return>(
  callback: F
): F {
  const hook = updateWorkInProgressHook();
  const ref = hook.memoizedState;
  useEffectEventImpl({ ref, nextImpl: callback });
  // $FlowIgnore[incompatible-return]
  return function eventFn() {
    if (isInvalidExecutionContextForEventFunction()) {
      throw new Error(
        "A function wrapped in useEffectEvent can't be called during rendering."
      );
    }
    return ref.impl.apply(undefined, arguments);
  };
}
```

The return value is the same, so the update actually lies in `useEffectEventImpl()` ([code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberHooks.js#L2066)).

```js
function useEffectEventImpl<Args, Return, F: (...Array<Args>) => Return>(
  payload: EventFunctionPayload<Args, Return, F>
) {
  currentlyRenderingFiber.flags |= UpdateEffect;
  let componentUpdateQueue: null | FunctionComponentUpdateQueue =
    (currentlyRenderingFiber.updateQueue: any);
  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber.updateQueue = (componentUpdateQueue: any);
    componentUpdateQueue.events = [payload];
  } else {
    const events = componentUpdateQueue.events;
    if (events === null) {
      componentUpdateQueue.events = [payload];
    } else {
      events.push(payload);
    }
  }
}
```

The code looks complex, but actually not, it does only one thing - **push the update task in to updateQueue.events, which is on the current rendering fiber node**.

Why we do this? This is because we might have multiple `useEffectEvent()` call, thus there might be multiple callback updates. By using an events array on the fiber, we can batch run the updates.

Why we want to batch update the callbacks ? I'm not sure though, if the callback is used in rendering, it might cause inconsistent result because in concurrent mode the rendering might be interrupted. But for effect event, `isInvalidExecutionContextForEventFunction()` is already guarding it from being used in rendering.

Guess they just want to make sure the update is in commiting phase to avoid unexpected issues.

> If you know why , please let me know

### 2.3 updates happen in committing

[code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberCommitWork.js#L719)

```js
function commitUseEffectEventMount(finishedWork: Fiber) {
  const updateQueue: FunctionComponentUpdateQueue | null =
    (finishedWork.updateQueue: any);
  const eventPayloads = updateQueue !== null ? updateQueue.events : null;
  if (eventPayloads !== null) {
    for (let ii = 0; ii < eventPayloads.length; ii++) {
      const { ref, nextImpl } = eventPayloads[ii];
      ref.impl = nextImpl;
    }
  }
}
```

This is where events array is used, we can see that it just update the ref object with new callback, nothing fancy.

And this function is called inside `commitBeforeMutationEffectsOnFiber()` [code](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberCommitWork.js#L438).

```js
function commitBeforeMutationEffectsOnFiber(finishedWork: Fiber) {
  const current = finishedWork.alternate;
  const flags = finishedWork.flags;
  ...
  switch (finishedWork.tag) {
    case FunctionComponent: {
      if (enableUseEffectEventHook) {
        if ((flags & Update) !== NoFlags) {
          commitUseEffectEventMount(finishedWork);
        }
      }
      break;
    }
    ...
  }
}
```

Digging up, it is run inside `commitBeforeMutationEffects()`, from [commitRoot()](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2868-L2912), we can see it is before `useLayoutEffect()`.

### 2.4. it is NOT stable.

From `updateEvent()` we can see it returns a new closure on every render, so it is not stable, it is even covered in the [test case](https://github.com/facebook/react/blob/8fa41ffa275cae4895b650b0c3b5e8acdbb5055d/packages/react-reconciler/src/__tests__/useEffectEvent-test.js#L609-L629).

```jsx
it("doesn't provide a stable identity", async () => {
  function Counter({ shouldRender, value }) {
    const onClick = useEffectEvent(() => {
      Scheduler.log(
        "onClick, shouldRender=" + shouldRender + ", value=" + value
      );
    });

    // onClick doesn't have a stable function identity so this effect will fire on every render.
    // In a real app useEffectEvent functions should *not* be passed as a dependency, this is for
    // testing purposes only.
    useEffect(() => {
      onClick();
    }, [onClick]);

    useEffect(() => {
      onClick();
    }, [shouldRender]);

    return <></>;
  }

  ReactNoop.render(<Counter shouldRender={true} value={0} />);
  await waitForAll([
    "onClick, shouldRender=true, value=0",
    "onClick, shouldRender=true, value=0",
  ]);

  ReactNoop.render(<Counter shouldRender={true} value={1} />);
  await waitForAll(["onClick, shouldRender=true, value=1"]);

  ReactNoop.render(<Counter shouldRender={false} value={2} />);
  await waitForAll([
    "onClick, shouldRender=false, value=2",
    "onClick, shouldRender=false, value=2",
  ]);
});
```

Don't know why, because from the [original RFC](https://github.com/reactjs/rfcs/pull/220/files#diff-851235f448b299dc974c55ff3dc9f13e392280aa9bdce8f7cacd48af83dd5524R116), it should be stable.

Well the implementation makes sure that the event always returns the latest value, so it doesn't need to be stable if it is used, as required, only inside `useEffect()`.

## 3. Summary

It is still experimental feature, so its implementation might change in the future. But in all it is a fairly simple hook. Hope this post helps you understand it better.
