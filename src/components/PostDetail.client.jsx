const createPostFetcher = function (permalink) {
  return {
    data: null,
    promise: null,
    fetch(id) {
      if (this.data != null) {
        return this.data;
      }

      if (this.promise == null) {
        const payload = {
          component: "PostDetail",
          props: {
            permalink,
          },
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
};

const map = new Map();

const Post = (permalink) => {
  if (!map.has(permalink)) {
    map.set(permalink, createPostFetcher(permalink));
  }
  return map.get(permalink);
};

export default function PostDetail({ permalink }) {
  return Post(permalink).fetch();
}
