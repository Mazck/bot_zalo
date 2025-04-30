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
            compareMode: options.compareMode || 'files', // Thay đổi mặc định sang 'files'
            notifyChanges: options.notifyChanges !== false,
            updateTimeout: options.updateTimeout || 300000, // 5 phút
            skipPaths: options.skipPaths || ['node_modules', '.git', 'backups', '.env', 'logs'],
            preUpdateCommand: options.preUpdateCommand || null,
            postUpdateCommand: options.postUpdateCommand || null,
            // Thêm tùy chọn mới
            updateIndividualFiles: options.updateIndividualFiles !== false,
            hotReload: options.hotReload !== false,
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
        this.cachedRequireModules = new Map(); // Lưu trữ cache của module đã require
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

            // Fetch changes từ remote
            await this.execPromise('git fetch origin');

            // Lấy danh sách các file đã thay đổi
            const changedFiles = await this.getChangedFiles();

            if (changedFiles.length === 0) {
                spinner.succeed('Already up to date. No files changed.');
                clearTimeout(this.updateTimeout);
                this.isRunning = false;
                await this.releaseUpdateLock();
                return;
            }

            spinner.text = `Update found! ${changedFiles.length} file(s) changed.`;

            // Lưu changelog
            this.changelog = await this.getChangelog(this.lastCommit, latestCommit);

            // Tạo backup trước khi cập nhật
            await this.createBackup();

            // Chạy lệnh pre-update nếu được cấu hình
            if (this.config.preUpdateCommand) {
                spinner.text = 'Running pre-update command...';
                await this.execPromise(this.config.preUpdateCommand);
            }

            if (this.config.updateIndividualFiles) {
                // Cập nhật từng file riêng lẻ
                spinner.text = 'Updating individual files...';
                await this.updateIndividualFiles(changedFiles);

                // Đánh dấu là đã cập nhật đến commit mới nhất
                await this.saveLastCommit(latestCommit);
            } else {
                // Pull toàn bộ thay đổi
                if (this.config.autoPull) {
                    spinner.text = 'Pulling latest changes...';
                    await this.pullChanges();
                }
            }

            if (this.config.autoInstall) {
                spinner.text = 'Installing dependencies...';
                await this.installDependencies();
            }

            // Chạy lệnh post-update nếu được cấu hình
            if (this.config.postUpdateCommand) {
                spinner.text = 'Running post-update command...';
                await this.execPromise(this.config.postUpdateCommand);
            }

            // Hot reload các module đã thay đổi
            if (this.config.hotReload) {
                spinner.text = 'Hot reloading updated modules...';
                await this.hotReloadModules(changedFiles);
            }

            spinner.succeed(chalk.green(`✅ Update successful! Updated ${changedFiles.length} files to commit: ${latestCommit.substring(0, 7)}`));

            // Dọn dẹp các bản backup cũ
            await this.cleanupOldBackups();

            // Gửi thông báo về các thay đổi nếu được bật
            if (this.config.notifyChanges) {
                await this.notifyChanges(latestCommit, changedFiles);
            }

            // Không khởi động lại bot - Theo yêu cầu
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

    // Phương thức mới để cập nhật từng file riêng lẻ
    async updateIndividualFiles(changedFiles) {
        if (!changedFiles.length) return;

        try {
            for (const file of changedFiles) {
                this.logger.info(chalk.blue(`📄 Updating file: ${file}`));

                // Tạo backup cho file hiện tại
                if (existsSync(join(this.__dirname, '..', file))) {
                    await fs.copyFile(
                        join(this.__dirname, '..', file),
                        join(this.__dirname, '..', `${file}.bak`)
                    );
                }

                try {
                    // Lấy nội dung từ remote và ghi đè file
                    const result = await this.execPromise(`git show origin/${this.config.branch}:${file}`);

                    // Đảm bảo thư mục tồn tại
                    const dir = dirname(join(this.__dirname, '..', file));
                    await fs.mkdir(dir, { recursive: true });

                    // Ghi nội dung mới vào file
                    await fs.writeFile(join(this.__dirname, '..', file), result.stdout);

                    // Xóa backup nếu thành công
                    if (existsSync(join(this.__dirname, '..', `${file}.bak`))) {
                        await fs.unlink(join(this.__dirname, '..', `${file}.bak`));
                    }
                } catch (error) {
                    this.logger.error(chalk.red(`❌ Failed to update file ${file}:`), error);

                    // Khôi phục từ backup nếu có lỗi
                    if (existsSync(join(this.__dirname, '..', `${file}.bak`))) {
                        await fs.copyFile(
                            join(this.__dirname, '..', `${file}.bak`),
                            join(this.__dirname, '..', file)
                        );
                        await fs.unlink(join(this.__dirname, '..', `${file}.bak`));
                        this.logger.info(chalk.yellow(`⚠️ Restored backup for file: ${file}`));
                    }
                }
            }
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to update individual files:'), error);
            throw error;
        }
    }

    // Phương thức mới để hot reload các module đã thay đổi
    async hotReloadModules(changedFiles) {
        if (!changedFiles.length) return;

        try {
            const jsFiles = changedFiles.filter(file =>
                file.endsWith('.js') ||
                file.endsWith('.mjs') ||
                file.endsWith('.cjs')
            );

            if (!jsFiles.length) {
                this.logger.info(chalk.blue('No JavaScript modules to reload'));
                return;
            }

            this.logger.info(chalk.blue(`🔄 Hot reloading ${jsFiles.length} module(s)`));

            for (const file of jsFiles) {
                try {
                    const modulePath = join(this.__dirname, '..', file);
                    const relativeModulePath = join('..', file);

                    // Xóa cache module
                    if (require.cache[require.resolve(modulePath)]) {
                        delete require.cache[require.resolve(modulePath)];
                        this.logger.info(chalk.blue(`🔄 Reloaded module: ${file}`));
                    }

                    // Xóa cache cho ES modules
                    try {
                        const moduleUrl = new URL(relativeModulePath, import.meta.url).href;
                        // Trong ES modules, không có cache chính thức, nhưng chúng ta vẫn thông báo
                        this.logger.info(chalk.blue(`🔄 Reloaded ES module: ${file}`));
                    } catch (e) {
                        // Bỏ qua lỗi khi không phải ES module
                    }
                } catch (error) {
                    this.logger.warn(chalk.yellow(`⚠️ Could not reload module ${file}:`), error);
                }
            }

            this.logger.info(chalk.green('✅ Hot reload completed'));
        } catch (error) {
            this.logger.error(chalk.red('❌ Failed to hot reload modules:'), error);
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

    async notifyChanges(newCommit, changedFiles = []) {
        if (!this.changelog.length) return;

        // Log thông báo
        this.logger.info(chalk.green('📋 Changelog:'));
        for (const change of this.changelog) {
            this.logger.info(chalk.gray(`  ${change}`));
        }

        // Log các file đã thay đổi
        if (changedFiles.length) {
            this.logger.info(chalk.green('📂 Changed files:'));
            for (const file of changedFiles) {
                this.logger.info(chalk.gray(`  ${file}`));
            }
        }

        // Gửi webhook nếu được cấu hình
        if (this.webhookUrl) {
            try {
                const filesDescription = changedFiles.length > 0
                    ? `\n\n**Changed files:**\n${changedFiles.map(f => `- \`${f}\``).join('\n')}`
                    : '';

                const payload = {
                    content: `**Bot updated to ${newCommit.substring(0, 7)}**`,
                    embeds: [{
                        title: 'Update Changelog',
                        description: this.changelog.join('\n') + filesDescription,
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
                break; console.log(chalk.gray('  exit           - Exit the application'));
                break;

            case 'update':
                console.log(chalk.blue('🔍 Checking for updates...'));
                await this.checkForUpdates();
                break;

            case 'force-update':
                console.log(chalk.blue('🔄 Forcing update...'));
                await this.checkForUpdates(true);
                break;

            case 'restart':
                console.log(chalk.blue('🔄 Restarting...'));
                await this.restartBot();
                break;

            case 'status':
                console.log(chalk.cyan('📊 Status:'));
                console.log(chalk.gray(`  Running: ${this.isRunning}`));
                console.log(chalk.gray(`  Last commit: ${this.lastCommit?.substring(0, 7) || 'unknown'}`));
                console.log(chalk.gray(`  Update schedule: ${this.config.interval}`));

                try {
                    const latestCommit = await this.getLatestCommit();
                    console.log(chalk.gray(`  Latest commit: ${latestCommit?.substring(0, 7) || 'unknown'}`));

                    const needsUpdate = latestCommit && latestCommit !== this.lastCommit;
                    console.log(chalk.gray(`  Needs update: ${needsUpdate ? chalk.yellow('Yes') : chalk.green('No')}`));

                    if (needsUpdate) {
                        const changedFiles = await this.getChangedFiles();
                        console.log(chalk.gray(`  Changed files: ${changedFiles.length}`));
                    }
                } catch (error) {
                    console.log(chalk.red(`  Error checking status: ${error.message}`));
                }
                break;

            case 'backup':
                console.log(chalk.blue('📦 Creating backup...'));
                const backupName = await this.createBackup();
                console.log(chalk.green(`✅ Backup created: ${backupName}`));
                break;

            case 'recover':
                console.log(chalk.yellow('⚠️ Recovering from latest backup...'));
                const success = await this.recoverFromBackup();
                if (success) {
                    console.log(chalk.green('✅ Recovery successful'));
                } else {
                    console.log(chalk.red('❌ Recovery failed'));
                }
                break;

            case 'config':
                console.log(chalk.cyan('⚙️ Configuration:'));
                Object.entries(this.config).forEach(([key, value]) => {
                    console.log(chalk.gray(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`));
                });
                break;

            case 'exit':
                console.log(chalk.blue('👋 Exiting...'));
                process.exit(0);
                break;

            default:
                console.log(chalk.red(`❌ Unknown command: ${command}`));
                console.log(chalk.gray('Type "help" for available commands'));
        }
    }

    execPromise(command) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd: join(this.__dirname, '..') }, (error, stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                resolve({ stdout, stderr });
            });
        });
    }
}

export default AutoUpdater;