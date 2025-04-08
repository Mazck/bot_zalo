import { TextStyle, Urgency, ThreadType } from "zca-js";

/**
 * Enhanced message sending utility
 * @param {Object} api - The Zalo API instance
 * @param {string|Object} message - Message content or configuration object
 * @param {string} threadId - Thread ID (user ID or group ID)
 * @param {number} type - Thread type (default: user)
 * @returns {Promise<Object>} - Send message response
 */
export const sendMessage = async (api, message, threadId, type = ThreadType.User) => {
    try {
        // If message is a string, convert it to message object
        if (typeof message === 'string') {
            message = { msg: message };
        }

        const response = await api.sendMessage(message, threadId, type);
        return response;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
};

/**
 * Send a text message with styling
 * @param {Object} api - The Zalo API instance
 * @param {string} text - Message text
 * @param {string} threadId - Thread ID
 * @param {number} type - Thread type
 * @param {Array<Object>} styles - Text styles to apply
 * @returns {Promise<Object>} - Send message response
 */
export const sendStyledMessage = async (api, text, threadId, type = ThreadType.User, styles = []) => {
    return sendMessage(api, {
        msg: text,
        styles: styles
    }, threadId, type);
};

/**
 * Send a message with mention
 * @param {Object} api - The Zalo API instance
 * @param {string} text - Message text
 * @param {string} threadId - Thread ID
 * @param {Array<Object>} mentions - Mention objects
 * @returns {Promise<Object>} - Send message response
 */
export const sendMentionMessage = async (api, text, threadId, mentions = []) => {
    return sendMessage(api, {
        msg: text,
        mentions: mentions
    }, threadId, ThreadType.Group);
};

/**
 * Send a quoted message
 * @param {Object} api - The Zalo API instance
 * @param {string} text - Message text
 * @param {string} threadId - Thread ID
 * @param {number} type - Thread type
 * @param {Object} quote - Quote message object
 * @returns {Promise<Object>} - Send message response
 */
export const sendQuoteMessage = async (api, text, threadId, type = ThreadType.User, quote) => {
    return sendMessage(api, {
        msg: text,
        quote: quote
    }, threadId, type);
};

/**
 * Send a file or attachment
 * @param {Object} api - The Zalo API instance
 * @param {string} text - Optional message text
 * @param {string} threadId - Thread ID
 * @param {number} type - Thread type
 * @param {Array<string>} attachments - Array of file paths
 * @returns {Promise<Object>} - Send message response
 */
export const sendFileMessage = async (api, text, threadId, type = ThreadType.User, attachments = []) => {
    return sendMessage(api, {
        msg: text || "",
        attachments: attachments
    }, threadId, type);
};

/**
 * Create a styled text segment
 * @param {number} start - Start position
 * @param {number} len - Length of text
 * @param {TextStyle} style - Text style
 * @param {number} indentSize - Indent size for TextStyle.Indent
 * @returns {Object} - Style object
 */
export const createStyle = (start, len, style, indentSize = 1) => {
    const styleObj = {
        start,
        len,
        st: style
    };

    if (style === TextStyle.Indent) {
        styleObj.indentSize = indentSize;
    }

    return styleObj;
};

/**
 * Create a mention object
 * @param {number} position - Start position of mention
 * @param {string} userId - User ID to mention
 * @param {number} length - Length of mention text
 * @returns {Object} - Mention object
 */
export const createMention = (position, userId, length) => {
    return {
        pos: position,
        uid: userId,
        len: length
    };
};