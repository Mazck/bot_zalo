import { GroupEventType, ThreadType, TextStyle, Urgency } from "zca-js";
import moment from "moment-timezone";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs-extra";
import { defaultLogger } from "../../utils/logger.js";
import axios from "axios";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration paths
const CONFIG_DIR = path.join(__dirname, "./data/config");
const TEMPLATE_CONFIG_PATH = path.join(CONFIG_DIR, "./groupEventTemplates.json");
const MEDIA_STORAGE_PATH = path.join(__dirname, "./data/storage/media/events");
const DEFAULT_MEDIA_PATH = path.join(__dirname, "./data/assets/default");

// Default images that are included with the package
const DEFAULT_IMAGES = {
    welcome: "welcome.jpg",
    goodbye: "goodbye.jpg",
    notification: "notification.jpg"
};

// Valid media file extensions
const VALID_MEDIA_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', // Images
    '.mp4', '.mov', '.webm' // Videos
];

/**
 * Get all media files from event type folder
 * @param {string} eventType The event type name (e.g., "JOIN", "LEAVE")
 * @returns {Object} Object with arrays of media files by type (image, video, gif)
 */
async function getMediaByEventType(eventType) {
    const eventTypeLower = eventType.toLowerCase();
    const eventMediaPath = path.join(MEDIA_STORAGE_PATH, eventTypeLower);

    // Result object to store media by type
    const result = {
        image: [],
        video: [],
        gif: []
    };

    try {
        // Ensure the base directory exists
        fs.ensureDirSync(MEDIA_STORAGE_PATH);

        // Check if event type folder exists
        if (!fs.existsSync(eventMediaPath)) {
            defaultLogger.debug(`Media folder for event type ${eventType} not found`);
            return result;
        }

        // Read all files in the event type folder
        const files = fs.readdirSync(eventMediaPath);

        // Process each file and categorize by type
        for (const file of files) {
            const filePath = path.join(eventMediaPath, file);

            // Check if it's a valid file
            if (!fs.statSync(filePath).isFile()) continue;

            const ext = path.extname(filePath).toLowerCase();

            // Categorize the file based on extension
            if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                result.image.push(filePath);
            } else if (['.mp4', '.mov', '.webm'].includes(ext)) {
                result.video.push(filePath);
            } else if (['.gif'].includes(ext)) {
                result.gif.push(filePath);
            }
        }

        defaultLogger.info(`Found ${result.image.length} images, ${result.video.length} videos, and ${result.gif.length} GIFs for event type ${eventType}`);
    } catch (error) {
        defaultLogger.error(`Error retrieving media for event type ${eventType}:`, error);
    }

    return result;
}

/**
 * Load group event templates from config file, enhanced with dynamic media loading
 * @returns {Object} Event templates with media
 */
function loadEventTemplates() {
    try {
        // Ensure config directory exists
        fs.ensureDirSync(CONFIG_DIR);

        if (fs.existsSync(TEMPLATE_CONFIG_PATH)) {
            const templates = fs.readJsonSync(TEMPLATE_CONFIG_PATH);

            // For each template, enhance with media from the corresponding folder
            return templates;  // Return templates first, we'll enhance them later when needed
        } else {
            // Skip default template creation, assume external JSON will be provided
            defaultLogger.warn("Template file not found. External JSON will be needed.");
            return {}; // Return empty object instead of creating default templates
        }
    } catch (error) {
        defaultLogger.error("Error loading group event templates:", error);
        return {}; // Return empty object
    }
}

/**
 * Enhance a template with dynamic media from the corresponding event folder
 * @param {Object} template The event template to enhance
 * @param {string} eventType The event type name
 * @returns {Object} Enhanced template with media
 */
async function enhanceTemplateWithMedia(template, eventType) {
    if (!template) return null;

    try {
        // Get all media from the event type folder
        const mediaFiles = await getMediaByEventType(eventType);

        // Create a deep copy of the template to avoid modifying the original
        const enhancedTemplate = JSON.parse(JSON.stringify(template));

        // Initialize attachments object if not present
        if (!enhancedTemplate.attachments) {
            enhancedTemplate.attachments = {};
        }

        // Update image attachments if any were found
        if (mediaFiles.image.length > 0) {
            enhancedTemplate.attachments.image = mediaFiles.image;
        }

        // Update video attachments if any were found
        if (mediaFiles.video.length > 0) {
            enhancedTemplate.attachments.video = mediaFiles.video;
        }

        // Update gif attachments if any were found
        if (mediaFiles.gif.length > 0) {
            enhancedTemplate.attachments.gif = mediaFiles.gif;
        }

        return enhancedTemplate;
    } catch (error) {
        defaultLogger.error(`Error enhancing template with media for ${eventType}:`, error);
        return template; // Return the original template if enhancement fails
    }
}

