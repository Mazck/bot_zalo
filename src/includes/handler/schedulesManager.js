import schedule from 'node-schedule';
import moment from 'moment-timezone';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs-extra';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { defaultLogger } from '../../utils/logger.js';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = defaultLogger;

class SchedulesManager {
    constructor(api, config) {
        this.api = api;
        this.config = config;
        this.scheduledJobs = new Map();
        this.schedulesPath = join(__dirname, "../db/database/schedules.json");
        this.mediaDir = join(__dirname, "../db/database/media");
        this.downloadDir = join(this.mediaDir, "downloads");
        this.apiResponseCache = new Map();
        this.ensureDirectories();
    }

    /**
     * Ensure necessary directories exist
     */
    ensureDirectories() {
        fs.ensureDirSync(dirname(this.schedulesPath));
        fs.ensureDirSync(this.mediaDir);
        fs.ensureDirSync(this.downloadDir);
        fs.ensureDirSync(join(this.mediaDir, "images"));
        fs.ensureDirSync(join(this.mediaDir, "videos"));
        fs.ensureDirSync(join(this.mediaDir, "audio"));
        fs.ensureDirSync(join(this.mediaDir, "documents"));
        fs.ensureDirSync(join(this.mediaDir, "api_responses"));
    }

    /**
     * Initialize the schedules manager
     */
    async init() {
        try {
            // Create schedules file if it doesn't exist
            if (!fs.existsSync(this.schedulesPath)) {
                fs.writeFileSync(this.schedulesPath, JSON.stringify({
                    jobs: [],
                    metadata: {
                        version: "1.0.0",
                        lastUpdated: new Date().toISOString(),
                        stats: {
                            totalExecutions: 0,
                            lastExecution: null
                        }
                    }
                }, null, 2), 'utf-8');
                logger.info('🗓️ Tạo file schedules.json mới');
                return;
            }

            // Read schedules from JSON file
            const schedulesData = JSON.parse(fs.readFileSync(this.schedulesPath, 'utf-8'));

            // Initialize jobs array if not present
            if (!schedulesData.jobs || !Array.isArray(schedulesData.jobs)) {
                schedulesData.jobs = [];
                schedulesData.metadata = {
                    version: "1.0.0",
                    lastUpdated: new Date().toISOString(),
                    stats: {
                        totalExecutions: 0,
                        lastExecution: null
                    }
                };
                fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');
                logger.info('🗓️ Khởi tạo mảng jobs mới trong file schedules.json');
                return;
            }

            if (schedulesData.jobs.length === 0) {
                logger.info('🗓️ Không có công việc được lên lịch');
                return;
            }

            logger.info(`🗓️ Đang khởi tạo ${schedulesData.jobs.length} công việc theo lịch...`);

            // Create a job for each schedule
            for (const job of schedulesData.jobs) {
                await this.setupJob(job);
            }

            logger.info('🗓️ Đã hoàn tất việc khởi tạo các công việc theo lịch');

            // Clean up old temporary files
            this.cleanupTempFiles();
        } catch (error) {
            logger.error('❌ Lỗi khi khởi tạo các công việc theo lịch:', error);
        }
    }

    /**
     * Clean up temporary files older than a certain period
     */
    cleanupTempFiles() {
        try {
            const MAX_AGE = 1 * 60 * 60 * 1000; // 6 hours in milliseconds
            const now = Date.now();

            const files = fs.readdirSync(this.downloadDir);
            let removedCount = 0;

            for (const file of files) {
                const filePath = join(this.downloadDir, file);
                const stats = fs.statSync(filePath);

                if (now - stats.mtime.getTime() > MAX_AGE) {
                    fs.unlinkSync(filePath);
                    removedCount++;
                }
            }

            if (removedCount > 0) {
                logger.info(`🧹 Đã xóa ${removedCount} tệp tạm thời cũ`);
            }
        } catch (error) {
            logger.error('❌ Lỗi khi dọn dẹp tệp tạm thời:', error);
        }
    }

