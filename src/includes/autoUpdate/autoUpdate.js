// autoUpdate.js
import { exec, execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';
import cron from 'node-cron';
import { createInterface } from 'readline';

class AutoUpdater {
    constructor(options = {}) {
        // Configuration
        this.config = {
            repository: options.repository || process.env.GITHUB_REPO || 'username/repo',
            branch: options.branch || process.env.GITHUB_BRANCH || 'main',
            interval: options.interval || '*/15 * * * *', // Every 15 minutes by default
            autoInstall: options.autoInstall !== false,
            autoPull: options.autoPull !== false,
            autoRestart: options.autoRestart !== false,
            token: options.token || process.env.GITHUB_TOKEN || null,
            verbose: options.verbose || false,
            backupDir: options.backupDir || './backups',
        };

        // Internal state
        this.logger = options.logger || console;
        this.isRunning = false;
        this.lastCommit = null;
        this.cronJob = null;
        this.adminConsole = null;
        this.bot = options.bot || null;

        // Path for tracking last commit
        this.__dirname = dirname(fileURLToPath(import.meta.url));
        this.commitFilePath = join(this.__dirname, '..', '.lastcommit');
        this.updateLockPath = join(this.__dirname, '..', '.updatelock');
    }

    /**
     * Initialize the auto-updater
     * @returns {Promise<void>}
     */
    async init() {
        try {
            // Create backup directory if it doesn't exist
            await fs.mkdir(this.config.backupDir, { recursive: true });

            // Load last known commit
            await this.loadLastCommit();

            // Start the update checker
            if (this.config.interval) {
                this.startUpdateChecker();
            }

            // Initialize admin console
            this.initAdminConsole();

            this.logger.info(chalk.green('✅ Auto-updater initialized successfully'));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to initialize auto-updater:'), error);
        }
    }

    /**
     * Start the update checker cron job
     */
    startUpdateChecker() {
        if (this.cronJob) {
            this.cronJob.stop();
        }

        this.cronJob = cron.schedule(this.config.interval, async () => {
            this.logger.info(chalk.blue('🔍 Checking for updates...'));
            await this.checkForUpdates();
        });

        this.logger.info(chalk.blue(`🕒 Update checker scheduled (${this.config.interval})`));
    }

    /**
     * Load the last known commit hash
     */
    async loadLastCommit() {
        try {
            // Check if commit file exists
            try {
                this.lastCommit = await fs.readFile(this.commitFilePath, 'utf-8');
                this.lastCommit = this.lastCommit.trim();
                if (this.config.verbose) {
                    this.logger.info(chalk.blue(`📝 Last commit: ${this.lastCommit}`));
                }
            } catch (err) {
                // If file doesn't exist, get current commit
                const currentCommit = await this.getCurrentCommit();
                await this.saveLastCommit(currentCommit);
                this.lastCommit = currentCommit;
                this.logger.info(chalk.blue(`📝 Initial commit saved: ${this.lastCommit}`));
            }
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to load last commit:'), error);
            // Set a default value to prevent errors
            this.lastCommit = 'none';
        }
    }

    /**
     * Save the last known commit hash
     * @param {string} commitHash - The commit hash to save
     */
    async saveLastCommit(commitHash) {
        try {
            await fs.writeFile(this.commitFilePath, commitHash);
            this.lastCommit = commitHash;
            if (this.config.verbose) {
                this.logger.info(chalk.blue(`💾 Saved last commit: ${commitHash}`));
            }
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to save last commit:'), error);
        }
    }

    /**
     * Get the current commit hash
     * @returns {Promise<string>} - The current commit hash
     */
    async getCurrentCommit() {
        try {
            const result = await this.execPromise('git rev-parse HEAD');
            return result.stdout.trim();
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get current commit:'), error);
            return 'unknown';
        }
    }

    /**
     * Check if update lock is present
     * @returns {Promise<boolean>}
     */
    async isUpdateLocked() {
        try {
            await fs.access(this.updateLockPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create update lock
     * @returns {Promise<void>}
     */
    async createUpdateLock() {
        try {
            await fs.writeFile(this.updateLockPath, Date.now().toString());
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to create update lock:'), error);
        }
    }

    /**
     * Remove update lock
     * @returns {Promise<void>}
     */
    async removeUpdateLock() {
        try {
            await fs.unlink(this.updateLockPath);
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to remove update lock:'), error);
        }
    }

    /**
     * Check for updates from GitHub
     * @returns {Promise<boolean>} - Whether an update was found and applied
     */
    async checkForUpdates() {
        if (this.isRunning) {
            this.logger.info(chalk.yellow('⚠️ Update check already in progress, skipping'));
            return false;
        }

        if (await this.isUpdateLocked()) {
            this.logger.info(chalk.yellow('⚠️ Updates locked, skipping update check'));
            return false;
        }

        this.isRunning = true;
        const spinner = ora('Checking for updates...').start();

        try {
            // Check GitHub API for latest commit
            const latestCommit = await this.getLatestCommit();

            if (!latestCommit) {
                spinner.fail(chalk.red('Failed to fetch latest commit'));
                this.isRunning = false;
                return false;
            }

            if (latestCommit === this.lastCommit) {
                spinner.succeed(chalk.green('Already up to date'));
                this.isRunning = false;
                return false;
            }

            spinner.text = 'Update found! Preparing to update...';

            // Create backup before updating
            await this.createBackup();

            // Pull changes if configured
            if (this.config.autoPull) {
                spinner.text = 'Pulling latest changes...';
                await this.pullChanges();
            }

            // Install dependencies if configured
            if (this.config.autoInstall) {
                spinner.text = 'Installing dependencies...';
                await this.installDependencies();
            }

            // Save the new commit hash
            await this.saveLastCommit(latestCommit);

            spinner.succeed(chalk.green(`✅ Update successful! New commit: ${latestCommit.substring(0, 7)}`));

            // Restart the bot if configured
            if (this.config.autoRestart) {
                await this.restartBot();
            }

            return true;
        } catch (error) {
            spinner.fail(chalk.red('❌ Update failed'));
            this.logger.error(chalk.red('Update error details:'), error);
            return false;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get the latest commit hash from GitHub API
     * @returns {Promise<string|null>} - The latest commit hash or null on failure
     */
    async getLatestCommit() {
        try {
            const [owner, repo] = this.config.repository.split('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/commits/${this.config.branch}`;

            const headers = {
                'User-Agent': 'ZaloBot-AutoUpdater'
            };

            if (this.config.token) {
                headers['Authorization'] = `token ${this.config.token}`;
            }

            const response = await fetch(url, { headers });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.sha;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get latest commit:'), error);
            return null;
        }
    }

    /**
     * Create a backup of the current codebase
     * @returns {Promise<void>}
     */
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `backup-${timestamp}`;
            const backupPath = join(this.config.backupDir, backupName);

            // Create backup directory
            await fs.mkdir(backupPath, { recursive: true });

            // Use git archive to create a snapshot
            await this.execPromise(`git archive --format=tar HEAD | tar -x -C "${backupPath}"`);

            this.logger.info(chalk.blue(`📦 Backup created: ${backupName}`));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to create backup:'), error);
            throw error; // Re-throw to abort update process
        }
    }

    /**
     * Pull latest changes from GitHub
     * @returns {Promise<void>}
     */
    async pullChanges() {
        try {
            // Stash any local changes
            await this.execPromise('git stash');

            // Pull latest changes
            await this.execPromise(`git pull origin ${this.config.branch}`);

            this.logger.info(chalk.blue('📥 Pulled latest changes'));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to pull changes:'), error);
            throw error; // Re-throw to abort update process
        }
    }

    /**
     * Install dependencies using npm
     * @returns {Promise<void>}
     */
    async installDependencies() {
        try {
            await this.execPromise('npm install');
            this.logger.info(chalk.blue('📦 Installed dependencies'));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to install dependencies:'), error);
            throw error; // Re-throw to abort update process
        }
    }

    /**
     * Restart the bot
     * @returns {Promise<void>}
     */
    async restartBot() {
        this.logger.info(chalk.blue('🔄 Restarting bot...'));

        try {
            // First try graceful shutdown
            if (this.bot) {
                await this.bot.shutdown();
                this.logger.info(chalk.blue('✅ Bot shutdown successful'));
            }

            // Schedule restart after a short delay to allow for proper shutdown
            setTimeout(() => {
                process.on('exit', () => {
                    // This will be executed when the process exits
                    // Start the process again using the same command
                    execSync(`node ${process.argv[1]}`, { stdio: 'inherit' });
                });
                process.exit(0);
            }, 1000);
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to restart bot:'), error);
            throw error;
        }
    }

    /**
     * Initialize the admin console
     */
    initAdminConsole() {
        // Create readline interface
        this.adminConsole = createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('Admin > ')
        });

        // Set up command handler
        this.adminConsole.on('line', async (line) => {
            const input = line.trim();

            if (!input) {
                this.adminConsole.prompt();
                return;
            }

            try {
                await this.handleAdminCommand(input);
            } catch (error) {
                this.logger.error(chalk.red('❌ Command error:'), error);
            }

            this.adminConsole.prompt();
        });

        // Handle close event
        this.adminConsole.on('close', () => {
            this.logger.info(chalk.yellow('Admin console closed'));
        });

        // Print welcome message and prompt
        console.log(chalk.green('🔧 Admin Console Ready - Type "help" for available commands'));
        this.adminConsole.prompt();
    }

    /**
     * Handle admin console commands
     * @param {string} input - Command input
     */
    async handleAdminCommand(input) {
        const [command, ...args] = input.split(' ');

        switch (command.toLowerCase()) {
            case 'help':
                this.showHelp();
                break;

            case 'update':
                await this.manualUpdate();
                break;

            case 'status':
                await this.showStatus();
                break;

            case 'restart':
                await this.restartBot();
                break;

            case 'lock':
                await this.createUpdateLock();
                this.logger.info(chalk.yellow('🔒 Updates locked'));
                break;

            case 'unlock':
                await this.removeUpdateLock();
                this.logger.info(chalk.green('🔓 Updates unlocked'));
                break;

            case 'pull':
                await this.pullChanges();
                break;

            case 'install':
                await this.installDependencies();
                break;

            case 'backup':
                await this.createBackup();
                break;

            case 'config':
                if (args[0] === 'set' && args.length >= 3) {
                    this.setConfig(args[1], args.slice(2).join(' '));
                } else {
                    this.showConfig();
                }
                break;

            case 'log':
                const level = args[0] || 'info';
                const message = args.slice(1).join(' ') || 'Test log message';
                this.logger[level](`[ADMIN] ${message}`);
                break;

            case 'exec':
                if (args.length === 0) {
                    this.logger.warn(chalk.yellow('⚠️ No command specified'));
                    break;
                }
                await this.execCommand(args.join(' '));
                break;

            case 'exit':
                process.exit(0);
                break;

            default:
                this.logger.warn(chalk.yellow(`⚠️ Unknown command: ${command}`));
                this.showHelp();
        }
    }

    /**
     * Show help information
     */
    showHelp() {
        console.log(chalk.cyan('\n===== Admin Console Commands ====='));
        console.log(chalk.yellow('help') + ' - Show this help');
        console.log(chalk.yellow('update') + ' - Check and apply updates manually');
        console.log(chalk.yellow('status') + ' - Show current update status');
        console.log(chalk.yellow('restart') + ' - Restart the bot');
        console.log(chalk.yellow('lock') + ' - Lock automatic updates');
        console.log(chalk.yellow('unlock') + ' - Unlock automatic updates');
        console.log(chalk.yellow('pull') + ' - Pull latest changes from git');
        console.log(chalk.yellow('install') + ' - Install dependencies');
        console.log(chalk.yellow('backup') + ' - Create a backup');
        console.log(chalk.yellow('config') + ' - Show current configuration');
        console.log(chalk.yellow('config set <key> <value>') + ' - Set configuration value');
        console.log(chalk.yellow('log <level> <message>') + ' - Log a message');
        console.log(chalk.yellow('exec <command>') + ' - Execute a shell command');
        console.log(chalk.yellow('exit') + ' - Exit the process');
        console.log(chalk.cyan('================================\n'));
    }

    /**
     * Display the current status
     */
    async showStatus() {
        const currentCommit = await this.getCurrentCommit();
        const latestCommit = await this.getLatestCommit();
        const isLocked = await this.isUpdateLocked();

        console.log(chalk.cyan('\n===== Auto-Updater Status ====='));
        console.log(chalk.yellow('Current commit:  ') + currentCommit);
        console.log(chalk.yellow('Last known:      ') + this.lastCommit);
        console.log(chalk.yellow('Latest commit:   ') + (latestCommit || 'Unknown'));
        console.log(chalk.yellow('Update interval: ') + this.config.interval);
        console.log(chalk.yellow('Repository:      ') + this.config.repository);
        console.log(chalk.yellow('Branch:          ') + this.config.branch);
        console.log(chalk.yellow('Auto-install:    ') + (this.config.autoInstall ? 'Yes' : 'No'));
        console.log(chalk.yellow('Auto-pull:       ') + (this.config.autoPull ? 'Yes' : 'No'));
        console.log(chalk.yellow('Auto-restart:    ') + (this.config.autoRestart ? 'Yes' : 'No'));
        console.log(chalk.yellow('Updates locked:  ') + (isLocked ? 'Yes' : 'No'));
        console.log(chalk.yellow('Running status:  ') + (this.isRunning ? 'Working' : 'Idle'));
        console.log(chalk.cyan('==============================\n'));
    }

    /**
     * Manually trigger update process
     */
    async manualUpdate() {
        this.logger.info(chalk.blue('🔄 Manual update triggered'));
        const updated = await this.checkForUpdates();

        if (!updated) {
            this.logger.info(chalk.yellow('No updates were applied'));
        }
    }

    /**
     * Show the current configuration
     */
    showConfig() {
        console.log(chalk.cyan('\n===== Configuration ====='));

        Object.entries(this.config).forEach(([key, value]) => {
            // Mask token if present
            if (key === 'token' && value) {
                value = '********';
            }
            console.log(chalk.yellow(`${key}: `) + value);
        });

        console.log(chalk.cyan('========================\n'));
    }

    /**
     * Set a configuration value
     * @param {string} key - Configuration key
     * @param {string} value - Configuration value
     */
    setConfig(key, value) {
        if (!(key in this.config)) {
            this.logger.warn(chalk.yellow(`⚠️ Unknown configuration key: ${key}`));
            return;
        }

        // Convert value to appropriate type
        let typedValue = value;

        if (value === 'true') typedValue = true;
        else if (value === 'false') typedValue = false;
        else if (!isNaN(value) && value !== '') typedValue = Number(value);

        // Update config
        this.config[key] = typedValue;

        // If changing interval, restart the cron job
        if (key === 'interval') {
            this.startUpdateChecker();
        }

        this.logger.info(chalk.green(`✅ Configuration updated: ${key} = ${typedValue}`));
    }

    /**
     * Execute a shell command
     * @param {string} command - Command to execute
     */
    async execCommand(command) {
        const spinner = ora(`Executing: ${command}`).start();

        try {
            const { stdout, stderr } = await this.execPromise(command);
            spinner.succeed(chalk.green('Command executed'));

            if (stdout) {
                console.log(chalk.cyan('\n--- Command Output ---'));
                console.log(stdout);
                console.log(chalk.cyan('---------------------\n'));
            }

            if (stderr) {
                console.log(chalk.yellow('\n--- Command Errors ---'));
                console.log(stderr);
                console.log(chalk.yellow('---------------------\n'));
            }
        } catch (error) {
            spinner.fail(chalk.red('Command failed'));
            this.logger.error(chalk.red('Error details:'), error);

            if (error.stdout) {
                console.log(chalk.cyan('\n--- Command Output ---'));
                console.log(error.stdout);
                console.log(chalk.cyan('---------------------\n'));
            }

            if (error.stderr) {
                console.log(chalk.yellow('\n--- Command Errors ---'));
                console.log(error.stderr);
                console.log(chalk.yellow('---------------------\n'));
            }
        }
    }

    /**
     * Execute a command and return a promise
     * @param {string} command - Command to execute
     * @returns {Promise<{stdout: string, stderr: string}>}
     */
    execPromise(command) {
        return new Promise((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    error.stdout = stdout;
                    error.stderr = stderr;
                    reject(error);
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
    }

    /**
     * Stop the auto-updater
     */
    async stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }

        if (this.adminConsole) {
            this.adminConsole.close();
            this.adminConsole = null;
        }

        this.logger.info(chalk.yellow('Auto-updater stopped'));
    }
}

export default AutoUpdater;