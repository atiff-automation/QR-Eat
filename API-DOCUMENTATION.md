# API Documentation
## QR Restaurant System - RBAC Enhanced APIs

**Version**: 2.0  
**Last Updated**: 2025-01-17  
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Authorization](#authorization)
4. [Core Endpoints](#core-endpoints)
5. [Admin Endpoints](#admin-endpoints)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [Webhook Events](#webhook-events)
9. [SDK Examples](#sdk-examples)
10. [Migration Guide](#migration-guide)

---

## Overview

### Base URL
- **Development**: `http://localhost:3000/api`
- **Staging**: `https://staging-api.qrrestaurant.com/api`
- **Production**: `https://api.qrrestaurant.com/api`

### API Version
Current API version: `v2` (RBAC-enhanced)

### Content Type
All requests should use `Content-Type: application/json` unless otherwise specified.

### Response Format
```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully",
  "timestamp": "2025-01-17T10:30:00Z"
}
```

### Error Format
```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Insufficient permissions to access this resource",
    "details": {
      "required_permission": "orders:write",
      "user_permissions": ["orders:read"]
    }
  },
  "timestamp": "2025-01-17T10:30:00Z"
}
```

---

## Authentication

### Overview
The API uses JWT-based authentication with enhanced RBAC (Role-Based Access Control) payload. All protected endpoints require a valid JWT token in the cookie or Authorization header.

### Authentication Methods

#### 1. Cookie Authentication (Recommended)
```http
Cookie: qr_auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 2. Bearer Token Authentication
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### JWT Payload Structure
```typescript
{
  // User Identity
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  
  // Role & Context
  currentRole: {
    id: string;
    userType: 'platform_admin' | 'restaurant_owner' | 'staff';
    roleTemplate: string;
    restaurantId?: string;
  };
  availableRoles: UserRole[];
  restaurantContext?: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  
  // Permissions
  permissions: string[];
  
  // Session
  sessionId: string;
  
  // Standard JWT Claims
  iat: number;
  exp: number;
  iss: string;
  sub: string;
}
```

---

## Authorization

### Permission System
The API uses a granular permission system with the following categories:

- **Platform**: `platform:read`, `platform:write`, `platform:delete`
- **Restaurant**: `restaurant:read`, `restaurant:write`, `restaurant:settings`
- **Orders**: `orders:read`, `orders:write`, `orders:kitchen`, `orders:fulfill`
- **Tables**: `tables:read`, `tables:write`, `tables:qr`, `tables:delete`
- **Staff**: `staff:read`, `staff:write`, `staff:invite`, `staff:delete`, `staff:roles`
- **Analytics**: `analytics:read`, `analytics:export`, `analytics:platform`
- **Menu**: `menu:read`, `menu:write`, `menu:delete`, `menu:categories`
- **Settings**: `settings:read`, `settings:write`, `settings:platform`
- **Billing**: `billing:read`, `billing:write`

### Permission Checking
Each endpoint specifies required permissions in the documentation. Users must have at least one of the required permissions to access the endpoint.

### Restaurant Context
Some operations are automatically scoped to the user's current restaurant context. Platform admins can access all restaurants.

---

## Core Endpoints

### Authentication Endpoints

#### POST /auth/login
Authenticate user and create session.

**Required Permissions**: None (public endpoint)

**Request Body**:
```json
{
  "email": "user@restaurant.com",
  "password": "securepassword",
  "restaurantSlug": "optional-restaurant-context"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@restaurant.com",
      "firstName": "John",
      "lastName": "Doe",
      "currentRole": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "userType": "restaurant_owner",
        "roleTemplate": "restaurant_owner",
        "restaurantId": "550e8400-e29b-41d4-a716-446655440002"
      },
      "availableRoles": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440001",
          "userType": "restaurant_owner",
          "roleTemplate": "restaurant_owner",
          "restaurantId": "550e8400-e29b-41d4-a716-446655440002"
        }
      ],
      "permissions": [
        "restaurant:read",
        "restaurant:write",
        "orders:read",
        "orders:write",
        "staff:read",
        "staff:write"
      ]
    },
    "restaurant": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "The Great Restaurant",
      "slug": "the-great-restaurant",
      "timezone": "America/New_York",
      "currency": "USD"
    }
  },
  "message": "Login successful"
}
```

**Error Responses**:
- `401 Unauthorized`: Invalid credentials
- `404 Not Found`: User not found
- `423 Locked`: Account locked due to multiple failed attempts

---

#### POST /auth/switch-role
Switch user's active role within the same session.

**Required Permissions**: User must have access to the target role

**Request Body**:
```json
{
  "newRoleId": "550e8400-e29b-41d4-a716-446655440003"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "currentRole": {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "userType": "staff",
      "roleTemplate": "manager",
      "restaurantId": "550e8400-e29b-41d4-a716-446655440002"
    },
    "permissions": [
      "restaurant:read",
      "orders:read",
      "orders:write",
      "tables:read",
      "tables:write"
    ]
  },
  "message": "Role switched successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid role ID or role not available to user