    /**
 * Vô hiệu hóa công việc sau khi thực thi (cho các công việc một lần)
 * @param {string} jobName Tên công việc
 */
    async disableJobAfterExecution(jobName) {
        try {
            // Đọc file schedules
            const schedulesPath = join(__dirname, '../db/database/schedules.json');
            const schedulesData = JSON.parse(fs.readFileSync(schedulesPath, 'utf-8'));

            // Tìm và cập nhật công việc
            const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

            if (jobIndex !== -1) {
                // Vô hiệu hóa công việc
                schedulesData.jobs[jobIndex].enabled = false;
                schedulesData.jobs[jobIndex].oneTime = false;

                // Hủy lịch công việc
                if (this.scheduledJobs.has(jobName)) {
                    const scheduledJob = this.scheduledJobs.get(jobName);
                    scheduledJob.cancel();
                    this.scheduledJobs.delete(jobName);
                }

                // Cập nhật metadata
                if (!schedulesData.metadata) {
                    schedulesData.metadata = {};
                }
                schedulesData.metadata.lastDisabledJob = {
                    name: jobName,
                    timestamp: new Date().toISOString()
                };

                // Lưu lại file
                fs.writeFileSync(schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

                logger.info(`🚫 Đã vô hiệu hóa công việc một lần: ${jobName}`);
            }
        } catch (error) {
            logger.error(`❌ Lỗi khi vô hiệu hóa công việc: ${error.message}`, error);
        }
    }

    /**
 * Convert human-readable time format to cron expression
 * @param {string} humanTime Human-readable time specification
 * @returns {string|null} Cron expression or null if invalid
 */
    convertHumanTimeFormatToCron(humanTime) {
        if (!humanTime) return null;

        // Common time patterns
        const timePatterns = {
            // Daily patterns
            'daily at ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,
            'every day at ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,
            'mỗi ngày lúc ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,
            'hàng ngày lúc ([0-9]{1,2}):([0-9]{1,2})': (hours, minutes) => `0 ${minutes} ${hours} * * *`,

            // Weekly patterns
            'every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at ([0-9]{1,2}):([0-9]{1,2})': (day, hours, minutes) => {
                const days = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
                return `0 ${minutes} ${hours} * * ${days[day.toLowerCase()]}`;
            },
            'mỗi thứ ([2-7]|chủ nhật) lúc ([0-9]{1,2}):([0-9]{1,2})': (day, hours, minutes) => {
                const days = { '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, 'chủ nhật': 0 };
                return `0 ${minutes} ${hours} * * ${days[day.toLowerCase()]}`;
            },

            // Monthly patterns
            'every ([0-9]{1,2})(st|nd|rd|th) of( the)? month at ([0-9]{1,2}):([0-9]{1,2})': (day, _, __, hours, minutes) =>
                `0 ${minutes} ${hours} ${day} * *`,
            'mỗi ngày ([0-9]{1,2}) hàng tháng lúc ([0-9]{1,2}):([0-9]{1,2})': (day, hours, minutes) =>
                `0 ${minutes} ${hours} ${day} * *`,

            // Interval patterns
            'every ([0-9]+) (minute|minutes|hour|hours|day|days)': (interval, unit) => {
                if (unit === 'minute' || unit === 'minutes') {
                    return `*/${interval} * * * *`;
                } else if (unit === 'hour' || unit === 'hours') {
                    return `0 0 */${interval} * * *`;
                } else if (unit === 'day' || unit === 'days') {
                    return `0 0 0 */${interval} * *`;
                }
                return null;
            },
            'mỗi ([0-9]+) (phút|giờ|ngày)': (interval, unit) => {
                if (unit === 'phút') {
                    return `*/${interval} * * * *`;
                } else if (unit === 'giờ') {
                    return `0 0 */${interval} * * *`;
                } else if (unit === 'ngày') {
                    return `0 0 0 */${interval} * *`;
                }
                return null;
            },

            // Extended patterns
            'at ([0-9]{1,2}):([0-9]{1,2}) (am|pm)': (hours, minutes, period) => {
                let hour = parseInt(hours);
                if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
                if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
                return `0 ${minutes} ${hour} * * *`;
            },
            'lúc ([0-9]{1,2}):([0-9]{1,2}) (sáng|chiều|tối)': (hours, minutes, period) => {
                let hour = parseInt(hours);
                if ((period === 'chiều' || period === 'tối') && hour < 12) hour += 12;
                if (period === 'sáng' && hour === 12) hour = 0;
                return `0 ${minutes} ${hour} * * *`;
            }
        };

        // Try each pattern
        for (const [pattern, formatter] of Object.entries(timePatterns)) {
            const regex = new RegExp(pattern, 'i');
            const match = humanTime.match(regex);

            if (match) {
                // Remove the full match from the array, leaving only the captured groups
                const groups = match.slice(1);
                return formatter(...groups);
            }
        }

        // If no pattern matches, check if it's already a valid cron expression
        const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;

        if (cronRegex.test(humanTime)) {
            return humanTime;
        }

        return null;
    }

    /**
     * Update execution statistics for a job
     * @param {string} jobName Name of the job
     */
    async updateJobExecutionStats(jobName) {
        try {
            const schedulesData = JSON.parse(fs.readFileSync(this.schedulesPath, 'utf-8'));

            const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);
            if (jobIndex !== -1) {
                // Initialize stats object if it doesn't exist
                if (!schedulesData.jobs[jobIndex].stats) {
                    schedulesData.jobs[jobIndex].stats = {
                        executionCount: 0,
                        lastExecuted: null,
                        createdAt: schedulesData.jobs[jobIndex].createdAt || new Date().toISOString()
                    };
                }

                // Update execution stats
                schedulesData.jobs[jobIndex].stats.executionCount++;
                schedulesData.jobs[jobIndex].stats.lastExecuted = new Date().toISOString();

                // Update global stats
                if (!schedulesData.metadata) {
                    schedulesData.metadata = {
                        version: "1.0.0",
                        lastUpdated: new Date().toISOString(),
                        stats: {
                            totalExecutions: 0,
                            lastExecution: null
                        }
                    };
                }

                schedulesData.metadata.stats.totalExecutions++;
                schedulesData.metadata.stats.lastExecution = new Date().toISOString();
                schedulesData.metadata.lastUpdated = new Date().toISOString();

                // Save updated schedules
                fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');
            }
        } catch (error) {
            logger.error(`❌ Lỗi khi cập nhật thống kê thực thi cho "${jobName}":`, error);
        }
    }

    /**
     * Set up an individual scheduled job
     * @param {Object} job Job configuration object
     * @param {boolean} isUpdate Whether this is an update to an existing job
     */
    async setupJob(job, isUpdate = false) {
        if (!job.enabled) {
            logger.info(`🗓️ Công việc "${job.name}" đang bị tắt, bỏ qua`);
            return;
        }

        // Validate required fields
        if (!job.cronExpression || !job.threadId || !job.name) {
            logger.warn(`⚠️ Công việc "${job.name || 'không tên'}" thiếu thông tin cần thiết, bỏ qua`);
            return;
        }

        try {
            // If this is an update, cancel the existing job first
            if (isUpdate && this.scheduledJobs.has(job.name)) {
                const existingJob = this.scheduledJobs.get(job.name);
                existingJob.cancel();
                logger.info(`🔄 Đã hủy công việc hiện tại "${job.name}" để cập nhật`);
            }

            // Handle human-readable time format conversion to cron
            let cronExpression = job.cronExpression;

            // Handle special time formats
            if (job.timeFormat === 'human') {
                cronExpression = this.convertHumanTimeFormatToCron(job.humanTime);
                if (!cronExpression) {
                    logger.error(`❌ Định dạng thời gian không hợp lệ cho "${job.name}": ${job.humanTime}`);
                    return;
                }
            }

            // Schedule the job using node-schedule
            const scheduledJob = schedule.scheduleJob(job.name, cronExpression, async () => {
                try {
                    logger.info(`🔔 Đang thực thi công việc theo lịch: "${job.name}"`);

                    // Determine message type (Group or User)
                    const messageType = job.isGroup ? 1 : 0;

                    // Prepare message content
                    let messageContent = {};

                    // Add text content if available
                    if (job.text) {
                        messageContent.msg = job.text;

                        // Process dynamic content in text if needed
                        if (job.useDynamicContent) {
                            messageContent.msg = this.processDynamicContent(messageContent.msg);
                        }
                    }

                    // Add text styling if specified
                    if (job.styles && Array.isArray(job.styles)) {
                        messageContent.styles = job.styles;
                    }

                    // Add urgency if specified
                    if (job.urgency) {
                        messageContent.urgency = job.urgency;
                    }

                    // Add mentions if specified (for group messages)
                    if (job.mentions && Array.isArray(job.mentions) && job.isGroup) {
                        messageContent.mentions = job.mentions;
                    }

                    // Add attachments for media files
                    const attachments = await this.prepareJobAttachments(job);

                    // Add attachments to message content if any
                    if (attachments.length > 0) {
                        messageContent.attachments = attachments;
                    }

                    // Send the message
                    if (Object.keys(messageContent).length > 0) {
                        // If it's just a simple text message with no other properties, send as string
                        if (Object.keys(messageContent).length === 1 && messageContent.msg && !job.useRichText) {
                            await this.api.sendMessage(messageContent.msg, job.threadId, messageType);
                        } else {
                            // Otherwise send as a rich message object
                            await this.api.sendMessage(messageContent, job.threadId, messageType);
                        }
                        logger.info(`✅ Đã gửi tin nhắn theo lịch cho "${job.name}"`);

                        // Update job execution stats
                        await this.updateJobExecutionStats(job.name);
                    } else {
                        logger.warn(`⚠️ Công việc "${job.name}" không có nội dung tin nhắn để gửi`);
                    }

                    // Execute custom function if provided
                    if (job.customFunction && typeof job.customFunction === 'string') {
                        await this.executeJobCustomFunction(job);
                    }

                    // Handle one-time jobs
                    if (job.oneTime) {
                        await this.disableJobAfterExecution(job.name);
                    }
                } catch (jobError) {
                    console.log(jobError)
                    logger.error(`❌ Lỗi khi thực thi công việc "${job.name}":`, jobError);
                    throw jobError;
                }
            });

            // Store the job in our map for later management
            this.scheduledJobs.set(job.name, scheduledJob);

            // Calculate and display next execution time
            const nextExecution = scheduledJob.nextInvocation();
            const timeUntilNext = moment(nextExecution).fromNow();

            logger.info(`✅ Đã lên lịch công việc "${job.name}" (${cronExpression})`);
            logger.info(`   └─ Lần chạy tiếp theo: ${nextExecution.toLocaleString()} (${timeUntilNext})`);
        } catch (scheduleError) {
            logger.error(`❌ Không thể lên lịch công việc "${job.name}":`, scheduleError);
        }
    }

    /**
     * Process dynamic content in job message text with API data support
     * @param {string} text Original message text
     * @param {Object} apiData Optional API data to include in message
     * @returns {string} Processed text with dynamic content
     */
    processDynamicContent(text, apiData = null) {
        // Replace dynamic variables
        let processedText = text
            .replace(/{date}/g, moment().format('DD/MM/YYYY'))
            .replace(/{time}/g, moment().format('HH:mm:ss'))
            .replace(/{datetime}/g, moment().format('DD/MM/YYYY HH:mm:ss'))
            .replace(/{day}/g, moment().format('dddd'))
            .replace(/{dayOfWeek}/g, moment().format('dddd'))
            .replace(/{dayOfMonth}/g, moment().format('D'))
            .replace(/{month}/g, moment().format('MM'))
            .replace(/{monthName}/g, moment().format('MMMM'))
            .replace(/{year}/g, moment().format('YYYY'))
            .replace(/{hour}/g, moment().format('HH'))
            .replace(/{minute}/g, moment().format('mm'))
            .replace(/{second}/g, moment().format('ss'))
            .replace(/{timestamp}/g, Date.now().toString())
            .replace(/{random(\d+)-(\d+)}/g, (match, min, max) => {
                return Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min);
            })
            .replace(/{uuid}/g, () => uuidv4());

        // If API data is provided, replace API data placeholders
        if (apiData) {
            // Handle nested properties using dot notation: {api.weather.temp}
            processedText = processedText.replace(/{api\.([^}]+)}/g, (match, path) => {
                try {
                    const value = path.split('.').reduce((obj, key) => obj && obj[key] !== undefined ? obj[key] : undefined, apiData);
                    return value !== undefined ? value : match;
                } catch (error) {
                    logger.error(`❌ Lỗi khi truy cập dữ liệu API: ${error.message}`);
                    return match;
                }
            });
        }

