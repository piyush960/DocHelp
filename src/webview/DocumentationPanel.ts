import * as vscode from 'vscode';
import { ChatHandler } from '../utils/chatHandler';

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
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Documentation Viewer</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    font-family: var(--vscode-font-family);
                }
                
                .container {
                    display: grid;
                    grid-template-columns: 300px 1fr;
                    height: 100vh;
                    overflow: hidden;
                }
                
                .sidebar {
                    border-right: 1px solid var(--vscode-panel-border);
                    height: 100vh;
                    overflow-y: auto;
                    padding: 20px;
                    background-color: var(--vscode-sideBar-background);
                }
                
                .search-container {
                    position: sticky;
                    top: 0;
                    background-color: var(--vscode-sideBar-background);
                    padding-bottom: 10px;
                    z-index: 10;
                }
                
                .search-box {
                    width: 100%;
                    padding: 8px;
                    margin-bottom: 10px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                
                .navigation {
                    padding-top: 10px;
                }
                
                .nav-item {
                    padding: 8px;
                    margin: 2px 0;
                    cursor: pointer;
                    border-radius: 3px;
                    color: var(--vscode-sideBarTitle-foreground);
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }
                
                .nav-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                    color: var(--vscode-list-hoverForeground);
                }
                
                .nav-item.active {
                    background-color: var(--vscode-list-activeSelectionBackground);
                    color: var(--vscode-list-activeSelectionForeground);
                }
                
                .main-content {
                    height: 100vh;
                    overflow-y: auto;
                    padding: 20px 40px;
                }
                
                .content img {
                    max-width: 100%;
                    height: auto;
                }
                
                pre {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 16px;
                    border-radius: 4px;
                    overflow-x: auto;
                    margin: 16px 0;
                }
                
                code {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                }
                
                /* Loading indicator */
                .loading {
                    display: none;
                    text-align: center;
                    padding: 20px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                }
                
                .loading.visible {
                    display: block;
                }

                .top-bar {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    align-items: center;
                    padding: 10px 20px;
                    display: flex;
                    gap: 8px;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .top-search {
                    width: 300px;
                    padding: 8px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }

                .chatbot-panel {
                    grid-column: 1;
                    grid-row: 3;
                    border-top: 1px solid var(--vscode-panel-border);
                    border-right: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                    display: flex;
                    flex-direction: column;
                    padding: 10px;
                    position: absolute;
                    bottom: 10px;
                    right: 10px;
                    max-width: 500px;
                }
                
                .chat-messages {
                    flex-grow: 1;
                    overflow-y: auto;
                    margin-bottom: 10px;
                    padding: 10px;
                    background: var(--vscode-input-background);
                    border-radius: 4px;
                }

                .chat-input-container {
                    display: flex;
                    gap: 8px;
                }
                
                .chat-input {
                    flex-grow: 1;
                    padding: 8px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                
                .chat-send {
                    padding: 8px 16px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                }

                .chat-send:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .chat-message {
                    margin: 8px 0;
                    padding: 8px;
                    border-radius: 4px;
                    background: var(--vscode-editor-background);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="top-bar">
                    <input type="text" class="top-search" placeholder="Intelligent search...">
                    <button class="chat-send">Search</button>
                </div>
                <div class="sidebar">
                    <div class="search-container">
                        <input type="text" class="search-box" placeholder="Search documentation...">
                    </div>
                    <div id="navigation" class="navigation"></div>
                </div>
                <div class="chatbot-panel">
                    <div id="chat-messages" class="chat-messages">
                        
                    </div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" placeholder="Ask a question...">
                        <button class="chat-send">Send</button>
                    </div>
                </div>
                <div class="main-content">
                    <div id="content" class="content"></div>
                    <div id="loading" class="loading">Loading...</div>
                </div>
            </div>
            <script>
            const vscode = acquireVsCodeApi();
            let currentUrl = '';
            
            // Handle search
            const searchBox = document.querySelector('.search-box');
            searchBox.addEventListener('input', debounce((e) => {
                vscode.postMessage({
                    command: 'search',
                    text: e.target.value
                });
            }, 300));
            
            // Debounce function
            function debounce(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            }
            
            // Handle all link clicks within the content
            document.getElementById('content').addEventListener('click', (e) => {
                if (e.target.tagName === 'A') {
                    e.preventDefault();
                    const href = e.target.getAttribute('href');
                    if (href) {
                        vscode.postMessage({
                            command: 'navigate',
                            url: href
                        });
                    }
                }
            });
            
            // Handle navigation clicks
            document.getElementById('navigation').addEventListener('click', (e) => {
                const navItem = e.target.closest('.nav-item');
                if (navItem) {
                    const url = navItem.dataset.href;
                    if (url) {
                        // Update active state
                        document.querySelectorAll('.nav-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        navItem.classList.add('active');
                        
                        // Navigate to the URL
                        vscode.postMessage({
                            command: 'navigate',
                            url: url
                        });
                        
                        currentUrl = url;
                    }
                }
            });

            const chatInput = document.querySelector('.chat-input');
            const chatSendButton = document.querySelector('.chat-send');
            const chatMessages = document.getElementById('chat-messages');

            // Function to send chat message
            function sendChatMessage() {
                const message = chatInput.value.trim();
                if (message) {
                    vscode.postMessage({
                        command: 'chatMessage',
                        text: message
                    });
                    chatInput.value = '';
                }
            }

            // Send button click handler
            chatSendButton.addEventListener('click', sendChatMessage);

            // Enter key handler
                chatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                    }
            });


            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'addChatMessage':
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'chat-message';
                        const role = message.message.role === 'user' ? 'You' : 'Bot';
                        
                        // Handle code blocks in the response
                        let content = message.message.content;
                        messageDiv.innerHTML = \`<strong>\${role}:</strong> \${content}\`;
                        chatMessages.appendChild(messageDiv);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                        break;
                    case 'updateContent':
                        document.getElementById('content').innerHTML = message.content;
                        document.getElementById('loading').classList.remove('visible');
                        
                        // Handle any hash in the URL after content update
                        const hash = window.location.hash;
                        if (hash) {
                            setTimeout(() => {
                                const element = document.querySelector(hash);
                                if (element) {
                                    element.scrollIntoView({ behavior: 'smooth' });
                                }
                            }, 100);
                        }
                        break;
                        
                    case 'updateNavigation':
                        const nav = document.getElementById('navigation');
                        nav.innerHTML = message.items
                            .map(item => {
                                const isActive = item.href === currentUrl ? 'active' : '';
                                return \`<div class="nav-item \${isActive}" data-href="\${item.href}" title="\${item.text}">\${item.text}</div>\`;
                            })
                            .join('');
                        break;
                        
                    case 'showLoading':
                        document.getElementById('loading').classList.add('visible');
                        break;
                }
            });
            
            // Initial state setup
            document.getElementById('loading').classList.add('visible');
        </script>
        </body>
        </html>`;
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