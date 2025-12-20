
import { GoogleGenAI, Type } from "@google/genai";

// Accessing process.env.API_KEY directly. 
// Note: Ensure your build tool (like Vite) is configured to define this variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const verifySignerData = async (name: string, email: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Validate if the following contact information looks realistic for a professional document signature: Name: "${name}", Email: "${email}". Provide a brief JSON response.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValid: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            suggestedTone: { type: Type.STRING, description: "Professional tone suggestion for the cover email." }
          },
          required: ["isValid", "reason", "suggestedTone"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Error:", error);
    return { isValid: true, reason: "Bypassed validation due to error", suggestedTone: "Professional" };
  }
};

export const generateDraftMessage = async (name: string, tone: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Write a 2-sentence professional email body for ${name} asking them to sign a document via Zoho Sign. Tone should be ${tone}.`,
    });
    return response.text;
  } catch (error) {
    return `Hello ${name}, please review and sign the attached document at your earliest convenience.`;
  }
};