/**
 * Check if media is already downloaded and available
 * @param {string} url URL of the media
 * @returns {string|null} Path to the media file if exists, null otherwise
 */
function isMediaDownloaded(url) {
    // Generate hash of URL for comparison
    const urlHash = crypto.createHash('md5').update(url).digest('hex');

    try {
        if (!fs.existsSync(MEDIA_STORAGE_PATH)) {
            return null;
        }

        const files = fs.readdirSync(MEDIA_STORAGE_PATH);
        for (const file of files) {
            if (file.includes(urlHash) && isValidMediaFile(path.join(MEDIA_STORAGE_PATH, file))) {
                return path.join(MEDIA_STORAGE_PATH, file);
            }
        }
    } catch (error) {
        defaultLogger.error(`Error checking downloaded media: ${error.message}`);
    }

    return null;
}


/**
 * Get event type name from enum value
 * @param {number} eventTypeValue The enum value
 * @returns {string} The event type name
 */
function getEventTypeName(eventTypeValue) {
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
    if (!template) return "";

    const time = moment().format("HH:mm:ss DD/MM/YYYY");

    // Get user info - improved for multiple users
    let userName = "Người dùng";
    if (data.userNames && data.userNames.length > 0) {
        userName = data.userNames.join(", ");
    } else if (data.userId) {
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
        .replace(/{{type}}/g, eventType || "UNKNOWN")
        .replace(/{{date}}/g, moment().format("DD/MM/YYYY"));
}

/**
 * Get random template from array or return single template
 * @param {string|Array} templates Template or array of templates
 * @returns {string} Selected template
 */
function getRandomTemplate(templates) {
    if (!templates) return "";

    if (Array.isArray(templates)) {
        const randomIndex = Math.floor(Math.random() * templates.length);
        return templates[randomIndex];
    }
    return templates;
}

/**
 * Generate a unique filename for downloaded media
 * @param {string} url The URL or base64 data
 * @param {string} prefix File prefix
 * @returns {string} Unique filename with extension
 */
function generateUniqueFilename(url, prefix = 'media') {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const timestamp = Date.now();
    let extension = '.jpg'; // Default extension

    // Try to extract extension from URL
    if (url.startsWith('http')) {
        const urlParts = url.split('?')[0].split('.');
        if (urlParts.length > 1) {
            const ext = urlParts[urlParts.length - 1].toLowerCase();
            if (VALID_MEDIA_EXTENSIONS.includes(`.${ext}`)) {
                extension = `.${ext}`;
            }
        }
    } else if (url.startsWith('data:')) {
        // Extract MIME type from base64 data
        const mimeMatch = url.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        if (mimeMatch) {
            const mime = mimeMatch[1].toLowerCase();
            if (mime === 'image/jpeg' || mime === 'image/jpg') extension = '.jpg';
            else if (mime === 'image/png') extension = '.png';
            else if (mime === 'image/gif') extension = '.gif';
            else if (mime === 'image/webp') extension = '.webp';
            else if (mime === 'video/mp4') extension = '.mp4';
            else if (mime === 'video/quicktime') extension = '.mov';
        }
    }

    return `${prefix}_${timestamp}_${hash}${extension}`;
}

/**
 * Check if a file exists and is a valid media file
 * @param {string} filePath Path to file
 * @returns {boolean} True if file exists and is valid
 */
function isValidMediaFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return false;
    }

    try {
        // Check if file is accessible and has content
        const stats = fs.statSync(filePath);
        if (!stats.isFile() || stats.size === 0) {
            return false;
        }

        // Check file extension
        const ext = path.extname(filePath).toLowerCase();
        return VALID_MEDIA_EXTENSIONS.includes(ext);
    } catch (error) {
        defaultLogger.error(`Error validating media file ${filePath}:`, error);
        return false;
    }
}

/**
 * Find existing downloaded file by URL hash
 * @param {string} source URL or base64 content
 * @returns {string|null} Path to existing file or null if not found
 */
