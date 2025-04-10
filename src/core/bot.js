import { Zalo } from "zca-js"
import moment from "moment-timezone"
import { join, dirname } from "path"
import pkg from 'fs-extra';
const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = pkg;
import { defaultLogger } from "../utils/logger.js"
import { execSync } from 'child_process';
import { fileURLToPath } from "url"
import { createRequire } from 'module';
import Database from "../db/models/index.js";
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import ora from 'ora';
import handleLogin from "../includes/handler/loginHandler.js";
import { initGroupEventListener } from "../includes/handler/groupEvent.js"
import schedule from 'node-schedule';

// Kiểm tra các package cần thiết
try {
    import('chalk');
    import('figlet');
    import('gradient-string');
    import('ora');
} catch (e) {
    console.log('Package cần thiết chưa được cài đặt');
    console.log('Vui lòng cài đặt bằng lệnh:');
    console.log('npm install chalk figlet gradient-string ora');
    process.exit(1);
}

global.data = new Object({
    threadInfo: new Map(),
    threadData: new Map(),
    userName: new Map(),
    userBanned: new Map(),
    threadBanned: new Map(),
    commandBanned: new Map(),
    threadAllowNSFW: new Array(),
    allUserID: new Array(),
    allCurrenciesID: new Array(),
    allThreadID: new Array()
});

class ZaloBot {
    constructor() {
        // Initialize important properties
        this.commands = new Map();
        this.events = new Map();
        this.zalo = null;
        this.api = null;
        this.config = JSON.parse(readFileSync("./config.json", "utf-8"));
        this.cookie = existsSync("./cookie.json") ? JSON.parse(readFileSync("./cookie.json", "utf-8")) : null;
        this.logger = defaultLogger;
        // Create a require function for checking package installation
        this.require = createRequire(import.meta.url);
        this.database = null;
    }

    /**
     * Display a fancy splash screen
     */
    async displaySplashScreen() {
        console.clear();

        // Tạo text lớn với figlet
        const titleText = figlet.textSync('ZALO BOT', {
            font: 'ANSI Shadow',
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 100,
            whitespaceBreak: true
        });

        // Tạo gradient màu đẹp
        const titleColors = gradient(['#00FFFF', '#0080FF', '#0000FF', '#8000FF', '#FF00FF']);
        console.log(titleColors(titleText));

        // Hiển thị thông tin bot
        console.log('\n' + chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.cyan('┃ ') + chalk.yellow('Zalo Bot Framework') + chalk.cyan(' ┃ ') + chalk.green('Version: 1.0.0') + chalk.cyan(' ┃'));
        console.log(
            chalk.cyan("┃ ") +
            chalk.yellow("Developer: ") +
            chalk.white("NTDat") +
            chalk.cyan("   ┃ ") +
            chalk.green(moment().format("YYYY-MM-DD HH:mm:ss")) +
            chalk.cyan(" ┃")
        );
        console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

        // Animation loading
        const spinner = ora({
            text: 'Đang khởi tạo bot...',
            color: 'blue'
        }).start();

        await new Promise(resolve => setTimeout(resolve, 1000));
        spinner.text = 'Đang tải các module...';

        await new Promise(resolve => setTimeout(resolve, 1000));
        spinner.text = 'Đang kết nối đến Zalo...';

        await new Promise(resolve => setTimeout(resolve, 1000));
        spinner.text = 'Đang thiết lập các lệnh...';

        await new Promise(resolve => setTimeout(resolve, 1000));
        spinner.succeed('Khởi động hoàn tất!');

        console.log('\n' + chalk.green('✅ Bot đã sẵn sàng!'));
        console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    }

    /**
     * Initialize the Zalo bot, login and setup event listeners
     * @returns {Promise<Object>} The Zalo API object
     */
    /**
 * Initialize the Zalo bot, login and setup event listeners
 * @returns {Promise<Object>} The Zalo API object
 */
    /**
 * Initialize the Zalo bot, login and setup event listeners
 * @returns {Promise<Object>} The Zalo API object
 */
    async init() {
        try {
            // Hiển thị splash screen trước khi khởi động bot
            await this.displaySplashScreen();

            this.database = new Database();
            this.database.init();

            // Load all commands first and store them in this.commands
            this.commands = await this.loadCommands();

            await this.handleJobs();

            // Load all events 
            this.events = await this.loadEvents();

            // Initialize Zalo client
            this.zalo = new Zalo({
                selfListen: true,
                checkUpdate: true,
                logging: false
            });

            // Use the extracted login handler
            this.api = await this.zalo.login({
                cookie: this.cookie,
                imei: this.config.imei,
                userAgent: this.config.userAgent,
            });
            // If login was successful, continue with initialization
            if (this.api) {
                // Đồng bộ dữ liệu với database
                this.database.syncData(this.api);

                // Set up message event handler
                this.api.listener.on('message', this.handleMessage.bind(this));

                // Set up group event handler - add this line
                initGroupEventListener(this.api);

                // Start listening for events
                this.api.listener.start();
                this.logger.info('Đang lắng nghe tin nhắn và sự kiện nhóm...');
                this.logger.info(`Đã sẵn sàng xử lý ${this.commands.size} lệnh với prefix "${this.config.prefix}"`);

                return this.api;
            } else {
                throw new Error('Không thể đăng nhập vào Zalo. Vui lòng kiểm tra lại kết nối mạng và thử lại.');
            }
        } catch (error) {
            this.logger.error('Không thể khởi tạo bot:', error.message);
            this.logger.debug('Chi tiết lỗi:', error.stack);
            process.exit(1);
        }
    }

