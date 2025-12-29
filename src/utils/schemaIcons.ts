/**
 * Maps schema icon names (Font Awesome style from Pixlet) to Iconify icon names.
 * Schema icons use Font Awesome naming conventions (e.g., "cloud", "sun", "mapLocationDot").
 * We map these to the Font Awesome icon pack in Iconify format.
 *
 * See: https://github.com/tidbyt/pixlet/blob/main/icons/icons.go
 */

/**
 * Convert camelCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Get the Iconify icon name for a schema icon.
 * Returns the full Iconify icon identifier (e.g., "i-fa6-solid-cloud").
 *
 * @param schemaIcon - The icon name from the schema (Font Awesome style)
 * @returns The Iconify icon identifier for use with UIcon
 */
export function getSchemaIconName(schemaIcon: string | undefined): string | undefined {
  if (!schemaIcon) return undefined

  // Convert camelCase to kebab-case for Iconify
  const kebabName = toKebabCase(schemaIcon)

  // Use Font Awesome 6 solid icons (fa6-solid) with colon separator for iconify
  return `i-fa6-solid:${kebabName}`
}
