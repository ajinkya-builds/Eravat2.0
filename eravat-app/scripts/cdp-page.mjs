/**
 * Minimal Chrome DevTools Protocol client for Android WebView page targets.
 */
export class CdpPage {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const page = new CdpPage(ws);
    ws.addEventListener('message', (event) => page.#onMessage(event.data));
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('DOM.enable');
    return page;
  }

  constructor(ws) {
    this.#ws = ws;
  }

  #onMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id && this.#pending.has(msg.id)) {
      const { resolve, reject } = this.#pending.get(msg.id);
      this.#pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    const pathPart = url.replace('https://localhost', '') || '/';
    await this.waitFor(`location.pathname === ${JSON.stringify(pathPart)}`, 30000);
    await this.sleep(800);
  }

  async reload() {
    await this.send('Page.reload');
    await this.sleep(1500);
  }

  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.text || JSON.stringify(exceptionDetails));
    }
    return result.value;
  }

  async waitFor(expression, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.text || JSON.stringify(exceptionDetails));
      }
      if (result.value) return;
      await this.sleep(250);
    }
    throw new Error(`waitFor timeout after ${timeout}ms: ${expression}`);
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const { writeFile } = await import('fs/promises');
    await writeFile(path, Buffer.from(data, 'base64'));
  }

  async content() {
    return this.evaluate(() => document.documentElement.outerHTML);
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  close() {
    this.#ws.close();
  }
}
