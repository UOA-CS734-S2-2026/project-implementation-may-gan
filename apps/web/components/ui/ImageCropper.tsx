"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { cropImage } from "@/lib/cropImage";

type ImageCropperProps = {
  file: File;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
};

export function ImageCropper({ file, onConfirm, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || !imageUrl) return;
    setConfirming(true);
    try {
      const cropped = await cropImage(
        imageUrl,
        croppedAreaPixels,
        file.name,
        file.type
      );
      onConfirm(cropped);
    } catch (err) {
      console.error("Failed to crop image:", err);
    }
    setConfirming(false);
  };

  if (!mounted || !imageUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-9999 bg-black/90"
      style={{ position: "fixed", inset: 0 }}
    >
      <div
        className="absolute"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 80 }}
      >
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div
        className="absolute flex items-center justify-end gap-3 bg-black px-4"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 80,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || !croppedAreaPixels}
          className="rounded-md px-4 py-2 text-sm font-medium bg-background-accent text-foreground-accent transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {confirming ? "Saving..." : "Crop & save"}
        </button>
      </div>
    </div>,
    document.body
  );
}
