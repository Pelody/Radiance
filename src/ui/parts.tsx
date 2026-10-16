// 共用小元件：圖示、數值小方塊 (UI-04b)、卡片 (UI-04 滑鼠移上放大、指示物數字)。
import { createContext, useContext, useRef, type CSSProperties, type ReactNode } from 'react';
import type React from 'react';
import { cardImagePath, getCard } from '../engine/data';

// 官方圖示 (data/icons，currentColor)。內嵌成 data URI：直接用 file:// 打開時，CSS mask 不能讀外部檔案。
const ICON_SVG = import.meta.glob('../../data/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ICON_URL: Record<string, string> = Object.fromEntries(
  Object.entries(ICON_SVG).map(([path, svg]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`]),
);

export function Icon({ name, size = 16, title, style }: { name: string; size?: number; title?: string; style?: CSSProperties }) {
  return (
    <span
      className="icon"
      title={title ?? name}
      aria-label={title ?? name}
      style={{ width: size, height: size, ['--src' as string]: ICON_URL[name] ?? 'none', ...style }}
    />
  );
}

/** 「圖示 + 數字」小方塊 (UI-04b)。delta：比選擇前變高綠色、變低紅色 (UI-08) */
export function Stat({
  icon,
  value,
  of,
  title,
  delta,
  big,
  accent,
  children,
  style,
}: {
  icon?: string;
  value?: ReactNode;
  of?: ReactNode;
  title: string;
  delta?: number;
  big?: boolean;
  accent?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const cls = delta === undefined || delta === 0 ? '' : delta > 0 ? 'up' : 'down';
  return (
    <div className={`stat${big ? ' big' : ''}${accent ? ' accent' : ''}`} title={title} style={style}>
      {icon && <Icon name={icon} size={big ? 20 : 16} title={title} />}
      {value !== undefined && (
        <b className={cls}>
          {value}
          {of !== undefined && <span className="of">/{of}</span>}
        </b>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- 卡片放大 (UI-04)

export interface ZoomTarget {
  id: string;
  rect: DOMRect;
}
export const ZoomContext = createContext<(z: ZoomTarget | null) => void>(() => {});

/** 長按多久開始放大 (毫秒，觸控用) */
export const LONG_PRESS_MS = 400;
/** 滑鼠停留多久開始放大 (毫秒) */
export const HOVER_MS = 300;

export const CARD_W = 101;

/**
 * UI-04 放大：滑鼠移上去停留一下就放大，移開就關 (Paul 要求，1.6.3；原本是長按)。
 * 觸控螢幕沒有滑鼠，仍然用長按；長按後放開不算點擊。卡片與技能墊共用。
 */
export function useLongPressZoom(id: string) {
  const setZoom = useContext(ZoomContext);
  const timer = useRef<number | null>(null);
  const zoomed = useRef(false);
  const touchZoomed = useRef(false);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const stop = () => {
    clear();
    if (zoomed.current) setZoom(null);
    zoomed.current = false;
  };
  const start = (e: React.PointerEvent<HTMLElement>, ms: number) => {
    clear();
    const rect = e.currentTarget.getBoundingClientRect();
    timer.current = window.setTimeout(() => {
      zoomed.current = true;
      setZoom({ id, rect });
    }, ms);
  };
  return {
    handlers: {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse') start(e, HOVER_MS);
      },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse') return;
        touchZoomed.current = false;
        start(e, LONG_PRESS_MS);
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse') return;
        touchZoomed.current = zoomed.current;
        stop();
      },
      onPointerLeave: stop,
      onPointerCancel: stop,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** 包住點擊：觸控剛長按放大過就不執行 */
    click: (f?: () => void) => () => {
      if (touchZoomed.current) {
        touchZoomed.current = false;
        return;
      }
      f?.();
    },
  };
}

export const CARD_H = 141;

export function Card({
  id,
  w = CARD_W,
  h,
  onClick,
  selected,
  highlight,
  dim,
  badges,
  title,
  className,
  style,
}: {
  id: string;
  w?: number;
  h?: number;
  onClick?: () => void;
  selected?: boolean;
  highlight?: boolean;
  dim?: boolean;
  badges?: ReactNode;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const lp = useLongPressZoom(id);
  const c = getCard(id);
  const rotated = c.rotated;
  const width = rotated ? (h ?? Math.round((w * CARD_H) / CARD_W)) : w;
  const height = rotated ? w : (h ?? Math.round((w * CARD_H) / CARD_W));
  return (
    <div
      className={`card${selected ? ' selected' : ''}${highlight ? ' highlight' : ''}${dim ? ' dim' : ''}${onClick ? ' clickable' : ''}${className ? ` ${className}` : ''}`}
      style={{ width, height, ...style }}
      {...lp.handlers}
      onClick={lp.click(onClick)}
      title={title}
    >
      <img src={cardImagePath(id)} alt={c.name ?? id} draggable={false} />
      {badges}
    </div>
  );
}

/** 卡片上的指示物數字 */
export function Badge({ icon, value, pos, title }: { icon: string; value: ReactNode; pos: 'tl' | 'tr' | 'bl' | 'br' | 'top'; title: string }) {
  return (
    <span className={`badge ${pos}`} title={title}>
      <Icon name={icon} size={12} title={title} />
      {value}
    </span>
  );
}

/** 空卡槽：名稱寫在格子正中間 (UI-05a) */
export function Slot({ label, w = CARD_W, h = CARD_H, style, children }: { label: string; w?: number; h?: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className="slot" style={{ width: w, height: h, ...style }}>
      {children ?? label}
    </div>
  );
}

export function Panel({ title, children, className, style, right }: { title?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; right?: ReactNode }) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`} style={style}>
      {(title || right) && (
        <div className="panel-head">
          {title && <span className="panel-title">{title}</span>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
