# Game Đánh Bài Online 13 Lá

Game đánh bài online chạy thật trên trình duyệt.

## Tính năng

- Đăng nhập bằng tên người chơi
- Tạo phòng chơi
- Vào phòng chơi
- Chơi realtime bằng Socket.IO
- Lưu database bằng SQLite
- Tự tạo database và dữ liệu mẫu
- Mỗi người được chia 13 lá bài Tây
- Đánh bài, bỏ lượt, reset ván
- Lưu chip, số trận thắng, số trận thua

## Công nghệ

- HTML
- CSS
- JavaScript
- Node.js
- Express
- Socket.IO
- SQLite

## Cài đặt

```bash
npm install
npm run seed
npm start
```

Mở trình duyệt:

```txt
http://localhost:3000
```

## Test nhiều người chơi

Mở nhiều tab trình duyệt và đăng nhập bằng các tên khác nhau:

```txt
Hai
Minh
An
Linh
```

Hoặc dùng nhiều máy cùng Wi-Fi và truy cập IP của máy chạy server, ví dụ:

```txt
http://192.168.1.10:3000
```

## Cách đưa lên GitHub

```bash
git init
git add .
git commit -m "Add online 13-card game"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

## Cách deploy online

Có thể deploy lên Render, Railway, Fly.io hoặc VPS.

Start command:

```bash
npm start
```

Build command:

```bash
npm install
```

Lần đầu deploy cần chạy seed database:

```bash
npm run seed
```

## Luật game trong bản này

Bản này là luật đơn giản để dễ học code:

- Mỗi người có 13 lá
- Có thể đánh 1 lá, đôi, ba lá, bốn lá cùng số
- Người sau phải đánh cùng số lượng lá
- Bài sau phải lớn hơn bài trước
- Thứ tự số: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
- Thứ tự chất: ♠ < ♣ < ♦ < ♥
- Ai hết bài trước thì thắng

## Gợi ý nâng cấp

- Thêm đăng ký mật khẩu
- Thêm chat trong phòng
- Thêm đặt cược chip
- Thêm luật Tiến Lên đầy đủ
- Thêm sảnh, đôi thông, tứ quý, chặt heo
- Thêm bảng xếp hạng
- Thêm phòng riêng có mật khẩu
