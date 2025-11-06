# booking-api-gateway — README (chi tiết, dễ hiểu)

> **Mục tiêu**: API Gateway (NestJS) làm *entry point* cho hệ thống Booking.
> Chức năng chính: xác thực JWT (RS256), proxy request tới các microservice (auth, booking, user, payment), logging/trace, rate-limit, retry + circuit-breaker, health & metrics.

Công nghệ chính: NestJS (Node.js framework).
Dùng @nestjs/axios để gọi sang các service con (auth-service, booking-service, payment-service).
Dùng @nestjs/config để lấy config (URL của từng service).
Tổ chức controller/proxy theo từng domain (auth.proxy, booking.proxy, payment.proxy).
Nó giống 1 API Gateway custom chứ chưa phải Kong hay Traefik gì cả.

---

## Mục lục

1. Tổng quan & kiến trúc
2. Cài đặt nhanh (dev + docker)
3. Biến môi trường (`.env`) mẫu
4. Cấu trúc file & mô tả ngắn từng file quan trọng
5. Chạy & test bằng Postman / curl (register → login → gọi API bảo vệ)
6. Security notes (RSA keys, secrets)
7. Production checklist / best practices
8. Troubleshooting phổ biến

---

# 1. Tổng quan & kiến trúc

Gateway này được thiết kế theo phong cách enterprise-light:

* **Xác thực**: Verify Access Token (RS256) bằng `public.pem` từ `auth-service` → Gateway không gọi auth-service để validate mỗi request (hiệu năng cao).
* **Proxy/Forward**: Tách controller theo domain: `/auth/*`, `/bookings/*`, `/payment/*`, `/users/*`. Mỗi controller forward request sang upstream tương ứng.
* **Resilience**: `axios` + `axios-retry` cho retry, `opossum` (circuit breaker) cho upstream calls.
* **Cross-cutting**: correlation-id, secure headers, structured logging (JSON), global exception filter.
* **Rate limiting**: via `@nestjs/throttler` (cấu hình TTL + limit).
* **Observability**: healthz (`/healthz`) và placeholder metrics (`/metrics`) (có thể mở rộng `prom-client`).

Luồng cơ bản (ví dụ `/bookings/create`):

```
Client -> API Gateway (verify JWT) -> upstream.booking-service -> Gateway copy response -> Client
```

---

# 2. Cài đặt nhanh

### Yêu cầu

* Node.js 18+ (dev)
* npm / yarn
* (Tùy) Docker & docker-compose

### Clone & cài deps

```bash
git clone <repo>/booking-api-gateway
cd booking-api-gateway
npm install
```

### Chạy local (dev)

Giả sử bạn chạy `auth-service` bằng `npm run dev` tại `http://localhost:4000`:

* Tạo `.env` theo bước tiếp theo.
* Start gateway (dev):

```bash
npm run start:dev    # or ts-node -r tsconfig-paths/register src/main.ts
```

### Build & run (production-ish)

```bash
npm run build
npm start             # chạy dist/main.js
```

### Docker (quick demo with mocks as provided)

(Nếu repo có `docker-compose.yml` demo)

```bash
docker compose up --build
# gateway: http://localhost:4000 (ví dụ), mocks: auth, booking...
```

---

# 3. `.env.example` (mẫu)

```env
# Gateway
PORT=4000

# Upstream services (cấu hình theo nơi bạn chạy auth/booking)
AUTH_SERVICE_URL=http://localhost:4000   # nếu auth-service chạy local:4000
BOOKING_SERVICE_URL=http://localhost:4001
USER_SERVICE_URL=http://localhost:4002
PAYMENT_SERVICE_URL=http://localhost:4003

# JWT public key (path to pem) - gateway dùng để verify RS256 tokens
JWT_PUBLIC_KEY_PATH=./keys/public.pem

# Rate limit
RATE_LIMIT_TTL=60
RATE_LIMIT_REQ=100

# Circuit breaker / axios-retry optional params
AXIOS_TIMEOUT_MS=10000
AXIOS_RETRIES=2
CIRCUIT_RESET_MS=30000
```

