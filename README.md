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
- Nhắc gần tới kỳ kinh và nhắc uống đủ nước bằng thông báo local trên iPhone; bản web dùng thông báo trình duyệt.
- Xem, sửa, xóa lịch sử kỳ kinh.
- Giao diện tiếng Việt, tối ưu cho điện thoại.

Các thiết lập trong phần Cài đặt là mặc định cho lần ghi kỳ mới; những kỳ đã lưu vẫn giữ ngày và thông tin riêng của chúng. Dữ liệu cũ trong thiết bị được bổ sung thông tin cần thiết khi ứng dụng đọc lại.

Thông báo cần được người dùng cho phép. Bản iPhone dùng `@capacitor/local-notifications` để đặt lịch với iOS, nên lịch đã đặt có thể hiển thị khi app chạy nền hoặc đã đóng (không phụ thuộc timer JavaScript). Nhắc kỳ lúc 09:00 giờ địa phương theo số ngày báo trước; nhắc nước theo giờ đã lưu cho kỳ hiện tại và kỳ kế tiếp dự đoán. Tối đa 63 nhắc đang chờ, chừa một chỗ cho thông báo thử. Mở app để cập nhật dự đoán, quyền, múi giờ và lịch mới; app không đặt lịch vô hạn cho các kỳ xa. Tắt/sửa nhắc hoặc xóa dữ liệu sẽ hủy lịch không còn phù hợp. Focus, tóm tắt thông báo hoặc quyền bị tắt có thể làm thông báo không hiện banner.

Bản web vẫn dùng Notification API trên `localhost`/HTTPS và hoạt động tốt nhất khi tab đang mở. EmailJS vẫn gửi từ client khi app đang mở, không được chuyển thành dịch vụ email chạy nền; email khi đóng app cần backend/scheduler.

## Build iPhone

Dùng Node >=22.12 (khuyến nghị Node 22 LTS). Sau khi đổi code hoặc plugin:

```bash
npm run build
npx cap sync ios
npx cap open ios
```

Trong Xcode giữ nguyên Team/Bundle ID và Run lại trên từng iPhone để cập nhật. Không cần xóa app (xóa app có thể mất dữ liệu local). Trong app: Cài đặt → Cho phép thông báo → Thử thông báo, rồi khóa màn hình; thông báo thử được đặt sau 5 giây. Nếu bị từ chối, bật lại trong Cài đặt iPhone → Thông báo → Day Red.

> Dự đoán chỉ mang tính tham khảo, không dùng để tránh thai hoặc chẩn đoán y tế.
