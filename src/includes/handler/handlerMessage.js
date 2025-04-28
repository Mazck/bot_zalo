import permissionHandler from "../../utils/permissionHandler.js";
import { integrateAIHandler } from "../../core/aiAssistant.js";

export class handlerMessage {
    constructor(api, database, config, logger, commands, msg) {
        this.api = api;
        this.database = database;
        this.config = config;
        this.logger = logger;
        this.commands = commands;
        this.msg = msg;
    }

    async handleMsg() {
        const { data, threadId, type } = this.msg;
        const fromId = data.uidFrom;

        try {
            const isAIHandled = await integrateAIHandler(this, this.api, this.msg, this.commands);
            const isGroup = type === 1;
            const result = await this.database.processMessage(fromId, isGroup ? threadId : null);

            // Check for level up and send notification if configured
            if (result.user?.levelUp) {
                const { oldLevel, newLevel } = result.user;
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

            if (isGroup && result.group?.levelUp && this.config.notifyGroupLevelUp) {
                const { oldLevel, newLevel } = result.group;
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

            // Check if message starts with prefix
            if (text.startsWith(prefix)) {
                // Parse command and arguments
                const parts = text.slice(prefix.length).trim().split(/\s+/);
                const commandName = parts[0].toLowerCase();
                const args = parts.slice(1);

               // this.logger.info(`📩 Đã nhận lệnh: ${commandName} với ${args.length} tham số`);

                // Find command by name or alias
                const cmd = this.commands.get(commandName);

                if (cmd) {
                    this.logger.info(`🚀 Đang thực thi lệnh: ${commandName}`);

                    try {
                        // Check permission
                        const permissionResult = await permissionHandler.checkPermission(
                            this.database,
                            this.msg,
                            cmd.config.permissions || 0
                        );

                        if (!permissionResult.hasPermission) {
                            await this.api.sendMessage(`⚠️ ${permissionResult.reason}`, threadId, type);
                            return;
                        }

                        // Check for spam
                        const cooldownTime = cmd.config.cooldowns || 3; // Default 3 seconds
                        const spamResult = permissionHandler.checkSpam(fromId, cooldownTime);

                        if (spamResult.isSpam && !permissionHandler.isBotAdmin(fromId)) {
                            await this.api.sendMessage(
                                `⏱️ Bạn đang gửi lệnh quá nhanh. Vui lòng chờ ${spamResult.timeLeft} giây nữa.`,
                                threadId,
                                type
                            );
                            return;
                        }

                        // Execute command
                        await cmd.execute(this.api, this.msg, args);

                    } catch (cmdError) {
                        this.logger.error(`❌ Lỗi khi thực thi lệnh ${commandName}:`, cmdError);

                        // Send error message to user if configured
                        if (this.config.sendErrorMessages) {
                            try {
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
    };
};