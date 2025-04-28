import path from "path";
import fs from "fs";
import { ThreadType } from "zca-js";
import { tmpdir } from "os";
import { v4 as uuidv4 } from "uuid";
import playdl from "play-dl";

export const config = {
    name: "audio",
    aliases: [],
    description: "Phát nhạc từ YouTube bằng link hoặc từ khóa",
    usage: "{prefix}audio [link/youtube]",
    cooldown: 5,
    permissions: ["user"],
    commandCategory: "Giải trí",
    isDisabled: false,
    isDevOnly: false,
    dependencies: {
        "play-dl": "",
        "yt-search": "",
        "uuid": ""
    },
    envConfig: {}
};

async function getYoutubeLink(query) {
    const ytSearch = await import("yt-search");
    const validUrlRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (validUrlRegex.test(query)) return query;

    const result = await ytSearch.default(query);
    if (result.videos.length > 0) return result.videos[0].url;
    throw new Error("❌ Không tìm thấy video phù hợp.");
}

async function downloadAudio(youtubeUrl) {
    const videoInfo = await playdl.video_info(youtubeUrl);
    const streamInfo = await playdl.stream(videoInfo.video_details.url);

    const fileName = uuidv4() + ".mp3";
    const filePath = path.join(tmpdir(), fileName);
    const writeStream = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
        streamInfo.stream.pipe(writeStream);
        streamInfo.stream.on("end", resolve);
        streamInfo.stream.on("error", reject);
    });

    return { filePath, title: videoInfo.video_details.title };
}

async function execute(api, message, args) {
    const { threadId, type } = message;

    if (!args || args.length === 0) {
        return api.sendMessage("❗ Vui lòng cung cấp link YouTube hoặc từ khóa tìm kiếm.", threadId, type);
    }

    try {
        await api.sendMessage("🔍 Đang tìm kiếm bài hát...", threadId, type);

        const query = args.join(" ");
        const youtubeLink = await getYoutubeLink(query);
        const { filePath, title } = await downloadAudio(youtubeLink);

        await api.sendMessage("🎵 Đang phát nhạc...", threadId, type);

        await api.sendMessage(
            {
                msg: `▶️ Đang phát: "${title}"`,
                attachments: [filePath]
            },
            threadId,
            type
        );

        // Optional: xoá file sau khi gửi
        setTimeout(() => fs.unlink(filePath, () => { }), 5000);

    } catch (error) {
        console.error("Audio command error:", error);
        await api.sendMessage(`❌ Lỗi: ${error.message || "Không thể phát nhạc."}`, threadId, type);
    }
}

export default {
    config,
    execute
};
