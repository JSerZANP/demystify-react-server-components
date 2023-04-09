---
layout: post
title: "What is Progressive Hydration and how does it work internally in React? - React Source Code Walkthrough 30"
date: 2023-03-30 18:21:10 +0900
categories: React
image: /static/progressive-hydration.png
---

> ⚠️ This post was created in 2023, by the time you read it, the implementation inside React might have already changed.

> This is part of [React Source Code Walkthrough](https://jser.dev/series/react-source-code-walkthrough.html)

Phew, we've spent some time exploring [how basic hydration works]({% post_url 2023-03-15-how-does-hydration-work-in-react %}) and [how hydration works with Suspense]({% post_url 2023-03-22-hydration-with-suspense %}), now let's take one step further to figure out Progressive Hydration.

- [1. What is the problem Progressive Hydration trying to solve?](#1-what-is-the-problem-progressive-hydration-trying-to-solve)
- [2. Solution - Progressive Hydration with streaming](#2-solution---progressive-hydration-through-streaming)
- [3. How does Progressive Hydration work?](#3-how-does-progressive-hydration-work-)
  - [3.1 how to defer the rendering of Suspense contents?](#31-how-to-defer-the-rendering-of-suspense-contents)
  - [3.2 how is `<!--$?-->` handled ?](#32-how-is------handled-)
  - [3.3 How re-render happens?](#33-how-re-render-happens)
    - [3.3.1 retryDehydratedSuspenseBoundary()](#331-retrydehydratedsuspenseboundary)
- [4. Summary on Progressive Hydration](#4-summary-on-progressive-hydration)

## 1. What is the problem Progressive Hydration trying to solve?

[Dan has described the problem in details](https://github.com/reactwg/react-18/discussions/37), I strongly recommend you read through his explanation. Below is how I understand it in a simple way.

Say we have a function call to fetch data from db which is very slow and we let it suspend by throws a promise.

```jsx
function ComponentThatSuspends() {
  const list = fetchDataFromDBWhichThrowsPromise()
  return list.map(...)
}

<Suspense fallback={<p>loading...</p>}>
  <ComponentThatSuspends/>
</Suspense>
```

With learning from previous episodes, we know we can serialize the Suspense by comment node `<!--$!-->` and then hydrate it in client-side, which is great.

Problem is how do we get the `list` data ?

If we just wait for the db query without Suspense, the initial render would be super delayed.

But if we query it again from client-side as the full hydration does, that's going to be another round of API fetch and still it is not going to be fast, also notice that the initial db query from server is already initialized and now it has to be wasted.

## 2. Solution - Progressive Hydration through streaming

The solution looks pretty straightforward - **why don't we continue the initialized query on server and then send down the final HTML separately when ready?**

This means that the server response will be in multiple chunks: first with possible Suspense fallback and later with Suspense contents. React makes it possible by streaming the HTML.

About streaming I actually had a [very basic demo](https://www.youtube.com/watch?v=0NIf080gejk) for how it works.

<iframe width="560" height="315" src="https://www.youtube.com/embed/0NIf080gejk" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; w  eb-share" allowfullscreen></iframe>

Now back to Progressive Hydration, we can find [the test case](https://github.com/facebook/react/blob/96cdeaf89bfde7551b4ffe4d685da169b780f2f7/packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js#L407) to see what is being streamed.

```jsx
ReactDOMFizzServer.renderToPipeableStream(
  <>
    <DelayContext.Provider value={client}>
      <Suspense fallback="loading">
        <Component />
      </Suspense>
    </DelayContext.Provider>
    <DelayContext.Provider value={client}>
      <Suspense fallback="loading">
        <Component />
      </Suspense>
    </DelayContext.Provider>
  </>
).pipe(writable);

jest.runAllTimers();
console.log(output.result);
expect(output.error).toBe(undefined);
expect(output.result).toContain("loading");

await completed;
console.log(output.result);
expect(output.error).toBe(undefined);
expect(output.result).not.toContain("context never found");
expect(output.result).toContain("OK");
```

The code logs output before & after the Promise fulfilling, we can see the two chunks after running `yarn test ReactDOMFizzServerNode`.

![](https://jser.dev/static/progressive-hydration-test-log.png)
([bigger image](http://localhost:4000/static/progressive-hydration-test-log.png))

We can clearly see that the response is sent in 2 chunks.

1. in the 1st chunk, Suspense fallback is serialized in comment node `<!--$?-->` (not `<!--$!-->` we saw before) and with a `<template>` of unique id `B:0`, `B:1`.
2. in the 2nd chunk, it sends down some script , together with html of contents wrapped in `<div hidden id="S:0">`, which also has unique ids.

## 3. How does Progressive Hydration work?

With above observation, we only need to figure out 3 sub questions.

1. how to defer the rendering of suspense contents?
1. how to handle `<!--$?-->`?
1. what does the script in following chunks do?

### 3.1 how to defer the rendering of suspense contents?

We know that JSX is compiled (mostly) into `React.createElement()`.

```jsx
<div>
  <Suspense fallback="loading">
    <Component />
  </Suspense>
</div>
```

Above code is equal to below

```js
React.createElement(
  Suspense,
  { fallback: "loading" },
  React.createElement(Component, null)
);
```

And then it generates some tree-like object roughly as below.

```js
{
  $$typeof: Symbol(react.element),
  props: {
    children: {
      $$typeof: Symbol(react.element),
      props: {
        fallback: 'loading',
        children: {
          $$typeof: Symbol(react.element),
          props: {},
          type: Component,
        }
      },
      type: Symbol(react.suspense)
    }
  },
  type: 'div'
}
```

To get this declarative structure translated into DOM on client, we have the React runtime to create the fiber tree and create the DOM tree.

To get it rendered into HTML on server, we need to do something similar, we can easily come up with something like this:

1. renders the elements by rendering their children and wrapping them up with its own HTML tag
2. if element is not intrinsic, just return its children
3. if element is Suspense, add a `try...catch`. If a promise is called, render the fallback and attach a then callback to render the contents after the promise being fulfilled.

Below is some rough demo code to illustrate the idea.

<iframe src="https://stackblitz.com/edit/react-ts-cdhbjd?embed=1&file=App.tsx&ctl=1" style="width: 100%; height: 500px;border: 0;"></iframe>

We can see the response comes in 3 chunks mimicing what we see from the test case, in which the 1st rendering fallbacks and following 2 chunsk renderings contents for 2 suspenses.

The code is not complex, notice how we set up the `try...catch` when meeting suspense boundaries.

Note that this is just a demo code, NOT legit code. Recursion could lead to callstack overflow error so we need to do it with iteration, also we didn't handle [Context API]({% post_url 2021-07-28-how-does-context-work %}) or error boundaries, there are many pieces missing.

But since this is not critical to our topic today, I'll skip it for now and spend another episode digging into the real implementation and more about stream API. Just keep in mind that React tries to return the fallback as soon as possible and stream down the contents later.

### 3.2 how is `<!--$?-->` handled ?

We've already mentioned `<--$?-->` in [how hydration works with Suspense]({% post_url 2023-03-22-hydration-with-suspense %}) but left it as a unsolved puzzle, here is the [code](https://github.com/facebook/react/blob/51a7c45f8799cab903693fcfdd305ce84ba15273/packages/react-reconciler/src/ReactFiberBeginWork.js#L2930) inside `updateSuspenseComponent()` > `updateDehydratedSuspenseComponent()`.

```js
const SUSPENSE_PENDING_START_DATA = "$?";

export function isSuspenseInstancePending(instance: SuspenseInstance): boolean {
  return instance.data === SUSPENSE_PENDING_START_DATA;
}

if (isSuspenseInstancePending(suspenseInstance)) {
  // This component is still pending more data from the server, so we can't hydrate its
  // content. We treat it as if this component suspended itself. It might seem as if
  // we could just try to render it client-side instead. However, this will perform a
  // lot of unnecessary work and is unlikely to complete since it often will suspend
  // on missing data anyway. Additionally, the server might be able to render more
  // than we can on the client yet. In that case we'd end up with more fallback states
  // on the client than if we just leave it alone. If the server times out or errors
  // these should update this boundary to the permanent Fallback state instead.
  // Mark it as having captured (i.e. suspended).
  workInProgress.flags |= DidCapture;
  // Leave the child in place. I.e. the dehydrated fragment.
  workInProgress.child = current.child;
  // Register a callback to retry this boundary once the server has sent the result.
  const retry = retryDehydratedSuspenseBoundary.bind(null, current);
  registerSuspenseInstanceRetry(suspenseInstance, retry);
  return null;
}
```

Alright, the multi-line comments actually explain what is going on here.

1. it returns `null`, meaning there is no going deeper in reconciling.
2. Different from full hydration(`<!--$!-->`) on the fallback rendering. there is no `mountSuspensePrimaryChildren()` which tries to render contents.

This means that the contents will be kept as it is!

The re-render `retryDehydratedSuspenseBoundary()` is actually set up as a secret method to the DOM in `registerSuspenseInstanceRetry()`.

```js
export function registerSuspenseInstanceRetry(
  instance: SuspenseInstance,
  callback: () => void
) {
  instance._reactRetry = callback;
}
```

So when will this re-render be triggered? Here we go to the last puzzle.

### 3.3 How re-render happens?

The script we get from test code is minified, and here is [source code before compiling](https://github.com/facebook/react/blob/51a7c45f8799cab903693fcfdd305ce84ba15273/packages/react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetShared.js#L48).

```js
export function completeBoundary(suspenseBoundaryID, contentID, errorDigest) {
  const contentNode = document.getElementById(contentID);
  // We'll detach the content node so that regardless of what happens next we don't leave in the tree.
  // This might also help by not causing recalcing each time we move a child from here to the target.
  contentNode.parentNode.removeChild(contentNode);

  // Find the fallback's first element.
  const suspenseIdNode = document.getElementById(suspenseBoundaryID);
  if (!suspenseIdNode) {
    // The user must have already navigated away from this tree.
    // E.g. because the parent was hydrated. That's fine there's nothing to do
    // but we have to make sure that we already deleted the container node.
    return;
  }
  // Find the boundary around the fallback. This is always the previous node.
  const suspenseNode = suspenseIdNode.previousSibling;

  if (!errorDigest) {
    // Clear all the existing children. This is complicated because
    // there can be embedded Suspense boundaries in the fallback.
    // This is similar to clearSuspenseBoundary in ReactDOMHostConfig.
    // TODO: We could avoid this if we never emitted suspense boundaries in fallback trees.
    // They never hydrate anyway. However, currently we support incrementally loading the fallback.
    const parentInstance = suspenseNode.parentNode;
    let node = suspenseNode.nextSibling;
    let depth = 0;
    do {
      if (node && node.nodeType === COMMENT_NODE) {
        const data = node.data;
        if (data === SUSPENSE_END_DATA) {
          if (depth === 0) {
            break;
          } else {
            depth--;
          }
        } else if (
          data === SUSPENSE_START_DATA ||
          data === SUSPENSE_PENDING_START_DATA ||
          data === SUSPENSE_FALLBACK_START_DATA
        ) {
          depth++;
        }
      }

      const nextNode = node.nextSibling;
      parentInstance.removeChild(node);
      node = nextNode;
    } while (node);

    const endOfBoundary = node;

    // Insert all the children from the contentNode between the start and end of suspense boundary.
    while (contentNode.firstChild) {
      parentInstance.insertBefore(contentNode.firstChild, endOfBoundary);
    }

    suspenseNode.data = SUSPENSE_START_DATA;
  } else {
    suspenseNode.data = SUSPENSE_FALLBACK_START_DATA;
    suspenseIdNode.setAttribute("data-dgst", errorDigest);
  }

  if (suspenseNode["_reactRetry"]) {
    suspenseNode["_reactRetry"]();
  }
}
```

The code is bit long but not hard to grasp what it does.

1. fallback(boundary) is targeted by `suspenseBoundaryID` which is `B:0` and `B:1`. (Actually `<template/>` is targeted, and boundary is its `previousSibling`).
2. content is targeted by `contentID`, which is `S:0` and `S:1`.
3. child nodes inside boundary are removed and contents are inserted at the location, basically meaning flipping the fallback into contents
4. The re-render method `_reactRetry`, which is registered during the initial hydration, is triggered here.

**why an empty `<template>`?**

Intresting, the template actuall has nothing inside, here is the [reason](https://github.com/facebook/react/blob/51a7c45f8799cab903693fcfdd305ce84ba15273/packages/react-dom-bindings/src/server/ReactDOMServerFormatConfig.js#L2692) why it is chosen.

```js
// A placeholder is a node inside a hidden partial tree that can be filled in later, but before
// display. It's never visible to users. We use the template tag because it can be used in every
// type of parent. <script> tags also work in every other tag except <colgroup>.
const placeholder1 = stringToPrecomputedChunk('<template id="');
```

### 3.3.1 retryDehydratedSuspenseBoundary()

We haven't seen this function in previous posts, let's take a closer look here. [code](https://github.com/facebook/react/blob/51a7c45f8799cab903693fcfdd305ce84ba15273/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3526).

```js
export function retryDehydratedSuspenseBoundary(boundaryFiber: Fiber) {
  const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
  let retryLane = NoLane;
  if (suspenseState !== null) {
    retryLane = suspenseState.retryLane;
  }
  retryTimedOutBoundary(boundaryFiber, retryLane);
}

function retryTimedOutBoundary(boundaryFiber: Fiber, retryLane: Lane) {
  // The boundary fiber (a Suspense component or SuspenseList component)
  // previously was rendered in its fallback state. One of the promises that
  // suspended it has resolved, which means at least part of the tree was
  // likely unblocked. Try rendering again, at a new lanes.
  if (retryLane === NoLane) {
    // TODO: Assign this to `suspenseState.retryLane`? to avoid
    // unnecessary entanglement?
    retryLane = requestRetryLane(boundaryFiber);
  }
  // TODO: Special case idle priority?
  const eventTime = requestEventTime();
  const root = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
  if (root !== null) {
    markRootUpdated(root, retryLane, eventTime);
    ensureRootIsScheduled(root);
  }
}

export function enqueueConcurrentRenderForLane(
  fiber: Fiber,
  lane: Lane
): FiberRoot | null {
  enqueueUpdate(fiber, null, null, lane);
  return getRootForUpdatedFiber(fiber);
}

function enqueueUpdate(
  fiber: Fiber,
  queue: ConcurrentQueue | null,
  update: ConcurrentUpdate | null,
  lane: Lane
) {
  // Don't update the `childLanes` on the return path yet. If we already in
  // the middle of rendering, wait until after it has completed.
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;

  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane);

  // The fiber's `lane` field is used in some places to check if any work is
  // scheduled, to perform an eager bailout, so we need to update it immediately.
  // TODO: We should probably move this to the "shared" queue instead.
  fiber.lanes = mergeLanes(fiber.lanes, lane);
  const alternate = fiber.alternate;
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
}
```

Notice that `fiber.lanes` is set with `suspenseState.retryLane` to schedule a re-render, similar to [mountDehydratedSuspenseComponent() schedules another re-render]({% post_url 2023-03-22-hydration-with-suspense %}#32-mountdehydratedsuspensecomponent-schedules-another-re-render), but `mountDehydratedSuspenseComponent()` is called during rendering, there is no need to explicitly call `ensureRootIsScheduled()` because it'll be checked after committing is done.

Also from [how hydration works with Suspense]({% post_url 2023-03-22-hydration-with-suspense %}) we know that `suspenseState.retryLane` is set with `OffscreenLane` meaning it is low priority.

## 4. Summary on Progressive Hydration

With previous two episodes on hydration and Suspense, Progressive Hydration is actually much simpler than I first thought.

1. on server, if Suspense is suspended, React sends down the fallback HTML first (marked as comment node `<!--$?-->`) and later streams down the Suspense contents and scripts to trigger re-render.
2. on client
   - on the initial response, fallback HTML is kept un-touched during the hydration, but a retry callback is set on the comment node.
   - on following incoming responses, fallabck HTML is replaced with the contents HTML and retry callback is triggered. For multiple Suspenses, React use unique ids to pair fallbacks and contents.

There are still quite some mysteries unsolved but hopefully this post can help you understand React better. Stay tuned for upcoming episodes which eventually lead us to RSC!!!
