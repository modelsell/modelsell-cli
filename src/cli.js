import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { applyConfiguration, DEFAULT_BASE_URL, DEFAULT_TARGETS, getDefaultModel } from './config-writer.js';

const TRANSLATIONS = {
  en: {
    usage: 'Usage:',
    options: 'Options:',
    targetOption: '--target <list>       codex,claude,gemini,openclaw or all (default: all)',
    baseUrlOption: `--base-url <url>      API base URL (default: ${DEFAULT_BASE_URL})`,
    apiKeyOption: '--api-key <key>       API key. If omitted, you will be prompted.',
    modelOption: '--model <model>       Use one model for all selected CLIs',
    codexModelOption: '--codex-model <name>  Model for Codex',
    claudeModelOption: '--claude-model <name> Model for Claude Code',
    geminiModelOption: '--gemini-model <name> Model for Gemini CLI',
    yesOption: '--yes                Accept defaults for omitted base URL and models',
    helpOption: '-h, --help           Show this help',
    subtitle: 'Configure Codex, Claude Code, Gemini CLI, and OpenClaw',
    selectTargets: 'Select what you want to configure:',
    allLabel: 'All',
    allDetail: 'Configure Codex, Claude Code, Gemini CLI, and OpenClaw',
    codexDetail: 'OpenAI Codex CLI',
    claudeDetail: 'Anthropic Claude Code',
    geminiDetail: 'Google Gemini CLI',
    openclawDetail: 'OpenClaw',
    choosePrompt: 'Choose',
    baseUrlPrompt: 'Base URL',
    apiKeyPrompt: 'API key',
    modelSuffix: 'model',
    updated: 'ModelSell configuration updated:',
    chooseInvalid: 'Please choose 1-5, or type codex, claude, gemini, openclaw, or all.',
    missingValue: 'Missing value for',
    unexpectedArgument: 'Unexpected argument',
    unknownCommand: 'Unknown command',
    unsupportedTarget: 'Unsupported target',
    requiredSuffix: 'is required. Pass --api-key or set MODELSELL_API_KEY.',
    cannotBeEmptySuffix: 'cannot be empty.'
  },
  zh: {
    usage: '用法:',
    options: '选项:',
    targetOption: '--target <list>       codex、claude、gemini、openclaw 或 all（默认: all）',
    baseUrlOption: `--base-url <url>      API 基础 URL（默认: ${DEFAULT_BASE_URL}）`,
    apiKeyOption: '--api-key <key>       API 密钥。未提供时会提示输入。',
    modelOption: '--model <model>       为所有选中的 CLI 使用同一个模型',
    codexModelOption: '--codex-model <name>  Codex 使用的模型',
    claudeModelOption: '--claude-model <name> Claude Code 使用的模型',
    geminiModelOption: '--gemini-model <name> Gemini CLI 使用的模型',
    yesOption: '--yes                对未提供的基础 URL 和模型使用默认值',
    helpOption: '-h, --help           显示帮助',
    subtitle: '配置 Codex、Claude Code、Gemini CLI 和 OpenClaw',
    selectTargets: '请选择要配置的工具:',
    allLabel: '全部',
    allDetail: '配置 Codex、Claude Code、Gemini CLI 和 OpenClaw',
    codexDetail: 'OpenAI Codex CLI',
    claudeDetail: 'Anthropic Claude Code',
    geminiDetail: 'Google Gemini CLI',
    openclawDetail: 'OpenClaw',
    choosePrompt: '请选择',
    baseUrlPrompt: '基础 URL',
    apiKeyPrompt: 'API 密钥',
    modelSuffix: '模型',
    updated: 'ModelSell 配置已更新:',
    chooseInvalid: '请选择 1-5，或输入 codex、claude、gemini、openclaw、all。',
    missingValue: '缺少参数值',
    unexpectedArgument: '不支持的参数',
    unknownCommand: '未知命令',
    unsupportedTarget: '不支持的目标',
    requiredSuffix: '为必填项。请传入 --api-key 或设置 MODELSELL_API_KEY。',
    cannotBeEmptySuffix: '不能为空。'
  }
};

function helpText(t) {
  return `
ModelSell CLI
${t.subtitle}

${t.usage}
  modelsell configure [options]
  modelsell config [options]

${t.options}
  ${t.targetOption}
  ${t.baseUrlOption}
  ${t.apiKeyOption}
  ${t.modelOption}
  ${t.codexModelOption}
  ${t.claudeModelOption}
  ${t.geminiModelOption}
  ${t.yesOption}
  ${t.helpOption}
`.trim();
}

