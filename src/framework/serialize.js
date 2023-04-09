/**
 * serialize server rendering result
 * 1. replace symbols
 * 2. replace client component with placeholder
 */
export default function serialize(json) {
  return JSON.stringify(json, (k, v) => {
    // Symbol.for'('react.element')
    if (k === "$$typeof" && typeof v === "symbol") {
      return v.toString();
    }

    // Symbol.for('react.suspense')
    if (k === "type" && typeof v === "symbol") {
      return v.toString();
    }

    return v;
  });
}
