import pidusage from 'pidusage';
import os from 'os';

export const config = {
    name: "uptime",
    aliases: ["up", "stats", "system"],
    description: "Hiển thị thời gian hoạt động và thông tin hệ thống của bot",
    usage: "{prefix}uptime",
    cooldown: 5,
    permissions: ["user"],
    commandCategory: "hệ thống",
    isDisabled: false,
    isDevOnly: false,
    dependencies: {
        "pidusage": "^3.0.0",
    },
    envConfig: {
        showDetailedStats: true
    }
};

export async function execute(api, message, args) {
    const { threadId, type } = message;

    // Format bytes to human-readable format
    function formatBytes(bytes) {
        const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        let l = 0, n = parseInt(bytes, 10) || 0;
        while (n >= 1024 && ++l) n = n / 1024;
        return `${n.toFixed(n < 10 && l > 0 ? 1 : 0)} ${units[l]}`;
    }

    // Calculate uptime
    const uptime = process.uptime();
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    const seconds = Math.floor(uptime % 60);

    // Format uptime string
    let uptimeStr = '';
    if (days > 0) uptimeStr += `${days} ngày `;
    if (hours > 0) uptimeStr += `${hours} giờ `;
    if (minutes > 0) uptimeStr += `${minutes} phút `;
    uptimeStr += `${seconds} giây`;

    const timeStart = Date.now();

    try {
        // Get system stats
        const stats = await pidusage(process.pid);
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsagePercent = (usedMem / totalMem * 100).toFixed(1);
        const ping = Date.now() - timeStart;

        // Build stats message
        let message = `🤖 Bot đã hoạt động được ${uptimeStr}\n\n`;
        message += `📊 Thông tin hệ thống:\n`;
        message += `❯ CPU: ${stats.cpu.toFixed(1)}%\n`;
        message += `❯ RAM: ${formatBytes(stats.memory)} / ${formatBytes(totalMem)} (${memoryUsagePercent}%)\n`;
        message += `❯ Ping: ${ping}ms\n`;

        // Add detailed stats if enabled
        if (config.envConfig.showDetailedStats) {
            message += `❯ Nền tảng: ${os.platform()} ${os.release()}\n`;
            message += `❯ Kiến trúc: ${os.arch()}\n`;
            message += `❯ Cores: ${os.cpus().length}\n`;
        }

        return await api.sendMessage(message, threadId, type);
    } catch (error) {
        console.error("Error in uptime command:", error);
        return await api.sendMessage(`❌ Đã xảy ra lỗi khi lấy thông tin hệ thống: ${error.message}`, threadId, type);
    }
}

export default {
    config,
    execute
};