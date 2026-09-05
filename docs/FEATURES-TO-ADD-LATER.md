# Features to Add Later

Deferred features that require additional schema changes or dedicated development time.

## Deferred Features

| Feature | Why Deferred | Prerequisites |
|---------|-------------|---------------|
| **Downtime Clock** | Tracks vehicle downtime between inspections. Needs new schema and real-time tracking logic. | New `vehicle_downtime` table, inspection-based state machine |
| **Haul Road Map** | GPS-based map showing haul road segments with tyre wear hotspots. Requires Maps SDK integration and spatial data. | Google Maps / Mapbox integration, spatial DB column |
| **Driver Ranking** | Ranks drivers by tyre care metrics (pressure adherence, defect reporting). Needs driver-vehicle assignment schema. | New `driver_profiles` table, driver-vehicle mapping, scoring algorithm |

## Implementation Notes

- These features are intentionally deferred to keep the current release focused on the core tyre data platform.
- Each feature is independently buildable — no cross-dependencies between them.
- When you're ready to build one, create a new workspace and reference this document for context.

## Suggested Order

1. **Driver Ranking** — lowest schema complexity, highest fleet value
2. **Downtime Clock** — moderate complexity, requires real-time state
3. **Haul Road Map** — highest complexity, requires third-party integration
