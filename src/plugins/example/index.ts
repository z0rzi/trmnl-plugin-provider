import { BasePlugin } from "../basePlugin";

export class ExamplePlugin extends BasePlugin<{
  config1: string;
  config2: number;
}> {
  async onStart(): Promise<void> {
    this.log("Example plugin started", "info");
  }

  protected async draw(): Promise<void> {
    // Drawing logic goes here,
    // you can use `this.ctx` to draw on the screen
  }
}

export default ExamplePlugin;
