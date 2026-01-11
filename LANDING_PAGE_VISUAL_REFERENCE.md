# Landing Page Customization - Visual Reference

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN INTERFACE (Landing Tab)                 │
│  ┌─────────────┬──────────────┬──────────┬──────────────────┐   │
│  │  Branding   │   Content    │ Contact  │     Options      │   │
│  │  ─────────  │   ───────    │ ────────│  ───────────    │   │
│  │ • Logo URL  │ • Headline   │ • Co.   │ • Show Powered  │   │
│  │ • Primary   │ • Description│ • Email │   By            │   │
│  │   Color     │              │ • Phone │                 │   │
│  │ • Background│              │         │                 │   │
│  │   Color     │              │         │                 │   │
│  │ • Button    │              │         │                 │   │
│  │   Text      │              │         │                 │   │
│  └─────────────┴──────────────┴──────────┴──────────────────┘   │
│                         │                                         │
│                         └─────────────────────────────────────┐   │
│                                                                 │   │
│                         "Save Landing Page"                    │   │
│                                                                 ▼   │
│                           [Save Button]                         │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │  saveForm() function │
                   │  (App.tsx line 777)  │
                   └──────────────────────┘
                              │
                              ├─► Validate form data
                              │
                              └─► Create landingConfig object
                                 (camelCase format)
                              │
                              ▼
                   ┌──────────────────────┐
                   │  POST /api/forms     │
                   │  with Authorization  │
                   └──────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   API Handler (api/forms.ts line 167) │
          │                                       │
          │  Convert camelCase → snake_case:     │
          │  • landingConfig.headline             │
          │  • landingConfig.theme.primaryColor   │
          │  • landingConfig.contact.companyName  │
          │  • etc...                             │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │      Database (Supabase)              │
          │                                       │
          │  forms table:                         │
          │  ┌─────────────────────────────────┐  │
          │  │ id                              │  │
          │  │ slug                            │  │
          │  │ name                            │  │
          │  │ template_id                     │  │
          │  │ ...                             │  │
          │  │ landing_config (JSONB):         │  │
          │  │ {                               │  │
          │  │   "headline": "...",            │  │
          │  │   "description": "...",         │  │
          │  │   "logo_url": "...",            │  │
          │  │   "theme": {                    │  │
          │  │     "primary_color": "#...",    │  │
          │  │     "background_color": "#..."  │  │
          │  │   },                            │  │
          │  │   "contact": {                  │  │
          │  │     "company_name": "...",      │  │
          │  │     "email": "...",             │  │
          │  │     "phone": "..."              │  │
          │  │   },                            │  │
          │  │   "footer_text": "...",         │  │
          │  │   "show_powered_by": true       │  │
          │  │ }                               │  │
          │  └─────────────────────────────────┘  │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   API Response (toCamel conversion)   │
          │   Convert snake_case → camelCase      │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   Update React State (App.tsx)        │
          │   • Update forms array                │
          │   • Update currentForm                │
          │   • Stay on Landing tab               │
          └───────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════


                    VIEWING PUBLIC FORM

User visits: https://yourdomain.com/form-slug
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │  fetchFormBySlug() function           │
          │  (App.tsx line 323)                   │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │  GET /api/forms?slug=form-slug        │
          │  (api/forms.ts line 81-88)            │
          │                                       │
          │  SELECT                               │
          │    id, slug, landing_config,          │
          │    form_qrcodes(...)                  │
          │  FROM forms                           │
          │  WHERE slug = 'form-slug'             │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   Database Query Returns              │
          │   landing_config as JSONB             │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   toCamel() conversion                │
          │   snake_case → camelCase              │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   Set currentForm state               │
          │   (includes landingConfig object)     │
          └───────────────────────────────────────┘
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │   Render PUBLIC_FORM View             │
          │   (App.tsx line 1844-1950)            │
          │                                       │
          │   const lc = currentForm?.landingConfig
          │   const theme = lc.theme             │
          │   const contact = lc.contact         │
          │                                       │
          │   Use these values to render:        │
          │   ├─ Logo: lc.logoUrl                │
          │   ├─ Headline: lc.headline           │
          │   ├─ Description: lc.description     │
          │   ├─ Colors: theme.primaryColor      │
          │   │            theme.backgroundColor │
          │   ├─ Button: lc.buttonText           │
          │   ├─ Contact: contact.companyName    │
          │   │             contact.email        │
          │   │             contact.phone        │
          │   ├─ Footer: lc.footerText           │
          │   └─ Badge: lc.showPoweredBy         │
          └───────────────────────────────────────┘
                              │
                              ▼
         ┌──────────────────────────────────────┐
         │  Live Public Form Displays With      │
         │  All Customizations Applied         │
         └──────────────────────────────────────┘
