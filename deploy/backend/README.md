# Deploying the Java backend

This runs the Java tracer at `https://api.codeengine.co.in` on an Oracle Cloud Always Free VM, behind Cloudflare.
The frontend is deployed separately on Cloudflare Pages (see the main README).

```
browser ─► Cloudflare (TLS, DDoS, rate limit) ─► VM :443 ─► proxy (Caddy) ─► Unix socket ─► api (Spring Boot)
                                                                                            └─► child JVMs
```

## What the containers enforce

User code is vetted at the bytecode level before it runs (see "Security model" in the main README). The
containers add the OS-level isolation that check can't give:

| | `api` (server + child JVMs) | `proxy` (Caddy) |
|---|---|---|
| Network | **none**: only loopback, which the debugger link to the child JVMs needs. HTTP goes through a Unix socket. | Port 443 only |
| Filesystem | Read-only; `/tmp` is a 1 GB in-memory `noexec` tmpfs, wiped on restart | Read-only |
| Privileges | Non-root user, all Linux capabilities dropped, `no-new-privileges` | Only the capability to bind 443 |
| Limits | 3 CPUs, 3 GB RAM, 512 processes/threads (`.env`) | 256 MB, 128 processes/threads |

Only `/api/*` is proxied; anything else gets a 404.

## One-time setup

### 1. Oracle Cloud VM

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Oracle asks for a card to verify you;
   Always Free resources are not charged.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 24.04**.
   - Shape: **Ampere → VM.Standard.A1.Flex**, 4 OCPUs and 24 GB (the free allowance). If you get "Out of
     capacity", try another availability domain or try again later.
   - Add your SSH public key, and note the instance's **public IP**.
3. Open port 443: **Networking → Virtual cloud networks → (your VCN) → Security Lists → Default → Add Ingress
   Rule**: source `0.0.0.0/0`, TCP, destination port `443`. (Optional, stricter: one rule per
   [Cloudflare IP range](https://www.cloudflare.com/ips/) instead of `0.0.0.0/0`, so only Cloudflare can reach
   the VM.)

### 2. Docker and the code (on the VM)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER    # then log out and back in
git clone https://github.com/SanjayMgtech/Code_Engine.git
cd Code_Engine/deploy/backend
cp .env.example .env             # edit if your domain differs
```

### 3. Cloudflare

Your domain must already be on Cloudflare (nameservers changed at the registrar).

1. **SSL/TLS → Overview**: set the mode to **Full (strict)**.
2. **SSL/TLS → Origin Server → Create Certificate**: keep the defaults, hostnames `api.codeengine.co.in`,
   validity 15 years. On the VM, save the two blocks Cloudflare shows (the private key is shown only once):
   ```bash
   mkdir -p certs
   nano certs/origin.pem    # paste "Origin Certificate"
   nano certs/origin.key    # paste "Private Key"
   sudo chown root:root certs/* && sudo chmod 600 certs/origin.key
   ```
3. **DNS → Records → Add record**: type `A`, name `api`, IPv4 = the VM's public IP, **Proxied** (orange cloud).
4. Recommended, **Security → WAF → Rate limiting rules** (the free plan includes one): URI path equals
   `/api/v1/execution/run`, about 10 requests per 10 seconds per IP, action Block.

### 4. Start it

```bash
docker compose up -d --build     # first build takes a few minutes
docker compose ps
curl https://api.codeengine.co.in/api/v1/health
```

The health check should return `{"status":"UP",...}`. Then in Cloudflare Pages set
`CODE_ENGINE_BACKEND=https://api.codeengine.co.in` and redeploy the site.

## Day to day

```bash
git pull && docker compose up -d --build    # deploy a new version
docker compose logs -f api                  # server logs
docker compose restart api                  # restart (also clears /tmp)
```

Capacity: each concurrent Java run takes roughly one CPU and 300 MB. `MAX_CONCURRENT` runs execute at once, up
to 16 more wait in a queue, and beyond that the API answers HTTP 429. Raise `MAX_CONCURRENT`, `API_CPUS` and
`API_MEMORY` together.

## Troubleshooting

- **Cloudflare error 521/522**: the VM isn't reachable on 443. Check the security list rule and
  `docker compose ps`.
- **Cloudflare error 526**: the certificate in `certs/` doesn't match `API_DOMAIN`, or the SSL mode isn't
  Full (strict).
- **Browser shows a CORS error**: the site's exact origin (scheme + host) must be in `CORS_ALLOWED_ORIGINS`.
  Edit `.env`, then `docker compose up -d`.
