# Changelog

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
