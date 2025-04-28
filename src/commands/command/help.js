export const config = {
    name: "help",
    aliases: ["h", "cmds", "commands"],
    description: "Hiển thị danh sách tất cả các lệnh hoặc thông tin chi tiết về một lệnh cụ thể",
    usage: "{prefix}help [tên lệnh]",
    cooldown: 5,
    permissions: ["user"],
    commandCategory: "hệ thống",
    isDisabled: false,
    isDevOnly: false,
    dependencies: {},
    envConfig: {
        commandsPerPage: 10,
        showDisabledCommands: false
    }
};

export async function execute(api, message, args) {
    const { threadId, type } = message;
    const { data } = message;
    const fromId = data.uidFrom;

    try {
        // Lấy prefix từ config
        const prefix = api?.config?.prefix || "!";

        // Lấy tất cả các lệnh từ global.data.allCommands
        const allCommands = global.data.allCommands || [];

        if (!allCommands || allCommands.length === 0) {
            return api.sendMessage(`⚠️ Không tìm thấy lệnh nào. Vui lòng kiểm tra lại cấu hình bot.`, threadId, type);
        }

        // Nếu có tên lệnh được chỉ định, hiển thị thông tin chi tiết về lệnh đó
        if (args.length > 0 && isNaN(args[0])) {
            const commandName = args[0].toLowerCase();

            // Tìm lệnh trong danh sách lệnh
            const command = allCommands.find(cmd => cmd.name === commandName);

            if (!command) {
                // Nếu không tìm thấy trong global.data.allCommands, thử tìm trong commands map của bot nếu có
                const botCommand = api._bot && api._bot.commands ? api._bot.commands.get(commandName) : null;

                if (!botCommand) {
                    return api.sendMessage(`❌ Không tìm thấy lệnh "${commandName}". Vui lòng sử dụng ${prefix}help để xem danh sách lệnh.`, threadId, type);
                }

                // Nếu tìm thấy từ bot.commands, sử dụng thông tin từ đó
                return displayCommandInfo(api, botCommand.config, prefix, threadId, type);
            }

            // Hiển thị thông tin chi tiết về lệnh từ global.data.allCommands
            return displayCommandInfo(api, command, prefix, threadId, type);
        }

        // Nếu không có tên lệnh, hiển thị danh sách tất cả các lệnh theo trang
        const page = args[0] && !isNaN(args[0]) ? parseInt(args[0]) : 1;
        if (isNaN(page) || page <= 0) {
            return api.sendMessage(`❌ Số trang không hợp lệ. Vui lòng nhập một số lớn hơn 0.`, threadId, type);
        }

        // Lọc bỏ các lệnh bị vô hiệu hóa hoặc dành riêng cho dev (trừ khi người dùng hiện tại là admin)
        const filteredCommands = allCommands.filter(cmd =>
            (!cmd.isDisabled || config.envConfig.showDisabledCommands) &&
            (!cmd.isDevOnly || fromId === api._bot?.config?.adminID)
        );

        // Phân loại lệnh theo danh mục
        const categories = new Map();
        for (const cmd of filteredCommands) {
            const category = cmd.commandCategory || "Chưa phân loại";
            if (!categories.has(category)) {
                categories.set(category, []);
            }
            categories.get(category).push(cmd);
        }

        // Sắp xếp danh mục
        const sortedCategories = [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        // Tính toán tổng số lệnh và số trang
        const totalCommands = filteredCommands.length;
        const commandsPerPage = config.envConfig.commandsPerPage;
        const totalPages = Math.ceil(sortedCategories.length / commandsPerPage);

        if (page > totalPages) {
            return api.sendMessage(`❌ Chỉ có ${totalPages} trang. Vui lòng nhập số trang từ 1 đến ${totalPages}.`, threadId, type);
        }

        // Lấy các danh mục cho trang hiện tại
        const startIdx = (page - 1) * commandsPerPage;
        const currentPageCategories = sortedCategories.slice(startIdx, startIdx + commandsPerPage);

        // Tạo nội dung help
        let helpMessage = `📜 DANH SÁCH LỆNH (Trang ${page}/${totalPages})\n`;
        helpMessage += `Tổng số lệnh: ${totalCommands}\n\n`;

        for (const [category, commands] of currentPageCategories) {
            helpMessage += `『 ${category.toUpperCase()} 』\n`;

            // Sắp xếp lệnh theo tên
            const sortedCommands = commands.sort((a, b) => a.name.localeCompare(b.name));

            for (const cmd of sortedCommands) {
                const cmdName = cmd.name;
                const cmdDesc = cmd.description || "Không có mô tả";
                // Đánh dấu loại lệnh
                let cmdType = "";
                if (cmd.isCustom) cmdType = " [Tùy chỉnh]";
                else if (cmd.isDynamic) cmdType = " [Động]";

                helpMessage += `• ${prefix}${cmdName}${cmdType}: ${cmdDesc}\n`;
            }

            helpMessage += "\n";
        }

        // Thêm thông tin bổ sung về cách sử dụng bot
        helpMessage += `↩️ Để xem trang khác, gõ: ${prefix}help [số trang]\n`;
        helpMessage += `📌 Để xem chi tiết lệnh, gõ: ${prefix}help [tên lệnh]`;

        return api.sendMessage(helpMessage, threadId, type);

    } catch (error) {
        console.error("Error in help command:", error);
        return api.sendMessage(`❌ Đã xảy ra lỗi khi hiển thị help: ${error.message}`, threadId, type);
    }
}

// Hàm hiển thị thông tin chi tiết về một lệnh
function displayCommandInfo(api, cmdConfig, prefix, threadId, type) {
    // Hiển thị thông tin chi tiết về lệnh
    let helpInfo = `📌 THÔNG TIN LỆNH\n\n`;
    helpInfo += `Tên: ${cmdConfig.name}\n`;
    helpInfo += `Mô tả: ${cmdConfig.description || "Không có mô tả"}\n`;
    helpInfo += `Cách dùng: ${(cmdConfig.usage || "{prefix}{command}").replace(/{prefix}/g, prefix).replace(/{command}/g, cmdConfig.name)}\n`;

    if (cmdConfig.aliases && cmdConfig.aliases.length > 0) {
        helpInfo += `Bí danh: ${cmdConfig.aliases.join(", ")}\n`;
    }

    helpInfo += `Thời gian chờ: ${cmdConfig.cooldown || 0} giây\n`;
    helpInfo += `Phân loại: ${cmdConfig.commandCategory || "Chưa phân loại"}\n`;

    // Hiển thị loại lệnh (mặc định, tùy chỉnh, động)
    if (cmdConfig.isCustom) {
        helpInfo += `Loại: Lệnh tùy chỉnh\n`;
    } else if (cmdConfig.isDynamic) {
        helpInfo += `Loại: Lệnh động\n`;
    } else {
        helpInfo += `Loại: Lệnh mặc định\n`;
    }

    // Hiển thị quyền hạn nếu có
    if (cmdConfig.permissions) {
        helpInfo += `Quyền hạn: ${Array.isArray(cmdConfig.permissions) ? cmdConfig.permissions.join(", ") : cmdConfig.permissions}\n`;
    }

    return api.sendMessage(helpInfo, threadId, type);
}

export default {
    config,
    execute
};