'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';

export interface BookingWidgetProps {
  bookingUrl: string;
  arrivalParam: string;
  departureParam: string;
  guestsParam: string;
  childrenParam?: string;
  showChildren?: boolean;
  promoParam?: string;
  extraParams?: Array<{ key: string; value: string }>;
  maxGuests: number;
  defaultNights: number;
  buttonLabel: string;
  newTab?: boolean;
  editor?: boolean;
  compact?: boolean;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Builds `${bookingUrl}?checkin=…&checkout=…&adults=…` from the visitor's selection. */
export function buildBookingUrl(p: Pick<BookingWidgetProps, 'bookingUrl' | 'arrivalParam' | 'departureParam' | 'guestsParam' | 'childrenParam' | 'promoParam' | 'extraParams'>, v: { arrival: string; departure: string; guests: number; children?: number; promo?: string }): string {
  let url: URL;
  try {
    url = new URL(p.bookingUrl);
  } catch {
    url = new URL(p.bookingUrl, 'https://invalid.local');
  }
  url.searchParams.set(p.arrivalParam, v.arrival);
  url.searchParams.set(p.departureParam, v.departure);
  url.searchParams.set(p.guestsParam, String(v.guests));
  if (p.childrenParam && v.children !== undefined) url.searchParams.set(p.childrenParam, String(v.children));
  if (p.promoParam && v.promo) url.searchParams.set(p.promoParam, v.promo);
  for (const x of p.extraParams ?? []) if (x.key) url.searchParams.set(x.key, x.value);
  return url.origin === 'https://invalid.local' ? `${url.pathname}${url.search}` : url.toString();
}

export function BookingWidget(props: BookingWidgetProps) {
  const uid = useId().replace(/:/g, '');
  // Dates are filled after mount so cached (ISR/static) HTML never hydrates with stale defaults.
  const [today, setToday] = useState<Date | null>(null);
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  useEffect(() => {
    const now = new Date();
    setToday(now);
    setArrival(iso(addDays(now, 1)));
    setDeparture(iso(addDays(now, 1 + Math.max(1, props.defaultNights))));
  }, [props.defaultNights]);
  const minDate = today ? iso(today) : undefined;
  const [guests, setGuests] = useState(Math.min(2, props.maxGuests));
  const [kids, setKids] = useState(0);
  const [promo, setPromo] = useState('');
  const [error, setError] = useState('');

  const onArrival = (v: string) => {
    setArrival(v);
    if (v && departure <= v) setDeparture(iso(addDays(new Date(`${v}T12:00:00`), Math.max(1, props.defaultNights))));
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!arrival || !departure || departure <= arrival) {
      setError('Please choose a departure date after your arrival.');
      return;
    }
    setError('');
    if (props.editor) return;
    const href = buildBookingUrl(props, { arrival, departure, guests, children: props.showChildren ? kids : undefined, promo });
    const win = (e.currentTarget.ownerDocument.defaultView ?? window) as Window;
    if (props.newTab) win.open(href, '_blank', 'noopener');
    else win.location.assign(href);
  };

  const guestOptions = Array.from({ length: props.maxGuests }, (_, i) => i + 1);
  return (
    <form className={`a-booking__form${props.compact ? ' a-booking__form--compact' : ''}`} onSubmit={submit} noValidate>
      <div className="a-booking__field">
        <label htmlFor={`${uid}-in`}>Arrival</label>
        <input id={`${uid}-in`} type="date" value={arrival} min={minDate} onChange={(e) => onArrival(e.target.value)} required />
      </div>
      <div className="a-booking__field">
        <label htmlFor={`${uid}-out`}>Departure</label>
        <input id={`${uid}-out`} type="date" value={departure} min={arrival || minDate} onChange={(e) => setDeparture(e.target.value)} required aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined} />
      </div>
      <div className="a-booking__field">
        <label htmlFor={`${uid}-g`}>{props.showChildren ? 'Adults' : 'Guests'}</label>
        <select id={`${uid}-g`} value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
          {guestOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {props.showChildren ? (
        <div className="a-booking__field">
          <label htmlFor={`${uid}-c`}>Children</label>
          <select id={`${uid}-c`} value={kids} onChange={(e) => setKids(Number(e.target.value))}>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      ) : null}
      {props.promoParam ? (
        <div className="a-booking__field">
          <label htmlFor={`${uid}-p`}>Promo code</label>
          <input id={`${uid}-p`} type="text" value={promo} onChange={(e) => setPromo(e.target.value)} autoComplete="off" />
        </div>
      ) : null}
      <div className="a-booking__submit">
        <button type="submit" className="a-btn a-btn--primary"><span className="a-btn__label">{props.buttonLabel}</span></button>
      </div>
      {error ? <p id={`${uid}-err`} className="a-booking__error" role="alert">{error}</p> : null}
    </form>
  );
}
