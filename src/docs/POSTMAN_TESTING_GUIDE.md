# 🧪 Postman Testing Guide - Booking Platform

## 📋 **Setup Postman Collection**

### **1. Import Collection:**
1. Mở Postman
2. Click **Import** → **Upload Files**
3. Chọn file `Booking_Platform_Postman_Collection.json`
4. Collection sẽ được import với tất cả test cases

### **2. Environment Variables:**
- `base_url`: `http://localhost:4000` (API Gateway)
- `access_token`: Sẽ được set sau khi login thành công

## 🔄 **Testing Flow:**

### **Step 1: Login để lấy JWT Token**
```
POST {{base_url}}/auth/login
Body: {
  "email": "admin@booking.com",
  "password": "123456789"
}
```

**Expected Response:**
```json
{
  "status": 201,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "statusCode": 200,
  "message": "Request processed successfully"
}
```

**Action:** Copy `accessToken` và paste vào environment variable `access_token`

### **Step 2: Test Protected Routes**

#### **2.1 Test Booking Routes:**
```
GET {{base_url}}/bookings
Headers: {
  "Authorization": "Bearer {{access_token}}",
  "Content-Type": "application/json"
}
```

**Expected Results:**
- ✅ **200 OK** - Nếu Booking service đang chạy
- ❌ **401 Unauthorized** - Nếu Booking service chưa chạy
- ❌ **500 Internal Server Error** - Nếu có lỗi khác

#### **2.2 Test Payment Routes:**
```
GET {{base_url}}/payment
Headers: {
  "Authorization": "Bearer {{access_token}}",
  "Content-Type": "application/json"
}
```

**Expected Results:**
- ✅ **200 OK** - Nếu Payment service đang chạy và có route GET
- ❌ **404 Not Found** - Nếu Payment service không có route GET
- ❌ **401 Unauthorized** - Nếu Payment service chưa chạy

#### **2.3 Test Building Routes:**
```
GET {{base_url}}/buildings
Headers: {
  "Authorization": "Bearer {{access_token}}",
  "Content-Type": "application/json"
}
```

**Expected Results:**
- ✅ **200 OK** - Nếu Building service đang chạy
- ❌ **401 Unauthorized** - Nếu Building service chưa chạy

#### **2.4 Test Room Routes:**
```
GET {{base_url}}/rooms
Headers: {
  "Authorization": "Bearer {{access_token}}",
  "Content-Type": "application/json"
}
```

**Expected Results:**
- ✅ **200 OK** - Nếu Room service đang chạy
- ❌ **401 Unauthorized** - Nếu Room service chưa chạy

### **Step 3: Test JWT Security**

#### **3.1 Test Invalid Token:**
```
GET {{base_url}}/bookings
Headers: {
  "Authorization": "Bearer invalid_token_here",
  "Content-Type": "application/json"
}
```

**Expected Result:** ❌ **401 Unauthorized**

#### **3.2 Test No Token:**
```
GET {{base_url}}/bookings
Headers: {
  "Content-Type": "application/json"
}
```

**Expected Result:** ❌ **401 Unauthorized**

#### **3.3 Test Expired Token:**
```
GET {{base_url}}/bookings
Headers: {
  "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "Content-Type": "application/json"
}
```

**Expected Result:** ❌ **401 Unauthorized**

### **Step 4: Test Create Operations**

#### **4.1 Create Payment:**
```
POST {{base_url}}/payment
Headers: {
  "Authorization": "Bearer {{access_token}}",
  "Content-Type": "application/json"
}
Body: {
  "bookingId": "booking-123",
  "amount": 100000,
  "method": "VIETQR"
}
```

**Expected Results:**
- ✅ **201 Created** - Nếu Payment service đang chạy và có route POST
- ❌ **404 Not Found** - Nếu Payment service không có route POST
- ❌ **401 Unauthorized** - Nếu Payment service chưa chạy

#### **4.2 Create Booking:**
```
POST {{base_url}}/bookings
Headers: {
  "Authorization": "Bearer {{access_token}}",
  "Content-Type": "application/json"
}
Body: {
  "roomId": "room-123",
  "startDate": "2024-01-01",
  "endDate": "2024-01-02",
  "totalPrice": 100000
}
```

**Expected Results:**
- ✅ **201 Created** - Nếu Booking service đang chạy và có route POST
- ❌ **404 Not Found** - Nếu Booking service không có route POST
- ❌ **401 Unauthorized** - Nếu Booking service chưa chạy

## 🎯 **Test Results Interpretation:**

### **✅ Success Indicators:**
- **Login**: 200 OK với accessToken
- **Protected Routes**: 200 OK với data
- **Invalid Token**: 401 Unauthorized
- **Missing Token**: 401 Unauthorized

### **❌ Issues to Fix:**
- **401 Unauthorized** trên protected routes → Microservice chưa chạy
- **404 Not Found** → Route không tồn tại trong microservice
- **500 Internal Server Error** → Lỗi trong microservice

## 🔧 **Troubleshooting:**

### **1. Auth Service Issues:**
```bash
# Check if Auth service is running
netstat -ano | findstr :3001

# Restart Auth service if needed
cd booking_auth-service
npm run start:dev
```

### **2. Other Services Issues:**
```bash
# Check if services are running
netstat -ano | findstr :3002  # Building service
netstat -ano | findstr :3003  # Room service
netstat -ano | findstr :3005  # Booking service
netstat -ano | findstr :3006  # Payment service

# Start services if needed
cd booking_building-service && npm run start:dev
cd booking_room-service && npm run start:dev
cd booking_booking-service && npm run start:dev
cd booking_payment-service && npm run start:dev
```

### **3. API Gateway Issues:**
```bash
# Check if API Gateway is running
netstat -ano | findstr :4000

# Restart API Gateway if needed
cd booking_api-gateway
npm run start:dev
```

## 📊 **Expected Test Results:**

| Test Case | Expected Status | Description |
|-----------|----------------|-------------|
| Login | 200 OK | Get JWT token successfully |
| Bookings (with JWT) | 200 OK / 401 | Depends on Booking service |
| Payments (with JWT) | 200 OK / 404 | Depends on Payment service |
| Buildings (with JWT) | 200 OK / 401 | Depends on Building service |
| Rooms (with JWT) | 200 OK / 401 | Depends on Room service |
| Invalid Token | 401 | JWT protection working |
| Missing Token | 401 | JWT protection working |
| Expired Token | 401 | JWT protection working |

## 🎉 **Success Criteria:**

- ✅ **Login** hoạt động và trả về JWT token
- ✅ **JWT Protection** reject invalid/missing tokens
- ✅ **API Gateway** forward requests thành công
- ✅ **Microservices** nhận requests và trả về responses
- ✅ **UserId Passing** hoạt động (check headers trong microservices)

**Hệ thống được coi là hoạt động tốt khi tất cả các test cases đều pass hoặc trả về expected status codes!**
