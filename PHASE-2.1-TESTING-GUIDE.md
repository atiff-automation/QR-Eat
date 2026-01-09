# Phase 2.1 Subdomain Routing - Complete Testing Guide

## 🚀 **Pre-Testing Setup**

### 1. Start the Development Server
```bash
cd /Users/atiffriduan/Desktop/QROrder/qr-restaurant-system
npm run dev
```
**Expected:** Server starts on http://localhost:3000

### 2. Verify Database Connection
Open your browser and go to: http://localhost:3000/api/health
**Expected:** JSON response: `{"status": "ok", "timestamp": "..."}`

---

## 📋 **TESTING CHECKLIST**

## **Part 1: Main Domain Testing (Multi-Tenant Platform)**

### Test 1.1: Main Homepage Access
1. **URL:** http://localhost:3000
2. **Expected Results:**
   - ✅ Page loads successfully
   - ✅ Shows "Tabtep" title
   - ✅ Displays multi-tenant features grid
   - ✅ Shows demo section with restaurant examples
   - ✅ Navigation includes "Find Restaurant" and "Login" buttons

### Test 1.2: Restaurant Discovery Page
1. **URL:** http://localhost:3000/restaurants
2. **Expected Results:**
   - ✅ "Restaurant Directory" page loads
   - ✅ Search form with toggle between "Email" and "Name" search
   - ✅ Shows development quick search buttons (Mario, John, Staff Member)

### Test 1.3: Restaurant Discovery - Search by Email
1. **Action:** Click "Search by Email" → Enter `mario@rossigroup.com` → Click Search
2. **Expected Results:**
   - ✅ Shows "Restaurant Found" or "X Restaurants Found"
   - ✅ Displays restaurant cards with:
     - Restaurant name
     - Owner information
     - Subdomain URL (e.g., `marios-authentic-italian.localhost:3000`)
     - "View Menu" and "Staff Login" buttons

### Test 1.4: Restaurant Discovery - Search by Name
1. **Action:** Click "Search by Name" → Enter `mario` → Click Search
2. **Expected Results:**
   - ✅ Similar results to email search
   - ✅ Shows matching restaurants

### Test 1.5: Main Domain Login Page
1. **URL:** http://localhost:3000/login
2. **Expected Results:**
   - ✅ Shows "QR Restaurant System" title
   - ✅ Subtitle: "Multi-Tenant SaaS Login"
   - ✅ Quick login options for Platform Admin, Owners, and Staff
   - ✅ Email and password fields

---

## **Part 2: Platform Admin Testing**

### Test 2.1: Platform Admin Login
1. **Action:** On http://localhost:3000/login
   - Enter email: `admin@qrorder.com`
   - Enter password: `admin123`
   - Click Login
2. **Expected Results:**
   - ✅ Login successful
   - ✅ Redirects to admin dashboard
   - ✅ Shows admin interface with access to all restaurants

### Test 2.2: Platform Admin Dashboard Access
1. **URL:** http://localhost:3000/admin/dashboard (after login)
2. **Expected Results:**
   - ✅ Admin dashboard loads
   - ✅ Shows system-wide statistics
   - ✅ Can manage all restaurants
   - ✅ Platform admin navigation menu

---

## **Part 3: Restaurant Owner Testing**

### Test 3.1: Restaurant Owner Login (Main Domain)
1. **Action:** On http://localhost:3000/login
   - Enter email: `mario@rossigroup.com`
   - Enter password: `owner123`
   - Click Login
2. **Expected Results:**
   - ✅ Login successful
   - ✅ Redirects to owner dashboard
   - ✅ Shows owner's restaurants list

### Test 3.2: Owner Dashboard Access
1. **URL:** http://localhost:3000/owner/dashboard (after login)
2. **Expected Results:**
   - ✅ Owner dashboard loads
   - ✅ Shows list of owned restaurants
   - ✅ Can manage multiple restaurants
   - ✅ Owner-specific navigation menu

---

## **Part 4: Subdomain Routing Testing (Core Feature)**

### Test 4.1: Valid Subdomain Access - Mario's Restaurant
1. **URL:** http://marios-authentic-italian.localhost:3000
2. **Expected Results:**
   - ✅ Loads Mario's restaurant customer menu
   - ✅ Shows restaurant-specific branding
   - ✅ URL remains on subdomain
   - ✅ No redirect to main domain

### Test 4.2: Valid Subdomain Access - Tasty Burger Downtown
1. **URL:** http://tasty-burger-downtown.localhost:3000
2. **Expected Results:**
   - ✅ Loads Tasty Burger customer menu
   - ✅ Restaurant-specific content
   - ✅ Different from Mario's content

### Test 4.3: Valid Subdomain Access - Tasty Burger Westside
1. **URL:** http://tasty-burger-westside.localhost:3000
2. **Expected Results:**
   - ✅ Loads Tasty Burger Westside menu
   - ✅ Restaurant-specific content
   - ✅ Different from Downtown location

