import * as vscode from 'vscode';
import { CancellationToken, CustomDocument, CustomDocumentOpenContext, CustomReadonlyEditorProvider, Uri, WebviewPanel } from 'vscode';
import * as glob from 'glob';
import * as path from 'path';
import * as dicomParser from 'dicom-parser';
import { getImageData, getImageId } from './dicomUtils';
import { Worker } from 'worker_threads';

class DcmViewDocument implements CustomDocument{
    _uri: Uri;
    public dir: Uri;
    public fetched: Boolean = false;
    public constructor(uri: Uri){
        this._uri = uri;
        this.dir = vscode.Uri.file(path.dirname(this._uri.path));
    }
    get uri(){return this._uri;}
    dispose(): void {
        
    }
}

export class DcmView implements CustomReadonlyEditorProvider{
    
    private extensionUri: Uri;
    private workers: Array<Worker>;
    
    public constructor(extensionUri: Uri){
        this.extensionUri = extensionUri;
        this.workers = [];
        for (let i=0; i<32; i++){
            this.workers.push(new Worker(path.join(__dirname, "convertWorker.js")));
        }
    }

    openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
        return new DcmViewDocument(uri);
    }

    resolveCustomEditor(document: DcmViewDocument, panel: WebviewPanel, token: CancellationToken): void | Thenable<void> {
        panel.webview.options = {enableScripts: true, localResourceRoots: [this.extensionUri, document.dir]};
        
        let scriptSrc = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "web", "dist", "index.js"));

		let cssSrc = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "web", "dist", "index.css"));

		panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
          <head>
            <link rel="stylesheet" href="${cssSrc}" />
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script src="${scriptSrc}"></script>
          </body>
        </html>
        `;
        this.workers.map(async e => {
            e.on("message", m => {
                panel.webview.postMessage({msg: "array", array: m.out});
            });
        });
        panel.webview.onDidReceiveMessage(
            async message => {
                switch(message.msg){
                    case "ready":
                        if(!document.fetched){
                            const dirList = await glob.glob(path.join(document.dir.path, "*.dcm"));
                            panel.webview.postMessage({msg: "len", len: dirList.length});
                            const buffs = dirList.map(vscode.Uri.file).map(vscode.workspace.fs.readFile);
                            let ids = buffs.map(async e => {
                                const dcm = dicomParser.parseDicom(await e, {untilTag: 'x00200032'});
                                return getImageId(dcm);
                            });
                            //@ts-ignore
                            ids = await Promise.all(ids);
    
                            //@ts-ignore
                            ids.sort((a,b) => a-b);
    
                            panel.webview.postMessage({msg: "ids", ids: ids});
                            
                            buffs.map(async (e, i) => {
                                this.workers[i % this.workers.length].postMessage({data: await e});
                            });
                            document.fetched = true;
                        }
                        break;
                    default:
                        break;
                }
            }
          );
	}
}