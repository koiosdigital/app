# MatrixDevicePreview Component

A Vue component that displays images in an RGB LED matrix dot pattern, simulating the appearance of physical LED matrix displays.

## Features

- **Realistic LED rendering**: Each pixel is rendered as an individual LED with glow effects
- **Configurable dimensions**: Support for common matrix sizes (32x64, 64x64, etc.)
- **Optional frame**: Toggle the physical device frame around the matrix
- **Dynamic sizing**: Adjustable dot size and spacing
- **Image scaling**: Automatically scales images to match LED resolution

## Usage

```vue
<template>
  <MatrixDevicePreview
    src="https://example.com/image.png"
    :width="64"
    :height="32"
    :show-frame="true"
  />
</template>

<script setup lang="ts">
import MatrixDevicePreview from '@/components/MatrixDevicePreview.vue'
</script>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | *required* | Image source URL to display on the matrix |
| `width` | `number` | `64` | Width in LED pixels (number of horizontal LEDs) |
| `height` | `number` | `32` | Height in LED pixels (number of vertical LEDs) |
| `dotSize` | `number` | `3` | Size of each LED dot in display pixels |
| `dotGap` | `number` | `1` | Gap between LED dots in display pixels |
| `showFrame` | `boolean` | `true` | Whether to show the physical frame around the matrix |

## Common Resolutions

- **32x64**: `width={32} height={64}` - Horizontal display
- **64x32**: `width={64} height={32}` - Wide display
- **64x64**: `width={64} height={64}` - Square display

## Rendering Details

The component uses pure CSS for the dot matrix effect:
1. Displays the image with `image-rendering: pixelated` for sharp pixels
2. Scales the image using CSS transforms
3. Applies a CSS mask with repeating linear gradients to create the dot pattern:
   - Horizontal gradient creates vertical gaps
   - Vertical gradient creates horizontal gaps
   - Mask composite creates the grid effect
4. No JavaScript animation or canvas - just CSS and the `<img>` tag

## Frame Styling

When `showFrame={true}`:
- Thick rounded gray rectangle (zinc-800)
- 12px padding
- Rounded outer corners
- Sharp inner corners for authentic look

## Performance

- Pure CSS solution - no canvas or JavaScript animations
- Hardware-accelerated CSS transforms
- Efficient mask rendering
- Minimal DOM - single `<img>` element

## Example in MatrixDeviceCard

```vue
<MatrixDevicePreview
  :src="device.preview"
  :width="matrixWidth"
  :height="matrixHeight"
  :show-frame="true"
/>
```

Where `matrixWidth` and `matrixHeight` are computed from the device's resolution string (e.g., "64x32").