- `401 Unauthorized`: No valid session
- `403 Forbidden`: Role not accessible to user

---

#### GET /auth/me
Get current user information and session details.

**Required Permissions**: Valid authentication token

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@restaurant.com",
      "firstName": "John",
      "lastName": "Doe",
      "currentRole": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "userType": "restaurant_owner",
        "roleTemplate": "restaurant_owner",
        "restaurantId": "550e8400-e29b-41d4-a716-446655440002"
      },
      "availableRoles": [...],
      "permissions": [...],
      "sessionId": "550e8400-e29b-41d4-a716-446655440004"
    },
    "restaurant": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "The Great Restaurant",
      "slug": "the-great-restaurant"
    },
    "session": {
      "expiresAt": "2025-01-18T10:30:00Z",
      "lastActivity": "2025-01-17T15:45:00Z"
    }
  }
}
```

---

#### POST /auth/logout
Invalidate current session and clear authentication.

**Required Permissions**: Valid authentication token

**Response**:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

### Restaurant Management

#### GET /restaurants
Get restaurants accessible to the current user.

**Required Permissions**: `restaurants:read` OR `restaurant:read`

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20, max: 100)
- `search` (string, optional): Search by name or slug
- `status` (string, optional): Filter by status (`active`, `inactive`)

**Response**:
```json
{
  "success": true,
  "data": {
    "restaurants": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "The Great Restaurant",
        "slug": "the-great-restaurant",
        "address": "123 Main St, City, State 12345",
        "phone": "+1-555-123-4567",
        "email": "contact@greatrestaurant.com",
        "timezone": "America/New_York",
        "currency": "USD",
        "isActive": true,
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

#### GET /restaurants/:id
Get specific restaurant details.

**Required Permissions**: `restaurants:read` OR (`restaurant:read` AND restaurant context match)

**Path Parameters**:
- `id` (string, required): Restaurant UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "The Great Restaurant",
      "slug": "the-great-restaurant",
      "description": "A wonderful dining experience",
      "address": "123 Main St, City, State 12345",
      "phone": "+1-555-123-4567",
      "email": "contact@greatrestaurant.com",
      "website": "https://greatrestaurant.com",
      "timezone": "America/New_York",
      "currency": "USD",
      "settings": {
        "acceptsOnlineOrders": true,
        "requiresReservation": false,
        "autoAcceptOrders": true,
        "orderTimeout": 30
      },
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T10:30:00Z"
    }
  }
}
```

---

#### PUT /restaurants/:id
Update restaurant information.

**Required Permissions**: `restaurants:write` OR (`restaurant:write` AND restaurant context match)

**Path Parameters**:
- `id` (string, required): Restaurant UUID

**Request Body**:
```json
{
  "name": "Updated Restaurant Name",
  "description": "Updated description",
  "phone": "+1-555-123-4567",
  "email": "updated@restaurant.com",
  "website": "https://updated.com",
  "settings": {
    "acceptsOnlineOrders": true,
    "requiresReservation": false,
    "autoAcceptOrders": true,
    "orderTimeout": 45
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Updated Restaurant Name",
      // ... updated fields
      "updatedAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "Restaurant updated successfully"
}
```

---

### Order Management

#### GET /orders
Get orders for the current restaurant context.

**Required Permissions**: `orders:read`

**Query Parameters**:
- `status` (string, optional): Filter by status (`pending`, `preparing`, `ready`, `completed`, `cancelled`)
- `date` (string, optional): Filter by date (YYYY-MM-DD)
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response**:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "orderNumber": "ORD-2025-001",
        "status": "preparing",
        "customerName": "Jane Customer",
        "customerPhone": "+1-555-987-6543",
        "tableNumber": 5,
        "items": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440020",
            "name": "Grilled Chicken",
            "quantity": 2,
            "price": 18.99,
            "subtotal": 37.98,
            "modifications": ["No onions", "Extra sauce"]
          }
        ],
        "subtotal": 37.98,
        "tax": 3.04,
        "tip": 7.60,
        "total": 48.62,
        "paymentStatus": "paid",
        "createdAt": "2025-01-17T09:15:00Z",
        "updatedAt": "2025-01-17T09:45:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

#### POST /orders
Create a new order.

**Required Permissions**: `orders:write`

**Request Body**:
```json
{
  "customerName": "Jane Customer",
  "customerPhone": "+1-555-987-6543",
  "tableNumber": 5,
  "items": [
    {
      "menuItemId": "550e8400-e29b-41d4-a716-446655440030",
      "quantity": 2,
      "modifications": ["No onions", "Extra sauce"]
    }
  ],
  "specialInstructions": "Customer has nut allergy"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "orderNumber": "ORD-2025-001",
      "status": "pending",
      // ... full order details
      "createdAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "Order created successfully"
}
```

---

#### PUT /orders/:id/status
Update order status.

**Required Permissions**: `orders:update` OR `orders:fulfill`

**Path Parameters**:
- `id` (string, required): Order UUID

**Request Body**:
```json
{
  "status": "preparing",
  "estimatedReadyTime": "2025-01-17T11:00:00Z",
  "notes": "Order in progress"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "status": "preparing",
      "estimatedReadyTime": "2025-01-17T11:00:00Z",
      "updatedAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "Order status updated"
}
```

---

### Table Management

#### GET /tables
Get tables for the current restaurant.

**Required Permissions**: `tables:read`

**Response**:
```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440040",
        "number": 1,
        "capacity": 4,
        "status": "available",
        "qrCode": {
          "id": "550e8400-e29b-41d4-a716-446655440041",
          "code": "TBL-001-ABC123",
          "url": "https://app.qrrestaurant.com/qr/the-great-restaurant/TBL-001-ABC123",
          "createdAt": "2025-01-01T00:00:00Z"
        },
        "currentOrder": null,
        "isActive": true,
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

#### POST /tables
Create a new table.

**Required Permissions**: `tables:write`

**Request Body**:
```json
{
  "number": 15,
  "capacity": 6,
  "description": "Window table with view"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "table": {
      "id": "550e8400-e29b-41d4-a716-446655440042",
      "number": 15,
      "capacity": 6,
      "description": "Window table with view",
      "status": "available",
      "qrCode": {
        "id": "550e8400-e29b-41d4-a716-446655440043",
        "code": "TBL-015-XYZ789",
        "url": "https://app.qrrestaurant.com/qr/the-great-restaurant/TBL-015-XYZ789"
      },
      "isActive": true,
      "createdAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "Table created successfully"
}
```

---

#### POST /tables/:id/qr-code/regenerate
Regenerate QR code for a table.

**Required Permissions**: `tables:qr`

**Path Parameters**:
- `id` (string, required): Table UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "qrCode": {
      "id": "550e8400-e29b-41d4-a716-446655440044",
      "code": "TBL-001-NEW123",
      "url": "https://app.qrrestaurant.com/qr/the-great-restaurant/TBL-001-NEW123",
      "createdAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "QR code regenerated successfully"
}
```

---

### Staff Management

#### GET /staff
Get staff members for the current restaurant.

**Required Permissions**: `staff:read`

**Query Parameters**:
- `role` (string, optional): Filter by role template
- `status` (string, optional): Filter by status (`active`, `inactive`)
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response**:
```json
{
  "success": true,
  "data": {
    "staff": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440050",
        "email": "staff@restaurant.com",
        "firstName": "John",
        "lastName": "Staff",
        "username": "jstaff",
        "roles": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440051",
            "roleTemplate": "server_staff",
            "isActive": true,
            "createdAt": "2025-01-01T00:00:00Z"
          }
        ],
        "isActive": true,
        "lastLogin": "2025-01-17T08:00:00Z",
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

#### POST /staff
Create a new staff member.

**Required Permissions**: `staff:write` OR `staff:invite`

**Request Body**:
```json
{
  "email": "newstaff@restaurant.com",
  "firstName": "Jane",
  "lastName": "NewStaff",
  "username": "jnewstaff",
  "roleTemplate": "server_staff",
  "sendInviteEmail": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "staff": {
      "id": "550e8400-e29b-41d4-a716-446655440052",
      "email": "newstaff@restaurant.com",
      "firstName": "Jane",
      "lastName": "NewStaff",
      "username": "jnewstaff",
      "roles": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440053",
          "roleTemplate": "server_staff",
          "isActive": true
        }
      ],
      "isActive": true,
      "createdAt": "2025-01-17T10:30:00Z"
    },
    "invitation": {
      "id": "550e8400-e29b-41d4-a716-446655440054",
      "token": "INV-ABC123XYZ789",
      "expiresAt": "2025-01-24T10:30:00Z",
      "emailSent": true
    }
  },
  "message": "Staff member created and invitation sent"
}
```

---

#### PUT /staff/:id/roles
Update staff member's roles.

**Required Permissions**: `staff:roles`

**Path Parameters**:
- `id` (string, required): Staff member UUID

**Request Body**:
```json
{
  "roleTemplate": "manager",
  "customPermissions": ["analytics:read", "menu:write"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "staff": {
      "id": "550e8400-e29b-41d4-a716-446655440050",
      "roles": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440055",
          "roleTemplate": "manager",
          "customPermissions": ["analytics:read", "menu:write"],
          "isActive": true,
          "updatedAt": "2025-01-17T10:30:00Z"
        }
      ]
    }
  },
  "message": "Staff roles updated successfully"
}
```

---

### Menu Management

#### GET /menu
Get menu items for the current restaurant.

**Required Permissions**: `menu:read`

**Query Parameters**:
- `category` (string, optional): Filter by category
- `available` (boolean, optional): Filter by availability
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response**:
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440060",
        "name": "Appetizers",
        "description": "Start your meal right",
        "displayOrder": 1,
        "isActive": true
      }
    ],
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440061",
        "name": "Grilled Chicken",
        "description": "Perfectly seasoned grilled chicken breast",
        "price": 18.99,
        "categoryId": "550e8400-e29b-41d4-a716-446655440060",
        "image": "https://images.qrrestaurant.com/grilled-chicken.jpg",
        "allergens": ["gluten"],
        "isAvailable": true,
        "isActive": true,
        "displayOrder": 1,
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

