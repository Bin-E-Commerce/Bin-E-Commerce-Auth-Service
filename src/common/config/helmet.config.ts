import type { HelmetOptions } from "helmet";

// Helmet options cho Auth Service (internal — chỉ nhận request từ API Gateway).
//
// CORS đã bị tắt (origin: false) nên CSP không cần phức tạp.
// Tuy nhiên vẫn cần các header bảo vệ cơ bản phòng trường hợp
// dev truy cập trực tiếp hoặc misconfiguration.

export function buildHelmetOptions(isDev: boolean): HelmetOptions {
  return {
    hidePoweredBy: true,
    noSniff: true,
    frameguard: { action: "deny" },
    xssFilter: true,

    // HSTS chỉ bật production, mục dích là để dev chạy HTTP cho tiện.
    // Nếu bật HSTS trong dev, trình duyệt sẽ nhớ và bắt buộc HTTPS ngay cả khi bạn chạy server dev
    hsts: isDev
      ? false
      : {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: true,
        },

    // Dev: tắt CSP để Swagger UI hoạt động
    contentSecurityPolicy: isDev
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
          },
        },

    referrerPolicy: { policy: "no-referrer" }, // Không gửi referrer ra ngoài, tránh leak URL nội bộ
    dnsPrefetchControl: { allow: false }, // Chặn DNS prefetch — giảm leak thông tin nội bộ
  };
}
