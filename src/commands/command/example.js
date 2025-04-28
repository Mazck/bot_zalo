/**
 * @module Example Command
 * @description A template command for the ZaloBot
 * @version 1.0.0
 * @author Your Name
 */

// Import required dependencies
import fs from 'fs-extra';
import axios from 'axios';
import { join } from 'path';

/**
 * Command configuration
 * Contains all metadata and settings for this command
 */
export const config = {
    name: "example", // Command name, used to call the command with prefix
    aliases: ["ex", "sample"], // Alternative command names
    description: "A template command showing the proper structure", // Command description
    usage: "{prefix}example <parameter>", // Usage instructions
    cooldown: 5, // Cooldown in seconds
    permissions: ["user"],
    commandCategory: "utility", // Command category for organization
    isDisabled: false, // Whether the command is disabled
    isDevOnly: false, // Whether the command is only for developers
    dependencies: {
        "axios": "^1.6.0", // Dependencies with versions that will be auto-installed
        "moment": "^2.29.4"
    },
    envConfig: {
        // Command-specific configuration that can be modified by admin
        maxResults: 5,
        defaultTimeout: 30000
    }
};

export async function onLoad({ configValue }) {
    
}

/**
 * Command execution function
 * This is called when a user invokes the command
 * 
 * @param {Object} api The Zalo API instance
 * @param {Object} message The message that triggered this command
 * @param {Array<string>} args Command arguments (words after the command name)
 * @returns {Promise<any>} Command result
 */
export async function execute(api, message, args) {
    const { threadId, type, data } = message;

    try {
        // Check if there are any arguments
        if (args.length === 0) {
            await api.sendMessage(
              "Vui lòng cung cấp tham số. Sử dụng /example help để biết thêm chi tiết.",
              threadId,
              type
            );
            return;
        }

        // Process command arguments
        const parameter = args[0].toLowerCase();

        // Command logic based on parameters
        switch (parameter) {
            case "info":
                return await handleInfoCommand(api, message, args.slice(1));

            case "search":
                return await handleSearchCommand(api, message, args.slice(1));

            case "help":
                return await showHelp(api, threadId, type);

            default:
                await api.sendMessage(`Tham số không hợp lệ: ${parameter}. Sử dụng !example help để xem hướng dẫn.`, threadId, type);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to execute command ${config.name}:`, error);
        await api.sendMessage(`Đã xảy ra lỗi khi thực thi lệnh: ${error.message}`, threadId, type);
    }
}

/**
 * Handle the info subcommand
 * 
 * @param {Object} api The Zalo API instance
 * @param {Object} message The original message
 * @param {Array<string>} args Remaining arguments
 * @returns {Promise<void>}
 */
async function handleInfoCommand(api, message, args) {
    const { threadId, type } = message;

    // Example info functionality
    const info = {
        commandName: config.name,
        version: "1.0.0",
        description: config.description,
        author: "Your Name",
        created: "2025-04-05"
    };

    const infoMessage = `
📌 Thông tin lệnh
➤ Tên: ${info.commandName}
➤ Phiên bản: ${info.version}
➤ Mô tả: ${info.description}
➤ Tác giả: ${info.author}
➤ Ngày tạo: ${info.created}
    `.trim();

    await api.sendMessage(infoMessage, threadId, type);
}

/**
 * Handle the search subcommand
 * 
 * @param {Object} api The Zalo API instance
 * @param {Object} message The original message
 * @param {Array<string>} args Remaining arguments
 * @returns {Promise<void>}
 */
async function handleSearchCommand(api, message, args) {
    const { threadId, type, data } = message;

    if (args.length === 0) {
        await api.sendMessage("Vui lòng cung cấp từ khóa tìm kiếm.", threadId, type);
        return;
    }

    const searchTerm = args.join(" ");

    // Example of making an API request
    try {
        await api.sendMessage(`🔍 Đang tìm kiếm "${searchTerm}"...`, threadId, type);

        // Simulate an API call
        // In a real command, you would make actual API calls
        const response = await simulateApiCall(searchTerm);

        if (response.results.length === 0) {
            await api.sendMessage(`Không tìm thấy kết quả cho "${searchTerm}"`, threadId, type);
            return;
        }

        // Format and send results
        const resultMessage = formatSearchResults(response.results);
        await api.sendMessage(resultMessage, threadId, type);

    } catch (error) {
        console.error(`[ERROR] Search failed:`, error);
        await api.sendMessage(`Không thể tìm kiếm: ${error.message}`, threadId, type);
    }
}

/**
 * Show help information for this command
 * 
 * @param {Object} api The Zalo API instance
 * @param {string} threadId Thread ID to send message to
 * @param {string} type Thread type
 * @returns {Promise<void>}
 */
async function showHelp(api, threadId, type) {
    const helpMessage = `
📚 Hướng dẫn sử dụng lệnh Example
➤ ${config.usage.replace('{prefix}', '!')}

Các tham số:
➤ info: Hiển thị thông tin về lệnh
➤ search <từ khóa>: Tìm kiếm với từ khóa
➤ help: Hiển thị trợ giúp này

Ví dụ:
➤ !example info
➤ !example search đồ ăn
    `.trim();

    await api.sendMessage(helpMessage, threadId, type);
}

/**
 * Simulate an API request (for demonstration)
 * In a real command, replace this with actual API calls
 * 
 * @param {string} searchTerm Search term
 * @returns {Promise<Object>} Search results
 */
async function simulateApiCall(searchTerm) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock response
    return {
        results: [
            { id: 1, title: `Kết quả 1 cho "${searchTerm}"`, score: 95 },
            { id: 2, title: `Kết quả 2 cho "${searchTerm}"`, score: 85 },
            { id: 3, title: `Kết quả 3 cho "${searchTerm}"`, score: 75 }
        ],
        total: 3,
        searchTime: "0.25s"
    };
}

/**
 * Format search results into a readable message
 * 
 * @param {Array<Object>} results Search results
 * @returns {string} Formatted message
 */
function formatSearchResults(results) {
    let message = `🔎 Kết quả tìm kiếm (${results.length})\n\n`;

    results.forEach((result, index) => {
        message += `${index + 1}. ${result.title}\n   Điểm: ${result.score}%\n\n`;
    });

    return message.trim();
}

// Export default for compatibility with ES modules
export default {
    config,
    onLoad,
    execute
};