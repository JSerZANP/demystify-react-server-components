import React from "react";
import getPosts from "../server/posts";
import Link from "../framework/Link";

export default async function PostList() {
  const list = await getPosts();
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
