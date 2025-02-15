import * as vscode from 'vscode';
import { DocumentationPanel } from './webview/DocumentationPanel';
import { NetworkHandler, DocPage } from './utils/networkHandler';


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

    async search(query: string): Promise<Array<{
        page: DocPage,
        relevance: number
    }>> {
        const results = Array.from(this.pages.values())
            .map(page => ({
                page,
                relevance: this.calculateRelevance(page, query)
            }))
            .filter(result => result.relevance > 0)
            .sort((a, b) => b.relevance - a.relevance);

        if (this.panel) {
            const searchContent = this.renderSearchResults(results);
            this.panel.updateContent(searchContent);
        }

        return results;
    }

    private calculateRelevance(page: DocPage, query: string): number {
        const searchTerms = query.toLowerCase().split(' ');
        let score = 0;

        const titleLower = page.title.toLowerCase();
        const contentLower = page.content.toLowerCase();

        searchTerms.forEach(term => {
            // Title matches weighted higher
            if (titleLower.includes(term)) {
                score += 10;
            }
            
            // Content matches
            const contentMatches = contentLower.split(term).length - 1;
            score += contentMatches;
            
            // URL relevance
            if (page.url.toLowerCase().includes(term)) {
                score += 5;
            }
        });

        return score;
    }

    private renderSearchResults(results: Array<{page: DocPage, relevance: number}>): string {
        return `
            <div class="search-results">
                <h2>Search Results</h2>
                ${results.map(({page, relevance}) => `
                    <div class="search-result" data-url="${page.url}">
                        <h3>${page.title}</h3>
                        <div class="relevance">Relevance: ${relevance}</div>
                        <div class="preview">
                            ${page.content.substring(0, 200)}...
                        </div>
                    </div>
                `).join('')}
            </div>
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