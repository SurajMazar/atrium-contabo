{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm exec turbo run build --filter=@atrium/renderer",
  "outputDirectory": ".next",
  "regions": ["iad1"]
}
