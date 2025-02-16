import * as vscode from 'vscode';
import { ChatHandler } from '../utils/chatHandler';
import { readFileSync } from 'fs';
import path = require('path');

export class DocumentationPanel {
    public static currentPanel: DocumentationPanel | undefined;
    private  _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private chatHandler: ChatHandler;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this.chatHandler = new ChatHandler();

        this._panel.webview.onDidReceiveMessage(
            message => {
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
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri): DocumentationPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DocumentationPanel.currentPanel) {
            DocumentationPanel.currentPanel._panel.reveal(column);
            return DocumentationPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'documentationViewer',
            'Documentation Viewer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        DocumentationPanel.currentPanel = new DocumentationPanel(panel, extensionUri);
        return DocumentationPanel.currentPanel;
    }

    public updateContent(content: string) {
        this._panel.webview.postMessage({ 
            command: 'updateContent', 
            content 
        });
        // Update chat context when content changes
        this.chatHandler.updateContext(content);
    }

    public postMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
        const filePath = path.resolve(__dirname, './documentation.html');
        console.log(filePath)
        const file = readFileSync(filePath, 'utf8');        
        return `${file}`;
    }

    public dispose() {
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