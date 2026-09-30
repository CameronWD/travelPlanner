"use client";

import * as React from "react";
import { motion, useIsPresent, type HTMLMotionProps } from "motion/react";

/*
 * `motion` elements for AnimatePresence children that go inert while they
 * exit: a leaving fold body, day panel or idea chip still holds the old
 * handlers, so a click during its exit would act on stale state.
 * useIsPresent reads the presence of the AnimatePresence child it sits in,
 * which is why these are components and not a hook the parent calls.
 */

export const PresenceDiv = React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function PresenceDiv(props, ref) {
  const present = useIsPresent();
  return <motion.div ref={ref} inert={!present || undefined} {...props} />;
});

export const PresenceSpan = React.forwardRef<HTMLSpanElement, HTMLMotionProps<"span">>(function PresenceSpan(props, ref) {
  const present = useIsPresent();
  return <motion.span ref={ref} inert={!present || undefined} {...props} />;
});