```

## State Flow for Each Field

### Example: Primary Color

```
User sets Primary Color to #FF0000 (red)
              │
              ▼
    setLandingPrimaryColor('#FF0000')
              │
              ▼
    State: landingPrimaryColor = '#FF0000'
              │
              ▼
    User clicks "Save Landing Page"
              │
              ▼
    saveForm() builds:
    {
      theme: {
        primaryColor: '#FF0000'
      }
    }
              │
              ▼
    API receives and converts:
    theme: {
      primary_color: '#FF0000'
    }
              │
              ▼
    Database stores as JSONB
              │
              ▼
    API response converts back:
    theme: {
      primaryColor: '#FF0000'
    }
              │
              ▼
    currentForm.landingConfig.theme.primaryColor
              │
              ▼
    PUBLIC_FORM renders:
    <button style={{ 
      backgroundColor: primaryColor 
    }}>
    
    Result: Button is RED
```

## Component Tree (Simplified)

```
App
├── View: FORM_DETAILS
│   └── Landing Tab
│       ├── Branding Section
│       │   ├── Logo Input → setLandingLogoUrl
│       │   ├── Primary Color Input → setLandingPrimaryColor
│       │   ├── Background Color Input → setLandingBackgroundColor
│       │   └── Button Text Input → setLandingButtonText
│       ├── Content Section
│       │   ├── Headline Input → setLandingHeadline
│       │   └── Description Textarea → setLandingDescription
│       ├── Contact Section
│       │   ├── Company Input → setLandingCompanyName
│       │   ├── Email Input → setLandingContactEmail
│       │   └── Phone Input → setLandingContactPhone
│       ├── Footer Section
│       │   └── Footer Text Input → setLandingFooterText
│       ├── Options Section
│       │   └── Checkbox → setLandingShowPoweredBy
│       └── Save Button → saveForm()
│
└── View: PUBLIC_FORM
    └── Form Card
        ├── Logo (if lc.logoUrl)
        ├── Headline (lc.headline || fallback)
        ├── Description (lc.description)
        ├── Form Inputs
        ├── Submit Button
        │   └── Text: lc.buttonText
        │   └── Color: theme.primaryColor
        ├── Contact Footer (if contact info present)
        │   ├── Company Name
        │   ├── Email Link
        │   └── Phone Link
        ├── Footer Text (if lc.footerText)
        └── Powered By Badge (if lc.showPoweredBy)
```

## Color Application

```
Customization Field: "Primary Color" (#3B82F6)

Applied To:
  ├─ Button background
  ├─ Button shadow (with opacity)
  ├─ Icon background (lightened)
  ├─ Links
  └─ Focus ring color

Customization Field: "Background Color" (#F8FAFC)

Applied To:
  └─ Full page background
     (fallback: #0F172A in dark mode, #F8FAFC in light)
```

## Data Types

```
Frontend State (TypeScript):
  landingPrimaryColor: string (hex color)
  landingBackgroundColor: string (hex color)
  landingHeadline: string
  landingDescription: string
  landingLogoUrl: string (URL)
  landingButtonText: string
  landingCompanyName: string
  landingContactEmail: string (email)
  landingContactPhone: string (phone)
  landingFooterText: string
  landingShowPoweredBy: boolean

Database (JSONB):
  {
    headline?: string
    description?: string
    logo_url?: string
    theme?: {
      primary_color?: string
      background_color?: string
      card_color?: string
      text_color?: string
      muted_color?: string
      accent_color?: string
      dark_mode?: boolean
    }
    contact?: {
      company_name?: string
      email?: string
      phone?: string
      website?: string
      address?: string
    }
    footer_text?: string
    show_powered_by?: boolean
    button_text?: string
    custom_css?: string
  }
```

## Key Points

1. **Case Conversion**: camelCase ↔ snake_case handled by API
2. **Conditional Rendering**: Contact info only shows if at least one field present
3. **Defaults**: Sensible defaults used when customization not provided
4. **Inline Styles**: Colors use inline `style={{}}` for maximum flexibility
5. **Gradual Enhancement**: System works with or without customizations