#### POST /menu/items
Create a new menu item.

**Required Permissions**: `menu:write`

**Request Body**:
```json
{
  "name": "New Dish",
  "description": "Delicious new addition to our menu",
  "price": 22.99,
  "categoryId": "550e8400-e29b-41d4-a716-446655440060",
  "allergens": ["nuts", "dairy"],
  "isAvailable": true,
  "displayOrder": 10
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "item": {
      "id": "550e8400-e29b-41d4-a716-446655440062",
      "name": "New Dish",
      "description": "Delicious new addition to our menu",
      "price": 22.99,
      "categoryId": "550e8400-e29b-41d4-a716-446655440060",
      "allergens": ["nuts", "dairy"],
      "isAvailable": true,
      "isActive": true,
      "displayOrder": 10,
      "createdAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "Menu item created successfully"
}
```

---

### Analytics & Reporting

#### GET /analytics/dashboard
Get dashboard analytics for the current restaurant.

**Required Permissions**: `analytics:read`

**Query Parameters**:
- `period` (string, optional): Time period (`today`, `week`, `month`, `quarter`, `year`)
- `startDate` (string, optional): Start date (YYYY-MM-DD)
- `endDate` (string, optional): End date (YYYY-MM-DD)

**Response**:
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalOrders": 125,
      "totalRevenue": 2847.50,
      "averageOrderValue": 22.78,
      "popularItems": [
        {
          "itemId": "550e8400-e29b-41d4-a716-446655440061",
          "name": "Grilled Chicken",
          "quantity": 45,
          "revenue": 854.55
        }
      ]
    },
    "trends": {
      "dailyOrders": [
        {"date": "2025-01-17", "orders": 15, "revenue": 341.25},
        {"date": "2025-01-16", "orders": 18, "revenue": 412.65}
      ]
    },
    "performance": {
      "averagePreparationTime": 18.5,
      "orderAccuracy": 98.2,
      "customerSatisfaction": 4.7
    }
  }
}
```

---

## Admin Endpoints

### Permission Management

#### GET /admin/permissions
Get all system permissions.

**Required Permissions**: `platform:read` OR `admin:permissions:read`

**Response**:
```json
{
  "success": true,
  "data": {
    "permissions": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440070",
        "permissionKey": "orders:read",
        "description": "View orders",
        "category": "orders",
        "isActive": true,
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "categories": [
      {"category": "orders", "count": 8},
      {"category": "tables", "count": 4}
    ]
  }
}
```

---

#### GET /admin/role-templates
Get all role templates with their permissions.

**Required Permissions**: `platform:read` OR `admin:roles:read`

**Response**:
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "template": "restaurant_owner",
        "description": "Full restaurant management access",
        "permissions": [
          "restaurant:read",
          "restaurant:write",
          "orders:read",
          "orders:write",
          "staff:read",
          "staff:write"
        ],
        "userCount": 45,
        "isActive": true,
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

#### PUT /admin/role-templates/:template
Update role template permissions.

**Required Permissions**: `platform:write` OR `admin:roles:write`

**Path Parameters**:
- `template` (string, required): Role template name

**Request Body**:
```json
{
  "permissions": [
    "restaurant:read",
    "restaurant:write",
    "orders:read",
    "orders:write",
    "staff:read"
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "template": {
      "template": "restaurant_owner",
      "permissions": [
        "restaurant:read",
        "restaurant:write",
        "orders:read",
        "orders:write",
        "staff:read"
      ],
      "updatedAt": "2025-01-17T10:30:00Z"
    }
  },
  "message": "Role template updated successfully"
}
```

---

### User Management

#### GET /admin/users
Get all users with their roles (platform admin only).

**Required Permissions**: `platform:read` OR `users:read`

**Query Parameters**:
- `userType` (string, optional): Filter by user type
- `roleTemplate` (string, optional): Filter by role template
- `restaurantId` (string, optional): Filter by restaurant
- `status` (string, optional): Filter by status
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@restaurant.com",
        "firstName": "John",
        "lastName": "Doe",
        "userType": "restaurant_owner",
        "roles": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "roleTemplate": "restaurant_owner",
            "restaurantId": "550e8400-e29b-41d4-a716-446655440002",
            "restaurantName": "The Great Restaurant",
            "isActive": true,
            "createdAt": "2025-01-01T00:00:00Z"
          }
        ],
        "isActive": true,
        "lastLogin": "2025-01-17T08:00:00Z",
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### Audit Logs

#### GET /admin/audit-logs
Get system audit logs.

**Required Permissions**: `platform:read` OR `admin:audit:read`

**Query Parameters**:
- `userId` (string, optional): Filter by user ID
- `action` (string, optional): Filter by action type
- `startDate` (string, optional): Start date (ISO 8601)
- `endDate` (string, optional): End date (ISO 8601)
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440080",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "userEmail": "user@restaurant.com",
        "action": "ROLE_SWITCH",
        "resource": "/api/auth/switch-role",
        "fromRole": "restaurant_owner",
        "toRole": "manager",
        "metadata": {
          "sessionId": "550e8400-e29b-41d4-a716-446655440004",
          "userAgent": "Mozilla/5.0..."
        },
        "ipAddress": "192.168.1.100",
        "createdAt": "2025-01-17T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## Error Handling

### HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., duplicate email)
- `422 Unprocessable Entity`: Validation errors
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "additional error details",
      "validation": ["array of validation errors"]
    }
  },
  "timestamp": "2025-01-17T10:30:00Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440090"
}
```

