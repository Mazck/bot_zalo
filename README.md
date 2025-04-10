# 🤖 Zalo Bot NodeJS

![Zalo Bot Banner](https://via.placeholder.com/800x200)

<p align="center">
  <img src="https://img.shields.io/github/stars/your-username/zalo-bot-nodejs?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/github/forks/your-username/zalo-bot-nodejs?style=for-the-badge" alt="Forks">
  <img src="https://img.shields.io/github/issues/your-username/zalo-bot-nodejs?style=for-the-badge" alt="Issues">
  <img src="https://img.shields.io/github/license/your-username/zalo-bot-nodejs?style=for-the-badge" alt="License">
</p>

<p align="center">
  <b>✨ Một framework mạnh mẽ để xây dựng bot Zalo với NodeJS ✨</b>
</p>

## 📋 Giới thiệu

Bot Zalo NodeJS là một framework nhẹ nhàng, dễ sử dụng giúp bạn xây dựng các bot Zalo tương tác với người dùng một cách dễ dàng. Được phát triển với NodeJS, framework hỗ trợ nhiều tính năng như xử lý tin nhắn, gửi hình ảnh, sticker, và nhiều hơn nữa.

<p align="center">
  <img src="https://via.placeholder.com/600x300" alt="Demo Bot" width="600">
</p>

## ✨ Tính năng

- 🚀 **Dễ dàng khởi tạo**: Chỉ cần vài bước để bắt đầu
- 💬 **Hỗ trợ nhiều loại tin nhắn**: Text, hình ảnh, video, file...
- 🎭 **Tùy chỉnh template**: Tạo các mẫu trả lời tùy chỉnh
- 🔌 **Plugins hệ thống**: Mở rộng tính năng dễ dàng
- 🧠 **Tích hợp NLP**: Xử lý ngôn ngữ tự nhiên
- 📈 **Phân tích dữ liệu**: Thống kê tương tác người dùng
- 🔄 **Webhook tự động**: Xử lý sự kiện từ Zalo OA

## 🚀 Bắt đầu

### Cài đặt

```bash
# Sử dụng npm
npm install zalo-bot-nodejs

# Hoặc với yarn
yarn add zalo-bot-nodejs
```

### Cấu hình cơ bản

```javascript
const ZaloBot = require('zalo-bot-nodejs');

const bot = new ZaloBot({
  accessToken: 'YOUR_ZALO_ACCESS_TOKEN',
  secretKey: 'YOUR_ZALO_SECRET_KEY',
  oaId: 'YOUR_OA_ID'
});

// Lắng nghe tin nhắn văn bản
bot.onText(/xin chào|hello/i, (message) => {
  bot.sendMessage(message.sender.id, 'Xin chào! Tôi có thể giúp gì cho bạn?');
});

// Gửi hình ảnh
bot.onText(/gửi ảnh|hình ảnh/i, (message) => {
  bot.sendPhoto(message.sender.id, 'https://example.com/image.jpg', {
    caption: 'Đây là hình ảnh bạn yêu cầu!'
  });
});

// Khởi động bot
bot.startWebhook('/webhook', 3000);
console.log('Bot đã sẵn sàng hoạt động!');
```

## 📚 Tài liệu

### Xử lý tin nhắn

<details>
<summary>Xem ví dụ</summary>

```javascript
// Lắng nghe tất cả tin nhắn
bot.on('message', (message) => {
  console.log('Nhận được tin nhắn:', message);
});

// Phản hồi theo regex
bot.onText(/thời tiết (.+)/i, (message, match) => {
  const location = match[1];
  bot.sendMessage(message.sender.id, `Đang kiểm tra thời tiết tại ${location}...`);
  // Gọi API thời tiết và trả về kết quả
});
```
</details>

### Gửi đa phương tiện

<details>
<summary>Xem ví dụ</summary>

```javascript
// Gửi hình ảnh
bot.sendPhoto(userId, 'path/to/image.jpg', { caption: 'Ảnh đẹp' });

// Gửi tệp
bot.sendFile(userId, 'path/to/document.pdf', { caption: 'Tài liệu quan trọng' });

// Gửi video
bot.sendVideo(userId, 'path/to/video.mp4');

// Gửi gif động
bot.sendAnimation(userId, 'path/to/animation.gif');
```
</details>

### Tạo menu tương tác

<details>
<summary>Xem ví dụ</summary>

```javascript
bot.sendMessage(userId, 'Vui lòng chọn một tùy chọn:', {
  replyMarkup: {
    inlineKeyboard: [
      [
        { text: '👍 Tùy chọn 1', callback_data: 'option1' },
        { text: '👌 Tùy chọn 2', callback_data: 'option2' }
      ],
      [{ text: '❤️ Tùy chọn 3', callback_data: 'option3' }]
    ]
  }
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'option1') {
    bot.sendMessage(chatId, 'Bạn đã chọn tùy chọn 1!');
  } else if (data === 'option2') {
    bot.sendMessage(chatId, 'Bạn đã chọn tùy chọn 2!');
  } else {
    bot.sendMessage(chatId, 'Bạn đã chọn tùy chọn 3!');
  }
});
```
</details>

## 📊 Demo

<p align="center">
  <img src="https://via.placeholder.com/250x500" width="250" alt="Demo 1">
  <img src="https://via.placeholder.com/250x500" width="250" alt="Demo 2">
  <img src="https://via.placeholder.com/250x500" width="250" alt="Demo 3">
</p>

## 🛠️ Ví dụ nâng cao

### Bot trợ lý ảo

<details>
<summary>Xem mã</summary>

```javascript
const ZaloBot = require('zalo-bot-nodejs');
const nlpProcessor = require('./nlp-processor');

const bot = new ZaloBot({
  accessToken: process.env.ZALO_ACCESS_TOKEN,
  secretKey: process.env.ZALO_SECRET_KEY,
  oaId: process.env.ZALO_OA_ID
});

bot.on('message', async (message) => {
  if (message.type === 'text') {
    const intent = await nlpProcessor.analyze(message.text);
    
    switch (intent.name) {
      case 'greeting':
        await bot.sendMessage(message.sender.id, 'Chào bạn! Tôi là trợ lý ảo, tôi có thể giúp gì cho bạn?');
        break;
      case 'weather':
        const location = intent.entities.location || 'Hà Nội';
        await bot.sendMessage(message.sender.id, `Đang kiểm tra thời tiết tại ${location}...`);
        // Gọi API thời tiết và trả về kết quả
        break;
      default:
        await bot.sendMessage(message.sender.id, 'Xin lỗi, tôi không hiểu yêu cầu của bạn.');
    }
  }
});

bot.startWebhook('/webhook', 3000);
```
</details>

### Bot đặt lịch

<details>
<summary>Xem mã</summary>

```javascript
const ZaloBot = require('zalo-bot-nodejs');
const { createCalendarEvent } = require('./calendar-service');

const bot = new ZaloBot({
  accessToken: process.env.ZALO_ACCESS_TOKEN,
  secretKey: process.env.ZALO_SECRET_KEY,
  oaId: process.env.ZALO_OA_ID
});

const userStates = {};

bot.onText(/đặt lịch/i, (message) => {
  const userId = message.sender.id;
  userStates[userId] = { stage: 'awaiting_date' };
  
  bot.sendMessage(userId, 'Vui lòng cho tôi biết ngày bạn muốn đặt lịch (VD: 25/04/2025)');
});

bot.on('message', (message) => {
  const userId = message.sender.id;
  const state = userStates[userId];
  
  if (!state) return;
  
  if (state.stage === 'awaiting_date' && message.type === 'text') {
    // Xử lý và kiểm tra định dạng ngày
    state.date = message.text;
    state.stage = 'awaiting_time';
    
    bot.sendMessage(userId, 'Vui lòng cho tôi biết giờ bạn muốn đặt lịch (VD: 15:30)');
  } 
  else if (state.stage === 'awaiting_time' && message.type === 'text') {
    state.time = message.text;
    state.stage = 'awaiting_title';
    
    bot.sendMessage(userId, 'Vui lòng cho tôi biết tiêu đề của lịch');
  }
  else if (state.stage === 'awaiting_title' && message.type === 'text') {
    state.title = message.text;
    
    // Tạo sự kiện lịch
    createCalendarEvent(userId, state.date, state.time, state.title)
      .then(() => {
        bot.sendMessage(userId, `✅ Đã đặt lịch thành công:
- Ngày: ${state.date}
- Giờ: ${state.time}
- Tiêu đề: ${state.title}`);
      })
      .catch(error => {
        bot.sendMessage(userId, `❌ Đã xảy ra lỗi khi đặt lịch: ${error.message}`);
      })
      .finally(() => {
        // Xóa trạng thái người dùng
        delete userStates[userId];
      });
  }
});

bot.startWebhook('/webhook', 3000);
```
</details>

## 📦 Cấu trúc thư mục

```
zalo-bot-nodejs/
├── src/
│   ├── core/
│   │   ├── api.js
│   │   ├── bot.js
│   │   └── utils.js
│   ├── handlers/
│   │   ├── message.js
│   │   ├── event.js
│   │   └── callback.js
│   └── templates/
│       ├── card.js
│       └── carousel.js
├── examples/
│   ├── simple-bot.js
│   ├── interactive-menu.js
│   └── advanced-bot.js
├── tests/
├── .gitignore
├── package.json
└── README.md
```

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh! Vui lòng đọc [hướng dẫn đóng góp](CONTRIBUTING.md) để biết thêm chi tiết.

## 📝 Giấy phép

Dự án này được cấp phép theo giấy phép MIT - Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

## 💖 Hỗ trợ

<p align="center">
  <a href="https://github.com/your-username/zalo-bot-nodejs/issues">Báo cáo lỗi</a> •
  <a href="https://github.com/your-username/zalo-bot-nodejs/discussions">Thảo luận</a> •
  <a href="mailto:support@example.com">Email hỗ trợ</a>
</p>

<p align="center">
  <img src="https://via.placeholder.com/500x100" alt="Footer Banner">
</p>

---

<p align="center">
  Được phát triển bởi <a href="https://github.com/your-username">Tên của bạn</a> với ❤️
</p>
