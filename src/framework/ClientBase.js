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
import { useEffect, useMemo, useState } from "react";
import deserialize from "./deserialize";

export default function ClientBase({ component, ...props }) {
  return useStreamedData(component, props);
}

// alright, revalidating is out of our scope here.
const cache = new Map();

function useStreamedData(component, props) {
  const payload = useMemo(
    () => ({
      component,
      props,
    }),
    [component, props]
  );
  const key = useMemo(() => JSON.stringify(payload), [payload]);

  const [state, setState] = useState(cache.get(key));
  useEffect(() => {
    if (state != null) {
      return;
    }
    fetch("/render", {
      body: key,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }).then((res) => {
      const reader = res.body.getReader();
      let temp = null;
      const read = () => {
        // read the data
        reader.read().then(({ done, value }) => {
          // Result objects contain two properties:
          // done  - true if the stream has already given you all its data.
          // value - some data. Always undefined when done is true.
          if (done) {
            console.log("[end]");
            cache.set(key, temp);
            return;
          }

          const decoder = new TextDecoder();
          const payload = deserialize(decoder.decode(value));
          if (payload.target === "base") {
            temp = payload.data;
            setState(temp);
          } else if (typeof payload.target === "string") {
            // if we get a chunk with a target id, that means
            // we need to put the chunk at where the id is
            temp = replaceTarget(temp, payload.target, payload.data);
            setState(temp);
          }
          console.log("[received]", payload.data);
          read();
        });
      };

      read();
    });
  }, []);

  return state;
}

function replaceTarget(jsx, id, data) {
  if (jsx == null) {
    return null;
  }
  if (
    jsx?.["$$typeof"] === Symbol.for("react.element") &&
    jsx?.props.id === id
  ) {
    return data;
  }

  if (Array.isArray(jsx)) {
    return jsx.map((item) => replaceTarget(item, id, data));
  }
  if (typeof jsx === "object") {
    return Object.keys(jsx).reduce((result, key) => {
      result[key] = replaceTarget(jsx[key], id, data);
      return result;
    }, {});
  }

  return jsx;
}
