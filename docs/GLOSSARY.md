# DynaHaul X — Glossary

*Domain terms used throughout the system and upgrade documentation.*

---

## A

**Achievement %** — Actual tyre life divided by target life, expressed as a percentage. Example: 45,000 km actual life with a 40,000 km target = 112.5% achievement.

**Alert Rule** — A database record defining WHEN an alert should fire (event type + threshold + site).

**Alert Type** — One of 5 event categories: `pressure_drop`, `fitment_overdue`, `inspection_due`, `tyre_removed`, `rtd_threshold`.

## C

**CPK (Cost Per Kilometer)** — A tyre efficiency metric: `CPK = (tyre_cost / target_life) × (average_brand_life / tyre_cost)`. Higher is better. The formula accounts for both the tyre achieving its target life and the brand's historical performance relative to cost.

## D

**Digest** — A daily summary SMS containing fleet health score, pressure alerts count, pending fitments, and savings.

**Domain Event** — An action in the physical world that generates data: a pressure reading, a tyre fitment, an inspection, a removal.

## F

**Fast2SMS** — The SMS gateway service used to deliver alert messages to Indian mobile numbers.

**Fitter** — Ground staff who perform tyre inspections, pressure checks, and tyre changes. They use the mobile Fitter App.

**Fleet Health Score** — A 0–100 composite metric calculated from pressure compliance (30 pts), life remaining (25 pts), inspection recency (20 pts), leakage severity (15 pts), and defect rate (10 pts).

**Fleet Site** — A physical location (mine, construction site, depot) where tyres are managed. Each site has its own fleet of tyres, staff, and configuration.

## I

**Informed Buyer (Segment 1)** — A customer type that values data analysis, dashboards, and reporting tools. Already served by the existing DynaHaul X manager dashboard.

## L

**License** — A database record controlling access to the DynaHaul X system. Currently checked via `is_active` boolean flag.

## M

**Manager** — The administrative user who views the dashboard, configures alerts, manages sites, and generates reports.

## O

**OTD (Original Tyre cost / Outlay per Tyre in Dollars)** — The purchase price of a tyre. Used in rubber utilization calculations to determine value lost when a tyre is removed prematurely.

**OTP (One-Time Password)** — Used for email-based login authentication. Sent via Resend.

## P

**Pressure Compliance** — The percentage of tyres in a fleet that are at their correct PSI target. A key component of the fleet health score.

## R

**RLS (Row-Level Security)** — Supabase's database-level access control. Ensures users can only access data for their site(s).

**RTD (Rubber Tread Depth)** — The remaining tread depth of a tyre, measured in millimeters. New tyres typically have 16mm+ of tread. Tyres are considered for removal when RTD reaches 3mm or below.

**Rubber Utilization** — A metric showing how much of a tyre's available tread was actually used: `(original_rtd - removal_rtd) / original_rtd × 100%`. Low utilization means the tyre was removed (due to damage/cut) before the tread was fully consumed.

## S

**Segment 1** — Informed buyer who uses the dashboard for data analysis. Existing customer base.

**Segment 2** — Uninformed buyer who rejects dashboards and wants SMS push alerts. The target of this upgrade project.

**Service Role Key** — Supabase admin key that bypasses all RLS policies. Used only in server-side API functions. Must never be exposed to client-side code.

**Subscriber** — A person who receives SMS alerts. Each subscriber is linked to a site and has a validated Indian mobile number.

## T

**Threshold** — The value that triggers an alert: e.g., 100 PSI for pressure drop, 24 hours for fitment overdue, 7 days for inspection due, 3mm for RTD.

**TTH (Time to Hand over)** — How long until a tyre reaches end of life and needs replacement.

**Tyre Card** — The master record for a tyre: brand, size, serial number, fitment date, removal date, cost.

## U

**Uninformed Buyer (Segment 2)** — A customer type that does not want analysis tools or dashboards. They want push notifications (SMS) for urgent events and nothing more.

## V

**Variance** — The difference between actual tyre life and target life: `actual - target`. Positive means the tyre outperformed its target.

---

*DynaHaul X — June 2026*
