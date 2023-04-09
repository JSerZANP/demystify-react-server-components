"use client";
import React, { Suspense } from "react";
import Link from "../framework/Link";

import PostDetail from "./PostDetail";
import Like from "./Like";

export default function Detail({ permalink }) {
  return (
    <div>
      <p>
        <Link href="/">← post list</Link>
      </p>
      <Like />
      <Suspense fallback={<p>loading post...</p>}>
        <PostDetail permalink={permalink} />
      </Suspense>
    </div>
  );
}
