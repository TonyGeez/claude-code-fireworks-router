#!/usr/bin/env node
import { createServer } from "http";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chalk from "chalk";

// ---------- HOME DIRECTORY SETUP ----------
const HOME_DIR = path.join(os.homedir(), ".claude-code-fireworks");
const ENV_FILE = path.join(HOME_DIR, ".env");
const REPLACE_DIR = path.join(HOME_DIR, "replace");
const LOGS_DIR = path.join(HOME_DIR, "logs");

// Check if initialized
if (!fs.existsSync(HOME_DIR) || !fs.existsSync(ENV_FILE)) {
  console.error(chalk.red("\n✗ Configuration not found!"));
  console.error(chalk.yellow("  Please run: ccf init\n"));
  process.exit(1);
}

// Load environment variables from home directory
dotenv.config({ path: ENV_FILE });

// ---------- CONFIG ----------
const LISTEN_HOST = process.env.LISTEN_HOST || "127.0.0.1";
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || "3000", 10);
const FIREWORKS_BASE =
  process.env.FIREWORKS_BASE || "https://api.fireworks.ai/inference/v1";
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const FIREWORKS_MODEL = process.env.FIREWORKS_MODEL;
const MODEL_TOP_P = process.env.MODEL_TOP_P ? parseFloat(process.env.MODEL_TOP_P) : undefined;
const MODEL_TOP_K = process.env.MODEL_TOP_K ? parseInt(process.env.MODEL_TOP_K, 10) : undefined;
const MODEL_FREQUENCY_PENALTY = process.env.MODEL_FREQUENCY_PENALTY ? parseFloat(process.env.MODEL_FREQUENCY_PENALTY) : undefined;
const MODEL_PRESENCE_PENALTY = process.env.MODEL_PRESENCE_PENALTY ? parseFloat(process.env.MODEL_PRESENCE_PENALTY) : undefined;
const MODEL_TEMPERATURE = process.env.MODEL_TEMPERATURE ? parseFloat(process.env.MODEL_TEMPERATURE) : undefined;
const MODEL_MAX_TOKENS = process.env.MODEL_MAX_TOKENS ? parseInt(process.env.MODEL_MAX_TOKENS, 10) : undefined;

if (!FIREWORKS_API_KEY || FIREWORKS_API_KEY === "your_api_key_here") {
  console.error(
    chalk.red(`\n✗ You need to set FIREWORKS_API_KEY in ${ENV_FILE}`)
  );
  process.exit(1);
}

if (!FIREWORKS_MODEL) {
  console.error(
    chalk.red(`\n✗ You need to set FIREWORKS_MODEL in ${ENV_FILE}`)
  );
  process.exit(1);
}

// ---------- REPLACEMENT LOADER ----------
interface MessageReplacement {
  original_message: string;
  updated_message: string;
}

function loadReplacements(): MessageReplacement[] {
  const replacements: MessageReplacement[] = [];

  if (!fs.existsSync(REPLACE_DIR)) {
    log("No replace/ directory found, skipping replacements");
    return replacements;
  }

  try {
    const files = fs.readdirSync(REPLACE_DIR);

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const filePath = path.join(REPLACE_DIR, file);
          const content = fs.readFileSync(filePath, "utf8");
          const replacement = JSON.parse(content) as MessageReplacement;

          if (replacement.original_message && replacement.updated_message) {
            replacements.push(replacement);
            log(
              `Loaded replacement from ${file}: ${replacement.original_message.length} -> ${replacement.updated_message.length} chars`
            );
          } else {
            log(
              `Warning: ${file} missing required fields (original_message, updated_message)`
            );
          }
        } catch (err) {
          log(`Error loading ${file}:`, err);
        }
      }
    }
  } catch (err) {
    log("Error reading replace directory:", err);
  }

  return replacements;
}

// ---------- UTILS ----------
const log = (...args: any[]) => console.error(chalk.green.bold(`\n◉`), ...args);

// ---------- LOG TO FILE ----------
const timestamp = Date.now();
const logFileName = `${timestamp}.txt`;
const logFile = path.join(LOGS_DIR, logFileName);

const logToFile = (...args: any[]) => {
  const formattedArgs = args
    .map(arg =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
    )
    .join(" ");

  fs.writeFileSync(logFile, `[proxy] ${formattedArgs}\n`, { flag: "a" });
};

