import pkg from 'fs-extra';
const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = pkg;

class PermissionHandler {
    constructor() {
        this.spamTrackers = new Map();
        this.botAdmins = [];
        this.loadBotAdmins();
    }

    /**
     * Load bot admins from config
     */
    loadBotAdmins() {
        try {
            const config = JSON.parse(readFileSync("./config.json", "utf-8"));
            this.botAdmins = config.adminIds || [];
        } catch (error) {
            console.error("Không thể tải danh sách admin bot:", error);
            this.botAdmins = [];
        }
    }

    /**
     * Check if user is a bot admin
     * @param {string} userId User ID to check
     * @returns {boolean} Whether user is a bot admin
     */
    isBotAdmin(userId) {
        return this.botAdmins.includes(userId);
    }

    /**
     * Add user to bot admins
     * @param {string} userId User ID to add
     * @returns {boolean} Success status
     */
    addBotAdmin(userId) {
        if (!this.isBotAdmin(userId)) {
            this.botAdmins.push(userId);
            this.saveBotAdmins();
            return true;
        }
        return false;
    }

    /**
     * Remove user from bot admins
     * @param {string} userId User ID to remove
     * @returns {boolean} Success status
     */
    removeBotAdmin(userId) {
        const index = this.botAdmins.indexOf(userId);
        if (index !== -1) {
            this.botAdmins.splice(index, 1);
            this.saveBotAdmins();
            return true;
        }
        return false;
    }

    /**
     * Save bot admins to config
     */
    saveBotAdmins() {
        try {
            const config = JSON.parse(readFileSync("./config.json", "utf-8"));
            config.adminIds = this.botAdmins;
            require('fs').writeFileSync("./config.json", JSON.stringify(config, null, 2));
        } catch (error) {
            console.error("Không thể lưu danh sách admin bot:", error);
        }
    }

    /**
     * Check if user is spamming commands
     * @param {string} userId User ID to check
     * @param {number} cooldownTime Cooldown time in seconds
     * @returns {Object} Result with isSpam and timeLeft properties
     */
    checkSpam(userId, cooldownTime) {
        const currentTime = Date.now();
        const cooldownTimeMs = cooldownTime * 1000;

        if (this.spamTrackers.has(userId)) {
            const lastUsed = this.spamTrackers.get(userId);
            const timeLeft = lastUsed + cooldownTimeMs - currentTime;

            if (timeLeft > 0) {
                return {
                    isSpam: true,
                    timeLeft: Math.ceil(timeLeft / 1000)
                };
            }
        }

        // Update last command time
        this.spamTrackers.set(userId, currentTime);
        return { isSpam: false, timeLeft: 0 };
    }

    /**
     * Check if user has permission to use command
     * @param {Object} db Database object
     * @param {Object} message Message object
     * @param {Array<string>} requiredPermissions Required permission types (user, admin, concu)
     * @returns {Promise<Object>} Result with hasPermission and reason properties
     */
    async checkPermission(db, message, requiredPermissions) {
        const { data, threadId, type } = message;
        const fromId = data.uidFrom;
        const isGroup = type === 1;
        const results = await db.processMessage(fromId, isGroup ? threadId : null);

        // Check if permission array is valid
        if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
            return {
                hasPermission: false,
                reason: "Cấu hình quyền hạn không hợp lệ."
            };
        }

        try {
            const userInfo = results.user;

            // Check if user is banned
            if (userInfo && userInfo.banned) {
                return {
                    hasPermission: false,
                    reason: `Bạn đã bị cấm sử dụng bot. Lý do: ${userInfo.banReason || "Không rõ"}`
                };
            }

            // Check if group is banned (for group messages)
            if (isGroup) {
                const groupInfo = results.group;
                if (groupInfo && groupInfo.banned) {
                    return {
                        hasPermission: false,
                        reason: `Nhóm đã bị cấm sử dụng bot. Lý do: ${groupInfo.banReason || "Không rõ"}`
                    };
                }
            }

            // Check for "user" permission - everyone can use
            if (requiredPermissions.includes("user")) {
                return { hasPermission: true };
            }

            // Check for "admin" permission - group admins and bot admins can use
            if (requiredPermissions.includes("admin")) {
                // If it's a group chat, check if user is admin
                if (isGroup) {
                    const groupInfo = results.group;
                    const isGroupAdmin = groupInfo.group?.dataValues?.creatorId === fromId ||
                        groupInfo.group?.dataValues?.adminIds?.includes(fromId);

                    if (isGroupAdmin) {
                        return { hasPermission: true };
                    }
                }

                // Check if user is bot admin
                if (this.isBotAdmin(fromId)) {
                    return { hasPermission: true };
                }

                return {
                    hasPermission: false,
                    reason: "Bạn cần là quản trị viên để sử dụng lệnh này."
                };
            }

            // Check for "concu" permission - only bot creator can use
            if (requiredPermissions.includes("concu")) {
                // Assuming the first bot admin in the list is the creator
                if (this.botAdmins.length > 0 && this.botAdmins[0] === fromId) {
                    return { hasPermission: true };
                }

                return {
                    hasPermission: false,
                    reason: "Chỉ người tạo bot mới có thể sử dụng lệnh này."
                };
            }

            return {
                hasPermission: false,
                reason: "Không đủ quyền hạn."
            };
        } catch (error) {
            console.error("Lỗi khi kiểm tra quyền:", error);
            return {
                hasPermission: false,
                reason: "Đã xảy ra lỗi khi kiểm tra quyền hạn."
            };
        }
    }
}

export default new PermissionHandler();