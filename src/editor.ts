import * as vscode from 'vscode';
import { doConversion } from './dicom-json-generator.js';
import { randomUUID } from 'crypto';
import * as dcmjs from 'dcmjs';

class DcmViewDocument implements vscode.CustomDocument {
    public readonly dir: vscode.Uri;
    public readonly metaDir: vscode.Uri;

    constructor(public readonly uri: vscode.Uri, storage: vscode.Uri) {
        this.dir = vscode.Uri.joinPath(uri, '..');
        this.metaDir = vscode.Uri.joinPath(storage, randomUUID());
    }

    dispose(): void {
        void vscode.workspace.fs.delete(this.metaDir, { recursive: true }).then(undefined, () => {});
    }
}

function scriptValue(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function attribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export class DcmView implements vscode.CustomReadonlyEditorProvider<DcmViewDocument> {
    constructor(private readonly extensionUri: vscode.Uri, private readonly storage: vscode.Uri) {}

    openCustomDocument(uri: vscode.Uri): DcmViewDocument {
        return new DcmViewDocument(uri, this.storage);
    }

    async resolveCustomEditor(document: DcmViewDocument, panel: vscode.WebviewPanel,
        token: vscode.CancellationToken): Promise<void> {
        const workerScript = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-worker.js');
        const viewer = vscode.Uri.joinPath(this.extensionUri, 'out', 'viewer-dist');
        const webview = panel.webview;
        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out'), document.dir, document.metaDir],
        };
        try {
            await vscode.workspace.fs.createDirectory(document.metaDir);
            const jsonUri = vscode.Uri.joinPath(document.metaDir, 'dicom.json');
            const json = await doConversion(document.dir.fsPath, '', undefined,
                (file: string) => webview.asWebviewUri(vscode.Uri.file(file)).toString());
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            const dicom = dcmjs.data.DicomMessage.readFile(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            const instance = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicom.dict);
            json.studies = json.studies.filter(study => study.StudyInstanceUID === instance.StudyInstanceUID);
            for (const study of json.studies) {
                study.series = study.series.filter(series => series.SeriesInstanceUID === instance.SeriesInstanceUID);
                study.NumInstances = study.series.reduce((total, series) => total + series.instances.length, 0);
                study.Modalities = [...new Set(study.series.map(series => series.Modality))].join('/');
            }
            if (!json.studies.length || !json.studies[0].series.length) {
                throw new Error('The selected DICOM series could not be loaded.');
            }
            await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(json)));
            let html = Buffer.from(await vscode.workspace.fs.readFile(
                vscode.Uri.joinPath(viewer, 'index.html'))).toString('utf8');
            const base = webview.asWebviewUri(viewer).toString() + '/';
            const jsonUrl = webview.asWebviewUri(jsonUri).toString();
            // Keep routing on the webview origin; assets use the separate VS Code resource origin.
            const bootstrap = `<script>window.PUBLIC_URL='/';window.__OHIF_ASSET_URL__=${scriptValue(base)};const route=new URL(location.href);route.pathname='/viewer/dicomjson';route.searchParams.set('url',${scriptValue(jsonUrl)});history.replaceState(null,'',route.href);</script><script src="${attribute(webview.asWebviewUri(workerScript).toString())}"></script>`;
            html = html.replace(/window\.PUBLIC_URL\s*=\s*(['"])[^'"]*\1\s*;/g, '');
            html = html.replace(/<script\b[^>]*src=["'][^"']*init-service-worker\.js["'][^>]*><\/script>/g, '');
            html = html.replace(/\b(src|href)="\/(?!\/)([^"]*)"/g,
                (_, name, resource) => `${name}="${attribute(base)}${resource}"`);
            const csp = `default-src 'none'; base-uri ${webview.cspSource}; script-src ${webview.cspSource} blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src ${webview.cspSource} data: https://fonts.gstatic.com; img-src ${webview.cspSource} data: blob:; connect-src ${webview.cspSource} blob:; worker-src blob:; media-src ${webview.cspSource} blob: data:;`;
            html = html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${attribute(csp)}"><base href="${attribute(base)}">${bootstrap}`);
            if (!token.isCancellationRequested) {
                webview.html = html;
            }
        } catch (error) {
            if (!token.isCancellationRequested) {
                webview.html = `<html><body><h2>Unable to open DICOM series</h2><p>${attribute(String(error))}</p></body></html>`;
            }
        }
    }
}
