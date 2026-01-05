-- Insert tables for Mario's Authentic Italian
-- Note: Using TEXT values for status instead of ENUM

-- First, get the restaurant ID
DO $$
DECLARE
  mario_restaurant_id TEXT;
BEGIN
  SELECT id INTO mario_restaurant_id FROM restaurants WHERE slug = 'marios-authentic-italian';
  
  -- Insert Table 1
  INSERT INTO tables (id, "restaurantId", "tableNumber", "tableName", "qrCodeToken", capacity, status, "locationDescription", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    mario_restaurant_id,
    '1',
    'Window Table',
    encode(convert_to('{"tableId":"mario-table-1","restaurant":"marios-authentic-italian","timestamp":' || extract(epoch from now())::bigint || '}', 'UTF8'), 'base64'),
    2,
    'AVAILABLE',
    'By the front window',
    NOW(),
    NOW()
  ) ON CONFLICT ("restaurantId", "tableNumber") DO NOTHING;
  
  -- Insert Table 2
  INSERT INTO tables (id, "restaurantId", "tableNumber", "tableName", "qrCodeToken", capacity, status, "locationDescription", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    mario_restaurant_id,
    '2',
    'Center Table',
    encode(convert_to('{"tableId":"mario-table-2","restaurant":"marios-authentic-italian","timestamp":' || extract(epoch from now())::bigint || '}', 'UTF8'), 'base64'),
    4,
    'AVAILABLE',
    'Center dining area',
    NOW(),
    NOW()
  ) ON CONFLICT ("restaurantId", "tableNumber") DO NOTHING;
  
  -- Insert Table 3
  INSERT INTO tables (id, "restaurantId", "tableNumber", "tableName", "qrCodeToken", capacity, status, "locationDescription", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    mario_restaurant_id,
    '3',
    'Romantic Booth',
    encode(convert_to('{"tableId":"mario-table-3","restaurant":"marios-authentic-italian","timestamp":' || extract(epoch from now())::bigint || '}', 'UTF8'), 'base64'),
    2,
    'AVAILABLE',
    'Intimate corner booth',
    NOW(),
    NOW()
  ) ON CONFLICT ("restaurantId", "tableNumber") DO NOTHING;
  
  RAISE NOTICE 'Tables created successfully for Mario''s Authentic Italian';
END $$;
