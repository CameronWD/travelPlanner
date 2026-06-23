"use client";

import { motion } from "motion/react";
import { DURATION, EASE_EMPHASIZED } from "@/lib/motion";

/**
 * Enter-only screen transition: the incoming content fades in and rises a few
 * pixels. Used by a route `template.tsx`, which re-mounts on every navigation.
 * Reduced motion (handled by MotionProvider) drops the rise → plain cross-fade.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_EMPHASIZED }}
    >
      {children}
    </motion.div>
  );
}
