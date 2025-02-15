import * as vscode from 'vscode';
import fetch, { Response } from 'node-fetch';
import * as https from 'https';
import * as cheerio from 'cheerio';

export interface FetchOptions {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
}

export interface DocPage {
    url: string;
    title: string;
    content: string;
    links: Array<{
        text: string;
        href: string;
        isAnchor?: boolean;
    }>;
}

export class NetworkHandler {
    private static instance: NetworkHandler;
    private agent: https.Agent;
    
    private constructor() {
        this.agent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 3000,
            maxSockets: 10,
            timeout: 10000,
            rejectUnauthorized: false
        });
    }

    static getInstance(): NetworkHandler {
        if (!NetworkHandler.instance) {
            NetworkHandler.instance = new NetworkHandler();
        }
        return NetworkHandler.instance;
    }

    async fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
        // Remove hash from URL before fetching
        const urlWithoutHash = url.split('#')[0];
        const {
            timeout = 10000,
            maxRetries = 3,
            retryDelay = 1000
        } = options;

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response = await fetch(urlWithoutHash, {
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
            } catch (error) {
                lastError = error as Error;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                    vscode.window.showInformationMessage(`Retrying fetch attempt ${attempt + 1}/${maxRetries}...`);
                }
            }
        }

        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    async fetchAndProcessPage(url: string): Promise<DocPage | null> {
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
                $(elem).parent().addClass(`syntax-highlight ${language}`);
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
                } else if (!href.startsWith('http')) {
                    $(el).attr('href', new URL(href, baseUrl).toString());
                }
            });

            $('img[src]').each((_, el) => {
                const src = $(el).attr('src');
                if (src && !src.startsWith('http')) {
                    $(el).attr('src', new URL(src, baseUrl).toString());
                }
            });

            let content = $('.content, article, main').length
                ? $('.content, article, main').html()?.trim() || ''
                : $('body').html()?.trim() || '';
            
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
                    if (link.isAnchor) return true;
                    try {
                        const linkUrl = new URL(link.href, baseUrl);
                        return linkUrl.origin === baseUrl.origin;
                    } catch {
                        return false;
                    }
                });

            // If there's a hash in the URL, add a script to scroll to it
            if (hash) {
                content = `${content}<script>
                    setTimeout(() => {
                        const element = document.getElementById('${hash}');
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                </script>`;
            }

            return {
                url,
                title: $('title').text().trim(),
                content,
                links
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch page ${url}: ${error}`);
            return null;
        }
    }
}