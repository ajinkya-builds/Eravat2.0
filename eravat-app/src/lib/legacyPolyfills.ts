/**
 * Runtime shims for Android System WebView on API 24–28 (Chrome 51–69).
 * Vite also downlevels syntax; these cover missing APIs used by the app and deps.
 */
function defineProto(
  ctor: { prototype: object },
  name: string,
  value: unknown,
) {
  if (!(name in ctor.prototype)) {
    Object.defineProperty(ctor.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

if (typeof globalThis === 'undefined' && typeof window !== 'undefined') {
  (window as unknown as { globalThis: Window }).globalThis = window;
}

if (typeof String.prototype.replaceAll !== 'function') {
  defineProto(String, 'replaceAll', function replaceAll(
    this: string,
    search: string | RegExp,
    replacement: string,
  ) {
    if (Object.prototype.toString.call(search) === '[object RegExp]') {
      const re = search as RegExp;
      if (!re.global) {
        throw new TypeError('replaceAll with RegExp requires the global flag');
      }
      return this.replace(re, replacement);
    }
    return this.split(search as string).join(replacement);
  });
}

if (typeof String.prototype.padStart !== 'function') {
  defineProto(String, 'padStart', function padStart(
    this: string,
    maxLength: number,
    fillString?: string,
  ) {
    const fill = fillString === undefined || fillString === '' ? ' ' : String(fillString);
    if (this.length >= maxLength) return String(this);
    const padLen = maxLength - this.length;
    let pad = '';
    while (pad.length < padLen) pad += fill;
    return pad.slice(0, padLen) + this;
  });
}

if (typeof String.prototype.padEnd !== 'function') {
  defineProto(String, 'padEnd', function padEnd(
    this: string,
    maxLength: number,
    fillString?: string,
  ) {
    const fill = fillString === undefined || fillString === '' ? ' ' : String(fillString);
    if (this.length >= maxLength) return String(this);
    const padLen = maxLength - this.length;
    let pad = '';
    while (pad.length < padLen) pad += fill;
    return this + pad.slice(0, padLen);
  });
}

if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = function fromEntries(iterable: Iterable<[PropertyKey, unknown]>) {
    const obj: Record<string, unknown> = {};
    for (const pair of iterable) {
      obj[String(pair[0])] = pair[1];
    }
    return obj;
  };
}

if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = function hasOwn(obj: object, prop: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };
}

if (typeof Array.prototype.flat !== 'function') {
  defineProto(Array, 'flat', function flat(this: unknown[], depth?: number) {
    const d = depth === undefined ? 1 : depth;
    const out: unknown[] = [];
    const walk = (arr: unknown[], left: number) => {
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (left > 0 && Array.isArray(v)) walk(v, left - 1);
        else out.push(v);
      }
    };
    walk(this, d);
    return out;
  });
}

if (typeof Array.prototype.flatMap !== 'function') {
  defineProto(Array, 'flatMap', function flatMap(
    this: unknown[],
    callback: (value: unknown, index: number, array: unknown[]) => unknown,
  ) {
    return this.map(callback).flat();
  });
}

if (typeof Array.prototype.at !== 'function') {
  defineProto(Array, 'at', function at(this: unknown[], index: number) {
    const n = Math.trunc(index) || 0;
    const k = n >= 0 ? n : this.length + n;
    if (k < 0 || k >= this.length) return undefined;
    return this[k];
  });
}

if (typeof Promise.allSettled !== 'function') {
  Promise.allSettled = function allSettled<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): Promise<PromiseSettledResult<T>[]> {
    return Promise.all(
      Array.from(values).map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        ),
      ),
    );
  };
}

if (typeof queueMicrotask !== 'function') {
  (globalThis as { queueMicrotask: (cb: () => void) => void }).queueMicrotask = (cb) => {
    Promise.resolve()
      .then(cb)
      .catch((err) => {
        setTimeout(() => {
          throw err;
        }, 0);
      });
  };
}

if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: function randomUUID() {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      let hex = '';
      for (let i = 0; i < bytes.length; i++) {
        hex += (bytes[i] + 0x100).toString(16).slice(1);
      }
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
}
