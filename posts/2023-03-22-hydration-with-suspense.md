---
layout: post
title: "How hydration works with Suspense internally in React? - React Source Code Walkthrough 29"
date: 2023-03-27 18:21:10 +0900
categories: React
image: /static/hydration_suspense.png
---

> ⚠️ This post was created in 2023, by the time you read it, the implementation inside React might have already changed.

> This is part of [React Source Code Walkthrough](https://jser.dev/series/react-source-code-walkthrough.html)

We've seen [how basic hydration works internally in React]({% post_url 2023-03-15-how-does-hydration-work-in-react %}) in previous episode, but with one question being left out - how does hydration cope with Suspense ?

We'll figure it out today.

- [1. A quick recap on how Suspense works](#1-a-quick-recap-on-how-suspense-works)
- [2. React serialize Suspense component with Comment Node](#2-react-serialize-suspense-component-with-comment-node)
- [3. How hydration works with Suspense internally in React ?](#3-how-hydration-works-with-suspense-internally-in-react-)
  - [3.1 mount branch (1st pass) in updateSuspenseComponent()](#31-mount-branch-1st-pass-in-updatesuspensecomponent)
  - [3.2 mountDehydratedSuspenseComponent() schedules another re-render](#32-mountdehydratedsuspensecomponent-schedules-another-re-render)
  - [3.3 update branch(2nd pass) in updateSuspenseComponent()](#33-update-branch2nd-pass-in--updatesuspensecomponent)
- [4. Let's consolidate our learnings today with some demos.](#4-lets-consolidate-our-learnings-today-with-some-demos)
  - [4.1. Server: fallback, Client: fallback](#1-server-fallback-client-fallback)
    - [4.1.1 How existing fallback is removed?](#412-how-existing-fallback-is-removed)
  - [4.2. Server: fallback, Client: contents](#42-server-fallback-client-contents)
  - [4.3. Server: contents, Client: fallback](#43-server-contents-client-fallback)
  - [4.4 Server: contents, Client: contents](#44-server-contents-client-contents)

## 1. A quick recap on how Suspense works

For more detail, you can refer to my previous episodes like [How Suspense works internally in Concurrent Mode]({% post_url 2022-04-02-suspense-in-concurrent-mode-1-reconciling %}), here is a quick summary.

> Btw, it took me some time to recall how it works 😅, the episodes were done almost a year ago after all, and also quite complex.

1. Suspense internally has a flag - `DidCapture` to indicate if it is suspended or not.
2. Suspense wraps contents inside of Offscreen component, as its child in the fiber tree.
   - If not suspended, reconciling goes to Offscreen
   - If suspended, reconciling goes to Fallback.(Notice that Offscreen is still in the fiber tree, not deleted, this is to keep the state).
3. When a thenable(Promise) is thrown
   - React find the closest ancestor Suspense in the fiber tree, mark it as `ShoudCapture`.
   - the flag is then changed to `ShouldCapture` during the completing (unwinding to bemore accurete) and rather than go up to parent node, React runtime stays at Suspense and reconciles from Suspense again.

Below is the walk path illustrating above logic

![](https://jser.dev/static/suspense-reconcile.png)

## 2. React serialize Suspense component with Comment Node.

**Hydration means to make existing DOM interactive**, but unlike intrinsic HTML element, Suspense doesn't have a corresponding HTML tag, how should `<Suspense/>` be serialized ? Below is the [code](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-dom-bindings/src/server/ReactDOMServerFormatConfig.js#L2709-L2716).

```js
// Suspense boundaries are encoded as comments.
const startCompletedSuspenseBoundary = stringToPrecomputedChunk("<!--$-->");
const startPendingSuspenseBoundary1 = stringToPrecomputedChunk(
  '<!--$?--><template id="'
);
const startPendingSuspenseBoundary2 = stringToPrecomputedChunk('"></template>');
const startClientRenderedSuspenseBoundary =
  stringToPrecomputedChunk("<!--$!-->");
const endSuspenseBoundary = stringToPrecomputedChunk("<!--/$-->");
```

So React serialize the Suspense component in Comment nodes.

```jsx
function Button() {
  return <button>0</button>;
}

function SuspendedButton() {
  throw new Promise(() => {});
  return <button>0</button>;
}

ReactDOMServer.renderToString(
  <Suspense fallback={<p>This is a callback</p>}>
    <Button />
  </Suspense>
);
// <!--$--><button>0</button><!--/$-->

ReactDOMServer.renderToString(
  <Suspense fallback={<p>This is a callback</p>}>
    <SuspendedButton />
  </Suspense>
);
// <!--$!--><p>This is a callback</p><!--/$-->
```

So `<!--$-->` marks the Suspense with children, `<!--$!-->` marks Suspense with fallback.

> There is also `<!--$?-->` which seems to relate to React Server Component, but we will save it for future episodes.

## 3. How hydration works with Suspense internally in React ?

### 3.1 mount branch (1st pass) in updateSuspenseComponent()

Just as we checked `updateHostComponent()` in [how basic hydration works internally in React]({% post_url 2023-03-15-how-does-hydration-work-in-react %}), we have `updateSuspenseComponent()` to look at. From the [code](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-reconciler/src/ReactFiberBeginWork.js#L2194) we can easily find the branches for hydration.

```js
function updateSuspenseComponent(
  current: null | Fiber,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  ...
  if (current === null) {
    // Initial mount

    // Special path for hydration
    // If we're currently hydrating, try to hydrate this boundary.
    if (getIsHydrating()) {
      // We must push the suspense handler context *before* attempting to
      // hydrate, to avoid a mismatch in case it errors.
      if (showFallback) {
        pushPrimaryTreeSuspenseHandler(workInProgress);
      } else {
        pushFallbackTreeSuspenseHandler(workInProgress);
      }
      tryToClaimNextHydratableSuspenseInstance(workInProgress);
      // This could've been a dehydrated suspense component.
      const suspenseState: null | SuspenseState = workInProgress.memoizedState;
      if (suspenseState !== null) {
        const dehydrated = suspenseState.dehydrated;
        if (dehydrated !== null) {
          return mountDehydratedSuspenseComponent(
            workInProgress,
            dehydrated,
            renderLanes,
          );
        }
      }
      // If hydration didn't succeed, fall through to the normal Suspense path.
      // To avoid a stack mismatch we need to pop the Suspense handler that we
      // pushed above. This will become less awkward when move the hydration
      // logic to its own fiber.
      popSuspenseHandler(workInProgress);
    }
  }
}
```

Just as `tryToClaimNextHydratableInstance()` we can see that `tryToClaimNextHydratableSuspenseInstance()` is used to reuse the Suspense DOM (as mentioned above, it is comment node `<!--$-->` or `<!--$!-->`) and set up the `memoizedState`. If found match, then `mountDehydratedSuspenseComponent()` continues the work.

[tryToClaimNextHydratableSuspenseInstance()](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-reconciler/src/ReactFiberHydrationContext.js#L607) is straightforward, core function inside is [tryHydrateSuspense()](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-reconciler/src/ReactFiberHydrationContext.js#L378)

```js
function tryHydrateSuspense(fiber: Fiber, nextInstance: any) {
  // fiber is a SuspenseComponent Fiber
  const suspenseInstance = canHydrateSuspenseInstance(nextInstance);
  if (suspenseInstance !== null) {
    const suspenseState: SuspenseState = {
      dehydrated: suspenseInstance,
      treeContext: getSuspendedTreeContext(),
      retryLane: OffscreenLane,
    };
    fiber.memoizedState = suspenseState;
    // Store the dehydrated fragment as a child fiber.
    // This simplifies the code for getHostSibling and deleting nodes,
    // since it doesn't have to consider all Suspense boundaries and
    // check if they're dehydrated ones or not.
    const dehydratedFragment =
      createFiberFromDehydratedFragment(suspenseInstance);
    dehydratedFragment.return = fiber;
    fiber.child = dehydratedFragment;
    hydrationParentFiber = fiber;
    // While a Suspense Instance does have children, we won't step into
    // it during the first pass. Instead, we'll reenter it later.
    nextHydratableInstance = null;
    return true;
  }
  return false;
}
```

[canHydrateSuspenseInstance()](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-dom-bindings/src/client/ReactDOMHostConfig.js#L1016) just checks if it is comment node.

```js
export function canHydrateSuspenseInstance(
  instance: HydratableInstance
): null | SuspenseInstance {
  if (instance.nodeType !== COMMENT_NODE) {
    return null;
  }
  // This has now been refined to a suspense node.
  return ((instance: any): SuspenseInstance);
}
```

### 3.2 mountDehydratedSuspenseComponent() schedules another re-render

`mountDehydratedSuspenseComponent()` is very very interesting, it stops going deeper into children and schedule another pass of re-render.

```js
function mountDehydratedSuspenseComponent(
  workInProgress: Fiber,
  suspenseInstance: SuspenseInstance,
  renderLanes: Lanes
): null | Fiber {
  // During the first pass, we'll bail out and not drill into the children.
  // Instead, we'll leave the content in place and try to hydrate it later.
  if ((workInProgress.mode & ConcurrentMode) === NoMode) {
    workInProgress.lanes = laneToLanes(SyncLane);
  } else if (isSuspenseInstanceFallback(suspenseInstance)) {
    // This is a client-only boundary. Since we won't get any content from the server
    // for this, we need to schedule that at a higher priority based on when it would
    // have timed out. In theory we could render it in this pass but it would have the
    // wrong priority associated with it and will prevent hydration of parent path.
    // Instead, we'll leave work left on it to render it in a separate commit.

    // TODO This time should be the time at which the server rendered response that is
    // a parent to this boundary was displayed. However, since we currently don't have
    // a protocol to transfer that time, we'll just estimate it by using the current
    // time. This will mean that Suspense timeouts are slightly shifted to later than
    // they should be.
    // Schedule a normal pri update to render this content.
    workInProgress.lanes = laneToLanes(DefaultHydrationLane);
  } else {
    // We'll continue hydrating the rest at offscreen priority since we'll already
    // be showing the right content coming from the server, it is no rush.
    workInProgress.lanes = laneToLanes(OffscreenLane);
  }
  return null;
}
```

1. First of all, `return null` in `beginWork()` means **no more drilling down the children, just complete the work**. (for more info, refer to [how does React traverse Fiber tree]({% post_url 2022-01-16-fiber-traversal-in-react %})).
2. It schedules the work by setting `lanes`, when `lanes` is not empty it means there is more work to do, React will keep doing it. We've covered this technique in [Offscreen component]({% post_url 2022-04-17-offscreen-component %}).

`isSuspenseInstanceFallback()` just checks the variations of the comment node to tell if suspended or not.

```js
const SUSPENSE_START_DATA = "$";
const SUSPENSE_END_DATA = "/$";
const SUSPENSE_PENDING_START_DATA = "$?";
const SUSPENSE_FALLBACK_START_DATA = "$!";

export function isSuspenseInstanceFallback(
  instance: SuspenseInstance
): boolean {
  return instance.data === SUSPENSE_FALLBACK_START_DATA;
}
```

For the new re-render it goes to another branch because after committing in the first pass, `current` is no longer null in `updateSuspenseComponet()`.

### 3.3 update branch(2nd pass) in updateSuspenseComponent()

For the 2nd pass, we go to update branch.

[code](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-reconciler/src/ReactFiberBeginWork.js#L2194)

```js
if (current === null) {
  // Initial mount
  ...
} else {
  // This is an update.

  // Special path for hydration
  const prevState: null | SuspenseState = current.memoizedState;
  if (prevState !== null) {
    const dehydrated = prevState.dehydrated;
    if (dehydrated !== null) {
      return updateDehydratedSuspenseComponent(
        current,
        workInProgress,
        didSuspend,
        nextProps,
        dehydrated,
        prevState,
        renderLanes,
      );
    }
  }
  ...
}
```

`memoizedState` exists because it is set in the 1st pass.

And I'd like to point it out that though it looks like we are hydrating, but actually the global `isHydrating` is false. [resetHydrationState()](https://github.com/facebook/react/blob/131768166b60b3bc271b54a3f93f011f310519de/packages/react-reconciler/src/ReactFiberHydrationContext.js#L911) is called in `beginWork()` at HostRoot to try early bailout when updating, but since there is more work in the children so it couldn't bail out. (for more, refer to [How does React bailout work in reconciliation]({% post_url 2022-01-08-how-does-bailout-work %}))

`updateDehydratedSuspenseComponent()` is quite big, let's pick out the path for the simple case of both server and client being suspended.

```js
function updateDehydratedSuspenseComponent(current, workInProgress, didSuspend, nextProps, suspenseInstance, suspenseState, renderLanes) {
if (!didSuspend) {
  // This is the first render pass. Attempt to hydrate.
  pushPrimaryTreeSuspenseHandler(workInProgress); // We should never be hydrating at this point because it is the first pass,
  // but after we've already committed once.

  warnIfHydrating();

  if ((workInProgress.mode & ConcurrentMode) === NoMode) {
    return retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, null);
  }

  if (isSuspenseInstanceFallback(suspenseInstance)) {
    // This boundary is in a permanent fallback state. In this case, we'll never
    // get an update and we'll never be able to hydrate the final content. Let's just try the
    // client side render instead.
    var digest, message, stack;

    {
      var _getSuspenseInstanceF = getSuspenseInstanceFallbackErrorDetails(suspenseInstance);

      digest = _getSuspenseInstanceF.digest;
      message = _getSuspenseInstanceF.message;
      stack = _getSuspenseInstanceF.stack;
    }

    var error;

    if (message) {
      // eslint-disable-next-line react-internal/prod-error-codes
      error = new Error(message);
    } else {
      error = new Error('The server could not finish this Suspense boundary, likely ' + 'due to an error during server rendering. Switched to ' + 'client rendering.');
    }

    error.digest = digest;
    var capturedValue = createCapturedValue(error, digest, stack);
    return retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, capturedValue);
  }
}
```

1. We haven't rendered the contents inside Suspense yet, so `didSuspend` is false.
2. Fallback error details somehow could be serialized as well, the error will be outputed into console. We'll skip the details for now since not critical

[code](https://github.com/facebook/react/blob/db281b3d9cd033cdc3d63e00fc9f3153c03aa70c/packages/react-reconciler/src/ReactFiberBeginWork.js#L2674).

```js
function retrySuspenseComponentWithoutHydrating(
  current: Fiber,
  workInProgress: Fiber,
  renderLanes: Lanes,
  recoverableError: CapturedValue<mixed> | null
) {
  // Falling back to client rendering. Because this has performance
  // implications, it's considered a recoverable error, even though the user
  // likely won't observe anything wrong with the UI.
  //
  // The error is passed in as an argument to enforce that every caller provide
  // a custom message, or explicitly opt out (currently the only path that opts
  // out is legacy mode; every concurrent path provides an error).
  if (recoverableError !== null) {
    queueHydrationError(recoverableError);
  }

  // This will add the old fiber to the deletion list
  reconcileChildFibers(workInProgress, current.child, null, renderLanes);

  // We're now not suspended nor dehydrated.
  const nextProps = workInProgress.pendingProps;
  const primaryChildren = nextProps.children;
  const primaryChildFragment = mountSuspensePrimaryChildren(
    workInProgress,
    primaryChildren,
    renderLanes
  );
  // Needs a placement effect because the parent (the Suspense boundary) already
  // mounted but this is a new fiber.
  primaryChildFragment.flags |= Placement;
  workInProgress.memoizedState = null;

  return primaryChildFragment;
}
```

> Notice that `memozedState` is cleared here.

We've covered `mountSuspensePrimaryChildren()` in [how Suspense works internally in Concurrent Mode]({% post_url 2022-04-02-suspense-in-concurrent-mode-1-reconciling %}), simply put it creates the child fibers and returns it, this means React goes to the child to continue the reconciling. After this it is just normal update flow, we'll skip the rest.

One thing to notice is that **the fallback DOM we get from the serialized Suspense component is actually not used here**, recall in [how basic hydration works internally in React]({% post_url 2023-03-15-how-does-hydration-work-in-react %}) that we need the global flag `isHydrating` to do hydration on pre-existing DOM nodes, but as we just mentioned it gets cleared after the first pass.

And `mountSuspensePrimaryChildren()` is excactly the same function as we had before, so we have this counter-intuitive finding that **fallbck inside the Suspense are NOT re-used during hydration, they are just discarded and recreated**. This will be covered in the following demo video as well.

## 4. Let's consolidate our learnings today with some demos.

### 4.1. Server: fallback, Client: fallback

Here is the code, notice there is pre-existing DOM for fallback under `#container`.

```html
<div id="container"><b>hello?</b><!--$!--><p>This is a fallback</p><!--/$--><span>World!</span></div>
<script type="text/babel">
  const useState = React.useState;
  const Fragment = React.Fragment;
  const Suspense = React.Suspense;

  const hydrateRoot = ReactDOM.hydrateRoot;

  function Button() {
    console.log('Button() is run, a Promise is thrown')
    const [state, setState] = useState(0);
    throw new Promise(() => {});
    return (
      <button onClick={() => setState((state) => state + 1)}>{state}</button>
    );
  }

  function App() {
    return (
      <Fragment>
        <b>hello?</b>
        <Suspense fallback={<p>This is a fallback</p>}>
          <Button />
        </Suspense>
        <span>World!</span>
      </Fragment>
    );
  }

  const rootElement = document.getElementById("container");
  const originalButton = rootElement.firstChild;
  setTimeout(() => hydrateRoot(rootElement, <App />), 2000)
</script>
</body>
```

Here is a video showing how the DOM changes.

<iframe width="560" height="315" src="https://www.youtube.com/embed/eaFwyRV5uno" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

We can see that **the existing DOM for the suspense and fallback inside are discarded, new fallback is created even though the fallbacks are identical**.

You can open [the demo](https://jser.dev/demos/react/hydrate-suspense/hydration-suspense-fallback-fallback.html) to try it out. If you open the console, you'll be able to see the logs I've annotated. Let's briefly review the logs with what we've learned so far.

```log
performConcurrentWorkOnRoot()
found lanes not empty, meaning there is work to do
performUnitOfWork()  HostRoot
beginWork() on  HostRoot
go to the return of prev beginWork(): App
performUnitOfWork()  App
beginWork() on  App
go to the return of prev beginWork(): b
performUnitOfWork()  b
beginWork() on  b
since beginWork() returns null, completeUnitOfWork()
go to its sibling SuspenseComponent
performUnitOfWork()  SuspenseComponent
beginWork() on  SuspenseComponent
```

These are just ordinary reconciling, until we enter Suspense. (for more , refer to [how does React traverse Fiber tree]({% post_url 2022-01-16-fiber-traversal-in-react %}));

```log
updateSuspenseComponent()
initial mount
this is also hydration
try re-use the existing DOM by tryToClaimNextHydratableSuspenseInstance()
found the Suspense marker <!--$
mountDehydratedSuspenseComponent()
mountDehydratedSuspenseComponent() schedules re-render by setting lane to DefaultHydrationLane
mountDehydratedSuspenseComponent() returns null, meaning not going deeper in children, completeWork() on this suspense
since beginWork() returns null, completeUnitOfWork()
go to its sibling span
```

As we said, during hydration React tries to "re-use"(not exactly re-use though) DOM for Suspense, which special marker of comment node is expected, and we found it `<!--$!-->`.
But the reconciliation doesn't go deeper to children (the fallback) since React schedules a 2nd re-render, so we see the log saying it goes to sibling `span`.

```log
performUnitOfWork()  span
beginWork() on  span
since beginWork() returns null, completeUnitOfWork()
go to its parent(return) App
go to its parent(return) HostRoot
go to its parent(return) null
commitRoot()
commitMutationEffects()
commitLayoutEffects()
ensureRootIsScheduled() inside of commitRoot() to make sure any additional work should be scheduled
ensureRootIsScheduled() inside performConcurrentWorkOnRoot()
```

`<span>` is just ordiany intrinsic element, and succeeded in hydrating it, completeWork() runs along the path to root and then commits. But so far there is nothing to commit, no DOM is created or deleted.

```log
performConcurrentWorkOnRoot()
found lanes not empty, meaning there is work to do
performUnitOfWork()  HostRoot
beginWork() on  HostRoot
go to the return of prev beginWork(): App
performUnitOfWork()  App
beginWork() on  App
go to the return of prev beginWork(): b
performUnitOfWork()  b
beginWork() on  b
since beginWork() returns null, completeUnitOfWork()
go to its sibling SuspenseComponent
performUnitOfWork()  SuspenseComponent
beginWork() on  SuspenseComponent
```

Now a second round of re-render happens because we have set the lane to non-empty during the 1st render.

```log
updateSuspenseComponent()
update Suspense
previously there was matched dehydrated suspense state
it didn't suspend (yet)
the dehydrated suspense marker is fallback, so retrySuspenseComponentWithoutHydrating() to try rendering content
retrySuspenseComponentWithoutHydrating()
return child OffscreenComponent
```

In this pass we got to update branch. Since there is already fallback, we need to render the children to see if we can switch from fallback to contents, thus we'll go deeper to the children.

```log
go to the return of prev beginWork(): OffscreenComponent
performUnitOfWork()  OffscreenComponent
beginWork() on  OffscreenComponent
go to the return of prev beginWork(): Button
performUnitOfWork()  Button
beginWork() on  Button
Button() is run, a Promise is thrown
unwindUnitOfWork() Button
unwindUnitOfWork() OffscreenComponent
unwind() SuspenseComponent, found ShoudCapture flag, so set DidCapture and return itself to reconcile on Suspense again
unwindUnitOfWork() SuspenseComponent
found non-null return value of unwindWork(), so stop unwinding, beginWork() on it
performUnitOfWork()  SuspenseComponent
```

These are exactly how Suspense reconciles, as we mentioned in [How Suspense works internally in Concurrent Mode]({% post_url 2022-04-02-suspense-in-concurrent-mode-1-reconciling %}).

Notice a Promise is thrown, so we'll reconcile from nearest Suspense again.

```log
beginWork() on  SuspenseComponent
updateSuspenseComponent()
update Suspense
previously there was matched dehydrated suspense state
it suspended
mountSuspenseFallbackAfterRetryWithoutHydrating()
return the fallback fragment
go to the return of prev beginWork(): Fragment
performUnitOfWork()  Fragment
beginWork() on  Fragment
go to the return of prev beginWork(): p
performUnitOfWork()  p
beginWork() on  p
since beginWork() returns null, completeUnitOfWork()
go to its parent(return) Fragment
go to its parent(return) SuspenseComponent
go to its sibling span
```

This time when we go deeper, we'll mount fallback.

```log
performUnitOfWork()  span
beginWork() on  span
since beginWork() returns null, completeUnitOfWork()
go to its parent(return) App
go to its parent(return) HostRoot
go to its parent(return) null
commitRoot()
commitMutationEffects()
clearSuspenseBoundary()
remove <!--$!-->
remove <p>​This is a fallback​</p>​
remove <!--/$-->
insertInContainerBefore() <p>​This is a fallback​</p>​
commitLayoutEffects()
ensureRootIsScheduled() inside of commitRoot() to make sure any additional work should be scheduled
Uncaught Error: The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering.
ensureRootIsScheduled() inside performConcurrentWorkOnRoot()
```

Done reconciling, commit the changes. We can see that Suspense markers and the pre-existing fallback are removed, the new fallback is created.

The Error is a warning on Server-side suspense, it is recoverable error and not thrown. For how it works? we'll skip it for now, not important.

#### 4.1.1 How existing fallback is removed?

Sorry this is something we left it out.

We know that DOM manipulation is based on the flags added to the fibers during the reconciliation.

In the first pass, when [tryHydrateSuspense()](https://github.com/facebook/react/blob/131768166b60b3bc271b54a3f93f011f310519de/packages/react-reconciler/src/ReactFiberHydrationContext.js#L378) is called, actually a new fiber node `DehydratedFragment` is added to the Suspense.

![](https://jser.dev/static/suspense-hydration-1st.png)

In the 2nd pass, inside `retrySuspenseComponentWithoutHydrating()`, actually this `DehydratedFragment` is marked as Delete in `reconcileChildFibers()` because it is designed to be not reconcilable.

```js
function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
  ... // DehydratedFragment cannot be handled here so delete
  return deleteRemainingChildren(returnFiber, currentFirstChild);
}
```

The DehydrateFragment is set to the `deletions` array on the Suspense [code](https://github.com/facebook/react/blob/131768166b60b3bc271b54a3f93f011f310519de/packages/react-reconciler/src/ReactChildFiber.js#L299).

![](https://jser.dev/static/suspense-hydration-2nd.png)

During commiting the DOM will be deleted [code](https://github.com/facebook/react/blob/131768166b60b3bc271b54a3f93f011f310519de/packages/react-reconciler/src/ReactFiberCommitWork.js#L2122-L2152)

```js
case DehydratedFragment: {
  ...
  // Delete the dehydrated suspense boundary and all of its content.
  if (supportsMutation) {
    if (hostParent !== null) {
      if (hostParentIsContainer) {
        clearSuspenseBoundaryFromContainer(
          ((hostParent: any): Container),
          (deletedFiber.stateNode: SuspenseInstance),
        );
      } else {
        clearSuspenseBoundary(
          ((hostParent: any): Instance),
          (deletedFiber.stateNode: SuspenseInstance),
        );
      }
    }
  }
  return;
}
```

You might wonder why don't we just re-use the fallback ? I'm just curious as you are, and I've asked about question to Dan, it seems that there was some performance issue.

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hey Dan, thanks for your time. <a href="https://t.co/aBKO1cy4ZC">https://t.co/aBKO1cy4ZC</a><br><br>a noob question here, during hydration why we just discard the DOM nodes inside the serialized Suspense no matter what? Why don&#39;t we try to reuse the nodes?</p>&mdash; jser (@JSer_ZANP) <a href="https://twitter.com/JSer_ZANP/status/1639526250111979522?ref_src=twsrc%5Etfw">March 25, 2023</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

### 4.2. Server: fallback, Client: contents

[demo](https://jser.dev/demos/react/hydrate-suspense/hydration-suspense-fallback-content.html)

<iframe width="560" height="315" src="https://www.youtube.com/embed/PtfeauNV5wI" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

We can see that the Suspense marker and fallback are replaced with children.

The process is more or less the same as previous pattern, open the console and check by yourself.

The only difference is that when we go to children of Suspense, since there is no Promise being thrown, we just go straight to the intrinsic button element.

### 4.3. Server: contents, Client: fallback

[demo](https://jser.dev/demos/react/hydrate-suspense/hydration-suspense-content-fallback.html)

<iframe width="560" height="315" src="https://www.youtube.com/embed/fwYPs25qGjY" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

This is a bit surprising to me because I'd expect it to switch to fallback, but actually it didn't.

The cause for this is this piece of code inside `updateDehydratedSuspenseComponent()`.

```js
else if ((workInProgress.memoizedState: null | SuspenseState) !== null) {
  // Something suspended and we should still be in dehydrated mode.
  // Leave the existing child in place.

  // Push to avoid a mismatch
  pushFallbackTreeSuspenseHandler(workInProgress);

  workInProgress.child = current.child;
  // The dehydrated completion pass expects this flag to be there
  // but the normal suspense pass doesn't.
  workInProgress.flags |= DidCapture;
  return null;
} else {
```

Since `memoizedState` exists we go into this branch, and `null` is returned meaning there is no reconciliation for the fallabck, the pre-existing DOM are left there.

I guess the reason for this is that we don't want a scenario that users see `content` -> `fallback` -> `content` on the UI, rather we'd like them to see `content` -> `content`. Yeah, it is reasonable.

Then why did't we go down here for the first two patterns?

Because `memoizedState` is cleared during `retrySuspenseComponentWithoutHydrating()`. [code](https://github.com/facebook/react/blob/131768166b60b3bc271b54a3f93f011f310519de/packages/react-reconciler/src/ReactFiberBeginWork.js#L2674).

Tricky huh?

### 4.4 Server: contents, Client: contents

[demo](https://jser.dev/demos/react/hydrate-suspense/hydration-suspense-content-content.html)

<iframe width="560" height="315" src="https://www.youtube.com/embed/OAA7WSI1sZk" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

Obviously we can see that the contents are re-used!! Nice!

> Notice the markers for Suspense are not removed though. wouldn't it cause some trouble?

In [updateDehydratedSuspenseComponent()](https://github.com/facebook/react/blob/131768166b60b3bc271b54a3f93f011f310519de/packages/react-reconciler/src/ReactFiberBeginWork.js#L2947-L2965), we enter hydration again.

```js
reenterHydrationStateFromDehydratedSuspenseInstance(
  workInProgress,
  suspenseInstance,
  suspenseState.treeContext
);
const primaryChildren = nextProps.children;
const primaryChildFragment = mountSuspensePrimaryChildren(
  workInProgress,
  primaryChildren,
  renderLanes
);
// Mark the children as hydrating. This is a fast path to know whether this
// tree is part of a hydrating tree. This is used to determine if a child
// node has fully mounted yet, and for scheduling event replaying.
// Conceptually this is similar to Placement in that a new subtree is
// inserted into the React tree here. It just happens to not need DOM
// mutations because it already exists.
primaryChildFragment.flags |= Hydrating;
return primaryChildFragment;
```

## 5. Summary

Phew, this is a long post.

Suspense itself is quite complex, the idea is simple but implementation is not. Salute to React team for such great work.

The hydration for Suspense is also convoluted, allow me to summarize it as below.

1. Suspense is serialized by comment node with `<!--$-->` meaning non-suspended, and `<!--$!-->` as suspended.
2. Hydration for Suspense is 2-pass process in order to put it into lower priority.
3. During hydration
   - if pre-existing DOM is fallback, then it'll be discarded and client-side rendering will generate the new DOM, either fallback or contents
   - if pre-exisiting DOM is contents, but client-side suspends. We want to switch the contents directly without fallback in the middle, so fallback won't be displayed.
   - if pre-existing DOM is contents and also is the client-side, then hydration continues to the children.
