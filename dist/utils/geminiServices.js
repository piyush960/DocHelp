"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const generative_ai_1 = require("@google/generative-ai");
class GeminiService {
    constructor() {
        const apiKey = 'GEMINI_API_KEY';
        if (!apiKey) {
            throw new Error('Gemini API key not configured');
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
    static getInstance() {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }
    formatChatResponse(chatbot_response) {
        // Escape existing HTML to prevent injection
        const escapedResponse = chatbot_response
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        const formattedResponse = escapedResponse
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Convert inline code (`code`)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Convert bold text (**bold** or __bold__)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            // Convert italic text (*italic* or _italic_)
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            // Convert headings (# H1 to ###### H6)
            .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
            .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
            .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            // Convert unordered lists (- or *)
            .replace(/^- (.*)$/gm, '<li>$1</li>')
            .replace(/^\* (.*)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>') // Wrap list items in <ul>
            // Convert ordered lists (1., 2., etc.)
            .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/g, '<ol>$1</ol>') // Wrap ordered lists in <ol>
            // Convert links [text](url)
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // Convert horizontal rules (--- or ***)
            .replace(/^(-{3,}|\*{3,})$/gm, '<hr>')
            // Preserve line breaks
            .replace(/\n/g, '<br>');
        return formattedResponse;
    }
    async generateResponse(prompt, context) {
        try {
            const chat = this.model.startChat({
                history: context ? [
                    {
                        role: 'user',
                        parts: [{ text: 'Here is the documentation context: ' + context }]
                    },
                    {
                        role: 'model',
                        parts: [{ text: 'I understand. I will use this context to help answer questions and summarize the key points of this document in a clear and concise manner.' }]
                    }
                ] : []
            });
            const result = await chat.sendMessage(prompt);
            const response = result.response;
            return this.formatChatResponse(response.text());
        }
        catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Failed to generate response: ${error}`);
        }
    }
}
exports.GeminiService = GeminiService;
//# sourceMappingURL=geminiServices.js.map