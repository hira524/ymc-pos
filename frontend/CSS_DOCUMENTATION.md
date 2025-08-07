# YMC POS - CSS Documentation

## Overview
This CSS system provides a comprehensive styling framework for the YMC POS application with modern design principles, accessibility features, and responsive layouts.

## File Structure

### Core CSS Files
- **`index.css`** - Global styles, CSS variables, typography, and base styles
- **`App.css`** - Main application layout and POS-specific components
- **`components.css`** - Reusable UI components (cards, modals, forms, etc.)
- **`themes.css`** - Theme configurations and color schemes
- **`animations.css`** - Animation utilities and transition effects
- **`pos.css`** - POS-specific layouts, receipt styles, and print media queries

## CSS Variables System

### Colors
```css
--primary-color: #1e3a8a;      /* Main brand color */
--primary-light: #3b82f6;      /* Lighter primary */
--primary-dark: #1e40af;       /* Darker primary */
--secondary-color: #10b981;    /* Secondary accent */
--accent-color: #f59e0b;       /* Accent highlights */
--danger-color: #ef4444;       /* Error/delete actions */
--warning-color: #f97316;      /* Warning states */
--success-color: #22c55e;      /* Success states */
```

### Gray Scale
```css
--gray-50: #f9fafb;   /* Lightest gray */
--gray-100: #f3f4f6;  /* Very light gray */
--gray-200: #e5e7eb;  /* Light gray */
--gray-300: #d1d5db;  /* Medium light gray */
--gray-400: #9ca3af;  /* Medium gray */
--gray-500: #6b7280;  /* Base gray */
--gray-600: #4b5563;  /* Medium dark gray */
--gray-700: #374151;  /* Dark gray */
--gray-800: #1f2937;  /* Very dark gray */
--gray-900: #111827;  /* Darkest gray */
```

### Spacing
```css
--spacing-1: 0.25rem;  /* 4px */
--spacing-2: 0.5rem;   /* 8px */
--spacing-3: 0.75rem;  /* 12px */
--spacing-4: 1rem;     /* 16px */
--spacing-5: 1.25rem;  /* 20px */
--spacing-6: 1.5rem;   /* 24px */
--spacing-8: 2rem;     /* 32px */
--spacing-10: 2.5rem;  /* 40px */
--spacing-12: 3rem;    /* 48px */
--spacing-16: 4rem;    /* 64px */
--spacing-20: 5rem;    /* 80px */
```

