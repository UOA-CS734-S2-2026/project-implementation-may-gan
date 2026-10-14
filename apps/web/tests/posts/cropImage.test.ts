import { afterEach, expect, it, vi } from "vitest";
import { cropImage } from "@/lib/cropImage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses the actual encoded MIME type when canvas falls back to PNG", async () => {
  vi.stubGlobal("Image", class {
    addEventListener(event: string, callback: () => void) {
      if (event === "load") queueMicrotask(callback);
    }
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["png"], { type: "image/png" }));
  });
  const cropped = await cropImage("blob:source", { x: 0, y: 0, width: 100, height: 100 }, "photo.heic", "image/heic");
  expect(cropped.type).toBe("image/png");
});
