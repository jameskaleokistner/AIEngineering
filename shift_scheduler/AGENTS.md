# Shift Scheduler Project

## Business Requirements

- Build a shift scheduling web application that converts forecasted demand into employee shift plans
- Use demand data from CSV files initially; include a process to generate realistic dummy demand CSV data
- Visualize historical demand volume and planned labor coverage in the website
- Allow users to review and adjust the generated schedule before publishing
- Include a final `Send Plan` action that creates shifts in Clockify via API

## Product Scope (MVP)

- Single location/site scheduling
- Hourly demand view by day/week
- Basic employee constraints (availability windows, max hours/day, max hours/week)
- Auto-generated schedule from demand + constraints
- Manual schedule edits in UI before publish
- One-click publish to Clockify from the approved plan

## Out of Scope (for MVP)

- Multi-location optimization
- Payroll export integrations beyond Clockify
- Advanced forecasting models (use deterministic/dummy data inputs first)
- Mobile app (web only)

## Technical Details

- Implement as a TypeScript web app
- Keep architecture modular:
  - `ingestion`: demand CSV parsing + validation
  - `planning`: shift generation engine
  - `visualization`: demand vs labor charts
  - `integration`: Clockify API client and publish workflow
- Use clear domain types (DemandPoint, Employee, Shift, Plan, PublishResult)
- Keep side effects isolated to integration modules; core planning should be pure and testable
- Store configuration via environment variables (API keys, base URLs, defaults)

## Data Inputs and Outputs

- Input: demand CSV with at minimum:
  - `timestamp`
  - `required_headcount`
  - optional `skill` / `queue`
- Input: employee roster with at minimum:
  - `employee_id`
  - `name`
  - availability windows
  - scheduling limits
- Output: generated plan with:
  - shift assignments by employee
  - demand coverage by interval
  - under/over-staffing indicators

## Scheduling Logic Guidelines

- Prioritize meeting demand coverage first, then minimizing overstaffing
- Respect employee constraints at all times
- Prefer contiguous shifts over fragmented assignments
- Support configurable shift length bounds (for example, min 4h, max 10h)
- Produce explainable outputs (why a slot is under-covered, which constraints prevented coverage)

## UI Requirements

- Dashboard with:
  - historical demand chart
  - planned labor chart
  - coverage delta (labor minus demand)
- Planning workspace with:
  - date range selector
  - generated shift table/timeline
  - manual edit capability (add/move/delete shifts)
- Final publish section:
  - validation summary
  - `Send Plan` button
  - publish result log (success/failure per shift)

## Clockify Integration Requirements

- Encapsulate API calls behind a dedicated client module
- API Key can be found in .env file as `CLOCKIFY_API_KEY`
- Validate plan before sending (no invalid employees, no negative durations, no overlaps per employee)
- Use idempotency-safe publish behavior where possible
- Log outbound payloads and API responses for troubleshooting (without exposing secrets)
- Surface actionable error messages in UI if publish fails

## Testing Strategy

1. Unit tests:
   - CSV parsing and validation
   - planning engine constraint handling
   - publish payload mapping
2. Integration tests:
   - end-to-end plan generation from sample CSV
   - mocked Clockify publish flow
3. UI tests:
   - visualization rendering
   - manual shift edit interactions
   - `Send Plan` workflow and failure handling

## Delivery Strategy

1. Scaffold project and core domain types
2. Implement dummy demand CSV generator + ingestion pipeline
3. Implement first-pass planning engine
4. Build UI visualizations and schedule editor
5. Implement Clockify publish flow
6. Add tests, tighten validation, and finalize MVP

## Coding Standards

1. Keep code concise, readable, and modular
2. Prefer pure functions for planning logic
3. Avoid over-engineering; build the smallest robust solution first
4. Add comments only where the logic is non-obvious
5. Never commit secrets; use environment variables and `.env` templates
