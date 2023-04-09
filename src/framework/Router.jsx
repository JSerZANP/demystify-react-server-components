import React from "react";
import { useEffect, useState } from "react";
import Detail from "../components/Detail";
import List from "../components/List";

function getRoute() {
  const path = location.pathname;
  if (/\/post\/.*/.test(path)) {
    return <Detail permalink={path.split("/")[2]} />;
  }
  return <List />;
}

/**
 * a simple router listening to history change
 * @returns
 */
export default function Router() {
  const [page, setPage] = useState(getRoute());

  useEffect(() => {
    const onChange = () => {
      setPage(getRoute());
    };
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  return page;
}
