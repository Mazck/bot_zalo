import { Zalo ,ThreadType, Urgency, TextStyle } from "zca-js";

//////////////////////////////////////////////////
//============== API SENDMESSAGE ==============//
//////////////////////////////////////////////////

/**
 * Class hỗ trợ xây dựng nội dung tin nhắn có cấu trúc
 */
export class MessageBuilder {
    constructor(msg = "") {
        this.payload = {
            msg,
            styles: [],
            mentions: [],
            attachments: []
        };
    }

    /**
     * Đặt nội dung tin nhắn
     * @param {string} msg
     */
    setMessage(msg) {
        if (typeof msg !== 'string') throw new Error("Message must be a string");
        this.payload.msg = msg;
        return this;
    }

    /**
     * Đặt mức độ ưu tiên
     * @param {Urgency} urgency
     */
    setUrgency(urgency) {
        if (!Object.values(Urgency).includes(urgency)) {
            throw new Error("Invalid urgency value");
        }
        this.payload.urgency = urgency;
        return this;
    }

    /**
     * Thêm định dạng văn bản
     * @param {number} start - vị trí bắt đầu
     * @param {number} len - độ dài định dạng
     * @param {TextStyle} style - kiểu định dạng
     * @param {number} [indentSize] - áp dụng nếu style là Indent
     */
    addStyle(start, len, style, indentSize) {
        if (typeof start !== 'number' || typeof len !== 'number') {
            throw new Error("Style must have numeric start and len");
        }
        if (!Object.values(TextStyle).includes(style)) {
            throw new Error("Invalid text style");
        }

        const styleObj = { start, len, st: style };
        if (style === TextStyle.Indent && indentSize) {
            if (typeof indentSize !== 'number' || indentSize < 1)
                throw new Error("indentSize must be a number >= 1");
            styleObj.indentSize = indentSize;
        }
        this.payload.styles.push(styleObj);
        return this;
    }

    /**
     * Thêm đề cập người dùng (mention)
     * @param {number} pos - vị trí bắt đầu
     * @param {number} len - độ dài chuỗi
     * @param {string} uid - ID người dùng
     */
    addMention(pos, len, uid) {
        if (!uid || typeof uid !== 'string') {
            throw new Error("Mention must include valid uid");
        }
        if (typeof pos !== 'number' || typeof len !== 'number') {
            throw new Error("Mention pos and len must be numbers");
        }
        this.payload.mentions.push({ pos, len, uid });
        return this;
    }

    /**
     * Thêm tệp đính kèm
     * @param {string} filePath
     */
    addAttachment(filePath) {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            throw new Error("Attachment path must be a non-empty string");
        }
        this.payload.attachments.push(filePath);
        return this;
    }

    /**
     * Trích dẫn một tin nhắn trước đó
     * @param {object} messageObj
     */
    setQuote(messageObj) {
        if (!messageObj || typeof messageObj !== 'object') {
            throw new Error("Quote must be a valid message object");
        }
        this.payload.quote = messageObj;
        return this;
    }

    /**
     * Đặt thời gian tồn tại (TTL)
     * @param {number} ms - Thời gian mili giây
     */
    setTTL(ms) {
        if (typeof ms !== 'number' || ms <= 0) {
            throw new Error("TTL must be a positive number");
        }
        this.payload.ttl = ms;
        return this;
    }

    /**
     * Trả về đối tượng message đã build xong
     */
    build() {
        if (!this.payload.msg && this.payload.attachments.length === 0) {
            throw new Error("Message must have either content or attachments");
        }
        return this.payload;
    }
}

/**
 * Lớp chính để gửi tin nhắn qua API
 */
export class MessageAPI {
    constructor(client) {
        if (!client || typeof client.send !== 'function') {
            throw new Error("Client must be provided with a send() method");
        }
        this.client = client;
    }

    /**
     * Tạo message builder mới
     * @param {string} [msg=""]
     * @returns {MessageBuilder}
     */
    builder(msg = "") {
        return new MessageBuilder(msg);
    }

    /**
     * Gửi tin nhắn đến một người dùng hoặc nhóm
     * @param {string|object} message - chuỗi văn bản hoặc object đầy đủ
     * @param {string} threadId - ID người hoặc nhóm
     * @param {ThreadType} [type=ThreadType.User] - loại thread
     */
    async sendMessage(message, threadId, type = ThreadType.User) {
        if (!threadId || typeof threadId !== 'string') {
            throw new Error("Thread ID is required and must be a string");
        }
        if (!Object.values(ThreadType).includes(type)) {
            throw new Error("Invalid thread type");
        }

        const payload = typeof message === 'string' ? { msg: message } : message;

        if (!payload.msg && (!payload.attachments || payload.attachments.length === 0)) {
            throw new Error("Message must contain text or at least one attachment");
        }

        const requestData = { ...payload, threadId, type };

        try {
            const response = await this.client.send(requestData);
            if (!response || typeof response !== 'object') {
                throw new Error("Invalid response from server");
            }
            return response;
        } catch (err) {
            console.error("Error sending message:", err);
            throw new Error("Failed to send message: " + err.message);
        }
    }
}

