"use client";

import * as React from "react";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SM_HIT } from "@/components/ui/touch-target";
import { cn } from "@/lib/cn";
import { compressImage } from "@/lib/image-compress";
import { cropSquare } from "@/lib/crop-square";
import { travellerName, type TravellerLike } from "@/lib/traveller";
import {
  removeProfilePhoto,
  setDisplayName,
  setProfilePhoto,
} from "@/server/actions/profile";

export interface ProfileCardProps {
  user: TravellerLike;
}

/**
 * The Account card (CONTEXT.md "Profile photo and display name"): a circular
 * preview of the Traveller's Profile photo plus controls to change or remove
 * it, and a Display name field.
 *
 * Kept deliberately simple: no crop UI beyond the automatic square
 * centre-crop (`cropSquare`) that runs before every upload.
 */
export function ProfileCard({ user: initialUser }: ProfileCardProps) {
  const [user, setUser] = React.useState(initialUser);
  const [name, setName] = React.useState(travellerName(initialUser));
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const hasPhoto = Boolean(user.photoKey);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await setDisplayName(name);
      if (!result.success) {
        setError(
          result.errors.displayName?.[0] ??
            result.errors._?.[0] ??
            "Couldn't save that — please try again.",
        );
        return;
      }
      const trimmed = name.trim();
      setUser((u) => ({ ...u, displayName: trimmed.length === 0 ? null : trimmed }));
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const compressed = await compressImage(file);
      const cropped = await cropSquare(compressed);
      const formData = new FormData();
      formData.set("file", cropped);
      const result = await setProfilePhoto(formData);
      if (!result.success) {
        setError(
          result.errors.file?.[0] ?? "Couldn't upload that photo — please try again.",
        );
        return;
      }
      // The server holds the real key + timestamp; a placeholder here is
      // enough to flip `hasPhoto` and the fallback until the layout
      // revalidation this action triggered brings the real values down.
      setUser((u) => ({ ...u, photoKey: "pending", photoUpdatedAt: new Date() }));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await removeProfilePhoto();
      if (!result.success) {
        setError("Couldn't remove that photo — please try again.");
        return;
      }
      setUser((u) => ({ ...u, photoKey: null, photoUpdatedAt: null }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5">
        <TravellerAvatar traveller={user} size={40} className="size-16" />
        <div className="flex flex-col items-start gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={SM_HIT}
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            Change photo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Profile photo"
            onChange={handleFileChange}
          />
          {hasPhoto && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={SM_HIT}
              loading={uploading}
              onClick={handleRemovePhoto}
            >
              Remove photo
            </Button>
          )}
        </div>
      </div>

      <Field label="Display name">
        <Input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {message && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-foreground">
          {message}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        size="sm"
        className={cn(SM_HIT, "self-start")}
        loading={saving}
        onClick={handleSave}
      >
        Save
      </Button>
    </div>
  );
}
