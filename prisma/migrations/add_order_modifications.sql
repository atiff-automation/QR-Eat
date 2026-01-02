-- Migration: Add order modifications tracking tables
-- This migration creates tables for tracking order modifications with idempotency and audit trail

-- Create order_modifications table
CREATE TABLE IF NOT EXISTS order_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  modified_by UUID NOT NULL REFERENCES users(id),
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Modification details
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('out_of_stock', 'customer_request', 'kitchen_error', 'other')),
  reason_notes TEXT,
  
  -- Financial tracking
  old_total DECIMAL(10, 2) NOT NULL,
  new_total DECIMAL(10, 2) NOT NULL,
  
  -- Customer notification
  customer_notified BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMP WITH TIME ZONE,
  
  -- Idempotency (prevent duplicate modifications)
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_modifications_order_id ON order_modifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_modifications_modified_at ON order_modifications(modified_at);
CREATE INDEX IF NOT EXISTS idx_order_modifications_idempotency_key ON order_modifications(idempotency_key);

-- Create order_modification_items table
CREATE TABLE IF NOT EXISTS order_modification_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modification_id UUID NOT NULL REFERENCES order_modifications(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  
  -- Change tracking
  action VARCHAR(20) NOT NULL CHECK (action IN ('added', 'removed', 'quantity_changed')),
  old_quantity INTEGER,
  new_quantity INTEGER,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_modification_items_modification_id ON order_modification_items(modification_id);
CREATE INDEX IF NOT EXISTS idx_modification_items_order_item_id ON order_modification_items(order_item_id);

-- Add modification tracking fields to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS has_modifications BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS modification_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_orders_has_modifications ON orders(has_modifications);
CREATE INDEX IF NOT EXISTS idx_orders_version ON orders(version);

-- Add comment for documentation
COMMENT ON TABLE order_modifications IS 'Tracks all modifications made to orders including cancellations';
COMMENT ON COLUMN order_modifications.idempotency_key IS 'Prevents duplicate modifications from double-clicks or retries';
COMMENT ON COLUMN orders.version IS 'Optimistic locking - incremented on each modification to prevent concurrent edit conflicts';
