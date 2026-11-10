# Tabtep

# What This Project Is

Tabtep is a web app for restaurants. It supports QR code ordering for customers, staff order handling, kitchen display screens, restaurant management, and platform-level admin controls.

# Who Uses This Project

* Public user
* Customer
* Staff
* Restaurant Owner
* Platform Admin

# Main Purpose

The main problem this project solves is helping restaurants take orders, manage tables, track kitchen work, process payments, and review business performance in one system.

# Main Features

* QR code ordering - Customers scan a table QR code, browse the menu, add items to a cart, and place an order.
* Restaurant directory - Public users can search for restaurants and view a restaurant profile page.
* Login and role-based access - Users log in and are routed based on their role and permissions.
* Dashboard - Staff and owners can see order activity, sales, and operational information.
* Kitchen display - Kitchen users can view incoming orders and update preparation status.
* Table management - Staff can view tables, update table status, and generate QR codes.
* Menu management - Staff can create, edit, organize, and disable menu categories and items.
* Staff management - Owners and admins can manage staff accounts, roles, and passwords.
* Reports and analytics - The app includes sales reports, operational reports, and profit/loss reporting.
* Expenses tracking - Owners and admins can record and review expenses and expense categories.
* Restaurant settings - Restaurants can configure hours, payment methods, receipt text, notifications, and financial labels.
* Public receipts - Customers can view receipts through a public receipt page.
* Reservations - The database and API support reservation creation and listing.
* Real-time updates - Order and table updates are pushed through live events.

# How The App Works

1. A customer finds a restaurant or opens a QR code for a table.
2. The customer views the menu, adds items to a cart, and submits an order.
3. The system creates the order, stores the table/session data, and sends updates to the kitchen and dashboard.
4. Staff and kitchen users review the order, update statuses, and manage preparation.
5. When needed, staff can take payment, manage tables, and view the receipt.
6. Owners and admins can review reports, expenses, roles, and restaurant settings.

# Important Pages

| Page / Route | Purpose |
| ------------ | ------- |
| `/` | Main landing page for Tabtep. |
| `/login` | Main login page with role-aware sign-in. |
| `/simple-login` | Simple test-style login page. |
| `/restaurants` | Public directory/search page for restaurants. |
| `/restaurant/[slug]` | Public restaurant profile page. |
| `/qr/[token]` | Customer QR ordering flow for a table. |
| `/receipt/[receiptNumber]` | Public receipt view. |
| `/dashboard` | Main staff dashboard. |
| `/dashboard/orders` | Order list and order operations. |
| `/dashboard/tables` | Table management and table QR screens. |
| `/dashboard/menu` | Menu and category management. |
| `/dashboard/staff` | Staff management page. |
| `/dashboard/reports` | Reports overview. |
| `/dashboard/reports/profit-loss` | Profit and loss report. |
| `/dashboard/expenses` | Expenses tracking page. |
| `/dashboard/settings` | Restaurant settings page. |
| `/kitchen` | Kitchen display board. |
| `/owner/dashboard` | Restaurant owner dashboard. |
| `/owner/expenses` | Owner-focused expenses page. |
| `/admin/dashboard` | Platform admin dashboard. |
| `/admin/restaurants` | Admin restaurant management. |
| `/admin/users` | Admin user management. |
| `/admin/analytics` | Platform analytics. |
| `/admin/permissions` | Permission and RBAC management. |
| `/admin/settings` | Platform settings. |

# Important API Routes

| API Route | Purpose |
| --------- | ------- |
| `/api/auth/*` | Login, logout, refresh, profile, password reset, and role switching. |
| `/api/qr/[token]` | Fetch table data from a QR token. |
| `/api/menu/[restaurantId]` | Fetch menu data for a restaurant. |
| `/api/qr/cart/*` | Manage the customer cart for QR ordering. |
| `/api/qr/orders/create` | Create an order from the QR cart. |
| `/api/orders/*` | Order creation, updates, status changes, lists, and modifications. |
| `/api/events/orders` | Real-time order event stream. |
| `/api/kitchen/orders` | Kitchen-facing order queue. |
| `/api/tables/*` | Table list, status, QR code, and bulk QR actions. |
| `/api/pos/payment/[orderId]` | Process payment for a single order. |
| `/api/pos/payment/table/[tableId]` | Process payment for all eligible orders on a table. |
| `/api/receipt/[restaurantId]/[receiptNumber]` | Fetch public receipt data. |
| `/api/restaurants/*` | Restaurant directory, profile, and owner restaurant data. |
| `/api/reservations` | Create and list reservations. |
| `/api/settings/restaurant/*` | Restaurant settings sections. |
| `/api/admin/*` | Platform admin functions like users, restaurants, analytics, and permissions. |
| `/api/owner/restaurants/*` | Owner-scoped restaurant management and reporting routes. |

