// UI-04b：官方圖示 (public/icons/*.svg，currentColor)，滑鼠移上去顯示名稱。
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <span
      className="icon"
      title={name}
      style={{ width: size, height: size, ['--src' as string]: `url(icons/${name}.svg)` }}
    />
  );
}
