import pidusage from 'pidusage';

export const config = {
    name: "uptime", // Command name, used to call the command with prefix
    aliases: ["up"], // Alternative command names
    description: "A template command showing the proper structure", // Command description
    usage: "{prefix}example <parameter>", // Usage instructions
    cooldown: 5, // Cooldown in seconds
    permissions: ["user"], // Required permissions (admin, user, etc.)
    commandCategory: "hệ thống", // Command category for organization
    isDisabled: false, // Whether the command is disabled
    isDevOnly: false, // Whether the command is only for developers
    dependencies: {
        "pidusage": "", // Dependencies with versions that will be auto-installed
    },
    envConfig: {
        // Command-specific configuration that can be modified by admin
        maxResults: 5,
        defaultTimeout: 30000
    }
};

export async function execute(api, message, args) {
    const { threadId, type } = message;

    function byte2mb(bytes) {
        const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        let l = 0, n = parseInt(bytes, 10) || 0;
        while (n >= 1024 && ++l) n = n / 1024;
        return `${n.toFixed(n < 10 && l > 0 ? 1 : 0)} ${units[l]}`;
    }

    const time = process.uptime(),
        hours = Math.floor(time / (60 * 60)),
        minutes = Math.floor((time % (60 * 60)) / 60),
        seconds = Math.floor(time % 60);

    const timeStart = Date.now();

    // Gọi pidusage đúng cách
    const stats = await pidusage(process.pid);

    return await api.sendMessage(
        `Bot đã hoạt động được ${hours} giờ ${minutes} phút ${seconds} giây.\n\n❯ Cpu đang sử dụng: ${stats.cpu.toFixed(1)}%\n❯ Ram đang sử dụng: ${byte2mb(stats.memory)}\n❯ Ping: ${Date.now() - timeStart}ms\n`,
        threadId,
        type
    );
}

export default {
    config,
    execute
};