# Deployment Guide - Healthcare Monitoring Platform

## Architecture Overview

This application requires **three separate services** because they serve fundamentally different purposes:

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR INFRASTRUCTURE                       │
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐│
│  │   Vercel     │────▶│   Render     │────▶│    Neon     ││
│  │  (Frontend)  │     │   (API)      │     │ (Database)  ││
│  │              │     │              │     │             ││
│  │ Static pages │     │ Persistent   │     │ PostgreSQL  ││
│  │ + CDN        │     │ Node process │     │ Remote DB   ││
│  └──────────────┘     └──────────────┘     └─────────────┘│
│         │                     ▲                             │
│         │                     │                             │
│         └─── HTTPS API ───────┘                             │
│           Calls                                             │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │   MQTT Broker        │
                    │  (Your ESP32s)       │
                    │  mqtt://broker:1883  │
                    └──────────────────────┘
```

### Why This Split?

1. **Frontend (Next.js) → Vercel**
   - Mostly static pages + client-side React
   - No long-running processes needed
   - Built once, served from global CDN
   - Fast page loads worldwide
   - Excellent for the user-facing web app

2. **Backend (NestJS) → Render**
   - **MUST** be a persistent process because:
     - Holds open MQTT connection to device broker
     - Maintains WebSocket (Socket.IO) connections to all browsers
     - Real-time vitals streaming requires the process to stay alive
   - Cannot use Vercel serverless (functions spin up per request and die)
   - Needs traditional hosting with always-on server

3. **Database (PostgreSQL) → Neon**
   - Already remote/hosted
   - Accessible from both frontend and backend
   - Automatic backups and scaling

---

## Deployment Strategy

### Option 1: Vercel + Render + Neon (Recommended)
**Best for**: Production apps, global users, separate concerns

- ✅ Frontend served from CDN (fast worldwide)
- ✅ Vercel preview deployments for branches
- ✅ Backend stays alive for MQTT/WebSocket
- ❌ Two platforms to manage
- ❌ Two sets of environment variables

### Option 2: All on Render + Neon
**Best for**: Simpler management, single dashboard

- ✅ Everything in one place
- ✅ Unified logging and monitoring
- ✅ Single platform to learn
- ❌ No CDN for frontend (slower for distant users)
- ❌ No automatic preview deployments

---

## Option 1: Vercel + Render + Neon

### Step 1: Deploy Database (Neon)

**Already done** if you have a Neon database running locally.

1. Go to https://neon.tech
2. Create project: `health-platform-prod`
3. Copy connection string
4. Save as: `DATABASE_URL`

Example:
```
postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/health_platform?sslmode=require
```

---

### Step 2: Deploy Backend API (Render)

#### 2.1 Prepare Repository

Make sure your code is in GitHub/GitLab:
```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

#### 2.2 Create Web Service on Render

1. Go to https://render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:

**Settings**:
```
Name: health-platform-api
Environment: Node
Region: Oregon (US West) or closest to your users
Branch: main
Root Directory: apps/api
Build Command: npm install && npm run build
Start Command: npm run start:prod
```

**Environment Variables**:
```bash
NODE_ENV=production
DATABASE_URL=<your-neon-connection-string>
JWT_SECRET=<generate-random-secret-min-32-chars>
FRONTEND_URL=https://your-app.vercel.app  # Fill in after Vercel deploy
MQTT_URL=mqtt://your-mqtt-broker:1883     # Your MQTT broker URL
PORT=3001
```

**Advanced Settings**:
- Instance Type: `Starter` ($7/month) or `Free` (with limitations)
- Health Check Path: `/api/health`
- Auto-Deploy: Yes

#### 2.3 Add Start Script

In `apps/api/package.json`, add:
```json
{
  "scripts": {
    "start:prod": "node dist/main.js",
    "build": "nest build",
    "start:dev": "nest start --watch"
  }
}
```

#### 2.4 Deploy

1. Click **"Create Web Service"**
2. Wait for build (~3-5 minutes)
3. Note the URL: `https://health-platform-api.onrender.com`

#### 2.5 Run Migration

Once deployed, open Render Shell and run:
```bash
npm run prisma:migrate deploy
```

Or set up an automatic migration in `package.json`:
```json
{
  "scripts": {
    "build": "npm run prisma:migrate deploy && nest build"
  }
}
```

