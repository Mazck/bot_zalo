import fs from 'fs';
import path from 'path';
import util from 'util';
import { createStream } from 'rotating-file-stream';
import chalk from 'chalk';
// Import additional packages for animations
import gradient from 'gradient-string';
import spinners from 'cli-spinners';
import chalkAnimation from 'chalk-animation';
import ora from 'ora';
import boxen from 'boxen';

/**
 * Logger - Module logger đầy đủ cho NodeJS sử dụng ES6 với hiệu ứng console nâng cao
 */
class Logger {
    /**
     * Các cấp độ log được hỗ trợ
     */
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4,
    };

    /**
     * Hiệu ứng màu sắc cho từng cấp độ log
     */
    static COLOR_EFFECTS = {
        DEBUG: text => chalk.blue(text),
        INFO: text => gradient(['#12c2e9', '#c471ed', '#f64f59']).multiline(text),
        WARN: text => gradient.cristal.multiline(text),
        ERROR: text => gradient(['#ED213A', '#93291E']).multiline(text),
        FATAL: text => gradient(['#8A2387', '#E94057', '#F27121']).multiline(text),
    };

    /**
     * Hiệu ứng nhấp nháy và chuyển động cho các cấp độ log
     */
    static SPINNERS = {
        DEBUG: spinners.dots,
        INFO: spinners.star,
        WARN: spinners.toggle,
        ERROR: spinners.shark,
        FATAL: spinners.aesthetic,
    };

    /**
     * Hiệu ứng khung viền cho log
     */
    static BOX_STYLES = {
        DEBUG: { borderStyle: 'round', padding: 1, borderColor: 'blue', dimBorder: true },
        INFO: { borderStyle: 'double', padding: 1, borderColor: 'cyan' },
        WARN: { borderStyle: 'arrow', padding: 1, borderColor: 'yellow' },
        ERROR: { borderStyle: 'classic', padding: 1, borderColor: 'red', backgroundColor: '#400' },
        FATAL: { borderStyle: 'bold', padding: 1, borderColor: 'magenta', backgroundColor: '#404' },
    };

    /**
     * @param {Object} options - Tùy chọn cho logger
     * @param {string} options.name - Tên của logger
     * @param {string} options.level - Cấp độ log tối thiểu ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')
     * @param {boolean} options.console - Có log ra console không
     * @param {boolean} options.consoleTimestamp - Có hiển thị timestamp trên console không
     * @param {boolean} options.fileTimestamp - Có hiển thị timestamp trong file không
     * @param {boolean} options.animation - Có sử dụng hiệu ứng animation không
     * @param {boolean} options.colorCycle - Có sử dụng hiệu ứng chuyển màu liên tục không
     * @param {boolean} options.boxed - Có sử dụng khung viền cho log không 
     * @param {Object} options.file - Tùy chọn cho log file
     * @param {string} options.file.path - Đường dẫn tới file log
     * @param {string} options.file.dir - Thư mục chứa file log
     * @param {boolean} options.file.json - Có log dưới dạng JSON không
     * @param {Object} options.file.rotation - Tùy chọn xoay vòng file log
     * @param {string} options.file.rotation.interval - Chu kỳ xoay vòng ('1d', '12h', '1w', ...)
     * @param {number} options.file.rotation.size - Kích thước tối đa của file log (bytes)
     * @param {number} options.file.rotation.maxFiles - Số lượng file log tối đa được giữ lại
     */
    constructor(options = {}) {
        this.name = options.name || 'app';
        this.level = Logger.LEVELS[options.level] !== undefined ? Logger.LEVELS[options.level] : Logger.LEVELS.INFO;
        this.console = options.console !== false;
        this.consoleTimestamp = options.consoleTimestamp === true; // Mặc định là false
        this.fileTimestamp = options.fileTimestamp !== false; // Mặc định là true
        this.animation = options.animation !== false; // Mặc định là true
        this.colorCycle = options.colorCycle !== false; // Mặc định là true
        this.boxed = options.boxed || false; // Mặc định là false
        this.fileOptions = options.file || null;
        this.spinnerFrames = {};
        this.spinnerIndex = 0;
        this.lastSpinnerUpdate = Date.now();
        this.lastColorUpdate = Date.now();
        this.colorIndex = 0;
        this.activeSpinners = new Map();

        // Màu sắc cho hiệu ứng chuyển màu liên tục
        this.colorPalettes = {
            INFO: ['#00FFFF', '#00BFFF', '#1E90FF', '#0000FF', '#8A2BE2', '#9932CC', '#9400D3'],
            WARN: ['#FFD700', '#FFA500', '#FF8C00', '#FF7F50', '#FF6347', '#FF4500'],
            ERROR: ['#FF0000', '#DC143C', '#B22222', '#8B0000', '#800000', '#A52A2A'],
            DEBUG: ['#00FA9A', '#00FF7F', '#3CB371', '#2E8B57', '#228B22', '#008000'],
            FATAL: ['#FF00FF', '#FF1493', '#C71585', '#DB7093', '#800080', '#8B008B', '#4B0082'],
        };

        // Khởi tạo khung hình cho hiệu ứng spinner
        Object.keys(Logger.SPINNERS).forEach(level => {
            this.spinnerFrames[level] = Logger.SPINNERS[level].frames;
        });

        // Khởi tạo stream ghi file nếu cần
        if (this.fileOptions) {
            this.initFileStream();
        }
    }

    /**
     * Khởi tạo stream ghi file log với xoay vòng
     */
    initFileStream() {
        const { dir, path: filePath, rotation = {} } = this.fileOptions;

        // Tạo thư mục log nếu chưa tồn tại
        const logDir = dir || 'logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const filename = filePath || `${this.name}.log`;
        const fullPath = path.join(logDir, filename);

        // Tạo rotating stream
        this.fileStream = createStream(fullPath, {
            size: rotation.size || '10M',      // Xoay vòng khi đạt 10MB
            interval: rotation.interval || '1d', // Xoay vòng hàng ngày
            compress: 'gzip',                  // Nén các file cũ
            maxFiles: rotation.maxFiles || 5,  // Giữ tối đa 5 file log
        });
    }

    /**
     * Tạo chuỗi timestamp hiện tại
     * @returns {string} Chuỗi timestamp định dạng ISO
     */
    getTimestamp() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0'); // Tháng bắt đầu từ 0
        const year = now.getFullYear();

        return `${hours}:${minutes}:${seconds}.${milliseconds} - ${day}/${month}/${year}`;
    }

    /**
     * Lấy khung hình spinner cho cấp độ log
     * @param {string} level - Cấp độ log
     * @returns {string} Khung hình spinner
     */
    getSpinnerFrame(level) {
        if (!this.animation || !this.spinnerFrames[level]) {
            return '';
        }

        // Cập nhật khung hình mỗi 100ms
        const now = Date.now();
        if (now - this.lastSpinnerUpdate > 100) {
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames[level].length;
            this.lastSpinnerUpdate = now;
        }

        return this.spinnerFrames[level][this.spinnerIndex];
    }

    /**
     * Lấy màu từ bảng màu với hiệu ứng chuyển màu liên tục
     * @param {string} level - Cấp độ log
     * @returns {string} Màu hiện tại
     */
    getCyclingColor(level) {
        if (!this.colorCycle || !this.colorPalettes[level]) {
            return '#FFFFFF';
        }

        const palette = this.colorPalettes[level];

        // Cập nhật màu mỗi 200ms
        const now = Date.now();
        if (now - this.lastColorUpdate > 200) {
            this.colorIndex = (this.colorIndex + 1) % palette.length;
            this.lastColorUpdate = now;
        }

        return palette[this.colorIndex];
    }

    /**
     * Kiểm tra xem có nên log ở cấp độ được chỉ định không
     * @param {number} level - Cấp độ log cần kiểm tra
     * @returns {boolean} True nếu cần log, ngược lại là false
     */
    shouldLog(level) {
        return level >= this.level;
    }

    /**
     * Định dạng thông điệp log cho console với hiệu ứng
     * @param {string} level - Tên cấp độ log
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     * @returns {string} Thông điệp đã định dạng
     */
    formatConsoleMessage(level, message, meta = {}) {
        const timestamp = this.consoleTimestamp ? chalk.gray(`${this.getTimestamp()} `) : '';
        const spinnerFrame = this.animation ? chalk.bold(this.getSpinnerFrame(level)) : '';

        // FIX: Đảm bảo không sử dụng màu nếu level không tồn tại trong bảng màu
        let levelColor = '#FFFFFF'; // Mặc định là màu trắng
        try {
            if (this.colorPalettes[level] && this.colorPalettes[level].length > 0) {
                levelColor = this.getCyclingColor(level);
            }
        } catch (error) {
            // Nếu có lỗi khi lấy màu, sử dụng màu mặc định
            levelColor = '#FFFFFF';
        }

        // Tạo label với hiệu ứng và màu sắc (đã được bảo vệ)
        let levelLabel;
        try {
            levelLabel = chalk.bold.hex(levelColor)(`[${level}]`);
        } catch (error) {
            // Fallback khi có lỗi với màu hex
            levelLabel = chalk.bold(`[${level}]`);
        }

        const nameLabel = chalk.cyan.bold(`[${this.name}]`);

        // Tạo thông điệp có màu sắc và hiệu ứng dựa trên loại log
        let coloredMessage;

        try {
            if (this.colorCycle && Logger.COLOR_EFFECTS[level]) {
                // Sử dụng gradient với nhiều màu sắc cho hiệu ứng chuyển màu liên tục
                coloredMessage = Logger.COLOR_EFFECTS[level](message);
            } else {
                // Sử dụng màu đơn giản nếu không bật chế độ chuyển màu
                switch (level) {
                    case 'INFO':
                        coloredMessage = chalk.green(message);
                        break;
                    case 'WARN':
                        coloredMessage = chalk.yellow(message);
                        break;
                    case 'ERROR':
                        coloredMessage = chalk.red(message);
                        break;
                    case 'FATAL':
                        coloredMessage = chalk.magenta.bold(message);
                        break;
                    default:
                        coloredMessage = chalk.blue(message);
                }
            }
        } catch (error) {
            // Fallback khi có lỗi với hiệu ứng màu
            coloredMessage = message;
        }

        let formatted = `${timestamp}${levelLabel} ${nameLabel}: ${coloredMessage}`;

        // Thêm dữ liệu bổ sung nếu có
        if (Object.keys(meta).length > 0) {
            formatted += `\n${util.inspect(meta, { depth: null, colors: true })}`;
        }

        // Đóng khung thông điệp nếu cần
        if (this.boxed) {
            try {
                const boxStyle = Logger.BOX_STYLES[level] || {};
                formatted = boxen(formatted, boxStyle);
            } catch (error) {
                // Nếu có lỗi khi tạo box, trả về chuỗi gốc
            }
        }

        return formatted;
    }

    /**
     * Định dạng thông điệp log cho file
     * @param {string} level - Tên cấp độ log
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     * @returns {string} Thông điệp đã định dạng
     */
    formatFileMessage(level, message, meta = {}) {
        const timestamp = this.fileTimestamp ? `${this.getTimestamp()} ` : '';
        let formatted = `${timestamp}[${level}] [${this.name}]: ${message}`;

        // Thêm dữ liệu bổ sung nếu có
        if (Object.keys(meta).length > 0) {
            formatted += `\n${util.inspect(meta, { depth: null, colors: false })}`;
        }

        return formatted;
    }

    /**
     * Định dạng thông điệp log dưới dạng JSON
     * @param {string} level - Tên cấp độ log
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     * @returns {string} Thông điệp JSON
     */
    formatJsonMessage(level, message, meta = {}) {
        return JSON.stringify({
            timestamp: this.getTimestamp(),
            level,
            logger: this.name,
            message,
            ...meta,
        });
    }

    /**
     * Ghi log vào console và/hoặc file với hiệu ứng chuyển động
     * @param {string} levelName - Tên cấp độ log
     * @param {number} levelValue - Giá trị cấp độ log
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     */
    log(levelName, levelValue, message, meta = {}) {
        if (!this.shouldLog(levelValue)) return;

        // Xử lý trường hợp error là instance của Error
        if (meta.error instanceof Error) {
            meta.errorMessage = meta.error.message;
            meta.stackTrace = meta.error.stack;
            delete meta.error;
        }

        // Log ra console nếu được bật
        if (this.console) {
            try {
                const formatted = this.formatConsoleMessage(levelName, message, meta);

                // Áp dụng hiệu ứng chuyển động khác nhau tùy theo cấp độ log
                if (this.animation && levelValue >= Logger.LEVELS.ERROR) {
                    // Sử dụng hiệu ứng nâng cao cho lỗi nghiêm trọng
                    if (levelValue === Logger.LEVELS.FATAL) {
                        try {
                            const fatalMessage = `⛔ ${levelName} ⛔ ${message}`;
                            const rainbow = chalkAnimation.rainbow(fatalMessage);
                            setTimeout(() => {
                                rainbow.stop();
                                console.log(formatted);
                            }, 2000);
                        } catch (error) {
                            // Fallback khi có lỗi với animation
                            console.log(formatted);
                        }
                    } else {
                        try {
                            const spinner = ora({
                                text: formatted,
                                spinner: Logger.SPINNERS[levelName]
                            }).start();

                            setTimeout(() => {
                                spinner.succeed();
                            }, 1000);

                            // Lưu spinner đang hoạt động để dừng sau nếu cần
                            this.activeSpinners.set(message, spinner);
                        } catch (error) {
                            // Fallback khi có lỗi với spinner
                            console.log(formatted);
                        }
                    }
                } else {
                    console.log(formatted);
                }
            } catch (error) {
                // Nếu có lỗi khi định dạng, in thông điệp gốc
                console.log(`[${levelName}] [${this.name}]: ${message}`);
                if (Object.keys(meta).length > 0) {
                    console.log(meta);
                }
            }
        }

        // Log ra file nếu được cấu hình
        if (this.fileStream) {
            try {
                const logData = this.fileOptions.json
                    ? this.formatJsonMessage(levelName, message, meta)
                    : this.formatFileMessage(levelName, message, meta);

                this.fileStream.write(`${logData}\n`);
            } catch (error) {
                // Ghi log cơ bản nếu có lỗi
                this.fileStream.write(`${this.getTimestamp()} [${levelName}] [${this.name}]: ${message}\n`);
            }
        }
    }

    /**
     * Log ở cấp độ DEBUG
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     */
    debug(message, meta = {}) {
        this.log('DEBUG', Logger.LEVELS.DEBUG, message, meta);
    }

    /**
     * Log ở cấp độ INFO
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     */
    info(message, meta = {}) {
        this.log('INFO', Logger.LEVELS.INFO, message, meta);
    }

    /**
     * Log ở cấp độ WARN
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     */
    warn(message, meta = {}) {
        this.log('WARN', Logger.LEVELS.WARN, message, meta);
    }

    /**
     * Log ở cấp độ ERROR
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     */
    error(message, meta = {}) {
        this.log('ERROR', Logger.LEVELS.ERROR, message, meta);
    }

    /**
     * Log ở cấp độ FATAL
     * @param {string} message - Thông điệp log
     * @param {Object} meta - Dữ liệu bổ sung
     */
    fatal(message, meta = {}) {
        this.log('FATAL', Logger.LEVELS.FATAL, message, meta);
    }

    /**
     * Log lỗi với stack trace
     * @param {string} message - Thông điệp log
     * @param {Error} error - Đối tượng lỗi
     * @param {Object} meta - Dữ liệu bổ sung
     */
    exception(message, error, meta = {}) {
        this.error(message, { error, ...meta });
    }

    /**
     * Đo thời gian thực thi của một hàm với hiệu ứng đếm thời gian
     * @param {string} label - Nhãn của hàm cần đo
     * @returns {Function} Decorator function
     */
    measure(label) {
        const self = this;
        return function (target, propertyKey, descriptor) {
            const originalMethod = descriptor.value;

            descriptor.value = function (...args) {
                const start = process.hrtime.bigint();
                let spinner;

                // Tạo spinner để hiển thị quá trình đang thực thi
                if (self.animation) {
                    try {
                        spinner = ora({
                            text: `⏱️ Executing ${label || propertyKey}...`,
                            spinner: 'clock'
                        }).start();
                    } catch (error) {
                        // Bỏ qua nếu không tạo được spinner
                    }
                }

                try {
                    const result = originalMethod.apply(this, args);

                    // Handle promises
                    if (result && typeof result.then === 'function') {
                        return result.finally(() => {
                            const end = process.hrtime.bigint();
                            const duration = Number(end - start) / 1_000_000; // Convert to ms

                            if (spinner) {
                                try {
                                    spinner.succeed(`✅ ${label || propertyKey} completed in ${duration.toFixed(2)}ms`);
                                } catch (error) {
                                    self.debug(`${label || propertyKey} completed in ${duration.toFixed(2)}ms`);
                                }
                            } else {
                                self.debug(`${label || propertyKey} completed in ${duration.toFixed(2)}ms`);
                            }
                        });
                    }

                    const end = process.hrtime.bigint();
                    const duration = Number(end - start) / 1_000_000; // Convert to ms

                    if (spinner) {
                        try {
                            spinner.succeed(`✅ ${label || propertyKey} completed in ${duration.toFixed(2)}ms`);
                        } catch (error) {
                            self.debug(`${label || propertyKey} completed in ${duration.toFixed(2)}ms`);
                        }
                    } else {
                        self.debug(`${label || propertyKey} completed in ${duration.toFixed(2)}ms`);
                    }

                    return result;
                } catch (error) {
                    const end = process.hrtime.bigint();
                    const duration = Number(end - start) / 1_000_000; // Convert to ms

                    if (spinner) {
                        try {
                            spinner.fail(`❌ ${label || propertyKey} failed after ${duration.toFixed(2)}ms`);
                        } catch (error) {
                            // Bỏ qua nếu không thể cập nhật spinner
                        }
                    }

                    self.error(`${label || propertyKey} failed after ${duration.toFixed(2)}ms`, { error });
                    throw error;
                }
            };

            return descriptor;
        };
    }

    /**
     * Tạo một context logger mới với tên khác
     * @param {string} name - Tên của logger mới
     * @returns {Logger} Instance logger mới
     */
    child(name) {
        const options = {
            name,
            level: Object.keys(Logger.LEVELS).find(key => Logger.LEVELS[key] === this.level),
            console: this.console,
            consoleTimestamp: this.consoleTimestamp,
            fileTimestamp: this.fileTimestamp,
            animation: this.animation,
            colorCycle: this.colorCycle,
            boxed: this.boxed,
            file: this.fileOptions
        };

        return new Logger(options);
    }

    /**
     * Tạo hiệu ứng đếm ngược
     * @param {number} seconds - Số giây đếm ngược
     * @param {string} message - Thông điệp hiển thị
     * @returns {Promise} Promise giải quyết khi đếm ngược kết thúc
     */
    countdown(seconds, message = 'Countdown') {
        return new Promise(resolve => {
            let remaining = seconds;
            let spinner;

            try {
                spinner = ora({
                    text: `${message}: ${remaining}s`,
                    spinner: 'clock'
                }).start();
            } catch (error) {
                console.log(`${message}: ${remaining}s`);
            }

            const interval = setInterval(() => {
                remaining--;

                if (spinner) {
                    try {
                        spinner.text = `${message}: ${remaining}s`;
                    } catch (error) {
                        console.log(`${message}: ${remaining}s`);
                    }
                } else {
                    console.log(`${message}: ${remaining}s`);
                }

                if (remaining <= 0) {
                    clearInterval(interval);

                    if (spinner) {
                        try {
                            spinner.succeed(`${message} completed!`);
                        } catch (error) {
                            console.log(`${message} completed!`);
                        }
                    } else {
                        console.log(`${message} completed!`);
                    }

                    resolve();
                }
            }, 1000);
        });
    }

    /**
     * Hiển thị hiệu ứng thanh tiến trình
     * @param {number} total - Tổng số bước
     * @param {string} message - Thông điệp hiển thị
     * @returns {Object} Đối tượng thanh tiến trình
     */
    progress(total, message = 'Progress') {
        let current = 0;
        let spinner;

        try {
            spinner = ora({
                text: `${message} [0/${total}] 0%`,
                spinner: 'dots'
            }).start();
        } catch (error) {
            console.log(`${message} [0/${total}] 0%`);
        }

        return {
            update: (step = 1) => {
                current += step;
                if (current > total) current = total;
                const percent = Math.floor((current / total) * 100);

                if (spinner) {
                    try {
                        spinner.text = `${message} [${current}/${total}] ${percent}%`;
                    } catch (error) {
                        console.log(`${message} [${current}/${total}] ${percent}%`);
                    }
                } else {
                    console.log(`${message} [${current}/${total}] ${percent}%`);
                }
            },
            complete: (completeMessage = 'Completed') => {
                if (spinner) {
                    try {
                        spinner.succeed(completeMessage);
                    } catch (error) {
                        console.log(`✓ ${completeMessage}`);
                    }
                } else {
                    console.log(`✓ ${completeMessage}`);
                }
            },
            fail: (failMessage = 'Failed') => {
                if (spinner) {
                    try {
                        spinner.fail(failMessage);
                    } catch (error) {
                        console.log(`✗ ${failMessage}`);
                    }
                } else {
                    console.log(`✗ ${failMessage}`);
                }
            }
        };
    }

    /**
     * Tạo chuỗi log với nhiều hiệu ứng màu sắc
     * @param {string} message - Thông điệp cần làm đẹp
     * @param {string} effect - Loại hiệu ứng ('rainbow', 'neon', 'fire', 'ocean', 'matrix')
     * @returns {string} Thông điệp đã được làm đẹp
     */
    static beautify(message, effect = 'rainbow') {
        try {
            switch (effect) {
                case 'neon':
                    return gradient(['#f72585', '#b5179e', '#7209b7', '#560bad', '#480ca8']).multiline(message);
                case 'fire':
                    return gradient(['#f9c80e', '#f86624', '#ea3546', '#662e9b', '#43bccd']).multiline(message);
                case 'ocean':
                    return gradient(['#00b4d8', '#0096c7', '#0077b6', '#023e8a', '#03045e']).multiline(message);
                case 'matrix':
                    return gradient(['#0d0208', '#008f11', '#00ff41']).multiline(message);
                case 'rainbow':
                default:
                    return gradient.rainbow.multiline(message);
            }
        } catch (error) {
            // Nếu có lỗi, trả về chuỗi gốc
            return message;
        }
    }

    /**
     * Hiển thị văn bản 3D viết hoa
     * @param {string} text - Văn bản cần hiển thị
     * @param {string} effect - Loại hiệu ứng màu
     */
    static displayBanner(text, effect = 'rainbow') {
        // Tạo văn bản ASCII art
        const figureText = text.toUpperCase();
        console.log('\n' + Logger.beautify(figureText, effect) + '\n');
    }
}

/**
 * Tạo một instance logger mặc định để sử dụng ngay với hiệu ứng đầy đủ
 */
export const defaultLogger = new Logger({
    name: 'app',
    level: 'INFO',
    console: true,
    consoleTimestamp: false,    // Không hiển thị timestamp trên console
    fileTimestamp: true,        // Vẫn hiển thị timestamp trong file
    animation: true,            // Bật hiệu ứng animation
    colorCycle: true,           // Bật hiệu ứng chuyển màu liên tục
    boxed: false,               // Mặc định không đóng khung
    file: {
        dir: 'logs',
        path: 'app.log',
        json: false,
        rotation: {
            interval: '1d',
            size: '10M',
            maxFiles: 7
        }
    }
});

export default Logger;