> **Lưu ý**: nếu bạn mount nội dung public key trực tiếp (ví dụ trong Docker secrets), có thể set `JWT_PUBLIC_KEY` env thay vì file path.

---

# 4. Cấu trúc file & mô tả ngắn

```
src/
├─ main.ts                         # bootstrap app (cookieParser, global interceptors)
├─ app.module.ts                   # imports, middlewares, providers
├─ config/
│   └─ config.service.ts           # wrapper lấy config từ env
├─ utils/
│   └─ publicKey.util.ts           # load public key (env or file)
├─ common/
│   ├─ middleware/
│   │   ├─ correlation-id.middleware.ts
│   │   └─ secure-headers.middleware.ts
│   ├─ guards/
│   │   └─ jwt.guard.ts            # verify RS256 token, attach req.user, set x-user-* headers
│   ├─ interceptors/
│   │   └─ logging.interceptor.ts  # structured logs + timing
│   └─ filters/
│       └─ http-exception.filter.ts # uniform error format
├─ services/
│   └─ upstream.service.ts         # axios clients + axios-retry + opossum (circuit breaker)
└─ proxy/
    ├─ auth.proxy.controller.ts
    ├─ booking.proxy.controller.ts
    ├─ payment.proxy.controller.ts
    └─ user.proxy.controller.ts
```

**Mô tả ngắn những file quan trọng**

* `jwt.guard.ts` — đọc `Authorization` header, verify token bằng `public.pem` (RS256); nếu valid attach `req.user` và headers như `x-user-id` để upstream sử dụng.
* `upstream.service.ts` — tạo axios client cho mỗi upstream, bật retry và circuit breaker, expose `forwardRequest(serviceName, path, method, body, headers)` để controller gọi.
* `proxy/*` — mỗi controller gọi `upstream.forwardRequest('auth'|'booking'...)`. Public routes (auth/register/login) không cần `JwtGuard`; protected routes (booking/payment/user) gắn `@UseGuards(JwtGuard)`.
* `correlation-id` — gắn header `x-correlation-id` nếu chưa có, set response header để trace.
* `logging.interceptor` — log JSON object: event request/response, correlation id, status, duration.

---

# 5. Cách test bằng Postman (Register → Login → Gọi API bảo vệ) — qua Gateway

Giả sử:

* Gateway: `http://localhost:3000`
* Auth service: `http://localhost:4000` (đã chạy `npm run dev`)

### 5.1. Register (qua Gateway)

**Request**

```
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "email": "user1@example.com",
  "password": "123456",
  "name": "User One"
}
```

**Expected**: status `201`/`200` with user info (tùy implement auth-service). Gateway sẽ forward sang `AUTH_SERVICE_URL + /auth/register`.

---

### 5.2. Login (qua Gateway)

**Request**

```
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "user1@example.com",
  "password": "123456"
}
```

**Expected response**

```json
{
  "accessToken": "<JWT_ACCESS_TOKEN>",
  "refreshToken": "<REFRESH_TOKEN>"
}
```

* Lưu `accessToken` vào Postman environment `{{accessToken}}`.

---

### 5.3. Gọi API bảo vệ (ví dụ tạo booking)

**Request**

```
POST http://localhost:3000/bookings/create
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "roomId": "room-uuid",
  "from": "2025-10-01",
  "to": "2025-10-05"
}
```

**Flow**:

* Gateway `JwtGuard` verify token (public key). Nếu hợp lệ, attach `req.user` và thêm headers `x-user-id`, `x-user-email`.
* Gateway forward request sang `BOOKING_SERVICE_URL + /bookings/create`.
* Booking service nhận header `x-user-id` và xử lý.

---

### 5.4. Refresh token (qua Gateway)

**Request**

```
POST http://localhost:3000/auth/refresh
Content-Type: application/json

{ "refreshToken": "<REFRESH_TOKEN>" }
```

Gateway forward sang auth-service refresh endpoint; auth-service thực hiện rotation + trả access + refresh mới.

---

# 6. Security notes & RSA keys

### Tạo key (dev)

Chạy:

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

