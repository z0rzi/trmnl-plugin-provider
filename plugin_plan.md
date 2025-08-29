# Plugin System Enhancement Plan

## Overview

This plan outlines the transformation of the current single-plugin system into a robust multi-plugin framework that supports concurrent execution, individual refresh rates, auto-discovery, and comprehensive error handling.

## Core Principles

- **Plugin Independence**: Each plugin runs in complete isolation
- **Auto-Discovery**: Zero-configuration plugin loading
- **Fault Tolerance**: Plugin failures don't crash the system
- **Screen Management**: One screen per plugin per device
- **Individual Configuration**: Each plugin has its own config file
- **Error Transparency**: Crashes generate error screens

## Architecture Overview

### Current State
```
index.ts → Single Plugin → Terminus API
```

### Target State
```
index.ts → PluginManager → [Plugin1, Plugin2, Plugin3, ...] → Terminus API
         ↓
    PluginScheduler → Independent timers per plugin
         ↓
    ConfigManager → Individual plugin configs
         ↓
    ErrorHandler → Error screen generation
```

## Detailed Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Plugin Manager (`src/core/PluginManager.ts`)

**Responsibilities:**
- Auto-discover plugins in `src/plugins/` directory
- Instantiate and manage plugin lifecycles
- Handle plugin loading failures
- Coordinate with scheduler and error handler

**Key Methods:**
```typescript
class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map();
  private deviceInfo: DeviceInfo;
  
  async initialize(): Promise<void>
  async discoverPlugins(): Promise<PluginMetadata[]>
  async loadPlugin(pluginName: string): Promise<PluginInstance | null>
  async startAllPlugins(): Promise<void>
  async stopAllPlugins(): Promise<void>
  getRunningPlugins(): PluginInstance[]
  private handlePluginLoadFailure(pluginName: string, error: Error): Promise<void>
}
```

**Plugin Discovery Logic:**
1. Scan `src/plugins/` for directories containing:
   - `index.ts` or `{pluginName}.ts` (plugin class)
   - `config.json` (plugin configuration)
   - Optional: `package.json` (metadata)
2. Validate plugin structure and dependencies
3. Create plugin metadata registry

#### 1.2 Plugin Scheduler (`src/core/PluginScheduler.ts`)

**Responsibilities:**
- Manage independent timers for each plugin
- Execute plugin refresh cycles
- Handle plugin execution failures
- Coordinate screen updates

**Key Methods:**
```typescript
class PluginScheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private pluginManager: PluginManager;
  
  schedulePlugin(pluginName: string, intervalMs: number): void
  unschedulePlugin(pluginName: string): void
  reschedulePlugin(pluginName: string, newIntervalMs: number): void
  private executePlugin(pluginName: string): Promise<void>
  private handlePluginExecution(pluginName: string): Promise<void>
}
```

**Scheduling Strategy:**
- Each plugin runs on its own `setInterval`
- Execution is wrapped in error handling
- Failed executions generate error screens
- Successful executions update device screens

#### 1.3 Configuration Manager (`src/core/ConfigManager.ts`)

**Responsibilities:**
- Load and validate plugin configurations
- Provide type-safe config access
- Handle missing or invalid configs

**Plugin Config Structure:**
```json
// src/plugins/calendar/config.json
{
  "enabled": true,
  "refreshRateMinutes": 15,
  "config": {
    "timezone": "UTC",
    "showWeekends": true,
    "theme": "light"
  }
}
```

**Key Methods:**
```typescript
class ConfigManager {
  private configs: Map<string, PluginConfig> = new Map();
  
  async loadPluginConfig<T = any>(pluginName: string): Promise<PluginConfig<T>>
  getPluginConfig<T = any>(pluginName: string): PluginConfig<T> | null
  validateConfig(pluginName: string, config: any): boolean
  private loadDefaultConfig(pluginName: string): PluginConfig
}

interface PluginConfig<T = any> {
  enabled: boolean;
  refreshRateMinutes: number;
  config: T;
}
```

#### 1.4 Error Handler (`src/core/ErrorHandler.ts`)

**Responsibilities:**
- Generate error screens for failed plugins
- Log errors with context
- Create fallback screens

**Error Screen Generation:**
```typescript
class ErrorHandler {
  static async generateErrorScreen(
    pluginName: string, 
    error: Error, 
    width: number, 
    height: number
  ): Promise<string> // Returns base64 image
  
  static async handlePluginError(
    pluginName: string, 
    error: Error, 
    deviceInfo: DeviceInfo
  ): Promise<void>
  
  private static createErrorCanvas(
    width: number, 
    height: number, 
    message: string
  ): Canvas
}
```

**Error Screen Design:**
- Red border or background indicating error state
- Plugin name prominently displayed
- Error message (truncated if too long)
- Timestamp of error occurrence
- "Plugin Error" header text

