# <div align="center">🤖 Zalo Bot NodeJS</div>

<div align="center">
  <img src="https://via.placeholder.com/800x300" alt="Zalo Bot Banner">
</div>

<div align="center">
  
  [![Stars](https://img.shields.io/github/stars/your-username/zalo-bot-nodejs?style=for-the-badge&color=gold)](https://github.com/your-username/zalo-bot-nodejs/stargazers)
  [![Forks](https://img.shields.io/github/forks/your-username/zalo-bot-nodejs?style=for-the-badge&color=blue)](https://github.com/your-username/zalo-bot-nodejs/network/members)
  [![Issues](https://img.shields.io/github/issues/your-username/zalo-bot-nodejs?style=for-the-badge&color=red)](https://github.com/your-username/zalo-bot-nodejs/issues)
  [![License](https://img.shields.io/github/license/your-username/zalo-bot-nodejs?style=for-the-badge&color=green)](LICENSE)
  
</div>

<p align="center">
  <a href="#-giới-thiệu">Giới thiệu</a> •
  <a href="#-tính-năng-chính">Tính năng</a> •
  <a href="#-cài-đặt">Cài đặt</a> •
  <a href="#-hướng-dẫn-sử-dụng">Hướng dẫn</a> •
  <a href="#-ví-dụ">Ví dụ</a> •
  <a href="#-đóng-góp">Đóng góp</a>
</p>

<div align="center">
  <h3>✨ Framework nhẹ, mạnh mẽ để xây dựng Bot Zalo tương tác ✨</h3>
</div>

<br>

<div align="center">
  <img src="https://via.placeholder.com/700x350" alt="Bot Demo Animation" width="700">
</div>

## 🌟 Giới thiệu

**Zalo Bot NodeJS** là framework hiện đại giúp bạn xây dựng các ứng dụng chatbot cho nền tảng Zalo một cách nhanh chóng và hiệu quả. Được phát triển với NodeJS, framework này được tối ưu hóa để tạo trải nghiệm tương tác mượt mà và phong phú cho người dùng Zalo.

<div align="center">
  <img src="https://via.placeholder.com/500x300" alt="Features Animation" width="500">
</div>

## ✨ Tính năng chính

<table align="center">
  <tr>
    <td align="center" width="100">
      <img src="https://via.placeholder.com/100" width="60" height="60"><br>
      <strong>🚀<br>Dễ dùng</strong>
    </td>
    <td align="center" width="100">
      <img src="https://via.placeholder.com/100" width="60" height="60"><br>
      <strong>💬<br>Đa phương tiện</strong>
    </td>
    <td align="center" width="100">
      <img src="https://via.placeholder.com/100" width="60" height="60"><br>
      <strong>🧠<br>NLP</strong>
    </td>
    <td align="center" width="100">
      <img src="https://via.placeholder.com/100" width="60" height="60"><br>
      <strong>🔌<br>Plugin</strong>
    </td>
    <td align="center" width="100">
      <img src="https://via.placeholder.com/100" width="60" height="60"><br>
      <strong>📊<br>Analytics</strong>
    </td>
  </tr>
</table>

- **🚀 Khởi tạo nhanh chóng** - Chỉ cần vài dòng code để tạo bot hoạt động
- **💬 Hỗ trợ đa dạng định dạng** - Text, hình ảnh, video, file, GIF, sticker...
- **🎭 Template tinh chỉnh** - Tạo giao diện tương tác phong phú, sinh động
- **🧠 Tích hợp NLP** - Hiểu ý định người dùng với xử lý ngôn ngữ tự nhiên
- **📱 Responsive** - Tối ưu trải nghiệm trên mọi thiết bị
- **🔌 Plugins mở rộng** - Dễ dàng thêm tính năng mới
- **📊 Phân tích dữ liệu** - Dashboard thống kê tương tác chi tiết
- **🔄 Webhook tự động** - Xử lý sự kiện từ Zalo OA một cách hiệu quả

## 📥 Cài đặt

```bash
# Sử dụng npm
npm install zalo-bot-nodejs

# Sử dụng yarn
yarn add zalo-bot-nodejs

# Sử dụng pnpm
pnpm add zalo-bot-nodejs
```

<div align="center">
  <img src="https://via.placeholder.com/500x200" alt="Installation Animation" width="500">
</div>

## 🚀 Hướng dẫn sử dụng

### Khởi tạo bot cơ bản

```javascript
const ZaloBot = require('zalo-bot-nodejs');

// Khởi tạo bot với thông tin xác thực
const bot = new ZaloBot({
  accessToken: 'YOUR_ZALO_ACCESS_TOKEN',
  secretKey: 'YOUR_ZALO_SECRET_KEY',
  oaId: 'YOUR_OA_ID'
});

// Lắng nghe tin nhắn và phản hồi
bot.onText(/xin chào|hello/i, (message) => {
  bot.sendMessage(message.sender.id, '👋 Xin chào! Tôi có thể giúp gì cho bạn?');
});

// Khởi động webhook server
bot.startWebhook('/webhook', 3000);
console.log('🤖 Bot đã sẵn sàng hoạt động!');
```

### Gửi tin nhắn với các phương tiện phong phú

```javascript
// Gửi hình ảnh với caption
bot.sendPhoto(userId, 'https://example.com/image.jpg', {
  caption: '🌄 Đây là hình ảnh tuyệt đẹp!'
});

// Gửi carousel sản phẩm
bot.sendCarousel(userId, [
  {
    title: 'Sản phẩm 1',
    subtitle: 'Mô tả ngắn gọn',
    imageUrl: 'https://example.com/product1.jpg',
    buttons: [
      { title: 'Xem chi tiết', type: 'url', payload: 'https://example.com/product1' },
      { title: 'Mua ngay', type: 'callback', payload: 'buy_product_1' }
    ]
  },
  {
    title: 'Sản phẩm 2',
    subtitle: 'Mô tả ngắn gọn',
    imageUrl: 'https://example.com/product2.jpg',
    buttons: [
      { title: 'Xem chi tiết', type: 'url', payload: 'https://example.com/product2' },
      { title: 'Mua ngay', type: 'callback', payload: 'buy_product_2' }
    ]
  }
]);
```

<div align="center">
  <img src="https://via.placeholder.com/700x400" alt="Rich Media Animation" width="700">
</div>

## 🎮 Ví dụ

### Ví dụ 1: Bot trợ lý

<div align="center">
  <img src="https://via.placeholder.com/700x350" alt="Assistant Bot Demo" width="700">
</div>

```javascript
const ZaloBot = require('zalo-bot-nodejs');
const nlpProcessor = require('./nlp-processor');

const bot = new ZaloBot({
  accessToken: process.env.ZALO_ACCESS_TOKEN,
  secretKey: process.env.ZALO_SECRET_KEY,
  oaId: process.env.ZALO_OA_ID
});

// Xử lý tin nhắn với NLP
bot.on('message', async (message) => {
  if (message.type === 'text') {
    // Phân tích ý định của người dùng
    const intent = await nlpProcessor.analyze(message.text);
    
    switch (intent.name) {
      case 'greeting':
        await bot.sendMessage(message.sender.id, '👋 Chào bạn! Tôi là trợ lý ảo, tôi có thể giúp gì cho bạn?');
        break;
      case 'weather':
        const location = intent.entities.location || 'Hà Nội';
        await bot.sendMessage(message.sender.id, `🌤️ Đang kiểm tra thời tiết tại ${location}...`);
        // Gọi API thời tiết và trả về kết quả
        const weatherData = await getWeatherData(location);
        await bot.sendMessage(message.sender.id, `
          🌡️ Nhiệt độ: ${weatherData.temperature}°C
          💧 Độ ẩm: ${weatherData.humidity}%
          🌬️ Gió: ${weatherData.windSpeed} km/h
        `);
        break;
      default:
        await bot.sendMessage(message.sender.id, '❓ Xin lỗi, tôi không hiểu yêu cầu của bạn.');
    }
  }
});

bot.startWebhook('/webhook', 3000);
```

### Ví dụ 2: Bot đặt hàng

<div align="center">
  <img src="https://via.placeholder.com/700x400" alt="Order Bot Demo" width="700">
</div>

```javascript
const ZaloBot = require('zalo-bot-nodejs');
const { processOrder, generateOrderId } = require('./order-service');

const bot = new ZaloBot({
  accessToken: process.env.ZALO_ACCESS_TOKEN,
  secretKey: process.env.ZALO_SECRET_KEY,
  oaId: process.env.ZALO_OA_ID
});

// Lưu trạng thái đặt hàng của người dùng
const userCarts = {};

// Bắt đầu quy trình đặt hàng
bot.onText(/đặt hàng|mua hàng/i, (message) => {
  const userId = message.sender.id;
  
  // Khởi tạo giỏ hàng mới
  userCarts[userId] = { 
    items: [],
    stage: 'browsing'
  };
  
  // Hiển thị danh mục sản phẩm
  bot.sendCarousel(userId, [
    {
      title: '🍔 Thực phẩm',
      subtitle: 'Món ăn và đồ uống',
      imageUrl: 'https://example.com/food.jpg',
      buttons: [{ title: 'Xem', type: 'callback', payload: 'category_food' }]
    },
    {
      title: '👕 Thời trang',
      subtitle: 'Quần áo và phụ kiện',
      imageUrl: 'https://example.com/fashion.jpg',
      buttons: [{ title: 'Xem', type: 'callback', payload: 'category_fashion' }]
    },
    {
      title: '📱 Điện tử',
      subtitle: 'Thiết bị điện tử',
      imageUrl: 'https://example.com/electronics.jpg',
      buttons: [{ title: 'Xem', type: 'callback', payload: 'category_electronics' }]
    }
  ]);
});

// Xử lý lựa chọn danh mục
bot.on('callback_query', async (query) => {
  const userId = query.sender.id;
  const data = query.data;
  
  if (data.startsWith('category_')) {
    const category = data.split('_')[1];
    const products = await getProductsByCategory(category);
    
    // Hiển thị sản phẩm trong danh mục
    const productCarousel = products.map(product => ({
      title: product.name,
      subtitle: `${product.price.toLocaleString('vi-VN')}đ`,
      imageUrl: product.imageUrl,
      buttons: [
        { title: 'Chi tiết', type: 'url', payload: product.detailUrl },
        { title: 'Thêm vào giỏ', type: 'callback', payload: `add_to_cart_${product.id}` }
      ]
    }));
    
    bot.sendCarousel(userId, productCarousel);
  }
  else if (data.startsWith('add_to_cart_')) {
    const productId = data.split('_').pop();
    const product = await getProductById(productId);
    
    // Thêm vào giỏ hàng
    if (!userCarts[userId]) userCarts[userId] = { items: [], stage: 'browsing' };
    userCarts[userId].items.push(product);
    
    bot.sendMessage(userId, `✅ Đã thêm ${product.name} vào giỏ hàng!`, {
      replyMarkup: {
        inlineKeyboard: [
          [{ text: '🛒 Xem giỏ hàng', callback_data: 'view_cart' }],
          [{ text: '🏪 Tiếp tục mua sắm', callback_data: 'continue_shopping' }]
        ]
      }
    });
  }
  else if (data === 'view_cart') {
    const cart = userCarts[userId];
    
    if (!cart || cart.items.length === 0) {
      bot.sendMessage(userId, '🛒 Giỏ hàng của bạn đang trống.');
      return;
    }
    
    // Hiển thị giỏ hàng
    const cartItems = cart.items.map((item, index) => 
      `${index + 1}. ${item.name} - ${item.price.toLocaleString('vi-VN')}đ`
    ).join('\n');
    
    const totalAmount = cart.items.reduce((sum, item) => sum + item.price, 0);
    
    bot.sendMessage(userId, `🛒 Giỏ hàng của bạn:\n\n${cartItems}\n\n💰 Tổng tiền: ${totalAmount.toLocaleString('vi-VN')}đ`, {
      replyMarkup: {
        inlineKeyboard: [
          [{ text: '💳 Thanh toán', callback_data: 'checkout' }],
          [{ text: '🗑️ Xóa giỏ hàng', callback_data: 'clear_cart' }],
          [{ text: '🏪 Tiếp tục mua sắm', callback_data: 'continue_shopping' }]
        ]
      }
    });
  }
  // Xử lý các hành động khác...
});

bot.startWebhook('/webhook', 3000);

// Các hàm helper
async function getProductsByCategory(category) {
  // Lấy sản phẩm từ database theo danh mục
}

async function getProductById(productId) {
  // Lấy thông tin sản phẩm từ database theo ID
}
```

## 📊 Demo Hoạt Động

<div align="center">
  <img src="https://via.placeholder.com/250x500" width="250" alt="Demo 1">
  <img src="https://via.placeholder.com/250x500" width="250" alt="Demo 2">
  <img src="https://via.placeholder.com/250x500" width="250" alt="Demo 3">
</div>

## 📋 Tài liệu API

<details>
<summary><b>💬 Xử lý tin nhắn</b></summary>

```javascript
// Lắng nghe tất cả tin nhắn
bot.on('message', (message) => {
  console.log('Nhận được tin nhắn:', message);
});

// Lắng nghe tin nhắn text với Regex
bot.onText(/^hello|xin chào$/i, (message) => {
  bot.sendMessage(message.sender.id, 'Xin chào! 👋');
});

// Lắng nghe theo type của tin nhắn
bot.onMessageType('image', (message) => {
  bot.sendMessage(message.sender.id, 'Cảm ơn bạn đã gửi hình ảnh! 📸');
});

// Lắng nghe follow/unfollow
bot.on('follow', (event) => {
  bot.sendMessage(event.user_id, 'Cảm ơn bạn đã theo dõi OA! 🎉');
});
```
</details>

<details>
<summary><b>📤 Gửi tin nhắn</b></summary>

```javascript
// Gửi tin nhắn text đơn giản
bot.sendMessage(userId, 'Xin chào! 👋');

// Gửi hình ảnh
bot.sendPhoto(userId, 'https://example.com/image.jpg', {
  caption: 'Ảnh đẹp! 🌄'
});

// Gửi file
bot.sendFile(userId, 'https://example.com/document.pdf', {
  caption: 'Tài liệu quan trọng 📄'
});

// Gửi video
bot.sendVideo(userId, 'https://example.com/video.mp4', {
  caption: 'Video hướng dẫn 🎬'
});

// Gửi audio
bot.sendAudio(userId, 'https://example.com/audio.mp3', {
  caption: 'Bài hát hay 🎵'
});

// Gửi location
bot.sendLocation(userId, 10.7756587, 106.7004238, {
  label: 'Văn phòng của chúng tôi 📍'
});
```
</details>

<details>
<summary><b>🎨 Templates tương tác</b></summary>

```javascript
// Gửi tin nhắn với buttons
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

// Gửi list template
bot.sendList(userId, {
  title: 'Danh sách sản phẩm',
  items: [
    { title: 'Sản phẩm 1', subtitle: 'Mô tả ngắn gọn', imageUrl: 'https://example.com/product1.jpg' },
    { title: 'Sản phẩm 2', subtitle: 'Mô tả ngắn gọn', imageUrl: 'https://example.com/product2.jpg' },
    { title: 'Sản phẩm 3', subtitle: 'Mô tả ngắn gọn', imageUrl: 'https://example.com/product3.jpg' }
  ],
  buttons: [
    { title: 'Xem tất cả', type: 'url', payload: 'https://example.com/products' }
  ]
});

// Gửi form template
bot.sendForm(userId, {
  title: 'Đăng ký nhận tin',
  fields: [
    { type: 'text', label: 'Họ tên', required: true },
    { type: 'email', label: 'Email', required: true },
    { type: 'phone', label: 'Số điện thoại', required: false }
  ],
  submitButton: 'Đăng ký',
  cancelButton: 'Hủy'
});
```
</details>

## 📦 Cấu trúc thư mục

```
zalo-bot-nodejs/
├── src/
│   ├── core/
│   │   ├── api.js        # Tương tác với Zalo API
│   │   ├── bot.js        # Class Bot chính
│   │   └── utils.js      # Các tiện ích
│   ├── handlers/
│   │   ├── message.js    # Xử lý tin nhắn
│   │   ├── event.js      # Xử lý sự kiện
│   │   └── callback.js   # Xử lý callback
│   ├── templates/
│   │   ├── basic.js      # Templates cơ bản
│   │   ├── card.js       # Card templates
│   │   └── carousel.js   # Carousel templates
│   └── plugins/
│       ├── nlp.js        # Plugin NLP
│       └── analytics.js  # Plugin thống kê
├── examples/
│   ├── simple-bot.js     # Bot đơn giản
│   ├── restaurant-bot.js # Bot nhà hàng
│   └── shopping-bot.js   # Bot mua sắm
├── tests/
├── docs/
├── .gitignore
├── package.json
└── README.md
```

## 🌈 Demo Trực Quan

<div align="center">
  <img src="https://via.placeholder.com/800x450" alt="Visual Demo" width="800">
</div>

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh! Xem [hướng dẫn đóng góp](CONTRIBUTING.md) để biết thêm chi tiết.

<div align="center">
  <img src="https://via.placeholder.com/500x200" alt="Contributing Animation" width="500">
</div>

## 📄 Giấy phép

Dự án này được cấp phép theo giấy phép MIT - Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

## 💖 Hỗ trợ

<p align="center">
  <a href="https://github.com/your-username/zalo-bot-nodejs/issues">🐞 Báo cáo lỗi</a> •
  <a href="https://github.com/your-username/zalo-bot-nodejs/discussions">💬 Thảo luận</a> •
  <a href="mailto:support@example.com">📧 Email hỗ trợ</a>
</p>

<div align="center">
  <img src="https://via.placeholder.com/600x100" alt="Support Banner" width="600">
</div>

---

<div align="center">
  <h3>🚀 Xây dựng bot Zalo của bạn ngay hôm nay!</h3>
  <p>Được phát triển với ❤️ bởi <a href="https://github.com/your-username">Tên của bạn</a></p>
  
  <a href="https://www.npmjs.com/package/zalo-bot-nodejs">
    <img src="https://img.shields.io/npm/v/zalo-bot-nodejs?style=for-the-badge&color=orange" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/zalo-bot-nodejs">
    <img src="https://img.shields.io/npm/dt/zalo-bot-nodejs?style=for-the-badge&color=blue" alt="NPM Downloads">
  </a>
</div>
