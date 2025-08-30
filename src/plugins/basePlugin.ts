import { Canvas, createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { Device } from "../terminus";
import path from 'path';

GlobalFonts.registerFromPath(
    path.join(__dirname, '../../fonts/arial.ttf'),
    'Arial'
);
GlobalFonts.registerFromPath(
    path.join(__dirname, '../../fonts/VT323-Regular.ttf'),
    'VT232'
);
GlobalFonts.registerFromPath(
    path.join(__dirname, '../../fonts/Courier Regular.ttf'),
    'Courier'
);
GlobalFonts.registerFromPath(
    path.join(__dirname, '../../fonts/Roboto.ttf'),
    'Roboto'
);


export abstract class BasePlugin<TConfig = any> {
  public readonly canvas: Canvas;

  constructor(
    public readonly pluginName: string,
    public readonly width: number,
    public readonly height: number,
    public readonly config: TConfig,
    public readonly deviceInfo: Device,
    public readonly refreshRateMinutes: number,
  ) {
    if (new.target === BasePlugin) {
      throw new Error(
        "BasePlugin is abstract and cannot be instantiated directly",
      );
    }

    this.canvas = createCanvas(width, height);
  }

  /**
   * Get the canvas 2D rendering context
   */
  get ctx(): ReturnType<Canvas["getContext"]> {
    return this.canvas.getContext("2d");
  }

  /**
   * Get the screen width
   */
  get screenWidth(): number {
    return this.canvas.width;
  }

  /**
   * Get the screen height
   */
  get screenHeight(): number {
    return this.canvas.height;
  }

  /**
   * Abstract method that plugins must implement to draw their content
   * Can be synchronous or asynchronous
   */
  protected abstract draw(): void | Promise<void>;

  /**
   * Lifecycle hook called when the plugin starts
   * Override this method to perform initialization tasks
   */
  async onStart(): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Lifecycle hook called when the plugin encounters an error
   * Override this method to handle plugin-specific error logic
   */
  async drawError(error: Error): Promise<void> {
    // Default implementation
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

    this.ctx.font = "bold 16px Arial";
    this.ctx.fillStyle = "#ff6961";
    this.ctx.textAlign = "center";

    // Splitting the error message into lines
    const lines = error.message.split("\n");
    lines.unshift(error.name);
    lines.unshift("Error drawing plugin content");

    // Calculating the number of lines to display
    const numLines = Math.min(lines.length, 5);

    // Drawing the error message
    for (let i = 0; i < numLines; i++) {
      this.ctx.fillText(
        lines[i],
        this.screenWidth / 2,
        this.screenHeight / 2 + i * 16,
      );
    }
  }

  /**
   * Render the plugin content to a base64 encoded PNG image
   * @returns Promise resolving to base64 encoded image data (without data URL prefix)
   */
  async renderToBase64(): Promise<string> {
    try {
      // Fill with white background
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

      // Call the plugin's draw method
      await this.draw();

      // Convert to base64 without the data URL prefix
      return this.canvas.toDataURL().replace(/^data:image\/png;base64,/, "");
    } catch (error) {
      // Call error lifecycle hook
      await this.drawError(error as Error);

      return this.canvas.toDataURL().replace(/^data:image\/png;base64,/, "");
    }
  }

  /**
   * Log a message with the plugin name prefix
   * @param message - Message to log
   * @param level - Log level (info, warn, error)
   */
  public log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const prefix = `[${this.pluginName}]`;

    switch (level) {
      case "warn":
        console.warn(prefix, message);
        break;
      case "error":
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
        break;
    }
  }

  /**
   * Generate the current screen name using the naming convention
   * Format: {PLUGIN_NAME}_{DEVICE_NAME}_{TIMESTAMP}
   * @returns Formatted screen name
   */
  generateScreenName(): string {
    const timestamp = Date.now();
    return `${this.pluginName}_${this.deviceInfo.friendly_id}_${timestamp}`;
  }

  /**
   * Get plugin metadata for debugging and monitoring
   * @returns Plugin metadata object
   */
  getPluginInfo(): {
    name: string;
    screenSize: { width: number; height: number };
    deviceInfo: Device;
    configKeys: string[];
  } {
    return {
      name: this.pluginName,
      screenSize: {
        width: this.screenWidth,
        height: this.screenHeight,
      },
      deviceInfo: this.deviceInfo,
      configKeys: this.config ? Object.keys(this.config) : [],
    };
  }
}
