"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkHandler = void 0;
const vscode = require("vscode");
const node_fetch_1 = require("node-fetch");
const https = require("https");
const cheerio = require("cheerio");
class NetworkHandler {
    constructor() {
        this.getLink = () => {
            return this.linksTuples;
        };
        this.agent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 3000,
            maxSockets: 10,
            timeout: 10000,
            rejectUnauthorized: false
        });
        this.linksTuples = [];
    }
    static getInstance() {
        if (!NetworkHandler.instance) {
            NetworkHandler.instance = new NetworkHandler();
        }
        return NetworkHandler.instance;
    }
    async fetchWithRetry(url, options = {}) {
        // Remove hash from URL before fetching
        const urlWithoutHash = url.split('#')[0];
        const { timeout = 10000, maxRetries = 3, retryDelay = 1000 } = options;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                const response = await (0, node_fetch_1.default)(urlWithoutHash, {
                    agent: this.agent,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'VSCode-Documentation-Viewer',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            }
            catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                    vscode.window.showInformationMessage(`Retrying fetch attempt ${attempt + 1}/${maxRetries}...`);
                }
            }
        }
        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }
    async fetchAndProcessPage(url) {
        try {
            const [urlWithoutHash, hash] = url.split('#');
            const response = await this.fetchWithRetry(urlWithoutHash);
            const html = await response.text();
            const $ = cheerio.load(html);
            // Clean up content
            $('.navigation, .footer, .header, .sidebar').remove();
            // Process code blocks
            $('pre code').each((_, elem) => {
                const language = $(elem).attr('class')?.replace('language-', '') || 'text';
                $(elem).parent().addClass(`language-python`);
            });
            // Add IDs to headings if they don't have them
            $('h1, h2, h3, h4, h5, h6').each((_, elem) => {
                if (!$(elem).attr('id')) {
                    const id = $(elem).text().toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    $(elem).attr('id', id);
                }
            });
            // Handle relative URLs in links and images
            const baseUrl = new URL(urlWithoutHash);
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href') || '';
                if (href.startsWith('#')) {
                    $(el).attr('data-anchor', 'true');
                    $(el).attr('href', `${urlWithoutHash}${href}`);
                }
                else if (!href.startsWith('http')) {
                    $(el).attr('href', new URL(href, baseUrl).toString());
                }
            });
            $('img[src]').each((_, el) => {
                const src = $(el).attr('src');
                if (src && !src.startsWith('http')) {
                    $(el).attr('src', new URL(src, baseUrl).toString());
                }
            });
            let content = $('body').html()?.trim();
            const links = $('a[href]')
                .map((_, el) => {
                const href = $(el).attr('href') || '';
                const isAnchor = $(el).attr('data-anchor') === 'true';
                return {
                    text: $(el).text().trim(),
                    href,
                    isAnchor
                };
            })
                .get()
                .filter(link => {
                if (link.isAnchor)
                    return true;
                try {
                    const linkUrl = new URL(link.href, baseUrl);
                    return linkUrl.origin === baseUrl.origin;
                }
                catch {
                    return false;
                }
            })
                .filter((value, index, self) => {
                // Filter out links with empty or invalid text and duplicates
                let isValidText = '';
                if (value.text.length == 1) {
                    isValidText = value.href.split("#")[1];
                    value.text = isValidText;
                }
                else if (value.text.length > 1) {
                    isValidText = value.text;
                }
                const isDuplicate = self.findIndex(link => link.href === value.href) !== index;
                return isValidText && !isDuplicate;
            });
            //push to linksTuples (text , url) , no duplicate
            links.forEach(link => {
                const tuple = [link.text, link.href];
                if (!this.linksTuples.some(([t, h]) => t === tuple[0] && h === tuple[1])) {
                    this.linksTuples.push(tuple);
                }
            });
            // If there's a hash in the URL, add a script to scroll to it
            // if (hash) {
            //     content = `${content}<script>
            //         setTimeout(() => {
            //             const element = document.getElementById('${hash}');
            //             if (element) {
            //                 element.scrollIntoView({ behavior: 'smooth' });
            //             }
            //         }, 2000);
            //     </script>`;
            // }
            return {
                url,
                title: $('title').text().trim(),
                content,
                links
            };
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch page ${url}: ${error}`);
            return null;
        }
    }
}
exports.NetworkHandler = NetworkHandler;
//# sourceMappingURL=networkHandler.js.map