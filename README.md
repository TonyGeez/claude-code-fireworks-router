# Claude Code with Fireworks.ai API

A lightweight proxy to use Fireworks.ai with Claude Code without the 5K token streaming limitation. 

## Features

- Handle automatically streaming and non-streaming modes based on Claude-Code request.
- Tool/function calling support
- Pre-defined Claude Code user/system prompt replacement feature

## Prerequisites

- Node.js 18 or higher
- A Fireworks.ai API key
- npm or yarn

## Installation

### Quick Install (Recommended)

1. Install Claude-code if it not installed yet:
```bash
npm install -g @anthropic-ai/claude-code
```

2. Install claude-code-fireworks:
```bash
npm install -g claude-code-fireworks
```

3. Run ccf once to create the configuration directory:
```bash
ccf init
```

This will create `~/.claude-code-fireworks/` with:
- `.env` - Configuration file (edit this to add your API key)
- `replace/` - Directory for prompt replacement JSON files
- `logs/` - Directory for request/response logs

4. Edit the configuration file and add your Fireworks API key:
```bash
# On Linux/Mac
nano ~/.claude-code-fireworks/.env

# On Windows
notepad %USERPROFILE%\.claude-code-fireworks\.env
```

## Usage

1. Start the proxy:
```bash
ccf start
```
If you need to change model, you can change it easily*:
```bash
ccf model
```

*You will need to stop the proxy and start it again with `ccf start`

2. In another terminal session, start Claude Code with proxy settings:
```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:3000
export ANTHROPIC_AUTH_TOKEN=ANYTHING
export API_TIMEOUT_MS=600000

claude
```

## Configuration

### Configuration Directory

All configuration files are stored in `~/.claude-code-fireworks/`:
- **`.env`** - Main configuration file
- **`replace/`** - Prompt replacement JSON files
- **`logs/`** - Request/response logs

### Environment Variables

Edit `~/.claude-code-fireworks/.env` to configure:

```env
LISTEN_HOST=127.0.0.1
LISTEN_PORT=3000

FIREWORKS_BASE=https://api.fireworks.ai/inference/v1
FIREWORKS_API_KEY=your_api_key_here
FIREWORKS_MODEL=accounts/fireworks/models/glm-4p5

MODEL_TEMPERATURE=0.3
MODEL_TOP_P=1
MODEL_TOP_K=
MODEL_FREQUENCY_PENALTY=0 MODEL_PRESENCE_PENALTY=0
```