function findExistingDownload(source) {
    try {
        if (!fs.existsSync(MEDIA_STORAGE_PATH)) {
            return null;
        }

        // Create a hash of the source URL/content
        const sourceHash = crypto.createHash('md5').update(source).digest('hex');
        const existingFiles = fs.readdirSync(MEDIA_STORAGE_PATH);

        // Look for file with matching hash in filename
        for (const file of existingFiles) {
            if (file.includes(sourceHash) && isValidMediaFile(path.join(MEDIA_STORAGE_PATH, file))) {
                defaultLogger.info(`Found existing media file for ${source.substring(0, 50)}...`);
                return path.join(MEDIA_STORAGE_PATH, file);
            }
        }

        return null;
    } catch (error) {
        defaultLogger.error(`Error finding existing download: ${error.message}`);
        return null;
    }
}

/**
 * Process and save media from URL, base64, or local file
 * @param {string} source URL, base64 data, or file path
 * @returns {Promise<string|null>} Path to the processed media file or null on failure
 */
async function processMedia(source) {
    if (!source) return null;

    try {
        // Ensure media storage directory exists
        fs.ensureDirSync(MEDIA_STORAGE_PATH);
        fs.ensureDirSync(DEFAULT_MEDIA_PATH);

        // Handle default media references
        if (source.startsWith('default:')) {
            const defaultType = source.split(':')[1];
            const defaultFile = DEFAULT_IMAGES[defaultType];

            if (defaultFile) {
                const defaultPath = path.join(DEFAULT_MEDIA_PATH, defaultFile);

                // Check if default file exists, if not create a placeholder
                if (!isValidMediaFile(defaultPath)) {
                    defaultLogger.warn(`Default media file not found or invalid: ${defaultPath}. Creating placeholder.`);
                    await createPlaceholderImage(defaultPath, defaultType);
                }

                return defaultPath;
            }

            defaultLogger.warn(`Default media type not recognized: ${defaultType}`);
            return null;
        }

        // Handle URLs
        if (source.startsWith('http://') || source.startsWith('https://')) {
            // First check if we already have this file downloaded
            const existingFile = isMediaDownloaded(source);
            if (existingFile) {
                defaultLogger.info(`Using previously downloaded media file for ${source.substring(0, 50)}...`);
                return existingFile;
            }

            // Generate filename based on URL
            const filename = generateUniqueFilename(source, 'downloaded');
            const filePath = path.join(MEDIA_STORAGE_PATH, filename);

            // Download if not found
            try {
                defaultLogger.info(`Downloading media from ${source.substring(0, 50)}...`);
                const response = await axios({
                    method: 'GET',
                    url: source,
                    responseType: 'stream',
                    timeout: 5000
                });

                // Only accept 200 responses
                if (response.status !== 200) {
                    throw new Error(`HTTP status ${response.status}`);
                }

                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                return new Promise((resolve, reject) => {
                    writer.on('finish', () => {
                        // Validate the downloaded file
                        if (isValidMediaFile(filePath)) {
                            defaultLogger.info(`Successfully downloaded media from ${source.substring(0, 50)}...`);
                            resolve(filePath);
                        } else {
                            fs.unlinkSync(filePath);
                            defaultLogger.warn(`Downloaded file is not valid media: ${source.substring(0, 50)}...`);
                            resolve(path.join(DEFAULT_MEDIA_PATH, DEFAULT_IMAGES.notification));
                        }
                    });
                    writer.on('error', err => {
                        defaultLogger.error(`Error writing downloaded file: ${err.message}`);
                        reject(err);
                    });
                });
            } catch (error) {
                defaultLogger.error(`Error downloading media from ${source.substring(0, 50)}...: ${error.message}`);
                return path.join(DEFAULT_MEDIA_PATH, DEFAULT_IMAGES.notification);
            }
        }
        // Handle base64 data
        else if (source.startsWith('data:')) {
            // Check for existing file first
            const existingFile = findExistingDownload(source.substring(0, 100));
            if (existingFile) {
                return existingFile;
            }

            // Generate new file if not found
            const filename = generateUniqueFilename(source, 'decoded');
            const filePath = path.join(MEDIA_STORAGE_PATH, filename);

            // Strip the data URL prefix and decode
            const base64Data = source.split(',')[1];
            if (!base64Data) {
                throw new Error("Invalid base64 data");
            }

            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

            // Validate the decoded file
            if (!isValidMediaFile(filePath)) {
                fs.unlinkSync(filePath);
                defaultLogger.warn("Decoded base64 is not valid media");
                return path.join(DEFAULT_MEDIA_PATH, DEFAULT_IMAGES.notification);
            }

            return filePath;
        }
        // Handle local file paths
        else {
            // Check if it's a valid local file
            if (isValidMediaFile(source)) {
                return source;
            }

            // Check if it's in the media folder
            const possiblePath = path.join(MEDIA_STORAGE_PATH, source);
            if (isValidMediaFile(possiblePath)) {
                return possiblePath;
            }

            defaultLogger.warn(`Local file not found or invalid: ${source}`);
            return path.join(DEFAULT_MEDIA_PATH, DEFAULT_IMAGES.notification);
        }
    } catch (error) {
        defaultLogger.error(`Error processing media: ${error.message}`);
        return null;
    }
}

