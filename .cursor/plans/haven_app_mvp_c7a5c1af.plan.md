---
name: Haven App MVP
overview: Build a mobile-first React Native/Expo app called "Haven" for new, returning, and curious Catholics, featuring customizable home page, static content aggregation, and an accessible design focused on Protestant-turned-Catholic authors.
todos:
  - id: setup-project
    content: Initialize Expo project with TypeScript, set up basic project structure (app/, components/, content/, services/, theme/, types/)
    status: pending
  - id: navigation-theme
    content: Set up React Navigation (Stack + Tab navigators) and create theme system (colors, typography, spacing) with accessible design
    status: pending
    dependencies:
      - setup-project
  - id: content-structure
    content: Create content directory structure and sample JSON/Markdown files for prayers, authors, daily content, learning paths, and sacraments
    status: pending
    dependencies:
      - setup-project
  - id: dashboard-foundation
    content: Build customizable home dashboard with grid layout, widget component system, and basic UI components (Card, Button, etc.)
    status: pending
    dependencies:
      - navigation-theme
  - id: dashboard-customization
    content: "Implement dashboard customization: widget selector, add/remove/reorder functionality, and persistence with AsyncStorage"
    status: pending
    dependencies:
      - dashboard-foundation
  - id: content-services
    content: Create contentService.ts and dailyContentService.ts to fetch and parse static content from JSON/Markdown files
    status: pending
    dependencies:
      - content-structure
  - id: daily-content
    content: "Implement daily content screens: Mass readings, saint of the day, daily reflection with liturgical calendar integration"
    status: pending
    dependencies:
      - content-services
  - id: prayer-library
    content: Build prayer library screen with searchable/filterable prayers organized by occasion, plus interactive Rosary guide
    status: pending
    dependencies:
      - content-services
  - id: author-library
    content: Create author library screen featuring Chesterton, Hahn, Nester, etc. with books, quotes, and articles organized by author
    status: pending
    dependencies:
      - content-services
  - id: learning-paths
    content: Implement learning paths (New Catholic, Returning Catholic, Exploring Faith) with progress tracking
    status: pending
    dependencies:
      - content-services
  - id: local-resources
    content: "Build local resources finder: Mass times, confession times, adoration chapels using Maps integration"
    status: pending
    dependencies:
      - content-services
  - id: sacrament-guides
    content: Create sacrament guides screen with accessible explanations and preparation guides
    status: pending
    dependencies:
      - content-services
  - id: onboarding-settings
    content: Build onboarding flow (identify user journey stage) and settings screen (notifications, theme, preferences)
    status: pending
    dependencies:
      - navigation-theme
  - id: polish-testing
    content: Polish UI/UX, optimize performance, test on iOS/Android devices, prepare for native app deployment
    status: pending
    dependencies:
      - daily-content
      - prayer-library
      - author-library
      - learning-paths
      - local-resources
      - sacrament-guides
---

# Haven App - MVP Implementation Plan

## Project Overview

Build a mobile-first Catholic faith journey app using React Native with Expo, featuring static content aggregation and a customizable home page. The app will be welcoming to new Catholics, Catholic-curious Christians, and those exploring the faith, with content focused on accessible authors like Chesterton, Hahn, and Nester.

## Architecture Overview

```javascript
Haven App
├── App Shell (React Native/Expo)
│   ├── Navigation (React Navigation)
│   ├── Theme System (accessible, clean design)
│   └── State Management (React Context/Redux)
├── Content Layer
│   ├── Static Content (JSON/Markdown files)
│   ├── Daily Content Generator (readings, saints, prayers)
│   └── Content Organizer (by category, author, devotion type)
└── Features
    ├── Customizable Home Dashboard
    ├── Daily Faith Content
    ├── Prayer & Devotion Resources
    ├── Author Library
    ├── Learning Paths
    ├── Local Resources Finder
    └── Liturgical Calendar
```



## Core Features to Implement

### 1. **Customizable Home Dashboard**

- Grid of customizable cards/widgets
- Users can add/remove/reorder devotions
- Available widgets: Daily Reading, Saint of Day, Prayer, Rosary, Author Quote, etc.
- Persistent user preferences (AsyncStorage)

### 2. **Daily Faith Content**

- Daily Mass readings (USCCB structure)
- Saint of the day with brief biography
- Daily reflection (accessible, welcoming tone)
- Liturgical calendar integration

### 3. **Prayer & Devotion Resources**

- Prayer library (Our Father, Hail Mary, etc.) - organized by occasion
- Interactive Rosary guide
- Stations of the Cross
- Examination of Conscience
- Not front-and-center Marian focus, but available

### 4. **Author Library**

- Featured authors: Chesterton, Hahn, Nester, etc.
- Books, quotes, articles by author
- Accessible content for converts/curious Christians
- Search and filtering

