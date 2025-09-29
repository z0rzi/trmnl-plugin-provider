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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class PluginLoop {
  plugins: BasePlugin[] = [];
  device: Device | null = null;

  private running = false;

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

    const screenPrefix = plugin.pluginName + "_" + this.device.friendly_id;

    for (const screen of screens) {
      if (screen.name.startsWith(screenPrefix)) {
        await Terminus.removeScreen(screen.id);
      }
    }

    const screenName = screenPrefix + "_" + Date.now().toString(36);

    // Adding the new screen
    const id = await Terminus.addScreen(
      b64,
      screenName,
      screenName,
      screenName + ".png",
      this.device.model_id,
    );

    // Adding the screen to the playlist
    await Terminus.addScreenToPlaylist(this.device.playlist_id, id);

    plugin.log("Screen refreshed", "info");
  }

  async start() {
    await this.devicesIdentified;

    // Initialize all plugins
    for (const plugin of this.plugins) {
      await plugin.onStart();
      plugin.log("Plugin started", "info");
    }

    // Start the device-synchronized refresh loop
    this.startDeviceSynchronizedLoop();
  }

  private async refreshAllPlugins() {
    console.log("Refreshing all active plugins...");

    for (const plugin of this.plugins) {
      try {
        await this.refreshScreenForPlugin(plugin);
      } catch (error) {
        console.error(`Failed to refresh plugin ${plugin.pluginName}:`, error);
      }
    }
  }

  /**
   * Waits for the device to be connected to the server, and to refresh.
   * Guarantees that the device will refresh in at least 20 seconds, and at most 60 seconds after the promise resolves.
   *
   * @returns Promise<number> The time when the device will refresh next
   */
  private async waitForDeviceRefresh(): Promise<number> {
    const device = await Terminus.getDevice(1);
    const initialRefreshRate = device.refresh_rate * 1000;
    const lastDeviceUpdateTime = Date.parse(device.updated_at);

    async function onSigInt() {
      // Restore the initial refresh rate
      await Terminus.updateDevice(1, {
        refresh_rate: initialRefreshRate / 1000,
      });
      process.exit();
    }

    process.on("SIGINT", onSigInt);

    const timeBeforeNextRefresh =
      lastDeviceUpdateTime + initialRefreshRate - Date.now();
    console.log(
      `Expecting device to refresh in ${(timeBeforeNextRefresh / 1000 / 60).toFixed(2)} minutes`,
    );

    // After the next refresh, the device will refresh every 60 seconds.
    // We do this because we need 2 consecutive refreshes to be able to properly refresh the plugins in time:
    // 1st refresh: Confirmation that the device is back online
    // 2nd refresh: Refreshing the plugins
    await Terminus.updateDevice(1, { refresh_rate: 60 });

    return new Promise<number>((resolve, reject) => {
      const interval = setInterval(async () => {
        const device = await Terminus.getDevice(1);
        let _lastDeviceUpdateTime = Date.parse(device.updated_at);

        if (_lastDeviceUpdateTime === lastDeviceUpdateTime) {
          // The device did not refresh
          return;
        }

        // Ok, the device refreshed!
        let nextRefreshTime = _lastDeviceUpdateTime + 60_000;
        if (nextRefreshTime < Date.now() + 20_000) {
          // We have less than 10 seconds before the next refresh, we wait for it to happen
          await sleep(25_000);
          const device = await Terminus.getDevice(1);
          _lastDeviceUpdateTime = Date.parse(device.updated_at);
          nextRefreshTime = _lastDeviceUpdateTime + 60_000;
        }
        // Now, we should have at least 10 seconds before the next refresh

        // Restauring the initial refresh rate
        await Terminus.updateDevice(1, { refresh_rate: initialRefreshRate / 1000 });

        process.off("SIGINT", onSigInt);

        clearInterval(interval);
        resolve(nextRefreshTime);
      }, 60_000);
    });
  }

  private async startDeviceSynchronizedLoop() {
    if (this.running) {
      throw new Error("Device synchronized loop is already running");
    }

    this.running = true;

    const oneMinute = 60 * 1000; // 1 minute in milliseconds

    console.log("Waiting for device to refresh...");
    const nextRefreshTime = await this.waitForDeviceRefresh();
    console.log("Device refreshed, we can start the loop!");
    await this.refreshAllPlugins();
    await sleep(nextRefreshTime - Date.now() + oneMinute);

    while (true) {
      // Get fresh device information
      const device = await Terminus.getDevice(1);
      const refreshRate = device.refresh_rate * 1000; // Convert to milliseconds
      const deviceUpdatedAt = Date.parse(device.updated_at);
      const deviceShouldUpdateAt = deviceUpdatedAt + refreshRate;

      const timeToWait = deviceShouldUpdateAt - Date.now() - oneMinute;

      console.log(`Waiting ${(timeToWait / 1000 / 60).toFixed(2)} minutes...`);
      await sleep(timeToWait);

      // Device should update in 60 seconds. We refresh all plugins
      this.refreshAllPlugins();

      await sleep(oneMinute);

      // Device should have refreshed, we check if it actually did
      let _device = await Terminus.getDevice(1);
      const _deviceUpdatedAt = Date.parse(_device.updated_at);

      if (_deviceUpdatedAt === deviceUpdatedAt) {
        // The device did not refresh... This is probably because it's disconnected from the server.
        console.log(
          "Device disconnected from the server, waiting for it to reconnect...",
        );
        const nextRefreshTime = await this.waitForDeviceRefresh();
        console.log("Device back online, we can start the loop!");
        await this.refreshAllPlugins();
        await sleep(nextRefreshTime - Date.now() + oneMinute);
      }
    }
  }
}
