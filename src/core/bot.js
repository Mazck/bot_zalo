import { GroupEventType, ThreadType, TextStyle, Urgency, Zalo } from "zca-js"
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
import SchedulesManager from "../includes/handler/schedulesManager.js";
import { handlerMessage } from "../includes/handler/handlerMessage.js";
import GroupEventsHandler from "../includes/handler/handlerEvents.js";
import { setupAutoUpdater } from "../utils/autoUpdate.js";

// Check required packages and install if missing
const requiredPackages = ['chalk', 'figlet', 'gradient-string', 'ora'];
for (const pkg of requiredPackages) {
    try {
        import(pkg);
    } catch (e) {
        console.log('Missing required packages');
        console.log('Please install with command:');
        console.log('npm install chalk figlet gradient-string ora');
        process.exit(1);
    }
}

// Initialize global data structure
global.data = {
    threadInfo: new Map(),
    threadData: new Map(),
    userName: new Map(),
    userBanned: new Map(),
    threadBanned: new Map(),
    commandBanned: new Map(),
    threadAllowNSFW: [],
    allUserID: [],
    allCurrenciesID: [],
    allThreadID: [],
    allCommands: [],
};

class ZaloBot {
    constructor() {
        this.commands = new Map();
        this.events = new Map();
        this.zalo = null;
        this.api = null;
        this.config = JSON.parse(readFileSync("./config.json", "utf-8"));
        this.cookie = existsSync("./cookie.json") ? JSON.parse(readFileSync("./cookie.json", "utf-8")) : null;
        this.logger = defaultLogger;
        this.require = createRequire(import.meta.url);
        this.database = null;
        this.schedulesManager = null;
        this.handlerMessage = null;
        this.handlerEvents = null;

        // Watchdog timer for detecting freezes
        this.watchdogInterval = null;
        this.lastHeartbeat = Date.now();
        this.nodeBuiltins = new Set([
            'fs', 'path', 'http', 'https', 'url', 'util', 'os', 'crypto',
            'child_process', 'stream', 'zlib', 'events', 'assert', 'querystring',
            'buffer', 'cluster', 'dgram', 'dns', 'net', 'tls', 'module',
            'process', 'readline', 'repl', 'vm', 'timers', 'string_decoder',
            'constants', 'punycode', 'tty', 'v8'
        ]);
    }

