// includes/autoUpdate/index.js
import AutoUpdater from './autoUpdater.js';
import { defaultLogger } from '../../utils/logger.js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

// Load environment variables
dotenv.config();

/**
 * Initialize the auto-updater with the bot instance
 * @param {Object} bot - The ZaloBot instance
 * @returns {Promise<AutoUpdater>} - The initialized auto-updater
 */
export async function initAutoUpdater(bot) {
    // Create config directory if it doesn't exist
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '../../config/autoupdate.json');

    // Default configuration
    let config = {
        repository: process.env.GITHUB_REPO || 'username/repo',
        branch: process.env.GITHUB_BRANCH || 'main',
        interval: process.env.UPDATE_INTERVAL || '0 */2 * * *', // Every 2 hours by default
        autoInstall: true,
        autoPull: true,
        autoRestart: true,
        token: process.env.GITHUB_TOKEN || null,
        verbose: process.env.UPDATE_VERBOSE === 'true',
        backupDir: join(__dirname, '../../backups'),
        adminEnabled: process.env.ADMIN_CONSOLE === 'true'
    };

    // Try to load configuration from file
    try {
        const configDir = dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });

        try {
            const fileContent = await fs.readFile(configPath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);
            config = { ...config, ...fileConfig };
            defaultLogger.info('Auto-update configuration loaded from file');
        } catch (err) {
            // If file doesn't exist or is invalid, create it with default config
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            defaultLogger.info('Created default auto-update configuration file');
        }
    } catch (error) {
        defaultLogger.error('Failed to load/create auto-update configuration:', error);
    }

    // Initialize auto-updater
    const updater = new AutoUpdater({
        ...config,
        logger: defaultLogger,
        bot: bot
    });

    await updater.init();
    return updater;
}

/**
 * Create admin command for the bot
 * @param {Object} bot - The ZaloBot instance
 * @param {AutoUpdater} updater - The auto-updater instance
 */
export function createAdminCommand(bot, updater) {
    // Register admin command
    const adminCommand = {
        config: {
            name: "admin",
            aliases: ["sysadmin", "system"],
            description: "System administration commands",
            usage: "{prefix}admin [subcommand]",
            cooldown: 5,
            permissions: ["admin"],
            isAdmin: true,
            category: "system"
        },
        execute: async function ({ api, event, args, prefix }) {
            const subCommand = args[0]?.toLowerCase();
            const remainingArgs = args.slice(1);

            // Check if user is system admin
            const isAdmin = bot.config.adminIDs?.includes(event.senderID);
            if (!isAdmin) {
                return api.sendMessage("❌ You don't have permission to use admin commands.", event.threadID, event.messageID);
            }

            switch (subCommand) {
                case "update":
                    await handleUpdate(api, event);
                    break;

                case "restart":
                    await handleRestart(api, event);
                    break;

                case "status":
                    await handleStatus(api, event);
                    break;

                case "config":
                    await handleConfig(api, event, remainingArgs);
                    break;

                case "pull":
                    await handlePull(api, event);
                    break;

                case "install":
                    await handleInstall(api, event);
                    break;

                case "backup":
                    await handleBackup(api, event);
                    break;

                case "exec":
                    await handleExec(api, event, remainingArgs);
                    break;

                case "help":
                default:
                    await handleHelp(api, event, prefix);
                    break;
            }

            // Helper functions for each subcommand
            async function handleUpdate(api, event) {
                await api.sendMessage("🔄 Checking for updates...", event.threadID, event.messageID);

                const updated = await updater.checkForUpdates();

                if (updated) {
                    await api.sendMessage("✅ Update completed successfully! Bot will restart soon.", event.threadID);
                } else {
                    await api.sendMessage("ℹ️ No updates available or update was skipped.", event.threadID);
                }
            }

            async function handleRestart(api, event) {
                await api.sendMessage("🔄 Restarting bot...", event.threadID, event.messageID);

                try {
                    setTimeout(() => updater.restartBot(), 2000);
                } catch (error) {
                    await api.sendMessage(`❌ Restart failed: ${error.message}`, event.threadID);
                }
            }

            async function handleStatus(api, event) {
                const currentCommit = await updater.getCurrentCommit();
                const latestCommit = await updater.getLatestCommit();
                const isLocked = await updater.isUpdateLocked();

                const status = `📊 System Status\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Current commit: ${currentCommit.substring(0, 7)}\n` +
                    `Latest commit: ${latestCommit ? latestCommit.substring(0, 7) : 'Unknown'}\n` +
                    `Updates: ${isLocked ? '🔒 Locked' : '🔓 Unlocked'}\n` +
                    `Auto-pull: ${updater.config.autoPull ? '✅' : '❌'}\n` +
                    `Auto-install: ${updater.config.autoInstall ? '✅' : '❌'}\n` +
                    `Auto-restart: ${updater.config.autoRestart ? '✅' : '❌'}\n` +
                    `Update check: ${updater.config.interval}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`;

                await api.sendMessage(status, event.threadID, event.messageID);
            }

            async function handleConfig(api, event, args) {
                if (args.length >= 2 && args[0] === "set") {
                    const key = args[1];
                    const value = args.slice(2).join(' ');

                    if (!(key in updater.config)) {
                        return api.sendMessage(`❌ Unknown configuration key: ${key}`, event.threadID, event.messageID);
                    }

                    // Convert value to appropriate type
                    let typedValue = value;
                    if (value === 'true') typedValue = true;
                    else if (value === 'false') typedValue = false;
                    else if (!isNaN(value) && value !== '') typedValue = Number(value);

                    // Update config
                    updater.config[key] = typedValue;

                    // If changing interval, restart the cron job
                    if (key === 'interval') {
                        updater.startUpdateChecker();
                    }

                    // Save config to file
                    const configPath = join(dirname(fileURLToPath(import.meta.url)), '../../config/autoupdate.json');
                    await fs.writeFile(configPath, JSON.stringify(updater.config, null, 2));

                    await api.sendMessage(`✅ Configuration update