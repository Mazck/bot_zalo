import { GroupEventType } from "zca-js";
import moment from "moment-timezone";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs-extra";
import { defaultLogger } from "../../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration path for event templates
const configPath = path.join(__dirname, "../../config/groupEventTemplates.json");

// Default templates in case config file doesn't exist
const defaultTemplates = {
    // Existing templates
    "JOIN_REQUEST": {
        "text": [
            "🔔 {{user}} đã yêu cầu tham gia nhóm '{{group}}' lúc {{time}}.",
            "📝 Có yêu cầu tham gia mới từ {{user}} vào nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "JOIN": {
        "text": [
            "🎉 {{user}} đã tham gia nhóm '{{group}}' lúc {{time}}!",
            "🧡 Nhiệt liệt chào đón {{user}} đến với {{group}} nha!",
            "🔥 Boom! {{user}} đã vào hội anh em tại {{group}}!"
        ],
        "attachments": {
            "image": [
                "https://link.com/hello1.jpg",
                "https://link.com/hello2.jpg"
            ],
            "video": [
                "https://link.com/welcome.mp4"
            ]
        }
    },
    "LEAVE": {
        "text": [
            "👋 {{user}} đã rời khỏi nhóm '{{group}}' lúc {{time}}.",
            "🫡 Tạm biệt {{user}}! Hẹn gặp lại ở {{group}} nhé."
        ],
        "attachments": {}
    },
    "REMOVE_MEMBER": {
        "text": [
            "⛔ {{user}} đã bị xóa khỏi nhóm '{{group}}' bởi quản trị viên lúc {{time}}.",
            "🚮 {{user}} đã bị quản trị viên xóa khỏi nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "BLOCK_MEMBER": {
        "text": [
            "🚫 {{user}} đã bị cấm khỏi nhóm '{{group}}' lúc {{time}}.",
            "🔒 {{user}} đã bị chặn khỏi nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "UPDATE_SETTING": {
        "text": [
            "⚙️ Cài đặt nhóm '{{group}}' đã được cập nhật lúc {{time}}.",
            "🛠️ Cài đặt mới đã được áp dụng cho nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "UPDATE": {
        "text": [
            "📝 Nhóm '{{group}}' vừa được cập nhật lúc {{time}}.",
            "🔄 Thông tin nhóm '{{group}}' đã được cập nhật lúc {{time}}."
        ],
        "attachments": {}
    },
    "NEW_LINK": {
        "text": [
            "🔗 Link mới đã được tạo cho nhóm '{{group}}' lúc {{time}}.",
            "🌐 Link mời mới cho nhóm '{{group}}' đã được tạo lúc {{time}}."
        ],
        "attachments": {}
    },
    "ADD_ADMIN": {
        "text": [
            "👑 {{user}} đã được bổ nhiệm làm quản trị viên của nhóm '{{group}}' lúc {{time}}.",
            "⭐ {{user}} vừa trở thành quản trị viên mới của nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "REMOVE_ADMIN": {
        "text": [
            "⬇️ {{user}} đã bị gỡ quyền quản trị viên khỏi nhóm '{{group}}' lúc {{time}}.",
            "🔽 {{user}} không còn là quản trị viên của nhóm '{{group}}' từ lúc {{time}}."
        ],
        "attachments": {}
    },

    // New templates for additional event types
    "NEW_PIN_TOPIC": {
        "text": [
            "📌 Chủ đề mới đã được ghim trong nhóm '{{group}}' lúc {{time}}.",
            "📍 Một chủ đề vừa được ghim trong nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "UPDATE_PIN_TOPIC": {
        "text": [
            "🔄 Chủ đề ghim đã được cập nhật trong nhóm '{{group}}' lúc {{time}}.",
            "📝 Thông tin chủ đề ghim đã được thay đổi trong nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "REORDER_PIN_TOPIC": {
        "text": [
            "🔃 Thứ tự các chủ đề ghim đã được sắp xếp lại trong nhóm '{{group}}' lúc {{time}}.",
            "📊 Các chủ đề ghim đã được sắp xếp theo thứ tự mới trong nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "UPDATE_BOARD": {
        "text": [
            "📋 Bảng tin đã được cập nhật trong nhóm '{{group}}' lúc {{time}}.",
            "📢 Bảng tin nhóm '{{group}}' vừa được cập nhật lúc {{time}}."
        ],
        "attachments": {}
    },
    "REMOVE_BOARD": {
        "text": [
            "🗑️ Bảng tin đã bị xóa khỏi nhóm '{{group}}' lúc {{time}}.",
            "❌ Bảng tin trong nhóm '{{group}}' đã bị gỡ bỏ lúc {{time}}."
        ],
        "attachments": {}
    },
    "UPDATE_TOPIC": {
        "text": [
            "📄 Chủ đề đã được cập nhật trong nhóm '{{group}}' lúc {{time}}.",
            "✏️ Thông tin chủ đề trong nhóm '{{group}}' vừa được thay đổi lúc {{time}}."
        ],
        "attachments": {}
    },
    "UNPIN_TOPIC": {
        "text": [
            "📎 Một chủ đề đã được bỏ ghim trong nhóm '{{group}}' lúc {{time}}.",
            "🔓 Chủ đề không còn được ghim trong nhóm '{{group}}' từ lúc {{time}}."
        ],
        "attachments": {}
    },
    "REMOVE_TOPIC": {
        "text": [
            "🗑️ Chủ đề đã bị xóa khỏi nhóm '{{group}}' lúc {{time}}.",
            "❌ Một chủ đề trong nhóm '{{group}}' đã bị gỡ bỏ lúc {{time}}."
        ],
        "attachments": {}
    },
    "ACCEPT_REMIND": {
        "text": [
            "✅ {{user}} đã chấp nhận lời nhắc trong nhóm '{{group}}' lúc {{time}}.",
            "👍 {{user}} đồng ý với lời nhắc trong nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "REJECT_REMIND": {
        "text": [
            "❎ {{user}} đã từ chối lời nhắc trong nhóm '{{group}}' lúc {{time}}.",
            "👎 {{user}} không đồng ý với lời nhắc trong nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "REMIND_TOPIC": {
        "text": [
            "⏰ Có lời nhắc mới về chủ đề trong nhóm '{{group}}' lúc {{time}}.",
            "🔔 Nhắc nhở về chủ đề đã được tạo trong nhóm '{{group}}' lúc {{time}}."
        ],
        "attachments": {}
    },
    "UNKNOWN": {
        "text": [
            "[{{type}}] {{user}} vừa có hành động trong nhóm {{group}} lúc {{time}}.",
            "[{{type}}] Có hoạt động không xác định trong nhóm {{group}} lúc {{time}}."
        ],
        "attachments": {}
    }
};

/**
 * Load group event templates from config file
 * @returns {Object} Event templates
 */
function loadEventTemplates() {
    try {
        if (fs.existsSync(configPath)) {
            const templates = fs.readJsonSync(configPath);
            return templates;
        } else {
            // Create default config if doesn't exist
            fs.ensureDirSync(path.dirname(configPath));
            fs.writeJsonSync(configPath, defaultTemplates, { spaces: 2 });
            return defaultTemplates;
        }
    } catch (error) {
        console.error("Error loading group event templates:", error);
        return defaultTemplates;
    }
}

/**
 * Get event type name from enum value
 * @param {number} eventTypeValue The enum value
 * @returns {string} The event type name
 */
function getEventTypeName(eventTypeValue) {
    // Find the enum key by value
    const eventTypeKey = Object.keys(GroupEventType).find(
        key => GroupEventType[key] === eventTypeValue
    );
    return eventTypeKey || "UNKNOWN";
}

/**
 * Format template message with event data
 * @param {string} template Template string
 * @param {Object} data Event data
 * @returns {string} Formatted message
 */
function formatMessage(template, data) {
    const time = moment().format("HH:mm:ss DD/MM/YYYY");

    // Get user info
    let userName = "Người dùng";
    if (data.userId) {
        userName = data.userName || `Người dùng (${data.userId})`;
    }

    // Get group name
    let groupName = "nhóm chat";
    if (data.groupId) {
        groupName = data.groupName || `nhóm (${data.groupId})`;
    }

    // Get event type name if numeric value is provided
    let eventType = data.type;
    if (typeof eventType === 'number') {
        eventType = getEventTypeName(eventType);
    }

    // Replace placeholders
    return template
        .replace(/{{user}}/g, userName)
        .replace(/{{group}}/g, groupName)
        .replace(/{{time}}/g, time)
        .replace(/{{type}}/g, eventType || "UNKNOWN");
}

/**
 * Get random template from array or return single template
 * @param {string|Array} templates Template or array of templates
 * @returns {string} Selected template
 */
function getRandomTemplate(templates) {
    if (Array.isArray(templates)) {
        const randomIndex = Math.floor(Math.random() * templates.length);
        return templates[randomIndex];
    }
    return templates;
}

/**
 * Process group event and prepare message
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 * @returns {Object} Message data
 */
/**
 * Process group event and prepare message
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 * @returns {Object} Message data
 */
async function processGroupEvent(data, api) {
    const templates = loadEventTemplates();

    // Convert numeric type to string type if needed
    let eventType = data.type;
    if (typeof eventType === 'number') {
        eventType = getEventTypeName(eventType);
    }

    eventType = eventType || "UNKNOWN";

    // Find appropriate template for event type
    const template = templates[eventType] || templates["UNKNOWN"];

    if (!template) {
        return null;
    }

    // Prepare event data with additional info if available
    const eventData = {
        ...data,
        userId: data.data?.creatorId,
        groupId: data.data?.groupId,
        type: eventType
    };

    // Try to get user name if not already available
    if (eventData.userId && !eventData.userName && api) {
        try {
            const userResponse = await api.getUserInfo(eventData.userId);
            console.log("User info response:", userResponse);

            if (userResponse && userResponse.changed_profiles && userResponse.changed_profiles[eventData.userId]) {
                const userInfo = userResponse.changed_profiles[eventData.userId];
                eventData.userName = userInfo.zaloName || userInfo.displayName || `Người dùng (${eventData.userId})`;
            }
        } catch (error) {
            console.error("Error getting user info:", error);
        }
    }

    // Try to get group name if not already available
    if (eventData.groupId && !eventData.groupName && api) {
        try {
            const groupResponse = await api.getGroupInfo(eventData.groupId);

            if (groupResponse && groupResponse.gridInfoMap && groupResponse.gridInfoMap[eventData.groupId]) {
                const groupInfo = groupResponse.gridInfoMap[eventData.groupId];
                eventData.groupName = groupInfo.name || `nhóm (${eventData.groupId})`;
            }
        } catch (error) {
            console.error("Error getting group info:", error);
        }
    }

    // Format message text
    const textTemplate = getRandomTemplate(template.text);
    const formattedText = formatMessage(textTemplate, eventData);

    // Prepare attachments if any
    const attachments = [];
    if (template.attachments) {
        if (template.attachments.image && template.attachments.image.length > 0) {
            const randomImage = getRandomTemplate(template.attachments.image);
            attachments.push({ type: "image", url: randomImage });
        }
        if (template.attachments.video && template.attachments.video.length > 0) {
            const randomVideo = getRandomTemplate(template.attachments.video);
            attachments.push({ type: "video", url: randomVideo });
        }
    }

    return {
        text: formattedText,
        attachments: attachments,
        eventType: eventType,
        groupId: eventData.groupId
    };
}

/**
 * Initialize group event listener
 * @param {Object} api Zalo API instance
 * @param {Object} options Configuration options
 */
export function initGroupEventListener(api, options = {}) {
    if (!api || !api.listener) {
        console.error("Cannot initialize group event listener: API instance is invalid");
        return;
    }

    // Default configuration
    const config = {
        enabledEvents: Object.values(GroupEventType), // All events enabled by default
        silentEvents: [], // No silent events by default
        ...options
    };

    api.listener.on("group_event", async (data) => {
        try {
            // Get event type name for logging
            let eventTypeName = data.type;
            if (typeof eventTypeName === 'number') {
                eventTypeName = getEventTypeName(eventTypeName);
            }

            console.log(`[Group Event] Received event: ${eventTypeName} (${data.type})`);

            // Check if this event type is enabled
            if (config.enabledEvents.indexOf(data.type) === -1) {
                console.log(`[Group Event] Event type ${eventTypeName} is disabled, skipping`);
                return;
            }

            // Check if this is a silent event (process but don't notify)
            const isSilent = config.silentEvents.indexOf(data.type) !== -1;

            // Process the event
            const messageData = await processGroupEvent(data, api);

            // Handle special event types with custom handlers
            await handleSpecialEvents(data, api);

            if (!messageData || !messageData.groupId) {
                console.warn("[Group Event] Invalid message data or missing group ID");
                return;
            }

            // Send notification to the group if not silent
            if (messageData.text && !isSilent) {
                const messageOptions = {};

                // Add attachments if any
                if (messageData.attachments && messageData.attachments.length > 0) {
                    const validAttachments = messageData.attachments.filter(att => att.url);
                    if (validAttachments.length > 0) {
                        messageOptions.attachments = validAttachments;
                    }
                }

                // Send the message
                await api.sendMessage(
                    messageData.text,
                    messageData.groupId,
                    1, // Type 1 for group messages
                    messageOptions
                );

                console.log(`[Group Event] Sent notification for ${messageData.eventType} event to group ${messageData.groupId}`);
            } else if (isSilent) {
                console.log(`[Group Event] Silent mode for ${messageData.eventType}, notification skipped`);
            }
        } catch (error) {
            console.error("Error handling group event:", error);
        }
    });

    defaultLogger.info("Group event listener initialized successfully");
}

/**
 * Handle special events that require additional processing
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 */
async function handleSpecialEvents(data, api) {
    // Map for special event handlers
    const specialHandlers = {
        [GroupEventType.JOIN_REQUEST]: groupEventHandlers.handleJoinRequest,
        [GroupEventType.JOIN]: groupEventHandlers.handleJoin,
        [GroupEventType.NEW_PIN_TOPIC]: groupEventHandlers.handleNewPinTopic,
        [GroupEventType.REMIND_TOPIC]: groupEventHandlers.handleRemindTopic
    };

    // Get the appropriate handler for this event type
    const handler = specialHandlers[data.type];

    if (handler && typeof handler === 'function') {
        try {
            await handler(data, api);
        } catch (error) {
            console.error(`Error in special handler for event type ${data.type}:`, error);
        }
    }
}

export const groupEventHandlers = {
    // Handle join requests - could be used to auto-approve specific users, etc.
    handleJoinRequest: async (data, api) => {
        if (data.type !== GroupEventType.JOIN_REQUEST) return;

        // Example: Auto-approve join requests (if API supports it)
        // if (api.approveJoinRequest) {
        //     await api.approveJoinRequest(data.groupId, data.userId);
        //     console.log(`Auto-approved join request for user ${data.userId} to group ${data.groupId}`);
        // }
    },

    // Custom handler for welcome messages with more personalization
    handleJoin: async (data, api, database) => {
        if (data.type !== GroupEventType.JOIN) return;

        // Get joined user info
        if (data.data && data.data.userId && api) {
            try {
                const userResponse = await api.getUserInfo(data.data.userId);

                if (userResponse && userResponse.changed_profiles && userResponse.changed_profiles[data.data.userId]) {
                    const userInfo = userResponse.changed_profiles[data.data.userId];
                    const userName = userInfo.displayName || userInfo.zaloName || userInfo.username;

                    // Example with database integration (if available):
                    if (database && database.Users) {
                        const user = await database.Users.findByPk(data.data.userId);
                        if (user) {
                            // Personalize welcome based on user data
                            const customWelcome = `Chào mừng ${userName} quay trở lại! Đây là lần thứ ${user.groupJoinCount} bạn tham gia nhóm của chúng tôi.`;
                            await api.sendMessage(customWelcome, data.data.groupId, 1);
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching user info for join event:", error);
            }
        }
    },

    // Handle new pinned topics
    handleNewPinTopic: async (data, api) => {
        if (data.type !== GroupEventType.NEW_PIN_TOPIC) return;

        // Get group info to include in notification
        if (data.data && data.data.groupId && api) {
            try {
                const groupResponse = await api.getGroupInfo(data.data.groupId);

                if (groupResponse && groupResponse.gridInfoMap && groupResponse.gridInfoMap[data.data.groupId]) {
                    const groupInfo = groupResponse.gridInfoMap[data.data.groupId];
                    console.log(`[Group Event] New topic pinned in group ${groupInfo.name} (${data.data.groupId})`);
                }
            } catch (error) {
                console.error("Error fetching group info for pin topic event:", error);
            }
        }
    },

    // Handle topic reminders
    handleRemindTopic: async (data, api) => {
        if (data.type !== GroupEventType.REMIND_TOPIC) return;

        // Example: Send additional reminder details with group info
        if (data.data && data.data.reminderInfo && data.data.groupId) {
            try {
                const groupResponse = await api.getGroupInfo(data.data.groupId);
                let groupName = `nhóm (${data.data.groupId})`;

                if (groupResponse && groupResponse.gridInfoMap && groupResponse.gridInfoMap[data.data.groupId]) {
                    groupName = groupResponse.gridInfoMap[data.data.groupId].name || groupName;
                }

                const reminderMsg = `Nhắc nhở nhóm ${groupName}: ${data.data.reminderInfo.title || 'Chủ đề quan trọng'} - ${data.data.reminderInfo.description || 'Hãy kiểm tra thông tin mới'}`;
                await api.sendMessage(reminderMsg, data.data.groupId, 1);
            } catch (error) {
                console.error("Error handling remind topic event:", error);
            }
        }
    }
};

/**
 * Update group event templates
 * @param {Object} newTemplates Templates to update
 * @returns {boolean} Success status
 */
export function updateEventTemplates(newTemplates) {
    try {
        const currentTemplates = loadEventTemplates();
        const updatedTemplates = { ...currentTemplates, ...newTemplates };

        fs.writeJsonSync(configPath, updatedTemplates, { spaces: 2 });
        console.log(`[Group Event] Templates updated successfully`);
        return true;
    } catch (error) {
        console.error(`[Group Event] Error updating templates:`, error);
        return false;
    }
}

export default {
    initGroupEventListener,
    groupEventHandlers,
    processGroupEvent,
    updateEventTemplates,
    GroupEventType
};