---

### Step 3: Deploy Frontend (Vercel)

#### 3.1 Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

#### 3.2 Configure for Deployment

Create `vercel.json` in workspace root:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "apps/web/$1"
    }
  ]
}
```

#### 3.3 Deploy via Vercel Dashboard

1. Go to https://vercel.com
2. Click **"Add New Project"**
3. Import your Git repository
4. Configure:

**Settings**:
```
Framework Preset: Next.js
Root Directory: apps/web
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

**Environment Variables**:
```bash
NEXT_PUBLIC_API_URL=https://health-platform-api.onrender.com
NODE_ENV=production
```

#### 3.4 Deploy

1. Click **"Deploy"**
2. Wait for build (~2-3 minutes)
3. Note the URL: `https://your-app.vercel.app`

#### 3.5 Update Backend FRONTEND_URL

Go back to Render and update the `FRONTEND_URL` environment variable:
```bash
FRONTEND_URL=https://your-app.vercel.app
```

This completes the circular dependency between frontend and backend.

---

### Step 4: Configure MQTT Broker

Your API needs to connect to an MQTT broker where ESP32 devices publish.

#### Option A: Host MQTT on Render

Create a second Render service for Mosquitto:

1. Create `Dockerfile` for MQTT:
```dockerfile
FROM eclipse-mosquitto:latest
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
EXPOSE 1883
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
```

2. Create `mosquitto.conf`:
```
listener 1883
allow_anonymous true
```

3. Deploy as **Private Service** on Render
4. Update API's `MQTT_URL` to internal Render URL

#### Option B: Use CloudMQTT or HiveMQ Cloud

1. Sign up for https://www.cloudmqtt.com or https://www.hivemq.com/cloud
2. Get connection URL: `mqtt://user:pass@broker.hivemq.cloud:1883`
3. Update API's `MQTT_URL`

---

### Step 5: Test End-to-End

1. **Open frontend**: https://your-app.vercel.app
2. **Register** as Individual User
3. **Check API logs** on Render dashboard
4. **Pair a device** and verify MQTT connection
5. **Test real-time updates** with WebSocket

---

## Option 2: All on Render

If you prefer one platform:

### Step 1: Deploy API (Same as Above)

Follow "Step 2" from Option 1.

### Step 2: Deploy Frontend on Render

1. Create **Static Site** on Render
2. Configure:

```
Name: health-platform-web
Environment: Static Site
Branch: main
Root Directory: apps/web
Build Command: npm run build
Publish Directory: apps/web/.next
```

**Environment Variables**:
```bash
NEXT_PUBLIC_API_URL=https://health-platform-api.onrender.com
```

3. Note URL: `https://health-platform-web.onrender.com`
4. Update API's `FRONTEND_URL`

### Pros/Cons

✅ Single dashboard  
✅ Unified billing  
✅ Easier to manage  
❌ No global CDN  
❌ Slower for distant users  
❌ No branch preview deployments  

---

## Environment Variables Reference

### Backend (API)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `DATABASE_URL` | Neon connection string | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Random string |
| `FRONTEND_URL` | Frontend origin for CORS | `https://your-app.vercel.app` |
| `MQTT_URL` | MQTT broker URL | `mqtt://broker:1883` |
| `PORT` | API port | `3001` |

### Frontend (Web)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `https://api.onrender.com` |
| `NODE_ENV` | Environment | `production` |

---

## Deployment Checklist

### Pre-Deployment
- [ ] All code committed and pushed to Git
- [ ] Database migrations tested locally
- [ ] Environment variables documented
- [ ] Build scripts tested (`npm run build`)
- [ ] CORS configured correctly

### Database
- [ ] Neon project created
- [ ] Connection string saved
- [ ] Migrations applied

### Backend API
- [ ] Render web service created
- [ ] Environment variables set
- [ ] Build successful
- [ ] Health check passing (`/api/health`)
- [ ] MQTT broker accessible
- [ ] Database connection working

### Frontend
- [ ] Vercel/Render project created
- [ ] API URL environment variable set
- [ ] Build successful
- [ ] Can reach API endpoints
- [ ] Auth flow works
- [ ] WebSocket connects

