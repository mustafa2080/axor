#!/usr/bin/env node
// Secret scanner (TASKS.md section 9): stops a real secret from entering the repository.
// No dependencies on purpose: a scanner that needs a downloaded binary is one more thing to trust.
//
//   node scripts/secret-scan.mjs --staged    files about to be committed (pre-commit hook)
//   node scripts/secret-scan.mjs --all       every tracked file as it is on disk (pnpm check, CI)
//   node scripts/secret-scan.mjs --history   every line ever added in any commit (CI, once in a while)
//
// A finding never prints the secret itself, only the file, the line and the rule.
// A line that is deliberately fake carries the marker `secret-scan:allow` (with the reason next to it).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ALLOW_MARKER = 'secret-scan:allow';

// Values that are clearly placeholders, not secrets.
const PLACEHOLDER = /^(?:change_?me|your_|<|\$\{|\$\(|process\.env|example|placeholder|dummy|redacted|x{4,}|\*{4,}|ci_app_only|ci_root_only)/i;
const isPlaceholder = (value) => PLACEHOLDER.test(value) || /^(.)\1+$/.test(value);

const LINE_RULES = [
  { id: 'private-key', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    id: 'password-in-url',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]+)@/i,
    value: (match) => match[1],
    weak: true,
  },
  {
    // A quoted literal: `SECRET = '...'`, `"apiKey": "..."`. Code that merely mentions a secret
    // (`passwordHash = await hash(...)`, `token: string`) has no quoted literal and never matches.
    id: 'secret-assignment',
    pattern: /\b[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY)[A-Za-z0-9_]*["']?\s*[=:]\s*["'`]([^\s"'`]{16,})["'`]/i,
    value: (match) => match[1],
    weak: true,
  },
  {
    // An unquoted line of a .env or CI file: `JWT_ACCESS_SECRET=abcdef...`.
    id: 'dotenv-secret',
    pattern: /^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY)[A-Z0-9_]*=([^\s"'#]{16,})\s*$/,
    value: (match) => match[1],
    weak: true,
  },
];

// Files that must never be tracked, whatever they contain.
const FORBIDDEN_PATHS = [
  /(?:^|\/)\.env(?:\.(?!example$)[^/]+)?$/,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/,
  /\.(?:sql\.gz|sql\.enc|dump)$/i,
  /(?:^|\/)axor_[^/]*\.sql$/,
];
// checksums.json holds content hashes by design. Test files hold fake credentials by design, so the
// weak rules (guesses from variable names and URLs) are off there; the strong rules (key blocks and
// real token formats) still apply to them.
const SKIPPED_PATHS = [
  /(?:^|\/)node_modules\//,
  /(?:^|\/)dist\//,
  /(?:^|\/)pnpm-lock\.yaml$/,
  /(?:^|\/)migrations\/checksums\.json$/,
];
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

export const isForbiddenPath = (file) => FORBIDDEN_PATHS.some((pattern) => pattern.test(file));
const isSkipped = (file) => SKIPPED_PATHS.some((pattern) => pattern.test(file));

/** Findings for one line of text: [{ rule }]. Pure, so it can be tested without git. */
export function scanLine(line, { testFile = false } = {}) {
  if (line.includes(ALLOW_MARKER)) return [];
  const found = [];
  for (const rule of LINE_RULES) {
    if (rule.weak === true && testFile) continue;
    const match = rule.pattern.exec(line);
    if (match === null) continue;
    if (rule.value !== undefined && isPlaceholder(rule.value(match))) continue;
    found.push({ rule: rule.id });
  }
  return found;
}

function scanText(file, text) {
  if (text.includes('\0')) return [];
  const findings = [];
  const testFile = TEST_FILE.test(file);
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { rule } of scanLine(line, { testFile })) findings.push({ file, line: index + 1, rule });
  });
  return findings;
}


const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const names = (output) => output.split('\0').filter(Boolean);

function scanFiles(files, read) {
  const findings = [];
  for (const file of files) {
    if (isSkipped(file)) continue;
    if (isForbiddenPath(file)) findings.push({ file, line: 0, rule: 'forbidden-file' });
    let text;
    try {
      text = read(file);
    } catch {
      continue; // deleted or unreadable: nothing to scan
    }
    findings.push(...scanText(file, text));
  }
  return findings;
}

function scanHistory() {
  const findings = [];
  const log = git(['log', '--all', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=commit %h']);
  let commit = '';
  let file = '';
  let lineNumber = 0;
  for (const line of log.split(/\r?\n/)) {
    if (line.startsWith('commit ')) commit = line.slice(7);
    else if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      if (isForbiddenPath(file) && !isSkipped(file)) findings.push({ file, line: 0, rule: 'forbidden-file', commit });
    } else if (line.startsWith('@@')) lineNumber = Number(/\+(\d+)/.exec(line)?.[1] ?? 0) - 1;
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNumber += 1;
      if (isSkipped(file)) continue;
      const testFile = TEST_FILE.test(file);
      for (const { rule } of scanLine(line.slice(1), { testFile })) findings.push({ file, line: lineNumber, rule, commit });
    }
  }
  return findings;
}

function run(mode) {
  if (mode === '--staged') {
    const staged = names(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
    return scanFiles(staged, (file) => git(['show', `:${file}`]));
  }
  if (mode === '--all') return scanFiles(names(git(['ls-files', '-z'])), (file) => readFileSync(file, 'utf8'));
  if (mode === '--history') return scanHistory();
  throw new Error('Usage: secret-scan.mjs --staged | --all | --history');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mode = process.argv[2] ?? '--all';
  const findings = run(mode);
  for (const { file, line, rule, commit } of findings) {
    console.error(`secret-scan: ${rule} in ${file}${line > 0 ? `:${line}` : ''}${commit ? ` (commit ${commit})` : ''}`);
  }
  if (findings.length > 0) {
    console.error(`secret-scan: ${findings.length} finding(s) (${mode}). The values are not printed.`);
    console.error(`If a line is deliberately fake, add "${ALLOW_MARKER}: <reason>" to it. Never allow a real secret.`);
    process.exit(1);
  }
  console.log(`secret-scan: clean (${mode})`);
}
