<h1>OHIF Viewer</h1>
Display DICOM files using OHIF Viewer in Visual Studio Code.
Click on any *.dcm file and OHIF Viewer will display corresponding series.

```
ext install kubzoey95.ohif-viewer
```

![alt text](https://github.com/kubzoey95/ohif-viewer-vscode/blob/master/view.png?raw=true)

OHIF runs directly in the VS Code editor webview. No local HTTP server, port
forwarding, or separate browser window is needed. Opening a DICOM file loads its
series from files in the same directory.

To build the extension, use Node.js 24 or newer with Corepack enabled:

```sh
npm install
npm run compile
```

Launch the extension in a VS Code Extension Development Host and open a `.dcm`
file. Use **Reopen Editor With → OHIF Viewer** if another editor is selected.
For extension-only changes with viewer assets already built, run
`npm run compile-extension`.