/**
 * Create a placeholder image when default images are missing
 * @param {string} filePath Path to save the placeholder
 * @param {string} type Type of placeholder (welcome, goodbye, etc)
 * @returns {Promise<void>}
 */
async function createPlaceholderImage(filePath, type) {
    try {
        // Use a public placeholder image service 
        const response = await axios({
            method: 'GET',
            url: `https://via.placeholder.com/800x600/cccccc/333333?text=${type.toUpperCase()}`,
            responseType: 'stream',
            timeout: 5000
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                defaultLogger.info(`Created placeholder image for ${type}`);
                resolve();
            });
            writer.on('error', reject);
        });
    } catch (error) {
        defaultLogger.error(`Failed to create placeholder image: ${error.message}`);

        // As a last resort, create a simple colored JPEG
        try {
            // Create a very simple 200x200 colored JPEG (all blue)
            const buffer = Buffer.alloc(200 * 200 * 3);
            buffer.fill(0x33); // Fill with blue color

            fs.writeFileSync(filePath, buffer);
            defaultLogger.info(`Created basic placeholder for ${type}`);
        } catch (err) {
            defaultLogger.error(`Failed to create basic placeholder: ${err.message}`);
        }
    }
}

/**
 * Process group event and prepare message
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 * @returns {Promise<Object>} Message data
 */
/**
 * Process group event and prepare message with dynamic media loading
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 * @returns {Promise<Object>} Message data
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
    let template = templates[eventType] || templates["UNKNOWN"] || null;

    // Enhance the template with media from the event type folder
    if (template) {
        template = await enhanceTemplateWithMedia(template, eventType);
    }

    if (!template) {
        // Fallback message if no template is found
        return {
            text: `[${eventType}] Đã nhận sự kiện nhóm lúc ${moment().format("HH:mm:ss DD/MM/YYYY")}`,
            attachments: null,
            eventType: eventType,
            groupId: data.data?.groupId
        };
    }

    // Prepare event data with additional info if available
    const eventData = {
        ...data,
        userId: data.data?.creatorId,
        groupId: data.data?.groupId,
        type: eventType,
        userNames: []
    };

    // Improved user name handling for multiple users
    if (data.data && data.data.updateMembers && Array.isArray(data.data.updateMembers) && data.data.updateMembers.length > 0) {
        try {
            eventData.userNames = await Promise.all(data.data.updateMembers.map(async member => {
                if (!member.id) return member.dName || "Người dùng";

                try {
                    const userResponse = await api.getUserInfo(member.id);
                    if (userResponse?.changed_profiles?.[member.id]) {
                        return userResponse.changed_profiles[member.id].displayName ||
                            userResponse.changed_profiles[member.id].zaloName ||
                            member.dName ||
                            `Người dùng (${member.id})`;
                    }
                } catch (err) {
                    defaultLogger.debug(`Couldn't get info for user ${member.id}: ${err.message}`);
                }

                return member.dName || `Người dùng (${member.id})`;
            }));
        } catch (error) {
            defaultLogger.error("Error processing member names:", error);
            eventData.userNames = data.data.updateMembers.map(member => member.dName || `Người dùng (${member.id || ""})`);
        }
    } else if (eventData.userId && !eventData.userName && api) {
        try {
            const userResponse = await api.getUserInfo(eventData.userId);

            if (userResponse && userResponse.changed_profiles && userResponse.changed_profiles[eventData.userId]) {
                const userInfo = userResponse.changed_profiles[eventData.userId];
                eventData.userName = userInfo.displayName || userInfo.zaloName || `Người dùng (${eventData.userId})`;
                eventData.userNames = [eventData.userName];
            }
        } catch (error) {
            defaultLogger.error("Error getting user info:", error);
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
            defaultLogger.error("Error getting group info:", error);
        }
    }

    // Format message text
    const textTemplate = getRandomTemplate(template.text);
    const formattedText = formatMessage(textTemplate, eventData);

    // Prepare attachments if any
    const attachments = [];
    if (template.attachments) {
        // Process images if available
        if (template.attachments.image && template.attachments.image.length > 0) {
            const randomImage = getRandomTemplate(template.attachments.image);
            try {
                defaultLogger.info(`Processing image attachment: ${randomImage}`);
                const processedImage = await processMedia(randomImage);
                if (processedImage && isValidMediaFile(processedImage)) {
                    attachments.push(processedImage);
                }
            } catch (error) {
                defaultLogger.error("Error processing image attachment:", error);
            }
        }

        // Process videos if available
        if (template.attachments.video && template.attachments.video.length > 0) {
            const randomVideo = getRandomTemplate(template.attachments.video);
            try {
                defaultLogger.info(`Processing video attachment: ${randomVideo}`);
                const processedVideo = await processMedia(randomVideo);
                if (processedVideo && isValidMediaFile(processedVideo)) {
                    attachments.push(processedVideo);
                }
            } catch (error) {
                defaultLogger.error("Error processing video attachment:", error);
            }
        }

        // Process GIFs if available
        if (template.attachments.gif && template.attachments.gif.length > 0) {
            const randomGif = getRandomTemplate(template.attachments.gif);
            try {
                defaultLogger.info(`Processing GIF attachment: ${randomGif}`);
                const processedGif = await processMedia(randomGif);
                if (processedGif && isValidMediaFile(processedGif)) {
                    attachments.push(processedGif);
                }
            } catch (error) {
                defaultLogger.error("Error processing GIF attachment:", error);
            }
        }
    }

    return {
        text: formattedText,
        attachments: attachments.length > 0 ? attachments : null,
        eventType: eventType,
        groupId: eventData.groupId,
        mentions: [] // Will be populated later if needed
    };
}

/**
 * Create default directory structure for media organization
 */
