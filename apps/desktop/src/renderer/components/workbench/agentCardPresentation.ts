import type {
  AgentCardKind,
  LanguageSettings,
} from '@omue/shared-protocol';
import type { DesktopLanguage } from '../../i18n/types';

export type AgentCardActor = 'user' | 'agent';

export function getAgentCardActor(kind: AgentCardKind): AgentCardActor {
  return kind === 'user-intent' ? 'user' : 'agent';
}

export function formatAgentCardTimestamp(
  createdAt: string,
  language: DesktopLanguage,
  timeFormat: LanguageSettings['timeFormat'],
): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  }).format(date);
}

const SAFE_AUTO_COLLAPSE_KINDS: ReadonlySet<AgentCardKind> = new Set([
  'user-intent',
  'scan-status',
  'completion',
]);

export function canAutoCollapseAgentCard(
  kind: AgentCardKind,
  hasCriticalAction: boolean,
): boolean {
  return !hasCriticalAction && SAFE_AUTO_COLLAPSE_KINDS.has(kind);
}

export type CodeTokenKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'punctuation';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const PUNCTUATION = new Set('{}[]();,.<>:+-*/%=!&|?~^');

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;

  const push = (kind: CodeTokenKind, start: number, end: number) => {
    tokens.push({ kind, text: code.slice(start, end) });
  };

  while (index < code.length) {
    const start = index;
    const char = code[index]!;
    const next = code[index + 1];

    if (char === '/' && next === '/') {
      index += 2;
      while (index < code.length && code[index] !== '\n') {
        index += 1;
      }
      push('comment', start, index);
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < code.length) {
        if (code[index] === '*' && code[index + 1] === '/') {
          index += 2;
          break;
        }
        index += 1;
      }
      push('comment', start, index);
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      index += 1;
      while (index < code.length) {
        if (code[index] === '\\') {
          index = Math.min(code.length, index + 2);
          continue;
        }
        const current = code[index];
        index += 1;
        if (current === quote) {
          break;
        }
      }
      push('string', start, index);
      continue;
    }

    if (/\d/.test(char) || (char === '.' && next !== undefined && /\d/.test(next))) {
      index += 1;
      while (index < code.length && /[0-9A-Fa-f_xXbBoO.eE+-]/.test(code[index]!)) {
        index += 1;
      }
      push('number', start, index);
      continue;
    }

    if (isIdentifierStart(char)) {
      index += 1;
      while (index < code.length && isIdentifierPart(code[index]!)) {
        index += 1;
      }
      const text = code.slice(start, index);
      tokens.push({ kind: KEYWORDS.has(text) ? 'keyword' : 'plain', text });
      continue;
    }

    if (PUNCTUATION.has(char)) {
      index += 1;
      push('punctuation', start, index);
      continue;
    }

    index += 1;
    while (index < code.length) {
      const current = code[index]!;
      const following = code[index + 1];
      if (
        (current === '/' && (following === '/' || following === '*'))
        || current === '"'
        || current === "'"
        || current === '`'
        || /\d/.test(current)
        || (current === '.' && following !== undefined && /\d/.test(following))
        || isIdentifierStart(current)
        || PUNCTUATION.has(current)
      ) {
        break;
      }
      index += 1;
    }
    push('plain', start, index);
  }

  return tokens;
}
