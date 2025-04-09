import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration path for event templates
const configPath = path.join(__dirname, "../../includes/handler/data/config/groupEventTemplates.json");

export const config = {
    name: "set",
    aliases: ["set"],
    version: "1.0.0",
    description: "Quản lý và tùy chỉnh thông báo sự kiện nhóm như thông báo tham gia, rời đi, v.v.", // Command description
    usage: "{prefix}setEvent list - Xem danh sách các loại sự kiện\n{prefix}setEvent view <type> - Xem mẫu thông báo cho loại sự kiện\n{prefix}setEvent set <type> <text> - Đặt mẫu thông báo cho loại sự kiện\n{prefix}setEvent reset - Khôi phục mẫu thông báo mặc định", // Usage instructions
    cooldown: 5, // Cooldown in seconds
    permissions: ["user"], // Required permissions (admin, user, etc.)
    commandCategory: "utility", // Command category for organization
    isDisabled: false, // Whether the command is disabled
    isDevOnly: false, // Whether the command is only for developers
    dependencies: {},
    envConfig: {}
};

export async function onLoad() {
    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
};

export async function execute(api, message, args) {
    const { threadId, type, data } = message;
    const fromId = data.uidFrom;

    // Check if admin (could use your permission system here)
    // Example: if (!isAdmin(fromId)) return api.sendMessage("Bạn không có quyền sử dụng lệnh này!", threadId, type);

    if (args.length === 0) {
        return api.sendMessage(
            "📢 Lệnh quản lý thông báo sự kiện nhóm:\n" +
            "- list: Xem danh sách loại sự kiện\n" +
            "- view <type>: Xem mẫu thông báo\n" +
            "- set <type> <text>: Đặt mẫu thông báo\n" +
            "- reset: Khôi phục mặc định",
            threadId,
            type
        );
    }

    const subCommand = args[0].toLowerCase();

    // Load current templates
    let templates = {};
    try {
        if (fs.existsSync(configPath)) {
            templates = fs.readJsonSync(configPath);
        }
    } catch (error) {
        console.error("Error loading templates:", error);
        return api.sendMessage("❌ Lỗi khi đọc file cấu hình.", threadId, type);
    }

    switch (subCommand) {
        case "list":
            const eventTypes = Object.keys(templates);
            return api.sendMessage(
                "📋 Danh sách loại sự kiện:\n" + eventTypes.join(", "),
                threadId,
                type
            );

        case "view":
            if (args.length < 2) {
                return api.sendMessage("⚠️ Vui lòng chỉ định loại sự kiện!", threadId, type);
            }

            const viewType = args[1].toUpperCase();
            if (!templates[viewType]) {
                return api.sendMessage(`❌ Loại sự kiện "${viewType}" không tồn tại!`, threadId, type);
            }

            const template = templates[viewType];
            let templateText = Array.isArray(template.text)
                ? template.text.join("\n- ")
                : template.text;

            return api.sendMessage(
                `📝 Mẫu thông báo cho sự kiện ${viewType}:\n- ${templateText}`,
                threadId,
                type
            );

        case "set":
            if (args.length < 3) {
                return api.sendMessage("⚠️ Vui lòng chỉ định loại sự kiện và nội dung thông báo!", threadId, type);
            }

            const setType = args[1].toUpperCase();
            if (!templates[setType]) {
                return api.sendMessage(`❌ Loại sự kiện "${setType}" không tồn tại!`, threadId, type);
            }

            const newText = args.slice(2).join(" ");

            // Update the template
            if (Array.isArray(templates[setType].text)) {
                templates[setType].text = [newText];
            } else {
                templates[setType].text = newText;
            }

            // Save updated templates
            try {
                fs.writeJsonSync(configPath, templates, { spaces: 2 });
                return api.sendMessage(
                    `✅ Đã cập nhật mẫu thông báo cho sự kiện ${setType}!`,
                    threadId,
                    type
                );
            } catch (error) {
                console.error("Error saving templates:", error);
                return api.sendMessage("❌ Lỗi khi lưu cấu hình.", threadId, type);
            }

        case "reset":
            // Load default templates from your handler
            try {
                // This imports the default templates directly from your handler
                const { default: groupEventHandler } = await import("../includes/handler/groupEvent.js");
                const defaultTemplates = groupEventHandler.defaultTemplates || {};

                fs.writeJsonSync(configPath, defaultTemplates, { spaces: 2 });
                return api.sendMessage(
                    "✅ Đã khôi phục mẫu thông báo mặc định cho tất cả sự kiện!",
                    threadId,
                    type
                );
            } catch (error) {
                console.error("Error resetting templates:", error);
                return api.sendMessage("❌ Lỗi khi khôi phục cấu hình mặc định.", threadId, type);
            }

        default:
            return api.sendMessage(
                "⚠️ Lệnh phụ không hợp lệ! Sử dụng list, view, set, hoặc reset.",
                threadId,
                type
            );
    }
}

export default {
    config,
    onLoad,
    execute
};