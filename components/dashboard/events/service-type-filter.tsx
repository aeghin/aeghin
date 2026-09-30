"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { m } from "motion/react";
import { toast } from "sonner";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { setServiceTypeOrder } from "@/lib/actions/service-type";
import {
  getServiceColors as getColorClasses,
  orderServiceTypes,
} from "@/lib/config/service-types-config";

interface ServiceType {
  id: string;
  name: string;
  color: string;
}

interface ServiceTypeFilterProps {
  serviceTypes: ServiceType[];
  /** The caller's saved order, as ids. */
  serviceTypeOrder: string[];
  organizationId: string;
  selected: string | null;
  onSelect: (serviceTypeId: string | null) => void;
}

const pillClass = (active: boolean) =>
  `flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
    active
      ? "border border-transparent bg-foreground text-background"
      : "border border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
  }`;

/**
 * The service-type pills over the events list. Each person drags theirs into
 * their own order — a mouse after a few pixels of travel, a finger after a
 * hold, so a swipe still scrolls the row. "All" stays first.
 */
export function ServiceTypeFilter({
  serviceTypes,
  serviceTypeOrder,
  organizationId,
  selected,
  onSelect,
}: ServiceTypeFilterProps) {
  const [order, setOrder] = useState(serviceTypeOrder);
  const [savedKey, setSavedKey] = useState(serviceTypeOrder.join(","));
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  // A save from another tab or device arrives as a new prop on refresh.
  const serverKey = serviceTypeOrder.join(",");
  if (serverKey !== savedKey) {
    setSavedKey(serverKey);
    setOrder(serviceTypeOrder);
  }

  // The click that ends a mouse drag lands on the pill that moved; it is not
  // a request to filter by it.
  const justDragged = useRef(false);

  const ordered = useMemo(
    () => orderServiceTypes(serviceTypes, order),
    [serviceTypes, order],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);

    if (!over || active.id === over.id) return;

    const ids = ordered.map((service) => service.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    const previous = order;

    setOrder(next);

    startTransition(async () => {
      // A request that never lands throws, and a throw inside a transition
      // goes to the error boundary rather than here.
      const result = await setServiceTypeOrder(organizationId, next).catch(() => null);

      if (!result?.success) {
        setOrder(previous);
        toast.error("Couldn't save your order", {
          description: result?.error ?? "Check your connection and try again.",
        });
      }
    });
  };

  return (
    <m.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      // Snapping turns dnd-kit's small auto-scroll steps into whole-pill
      // jumps, so it is off while a pill is held.
      className={`flex gap-2 overflow-x-auto pb-2 scrollbar-hide ${
        dragging ? "snap-none" : "snap-x snap-mandatory sm:snap-none"
      }`}
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <m.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onSelect(null)}
        className={pillClass(!selected)}
      >
        All
      </m.button>

      <DndContext
        id="service-type-filter"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ordered.map((service) => service.id)} strategy={horizontalListSortingStrategy}>
          {ordered.map((service) => (
            <SortablePill
              key={service.id}
              service={service}
              active={selected === service.id}
              onPress={() => {
                if (justDragged.current) return;
                onSelect(service.id === selected ? null : service.id);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
    </m.div>
  );
}

function SortablePill({
  service,
  active,
  onPress,
}: {
  service: ServiceType;
  active: boolean;
  onPress: () => void;
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: service.id });

  const colors = getColorClasses(service.color);

  return (
    <div
      ref={setNodeRef}
      className={`shrink-0 ${isDragging ? "relative z-10 opacity-80" : ""}`}
      style={{
        // Held to the row: a pill dragged off it has nowhere to land.
        transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
        transition,
      }}
    >
      <m.button
        ref={setActivatorNodeRef}
        {...listeners}
        whileTap={{ scale: 0.97 }}
        onClick={onPress}
        className={`${pillClass(active)} touch-manipulation select-none ${isDragging ? "cursor-grabbing shadow-md" : ""}`}
      >
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        {service.name}
      </m.button>
    </div>
  );
}
