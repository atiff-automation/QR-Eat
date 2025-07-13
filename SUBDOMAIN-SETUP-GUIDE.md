# Subdomain Routing Setup Guide

## Overview

The QROrder SaaS platform implements a comprehensive subdomain-based multi-tenant architecture where each restaurant gets its own dedicated subdomain for complete brand isolation and custom customer experience.

## Architecture Components

### 1. Subdomain Detection (`src/lib/subdomain.ts`)

Core utilities for detecting and processing subdomains:

```typescript
// Extract subdomain information from request
const subdomainInfo = getSubdomainInfo(request);

// Validate if subdomain belongs to a restaurant
const isValid = isValidRestaurantSubdomain(subdomain);

// Generate subdomain URLs
const menuUrl = generateSubdomainUrl('restaurant-slug', '/');
const dashboardUrl = generateSubdomainUrl('restaurant-slug', '/dashboard');
```

**Key Functions:**
- `getSubdomainInfo()` - Extracts subdomain from host header
- `isValidRestaurantSubdomain()` - Validates subdomain format and availability
- `generateSubdomainUrl()` - Creates fully qualified subdomain URLs
- `normalizeSubdomain()` - Standardizes subdomain format

### 2. Tenant Resolution (`src/lib/tenant-resolver.ts`)

High-performance tenant lookup with caching:

```typescript
// Resolve restaurant by subdomain
const tenant = await resolveTenant('restaurant-slug');

// Get tenant with subscription info
const tenantWithSub = await resolveTenantWithSubscription('restaurant-slug');

// Preload cache for performance
await preloadTenantCache();
```

**Features:**
- In-memory caching for fast lookups
- Subscription status validation
- Cache preloading for optimal performance
- TTL-based cache invalidation

### 3. Subdomain Middleware (`src/middleware.ts`)

Intelligent routing based on subdomain detection:

```typescript
// Middleware handles:
// 1. Subdomain detection
// 2. Tenant resolution
// 3. Context injection
// 4. Route protection
// 5. Error handling
```

**Routing Logic:**
- Main domain → Platform homepage
- Valid restaurant subdomain → Restaurant-specific content
- Invalid subdomain → Error page with suggestions
- Reserved subdomains → Platform features

### 4. Authentication Integration (`src/lib/subdomain-auth.ts`)

Subdomain-aware authentication system:

```typescript
// Get authentication context for current subdomain
const authContext = getClientSubdomainAuthContext();

// Validate user access to specific tenant
const hasAccess = await validateSubdomainAccess(user, tenantId);

// Handle post-login redirects
const redirectUrl = handlePostLoginRedirect(tenant, userType);
```

## Configuration

### Environment Variables (.env)

```bash
# Enable subdomain routing
ENABLE_SUBDOMAIN_ROUTING="true"

# Base domain for subdomain generation
BASE_DOMAIN="localhost:3000"  # Development
BASE_DOMAIN="yourdomain.com"  # Production

# JWT configuration
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"
```

### Reserved Subdomains

The following subdomains are reserved for platform use:

- `admin` - Platform administration
- `api` - API services
- `www` - Main website
- `mail` - Email services
- `support` - Customer support
- `blog` - Company blog
- `docs` - Documentation

## URL Structure

### Development URLs

```
Main Platform:
http://localhost:3000

Restaurant Subdomains:
http://restaurant-slug.localhost:3000
http://restaurant-slug.localhost:3000/dashboard
http://restaurant-slug.localhost:3000/qr
```

### Production URLs

```
Main Platform:
https://yourdomain.com

Restaurant Subdomains:
https://restaurant-slug.yourdomain.com
https://restaurant-slug.yourdomain.com/dashboard
https://restaurant-slug.yourdomain.com/qr
```

## DNS Configuration

### Development Setup

For local development, use `localhost` subdomains:
- Modern browsers automatically resolve `*.localhost` to `127.0.0.1`
- No additional DNS configuration required
- Test with: `http://test.localhost:3000`

### Production Setup

Configure DNS with wildcard subdomain support:

