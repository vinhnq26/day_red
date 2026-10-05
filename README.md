# Ngày Đỏ

Ứng dụng React mobile-first giúp theo dõi chu kỳ kinh nguyệt riêng tư trên thiết bị.

## Chạy local

```bash
npm install
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal. Dữ liệu được lưu trong `localStorage` của trình duyệt, không cần tài khoản hay backend.

## Tính năng

- Ghi ngày bắt đầu **thực tế** của từng kỳ kinh.
- Lưu các kỳ trước và kỳ hiện tại thành những bản ghi độc lập; chỉnh một kỳ không làm thay đổi các kỳ khác.
- Chọn chu kỳ 22, 24, 28 ngày hoặc nhập số tùy chỉnh cho từng kỳ.
- Dự đoán kỳ tiếp theo từ kỳ thực tế gần nhất.
- Ghi nhật ký lượng kinh, triệu chứng và ghi chú.
- Nhắc gần tới kỳ kinh và nhắc uống đủ nước 3 lần mỗi ngày bằng thông báo trình duyệt.
- Xem, sửa, xóa lịch sử kỳ kinh.
- Giao diện tiếng Việt, tối ưu cho điện thoại.

Các thiết lập trong phần Cài đặt là mặc định cho lần ghi kỳ mới; những kỳ đã lưu vẫn giữ ngày và thông tin riêng của chúng. Dữ liệu cũ trong thiết bị được bổ sung thông tin cần thiết khi ứng dụng đọc lại.

Thông báo cần được người dùng cho phép và hoạt động đáng tin cậy nhất khi ứng dụng đang mở trên `localhost` hoặc HTTPS. EmailJS là tùy chọn trong Cài đặt; email nhắc kỳ được gửi trước ngày dự kiến theo số ngày đã chọn. Trình duyệt có thể trì hoãn timer khi tab chạy nền, nên ứng dụng không đảm bảo nhắc hoặc gửi email khi đã đóng tab. Muốn chạy đúng lịch khi ứng dụng đóng cần thêm dịch vụ máy chủ hoặc scheduler.

> Dự đoán chỉ mang tính tham khảo, không dùng để tránh thai hoặc chẩn đoán y tế.
