# ToyyibPay Payment Gateway Integration Documentation

**Project**: JRM E-commerce Platform
**Payment Gateway**: ToyyibPay (Malaysian Payment Gateway)
**Documentation Date**: 2025-12-07
**Purpose**: Complete implementation guide for replicating ToyyibPay integration in other projects

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Environment Configuration](#environment-configuration)
4. [Database Schema](#database-schema)
5. [Core Services](#core-services)
6. [API Routes](#api-routes)
7. [Configuration & Utilities](#configuration--utilities)
8. [Payment Flow](#payment-flow)
9. [Security Considerations](#security-considerations)
10. [Testing & Validation](#testing--validation)
11. [Implementation Checklist](#implementation-checklist)

---

## Overview

ToyyibPay is a Malaysian payment gateway that supports:
- **FPX** (Malaysian online banking)
- **Credit/Debit Cards** (Visa, Mastercard)
- **Instant payment processing**
- **Sandbox and Production environments**

### Key Features Implemented

- ✅ **Credentials Management**: Encrypted storage of API credentials in database
- ✅ **Category Management**: Automatic creation and management of payment categories
- ✅ **Bill Creation**: Create payment bills with customer information
- ✅ **Webhook Processing**: Handle payment status updates (success, pending, failed)
- ✅ **Payment Routing**: Multi-gateway support with fallback mechanisms
- ✅ **Transaction Tracking**: Check payment status and transaction details
- ✅ **Stock Management**: Automatic stock deduction and restoration
- ✅ **Membership Activation**: Automatic membership activation on successful payment
- ✅ **Notifications**: Telegram and email notifications for order events

---

## Architecture

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Payment Router Layer                      │
│  (Multi-gateway orchestration & fallback management)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              ToyyibPay Service Layer                         │
│  (Business logic for bill creation & status checking)       │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────┴─────────┐      ┌──────────┴──────────┐
│  Credentials     │      │   Category          │
│  Service         │      │   Service           │
│  (Encryption &   │      │   (Auto-creation &  │
│   DB storage)    │      │    validation)      │
└──────────────────┘      └─────────────────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              Configuration Layer                             │
│  (URLs, timeouts, validation rules, webhook URLs)           │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              ToyyibPay API                                   │
│  https://toyyibpay.com (Production)                         │
│  https://dev.toyyibpay.com (Sandbox)                        │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── lib/
│   ├── config/
│   │   ├── toyyibpay-config.ts         # Centralized configuration
│   │   ├── app-config.ts                # App-level configuration
│   │   └── env-validation.ts            # Environment validation
│   │
│   ├── services/
│   │   ├── toyyibpay-credentials.ts     # Credentials management service
│   │   ├── toyyibpay-category.ts        # Category management service
│   │   └── payment-success-handler.ts   # Centralized payment success logic
│   │
│   ├── payments/
│   │   ├── toyyibpay-service.ts         # Main ToyyibPay service
│   │   └── payment-router.ts            # Multi-gateway router
│   │
│   └── utils/
│       ├── security.ts                   # Encryption/decryption utilities
│       └── webhook-logger.ts             # Webhook request logging
│
├── app/
│   ├── api/
│   │   ├── webhooks/
│   │   │   └── toyyibpay/
│   │   │       └── route.ts              # Webhook handler
│   │   │
│   │   └── payment/
│   │       └── create-bill/
│   │           └── route.ts              # Bill creation endpoint
│   │
│   └── thank-you/
│       └── page.tsx                      # Return URL page
│
└── prisma/
    └── schema.prisma                     # Database schema with ToyyibPay fields
```

---

## Environment Configuration

### Required Environment Variables

Add these to your `.env` file:

```bash
# ==================================================
# ToyyibPay Payment Gateway Configuration
# ==================================================

# ToyyibPay API URLs (default values provided)
TOYYIBPAY_SANDBOX_URL="https://dev.toyyibpay.com"
TOYYIBPAY_PRODUCTION_URL="https://toyyibpay.com"

# API Timeouts (in milliseconds)
TOYYIBPAY_TIMEOUT="30000"              # 30 seconds
TOYYIBPAY_VALIDATION_TIMEOUT="15000"   # 15 seconds
TOYYIBPAY_CALLBACK_TIMEOUT="30000"     # 30 seconds

# Webhook Security (optional)
TOYYIBPAY_WEBHOOK_SECRET="your-webhook-secret-here"

# Application URL (CRITICAL for webhooks)
NEXT_PUBLIC_APP_URL="https://yourdomain.com"

# Authentication Secret (for credential encryption)
NEXTAUTH_SECRET="your-32-character-or-longer-secret"
```

### .env.example Template

```bash
# Payment Gateway (ToyyibPay) - OPTIONAL
# Get credentials from: https://toyyibpay.com/
# Note: User Secret Key stored in database (encrypted)
# Note: Category Code auto-generated on first use
TOYYIBPAY_SECRET_KEY="your-secret-key"
TOYYIBPAY_CATEGORY_CODE="your-category-code"
TOYYIBPAY_SANDBOX="true"
```

**Important Notes:**
- Credentials are stored **encrypted in database**, not in environment variables
- Environment variables are only for API URLs and timeouts
- `NEXTAUTH_SECRET` is used as master key for encryption

---

## Database Schema

### SystemConfig Table

ToyyibPay credentials are stored in the `SystemConfig` table with encryption:

```prisma
model SystemConfig {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String   @db.Text
  type      String   @default("string") // 'string' | 'number' | 'boolean' | 'json'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Stored Keys:**
- `toyyibpay_user_secret_key_encrypted` - Encrypted API secret key (JSON with iv, tag)
- `toyyibpay_environment` - "sandbox" or "production"
- `toyyibpay_category_code` - Payment category code
- `toyyibpay_credentials_updated_by` - Admin user who updated credentials
- `toyyibpay_credentials_enabled` - "true" or "false"

### Order Table Fields

```prisma
model Order {
  id                    String         @id @default(cuid())
  orderNumber           String         @unique

  // Payment fields
  paymentMethod         String?        // "TOYYIBPAY"
  paymentStatus         PaymentStatus  @default(PENDING)
  paymentId             String?        // Transaction reference

  // ToyyibPay specific fields
  toyyibpayBillCode     String?        // Bill code from ToyyibPay
  toyyibpayPaymentUrl   String?        // Payment URL for customer

  // ... other order fields
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}
```

---

## Core Services

### 1. ToyyibPay Configuration Service

**File**: `src/lib/config/toyyibpay-config.ts`

**Purpose**: Single source of truth for all ToyyibPay-related configurations

```typescript
export const toyyibPayConfig = {
  urls: {
    sandbox: process.env.TOYYIBPAY_SANDBOX_URL || 'https://dev.toyyibpay.com',
    production: process.env.TOYYIBPAY_PRODUCTION_URL || 'https://toyyibpay.com',
  },

  timeouts: {
    default: 30000,     // 30 seconds
    validation: 15000,  // 15 seconds
    callback: 30000,    // 30 seconds
  },

  billSettings: {
    maxBillNameLength: 30,           // ToyyibPay limit
    billNamePrefix: 'JRM_',
    maxBillDescriptionLength: 100,   // ToyyibPay limit
    defaultPriceSetting: 1,          // 1 = fixed price
    defaultPayorInfo: 1,             // 1 = require payer info
    defaultPaymentChannel: '2',      // '2' = Both FPX and Credit Card
  },

  paymentChannels: {
    FPX_ONLY: '0',
    CREDIT_CARD_ONLY: '1',
    BOTH: '2',
  },

  statusCodes: {
    SUCCESS: '1',
    PENDING: '2',
    FAILED: '3',
  },
};
```

**Key Functions:**

```typescript
// Get appropriate API URL
getToyyibPayUrl(isSandbox: boolean): string

// Sanitize bill name (alphanumeric + space + underscore only, max 30 chars)
sanitizeBillName(name: string): string

// Sanitize bill description (alphanumeric + space + underscore only, max 100 chars)
sanitizeBillDescription(description: string): string

// Convert Ringgit to cents (ToyyibPay expects cents)
convertRinggitToCents(ringgit: number): number

// Generate external reference for tracking
generateExternalReference(orderNumber: string): string

// Get webhook URLs for current environment
getWebhookUrls(environment: 'sandbox' | 'production'): {
  returnUrl: string;      // Where customer returns after payment
  callbackUrl: string;    // Where ToyyibPay sends webhook
  failedUrl: string;      // Where customer goes on failure
}
```

---

### 2. ToyyibPay Credentials Service

**File**: `src/lib/services/toyyibpay-credentials.ts`

**Purpose**: Secure encrypted storage and retrieval of ToyyibPay API credentials

**Key Features:**
- Encryption using AES-256-GCM
- Master key derived from `NEXTAUTH_SECRET`
- 5-minute in-memory cache
- Credential validation via API test call

**Core Methods:**

```typescript
class ToyyibPayCredentialsService {
  // Store encrypted credentials in database
  async storeCredentials(
    credentials: {
      userSecretKey: string;
      environment: 'sandbox' | 'production';
      categoryCode?: string;
    },
    updatedBy: string
  ): Promise<void>

  // Retrieve and decrypt credentials
  async getCredentials(): Promise<ToyyibPayCredentials | null>

  // Get credential status without exposing sensitive data
  async getCredentialStatus(): Promise<ToyyibPayCredentialStatus>

  // Switch between sandbox and production
  async switchEnvironment(
    environment: 'sandbox' | 'production',
    updatedBy: string
  ): Promise<void>

  // Clear stored credentials
  async clearCredentials(): Promise<void>

  // Get credentials for service usage
  async getCredentialsForService(): Promise<{
    userSecretKey: string;
    environment: 'sandbox' | 'production';
    categoryCode?: string;
    isSandbox: boolean;
  } | null>

  // Validate credentials via API test
  async validateCredentials(
    userSecretKey: string,
    environment: 'sandbox' | 'production'
  ): Promise<{
    isValid: boolean;
    error?: string;
    responseTime?: number;
  }>
}

// Singleton instance
export const toyyibPayCredentialsService =
  ToyyibPayCredentialsService.getInstance();
```

**Encryption Implementation:**

```typescript
// Derive master key from NEXTAUTH_SECRET
private deriveMasterKey(): string {
  const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret';
  const salt = 'toyyibpay-credentials-salt';
  return crypto.pbkdf2Sync(secret, salt, 10000, 32, 'sha256').toString('hex');
}

// Encrypt credential data
private encryptCredential(data: string): EncryptedCredential {
  return encryptData(data, this.masterKey);
}

// Decrypt credential data
private decryptCredential(encryptedData: EncryptedCredential): string {
  return decryptData(
    encryptedData.encrypted,
    this.masterKey,
    encryptedData.iv,
    encryptedData.tag
  );
}
```

---

### 3. ToyyibPay Category Service

**File**: `src/lib/services/toyyibpay-category.ts`

**Purpose**: Manage ToyyibPay payment categories (required for bill creation)

**Core Methods:**

```typescript
class ToyyibPayCategoryService {
  // Create a new category
  async createCategory(
    categoryName: string,
    categoryDescription: string
  ): Promise<{
    success: boolean;
    categoryCode?: string;
    error?: string;
  }>

  // Get category details
  async getCategory(categoryCode: string): Promise<{
    success: boolean;
    category?: ToyyibPayCategory;
    error?: string;
  }>

  // Get or create default category
  async getOrCreateDefaultCategory(): Promise<{
    success: boolean;
    categoryCode?: string;
    error?: string;
  }>

  // Validate category exists and is active
  async validateCategory(categoryCode: string): Promise<boolean>
}

// Singleton instance
export const toyyibPayCategoryService =
  ToyyibPayCategoryService.getInstance();
```

**Default Category Naming:**
```typescript
const defaultCategoryName = 'JRM_Ecommerce_' + Date.now();
const defaultCategoryDescription = 'Default category for JRM E-commerce payments';
```

---

### 4. ToyyibPay Service (Main Payment Service)

**File**: `src/lib/payments/toyyibpay-service.ts`

**Purpose**: Core service for ToyyibPay bill creation and transaction management

**Interfaces:**

```typescript
export interface ToyyibPayBillRequest {
  userSecretKey: string;
  categoryCode: string;
  billName: string;               // Max 30 chars
  billDescription: string;         // Max 100 chars
  billPriceSetting: 0 | 1;        // 0=dynamic, 1=fixed
  billPayorInfo: 0 | 1;           // 0=no info, 1=info required
  billAmount: number;              // In cents
  billReturnUrl: string;
  billCallbackUrl: string;
  billExternalReferenceNo: string;
  billTo: string;
  billEmail: string;
  billPhone?: string;
  billPaymentChannel: '0' | '1' | '2';  // 0=FPX, 1=CC, 2=Both
}

export interface PaymentResult {
  success: boolean;
  billCode?: string;
  paymentUrl?: string;
  error?: string;
  externalReference?: string;
}
```

**Core Methods:**

```typescript
class ToyyibPayService {
  // Create a payment bill
  async createBill(billData: {
    billName: string;
    billDescription: string;
    billAmount: number;           // Amount in Ringgit
    billTo: string;
    billEmail: string;
    billPhone?: string;
    externalReferenceNo: string;
    paymentChannel?: '0' | '1' | '2';
  }): Promise<PaymentResult>

  // Get bill transaction status
  async getBillTransactions(billCode: string): Promise<TransactionStatus>

  // Inactivate a bill (cancel unpaid bill)
  async inactiveBill(billCode: string): Promise<{
    success: boolean;
    error?: string;
  }>

  // Check if service is configured
  async isServiceConfigured(): Promise<boolean>

  // Refresh service configuration
  async refreshConfiguration(): Promise<void>
}

// Singleton instance
export const toyyibPayService = ToyyibPayService.getInstance();
```

**Bill Creation Flow:**

```typescript
async createBill(billData) {
  // 1. Ensure service is configured with credentials
  await this.ensureCredentials();

  // 2. Ensure category code exists
  const categoryCode = await this.ensureCategoryCode();

  // 3. Get webhook URLs for environment
  const webhookUrls = getWebhookUrls(this.credentials.environment);

  // 4. Prepare bill request
  const billRequest: ToyyibPayBillRequest = {
    userSecretKey: this.credentials.userSecretKey,
    categoryCode: categoryCode,
    billName: sanitizeBillName(billData.billName),
    billDescription: sanitizeBillDescription(billData.billDescription),
    billAmount: convertRinggitToCents(billData.billAmount),
    billReturnUrl: webhookUrls.returnUrl,
    billCallbackUrl: webhookUrls.callbackUrl,
    // ... other fields
  };

  // 5. Send to ToyyibPay API
  const response = await fetch(`${baseURL}/index.php/api/createBill`, {
    method: 'POST',
    body: formData,  // Use FormData for API compatibility
  });

  // 6. Parse response and construct payment URL
  const result = await response.json();
  const paymentUrl = `${baseURL}/${result.BillCode}`;

  return { success: true, billCode, paymentUrl };
}
```

---

### 5. Payment Router Service

**File**: `src/lib/payments/payment-router.ts`

**Purpose**: Multi-gateway payment orchestration with fallback support

**Core Methods:**

```typescript
class PaymentRouterService {
  // Get availability of all payment gateways
  async getGatewayAvailability(): Promise<PaymentGatewayAvailability>

  // Get default payment method
  async getDefaultPaymentMethod(): Promise<PaymentMethod | null>

  // Get available payment methods for customer selection
  async getAvailablePaymentMethods(): Promise<PaymentMethod[]>

  // Route payment to appropriate gateway
  async createPayment(request: PaymentRequest): Promise<PaymentResult>

  // Check payment status
  async checkPaymentStatus(
    paymentMethod: PaymentMethod,
    identifier: string
  ): Promise<PaymentStatusResult>
}

// Singleton instance
export const paymentRouter = PaymentRouterService.getInstance();
```

**Usage Example:**

```typescript
const paymentResult = await paymentRouter.createPayment({
  orderNumber: 'ORD-123456',
  customerInfo: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+60123456789',
  },
  amount: 99.90,  // RM 99.90
  description: 'JRM E-commerce Order ORD-123456',
  paymentMethod: 'TOYYIBPAY',  // Optional, auto-selects if not provided
});

if (paymentResult.success) {
  // Redirect customer to payment URL
  window.location.href = paymentResult.paymentUrl;
}
```

---

### 6. Payment Success Handler

**File**: `src/lib/services/payment-success-handler.ts`

**Purpose**: Centralized handler for all payment success logic

**Key Features:**
- Single source of truth for payment success
- Used by all payment gateway webhooks
- Handles order status updates
- Triggers notifications (email, Telegram)
- Manages membership activation

**Usage:**

```typescript
await PaymentSuccessHandler.handle({
  orderReference: order.orderNumber,
  amount: 99.90,
  transactionId: 'TXN-123456',
  paymentGateway: 'toyyibpay',
  timestamp: new Date().toISOString(),
  metadata: {
    billCode: 'abc123',
    orderId: 'ORD-123456',
  },
});
```

---

## API Routes

### 1. Webhook Handler

**File**: `src/app/api/webhooks/toyyibpay/route.ts`

**Purpose**: Process payment status callbacks from ToyyibPay

**Endpoint**: `POST /api/webhooks/toyyibpay`

**ToyyibPay Callback Parameters:**

```typescript
interface ToyyibPayCallback {
  refno: string;              // Payment reference
  status: '1' | '2' | '3';    // 1=success, 2=pending, 3=fail
  reason: string;             // Status reason
  billcode: string;           // Bill code
  order_id: string;           // External reference (order number)
  amount: string;             // Payment amount in cents
  transaction_time: string;   // Transaction timestamp
}
```

**Webhook Processing Flow:**

```typescript
export async function POST(request: NextRequest) {
  // 1. Security: Verify webhook signature (if configured)
  const signature = request.headers.get('x-signature');
  if (signature && process.env.TOYYIBPAY_WEBHOOK_SECRET) {
    verifyWebhookSignature(payload, signature, secret);
  }

  // 2. Parse callback data
  const formData = await request.formData();
  const callback: ToyyibPayCallback = {
    refno: formData.get('refno'),
    status: formData.get('status'),
    billcode: formData.get('billcode'),
    order_id: formData.get('order_id'),
    amount: formData.get('amount'),
    // ...
  };

  // 3. Find order by bill code
  const order = await prisma.order.findFirst({
    where: { toyyibpayBillCode: callback.billcode },
    include: { orderItems, user, shippingAddress, ... }
  });

  // 4. Check idempotency (already processed?)
  if (order.paymentStatus === 'PAID' && callback.status === '1') {
    return NextResponse.json({ message: 'Already processed' });
  }

  // 5. Validate payment amount
  const expectedAmount = Math.round(order.total * 100);
  const receivedAmount = parseInt(callback.amount);
  // Allow 1 cent tolerance for rounding differences

  // 6. Process based on status
  if (callback.status === '1') {
    // SUCCESS: Use centralized payment success handler
    await PaymentSuccessHandler.handle({
      orderReference: order.orderNumber,
      amount: parseFloat(callback.amount) / 100,
      transactionId: callback.refno,
      paymentGateway: 'toyyibpay',
      timestamp: callback.transaction_time,
      metadata: { billCode: callback.billcode, ... },
    });

    // Stock already deducted during order creation - NO double deduction
    // Membership activation handled by OrderStatusHandler
    // Referral processing
    await processReferralOrderCompletion(order.user.id, order.total);

  } else if (callback.status === '3') {
    // FAILED: Restore stock that was deducted during order creation
    for (const item of order.orderItems) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }

    // Send admin notification
    await simplifiedTelegramService.sendPaymentFailedAlert(...);

    // Update order status
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'FAILED',
        paymentId: callback.refno,
      },
    });

  } else if (callback.status === '2') {
    // PENDING: Keep stock reserved, no action needed
    console.log('Payment still pending - stock remains reserved');
  }

  // 7. Low stock alerts (only if stock crossed threshold)
  for (const item of order.orderItems) {
    const product = await prisma.product.findUnique(...);
    const previousStock = product.stockQuantity + item.quantity;

    if (
      previousStock > product.lowStockAlert &&
      product.stockQuantity <= product.lowStockAlert
    ) {
      await simplifiedTelegramService.sendLowStockAlert(...);
    }
  }

  // 8. Create audit log
  await prisma.auditLog.create({
    data: {
      action: 'ORDER_STATUS_CHANGE',
      resource: 'ORDER',
      details: { orderNumber, newStatus, paymentMethod, ... },
    },
  });

  // 9. Send additional notifications
  if (newPaymentStatus === 'PAID') {
    // Member welcome email if first membership
    await emailService.sendMemberWelcome(...);
  } else if (newPaymentStatus === 'FAILED') {
    // Payment failure notification
    await emailService.sendPaymentFailure(...);
  }

  // 10. Log webhook request
  logWebhookRequest({ timestamp, method, url, body, result });

  return NextResponse.json({
    message: 'Webhook processed successfully',
    orderNumber: order.orderNumber,
    paymentStatus: newPaymentStatus,
  });
}
```

**GET Endpoint (Status Check):**

```typescript
export async function GET(request: NextRequest) {
  const billcode = searchParams.get('billcode');
  const status_id = searchParams.get('status_id');

  const order = await prisma.order.findFirst({
    where: { toyyibpayBillCode: billcode },
  });

  return NextResponse.json({
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    total: order.total,
  });
}
```

---

### 2. Bill Creation API

**File**: `src/app/api/payment/create-bill/route.ts`

**Purpose**: Create payment bill for existing order

**Endpoint**: `GET /api/payment/create-bill?orderId={orderId}`

**Flow:**

```typescript
export async function GET(request: NextRequest) {
  const orderId = searchParams.get('orderId');

  // 1. Get order with all relations
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user, shippingAddress, orderItems, ... },
  });

  // 2. Verify authorization
  const session = await getServerSession(authOptions);
  if (session?.user?.id && order.userId !== session.user.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  // 3. Check payment status
  if (order.paymentStatus !== 'PENDING') {
    return NextResponse.json(
      { message: 'Payment already processed' },
      { status: 400 }
    );
  }

  // 4. Prepare customer info
  const customerInfo = {
    name: order.user?.name ||
          `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
    email: order.user?.email || order.guestEmail,
    phone: order.shippingAddress?.phone,
  };

  // 5. Create payment using payment router
  const paymentResult = await paymentRouter.createPayment({
    orderNumber: order.orderNumber,
    customerInfo,
    amount: Number(order.total),
    description: `JRM E-commerce Order ${order.orderNumber}`,
    paymentMethod: 'TOYYIBPAY',
  });

  // 6. Update order with payment details
  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentId: paymentResult.billCode,
      toyyibpayBillCode: paymentResult.billCode,
      toyyibpayPaymentUrl: paymentResult.paymentUrl,
    },
  });

  // 7. Redirect to payment URL
  return NextResponse.redirect(paymentResult.paymentUrl);
}
```

---

## Configuration & Utilities

### 1. Webhook URL Generation

**Function**: `getWebhookUrls(environment)`

```typescript
export function getWebhookUrls(environment: 'sandbox' | 'production') {
  const baseUrl = getAppUrl(true);  // Uses NEXT_PUBLIC_APP_URL

  return {
    returnUrl: `${baseUrl}/thank-you`,           // Customer redirect after payment
    callbackUrl: `${baseUrl}/api/webhooks/toyyibpay`,  // Webhook callback
    failedUrl: `${baseUrl}/thank-you`,           // Failed payment redirect
  };
}
```

**Important**: `NEXT_PUBLIC_APP_URL` must be set correctly for production:
- Development: `http://localhost:3000`
- Production: `https://yourdomain.com`

### 2. Data Sanitization

ToyyibPay API requirements:
- **Bill Name**: Max 30 characters, alphanumeric + space + underscore only
- **Bill Description**: Max 100 characters, alphanumeric + space + underscore only

```typescript
export function sanitizeBillName(name: string): string {
  // Remove special characters
  let sanitized = name.replace(/[^a-zA-Z0-9\s_]/g, '_');

  // Limit to 30 characters
  if (sanitized.length > 30) {
    sanitized = sanitized.substring(0, 30);
  }

  // Add prefix if not present
  if (!sanitized.startsWith('JRM_')) {
    const prefix = 'JRM_';
    sanitized = prefix + sanitized.substring(0, 30 - prefix.length);
  }

  return sanitized;
}
```

### 3. Amount Conversion

ToyyibPay API expects amounts in **cents** (sen), not Ringgit:

```typescript
export function convertRinggitToCents(ringgit: number): number {
  return Math.round(ringgit * 100);
}

export function convertCentsToRinggit(cents: number): number {
  return cents / 100;
}
```

**Example:**
- RM 99.90 → 9990 cents
- RM 1,234.56 → 123456 cents

### 4. External Reference Generation

```typescript
export function generateExternalReference(orderNumber: string): string {
  return `JRM_${orderNumber}_${Date.now()}`;
}
```

**Example**: `JRM_ORD20251207001_1733567890123`

---

## Payment Flow

### Complete Payment Flow Diagram

```
┌──────────────────┐
│  Customer        │
│  Checkout        │
└────────┬─────────┘
         │ 1. Creates order
         ▼
┌──────────────────┐
│  POST /api/      │
│  orders          │
└────────┬─────────┘
         │ 2. Order created with PENDING status
         │    Stock deducted immediately
         ▼
┌──────────────────┐
│  GET /api/       │
│  payment/        │
│  create-bill     │
└────────┬─────────┘
         │ 3. Call payment router
         ▼
┌──────────────────┐
│  Payment Router  │
│  Service         │
└────────┬─────────┘
         │ 4. Route to ToyyibPay service
         ▼
┌──────────────────┐
│  ToyyibPay       │
│  Service         │
└────────┬─────────┘
         │ 5. Ensure credentials
         │ 6. Ensure category code
         │ 7. Create bill via API
         ▼
┌──────────────────┐
│  ToyyibPay API   │
│  createBill      │
└────────┬─────────┘
         │ 8. Returns BillCode
         ▼
┌──────────────────┐
│  Update Order    │
│  with BillCode   │
└────────┬─────────┘
         │ 9. Redirect to payment URL
         ▼
┌──────────────────┐
│  Customer pays   │
│  on ToyyibPay    │
└────────┬─────────┘
         │ 10. Payment processed
         ▼
┌──────────────────┐
│  ToyyibPay sends │
│  webhook         │
└────────┬─────────┘
         │ 11. POST /api/webhooks/toyyibpay
         ▼
┌──────────────────┐
│  Webhook Handler │
└────────┬─────────┘
         │ 12. Verify signature
         │ 13. Find order by billCode
         │ 14. Check idempotency
         │ 15. Validate amount
         ├──────────────────┬──────────────────┬──────────────────┐
         │ Status = 1       │ Status = 2       │ Status = 3       │
         │ (SUCCESS)        │ (PENDING)        │ (FAILED)         │
         ▼                  ▼                  ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ PaymentSuccess   │  │ Keep order       │  │ Restore stock    │
│ Handler          │  │ PENDING          │  │ Mark CANCELLED   │
│ - Update order   │  │ Stock reserved   │  │ Notify admin     │
│ - Send emails    │  └──────────────────┘  └──────────────────┘
│ - Send Telegram  │
│ - Activate       │
│   membership     │
│ - Process        │
│   referrals      │
│ - Low stock      │
│   alerts         │
└────────┬─────────┘
         │ 16. Return success
         ▼
┌──────────────────┐
│  Customer        │
│  redirected to   │
│  /thank-you      │
└──────────────────┘
```

### Stock Management Strategy

**Critical Implementation Detail**: Stock is deducted ONCE during order creation, not during webhook processing.

```typescript
// ✅ CORRECT: Stock deducted during order creation
// File: src/app/api/orders/route.ts
await prisma.product.update({
  where: { id: item.productId },
  data: {
    stockQuantity: { decrement: item.quantity },
  },
});

// ✅ CORRECT: Stock restoration on payment failure
// File: src/app/api/webhooks/toyyibpay/route.ts
if (callback.status === '3') {  // Payment failed
  for (const item of order.orderItems) {
    await prisma.product.update({
      where: { id: item.productId },
      data: {
        stockQuantity: { increment: item.quantity },  // Restore
      },
    });
  }
}

// ❌ WRONG: Do NOT deduct stock again in webhook handler
// This causes double deduction bug!
```

---

## Security Considerations

### 1. Credential Encryption

**Implementation**: AES-256-GCM encryption

```typescript
// Encryption utility
export function encryptData(
  data: string,
  masterKey: string
): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(masterKey, 'hex'),
    iv
  );

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}
```

**Storage Format**:
```json
{
  "encrypted": "a1b2c3...",
  "iv": "d4e5f6...",
  "tag": "g7h8i9..."
}
```

### 2. Webhook Signature Verification

```typescript
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Usage in Webhook**:
```typescript
const signature = request.headers.get('x-signature');
if (signature && process.env.TOYYIBPAY_WEBHOOK_SECRET) {
  const isValid = verifyWebhookSignature(
    JSON.stringify(webhookData),
    signature,
    process.env.TOYYIBPAY_WEBHOOK_SECRET
  );

  if (!isValid) {
    return NextResponse.json(
      { message: 'Invalid signature' },
      { status: 401 }
    );
  }
}
```

### 3. IP Whitelisting (Optional)

Track and log webhook source IPs for security auditing:

```typescript
const clientIP = getClientIP(request);
console.log('Webhook received from IP:', clientIP);

// Log to audit trail
logWebhookRequest({
  clientIp: clientIP,
  timestamp: new Date().toISOString(),
  // ...
});
```

### 4. Idempotency Protection

Prevent duplicate processing of webhooks:

```typescript
// Check if order is already processed
if (order.paymentStatus === 'PAID' && callback.status === '1') {
  console.log('Order already processed (idempotent)');
  return NextResponse.json({ message: 'Already processed' });
}
```

### 5. Amount Validation

Verify payment amount matches order total:

```typescript
const expectedAmountCents = Math.round(Number(order.total) * 100);
const receivedAmountCents = parseInt(callback.amount, 10);

// Allow 1 cent tolerance for rounding differences
if (Math.abs(expectedAmountCents - receivedAmountCents) > 1) {
  console.warn('Amount mismatch detected');

  // Log to audit trail but don't reject
  await prisma.auditLog.create({
    data: {
      action: 'TOYYIBPAY_AMOUNT_MISMATCH',
      resource: 'PAYMENT',
      details: {
        orderNumber: order.orderNumber,
        expectedAmount: expectedAmountCents,
        receivedAmount: receivedAmountCents,
      },
    },
  });
}
```

---

## Testing & Validation

### 1. Credential Validation

Test credentials before storing:

```typescript
const validation = await toyyibPayCredentialsService.validateCredentials(
  userSecretKey,
  'sandbox'
);

if (validation.isValid) {
  // Store credentials
  await toyyibPayCredentialsService.storeCredentials({
    userSecretKey,
    environment: 'sandbox',
  }, adminUserId);
} else {
  console.error('Invalid credentials:', validation.error);
}
```

### 2. Category Creation Test

```typescript
const categoryResult = await toyyibPayCategoryService.createCategory(
  'TEST_CATEGORY_' + Date.now(),
  'Test category for validation'
);

if (categoryResult.success) {
  console.log('Category created:', categoryResult.categoryCode);
} else {
  console.error('Category creation failed:', categoryResult.error);
}
```

### 3. Bill Creation Test

```typescript
const billResult = await toyyibPayService.createBill({
  billName: 'Test Order',
  billDescription: 'Test payment',
  billAmount: 10.00,  // RM 10.00
  billTo: 'Test Customer',
  billEmail: 'test@example.com',
  billPhone: '+60123456789',
  externalReferenceNo: generateExternalReference('TEST-001'),
  paymentChannel: '2',  // Both FPX and Credit Card
});

if (billResult.success) {
  console.log('Bill created:', billResult.billCode);
  console.log('Payment URL:', billResult.paymentUrl);
  // Visit payment URL to complete test payment
} else {
  console.error('Bill creation failed:', billResult.error);
}
```

### 4. Webhook Testing

Use ToyyibPay sandbox to test webhook callbacks:

```bash
# Send test webhook using curl
curl -X POST http://localhost:3000/api/webhooks/toyyibpay \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "refno=TEST123" \
  -d "status=1" \
  -d "billcode=test123" \
  -d "order_id=JRM_TEST_1234" \
  -d "amount=1000" \
  -d "transaction_time=2025-12-07 10:00:00"
```

### 5. Payment Status Check

```typescript
const status = await toyyibPayService.getBillTransactions('abc123');

if (status.success) {
  console.log('Payment status:', status.status);  // 'success' | 'pending' | 'failed'
  console.log('Amount:', status.amount);
  console.log('Invoice:', status.invoiceNo);
} else {
  console.error('Status check failed:', status.error);
}
```

---

## Implementation Checklist

### Phase 1: Setup & Configuration

- [ ] Install dependencies (Next.js, Prisma, crypto)
- [ ] Set up environment variables
- [ ] Add database schema fields for ToyyibPay
- [ ] Run database migrations
- [ ] Configure `NEXT_PUBLIC_APP_URL` correctly

### Phase 2: Core Services

- [ ] Implement `toyyibpay-config.ts` configuration
- [ ] Implement encryption utilities (`security.ts`)
- [ ] Implement `toyyibpay-credentials.ts` service
- [ ] Implement `toyyibpay-category.ts` service
- [ ] Implement `toyyibpay-service.ts` main service
- [ ] Implement `payment-router.ts` for multi-gateway support

### Phase 3: API Routes

- [ ] Create webhook handler (`/api/webhooks/toyyibpay/route.ts`)
- [ ] Create bill creation endpoint (`/api/payment/create-bill/route.ts`)
- [ ] Create admin credential management endpoints
- [ ] Implement webhook logging utility

### Phase 4: Frontend Integration

- [ ] Create payment method selection UI
- [ ] Implement bill creation flow
- [ ] Create thank-you page for return URL
- [ ] Add payment retry functionality

### Phase 5: Testing

- [ ] Test credential storage and encryption
- [ ] Test category creation
- [ ] Test bill creation (sandbox)
- [ ] Test webhook processing (sandbox)
- [ ] Test payment status checking
- [ ] Test stock management flow
- [ ] Test failure scenarios

### Phase 6: Production Preparation

- [ ] Switch to production credentials
- [ ] Configure production webhook URLs
- [ ] Set up webhook signature verification
- [ ] Enable IP logging and monitoring
- [ ] Set up audit logging
- [ ] Test end-to-end flow in production

### Phase 7: Monitoring & Maintenance

- [ ] Monitor webhook logs
- [ ] Monitor payment success rates
- [ ] Set up alerts for payment failures
- [ ] Regularly review audit logs
- [ ] Keep credentials rotated periodically

---

## ToyyibPay API Reference

### API Endpoints

**Sandbox**: `https://dev.toyyibpay.com`
**Production**: `https://toyyibpay.com`

### 1. Create Category

**Endpoint**: `POST /index.php/api/createCategory`

**Parameters**:
- `userSecretKey` - Your API secret key
- `catname` - Category name
- `catdescription` - Category description

**Response**:
```json
[{
  "CategoryCode": "0dry0b1x"
}]
```

or

```json
[{
  "msg": "Category name already exist!",
  "CategoryCode": "existing_code"
}]
```

### 2. Create Bill

**Endpoint**: `POST /index.php/api/createBill`

**Parameters**:
- `userSecretKey` - Your API secret key
- `categoryCode` - Category code
- `billName` - Bill name (max 30 chars, alphanumeric + space + underscore)
- `billDescription` - Description (max 100 chars, alphanumeric + space + underscore)
- `billPriceSetting` - 0 (dynamic) or 1 (fixed)
- `billPayorInfo` - 0 (no info) or 1 (info required)
- `billAmount` - Amount in cents (e.g., 9990 for RM 99.90)
- `billReturnUrl` - Customer return URL
- `billCallbackUrl` - Webhook callback URL
- `billExternalReferenceNo` - Your order reference
- `billTo` - Customer name
- `billEmail` - Customer email
- `billPhone` - Customer phone (optional)
- `billPaymentChannel` - 0 (FPX), 1 (Credit Card), 2 (Both)

**Response**:
```json
[{
  "BillCode": "gcbhict9"
}]
```

**Payment URL**: `https://toyyibpay.com/{BillCode}` or `https://dev.toyyibpay.com/{BillCode}`

### 3. Get Bill Transactions

**Endpoint**: `POST /index.php/api/getBillTransactions`

**Parameters**:
- `userSecretKey` - Your API secret key
- `billCode` - Bill code to check

**Response**:
```json
[{
  "billpaymentStatus": "1",
  "billpaymentAmount": "9990",
  "billpaymentInvoiceNo": "INV123",
  "billpaymentDate": "2025-12-07 10:30:00",
  "billTo": "John Doe",
  "billEmail": "john@example.com",
  "billExternalReferenceNo": "JRM_ORD123_1733567890"
}]
```

**Status Codes**:
- `1` - Success
- `2` - Pending
- `3` - Failed

### 4. Inactivate Bill

**Endpoint**: `POST /index.php/api/inactiveBill`

**Parameters**:
- `userSecretKey` - Your API secret key
- `billCode` - Bill code to inactivate

**Response**:
```json
[{
  "msg": "Bill has been successfully inactivate!"
}]
```

### 5. Webhook Callback

ToyyibPay sends POST request to `billCallbackUrl` with:

**Parameters**:
- `refno` - Payment reference number
- `status` - 1 (success), 2 (pending), 3 (fail)
- `reason` - Status reason
- `billcode` - Bill code
- `order_id` - Your external reference number
- `amount` - Amount in cents
- `transaction_time` - Transaction timestamp

### 6. Return URL

Customer is redirected to `billReturnUrl` with query parameters:

**Query Parameters**:
- `status_id` - 1 (success), 2 (pending), 3 (fail)
- `billcode` - Bill code
- `order_id` - Your external reference number

---

## Common Issues & Solutions

### Issue 1: Webhook Not Receiving Callbacks

**Symptoms**: Payment successful but order not updated

**Solutions**:
1. Verify `NEXT_PUBLIC_APP_URL` is set correctly
2. Check webhook URL is accessible from internet (not localhost)
3. Use ngrok for local testing: `ngrok http 3000`
4. Check server logs for incoming webhook requests
5. Verify webhook signature if enabled

### Issue 2: Invalid Bill Name/Description

**Symptoms**: "Invalid bill name" error from ToyyibPay

**Solutions**:
1. Ensure bill name ≤ 30 characters
2. Ensure bill description ≤ 100 characters
3. Use only alphanumeric, spaces, and underscores
4. Use sanitization functions: `sanitizeBillName()`, `sanitizeBillDescription()`

### Issue 3: Amount Mismatch

**Symptoms**: "Amount mismatch" warnings in logs

**Solutions**:
1. Ensure amounts are converted to cents: `convertRinggitToCents()`
2. Use `Math.round()` to avoid floating point issues
3. Allow 1-2 cent tolerance for rounding differences

### Issue 4: Credentials Not Working

**Symptoms**: "Invalid credentials" or authentication errors

**Solutions**:
1. Verify secret key is correct (no extra spaces)
2. Check environment (sandbox vs production)
3. Use validation endpoint: `validateCredentials()`
4. Check if credentials are enabled in database
5. Clear credential cache: `clearCredentials()` then re-store

### Issue 5: Double Stock Deduction

**Symptoms**: Stock quantity incorrect after payment

**Solutions**:
1. **DO NOT** deduct stock in webhook handler
2. Stock should only be deducted during order creation
3. Restore stock on payment failure only
4. Check for duplicate webhook processing (idempotency)

---

## Conclusion

This documentation provides a complete guide to implementing ToyyibPay payment gateway integration. The implementation follows best practices including:

- ✅ **Separation of Concerns**: Services, configuration, and API routes clearly separated
- ✅ **Security**: Encrypted credential storage, webhook signature verification
- ✅ **DRY Principle**: Centralized configuration, reusable services
- ✅ **Type Safety**: Full TypeScript implementation
- ✅ **Error Handling**: Comprehensive try-catch blocks and validation
- ✅ **Logging**: Detailed logging for debugging and auditing
- ✅ **Testing**: Sandbox support and validation utilities

For questions or issues, refer to:
- ToyyibPay Documentation: https://toyyibpay.com/apireference
- ToyyibPay Support: support@toyyibpay.com

---

**Document Version**: 1.0
**Last Updated**: 2025-12-07
**Maintained By**: JRM E-commerce Development Team
