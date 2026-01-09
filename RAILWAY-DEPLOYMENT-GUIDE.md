# Railway Deployment Guide - Tabtep

Complete guide to deploy your QR Restaurant System to Railway with PostgreSQL database.

## Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- Git installed locally
- Your codebase ready (already completed ✅)

---

## Part 1: Push Code to GitHub

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository:
   - Name: `qr-restaurant-system` (or your preferred name)
   - Description: "Multi-tenant QR Restaurant Ordering System"
   - Visibility: **Private** (recommended for production code)
   - **DO NOT** initialize with README, .gitignore, or license
3. Click "Create repository"

### Step 2: Push Your Code

From your project directory (`/Users/atiffriduan/Desktop/QROrder/qr-restaurant-system`), run:

```bash
# Add GitHub as remote origin
git remote add origin https://github.com/YOUR_USERNAME/qr-restaurant-system.git

# Push your code
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

**Verify**: Visit your GitHub repository URL to confirm code is pushed.

---

## Part 2: Set Up Railway Project

### Step 1: Create New Project

1. Log in to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub account if prompted
5. Select your `qr-restaurant-system` repository
6. Click "Deploy Now"

### Step 2: Add PostgreSQL Database

1. In your Railway project dashboard, click "New"
2. Select "Database" → "Add PostgreSQL"
3. PostgreSQL service will be provisioned automatically
4. **Important**: Note the database service name (usually "Postgres")

### Step 3: Configure Environment Variables

1. Click on your **web service** (qr-restaurant-system)
2. Go to "Variables" tab
3. Click "Raw Editor" for easier bulk input
4. Add the following environment variables:

```bash
# Database - Railway auto-provides DATABASE_URL, reference it
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Application Settings
NODE_ENV=production
PORT=3000
APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}

# JWT Configuration
JWT_SECRET=<GENERATE_STRONG_SECRET_HERE>
JWT_EXPIRES_IN=24h

# NextAuth Configuration
NEXTAUTH_SECRET=<GENERATE_STRONG_SECRET_HERE>
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}

# Payment Configuration - ToyyibPay
TOYYIBPAY_PRODUCTION_URL=https://toyyibpay.com
TOYYIBPAY_TIMEOUT=30000

# Feature Flags for Production
ENABLE_DEBUG_LOGGING=false
ENABLE_PRISMA_STUDIO=false
MOCK_PAYMENTS=false
MOCK_NOTIFICATIONS=false

# URLs
WEBHOOK_BASE_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

**Generate Secrets**: Use this command locally to generate secure secrets:
```bash
openssl rand -base64 32
```

Run it twice to get two different secrets for `JWT_SECRET` and `NEXTAUTH_SECRET`.

### Step 4: Configure Build & Deploy Settings

1. Still in your web service, go to "Settings" tab
2. **Build Configuration**:
   - Build Command: `npm run db:generate && npm run build`
   - Install Command: `npm ci --legacy-peer-deps`
3. **Deploy Configuration**:
   - Start Command: `npm run start`
   - Root Directory: `/` (leave default)
   - Health Check Path: `/api/health`
4. **Service Settings**:
   - Region: Choose closest to your users
   - Watch Paths: Keep default

### Step 5: Generate Public Domain

1. Go to "Settings" tab → "Networking"
2. Click "Generate Domain"
3. Railway will assign a URL like `qr-restaurant-system-production.up.railway.app`
4. **Important**: Copy this domain, you'll need it for environment variables

---

## Part 3: Database Setup

### Step 1: Run Migrations

After first successful deployment:

1. In Railway dashboard, click on your **web service**
2. Click "Deployments" tab
3. Find your latest deployment, click the three dots (⋯)
4. Select "View Logs"
5. Click on the deployment
6. In the deployment view, go to "Settings" → "Deploy"
7. Under "Custom Start Command", temporarily change to:
   ```bash
   npx prisma migrate deploy && npm run start
   ```
8. Trigger a new deployment (Settings → "Restart")
9. **After migrations complete**, change start command back to:
   ```bash
   npm run start
   ```

**Alternative: Use Railway CLI**

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migration
railway run npx prisma migrate deploy
```

### Step 2: Seed Initial Data

To add initial admin user and test data:

```bash
# Using Railway CLI
railway run npm run db:seed

