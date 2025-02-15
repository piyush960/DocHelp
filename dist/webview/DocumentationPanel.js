"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentationPanel = void 0;
const vscode = require("vscode");
const chatHandler_1 = require("../utils/chatHandler");
const fs_1 = require("fs");
const path = require("path");
class DocumentationPanel {
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this.chatHandler = new chatHandler_1.ChatHandler();
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'search':
                    vscode.commands.executeCommand('documentation-viewer.search', message.text);
                    return;
                case 'navigate':
                    vscode.commands.executeCommand('documentation-viewer.navigate', message.url);
                    return;
                case 'chatMessage':
                    this.chatHandler.handleMessage(message.text, this);
                    return;
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (DocumentationPanel.currentPanel) {
            DocumentationPanel.currentPanel._panel.reveal(column);
            return DocumentationPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('documentationViewer', 'Documentation Viewer', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'media'),
                vscode.Uri.joinPath(extensionUri, 'dist')
            ]
        });
        DocumentationPanel.currentPanel = new DocumentationPanel(panel, extensionUri);
        return DocumentationPanel.currentPanel;
    }
    updateContent(content) {
        this._panel.webview.postMessage({
            command: 'updateContent',
            content
        });
        // Update chat context when content changes
        this.chatHandler.updateContext(content);
    }
    postMessage(message) {
        this._panel.webview.postMessage(message);
    }
    _getWebviewContent(webview, extensionUri) {
        const filePath = path.resolve(__dirname, './documentation.html');
        console.log(filePath);
        const file = (0, fs_1.readFileSync)(filePath, 'utf8');
        return `${file}`;
    }
    dispose() {
        DocumentationPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
exports.DocumentationPanel = DocumentationPanel;
//# sourceMappingURL=DocumentationPanel.js.map