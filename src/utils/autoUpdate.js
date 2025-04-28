// includes/autoUpdater.js
import { exec, execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';
import cron from 'node-cron';
import { createInterface } from 'readline';
import dotenv from 'dotenv';
import { defaultLogger } from '../utils/logger.js';

dotenv.config();

class AutoUpdater {
    constructor(options = {}) {
        this.config = {
            repository: options.repository || process.env.GITHUB_REPO || 'username/repo',
            branch: options.branch || process.env.GITHUB_BRANCH || 'main',
            interval: options.interval || '*/15 * * * *', // mỗi 15 phút mặc định
            autoInstall: options.autoInstall !== false,
            autoPull: options.autoPull !== false,
            autoRestart: options.autoRestart !== false,
            token: options.token || process.env.GITHUB_TOKEN || null,
            verbose: options.verbose || false,
            backupDir: options.backupDir || './backups',
            adminEnabled: options.adminEnabled || process.env.ADMIN_CONSOLE === 'true',
        };

        this.logger = options.logger || console;
        this.bot = options.bot || null;
        this.lastCommit = null;
        this.isRunning = false;
        this.cronJob = null;
        this.adminConsole = null;
        this.__dirname = dirname(fileURLToPath(import.meta.url));
        this.commitFilePath = join(this.__dirname, '..', '.lastcommit');
        this.updateLockPath = join(this.__dirname, '..', '.updatelock');
    }

    async init() {
        try {
            await fs.mkdir(this.config.backupDir, { recursive: true });
            await this.loadLastCommit();
            if (this.config.interval) this.startUpdateChecker();
            if (this.config.adminEnabled) this.initAdminConsole();
            this.logger.info(chalk.green('✅ Auto-updater initialized successfully'));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to initialize auto-updater:'), error);
        }
    }

    startUpdateChecker() {
        if (this.cronJob) this.cronJob.stop();
        this.cronJob = cron.schedule(this.config.interval, async () => {
            this.logger.info(chalk.blue('🔍 Checking for updates...'));
            await this.checkForUpdates();
        });
        this.logger.info(chalk.blue(`🕒 Update checker scheduled (${this.config.interval})`));
    }

    async loadLastCommit() {
        try {
            this.lastCommit = await fs.readFile(this.commitFilePath, 'utf-8');
            this.lastCommit = this.lastCommit.trim();
        } catch {
            const currentCommit = await this.getCurrentCommit();
            await this.saveLastCommit(currentCommit);
            this.lastCommit = currentCommit;
        }
    }

    async saveLastCommit(commitHash) {
        try {
            await fs.writeFile(this.commitFilePath, commitHash);
            this.lastCommit = commitHash;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to save last commit:'), error);
        }
    }

    async getCurrentCommit() {
        try {
            const result = await this.execPromise('git rev-parse HEAD');
            return result.stdout.trim();
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get current commit:'), error);
            return 'unknown';
        }
    }

    async checkForUpdates() {
        if (this.isRunning) return;
        this.isRunning = true;
        const spinner = ora('Checking for updates...').start();

        try {
            const latestCommit = await this.getLatestCommit();
            if (!latestCommit) {
                spinner.fail('Failed to fetch latest commit');
                this.isRunning = false;
                return;
            }
            if (latestCommit === this.lastCommit) {
                spinner.succeed('Already up to date');
                this.isRunning = false;
                return;
            }

            spinner.text = 'Update found! Preparing to update...';
            await this.createBackup();
            if (this.config.autoPull) {
                spinner.text = 'Pulling latest changes...';
                await this.pullChanges();
            }
            if (this.config.autoInstall) {
                spinner.text = 'Installing dependencies...';
                await this.installDependencies();
            }
            await this.saveLastCommit(latestCommit);
            spinner.succeed(chalk.green(`✅ Update successful! New commit: ${latestCommit.substring(0, 7)}`));

            if (this.config.autoRestart) await this.restartBot();
        } catch (error) {
            spinner.fail('Update failed');
            this.logger.error(chalk.red('Update error:'), error);
        } finally {
            this.isRunning = false;
        }
    }

    async getLatestCommit() {
        try {
            const [owner, repo] = this.config.repository.split('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/commits/${this.config.branch}`;
            const headers = { 'User-Agent': 'ZaloBot-AutoUpdater' };
            if (this.config.token) headers['Authorization'] = `token ${this.config.token}`;
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`GitHub API error: ${response.statusText}`);
            const data = await response.json();
            return data.sha;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get latest commit:'), error);
            return null;
        }
    }

    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = join(this.config.backupDir, `backup-${timestamp}`);
        await fs.mkdir(backupPath, { recursive: true });

        const archiveFile = join(this.config.backupDir, `backup-${timestamp}.zip`);

        await this.execPromise(`git archive -o "${archiveFile}" HEAD`);

        this.logger.info(chalk.blue(`📦 Backup created: backup-${timestamp}.zip`));
    }

    async pullChanges() {
        await this.execPromise('git stash');
        await this.execPromise(`git pull origin ${this.config.branch}`);
        this.logger.info(chalk.blue('📥 Pulled latest changes'));
    }

    async installDependencies() {
        await this.execPromise('npm install');
        this.logger.info(chalk.blue('📦 Installed dependencies'));
    }

    async restartBot() {
        this.logger.info(chalk.blue('🔄 Restarting bot...'));
        if (this.bot) await this.bot.shutdown();
        setTimeout(() => {
            process.on('exit', () => execSync(`node ${process.argv[1]}`, { stdio: 'inherit' }));
            process.exit(0);
        }, 1000);
    }

    initAdminConsole() {
        this.adminConsole = createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('Admin > ')
        });

        this.adminConsole.on('line', async (line) => {
            const input = line.trim();
            if (!input) return this.adminConsole.prompt();

            try {
                await this.handleAdminCommand(input);
            } catch (error) {
                this.logger.error(chalk.red('❌ Command error:'), error);
            }
            this.adminConsole.prompt();
        });

        console.log(chalk.green('🔧 Admin Console Ready - Type "help"'));
        this.adminConsole.prompt();
    }

    async handleAdminCommand(input) {
        const [command, ...args] = input.split(' ');

        switch (command.toLowerCase()) {
            case 'help':
                console.log(chalk.cyan('Available commands: help, update, restart, exit'));
                break;
            case 'update':
                await this.checkForUpdates();
                break;
            case 'restart':
                await this.restartBot();
                break;
            case 'exit':
                process.exit(0);
                break;
            default:
                this.logger.warn(chalk.yellow(`⚠️ Unknown command: ${command}`));
        }
    }

    execPromise(command) {
        return new Promise((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    error.stdout = stdout;
                    error.stderr = stderr;
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
}

export async function setupAutoUpdater(botInstance) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '../config/autoupdate.json');

    let config = {
        repository: process.env.GITHUB_REPO,
        branch: process.env.GITHUB_BRANCH || 'main',
        interval: process.env.UPDATE_INTERVAL || '0 */2 * * *',
        autoInstall: true,
        autoPull: true,
        autoRestart: true,
        token: process.env.GITHUB_TOKEN || null,
        verbose: process.env.UPDATE_VERBOSE === 'true',
        backupDir: join(__dirname, '../backups'),
        adminEnabled: process.env.ADMIN_CONSOLE === 'true'
    };

    try {
        const configDir = dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });
        try {
            const fileContent = await fs.readFile(configPath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);
            config = { ...config, ...fileConfig };
        } catch {
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        }
    } catch (error) {
        defaultLogger.error('Failed to load/create auto-update config:', error);
    }

    const updater = new AutoUpdater({ ...config, logger: defaultLogger, bot: botInstance });
    await updater.init();

    setTimeout(async () => {
        try {
            defaultLogger.info('Running initial update check...');
            await updater.checkForUpdates();
        } catch (error) {
            defaultLogger.error('Initial update check failed:', error);
        }
    }, 30000);

    return updater;
}