# Database / Data Used

The project stores restaurant business data in PostgreSQL through Prisma.

Main data includes:

* Platform admins
* Restaurant owners
* Staff users
* User roles, permissions, sessions, and refresh tokens
* Restaurants and subscription plans
* Tables and QR tokens
* Menu categories, menu items, variation groups, and variation options
* Customer sessions and cart items
* Orders, order items, and order modifications
* Payments, payment intents, transaction fees, and invoices
* Reservations
* Notifications and push subscriptions
* Expense categories and expenses
* Audit logs, RBAC logs, pending events, and cache entries
* System configuration records

Important database tables in the schema include `restaurants`, `tables`, `menu_categories`, `menu_items`, `orders`, `order_items`, `payments`, `reservations`, `staff`, `user_roles`, `expenses`, and `expense_categories`.

# External Services

* PostgreSQL database
* Web Push notifications with VAPID keys
* Email service support, with SendGrid-style production code shown in the app
* File/image upload storage in local/public upload paths
* Subdomain and domain-based routing
* Payment-related services are mixed in the codebase; the app uses internal POS payment flows and also contains older Stripe-related billing fields plus ToyyibPay references in environment examples

# Environment Variables

* `DATABASE_URL` - PostgreSQL connection string.
* `JWT_SECRET` - Secret used to sign JWTs.
* `JWT_EXPIRES_IN` - JWT lifetime.
* `NEXTAUTH_URL` - Base URL used by auth flows and reset links.
* `APP_URL` - Main app URL used for public links.
* `NEXT_PUBLIC_APP_URL` - Public app URL expected by validation code.
* `NEXT_PUBLIC_BASE_URL` - Optional public base URL fallback.
* `NEXT_PUBLIC_BASE_DOMAIN` - Base domain for subdomain routing.
* `NEXT_PUBLIC_MAIN_DOMAIN` - Main domain used by middleware.
* `BASE_DOMAIN` - Server-side base domain fallback.
* `ENABLE_SUBDOMAIN_ROUTING` - Turns subdomain routing on or off.
* `CRON_SECRET` - Secret for scheduled maintenance endpoints.
* `UPLOAD_BASE_DIR` - Folder for uploaded images/files.
* `VAPID_PUBLIC_KEY` - Web Push public key.
* `VAPID_PRIVATE_KEY` - Web Push private key.
* `VAPID_SUBJECT` - Web Push contact subject.
* `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - Public VAPID key for the browser.
* `SENDGRID_API_KEY` - Email service API key in production code.
* `FROM_EMAIL` - Sender email for production emails.
* `EVENT_POLLING_INTERVAL_MS` - Polling interval for event handling.
* `EVENT_MAX_RETRY_ATTEMPTS` - Retry limit for event delivery.
* `EVENT_RETENTION_DAYS` - How long event data is kept.
* `NODE_ENV` - Runtime environment.
* `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL` - Present in example config, but Redis looks more legacy than central in the current code.
* `TOYYIBPAY_SANDBOX_URL`, `TOYYIBPAY_PRODUCTION_URL`, `TOYYIBPAY_TIMEOUT` - Present in example config for payment integration.

# Tech Stack

* Next.js App Router
* React
* TypeScript
* Prisma
* PostgreSQL
* Tailwind CSS
* TanStack Query
* Zod
* Jest
* Web Push / Service Worker support
* PostgreSQL LISTEN/NOTIFY for real-time events

# Current Status

* The core app is substantial and looks partly production-ready.
* QR ordering, dashboard pages, kitchen display, tables, menu, staff, settings, reports, expenses, and RBAC are all present in the code.
* The project also has public restaurant pages, receipts, reservations, and live event handling.
* Some parts look complete enough to use, but there are still debug pages, test pages, and legacy backup files in the repo.
* The root `README.md` is stale in a few places, especially around Stripe, Redis, and Socket.io claims.
* The payment and billing story is mixed: internal POS payments are implemented, while older Stripe-related fields and ToyyibPay references also remain.
* Some hooks, API routes, and docs still contain placeholder or TODO notes, so not every feature looks fully finished.
* Unsure areas: which external payment provider is the true production source of truth, and which older docs are still authoritative.

# Simple Summary

This project is a web app that helps restaurant owners, staff, and customers manage QR ordering, kitchen work, tables, payments, and reporting. The main flow is customer scans QR code, places an order, staff and kitchen process it, and owners review the results.
