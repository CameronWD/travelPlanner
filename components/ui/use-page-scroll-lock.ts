"use client";

import * as React from "react";

type SavedStyle = { property: string; value: string; priority: string }[];

const BODY_PROPERTIES = ["position", "top", "width"];
const ROOT_PROPERTIES = ["overscroll-behavior"];

let holders = 0;
let saved: { scrollY: number; pathname: string; body: SavedStyle; root: SavedStyle } | null = null;

function save(style: CSSStyleDeclaration, properties: string[]): SavedStyle {
  return properties.map((property) => ({ property, value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) }));
}

function restore(style: CSSStyleDeclaration, entries: SavedStyle) {
  for (const { property, value, priority } of entries) {
    if (value) style.setProperty(property, value, priority);
    else style.removeProperty(property);
  }
}

function lock() {
  holders += 1;
  if (holders > 1) return;
  const body = document.body.style;
  const root = document.documentElement.style;
  const scrollY = window.scrollY;
  saved = { scrollY, pathname: location.pathname, body: save(body, BODY_PROPERTIES), root: save(root, ROOT_PROPERTIES) };
  // !important: Radix's modal overlay (react-remove-scroll-bar) injects
  // `body[data-scroll-locked] { position: relative !important }`, which beats
  // a plain inline value; only an inline !important beats that.
  body.setProperty("position", "fixed", "important");
  body.setProperty("top", `${-scrollY}px`, "important");
  body.setProperty("width", "100%", "important");
  root.setProperty("overscroll-behavior", "none");
}

function unlock() {
  holders -= 1;
  if (holders > 0 || !saved) return;
  const { scrollY, pathname } = saved;
  restore(document.body.style, saved.body);
  restore(document.documentElement.style, saved.root);
  saved = null;
  if (location.pathname === pathname) {
    window.scrollTo(0, scrollY);
    return;
  }
  // The sheet closed into a new page (it navigates as it slides out), and the
  // router's scroll to the top or to the #anchor ran while the body was fixed
  // and could not scroll. Top is where the unfixed page already is; the
  // anchor has to be redone.
  if (!location.hash) return;
  let id: string;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return; // Not valid percent-encoding: this runs in an unmount, where throwing would reach an error boundary.
  }
  document.getElementById(id)?.scrollIntoView();
}

/*
 * Radix's modal dialog already stops touch and wheel scrolling outside the
 * sheet, but iOS Safari still pans the document while the keyboard is open.
 * A fixed body has no scroll range left to pan. A counter, not a boolean, so
 * a sheet opened from a sheet keeps the page locked until the last one closes.
 */
export function usePageScrollLock(active: boolean): void {
  React.useLayoutEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