* **private.pem**: *không* commit vào repo — chỉ auth-service dùng để sign JWT.
* **public.pem**: copy/mount vào API Gateway (đường dẫn `JWT_PUBLIC_KEY_PATH`) để verify token.

### Production

* Lưu keys & secrets ở Secret Manager (AWS Secrets Manager, Vault, Kubernetes Secrets), không lưu trong repo.
* Dùng RS256 (asymmetric) thay vì HS256 cho access tokens trong microservices lớn.

---

# 7. Production checklist / Best practices

* **Secrets**: store private key + DB passwords in Vault / Cloud Secrets.
* **TLS**: terminate TLS at Load Balancer / ingress; enforce HTTPS.
* **Rate limiting**: use Redis-backed limiter for multi-instance gateway.
* **Service discovery**: use k8s Service DNS or Consul for dynamic upstream addresses.
* **Tracing**: add OpenTelemetry / Jaeger and propagate trace headers (`traceparent`).
* **Metrics**: instrument Prometheus metrics: request_count, latency histogram, circuit breaker state, upstream successes/errors.
* **Logging**: structured logs (JSON) with correlation-id; ship to ELK/EFK.
* **Health/readiness**: gateway readiness should check (optionally) critical upstreams.
* **Scaling**: run multiple gateway replicas behind LB; use sticky sessions only if necessary.
* **Api versioning**: organize routes with `/v1/` `/v2/` if you need backward compatibility.

---

# 8. Troubleshooting (phổ biến)

### 1) Nest error: `Nest can't resolve dependencies of the UpstreamService (HttpService, ?). Please make sure that the argument ConfigService...`

**Nguyên nhân**: `ConfigModule` chưa import hoặc không isGlobal.
**Fix**: trong `app.module.ts`, import:

```ts
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule, // nếu dùng HttpService
    ...
  ],
})
export class AppModule {}
```

### 2) `Cannot load public key` / `JWT verify failed`

* Kiểm tra `JWT_PUBLIC_KEY_PATH` đúng file `public.pem` (đúng nội dung PEM).
* Nếu chạy docker, mount `keys` vào container (`volumes: - ./keys:/app/keys:ro`).

### 3) Gateway không forward hoặc lỗi CORS

* Kiểm tra `UpstreamService` base URLs trong `.env`.
* Nếu Upstream trả redirect → ensure `followRedirect` hoặc set `maxRedirects` cho axios.

### 4) 502 / upstream unavailable (circuit breaker open)

* Kiểm tra logs: opossum sẽ log `circuit opened`.
* Kiểm tra upstream service có chạy, response time, hoặc lỗi. Tăng `resetTimeout`/`timeout` nếu cần.

---

# 9. Một số config gợi ý để tuning

* `AXIOS_TIMEOUT_MS` — timeout request upstream (ms)
* `AXIOS_RETRIES` — số lần retry (network/idempotent)
* `CIRCUIT_RESET_MS` — thời gian opossum reset (ms)
* `RATE_LIMIT_TTL`, `RATE_LIMIT_REQ` — điều chỉnh theo traffic

---

# 10. Quick reference — các endpoint mặc định (gateway)

* `GET  /healthz` → health check
* `GET  /metrics` → Prometheus metrics (nếu bật)
* `POST /auth/register` → forwarded to auth-service
* `POST /auth/login` → forwarded to auth-service
* `POST /auth/refresh` → forwarded to auth-service
* `ALL  /bookings/*` → forwarded to booking-service (protected by JwtGuard)
* `ALL  /payment/*` → forwarded to payment-service (protected)
* `ALL  /users/*` → forwarded to user-service (protected)

---

## Kết

README này nên đủ để bạn làm việc: chạy gateway, map upstream đúng, test register/login qua gateway bằng Postman, và biết các điểm cần chú ý khi deploy vào production.

Muốn mình:

* **(A)** paste toàn bộ file `auth.proxy.controller.ts` / `booking.proxy.controller.ts` / `upstream.service.ts` + `app.module.ts` hoàn chỉnh ready-to-run?
* **(B)** tạo sẵn Postman Collection JSON cho flow Register → Login → Call Booking qua Gateway?
  Hãy chọn 1 (mình sẽ dán code/collection ngay).
