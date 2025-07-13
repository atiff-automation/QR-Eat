-- Create SaaS Platform Administration Tables
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_admin_sessions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_sessions_pkey" PRIMARY KEY ("id")
);

-- Create Restaurant Owners Tables
CREATE TABLE "restaurant_owners" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "companyName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_owners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_owner_sessions" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_owner_sessions_pkey" PRIMARY KEY ("id")
);

-- Create Subscription Tables
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyFee" DECIMAL(10,2) NOT NULL,
    "transactionFeeRate" DECIMAL(5,4) NOT NULL,
    "maxTables" INTEGER,
    "maxStaff" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- Create Transaction Fee Tables
CREATE TABLE "transaction_fees" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "orderAmount" DECIMAL(10,2) NOT NULL,
    "feeRate" DECIMAL(5,4) NOT NULL,
    "feeAmount" DECIMAL(10,2) NOT NULL,
    "stripeFee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "netFee" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payoutStatus" TEXT NOT NULL DEFAULT 'pending',
    "payoutDate" TIMESTAMP(3),
    "stripeTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_fees_pkey" PRIMARY KEY ("id")
);

-- Create Invoice Tables
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "invoicePdf" TEXT,
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "itemType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- Create Enhanced Staff Tables
CREATE TABLE "staff_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_role_hierarchy" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "parentId" TEXT,
    "maxCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_role_hierarchy_pkey" PRIMARY KEY ("id")
);

-- Add SaaS columns to existing restaurants table
ALTER TABLE "restaurants" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "slug" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "brandingConfig" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "restaurants" ADD COLUMN "businessType" TEXT NOT NULL DEFAULT 'restaurant';
ALTER TABLE "restaurants" ADD COLUMN "maxTables" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "restaurants" ADD COLUMN "maxStaff" INTEGER NOT NULL DEFAULT 20;

-- Add SaaS columns to existing staff table
ALTER TABLE "staff" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "staff" ADD COLUMN "roleId" TEXT;
ALTER TABLE "staff" ADD COLUMN "username" TEXT;
ALTER TABLE "staff" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "staff" ADD COLUMN "hireDate" TIMESTAMP(3);
ALTER TABLE "staff" ADD COLUMN "hourlyRate" DECIMAL(8,2);
ALTER TABLE "staff" ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "staff" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "staff" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "staff" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "staff" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "staff" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "staff" ADD COLUMN "passwordResetExpires" TIMESTAMP(3);
ALTER TABLE "staff" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "staff" ADD COLUMN "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create additional audit and security tables
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "tableId" TEXT,
    "staffId" TEXT,
    "customerSessionId" TEXT,
    "orderId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestPath" TEXT,
    "requestMethod" TEXT,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- Enhanced audit log table with SaaS features
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "changedBy" TEXT,
    "changedByType" TEXT,
    "restaurantId" TEXT,
    "adminId" TEXT,
    "ownerId" TEXT,
    "staffId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Add enhanced session table
CREATE TABLE "staff_sessions" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- Create unique indexes
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");
CREATE UNIQUE INDEX "platform_admin_sessions_sessionToken_key" ON "platform_admin_sessions"("sessionToken");
CREATE UNIQUE INDEX "restaurant_owners_email_key" ON "restaurant_owners"("email");
CREATE UNIQUE INDEX "restaurant_owner_sessions_sessionToken_key" ON "restaurant_owner_sessions"("sessionToken");
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");
CREATE UNIQUE INDEX "subscriptions_restaurantId_key" ON "subscriptions"("restaurantId");
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");
CREATE UNIQUE INDEX "transaction_fees_orderId_key" ON "transaction_fees"("orderId");
CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON "invoices"("stripeInvoiceId");
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles"("name");
CREATE UNIQUE INDEX "staff_role_hierarchy_restaurantId_roleId_key" ON "staff_role_hierarchy"("restaurantId", "roleId");
CREATE UNIQUE INDEX "staff_username_key" ON "staff"("username");
CREATE UNIQUE INDEX "staff_sessions_sessionToken_key" ON "staff_sessions"("sessionToken");

-- Create performance indexes
CREATE INDEX "subscriptions_restaurantId_idx" ON "subscriptions"("restaurantId");
CREATE INDEX "subscriptions_stripeSubscriptionId_idx" ON "subscriptions"("stripeSubscriptionId");
CREATE INDEX "restaurants_ownerId_idx" ON "restaurants"("ownerId");
CREATE INDEX "restaurants_slug_idx" ON "restaurants"("slug");
CREATE INDEX "transaction_fees_restaurantId_idx" ON "transaction_fees"("restaurantId");
CREATE INDEX "transaction_fees_orderId_idx" ON "transaction_fees"("orderId");
CREATE INDEX "transaction_fees_processedAt_idx" ON "transaction_fees"("processedAt");
CREATE INDEX "transaction_fees_payoutStatus_idx" ON "transaction_fees"("payoutStatus");
CREATE INDEX "invoices_subscriptionId_idx" ON "invoices"("subscriptionId");
CREATE INDEX "invoices_stripeInvoiceId_idx" ON "invoices"("stripeInvoiceId");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");
CREATE INDEX "staff_role_hierarchy_restaurantId_idx" ON "staff_role_hierarchy"("restaurantId");
CREATE INDEX "staff_role_hierarchy_parentId_idx" ON "staff_role_hierarchy"("parentId");
CREATE INDEX "staff_restaurantId_idx" ON "staff"("restaurantId");
CREATE INDEX "staff_roleId_idx" ON "staff"("roleId");
CREATE INDEX "audit_logs_tableName_idx" ON "audit_logs"("tableName");
CREATE INDEX "audit_logs_recordId_idx" ON "audit_logs"("recordId");
CREATE INDEX "audit_logs_operation_idx" ON "audit_logs"("operation");
CREATE INDEX "audit_logs_changedBy_idx" ON "audit_logs"("changedBy");
CREATE INDEX "audit_logs_changedByType_idx" ON "audit_logs"("changedByType");
CREATE INDEX "audit_logs_restaurantId_idx" ON "audit_logs"("restaurantId");
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");
CREATE INDEX "audit_logs_category_idx" ON "audit_logs"("category");
CREATE INDEX "audit_logs_changedAt_idx" ON "audit_logs"("changedAt");

-- Add foreign key constraints
ALTER TABLE "platform_admin_sessions" ADD CONSTRAINT "platform_admin_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_owner_sessions" ADD CONSTRAINT "restaurant_owner_sessions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "restaurant_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "restaurant_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_fees" ADD CONSTRAINT "transaction_fees_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_fees" ADD CONSTRAINT "transaction_fees_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_fees" ADD CONSTRAINT "transaction_fees_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_role_hierarchy" ADD CONSTRAINT "staff_role_hierarchy_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_role_hierarchy" ADD CONSTRAINT "staff_role_hierarchy_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_role_hierarchy" ADD CONSTRAINT "staff_role_hierarchy_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "staff_role_hierarchy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff" ADD CONSTRAINT "staff_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff" ADD CONSTRAINT "staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "restaurant_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;