import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { Stepper } from '../../components/forms/Stepper.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { Row, Col, Label, Muted } from './kit.jsx';
const Two = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>{children}</div>;
export function EditStopForm() {
  const [n, setN] = React.useState(1); const [booked, setBooked] = React.useState('Just an idea');
  return <Col gap={14}>
    <Input label="Place" value="Hakone" id="st-name" />
    <Two><Input label="Arrive" value="Fri 17 Oct" /><Input label="Leave" value="Sat 18 Oct" /></Two>
    <Row justify="space-between"><Label>Nights</Label><Stepper value={n} min={1} onChange={setN} /></Row>
    <Select label="Chapter" value="Kanto" options={['Kanto', 'Kansai', '+ New chapter']} />
    <Input label="Where you're sleeping" placeholder="Hotel, ryokan, a mate's couch…" id="st-stay" hint="⚠ No bed yet · it's the only gap in the trip" />
    <Segmented options={['Booked', 'Just an idea']} value={booked} onChange={setBooked} tone="lilac" />
    <Button variant="ghost" style={{ alignSelf: 'flex-start', color: 'var(--accent-primary-text)' }}>Remove Hakone from the trip</Button>
  </Col>;
}
export function BookingForm() {
  const [kind, setKind] = React.useState('Train'); const [paid, setPaid] = React.useState(true);
  return <Col gap={14}>
    <Segmented options={['Stay', 'Train', 'Flight', 'Activity']} value={kind} onChange={setKind} tone="sun" />
    <Input label="What" value="Shinkansen Hikari · Odawara → Kyoto" />
    <Two><Input label="When" value="Sat 18 · 11:12" /><Input label="Ref" placeholder="e.g. 4F7K2Q" /></Two>
    <Input label="Cost" value="¥13,080" hint="Goes in the shared pot · ≈ A$131" />
    <Toggle checked={paid} onChange={setPaid} label="Already paid" />
    {paid && <Input label="You paid" value="¥13,080" hint="Same as the cost" />}
    <Button variant="dashed" block>+ Attach ticket (PDF or photo)</Button>
    <Muted style={{ whiteSpace: 'normal', marginTop: -6 }}>Attachments are saved on this device so they open with no signal.</Muted>
  </Col>;
}
