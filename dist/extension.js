"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = exports.DocumentationManager = void 0;
const vscode = require("vscode");
const DocumentationPanel_1 = require("./webview/DocumentationPanel");
const networkHandler_1 = require("./utils/networkHandler");
const axios_1 = require("axios");
const geminiServices_1 = require("./utils/geminiServices");
class DocumentationManager {
    constructor(context) {
        this.context = context;
        this.pages = new Map();
        this.baseUrl = '';
        this.fetchQueue = new Set();
        this.processingQueue = false;
        this.networkHandler = networkHandler_1.NetworkHandler.getInstance();
        this.geminiService = geminiServices_1.GeminiService.getInstance();
    }
    async initialize(documentationUrl) {
        try {
            this.baseUrl = new URL(documentationUrl).origin;
            const mainPage = await this.networkHandler.fetchAndProcessPage(documentationUrl);
            if (mainPage) {
                this.pages.set(documentationUrl, mainPage);
                this.panel = DocumentationPanel_1.DocumentationPanel.createOrShow(this.context.extensionUri);
                this.panel.updateContent(mainPage.content);
                this.panel.postMessage({
                    command: 'updateNavigation',
                    items: mainPage.links
                });
                this.panel.postMessage({
                    commands: 'intializeURL',
                    url: documentationUrl
                });
                // Queue linked pages for background processing
                this.queueLinkedPages(mainPage.links);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to initialize documentation: ${error}`);
        }
    }
    async queueLinkedPages(links) {
        for (const link of links) {
            if (!this.pages.has(link.href) && !this.fetchQueue.has(link.href)) {
                this.fetchQueue.add(link.href);
            }
        }
        if (!this.processingQueue) {
            this.processQueue();
        }
    }
    async processQueue() {
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
            }
            catch (error) {
                console.error(`Failed to fetch ${url}:`, error);
            }
            // Add a delay between requests to be respectful to the server
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.processingQueue = false;
    }
    async navigate(url) {
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to navigate to ${url}: ${error}`);
        }
    }
    async search(query) {
        const searchResult = await axios_1.default.post('https://5654-103-81-39-74.ngrok-free.app/intelligent-search', { links: this.networkHandler.getLink(), query: query });
        if (!(searchResult.status == 200)) {
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
            message: { recommended_links: searchResult.data.recommended_links, forums: forums.data }
        });
        return searchResult;
    }
    getDomainName(url) {
        let hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    }
    async fetchForumsResults(query) {
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
                'x-rapidapi-key': '1dc3581a84mshdcf979fd41a22a8p1bcc2ajsnd841021890c1',
                'x-rapidapi-host': 'real-time-forums-search.p.rapidapi.com'
            }
        };
        try {
            const response = await axios_1.default.request(options);
            return response.data;
        }
        catch (error) {
            console.error(error);
        }
        return [];
    }
}
exports.DocumentationManager = DocumentationManager;
function activate(context) {
    const docManager = new DocumentationManager(context);
    // Register load documentation command
    let loadDocsCommand = vscode.commands.registerCommand('documentation-viewer.loadDocs', async () => {
        const url = await vscode.window.showInputBox({
            prompt: 'Enter documentation URL',
            placeHolder: 'https://flask.palletsprojects.com/en/latest/'
        });
        if (url) {
            await docManager.initialize(url);
            vscode.window.showInformationMessage('Documentation loaded successfully');
        }
    });
    // Register search command
    let searchCommand = vscode.commands.registerCommand('documentation-viewer.search', async (text) => {
        if (text) {
            await docManager.search(text);
        }
    });
    let navigateCommand = vscode.commands.registerCommand('documentation-viewer.navigate', async (url) => {
        await docManager.navigate(url);
    });
    context.subscriptions.push(loadDocsCommand, searchCommand, navigateCommand);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map