### Post-Deployment
- [ ] Backend `FRONTEND_URL` updated
- [ ] Test registration/login
- [ ] Test device pairing
- [ ] Test real-time updates
- [ ] Check logs for errors
- [ ] Test on mobile devices

---

## Monitoring & Logs

### Render

View logs:
1. Go to Render dashboard
2. Select your service
3. Click "Logs" tab
4. See real-time output

Set up alerts:
- Render → Settings → Notifications
- Configure Slack/Email alerts for crashes

### Vercel

View logs:
1. Vercel dashboard
2. Select deployment
3. Click "Functions" → "Logs"

### Database (Neon)

Monitor queries:
1. Neon dashboard
2. Click "Queries" tab
3. See slow queries and usage

---

## Scaling Considerations

### When You Need to Scale

**Signs**:
- API response times > 500ms
- WebSocket disconnections
- Database connection pool exhausted
- High memory usage on Render

**Solutions**:

1. **Upgrade Render Instance**
   - Starter → Standard ($15/mo)
   - Get more CPU/RAM

2. **Add Redis for WebSocket Sessions**
   - Use Upstash Redis (free tier)
   - Store session state externally
   - Enables horizontal scaling

3. **Optimize Database Queries**
   - Add indexes on frequently queried fields
   - Use Prisma query optimization
   - Enable connection pooling

4. **Add CDN for API**
   - Cloudflare in front of Render
   - Cache static responses
   - DDoS protection

---

## CI/CD Pipeline

### Automatic Deployments

Both Vercel and Render support auto-deploy on push:

**Vercel**:
- Every push to `main` → production
- Every PR → preview deployment

**Render**:
- Every push to `main` → auto-deploy
- Configure in Settings → Auto-Deploy

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:api
      - run: npm run test:web

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render Deploy
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
      
      - name: Deploy to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

---

## Troubleshooting

### "Cannot connect to database"

1. Check `DATABASE_URL` is correct
2. Verify Neon IP allowlist (should allow all IPs)
3. Check Render region matches Neon region

### "MQTT broker unavailable"

1. Verify `MQTT_URL` is accessible from Render
2. Check broker is running
3. Test with MQTT client locally
4. Ensure port 1883 is open

### "WebSocket connection failed"

1. Check backend logs for errors
2. Verify CORS `FRONTEND_URL` matches Vercel URL exactly
3. Ensure Socket.IO is using correct transport
4. Check browser console for errors

### "API returns 502 Bad Gateway"

1. Check Render service is running (not sleeping)
2. Upgrade from free tier (free tier sleeps after 15 mins)
3. Check health check endpoint
4. View Render logs for crashes

---

## Cost Estimate

### Minimal Setup (Free Tier)

- **Neon**: Free (512MB storage)
- **Render**: Free (service sleeps after 15 mins)
- **Vercel**: Free (100GB bandwidth)

**Total**: $0/month (good for testing)

### Production Setup

- **Neon**: Free or $19/month (Pro)
- **Render**: $7/month (Starter instance)
- **Vercel**: Free or $20/month (Pro team)

**Total**: $7-46/month depending on features needed

---

## Security Checklist

- [ ] Use HTTPS only (automatic on Vercel/Render)
- [ ] JWT_SECRET is random and > 32 characters
- [ ] Database connection uses SSL (`?sslmode=require`)
- [ ] CORS configured to specific origins (not `*`)
- [ ] Environment variables not committed to Git
- [ ] API rate limiting enabled (add middleware)
- [ ] Input validation on all endpoints (already done with class-validator)
- [ ] SQL injection protection (Prisma handles this)

---

## Next Steps After Deployment

1. **Set up monitoring**: Add Sentry or LogRocket
2. **Configure alerts**: Slack/Email for crashes
3. **Add analytics**: Google Analytics or Plausible
4. **Set up backups**: Neon auto-backups enabled
5. **Document APIs**: Add Swagger/OpenAPI docs
6. **Load testing**: Use k6 or Artillery
7. **Security scan**: Run `npm audit` regularly

---

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Render Docs**: https://render.com/docs
- **Neon Docs**: https://neon.tech/docs
- **NestJS Deployment**: https://docs.nestjs.com/deployment
- **Next.js Deployment**: https://nextjs.org/docs/deployment

---

**Your healthcare platform is ready to go live!** 🚀

Start with Option 1 (Vercel + Render) for the best production experience.
