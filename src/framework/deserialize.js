import LazyContainer from "./LazyContainer";

/**
 * parse server rendering response string so it could be used by React runtime
 * 1. revive symbols
 * 2. inject LazyContainer for client components
 */
export default function deserialize(str) {
  const data = JSON.parse(str, (key, value) => {
    if (key === "$$typeof") {
      if (value === "Symbol(react.element)") {
        return Symbol.for("react.element");
      }
      throw new Error("unexpected $$typeof", value);
    }
    return value;
  });
  const result = replaceClientComponent(data);
  return result;
}

function replaceClientComponent(data) {
  if (data == null || typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(replaceClientComponent);
  }

  // if it is client component
  // switch it to LazyContainer
  if (data.type === "$LazyContainer") {
    return {
      ...data,
      props: replaceClientComponent(data.props),
      type: LazyContainer,
    };
  }

  return Object.keys(data).reduce((result, key) => {
    const value = replaceClientComponent(data[key]);
    result[key] = value;
    return result;
  }, {});
}
