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
  return Posts.fetch();
}
