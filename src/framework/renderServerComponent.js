/**
 * recursively render server component
 * if meet function component, replace it with lazyContainer
 * remember that Server Components have a client part, meaning it could be lazy loaded too.
 */
export default function render(jsx) {
  if (jsx == null) {
    return null;
  }

  if (
    typeof jsx === "string" ||
    typeof jsx === "number" ||
    typeof jsx === "symbol"
  ) {
    return jsx;
  }

  if (Array.isArray(jsx)) {
    return jsx.map((item) => render(item));
  }

  // we only process React elemnts
  if (jsx["$$typeof"] === Symbol.for("react.element")) {
    // if intrinsic html tag
    if (typeof jsx.type === "string") {
      return { ...jsx, props: render(jsx.props) };
    }

    // if function components, just replace it with LazyContainer
    // we don't differentiate client or server components here
    if (typeof jsx.type === "function") {
      return {
        ...jsx,
        props: {
          ...render(jsx.props),
          componentName: jsx.type.name,
        },
        type: "$LazyContainer",
      };
    }
  }

  return Object.keys(jsx).reduce((result, key) => {
    result[key] = render(jsx[key]);
    return result;
  }, {});
}
