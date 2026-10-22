const assert = require('node:assert/strict');
const { chromium } = require('../Viewers/node_modules/playwright');

// Separate origins exercise webview routing, CSP, lazy chunks and blob workers.
// Playwright intercepts resource requests; no HTTP server is started.
module.exports = async function checkBrowser(html, resourceRoots = [], options = {}) {
    const browser = await chromium.launch({
        executablePath: process.env.OHIF_CHROME || '/usr/bin/google-chrome',
        headless: true,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
        const page = await browser.newPage();
        const errors = [];
        let backgroundRequests = 0;
        page.on('pageerror', error => errors.push(error.message));
        if (process.env.OHIF_BROWSER_DEBUG) {
            page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log(message.type(), message.text().slice(0, 1400)); });
            page.on('pageerror', error => console.log('PAGE ERROR', error.message));
        }
        await page.route('https://webview.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.route('https://*.vscode-resource.vscode-cdn.net/**', async route => {
            const file = decodeURIComponent(new URL(route.request().url()).pathname);
            assert.ok(resourceRoots.some(root => file.startsWith(root + '/')),
                'Resource outside webview localResourceRoots: ' + file);
            // Worker resource requests have no owning editor in VS Code.
            // They must use the blobs prepared by the document instead.
            try { route.request().frame(); } catch {
                errors.push('Worker requested a VS Code resource directly');
                await route.fulfill({ status: 408, body: 'No owning webview' });
                return;
            }
            if (file.endsWith('dicom.json')) {
                assert.ok(await page.evaluate(() => window.__ohifMetadataReady), 'Metadata fetched before indexing completed');
            }
            if (file.endsWith('.dcm')) {
                if (await page.evaluate(() => window.__ohifImageRendered)) { backgroundRequests++; }
                // Make requests slower than rendering so prefetch can be observed.
                if (options.expectBackgroundLoading) { await new Promise(resolve => setTimeout(resolve, 40)); }
            }
            await route.fulfill({ path: file, headers: { 'access-control-allow-origin': '*' } });
        });
        await page.addInitScript(metadataDelay => {
            window.acquireVsCodeApi = () => ({ postMessage: () => setTimeout(() => {
                window.__ohifMetadataReady = true;
                window.dispatchEvent(new MessageEvent('message', { data: { type: 'metadata-ready' } }));
            }, metadataDelay) });
            window.__ohifImageRendered = false;
            document.addEventListener('CORNERSTONE_IMAGE_RENDERED', () => { window.__ohifImageRendered = true; }, true);
        }, options.metadataDelay || 0);
        await page.goto('https://webview.test/index.html?id=webview');
        await page.getByText('Layout', { exact: true }).waitFor({ timeout: 20000 });
        await page.waitForFunction(() => document.querySelector('canvas.cornerstone-canvas'));
        await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden', timeout: 20000 });
        await page.waitForFunction(() => window.__ohifImageRendered, null, { timeout: 20000 });
        await page.waitForFunction(() => {
            const canvas = document.querySelector('canvas.cornerstone-canvas');
            const context = canvas?.getContext('2d');
            if (!context || !canvas.width || !canvas.height) { return false; }
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index] || pixels[index + 1] || pixels[index + 2]) { return true; }
            }
            return false;
        }, null, { timeout: 20000 });
        if (process.env.OHIF_BROWSER_DEBUG) {
            console.log('LOADING INDICATORS', await page.getByText('Loading...', { exact: true }).count());
            console.log('CANVASES', await page.locator('canvas').evaluateAll(elements => elements.map(canvas => ({width: canvas.width, height: canvas.height, className: canvas.className}))));
        }
        assert.equal(new URL(page.url()).origin, 'https://webview.test');
        assert.equal(new URL(page.url()).pathname, '/viewer/dicomjson');
        assert.equal(new URL(page.url()).searchParams.get('id'), 'webview');
        if (options.expectBackgroundLoading) {
            for (let attempt = 0; attempt < 100 && !backgroundRequests; attempt++) {
                await page.waitForTimeout(50);
            }
            assert.ok(backgroundRequests > 0, 'No background slice requests after the first image rendered');
        }
        assert.equal(await page.locator('#ohif-startup-status').count(), 0);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
};
