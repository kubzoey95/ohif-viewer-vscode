import * as vscode from 'vscode';
import { DcmView } from './editor';
import * as path from 'path';
const cors = require('cors');
const express = require('express');
const app = express();

export function activate(context: vscode.ExtensionContext) {
    app.use(cors());
    app.use(express.static(path.join(__dirname, 'viewer-dist')));

    app.get('/', async(req, res) => {
        res.sendFile(path.join(__dirname, 'viewer-dist', "index.html"));
    });

    app.get('/viewer/dicomjson', async(req, res) => {
        res.sendFile(path.join(__dirname, 'viewer-dist', "index.html"));
    });

    const srv = app.listen(0, () => {
        console.log(`OHIF running on ${srv.address().port}`);
        vscode.window.registerCustomEditorProvider("dcmView", new DcmView(context.extensionUri, srv.address().port, app));
    });
    
}
export function deactivate() { 
    app.close();
}