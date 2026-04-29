#!/usr/bin/env node

/**
 * JS Knowledge Collector CLI
 *
 * Usage:
 *   node cli/cli.js <command> [options]
 *
 * Commands:
 *   collect <url>    [--flomo] [--no-summary] [--force] [--force-summary]
 *   search <keyword> [--source <platform>]
 *   list             [--source <platform>] [--page N] [--per-page N] [--sort <field>]
 *   stats
 *   delete <id>
 *   export           [--format prism|json|md] [--force]
 *   build            [--dry-run]
 *   serve            [--port <N>]
 *   commit           [--message "..."]
 *   sync             [--no-push] [--message "..."]
 *
 * All output is JSON to stdout. Logs go to stderr.
 */

import 'dotenv/config';
import { toJson, toStderr } from './lib/formatters.js';
import { searchArticles, listArticles, getArticle, deleteArticle, getStats } from './lib/data-reader.js';
import { gitStatus, gitAddAll, gitCommit, gitPush, gitDiffStat, generateCommitMessage } from './lib/git.js';

// ── Arg parser ───────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = argv.slice(2);
    const command = args[0] || '';
    const positional = [];
    const flags = {};

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith('--')) { flags[key] = next; i++; }
            else flags[key] = true;
        } else {
            positional.push(arg);
        }
    }
    return { command, positional, flags };
}

// ── Command handlers ─────────────────────────────────────────────────

async function cmdCollect(positional, flags) {
    const url = positional[0];
    if (!url) {
        toStderr('Error: collect requires a URL argument.');
        process.exit(1);
    }
    const { collect } = await import('./lib/collector.js');
    const result = await collect(url, {
        flomo: !!flags.flomo,
        noSummary: !!flags['no-summary'],
        force: !!flags.force,
        forceSummary: !!flags['force-summary'],
    });
    toJson(result);
}

async function cmdSearch(positional, flags) {
    const keyword = positional[0];
    if (!keyword) {
        toStderr('Error: search requires a keyword argument.');
        process.exit(1);
    }
    toJson(await searchArticles(keyword, { source: flags.source }));
}

async function cmdList(flags) {
    toJson(await listArticles({
        source: flags.source,
        page: flags.page ? parseInt(flags.page, 10) : undefined,
        perPage: flags['per-page'] ? parseInt(flags['per-page'], 10) : undefined,
        sort: flags.sort,
    }));
}

async function cmdStats() {
    toJson(await getStats());
}

async function cmdDelete(positional) {
    const id = positional[0];
    if (!id) {
        toStderr('Error: delete requires an article ID.');
        process.exit(1);
    }
    toJson(await deleteArticle(id));
}

async function cmdExport(flags) {
    const { exportArticles } = await import('./lib/exporter.js');
    toJson(await exportArticles({
        format: flags.format || 'json',
        force: !!flags.force,
    }));
}

async function cmdBuild(flags) {
    const { build } = await import('../build/build.js');
    const result = await build({ dryRun: !!flags['dry-run'] });
    toJson(result);
}

async function cmdServe(flags) {
    const { startServer } = await import('./lib/server.js');
    await startServer({ port: flags.port || 3000 });
}

function cmdCommit(flags) {
    try {
        const status = gitStatus();
        if (status.clean) {
            toJson({ committed: false, reason: 'clean' });
            return;
        }
        gitAddAll();
        const { files } = gitDiffStat();
        if (!files.length) {
            toJson({ committed: false, reason: 'nothing_staged' });
            return;
        }
        const message = flags.message || flags.m || generateCommitMessage(files);
        toStderr(`Committing: ${message}`);
        const { hash } = gitCommit(message);
        toJson({ committed: true, hash, message, files, branch: status.branch });
    } catch (err) {
        toStderr(`Error: ${err.message}`);
        process.exit(1);
    }
}

function cmdSync(flags) {
    try {
        const noPush = !!flags['no-push'];
        const status = gitStatus();

        gitAddAll();
        const { files } = gitDiffStat();
        if (!files.length) {
            toStderr('Nothing to commit.');
            toJson({ committed: false, reason: 'clean' });
            return;
        }

        const message = flags.message || flags.m || generateCommitMessage(files);
        toStderr(`Committing: ${message}`);
        const { hash } = gitCommit(message);
        const result = { committed: true, hash, message, files, branch: status.branch, pushed: false };

        if (!noPush) {
            toStderr(`Pushing to origin/${status.branch} ...`);
            gitPush('origin', status.branch);
            result.pushed = true;
        }
        toJson(result);
    } catch (err) {
        toStderr(`Error: ${err.message}`);
        process.exit(1);
    }
}

// ── Usage ────────────────────────────────────────────────────────────

function printUsage() {
    toStderr(`JS Knowledge Collector CLI

Usage:
  node cli/cli.js <command> [options]

Commands:
  collect <url>      Scrape, summarize, and save an article
    --flomo            Also send summary to Flomo
    --no-summary       Scrape only, skip AI summary
    --force            Force re-scrape (ignore cache)
    --force-summary    Force re-summarize only

  search <keyword>   Search articles by keyword
    --source <plat>    Filter by platform (wechat|zhihu|xiaohongshu|...)

  list               List articles
    --source <plat>    Filter by platform
    --page <N>         Page number (default 1)
    --per-page <N>     Items per page (default 20)
    --sort <field>     Sort field, prefix - for DESC (default -created)

  stats              Show collection statistics

  delete <id>        Delete an article by ID

  export             Export articles
    --format <fmt>     Export format: prism|json|md (default json)
    --force            Full re-export (ignore incremental state)

  build              Build static site + API to docs/
    --dry-run          Validate only

  serve              Start built-in HTTP server (for standalone use)
    --port <N>          Port number (default 3000)

  commit             Stage all changes and commit
    --message "msg"    Custom commit message

  sync               Commit + push
    --no-push          Skip push step
    --message "msg"    Custom commit message

Examples:
  node cli/cli.js collect https://mp.weixin.qq.com/s/xxx --flomo
  node cli/cli.js search "AI Agent"
  node cli/cli.js list --source wechat --page 1
  node cli/cli.js stats
  node cli/cli.js delete abc123
  node cli/cli.js export --format prism
  node cli/cli.js sync`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
    const { command, positional, flags } = parseArgs(process.argv);

    switch (command) {
        case 'collect':     await cmdCollect(positional, flags); break;
        case 'search':      await cmdSearch(positional, flags);  break;
        case 'list':        await cmdList(flags);                break;
        case 'stats':       await cmdStats();                    break;
        case 'delete':      await cmdDelete(positional);         break;
        case 'export':      await cmdExport(flags);              break;
        case 'build':       await cmdBuild(flags);               break;
        case 'serve':       await cmdServe(flags);               break;
        case 'commit':      cmdCommit(flags);                    break;
        case 'sync':        cmdSync(flags);                      break;
        case 'help': case '--help': case '-h':
            printUsage();
            break;
        case '':
            printUsage();
            process.exit(1);
            break;
        default:
            toStderr(`Error: unknown command "${command}"`);
            toStderr('Run "node cli/cli.js help" for usage.');
            process.exit(1);
    }
}

main().catch(err => {
    toStderr(`Error: ${err.message}`);
    process.exit(1);
});
