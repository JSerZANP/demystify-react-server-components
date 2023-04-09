import React from "react";
import Link from "../framework/Link";

const Posts = {
  data: null,
  promise: null,
  fetch() {
    if (this.data != null) {
      return this.data;
    }

    if (this.promise == null) {
      this.promise = fetch("/api/posts")
        .then((res) => res.json())
        .then((list) => (this.data = list));
    }

    throw this.promise;
  },
};

export default function PostList() {
  const list = Posts.fetch();
  return (
    <ol>
      {list.map((post) => (
        <li>
          <Link href={`/post/${post.permalink}`}>{post.title}</Link>
        </li>
      ))}
    </ol>
  );
}