### 5. **Learning Paths**

- "New to Catholicism" path
- "Returning Catholic" path
- "Exploring Faith" path (for unbelievers)
- Progress tracking (optional, non-intrusive)

### 6. **Local Resources Finder**

- Mass times finder (integrate with Google Maps or Church directory APIs)
- Confession times
- Adoration chapels
- Catholic bookstores/resources
- Map view integration

### 7. **Sacrament Guides**

- Explanations of each sacrament
- Preparation guides
- Accessible language (not overly technical)

### 8. **Settings & Preferences**

- Notification preferences
- Theme (light/dark mode)
- Home dashboard customization
- Onboarding flow (identify user journey stage)

## Technical Implementation

### Stack

- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Stack + Tab navigation)
- **State Management**: React Context API (can upgrade to Redux if needed)
- **Storage**: AsyncStorage for user preferences
- **Maps**: react-native-maps or Expo Location
- **Content**: JSON files + Markdown renderer (react-native-markdown-display)
- **Styling**: StyleSheet with theme system (mobile-first responsive)

### Project Structure

```javascript
haven-app/
├── app/                          # Expo Router or React Navigation screens
│   ├── (tabs)/                   # Tab navigation screens
│   │   ├── index.tsx            # Home dashboard (customizable)
│   │   ├── daily.tsx            # Daily content
│   │   ├── prayers.tsx          # Prayer library
│   │   ├── authors.tsx          # Author library
│   │   └── resources.tsx        # Local resources finder
│   ├── learning/                 # Learning paths
│   ├── sacraments/               # Sacrament guides
│   └── settings/                 # Settings & customization
├── components/                   # Reusable components
│   ├── Dashboard/               # Home dashboard widgets
│   ├── Content/                 # Content display components
│   ├── Navigation/              # Navigation components
│   └── UI/                      # Basic UI components (Button, Card, etc.)
├── content/                      # Static content files
│   ├── prayers/                 # Prayer content (JSON/Markdown)
│   ├── authors/                 # Author content (JSON/Markdown)
│   ├── daily/                   # Daily readings structure
│   ├── learning/                # Learning path content
│   └── sacraments/              # Sacrament guide content
├── services/                     # Business logic
│   ├── contentService.ts        # Content fetching/parsing
│   ├── dailyContentService.ts   # Daily content generation
│   ├── locationService.ts       # Mass/confession finder
│   └── storageService.ts        # User preferences
├── theme/                        # Theme configuration
│   ├── colors.ts
│   ├── typography.ts
│   └── spacing.ts
├── types/                        # TypeScript types
└── utils/                        # Utility functions
```



### Key Files to Create

1. **[app.json](app.json)** - Expo configuration
2. **[package.json](package.json)** - Dependencies (React Native, Expo, Navigation, etc.)
3. **[app/(tabs)/index.tsx](app/\\(tabs)/index.tsx)** - Customizable home dashboard
4. **[components/Dashboard/DashboardWidget.tsx](components/Dashboard/DashboardWidget.tsx)** - Reusable dashboard widget component
5. **[components/Dashboard/WidgetSelector.tsx](components/Dashboard/WidgetSelector.tsx)** - Widget selection/customization UI
6. **[services/contentService.ts](services/contentService.ts)** - Content aggregation service
7. **[services/storageService.ts](services/storageService.ts)** - User preferences storage
8. **[content/authors/authors.json](content/authors/authors.json)** - Author library content structure
9. **[content/prayers/prayers.json](content/prayers/prayers.json)** - Prayer library structure
10. **[theme/theme.ts](theme/theme.ts)** - Theme system with accessible colors

## Content Strategy

### Content Structure (JSON/Markdown)

- Organize all static content in `/content` directory
- Use JSON for structured data (authors, prayers list, etc.)
- Use Markdown for longer-form content (articles, guides)
- Daily content can be generated from date-based logic + content files

### Design Principles

- **Non-overwhelming**: Clean, spacious layouts with clear hierarchy
- **Accessible**: High contrast, readable fonts, proper spacing
- **Welcoming**: Warm but not overly decorative (avoid Marian-heavy imagery on main screens)
- **Mobile-first**: Touch-friendly targets, swipe gestures where appropriate

## Implementation Phases

### Phase 1: Project Setup & Core Infrastructure

- Initialize Expo project
- Set up navigation structure
- Create theme system
- Set up content directory structure
- Basic screen shells

### Phase 2: Home Dashboard & Customization

- Dashboard grid layout
- Widget component system
- Customization UI (add/remove/reorder)
- Persistence with AsyncStorage

### Phase 3: Static Content Features

- Daily content display
- Prayer library
- Author library
- Learning paths
- Sacrament guides

### Phase 4: Interactive Features

- Rosary guide
- Local resources finder (Mass times, confession, etc.)
- Liturgical calendar

