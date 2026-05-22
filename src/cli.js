import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { applyConfiguration, DEFAULT_BASE_URL, DEFAULT_TARGETS, getDefaultModel } from './config-writer.js';

const HELP = `
ModelSell CLI

Usage:
  modelsell configure [options]
  modelsell config [options]

Options:
  --target <list>       codex,claude,gemini or all (default: all)
  --base-url <url>      API base URL (default: ${DEFAULT_BASE_URL})
  --api-key <key>       API key. If omitted, you will be prompted.
  --model <model>       Use one model for all selected CLIs
  --codex-model <name>  Model for Codex
  --claude-model <name> Model for Claude Code
  --gemini-model <name> Model for Gemini CLI
  --yes                Accept defaults for omitted base URL and models
  -h, --help           Show this help
`.trim();

const TARGET_CHOICES = [
  { key: 'all', label: 'All', detail: 'Configure Codex, Claude Code, and Gemini CLI' },
  { key: 'codex', label: 'Codex', detail: 'OpenAI Codex CLI' },
  { key: 'claude', label: 'Claude Code', detail: 'Anthropic Claude Code' },
  { key: 'gemini', label: 'Gemini CLI', detail: 'Google Gemini CLI' }
];

export async function run(argv = process.argv.slice(2), env = process.env, io = {}) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'configure';
  const args = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;
  const flags = parseArgs(args);

  if (flags.help || command === 'help') {
    writeLine(io, HELP);
    return 0;
  }

  if (command !== 'configure' && command !== 'config') {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }

  const interactive = !flags.yes || !flags.apiKey;
  const rl = interactive && !io.question ? createInterface({ input, output }) : null;
  const question = io.question ?? rl?.question.bind(rl);

  try {
    if (question) {
      writeLine(io, renderBanner({ color: supportsColor(env) }));
    }

    const targets = flags.target
      ? parseTargets(flags.target)
      : await chooseTargets(question, io);
    const baseUrl = flags.baseUrl || (question && !flags.yes
      ? await askWithDefault(question, 'Base URL', DEFAULT_BASE_URL)
      : DEFAULT_BASE_URL);
    const apiKey = flags.apiKey || env.MODELSELL_API_KEY || await askRequired(question, io, 'API key');
    const models = {};

    for (const target of targets) {
      const flagName = `${target}Model`;
      const defaultModel = flags.model || flags[flagName] || getDefaultModel(target);
      models[target] = flags[flagName] || flags.model || (question && !flags.yes
        ? await askWithDefault(question, `${displayName(target)} model`, defaultModel)
        : defaultModel);
    }

    const results = await applyConfiguration({
      homeDir: env.HOME,
      targets,
      apiKey,
      baseUrl,
      models
    });

    writeLine(io, 'ModelSell configuration updated:');
    for (const result of results) {
      writeLine(io, `- ${displayName(result.target)}: ${result.files.join(', ')}`);
    }
    return 0;
  } finally {
    rl?.close();
  }
}

export function renderBanner({ color = true } = {}) {
  const paint = makePainter(color);
  const logo = [
    ' __  __           _      _ ____       _ _ ',
    '|  \\/  | ___   __| | ___| / ___|  ___| | |',
    '| |\\/| |/ _ \\ / _` |/ _ \\ \\___ \\ / _ \\ | |',
    '| |  | | (_) | (_| |  __/ |___) |  __/ | |',
    '|_|  |_|\\___/ \\__,_|\\___|_|____/ \\___|_|_|'
  ];

  return [
    '',
    ...logo.map((line, index) => paint(line, 36 + (index % 3))),
    paint('ModelSell CLI', 1),
    paint('Configure Codex, Claude Code, and Gemini CLI', 2),
    ''
  ].join('\n');
}

export function renderTargetMenu() {
  return [
    'Select what you want to configure:',
    ...TARGET_CHOICES.map((choice, index) => `${index + 1}. ${choice.label}  ${choice.detail}`),
    ''
  ].join('\n');
}

function parseArgs(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      flags.help = true;
    } else if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
    } else if (arg.startsWith('--')) {
      const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
      const key = toCamelCase(rawKey);
      const value = inlineValue ?? args[index + 1];
      if (inlineValue === undefined) index += 1;
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${rawKey}`);
      }
      flags[key] = value;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return flags;
}

function parseTargets(value = 'all') {
  if (value === 'all') return DEFAULT_TARGETS;
  const targets = value.split(',').map((target) => target.trim()).filter(Boolean);
  const unsupported = targets.filter((target) => !DEFAULT_TARGETS.includes(target));
  if (unsupported.length) {
    throw new Error(`Unsupported target: ${unsupported.join(', ')}`);
  }
  return [...new Set(targets)];
}

async function chooseTargets(question, io) {
  if (!question) return DEFAULT_TARGETS;
  writeLine(io, renderTargetMenu());

  while (true) {
    const answer = (await question('Choose [1]: ')).trim() || '1';
    const choice = TARGET_CHOICES[Number(answer) - 1];
    if (choice) return parseTargets(choice.key);

    const directTargets = tryParseTargets(answer);
    if (directTargets) return directTargets;

    writeLine(io, 'Please choose 1-4, or type codex, claude, gemini, or all.');
  }
}

function tryParseTargets(value) {
  try {
    return parseTargets(value);
  } catch {
    return null;
  }
}

async function askWithDefault(question, label, defaultValue) {
  const answer = await question(`${label} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

async function askRequired(question, io, label) {
  if (!question) throw new Error(`${label} is required. Pass --api-key or set MODELSELL_API_KEY.`);
  while (true) {
    const answer = await question(`${label}: `);
    if (answer.trim()) return answer.trim();
    writeLine(io, `${label} cannot be empty.`);
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function displayName(target) {
  return {
    codex: 'Codex',
    claude: 'Claude Code',
    gemini: 'Gemini CLI'
  }[target];
}

function supportsColor(env) {
  return env.NO_COLOR !== '1' && env.TERM !== 'dumb';
}

function makePainter(enabled) {
  return (text, code) => enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function writeLine(io, value) {
  if (io.log) {
    io.log(value);
  } else {
    console.log(value);
  }
}