```dns
# A Records
yourdomain.com.          A    YOUR_SERVER_IP
*.yourdomain.com.        A    YOUR_SERVER_IP

# Or CNAME if using a CDN
*.yourdomain.com.        CNAME    your-cdn-domain.com.
```

## Restaurant Subdomain Management

### Subdomain Rules

1. **Format Requirements:**
   - 3-63 characters long
   - Lowercase letters, numbers, and hyphens only
   - Must start and end with alphanumeric character
   - Cannot use reserved subdomain names

2. **Validation Pattern:**
   ```regex
   ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$
   ```

3. **Examples:**
   - ✅ `marios-restaurant`
   - ✅ `tasty-burger-123`
   - ✅ `cafe-downtown`
   - ❌ `Mario's Restaurant` (uppercase, special chars)
   - ❌ `-invalid-start` (starts with hyphen)
   - ❌ `admin` (reserved subdomain)

### Subdomain Discovery

Users can find their restaurant subdomains through:

1. **Restaurant Finder Page** (`/restaurants`)
   - Search by email address
   - Search by restaurant name/slug
   - Lists all accessible restaurants

2. **API Endpoint** (`/api/subdomain/redirect`)
   ```javascript
   // Find restaurants by email
   const response = await fetch('/api/subdomain/redirect', {
     method: 'POST',
     body: JSON.stringify({ email: 'user@example.com' })
   });

   // Find restaurant by slug
   const response = await fetch('/api/subdomain/redirect', {
     method: 'POST',
     body: JSON.stringify({ restaurantSlug: 'restaurant-name' })
   });
   ```

## User Access Patterns

### Restaurant Staff Access

1. **Direct Subdomain Login:**
   ```
   https://restaurant-name.yourdomain.com/login
   ```
   - Automatically sets restaurant context
   - Validates staff belongs to restaurant
   - Redirects to restaurant dashboard

2. **Main Platform Login:**
   ```
   https://yourdomain.com/login
   ```
   - Staff logs in with restaurant selection
   - Redirects to appropriate subdomain

### Restaurant Owner Access

1. **Owner Dashboard:**
   ```
   https://yourdomain.com/owner
   ```
   - Manages multiple restaurants
   - Can switch between restaurant contexts
   - Access to all owned restaurants

2. **Individual Restaurant Management:**
   ```
   https://restaurant-name.yourdomain.com/dashboard
   ```
   - Direct access to specific restaurant
   - Full management capabilities

### Platform Admin Access

1. **Admin Portal:**
   ```
   https://yourdomain.com/admin
   ```
   - System-wide administration
   - All restaurants management
   - Platform configuration

## API Integration

### Tenant Context Headers

All API requests in subdomain context include:

```http
x-tenant-id: restaurant-uuid
x-tenant-slug: restaurant-slug
x-tenant-name: Restaurant Name
```

### Authentication Flow

1. **Subdomain Login:**
   ```javascript
   POST /api/auth/login
   {
     "email": "staff@restaurant.com",
     "password": "password",
     "restaurantSlug": "restaurant-name", // Auto-detected from subdomain
     "expectedTenantId": "uuid" // Optional validation
   }
   ```

2. **Response with Tenant Context:**
   ```javascript
   {
     "success": true,
     "user": { ... },
     "tenant": {
       "id": "uuid",
       "name": "Restaurant Name",
       "slug": "restaurant-name"
     },
     "redirectUrl": "/dashboard"
   }
   ```

## Security Considerations

### Tenant Isolation

1. **Database Level:**
   - Row-Level Security (RLS) policies
   - Automatic tenant filtering
   - Cross-tenant access prevention

2. **Application Level:**
   - JWT tokens include tenant context
   - Middleware validates tenant access
   - API endpoints enforce tenant boundaries

3. **Subdomain Validation:**
   - Reserved subdomain protection
   - Format validation and sanitization
   - Tenant ownership verification

### Security Headers

