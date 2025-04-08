import ZaloBot from './core/bot.js';
import { defaultLogger } from './utils/logger.js';

(async () => {
    try {
        defaultLogger.info('🚀 Đang khởi động bot Zalo...');
         new ZaloBot().init();
    } catch (error) {
        defaultLogger.exception('❌ Lỗi khởi động bot:', error);
        process.exit(1); // Thoát chương trình nếu lỗi nghiêm trọng
    }
})();