    /**
     * Check if a package is installed
     * @param {string} packageName The name of the package to check
     * @returns {boolean} Whether the package is installed
     */
    isPackageInstalled(packageName) {
        try {
            this.require.resolve(packageName);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Install a package synchronously
     * @param {string} packageName The name of the package to install
     * @param {string} version The version of the package to install
     * @returns {boolean} Whether the installation was successful
     */
    installPackage(packageName, version) {
        try {
            this.logger.info(`⚙️ Đang cài đặt package ${packageName}@${version}...`);
            execSync(`npm install ${packageName}@${version} --silent`, { stdio: 'pipe' });
            // this.logger.info(`✅ Package ${packageName}@${version} đã được cài đặt thành công!`);
            return true;
        } catch (error) {
            this.logger.error(`❌ Cài đặt package ${packageName}@${version} thất bại:`, error);
            return false;
        }
    }

    /**
     * Read the command module file to find import statements
     * @param {string} filePath Path to the command module file
     * @returns {string[]} Array of imported packages
     */
    extractImportsFromFile(filePath) {
        try {
            const fileContent = readFileSync(filePath, 'utf-8');
            const imports = [];

            // Match both ES6 imports and CommonJS requires
            const importRegex = /import\s+(?:.*\s+from\s+)?['"]([^./][^'"]*)['"];?/g;
            const requireRegex = /(?:const|let|var)\s+.*?=\s+require\(['"]([^./][^'"]*)['"]\)/g;

            let match;
            while ((match = importRegex.exec(fileContent)) !== null) {
                const packageName = match[1].split('/')[0]; // Get base package name
                if (packageName && !packageName.startsWith('.')) {
                    imports.push(packageName);
                }
            }

            while ((match = requireRegex.exec(fileContent)) !== null) {
                const packageName = match[1].split('/')[0]; // Get base package name
                if (packageName && !packageName.startsWith('.')) {
                    imports.push(packageName);
                }
            }

            return [...new Set(imports)]; // Remove duplicates
        } catch (error) {
            this.logger.error(`❌ Lỗi khi đọc file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Install all dependencies detected from imports
     * @param {string[]} imports Array of package names
     */
    async installDetectedDependencies(imports) {
        if (!imports || imports.length === 0) {
            return;
        }

        // Skip Node.js built-in modules
        const nodeBuiltins = ['fs', 'path', 'http', 'https', 'url', 'util',
            'os', 'crypto', 'child_process', 'stream', 'zlib', 'events',
            'assert', 'querystring', 'buffer', 'cluster', 'dgram', 'dns',
            'net', 'tls', 'module', 'process', 'readline', 'repl', 'vm',
            'timers', 'string_decoder', 'constants', 'punycode', 'tty', 'v8'];

        // Skip packages that are already in package.json or node_modules
        const packagesToInstall = imports.filter(pkg =>
            !nodeBuiltins.includes(pkg) &&
            !this.isPackageInstalled(pkg)
        );

        for (const pkg of packagesToInstall) {
            this.installPackage(pkg, 'latest');
        }

        // If any packages were installed, clear cache
        if (packagesToInstall.length > 0) {
            // Clear Node.js module cache
            Object.keys(this.require.cache).forEach(key => {
                delete this.require.cache[key];
            });
        }
    }

    /**
     * Install dependencies specified in config
     * @param {Object} dependencies Dependencies object with package names and versions
     */
    async installConfigDependencies(dependencies) {
        if (!dependencies || Object.keys(dependencies).length === 0) {
            return;
        }

        let installSuccess = true;

        for (const [pkg, version] of Object.entries(dependencies)) {
            if (!this.isPackageInstalled(pkg)) {
                const success = this.installPackage(pkg, version);
                if (!success) {
                    installSuccess = false;
                }
            } else {
                //this.logger.info(`✓ Package ${pkg} đã được cài đặt.`);
            }
        }

        if (!installSuccess) {
            this.logger.warn('⚠️ Một số package cài đặt không thành công, có thể ảnh hưởng đến hoạt động của bot.');
        }

        // Clear Node.js module cache to allow newly installed packages to be imported
        Object.keys(this.require.cache).forEach(key => {
            delete this.require.cache[key];
        });
    }

    /**
     * Load all commands from the commands directory
     * @returns {Promise<Map>} Map containing command modules
     */
    async loadCommands() {
        const commands = new Map();
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const configValue = {}; // Config value to pass to onLoad

        try {
            const commandsPath = join(__dirname, "../commands");
            const dirs = readdirSync(commandsPath);
            this.logger.info(`Đang tải lệnh từ ${dirs.length} thư mục...`);

            for (const dir of dirs) {
                const pathFolder = join(commandsPath, dir);
                const files = readdirSync(pathFolder).filter(file => file.endsWith('.js'));

                for (const file of files) {
                    const modulePath = join(pathFolder, file);

                    try {
                        // First, detect and install imported packages
                        const imports = this.extractImportsFromFile(modulePath);
                        if (imports.length > 0) {
                            //this.logger.info(`🔍 Phát hiện ${imports.length} package được import trong ${file}: ${imports.join(', ')}`);
                            await this.installDetectedDependencies(imports);
                        }

                        // Now the packages should be installed, so we can import the module
                        const moduleUrl = `file://${modulePath}`;

                        try {
                            const { default: commandModule } = await import(moduleUrl);

                            if (!commandModule?.config?.name) {
                                this.logger.warn(`⚠️ Lệnh ${file} không có config.name hợp lệ!`);
                                continue;
                            }

                            const commandName = commandModule.config.name;

                            // Check and install explicit dependencies from config if they exist
                            if (commandModule.config.dependencies &&
                                Object.keys(commandModule.config.dependencies).length > 0) {
                                await this.installConfigDependencies(commandModule.config.dependencies);
                            }

                            // Execute onLoad function ONLY if it exists
                            if (typeof commandModule.onLoad === 'function') {
                                try {
                                    await commandModule.onLoad({ configValue });
                                    //this.logger.info(`✓ Đã thực thi onLoad của lệnh ${commandName}`);
                                } catch (onLoadError) {
                                    this.logger.error(`❌ Không thể thực thi onLoad của lệnh ${commandName}:`, onLoadError);
                                }
                            }

                            // Make sure the execute function exists
                            if (typeof commandModule.execute !== 'function') {
                                this.logger.warn(`⚠️ Lệnh ${commandName} không có hàm execute!`);
                                continue;
                            }

                            // Save module to map
                            commands.set(commandName, commandModule);

                            // Add command aliases if they exist
                            if (commandModule.config.aliases && Array.isArray(commandModule.config.aliases)) {
                                for (const alias of commandModule.config.aliases) {
                                    commands.set(alias, commandModule);
                                }
                            }

                            // this.logger.info(`✅ Đã tải lệnh ${commandName} [${commandModule.config.commandCategory || 'Không phân loại'}]`);
                        } catch (importError) {
                            this.logger.error(`❌ Lỗi khi import module ${file}:`, importError);
                            // If there's still an import error, try to find more specific import statements
                            // const fileContent = readFileSync(modulePath, 'utf-8');
                            const missingPackageMatch = importError.message.match(/Cannot find package '([^']+)'/);
                            if (missingPackageMatch) {
                                const missingPkg = missingPackageMatch[1];
                                this.logger.info(`🔄 Đang cố gắng cài đặt gói thiếu: ${missingPkg}`);
                                await this.installPackage(missingPkg, 'latest');
                                // Try importing again after installing
                                try {
                                    const { default: commandModule } = await import(`${moduleUrl}?update=${Date.now()}`);
                                    if (commandModule?.config?.name) {
                                        const commandName = commandModule.config.name;
                                        commands.set(commandName, commandModule);
                                        this.logger.info(`✅ Đã tải lệnh ${commandName} sau khi cài đặt dependencies`);
                                    }
                                } catch (retryError) {
                                    this.logger.error(`❌ Vẫn không thể tải lệnh ${file} sau khi cài đặt dependencies:`, retryError);
                                }
                            }
                        }
                    } catch (error) {
                        this.logger.error(`❌ Không thể tải lệnh ${file}:`, error);
                    }
                }
            }

            this.logger.info(`Đã tải tổng cộng ${commands.size} lệnh`);
        } catch (error) {
            this.logger.error('❌ Lỗi khi tải commands:', error);
        }

