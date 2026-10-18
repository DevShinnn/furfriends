const PAW = '<circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="5.5" r="2.2"/><circle cx="14.5" cy="5.5" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M12 11c-3 0-6 4.2-6 6.6C6 19.5 7.4 20 9 20c1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.5 3-2.4C18 15.2 15 11 12 11z"/>';

// name -> [inner svg markup, default size, filled?, stroke width]
const ICONS = {
  paw: [PAW, 20, true],
  star: ['<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>', 16, true],
  cat: ['<path d="M4 4l3 5M20 4l-3 5"/><path d="M4 4v7a8 8 0 0 0 16 0V4l-4 4.5a9 9 0 0 0-8 0z"/><circle cx="9" cy="12.5" r=".8" fill="currentColor"/><circle cx="15" cy="12.5" r=".8" fill="currentColor"/><path d="M11 15.5h2l-1 1z"/>', 26, false, 1.8],
  dog: ['<path d="M7 5c-2 0-4 1-4 4v3c0 1 1 1.5 2 1l1.5-1"/><path d="M17 5c2 0 4 1 4 4v3c0 1-1 1.5-2 1l-1.5-1"/><path d="M7 5h10c.5 3 .5 7-1 11a4 4 0 0 1-8 0C6.5 12 6.5 8 7 5z"/><circle cx="10" cy="10.5" r=".8" fill="currentColor"/><circle cx="14" cy="10.5" r=".8" fill="currentColor"/><path d="M11 14h2l-1 1.2z"/>', 26, false, 1.8],
  home: ['<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', 20],
  file: ['<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', 20],
  camera: ['<path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>', 20],
  upload: ['<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>', 20],
  download: ['<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', 18],
  user: ['<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', 20],
  logout: ['<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', 18],
  plus: ['<path d="M12 5v14M5 12h14"/>', 18, false, 2.4],
  edit: ['<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>', 16],
  trash: ['<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>', 16],
  close: ['<path d="M18 6 6 18M6 6l12 12"/>', 20],
  arrowL: ['<path d="M19 12H5M12 19l-7-7 7-7"/>', 16],
  arrowR: ['<path d="M5 12h14M12 5l7 7-7 7"/>', 16],
  chevL: ['<path d="m15 18-6-6 6-6"/>', 24],
  chevR: ['<path d="m9 18 6-6-6-6"/>', 24],
  syringe: ['<path d="m18 2 4 4M17 7l3-3M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6"/>', 20],
  shield: ['<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>', 20],
  search: ['<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16],
  check: ['<path d="M20 6 9 17l-5-5"/>', 16, false, 2.6],
  clip: ['<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>', 20],
  lock: ['<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 20],
  users: ['<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5-5-5.4"/>', 20],
  menu: ['<path d="M4 7h16M4 12h16M4 17h16"/>', 22],
  cal: ['<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>', 16],
  zoom: ['<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>', 18],
  phone: ['<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>', 18],
  bowl: ['<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>', 20],
  scissors: ['<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>', 20],
  pill: ['<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"/><path d="m8.5 8.5 7 7"/>', 20],
  clock: ['<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 16],
  gantt: ['<path d="M3 3v18h18"/><rect x="7" y="6" width="8" height="3" rx="1.5"/><rect x="10" y="11" width="9" height="3" rx="1.5"/><rect x="7" y="16" width="5" height="3" rx="1.5"/>', 20],
  heart: ['<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>', 20],
  list: ['<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', 20],
  stetho: ['<path d="M4 3h2M14 3h2M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v1.5a5 5 0 0 0 10 0V14"/><circle cx="20" cy="12" r="2"/>', 20],
  alert: ['<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', 20],
  firstaid: ['<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M12 10v7M8.5 13.5h7"/>', 20],
  book: ['<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>', 20],
  info: ['<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>', 18],
  idcard: ['<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.5"/><path d="M14 10h5M14 14h3"/>', 18],
  thermo: ['<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>', 20],
  sun: ['<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 18],
  drop: ['<path d="M12 2.7S6 9.3 6 14a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z"/>', 20],
  flask: ['<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10"/>', 20],
  zap: ['<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', 20],
  eye: ['<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 20],
  flame: ['<path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6.5-4-8-.3 2-1.3 3.5-3 4.5C12 8 10.5 4.5 8 2c0 3.5-3 6.5-3 11 0 5 3 9 7 9z"/>', 20],
  wind: ['<path d="M3 8h10a3 3 0 1 0-3-3M3 16h13a3 3 0 1 1-3 3M3 12h17"/>', 20],
  bug: ['<rect x="8" y="7" width="8" height="13" rx="4"/><path d="M9 7.5a3 3 0 0 1 6 0M12 11v9M8 13H3M21 13h-5M8 17l-4 2M16 17l4 2M8 9.5 4.5 7.5M16 9.5l3.5-2"/>', 20],
  chat: ['<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>', 20, false, 2.2],
  thumbUp: ['<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7"/>', 16],
  thumbDown: ['<path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1zM17 14l-4 8a3 3 0 0 1-3-3v-4H4.5a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.9 3H17"/>', 16],
  bell: ['<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', 20],
  send: ['<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>', 18],
  car: ['<path d="M3 17v-5l2.5-5h13L21 12v5zM3 12h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>', 20],
};

export default function Icon({ name, size, className, style }) {
  const [markup, def, filled, sw = 2] = ICONS[name];
  const s = size ?? def;
  return (
    <svg
      width={s} height={s} viewBox="0 0 24 24" className={className} style={style} aria-hidden="true"
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export const Stars = ({ n = 5, size = 16 }) => (
  <span className="stars">{Array.from({ length: n }, (_, i) => <Icon key={i} name="star" size={size} />)}</span>
);
