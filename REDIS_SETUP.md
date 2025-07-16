# Redis Real-Time Updates Setup Guide

This guide explains how to set up and use Redis for real-time order updates in the QR Restaurant System.

## 🚀 What's New

The system now supports **real-time updates** using Redis pub/sub and Server-Sent Events (SSE). No more waiting for polling intervals - order status changes are reflected instantly!

## 📋 Prerequisites

- Docker (recommended) or Redis installed locally
- PostgreSQL database running
- Node.js environment set up

## 🔧 Installation & Setup

### Option 1: Using Docker (Recommended)

1. **Start Redis using Docker Compose:**
   ```bash
   docker-compose up -d redis
   ```

2. **Optional: Start Redis Commander (Web UI):**
   ```bash
   docker-compose up -d redis-commander
   ```
   - Access at: http://localhost:8081

### Option 2: Local Redis Installation

1. **Install Redis:**
   ```bash
   # macOS
   brew install redis
   
   # Ubuntu/Debian
   sudo apt install redis-server
   
   # CentOS/RHEL
   sudo yum install redis
   ```

2. **Start Redis:**
   ```bash
   redis-server
   ```

### Environment Configuration

1. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Update your `.env` file:**
   ```env
   # Redis Configuration
   REDIS_HOST="localhost"
   REDIS_PORT="6379"
   REDIS_PASSWORD=""
   REDIS_URL="redis://localhost:6379"
   ```

## 🔄 How It Works

### Real-Time Flow

1. **Order Status Change** → API publishes Redis event
2. **Redis Event** → SSE endpoint receives and filters
3. **SSE Endpoint** → Streams to connected clients
4. **Client Components** → Update UI instantly

### Components Updated

- **OrdersOverview**: Restaurant dashboard orders page
- **KitchenDisplayBoard**: Kitchen display system
- **Order Status API**: Publishes Redis events
- **Order Creation API**: Publishes new order events

## 🧪 Testing Real-Time Updates

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Test Kitchen → Dashboard Updates

1. **Open two browser windows/tabs:**
   - Window 1: `http://localhost:3000/dashboard/orders` (Restaurant Dashboard)
   - Window 2: `http://localhost:3000/dashboard/kitchen` (Kitchen Display)

2. **Login as different users:**
   - Dashboard: Login as restaurant owner or manager
   - Kitchen: Login as kitchen staff

3. **Test order status changes:**
   - In Kitchen: Change order status (pending → confirmed → preparing → ready)
   - In Dashboard: Watch for instant updates (no page refresh needed)

### 3. Test Order Creation

1. **Create a new order:**
   - Go to customer view: `http://localhost:3000` (select restaurant)
   - Place an order
   - Watch both dashboard and kitchen update instantly

### 4. Monitor Redis Events

**Using Redis Commander:**
- Access: http://localhost:8081
- Monitor pub/sub channels

**Using Redis CLI:**
```bash
# Connect to Redis
redis-cli

# Monitor all events
MONITOR

# Or subscribe to specific channels
SUBSCRIBE order:status:changed
SUBSCRIBE order:created
```

## 🎯 Event Types

### Order Status Changed
```json
{
  "type": "order_status_changed",
  "data": {
    "orderId": "123",
    "oldStatus": "pending",
    "newStatus": "confirmed",
    "restaurantId": "abc",
    "orderNumber": "ORD-001",
    "timestamp": 1642781234567
  }
}
```

### Order Created
```json
{
  "type": "order_created",
  "data": {
    "orderId": "123",
    "restaurantId": "abc",
    "orderNumber": "ORD-001",
    "totalAmount": 25.99,
    "timestamp": 1642781234567
  }
}
```

### Kitchen Notification
```json
{
  "type": "kitchen_notification",
  "data": {
    "type": "new_order",
    "orderId": "123",
    "restaurantId": "abc",
    "message": "New order ORD-001 ready for kitchen",
    "timestamp": 1642781234567
  }
}
```

## 🔍 Troubleshooting

### Redis Connection Issues

1. **Check Redis is running:**
   ```bash
   redis-cli ping
   # Expected: PONG
   ```

2. **Check Docker containers:**
   ```bash
   docker ps
   # Look for qr-restaurant-redis
   ```

3. **View Redis logs:**
   ```bash
   docker logs qr-restaurant-redis
   ```

### SSE Connection Issues

1. **Check browser console for errors**
2. **Verify authentication** (SSE requires valid login)
3. **Check network/firewall settings**

### Fallback Behavior

If Redis/SSE fails, the system automatically falls back to polling every 15 seconds.

## 📊 Performance Benefits

### Before (Polling)
- ⏱️ 10-30 second delays
- 🔄 Constant API calls
- 📡 Higher bandwidth usage
- 🔋 More server resources

### After (Real-Time)
- ⚡ Instant updates
- 🎯 Event-driven updates
- 💾 Reduced database load
- 🚀 Better user experience

## 🔒 Security Features

- **Authentication required** for SSE connections
- **Restaurant-level filtering** of events
- **Rate limiting** on Redis operations
- **Graceful error handling** and fallbacks

## 📝 Development Notes

### Adding New Events

1. **Define event type in `src/lib/redis.ts`**
2. **Publish event in relevant API endpoint**
3. **Handle event in SSE endpoint**
4. **Update client components**

### Monitoring

- Redis Commander: http://localhost:8081
- Application logs show Redis connection status
- Browser console shows SSE events

## 🔄 Migration from Polling

The old polling system has been completely replaced with real-time updates. No configuration changes needed - just ensure Redis is running!

## 🆘 Support

If you encounter issues:
1. Check Redis is running
2. Verify environment variables
3. Review browser console for errors
4. Check server logs for Redis connection issues