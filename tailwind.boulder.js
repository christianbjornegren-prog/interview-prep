/** Boulder designsystem – Tailwind. Kräver tokens.css. Genererad från Figma. */
/** @type {import('tailwindcss').Config} */
export default {
  "darkMode": [
    "selector",
    "[data-theme=\"dark\"]"
  ],
  "theme": {
    "screens": {
      "tablet": "768px",
      "desktop": "1024px",
      "wide": "1440px"
    },
    "extend": {
      "colors": {
        "background": {
          "primary": "var(--color-background-primary)",
          "secondary": "var(--color-background-secondary)",
          "tertiary": "var(--color-background-tertiary)",
          "disabled": "var(--color-background-disabled)"
        },
        "text": {
          "primary": "var(--color-text-primary)",
          "secondary": "var(--color-text-secondary)",
          "tertiary": "var(--color-text-tertiary)"
        },
        "border": {
          "default": "var(--color-border-default)",
          "strong": "var(--color-border-strong)"
        },
        "action": {
          "primary": {
            "background": "var(--color-action-primary-background)",
            "background-hover": "var(--color-action-primary-background-hover)",
            "background-pressed": "var(--color-action-primary-background-pressed)",
            "text": "var(--color-action-primary-text)"
          },
          "secondary": {
            "background": "var(--color-action-secondary-background)",
            "background-hover": "var(--color-action-secondary-background-hover)",
            "background-pressed": "var(--color-action-secondary-background-pressed)",
            "text": "var(--color-action-secondary-text)",
            "border": "var(--color-action-secondary-border)"
          },
          "disabled": {
            "background": "var(--color-action-disabled-background)",
            "text": "var(--color-action-disabled-text)",
            "border": "var(--color-action-disabled-border)"
          },
          "ghost": {
            "background": "var(--color-action-ghost-background)",
            "background-hover": "var(--color-action-ghost-background-hover)",
            "background-pressed": "var(--color-action-ghost-background-pressed)",
            "text": "var(--color-action-ghost-text)"
          },
          "danger": {
            "background": "var(--color-action-danger-background)",
            "background-hover": "var(--color-action-danger-background-hover)",
            "background-pressed": "var(--color-action-danger-background-pressed)",
            "text": "var(--color-action-danger-text)"
          }
        },
        "focus": {
          "ring": "var(--color-focus-ring)"
        },
        "icon": {
          "primary": "var(--color-icon-primary)",
          "secondary": "var(--color-icon-secondary)"
        },
        "accent": {
          "purple": "var(--color-accent-purple)",
          "pink": "var(--color-accent-pink)",
          "blue": "var(--color-accent-blue)",
          "green": "var(--color-accent-green)",
          "orange": "var(--color-accent-orange)"
        },
        "logo": "var(--color-logo)",
        "link": {
          "text": "var(--color-link-text)",
          "text-hover": "var(--color-link-text-hover)",
          "text-pressed": "var(--color-link-text-pressed)"
        },
        "tag": {
          "purple-1": "var(--color-tag-purple-1)",
          "purple-2": "var(--color-tag-purple-2)",
          "purple-3": "var(--color-tag-purple-3)",
          "pink-1": "var(--color-tag-pink-1)",
          "pink-2": "var(--color-tag-pink-2)",
          "pink-3": "var(--color-tag-pink-3)",
          "blue-1": "var(--color-tag-blue-1)",
          "blue-2": "var(--color-tag-blue-2)",
          "teal-1": "var(--color-tag-teal-1)",
          "teal-2": "var(--color-tag-teal-2)",
          "green-1": "var(--color-tag-green-1)",
          "green-2": "var(--color-tag-green-2)",
          "orange-1": "var(--color-tag-orange-1)",
          "orange-2": "var(--color-tag-orange-2)",
          "grey-1": "var(--color-tag-grey-1)",
          "grey-2": "var(--color-tag-grey-2)",
          "text": "var(--color-tag-text)",
          "blue-3": "var(--color-tag-blue-3)",
          "teal-3": "var(--color-tag-teal-3)",
          "green-3": "var(--color-tag-green-3)",
          "orange-3": "var(--color-tag-orange-3)",
          "grey-3": "var(--color-tag-grey-3)",
          "neutral-background": "var(--color-tag-neutral-background)",
          "neutral-text": "var(--color-tag-neutral-text)"
        },
        "input": {
          "background": "var(--color-input-background)",
          "background-disabled": "var(--color-input-background-disabled)",
          "border": "var(--color-input-border)",
          "border-hover": "var(--color-input-border-hover)",
          "border-disabled": "var(--color-input-border-disabled)",
          "text": "var(--color-input-text)",
          "placeholder": "var(--color-input-placeholder)"
        },
        "control": {
          "checked": "var(--color-control-checked)",
          "checked-hover": "var(--color-control-checked-hover)",
          "check": "var(--color-control-check)"
        },
        "feedback": {
          "error": "var(--color-feedback-error)",
          "error-background": "var(--color-feedback-error-background)",
          "success": "var(--color-feedback-success)",
          "success-background": "var(--color-feedback-success-background)",
          "warning": "var(--color-feedback-warning)",
          "warning-background": "var(--color-feedback-warning-background)",
          "info": "var(--color-feedback-info)",
          "info-background": "var(--color-feedback-info-background)"
        },
        "badge": {
          "background": "var(--color-badge-background)",
          "text": "var(--color-badge-text)"
        },
        "tooltip": {
          "background": "var(--color-tooltip-background)",
          "text": "var(--color-tooltip-text)"
        }
      },
      "spacing": {
        "none": "var(--spacing-none)",
        "3xs": "var(--spacing-3xs)",
        "2xs": "var(--spacing-2xs)",
        "xs": "var(--spacing-xs)",
        "sm": "var(--spacing-sm)",
        "md": "var(--spacing-md)",
        "lg": "var(--spacing-lg)",
        "xl": "var(--spacing-xl)",
        "2xl": "var(--spacing-2xl)",
        "3xl": "var(--spacing-3xl)",
        "4xl": "var(--spacing-4xl)",
        "5xl": "var(--spacing-5xl)",
        "6xl": "var(--spacing-6xl)",
        "7xl": "var(--spacing-7xl)",
        "control-sm": "var(--size-control-sm)",
        "control-md": "var(--size-control-md)",
        "control-lg": "var(--size-control-lg)",
        "page": "var(--layout-page-padding)",
        "workspace": "var(--layout-workspace-padding)",
        "gutter": "var(--layout-gutter)"
      },
      "borderRadius": {
        "none": "var(--border-radius-none)",
        "xs": "var(--border-radius-xs)",
        "sm": "var(--border-radius-sm)",
        "md": "var(--border-radius-md)",
        "lg": "var(--border-radius-lg)",
        "xl": "var(--border-radius-xl)",
        "2xl": "var(--border-radius-2xl)",
        "3xl": "var(--border-radius-3xl)",
        "full": "var(--border-radius-full)"
      },
      "fontSize": {
        "display-xl": [
          "var(--type-display-xl-size)",
          {
            "lineHeight": "var(--type-display-xl-line-height)",
            "fontWeight": "700",
            "letterSpacing": "-0.03em"
          }
        ],
        "display-l": [
          "var(--type-display-l-size)",
          {
            "lineHeight": "var(--type-display-l-line-height)",
            "fontWeight": "700",
            "letterSpacing": "-0.03em"
          }
        ],
        "display-m": [
          "var(--type-display-m-size)",
          {
            "lineHeight": "var(--type-display-m-line-height)",
            "fontWeight": "700",
            "letterSpacing": "-0.02em"
          }
        ],
        "heading-h1": [
          "var(--type-heading-h1-size)",
          {
            "lineHeight": "var(--type-heading-h1-line-height)",
            "fontWeight": "500",
            "letterSpacing": "-0.01em"
          }
        ],
        "heading-h2": [
          "var(--type-heading-h2-size)",
          {
            "lineHeight": "var(--type-heading-h2-line-height)",
            "fontWeight": "500",
            "letterSpacing": "-0.01em"
          }
        ],
        "heading-h3": [
          "var(--type-heading-h3-size)",
          {
            "lineHeight": "var(--type-heading-h3-line-height)",
            "fontWeight": "500",
            "letterSpacing": "-0.01em"
          }
        ],
        "heading-h4": [
          "var(--type-heading-h4-size)",
          {
            "lineHeight": "var(--type-heading-h4-line-height)",
            "fontWeight": "500"
          }
        ],
        "heading-h5": [
          "var(--type-heading-h5-size)",
          {
            "lineHeight": "var(--type-heading-h5-line-height)",
            "fontWeight": "500"
          }
        ],
        "body-lead": [
          "var(--type-body-lead-size)",
          {
            "lineHeight": "var(--type-body-lead-line-height)",
            "fontWeight": "400"
          }
        ],
        "body-l": [
          "var(--type-body-l-size)",
          {
            "lineHeight": "var(--type-body-l-line-height)",
            "fontWeight": "400"
          }
        ],
        "body-m": [
          "var(--type-body-m-size)",
          {
            "lineHeight": "var(--type-body-m-line-height)",
            "fontWeight": "400"
          }
        ],
        "body-s": [
          "var(--type-body-s-size)",
          {
            "lineHeight": "var(--type-body-s-line-height)",
            "fontWeight": "400"
          }
        ],
        "label-l": [
          "var(--type-label-l-size)",
          {
            "lineHeight": "var(--type-label-l-line-height)",
            "fontWeight": "500"
          }
        ],
        "label-m": [
          "var(--type-label-m-size)",
          {
            "lineHeight": "var(--type-label-m-line-height)",
            "fontWeight": "500"
          }
        ],
        "label-s": [
          "var(--type-label-s-size)",
          {
            "lineHeight": "var(--type-label-s-line-height)",
            "fontWeight": "500"
          }
        ],
        "caption": [
          "var(--type-caption-size)",
          {
            "lineHeight": "var(--type-caption-line-height)",
            "fontWeight": "400"
          }
        ],
        "label-xl": [
          "var(--type-label-xl-size)",
          {
            "lineHeight": "var(--type-label-xl-line-height)",
            "fontWeight": "500"
          }
        ]
      },
      "fontFamily": {
        "sans": [
          "var(--font-family-base)",
          "sans-serif"
        ],
        "display": [
          "var(--font-family-display)",
          "sans-serif"
        ]
      },
      "maxWidth": {
        "page": "var(--layout-max-width)"
      }
    }
  }
};