### Common Error Codes

- `INVALID_CREDENTIALS`: Login failed
- `PERMISSION_DENIED`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `VALIDATION_ERROR`: Request validation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `SESSION_EXPIRED`: Authentication token expired
- `ROLE_NOT_AVAILABLE`: Requested role not accessible
- `RESTAURANT_CONTEXT_MISMATCH`: Operation not allowed in current restaurant context

### Validation Errors

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "validation": [
        {
          "field": "email",
          "message": "Email is required",
          "code": "REQUIRED"
        },
        {
          "field": "price",
          "message": "Price must be greater than 0",
          "code": "MIN_VALUE"
        }
      ]
    }
  }
}
```

---

## Rate Limiting

### Limits by Endpoint Type

- **Authentication**: 5 requests per minute per IP
- **Standard API**: 100 requests per minute per user
- **Admin API**: 50 requests per minute per user
- **File Upload**: 10 requests per minute per user

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705486200
```

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 60,
      "limit": 100,
      "window": "1 minute"
    }
  }
}
```

---

## Webhook Events

### Event Types

- `order.created`: New order placed
- `order.status_changed`: Order status updated
- `user.role_switched`: User switched roles
- `staff.invited`: New staff member invited
- `table.qr_regenerated`: Table QR code regenerated

### Webhook Payload Format

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440100",
  "event": "order.created",
  "timestamp": "2025-01-17T10:30:00Z",
  "data": {
    "order": {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "orderNumber": "ORD-2025-001",
      "status": "pending",
      "total": 48.62
    },
    "restaurant": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "The Great Restaurant"
    }
  },
  "signature": "sha256=abc123..."
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { QRRestaurantAPI } from '@qr-restaurant/api-client';

const api = new QRRestaurantAPI({
  baseURL: 'https://api.qrrestaurant.com/api',
  apiKey: 'your-api-key'
});

// Authenticate
const auth = await api.auth.login({
  email: 'user@restaurant.com',
  password: 'password'
});

// Get orders
const orders = await api.orders.list({
  status: 'pending',
  page: 1,
  limit: 20
});

// Switch role
const roleSwitch = await api.auth.switchRole({
  newRoleId: 'role-uuid'
});

// Create order
const order = await api.orders.create({
  customerName: 'John Doe',
  tableNumber: 5,
  items: [
    {
      menuItemId: 'item-uuid',
      quantity: 2
    }
  ]
});
```