// ---------- TOOL INTERFACES ----------
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: object;
}
interface FireworksTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}
interface AnthropicMessage {
  role: "user" | "assistant" | "tool";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: object }
        | { type: "tool_result"; tool_use_id: string; content: string }
      >;
}
interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
}

interface FireworksMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface FireworksRequest {
  model: string;
  messages: FireworksMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream: boolean;
  tools?: FireworksTool[];
}

interface UsageAccumulator {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ---------- TRUNCATE LOGS FOR WRITE ----------
function truncateTextLogFile(obj: any, maxLength = 15050): any {
  if (Array.isArray(obj)) {
    return obj.map(item => truncateTextLogFile(item, maxLength));
  }

  if (typeof obj === "object" && obj !== null) {
    const newObj: any = {};

    for (const key in obj) {
      const value = obj[key];

      if (key === "content" && Array.isArray(value)) {
        newObj[key] = value.map((item: any) => {
          if (item?.type === "text" && typeof item.text === "string") {
            return {
              ...item,
              text:
                item.text.length > maxLength
                  ? item.text.slice(0, maxLength) +
                    `... [${item.text.length - maxLength} more chars]`
                  : item.text
            };
          }
          return truncateTextLogFile(item, maxLength);
        });
      } else if (key === "text" && typeof value === "string") {
        newObj[key] =
          value.length > maxLength
            ? value.slice(0, maxLength) +
              `... [${value.length - maxLength} more chars]`
            : value;
      } else if (typeof value === "string") {
        newObj[key] =
          value.length > 1000
            ? value.slice(0, maxLength) +
              `... [${value.length - maxLength} more chars]`
            : value;
      } else {
        newObj[key] = truncateTextLogFile(value, maxLength);
      }
    }

    return newObj;
  }

  return obj;
}

// ---------- APPLY REPLACEMENTS ----------
function applyReplacements(
  messages: AnthropicMessage[],
  replacements: MessageReplacement[]
): AnthropicMessage[] {
  if (replacements.length === 0) return messages;

  let replacementCount = 0;

  const newMessages = messages.map(msg => {
    // Handle string content
    if (typeof msg.content === "string") {
      for (const rep of replacements) {
        if (msg.content === rep.original_message) {
          replacementCount++;
          log(`Replaced exact string match in ${msg.role} message`);
          return { ...msg, content: rep.updated_message };
        }
      }
      return msg;
    }

    // Handle array content (text blocks, tool_use, tool_result, etc.)
    if (Array.isArray(msg.content)) {
      let modified = false;
      const newContent = msg.content.map(block => {
        if (block.type === "text") {
          for (const rep of replacements) {
            if (block.text === rep.original_message) {
              replacementCount++;
              modified = true;
              log(`Replaced exact text block match in ${msg.role} message`);
              return { ...block, text: rep.updated_message };
            }
          }
        }
        return block;
      });

      return modified ? { ...msg, content: newContent } : msg;
    }

    return msg;
  });

  if (replacementCount > 0) {
    log(`Applied ${replacementCount} replacement(s) total`);
  }

  return newMessages;
}

// ---------- TRANSFORM HELPERS ----------
function anthropicToFireworks(req: AnthropicRequest): FireworksRequest {
  log(
    `Converting ${req.messages.length} Anthropic messages to Fireworks format`
  );

  const messages: FireworksMessage[] = req.messages.flatMap(
    (m, index): FireworksMessage | FireworksMessage[] => {
      // Handle assistant messages with tool_use
      if (m.role === "assistant" && Array.isArray(m.content)) {
        const textBlocks = m.content.filter(c => c.type === "text");
        const toolUseBlocks = m.content.filter(c => c.type === "tool_use");

        const text = textBlocks
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map(c => c.text)
          .join("");
        const tool_calls = toolUseBlocks.map((c: any) => ({
          id: c.id,
          type: "function",
          function: {
            name: c.name,
            arguments: JSON.stringify(c.input)
          }
        }));

        return {
          role: "assistant",
          content: text || "",
          tool_calls: tool_calls.length > 0 ? tool_calls : undefined
        };
      }

      // Handle user messages that might contain both text and tool results
      if (m.role === "user" && Array.isArray(m.content)) {
        const toolResults = m.content.filter(c => c.type === "tool_result");
        const textBlocks = m.content.filter(c => c.type === "text");

        const messages: FireworksMessage[] = [];

        // Add text content if present (as user message)
        if (textBlocks.length > 0) {
          const text = textBlocks
            .filter(
              (c): c is { type: "text"; text: string } => c.type === "text"
            )
            .map(c => c.text)
            .join("");
          if (text) {
            messages.push({
              role: "user",
              content: text
            });
          }
        }

        // Add tool results as separate tool messages
        if (toolResults.length > 0) {
          toolResults.forEach((tr: any) => {
            messages.push({
              role: "tool",
              content:
                typeof tr.content === "string"
                  ? tr.content
                  : JSON.stringify(tr.content),
              tool_call_id: tr.tool_use_id
            });
          });
        }

        // If we have messages to return, return them, otherwise return a user message with empty content
        if (messages.length > 0) {
          log(
            `Message ${index}: Split user message into ${messages.length} message(s)`
          );
          return messages;
        } else {
          // Fallback for empty user messages
          return { role: "user", content: "" };
        }
      }

      // Handle normal messages (user or assistant with string content)
      let text = "";
      if (typeof m.content === "string") {
        text = m.content;
      } else if (Array.isArray(m.content)) {
        text = m.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map(c => c.text)
          .join("");
      }

      return {
        role: m.role,
        content: text
      };
    }
  );

  const tools = req.tools?.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));

  const result: FireworksRequest = {
    model: FIREWORKS_MODEL!,
    messages,
    max_tokens: MODEL_MAX_TOKENS ?? req.max_tokens,
    temperature: MODEL_TEMPERATURE ?? req.temperature,
    top_p: MODEL_TOP_P ?? 1,
    top_k: MODEL_TOP_K ?? undefined,
    frequency_penalty: MODEL_FREQUENCY_PENALTY ?? 0,
    presence_penalty: MODEL_PRESENCE_PENALTY ?? 0,
    stream: true,
    tools
  };

  log(`Resulted in ${result.messages.length} Fireworks messages`);
  logToFile(
    `\n\n#################################################### Message Conversion Summary ####################################################\n` +
      `Input: ${req.messages.length} Anthropic messages -> Output: ${result.messages.length} Fireworks messages\n`
  );

  return result;
}

