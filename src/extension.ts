import * as vscode from 'vscode';
import { DocumentationPanel } from './webview/DocumentationPanel';
import { NetworkHandler, DocPage } from './utils/networkHandler';
import axios from 'axios';
import { GeminiService } from './utils/geminiServices';


export class DocumentationManager {
    private pages: Map<string, DocPage> = new Map();
    private baseUrl: string = '';
    private panel: DocumentationPanel | undefined;
    private networkHandler: NetworkHandler;
    private fetchQueue: Set<string> = new Set();
    private processingQueue: boolean = false;
    private geminiService: GeminiService;

    constructor(private context: vscode.ExtensionContext) {
        this.networkHandler = NetworkHandler.getInstance();
        this.geminiService =  GeminiService.getInstance();
    }

    async initialize(documentationUrl: string) {
        try {
            this.baseUrl = new URL(documentationUrl).origin;
            const mainPage = await this.networkHandler.fetchAndProcessPage(documentationUrl);
            
            if (mainPage) {
                this.pages.set(documentationUrl, mainPage);
                this.panel = DocumentationPanel.createOrShow(this.context.extensionUri);
                this.panel.updateContent(mainPage.content);
                this.panel.postMessage({
                    command: 'updateNavigation',
                    items: mainPage.links
                });
                this.panel.postMessage({
                    command: 'intializeURL',
                    url: documentationUrl,
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

        const searchResult = await axios.post('YOUR_BACKEND_URL/intelligent-search',{links : this.networkHandler.getLink(),query : query});
        
        if (!(searchResult.status == 200)){
            vscode.window.showErrorMessage('Error From Backend');
            return;
        }
        const context = `${searchResult.data.text} \n\ngive appropriate response from your side. \n\nThe document is available at: ${searchResult.data.best_match}`;
        
        await this.navigate(searchResult.data.best_match);
        const forums = await this.fetchForumsResults(query);
        const chatbot_response = await this.geminiService.generateResponse(query, context);

        this.panel?.postMessage({
            command: 'addChatMessage',
            message: {
                role: 'assistant',
                content: chatbot_response
            }
        });

        this.panel?.postMessage({
            command: 'addRecommendation',
            message: {recommended_links: searchResult.data.recommended_links, forums: forums.data}
        });
        
        return searchResult;
    }

    getDomainName(url: string) {
        let hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    }

    async fetchForumsResults (query:string){
        const options = {
            method: 'GET',
            url: 'https://real-time-forums-search.p.rapidapi.com/search',
            params: {
              query: query + ` in ${this.getDomainName(this.baseUrl)}`,
              time: 'any',
              start: '0',
              country: 'us',
              language: 'en'
            },
            headers: {
              'x-rapidapi-key': 'YOUR_RAPID_API_KEY',
              'x-rapidapi-host': 'real-time-forums-search.p.rapidapi.com'
            }
          };
          
          try {
              const response = await axios.request(options);
              return response.data;
          } catch (error) {
              console.error(error);
          }
        return [];
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
        async (text:string) => {
            if (text) {
                await docManager.search(text);
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