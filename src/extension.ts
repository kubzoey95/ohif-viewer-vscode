import * as vscode from 'vscode';
import { DcmView } from './editor';

export function activate(context: vscode.ExtensionContext) {
    const provider = new DcmView(context.extensionUri, context.globalStorageUri);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(
        'dcmView', provider,
        { webviewOptions: { retainContextWhenHidden: true } }
    ));
    context.subscriptions.push(vscode.commands.registerCommand('ohif-viewer.openFolder', async (uri?: vscode.Uri) => {
        if (!uri) {
            const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false,
                canSelectMany: false, openLabel: 'Open in OHIF Viewer' });
            uri = folders?.[0];
        }
        if (!uri) { return; }
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (!(stat.type & vscode.FileType.Directory)) { throw new Error('Select a folder to open in OHIF Viewer.'); }
            await provider.openFolder(uri);
        } catch (error) {
            void vscode.window.showErrorMessage(`Unable to open DICOM folder: ${String(error)}`);
        }
    }));
}
