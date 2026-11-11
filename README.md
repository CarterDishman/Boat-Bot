# Boat Bot

Personal cruising weather dashboard for a Morgan 454, usable worldwide wherever the underlying forecasts have coverage. Responsive browser UI + a dependency-free Node server.

## Run

Requires Node 22 or newer (Docker uses Node 24).

```sh
npm start
```

Open http://localhost:3000. No API keys or database required for this first version.

```sh
npm test
npm run check
```

## Deploy on Railway

1. Push this repository to GitHub.
2. Railway → New Project → Deploy from GitHub repo → CarterDishman/Boat-Bot.
3. Railway can use the included Dockerfile. The start command is `npm start` and health check is `/health`, also declared in `railway.json`.
4. In the service's Networking settings, generate a public domain. Open it on your phone or computer. Railway provides `PORT`; the server binds to `0.0.0.0`.
5. No environment variables or PostgreSQL service are required yet. The default deployment has no authentication: anyone with its URL can view and use it. Routes and preferences are browser-local, not shared between users or devices.

## Implemented

- Location search (Open-Meteo geocoder), manual coordinates, browser geolocation (requires HTTPS).
- Live hourly atmospheric + marine forecasts; display in knots, feet, seconds, °F.
- NWS point-query alerts and nearby recent NDBC station observations.
- User-entered multi-waypoint great-circle route segments; hourly-or-finer spatial samples.
- 72 hourly departure candidates; all route points evaluated at expected passage times at planning speed ±0.5 knots.
- Worst surrounding forecast-hour gust/height and minimum mean period, avoiding interpolation through thresholds.
- Gust >20 kn excludes a departure. Waves >=4 ft or mean period <=6 s are marginal by default. Missing required values prevent a fitting assessment. Thunderstorm weather codes exclude a candidate.
- Groups consecutive hourly fitting candidates. Shows first passage details and reasons for each window rating.
- Server-side bounded in-memory caching and request coalescing. Local browser route/preferences storage.
- Explicit API errors and coverage notes; no invented forecast data.

## Sources and licensing

Open-Meteo weather, marine, and geocoding APIs: https://open-meteo.com/ . See the provider/model credits in its documentation, linked from the application. Data is attributed to Open-Meteo and its model providers. The free service is for noncommercial use and subject to its quotas/terms; requests with multiple locations/variables may count as multiple calls. No uptime guarantee. Review terms before commercial use or sharing at scale.

NWS: https://www.weather.gov/documentation/services-web-api . U.S. coverage only; queries at sample points do not prove complete route/polygon warning coverage, and an empty response does not establish coverage. Alerts are shown separately from numerical ratings, not incorporated into an automatic safety decision.

NDBC: https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt . Observations within 150 nm and six hours only; nearest stations may not represent your location. Sensor availability varies. Mean and dominant periods are labeled separately.

## Limits and next steps

- Weather planning support, not navigation or a declaration of safety. Enter chart-verified waypoints yourself: no land/reef avoidance, charting, or automatic safe routes. Example offshore coordinates are illustrative, not a harbor-to-harbor route.
- Significant wave height is not maximum wave height. The six-second rule currently uses **mean** wave period. Wind-wave and swell forecasts are requested separately and should be surfaced more fully in a later release.
- Best Match atmospheric and wave series; no independent-model comparison yet. Download times are not model run times. Upstream model attribution and provenance are linked; individual selected run IDs are not exposed by this implementation.
- Seven days requested; actual variable/model horizons may be shorter. The scan does not invent missing hours.
- Max 12 waypoints, 600 nm, 110 hourly samples. This is a weather sampling route, not a tidal/current-aware passage simulator. Speed checks are fixed through the route, without sailing polars or current-derived SOG.
- NWS warnings only. Outside coverage, check the relevant national marine service. No global warning aggregation, live lightning feed, tidal/inlet calculations, or Gulf Stream routing yet.
- No background refresh while closed, push notifications, cross-device database, login, offline forecast support, or automatic tracking. Reload/refetch to update forecasts. API caching is up to one hour for forecasts, five minutes for alerts, ten minutes for observations; actual provider issuance can be older.
- Public deployment is intended for personal low-volume use. Add authentication and shared-store rate limiting before wider distribution. Current rate limit is per socket IP, so proxies may share it; cache is per server process.

Recommended next work: verify live providers from Railway; add model comparison and forecast-run tracking; add PostgreSQL/login for saved passages; add explicit warning-zone coverage and regional tide adapters; then scheduled rechecks and opt-in notifications.
