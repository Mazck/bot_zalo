import { dirname } from "path";
import { join } from "path";
import { fileURLToPath } from "url";
import pkg from 'fs-extra';
const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = pkg;
import { createRequire } from "module";
import chalk from "chalk";
import ora from "ora";

// Global flag to prevent duplicate QR code displays
let qrDisplayed = false;

/**
 * Handle the login process for Zalo
 * @param {Object} bot The ZaloBot instance
 * @returns {Promise<Object>} The Zalo API object
 */
async function handleLogin(bot) {
    // Reset QR display flag at the start
    qrDisplayed = false;

    // Kiểm tra xem có qrcode-terminal package chưa, nếu chưa thì cài đặt
    if (!bot.isPackageInstalled('qrcode-terminal')) {
        bot.installPackage('qrcode-terminal', 'latest');
    }

    // Hiển thị menu đăng nhập
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.yellow('📱 CHỌN PHƯƠNG THỨC ĐĂNG NHẬP:'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green('1. Đăng nhập bằng Cookie (mặc định nếu đã có file cookie.json)'));
    console.log(chalk.green('2. Đăng nhập bằng mã QR'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    // Đọc lựa chọn từ command line
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Kiểm tra xem cookie.json có tồn tại không để xác định lựa chọn mặc định
    const hasCookieFile = existsSync("./cookie.json");
    let loginChoice = 1; // Mặc định là 1

    try {
        const answer = await new Promise(resolve => {
            rl.question(chalk.yellow(`Nhập lựa chọn của bạn ${hasCookieFile ? '[1]' : '[2]'}: `), resolve);
        });

        // Nếu người dùng không nhập gì, sử dụng giá trị mặc định dựa trên sự tồn tại của file cookie
        loginChoice = answer.trim() === '' ? (hasCookieFile ? 1 : 2) : parseInt(answer);

        // Kiểm tra giá trị nhập vào
        if (isNaN(loginChoice) || (loginChoice !== 1 && loginChoice !== 2)) {
            loginChoice = hasCookieFile ? 1 : 2;
            bot.logger.warn(`Lựa chọn không hợp lệ. Sử dụng phương thức ${loginChoice === 1 ? 'Cookie' : 'QR'}.`);
        }
    } catch (inputError) {
        bot.logger.error('Lỗi khi đọc lựa chọn:', inputError);
        loginChoice = hasCookieFile ? 1 : 2;
    } finally {
        rl.close();
    }

    // Đăng nhập dựa trên lựa chọn
    let loginSuccess = false;
    let retryWithQR = false;
    let api = null;

    // Đăng nhập bằng cookie nếu được chọn và cookie tồn tại
    if (loginChoice === 1) {
        api = await loginWithCookie(bot, hasCookieFile);

        if (api) {
            loginSuccess = true;
        } else {
            // Hỏi người dùng có muốn thử phương thức QR không
            retryWithQR = await askForQrRetry();

            if (!retryWithQR) {
                throw new Error('Đăng nhập thất bại và người dùng đã hủy đăng nhập bằng QR.');
            }
        }
    }

    // Đăng nhập bằng QR nếu được chọn hoặc cookie thất bại
    if ((loginChoice === 2 || retryWithQR) && !loginSuccess) {
        api = await loginWithQR(bot);

        if (api) {
            loginSuccess = true;
        } else {
            throw new Error('Không thể đăng nhập vào Zalo. Vui lòng kiểm tra lại kết nối mạng và thử lại.');
        }
    }

    return api;
}

/**
 * Login with cookie method
 * @param {Object} bot The ZaloBot instance
 * @param {boolean} hasCookieFile Whether cookie.json exists
 * @returns {Promise<Object|null>} The Zalo API object or null if failed
 */
async function loginWithCookie(bot, hasCookieFile) {
    bot.logger.info('Đang đăng nhập bằng Cookie...');

    if (!hasCookieFile) {
        bot.logger.warn('Không tìm thấy file cookie.json.');
        return null;
    }

    try {
        bot.cookie = JSON.parse(readFileSync("./cookie.json", "utf-8"));

        const spinner = ora({
            text: 'Đang đăng nhập với cookie...',
            color: 'blue'
        }).start();

        const api = await bot.zalo.login({
            cookie: bot.cookie,
            imei: bot.config.imei,
            userAgent: bot.config.userAgent,
        });

        spinner.succeed('Đăng nhập thành công!');
        bot.logger.info('Bot Zalo đã đăng nhập thành công bằng cookie!');
        return api;
    } catch (loginError) {
        bot.logger.error('Đăng nhập bằng cookie thất bại:', loginError.message);
        return null;
    }
}

/**
 * Ask user if they want to retry with QR login
 * @returns {Promise<boolean>} Whether to retry with QR
 */
async function askForQrRetry() {
    const readline = await import('readline');
    const rlRetry = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const retryAnswer = await new Promise(resolve => {
        rlRetry.question(chalk.yellow('Cookie không hợp lệ. Bạn có muốn thử đăng nhập bằng QR? (Y/n): '), resolve);
    });
    rlRetry.close();

    return retryAnswer.trim().toLowerCase() !== 'n';
}

/**
 * Login with QR code
 * @param {Object} bot The ZaloBot instance
 * @returns {Promise<Object|null>} The Zalo API object or null if failed
 */
async function loginWithQR(bot) {
    // Reset QR display flag
    qrDisplayed = false;

    bot.logger.info('Đang chuẩn bị đăng nhập bằng QR code...');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const qrPath = join(__dirname, "./qr.png");

    const spinner = ora({
        text: 'Đang tạo mã QR. Vui lòng đợi...',
        color: 'yellow'
    }).start();

    try {
        // Cố gắng import qrcode-terminal
        let qrcode;
        try {
            const qrcodeModule = createRequire(import.meta.url)('qrcode-terminal');
            qrcode = qrcodeModule;
        } catch (qrErr) {
            bot.logger.debug('Không tìm thấy module qrcode-terminal:', qrErr.message);
        }

        // Đăng nhập bằng QR code
        const api = await bot.zalo.loginQR({
            userAgent: '',
            qrPath: qrPath,
        }, (qrCodeData) => {
            spinner.succeed('Đã tạo mã QR thành công!');
            handleQrData(qrCodeData, qrPath, qrcode, bot.logger);
        });

        // Lưu cookie mới sau khi đăng nhập thành công
        //saveNewCookie(api);

        bot.logger.info('Bot Zalo đã đăng nhập thành công bằng QR code!');
        return api;
    } catch (qrLoginError) {
        spinner.fail('Đăng nhập bằng QR thất bại');
        bot.logger.error('Đăng nhập bằng QR thất bại:', qrLoginError.message);

        // Thử phương pháp đăng nhập QR thay thế
        return await tryAlternativeQRLogin(bot, qrPath);
    }
}

/**
 * Handle QR code data display - Modified to prevent duplicate displays
 * @param {Object|string} qrCodeData QR code data from Zalo API
 * @param {string} qrPath Path to save QR image
 * @param {Object} qrcode QR code terminal module
 * @param {Object} logger Logger object
 */
function handleQrData(qrCodeData, qrPath, qrcode, logger) {
    // Prevent duplicate QR code displays
    if (qrDisplayed) {
        logger.debug('QR code đã được hiển thị, bỏ qua hiển thị trùng lặp.');
        return;
    }

    // Set the flag to indicate QR has been displayed
    qrDisplayed = true;

    // Xử lý dữ liệu QR khác nhau
    if (typeof qrCodeData === 'string') {
        // Nếu qrCodeData là đường dẫn file
        logger.info(`Vui lòng quét mã QR tại: ${qrCodeData}`);
    } else if (qrCodeData && typeof qrCodeData === 'object') {
        // Nếu qrCodeData là object JSON
        logger.info('Đã nhận được dữ liệu QR code:');

        // Hiển thị QR token nếu có
        if (qrCodeData.data && qrCodeData.data.token) {
            const token = qrCodeData.data.token;
            logger.info(`QR Token: ${token}`);

            // Hiển thị QR code dưới dạng ASCII nếu có qrcode-terminal
            if (qrcode) {
                console.log('\n');
                qrcode.generate(token, { small: true });
                console.log('\n');
            }
        }

        // Hiển thị thông tin QR image nếu có
        if (qrCodeData.data && qrCodeData.data.image) {
            const imagePreview = qrCodeData.data.image.substring(0, 15) +
                '...' +
                qrCodeData.data.image.substring(qrCodeData.data.image.length - 15);
            logger.debug(`QR Image (Base64): ${imagePreview}`);

            // Lưu dữ liệu hình ảnh QR vào file nếu có thể
            try {
                const imgData = qrCodeData.data.image;
                if (imgData.startsWith('data:image')) {
                    // Xử lý data URL
                    const base64Data = imgData.split(',')[1];
                    writeFileSync(qrPath, Buffer.from(base64Data, 'base64'));
                } else {
                    // Giả sử là base64 thuần
                    writeFileSync(qrPath, Buffer.from(imgData, 'base64'));
                }
                logger.info(`Đã lưu QR code vào file: ${qrPath}`);
            } catch (imgError) {
                logger.error('Không thể lưu hình ảnh QR:', imgError.message);
            }
        }

        // Log object đầy đủ để debug nếu cần
        logger.debug('QR Code Data chi tiết:', JSON.stringify(qrCodeData, null, 2));
    } else {
        // Trường hợp khác, hiển thị raw data
        logger.info(`Dữ liệu QR code: ${JSON.stringify(qrCodeData, null, 2)}`);
    }

    console.log(chalk.green('Đang chờ quét mã QR...'));
}

/**
 * Try alternative QR login method
 * @param {Object} bot The ZaloBot instance
 * @param {string} qrPath Path to save QR image
 * @returns {Promise<Object|null>} The Zalo API object or null if failed
 */
async function tryAlternativeQRLogin(bot, qrPath) {
    // Reset QR display flag
    qrDisplayed = false;

    bot.logger.info('Đang thử phương pháp đăng nhập QR thay thế...');

    try {
        // Thử đăng nhập QR không chỉ định qrPath
        const api = await bot.zalo.loginQR({
            userAgent: bot.config.userAgent || '',
        }, (qrCodeData) => {
            // Sử dụng hàm xử lý QR đã được cải tiến
            handleQrData(qrCodeData, qrPath, null, bot.logger);
        });

        // Lưu cookie mới
        // saveNewCookie(api);

        bot.logger.info('Bot Zalo đã đăng nhập thành công với phương pháp QR thay thế!');
        return api;
    } catch (altQrError) {
        bot.logger.error('Cả hai phương pháp đăng nhập QR đều thất bại:', altQrError.message);
        return null;
    }
}

/**
 * Save new cookie after successful login
 * @param {Object} api Zalo API object
 */
// function saveNewCookie(api) {
//     if (api && typeof api.getContext === 'function') {
//         const context = api.getContext();
//        writeFileSync("./idxCookieJar.json", JSON.stringify(context.cookie), "utf-8");
//         const cookieJar = readFileSync("./idxCookieJar.json", "utf-8");
//         const cookie = JSON.parse(cookieJar);

//         const array = cookie.cookies.map(cookie => ({
//             domain: cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`,
//             expirationDate: cookie.expirationDate || null,
//             hostOnly: cookie.hostOnly || false,
//             httpOnly: cookie.httpOnly || false,
//             name: cookie.key,
//             path: cookie.path || '/',
//             sameSite: cookie.sameSite || 'no_restriction',
//             secure: cookie.secure || false,
//             session: cookie.session || false,
//             storeId: cookie.storeId || null,
//             value: cookie.value
//         }));
//         const filtered = array.filter(c => ['_zlang', 'zpsid', 'zpw_sek', 'app.event.zalo.me'].includes(c.name));
//         const now = new Date().toISOString();
//         const values = {
//             cookies: filtered.map(c => ({
//                 key: c.name,
//                 value: c.value,
//                 domain: c.domain?.replace(/^\./, '') || 'zalo.me',
//                 path: c.path || '/',
//                 hostOnly: false,
//                 creation: now,
//                 lastAccessed: now
//             }))
//         }
//         if (context && context.cookie) {
//             writeFileSync("./cookie.json", JSON.stringify(values), "utf-8");
//             console.log(chalk.green('✅ Đã lưu cookie mới vào file cookie.json'));

//             // Clear QR display status after successful login
//             qrDisplayed = false;

//             // Add some empty lines to visually separate the QR code from subsequent output
//             console.log('\n'.repeat(3));
//         } else {
//             console.warn('Không thể lấy cookie từ context Zalo.');
//         }
//     }
// }

export default handleLogin;