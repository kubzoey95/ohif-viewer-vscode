import * as vscode from 'vscode';
import { DcmView } from './editor';

export function activate(context: vscode.ExtensionContext) {

	vscode.window.registerCustomEditorProvider("dcmView", new DcmView(context.extensionUri));
}
export function deactivate() { }