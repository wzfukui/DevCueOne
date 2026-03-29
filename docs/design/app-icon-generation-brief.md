# App Icon Generation Brief

## Goal

Create a distinctive app icon for `DevCue One` that feels like a desktop-native AI developer companion instead of a generic microphone app.

The icon should still read clearly at tiny sizes in Finder, Dock, Spotlight, and installer previews.

## Visual Direction

Core ideas:

- desktop workspace
- live voice interaction
- coding / agentic execution
- warm, intelligent, trustworthy

Suggested visual language:

- a single strong symbol, not a busy illustration
- geometric but slightly playful
- warm amber / copper accent with dark graphite support
- subtle signal or waveform cue integrated into the mark
- hint of a desktop window, command panel, or voice pulse

Avoid:

- photorealism
- mascots or anime characters
- literal headphones
- generic chatbot bubble icons
- thin line art that disappears below `64x64`
- heavy text or letterforms inside the icon

## Primary Prompt

Use this English prompt with your image model:

Create a premium desktop app icon for "DevCue One", an AI voice-driven developer workspace. The icon should combine a strong desktop-tool silhouette with a subtle voice pulse or waveform motif, feel warm, intelligent, and trustworthy, and look excellent in macOS Dock and Finder. Use a bold, simplified central mark, graphite and deep charcoal base tones, with amber or copper highlights, soft depth, crisp edges, and high contrast. The composition must stay readable at small sizes, with no text, no mascot, no photorealism, no generic chat bubble, and no cluttered background. Deliver a centered square icon on a clean transparent or neutral background, suitable for conversion into macOS icns, Windows ico, and marketing PNG assets.

## Negative Prompt

Use this if the model supports negative prompting:

blurry details, tiny text, letters, watermark, multiple objects, anime character, photorealistic microphone, random gradients, generic chatbot bubble, flat clipart, low contrast, thin strokes, crowded composition, busy background

## Required Deliverables

Ask the model to generate or help derive:

1. a master `1024x1024` icon with clean edges
2. a simplified high-contrast variant that still reads at `64x64`
3. a transparent-background PNG export
4. a dark-background preview mockup

## Practical Constraints

When you ask for revisions, emphasize:

- the silhouette must remain recognizable at `32x32`
- inner details should be minimal
- the voice motif should be part of the symbol, not a floating decoration
- the mark should feel like a tool for builders, not a consumer music app
- avoid relying on pure glow for readability

## Asset Handoff Format

Once the image looks right, prepare these files for implementation:

- `icon-1024.png`
- `icon-512.png`
- `icon-256.png`
- `icon-128.png`
- source image or editable master if available

From there, the app repo can convert them into:

- `build/branding/icon.icns`
- `build/branding/icon.ico`
- `build/branding/icon.png`
