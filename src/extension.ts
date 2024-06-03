import * as vscode from 'vscode';
import { DcmView } from './editor';
import * as path from 'path';
import cors from 'cors';
import express from 'express';

let srv = undefined;
let cacheDir = undefined;

export async function activate(context: vscode.ExtensionContext) {
    const app = express();
    app.use(cors());
    app.use(express.static(path.join(__dirname, 'viewer-dist')));

    app.get('/', async(req, res) => {
        res.sendFile(path.join(__dirname, 'viewer-dist', "index.html"));
    });

    app.get('/viewer/dicomjson', async(req, res) => {
        res.sendFile(path.join(__dirname, 'viewer-dist', "index.html"));
    });

    srv = app.listen(0, async () => {
        const a = srv.address();
        const uri = `http://localhost:${a.port}`;
        const euri = (await vscode.env.asExternalUri(vscode.Uri.parse(uri))).toString().slice(0, -1);
        console.log(`OHIF running on ${euri}`);
        cacheDir = vscode.Uri.joinPath(context.extensionUri, "cacheDir");
        vscode.workspace.fs.delete(cacheDir, {recursive: true});
        await vscode.workspace.fs.createDirectory(cacheDir);
        vscode.window.registerCustomEditorProvider("dcmView", new DcmView(context.extensionUri, cacheDir, euri, app));
    });
    
}
export function deactivate() {
    srv.close();
    vscode.workspace.fs.delete(cacheDir, {recursive: true});
}