```http
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Performance Optimization

### Caching Strategy

1. **Tenant Resolution Cache:**
   - In-memory caching with TTL
   - Preloading for active tenants
   - Cache invalidation on updates

2. **DNS Caching:**
   - Browser DNS cache optimization
   - CDN configuration for subdomains

3. **Database Optimization:**
   - Indexed tenant lookups
   - Connection pooling per tenant
   - Query optimization

## Testing

### Local Testing

1. **Manual Subdomain Testing:**
   ```bash
   # Test main domain
   curl http://localhost:3000

   # Test restaurant subdomain
   curl http://restaurant-name.localhost:3000

   # Test with custom host header
   curl -H "Host: restaurant-name.localhost:3000" http://localhost:3000
   ```

2. **Automated Testing:**
   ```bash
   # Run subdomain routing tests
   node tests/subdomain-routing-test.js
   ```

### Production Testing

1. **DNS Resolution:**
   ```bash
   # Test DNS resolution
   nslookup restaurant-name.yourdomain.com

   # Test wildcard subdomain
   nslookup test.yourdomain.com
   ```

2. **SSL Certificate:**
   ```bash
   # Verify SSL for subdomains
   openssl s_client -connect restaurant-name.yourdomain.com:443
   ```

## Deployment Checklist

### Development to Production

- [ ] Update `BASE_DOMAIN` in environment variables
- [ ] Configure wildcard DNS records
- [ ] Set up SSL certificates for `*.yourdomain.com`
- [ ] Update CORS settings for subdomains
- [ ] Configure CDN for subdomain support
- [ ] Test subdomain routing in production environment
- [ ] Verify tenant isolation and security
- [ ] Monitor performance and caching
- [ ] Set up subdomain analytics tracking

### Monitoring

1. **Metrics to Track:**
   - Subdomain resolution performance
   - Tenant cache hit rates
   - Failed subdomain attempts
   - Cross-tenant access attempts

2. **Alerts:**
   - DNS resolution failures
   - Invalid subdomain access spikes
   - Tenant cache performance degradation
   - Security policy violations

## Troubleshooting

### Common Issues

1. **Subdomain Not Resolving:**
   - Check DNS configuration
   - Verify wildcard subdomain setup
   - Test with `nslookup` or `dig`

2. **Tenant Not Found:**
   - Verify restaurant slug in database
   - Check subdomain format validity
   - Ensure restaurant is active

3. **Authentication Issues:**
   - Verify JWT token includes tenant context
   - Check user has access to restaurant
   - Validate subdomain matches user permissions

4. **Cache Issues:**
   - Clear tenant resolution cache
   - Check cache TTL configuration
   - Monitor cache hit rates

### Debug Commands

```bash
# Check subdomain routing
curl -v -H "Host: restaurant-name.localhost:3000" http://localhost:3000

# Test tenant resolution
node -e "
const { resolveTenant } = require('./src/lib/tenant-resolver');
resolveTenant('restaurant-slug').then(console.log);
"

# Validate subdomain format
node -e "
const { isValidRestaurantSubdomain } = require('./src/lib/subdomain');
console.log(isValidRestaurantSubdomain('test-subdomain'));
"
```

## Migration Guide

### Existing Single-Tenant to Multi-Tenant

1. **Database Migration:**
   - Run tenant migration scripts
   - Update existing data with tenant context
   - Apply RLS policies

2. **Application Updates:**
   - Enable subdomain routing
   - Update authentication flows
   - Migrate user sessions

3. **DNS and SSL:**
   - Configure wildcard subdomains
   - Update SSL certificates
   - Test subdomain resolution

4. **User Communication:**
   - Notify users of new subdomain URLs
   - Provide migration timeline
   - Offer support during transition

## Best Practices

1. **Subdomain Naming:**
   - Use clear, memorable restaurant names
   - Avoid special characters and numbers when possible
   - Consider SEO implications

2. **Performance:**
   - Implement aggressive caching for tenant resolution
   - Use CDN for static subdomain content
   - Monitor subdomain routing performance

3. **Security:**
   - Regularly audit tenant isolation
   - Monitor for subdomain abuse
   - Implement rate limiting per subdomain

4. **User Experience:**
   - Provide clear subdomain discovery tools
   - Offer helpful error messages for invalid subdomains
   - Maintain consistent branding across subdomains

---

*This guide covers the complete subdomain routing implementation for the QROrder SaaS platform. For additional support, refer to the test suite and implementation files.*