
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. Gemini features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const generateContentWithGemini = async (prompt: string): Promise<string> => {
  if (!API_KEY) {
    return "Gemini API key is not configured. Please set the API_KEY environment variable.";
  }

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    // FIX: Access the text directly from the response object.
    return response.text;
  } catch (error) {
    console.error("Error generating content with Gemini:", error);
    if (error instanceof Error) {
        return `An error occurred: ${error.message}`;
    }
    return "An unknown error occurred while generating content.";
  }
};