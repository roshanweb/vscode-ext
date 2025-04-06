import * as fs from 'fs';
import * as path from 'path';

export const readPromptFile = (filename: string): string => {
    const filePath = path.join(__dirname, 'prompts', filename);
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading prompt file ${filename}:`, error);
        return ''; // Return empty string if file cannot be read
    }
}