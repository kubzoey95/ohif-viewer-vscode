# Changelog

## 1.0.9

- Pin the OHIF viewer to stable release v3.13.13 and preserve local compatibility fixes as tracked patches.
- Fix `RangeError: Invalid string length` when opening enhanced multiframe CT by storing functional group metadata once per DICOM instance.
- Select distinct frame URLs for local multiframe images so individual slices render and navigation works.
- Include bundled fonts and nested decoder assets in the packaged viewer.

## 1.0.8

- Index DICOM headers without parsing pixel data, using bounded concurrent reads and an in-memory metadata cache.
- Start the viewer alongside indexing with visible progress and prioritize interactive images over background requests.

## 1.0.7

- Run OHIF directly inside the VS Code editor webview, without a local HTTP server or iframe.
- Load local DICOM series through VS Code resource URLs.
- Fix JPEG 2000 decoding in webviews by preparing worker scripts and codecs in the editor.
- Preserve the webview identity when opening viewer routes.
- Disable the investigational-use startup confirmation.
- Retain the viewer when switching editor tabs and improve series metadata and error handling.