### Shadows
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
```

### Border Radius
```css
--border-radius: 8px;     /* Default radius */
--border-radius-sm: 4px;  /* Small radius */
--border-radius-lg: 12px; /* Large radius */
--border-radius-xl: 16px; /* Extra large radius */
```

## Component Classes

### Buttons
- **`.btn-primary`** - Primary action buttons (blue gradient)
- **`.btn-secondary`** - Secondary buttons (gray)
- **`.btn-success`** - Success buttons (green gradient)
- **`.btn-warning`** - Warning buttons (orange gradient)
- **`.btn-danger`** - Danger buttons (red gradient)
- **`.btn-large`** - Larger buttons (56px height)
- **`.btn-small`** - Smaller buttons (36px height)
- **`.btn-full`** - Full width buttons

### Cards
- **`.card`** - Base card component
- **`.card-header`** - Card header section
- **`.card-body`** - Card main content
- **`.card-footer`** - Card footer section

### Forms
- **`.form-group`** - Form field container
- **`.form-label`** - Field labels
- **`.form-input`** - Text inputs
- **`.form-select`** - Select dropdowns
- **`.form-check`** - Checkbox/radio containers

### Status Indicators
- **`.status-indicator`** - Base status indicator
- **`.status-connected`** - Connected state (green)
- **`.status-disconnected`** - Disconnected state (red)
- **`.status-processing`** - Processing state (orange)

### Badges
- **`.badge`** - Base badge component
- **`.badge-primary`** - Primary colored badge
- **`.badge-success`** - Success colored badge
- **`.badge-warning`** - Warning colored badge
- **`.badge-danger`** - Danger colored badge

## Layout Classes

### POS Terminal Layout
- **`.pos-terminal`** - Main POS grid layout
- **`.pos-header`** - Terminal header area
- **`.pos-products`** - Products display area
- **`.pos-cart`** - Shopping cart area
- **`.pos-footer`** - Terminal footer area

### Main Application Layout
- **`.main-container`** - Main content container
- **`.content-area`** - Primary content area
- **`.search-section`** - Search interface section
- **`.products-section`** - Products grid section

## Animation Classes

### Basic Animations
- **`.animate-fade-in`** - Fade in animation
- **`.animate-fade-out`** - Fade out animation
- **`.animate-slide-in-left`** - Slide in from left
- **`.animate-slide-in-right`** - Slide in from right
- **`.animate-slide-in-up`** - Slide in from bottom
- **`.animate-slide-in-down`** - Slide in from top
- **`.animate-scale-in`** - Scale in animation
- **`.animate-bounce`** - Bounce animation
- **`.animate-pulse`** - Pulse animation
- **`.animate-spin`** - Spinning animation

### Hover Effects
- **`.hover-lift`** - Lift on hover
- **`.hover-grow`** - Grow on hover
- **`.hover-glow`** - Glow effect on hover
- **`.hover-shadow`** - Shadow increase on hover

### Loading States
- **`.loading`** - Loading spinner overlay
- **`.loading-skeleton`** - Skeleton loading animation
- **`.loading-dots`** - Animated dots

## Theme System

### Available Themes
Set theme using `data-theme` attribute on `<html>` or `<body>`:

- **`light`** - Default light theme
- **`dark`** - Dark theme
- **`blue`** - Blue accent theme
- **`green`** - Green accent theme
- **`purple`** - Purple accent theme
- **`orange`** - Orange accent theme
- **`high-contrast`** - High contrast accessibility theme

### Seasonal Themes
- **`christmas`** - Red and green holiday theme
- **`halloween`** - Orange and purple spooky theme
- **`valentine`** - Pink and red romantic theme

## Utility Classes

### Display
- **`.d-none`** - Display none
- **`.d-block`** - Display block
- **`.d-flex`** - Display flex
- **`.d-grid`** - Display grid

### Flexbox
- **`.flex-column`** - Flex direction column
- **`.justify-content-center`** - Center justify content
- **`.justify-content-between`** - Space between
- **`.align-items-center`** - Center align items

### Text Alignment
- **`.text-center`** - Center text
- **`.text-left`** - Left align text
- **`.text-right`** - Right align text

### Font Weight
- **`.fw-normal`** - Normal weight (400)
- **`.fw-medium`** - Medium weight (500)
- **`.fw-semibold`** - Semi-bold weight (600)
- **`.fw-bold`** - Bold weight (700)

### Text Colors
- **`.text-primary`** - Primary color text
- **`.text-success`** - Success color text
- **`.text-warning`** - Warning color text
- **`.text-danger`** - Danger color text
- **`.text-muted`** - Muted gray text

### Spacing
- **`.m-0` to `.m-6`** - Margin utilities
- **`.p-0` to `.p-6`** - Padding utilities
- **`.gap-1` to `.gap-6`** - Gap utilities for flex/grid

### Shadows
- **`.shadow`** - Base shadow
- **`.shadow-md`** - Medium shadow
- **`.shadow-lg`** - Large shadow
- **`.shadow-xl`** - Extra large shadow

## Responsive Design

### Breakpoints
- **Desktop**: 1024px and up
- **Tablet**: 768px - 1023px
- **Mobile**: 480px - 767px
- **Small Mobile**: Under 480px

### Responsive Features
- Flexible grid layouts that adapt to screen size
- Touch-friendly buttons (44px minimum touch target)
- Responsive typography
- Optimized layouts for both portrait and landscape orientations

## Print Styles

### Receipt Printing
- **`.receipt`** - Main receipt container
- **`.receipt-header`** - Receipt header with business info
- **`.receipt-items`** - List of purchased items
- **`.receipt-totals`** - Order totals section
- **`.receipt-footer`** - Receipt footer with thank you message

Print styles automatically hide UI elements and show only the receipt when printing.

## Accessibility Features

### High Contrast
- Support for high contrast themes
- Proper color contrast ratios (WCAG AA compliant)
- Focus indicators for keyboard navigation

### Reduced Motion
- Respects `prefers-reduced-motion` setting
- Fallbacks for users with motion sensitivity
- Essential animations only when motion is reduced

### Screen Readers
- Semantic HTML structure support
- Proper focus management
- ARIA-friendly components

## Touch Optimization

### Touch Targets
- Minimum 44px touch targets
- Proper spacing between interactive elements
- Touch-friendly button sizes

### Gestures
- Optimized for swipe gestures
- Touch feedback animations
- Responsive touch interactions

## Customization

### Changing Colors
Modify CSS variables in `:root` or use theme classes:

```css
:root {
  --primary-color: #your-color;
  --secondary-color: #your-color;
}
```

### Adding Custom Themes
Create new theme variants in `themes.css`:

```css
[data-theme="your-theme"] {
  --primary-color: #your-primary;
  --secondary-color: #your-secondary;
  /* Add other variables */
}
```

### Custom Animations
Add new animations in `animations.css`:

```css
@keyframes your-animation {
  /* Keyframes */
}

.animate-your-animation {
  animation: your-animation 1s ease;
}
```

## Performance Considerations

### Optimizations
- CSS variables for consistent theming
- Efficient animations using transform and opacity
- Minimal repaints and reflows
- Optimized for 60fps animations

### Loading
- Critical CSS inlined where possible
- Non-critical styles loaded asynchronously
- Efficient font loading strategies

## Browser Support

### Modern Browsers
- Chrome 70+
- Firefox 70+
- Safari 12+
- Edge 79+

### Fallbacks
- Graceful degradation for older browsers
- Progressive enhancement approach
- Feature detection where needed

## Maintenance

### Code Organization
- Modular CSS files by functionality
- Consistent naming conventions (BEM-inspired)
- Well-documented variables and mixins

### Best Practices
- Mobile-first responsive design
- Consistent spacing and sizing
- Accessible color combinations
- Performance-optimized animations

## Example Usage

### Basic Product Card
```jsx
<div className="card hover-lift">
  <div className="card-body">
    <h3 className="fw-semibold text-primary">Product Name</h3>
    <p className="text-muted">Product description</p>
    <button className="btn-primary btn-full">Add to Cart</button>
  </div>
</div>
```

### Animated Component
```jsx
<div className="animate-fade-in animate-delay-200">
  <div className="card hover-grow transition-all">
    Content with animation
  </div>
</div>
```

### Theme Switching
```javascript
// Switch to dark theme
document.documentElement.setAttribute('data-theme', 'dark');

// Switch to custom theme
document.documentElement.setAttribute('data-theme', 'blue');
```

This CSS system provides a solid foundation for building modern, accessible, and performant web applications with consistent design patterns and professional polish.
