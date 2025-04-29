// includes/autoUpdater.js
import { exec, execSync, spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs, existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';
import cron from 'node-cron';
import { createInterface } from 'readline';
import dotenv from 'dotenv';
import { defaultLogger } from '../utils/logger.js';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

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
            maxBackups: options.maxBackups || 5,
            compareMode: options.compareMode || 'commit', // 'commit' hoặc 'files'
            notifyChanges: options.notifyChanges !== false,
            updateTimeout: options.updateTimeout || 300000, // 5 phút
            skipPaths: options.skipPaths || ['node_modules', '.git', 'backups', '.env', 'logs'],
            preUpdateCommand: options.preUpdateCommand || null,
            postUpdateCommand: options.postUpdateCommand || null,
        };

        this.logger = options.logger || defaultLogger;
        this.bot = options.bot || null;
        this.lastCommit = null;
        this.isRunning = false;
        this.cronJob = null;
        this.adminConsole = null;
        this.__dirname = dirname(fileURLToPath(import.meta.url));
        this.commitFilePath = join(this.__dirname, '..', '.lastcommit');
        this.updateLockPath = join(this.__dirname, '..', '.updatelock');
        this.changelog = [];
        this.updateTimeout = null;
        this.webhookUrl = process.env.UPDATE_WEBHOOK_URL || null;
    }

    async init() {
        try {
            // Kiểm tra xem Git có được cài đặt không
            await this.checkGitInstallation();

            // Tạo thư mục backup nếu chưa tồn tại
            await fs.mkdir(this.config.backupDir, { recursive: true });

            // Kiểm tra lock file cho quá trình cập nhật
            await this.checkUpdateLock();

            // Đọc commit hash cuối cùng đã biết
            await this.loadLastCommit();

            // Khởi động cron job nếu interval được cấu hình
            if (this.config.interval) this.startUpdateChecker();

            // Khởi tạo admin console nếu được bật
            if (this.config.adminEnabled) this.initAdminConsole();

            this.logger.info(chalk.green('✅ Auto-updater initialized successfully'));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to initialize auto-updater:'), error);
        }
    }

    async checkGitInstallation() {
        try {
            await this.execPromise('git --version');
        } catch (error) {
            throw new Error('Git is not installed or not in PATH. Auto-updater requires Git to be installed.');
        }
    }

    async checkUpdateLock() {
        try {
            if (existsSync(this.updateLockPath)) {
                const lockData = JSON.parse(await fs.readFile(this.updateLockPath, 'utf-8'));
                const now = Date.now();

                // Nếu lock quá hạn (hơn 30 phút), xóa lock file
                if (now - lockData.timestamp > 1800000) {
                    await fs.unlink(this.updateLockPath);
                    this.logger.warn(chalk.yellow('🔓 Removed stale update lock file'));
                } else {
                    this.logger.warn(chalk.yellow('⚠️ Update process is locked by another instance'));
                }
            }
        } catch (error) {
            // Nếu có lỗi khi đọc lock file, xóa file đó
            try {
                await fs.unlink(this.updateLockPath);
            } catch { }
        }
    }

    async createUpdateLock() {
        await fs.writeFile(
            this.updateLockPath,
            JSON.stringify({ timestamp: Date.now(), pid: process.pid })
        );
    }

    async releaseUpdateLock() {
        try {
            await fs.unlink(this.updateLockPath);
        } catch { }
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

            if (this.config.verbose) {
                this.logger.info(chalk.blue(`📝 Last recorded commit: ${this.lastCommit.substring(0, 7)}`));
            }
        } catch {
            const currentCommit = await this.getCurrentCommit();
            await this.saveLastCommit(currentCommit);
            this.lastCommit = currentCommit;

            this.logger.info(chalk.blue(`📝 Initialized with current commit: ${currentCommit.substring(0, 7)}`));
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

    async checkForUpdates(force = false) {
        // Kiểm tra nếu đang có quá trình cập nhật chạy
        if (this.isRunning) {
            this.logger.warn(chalk.yellow('⚠️ Update process already running'));
            return;
        }

        // Kiểm tra lock file
        if (existsSync(this.updateLockPath) && !force) {
            this.logger.warn(chalk.yellow('⚠️ Update process is locked. Use force option to override.'));
            return;
        }

        this.isRunning = true;
        await this.createUpdateLock();

        // Đặt timeout để tránh cập nhật bị treo
        this.updateTimeout = setTimeout(() => {
            this.logger.error(chalk.red('❌ Update process timed out'));
            this.isRunning = false;
            this.releaseUpdateLock();
        }, this.config.updateTimeout);

        const spinner = ora('Checking for updates...').start();

        try {
            // Kiểm tra commit mới nhất từ GitHub
            const latestCommit = await this.getLatestCommit();
            if (!latestCommit) {
                spinner.fail('Failed to fetch latest commit');
                return;
            }

            let needsUpdate = false;
            let changes = [];

            // Phương thức so sánh
            if (this.config.compareMode === 'commit') {
                // So sánh dựa trên commit hash
                needsUpdate = latestCommit !== this.lastCommit;
            } else if (this.config.compareMode === 'files') {
                // So sánh dựa trên sự thay đổi của file
                changes = await this.getChangedFiles();
                needsUpdate = changes.length > 0;
            }

            if (!needsUpdate) {
                spinner.succeed('Already up to date');
                return;
            }

            spinner.text = 'Update found! Preparing to update...';

            // Lưu changelog nếu có thể
            if (this.config.compareMode === 'commit') {
                this.changelog = await this.getChangelog(this.lastCommit, latestCommit);
            }

            // Chạy lệnh pre-update nếu được cấu hình
            if (this.config.preUpdateCommand) {
                spinner.text = 'Running pre-update command...';
                await this.execPromise(this.config.preUpdateCommand);
            }

            // Tạo backup trước khi cập nhật
            await this.createBackup();

            if (this.config.autoPull) {
                spinner.text = 'Pulling latest changes...';
                await this.pullChanges();
            }

            if (this.config.autoInstall) {
                spinner.text = 'Installing dependencies...';
                await this.installDependencies();
            }

            // Lưu commit hash mới
            await this.saveLastCommit(latestCommit);

            // Chạy lệnh post-update nếu được cấu hình
            if (this.config.postUpdateCommand) {
                spinner.text = 'Running post-update command...';
                await this.execPromise(this.config.postUpdateCommand);
            }

            spinner.succeed(chalk.green(`✅ Update successful! New commit: ${latestCommit.substring(0, 7)}`));

            // Dọn dẹp các bản backup cũ
            await this.cleanupOldBackups();

            // Gửi thông báo về các thay đổi nếu được bật
            if (this.config.notifyChanges) {
                await this.notifyChanges(latestCommit);
            }

            // Khởi động lại bot nếu được cấu hình
            if (this.config.autoRestart) {
                await this.restartBot();
            }
        } catch (error) {
            spinner.fail('Update failed');
            this.logger.error(chalk.red('Update error:'), error);

            // Thử khôi phục từ backup nếu có lỗi
            await this.recoverFromBackup();
        } finally {
            clearTimeout(this.updateTimeout);
            this.isRunning = false;
            await this.releaseUpdateLock();
        }
    }

    async getLatestCommit() {
        try {
            const [owner, repo] = this.config.repository.split('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/commits/${this.config.branch}`;
            const headers = { 'User-Agent': 'ZaloBot-AutoUpdater' };

            if (this.config.token) {
                headers['Authorization'] = `token ${this.config.token}`;
            }

            const response = await fetch(url, { headers });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.statusText} (${response.status})`);
            }

            const data = await response.json();
            return data.sha;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get latest commit:'), error);
            return null;
        }
    }

    async getChangedFiles() {
        try {
            await this.execPromise('git fetch origin');
            const result = await this.execPromise(`git diff --name-only HEAD origin/${this.config.branch}`);

            if (!result.stdout.trim()) return [];

            const changedFiles = result.stdout
                .trim()
                .split('\n')
                .filter(file => !this.config.skipPaths.some(path => file.startsWith(path)));

            return changedFiles;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get changed files:'), error);
            return [];
        }
    }

    async getChangelog(oldCommit, newCommit) {
        try {
            const result = await this.execPromise(`git log --pretty=format:"%h - %s (%an)" ${oldCommit}..${newCommit}`);
            if (!result.stdout.trim()) return [];
            return result.stdout.trim().split('\n');
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to get changelog:'), error);
            return [];
        }
    }

    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-${timestamp}`;
        const backupPath = join(this.config.backupDir, backupName);

        try {
            // Tạo thư mục backup
            await fs.mkdir(backupPath, { recursive: true });

            // Tạo file zip với Git archive
            const archiveFile = join(this.config.backupDir, `${backupName}.tar.gz`);

            // Sử dụng Git archive để tạo tarball của repo
            const tar = spawn('git', ['archive', '--format=tar', 'HEAD']);
            const gzip = createGzip();
            const output = createWriteStream(archiveFile);

            tar.stdout.pipe(gzip).pipe(output);

            // Đợi quá trình nén hoàn tất
            await new Promise((resolve, reject) => {
                output.on('finish', resolve);
                output.on('error', reject);
                tar.on('error', reject);
            });

            // Lưu thông tin môi trường
            await fs.writeFile(
                join(backupPath, 'backup-info.json'),
                JSON.stringify({
                    timestamp: new Date().toISOString(),
                    commit: this.lastCommit,
                    branch: this.config.branch,
                    environment: process.env.NODE_ENV || 'development'
                }, null, 2)
            );

            // Sao chép .env nếu tồn tại
            if (existsSync(join(this.__dirname, '..', '.env'))) {
                await fs.copyFile(
                    join(this.__dirname, '..', '.env'),
                    join(backupPath, '.env.backup')
                );
            }

            this.logger.info(chalk.blue(`📦 Backup created: ${backupName}.tar.gz`));
            return backupName;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to create backup:'), error);
            throw error;
        }
    }

    async cleanupOldBackups() {
        try {
            const files = await fs.readdir(this.config.backupDir);
            const backupFiles = files
                .filter(file => file.startsWith('backup-') && file.endsWith('.tar.gz'))
                .map(file => ({
                    name: file,
                    path: join(this.config.backupDir, file),
                    time: (file.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/) || [])[1]
                }))
                .sort((a, b) => b.time.localeCompare(a.time));

            if (backupFiles.length > this.config.maxBackups) {
                const filesToDelete = backupFiles.slice(this.config.maxBackups);
                for (const file of filesToDelete) {
                    await fs.unlink(file.path);

                    // Xóa thư mục backup tương ứng nếu tồn tại
                    const dirName = file.name.replace('.tar.gz', '');
                    const dirPath = join(this.config.backupDir, dirName);

                    if (existsSync(dirPath)) {
                        await fs.rm(dirPath, { recursive: true, force: true });
                    }

                    this.logger.info(chalk.blue(`🗑️ Deleted old backup: ${file.name}`));
                }
            }
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to cleanup old backups:'), error);
        }
    }

    async recoverFromBackup() {
        try {
            const files = await fs.readdir(this.config.backupDir);
            const backupFiles = files
                .filter(file => file.startsWith('backup-') && file.endsWith('.tar.gz'))
                .map(file => ({
                    name: file,
                    path: join(this.config.backupDir, file),
                    time: (file.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/) || [])[1]
                }))
                .sort((a, b) => b.time.localeCompare(a.time));

            if (backupFiles.length === 0) {
                this.logger.error(chalk.red('❌ No backups found for recovery'));
                return false;
            }

            const latestBackup = backupFiles[0];
            this.logger.info(chalk.yellow(`⚠️ Attempting recovery from ${latestBackup.name}`));

            // Khôi phục từ tarball
            await this.execPromise(`tar -xzf ${latestBackup.path} -C ${join(this.__dirname, '..')}`);

            // Khôi phục .env nếu có
            const envBackupPath = join(this.config.backupDir, latestBackup.name.replace('.tar.gz', ''), '.env.backup');
            if (existsSync(envBackupPath)) {
                await fs.copyFile(envBackupPath, join(this.__dirname, '..', '.env'));
            }

            this.logger.info(chalk.green('✅ Recovery successful'));
            return true;
        } catch (error) {
            this.logger.error(chalk.red('❌ Recovery failed:'), error);
            return false;
        }
    }

    async pullChanges() {
        try {
            // Lưu các thay đổi cục bộ vào stash
            await this.execPromise('git stash');

            // Kéo các thay đổi từ remote
            const result = await this.execPromise(`git pull origin ${this.config.branch}`);

            // Áp dụng lại stash nếu cần
            try {
                await this.execPromise('git stash pop');
            } catch (e) {
                // Bỏ qua lỗi nếu không có gì trong stash
            }

            this.logger.info(chalk.blue('📥 Pulled latest changes'));
            return result;
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to pull changes:'), error);
            throw error;
        }
    }

    async installDependencies() {
        try {
            const timeStart = Date.now();
            await this.execPromise('npm ci --no-audit --no-fund');
            const timeEnd = Date.now();

            this.logger.info(chalk.blue(`📦 Installed dependencies (${((timeEnd - timeStart) / 1000).toFixed(1)}s)`));
        } catch (error) {
            this.logger.warn(chalk.yellow('⚠️ Failed to run npm ci, falling back to npm install'));

            try {
                await this.execPromise('npm install --no-audit --no-fund');
                this.logger.info(chalk.blue('📦 Installed dependencies'));
            } catch (fallbackError) {
                this.logger.error(chalk.red('❌ Failed to install dependencies:'), fallbackError);
                throw fallbackError;
            }
        }
    }

    async notifyChanges(newCommit) {
        if (!this.changelog.length) return;

        // Log thông báo
        this.logger.info(chalk.green('📋 Changelog:'));
        for (const change of this.changelog) {
            this.logger.info(chalk.gray(`  ${change}`));
        }

        // Gửi webhook nếu được cấu hình
        if (this.webhookUrl) {
            try {
                const payload = {
                    content: `**Bot updated to ${newCommit.substring(0, 7)}**`,
                    embeds: [{
                        title: 'Update Changelog',
                        description: this.changelog.join('\n'),
                        color: 3066993,
                        footer: {
                            text: `Updated at ${new Date().toISOString()}`
                        }
                    }]
                };

                await fetch(this.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (error) {
                this.logger.error(chalk.red('❌ Failed to send webhook notification:'), error);
            }
        }
    }

    async restartBot() {
        this.logger.info(chalk.blue('🔄 Restarting bot...'));

        if (this.bot && typeof this.bot.shutdown === 'function') {
            try {
                await this.bot.shutdown();
            } catch (error) {
                this.logger.error(chalk.red('❌ Error during bot shutdown:'), error);
            }
        }

        setTimeout(() => {
            process.on('exit', () => {
                execSync(`node ${process.argv[1]}`, { stdio: 'inherit' });
            });
            process.exit(0);
        }, 1000);
    }

    async reset(newConfig = null) {
        this.logger.info(chalk.blue('🔄 Resetting auto-updater...'));

        // Stop existing processes
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }

        // Clear any running update process
        if (this.isRunning) {
            clearTimeout(this.updateTimeout);
            this.isRunning = false;
            await this.releaseUpdateLock();
        }

        // Update config if provided
        if (newConfig) {
            this.config = { ...this.config, ...newConfig };
        }

        // Reset state
        this.changelog = [];

        // Re-initialize core components
        await this.loadLastCommit();

        // Restart update checker
        if (this.config.interval) {
            this.startUpdateChecker();
        }

        this.logger.info(chalk.green('✅ Auto-updater reset successfully'));
        return true;
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

        console.log(chalk.green('🔧 Admin Console Ready - Type "help" for commands'));
        this.adminConsole.prompt();
    }

    async handleAdminCommand(input) {
        const [command, ...args] = input.split(' ');

        switch (command.toLowerCase()) {
            case 'help':
                console.log(chalk.cyan('Available commands:'));
                console.log(chalk.gray('  help           - Show this help'));
                console.log(chalk.gray('  update         - Check for updates and apply if available'));
                console.log(chalk.gray('  force-update   - Force update regardless of current state'));
                console.log(chalk.gray('  restart        - Restart the bot'));
                console.log(chalk.gray('  status         - Show current update status'));
                console.log(chalk.gray('  backup         - Create a manual backup'));
                console.log(chalk.gray('  recover        - Recover from the latest backup'));
                console.log(chalk.gray('  config         - Show current configuration'));
                console.log(chalk.gray('  exit           - Exit the application'));
                break;
            case 'update':
                await this.checkForUpdates();
                break;
            case 'force-update':
                await this.checkForUpdates(true);
                break;
            case 'restart':
                await this.restartBot();
                break;
            case 'status':
                const currentCommit = await this.getCurrentCommit();
                console.log(chalk.cyan('Update Status:'));
                console.log(chalk.gray(`  Last update: ${this.lastCommit.substring(0, 7)}`));
                console.log(chalk.gray(`  Current commit: ${currentCommit.substring(0, 7)}`));
                console.log(chalk.gray(`  Update running: ${this.isRunning ? 'Yes' : 'No'}`));
                console.log(chalk.gray(`  Update locked: ${existsSync(this.updateLockPath) ? 'Yes' : 'No'}`));
                break;
            case 'backup':
                const backupName = await this.createBackup();
                console.log(chalk.green(`✅ Manual backup created: ${backupName}`));
                break;
            case 'recover':
                await this.recoverFromBackup();
                break;
            case 'config':
                console.log(chalk.cyan('Current configuration:'));
                Object.entries(this.config).forEach(([key, value]) => {
                    if (key === 'token') value = value ? '********' : null;
                    console.log(chalk.gray(`  ${key}: ${value}`));
                });
                break;
            case 'reset':
                await this.reset();
                console.log(chalk.green('✅ Auto-updater reset successfully'));
                break;
            case 'exit':
                console.log(chalk.yellow('Exiting application...'));
                process.exit(0);
                break;
            default:
                this.logger.warn(chalk.yellow(`⚠️ Unknown command: ${command}. Type 'help' for available commands.`));
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
        autoInstall: process.env.AUTO_INSTALL !== 'true',
        autoPull: process.env.AUTO_PULL !== 'false',
        autoRestart: process.env.AUTO_RESTART !== 'false',
        token: process.env.GITHUB_TOKEN || null,
        verbose: process.env.UPDATE_VERBOSE === 'true',
        backupDir: join(__dirname, '../backups'),
        adminEnabled: process.env.ADMIN_CONSOLE === 'true',
        maxBackups: parseInt(process.env.MAX_BACKUPS || '5', 10),
        compareMode: process.env.COMPARE_MODE || 'commit',
        notifyChanges: process.env.NOTIFY_CHANGES !== 'false',
        updateTimeout: parseInt(process.env.UPDATE_TIMEOUT || '300000', 10),
        skipPaths: (process.env.SKIP_PATHS || 'node_modules,.git,backups,.env,logs,sqlite').split(','),
        preUpdateCommand: process.env.PRE_UPDATE_COMMAND || null,
        postUpdateCommand: process.env.POST_UPDATE_COMMAND || null,
    };

    try {
        const configDir = dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });

        try {
            const fileContent = await fs.readFile(configPath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);
            config = { ...config, ...fileConfig };

            // Ghi lại config với các giá trị mới từ env
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            // Tạo file config nếu chưa tồn tại
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        }
    } catch (error) {
        defaultLogger.error('Failed to load/create auto-update config:', error);
    }

    const updater = new AutoUpdater({ ...config, logger: defaultLogger, bot: botInstance });
    await updater.init();

    // Chạy kiểm tra cập nhật ban đầu sau 30 giây
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