- `FIREWORKS_API_KEY` - Your Fireworks.ai API key (required)
- `FIREWORKS_MODEL` - The Fireworks model to use (default: accounts/fireworks/models/glm-4p5)
- `LISTEN_HOST` - Host to bind the server to (default: 127.0.0.1)
- `LISTEN_PORT` - Port to listen on (default: 3000)
- `FIREWORKS_BASE` - Fireworks API base URL (default: https://api.fireworks.ai/inference/v1)

### Message Replacements

You can replace the pre-defined Claude prompt by adding JSON files to `~/.claude-code-fireworks/replace/`:

```json
{
  "original_message": "Text to find",
  "updated_message": "Text to replace with"
}
```

The proxy will automatically load all `.json` files from `~/.claude-code-fireworks/replace/` on startup and apply exact string matches to message content. 

You must log output and input from logs to use the exact message. Here an example of replacement of the prompt triggered when execute the /init command in Claude Code (save as `~/.claude-code-fireworks/replace/init-prompt.json`):

```json
{
  "original_message": "Please analyze this codebase and create a CLAUDE.md file, which will be given to future instances of Claude Code to operate in this repository.\n\nWhat to add:\n1. Commands that will be commonly used, such as how to build, lint, and run tests. Include the necessary commands to develop in this codebase, such as how to run a single test.\n2. High-level code architecture and structure so that future instances can be productive more quickly. Focus on the \"big picture\" architecture that requires reading multiple files to understand.\n\nUsage notes:\n- If there's already a CLAUDE.md, suggest improvements to it.\n- When you make the initial CLAUDE.md, do not repeat yourself and do not include obvious instructions like \"Provide helpful error messages to users\", \"Write unit tests for all new utilities\", \"Never include sensitive information (API keys, tokens) in code or commits\".\n- Avoid listing every component or file structure that can be easily discovered.\n- Don't include generic development practices.\n- If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot rules (in .github/copilot-instructions.md), make sure to include the important parts.\n- If there is a README.md, make sure to include the important parts.\n- Do not make up information such as \"Common Development Tasks\", \"Tips for Development\", \"Support and Documentation\" unless this is expressly included in other files that you read.\n- Be sure to prefix the file with the following text:\n\n```\n# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n```",
  "updated_message": "YOUR REPLACEMENT PROMPT HERE - **PROMPT TRIGGERED WHEN USING THE /INIT COMMAND**\n"
}
```
```json
{
  "original_message": "Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.\nThis summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.\n\nBefore providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:\n\n1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:\n   - The user's explicit requests and intents\n   - Your approach to addressing the user's requests\n   - Key decisions, technical concepts and code patterns\n   - Specific details like:\n     - file names\n     - full code snippets\n     - function signatures\n     - file edits\n  - Errors that you ran into and how you fixed them\n  - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.\n2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.\n\nYour summary should include the following sections:\n\n1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail\n2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.\n3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.\n4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.\n5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.\n6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.\n6. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.\n7. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.\n8. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.\n                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.\n\nHere's an example of how your output should be structured:\n\n<example>\n<analysis>\n[Your thought process, ensuring all points are covered thoroughly and accurately]\n</analysis>\n\n<summary>\n1. Primary Request and Intent:\n   [Detailed description]\n\n2. Key Technical Concepts:\n   - [Concept 1]\n   - [Concept 2]\n   - [...]\n\n3. Files and Code Sections:\n   - [File Name 1]\n      - [Summary of why this file is important]\n      - [Summary of the changes made to this file, if any]\n      - [Important Code Snippet]\n   - [File Name 2]\n      - [Important Code Snippet]\n   - [...]\n\n4. Errors and fixes:\n    - [Detailed description of error 1]:\n      - [How you fixed the error]\n      - [User feedback on the error if any]\n    - [...]\n\n5. Problem Solving:\n   [Description of solved problems and ongoing troubleshooting]\n\n6. All user messages: \n    - [Detailed non tool use user message]\n    - [...]\n\n7. Pending Tasks:\n   - [Task 1]\n   - [Task 2]\n   - [...]\n\n8. Current Work:\n   [Precise description of current work]\n\n9. Optional Next Step:\n   [Optional Next step to take]\n\n</summary>\n</example>\n\nPlease provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response. \n\nThere may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:\n<example>\n## Compact Instructions\nWhen summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.\n</example>\n\n<example>\n# Summary instructions\nWhen you are using compact - please focus on test output and code changes. Include file reads verbatim.\n</example>\n",
  "updated_message": "YOUR REPLACEMENT PROMPT HERE - **PROMPT TRIGGERED WHEN USING THE /COMPACT COMPACT OR WHEN AUTOMATIC COMPACT IS TRIGGERED**"
}
```
```json
{
  "original_message": "<system-reminder>\nThis is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.\n</system-reminder>",
  "updated_message": "<system-reminder>\nYOUR REPLACEMENT PROMPT HERE - **PROMPT SENT TO MODEL WHEN TODOWRITE TOOL (TODO LIST) AKA NO TASK WAS ADDED USING TODOWRITE TOOL**\n</system-reminder>"
}
```
```json
{
  "original_message": "Warmup",
  "updated_message": "YOUR REPLACEMENT PROMPT HERE **THIS PROMPT IS RANDOMLY SENT 5-6X RANDOMLY IN THE LAUNCH OF CLAUDE SESSION. YOU CAN ALSO LEAVE THIS EMPTY OR USE A CUSTOM INSTRUCTION**"
}
```
**There are many other prompt automatically send by claude code, you can easily spot them in logs**

## Logging

All requests and responses are logged to `~/.claude-code-fireworks/logs/` with timestamps. Logs are automatically truncated for readability (configurable in code).

## Token Usage

The proxy tracks and converts token usage:
- Fireworks `prompt_tokens` becomes Anthropic `input_tokens`
- Fireworks `completion_tokens` becomes Anthropic `output_tokens`

Token usage is included in both streaming and non-streaming responses.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
