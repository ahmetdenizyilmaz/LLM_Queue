const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'logo'
  | 'play'
  | 'pause'
  | 'step'
  | 'plus'
  | 'trash'
  | 'edit'
  | 'check'
  | 'x'
  | 'arrow-up'
  | 'arrow-down'
  | 'grip'
  | 'send'
  | 'presets'
  | 'settings'
  | 'chevron-down'
  | 'chevron-right'
  | 'grab'
  | 'copy'
  | 'alert';

interface PathSpec {
  d?: string;
  rect?: { x: number; y: number; width: number; height: number; rx?: number };
  circle?: { cx: number; cy: number; r: number };
  fill?: string;
  stroke?: boolean;
}

const ICONS: Record<IconName, PathSpec[]> = {
  logo: [
    { rect: { x: 3, y: 4, width: 12, height: 3, rx: 1.5 }, fill: 'currentColor' },
    { rect: { x: 3, y: 10, width: 16, height: 3, rx: 1.5 }, fill: 'currentColor' },
    { rect: { x: 3, y: 16, width: 10, height: 3, rx: 1.5 }, fill: 'currentColor' },
    { d: 'M16 14.5 L21 17.5 L16 20.5 Z', fill: 'currentColor' },
  ],
  play: [{ d: 'M6 4.5 L19 12 L6 19.5 Z', fill: 'currentColor' }],
  pause: [
    { rect: { x: 6, y: 4, width: 4, height: 16, rx: 1 }, fill: 'currentColor' },
    { rect: { x: 14, y: 4, width: 4, height: 16, rx: 1 }, fill: 'currentColor' },
  ],
  step: [
    { d: 'M5 5 L14 12 L5 19 Z', fill: 'currentColor' },
    { rect: { x: 16.5, y: 5, width: 2.5, height: 14, rx: 1 }, fill: 'currentColor' },
  ],
  plus: [{ d: 'M12 5v14M5 12h14', stroke: true }],
  trash: [
    { d: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6', stroke: true },
  ],
  edit: [
    { d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z', stroke: true },
  ],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7', stroke: true }],
  x: [{ d: 'M6 6l12 12M18 6L6 18', stroke: true }],
  'arrow-up': [{ d: 'M12 19V5M5 12l7-7 7 7', stroke: true }],
  'arrow-down': [{ d: 'M12 5v14M5 12l7 7 7-7', stroke: true }],
  grip: [
    { circle: { cx: 9, cy: 6, r: 1.4 }, fill: 'currentColor' },
    { circle: { cx: 15, cy: 6, r: 1.4 }, fill: 'currentColor' },
    { circle: { cx: 9, cy: 12, r: 1.4 }, fill: 'currentColor' },
    { circle: { cx: 15, cy: 12, r: 1.4 }, fill: 'currentColor' },
    { circle: { cx: 9, cy: 18, r: 1.4 }, fill: 'currentColor' },
    { circle: { cx: 15, cy: 18, r: 1.4 }, fill: 'currentColor' },
  ],
  send: [{ d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7Z', stroke: true }],
  presets: [
    { d: 'M4 6h16M4 12h10M4 18h14M18 14v6M15 17h6', stroke: true },
  ],
  settings: [
    { circle: { cx: 12, cy: 12, r: 3 }, stroke: true },
    {
      d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.66 0-1.25.4-1.51 1Z',
      stroke: true,
    },
  ],
  'chevron-down': [{ d: 'M6 9l6 6 6-6', stroke: true }],
  'chevron-right': [{ d: 'M9 6l6 6-6 6', stroke: true }],
  grab: [
    { d: 'M12 3v12M7 10l5 5 5-5M5 20h14', stroke: true },
  ],
  copy: [
    { rect: { x: 9, y: 9, width: 11, height: 11, rx: 2 }, stroke: true },
    { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1', stroke: true },
  ],
  alert: [
    { circle: { cx: 12, cy: 12, r: 9.5 }, stroke: true },
    { d: 'M12 8v5M12 16.5h.01', stroke: true },
  ],
};

/**
 * Create an inline SVG element cleanly without raw HTML string parsing.
 */
export function createSvgIcon(name: IconName, size = 15): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.flexShrink = '0';

  for (const spec of ICONS[name]) {
    if (spec.d) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', spec.d);
      if (spec.stroke) {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
      } else {
        path.setAttribute('fill', spec.fill ?? 'currentColor');
      }
      svg.appendChild(path);
    } else if (spec.rect) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(spec.rect.x));
      rect.setAttribute('y', String(spec.rect.y));
      rect.setAttribute('width', String(spec.rect.width));
      rect.setAttribute('height', String(spec.rect.height));
      if (spec.rect.rx !== undefined) {
        rect.setAttribute('rx', String(spec.rect.rx));
      }
      if (spec.stroke) {
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', 'currentColor');
        rect.setAttribute('stroke-width', '2');
      } else {
        rect.setAttribute('fill', spec.fill ?? 'currentColor');
      }
      svg.appendChild(rect);
    } else if (spec.circle) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(spec.circle.cx));
      circle.setAttribute('cy', String(spec.circle.cy));
      circle.setAttribute('r', String(spec.circle.r));
      if (spec.stroke) {
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', 'currentColor');
        circle.setAttribute('stroke-width', '2');
      } else {
        circle.setAttribute('fill', spec.fill ?? 'currentColor');
      }
      svg.appendChild(circle);
    }
  }

  return svg;
}
