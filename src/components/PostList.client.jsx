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
      const payload = {
        component: "PostList",
        props: {},
      };
      this.promise = fetch("/render", {
        body: JSON.stringify(payload),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then((res) => res.text())
        .then((str) => {
          this.data = JSON.parse(str, (key, value) => {
            if (key === "$$typeof") {
              if (value === "Symbol(react.element)") {
                return Symbol.for("react.element");
              }
              throw new Error("unexpected $$typeof", value);
            }
            return value;
          });
        });
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
