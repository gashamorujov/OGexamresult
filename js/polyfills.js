/* Köhnə brauzerlər üçün pdf.js-in tələb etdiyi müasir funksiyalar.
   Prototip metodları enumerable olmamalıdır, əks halda pdf.js xəta verir. */
const define = (target, name, value) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
};
define(Promise, 'withResolvers', function () {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
});
define(Object, 'hasOwn', (o, k) => Object.prototype.hasOwnProperty.call(o, k));
define(Object, 'groupBy', (items, fn) => { const o = Object.create(null); let i = 0; for (const x of items) (o[fn(x, i++)] ||= []).push(x); return o; });
define(Array.prototype, 'at', function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; });
define(Array.prototype, 'findLast', function (fn, t) { for (let i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return this[i]; });
define(Array.prototype, 'findLastIndex', function (fn, t) { for (let i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return i; return -1; });
define(Array.prototype, 'toSorted', function (fn) { return [...this].sort(fn); });
define(Array.prototype, 'toReversed', function () { return [...this].reverse(); });
define(String.prototype, 'at', function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; });
define(String.prototype, 'replaceAll', function (a, b) { return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(b); });
define(globalThis, 'structuredClone', (v) => JSON.parse(JSON.stringify(v)));
