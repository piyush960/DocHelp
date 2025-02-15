"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatHandler = void 0;
const vscode = require("vscode");
const geminiServices_1 = require("./geminiServices");
class ChatHandler {
    constructor() {
        this.currentContext = '';
        this.geminiService = geminiServices_1.GeminiService.getInstance();
    }
    updateContext(content) {
        this.currentContext = content;
    }
    async handleMessage(message, panel) {
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
            // Add bot response to chat
            panel.postMessage({
                command: 'addChatMessage',
                message: {
                    role: 'assistant',
                    content: response
                }
            });
        }
        catch (error) {
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
exports.ChatHandler = ChatHandler;
//# sourceMappingURL=Chathandler.js.map