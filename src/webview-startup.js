// Start OHIF while metadata is indexed, but hold its JSON request until the
// extension has written the completed index. Pixel data is loaded by OHIF later.
(() => {
    const api = acquireVsCodeApi();
    const metadataUrl = new URL(window.__OHIF_METADATA_URL__).href;
    let resolveMetadata;
    let rejectMetadata;
    const metadata = new Promise((resolve, reject) => {
        resolveMetadata = resolve;
        rejectMetadata = reject;
    });
    // Keep indexing errors visible even if OHIF has not requested the JSON yet.
    metadata.catch(() => {});
    let message = 'Preparing series…';
    const status = () => {
        const element = document.getElementById('ohif-startup-status');
        if (element) { element.textContent = message; }
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url,
            document.baseURI).href;
        return url === metadataUrl ? metadata.then(() => nativeFetch(input, options)) : nativeFetch(input, options);
    };
    window.addEventListener('message', event => {
        const data = event.data;
        if (data?.type === 'metadata-progress') {
            message = data.total ? `Preparing series… ${data.completed} / ${data.total} files` : 'Preparing series…';
        } else if (data?.type === 'metadata-ready') {
            message = 'Loading first image…';
            resolveMetadata();
        } else if (data?.type === 'metadata-error') {
            message = 'Unable to open series: ' + data.message;
            rejectMetadata(new Error(data.message));
        } else { return; }
        status();
    });
    document.addEventListener('DOMContentLoaded', status, { once: true });
    document.addEventListener('CORNERSTONE_IMAGE_RENDERED', () => {
        document.getElementById('ohif-startup-status')?.remove();
    }, { capture: true, once: true });
    api.postMessage({ type: 'viewer-ready' });
})();
