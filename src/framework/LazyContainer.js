import React from "react";

const fetcherMap = new Map();

function createFetcher(componentName) {
  return {
    data: null,
    promise: null,
    fetch() {
      if (this.data != null) {
        return this.data;
      }
      if (this.promise == null) {
        this.promise = import("/static/" + componentName + ".js").then(
          (module) => {
            this.data = module.default;
          }
        );
      }

      throw this.promise;
    },
  };
}

const fetch = (componentName) => {
  if (!fetcherMap.has(componentName)) {
    fetcherMap.set(componentName, createFetcher(componentName));
  }
  return fetcherMap.get(componentName).fetch();
};

/**
 * dynamically fetches a component and renders
 */
export default function LazyContainer({ componentName, ...rest }) {
  const Component = fetch(componentName);
  return <Component {...rest} />;
}
