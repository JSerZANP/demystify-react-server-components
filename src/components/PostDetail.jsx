import React from "react";

// notice that this dependecy has to be bundled into client-side code
import { marked } from "marked";

const createPostFetcher = function (permalink) {
  return {
    data: null,
    promise: null,
    fetch(id) {
      if (this.data != null) {
        return this.data;
      }

      if (this.promise == null) {
        this.promise = fetch("/api/post/" + permalink)
          .then((res) => res.json())
          .then((list) => (this.data = list));
      }

      throw this.promise;
    },
  };
};

const map = new Map();

const Post = (permalink) => {
  if (!map.has(permalink)) {
    map.set(permalink, createPostFetcher(permalink));
  }
  return map.get(permalink);
};

export default function PostDetail({ permalink }) {
  const post = Post(permalink).fetch();
  const html = marked(post.content);
  return <p dangerouslySetInnerHTML={{ __html: html }}></p>;
}
