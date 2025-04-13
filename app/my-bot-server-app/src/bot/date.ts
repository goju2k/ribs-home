export function getCurrentHours() {
  const h = new Date().getUTCHours() + 9;
  return h >= 24 ? h - 24 : h;
}