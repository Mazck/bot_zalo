const config = {
    name: "start", // Changed from "say" to "start"
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Your Name",
    description: "Hiển thị thông tin của bot",
    commandCategory: "hệ thống",
    usages: "",
    cooldowns: 5
};

async function onLoad({ configValue }) {
    // No initialization needed
}

async function execute(api, message, args) {
   console.log("Đã nhận lệnh khởi động bot Zalo!" , args);
}

export default {
    config,
    onLoad,
    execute
};