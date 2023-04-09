import componentMap from "../../built/utils/componentMap";
import serialize from "./serialize";
/**
 *
 * Render the JSX tree into a stream
 *
 * we actually want to use the jsx directly but we need more work to do
 *
 * 1. handling unserializable data;
 *    - symbols -> this could be replaced & revived easily by its string
 * 2. client component
 *    - replace the client component with LazyContainer
 * 3. server component
 *    - if sync, just render it
 *    - if async
 *       - generate a unique id
 *       - replace it with Placeholder component with the id
 *          - streamed chunks could use the id to let client-side determine where to replace
 *       - attach a then callback that renders later and stream the response
 *          - the response might container furthur server components, just repeat the process
 *
 * On client-side
 *
 * 1. ClientBase as the communiation root to /render
 *    - continuously parse the streamed response and build the final tree progressively
 *    - put chunks at right location based on the id
 * 2. Placeholder
 *    - just throws a Promise which triggers the Suspense fallback
 *    - once children response  comes in, Placeholder itself will be replaced.
 */
function render(jsx, context) {
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
    return jsx.map((item) => render(item, context));
  }

  // react elements are what we want to handle
  if (jsx["$$typeof"] === Symbol.for("react.element")) {
    // if intrinsic html tag
    if (typeof jsx.type === "string") {
      return { ...jsx, props: render(jsx.props, context) };
    }

    // if function components
    if (typeof jsx.type === "function") {
      // if client component
      if (componentMap.clientComponents.includes(jsx.type.name)) {
        return {
          ...jsx,
          props: {
            ...render(jsx.props, context),
            componentName: jsx.type.name,
          },
          type: "$LazyContainer",
        };
      } else {
        // server compponent

        // generate an id
        const id = "C:" + context.id++;
        const rendered = jsx.type(jsx.props);
        if ("then" in rendered) {
          // if an async function, then
          // schedule a task to stream down the response
          context.tasks.add(rendered);
          rendered.then((json) => {
            context.tasks.delete(rendered);
            context.pipe({
              target: id,
              data: render(json, context),
            });
          });

          // and return a placeholder
          return {
            $$typeof: Symbol.for("react.element"),
            type: "$Placeholder",
            props: {
              id,
            },
            ref: null,
          };
        } else {
          // if a sync function, just render it
          return render(rendered, context);
        }
      }
    }
  }

  return Object.keys(jsx).reduce((result, key) => {
    result[key] = render(jsx[key], context);
    return result;
  }, {});
}

export default function renderServerComponentToStream(jsx, res) {
  const context = {
    id: 0,
    tasks: new Set(),
  };

  const pipe = (json) => {
    res.write(serialize(json));
    if (context.tasks.size === 0) {
      res.end();
    }
  };

  context.pipe = pipe;

  pipe({
    target: "base",
    data: render(jsx, context),
  });
}
