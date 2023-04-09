import React, { Suspense } from "react";
import PostList from "./PostList";

export default function List() {
  return (
    <div>
      <h2>Post List</h2>
      <Suspense fallback={<p>loading post list...</p>}>
        <PostList />
      </Suspense>
    </div>
  );
}
