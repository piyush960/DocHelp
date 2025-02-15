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
        // Remove duplicates based on URL
        const uniqueResults = results.reduce((acc, curr) => {
            if (!acc.find(item => item.page.url === curr.page.url)) {
                acc.push(curr);
            }
            return acc;
        }, [] as typeof results);
    
        return `
            <div class="search-results">
                <h2>Search Results</h2>
                ${uniqueResults.map(({page, relevance}) => `
                    <div class="search-result">
                        <h3>
                            <a href="${page.url}" class="search-result-link">
                                ${page.title}
                            </a>
                        </h3>
                        <div class="relevance">Match Score: ${relevance}</div>
                        <div class="preview">
                            ${page.content
                                .replace(/<[^>]*>/g, '') // Remove HTML tags
                                .substring(0, 200)}...
                        </div>
                    </div>
                `).join('')}
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