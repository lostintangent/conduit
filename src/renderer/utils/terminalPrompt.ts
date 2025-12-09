export function constructPrompt(
  userPrompt: string,
  terminalBuffer: string,
  cwd: string | null,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  // Estimate tokens: roughly 4 characters = 1 token
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  const systemInstructions = `You are a helpful terminal assistant. The user is working in a command-line environment and needs your help.

IMPORTANT CONTEXT:
- The user is currently in a terminal session
- Current working directory: ${cwd || "unknown"}
- The last 100 lines of their terminal buffer are shown below
- The user is looking for INFORMATION and GUIDANCE, not action
- DO NOT execute commands or modify their system
- Provide clear, concise answers focused on command-line solutions
- If suggesting commands, explain what they do
- Consider the context from their terminal buffer to give relevant advice

TERMINAL BUFFER (last 100 lines):
\`\`\`
${terminalBuffer}
\`\`\``;

  // Build conversation with token limit (40k tokens ≈ 160k characters)
  const MAX_TOKENS = 40000;
  let conversationText = "";
  let totalTokens = estimateTokens(systemInstructions);

  // Add conversation history if present
  if (conversationHistory && conversationHistory.length > 0) {
    conversationText = "\n\nCONVERSATION HISTORY:\n";

    // Add history from oldest to newest, but trim if exceeding token limit
    const historyToInclude: typeof conversationHistory = [];

    // Reserve tokens for system instructions and new prompt
    const newPromptTokens = estimateTokens(userPrompt);
    const availableForHistory =
      MAX_TOKENS - totalTokens - newPromptTokens - 1000; // 1000 buffer

    let historyTokens = 0;
    // Go backwards through history and add what fits
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const entry = conversationHistory[i];
      const entryText = `${entry.role === "user" ? "USER" : "ASSISTANT"}: ${entry.content}\n\n`;
      const entryTokens = estimateTokens(entryText);

      if (historyTokens + entryTokens <= availableForHistory) {
        historyToInclude.unshift(entry);
        historyTokens += entryTokens;
      } else {
        break;
      }
    }

    // Format the history
    for (const entry of historyToInclude) {
      conversationText += `${entry.role === "user" ? "USER" : "ASSISTANT"}: ${entry.content}\n\n`;
    }

    totalTokens += historyTokens;
  }

  const finalPrompt = `${systemInstructions}${conversationText}

USER QUESTION:
${userPrompt}

Please provide a helpful answer that considers their current terminal context${conversationHistory && conversationHistory.length > 0 ? " and the conversation history above" : ""}.`;

  return finalPrompt;
}
