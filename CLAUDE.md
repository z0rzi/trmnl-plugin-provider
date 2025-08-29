# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `trmnl-core`, a TypeScript-based plugin system for TRMNL terminal devices. It provides a framework for creating dynamic content plugins that can render graphics and push them to TRMNL displays via the Terminus server.

## Development Commands

```bash
# Install dependencies
yarn install

# Run the application
bun run src/index.ts
# or
node src/index.ts
```

## Environment Configuration

Required environment variables in `.env`:

```bash
TERMINUS_PORT=2300              # Terminus server port
TERMINUS_URL=192.168.1.137      # Terminus server IP/hostname
REFRESH_RATE_MINS=5             # Plugin refresh interval in minutes
PLUGIN_NAME=calendar            # Name of plugin to load
```

## Architecture

### Core Structure
- `src/index.ts` - Main application entry point and plugin orchestration
- `src/terminus.ts` - Terminus server API client with full CRUD operations
- `src/env.ts` - Environment variable management with validation
- `src/plugins/basePlugin.ts` - Abstract base class for all plugins
- `src/plugins/` - Plugin implementations directory

### Application Flow

1. **Device Discovery**: Fetches device and model information from Terminus server
2. **Rotation Handling**: Automatically calculates correct canvas dimensions based on device rotation
3. **Plugin Loading**: Dynamically loads plugin class based on `PLUGIN_NAME` environment variable
4. **Plugin Validation**: Ensures plugin extends `BasePlugin` and implements required methods
5. **Screen Lifecycle**: Removes old plugin screens, renders new content, uploads to server
6. **Playlist Management**: Automatically adds new screens to device playlist
7. **Periodic Refresh**: Runs plugin update cycle at configured intervals

### Plugin System

**BasePlugin Class** (`src/plugins/basePlugin.ts`):
- Provides Canvas API integration via `@napi-rs/canvas`
- Abstract `draw()` method that plugins must implement
- Built-in white background rendering
- Base64 conversion for Terminus server upload
- Screen dimension properties (`screenWidth`, `screenHeight`)
- Canvas 2D context access via `ctx` property

**Plugin Implementation Pattern**:
```typescript
import { BasePlugin } from "./basePlugin";

export default class MyPlugin extends BasePlugin {
    draw(): void {
        // Use this.ctx for Canvas 2D API calls
        // Use this.screenWidth/screenHeight for dimensions
    }
}
```

### API Integration

**Terminus Server API** (`src/terminus.ts`):
- **Screen Management**: `getScreens()`, `addScreen()`, `removeScreen()`
- **Device Management**: `getDevice()`, `getModel()`
- **Playlist Management**: `addScreenToPlaylist()`, `removeScreenFromPlaylist()`
- **Configuration**: Environment-based server connection
- **Error Handling**: Comprehensive error reporting for all API calls

### Key Features

- **Device-Aware Rendering**: Automatically adapts to device rotation and dimensions
- **Dynamic Plugin Loading**: Runtime plugin selection via environment variables
- **Automatic Screen Management**: Handles screen cleanup and playlist updates
- **Canvas-Based Graphics**: Full 2D graphics capabilities via HTML5 Canvas API
- **Environment Validation**: Strict validation of required configuration
- **Periodic Updates**: Configurable refresh intervals for dynamic content

### Development Notes

- All plugins must extend `BasePlugin` and implement the `draw()` method
- Plugin files must export a default class (not instance)
- Canvas rendering uses standard HTML5 Canvas 2D API
- Screen coordinates start at (0,0) in top-left corner
- Base64 PNG format is used for screen uploads to Terminus server
- The system automatically handles device rotation calculations
- Old plugin screens are automatically cleaned up on each refresh

### Plugin Development Guidelines

1. **Error Handling**: Plugin crashes will terminate the entire application
2. **Performance**: Keep `draw()` method efficient as it runs periodically
3. **Canvas State**: Clean up canvas state (colors, transforms) after drawing
4. **Async Operations**: Current system doesn't support async `draw()` methods
5. **Testing**: Test plugins with actual device dimensions and rotation settings