### Python

```python
from qr_restaurant_api import QRRestaurantAPI

api = QRRestaurantAPI(
    base_url='https://api.qrrestaurant.com/api',
    api_key='your-api-key'
)

# Authenticate
auth = api.auth.login(
    email='user@restaurant.com',
    password='password'
)

# Get orders
orders = api.orders.list(
    status='pending',
    page=1,
    limit=20
)

# Create staff member
staff = api.staff.create(
    email='newstaff@restaurant.com',
    first_name='Jane',
    last_name='Staff',
    role_template='server_staff'
)
```

### cURL Examples

```bash
# Login
curl -X POST https://api.qrrestaurant.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@restaurant.com",
    "password": "password"
  }'

# Get user info (with cookie)
curl https://api.qrrestaurant.com/api/auth/me \
  -H "Cookie: qr_auth_token=JWT_TOKEN"

# Create order
curl -X POST https://api.qrrestaurant.com/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{
    "customerName": "John Doe",
    "tableNumber": 5,
    "items": [
      {
        "menuItemId": "item-uuid",
        "quantity": 2
      }
    ]
  }'

# Switch role
curl -X POST https://api.qrrestaurant.com/api/auth/switch-role \
  -H "Content-Type: application/json" \
  -H "Cookie: qr_auth_token=JWT_TOKEN" \
  -d '{
    "newRoleId": "role-uuid"
  }'
```

