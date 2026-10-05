{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm exec turbo run build --filter=@atrium/admin",
  "outputDirectory": ".next",
  "regions": ["iad1"],
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Frame-Options", "value": "DENY" }, { "key": "X-Content-Type-Options", "value": "nosniff" }] }
  ]
}