        return commands;
    }

    async loadEvents() {
        const events = new Map();
        const __dirname = dirname(fileURLToPath(import.meta.url));

        try {
            const eventsPath = join(__dirname, "../events");

            // Kiểm tra xem thư mục events có tồn tại không
            if (!existsSync(eventsPath)) {
                this.logger.info("Thư mục events không tồn tại, bỏ qua việc tải events.");
                return events;
            }

            const files = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

            if (files.length === 0) {
                this.logger.info("Không có file event nào được tìm thấy.");
                return events;
            }

            this.logger.info(`Đang tải ${files.length} event...`);

            for (const file of files) {
                const modulePath = join(eventsPath, file);

                try {
                    // Detect and install dependencies
                    const imports = this.extractImportsFromFile(modulePath);
                    if (imports.length > 0) {
                        await this.installDetectedDependencies(imports);
                    }

                    // Import the event module
                    const moduleUrl = `file://${modulePath}`;
                    const { default: eventModule } = await import(moduleUrl);

                    if (!eventModule?.config?.name) {
                        this.logger.warn(`⚠️ Event ${file} không có config.name hợp lệ!`);
                        continue;
                    }

                    const eventName = eventModule.config.name;

                    // Install explicit dependencies if they exist
                    if (eventModule.config.dependencies &&
                        Object.keys(eventModule.config.dependencies).length > 0) {
                        await this.installConfigDependencies(eventModule.config.dependencies);
                    }

                    // Execute onLoad if it exists
                    if (typeof eventModule.onLoad === 'function') {
                        try {
                            await eventModule.onLoad({ bot: this });
                        } catch (onLoadError) {
                            this.logger.error(`❌ Không thể thực thi onLoad của event ${eventName}:`, onLoadError);
                        }
                    }

                    // Make sure the execute function exists
                    if (typeof eventModule.execute !== 'function') {
                        this.logger.warn(`⚠️ Event ${eventName} không có hàm execute!`);
                        continue;
                    }

                    // Save to map
                    events.set(eventName, eventModule);
                    this.logger.info(`✅ Đã tải event ${eventName}`);

                } catch (error) {
                    this.logger.error(`❌ Không thể tải event ${file}:`, error);
                }
            }

            this.logger.info(`Đã tải tổng cộng ${events.size} event`);
        } catch (error) {
            this.logger.error('❌ Lỗi khi tải events:', error);
        }

        return events;
    }

    /**
     * Handle creation and management of scheduled jobs for automated messaging
     * Improved for easier time management and more comprehensive functionality
     */
    async handleJobs() {
        try {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const schedulesPath = join(__dirname, "../db/database/schedules.json");

            // Create schedules directory if it doesn't exist
            const schedulesDir = dirname(schedulesPath);
            if (!existsSync(schedulesDir)) {
                pkg.mkdirSync(schedulesDir, { recursive: true });
            }

            // Check if schedules file exists, if not create an empty one
            if (!existsSync(schedulesPath)) {
                writeFileSync(schedulesPath, JSON.stringify({
                    jobs: []
                }, null, 2), 'utf-8');
                this.logger.info('📅 Tạo file schedules.json mới');
                return;
            }

            // Read schedules from JSON file
            const schedulesData = JSON.parse(readFileSync(schedulesPath, 'utf-8'));

            // Initialize jobs array if not present
            if (!schedulesData.jobs || !Array.isArray(schedulesData.jobs)) {
                schedulesData.jobs = [];
                writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');
                this.logger.info('📅 Khởi tạo mảng jobs mới trong file schedules.json');
                return;
            }

            if (schedulesData.jobs.length === 0) {
                this.logger.info('📅 Không có công việc được lên lịch');
                return;
            }

            // Store active jobs for management
            this.scheduledJobs = new Map();

            this.logger.info(`📅 Đang khởi tạo ${schedulesData.jobs.length} công việc theo lịch...`);

            // Create a job for each schedule
            for (const job of schedulesData.jobs) {
                await this.setupJob(job);
            }

            // Register command to manage jobs at runtime
            this.commands.set('managejobs', {
                config: {
                    name: 'managejobs',
                    aliases: ['job', 'schedule'],
                    description: 'Quản lý các công việc tự động',
                    usage: 'managejobs [list|add|remove|enable|disable|update]',
                    permissions: ['ADMIN']
                },
                execute: async (api, msg, args) => {
                    await this.manageJobsCommand(api, msg, args);
                }
            });

            this.logger.info('📅 Đã hoàn tất việc khởi tạo các công việc theo lịch');
        } catch (error) {
            this.logger.error('❌ Lỗi khi khởi tạo các công việc theo lịch:', error);
        }
    }

    /**
     * Set up an individual scheduled job
     * @param {Object} job Job configuration object
     * @param {boolean} isUpdate Whether this is an update to an existing job
     */
    async setupJob(job, isUpdate = false) {
        if (!job.enabled) {
            this.logger.info(`📅 Công việc "${job.name}" đang bị tắt, bỏ qua`);
            return;
        }

        // Validate required fields
        if (!job.cronExpression || !job.threadId || !job.name) {
            this.logger.warn(`⚠️ Công việc "${job.name || 'không tên'}" thiếu thông tin cần thiết, bỏ qua`);
            return;
        }

        try {
            // If this is an update, cancel the existing job first
            if (isUpdate && this.scheduledJobs.has(job.name)) {
                const existingJob = this.scheduledJobs.get(job.name);
                existingJob.cancel();
                this.logger.info(`🔄 Đã hủy công việc hiện tại "${job.name}" để cập nhật`);
            }

            // Handle human-readable time format conversion to cron
            let cronExpression = job.cronExpression;

            // Handle special time formats
            if (job.timeFormat === 'human') {
                cronExpression = this.convertHumanTimeFormatToCron(job.humanTime);
                if (!cronExpression) {
                    this.logger.error(`❌ Định dạng thời gian không hợp lệ cho "${job.name}": ${job.humanTime}`);
                    return;
                }
            }

            // Schedule the job using node-schedule
            const scheduledJob = schedule.scheduleJob(job.name, cronExpression, async () => {
                try {
                    this.logger.info(`🔔 Đang thực thi công việc theo lịch: "${job.name}"`);

                    // Determine message type (Group or User)
                    const messageType = job.isGroup ? 1 : 0;

                    // Prepare message content
                    let messageContent = {};

                    // Add text content if available
                    if (job.text) {
                        messageContent.msg = job.text;

                        // Process dynamic content in text if needed
                        if (job.useDynamicContent) {
                            messageContent.msg = this.processDynamicContent(messageContent.msg);
                        }
                    }

                    // Add text styling if specified
                    if (job.styles && Array.isArray(job.styles)) {
                        messageContent.styles = job.styles;
                    }

                    // Add urgency if specified
                    if (job.urgency) {
                        messageContent.urgency = job.urgency;
                    }

                    // Add mentions if specified (for group messages)
                    if (job.mentions && Array.isArray(job.mentions) && job.isGroup) {
                        messageContent.mentions = job.mentions;
                    }

                    // Add attachments for images and videos
                    const attachments = await this.prepareJobAttachments(job);

                    // Add attachments to message content if any
                    if (attachments.length > 0) {
                        messageContent.attachments = attachments;
                    }

                    // Send the message
                    if (Object.keys(messageContent).length > 0) {
                        // If it's just a simple text message with no other properties, send as string
                        if (Object.keys(messageContent).length === 1 && messageContent.msg && !job.useRichText) {
                            await this.api.sendMessage(messageContent.msg, job.threadId, messageType);
                        } else {
                            // Otherwise send as a rich message object
                            await this.api.sendMessage(messageContent, job.threadId, messageType);
                        }
                        this.logger.info(`✅ Đã gửi tin nhắn theo lịch cho "${job.name}"`);

                        // Update job execution stats
                        await this.updateJobExecutionStats(job.name);
                    } else {
                        this.logger.warn(`⚠️ Công việc "${job.name}" không có nội dung tin nhắn để gửi`);
                    }

                    // Execute custom function if provided
                    if (job.customFunction && typeof job.customFunction === 'string') {
                        await this.executeJobCustomFunction(job);
                    }

                    // Handle one-time jobs
                    if (job.oneTime) {
                        await this.disableJobAfterExecution(job.name);
                    }
                } catch (jobError) {
                    this.logger.error(`❌ Lỗi khi thực thi công việc "${job.name}":`, jobError);
                }
            });

            // Store the job in our map for later management
            this.scheduledJobs.set(job.name, scheduledJob);

            // Calculate and display next execution time
            const nextExecution = scheduledJob.nextInvocation();
            const timeUntilNext = moment(nextExecution).fromNow();

            this.logger.info(`✅ Đã lên lịch công việc "${job.name}" (${cronExpression})`);
            this.logger.info(`   └─ Lần chạy tiếp theo: ${nextExecution.toLocaleString()} (${timeUntilNext})`);
        } catch (scheduleError) {
            this.logger.error(`❌ Không thể lên lịch công việc "${job.name}":`, scheduleError);
        }
    }

    /**
     * Process dynamic content in job message text
     * @param {string} text Original message text
     * @returns {string} Processed text with dynamic content
     */
    processDynamicContent(text) {
        // Replace dynamic variables
        return text
            .replace(/{date}/g, moment().format('DD/MM/YYYY'))
            .replace(/{time}/g, moment().format('HH:mm:ss'))
            .replace(/{datetime}/g, moment().format('DD/MM/YYYY HH:mm:ss'))
            .replace(/{day}/g, moment().format('dddd'))
            .replace(/{random(\d+)-(\d+)}/g, (match, min, max) => {
                return Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min);
            });
    }

    /**
     * Prepare attachments for a scheduled job
     * @param {Object} job Job configuration
     * @returns {Array} Array of attachment paths
     */
    async prepareJobAttachments(job) {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const attachments = [];

        // Add image if provided
        if (job.imagePath) {
            const fullImagePath = job.imagePath.startsWith('/')
                ? job.imagePath
                : join(__dirname, '../', job.imagePath);

            if (existsSync(fullImagePath)) {
                attachments.push(fullImagePath);
            } else {
                this.logger.error(`❌ Không tìm thấy file ảnh: ${fullImagePath}`);
            }
        }

        // Add video if provided
        if (job.videoPath) {
            const fullVideoPath = job.videoPath.startsWith('/')
                ? job.videoPath
                : join(__dirname, '../', job.videoPath);

            if (existsSync(fullVideoPath)) {
                attachments.push(fullVideoPath);
            } else {
                this.logger.error(`❌ Không tìm thấy file video: ${fullVideoPath}`);
            }
        }

        // Add any additional attachments specified in the job
        if (job.attachments && Array.isArray(job.attachments)) {
            for (const attachment of job.attachments) {
                const fullPath = attachment.startsWith('/')
                    ? attachment
                    : join(__dirname, '../', attachment);

                if (existsSync(fullPath)) {
                    attachments.push(fullPath);
                } else {
                    this.logger.error(`❌ Không tìm thấy file đính kèm: ${fullPath}`);
                }
            }
        }

        return attachments;
    }

    /**
     * Execute custom function for a job if provided
     * @param {Object} job Job configuration
     */
    async executeJobCustomFunction(job) {
        // Check for special predefined functions first
        if (job.customFunction === 'weatherUpdate') {
            await this.sendWeatherUpdate(this.api, job);
            this.logger.info(`✅ Đã thực thi hàm thời tiết cho "${job.name}"`);
        }
        else if (job.customFunction === 'dailyStats') {
            await this.sendDailyStats(this.api, job);
            this.logger.info(`✅ Đã thực thi hàm thống kê hàng ngày cho "${job.name}"`);
        }
        // Try to execute from global scope if not a predefined function
        else if (typeof global[job.customFunction] === 'function') {
            await global[job.customFunction](this.api, job);
            this.logger.info(`✅ Đã thực thi hàm tùy chỉnh cho "${job.name}"`);
        } else {
            this.logger.error(`❌ Không tìm thấy hàm tùy chỉnh: ${job.customFunction}`);
        }
    }

    /**
     * Update execution statistics for a job
     * @param {string} jobName Name of the job
     */
    async updateJobExecutionStats(jobName) {
        try {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const schedulesPath = join(__dirname, "../db/database/schedules.json");
            const schedulesData = JSON.parse(readFileSync(schedulesPath, 'utf-8'));

            const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);
            if (jobIndex !== -1) {
                // Initialize stats object if it doesn't exist
                if (!schedulesData.jobs[jobIndex].stats) {
                    schedulesData.jobs[jobIndex].stats = {
                        executionCount: 0,
                        lastExecuted: null,
                        createdAt: schedulesData.jobs[jobIndex].createdAt || new Date().toISOString()
                    };
                }

                // Update execution stats
                schedulesData.jobs[jobIndex].stats.executionCount++;
                schedulesData.jobs[jobIndex].stats.lastExecuted = new Date().toISOString();

                // Save updated schedules
                writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');
            }
        } catch (error) {
            this.logger.error(`❌ Lỗi khi cập nhật thống kê thực thi cho "${jobName}":`, error);
        }
    }

    /**
     * Disable a one-time job after execution
     * @param {string} jobName Name of the job
     */
    async disableJobAfterExecution(jobName) {
        try {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const schedulesPath = join(__dirname, "../db/database/schedules.json");
            const schedulesData = JSON.parse(readFileSync(schedulesPath, 'utf-8'));

            const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);
            if (jobIndex !== -1) {
                // Disable the job
                schedulesData.jobs[jobIndex].enabled = false;
                schedulesData.jobs[jobIndex].disabledAt = new Date().toISOString();
                schedulesData.jobs[jobIndex].disabledReason = "One-time job completed";

                // Save updated schedules
                writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

                // Cancel the scheduled job
                if (this.scheduledJobs.has(jobName)) {
                    const job = this.scheduledJobs.get(jobName);
                    job.cancel();
                    this.scheduledJobs.delete(jobName);
                    this.logger.info(`✅ Đã hủy và vô hiệu hóa công việc một lần "${jobName}"`);
                }
            }
        } catch (error) {
            this.logger.error(`❌ Lỗi khi vô hiệu hóa công việc một lần "${jobName}":`, error);
        }
    }

    /**
     * Convert human-readable time format to cron expression
     * @param {string} humanTime Human-readable time specification
     * @returns {string|null} Cron expression or null if invalid
     */
    convertHumanTimeFormatToCron(humanTime) {
        if (!humanTime) return null;

        // Common time patterns
        const timePatterns = {
            // Daily patterns
            'daily at ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,
            'every day at ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,
            'mỗi ngày lúc ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,
            'hàng ngày lúc ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,

            // Weekly patterns
            'every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at ([0-9]{1,2}):([0-9]{1,2})': (day, hours, minutes) => {
                const days = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
                return `0 ${minutes} ${hours} * * ${days[day.toLowerCase()]}`;
            },
            'mỗi thứ ([2-7]|chủ nhật) lúc ([0-9]{1,2}):([0-9]{1,2})': (day, hours, minutes) => {
                const days = { '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, 'chủ nhật': 0 };
                return `0 ${minutes} ${hours} * * ${days[day.toLowerCase()]}`;
            },

            // Monthly patterns
            'every ([0-9]{1,2})(st|nd|rd|th) of( the)? month at ([0-9]{1,2}):([0-9]{1,2})': (day, _, __, hours, minutes) =>
                `0 ${minutes} ${hours} ${day} * *`,
            'mỗi ngày ([0-9]{1,2}) hàng tháng lúc ([0-9]{1,2}):([0-9]{1,2})': (day, hours, minutes) =>
                `0 ${minutes} ${hours} ${day} * *`,

            // Interval patterns
            'every ([0-9]+) (minute|minutes|hour|hours|day|days)': (interval, unit) => {
                if (unit === 'minute' || unit === 'minutes') {
                    return `*/${interval} * * * *`;
                } else if (unit === 'hour' || unit === 'hours') {
                    return `0 0 */${interval} * * *`;
                } else if (unit === 'day' || unit === 'days') {
                    return `0 0 0 */${interval} * *`;
                }
                return null;
            },
            'mỗi ([0-9]+) (phút|giờ|ngày)': (interval, unit) => {
                if (unit === 'phút') {
                    return `*/${interval} * * * *`;
                } else if (unit === 'giờ') {
                    return `0 0 */${interval} * * *`;
                } else if (unit === 'ngày') {
                    return `0 0 0 */${interval} * *`;
                }
                return null;
            }
        };

        // Try each pattern
        for (const [pattern, formatter] of Object.entries(timePatterns)) {
            const regex = new RegExp(pattern, 'i');
            const match = humanTime.match(regex);

            if (match) {
                // Remove the full match from the array, leaving only the captured groups
                const groups = match.slice(1);
                return formatter(...groups);
            }
        }

        // If no pattern matches, check if it's already a valid cron expression
        const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;

        if (cronRegex.test(humanTime)) {
            return humanTime;
        }

        return null;
    }

    /**
     * Command to manage jobs dynamically
     * @param {Object} api Zalo API instance
     * @param {Object} msg Message object
     * @param {Array} args Command arguments
     */
    async manageJobsCommand(api, msg, args) {
        const { threadId, type } = msg;
        const operation = args[0]?.toLowerCase();

        try {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const schedulesPath = join(__dirname, "../db/database/schedules.json");
            let schedulesData = JSON.parse(readFileSync(schedulesPath, 'utf-8'));

            // Initialize jobs array if needed
            if (!schedulesData.jobs) {
                schedulesData.jobs = [];
            }

            switch (operation) {
                case 'list':
                    // List all configured jobs with status
                    await this.listJobs(api, threadId, type, schedulesData);
                    break;

                case 'add':
                    // Add a new job
                    await this.addJob(api, threadId, type, schedulesData, args.slice(1));
                    break;

                case 'remove':
                case 'delete':
                    // Remove a job
                    await this.removeJob(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'enable':
                    // Enable a disabled job
                    await this.enableJob(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'disable':
                    // Disable an active job
                    await this.disableJob(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'update':
                    // Update job parameters
                    await this.updateJob(api, threadId, type, schedulesData, args.slice(1));
                    break;

                default:
                    // Show help
                    await api.sendMessage(
                        "Quản lý công việc tự động:\n" +
                        "- list: Danh sách công việc\n" +
                        "- add [tên] [lịch] [tin nhắn]: Thêm công việc mới\n" +
                        "- remove [tên]: Xóa công việc\n" +
                        "- enable [tên]: Bật công việc\n" +
                        "- disable [tên]: Tắt công việc\n" +
                        "- update [tên] [thông số] [giá trị]: Cập nhật công việc\n\n" +
                        "Ví dụ lịch trình:\n" +
                        "- Mỗi ngày lúc 08:00\n" +
                        "- Mỗi thứ 2 lúc 09:15\n" +
                        "- Mỗi ngày 15 hàng tháng lúc 10:00\n" +
                        "- Mỗi 30 phút\n" +
                        "- 0 8 * * * (Cú pháp cron)",
                        threadId,
                        type
                    );
            }
        } catch (error) {
            this.logger.error('❌ Lỗi khi quản lý công việc:', error);
            await api.sendMessage(`❌ Đã xảy ra lỗi: ${error.message}`, threadId, type);
        }
    }

    /**
     * List all configured jobs
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     */
    async listJobs(api, threadId, type, schedulesData) {
        if (!schedulesData.jobs || schedulesData.jobs.length === 0) {
            await api.sendMessage("Không có công việc nào được cấu hình.", threadId, type);
            return;
        }

        let message = "📅 Danh sách công việc tự động:\n\n";

        for (const [index, job] of schedulesData.jobs.entries()) {
            const nextRun = this.scheduledJobs.has(job.name)
                ? moment(this.scheduledJobs.get(job.name).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')
                : 'N/A';

            message += `${index + 1}. ${job.name}\n`;
            message += `   - Trạng thái: ${job.enabled ? '✅ Đang hoạt động' : '❌ Đã tắt'}\n`;
            message += `   - Lịch: ${job.timeFormat === 'human' ? job.humanTime : job.cronExpression}\n`;
            message += `   - ID nhóm/người dùng: ${job.threadId}\n`;
            message += `   - Nội dung: ${job.text ? (job.text.length > 30 ? job.text.substring(0, 30) + '...' : job.text) : 'Không có'}\n`;

            if (job.enabled) {
                message += `   - Lần chạy tiếp theo: ${nextRun}\n`;
            }

            if (job.stats) {
                message += `   - Đã chạy: ${job.stats.executionCount} lần\n`;
                message += `   - Lần cuối: ${job.stats.lastExecuted ? moment(job.stats.lastExecuted).format('DD/MM/YYYY HH:mm:ss') : 'Chưa chạy'}\n`;
            }

            message += "\n";
        }

        await api.sendMessage(message, threadId, type);
    }

    /**
     * Add a new scheduled job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {Array} args Command arguments
     */
    async addJob(api, threadId, type, schedulesData, args) {
        if (args.length < 3) {
            await api.sendMessage(
                "❌ Thiếu thông tin. Sử dụng: add [tên] [lịch] [tin nhắn]",
                threadId,
                type
            );
            return;
        }

        const jobName = args[0];
        const timeSpec = args[1];
        const message = args.slice(2).join(' ');

        // Check if job name is already in use
        if (schedulesData.jobs.some(job => job.name === jobName)) {
            await api.sendMessage(`❌ Tên công việc "${jobName}" đã tồn tại.`, threadId, type);
            return;
        }

        // Convert human time to cron if needed
        let cronExpression = this.convertHumanTimeFormatToCron(timeSpec);
        let timeFormat = 'cron';
        let humanTime = null;

        if (!cronExpression) {
            // If not a valid human time format or cron expression
            await api.sendMessage(
                "❌ Định dạng thời gian không hợp lệ. Vui lòng sử dụng định dạng thời gian con người hoặc cron.",
                threadId,
                type
            );
            return;
        }

        // If converted from human time, store the original format
        if (cronExpression !== timeSpec) {
            timeFormat = 'human';
            humanTime = timeSpec;
        } else {
            cronExpression = timeSpec;
        }

        // Create new job
        const newJob = {
            name: jobName,
            enabled: true,
            cronExpression: cronExpression,
            timeFormat: timeFormat,
            humanTime: humanTime,
            threadId: threadId,
            isGroup: type === 1,
            text: message,
            createdAt: new Date().toISOString(),
            stats: {
                executionCount: 0,
                lastExecuted: null,
                createdAt: new Date().toISOString()
            }
        };

        // Add to schedules data
        schedulesData.jobs.push(newJob);

        // Save updated schedules
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const schedulesPath = join(__dirname, "../db/database/schedules.json");
        writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Setup the job
        await this.setupJob(newJob);

        await api.sendMessage(
            `✅ Đã tạo công việc mới "${jobName}" thành công.\n` +
            `- Lịch: ${humanTime || cronExpression}\n` +
            `- Lần chạy đầu tiên: ${moment(this.scheduledJobs.get(jobName).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')}`,
            threadId,
            type
        );
    }

    /**
 * Remove a scheduled job
 * @param {Object} api Zalo API instance
 * @param {string} threadId Thread ID
 * @param {number} type Message type
 * @param {Object} schedulesData Schedules data
 * @param {string} jobName Name of the job to remove
 */
    async removeJob(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần xóa.", threadId, type);
            return;
        }

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        // Cancel the job if it's scheduled
        if (this.scheduledJobs.has(jobName)) {
            const job = this.scheduledJobs.get(jobName);
            job.cancel();
            this.scheduledJobs.delete(jobName);
        }

        // Remove from the jobs array
        schedulesData.jobs.splice(jobIndex, 1);

        // Save updated schedules
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const schedulesPath = join(__dirname, "../db/database/schedules.json");
        writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        await api.sendMessage(`✅ Đã xóa công việc "${jobName}" thành công.`, threadId, type);
    }

    /**
     * Enable a disabled job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job to enable
     */
    async enableJob(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần bật.", threadId, type);
            return;
        }

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        if (schedulesData.jobs[jobIndex].enabled) {
            await api.sendMessage(`⚠️ Công việc "${jobName}" đã đang bật.`, threadId, type);
            return;
        }

        // Update job status
        schedulesData.jobs[jobIndex].enabled = true;
        schedulesData.jobs[jobIndex].enabledAt = new Date().toISOString();
        delete schedulesData.jobs[jobIndex].disabledReason;

        // Save updated schedules
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const schedulesPath = join(__dirname, "../db/database/schedules.json");
        writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Setup the job
        await this.setupJob(schedulesData.jobs[jobIndex]);

        // Get next execution time
        const nextExecution = this.scheduledJobs.has(jobName)
            ? moment(this.scheduledJobs.get(jobName).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')
            : 'Không xác định';

        await api.sendMessage(
            `✅ Đã bật công việc "${jobName}" thành công.\n` +
            `- Lần chạy tiếp theo: ${nextExecution}`,
            threadId,
            type
        );
    }

    /**
     * Disable an active job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job to disable
     */
    async disableJob(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần tắt.", threadId, type);
            return;
        }

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        if (!schedulesData.jobs[jobIndex].enabled) {
            await api.sendMessage(`⚠️ Công việc "${jobName}" đã đang tắt.`, threadId, type);
            return;
        }

        // Update job status
        schedulesData.jobs[jobIndex].enabled = false;
        schedulesData.jobs[jobIndex].disabledAt = new Date().toISOString();
        schedulesData.jobs[jobIndex].disabledReason = "Manually disabled";

        // Save updated schedules
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const schedulesPath = join(__dirname, "../db/database/schedules.json");
        writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Cancel the job if it's scheduled
        if (this.scheduledJobs.has(jobName)) {
            const job = this.scheduledJobs.get(jobName);
            job.cancel();
            this.scheduledJobs.delete(jobName);
        }

        await api.sendMessage(`✅ Đã tắt công việc "${jobName}" thành công.`, threadId, type);
    }

    /**
     * Update an existing job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {Array} args Command arguments
     */
    async updateJob(api, threadId, type, schedulesData, args) {
        if (args.length < 3) {
            await api.sendMessage(
                "❌ Thiếu thông tin. Sử dụng: update [tên] [thông số] [giá trị]",
                threadId,
                type
            );
            return;
        }

        const jobName = args[0];
        const parameter = args[1].toLowerCase();
        const value = args.slice(2).join(' ');

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        const job = schedulesData.jobs[jobIndex];
        let needsReschedule = false;

        switch (parameter) {
            case 'time':
            case 'schedule':
            case 'cron':
            case 'lịch':
                // Convert human time to cron if needed
                let cronExpression = this.convertHumanTimeFormatToCron(value);

                if (!cronExpression) {
                    await api.sendMessage(
                        "❌ Định dạng thời gian không hợp lệ. Vui lòng sử dụng định dạng thời gian con người hoặc cron.",
                        threadId,
                        type
                    );
                    return;
                }

                // If converted from human time, store the original format
                if (cronExpression !== value) {
                    job.timeFormat = 'human';
                    job.humanTime = value;
                } else {
                    job.timeFormat = 'cron';
                    job.humanTime = null;
                }

                job.cronExpression = cronExpression;
                needsReschedule = true;
                break;

            case 'text':
            case 'message':
            case 'tin nhắn':
            case 'nội dung':
                job.text = value;
                break;

            case 'onetime':
            case 'single':
            case 'một lần':
                job.oneTime = value.toLowerCase() === 'true' || value === '1';
                break;

            case 'dynamic':
            case 'động':
                job.useDynamicContent = value.toLowerCase() === 'true' || value === '1';
                break;

            case 'function':
            case 'hàm':
                job.customFunction = value;
                break;

            case 'name':
            case 'tên':
                // Check if new name is already in use
                if (schedulesData.jobs.some(j => j.name === value && j.name !== jobName)) {
                    await api.sendMessage(`❌ Tên công việc "${value}" đã tồn tại.`, threadId, type);
                    return;
                }

                // Update name in scheduledJobs map
                if (this.scheduledJobs.has(jobName)) {
                    const scheduledJob = this.scheduledJobs.get(jobName);
                    this.scheduledJobs.delete(jobName);
                    this.scheduledJobs.set(value, scheduledJob);
                }

                job.name = value;
                break;

            default:
                await api.sendMessage(
                    "❌ Thông số không hợp lệ. Các thông số hợp lệ: time, text, onetime, dynamic, function, name",
                    threadId,
                    type
                );
                return;
        }

        // Save updated schedules
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const schedulesPath = join(__dirname, "../db/database/schedules.json");
        writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Reschedule if needed and job is enabled
        if (needsReschedule && job.enabled) {
            // Cancel current job if exists
            if (this.scheduledJobs.has(job.name)) {
                const scheduledJob = this.scheduledJobs.get(job.name);
                scheduledJob.cancel();
                this.scheduledJobs.delete(job.name);
            }

            // Setup the job again
            await this.setupJob(job, true);
        }

        // Get next execution time if applicable
        let nextExecution = '';
        if (job.enabled && this.scheduledJobs.has(job.name)) {
            nextExecution = `\n- Lần chạy tiếp theo: ${moment(this.scheduledJobs.get(job.name).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')}`;
        }

        await api.sendMessage(
            `✅ Đã cập nhật thông số "${parameter}" của công việc "${jobName}" thành công.${nextExecution}`,
            threadId,
            type
        );
    }

    /**
     * Send weather update (example custom function)
     * @param {Object} api Zalo API instance
     * @param {Object} job Job configuration
     */
    async sendWeatherUpdate(api, job) {
        try {
            // This is a placeholder. In a real implementation, you would fetch weather data from an API
            const weatherData = {
                location: 'Hà Nội',
                temperature: Math.floor(Math.random() * 10) + 25, // Random temperature between 25-35°C
                condition: ['Nắng', 'Mây', 'Mưa nhẹ', 'Mưa rào', 'Nắng và mây'][Math.floor(Math.random() * 5)],
                humidity: Math.floor(Math.random() * 30) + 50, // Random humidity between 50-80%
                wind: Math.floor(Math.random() * 10) + 5 // Random wind speed between 5-15 km/h
            };

            const message =
                `🌤️ Dự báo thời tiết - ${weatherData.location} - ${moment().format('DD/MM/YYYY')}\n\n` +
                `- Nhiệt độ: ${weatherData.temperature}°C\n` +
                `- Điều kiện: ${weatherData.condition}\n` +
                `- Độ ẩm: ${weatherData.humidity}%\n` +
                `- Gió: ${weatherData.wind} km/h`;

            await api.sendMessage(message, job.threadId, job.isGroup ? 1 : 0);
        } catch (error) {
            this.logger.error(`❌ Lỗi khi gửi cập nhật thời tiết:`, error);
        }
    }

    /**
     * Send daily statistics (example custom function)
     * @param {Object} api Zalo API instance
     * @param {Object} job Job configuration
     */
    async sendDailyStats(api, job) {
        try {
            // This is a placeholder. In a real implementation, you would fetch actual statistics
            const stats = {
                activeUsers: Math.floor(Math.random() * 500) + 1000,
                newMessages: Math.floor(Math.random() * 5000) + 10000,
                activeGroups: Math.floor(Math.random() * 100) + 200
            };

            const message =
                `📊 Thống kê hàng ngày - ${moment().format('DD/MM/YYYY')}\n\n` +
                `- Người dùng hoạt động: ${stats.activeUsers}\n` +
                `- Tin nhắn mới: ${stats.newMessages}\n` +
                `- Nhóm hoạt động: ${stats.activeGroups}`;

            await api.sendMessage(message, job.threadId, job.isGroup ? 1 : 0);
        } catch (error) {
            this.logger.error(`❌ Lỗi khi gửi thống kê hàng ngày:`, error);
        }
    }

    /**
     * Handle incoming messages and process commands
     * @param {Object} msg Message object from Zalo API
     */
    async handleMessage(msg) {
        const { data, threadId, type } = msg;
        const fromId = data.uidFrom
        try {
            const isGroup = type === 1;
            const relust = await this.database.processMessage(fromId, isGroup ? threadId : null);

            // Check for level up and send notification if configured
            if (relust.user.levelUp && this.config.notifyLevelUp) {
                const { user, oldLevel, newLevel } = relust.user;
                try {
                    await this.api.sendMessage(
                        `🎉 Chúc mừng bạn đã lên cấp ${newLevel}! (Từ cấp ${oldLevel})`,
                        threadId,
                        type
                    );
                } catch (sendError) {
                    this.logger.error('❌ Không thể gửi thông báo lên cấp:', sendError);
                }
            }

            // Check for group level up
            if (isGroup && relust.group?.levelUp && this.config.notifyGroupLevelUp) {
                const { group, oldLevel, newLevel } = relust.group;
                try {
                    await this.api.sendMessage(
                        `🎉 Nhóm đã lên cấp ${newLevel}! (Từ cấp ${oldLevel})`,
                        threadId,
                        type
                    );
                } catch (sendError) {
                    this.logger.error('❌ Không thể gửi thông báo nhóm lên cấp:', sendError);
                }
            }

            // Get message text from different possible properties
            const text = data?.text || data?.content || data?.message || '';

            if (!text || typeof text !== 'string') return;

            const prefix = this.config.prefix;
            //console.log(msg)
            // Check if message starts with prefix
            if (text.startsWith(prefix)) {
                // Parse command and arguments
                const parts = text.slice(prefix.length).trim().split(/\s+/);
                const commandName = parts[0].toLowerCase();
                const args = parts.slice(1);

                this.logger.info(`📩 Đã nhận lệnh: ${commandName} với ${args.length} tham số`);

                const userInfo = await this.database.Users.findByPk(fromId);
                if (userInfo && userInfo.banned) {
                    const banReason = userInfo.banReason || "Không có lý do cụ thể";
                    try {
                        await this.api.sendMessage(
                            `❌ Bạn đã bị cấm sử dụng bot. Lý do: ${banReason}`,
                            threadId,
                            type
                        );
                    } catch (error) {
                        this.logger.error('❌ Không thể gửi thông báo người dùng bị cấm:', error);
                    }
                    return;
                }

                // Check if group is banned (for group messages)
                if (isGroup) {
                    const groupInfo = await this.database.Groups.findByPk(threadId);
                    if (groupInfo && groupInfo.banned) {
                        const banReason = groupInfo.banReason || "Không có lý do cụ thể";
                        try {
                            await this.api.sendMessage(
                                `❌ Nhóm đã bị cấm sử dụng bot. Lý do: ${banReason}`,
                                threadId,
                                type
                            );
                        } catch (error) {
                            this.logger.error('❌ Không thể gửi thông báo nhóm bị cấm:', error);
                        }
                        return;
                    }
                }


                // Find command by name or alias
                const cmd = this.commands.get(commandName);

                if (cmd) {
                    this.logger.info(`🚀 Đang thực thi lệnh: ${commandName}`);

                    try {
                        // Execute command
                        await cmd.execute(this.api, msg, args);
                        this.logger.info(`✅ Đã thực thi lệnh ${commandName} thành công`);
                    } catch (cmdError) {
                        this.logger.error(`❌ Lỗi khi thực thi lệnh ${commandName}:`, cmdError);

                        // Send error message to user if configured
                        if (this.config.sendErrorMessages) {
                            try {
                                // Using the correct sendMessage signature
                                await this.api.sendMessage(
                                    `❌ Đã xảy ra lỗi khi thực thi lệnh: ${cmdError.message}`,
                                    threadId,
                                    type
                                );
                            } catch (sendError) {
                                this.logger.error('❌ Không thể gửi thông báo lỗi:', sendError);
                            }
                        }
                    }
                } else {
                    this.logger.warn(`⚠️ Không tìm thấy lệnh: ${commandName}`);

                    // Send not found message if configured
                    if (this.config.notifyCommandNotFound) {
                        try {
                            // Using the correct sendMessage signature
                            await this.api.sendMessage(
                                `❓ Lệnh "${commandName}" không tồn tại. Hãy sử dụng ${prefix}help để xem danh sách lệnh.`,
                                threadId,
                                type
                            );
                        } catch (sendError) {
                            this.logger.error('❌ Không thể gửi thông báo lệnh không tồn tại:', sendError);
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error('❌ Lỗi xử lý tin nhắn:', error);
        }
    }

    /**
     * Shutdown the bot gracefully
     */
    async shutdown() {
        try {
            if (this.api?.listener) {
                this.api.listener.stop();
            }
            this.logger.info('🛑 Bot đã dừng hoạt động');
        } catch (error) {
            this.logger.error('❌ Lỗi khi dừng bot:', error);
        }
    }
}

export default ZaloBot;