        return processedText;
    }
    /**
   * Download a file from URL and save it locally
   * @param {string} url URL of the file to download
   * @returns {Promise<string>} Path to the downloaded file
   */
    /**
 * Downloads a file from a URL with advanced features:
 * - Auto-detects file extension based on content-type
 * - Generates unique filenames using hash
 * - Handles redirects
 * - Has timeout protection
 * - Provides detailed logging
 * 
 * @param {string} url - The URL to download
 * @param {string} downloadDir - Directory to save the file (defaults to current directory)
 * @returns {Promise<string>} - Path to the downloaded file
 */
    async downloadFile(url, downloadDir = './downloads') {
        try {
            // Ensure download directory exists
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            // Generate a unique filename based on URL and timestamp
            const fileHash = crypto.createHash('md5').update(url + Date.now()).digest('hex');

            // Determine file extension from URL or default to .bin
            let fileExt = extname(new URL(url).pathname);
            if (!fileExt) {
                // Try to determine from content-type
                const headResponse = await axios.head(url);
                const contentType = headResponse.headers['content-type'];
                if (contentType) {
                    if (contentType.includes('image/jpeg')) fileExt = '.jpg';
                    else if (contentType.includes('image/png')) fileExt = '.png';
                    else if (contentType.includes('image/gif')) fileExt = '.gif';
                    else if (contentType.includes('video/mp4')) fileExt = '.mp4';
                    else if (contentType.includes('audio/mpeg')) fileExt = '.mp3';
                    else if (contentType.includes('application/pdf')) fileExt = '.pdf';
                    else fileExt = '.bin';
                } else {
                    fileExt = '.bin';
                }
            }

            const filename = `${fileHash}${fileExt}`;
            const filePath = join(downloadDir, filename);

            logger.info(`📥 Đang tải xuống tệp từ ${url}`);

            // Setup download with both axios and node's https as fallback
            try {
                // First try with axios for better timeout handling and redirect management
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                    timeout: 30000 // 30 seconds timeout
                });

                // Save the file
                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                return new Promise((resolve, reject) => {
                    writer.on('finish', () => {
                        logger.info(`✅ Đã tải xuống tệp thành công: ${filePath}`);
                        resolve(filePath);
                    });
                    writer.on('error', (error) => {
                        logger.error(`❌ Lỗi khi lưu tệp: ${error.message}`);
                        reject(error);
                    });
                });
            } catch (axiosError) {
                // If axios fails, try with Node.js native https as backup
                logger.info(`Axios failed, trying with native https: ${axiosError.message}`);

                return new Promise((resolve, reject) => {
                    const file = fs.createWriteStream(filePath);

                    https.get(url, (response) => {
                        // Handle redirects
                        if (response.statusCode === 301 || response.statusCode === 302) {
                            file.close();
                            fs.unlinkSync(filePath);
                            logger.info(`Redirecting to: ${response.headers.location}`);

                            // Recursive call with new URL
                            this.downloadFile(response.headers.location, downloadDir)
                                .then(resolve)
                                .catch(reject);
                            return;
                        }

                        // Check for successful response
                        if (response.statusCode !== 200) {
                            file.close();
                            fs.unlinkSync(filePath);
                            return reject(new Error(`Failed to download: ${response.statusCode}`));
                        }

                        // Pipe the response to the file
                        response.pipe(file);

                        file.on('finish', () => {
                            file.close();
                            logger.info(`✅ Đã tải xuống tệp thành công: ${filePath}`);
                            resolve(filePath);
                        });
                    }).on('error', (err) => {
                        // Clean up file if there's an error
                        fs.unlink(filePath, () => { });
                        logger.error(`❌ Lỗi khi tải xuống: ${err.message}`);
                        reject(err);
                    });
                });
            }
        } catch (error) {
            logger.error(`❌ Lỗi khi tải xuống tệp từ ${url}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Prepare attachments for a scheduled job
     * @param {Object} job Job configuration
     * @returns {Array} Array of attachment paths
     */
    async prepareJobAttachments(job) {
        const attachments = [];

        // Process image path or URL
        if (job.imagePath) {
            try {
                if (this.isValidUrl(job.imagePath)) {
                    // Download the image from URL
                    const downloadedPath = await this.downloadFile(job.imagePath);
                    attachments.push(downloadedPath);
                } else {
                    // Use local file path
                    const fullImagePath = job.imagePath.startsWith('/')
                        ? job.imagePath
                        : join(__dirname, '../db/database/media/images', job.imagePath);

                    if (fs.existsSync(fullImagePath)) {
                        attachments.push(fullImagePath);
                    } else {
                        logger.error(`❌ Không tìm thấy file ảnh: ${fullImagePath}`);
                    }
                }
            } catch (error) {
                logger.error(`❌ Lỗi khi xử lý ảnh: ${error.message}`);
            }
        }

        // Process video path or URL
        if (job.videoPath) {
            try {
                if (this.isValidUrl(job.videoPath)) {
                    // Download the video from URL
                    const downloadedPath = await this.downloadFile(job.videoPath);
                    attachments.push(downloadedPath);
                } else {
                    // Use local file path
                    const fullVideoPath = job.videoPath.startsWith('/')
                        ? job.videoPath
                        : join(__dirname, '../db/database/media/videos', job.videoPath);

                    if (fs.existsSync(fullVideoPath)) {
                        attachments.push(fullVideoPath);
                    } else {
                        logger.error(`❌ Không tìm thấy file video: ${fullVideoPath}`);
                    }
                }
            } catch (error) {
                logger.error(`❌ Lỗi khi xử lý video: ${error.message}`);
            }
        }

        // Process audio path or URL
        if (job.audioPath) {
            try {
                if (this.isValidUrl(job.audioPath)) {
                    // Download the audio from URL
                    const downloadedPath = await this.downloadFile(job.audioPath);
                    attachments.push(downloadedPath);
                } else {
                    // Use local file path
                    const fullAudioPath = job.audioPath.startsWith('/')
                        ? job.audioPath
                        : join(__dirname, '../db/database/media/audio', job.audioPath);

                    if (fs.existsSync(fullAudioPath)) {
                        attachments.push(fullAudioPath);
                    } else {
                        logger.error(`❌ Không tìm thấy file audio: ${fullAudioPath}`);
                    }
                }
            } catch (error) {
                logger.error(`❌ Lỗi khi xử lý audio: ${error.message}`);
            }
        }

        // Add any additional attachments specified in the job
        if (job.attachments && Array.isArray(job.attachments)) {
            for (const attachment of job.attachments) {
                try {
                    if (this.isValidUrl(attachment)) {
                        // Download the attachment from URL
                        const downloadedPath = await this.downloadFile(attachment);
                        attachments.push(downloadedPath);
                    } else {
                        // Use local file path
                        const fullPath = attachment.startsWith('/')
                            ? attachment
                            : join(__dirname, '../', attachment);

                        if (fs.existsSync(fullPath)) {
                            attachments.push(fullPath);
                        } else {
                            logger.error(`❌ Không tìm thấy file đính kèm: ${fullPath}`);
                        }
                    }
                } catch (error) {
                    logger.error(`❌ Lỗi khi xử lý tệp đính kèm: ${error.message}`);
                }
            }
        }

        return attachments;
    }

    /**
     * Check if a string is a valid URL
     * @param {string} string String to check
     * @returns {boolean} Whether the string is a valid URL
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Call an API and get the response
     * @param {Object} apiConfig API configuration
     * @returns {Promise<Object>} API response data
     */
    async callApi(apiConfig, job = {}) {
        try {
            const cacheKey = JSON.stringify(apiConfig);
            const cached = this.apiResponseCache.get(cacheKey);

            // if (cached && Date.now() - cached.timestamp < (apiConfig.cacheTTL || 300000)) {
            //     logger.info(`🔄 Sử dụng cache cho ${apiConfig.url}`);
            //     return cached.data;
            // }

            logger.info(`🌐 Gọi API: ${apiConfig.url}`);

            const config = {
                method: apiConfig.method || 'GET',
                url: apiConfig.url,
                timeout: apiConfig.timeout || 10000,
                headers: apiConfig.headers || {
                    'Content-Type': 'application/json'
                }
            };

            if (['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())) {
                config.data = apiConfig.data;
            }
            if (apiConfig.params) config.params = apiConfig.params;

            const response = await axios(config);
            let result = response.data;

            if (apiConfig.responsePath) {
                result = apiConfig.responsePath.split('.').reduce((obj, key) => obj?.[key], result);
                if (result === undefined) throw new Error(`Không tìm thấy đường dẫn: ${apiConfig.responsePath}`);
            }

            if (apiConfig.transform && typeof apiConfig.transform === 'function') {
                result = apiConfig.transform(result);
            }

            this.apiResponseCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            if (apiConfig.saveResponse && job.name) {
                const timestamp = Date.now();
                const filename = `${job.name}_${timestamp}.json`;
                const filePath = join(this.mediaDir, 'api_responses', filename);
                fs.writeFileSync(filePath, JSON.stringify({
                    job: job.name,
                    timestamp: new Date().toISOString(),
                    response: result
                }, null, 2));
                logger.info(`💾 Đã lưu phản hồi API: ${filePath}`);
            }

            return result;
        } catch (err) {
            logger.error(`❌ Lỗi API (${apiConfig.url}): ${err.message}`);
            if (apiConfig.fallback) {
                logger.warn(`⚠️ Dùng fallback cho API ${apiConfig.url}`);
                return apiConfig.fallback;
            }
            throw err;
        }
    }

    /**
     * Execute a scheduled job with API support
     * @param {Object} job Job configuration
     */
    async executeJob(job) {
        try {
            logger.info(`🔔 Đang thực thi công việc theo lịch: "${job.name}"`);

            // Call API if configured
            let apiData = null;
            if (job.api && job.api.url) {
                try {
                    apiData = await this.callApi(job.api);
                } catch (apiError) {
                    logger.error(`❌ Lỗi khi gọi API cho công việc "${job.name}": ${apiError.message}`);

                    // If API call is required but failed, and no fallback, abort
                    if (job.api.required && !job.api.fallback) {
                        logger.error(`❌ Bỏ qua thực thi công việc "${job.name}" do API bắt buộc không thành công`);
                        return;
                    }
                }
            }

            // Determine message type (Group or User)
            const messageType = job.isGroup ? 1 : 0;

            // Prepare message content
            let messageContent = {};

            // Add text content if available
            if (job.text) {
                messageContent.msg = job.text;

                // Process dynamic content in text with API data if needed
                if (job.useDynamicContent) {
                    messageContent.msg = this.processDynamicContent(messageContent.msg, apiData);
                }
            }

            // If there's a template and API data, use it to generate content
            if (job.template && apiData) {
                messageContent.msg = this.processTemplate(job.template, apiData);
            }

            // Add text styling if specified
            if (job.styles && Array.isArray(job.styles)) {
                messageContent.styles = job.styles;
            }

            // Add urgency if specified
            if (job.urgency) {
                messageContent.urgency = job.urgency;
            }

            // Add mentions if specified (for group messages)
            if (job.mentions && Array.isArray(job.mentions) && job.isGroup) {
                messageContent.mentions = job.mentions;
            }

            // Add attachments for media files
            const attachments = await this.prepareJobAttachments(job);

            // If API returned image/video URLs, download and add them
            if (apiData && job.api.mediaPath) {
                try {
                    const mediaUrl = job.api.mediaPath.split('.').reduce((obj, key) => obj && obj[key] !== undefined ? obj[key] : undefined, apiData);

                    if (mediaUrl && typeof mediaUrl === 'string' && this.isValidUrl(mediaUrl)) {
                        const downloadedPath = await this.downloadFile(mediaUrl);
                        attachments.push(downloadedPath);
                        logger.info(`✅ Đã tải xuống media từ API: ${mediaUrl}`);
                    }
                } catch (mediaError) {
                    logger.error(`❌ Lỗi khi tải xuống media từ API: ${mediaError.message}`);
                }
            }

            // Add attachments to message content if any
            if (attachments.length > 0) {
                messageContent.attachments = attachments;
            }

            // Send the message
            if (Object.keys(messageContent).length > 0) {
                // If it's just a simple text message with no other properties, send as string
                if (Object.keys(messageContent).length === 1 && messageContent.msg && !job.useRichText) {
                    await this.api.sendMessage(messageContent.msg, job.threadId, messageType);
                } else {
                    // Otherwise send as a rich message object
                    await this.api.sendMessage(messageContent, job.threadId, messageType);
                }
                logger.info(`✅ Đã gửi tin nhắn theo lịch cho "${job.name}"`);

                // Update job execution stats
                await this.updateJobExecutionStats(job.name);
            } else {
                logger.warn(`⚠️ Công việc "${job.name}" không có nội dung tin nhắn để gửi`);
            }

            // Execute custom function if provided
            if (job.customFunction && typeof job.customFunction === 'string') {
                await this.executeJobCustomFunction(job, apiData);
            }

            // Handle one-time jobs
            if (job.oneTime) {
                await this.disableJobAfterExecution(job.name);
            }
        } catch (jobError) {
            console.log(jobError)
            logger.error(`❌ Lỗi khi thực thi công việc "${job.name}":`, jobError);
            throw jobError;
        }
    }

    /**
 * Xử lý template với dữ liệu động
 * @param {string} template Mẫu văn bản
 * @param {Object} data Dữ liệu để thay thế
 * @returns {string} Văn bản đã được xử lý
 */
    processTemplate(template, data = {}) {
        if (!template) return '';

        return template.replace(/\{([^}]+)\}/g, (match, path) => {
            try {
                const value = path
                    .replace(/\[(\d+)\]/g, '.$1')
                    .split('.')
                    .reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), {
                        ...data,
                        date: moment().format('DD/MM/YYYY'),
                        time: moment().format('HH:mm:ss'),
                        datetime: moment().format('DD/MM/YYYY HH:mm:ss'),
                        timestamp: Date.now()
                    });
                return value !== undefined ? value : match;
            } catch (err) {
                logger.warn(`⚠️ Lỗi xử lý template: ${err.message}`);
                return match;
            }
        });
    }

    /**
     * Set up an individual scheduled job
     * @param {Object} job Job configuration object
     * @param {boolean} isUpdate Whether this is an update to an existing job
     */
    async setupJob(job, isUpdate = false) {
        if (!job.enabled) {
            logger.info(`🗓️ Công việc "${job.name}" đang bị tắt, bỏ qua`);
            return;
        }

        // Validate required fields
        if (!job.cronExpression || !job.threadId || !job.name) {
            logger.warn(`⚠️ Công việc "${job.name || 'không tên'}" thiếu thông tin cần thiết, bỏ qua`);
            return;
        }

        try {
            // If this is an update, cancel the existing job first
            if (isUpdate && this.scheduledJobs.has(job.name)) {
                const existingJob = this.scheduledJobs.get(job.name);
                existingJob.cancel();
                logger.info(`🔄 Đã hủy công việc hiện tại "${job.name}" để cập nhật`);
            }

            // Handle human-readable time format conversion to cron
            let cronExpression = job.cronExpression;

            // Handle special time formats
            if (job.timeFormat === 'human') {
                cronExpression = this.convertHumanTimeFormatToCron(job.humanTime);
                if (!cronExpression) {
                    logger.error(`❌ Định dạng thời gian không hợp lệ cho "${job.name}": ${job.humanTime}`);
                    return;
                }
            }

            // Schedule the job using node-schedule
            const scheduledJob = schedule.scheduleJob(job.name, cronExpression, async () => {
                await this.executeJob(job);
            });

            // Store the job in our map for later management
            this.scheduledJobs.set(job.name, scheduledJob);

            // Calculate and display next execution time
            const nextExecution = scheduledJob.nextInvocation();
            const timeUntilNext = moment(nextExecution).fromNow();

            logger.info(`✅ Đã lên lịch công việc "${job.name}" (${cronExpression})`);
            logger.info(`   └─ Lần chạy tiếp theo: ${nextExecution.toLocaleString()} (${timeUntilNext})`);
        } catch (scheduleError) {
            logger.error(`❌ Không thể lên lịch công việc "${job.name}":`, scheduleError);
        }
    }

    /**
 * Thực thi hàm tùy chỉnh cho công việc
 * @param {Object} job Cấu hình công việc
 */
    async executeJobCustomFunction(job) {
        try {
            // Kiểm tra và thực thi hàm tùy chỉnh
            if (job.customFunction) {
                let customFunc;

                // Nếu là chuỗi, tìm hàm trong global hoặc module
                if (typeof job.customFunction === 'string') {
                    // Thử tìm trong global
                    customFunc = global[job.customFunction];

                    // Nếu không tìm thấy, thử import động
                    if (!customFunc) {
                        try {
                            const module = await import(job.customFunction);
                            customFunc = module.default || module;
                        } catch (importError) {
                            logger.warn(`⚠️ Không thể import hàm: ${job.customFunction}`);
                            return;
                        }
                    }
                }
                // Nếu là hàm trực tiếp
                else if (typeof job.customFunction === 'function') {
                    customFunc = job.customFunction;
                }

                // Thực thi hàm nếu tìm thấy
                if (typeof customFunc === 'function') {
                    logger.info(`🚀 Đang thực thi hàm tùy chỉnh: ${job.name}`);
                    await customFunc(job, this.api);
                } else {
                    logger.warn(`⚠️ Không tìm thấy hàm tùy chỉnh cho công việc: ${job.name}`);
                }
            }
        } catch (error) {
            logger.error(`❌ Lỗi khi thực thi hàm tùy chỉnh: ${error.message}`, error);
        }
    }

    /**
     * Send weather update using real weather API if available
     * @param {Object} job Job configuration
     * @param {Object} apiData API data if available
     */
    async sendWeatherUpdate(job, apiData = null) {
        try {
            let weatherData;

            // Use API data if available, otherwise try to fetch weather data
            if (apiData) {
                weatherData = apiData;
            } else if (job.weatherLocation) {
                // Try to fetch real weather data if API key is configured
                if (this.config.weatherApiKey) {
                    try {
                        const location = job.weatherLocation || 'Hà Nội';
                        const apiConfig = {
                            url: `https://api.openweathermap.org/data/2.5/weather`,
                            params: {
                                q: location,
                                appid: this.config.weatherApiKey,
                                units: 'metric',
                                lang: 'vi'
                            },
                            cacheTTL: 1800000 // 30 minutes
                        };

                        weatherData = await this.callApi(apiConfig);
                    } catch (apiError) {
                        logger.error(`❌ Không thể lấy dữ liệu thời tiết từ API: ${apiError.message}`);
                        // Fall back to mock data
                        weatherData = this.generateMockWeatherData(job.weatherLocation || 'Hà Nội');
                    }
                } else {
                    // Use mock data if no API key
                    weatherData = this.generateMockWeatherData(job.weatherLocation || 'Hà Nội');
                }
            } else {
                // Use mock data if no location specified
                weatherData = this.generateMockWeatherData('Hà Nội');
            }

            // Format the weather message
            let message;

            if (weatherData.main && weatherData.weather) {
                // Format real API data
                message =
                    `🌤️ Dự báo thời tiết - ${weatherData.name} - ${moment().format('DD/MM/YYYY')}\n\n` +
                    `- Nhiệt độ: ${Math.round(weatherData.main.temp)}°C\n` +
                    `- Cảm giác như: ${Math.round(weatherData.main.feels_like)}°C\n` +
                    `- Điều kiện: ${weatherData.weather[0].description}\n` +
                    `- Độ ẩm: ${weatherData.main.humidity}%\n` +
                    `- Gió: ${Math.round(weatherData.wind.speed * 3.6)} km/h\n` + // Convert m/s to km/h
                    `- Áp suất: ${weatherData.main.pressure} hPa`;
            } else {
                // Format mock data
                message =
                    `🌤️ Dự báo thời tiết - ${weatherData.location} - ${moment().format('DD/MM/YYYY')}\n\n` +
                    `- Nhiệt độ: ${weatherData.temperature}°C\n` +
                    `- Điều kiện: ${weatherData.condition}\n` +
                    `- Độ ẩm: ${weatherData.humidity}%\n` +
                    `- Gió: ${weatherData.wind} km/h\n` +
                    `- Chỉ số UV: ${weatherData.uv}`;
            }

            await this.api.sendMessage(message, job.threadId, job.isGroup ? 1 : 0);
        } catch (error) {
            logger.error(`❌ Lỗi khi gửi cập nhật thời tiết:`, error);
        }
    }

    /**
     * Generate mock weather data for testing
     * @param {string} location Location name
     * @returns {Object} Mock weather data
     */
    generateMockWeatherData(location) {
        return {
            location: location,
            temperature: Math.floor(Math.random() * 10) + 25, // Random temperature between 25-35°C
            condition: ['Nắng', 'Mây', 'Mưa nhẹ', 'Mưa rào', 'Nắng và mây'][Math.floor(Math.random() * 5)],
            humidity: Math.floor(Math.random() * 30) + 50, // Random humidity between 50-80%
            wind: Math.floor(Math.random() * 10) + 5, // Random wind speed between 5-15 km/h
            uv: Math.floor(Math.random() * 10) + 1 // Random UV index between 1-10
        };
    }

    parseSpecialArgs(inputArray) {
        const joined = inputArray.join(' ');
        const regex = /\"(.*?)\"|(\S+)/g;
        const matches = [];
        let match;

        while ((match = regex.exec(joined)) !== null) {
            matches.push(match[1] || match[2]);
        }
        return matches;
    }


    /**
     * Add a new scheduled job with API support
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {Array} args Command arguments
     */
    async addJob(api, threadId, type, schedulesData, args) {
        if (args.length < 3) {
            await api.sendMessage(
                "❌ Thiếu thông tin. Sử dụng: add [tên] [lịch] [tin nhắn]",
                threadId,
                type
            );
            return;
        }
        const a = this.parseSpecialArgs(args)
        const jobName = a[0];
        const timeSpec = a[1];
        const message = a.slice(2).join(' ');

        // Check if job name is already in use
        if (schedulesData.jobs.some(job => job.name === jobName)) {
            await api.sendMessage(`❌ Tên công việc "${jobName}" đã tồn tại.`, threadId, type);
            return;
        }

        // Convert human time to cron if needed
        let cronExpression = this.convertHumanTimeFormatToCron(timeSpec);
        let timeFormat = 'cron';
        let humanTime = null;

        if (!cronExpression) {
            // If not a valid human time format or cron expression
            await api.sendMessage(
                "❌ Định dạng thời gian không hợp lệ. Vui lòng sử dụng định dạng thời gian con người hoặc cron.",
                threadId,
                type
            );
            return;
        }

        // If converted from human time, store the original format
        if (cronExpression !== timeSpec) {
            timeFormat = 'human';
            humanTime = timeSpec;
        } else {
            cronExpression = timeSpec;
        }

        // Create new job
        const newJob = {
            name: jobName,
            enabled: true,
            cronExpression: cronExpression,
            timeFormat: timeFormat,
            humanTime: humanTime,
            threadId: threadId,
            isGroup: type === 1,
            text: message,
            useDynamicContent: message.includes('{') && message.includes('}'),
            createdAt: new Date().toISOString(),
            stats: {
                executionCount: 0,
                lastExecuted: null,
                createdAt: new Date().toISOString()
            }
        };

        // Add to schedules data
        schedulesData.jobs.push(newJob);

        // Save updated schedules
        fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Setup the job
        await this.setupJob(newJob);

        await api.sendMessage(
            `✅ Đã tạo công việc mới "${jobName}" thành công.\n` +
            `- Lịch: ${humanTime || cronExpression}\n` +
            `- Lần chạy đầu tiên: ${moment(this.scheduledJobs.get(jobName).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')}`,
            threadId,
            type
        );
    }

    /**
     * Update an existing job with API support
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {Array} args Command arguments
     */
    async updateJob(api, threadId, type, schedulesData, args) {
        if (args.length < 3) {
            await api.sendMessage(
                "❌ Thiếu thông tin. Sử dụng: update [tên] [thông số] [giá trị]",
                threadId,
                type
            );
            return;
        }

        const jobName = args[0];
        const parameter = args[1].toLowerCase();
        const value = args.slice(2).join(' ');
        console.log(args)
        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        const job = schedulesData.jobs[jobIndex];
        let needsReschedule = false;
        let isMediaUrl = false;

        switch (parameter) {
            case 'time':
            case 'schedule':
            case 'cron':
            case 'lịch':
                // Convert human time to cron if needed
                let cronExpression = this.convertHumanTimeFormatToCron(value);

                if (!cronExpression) {
                    await api.sendMessage(
                        "❌ Định dạng thời gian không hợp lệ. Vui lòng sử dụng định dạng thời gian con người hoặc cron.",
                        threadId,
                        type
                    );
                    return;
                }

                // If converted from human time, store the original format
                if (cronExpression !== value) {
                    job.timeFormat = 'human';
                    job.humanTime = value;
                } else {
                    job.timeFormat = 'cron';
                    job.humanTime = null;
                }

                job.cronExpression = cronExpression;
                needsReschedule = true;
                break;

            case 'text':
            case 'message':
            case 'tin nhắn':
            case 'nội dung':
                job.text = value;
                // Check if the message contains dynamic content placeholders
                job.useDynamicContent = value.includes('{') && value.includes('}');
                break;

            case 'onetime':
            case 'single':
            case 'một lần':
                job.oneTime = value.toLowerCase() === 'true' || value === '1';
                break;

            case 'dynamic':
            case 'động':
                job.useDynamicContent = value.toLowerCase() === 'true' || value === '1';
                break;

            case 'function':
            case 'hàm':
                job.customFunction = value;
                break;

            case 'name':
            case 'tên':
                // Check if new name is already in use
                if (schedulesData.jobs.some(j => j.name === value && j.name !== jobName)) {
                    await api.sendMessage(`❌ Tên công việc "${value}" đã tồn tại.`, threadId, type);
                    return;
                }

                // Update name in scheduledJobs map
                if (this.scheduledJobs.has(jobName)) {
                    const scheduledJob = this.scheduledJobs.get(jobName);
                    this.scheduledJobs.delete(jobName);
                    this.scheduledJobs.set(value, scheduledJob);
                }

                job.name = value;
                break;

            case 'imagepath':
            case 'image':
            case 'ảnh':
                // Check if value is a URL
                if (this.isValidUrl(value)) {
                    await api.sendMessage(`⏳ Đang tải xuống ảnh từ URL...`, threadId, type);
                    try {
                        // Download the image from URL
                        const downloadedPath = await this.downloadFile(value);
                        job.imagePath = downloadedPath;
                        isMediaUrl = true;
                    } catch (error) {
                        await api.sendMessage(`❌ Lỗi khi tải xuống ảnh: ${error.message}`, threadId, type);
                        return;
                    }
                } else {
                    job.imagePath = value;
                }
                break;

            case 'videopath':
            case 'video':
                // Check if value is a URL
                if (this.isValidUrl(value)) {
                    await api.sendMessage(`⏳ Đang tải xuống video từ URL...`, threadId, type);
                    try {
                        // Download the video from URL
                        const downloadedPath = await this.downloadFile(value);
                        job.videoPath = downloadedPath;
                        isMediaUrl = true;
                    } catch (error) {
                        await api.sendMessage(`❌ Lỗi khi tải xuống video: ${error.message}`, threadId, type);
                        return;
                    }
                } else {
                    job.videoPath = value;
                }
                break;

            case 'audiopath':
            case 'audio':
            case 'âm thanh':
                // Check if value is a URL
                if (this.isValidUrl(value)) {
                    await api.sendMessage(`⏳ Đang tải xuống âm thanh từ URL...`, threadId, type);
                    try {
                        // Download the audio from URL
                        const downloadedPath = await this.downloadFile(value);
                        job.audioPath = downloadedPath;
                        isMediaUrl = true;
                    } catch (error) {
                        await api.sendMessage(`❌ Lỗi khi tải xuống âm thanh: ${error.message}`, threadId, type);
                        return;
                    }
                } else {
                    job.audioPath = value;
                }
                break;

            case 'attachments':
            case 'attachment':
            case 'đính kèm':
                // Check if value is a URL
                if (this.isValidUrl(value)) {
                    await api.sendMessage(`⏳ Đang tải xuống tệp đính kèm từ URL...`, threadId, type);
                    try {
                        // Download the attachment from URL
                        const downloadedPath = await this.downloadFile(value);

                        // Initialize attachments array if it doesn't exist
                        if (!job.attachments) job.attachments = [];

                        // Add the downloaded file to attachments
                        job.attachments.push(downloadedPath);
                        isMediaUrl = true;
                    } catch (error) {
                        await api.sendMessage(`❌ Lỗi khi tải xuống tệp đính kèm: ${error.message}`, threadId, type);
                        return;
                    }
                } else {
                    // Initialize attachments array if it doesn't exist
                    if (!job.attachments) job.attachments = [];

                    // Add the file path to attachments
                    job.attachments.push(value);
                }
                break;

            case 'richtext':
            case 'rich':
                job.useRichText = value.toLowerCase() === 'true' || value === '1';
                break;

            case 'urgency':
            case 'urgent':
                job.urgency = value.toLowerCase() === 'true' || value === '1' ? 1 : 0;
                break;

            case 'api':
            case 'apiurl':
                // Initialize API config if it doesn't exist
                if (!job.api) job.api = {};
                job.api.url = value;
                break;

            case 'apimethod':
                if (!job.api) job.api = {};
                job.api.method = value.toUpperCase();
                break;

            case 'apiheaders':
                try {
                    if (!job.api) job.api = {};
                    job.api.headers = JSON.parse(value);
                } catch (error) {
                    await api.sendMessage(`❌ Lỗi: Headers phải là JSON hợp lệ`, threadId, type);
                    return;
                }
                break;

            case 'apidata':
            case 'apibody':
                try {
                    if (!job.api) job.api = {};
                    job.api.data = JSON.parse(value);
                } catch (error) {
                    await api.sendMessage(`❌ Lỗi: Body phải là JSON hợp lệ`, threadId, type);
                    return;
                }
                break;

            case 'apiparams':
                try {
                    if (!job.api) job.api = {};
                    job.api.params = JSON.parse(value);
                } catch (error) {
                    await api.sendMessage(`❌ Lỗi: Params phải là JSON hợp lệ`, threadId, type);
                    return;
                }
                break;

            case 'apirequired':
                if (!job.api) job.api = {};
                job.api.required = value.toLowerCase() === 'true' || value === '1';
                break;

            case 'apiresponsepath':
                if (!job.api) job.api = {};
                job.api.responsePath = value;
                break;

            case 'apimediapath':
                if (!job.api) job.api = {};
                job.api.mediaPath = value;
                break;

            case 'apicachettl':
                if (!job.api) job.api = {};
                job.api.cacheTTL = parseInt(value) * 1000; // Convert seconds to milliseconds
                break;

            case 'template':
                job.template = value;
                break;

            default:
                await api.sendMessage(
                    "❌ Thông số không hợp lệ. Các thông số hợp lệ: time, text, onetime, dynamic, function, name, " +
                    "imagePath, videoPath, audioPath, attachments, richText, urgency, " +
                    "api, apiUrl, apiMethod, apiHeaders, apiData, apiParams, apiRequired, apiResponsePath, apiMediaPath, apiCacheTTL, template",
                    threadId,
                    type
                );
                return;
        }

        // Save updated schedules
        fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Reschedule if needed and job is enabled
        if (needsReschedule && job.enabled) {
            // Cancel current job if exists
            if (this.scheduledJobs.has(job.name)) {
                const scheduledJob = this.scheduledJobs.get(job.name);
                scheduledJob.cancel();
                this.scheduledJobs.delete(job.name);
            }

            // Setup the job again
            await this.setupJob(job, true);
        }

        // Get next execution time if applicable
        let nextExecution = '';
        if (job.enabled && this.scheduledJobs.has(job.name)) {
            nextExecution = `\n- Lần chạy tiếp theo: ${moment(this.scheduledJobs.get(job.name).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')}`;
        }

        let successMessage = `✅ Đã cập nhật thông số "${parameter}" của công việc "${jobName}" thành công.${nextExecution}`;

        // Add extra info for media URLs
        if (isMediaUrl) {
            successMessage += `\n- Đã tải xuống tệp từ URL và lưu thành công.`;
        }

        await api.sendMessage(successMessage, threadId, type);
    }

    /**
  * Test an API configuration
  * @param {Object} api Zalo API instance
  * @param {string} threadId Thread ID
  * @param {number} type Message type
  * @param {Object} schedulesData Schedules data
  * @param {Array} args Command arguments
  */
    async testApi(api, threadId, type, schedulesData, args) {
        if (args.length < 1) {
            await api.sendMessage(
                "❌ Thiếu thông tin. Sử dụng: testapi [tên công việc]",
                threadId,
                type
            );
            return;
        }

        const jobName = args[0];
        const job = schedulesData.jobs.find(j => j.name === jobName);

        if (!job) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        if (!job.api || !job.api.url) {
            await api.sendMessage(`❌ Công việc "${jobName}" không có cấu hình API.`, threadId, type);
            return;
        }

        await api.sendMessage({ msg: `⏳ Đang kiểm tra API cho công việc "${jobName}"...`, ttl: 10000 }, threadId, type);

        try {
            // Call the API
            const apiData = await this.callApi(job.api);

            // Format API response for display
            let responsePreview = JSON.stringify(apiData, null, 2);

            // Truncate if too long
            if (responsePreview.length > 2000) {
                responsePreview = responsePreview.substring(0, 1997) + '...';
            }

            // Send preview of the response
            await api.sendMessage(
                {
                    msg: `✅ API call thành công cho "${jobName}":\n\n` +
                        `🌐 URL: ${job.api.url}\n` +
                        `📊 Phản hồi:\n${responsePreview}\n`,
                    ttl: 10000
                },
                threadId,
                type
            );

            // If there's a template, show preview with real data
            if (job.template) {
                const previewMessage = this.processTemplate(job.template, apiData);
                await api.sendMessage(
                    { msg: `📝 Xem trước tin nhắn với dữ liệu API:\n\n${previewMessage}`, ttl: 10000 },
                    threadId,
                    type
                );
            }

            // If there's media in the API response, try to download and send it
            if (job.api.mediaPath) {
                try {
                    const mediaUrl = job.api.mediaPath.split('.').reduce((obj, key) => obj && obj[key] !== undefined ? obj[key] : undefined, apiData);

                    if (mediaUrl && typeof mediaUrl === 'string' && this.isValidUrl(mediaUrl)) {
                        await api.sendMessage(`⏳ Đang tải xuống media từ API...`, threadId, type);
                        const downloadedPath = await this.downloadFile(mediaUrl);
                        await api.sendMessage({
                            msg: `✅ Media từ API:`,
                            attachments: [downloadedPath],
                            ttl:10000
                        }, threadId, type);
                    } else {
                        await api.sendMessage(`⚠️ Không tìm thấy URL media hợp lệ tại đường dẫn: ${job.api.mediaPath}`, threadId, type);
                    }
                } catch (mediaError) {
                    await api.sendMessage(`❌ Lỗi khi tải xuống media: ${mediaError.message}`, threadId, type);
                }
            }
        } catch (error) {
            await api.sendMessage(
                `❌ Lỗi khi gọi API cho "${jobName}":\n${error.message}`,
                threadId,
                type
            );
        }
    }

    /**
     * Configure API for a job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {Array} args Command arguments
     */
    async configureApi(api, threadId, type, schedulesData, args) {
        if (args.length < 2) {
            await api.sendMessage(
                "❌ Thiếu thông tin. Sử dụng: configapi [tên công việc] [url]",
                threadId,
                type
            );
            return;
        }

        const jobName = args[0];
        const apiUrl = args[1];

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        // Initialize or update API configuration
        if (!schedulesData.jobs[jobIndex].api) {
            schedulesData.jobs[jobIndex].api = {};
        }

        schedulesData.jobs[jobIndex].api.url = apiUrl;
        schedulesData.jobs[jobIndex].api.method = 'GET';

        // Save updated schedules
        fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        await api.sendMessage(
            `✅ Đã cấu hình API cho công việc "${jobName}":\n` +
            `- URL: ${apiUrl}\n` +
            `- Phương thức: GET\n\n` +
            `Bạn có thể cấu hình thêm với các lệnh:\n` +
            `- update ${jobName} apiMethod POST\n` +
            `- update ${jobName} apiHeaders {"Authorization": "Bearer token"}\n` +
            `- update ${jobName} apiData {"key": "value"}\n` +
            `- update ${jobName} apiResponsePath data.results\n` +
            `- update ${jobName} template "Kết quả: {title} - {description}"\n` +
            `- update ${jobName} apiMediaPath data.image_url`,
            threadId,
            type
        );

        // Suggest testing the API
        await api.sendMessage(
            `💡 Bạn có thể kiểm tra API ngay bây giờ bằng lệnh:\n` +
            `- job testapi ${jobName}`,
            threadId,
            type
        );
    }

    /**
     * Show help message for job management with API support
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     */
    async showHelp(api, threadId, type) {
        const helpMessage =
            "📋 Quản lý công việc tự động:\n" +
            "- list: Danh sách công việc\n" +
            "- add [tên] [lịch] [tin nhắn]: Thêm công việc mới\n" +
            "- remove [tên]: Xóa công việc\n" +
            "- enable [tên]: Bật công việc\n" +
            "- disable [tên]: Tắt công việc\n" +
            "- update [tên] [thông số] [giá trị]: Cập nhật công việc\n" +
            "- info [tên]: Xem chi tiết công việc\n" +
            "- run [tên]: Chạy công việc ngay lập tức\n\n" +

            "🌐 Tích hợp API:\n" +
            "- configapi [tên] [url]: Cấu hình API cho công việc\n" +
            "- testapi [tên]: Kiểm tra API của công việc\n" +
            "- update [tên] apiMethod [GET/POST/...]: Đặt phương thức API\n" +
            "- update [tên] apiHeaders {\"key\":\"value\"}: Đặt headers\n" +
            "- update [tên] apiData {\"key\":\"value\"}: Đặt body dữ liệu\n" +
            "- update [tên] apiParams {\"key\":\"value\"}: Đặt query params\n" +
            "- update [tên] apiResponsePath data.results: Đường dẫn đến dữ liệu\n" +
            "- update [tên] apiMediaPath data.image_url: Đường dẫn đến URL media\n" +
            "- update [tên] template \"Kết quả: {title}\": Mẫu tin nhắn với dữ liệu API\n\n" +

            "📝 Ví dụ lịch trình:\n" +
            "- Mỗi ngày lúc 08:00\n" +
            "- Mỗi thứ 2 lúc 09:15\n" +
            "- Mỗi ngày 15 hàng tháng lúc 10:00\n" +
            "- Mỗi 30 phút\n" +
            "- 0 8 * * * (Cú pháp cron)\n\n" +

            "🔗 Hỗ trợ tải tệp từ URL:\n" +
            "- update [tên] imagePath https://example.com/image.jpg\n" +
            "- update [tên] videoPath https://example.com/video.mp4\n" +
            "- update [tên] attachments https://example.com/file.pdf\n\n" +

            "📊 Ví dụ tích hợp API thời tiết:\n" +
            "- job add ThoiTiet \"mỗi ngày lúc 07:00\" Dự báo thời tiết hôm nay\n" +
            "- job configapi ThoiTiet https://api.openweathermap.org/data/2.5/weather?q=Hanoi&appid=YOUR_API_KEY&units=metric&lang=vi\n" +
            "- job update ThoiTiet template \"🌤️ Thời tiết {name} hôm nay:\\n- Nhiệt độ: {main.temp}°C\\n- Cảm giác như: {main.feels_like}°C\\n- Điều kiện: {weather[0].description}\\n- Độ ẩm: {main.humidity}%\"\n" +
            "- job testapi ThoiTiet";

        await api.sendMessage(helpMessage, threadId, type);
    }

    /**
     * Handle job management commands with API support
     * @param {Object} api Zalo API instance
     * @param {Object} msg Message object
     * @param {Array} args Command arguments
     */
    async handleCommand(api, msg, args) {
        const { threadId, type } = msg;
        const operation = args[0]?.toLowerCase();

        try {
            let schedulesData = JSON.parse(fs.readFileSync(this.schedulesPath, 'utf-8'));

            // Initialize jobs array if needed
            if (!schedulesData.jobs) {
                schedulesData.jobs = [];
            }

            switch (operation) {
                case 'list':
                    // List all configured jobs with status
                    await this.listJobs(api, threadId, type, schedulesData);
                    break;

                case 'add':
                    // Add a new job
                    await this.addJob(api, threadId, type, schedulesData, args.slice(1));
                    break;

                case 'remove':
                case 'delete':
                    // Remove a job
                    await this.removeJob(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'enable':
                    // Enable a disabled job
                    await this.enableJob(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'disable':
                    // Disable an active job
                    await this.disableJob(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'update':
                    // Update job parameters
                    await this.updateJob(api, threadId, type, schedulesData, args.slice(1));
                    break;

                case 'info':
                    // Get detailed info about a job
                    await this.getJobInfo(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'run':
                    // Run a job immediately
                    await this.runJobNow(api, threadId, type, schedulesData, args[1]);
                    break;

                case 'configapi':
                case 'setapi':
                    // Configure API for a job
                    await this.configureApi(api, threadId, type, schedulesData, args.slice(1));
                    break;

                case 'testapi':
                    // Test API for a job
                    await this.testApi(api, threadId, type, schedulesData, args.slice(1));
                    break;

                default:
                    // Show help
                    await this.showHelp(api, threadId, type);
            }
        } catch (error) {
            logger.error('❌ Lỗi khi quản lý công việc:', error);
            await api.sendMessage(`❌ Đã xảy ra lỗi: ${error.message}`, threadId, type);
        }
    }

    /**
 * List all configured jobs
 * @param {Object} api Zalo API instance
 * @param {string} threadId Thread ID
 * @param {number} type Message type
 * @param {Object} schedulesData Schedules data
 */
    async listJobs(api, threadId, type, schedulesData) {
        if (!schedulesData.jobs || schedulesData.jobs.length === 0) {
            await api.sendMessage("Không có công việc nào được cấu hình.", threadId, type);
            return;
        }

        let message = "📋 Danh sách công việc tự động:\n\n";

        for (const [index, job] of schedulesData.jobs.entries()) {
            const nextRun = this.scheduledJobs.has(job.name)
                ? moment(this.scheduledJobs.get(job.name).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')
                : 'N/A';

            const status = job.enabled
                ? '✅ Đang hoạt động'
                : '❌ Đã tắt';

            message += `${index + 1}. ${job.name} (${status})\n`;
            message += `   - Lịch: ${job.timeFormat === 'human' ? job.humanTime : job.cronExpression}\n`;

            if (job.enabled) {
                message += `   - Lần chạy tiếp theo: ${nextRun}\n`;
            }

            if (job.stats) {
                message += `   - Đã chạy: ${job.stats.executionCount} lần\n`;
            }

            message += "\n";
        }

        // Add global stats if available
        if (schedulesData.metadata?.stats) {
            message += "📊 Thống kê tổng:\n";
            message += `- Tổng số lần thực thi: ${schedulesData.metadata.stats.totalExecutions}\n`;
            if (schedulesData.metadata.stats.lastExecution) {
                message += `- Lần thực thi cuối: ${moment(schedulesData.metadata.stats.lastExecution).format('DD/MM/YYYY HH:mm:ss')}\n`;
            }
        }

        await api.sendMessage(message, threadId, type);
    }

    /**
     * Get detailed information about a job with API details
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job
     */
    async getJobInfo(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần xem chi tiết.", threadId, type);
            return;
        }

        const job = schedulesData.jobs.find(j => j.name === jobName);

        if (!job) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        let message = `📋 Chi tiết công việc "${job.name}":\n\n`;
        message += `- Trạng thái: ${job.enabled ? '✅ Đang hoạt động' : '❌ Đã tắt'}\n`;
        message += `- Lịch: ${job.timeFormat === 'human' ? job.humanTime : job.cronExpression}\n`;
        message += `- ID nhóm/người dùng: ${job.threadId}\n`;
        message += `- Loại: ${job.isGroup ? 'Nhóm' : 'Người dùng'}\n`;

        if (job.text) {
            message += `- Nội dung: ${job.text.length > 100 ? job.text.substring(0, 100) + '...' : job.text}\n`;
        }

        if (job.template) {
            message += `- Mẫu tin nhắn: ${job.template.length > 100 ? job.template.substring(0, 100) + '...' : job.template}\n`;
        }

        if (job.imagePath) {
            message += `- Đường dẫn ảnh: ${job.imagePath}\n`;
        }

        if (job.videoPath) {
            message += `- Đường dẫn video: ${job.videoPath}\n`;
        }

        if (job.audioPath) {
            message += `- Đường dẫn âm thanh: ${job.audioPath}\n`;
        }

        if (job.attachments && job.attachments.length > 0) {
            message += `- Tệp đính kèm: ${job.attachments.length} tệp\n`;
        }

        if (job.customFunction) {
            message += `- Hàm tùy chỉnh: ${job.customFunction}\n`;
        }

        // Add API information if configured
        if (job.api && job.api.url) {
            message += `\n🌐 Cấu hình API:\n`;
            message += `- URL: ${job.api.url}\n`;
            message += `- Phương thức: ${job.api.method || 'GET'}\n`;

            if (job.api.responsePath) {
                message += `- Đường dẫn phản hồi: ${job.api.responsePath}\n`;
            }

            if (job.api.mediaPath) {
                message += `- Đường dẫn media: ${job.api.mediaPath}\n`;
            }

            if (job.api.required) {
                message += `- Bắt buộc: Có\n`;
            }

            if (job.api.cacheTTL) {
                message += `- Thời gian cache: ${job.api.cacheTTL / 1000} giây\n`;
            }
        }

        if (job.oneTime) {
            message += `\n- Chạy một lần: Có\n`;
        }

        if (job.useDynamicContent) {
            message += `- Sử dụng nội dung động: Có\n`;
        }

        if (job.stats) {
            message += `\n📊 Thống kê:\n`;
            message += `- Đã chạy: ${job.stats.executionCount} lần\n`;
            if (job.stats.lastExecuted) {
                message += `- Lần cuối: ${moment(job.stats.lastExecuted).format('DD/MM/YYYY HH:mm:ss')}\n`;
            }
            if (job.stats.createdAt) {
                message += `- Tạo lúc: ${moment(job.stats.createdAt).format('DD/MM/YYYY HH:mm:ss')}\n`;
            }
        }

        if (job.enabled) {
            const nextRun = this.scheduledJobs.has(job.name)
                ? moment(this.scheduledJobs.get(job.name).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')
                : 'N/A';
            message += `\n⏰ Lần chạy tiếp theo: ${nextRun}\n`;
        }

        await api.sendMessage({ msg: message, ttl: 10000 }, threadId, type);
    }

    /**
     * Remove a scheduled job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job to remove
     */
    async removeJob(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần xóa.", threadId, type);
            return;
        }

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        // Cancel the job if it's scheduled
        if (this.scheduledJobs.has(jobName)) {
            const job = this.scheduledJobs.get(jobName);
            job.cancel();
            this.scheduledJobs.delete(jobName);
        }

        // Remove from the jobs array
        schedulesData.jobs.splice(jobIndex, 1);

        // Save updated schedules
        fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        await api.sendMessage(`✅ Đã xóa công việc "${jobName}" thành công.`, threadId, type);
    }

    /**
     * Enable a disabled job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job to enable
     */
    async enableJob(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần bật.", threadId, type);
            return;
        }

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        if (schedulesData.jobs[jobIndex].enabled) {
            await api.sendMessage(`⚠️ Công việc "${jobName}" đã đang bật.`, threadId, type);
            return;
        }

        // Update job status
        schedulesData.jobs[jobIndex].enabled = true;
        schedulesData.jobs[jobIndex].enabledAt = new Date().toISOString();
        delete schedulesData.jobs[jobIndex].disabledReason;

        // Save updated schedules
        fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Setup the job
        await this.setupJob(schedulesData.jobs[jobIndex]);

        // Get next execution time
        const nextExecution = this.scheduledJobs.has(jobName)
            ? moment(this.scheduledJobs.get(jobName).nextInvocation()).format('DD/MM/YYYY HH:mm:ss')
            : 'Không xác định';


        await api.sendMessage(
            `✅ Đã bật công việc "${jobName}" thành công.\n` +
            `- Lần chạy tiếp theo: ${nextExecution}`,
            threadId,
            type
        );
    }

    /**
     * Disable an active job
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job to disable
     */
    async disableJob(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần tắt.", threadId, type);
            return;
        }

        const jobIndex = schedulesData.jobs.findIndex(job => job.name === jobName);

        if (jobIndex === -1) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        if (!schedulesData.jobs[jobIndex].enabled) {
            await api.sendMessage(`⚠️ Công việc "${jobName}" đã đang tắt.`, threadId, type);
            return;
        }

        // Update job status
        schedulesData.jobs[jobIndex].enabled = false;
        schedulesData.jobs[jobIndex].disabledAt = new Date().toISOString();
        schedulesData.jobs[jobIndex].disabledReason = "Manually disabled";

        // Save updated schedules
        fs.writeFileSync(this.schedulesPath, JSON.stringify(schedulesData, null, 2), 'utf-8');

        // Cancel the job if it's scheduled
        if (this.scheduledJobs.has(jobName)) {
            const job = this.scheduledJobs.get(jobName);
            job.cancel();
            this.scheduledJobs.delete(jobName);
        }

        await api.sendMessage(`✅ Đã tắt công việc "${jobName}" thành công.`, threadId, type);
    }

    /**
     * Run a job immediately with API support
     * @param {Object} api Zalo API instance
     * @param {string} threadId Thread ID
     * @param {number} type Message type
     * @param {Object} schedulesData Schedules data
     * @param {string} jobName Name of the job to run
     */
    async runJobNow(api, threadId, type, schedulesData, jobName) {
        if (!jobName) {
            await api.sendMessage("❌ Vui lòng cung cấp tên công việc cần chạy.", threadId, type);
            return;
        }

        const job = schedulesData.jobs.find(j => j.name === jobName);

        if (!job) {
            await api.sendMessage(`❌ Không tìm thấy công việc "${jobName}".`, threadId, type);
            return;
        }

        await api.sendMessage(`⏳ Đang chạy công việc "${jobName}" ngay lập tức...`, threadId, type);

        try {
            // Call API if configured
            let apiData = null;
            if (job.api && job.api.url) {
                try {
                    apiData = await this.callApi(job.api);
                    logger.info(`✅ API call thành công cho công việc "${job.name}"`);
                } catch (apiError) {
                    logger.error(`❌ Lỗi khi gọi API cho công việc "${job.name}": ${apiError.message}`);

                    // If API call is required but failed, and no fallback, abort
                    if (job.api.required && !job.api.fallback) {
                        await api.sendMessage(
                            `❌ Không thể thực thi công việc "${job.name}" do API bắt buộc không thành công: ${apiError.message}`,
                            threadId,
                            type
                        );
                        return;
                    }

                    // Use fallback if available
                    if (job.api.fallback) {
                        apiData = job.api.fallback;
                        logger.info(`⚠️ Sử dụng dữ liệu dự phòng cho API của công việc "${job.name}"`);
                    }
                }
            }

            // Determine message type (Group or User)
            const messageType = job.isGroup ? 1 : 0;

            // Prepare message content
            let messageContent = {};

            // Add text content if available
            if (job.text) {
                messageContent.msg = job.text;

                // Process dynamic content in text with API data if needed
                if (job.useDynamicContent) {
                    messageContent.msg = this.processDynamicContent(messageContent.msg, apiData);
                }
            }

            // If there's a template and API data, use it to generate content
            if (job.template && apiData) {
                messageContent.msg = this.processTemplate(job.template, apiData);
            }

            // Add text styling if specified
            if (job.styles && Array.isArray(job.styles)) {
                messageContent.styles = job.styles;
            }

            // Add urgency if specified
            if (job.urgency) {
                messageContent.urgency = job.urgency;
            }

            // Add mentions if specified (for group messages)
            if (job.mentions && Array.isArray(job.mentions) && job.isGroup) {
                messageContent.mentions = job.mentions;
            }

            // Add attachments for media files
            const attachments = await this.prepareJobAttachments(job);

            // If API returned image/video URLs, download and add them
            if (apiData && job.api.mediaPath) {
                try {
                    const mediaUrl = job.api.mediaPath.split('.').reduce((obj, key) => obj && obj[key] !== undefined ? obj[key] : undefined, apiData);

                    if (mediaUrl && typeof mediaUrl === 'string' && this.isValidUrl(mediaUrl)) {
                        const downloadedPath = await this.downloadFile(mediaUrl);
                        attachments.push(downloadedPath);
                        logger.info(`✅ Đã tải xuống media từ API: ${mediaUrl}`);
                    }
                } catch (mediaError) {
                    logger.error(`❌ Lỗi khi tải xuống media từ API: ${mediaError.message}`);
                }
            }

            // Add attachments to message content if any
            if (attachments.length > 0) {
                messageContent.attachments = attachments;
            }

            // Send the message
            if (Object.keys(messageContent).length > 0) {
                // If it's just a simple text message with no other properties, send as string
                if (Object.keys(messageContent).length === 1 && messageContent.msg && !job.useRichText) {
                    await this.api.sendMessage(messageContent, job.threadId, messageType);
                } else {
                    // Otherwise send as a rich message object
                    await this.api.sendMessage(messageContent, job.threadId, messageType);
                }
                logger.info(`✅ Đã gửi tin nhắn theo lịch cho "${job.name}" (chạy thủ công)`);

                // Update job execution stats
                await this.updateJobExecutionStats(job.name);
            } else {
                logger.warn(`⚠️ Công việc "${job.name}" không có nội dung tin nhắn để gửi`);
                await api.sendMessage(`⚠️ Công việc "${job.name}" không có nội dung tin nhắn để gửi.`, threadId, type);
                return;
            }

            // Execute custom function if provided
            if (job.customFunction && typeof job.customFunction === 'string') {
                await this.executeJobCustomFunction(job, apiData);
            }

            await api.sendMessage(`✅ Đã chạy công việc "${job.name}" thành công.`, threadId, type);
        } catch (error) {
            logger.error(`❌ Lỗi khi chạy công việc "${job.name}":`, error);
            await api.sendMessage(`❌ Lỗi khi chạy công việc "${job.name}": ${error.message}`, threadId, type);
        }
    }

    /**
     * Register command handler for job management
     * @param {Object} commandsMap Map of commands
     */
    registerCommand(commandsMap) {
        commandsMap.set('job', {
            config: {
                name: 'job',
                aliases: ['schedule', 'jobs', 'lịch'],
                description: 'Quản lý các công việc tự động theo lịch',
                usage: 'job [list|add|remove|enable|disable|update|info|run]',
                permissions: ['ADMIN']
            },
            execute: async (api, msg, args) => {
                await this.handleCommand(api, msg, args);
            }
        });

        logger.info('✅ Đã đăng ký lệnh quản lý công việc tự động');
    }
}

export default SchedulesManager;