export async function run(argv = process.argv.slice(2), env = process.env, io = {}) {
  const t = getTranslations(env);
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'configure';
  const args = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;
  const flags = parseArgs(args, t);
  const help = helpText(t);

  if (flags.help || command === 'help') {
    writeLine(io, help);
    return 0;
  }

  if (command !== 'configure' && command !== 'config') {
    throw new Error(`${t.unknownCommand}: ${command}\n\n${help}`);
  }

  const interactive = !flags.yes || !flags.apiKey;
  const rl = interactive && !io.question ? createInterface({ input, output }) : null;
  const question = io.question ?? rl?.question.bind(rl);

  try {
    if (question) {
      writeLine(io, renderBanner({ color: supportsColor(env), t }));
    }

    const targets = flags.target
      ? parseTargets(flags.target, t)
      : await chooseTargets(question, io, t);
    const baseUrl = flags.baseUrl || (question && !flags.yes
      ? await askWithDefault(question, t.baseUrlPrompt, DEFAULT_BASE_URL)
      : DEFAULT_BASE_URL);
    const apiKey = flags.apiKey || env.MODELSELL_API_KEY || await askRequired(question, io, t.apiKeyPrompt, t);
    const models = {};

    for (const target of targets) {
      if (target === 'openclaw') continue;
      const flagName = `${target}Model`;
      const defaultModel = flags.model || flags[flagName] || getDefaultModel(target);
      models[target] = flags[flagName] || flags.model || (question && !flags.yes
        ? await askWithDefault(question, `${displayName(target)} ${t.modelSuffix}`, defaultModel)
        : defaultModel);
    }

    const results = await applyConfiguration({
      homeDir: resolveHomeDir(env),
      targets,
      apiKey,
      baseUrl,
      models
    });

    writeLine(io, t.updated);
    for (const result of results) {
      writeLine(io, `- ${displayName(result.target)}: ${result.files.join(', ')}`);
    }
    return 0;
  } finally {
    rl?.close();
  }
}

export function renderBanner({ color = true, t = TRANSLATIONS.en } = {}) {
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
    paint(t.subtitle, 2),
    ''
  ].join('\n');
}

export function renderTargetMenu(t = TRANSLATIONS.en) {
  const choices = targetChoices(t);
  return [
    t.selectTargets,
    ...choices.map((choice, index) => `${index + 1}. ${choice.label}  ${choice.detail}`),
    ''
  ].join('\n');
}

function parseArgs(args, t) {
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
        throw new Error(`${t.missingValue}: --${rawKey}`);
      }
      flags[key] = value;
    } else {
      throw new Error(`${t.unexpectedArgument}: ${arg}`);
    }
  }
  return flags;
}

function parseTargets(value = 'all', t = TRANSLATIONS.en) {
  if (value === 'all') return DEFAULT_TARGETS;
  const targets = value.split(',').map((target) => target.trim()).filter(Boolean);
  const unsupported = targets.filter((target) => !DEFAULT_TARGETS.includes(target));
  if (unsupported.length) {
    throw new Error(`${t.unsupportedTarget}: ${unsupported.join(', ')}`);
  }
  return [...new Set(targets)];
}

async function chooseTargets(question, io, t) {
  if (!question) return DEFAULT_TARGETS;
  writeLine(io, renderTargetMenu(t));
  const choices = targetChoices(t);

  while (true) {
    const answer = (await question(`${t.choosePrompt} [1]: `)).trim() || '1';
    const choice = choices[Number(answer) - 1];
    if (choice) return parseTargets(choice.key, t);

    const directTargets = tryParseTargets(answer, t);
    if (directTargets) return directTargets;

    writeLine(io, t.chooseInvalid);
  }
}

function tryParseTargets(value, t) {
  try {
    return parseTargets(value, t);
  } catch {
    return null;
  }
}

async function askWithDefault(question, label, defaultValue) {
  const answer = await question(`${label} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

async function askRequired(question, io, label, t) {
  if (!question) throw new Error(`${label} ${t.requiredSuffix}`);
  while (true) {
    const answer = await question(`${label}: `);
    if (answer.trim()) return answer.trim();
    writeLine(io, `${label} ${t.cannotBeEmptySuffix}`);
  }
}

function targetChoices(t) {
  return [
    { key: 'all', label: t.allLabel, detail: t.allDetail },
    { key: 'codex', label: 'Codex', detail: t.codexDetail },
    { key: 'claude', label: 'Claude Code', detail: t.claudeDetail },
    { key: 'gemini', label: 'Gemini CLI', detail: t.geminiDetail },
    { key: 'openclaw', label: 'OpenClaw', detail: t.openclawDetail }
  ];
}

function getTranslations(env) {
  return isChineseLocale(env) ? TRANSLATIONS.zh : TRANSLATIONS.en;
}

function isChineseLocale(env) {
  const locale = [
    env.LC_ALL,
    env.LC_MESSAGES,
    env.LANG,
    env.LANGUAGE
  ].filter(Boolean).join(' ').toLowerCase();
  return /\bzh\b|zh[_-]/.test(locale);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function displayName(target) {
  return {
    codex: 'Codex',
    claude: 'Claude Code',
    gemini: 'Gemini CLI',
    openclaw: 'OpenClaw'
  }[target];
}

function supportsColor(env) {
  return env.NO_COLOR !== '1' && env.TERM !== 'dumb';
}

function resolveHomeDir(env) {
  if (env.HOME) return env.HOME;
  if (env.USERPROFILE) return env.USERPROFILE;
  if (env.HOMEDRIVE && env.HOMEPATH !== undefined) return `${env.HOMEDRIVE}${env.HOMEPATH}`;
  return undefined;
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
