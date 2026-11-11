export function sourceTimezone(metadata = {}) {
  try {
    const zone = metadata.timezone || "UTC";
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return zone;
  } catch {
    return "UTC";
  }
}
export function sourceDate(value, timezone) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function sourceEnergy(readings, devices) {
  const kinds = new Map(devices.map((d) => [d.id, d.kind]));
  const generation = readings.filter(
    (r) => kinds.get(r.device_id) === "generation",
  );
  const consumption = readings.filter(
    (r) => kinds.get(r.device_id) === "consumption",
  );
  const sum = (values) =>
    values.length
      ? values.reduce((total, r) => total + Number(r.energy_kwh), 0)
      : null;
  return { generation, generated: sum(generation), consumed: sum(consumption) };
}
export function sourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