function createMediaDirectoryStructure() {
    // Define event types to create folders for
    const eventTypes = [
        'join', 'leave', 'join_request', 'kick', 'approve',
        'decline', 'admin_update', 'nickname_update', 'avatar_update',
        'new_pin_topic', 'remind_topic', 'unknown'
    ];

    const mediaEventsPath = path.join(__dirname, "./data/media/events");

    // Ensure the base directory exists
    fs.ensureDirSync(mediaEventsPath);

    // Create a folder for each event type
    eventTypes.forEach(eventType => {
        const eventPath = path.join(mediaEventsPath, eventType);
        fs.ensureDirSync(eventPath);
        defaultLogger.debug(`Created directory for event type: ${eventType}`);
    });

    defaultLogger.info("Media directory structure created successfully");
}

/**
 * Send enhanced message with styling and attachments
 * @param {Object} api Zalo API instance
 * @param {Object} messageData Message data to send
 */
async function sendEnhancedMessage(api, messageData) {
    try {
        // Prepare message content
        const messageContent = {
            msg: messageData.text,
            // Add styling for event notifications to make them more visible
            styles: messageData.styles || [
                {
                    start: 0,
                    len: messageData.text.indexOf(':') > 0 ? messageData.text.indexOf(':') + 1 : 0,
                    st: TextStyle.Bold
                }
            ],
            // Set urgency based on message data or event type
            urgency: messageData.urgency ||
                (['JOIN', 'JOIN_REQUEST', 'REMIND_TOPIC'].includes(messageData.eventType) ?
                    Urgency.Important : Urgency.Default)
        };

        // Add mentions if available in the message data
        if (messageData.mentions && messageData.mentions.length > 0) {
            messageContent.mentions = messageData.mentions;
        }

        // Process and validate attachments
        if (messageData.attachments && messageData.attachments.length > 0) {
            const processedAttachments = [];

            for (const attachment of messageData.attachments) {
                // First check if the attachment is already a valid local file path
                if (isValidMediaFile(attachment)) {
                    processedAttachments.push(attachment);
                    continue;
                }

                // If it's a URL, try to download or find a previously downloaded copy
                if (attachment.startsWith('http')) {
                    const downloadedFile = isMediaDownloaded(attachment);
                    if (downloadedFile) {
                        // Use existing downloaded file
                        processedAttachments.push(downloadedFile);
                    } else {
                        // Download the file
                        try {
                            const mediaPath = await processMedia(attachment);
                            if (mediaPath && isValidMediaFile(mediaPath)) {
                                processedAttachments.push(mediaPath);
                            }
                        } catch (err) {
                            defaultLogger.error(`Failed to process attachment URL: ${err.message}`);
                        }
                    }
                }
            }

            if (processedAttachments.length > 0) {
                messageContent.attachments = processedAttachments;
            }
        }

        // Send the message with enhanced features
        await api.sendMessage(
            messageContent,
            messageData.groupId,
            ThreadType.Group
        );

        defaultLogger.info(`[Group Event] Sent enhanced notification for ${messageData.eventType} to group ${messageData.groupId}`);
    } catch (error) {
        defaultLogger.error("Error sending enhanced message:", error);

        // Fallback to simple message if enhanced sending fails
        try {
            await api.sendMessage(
                messageData.text,
                messageData.groupId,
                ThreadType.Group
            );
            defaultLogger.info("[Group Event] Sent fallback simple notification");
        } catch (fallbackError) {
            defaultLogger.error("Failed to send even simple message:", fallbackError);
        }
    }
}

