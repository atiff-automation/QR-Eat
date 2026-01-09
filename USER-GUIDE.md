# User Guide
## Tabtep - RBAC Enhanced Interface

**Version**: 2.0  
**Last Updated**: 2025-01-17  
**Audience**: End Users (Restaurant Owners, Managers, Staff)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Understanding Your Role](#understanding-your-role)
3. [Role Switching](#role-switching)
4. [Dashboard Overview](#dashboard-overview)
5. [Core Features by Role](#core-features-by-role)
6. [Common Tasks](#common-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Tips & Best Practices](#tips--best-practices)
9. [Support](#support)

---

## Getting Started

### What's New in Version 2.0

The QR Restaurant System has been enhanced with a new **Role-Based Access Control (RBAC)** system that provides:

✅ **Seamless Role Switching**: Switch between your different roles without logging out  
✅ **Enhanced Security**: Better protection of your restaurant data  
✅ **Clearer Permissions**: You'll only see features you can use  
✅ **Better Organization**: Streamlined interface based on your current role  
✅ **Complete Audit Trail**: All actions are logged for security and compliance  

### Logging In

1. **Visit** your restaurant's login page
2. **Enter** your email and password
3. **Select** restaurant context (if you manage multiple restaurants)
4. **Click** "Sign In"

After logging in, you'll see:
- Your current role displayed in the top navigation
- A role switcher (if you have multiple roles)
- Navigation menu customized for your permissions

### First-Time Setup

If this is your first time using the new system:

1. **Check Your Role**: Look at the role badge in the top navigation
2. **Explore Navigation**: Notice that menu items are customized for your role
3. **Try Role Switching**: If you have multiple roles, try switching between them
4. **Review Permissions**: Each role has different capabilities - explore what you can do

---

## Understanding Your Role

The system uses five main role types, each with specific permissions and capabilities:

### 🏢 Platform Admin (Super Admin)
**Who**: System administrators who manage the entire platform  
**Access**: All restaurants, all features, platform-wide settings  
**Key Capabilities**:
- Create and manage restaurant accounts
- Access platform-wide analytics
- Manage billing and subscriptions
- Full user management across all restaurants

### 👑 Restaurant Owner
**Who**: Restaurant owners and business managers  
**Access**: Full control of their restaurant(s)  
**Key Capabilities**:
- Complete restaurant management
- Staff hiring, editing, and role management
- Full access to orders, tables, and menu
- Restaurant settings and billing access
- Advanced analytics and reporting

### 📊 Manager
**Who**: Restaurant managers and supervisors  
**Access**: Day-to-day restaurant operations  
**Key Capabilities**:
- Manage orders and table assignments
- View staff information (cannot edit staff)
- Basic analytics and reporting
- Menu management
- Table and QR code management

### 👨‍🍳 Kitchen Staff
**Who**: Cooks, chefs, and kitchen team members  
**Access**: Kitchen-focused features only  
**Key Capabilities**:
- Kitchen display for incoming orders
- Update order preparation status
- View menu items for order details
- Mark orders as ready

### 🍽️ Server Staff
**Who**: Waiters, servers, and front-of-house staff  
**Access**: Customer service and order management  
**Key Capabilities**:
- Take and manage customer orders
- Table management and assignments
- Generate QR codes for tables
- Mark orders as served
- Basic menu viewing

---

## Role Switching

### When You Have Multiple Roles

If you work in multiple capacities (e.g., you're both an Owner and sometimes work as a Manager), you can easily switch between roles:

### How to Switch Roles

1. **Look for the Role Switcher** in the top navigation bar
2. **Click on your current role** (shows as a button with your role name)
3. **Select the new role** from the dropdown menu
4. **Confirm the switch** - the page will refresh with your new role's permissions

### What Happens When You Switch

- ✅ **Navigation updates** to show features for your new role
- ✅ **Permissions change** immediately
- ✅ **UI adapts** to show relevant tools and options
- ✅ **Context preserved** - you stay in the same restaurant
- ✅ **Activity logged** for security and audit purposes

### Role Switching Tips

- **Switch roles** when you need different capabilities
- **Remember** each role sees different features
- **Use Owner role** for staff management and settings
- **Use Manager role** for daily operations
- **Use Staff roles** for specific tasks

---

## Dashboard Overview

### Navigation Structure

The dashboard navigation adapts based on your current role:

#### Common Sections (All Roles)
- **🏠 Dashboard**: Overview and quick stats
- **📋 Orders**: Order management (permissions vary)

#### Owner & Manager Only
- **🔧 Tables**: Table and QR code management
- **👥 Staff**: Team management (Owner can edit, Manager can only view)
- **📊 Reports**: Analytics and reporting
- **🍽️ Menu**: Menu item management
- **⚙️ Settings**: Restaurant configuration

#### Kitchen Staff Only
- **👨‍🍳 Kitchen**: Kitchen display system
- **🍽️ Menu**: View menu items (read-only)

#### Server Staff
- **📋 Orders**: Take and manage orders
- **🔧 Tables**: Table assignments and QR codes
- **🍽️ Menu**: View menu items

### Top Navigation Bar

- **🏪 Restaurant Name**: Shows current restaurant context
- **🎭 Role Switcher**: Switch between your available roles
- **🔔 Notifications**: Important alerts and updates
- **🕒 Local Time**: Current time in restaurant's timezone
- **👤 User Menu**: Account settings and logout

---

## Core Features by Role

### 👑 Restaurant Owner Features

#### Staff Management
- **Invite New Staff**: Add team members and assign roles
- **Edit Staff Information**: Update contact details and roles
- **Manage Permissions**: Assign custom permissions to staff
- **View Staff Activity**: See login history and role changes

#### Restaurant Settings
- **Business Information**: Update restaurant details
- **Operating Hours**: Set daily schedules
- **Order Settings**: Configure ordering preferences
- **Payment Integration**: Manage payment processing

#### Advanced Analytics
- **Revenue Reports**: Daily, weekly, monthly breakdowns
- **Popular Items**: Best-selling menu items
- **Staff Performance**: Service metrics and efficiency
- **Customer Insights**: Ordering patterns and preferences

### 📊 Manager Features

#### Daily Operations
- **Order Overview**: Monitor all incoming orders
- **Table Management**: Assign and manage table status
- **Staff Coordination**: View staff schedules and assignments
- **Inventory Tracking**: Monitor popular items

#### Basic Reporting
- **Daily Sales**: Today's revenue and order count
- **Order Status**: Track preparation and fulfillment
- **Table Turnover**: Monitor table usage efficiency

### 👨‍🍳 Kitchen Staff Features

#### Kitchen Display System
- **Live Order Feed**: Real-time incoming orders
- **Preparation Tracking**: Update order status as you cook
- **Timer Integration**: Track cooking times
- **Special Instructions**: View customer notes and modifications

#### Order Management
- **Mark Orders Ready**: Signal when orders are complete
- **Update Status**: "Preparing", "Ready", "Delivered"
- **View Modifications**: See special requests and allergies

### 🍽️ Server Staff Features

#### Order Taking
- **Customer Orders**: Input orders directly into the system
- **Table Assignment**: Link orders to specific tables
- **Modification Handling**: Add special requests and notes
- **Payment Processing**: Mark orders as paid

#### Table Service
- **QR Code Generation**: Create new QR codes for tables
- **Table Status**: Update availability and cleanliness
- **Customer Communication**: Send order updates

---

## Common Tasks

### Taking an Order (Server Staff)

1. **Navigate** to Orders → New Order
2. **Select** the customer's table
3. **Add items** from the menu
4. **Include modifications** if requested
5. **Add customer information** (name, phone)
6. **Review** order details
7. **Submit** the order
8. **Confirm** order appears in kitchen display

### Processing Orders (Kitchen Staff)

1. **View** incoming orders on Kitchen Display
2. **Start preparation** by clicking "Start Cooking"
3. **Update status** as you progress ("Preparing")
4. **Mark ready** when order is complete
5. **Notify** front-of-house staff

### Managing Tables (Owner/Manager)

1. **Go to** Tables section
2. **Add new tables** with capacity information
3. **Generate QR codes** for each table
4. **Print QR codes** and place on tables
5. **Monitor** table status and occupancy

### Adding Staff (Owner Only)

1. **Navigate** to Staff → Add Staff
2. **Enter** staff member's information
3. **Select** appropriate role template
4. **Choose** to send invitation email
5. **Staff receives** email with setup instructions
6. **Monitor** invitation status

### Viewing Reports (Owner/Manager)

1. **Go to** Reports section
2. **Select** time period (today, week, month)
3. **Choose** report type (sales, items, staff)
4. **Export** data if needed
5. **Share** insights with team

---

## Troubleshooting

### Common Issues and Solutions

#### "Access Denied" or "Insufficient Permissions"

**Problem**: You're trying to access a feature you don't have permission for  
**Solution**:
1. Check your current role in the top navigation
2. Switch to a role with appropriate permissions
3. Contact your restaurant owner if you need additional access

#### Can't See Expected Menu Items

**Problem**: Navigation menu looks different than expected  
**Solution**:
1. Verify your current role - each role sees different options
2. Try switching to a different role if you have multiple
3. Contact support if features are missing

#### Role Switching Not Working

**Problem**: Role switcher doesn't appear or fails  
**Solution**:
1. Refresh the page and try again
2. Check that you have multiple active roles
3. Clear browser cache and cookies
4. Contact support if issue persists

#### Orders Not Appearing

**Problem**: Expected orders not showing in your view  
**Solution**:
1. Check date/time filters
2. Verify restaurant context (if you work at multiple locations)
3. Confirm order status filters
4. Refresh the page

#### Login Problems

**Problem**: Can't log in or session expires quickly  
**Solution**:
1. Verify email and password are correct
2. Check that your account is still active
3. Clear browser cookies and try again
4. Contact your restaurant owner or support

### Getting Help

#### Self-Help Resources
1. **Check your role** - ensure you have permission for the action
2. **Try refreshing** the page
3. **Switch roles** if you have multiple
4. **Check filters** and date ranges

#### When to Contact Support
- Features that should be available aren't showing
- Error messages that don't make sense
- Technical issues with the interface
- Questions about your role permissions

---

## Tips & Best Practices

### Security Best Practices

🔐 **Use Strong Passwords**: Create complex passwords with letters, numbers, and symbols  
🔐 **Log Out Properly**: Always use the logout button when finished  
🔐 **Don't Share Accounts**: Each team member should have their own login  
🔐 **Report Suspicious Activity**: Contact support if you notice unusual behavior  

### Efficiency Tips

⚡ **Use Role Switching**: Switch roles instead of logging out/in  
⚡ **Learn Keyboard Shortcuts**: Speed up common tasks  
⚡ **Set Up Bookmarks**: Bookmark frequently used pages  
⚡ **Customize Filters**: Save time by setting default filters  

### Team Collaboration

👥 **Communicate Role Changes**: Let team know when you switch roles  
👥 **Update Information Promptly**: Keep staff details current  
👥 **Use Notes Features**: Add context to orders and customer requests  
👥 **Share Best Practices**: Help teammates learn efficient workflows  

### Data Management

📊 **Regular Backups**: Owners should ensure data is backed up  
📊 **Clean Up Old Data**: Archive old orders and reports periodically  
📊 **Monitor Analytics**: Use reports to improve operations  
📊 **Audit Permissions**: Regularly review who has access to what  

---

## Support

### Getting Help

#### For Technical Issues
- **Email**: support@qrrestaurant.com
- **Phone**: 1-800-QR-HELP (1-800-474-357)
- **Live Chat**: Available in the dashboard (look for chat icon)

#### For Account Issues
- **Contact your Restaurant Owner** first for permission changes
- **Email**: accounts@qrrestaurant.com for account-related problems

#### For Training and Best Practices
- **Video Tutorials**: Available at help.qrrestaurant.com
- **Training Sessions**: Schedule team training sessions
- **Documentation**: Comprehensive guides and FAQs

### Response Times
- **Critical Issues** (system down, data loss): 2 hours
- **High Priority** (feature not working): 4 hours
- **Standard Issues** (questions, minor problems): 24 hours
- **Feature Requests**: 48 hours for initial response

### What to Include When Contacting Support

1. **Your Role**: What role you were using when the issue occurred
2. **Restaurant**: Which restaurant location
3. **Time**: When the issue happened
4. **Steps**: What you were trying to do
5. **Error Messages**: Any error text or codes
6. **Screenshots**: Visual evidence of the problem

---

## Appendix

### Glossary

- **RBAC**: Role-Based Access Control - the security system that manages permissions
- **Role Template**: Pre-defined sets of permissions (Owner, Manager, Kitchen Staff, etc.)
- **Permission**: Specific capability to perform an action (like "orders:write")
- **Restaurant Context**: Which restaurant you're currently working with
- **Session**: Your current login period
- **Audit Log**: Record of all actions performed in the system

### Keyboard Shortcuts

- **Ctrl/Cmd + /**: Open help
- **Ctrl/Cmd + K**: Quick search
- **Ctrl/Cmd + Shift + R**: Switch role (if multiple available)
- **Escape**: Close modals and menus

### Contact Information

**QR Restaurant System Support**  
Email: support@qrrestaurant.com  
Phone: 1-800-QR-HELP  
Website: help.qrrestaurant.com  

**Business Hours**: Monday-Friday, 8 AM - 8 PM EST  
**Emergency Support**: 24/7 for critical system issues  

---

**Document Information**
- **Created**: 2025-01-17
- **Last Updated**: 2025-01-17
- **Version**: 2.0
- **Next Review**: 2025-02-17
- **Audience**: End Users

*This user guide is updated regularly. Please check for the latest version to ensure you have current information about system features and procedures.*