// Helper to count braces and determine if JSON is complete
function isCompleteJsonString(jsonStr: string): boolean {
  if (!jsonStr || jsonStr.trim() === "") return false;

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount < 0) return false;
    }
  }

  return braceCount === 0 && !inString;
}

// ---------- HTTP HANDLER ----------
// Load replacements once at startup
const replacements = loadReplacements();

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404).end("Not Found");
    return;
  }

  let body = "";
  req.on("data", chunk => (body += chunk));
  await new Promise(r => req.on("end", r));

  let anthropicReq: AnthropicRequest;
  try {
    anthropicReq = JSON.parse(body);
    logToFile(
      `\n\n\n\n\n#################################################### INCOMING MESSAGES (ORIGINAL) ####################################################\n`,
      JSON.stringify(truncateTextLogFile(anthropicReq.messages), null, 2)
    );

    // Apply replacements
    anthropicReq.messages = applyReplacements(
      anthropicReq.messages,
      replacements
    );

    logToFile(
      `\n\n\n\n\n#################################################### INCOMING MESSAGES (AFTER REPLACEMENTS) ####################################################\n`,
      JSON.stringify(truncateTextLogFile(anthropicReq.messages), null, 2)
    );
  } catch {
    res.writeHead(400).end("Bad JSON");
    return;
  }

  const clientWantsStream = anthropicReq.stream ?? false;
  log("Claude request streaming?", clientWantsStream);

  const fireworksReq = anthropicToFireworks(anthropicReq);
  log("Forwarding to Fireworks (always streaming)");
  logToFile(
    `\n\n\n\n\n#################################################### Fireworks request ####################################################:\n`,
    JSON.stringify(truncateTextLogFile(fireworksReq), null, 2)
  );

  const fwRes = await fetch(`${FIREWORKS_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIREWORKS_API_KEY}`
    },
    body: JSON.stringify(fireworksReq)
  });

  if (!fwRes.ok) {
    const errorText = await fwRes.text();
    log("Fireworks API error:", fwRes.status, errorText);
    logToFile(
      `\n\n\n\n\n#################################################### Fireworks API error:`,
      errorText
    );

    res.writeHead(fwRes.status, fwRes.statusText);
    res.end(errorText);
    return;
  }

  const reader = fwRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Initialize usage accumulator
  const usageAccumulator: UsageAccumulator = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };

  if (clientWantsStream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    const toolCallAccumulator: Map<
      number,
      {
        id?: string;
        name?: string;
        arguments: string;
        braceCount: number;
        inString: boolean;
        escapeNext: boolean;
      }
    > = new Map();
    let hasContentStarted = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6);
          if (payload.trim() === "[DONE]") {
            // Send usage information before message_stop
            res.write(
              `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":${usageAccumulator.completion_tokens}}}\n\n`
            );
            res.write(`data: {"type":"message_stop"}\n\n`);
            break;
          }
          try {
            const fireworksChunk = JSON.parse(payload);
            const delta = fireworksChunk.choices?.[0]?.delta;

            // Accumulate usage information
            if (fireworksChunk.usage) {
              usageAccumulator.prompt_tokens =
                fireworksChunk.usage.prompt_tokens ||
                usageAccumulator.prompt_tokens;
              usageAccumulator.completion_tokens =
                fireworksChunk.usage.completion_tokens ||
                usageAccumulator.completion_tokens;
              usageAccumulator.total_tokens =
                fireworksChunk.usage.total_tokens ||
                usageAccumulator.total_tokens;
            }

            if (delta?.content) {
              if (!hasContentStarted) {
                res.write(
                  `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`
                );
                hasContentStarted = true;
              }
              res.write(
                `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(delta.content)}}}\n\n`
              );
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;

                if (!toolCallAccumulator.has(idx)) {
                  toolCallAccumulator.set(idx, {
                    arguments: "",
                    braceCount: 0,
                    inString: false,
                    escapeNext: false
                  });
                }

                const acc = toolCallAccumulator.get(idx)!;

                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;

                if (tc.function?.arguments) {
                  acc.arguments += tc.function?.arguments;

                  const argsStr = tc.function.arguments;
                  for (let i = 0; i < argsStr.length; i++) {
                    const char = argsStr[i];

                    if (acc.escapeNext) {
                      acc.escapeNext = false;
                      continue;
                    }

                    if (char === "\\") {
                      acc.escapeNext = true;
                      continue;
                    }

                    if (char === '"') {
                      acc.inString = !acc.inString;
                      continue;
                    }

                    if (acc.inString) continue;

                    if (char === "{") {
                      acc.braceCount++;
                    } else if (char === "}") {
                      acc.braceCount--;
                    }
                  }
                }
              }
            }

            const finishReason = fireworksChunk.choices?.[0]?.finish_reason;
            if (finishReason === "tool_calls") {
              for (const [idx, acc] of toolCallAccumulator) {
                if (acc.arguments && acc.braceCount === 0 && !acc.inString) {
                  try {
                    const input = JSON.parse(acc.arguments);
                    const toolUse = {
                      type: "tool_use",
                      id: acc.id,
                      name: acc.name,
                      input: input
                    };
                    res.write(
                      `data: {"type":"content_block_start","index":${idx},"content_block":${JSON.stringify(toolUse)}}\n\n`
                    );
                    res.write(
                      `data: {"type":"content_block_stop","index":${idx}}\n\n`
                    );
                  } catch (parseError) {
                    log(
                      "Failed to parse accumulated arguments after completion check:",
                      parseError
                    );
                  }
                } else if (acc.arguments) {
                  log("Skipping incomplete tool call:", {
                    idx,
                    braceCount: acc.braceCount,
                    inString: acc.inString
                  });
                }
              }
              res.write(
                `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":${usageAccumulator.completion_tokens}}}\n\n`
              );
              res.write(`data: {"type":"message_stop"}\n\n`);
            } else if (finishReason === "stop") {
              if (hasContentStarted) {
                res.write(`data: {"type":"content_block_stop","index":0}\n\n`);
              }
              res.write(
                `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":${usageAccumulator.completion_tokens}}}\n\n`
              );
              res.write(`data: {"type":"message_stop"}\n\n`);
            }
          } catch (e) {
            log("Parse error:", e);
            logToFile(
              `\n\n\n\n\n####################################################parse error`,
              e
            );
          }
        }
      }
    }

    logToFile(
      `\n\n\n\n\n#################################################### Final usage`,
      usageAccumulator
    );
    res.end();
  } else {
    let fullText = "";
    const toolCallAccumulator: Map<
      number,
      { id?: string; name?: string; arguments: string }
    > = new Map();
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6);
          if (payload.trim() === "[DONE]") continue;
          try {
            const fireworksChunk = JSON.parse(payload);
            const delta = fireworksChunk.choices?.[0]?.delta;

            // Accumulate usage information
            if (fireworksChunk.usage) {
              usageAccumulator.prompt_tokens =
                fireworksChunk.usage.prompt_tokens ||
                usageAccumulator.prompt_tokens;
              usageAccumulator.completion_tokens =
                fireworksChunk.usage.completion_tokens ||
                usageAccumulator.completion_tokens;
              usageAccumulator.total_tokens =
                fireworksChunk.usage.total_tokens ||
                usageAccumulator.total_tokens;
            }

            if (delta?.content) {
              fullText += delta.content;
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallAccumulator.has(idx)) {
                  toolCallAccumulator.set(idx, { arguments: "" });
                }
                const acc = toolCallAccumulator.get(idx)!;

                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments)
                  acc.arguments += tc.function.arguments;
              }
            }

            const fr = fireworksChunk.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
          } catch (e) {
            log("Parse error in non-stream:", e);
            logToFile(
              `\n\n\n\n\n#################################################### Non stream parse error`,
              e
            );
          }
        }
      }
    }

    let contentBlocks: Array<any> = [];

    if (fullText) {
      contentBlocks.push({ type: "text", text: fullText });
    }

    for (const [_, acc] of toolCallAccumulator) {
      try {
        if (acc.arguments) {
          if (isCompleteJsonString(acc.arguments)) {
            contentBlocks.push({
              type: "tool_use",
              id: acc.id!,
              name: acc.name!,
              input: JSON.parse(acc.arguments)
            });
          } else {
            log("Incomplete JSON detected in non-stream mode:", acc.arguments);
            contentBlocks.push({
              type: "tool_use",
              id: acc.id!,
              name: acc.name!,
              input: acc.arguments
            });
          }
        }
      } catch (e) {
        log("Failed to parse tool arguments:", e);
        contentBlocks.push({
          type: "tool_use",
          id: acc.id!,
          name: acc.name!,
          input: acc.arguments
        });
      }
    }

    logToFile(
      `\n\n\n\n\n#################################################### Final content block`,
      contentBlocks
    );
    logToFile(
      `\n\n\n\n\n#################################################### Final usage`,
      usageAccumulator
    );

    const claudeResp = {
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: contentBlocks,
      model: anthropicReq.model,
      stop_reason:
        finishReason === "tool_calls"
          ? "tool_use"
          : finishReason === "stop"
            ? "end_turn"
            : finishReason,
      stop_sequence: null,
      usage: {
        input_tokens: usageAccumulator.prompt_tokens,
        output_tokens: usageAccumulator.completion_tokens
      }
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(claudeResp));
  }
});

// ---------- STARTUP ----------
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log("\n" + chalk.cyan.bold("━".repeat(60)));
  console.log(chalk.cyan.bold("  Claude Code Fireworks Proxy"));
  console.log(chalk.cyan.bold("━".repeat(60)));
  console.log(
    chalk.green("  ✓ Server listening on"),
    chalk.green.bold(`http://${LISTEN_HOST}:${LISTEN_PORT}`)
  );
  console.log(
    chalk.cyan("  ✓ Fireworks model:"),
    chalk.cyan.bold(FIREWORKS_MODEL)
  );
  console.log(chalk.yellow("  ✓ Config directory:"), chalk.yellow(HOME_DIR));
  console.log(chalk.yellow("  ✓ Logs directory:"), chalk.yellow(LOGS_DIR));
  if (replacements.length > 0) {
    console.log(
      chalk.magenta("  ✓ Loaded"),
      chalk.magenta.bold(`${replacements.length}`),
      chalk.magenta("prompt replacement(s)")
    );
  }
  console.log(chalk.cyan.bold("━".repeat(60) + "\n"));
});