/**
 * Initialize group event listener with integrated special event handling
 * @param {Object} api Zalo API instance
 * @param {Object} options Configuration options
 */
/**
 * Initialize event handler with media folder structure
 * @param {Object} api Zalo API instance
 * @param {Object} options Configuration options
 */
export function initGroupEventListener(api, options = {}) {
    if (!api || !api.listener) {
        defaultLogger.error("Cannot initialize group event listener: API instance is invalid");
        return;
    }

    // Ensure directories exist
    fs.ensureDirSync(CONFIG_DIR);
    fs.ensureDirSync(MEDIA_STORAGE_PATH);
    fs.ensureDirSync(DEFAULT_MEDIA_PATH);

    // Create media directory structure for event types
    createMediaDirectoryStructure();

    // Default configuration
    const config = {
        enabledEvents: Object.values(GroupEventType), // All events enabled by default
        silentEvents: [], // No silent events by default
        customHandlers: {}, // Custom event handlers
        mediaTimeout: 5000, // Timeout for media downloads (ms)
        cleanupInterval: 24, // Hours between media cleanup
        ...options
    };

    // Check if template file exists, if not create from default templates
    if (!fs.existsSync(TEMPLATE_CONFIG_PATH)) {
        try {
            // Create directory if it doesn't exist
            fs.ensureDirSync(CONFIG_DIR);

            // Create a default template file with basic templates for common events
            const defaultTemplates = {
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
                    "attachments": {}
                },
                "LEAVE": {
                    "text": [
                        "👋 {{user}} đã rời khỏi nhóm '{{group}}' lúc {{time}}.",
                        "🫡 Tạm biệt {{user}}! Hẹn gặp lại ở {{group}} nhé."
                    ],
                    "attachments": {}
                },
                "UNKNOWN": {
                    "text": ["⚠️ Đã nhận sự kiện {{type}} tại {{group}} lúc {{time}}."],
                    "attachments": {}
                }
            };

            fs.writeJsonSync(TEMPLATE_CONFIG_PATH, defaultTemplates, { spaces: 2 });
            defaultLogger.info("Created default group event templates");
        } catch (error) {
            defaultLogger.error("Error creating default templates:", error);
        }
    }

    api.listener.on("group_event", async (data) => {
        try {
            // Get event type name for logging
            let eventTypeName = data.type;
            if (typeof eventTypeName === 'number') {
                eventTypeName = getEventTypeName(eventTypeName);
            }

            defaultLogger.info(`[Group Event] Received event: ${eventTypeName} (${data.type})`);

            // Check if this event type is enabled
            if (config.enabledEvents.indexOf(data.type) === -1) {
                defaultLogger.debug(`[Group Event] Event type ${eventTypeName} is disabled, skipping`);
                return;
            }

            // Check if this is a silent event (process but don't notify)
            const isSilent = config.silentEvents.indexOf(data.type) !== -1;

            // Process the event
            const messageData = await processGroupEvent(data, api);

            if (!messageData || !messageData.groupId) {
                defaultLogger.warn("[Group Event] Invalid message data or missing group ID");
                return;
            }

            // Run custom handler if available
            if (config.customHandlers && config.customHandlers[eventTypeName]) {
                await config.customHandlers[eventTypeName](data, api, messageData);
            } else {
                // Handle special events based on type using default handlers
                await handleSpecialEvents(data, api, messageData);
            }

            // Send notification to the group if not silent
            if (messageData.text && !isSilent) {
                // Send enhanced message
                await sendEnhancedMessage(api, messageData);
            } else if (isSilent) {
                defaultLogger.debug(`[Group Event] Silent mode for ${messageData.eventType}, notification skipped`);
            }
        } catch (error) {
            defaultLogger.error("Error handling group event:", error);
        }
    });

    // Setup media cleanup task
    if (config.cleanupInterval > 0) {
        setInterval(() => {
            cleanupOldMedia(30); // Clean media files older than 30 days
        }, config.cleanupInterval * 60 * 60 * 1000);
    }

    defaultLogger.info("Group event listener initialized successfully");
}

