#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME_DIR = path.join(os.homedir(), '.claude-code-fireworks');
const ENV_FILE = path.join(HOME_DIR, '.env');
const REPLACE_DIR = path.join(HOME_DIR, 'replace');
const LOGS_DIR = path.join(HOME_DIR, 'logs');
const MODELS_FILE = path.join(HOME_DIR, 'models.json');

const DEFAULT_MODELS = [
  "accounts/fireworks/models/glm-4p5",
  "accounts/fireworks/models/deepseek-r1-0528",
  "accounts/fireworks/models/deepseek-v3p1-terminus",
  "accounts/fireworks/models/kimi-k2-instruct",
  "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct",
  "accounts/fireworks/models/deepseek-v3-0324",
  "accounts/fireworks/models/kimi-k2-instruct-0905",
  "accounts/fireworks/models/llama-v3p1-405b-instruct",
  "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
  "accounts/fireworks/models/qwen3-235b-a22b-thinking-2507",

  "accounts/fireworks/models/gpt-oss-120b",
  "accounts/fireworks/models/qwen3-vl-30b-a3b-instruct",
  "accounts/fireworks/models/qwen3-vl-30b-a3b-thinking",
  "accounts/fireworks/models/qwen3-vl-235b-a22b-instruct",
  "accounts/fireworks/models/qwen2p5-vl-32b-instruct",
  "accounts/fireworks/models/qwen3-235b-a22b",
  "accounts/fireworks/models/minimax-m2",
  "accounts/fireworks/models/glm-4p6",
  "accounts/deepseek-ai/models/deepseek-v3p1",
];
function checkInitialized(): boolean {
  return fs.existsSync(HOME_DIR) && fs.existsSync(ENV_FILE);
}

function requireInitialized(): void {
  if (!checkInitialized()) {
    console.error(chalk.red('\n✗ Configuration not found!'));
    console.error(chalk.yellow('  Please run: ccf init\n'));
    process.exit(1);
  }
}

function initCommand(): void {
  console.log(chalk.cyan.bold('\n━'.repeat(60)));
  console.log(chalk.cyan.bold('  Initializing Claude Code Fireworks'));
  console.log(chalk.cyan.bold('━'.repeat(60) + '\n'));

  // Create home directory
  if (!fs.existsSync(HOME_DIR)) {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    console.log(chalk.green(`✓ Created configuration directory: ${HOME_DIR}`));
  } else {
    console.log(chalk.yellow(`⚠ Configuration directory already exists: ${HOME_DIR}`));
  }

  // Create replace directory
  if (!fs.existsSync(REPLACE_DIR)) {
    fs.mkdirSync(REPLACE_DIR, { recursive: true });
    console.log(chalk.green(`✓ Created replace directory: ${REPLACE_DIR}`));
  }

  // Create logs directory
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log(chalk.green(`✓ Created logs directory: ${LOGS_DIR}`));
  }

  // Create models.json
  if (!fs.existsSync(MODELS_FILE)) {
    const modelsData = {
      models: DEFAULT_MODELS
    };
    fs.writeFileSync(MODELS_FILE, JSON.stringify(modelsData, null, 2));
    console.log(chalk.green(`✓ Created models list: ${MODELS_FILE}`));
  }

  // Create .env file
  if (!fs.existsSync(ENV_FILE)) {
    const defaultEnv = `LISTEN_HOST=127.0.0.1
LISTEN_PORT=3000

FIREWORKS_BASE=https://api.fireworks.ai/inference/v1
FIREWORKS_API_KEY=your_api_key_here
FIREWORKS_MODEL=${DEFAULT_MODELS[0]}

MODEL_MAX_TOKENS=30000
MODEL_TEMPERATURE=0.3
MODEL_TOP_P=1
MODEL_TOP_K=
MODEL_FREQUENCY_PENALTY=0
MODEL_PRESENCE_PENALTY=0
`;
    fs.writeFileSync(ENV_FILE, defaultEnv);
    console.log(chalk.green(`✓ Created default .env file: ${ENV_FILE}`));
  } else {
    console.log(chalk.yellow(`⚠ .env file already exists: ${ENV_FILE}`));
  }

  console.log(chalk.cyan.bold('\n━'.repeat(60)));
  console.log(chalk.yellow.bold('  Next steps:'));
  console.log(chalk.yellow(`  1. Edit ${ENV_FILE}`));
  console.log(chalk.yellow(`  2. Add your FIREWORKS_API_KEY`));
  console.log(chalk.yellow(`  3. Run: ccf start`));
  console.log(chalk.cyan.bold('━'.repeat(60) + '\n'));
}

