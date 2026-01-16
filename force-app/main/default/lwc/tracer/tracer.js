/* tracer.js – utilità di log *************************************************/
const DEBUG = true; // ➜ metti a false in prod

const CLONE = (obj) => {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  } // i Proxy dei wire non si serializzano
};

/* ------------ Imperative Apex (await) ------------ */
export async function traceApex(apexMethod, params = {}) {
  if (!DEBUG) return apexMethod(params);

  const label = `Apex:${apexMethod.name}`;
  console.groupCollapsed(`%c${label}`, "color:#10b981;font-weight:bold");
  console.log("↳ params ", params);
  const t0 = performance.now();

  try {
    const res = await apexMethod(params);
    console.log("↳ response", CLONE(res));
    console.log(`⏱ ${(performance.now() - t0).toFixed(1)} ms`);
    console.groupEnd();
    return res;
  } catch (err) {
    console.error("↳ error   ", err);
    console.groupEnd();
    throw err;
  }
}

export function resolveSoql(tpl, values = {}) {
  let q = tpl;
  Object.entries(values).forEach(([k, v]) => {
    const safe =
      v === undefined || v === null || v === ""
        ? "NULL"
        : `'${String(v).replace(/'/g, "\\'")}'`;
    q = q.replace(new RegExp(`:${k}\\b`, "g"), safe);
  });
  return q;
}

/* ---------------- Wire adapter ------------------- */
export function wireTracer(name, params, value) {
  if (!DEBUG) return;
  const { data, error } = value;
  console.groupCollapsed(`%cWire:${name}`, "color:#f59e0b;font-weight:bold");
  console.log("↳ params ", params);
  if (data) console.log("↳ data    ", CLONE(data));
  if (error) console.error("↳ error   ", error);
  console.groupEnd();
}