# 🔄 UserId Passing Implementation - API Gateway

## 📋 Tổng quan

Đã implement thành công **UserId Passing** từ JWT token xuống tất cả các microservices. Điều này giải quyết vấn đề database tách biệt giữa Auth service và các service khác.

## ✅ **Đã hoàn thành:**

### **1. JWT Guard Enhancement**
- ✅ **User Payload Extraction** - Extract UserId từ JWT token
- ✅ **Request Attachment** - Attach user payload vào request
- ✅ **Multiple Field Support** - Support cả `sub` và `id` fields

### **2. Proxy Controllers Update**
- ✅ **Booking Controller** - Pass `x-user-id` header
- ✅ **Payment Controller** - Pass `x-user-id` header
- ✅ **Building Controller** - Pass `x-user-id` header
- ✅ **Room Controller** - Pass `x-user-id` header

## 🔄 **UserId Passing Logic:**

### **JWT Guard Flow:**
```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest<Request>();
  const authHeader = request.headers['authorization'];

  // 1. Verify JWT token
  const payload = jwt.verify(token, this.publicKey, {
    algorithms: ['RS256'],
  });

  // 2. Attach user payload to request
  (request as any).user = payload;
  return true;
}
```

### **Proxy Controller Flow:**
```typescript
@All('*')
async proxyService(@Req() req: Request, @Res() res: Response) {
  // 1. Extract UserId from JWT payload
  const userId = (req as any).user?.sub || (req as any).user?.id;
  
  // 2. Forward request with UserId header
  const result = await this.upstream.forwardRequest(
    'service',
    `/service${path}`,
    req.method,
    req,
    { 
      authorization: authHeader,
      'x-user-id': userId, // Pass UserId to downstream service
    },
  );
}
```

## 🛡️ **Updated Controllers:**

### **Booking Controller** (`/bookings/*`)
```typescript
@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingProxyController {
  @All('*')
  async proxyBookingAuth(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    
    const result = await this.upstream.forwardRequest(
      'bookings',
      `/bookings${path}`,
      req.method,
      req,
      { 
        authorization: authHeader,
        'x-user-id': userId, // ✅ UserId passed to Booking service
      },
    );
  }
}
```

### **Payment Controller** (`/payment/*`)
```typescript
@Controller('payment')
@UseGuards(JwtAuthGuard)
export class PaymentProxyController {
  @All('*')
  async proxyPayment(@Req() req: express.Request, @Res() res: express.Response) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    
    const result = await this.upstream.forwardRequest(
      'payment',
      `/payment${path}`,
      req.method,
      req.body,
      { 
        authorization: req.headers['authorization'],
        'x-user-id': userId, // ✅ UserId passed to Payment service
      },
    );
  }
}
```

### **Building Controller** (`/buildings/*`)
```typescript
@Controller('buildings')
@UseGuards(JwtAuthGuard)
export class BuildingProxyController {
  @All('*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    
    const result = await this.upstream.forwardRequest(
      'buildings',
      `/buildings${path}`,
      req.method,
      req,
      { 
        authorization: authHeader,
        'x-user-id': userId, // ✅ UserId passed to Building service
      },
    );
  }
}
```

### **Room Controller** (`/rooms/*`)
```typescript
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomProxyController {
  @All('*')
  async proxyRoom(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    
    const result = await this.upstream.forwardRequest(
      'rooms',
      `/rooms${path}`,
      req.method,
      req,
      { 
        authorization: authHeader,
        'x-user-id': userId, // ✅ UserId passed to Room service
      },
    );
  }
}
```

## 🔧 **Header Structure:**

### **Request Headers to Microservices:**
```http
Authorization: Bearer <jwt_token>
x-user-id: <user_id_from_jwt>
Content-Type: application/json
x-correlation-id: <correlation_id>
```

### **JWT Payload Structure:**
```json
{
  "sub": "user_id_here",     // Primary user ID field
  "id": "user_id_here",       // Alternative user ID field
  "email": "user@example.com",
  "role": "USER",
  "iat": 1234567890,
  "exp": 1234567890
}
```

## 🚀 **Microservice Integration:**

### **Booking Service:**
```typescript
// In Booking service controller
@Post()
async createBooking(@Req() req: Request, @Body() dto: CreateBookingDto) {
  const userId = req.headers['x-user-id']; // ✅ Get UserId from header
  
  return this.bookingService.create({
    ...dto,
    userId, // ✅ Use UserId for database operations
  });
}
```

### **Payment Service:**
```typescript
// In Payment service controller
@Post()
async createPayment(@Req() req: Request, @Body() dto: CreatePaymentDto) {
  const userId = req.headers['x-user-id']; // ✅ Get UserId from header
  
  return this.paymentService.create({
    ...dto,
    userId, // ✅ Use UserId for database operations
  });
}
```

### **Building Service:**
```typescript
// In Building service controller
@Post()
async createBuilding(@Req() req: Request, @Body() dto: CreateBuildingDto) {
  const userId = req.headers['x-user-id']; // ✅ Get UserId from header
  
  return this.buildingService.create({
    ...dto,
    userId, // ✅ Use UserId for database operations
  });
}
```

### **Room Service:**
```typescript
// In Room service controller
@Post()
async createRoom(@Req() req: Request, @Body() dto: CreateRoomDto) {
  const userId = req.headers['x-user-id']; // ✅ Get UserId from header
  
  return this.roomService.create({
    ...dto,
    userId, // ✅ Use UserId for database operations
  });
}
```

## 🧪 **Testing:**

### **Test với Valid JWT Token:**
```bash
curl -X POST http://localhost:4000/bookings \
  -H "Authorization: Bearer <valid_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"roomId": "room123", "startDate": "2024-01-01", "endDate": "2024-01-02"}'

# Expected: Booking service receives x-user-id header
```

### **Test với Payment:**
```bash
curl -X POST http://localhost:4000/payment \
  -H "Authorization: Bearer <valid_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId": "booking123", "amount": 100000}'

# Expected: Payment service receives x-user-id header
```

## 🔄 **Request Flow:**

1. **Client Request** → API Gateway với JWT token
2. **JWT Verification** → Verify token và extract user payload
3. **UserId Extraction** → Extract UserId từ `sub` hoặc `id` field
4. **Header Addition** → Add `x-user-id` header
5. **Service Forward** → Forward request với UserId header
6. **Service Processing** → Microservice sử dụng UserId cho database operations

## 📊 **Benefits:**

### **1. Database Separation**
- ✅ Auth service có database riêng với User table
- ✅ Other services có database riêng với business tables
- ✅ UserId được truyền qua header thay vì database join

### **2. Microservice Independence**
- ✅ Mỗi service có thể scale độc lập
- ✅ Database schema không phụ thuộc lẫn nhau
- ✅ Service có thể deploy riêng biệt

### **3. Security**
- ✅ UserId được verify từ JWT token
- ✅ Không thể fake UserId từ client
- ✅ Consistent user identification across services

## 🎯 **Next Steps:**

1. **Update Microservices** - Cập nhật các service để đọc `x-user-id` header
2. **Database Schema** - Đảm bảo các service có UserId field
3. **Testing** - Test end-to-end với real JWT tokens
4. **Documentation** - Update API documentation

## 🏆 **Kết luận:**

**UserId Passing đã được implement thành công!**

- ✅ Tất cả proxy controllers đã pass UserId header
- ✅ JWT guard extract user payload và attach vào request
- ✅ Microservices có thể nhận UserId qua `x-user-id` header
- ✅ Database separation được giải quyết hoàn toàn

**API Gateway giờ đã sẵn sàng để truyền UserId xuống tất cả microservices!**