### Phase 2: Enhanced Plugin System

#### 2.1 Enhanced BasePlugin (`src/plugins/BasePlugin.ts`)

**Breaking Changes:**
```typescript
export abstract class BasePlugin<TConfig = any> {
  protected canvas: Canvas;
  protected config: TConfig;
  protected pluginName: string;
  protected deviceInfo: DeviceInfo;
  
  constructor(
    pluginName: string,
    width: number, 
    height: number, 
    config: TConfig,
    deviceInfo: DeviceInfo
  );
  
  // New async support
  protected abstract draw(): Promise<void> | void;
  
  // New lifecycle hooks
  async onStart(): Promise<void> {}
  async onStop(): Promise<void> {}
  async onError(error: Error): Promise<void> {}
  
  // Enhanced render method
  async renderToBase64(): Promise<string>;
  
  // Utility methods
  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void;
  protected getCurrentScreenName(): string; // Returns formatted screen name
}
```

**Screen Naming Convention:**
Format: `{PLUGIN_NAME}_{DEVICE_NAME}_{TIMESTAMP}`
- `PLUGIN_NAME`: Plugin directory name
- `DEVICE_NAME`: Device friendly_id or sanitized label
- `TIMESTAMP`: Unix timestamp or ISO date

#### 2.2 Plugin Instance Management (`src/core/PluginInstance.ts`)

**Plugin Wrapper:**
```typescript
class PluginInstance {
  public readonly name: string;
  public readonly config: PluginConfig;
  public readonly plugin: BasePlugin;
  public status: 'running' | 'stopped' | 'error';
  public lastExecution: Date | null;
  public lastError: Error | null;
  
  constructor(
    name: string,
    PluginClass: typeof BasePlugin,
    config: PluginConfig,
    deviceInfo: DeviceInfo
  );
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
  async execute(): Promise<string>; // Returns base64 screen
  async handleError(error: Error): Promise<string>; // Returns error screen
  
  getScreenName(): string;
  isHealthy(): boolean;
}
```

### Phase 3: Screen Management

#### 3.1 Screen Lifecycle Manager (`src/core/ScreenManager.ts`)

**Responsibilities:**
- Track plugin screens per device
- Clean up old screens when new ones are created
- Handle screen naming conflicts

**Key Methods:**
```typescript
class ScreenManager {
  private screenRegistry: Map<string, ScreenInfo> = new Map();
  
  async updatePluginScreen(
    pluginName: string, 
    deviceInfo: DeviceInfo, 
    base64Image: string
  ): Promise<number>; // Returns screen ID
  
  async cleanupOldScreens(pluginName: string, deviceInfo: DeviceInfo): Promise<void>;
  async getPluginScreen(pluginName: string, deviceInfo: DeviceInfo): Promise<Screen | null>;
  
  private generateScreenName(
    pluginName: string, 
    deviceInfo: DeviceInfo
  ): string;
  
  private async removeOldPluginScreens(
    pluginName: string, 
    deviceInfo: DeviceInfo, 
    excludeScreenId?: number
  ): Promise<void>;
}

interface ScreenInfo {
  pluginName: string;
  deviceId: number;
  screenId: number;
  screenName: string;
  createdAt: Date;
}
```

### Phase 4: Application Restructure

#### 4.1 New Main Application (`src/index.ts`)

**Complete Rewrite:**
```typescript
import { PluginManager } from './core/PluginManager';
import { PluginScheduler } from './core/PluginScheduler';
import { ConfigManager } from './core/ConfigManager';
import { ScreenManager } from './core/ScreenManager';
import * as Terminus from './terminus';

async function main() {
  try {
    // Initialize core systems
    const configManager = new ConfigManager();
    const screenManager = new ScreenManager();
    const pluginManager = new PluginManager(configManager, screenManager);
    const scheduler = new PluginScheduler(pluginManager, screenManager);
    
    // Get device information
    const deviceInfo = await getDeviceInfo();
    await pluginManager.setDeviceInfo(deviceInfo);
    
    // Discover and load plugins
    console.log('Discovering plugins...');
    await pluginManager.initialize();
    
    const plugins = pluginManager.getRunningPlugins();
    console.log(`Loaded ${plugins.length} plugins:`, plugins.map(p => p.name));
    
    // Schedule all plugins
    for (const plugin of plugins) {
      const intervalMs = plugin.config.refreshRateMinutes * 60 * 1000;
      scheduler.schedulePlugin(plugin.name, intervalMs);
    }
    
    console.log('Plugin system started successfully!');
    
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await scheduler.stopAll();
      await pluginManager.stopAllPlugins();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start plugin system:', error);
    process.exit(1);
  }
}

async function getDeviceInfo() {
  const device = await Terminus.getDevice(1);
  if (!device) throw new Error("No device found");
  
  const model = await Terminus.getModel(device.data.model_id);
  
  return {
    device: device.data,
    model: model.data,
    width: calculateWidth(model.data),
    height: calculateHeight(model.data)
  };
}

main();
```

