import * as vscode from 'vscode';
import { CancellationToken, CustomDocument, CustomDocumentOpenContext, CustomReadonlyEditorProvider, Uri, WebviewPanel } from 'vscode';
import { convertDICOMToJSON } from './dicom-json-generator.js';
import * as path from 'path';
import { randomUUID } from 'crypto';
const express = require('express');

class DcmViewDocument implements CustomDocument{
    _uri: Uri;
    public dir: Uri;
    public fetched: Boolean = false;
    public metaDir: Uri;
    public extensionUri: Uri;
    private app;
    public dcmsEndpoint;
    public dicomJSONEndpoint;
    private endpoints = [];


    public constructor(uri: Uri, extensionUri: Uri, app){
        this._uri = uri;
        this.extensionUri = extensionUri;
        this.dir = vscode.Uri.file(path.dirname(this._uri.path));
        this.metaDir = vscode.Uri.joinPath(this.extensionUri, randomUUID());
        vscode.workspace.fs.createDirectory(this.metaDir);
        this.app = app;
        this.dcmsEndpoint = `/${randomUUID()}`;
        this.dicomJSONEndpoint = `/${randomUUID()}`;
        
        this.endpoints = [this.app.use(this.dcmsEndpoint, express.static(this.dir.path)), this.app.use(this.dicomJSONEndpoint, express.static(this.metaDir.path))];
    }
    get uri(){return this._uri;}
    dispose(): void {
        vscode.workspace.fs.delete(this.metaDir, {recursive: true});
    }
}

export class DcmView implements CustomReadonlyEditorProvider{
    
    private extensionUri: Uri;
    private port: string | number;
    private app;
    
    public constructor(extensionUri: Uri, port: string | number, app){
        this.extensionUri = extensionUri;
        this.port = port;
        this.app = app;
    }

    openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
        return new DcmViewDocument(uri, this.extensionUri, this.app);
    }

    async resolveCustomEditor(document: DcmViewDocument, panel: WebviewPanel, token: CancellationToken): Promise<void> {
        panel.webview.options = {enableScripts: true, localResourceRoots: [this.extensionUri, document.dir, document.metaDir]};
        const jsonUri = vscode.Uri.joinPath(document.metaDir, "dicom.json");
        
        const json = await convertDICOMToJSON(document.dir.path, `http://localhost:${this.port}${document.dcmsEndpoint}/`, jsonUri.path);
        
        const OHIFUri = encodeURI(`http://localhost:${this.port}/viewer/dicomjson?url=${document.dicomJSONEndpoint}/dicom.json?StudyInstanceUIDs=${json.studies[0]["StudyInstanceUID"]}`);
        
        panel.webview.html = `
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <title>Test Layout</title>
                <style type="text/css">
                    body, html
                    {
                        margin: 0; padding: 0; height: 100%; overflow: hidden;
                    }

                    #content
                    {
                        position:absolute; left: 0; right: 0; bottom: 0; top: 0px; 
                    }
                </style>
            </head>
            <body>
                <div id="content">
                    <iframe width="100%" height="100%" frameborder="0" src="${OHIFUri}"></iframe>
                </div>
            </body>
        </html>
        `;
	}
}