### Test 4.4: Invalid Subdomain Access
1. **URL:** http://non-existent-restaurant.localhost:3000
2. **Expected Results:**
   - ✅ Redirects to restaurant-not-found page
   - ✅ Shows error message with suggestions
   - ✅ Provides link back to main site

### Test 4.5: Reserved Subdomain Protection
1. **URLs to test:**
   - http://admin.localhost:3000
   - http://api.localhost:3000
   - http://www.localhost:3000
2. **Expected Results:**
   - ✅ All redirect to main domain (localhost:3000)
   - ✅ Don't show restaurant content
   - ✅ Reserved subdomains are protected

---

## **Part 5: Subdomain Authentication Testing**

### Test 5.1: Subdomain Staff Login - Mario's Restaurant
1. **URL:** http://marios-authentic-italian.localhost:3000/login
2. **Expected Results:**
   - ✅ Shows restaurant-specific login page
   - ✅ Title shows restaurant name or "Restaurant Login"
   - ✅ Subtitle: "Staff and Management Access"
   - ✅ Quick login options for restaurant staff

### Test 5.2: Staff Authentication - Valid Staff Member
1. **Action:** On http://marios-authentic-italian.localhost:3000/login
   - Enter email: `mario@marios-authentic.com`
   - Enter password: `staff123`
   - Click Login
2. **Expected Results:**
   - ✅ Login successful
   - ✅ Redirects to restaurant dashboard
   - ✅ Dashboard shows only Mario's restaurant data
   - ✅ URL remains on subdomain

### Test 5.3: Staff Authentication - Invalid Staff Member
1. **Action:** On http://marios-authentic-italian.localhost:3000/login
   - Enter email: `wrong@email.com`
   - Enter password: `wrong123`
   - Click Login
2. **Expected Results:**
   - ✅ Login fails with appropriate error message
   - ✅ Error is restaurant-context aware
   - ✅ Stays on subdomain login page

### Test 5.4: Cross-Restaurant Access Prevention
1. **Action:** 
   - Login as Tasty Burger staff: `john@tastyburger.com` / `staff123`
   - Try to access Mario's subdomain: http://marios-authentic-italian.localhost:3000/dashboard
2. **Expected Results:**
   - ✅ Access denied or redirected
   - ✅ Cannot access other restaurant's data
   - ✅ Tenant isolation working

---

## **Part 6: Subdomain Dashboard Testing**

### Test 6.1: Restaurant Dashboard on Subdomain
1. **URL:** http://marios-authentic-italian.localhost:3000/dashboard (after staff login)
2. **Expected Results:**
   - ✅ Dashboard loads with restaurant context
   - ✅ Shows only Mario's restaurant data
   - ✅ Menu items are Mario's items only
   - ✅ Orders are Mario's orders only
   - ✅ Staff can manage restaurant

### Test 6.2: Menu Management on Subdomain
1. **Action:** Navigate to menu management on subdomain dashboard
2. **Expected Results:**
   - ✅ Shows only current restaurant's menu items
   - ✅ Can add/edit menu items for current restaurant
   - ✅ Changes are isolated to current restaurant

### Test 6.3: Order Management on Subdomain
1. **Action:** Navigate to orders on subdomain dashboard
2. **Expected Results:**
   - ✅ Shows only current restaurant's orders
   - ✅ Can manage orders for current restaurant
   - ✅ No access to other restaurants' orders

---

## **Part 7: API Endpoint Testing**

### Test 7.1: Subdomain API Context
1. **Action:** Open browser DevTools → Network tab
2. **Navigate to:** http://marios-authentic-italian.localhost:3000/dashboard
3. **Check API calls in Network tab**
4. **Expected Results:**
   - ✅ API requests include tenant context headers:
     - `x-tenant-id`: Restaurant UUID
     - `x-tenant-slug`: marios-authentic-italian
     - `x-tenant-name`: Mario's Authentic Italian

### Test 7.2: Restaurant Discovery API
1. **Action:** Test the API directly
   ```bash
   curl -X POST http://localhost:3000/api/subdomain/redirect \
     -H "Content-Type: application/json" \
     -d '{"email": "mario@rossigroup.com"}'
   ```
2. **Expected Results:**
   - ✅ Returns JSON with restaurant list
   - ✅ Includes subdomain URLs
   - ✅ Shows restaurant details

### Test 7.3: Health Check API
1. **URL:** http://localhost:3000/api/health
2. **Expected Results:**
   - ✅ Returns `{"status": "ok"}`
   - ✅ Quick response time

---

## **Part 8: Error Handling Testing**

### Test 8.1: Restaurant Not Found Page
1. **URL:** http://invalid-restaurant.localhost:3000
2. **Expected Results:**
   - ✅ Shows restaurant not found page
   - ✅ Helpful error message
   - ✅ Link to restaurant finder
   - ✅ Suggestions for correct format

