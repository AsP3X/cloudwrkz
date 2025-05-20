# CloudWrkz Design System Documentation

## Brand Identity

### Colors
- Primary Gradient: `from-cyan-400 to-blue-500`
- Background Gradient: `from-gray-900 to-gray-800`
- Text Colors:
  - Primary: White (`text-white`)
  - Secondary: Gray-300 (`text-gray-300`)
  - Muted: Gray-400 (`text-gray-400`)
- Interactive Elements:
  - Hover: Cyan-400 (`hover:text-cyan-400`)
  - Button Hover: `hover:from-cyan-600 hover:to-blue-600`

### Typography
- Logo: Text 2XL with gradient effect
- Headers: 
  - Hero: 5XL on mobile, 7XL on desktop
  - Section Headers: XL with semibold weight
- Body Text: Base size for regular content, XL for featured content
- Font Weights:
  - Bold: For headers and emphasis
  - Medium: For buttons and interactive elements
  - Regular: For body text

## Layout Components

### Navigation
- Fixed position with blur effect
- Background: Semi-transparent dark (`bg-gray-900/70`)
- Backdrop blur for glass effect
- Responsive:
  - Mobile: Hidden navigation menu
  - Desktop: Horizontal menu with hover effects

### Container Sizes
- Max Width: 7XL (`max-w-7xl`)
- Padding:
  - Base: px-4
  - SM: px-6
  - LG: px-8

### Spacing System
- Vertical Spacing:
  - Section Padding: py-16
  - Component Gaps: gap-8
  - Element Margins: mt-6, mb-4, etc.
- Horizontal Spacing:
  - Menu Items: space-x-8
  - Button Groups: gap-4

## Components

### Buttons
1. Primary Button:
\`\`\`css
px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all
\`\`\`

2. Secondary Button:
\`\`\`css
px-8 py-3 border border-gray-600 text-gray-300 font-medium rounded-lg hover:bg-gray-800 transition-all
\`\`\`

### Cards
Standard Card:
\`\`\`css
p-6 rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700 hover:border-cyan-500 transition-all
\`\`\`

### Links
Navigation Links:
\`\`\`css
text-gray-300 hover:text-cyan-400 transition-colors px-3 py-2
\`\`\`

## Grid System
- Mobile: Single column (`grid-cols-1`)
- Desktop: Three columns (`md:grid-cols-3`)
- Grid Gap: 8 (`gap-8`)

## Animation & Transitions
- Color Transitions: `transition-colors`
- All Properties: `transition-all`
- Hover Effects:
  - Links: Color change
  - Cards: Border color change
  - Buttons: Gradient shift

## Page Structure

### Standard Page Layout
1. Navigation Bar (Fixed)
2. Main Content Area
   - Hero Section (when applicable)
   - Content Sections
   - Feature Grids
3. Footer

### Section Patterns
1. Hero Section:
   - Large gradient text header
   - Subheading in white
   - Descriptive text in gray
   - Call-to-action buttons

2. Feature Grids:
   - Three-column layout
   - Icon-based cards
   - Consistent spacing
   - Hover interactions

3. Footer:
   - Border top separator
   - Flex layout for responsive design
   - Copyright information
   - Secondary navigation links

## Responsive Design Breakpoints
- Mobile: Base design
- SM: 640px and above
- MD: 768px and above
- LG: 1024px and above
- XL: 1280px and above

## Best Practices
1. Always maintain consistent spacing using the defined system
2. Use the gradient system for primary CTAs and emphasis
3. Implement hover states for interactive elements
4. Ensure proper contrast with background colors
5. Maintain responsive design patterns
6. Use backdrop blur for overlay elements
7. Implement smooth transitions for all interactive elements

This design system should be followed for all new pages to maintain consistency across the application.
