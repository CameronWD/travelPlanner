import React from 'react';

import { Avatar } from './Avatar.jsx';
export function AvatarStack({ people, size = 30, max = 4, style }) {
  const shown = people.slice(0, max);
  return (
    <span style={{ display: 'inline-flex', ...style }}>
      {shown.map((p, i) => <Avatar key={p.initials} {...p} size={size} style={{ marginLeft: i ? -size * 0.27 : 0 }} />)}
      {people.length > max && <Avatar initials={`+${people.length - max}`} tone="ink" size={size} style={{ marginLeft: -size * 0.27 }} />}
    </span>
  );
}
