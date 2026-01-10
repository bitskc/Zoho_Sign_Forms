-- Landing Page Customization Migration
-- Adds fields for customizable form landing pages

-- Add landing page customization columns to forms table
ALTER TABLE forms ADD COLUMN IF NOT EXISTS landing_config JSONB DEFAULT '{}'::jsonb;

-- The landing_config JSONB will store:
-- {
--   "headline": "Welcome to Our Application",
--   "description": "Please fill out the form below to get started with your application.",
--   "logo_url": "https://...",
--   "logo_alt": "Company Logo",
--   "theme": {
--     "primary_color": "#3B82F6",
--     "background_color": "#F8FAFC",
--     "text_color": "#1E293B",
--     "accent_color": "#10B981",
--     "dark_mode": false
--   },
--   "contact": {
--     "company_name": "FBMC Benefits",
--     "email": "support@fbmc.com",
--     "phone": "(555) 123-4567",
--     "website": "https://fbmc.com"
--   },
--   "footer_text": "© 2026 FBMC Benefits. All rights reserved.",
--   "show_powered_by": true,
--   "custom_css": ""
-- }

-- Index for faster lookups (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_forms_landing_config ON forms USING GIN (landing_config);

COMMENT ON COLUMN forms.landing_config IS 'JSON configuration for customizable landing page (branding, colors, description, contact info)';
