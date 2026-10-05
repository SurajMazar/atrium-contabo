# Environment for the cPanel Node.js App (renderer). Enter these in cPanel → Setup Node.js App.
NODE_ENV=production
# Platform mode: render every site from the Atrium API (API/worker run elsewhere — VPS/container platform)
API_URL=https://{{apiHost}}
ATRIUM_API_INTERNAL_URL=https://{{apiHost}}
RENDERER_URL=https://{{sitesDomain}}
PLATFORM_SITES_DOMAIN={{sitesDomain}}
RENDERER_SECRET=<same value as the API's RENDERER_SECRET>
# Single-site mode instead (no API needed at runtime):
# ATRIUM_SNAPSHOT_SOURCE=file
# ATRIUM_SNAPSHOT_FILE=./site-snapshot.json
