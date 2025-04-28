import { GroupEventType, ThreadType, TextStyle, Urgency } from "zca-js";
import { defaultLogger } from "../../utils/logger.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default class GroupEventsHandler {
    constructor(api, database) {
        this.GroupEventType = GroupEventType;
        this.ThreadType = ThreadType;
        this.TextStyle = TextStyle;
        this.Urgency = Urgency;
        this.logger = defaultLogger;
        this.api = api;
        this.database = database;

        // Initialize AI model once and cache it
        this.genAI = new GoogleGenerativeAI("AIzaSyAjH04YX99VH0-ZI75qf8TYcV4STvLSZg4");
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Cache for predictions to avoid redundant API calls
        this.genderCache = new Map();
        this.responseCache = new Map();

        // Define event handlers with method references to avoid rebinding
        this.eventHandlers = this.initializeEventHandlers();
    }

    initializeEventHandlers() {
        const handlers = {};
        // Map all event types to their handlers
        for (const eventType in GroupEventType) {
            const handler = `handle${this.formatEventName(eventType)}`;
            if (typeof this[handler] === 'function') {
                handlers[GroupEventType[eventType]] = this[handler].bind(this);
            }
        }
        // Add fallback handler
        handlers[GroupEventType.UNKNOWN] = this.handleUnknown.bind(this);
        return handlers;
    }

    formatEventName(eventType) {
        return eventType.toLowerCase().split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
    }

    initialize() {
        this.logger.info('GroupEventsHandler: Initializing...');
        this.registerEventListener();
        return this;
    }

    registerEventListener() {
        this.api.listener.on("group_event", this.handleGroupEvent.bind(this));
        this.logger.info('GroupEventsHandler: Event listener registered');
    }

    async predictGender(name) {
        // Return from cache if available
        if (this.genderCache.has(name)) {
            return this.genderCache.get(name);
        }

        try {
            const genderPrompt = `Dựa vào tên tiếng Việt "${name}", hãy đoán xem người này là nam, nữ, hay không rõ. Chỉ trả lời một từ: "nam", "nữ", hoặc "không rõ".`;
            const genderResult = await this.model.generateContent(genderPrompt);
            const gender = genderResult.response.text().toLowerCase().trim();

            // Cache the result
            this.genderCache.set(name, gender);
            return gender;
        } catch (error) {
            this.logger.error('Error predicting gender:', error);
            return 'không rõ'; // Fallback
        }
    }

    async generateAIResponse(prompt, cacheKey = null) {
        // Return from cache if available and a cache key is provided
        if (cacheKey && this.responseCache.has(cacheKey)) {
            return this.responseCache.get(cacheKey);
        }

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            // Cache the result if a cache key is provided
            if (cacheKey) {
                this.responseCache.set(cacheKey, response);
            }

            return response;
        } catch (error) {
            this.logger.error('Error generating AI response:', error);
            return null; // Return null to allow fallback handling by caller
        }
    }

    async generateCaption(name, groupName) {
        try {
            const gender = await this.predictGender(name);

            const genderTerm = gender === 'nữ' ? 'một chị gái dễ thương' :
                gender === 'nam' ? 'một anh trai cool ngầu' :
                    'một người bạn mới';

            const prompt = `Hãy đóng vai một người siêu hài hước, thân thiện và đầy năng lượng.
Viết một câu chào mừng sáng tạo, vui vẻ và độc đáo để chào đón ${genderTerm} tên ${name} vừa vào nhóm ${groupName}.
Câu chào có thể:
- Gây cười hoặc dễ thương
- Dùng một chút tiếng lóng, biểu tượng cảm xúc, hoặc chơi chữ
- Mang lại cảm giác ấm áp, gần gũi, như gia đình.
Không cần giải thích, chỉ trả về đúng 1 câu.`;

            const caption = await this.generateAIResponse(prompt);
            return caption || `🎉 Xin chào @${name}, chào mừng đến với nhóm ${groupName}!`; // Fallback
        } catch (error) {
            this.logger.error('Error generating caption:', error);
            return `🎉 Xin chào @${name}, chào mừng đến với nhóm ${groupName}!`; // Fallback
        }
    }

    async generateLeaveMessage(name, groupName) {
        try {
            const gender = await this.predictGender(name);
            const genderPronoun = gender === 'nữ' ? 'chị ấy' :
                gender === 'nam' ? 'anh ấy' : 'bạn ấy';

            const prompt = `Hãy đóng vai một người thân thiện và chân thành.
Viết một câu ngắn, chân thành và tiếc nuối khi ${name} vừa rời khỏi nhóm ${groupName}.
Câu nói có thể:
- Bày tỏ sự tiếc nuối nhẹ nhàng
- Chúc ${genderPronoun} may mắn
- Có thể dùng emoji phù hợp
Không cần giải thích, chỉ trả về đúng 1 câu ngắn gọn.`;

            const message = await this.generateAIResponse(prompt);
            return message || `👋 Tạm biệt ${name}, chúc ${genderPronoun} gặp nhiều may mắn nhé!`;
        } catch (error) {
            this.logger.error('Error generating leave message:', error);
            return `👋 Tạm biệt ${name}, hẹn gặp lại bạn!`;
        }
    }

    async generateRemoveMemberMessage(removedName, adminName, groupName) {
        try {
            const removedGender = await this.predictGender(removedName);
            const removedPronoun = removedGender === 'nữ' ? 'chị' :
                removedGender === 'nam' ? 'anh' : 'bạn';

            const prompt = `Hãy viết một thông báo ngắn, lịch sự để thông báo ${removedName} đã bị quản trị viên ${adminName} xóa khỏi nhóm ${groupName}.
Câu thông báo nên:
- Lịch sự, không mang tính chỉ trích
- Mang tính thông báo khách quan
- Có thể dùng emoji phù hợp
Không cần giải thích, chỉ trả về đúng 1 câu ngắn gọn.`;

            const message = await this.generateAIResponse(prompt);
            return message || `⚠️ ${removedPronoun} ${removedName} đã bị xóa khỏi nhóm bởi quản trị viên ${adminName}.`;
        } catch (error) {
            this.logger.error('Error generating remove member message:', error);
            return `⚠️ ${removedName} đã bị xóa khỏi nhóm.`;
        }
    }

    async generateBlockMemberMessage(blockedName, adminName, groupName) {
        try {
            const blockedGender = await this.predictGender(blockedName);
            const blockedPronoun = blockedGender === 'nữ' ? 'chị' :
                blockedGender === 'nam' ? 'anh' : 'bạn';

            const prompt = `Hãy viết một thông báo ngắn, rõ ràng để thông báo ${blockedName} đã bị quản trị viên ${adminName} chặn khỏi nhóm ${groupName}.
Câu thông báo nên:
- Rõ ràng, chính thức
- Mang tính thông báo
- Có thể dùng emoji cảnh báo phù hợp
Không cần giải thích, chỉ trả về đúng 1 câu ngắn gọn.`;

            const message = await this.generateAIResponse(prompt);
            return message || `🚫 ${blockedPronoun} ${blockedName} đã bị chặn khỏi nhóm bởi quản trị viên ${adminName}.`;
        } catch (error) {
            this.logger.error('Error generating block member message:', error);
            return `🚫 ${blockedName} đã bị chặn khỏi nhóm.`;
        }
    }

    async generateNewAdminMessage(name, groupName) {
        try {
            const gender = await this.predictGender(name);
            const genderPronoun = gender === 'nữ' ? 'chị' :
                gender === 'nam' ? 'anh' : 'bạn';

            const prompt = `Hãy viết một thông báo vui vẻ, trang trọng để chúc mừng ${name} vừa trở thành quản trị viên mới của nhóm ${groupName}.
Câu thông báo nên:
- Vui vẻ, chúc mừng
- Khích lệ tinh thần trách nhiệm
- Sử dụng emoji phù hợp
Không cần giải thích, chỉ trả về đúng 1 câu ngắn gọn.`;

            const message = await this.generateAIResponse(prompt);
            return message || `🌟 Chúc mừng ${genderPronoun} ${name} đã trở thành quản trị viên mới của nhóm!`;
        } catch (error) {
            this.logger.error('Error generating new admin message:', error);
            return `🌟 Chúc mừng ${name} đã trở thành quản trị viên mới!`;
        }
    }

    async generateRemoveAdminMessage(name, groupName) {
        try {
            const gender = await this.predictGender(name);
            const genderPronoun = gender === 'nữ' ? 'chị' :
                gender === 'nam' ? 'anh' : 'bạn';

            const prompt = `Hãy viết một thông báo nhẹ nhàng, lịch sự để thông báo ${name} không còn là quản trị viên của nhóm ${groupName}.
Câu thông báo nên:
- Lịch sự, tôn trọng
- Mang tính thông báo
- Có thể cảm ơn vì đóng góp trước đây
- Sử dụng emoji phù hợp nếu cần
Không cần giải thích, chỉ trả về đúng 1 câu ngắn gọn.`;

            const message = await this.generateAIResponse(prompt);
            return message || `📢 ${genderPronoun} ${name} không còn là quản trị viên của nhóm. Cảm ơn vì những đóng góp trước đây!`;
        } catch (error) {
            this.logger.error('Error generating remove admin message:', error);
            return `📢 ${name} không còn là quản trị viên của nhóm.`;
        }
    }

    async generateGroupUpdateMessage(updateType, groupName, updatedBy, details = {}) {
        try {
            let prompt;

            switch (updateType) {
                case 'avatar':
                    prompt = `Viết một thông báo ngắn, vui vẻ về việc nhóm ${groupName} vừa được ${updatedBy} cập nhật ảnh đại diện mới.
                    Sử dụng emoji phù hợp và giọng điệu thân thiện. Chỉ trả về đúng 1 câu ngắn gọn.`;
                    break;
                case 'name':
                    prompt = `Viết một thông báo ngắn, thân thiện về việc nhóm đã được ${updatedBy} đổi tên từ "${details.oldName}" thành "${groupName}".
                    Sử dụng emoji phù hợp và giọng điệu vui vẻ. Chỉ trả về đúng 1 câu ngắn gọn.`;
                    break;
                case 'description':
                    prompt = `Viết một thông báo ngắn, thân thiện về việc ${updatedBy} vừa cập nhật mô tả mới cho nhóm ${groupName}.
                    Sử dụng emoji phù hợp và nhắc người dùng có thể xem mô tả mới. Chỉ trả về đúng 1 câu ngắn gọn.`;
                    break;
                default:
                    prompt = `Viết một thông báo ngắn, thân thiện về việc nhóm ${groupName} vừa được ${updatedBy} cập nhật.
                    Sử dụng emoji phù hợp và giọng điệu vui vẻ. Chỉ trả về đúng 1 câu ngắn gọn.`;
            }

            const message = await this.generateAIResponse(prompt);

            // Fallback messages for different update types
            const fallbacks = {
                'avatar': `🖼️ Nhóm ${groupName} có ảnh đại diện mới được cập nhật bởi ${updatedBy}!`,
                'name': `✨ Nhóm đã được đổi tên từ "${details.oldName}" thành "${groupName}" bởi ${updatedBy}!`,
                'description': `📝 ${updatedBy} vừa cập nhật mô tả mới cho nhóm ${groupName}. Hãy kiểm tra nhé!`,
                'default': `📢 Nhóm ${groupName} vừa được cập nhật bởi ${updatedBy}!`
            };

            return message || fallbacks[updateType] || fallbacks.default;
        } catch (error) {
            this.logger.error('Error generating group update message:', error);
            return `📢 Nhóm ${groupName} vừa được cập nhật!`;
        }
    }

    async generateNewPinTopicMessage(topicName, pinnedBy, groupName) {
        try {
            const prompt = `Viết một thông báo ngắn, thu hút sự chú ý về việc ${pinnedBy} vừa ghim chủ đề "${topicName}" trong nhóm ${groupName}.
            Sử dụng emoji phù hợp, khuyến khích thành viên xem chủ đề mới. Chỉ trả về đúng 1 câu ngắn gọn.`;

            const message = await this.generateAIResponse(prompt);
            return message || `📌 ${pinnedBy} vừa ghim chủ đề "${topicName}"! Hãy kiểm tra ngay!`;
        } catch (error) {
            this.logger.error('Error generating new pin topic message:', error);
            return `📌 Chủ đề "${topicName}" vừa được ghim!`;
        }
    }

    handleGroupEvent(data) {
        this.logger.debug(`GroupEventsHandler: Received group event of type: ${data.type}`);
        console.log(data.data.updateMembers)
        const handler = this.eventHandlers[data.type] || this.eventHandlers[this.GroupEventType.UNKNOWN];

        try {
            handler(data);
        } catch (error) {
            this.logger.error(`GroupEventsHandler: Error handling event type ${data.type}`, error);
        }
    }

    // Individual event handlers
    handleJoinRequest(data) {
        this.logger.info(`GroupEventsHandler: JOIN_REQUEST event from user ${data.user?.id} to group ${data.group?.id}`);
        // Xử lý yêu cầu tham gia nhóm
    }

    async handleJoin(data) {
        const groupInfo = await this.database.getOrCreateGroup(data.threadId);
        this.logger.info(`GroupEventsHandler: JOIN event - User ${data.user?.id} joined group ${data.group?.id}`);
        const members = data.data.updateMembers; // Danh sách người mới vào

        // Process members in parallel for faster execution
        const welcomePromises = members.map(async (member) => {
            const name = member.dName;
            const uid = member.id;

            try {
                let caption = await this.generateCaption(name, groupInfo.dataValues.name);

                // Tìm vị trí tên để tag
                let mentionPos = caption.indexOf(name);
                if (mentionPos === -1) {
                    // Nếu AI không chèn tên → fallback
                    const fallbackName = `@${name}`;
                    caption = `🎉 Xin chào ${fallbackName}, chào mừng đến với nhóm ${groupInfo.dataValues.name}!`;
                    mentionPos = caption.indexOf(fallbackName);
                }

                // Create mention object
                const mention = {
                    pos: mentionPos,
                    uid: uid,
                    len: name.length + (caption[mentionPos - 1] === '@' ? 1 : 0)
                };

                // Return message config
                return {
                    msg: caption,
                    mentions: [mention],
                    threadId: data.threadId,
                    type: data.type
                };
            } catch (error) {
                this.logger.error(`Error generating welcome for ${name}:`, error);
                return null;
            }
        });

        // Wait for all promises to complete
        const messageConfigs = (await Promise.all(welcomePromises)).filter(Boolean);

        // Send messages sequentially to avoid rate limits
        for (const config of messageConfigs) {
            try {
                await this.api.sendMessage(
                    { msg: config.msg, mentions: config.mentions },
                    config.threadId,
                    config.type
                );
                // Small delay between messages to prevent flooding
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                this.logger.error('Error sending welcome message:', error);
            }
        }
    }

    async handleLeave(data) {
        this.logger.info(`GroupEventsHandler: LEAVE event - User ${data.user?.id} left group ${data.group?.id}`);


    }

    async handleRemoveMember(data) {
        this.logger.info(`GroupEventsHandler: REMOVE_MEMBER event - User ${data.user?.id} was removed from group ${data.group?.id}`);


    }

    async handleBlockMember(data) {
        this.logger.info(`GroupEventsHandler: BLOCK_MEMBER event - User ${data.user?.id} was blocked from group ${data.group?.id}`);


    }

    handleUpdateSetting(data) {
        this.logger.info(`GroupEventsHandler: UPDATE_SETTING event for group ${data.group?.id}`);
        // Xử lý sự kiện cài đặt nhóm được cập nhật
    }

    async handleUpdate(data) {
        this.logger.info(`GroupEventsHandler: UPDATE event for group ${data.group?.id}`);


    }

    handleNewLink(data) {
        this.logger.info(`GroupEventsHandler: NEW_LINK event for group ${data.group?.id}`);
        // Xử lý sự kiện link nhóm mới được khởi tạo
    }

    async handleAddAdmin(data) {
        this.logger.info(`GroupEventsHandler: ADD_ADMIN event - User ${data.user?.id} became admin in group ${data.group?.id}`);


    }

    async handleRemoveAdmin(data) {
        this.logger.info(`GroupEventsHandler: REMOVE_ADMIN event - User ${data.user?.id} lost admin status in group ${data.group?.id}`);


    }

    async handleNewPinTopic(data) {
        this.logger.info(`GroupEventsHandler: NEW_PIN_TOPIC event in group ${data.group?.id}`);


    }

    handleUpdatePinTopic(data) {
        this.logger.info(`GroupEventsHandler: UPDATE_PIN_TOPIC event in group ${data.group?.id}`);
        // Xử lý sự kiện cập nhật topic đã ghim
    }

    handleReorderPinTopic(data) {
        this.logger.info(`GroupEventsHandler: REORDER_PIN_TOPIC event in group ${data.group?.id}`);
        // Xử lý sự kiện sắp xếp lại các topic đã ghim
    }

    handleUpdateBoard(data) {
        this.logger.info(`GroupEventsHandler: UPDATE_BOARD event in group ${data.group?.id}`);
        // Xử lý sự kiện cập nhật bảng
    }

    handleRemoveBoard(data) {
        this.logger.info(`GroupEventsHandler: REMOVE_BOARD event in group ${data.group?.id}`);
        // Xử lý sự kiện xóa bảng
    }

    handleUpdateTopic(data) {
        this.logger.info(`GroupEventsHandler: UPDATE_TOPIC event in group ${data.group?.id}`);
        // Xử lý sự kiện cập nhật topic
    }

    handleUnpinTopic(data) {
        this.logger.info(`GroupEventsHandler: UNPIN_TOPIC event in group ${data.group?.id}`);
        // Xử lý sự kiện bỏ ghim topic
    }

    handleRemoveTopic(data) {
        this.logger.info(`GroupEventsHandler: REMOVE_TOPIC event in group ${data.group?.id}`);
        // Xử lý sự kiện xóa topic
    }

    handleAcceptRemind(data) {
        this.logger.info(`GroupEventsHandler: ACCEPT_REMIND event in group ${data.group?.id}`);
        // Xử lý sự kiện chấp nhận nhắc nhở
    }

    handleRejectRemind(data) {
        this.logger.info(`GroupEventsHandler: REJECT_REMIND event in group ${data.group?.id}`);
        // Xử lý sự kiện từ chối nhắc nhở
    }

    handleRemindTopic(data) {
        this.logger.info(`GroupEventsHandler: REMIND_TOPIC event in group ${data.group?.id}`);
        // Xử lý sự kiện nhắc nhở topic
    }

    handleUnknown(data) {
        this.logger.warn(`GroupEventsHandler: UNKNOWN event type received in group ${data.group?.id}`);
        // Xử lý các sự kiện chưa được định nghĩa
    }

    start() {
        this.logger.info('GroupEventsHandler: API listener started');
        return this;
    }

    stop() {
        this.logger.info('GroupEventsHandler: API listener stopped');
        return this;
    }
}