### Phase 5: Polish & Testing

- UI/UX refinements
- Performance optimization
- Testing on iOS/Android
- Prepare for App Store/Play Store submission

## Dependencies to Install

- `expo` - Expo SDK
- `react-native` - React Native core
- `@react-navigation/native` & stack/tab navigators
- `@react-native-async-storage/async-storage` - User preferences
- `react-native-maps` or `expo-location` - Maps/local resources
- `react-native-markdown-display` - Markdown rendering
- `date-fns` - Date utilities for liturgical calendar
- `expo-notifications` - Push notifications (future)

## Next Steps & Implementation Guide

### Immediate First Steps (When Ready to Begin)

1. **Create New Workspace**

- Create a new directory for the Haven app project
- Navigate to the correct workspace directory

2. **Initialize Expo Project**
   ```bash
         npx create-expo-app@latest haven-app --template
         # Select: blank (TypeScript) template
         cd haven-app
   ```




3. **Install Core Dependencies**
   ```bash
         npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
         npm install react-native-screens react-native-safe-area-context
         npm install @react-native-async-storage/async-storage
         npm install react-native-markdown-display
         npm install date-fns
         npm install expo-location
         npm install --save-dev @types/react-native
   ```




4. **Project Structure Setup**

- Create the directory structure as outlined in the plan:
    - `app/` (or `src/screens/` if not using Expo Router)
    - `components/`
    - `content/`
    - `services/`
    - `theme/`
    - `types/`
    - `utils/`

5. **Initial Configuration**

- Set up `app.json` with app name "Haven", bundle identifier, etc.
- Configure `tsconfig.json` for TypeScript
- Set up basic theme configuration files

### Content Preparation Strategy

Before implementing features, prepare sample content:

1. **Prayer Content** (`content/prayers/prayers.json`)

- Start with 10-15 core prayers
- Structure: `{ id, title, text, category, occasion }`
- Categories: Daily, Before Mass, After Mass, Confession, etc.

2. **Author Content** (`content/authors/authors.json`)

- Start with 3-5 authors (Chesterton, Hahn, Nester, etc.)
- Structure: `{ id, name, bio, books: [], quotes: [] }`
- Include sample quotes/articles

3. **Daily Content Structure**

- Create template for daily readings
- Saint database structure (start with 20-30 popular saints)
- Reflection prompts structure

4. **Learning Path Content**

- Outline 3 paths: "New to Catholicism", "Returning Catholic", "Exploring Faith"
- Create content for first 3-5 steps of each path

### Implementation Order Recommendation

**Week 1: Foundation**

- Project setup & dependencies
- Navigation structure (tabs + stack)
- Theme system
- Basic screen shells
- Content directory with sample data

**Week 2: Dashboard**

- Dashboard grid layout component
- Basic widget components (Daily Reading, Saint, Prayer)
- Widget selector UI
- AsyncStorage integration for preferences

**Week 3: Content Features**

- Daily content service & display
- Prayer library with filtering
- Author library
- Content service utilities

**Week 4: Additional Features**

- Learning paths
- Local resources finder (basic - can enhance later)
- Sacrament guides
- Onboarding flow

**Week 5: Polish**

- UI refinements
- Performance optimization
- Testing on devices
- Prepare for deployment

### Key Design Considerations

1. **Tone & Accessibility**

- Use welcoming, non-intimidating language
- Avoid overly technical Catholic terminology in main UI
- Feature convert authors prominently
- Make Marian devotions available but not front-and-center

2. **User Experience**

- Large, touch-friendly buttons (min 44x44pt)
- Clear visual hierarchy
- Smooth animations (keep them subtle)
- Offline-first where possible (static content)

3. **Content Curation**

- Start with high-quality, accessible content
- Focus on authors/resources that bridge Protestant-Catholic gap
- Include "Why I became Catholic" style content
- Feature practical, actionable guidance

### Questions to Resolve During Implementation

1. **Content Licensing**: Where will content come from? Public domain? Need permissions?
2. **Mass Times API**: Which API/service for Mass times? Google Places? Church directory?
3. **Daily Readings**: Use USCCB API or static files?
4. **App Icon & Branding**: Design direction for icon/logo?
5. **Analytics**: Do you want analytics tracking? (Privacy-conscious option recommended)

### Resources & References

- **USCCB Daily Readings**: https://bible.usccb.org/daily-bible-reading
- **React Navigation Docs**: https://reactnavigation.org/
- **Expo Documentation**: https://docs.expo.dev/
- **React Native Best Practices**: https://reactnative.dev/docs/performance

### Notes for Transferring to Correct Workspace

When you move to the correct workspace:

1. Copy this entire plan document
2. Initialize the project in the new workspace
3. Follow the implementation order above
4. Start with project setup and work through features incrementally