# Or via temporary start command (same process as migrations)
npx prisma db seed && npm run start
```

---

## Part 4: Verify Deployment

### Step 1: Check Application Health

1. Visit your Railway domain: `https://your-app.up.railway.app`
2. Check health endpoint: `https://your-app.up.railway.app/api/health`
3. Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2025-12-09T...",
     "services": {
       "database": "up",
       "api": "up"
     }
   }
   ```

### Step 2: Test Core Features

1. **Admin Login**:
   - Go to `/admin/login`
   - Use seeded credentials (check `prisma/seed.ts` for defaults)

2. **Create Restaurant**:
   - After admin login, create a test restaurant
   - Generate QR codes

3. **Test Order Flow**:
   - Scan QR code
   - Place test order
   - Verify kitchen display updates

### Step 3: Monitor Logs

1. Railway Dashboard → Your Service → "Deployments" → Latest Deployment
2. Click "View Logs"
3. Monitor for:
   - ✅ "Server running on port 3000"
   - ✅ Database connection success
   - ❌ Any error messages

---

## Part 5: Production Checklist

### Security

- [ ] Generated strong JWT_SECRET and NEXTAUTH_SECRET
- [ ] Set MOCK_PAYMENTS=false
- [ ] Set ENABLE_DEBUG_LOGGING=false
- [ ] Reviewed .railwayignore to exclude sensitive files
- [ ] Database connection uses SSL (Railway default)

### Performance

- [ ] Railway region selected close to users
- [ ] Health check endpoint responding
- [ ] Database queries optimized
- [ ] Consider upgrading Railway plan for production traffic

### Monitoring

- [ ] Set up Railway metrics monitoring
- [ ] Configure deployment notifications
- [ ] Add error tracking service (optional: Sentry, etc.)

### Domain (Optional)

- [ ] Purchase custom domain
- [ ] Add custom domain in Railway Settings → Networking
- [ ] Update environment variables with new domain
- [ ] Update NEXTAUTH_URL and APP_URL

---

## Part 6: Custom Domain Setup (Optional)

### Step 1: Add Custom Domain in Railway

1. Railway Dashboard → Your Service → "Settings" → "Networking"
2. Click "Custom Domain"
3. Enter your domain (e.g., `orders.yourdomain.com`)
4. Railway will show DNS records to configure

### Step 2: Configure DNS

At your domain registrar (Namecheap, GoDaddy, Cloudflare, etc.):

1. Add CNAME record:
   - Name: `orders` (or your subdomain)
   - Value: `your-app.up.railway.app`
   - TTL: 3600 (or Auto)

2. Wait for DNS propagation (can take 5-60 minutes)

### Step 3: Update Environment Variables

Update these in Railway:

```bash
APP_URL=https://orders.yourdomain.com
NEXTAUTH_URL=https://orders.yourdomain.com
WEBHOOK_BASE_URL=https://orders.yourdomain.com
```

Redeploy to apply changes.

---

## Troubleshooting

### Build Failures

**Error**: "Cannot find module 'prisma'"
- **Fix**: Ensure `prisma` is in dependencies (not devDependencies)

**Error**: "Build command failed"
- **Fix**: Check Railway logs for specific error
- **Verify**: `package.json` scripts are correct

### Runtime Errors

**Error**: "Database connection failed"
- **Check**: DATABASE_URL is correctly set to `${{Postgres.DATABASE_URL}}`
- **Verify**: PostgreSQL service is running

**Error**: "Port already in use"
- **Fix**: Remove hardcoded PORT in code, use `process.env.PORT || 3000`

### Migration Issues

**Error**: "Migration failed"
- **Check**: Database is empty (fresh deployment)
- **Try**: Run `npx prisma migrate deploy` via Railway CLI
- **Last Resort**: Reset database and re-run migrations

---

## Cost Optimization

### Railway Pricing (as of 2025)

- **Free Trial**: $5 credit
- **Hobby Plan**: $5/month starter credits
- **Usage-based**: ~$0.000231 per GB-hour

### Estimated Monthly Cost

For small-medium restaurant:
- **Web Service**: ~$5-15/month
- **PostgreSQL**: ~$5-10/month
- **Total**: ~$10-25/month

### Tips to Reduce Costs

1. Use Railway's usage-based pricing efficiently
2. Optimize database queries
3. Enable connection pooling
4. Monitor usage in Railway dashboard

---

## Next Steps After Deployment

1. **Set up payment gateway**: Configure ToyyibPay with real credentials
2. **Train staff**: Provide kitchen staff with access
3. **Print QR codes**: Generate and place on restaurant tables
4. **Monitor performance**: Watch Railway metrics
5. **Plan scaling**: Upgrade Railway plan as needed

---

## Support & Resources

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Prisma Docs**: https://www.prisma.io/docs
- **Next.js Docs**: https://nextjs.org/docs

---

**Deployment Checklist Summary**

- [x] Code prepared and committed to main
- [x] Railway configuration files created
- [ ] GitHub repository created and code pushed
- [ ] Railway project created and connected to GitHub
- [ ] PostgreSQL database provisioned
- [ ] Environment variables configured
- [ ] Database migrations deployed
- [ ] Initial data seeded
- [ ] Application verified and tested
- [ ] Custom domain configured (optional)

**Your codebase is ready for deployment! Follow the steps above to deploy to Railway.**
