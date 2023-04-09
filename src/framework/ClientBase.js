/**
 * This is the base for all client part of server component
 * For a server component A, it should have a client part as
 *
 * function A(props) {
 *   return <ClientBase component="A" {...props}/>
 * }
 *
 * The base handles the communication to /render
 */
import deserialize from "./deserialize";

const createFetcher = function (component, props) {
  return {
    data: null,
    promise: null,
    fetch() {
      if (this.data != null) {
        return this.data;
      }

      if (this.promise == null) {
        const payload = {
          component,
          props,
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
            const data = deserialize(str);
            this.data = data;
          });
      }

      throw this.promise;
    },
  };
};

const map = new Map();

const getFetcher = (component, props) => {
  const key = JSON.stringify({ component, props });
  if (!map.has(key)) {
    map.set(key, createFetcher(component, props));
  }
  return map.get(key);
};

export default function ClientBase({ component, ...props }) {
  return getFetcher(component, props).fetch();
}
