"use client";

import React, { useState } from "react";

export default function Like() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((count) => count + 1)}>
      I like it!({count})
    </button>
  );
}
