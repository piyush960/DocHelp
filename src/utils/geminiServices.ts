import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiService {
    private static instance: GeminiService;
    private genAI: GoogleGenerativeAI;
    private model: any;
    
    private constructor() {
        const apiKey = 'AIzaSyD7trGWUVbUenovDppaQbEbma8jPUmylqI';
        if (!apiKey) {
            throw new Error('Gemini API key not configured');
        }
        
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }

    static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }

    async generateResponse(prompt: string, context?: string): Promise<string> {
        try {
            const chat = this.model.startChat({
                history:  []
            });

            const result = await chat.sendMessage(prompt);
            const response = result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Failed to generate response: ${error}`);
        }
    }
}