### Test 8.2: Access Denied Scenarios
1. **Action:** Try accessing admin features as regular staff
2. **Expected Results:**
   - ✅ Appropriate access denied messages
   - ✅ Graceful error handling
   - ✅ Redirect to appropriate pages

---

## **Part 9: Performance Testing**

### Test 9.1: Subdomain Resolution Speed
1. **Action:** Open multiple restaurant subdomains quickly:
   - http://marios-authentic-italian.localhost:3000
   - http://tasty-burger-downtown.localhost:3000  
   - http://tasty-burger-westside.localhost:3000
2. **Expected Results:**
   - ✅ All load quickly (< 1 second)
   - ✅ Second visits to same subdomain are faster (cached)
   - ✅ No noticeable delays

### Test 9.2: Database Query Performance
1. **Action:** Check browser DevTools → Network → Response times
2. **Expected Results:**
   - ✅ API responses under 200ms
   - ✅ Database queries are efficient
   - ✅ Caching is working

---

## **Part 10: Browser Compatibility Testing**

### Test 10.1: Multiple Browsers
Test the same key flows in:
- ✅ Chrome
- ✅ Firefox  
- ✅ Safari (if on Mac)
- ✅ Edge

### Test 10.2: Mobile Responsiveness
1. **Action:** Test on mobile view or responsive mode
2. **Expected Results:**
   - ✅ All pages responsive
   - ✅ Subdomain functionality works on mobile
   - ✅ Touch interactions work

---

## **Part 11: Security Testing**

### Test 11.1: JWT Token Security
1. **Action:** Login and check browser DevTools → Application → Cookies
2. **Expected Results:**
   - ✅ JWT token is present in cookies
   - ✅ Token includes tenant context
   - ✅ Token expires appropriately

### Test 11.2: Cross-Tenant Data Access
1. **Action:** Try to access another restaurant's data via direct API calls
2. **Expected Results:**
   - ✅ Access denied for unauthorized requests
   - ✅ RLS policies prevent data leakage
   - ✅ Proper error messages

---

## **EXPECTED TEST RESULTS SUMMARY**

### ✅ **Core Functionality (Must Pass)**
- [x] Main domain loads and shows SaaS platform
- [x] Restaurant discovery works for all search types
- [x] Valid subdomains load correct restaurant content
- [x] Invalid subdomains show proper error pages
- [x] Reserved subdomains are protected
- [x] Staff can login on their restaurant subdomain
- [x] Cross-tenant access is prevented
- [x] Dashboard shows correct restaurant data
- [x] API endpoints include proper tenant context

### ✅ **User Authentication (Must Pass)**
- [x] Platform admin can access all features
- [x] Restaurant owners can manage their restaurants
- [x] Staff can only access their assigned restaurant
- [x] Invalid credentials are rejected properly
- [x] JWT tokens include tenant context

### ✅ **Performance (Should Pass)**
- [x] Pages load under 2 seconds
- [x] Subsequent visits are faster due to caching
- [x] API responses under 500ms
- [x] No memory leaks or performance issues

### ✅ **Security (Must Pass)**
- [x] Tenant data isolation is complete
- [x] No cross-restaurant data access
- [x] Reserved subdomains are protected
- [x] JWT tokens are secure and expire properly
- [x] RLS policies prevent unauthorized access

---

## **TROUBLESHOOTING COMMON ISSUES**

### Issue 1: Subdomain Not Loading
**Problem:** http://restaurant-name.localhost:3000 doesn't work
**Solutions:**
1. Check if ENABLE_SUBDOMAIN_ROUTING="true" in .env
2. Verify restaurant slug exists in database
3. Try clearing browser cache
4. Check if server is running on port 3000

### Issue 2: Login Not Working
**Problem:** Login fails with correct credentials
**Solutions:**
1. Check database connection
2. Verify user exists in correct table (staff/restaurantOwner/platformAdmin)
3. Check JWT_SECRET in .env
4. Clear browser cookies and try again

### Issue 3: Restaurant Not Found
**Problem:** Valid restaurant shows "not found"
**Solutions:**
1. Verify restaurant.isActive = true in database
2. Check restaurant.slug matches subdomain
3. Run database seeding if needed
4. Check for typos in subdomain

### Issue 4: Permission Denied
**Problem:** User can't access expected features
**Solutions:**
1. Verify user type is correct
2. Check restaurant assignment for staff
3. Verify JWT token includes proper claims
4. Check RLS policies are not too restrictive

---

## **POST-TESTING VALIDATION**

After completing all tests, you should have verified:

✅ **Multi-tenant subdomain routing works perfectly**
✅ **All user types can authenticate and access appropriate features**
✅ **Tenant isolation is complete and secure**  
✅ **Performance is acceptable for production use**
✅ **Error handling is graceful and user-friendly**
✅ **API endpoints include proper tenant context**
✅ **Database queries are efficient and secure**

**Once all tests pass, Phase 2.1 is ready for production and we can proceed to Phase 2.2!** 🚀

---

*This testing guide ensures comprehensive validation of our subdomain routing implementation before moving to the next phase.*