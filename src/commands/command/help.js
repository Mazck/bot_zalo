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
        // Tìm đối tượng bot từ api
        // Dựa vào cấu trúc của ZaloBot trong code bạn đã chia sẻ
        // api là tham số được truyền vào, và api phải được tạo từ ZaloBot
        const bot = api.zalo?.bot || api._zalobot;

        if (!bot || !bot.commands) {
            // Nếu không tìm thấy bot hoặc commands, hãy thử truy cập theo cách khác
            return api.sendMessage(`⚠️ Không thể truy cập danh sách lệnh. Vui lòng liên hệ quản trị viên.`, threadId, type);
        }

        // Lấy prefix từ config
        const prefix = bot.config?.prefix || "!";

        // Nếu có tên lệnh được chỉ định, hiển thị thông tin chi tiết về lệnh đó
        if (args.length > 0 && isNaN(args[0])) {
            const commandName = args[0].toLowerCase();

            // Tìm lệnh trong danh sách lệnh
            const command = bot.commands.get(commandName);

            if (!command) {
                return api.sendMessage(`❌ Không tìm thấy lệnh "${commandName}". Vui lòng sử dụng ${prefix}help để xem danh sách lệnh.`, threadId, type);
            }

            // Hiển thị thông tin chi tiết về lệnh
            let helpInfo = `📌 THÔNG TIN LỆNH\n\n`;
            helpInfo += `Tên: ${command.config.name}\n`;
            helpInfo += `Mô tả: ${command.config.description || "Không có mô tả"}\n`;
            helpInfo += `Cách dùng: ${(command.config.usage || "{prefix}{command}").replace(/{prefix}/g, prefix).replace(/{command}/g, command.config.name)}\n`;

            if (command.config.aliases && command.config.aliases.length > 0) {
                helpInfo += `Bí danh: ${command.config.aliases.join(", ")}\n`;
            }

            helpInfo += `Thời gian chờ: ${command.config.cooldown || 0} giây\n`;
            helpInfo += `Phân loại: ${command.config.commandCategory || "Chưa phân loại"}\n`;
            helpInfo += `Quyền hạn: ${command.config.permissions?.join(", ") || "user"}\n`;

            return api.sendMessage(helpInfo, threadId, type);
        }

        // Nếu không có tên lệnh, hiển thị danh sách tất cả các lệnh theo trang
        const page = args[0] && !isNaN(args[0]) ? parseInt(args[0]) : 1;
        if (isNaN(page) || page <= 0) {
            return api.sendMessage(`❌ Số trang không hợp lệ. Vui lòng nhập một số lớn hơn 0.`, threadId, type);
        }

        // Lọc các lệnh duy nhất (loại bỏ bí danh trùng lặp) và phân loại theo danh mục
        const uniqueCommands = new Map();
        const categories = new Map();

        // Sử dụng đối tượng bot đã tìm thấy để truy cập commands
        bot.commands.forEach(cmd => {
            if (!uniqueCommands.has(cmd.config.name) &&
                (!cmd.config.isDisabled || config.envConfig.showDisabledCommands) &&
                (!cmd.config.isDevOnly || fromId === bot.config?.adminID)) {

                uniqueCommands.set(cmd.config.name, cmd);

                const category = cmd.config.commandCategory || "Chưa phân loại";
                if (!categories.has(category)) {
                    categories.set(category, []);
                }

                categories.get(category).push(cmd);
            }
        });

        // Sắp xếp danh mục
        const sortedCategories = [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        // Tính toán tổng số lệnh và số trang
        const totalCommands = uniqueCommands.size;
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

            for (const cmd of commands) {
                const cmdName = cmd.config.name;
                const cmdDesc = cmd.config.description || "Không có mô tả";
                helpMessage += `• ${prefix}${cmdName}: ${cmdDesc}\n`;
            }

            helpMessage += "\n";
        }

        // Hướng dẫn cách chuyển trang và xem chi tiết
        helpMessage += `↩️ Để xem trang khác, gõ: ${prefix}help [số trang]\n`;
        helpMessage += `📌 Để xem chi tiết lệnh, gõ: ${prefix}help [tên lệnh]`;

        return api.sendMessage(helpMessage, threadId, type);

    } catch (error) {
        console.error("Error in help command:", error);
        return api.sendMessage(`❌ Đã xảy ra lỗi khi hiển thị help: ${error.message}`, threadId, type);
    }
}

export default {
    config,
    execute
};