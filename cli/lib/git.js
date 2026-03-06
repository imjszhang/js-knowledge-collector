/**
 * Git — git 操作封装
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

function git(args) {
    try {
        return execFileSync('git', args, {
            cwd: ROOT,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trimEnd();
    } catch (err) {
        const stderr = err.stderr?.trim() || err.message;
        throw new Error(`git ${args[0]} failed: ${stderr}`);
    }
}

export function gitStatus() {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const porcelain = git(['status', '--porcelain']);
    const lines = porcelain ? porcelain.split('\n') : [];
    const staged = [], unstaged = [], untracked = [];

    for (const line of lines) {
        const match = line.match(/^(.)(.) (.+)$/);
        if (!match) continue;
        const [, x, y, file] = match;
        if (x === '?' && y === '?') untracked.push(file);
        else {
            if (x !== ' ' && x !== '?') staged.push(file);
            if (y !== ' ' && y !== '?') unstaged.push(file);
        }
    }
    return { branch, clean: lines.length === 0, staged, unstaged, untracked };
}

export function gitAddAll() { git(['add', '-A']); }

export function gitCommit(message) {
    if (!message?.trim()) throw new Error('empty commit message');
    git(['commit', '-m', message]);
    const hash = git(['rev-parse', '--short', 'HEAD']);
    return { hash, message };
}

export function gitPush(remote = 'origin', branch) {
    if (!branch) branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    git(['push', remote, branch]);
    return { remote, branch };
}

export function gitDiffStat() {
    const stat = git(['diff', '--cached', '--stat']);
    const nameOnly = git(['diff', '--cached', '--name-only']);
    return { files: nameOnly ? nameOnly.split('\n') : [], summary: stat };
}

export function generateCommitMessage(files) {
    if (!files?.length) return 'chore: update files';
    const areas = new Set();
    let hasDocs = false, hasSrc = false;

    for (const f of files) {
        if (f.startsWith('docs/')) hasDocs = true;
        if (f.startsWith('src/')) hasSrc = true;
        if (f.startsWith('cli/')) areas.add('cli');
        else if (f.startsWith('build/')) areas.add('build');
        else if (f.startsWith('prompts/')) areas.add('prompts');
    }

    if (hasDocs && !hasSrc && !areas.size) return 'build: update site output';
    const list = [...areas];
    if (!list.length) return `chore: update ${files.length} file(s)`;
    if (list.length === 1) return `${list[0]}: update`;
    return `update ${list.join(', ')}`;
}
