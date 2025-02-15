import * as vscode from 'vscode';
import { DocumentationPanel } from './webview/DocumentationPanel';
import { NetworkHandler, DocPage } from './utils/networkHandler';
import axios from 'axios';


export class DocumentationManager {
    private pages: Map<string, DocPage> = new Map();
    private baseUrl: string = '';
    private panel: DocumentationPanel | undefined;
    private networkHandler: NetworkHandler;
    private fetchQueue: Set<string> = new Set();
    private processingQueue: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        this.networkHandler = NetworkHandler.getInstance();
    }

    async initialize(documentationUrl: string) {
        try {
            this.baseUrl = new URL(documentationUrl).origin;
            const mainPage = await this.networkHandler.fetchAndProcessPage(documentationUrl);
            
            if (mainPage) {
                this.pages.set(documentationUrl, mainPage);
                console.log(mainPage)
                this.panel = DocumentationPanel.createOrShow(this.context.extensionUri);
                this.panel.updateContent(mainPage.content);
                this.panel.postMessage({
                    command: 'updateNavigation',
                    items: mainPage.links
                });

                // Queue linked pages for background processing
                this.queueLinkedPages(mainPage.links);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to initialize documentation: ${error}`);
        }
    }

    private async queueLinkedPages(links: Array<{href: string}>) {
        for (const link of links) {
            if (!this.pages.has(link.href) && !this.fetchQueue.has(link.href)) {
                this.fetchQueue.add(link.href);
            }
        }
        
        if (!this.processingQueue) {
            this.processQueue();
        }
    }

    private async processQueue() {
        this.processingQueue = true;
        
        while (this.fetchQueue.size > 0) {
            const [url] = this.fetchQueue;
            this.fetchQueue.delete(url);
            
            try {
                const page = await this.networkHandler.fetchAndProcessPage(url);
                if (page) {
                    this.pages.set(url, page);
                    // Queue new links with a delay to prevent overwhelming the server
                    setTimeout(() => this.queueLinkedPages(page.links), 500);
                }
            } catch (error) {
                console.error(`Failed to fetch ${url}:`, error);
            }
            
            // Add a delay between requests to be respectful to the server
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.processingQueue = false;
    }

    public async navigate(url: string) {
        try {
            // Show loading state
            if (this.panel) {
                this.panel.postMessage({ command: 'showLoading' });
            }
    
            const page = await this.networkHandler.fetchAndProcessPage(url);
            
            if (page && this.panel) {
                this.pages.set(url, page);
                this.panel.updateContent(page.content);
                this.panel.postMessage({
                    command: 'updateNavigation',
                    items: page.links
                });
                
                // Queue background fetching of linked pages
                this.queueLinkedPages(page.links);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to navigate to ${url}: ${error}`);
        }
    }

    async search(query: string){

        const searchResult = await axios.post('https://5654-103-81-39-74.ngrok-free.app/intelligent-search',{links : this.networkHandler.getLink(),query : query});
        
        if (this.panel) {
            const searchContent = this.renderSearchResults(searchResult);
            this.panel.updateContent(searchContent);
        }

        return searchResult;
    }


    private renderSearchResults(results: any): string {
    
        return `
            <div class="search-results">
                <h2>Search Results</h2>
                ${results.data.text}
            </div>
            <style>
                .search-result {
                    padding: 16px;
                    margin: 16px 0;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background: var(--vscode-editor-background);
                }

                .search-result h3 {
                    margin: 0 0 8px 0;
                }

                .search-result-link {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }

                .search-result-link:hover {
                    color: var(--vscode-textLink-activeForeground);
                    text-decoration: underline;
                }

                .relevance {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 8px;
                }

                .preview {
                    color: var(--vscode-foreground);
                    font-size: 0.95em;
                    line-height: 1.4;
                }
            </style>
            <script>
                document.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const searchResultLink = target.closest('.search-result-link');
                
                if (searchResultLink instanceof HTMLAnchorElement) {
                    e.preventDefault();
                    const href = searchResultLink.getAttribute('href');
                    if (href) {
                        vscode.postMessage({
                            command: 'navigate',
                            url: href
                        });
                        
                        // Update current URL and active state in navigation
                        currentUrl = href;
                        document.querySelectorAll('.nav-item').forEach(item => {
                            item.classList.remove('active');
                            if (item instanceof HTMLElement && item.dataset.href === href) {
                                item.classList.add('active');
                            }
                        });
                    }
                }
            });
            </script>

        `;
    }
}

export function activate(context: vscode.ExtensionContext) {
    const docManager = new DocumentationManager(context);

    // Register load documentation command
    let loadDocsCommand = vscode.commands.registerCommand(
        'documentation-viewer.loadDocs',
        async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter documentation URL',
                placeHolder: 'https://flask.palletsprojects.com/en/latest/'
            });

            if (url) {
                await docManager.initialize(url);
                vscode.window.showInformationMessage('Documentation loaded successfully');
            }
        }   
    );

    // Register search command
    let searchCommand = vscode.commands.registerCommand(
        'documentation-viewer.search',
        async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search documentation'
            });

            if (query) {
                await docManager.search(query);
            }
        }
    );

    let navigateCommand = vscode.commands.registerCommand(
        'documentation-viewer.navigate',
        async (url: string) => {
            await docManager.navigate(url);
        }
    );

    context.subscriptions.push(loadDocsCommand, searchCommand, navigateCommand);
}

export function deactivate() {}