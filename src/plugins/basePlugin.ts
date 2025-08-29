import { Canvas, createCanvas } from "@napi-rs/canvas";

export class BasePlugin {
  canvas: Canvas;
  get ctx(): ReturnType<Canvas["getContext"]> {
    return this.canvas.getContext("2d");
  }
  get screenWidth(): number {
    return this.canvas.width;
  }
  get screenHeight(): number {
    return this.canvas.height;
  }

  constructor(width: number, height: number) {
    this.canvas = createCanvas(width, height);
  }

  protected draw(): void {
    throw new Error("draw() must be implemented");
  }

  renderTob64() {
    // White background
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

    this.draw();

    return this.canvas.toDataURL().replace(/^data:image\/png;base64,/, "");
  }
}
