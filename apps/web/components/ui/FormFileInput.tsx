"use client";

import { useEffect, useState } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { BiImageAdd } from "react-icons/bi";
import Image from "next/image";
import { ImageCropper } from "./ImageCropper";

const input = tv({
  slots: {
    wrapper: "space-y-2",
    label:
      "flex p-10 md:p-5 lg:p-10 space-y-2 w-full aspect-square max-h-64 cursor-pointer flex-col items-center justify-center text-sm rounded-xl border-2 border-dashed border-foreground-tertiary text-foreground-tertiary hover:border-foreground-tertiary/60 group",
    photoPreview:
      "relative block w-full aspect-square overflow-hidden rounded-xl",
    videoPreview:
      "relative block w-full aspect-square overflow-hidden rounded-xl",
    previewMedia: "w-full h-full object-cover",
    inputWrap: "relative hidden",
    base: "w-full bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 rounded-md",
    errorMsg: "text-sm text-danger",
  },
  variants: {
    variant: {
      primary: {
        base: "border",
      },
      secondary: {},
    },
    invalid: {
      true: {
        base: "border-red-500 focus:ring-red-500/30",
      },
      false: {
        base: "border-foreground/20 focus:ring-foreground/30",
      },
    },
  },
  defaultVariants: {
    variant: "primary",
    invalid: false,
  },
});

type FormInputVariant = VariantProps<typeof input>["variant"];

type FormFileInputProps = {
  id: string;
  label?: string;
  variant?: FormInputVariant;
  accept?: string;
  onChange: (file: File | null) => void;
  error?: string;
  file?: File | null;
  externalUrl?: string | null;
  externalType?: "image" | "video" | null;
};

export function FormFileInput({
  id,
  label,
  variant = "primary",
  accept,
  onChange,
  error,
  file,
  externalUrl = null,
  externalType = null,
}: FormFileInputProps) {
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewUrl = objectUrl ?? externalUrl;

  const {
    wrapper,
    label: labelClass,
    photoPreview: photoPreviewClass,
    videoPreview: videoPreviewClass,
    previewMedia: previewMediaClass,
    inputWrap,
    errorMsg,
  } = input({ variant, invalid: !!error });

  return (
    <div className={wrapper()}>
      {pendingCrop && (
        <ImageCropper
          file={pendingCrop}
          onConfirm={(cropped) => {
            setPendingCrop(null);
            onChange(cropped);
          }}
          onCancel={() => setPendingCrop(null)}
        />
      )}
      {previewUrl ? (
        <div
          className={
            file?.type.startsWith("video/") || externalType === "video"
              ? videoPreviewClass()
              : photoPreviewClass()
          }
        >
          {file?.type.startsWith("video/") || externalType === "video" ? (
            <video
              src={previewUrl}
              className={previewMediaClass()}
              muted
              autoPlay
              loop
              playsInline
            />
          ) : (
            <Image
              src={previewUrl}
              alt="preview"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw"
              priority={variant === "primary" && !objectUrl && !!externalUrl}
              className={previewMediaClass()}
            />
          )}
        </div>
      ) : (
        <label htmlFor={id} className={labelClass()}>
          <BiImageAdd
            className={
              variant === "secondary"
                ? "text-5xl md:text-4xl lg:text-5xl pl-1 text-foreground-tertiary group-hover:text-foreground-tertiary/60"
                : "text-[70px] text-foreground-tertiary group-hover:text-foreground-tertiary/60 mb-2"
            }
          />
          {label}
        </label>
      )}
      <div className={inputWrap()}>
        <input
          id={id}
          type="file"
          accept={accept}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (next && next.type.startsWith("image/")) {
              setPendingCrop(next);
            } else {
              onChange(next);
            }
          }}
        />
      </div>
      {error && <p className={`${errorMsg()} pt-2`}>{error}</p>}
    </div>
  );
}
