import fs from "fs";
import path from "path";
import { BasePlugin } from "./plugins/basePlugin";
import { Device } from "./terminus";
import * as Terminus from "./terminus";

/**
 * Helper function to throw a custom error with a JSON parse error message
 */
function parseJson<T = unknown>(json: string, errorMessage: string): T {
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error(errorMessage);
  }
}

export default class PluginLoop {
  plugins: BasePlugin[] = [];
  device: Device | null = null;

  private markDeviceAsIdentified: (() => void) | undefined;
  private devicesIdentified = new Promise<void>((resolve) => {
    this.markDeviceAsIdentified = resolve;
  });

  constructor() {
    this.identifyDevice()
      .then(() => {
        return this.discoverPlugins();
      })
      .then(() => {
        if (this.markDeviceAsIdentified) this.markDeviceAsIdentified();
      });
  }

  private async identifyDevice() {
    const device = await Terminus.getDevice(1);
    if (!device) throw new Error("No device found");
    this.device = device;

    // Fixing width / height
    const model = await Terminus.getModel(device.model_id);
    const isRotated = (model.rotation + 90) % 180 === 0;
    this.device.width = isRotated ? model.height : model.width;
    this.device.height = isRotated ? model.width : model.height;
  }

  private discoverPlugins() {
    if (!this.device) throw new Error("Device not identified");

    const pluginDirs = fs.readdirSync(path.join(__dirname, "plugins"));

    for (const pluginName of pluginDirs) {
      if (pluginName === "example") continue;
      const stats = fs.statSync(path.join(__dirname, "plugins", pluginName));
      if (!stats.isDirectory()) {
        continue;
      }

      const pluginDirPath = path.join(__dirname, "plugins", pluginName);
      const pluginConfigPath = path.join(pluginDirPath, "config.json");
      const pluginIdexPath = path.join(pluginDirPath, "index.ts");

      if (!fs.existsSync(pluginConfigPath)) {
        throw new Error(`Plugin ${pluginName} is missing config.json file`);
      }

      if (!fs.existsSync(pluginIdexPath)) {
        throw new Error(`Plugin ${pluginName} is missing index.ts file`);
      }

      const pluginConfig = parseJson<{
        enabled: boolean;
        refreshRateMinutes: number;
        config: unknown;
      }>(
        fs.readFileSync(pluginConfigPath, "utf8"),
        `Plugin ${pluginName} config.json is not valid JSON`,
      );

      if (!("enabled" in pluginConfig)) {
        throw new Error(
          `Plugin ${pluginName} config.json is missing the 'enabled' property`,
        );
      }

      if (pluginConfig.enabled === false) {
        console.log(`Plugin ${pluginName} is disabled in config.json`);
        continue;
      }

      if (!("refreshRateMinutes" in pluginConfig)) {
        throw new Error(
          `Plugin ${pluginName} config.json is missing the 'refreshRateMinutes' property`,
        );
      }

      if (isNaN(pluginConfig.refreshRateMinutes)) {
        `Plugin ${pluginName} refreshRateMinutes is not a number`;
      }

      if (pluginConfig.refreshRateMinutes < 1) {
        `Plugin ${pluginName} refreshRateMinutes should be more than 1 minute`;
      }

      if (!("config" in pluginConfig)) {
        throw new Error(
          `Plugin ${pluginName} config.json is missing the 'config' property`,
        );
      }

      const Plugin = require(pluginIdexPath).default;

      if (!(Plugin instanceof Function)) {
        throw new Error(
          `Plugin ${pluginName} index.ts doesn't export a default class`,
        );
      }

      this.plugins.push(
        new Plugin(
          pluginName,
          this.device.width,
          this.device.height,
          pluginConfig.config,
          this.device,
          +pluginConfig.refreshRateMinutes
        ),
      );
    }
  }

  private async refreshScreenForPlugin(plugin: BasePlugin) {
    if (!this.device) throw new Error("Device not identified");
    plugin.log("Refreshing screen", "info");

    const b64 = await plugin.renderToBase64();

    // Removing the old screen
    const screens = await Terminus.getScreens();

    const screenPrefix = plugin.pluginName + '_' + this.device.friendly_id;

    for (const screen of screens) {
      if (screen.name.startsWith(screenPrefix)) {
        await Terminus.removeScreen(screen.id);
      }
    }

    const screenName = screenPrefix + '_' + Date.now().toString(36)

    // Adding the new screen
    const id = await Terminus.addScreen(
      b64,
      screenName,
      screenName,
      screenName + '.png',
      this.device.model_id,
    );

    // Adding the screen to the playlist
    await Terminus.addScreenToPlaylist(this.device.playlist_id, id);

    plugin.log("Screen refreshed", "info");
  }

  async start() {
    await this.devicesIdentified;

    for (const plugin of this.plugins) {
      await plugin.onStart();
      plugin.log("Plugin started", "info");

      const refreshRateMinutes = plugin.refreshRateMinutes;

      this.refreshScreenForPlugin(plugin);
      setInterval(
        async () => {
          this.refreshScreenForPlugin(plugin);
        },
        refreshRateMinutes * 60 * 1000,
      );
    }
  }
}
