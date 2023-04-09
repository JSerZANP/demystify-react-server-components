/**
 * serialize server rendering result
 * 1. replace symbols
 * 2. replace client component with placeholder
 */
export default function serialize(json) {
  const replaced = replaceClientComponent(json);

  return JSON.stringify(replaced, (k, v) => {
    if (k === "$$typeof" && typeof v === "symbol") {
      return v.toString();
    }
    return v;
  });
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
  if (
    data.$$typeof === Symbol.for("react.element") &&
    typeof data.type === "function"
  ) {
    return {
      ...data,
      props: {
        ...replaceClientComponent(data.props),
        // TODO: key conflict
        componentName: data.type.name,
      },
      type: "$LazyContainer",
    };
  }

  return Object.keys(data).reduce((result, key) => {
    const value = replaceClientComponent(data[key]);
    result[key] = value;
    return result;
  }, {});
}
