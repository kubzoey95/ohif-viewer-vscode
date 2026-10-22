<h1>OHIF Viewer</h1>
Display DICOM files using OHIF Viewer in Visual Studio Code.
Click on any *.dcm file and OHIF Viewer will display corresponding series.

```
ext install kubzoey95.ohif-viewer
```

![OHIF Viewer in VS Code](https://github.com/kubzoey95/ohif-viewer-vscode/blob/master/view.png?raw=true)

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


To create a Marketplace release, first build and test the viewer, then run:

```sh
npm run release:package
```

Packaging compiles the extension, applies the current OHIF configuration to the
existing viewer build, validates its assets, and runs TypeScript, lint, and
integration checks. The resulting `.vsix` includes the viewer and requires no
Node.js installation on the user's machine.

For the browser rendering check (requires the OHIF checkout's Playwright
installation and Chrome), run `OHIF_BROWSER_TEST=1 npm run test:webview`.
