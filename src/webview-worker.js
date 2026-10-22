/* VS Code's resource service worker cannot associate blob workers with an editor.
 * Fetch their scripts/codecs in the document, where resource requests have an owner.
 */
(() => {
    const NativeWorker = window.Worker;
    const base = new URL(window.__OHIF_ASSET_URL__).href;
    const cache = new Map();
    const manifest = fetch(base + 'webview-assets.json').then(response => {
        if (!response.ok) { throw new Error('Unable to load OHIF worker manifest'); }
        return response.json();
    });
    function asset(name, type) {
        if (!cache.has(name)) {
            cache.set(name, fetch(base + name).then(async response => {
                if (!response.ok) { throw new Error(`Unable to load OHIF worker asset: ${name}`); }
                const bytes = await response.arrayBuffer();
                return URL.createObjectURL(new Blob([bytes], { type }));
            }));
        }
        return cache.get(name);
    }
    async function prepare(name) {
        const files = await manifest;
        const dependencies = new Set();
        function visit(file) {
            if (dependencies.has(file)) { return; }
            dependencies.add(file);
            for (const dependency of files.scripts[file] || []) { visit(dependency); }
        }
        visit(name);
        const mapping = {};
        await Promise.all([
            ...[...dependencies].map(async file => {
                mapping[new URL(file, base).href] = await asset(file, 'text/javascript');
            }),
            ...files.wasm.map(async file => {
                mapping[new URL(file, base).href] = await asset(file, 'application/wasm');
            }),
        ]);
        const setup = `self.__OHIF_ASSET_URL__=${JSON.stringify(base)};
            const assets=${JSON.stringify(mapping)};
            const resource=url=>assets[new URL(url,self.__OHIF_ASSET_URL__).href]||url;
            const nativeImportScripts=self.importScripts.bind(self);
            self.importScripts=(...urls)=>nativeImportScripts(...urls.map(resource));
            const nativeFetch=self.fetch.bind(self);
            self.fetch=(input,options)=>nativeFetch(resource(typeof input==='string'||input instanceof URL?input:input.url),options);
            `;
        return { setup, entry: mapping[new URL(name, base).href] };
    }
    window.Worker = class extends EventTarget {
        constructor(url, options) {
            super();
            const target = new URL(url, document.baseURI);
            if (!target.href.startsWith(base)) { return new NativeWorker(url, options); }
            this.pending = [];
            this.stopped = false;
            this.ready = prepare(target.href.slice(base.length)).then(({ setup, entry }) => {
                if (this.stopped) { return; }
                const source = setup + (options?.type === 'module'
                    ? `await import(${JSON.stringify(entry)});`
                    : `importScripts(${JSON.stringify(entry)});`);
                this.bootstrap = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                this.worker = new NativeWorker(this.bootstrap, options);
                for (const type of ['message', 'messageerror', 'error']) {
                    this.worker.addEventListener(type, event => this.relay(type, event));
                }
                for (const args of this.pending) { this.worker.postMessage(...args); }
                this.pending = [];
            }).catch(error => this.relay('error', { message: error.message, error }));
        }
        relay(type, event) {
            const forwarded = type === 'error'
                ? new ErrorEvent(type, { message: event.message, error: event.error })
                : new MessageEvent(type, { data: event.data, ports: event.ports });
            this.dispatchEvent(forwarded);
            this['on' + type]?.(forwarded);
            if (type === 'error') { console.error('OHIF decoder worker failed:', event.message); }
        }
        postMessage(...args) {
            if (this.stopped) { return; }
            if (this.worker) { this.worker.postMessage(...args); }
            else { this.pending.push(args); }
        }
        terminate() {
            this.stopped = true;
            this.pending = [];
            this.worker?.terminate();
            if (this.bootstrap) { URL.revokeObjectURL(this.bootstrap); }
        }
    };
    window.addEventListener('pagehide', () => {
        for (const promise of cache.values()) { promise.then(url => URL.revokeObjectURL(url), () => {}); }
    }, { once: true });
})();
