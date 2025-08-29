import { env } from "./env";

import { BasePlugin } from "./plugins/basePlugin";
import * as Terminus from "./terminus";

async function main() {
  const device = await Terminus.getDevice(1);
  if (!device) throw new Error("No device found");

  const model = await Terminus.getModel(device.model_id);

  const isRotated = (model.rotation + 90) % 180 === 0;
  const width = isRotated ? model.height : model.width;
  const height = isRotated ? model.width : model.height;

  const pluginName = env("PLUGIN_NAME");
  const Plugin = require("./plugins/" + pluginName).default;

  if (!(Plugin instanceof Function)) {
    throw new Error(
      "Make sure to export a default class from your plugin file!",
    );
  }

  const instance = new Plugin(width, height);

  if (!(instance instanceof BasePlugin)) {
    throw new Error("Plugin must extend BasePlugin");
  }

  const b64 = instance.renderTob64();

  // Removing the old screen
  const screens = await Terminus.getScreens();

  for (const screen of screens) {
    if (screen.name.startsWith(pluginName)) {
      await Terminus.removeScreen(screen.id);
    }
  }

  // Adding the new screen
  const id = await Terminus.addScreen(b64, pluginName + Date.now().toString(36));

  // Adding the screen to the playlist
  await Terminus.addScreenToPlaylist(device.playlist_id, id);
}

main();
setInterval(
  () => {
    main();
  },
  +env("REFRESH_RATE_MINS") * 60 * 1000,
);
