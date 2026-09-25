"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useController,
  UseControllerProps,
  FieldValues,
} from "react-hook-form";
import { BiTrash } from "react-icons/bi";
import { FormFileInput } from "./FormFileInput";
import Image from "next/image";

type ExistingMedia = {
  id: string;
  publicId: string;
  url: string;
  type: "IMAGE" | "VIDEO";
  order: number;
};

type Props<T extends FieldValues> = UseControllerProps<T> & {
  existing?: ExistingMedia[] | undefined;
  onOrderChange?: (items: (File | ExistingMedia)[]) => void;
};

const BIN_ID = "bin";

function OverlayPreview({ url }: { url: string }) {
  return (
    <Image
      src={url}
      alt="overlay preview"
      fill
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw"
      className="w-full h-full rounded-xl"
    />
  );
}

function DropBin() {
  const { setNodeRef, isOver } = useDroppable({ id: BIN_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center w-12 h-12 rounded-xl border-2 border-dashed transition-all duration-200 opacity-100 scale-100"
      ${
        isOver
          ? "border-accent text-accent"
          : "border-foreground-tertiary text-foreground-tertiary"
      }`}
    >
      <BiTrash className="text-2xl" />
    </div>
  );
}

type Slot = { id: string; file: File | ExistingMedia | null };

const isImage = (file: File | ExistingMedia | null) => {
  if (!file) {
    return false;
  }
  if (file instanceof File) {
    return file.type.startsWith("image/");
  }
  return file.type === "IMAGE";
};

// visibility rule:
// always show slot 0;
// show slot 1 iff slot 0 is a photo;
// show slot 2 iff slots 0 and 1 are both photos.

function computeVisibleSlots(all: Slot[]): Slot[] {
  const result = [all[0]];
  if (isImage(all[0].file)) {
    result.push(all[1]);
    if (isImage(all[1].file)) result.push(all[2]);
  }
  return result;
}

type SlotProps = {
  slot: Slot;
  isFirst: boolean;
  widthClass: string;
  inputId: string;
  errorMessage?: string;
  onChange: (file: File | null) => void;
};

function SlotInner({
  slot,
  isFirst,
  inputId,
  errorMessage,
  onChange,
}: Omit<SlotProps, "widthClass">) {
  return (
    <div className="relative">
      <FormFileInput
        id={inputId}
        label={isFirst ? "Drag and drop or click to upload" : undefined}
        variant={isFirst ? "primary" : "secondary"}
        accept={isFirst ? "image/*,video/*" : "image/*"}
        onChange={onChange}
        error={errorMessage}
        file={slot.file instanceof File ? slot.file : null}
        externalUrl={
          slot.file && !(slot.file instanceof File) ? slot.file.url : null
        }
        externalType={
          slot.file && !(slot.file instanceof File)
            ? slot.file.type === "IMAGE"
              ? "image"
              : "video"
            : null
        }
      />
    </div>
  );
}

function SortableSlot(props: SlotProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.slot.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    cursor: "move",
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`w-full ${props.widthClass}`}
    >
      <SlotInner {...props} />
    </div>
  );
}

function StaticSlot(props: SlotProps) {
  return (
    <div className={`w-full ${props.widthClass}`}>
      <SlotInner {...props} />
    </div>
  );
}

export function MediaInput<T extends FieldValues>(props: Props<T>) {
  const { field, fieldState } = useController(props as UseControllerProps<T>);
  const { existing, onOrderChange } = props;

  const initialSlots: Slot[] = [
    { id: "s0", file: null },
    { id: "s1", file: null },
    { id: "s2", file: null },
  ];
  if (existing && existing.length > 0) {
    for (let i = 0; i < Math.min(3, existing.length); i++) {
      initialSlots[i].file = existing[i];
    }
  }

  const [slots, setSlots] = useState<Slot[]>(initialSlots);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [isOverBin, setIsOverBin] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const commitSlots = (next: Slot[]) => {
    setSlots(next);
    const visibleItems = computeVisibleSlots(next)
      .map((s) => s.file)
      .filter((f): f is File | ExistingMedia => f !== null);
    field.onChange(visibleItems.filter((f): f is File => f instanceof File));
    onOrderChange?.(visibleItems);
  };

  const handleFileChange = (id: string) => (file: File | null) => {
    const next = slots.map((s) => (s.id === id ? { ...s, file } : s));
    commitSlots(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    const slot = slots.find((s) => s.id === id);
    if (slot?.file)
      setActiveUrl(
        slot.file instanceof File
          ? URL.createObjectURL(slot.file)
          : slot.file.url
      );
  };

  const handleDragOver = (event: DragOverEvent) => {
    setIsOverBin(String(event.over?.id) === BIN_ID);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setIsOverBin(false);
    setActiveUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    const { active, over } = event;
    if (!over) return;

    if (String(over.id) === BIN_ID) {
      const idx = slots.findIndex((s) => s.id === active.id);
      if (idx < 0) return;
      const files = slots.map((s) => s.file);
      files.splice(idx, 1);
      files.push(null);
      commitSlots(slots.map((s, i) => ({ ...s, file: files[i] })));
      return;
    }

    if (active.id === over.id) return;
    const oldIdx = slots.findIndex((s) => s.id === active.id);
    const newIdx = slots.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    commitSlots(arrayMove(slots, oldIdx, newIdx));
  };

  const visibleSlots = computeVisibleSlots(slots);
  const imageSlots = visibleSlots.filter((s) => isImage(s.file));
  const nonImageSlots = visibleSlots.filter((s) => !isImage(s.file));
  const sortableIds = imageSlots.map((s) => s.id);
  const photoCount = imageSlots.length;
  const firstFileIsPhoto = isImage(visibleSlots[0].file);

  const buildSlotProps = (slot: Slot): SlotProps => {
    const idx = visibleSlots.findIndex((s) => s.id === slot.id);
    const isFirst = idx === 0;
    const widthClass =
      isFirst && !firstFileIsPhoto ? "md:w-full" : "md:w-[32%]";
    return {
      slot,
      isFirst,
      widthClass,
      inputId: `${field.name}-${idx}`,
      errorMessage: isFirst ? fieldState.error?.message : undefined,
      onChange: handleFileChange(slot.id),
    };
  };

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 flex-col md:flex-row">
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            {imageSlots.map((slot) => (
              <SortableSlot key={slot.id} {...buildSlotProps(slot)} />
            ))}
          </SortableContext>
          {nonImageSlots.map((slot) => (
            <StaticSlot key={slot.id} {...buildSlotProps(slot)} />
          ))}
        </div>
        {firstFileIsPhoto && (
          <p className="text-sm text-foreground-secondary">
            {photoCount}/3 uploaded
          </p>
        )}
        {activeId !== null && (
          <div className="flex justify-center -mt-3 -mb-11">
            <DropBin />
          </div>
        )}
        <DragOverlay dropAnimation={null}>
          {activeUrl ? (
            <div
              style={{
                opacity: isOverBin ? 0 : 1,
                transform: isOverBin ? "scale(0.1) rotate(-20deg)" : undefined,
                transformOrigin: "center",
                transition:
                  "opacity 150ms ease-in, transform 150ms cubic-bezier(0.5, 0, 0.75, 0)",
              }}
              className="relative block w-full aspect-square overflow-hidden rounded-xl ring-4 ring-background-accent"
            >
              <OverlayPreview url={activeUrl} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
