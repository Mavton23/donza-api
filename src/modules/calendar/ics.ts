/** Gerador mínimo de iCalendar (RFC 5545): tudo em UTC, linhas dobradas aos 75 octetos, CRLF. */
export interface IcsEvent {
  uid: string;
  start: Date;
  end?: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** Sobe quando o item muda, para os clientes actualizarem a cópia que já têm. */
  sequence?: number;
  /** Avisos prévios em minutos. */
  alarms?: number[];
  allDay?: boolean;
}

export const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const pad = (n: number) => String(n).padStart(2, '0');
export const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Dobra uma linha a 75 octetos sem partir caracteres UTF-8; as continuações começam com um espaço. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    const limit = out.length === 0 ? 75 : 74; // a continuação gasta 1 octeto no espaço inicial
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join('\r\n');
}

export function buildIcs(events: IcsEvent[], opts: { name: string; now?: Date }): string {
  const stamp = utc(opts.now ?? new Date());
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Donza//Calendario//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(opts.name)}`];
  for (const e of events) {
    const end = e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + 3_600_000);
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${utc(e.start)}`, `DTEND:${utc(end)}`, `SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`SEQUENCE:${e.sequence ?? 0}`);
    for (const m of e.alarms ?? []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.summary)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