/**
 * Handle special events that require additional processing
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 * @param {Object} messageData Message data to potentially modify
 */
async function handleSpecialEvents(data, api, messageData) {
    if (!data || !api) return;

    try {
        switch (data.type) {
            case GroupEventType.JOIN_REQUEST:
                // Could implement auto-approval logic here
                break;

            case GroupEventType.JOIN:
                await handleJoinEvent(data, api, messageData);
                break;

            case GroupEventType.NEW_PIN_TOPIC:
                // Add pin topic details to the message if available
                if (data.data && data.data.pinTopicInfo) {
                    const pinInfo = data.data.pinTopicInfo;
                    messageData.text += `\n\n📌 Chủ đề: ${pinInfo.title || "Không có tiêu đề"}`;
                    if (pinInfo.description) {
                        messageData.text += `\n📝 Mô tả: ${pinInfo.description}`;
                    }
                }
                break;

            case GroupEventType.REMIND_TOPIC:
                await handleRemindTopicEvent(data, api, messageData);
                break;

            default:
                // Default handling for other events
                break;
        }
    } catch (error) {
        defaultLogger.error(`Error in special event handler for type ${data.type}:`, error);
    }
}

/**
 * Handle join events with user mentions
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance 
 * @param {Object} messageData Message data to enhance
 */
async function handleJoinEvent(data, api, messageData) {
    if (!data.data || !data.data.groupId) return;

    try {
        // Handle multiple users joining at once
        const joinedUsers = [];

        // Check if we have updateMembers array (multiple users)
        if (data.data && data.data.updateMembers && Array.isArray(data.data.updateMembers)) {
            // Get information for all joined users
            for (const member of data.data.updateMembers) {
                if (member.id) {
                    try {
                        const userResponse = await api.getUserInfo(member.id);
                        if (userResponse && userResponse.changed_profiles && userResponse.changed_profiles[member.id]) {
                            const userInfo = userResponse.changed_profiles[member.id];
                            const userName = userInfo.displayName || userInfo.zaloName || member.dName || `Người dùng (${member.id})`;
                            joinedUsers.push({
                                id: member.id,
                                name: userName
                            });
                        } else {
                            joinedUsers.push({
                                id: member.id,
                                name: member.dName || `Người dùng (${member.id})`
                            });
                        }
                    } catch (error) {
                        defaultLogger.error(`Error fetching user info for member ${member.id}:`, error);
                        joinedUsers.push({
                            id: member.id,
                            name: member.dName || `Người dùng (${member.id})`
                        });
                    }
                }
            }
        }
        // Single user join
        else if (data.data && data.data.userId) {
            try {
                const userResponse = await api.getUserInfo(data.data.userId);
                if (userResponse && userResponse.changed_profiles && userResponse.changed_profiles[data.data.userId]) {
                    const userInfo = userResponse.changed_profiles[data.data.userId];
                    const userName = userInfo.displayName || userInfo.zaloName || userInfo.username || `Người dùng (${data.data.userId})`;
                    joinedUsers.push({
                        id: data.data.userId,
                        name: userName
                    });
                } else {
                    joinedUsers.push({
                        id: data.data.userId,
                        name: `Người dùng (${data.data.userId})`
                    });
                }
            } catch (error) {
                defaultLogger.error("Error fetching user info for join event:", error);
                joinedUsers.push({
                    id: data.data.userId,
                    name: `Người dùng (${data.data.userId})`
                });
            }
        }

        // If we have users to welcome, enhance the message with mentions
        if (joinedUsers.length > 0) {
            // Get group info
            let groupName = messageData.groupName || `nhóm (${data.data.groupId})`;

            // Load template from configuration
            const templates = loadEventTemplates();
            const joinTemplate = templates["JOIN"] || templates["UNKNOWN"] || null;

            if (!joinTemplate || !joinTemplate.text) {
                defaultLogger.warn("No JOIN template found, using default welcome message");
                return;
            }

            // Get a random template from the JOIN templates
            const textTemplate = getRandomTemplate(joinTemplate.text);

            // Create event data for formatting the message
            const eventData = {
                userNames: joinedUsers.map(user => user.name),
                userName: joinedUsers.map(user => user.name).join(", "),
                groupName: groupName,
                groupId: data.data.groupId,
                time: moment().format("HH:mm:ss DD/MM/YYYY"),
                type: "JOIN",
                user: joinedUsers.map(user => user.name).join(", "),
                group: groupName,
                date: moment().format("DD/MM/YYYY")
            };

            // Format the welcome message using the template
            const welcomeMessage = formatMessage(textTemplate, eventData);
            messageData.text = welcomeMessage;

            // Prepare mentions for all joined users
            const mentions = [];

            // Loop through each user to find their position in the formatted text
            for (const user of joinedUsers) {
                const userPos = messageData.text.indexOf(user.name);
                if (userPos >= 0) {
                    mentions.push({
                        pos: userPos,
                        len: user.name.length,
                        uid: user.id
                    });
                }
            }

            // Update the messageData with mentions
            messageData.mentions = mentions;

            // Update styles for welcome message
            messageData.styles = [
                { start: 0, len: messageData.text.length, st: TextStyle.Bold }
            ];

            defaultLogger.info(`[Group Event] Enhanced welcome message with mentions for ${joinedUsers.length} users`);
        }
    } catch (error) {
        console.error("Error in handleJoinEvent:", error);
    }
}

