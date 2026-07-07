# Deployment Guide for Site Vitals

This guide provides detailed instructions for deploying Site Vitals in various environments.

## Current Production Deployment

The live application is available at https://optiqra.vercel.app/.

## Table of Contents

1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Cloud Platforms](#cloud-platforms)
4. [Production Checklist](#production-checklist)

---

## Local Development

### Prerequisites

- Node.js 18 or higher
- npm, yarn, or pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/site-vitals-next.git
cd site-vitals-next

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Development with Docker Compose

```bash
docker-compose -f docker-compose.dev.yml up --build
```

This provides hot-reload and debugging capabilities.

---

## Docker Deployment

### Build the Docker Image

```bash
docker build -t site-vitals:latest .
```

### Run with Docker

```bash
docker run \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_TELEMETRY_DISABLED=1 \
  site-vitals:latest
```

### Docker Compose Production

```bash
docker-compose up -d
```

### With Custom Environment Variables

```bash
docker run \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PSI_API_KEY=your_api_key_here \
  site-vitals:latest
```

### Using Environment File

```bash
# Create .env file
echo "PSI_API_KEY=your_api_key_here" > .env

# Run with env file
docker run \
  -p 3000:3000 \
  --env-file .env \
  site-vitals:latest
```

### Docker Compose with Environment File

```bash
# Update docker-compose.yml to use env_file
# Add: env_file: .env
docker-compose up -d
```

---

## Cloud Platforms

### Vercel (Recommended for Next.js)

The project is configured for deployment to Vercel, and the current production URL is https://optiqra.vercel.app/.

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

**Set Environment Variables:**

1. Go to Vercel dashboard
2. Select your project
3. Settings → Environment Variables
4. Add `PSI_API_KEY`

### AWS ECS with Fargate

1. Push image to ECR:

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

docker tag site-vitals:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/site-vitals:latest

docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/site-vitals:latest
```

2. Create ECS task definition with:
   - Memory: 512 MB
   - CPU: 256 units
   - Port mapping: 3000:3000

3. Create Fargate service

### AWS Lambda (with custom runtime or API Gateway)

For serverless deployment, use the Next.js Lambda wrapper or serverless framework.

### Google Cloud Run

```bash
# Build and deploy
gcloud run deploy site-vitals \
  --source . \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated
```

Set environment variables:

```bash
gcloud run services update site-vitals \
  --set-env-vars PSI_API_KEY=your_api_key_here
```

### Azure Container Instances

```bash
az container create \
  --resource-group myResourceGroup \
  --name site-vitals \
  --image site-vitals:latest \
  --ports 3000 \
  --environment-variables \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
```

### DigitalOcean App Platform

1. Push to GitHub
2. Connect DigitalOcean App Platform
3. Set container image to `Dockerfile`
4. Configure port: 3000
5. Add environment variables
6. Deploy

---

## Production Checklist

- [ ] **Environment Variables**
  - [ ] Set `NODE_ENV=production`
  - [ ] Set `NEXT_TELEMETRY_DISABLED=1`
  - [ ] Add `PSI_API_KEY` if using Lighthouse (optional)

- [ ] **Security Headers** (auto-configured in next.config.ts)
  - [ ] X-Content-Type-Options: nosniff
  - [ ] X-Frame-Options: DENY
  - [ ] Referrer-Policy: strict-origin-when-cross-origin

- [ ] **Performance**
  - [ ] Enable gzip compression on CDN/reverse proxy
  - [ ] Set appropriate cache headers
  - [ ] Use CDN for static assets

- [ ] **Monitoring**
  - [ ] Set up error tracking (Sentry, etc.)
  - [ ] Configure health checks
  - [ ] Monitor memory and CPU usage

- [ ] **Scaling**
  - [ ] Configure load balancer
  - [ ] Set auto-scaling policies
  - [ ] Use managed databases if needed (future)

- [ ] **HTTPS**
  - [ ] Install SSL certificate
  - [ ] Redirect HTTP to HTTPS
  - [ ] Set HSTS header

- [ ] **Backups**
  - [ ] Regular backups of configuration
  - [ ] Document deployment steps

---

## Monitoring & Logging

### Health Check Endpoint

The Docker image includes a health check at `http://localhost:3000/`

### Docker Logs

```bash
# View logs
docker logs site-vitals

# Follow logs
docker logs -f site-vitals
```

### Docker Compose Logs

```bash
docker-compose logs -f site-vitals
```

---

## Troubleshooting

### Container crashes on startup

```bash
# Check logs
docker logs site-vitals

# Ensure proper memory allocation
# Minimum: 512 MB
```

### Port 3000 already in use

```bash
# Use different port
docker run -p 3001:3000 site-vitals:latest
```

### API requests fail

- Check network connectivity
- Verify firewall rules
- Ensure DNS resolution works

### Out of memory

```bash
# Increase memory limit
docker run -m 1g site-vitals:latest
```

---

## Performance Tuning

### Production Tips

1. **Use a CDN** - Serve static files from CDN
2. **Enable compression** - Configure gzip/Brotli on proxy
3. **Optimize caching** - Set proper Cache-Control headers
4. **Monitor metrics** - Track response times and errors

### Resource Allocation

- **Minimum:** 512 MB RAM, 0.5 CPU cores
- **Recommended:** 1 GB RAM, 1 CPU core
- **High-traffic:** 2+ GB RAM, 2+ CPU cores

---

## Rollback Procedures

### Docker

```bash
# Tag previous version
docker tag site-vitals:previous site-vitals:latest

# Run previous version
docker run -p 3000:3000 site-vitals:latest
```

### Docker Compose

```bash
# Revert image in docker-compose.yml
# Then restart
docker-compose up -d
```

---

For additional help, see the main [README.md](README.md)
