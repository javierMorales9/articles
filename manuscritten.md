# Manuscritten — brief context

Manuscritten is a platform for creating and sending handwritten letters as part of acquisition and retention campaigns. Letters are configured in a web app (text, typography, margins, signature, QR, design), converted into print instructions (primarily SVG), and executed by writing robots.

Sending modes:
- One-off campaigns (CSV upload).
- Automated campaigns via integrations (Zapier/HubSpot/API).
- Single letters for ad-hoc use.

Core components:
- Next.js app (UI + API) for campaigns, letters, designs, billing, and integrations.
- Background worker for validation and batch processing.
- Robot controller service that receives print jobs and drives local hardware.
- Integrations (HubSpot, Zapier, API) that feed automated campaigns.

Credits are the primary billing unit and are charged or owed at card creation and campaign activation, depending on the campaign type. Correctness depends on transactional credit mutations under concurrency.
