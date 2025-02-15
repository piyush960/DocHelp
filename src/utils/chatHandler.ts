import * as vscode from 'vscode';
import { GeminiService } from './geminiServices';

export class ChatHandler {
    private geminiService: GeminiService;
    private currentContext: string = '';

    constructor() {
        this.geminiService = GeminiService.getInstance();
    }

    updateContext(content: string) {
        this.currentContext = content;
    }

    async handleMessage(message: string, panel: any): Promise<void> {
        try {
            // Add user message to chat
            panel.postMessage({
                command: 'addChatMessage',
                message: {
                    role: 'user',
                    content: message
                }
            });

            // Generate response using Gemini
            const response = await this.geminiService.generateResponse(message, this.currentContext);
            const formattedResponse = response.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');

            // Add bot response to chat
            panel.postMessage({
                command: 'addChatMessage',
                message: {
                    role: 'assistant',
                    content: formattedResponse
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Chat error: ${error}`);
            panel.postMessage({
                command: 'addChatMessage',
                message: {
                    role: 'assistant',
                    content: 'Sorry, I encountered an error processing your request.'
                }
            });
        }
    }
}