async function modelCommand(): Promise<void> {
  requireInitialized();

  console.log(chalk.cyan.bold('\n━'.repeat(60)));
  console.log(chalk.cyan.bold('  Select Fireworks Model'));
  console.log(chalk.cyan.bold('━'.repeat(60) + '\n'));

  // Load models from file
  let models: string[] = DEFAULT_MODELS;
  if (fs.existsSync(MODELS_FILE)) {
    try {
      const modelsData = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
      models = modelsData.models || DEFAULT_MODELS;
    } catch (error) {
      console.error(chalk.yellow('⚠ Failed to load models.json, using defaults'));
    }
  }

  // Load current model from .env
  let currentModel = DEFAULT_MODELS[0];
  if (fs.existsSync(ENV_FILE)) {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    const match = envContent.match(/FIREWORKS_MODEL=(.+)/);
    if (match) {
      currentModel = match[1].trim();
    }
  }

  const choices = models.map(model => ({
    name: model === currentModel ? `${model} (current)` : model,
    value: model
  }));

  const selectedModel = await select({
    message: 'Select a model:',
    choices,
    default: currentModel
  });

  // Update .env file
  let envContent = fs.readFileSync(ENV_FILE, 'utf8');
  envContent = envContent.replace(/FIREWORKS_MODEL=.+/, `FIREWORKS_MODEL=${selectedModel}`);
  fs.writeFileSync(ENV_FILE, envContent);

  console.log(chalk.green(`\n✓ Model updated to: ${selectedModel}`));
  console.log(chalk.yellow('  Restart the proxy for changes to take effect\n'));
}

function startCommand(): void {
  requireInitialized();

  // Check if API key is set
  const envContent = fs.readFileSync(ENV_FILE, 'utf8');
  if (envContent.includes('FIREWORKS_API_KEY=your_api_key_here') || !envContent.includes('FIREWORKS_API_KEY=')) {
    console.error(chalk.red('\n✗ FIREWORKS_API_KEY not set in .env file!'));
    console.error(chalk.yellow(`  Please edit ${ENV_FILE} and add your API key\n`));
    process.exit(1);
  }

  console.log(chalk.cyan('Starting proxy...\n'));
  
  const indexPath = path.join(__dirname, 'index.js');
  const child = spawn('node', [indexPath], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function showHelp(): void {
  console.log(chalk.cyan.bold('\n━'.repeat(60)));
  console.log(chalk.cyan.bold('  Claude Code Fireworks - CLI'));
  console.log(chalk.cyan.bold('━'.repeat(60)));
  console.log(chalk.white('\nUsage:'));
  console.log(chalk.green('  ccf init') + chalk.gray('   - Initialize configuration directory'));
  console.log(chalk.green('  ccf start') + chalk.gray('  - Start the proxy server'));
  console.log(chalk.green('  ccf model') + chalk.gray('  - Select/change Fireworks model'));
  console.log(chalk.green('  ccf help') + chalk.gray('   - Show this help message'));
  console.log(chalk.cyan.bold('━'.repeat(60) + '\n'));
}

// Main CLI logic
const command = process.argv[2];

switch (command) {
  case 'init':
    initCommand();
    break;
  case 'start':
    startCommand();
    break;
  case 'model':
    modelCommand().catch(error => {
      console.error(chalk.red('\n✗ Error:'), error.message);
      process.exit(1);
    });
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  case undefined:
    // Default behavior: show help
    showHelp();
    break;
  default:
    console.error(chalk.red(`\n✗ Unknown command: ${command}`));
    showHelp();
    process.exit(1);
}