/**
 * Handle reminder topic events
 * @param {Object} data Event data
 * @param {Object} api Zalo API instance
 * @param {Object} messageData Message data to enhance
 */
async function handleRemindTopicEvent(data, api, messageData) {
    if (!data.data || !data.data.reminderInfo) return;

    try {
        const reminderInfo = data.data.reminderInfo;
        const reminderTitle = reminderInfo.title || 'Chủ đề quan trọng';
        const reminderDesc = reminderInfo.description || 'Hãy kiểm tra thông tin mới';

        // Create enhanced reminder message
        messageData.text = `⏰ Nhắc nhở: ${reminderTitle}\n\n${reminderDesc}`;

        // If we have group name, add it
        if (messageData.groupName) {
            messageData.text += `\n\n📣 Nhóm: ${messageData.groupName}`;
        }

        // Add styling for the reminder
        messageData.styles = [
            { start: 0, len: 10 + reminderTitle.length, st: TextStyle.Bold },
            { start: 0, len: 1, st: TextStyle.Big }
        ];

        // Set urgency to important for reminders
        messageData.urgency = Urgency.Important;

        console.log(`[Group Event] Enhanced reminder message for topic in group ${data.data.groupId}`);
    } catch (error) {
        console.error("Error in handleRemindTopicEvent:", error);
    }
}

/**
 * Update group event templates
 * @param {Object} newTemplates Templates to update
 * @returns {boolean} Success status
 */
export function updateEventTemplates(newTemplates) {
    try {
        const currentTemplates = loadEventTemplates();
        const updatedTemplates = { ...currentTemplates, ...newTemplates };

        fs.writeJsonSync(TEMPLATE_CONFIG_PATH, updatedTemplates, { spaces: 2 });
        console.log(`[Group Event] Templates updated successfully`);
        return true;
    } catch (error) {
        console.error(`[Group Event] Error updating templates:`, error);
        return false;
    }
}

/**
 * Clean up old media files to prevent storage issues
 * @param {number} days Number of days to keep files
 */
function cleanupOldMedia(days = 30) {
    try {
        if (!fs.existsSync(MEDIA_STORAGE_PATH)) return;

        const files = fs.readdirSync(MEDIA_STORAGE_PATH);
        const now = Date.now();
        const maxAge = days * 24 * 60 * 60 * 1000; // Convert days to milliseconds

        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(MEDIA_STORAGE_PATH, file);

            try {
                const stats = fs.statSync(filePath);
                const fileAge = now - stats.mtimeMs;

                if (fileAge > maxAge) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (err) {
                defaultLogger.error(`Error deleting old media file ${file}: ${err.message}`);
            }
        }

        if (deletedCount > 0) {
            defaultLogger.info(`Cleaned up ${deletedCount} old media files`);
        }
    } catch (error) {
        defaultLogger.error(`Error cleaning up old media: ${error.message}`);
    }
}