    /**
     * Initialize watchdog timer to detect console freezes
     */
    initWatchdog() {
        // Set up a heartbeat check every 5 seconds
        this.watchdogInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.lastHeartbeat;

            // If more than 10 seconds passed since last heartbeat, we might be freezing
            if (elapsed > 10000) {
                this.logger.warn(`⚠️ Console may be freezing - elapsed time: ${elapsed}ms`);
                // Attempt to refresh the heartbeat
                this.lastHeartbeat = now;
            }

            // Regular heartbeat
            this.lastHeartbeat = now;

            // Check memory usage as additional stability monitoring
            const memUsage = process.memoryUsage();
            if (memUsage.heapUsed / memUsage.heapTotal > 0.9) {
                this.logger.warn(`⚠️ High memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
            }
        }, 5000);
    }

    /**
     * Display a fancy splash screen
     */
    async displaySplashScreen() {
        console.clear();

        // Create large text with figlet
        const titleText = figlet.textSync('ZALO BOT', {
            font: 'ANSI Shadow',
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 100,
            whitespaceBreak: true
        });

        // Create beautiful gradient color
        const titleColors = gradient(['#00FFFF', '#0080FF', '#0000FF', '#8000FF', '#FF00FF']);
        console.log(titleColors(titleText));

        // Display bot info
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

        // Loading animation with predefined steps to ensure it completes
        const spinner = ora({
            text: 'Initializing bot...',
            color: 'blue'
        }).start();

        const steps = [
            { message: 'Loading modules...', delay: 500 },
            { message: 'Connecting to Zalo...', delay: 500 },
            { message: 'Setting up commands...', delay: 500 }
        ];

        for (const step of steps) {
            await new Promise(resolve => setTimeout(resolve, step.delay));
            spinner.text = step.message;
        }

        spinner.succeed('Startup complete!');

        console.log('\n' + chalk.green('✅ Bot is ready!'));
        console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    }

    /**
     * Initialize the Zalo bot, login and setup event listeners
     * @returns {Promise<Object>} The Zalo API object
     */
    async init() {
        try {
            // Start watchdog timer to detect freezes
            this.initWatchdog();

            // Display splash screen before starting bot
            await this.displaySplashScreen();

            // Initialize database
            this.database = new Database();
            await this.database.init();

            // Load commands and events in parallel for faster startup
            const [commandsLoaded, eventsLoaded] = await Promise.all([
                this.loadCommands(),
                this.loadEvents()
            ]);

            this.commands = commandsLoaded;
            this.events = eventsLoaded;

            // Initialize Zalo client with optimized settings
            this.zalo = new Zalo({
                selfListen: true,
                checkUpdate: true,
                logging: false
            });

            // Login to Zalo
            this.api = await this.zalo.login({
                cookie: this.cookie,
                imei: this.config.imei,
                userAgent: this.config.userAgent,
            });

            await setupAutoUpdater(this);
            
            if (!this.api) {
                throw new Error('Failed to log in to Zalo. Please check your network connection and try again.');
            }

            // Store unique command names (excluding aliases) in global.data.allCommands
            global.data.allCommands = Array.from(this.commands.entries())
                .filter(([name, cmd]) => cmd.config.name === name)
                .map(([_, cmd]) => cmd.config);

            // Initialize scheduler and register job command
            this.schedulesManager = new SchedulesManager(this.api, this.config);
            await this.schedulesManager.init();
            this.schedulesManager.registerCommand(this.commands);

            // Register job command if not already registered
            const jobCommand = this.commands.get('job');
            if (jobCommand && !global.data.allCommands.some(config => config.name === 'job')) {
                global.data.allCommands.push(jobCommand.config);
            }

            // Synchronize data with database
            await this.database.syncData(this.api);

            // Set up message event handler with error protection
            this.api.listener.on('message', (msg) => {
                try {
                    if (msg.data.uidFrom === this.api.listener.ctx.uid) return;
                    
                    this.handlerMessage = new handlerMessage(this.api, this.database, this.config, this.logger, this.commands, msg);
                    this.handlerMessage.handleMsg();
                } catch (error) {
                    this.logger.error('Error handling message:', error);
                    // Continue processing other messages even if one fails
                }
            });

            // Set up group event handler with error protection
            new GroupEventsHandler(this.api, this.database).initialize().start();

            // Perform stability check
            const isStable = await this.performStabilityCheck();
            if (isStable) {
                this.logger.info('✅ Stability check passed');
            } else {
                this.logger.warn('⚠️ Stability check detected potential issues');
            }

            // Start listening for events
            this.api.listener.start();
            this.logger.info('Listening for messages and group events...');
            this.logger.info(`Ready to process ${this.commands.size} commands with prefix "${this.config.prefix}"`);

            return this.api;
        } catch (error) {
            this.logger.error('Cannot initialize bot:', error.message);
            this.logger.debug('Error details:', error.stack);
            this.cleanupWatchdog();
            process.exit(1);
        }
    }

    /**
     * Perform a stability check on the system
     * @returns {Promise<boolean>} True if the system appears stable
     */
    async performStabilityCheck() {
        try {
            const spinner = ora('Performing stability check...').start();

            // Check memory usage
            const memUsage = process.memoryUsage();
            const memoryOk = memUsage.heapUsed / memUsage.heapTotal < 0.8;

            // Check CPU usage via simple operation timing
            const startTime = process.hrtime();
            for (let i = 0; i < 1000000; i++) {
                // Simple operation to test CPU
                Math.sqrt(i);
            }
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const cpuTimeMs = seconds * 1000 + nanoseconds / 1000000;
            const cpuOk = cpuTimeMs < 1000; // Should take less than 1 second

            // Check file system access
            const fsOk = existsSync("./config.json");

            spinner.succeed('Stability check complete');

            return memoryOk && cpuOk && fsOk;
        } catch (error) {
            this.logger.error('Error during stability check:', error);
            return false;
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
     * Install a package synchronously with retry mechanism
     * @param {string} packageName The name of the package to install
     * @param {string} version The version of the package to install
     * @returns {boolean} Whether the installation was successful
     */
    installPackage(packageName, version) {
        // Maximum retry attempts
        const maxRetries = 2;
        let retries = 0;

        while (retries <= maxRetries) {
            try {
                if (retries === 0) {
                    this.logger.info(`⚙️ Installing package ${packageName}@${version}...`);
                } else {
                    this.logger.info(`⚙️ Retry ${retries}/${maxRetries}: Installing package ${packageName}@${version}...`);
                }

                execSync(`npm install ${packageName}@${version}`, { stdio: 'pipe' });
                return true;
            } catch (error) {
                retries++;
                if (retries > maxRetries) {
                    this.logger.error(`❌ Failed to install package ${packageName}@${version}:`, error.message);
                    return false;
                }

                // Wait a bit before retrying
                const waitTime = retries * 1000; // Incremental backoff
                this.logger.info(`Waiting ${waitTime}ms before retry...`);
                execSync(`sleep ${waitTime / 1000}`);
            }
        }

        return false;
    }

    /**
     * Read the command module file to efficiently find import statements
     * @param {string} filePath Path to the command module file
     * @returns {string[]} Array of imported packages
     */
    extractImportsFromFile(filePath) {
        try {
            const fileContent = readFileSync(filePath, 'utf-8');
            // Create a combined regex to find all imports and requires in one pass
            const importRegex = /(?:import\s+(?:.*\s+from\s+)?['"]([^./][^'"]*)['"];?)|(?:(?:const|let|var)\s+.*?=\s+require\(['"]([^./][^'"]*)['"]\))/g;

            const packages = new Set();
            let match;

            while ((match = importRegex.exec(fileContent)) !== null) {
                const packageName = (match[1] || match[2])?.split('/')[0]; // Get base package name
                if (packageName && !packageName.startsWith('.') && !this.nodeBuiltins.has(packageName)) {
                    packages.add(packageName);
                }
            }

            return Array.from(packages);
        } catch (error) {
            this.logger.error(`❌ Error reading file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Install all dependencies detected from imports with batch installation
     * @param {string[]} imports Array of package names
     */
    async installDetectedDependencies(imports) {
        if (!imports || imports.length === 0) {
            return;
        }

        // Filter out Node.js built-in modules and already installed packages
        const packagesToInstall = imports.filter(pkg =>
            !this.nodeBuiltins.has(pkg) && !this.isPackageInstalled(pkg)
        );

        if (packagesToInstall.length === 0) {
            return;
        }

        // Batch install packages for efficiency
        try {
            const packageList = packagesToInstall.join(' ');
            this.logger.info(`⚙️ Batch installing packages: ${packageList}`);
            execSync(`npm install ${packageList}`, { stdio: 'pipe' });

            // Clear Node.js module cache
            Object.keys(this.require.cache).forEach(key => {
                delete this.require.cache[key];
            });
        } catch (error) {
            this.logger.error(`❌ Batch installation failed, falling back to individual installation`);

            // Fall back to individual installation
            for (const pkg of packagesToInstall) {
                this.installPackage(pkg, 'latest');
            }

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

        const installPromises = [];

        for (const [pkg, version] of Object.entries(dependencies)) {
            if (!this.isPackageInstalled(pkg)) {
                installPromises.push(this.installPackage(pkg, version));
            }
        }

        if (installPromises.length > 0) {
            const results = await Promise.all(installPromises);
            if (results.some(success => !success)) {
                this.logger.warn('⚠️ Some packages failed to install, this may affect bot functionality.');
            }

            // Clear Node.js module cache
            Object.keys(this.require.cache).forEach(key => {
                delete this.require.cache[key];
            });
        }
    }

    /**
     * Load all commands from the commands directory with optimized loading
     * @returns {Promise<Map>} Map containing command modules
     */
    async loadCommands() {
        const commands = new Map();
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const configValue = {};

        try {
            const commandsPath = join(__dirname, "../commands");
            const dirs = readdirSync(commandsPath);
            this.logger.info(`Loading commands from ${dirs.length} directories...`);

            // Collect all command files first
            const commandFiles = [];

            for (const dir of dirs) {
                const pathFolder = join(commandsPath, dir);
                const files = readdirSync(pathFolder).filter(file => file.endsWith('.js'));

                for (const file of files) {
                    commandFiles.push({
                        dir,
                        file,
                        path: join(pathFolder, file)
                    });
                }
            }

            // Extract imports from all files and batch install dependencies
            const allImports = [];
            for (const { path } of commandFiles) {
                const imports = this.extractImportsFromFile(path);
                allImports.push(...imports);
            }

            // Bulk install unique dependencies
            await this.installDetectedDependencies([...new Set(allImports)]);

            // Now load all command modules
            for (const { file, path } of commandFiles) {
                try {
                    const moduleUrl = `file://${path}`;

                    try {
                        const { default: commandModule } = await import(moduleUrl);

                        if (!commandModule?.config?.name) {
                            this.logger.warn(`⚠️ Command ${file} has no valid config.name!`);
                            continue;
                        }

                        const commandName = commandModule.config.name;

                        // Install explicit dependencies from config if they exist
                        if (commandModule.config.dependencies &&
                            Object.keys(commandModule.config.dependencies).length > 0) {
                            await this.installConfigDependencies(commandModule.config.dependencies);
                        }

                        // Execute onLoad function if it exists
                        if (typeof commandModule.onLoad === 'function') {
                            try {
                                await commandModule.onLoad({ configValue });
                            } catch (onLoadError) {
                                this.logger.error(`❌ Cannot execute onLoad for command ${commandName}:`, onLoadError);
                            }
                        }

                        // Make sure the execute function exists
                        if (typeof commandModule.execute !== 'function') {
                            this.logger.warn(`⚠️ Command ${commandName} has no execute function!`);
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
                    } catch (importError) {
                        this.logger.error(`❌ Error importing module ${file}:`, importError);

                        // Try to identify and install missing package
                        const missingPackageMatch = importError.message.match(/Cannot find package '([^']+)'/);
                        if (missingPackageMatch) {
                            const missingPkg = missingPackageMatch[1];
                            this.logger.info(`🔄 Attempting to install missing package: ${missingPkg}`);
                            await this.installPackage(missingPkg, 'latest');

                            // Try importing again after installing
                            try {
                                const { default: commandModule } = await import(`${moduleUrl}?update=${Date.now()}`);
                                if (commandModule?.config?.name) {
                                    const commandName = commandModule.config.name;
                                    commands.set(commandName, commandModule);
                                    this.logger.info(`✅ Loaded command ${commandName} after installing dependencies`);
                                }
                            } catch (retryError) {
                                this.logger.error(`❌ Still cannot load command ${file} after installing dependencies:`, retryError);
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error(`❌ Cannot load command ${file}:`, error);
                }
            }

            this.logger.info(`Loaded total of ${commands.size} commands`);
        } catch (error) {
            this.logger.error('❌ Error loading commands:', error);
        }

        return commands;
    }

    /**
     * Load all events from the events directory with optimized loading
     * @returns {Promise<Map>} Map containing event modules
     */
    async loadEvents() {
        const events = new Map();
        const __dirname = dirname(fileURLToPath(import.meta.url));

        try {
            const eventsPath = join(__dirname, "../events");

            // Check if events directory exists
            if (!existsSync(eventsPath)) {
                this.logger.info("Events directory does not exist, skipping event loading.");
                return events;
            }

            const files = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

            if (files.length === 0) {
                this.logger.info("No event files found.");
                return events;
            }

            this.logger.info(`Loading ${files.length} events...`);

            // Extract imports from all files and batch install dependencies
            const allImports = [];
            for (const file of files) {
                const path = join(eventsPath, file);
                const imports = this.extractImportsFromFile(path);
                allImports.push(...imports);
            }

            // Bulk install unique dependencies
            await this.installDetectedDependencies([...new Set(allImports)]);

            // Now load all event modules
            for (const file of files) {
                const modulePath = join(eventsPath, file);

                try {
                    // Import the event module
                    const moduleUrl = `file://${modulePath}`;
                    const { default: eventModule } = await import(moduleUrl);

                    if (!eventModule?.config?.name) {
                        this.logger.warn(`⚠️ Event ${file} has no valid config.name!`);
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
                            this.logger.error(`❌ Cannot execute onLoad for event ${eventName}:`, onLoadError);
                        }
                    }

                    // Make sure the event function exists
                    if (typeof eventModule.event !== 'function') {
                        this.logger.warn(`⚠️ Event ${eventName} has no event function!`);
                        continue;
                    }

                    // Save to map
                    events.set(eventName, eventModule);
                    this.logger.info(`✅ Loaded event ${eventName}`);

                } catch (error) {
                    this.logger.error(`❌ Cannot load event ${file}:`, error);
                }
            }

            this.logger.info(`Loaded total of ${events.size} events`);
        } catch (error) {
            this.logger.error('❌ Error loading events:', error);
        }

        return events;
    }

    /**
     * Clean up the watchdog interval
     */
    cleanupWatchdog() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }

    /**
     * Shutdown the bot gracefully with proper cleanup
     */
    async shutdown() {
        try {
            // Stop watchdog timer
            this.cleanupWatchdog();

            // Disconnect from Zalo if connected
            if (this.api && this.api.listener) {
                this.api.listener.stop();
                this.logger.info('Stopped Zalo listener');
            }

            // Clean up database connections
            if (this.database) {
                await this.database.close();
                this.logger.info('Closed database connections');
            }

            // Clean up scheduler
            if (this.schedulesManager) {
                await this.schedulesManager.shutdown();
                this.logger.info('Shutdown scheduler');
            }

            this.logger.info('Bot shutdown complete');
        } catch (error) {
            this.logger.error('Error during bot shutdown:', error);
        }
    }
}

export default ZaloBot;