#### 4.2 Plugin Directory Structure

**New Structure:**
```
src/plugins/
├── calendar/
│   ├── index.ts              # CalendarPlugin class
│   ├── config.json           # Plugin configuration
│   └── README.md             # Plugin documentation
├── weather/
│   ├── index.ts              # WeatherPlugin class
│   ├── config.json           # Plugin configuration
│   └── types.ts              # Plugin-specific types
└── example/
    ├── index.ts              # Example plugin for developers
    ├── config.json           # Example configuration
    └── README.md             # Development guide
```

**Plugin Template (`src/plugins/example/index.ts`):**
```typescript
import { BasePlugin } from '../BasePlugin';

interface ExampleConfig {
  message: string;
  textColor: string;
  fontSize: number;
}

export default class ExamplePlugin extends BasePlugin<ExampleConfig> {
  async onStart(): Promise<void> {
    this.log('Example plugin started');
  }
  
  protected async draw(): Promise<void> {
    const { message, textColor, fontSize } = this.config;
    
    // Set up text rendering
    this.ctx.fillStyle = textColor;
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.textAlign = 'center';
    
    // Draw the message
    const centerX = this.screenWidth / 2;
    const centerY = this.screenHeight / 2;
    
    this.ctx.fillText(message, centerX, centerY);
    
    this.log(`Drew message: "${message}"`);
  }
  
  async onError(error: Error): Promise<void> {
    this.log(`Plugin error: ${error.message}`, 'error');
  }
}
```

### Phase 5: Migration Strategy

#### 5.1 Backward Compatibility

**Migration Steps:**
1. **Legacy Support**: Keep current single-plugin mode working during transition
2. **Environment Flag**: Use `PLUGIN_SYSTEM_V2=true` to enable new system
3. **Config Migration**: Auto-generate config.json for existing plugins
4. **Documentation**: Provide migration guide for plugin developers

#### 5.2 Testing Strategy

**Test Coverage:**
1. **Unit Tests**: Each core component (PluginManager, Scheduler, etc.)
2. **Integration Tests**: Multi-plugin scenarios, error handling
3. **Plugin Tests**: Template for plugin developers
4. **Performance Tests**: Memory usage, concurrent execution

**Test Utilities (`src/test/PluginTestUtils.ts`):**
```typescript
export class PluginTestEnvironment {
  static createMockDeviceInfo(): DeviceInfo;
  static createTestPlugin<T>(config: T): BasePlugin<T>;
  static expectErrorScreen(base64: string): void;
  static expectValidScreen(base64: string): void;
}
```

## Implementation Timeline

### Week 1: Core Infrastructure
- [ ] Implement ConfigManager
- [ ] Implement ErrorHandler
- [ ] Create enhanced BasePlugin
- [ ] Unit tests for core components

### Week 2: Plugin Management
- [ ] Implement PluginManager with discovery
- [ ] Implement PluginScheduler
- [ ] Create PluginInstance wrapper
- [ ] Integration tests

### Week 3: Screen Management & Application
- [ ] Implement ScreenManager
- [ ] Rewrite main application
- [ ] Create plugin template and examples
- [ ] End-to-end testing

### Week 4: Polish & Migration
- [ ] Backward compatibility layer
- [ ] Documentation and migration guide
- [ ] Performance optimization
- [ ] Production testing

## Risk Assessment

### High Risk
- **Breaking Changes**: Existing plugins will need updates
- **Complexity**: Multi-plugin coordination is complex
- **Resource Usage**: Multiple canvases and timers

### Medium Risk
- **Plugin Discovery**: File system scanning reliability
- **Error Recovery**: Ensuring system stability
- **Screen Conflicts**: Race conditions in screen management

### Low Risk
- **Configuration**: JSON parsing is well-established
- **Canvas Isolation**: Each plugin gets own canvas
- **Timer Management**: Node.js timers are reliable

## Success Metrics

1. **Functionality**: Multiple plugins running concurrently with individual refresh rates
2. **Reliability**: Plugin failures don't crash the system
3. **Usability**: Zero-config plugin installation (drop folder + restart)
4. **Performance**: No significant memory leaks or performance degradation
5. **Developer Experience**: Clear plugin development workflow

## Future Enhancements (Beyond Current Plan)

- **Plugin Hot Reload**: Update plugins without system restart
- **Plugin Marketplace**: Discovery and installation system
- **Advanced Scheduling**: Cron-like expressions for complex timing
- **Plugin Analytics**: Usage statistics and performance monitoring
- **Configuration UI**: Web interface for plugin management

---

This plan provides a solid foundation for transforming the current plugin system into a robust, scalable, multi-plugin framework while maintaining simplicity for plugin developers.