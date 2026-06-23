"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE_EMPHASIZED, STAGGER_STEP } from "@/lib/motion";

type ListTag = "div" | "ul" | "ol";
type ItemTag = "div" | "li" | "section";

/**
 * Container for an animated list. Renders a plain element (div/ul/ol) wrapping
 * an AnimatePresence so its AnimatedItem children animate on add/remove.
 *
 * `staggerOnMount` lets the items present on first render animate in (used on
 * the two "landing" lists); otherwise the initial render is static and only
 * later add/remove/reorder animate.
 */
export function AnimatedList({
  children,
  className,
  as = "div",
  staggerOnMount = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: ListTag;
  staggerOnMount?: boolean;
}) {
  const Tag = as;
  return (
    <Tag className={className}>
      <AnimatePresence initial={staggerOnMount}>{children}</AnimatePresence>
    </Tag>
  );
}

/**
 * A single animated list row. `layout` makes neighbours slide when the list
 * reorders. `index` adds a small enter delay for mount stagger (leave 0 for
 * non-staggered lists). Reduced motion is handled by MotionProvider.
 */
export function AnimatedItem({
  children,
  className,
  as = "div",
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  as?: ItemTag;
  index?: number;
}) {
  const Comp = as === "li" ? motion.li : as === "section" ? motion.section : motion.div;
  return (
    <Comp
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: DURATION.exit } }}
      transition={{ duration: DURATION.base, ease: EASE_EMPHASIZED, delay: index * STAGGER_STEP }}
      className={className}
    >
      {children}
    </Comp>
  );
}
