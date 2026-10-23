<h1>OHIF Viewer</h1>
Display DICOM files using OHIF Viewer in Visual Studio Code.
Click on any *.dcm file and OHIF Viewer will display corresponding series.
Right-click a folder in the Explorer and choose **Open Folder in OHIF Viewer** to
recursively index all its studies and series. Files are detected by their DICOM
header, including extensionless files and files with other extensions. Symbolic
link directories are skipped to avoid cycles. You can also run **Open Folder in
OHIF Viewer** from the Command Palette.

```
ext install kubzoey95.ohif-viewer
```

![OHIF Viewer in VS Code](https://github.com/kubzoey95/ohif-viewer-vscode/blob/master/view.png?raw=true)

OHIF runs directly in the VS Code editor webview. No local HTTP server, port
forwarding, or separate browser window is needed. Opening a DICOM file loads its
series from files in the same directory. Indexing reads headers without parsing
pixel data; OHIF then loads images on demand and preloads nearby slices in the
background. The viewer starts alongside indexing and displays its progress.

`Viewers` is pinned to OHIF stable tag [`v3.13.13`](https://github.com/OHIF/Viewers/releases/tag/v3.13.13)
(`1fa151f5133934c953a2ab4c0056ca91f929c32f`). Initialize it with
`git submodule update --init Viewers`. `npm install` and viewer builds apply the
tracked compatibility patches in `patches/`, including local multiframe URLs.

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
