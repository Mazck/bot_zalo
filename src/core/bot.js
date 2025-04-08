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
import handleLogin  from "../includes/handler/loginHandler.js";
import { initGroupEventListener } from "../includes/handler/groupEvent.js"

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