---

## Migration Guide

### Breaking Changes from v1 to v2

#### Authentication
- **Old**: Multiple cookie types (`qr_owner_token`, `qr_staff_token`, `qr_admin_token`)
- **New**: Single JWT token (`qr_auth_token`) with enhanced payload

#### User Context
- **Old**: User type determined by cookie type
- **New**: User context includes current role, available roles, and permissions

#### Authorization
- **Old**: Route-based authorization by user type
- **New**: Permission-based authorization with granular control

### Migration Steps

1. **Update Authentication**:
   ```typescript
   // Old
   const token = req.cookies.qr_owner_token || req.cookies.qr_staff_token;
   
   // New
   const token = req.cookies.qr_auth_token;
   const payload = jwt.verify(token, JWT_SECRET) as EnhancedJWTPayload;
   ```

2. **Update Permission Checking**:
   ```typescript
   // Old
   if (userType === 'restaurant_owner') {
     // Allow access
   }
   
   // New
   if (payload.permissions.includes('orders:write')) {
     // Allow access
   }
   ```

3. **Update API Calls**:
   ```typescript
   // Old
   fetch('/api/orders', {
     headers: {
       'Authorization': `Bearer ${ownerToken}`
     }
   });
   
   // New
   fetch('/api/orders', {
     // Cookie automatically included
   });
   ```

### Compatibility Layer

The API includes a compatibility layer for legacy tokens during the migration period. Legacy tokens are automatically converted to the new format when detected.

---

## Support & Resources

### Documentation
- [RBAC System Documentation](./RBAC-SYSTEM-DOCUMENTATION.md)
- [Migration Guide](./scripts/README.md)
- [SDKs and Libraries](https://github.com/qr-restaurant/sdks)

### Support Channels
- **Email**: api-support@qrrestaurant.com
- **Discord**: [QR Restaurant Developers](https://discord.gg/qrrestaurant)
- **GitHub**: [API Issues](https://github.com/qr-restaurant/api/issues)

### Changelog
- **v2.0.0**: RBAC implementation with enhanced JWT and permission system
- **v1.5.0**: Legacy cookie-based authentication (deprecated)

---

**Document Information**
- **Created**: 2025-01-17
- **Last Updated**: 2025-01-17
- **Version**: 2.0
- **Status**: Production Ready
- **Next Review**: 2025-02-17

*This API documentation is maintained alongside the QR Restaurant System codebase. Please refer to the latest version for accurate information.*