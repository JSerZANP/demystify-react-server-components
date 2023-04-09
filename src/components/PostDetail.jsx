import React from "react";
import { marked } from "marked";
import getPosts from "../server/posts";

export default async function PostDetail({ permalink }) {
  const list = await getPosts();
  const post = list.filter((post) => post.permalink === permalink)[0];
  const html = marked(post.content);

  return <p dangerouslySetInnerHTML={{ __html: html }}></p>;
}
