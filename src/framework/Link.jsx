import React, { useCallback } from "react";

/**
 * replacement for <a/> which prevents hard navigation
 */
export default function Link({
  children,
  href,
  state = {},
  onClick: _onClick,
  ...rest
}) {
  const mergedOnClick = useCallback(
    (e) => {
      if (_onClick) {
        _onClick(e);
      }

      history.pushState(state, "", href);
      const popStateEvent = new PopStateEvent("popstate", { state });
      dispatchEvent(popStateEvent);

      console.log("click link", href);
      e.preventDefault();
    },
    [_onClick]
  );
  return (
    <a href={href} {...rest} onClick={mergedOnClick}>
      {children}
    </a>
  );
}
